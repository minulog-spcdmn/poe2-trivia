import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, looksLikeOwner, nameProblem, nameSkeleton } from '../src/lib/names.ts';
import { CREATOR } from '../src/lib/site.ts';
import {
  checkOwnerKey,
  hasOwnerKey,
  hostClaim,
  importOwnerKey,
  joinClaim,
  listClaim,
  saveOwnerKey,
  signAsOwner,
  takeOwnerKeyFromUrl,
  useKeyStore,
  verifyOwner,
} from '../src/lib/owner.ts';
import { parseClientMsg, parseHostMsg } from '../src/lib/protocol.ts';

test("names that pass for the creator's are caught, however they're spelled", () => {
  const lookalikes = [
    'zoe_arcana', 'Zoe', 'ZOE', 'zoë', 'Zoé', 'z0e', 'Z0Ë', 'zo3', '2oe', 'z o e', 'z.o.e', 'Zooee', 'Zoe!', 'zoe1',
    'zoe arcana', 'Zoë Arcana', 'ZOE_4RCANA', 'zoe_arcanna', 'Zoe_Arcana2', 'z0e.arcana', 'ｚｏｅ', '𝓩𝓸𝓮', 'ᴢᴏᴇ',
    'Ζoe', 'zοe', 'zое', 'zøe', 'z\u200boe', 'z\u0308oe',
    // Digits and symbols read as letters and left out, mixed.
    'Z0e1', 'z0e!', 'Z0E 2', '1z0e', 'z0e_4rcana!',
    // Armenian, Lisu, Cherokee, Coptic look-alikes, and ones no table here knows (a stand-in).
    'Zօe', 'ꓜoe', 'Ꮓoe', 'zⲟe', 'ꓜꓳꓰ', 'Zoǝ', 'Zoԑ', 'ʒoe', 'Zөe', 'ⱬoe', 'Zoɘ', 'Zoэ', 'zoe_αrcana', 'ZOE_ARCANA', CREATOR,
  ];
  for (const raw of lookalikes) {
    const name = cleanName(raw);
    assert.ok(looksLikeOwner(name), raw);
    assert.match(nameProblem(name, []) ?? '', /creator/, raw);
    // The creator, once proven, may use any of them.
    assert.equal(nameProblem(name, [], true), null, raw);
  }
  // Only the name itself: other names that happen to contain it are fine.
  for (const name of ['Ozoemena', 'Zoey', 'xX_Zoe_Xx', 'Zoe the Bold', 'Zoe 太郎', 'Zoe Ж', 'Zoe Иванова', '太郎花', 'Иван', 'zoe_arcana_fan', 'Zoi', 'Zana', 'Zeo', 'Arcana', 'Rose', 'Joe', 'Chloe', 'Doryani']) {
    assert.equal(looksLikeOwner(name), false, name);
    assert.equal(nameProblem(name, []), null, name);
  }
  // The extra look-alikes only count for the creator's name: other names keep their skeletons.
  assert.equal(nameSkeleton('Lu2'), 'lu');
  assert.notEqual(nameSkeleton('Exile2'), nameSkeleton('Exilez'));
  assert.equal(nameSkeleton('Bjørn'), 'bjm');
  // Being the creator doesn't lift the other rules.
  assert.match(nameProblem('Host', [], true) ?? '', /reserved/);
  assert.match(nameProblem('Zoe', ['ZOE'], true) ?? '', /looks too much like/);
});

test('only a signature from the key in owner.ts proves anything', async () => {
  const { subtle } = globalThis.crypto;
  const other = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const { d } = await subtle.exportKey('jwk', other.privateKey);
  // Someone else's key isn't saved as the creator's.
  assert.equal(await importOwnerKey(d!), null);
  assert.equal(await importOwnerKey('not a key'), null);
  // A signature by any other key, or junk, doesn't verify.
  const claim = joinClaim('ABCDEF', 'token-token-token-token', 'nonce-nonce-nonce');
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, other.privateKey, new TextEncoder().encode(claim)));
  const forged = Buffer.from(sig).toString('base64url');
  assert.equal(forged.length, 86);
  for (const proof of [forged, 'A'.repeat(86), '', undefined, 42, forged + 'x'])
    assert.equal(await verifyOwner(claim, proof), false, String(proof));
});

test('claims name the room and the asker, and never stand in for one another', () => {
  const claims = [
    joinClaim('ABCDEF', 'tok', 'n1'),
    joinClaim('ABCDEG', 'tok', 'n1'),
    joinClaim('ABCDEF', 'tok2', 'n1'),
    // A new connection gets a new nonce from the host: a recorded proof doesn't carry over.
    joinClaim('ABCDEF', 'tok', 'n2'),
    hostClaim('ABCDEF', 'tok'),
    listClaim('ABCDEF', 'tok'),
  ];
  assert.equal(new Set(claims).size, claims.length);
});

test('hello and welcome carry a proof only in its exact shape', () => {
  const secret = 'abcdefghijklmnopqrstuvwxyz012345';
  const owner = 'A'.repeat(86);
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Zoe', v: 7, tab: 'Ab3_x-9Zq1', owner }), {
    t: 'hello',
    secret,
    name: 'Zoe',
    v: 7,
    tab: 'Ab3_x-9Zq1',
    owner,
  });
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Zoe', v: 7, owner }), { t: 'hello', secret, name: 'Zoe', v: 7, owner });
  for (const bad of ['A'.repeat(85), 'A'.repeat(87), 'A'.repeat(85) + '!', 1, null])
    assert.equal(parseClientMsg({ t: 'hello', secret, name: 'Zoe', v: 7, owner: bad }), null, String(bad));
  assert.ok(parseHostMsg({ t: 'welcome', playerId: 'p1', owner }));
  assert.ok(parseHostMsg({ t: 'welcome', playerId: 'p1' }));
  assert.equal(parseHostMsg({ t: 'welcome', playerId: 'p1', owner: 'nope' }), null);
});

/** Runs `fn` with the creator's key kept in memory instead of IndexedDB. */
async function withStore(fn: (keys: { key: CryptoKey | null }) => Promise<void>) {
  const keys: { key: CryptoKey | null } = { key: null };
  useKeyStore({
    get: async () => keys.key,
    set: async (key) => void (keys.key = key),
    delete: async () => void (keys.key = null),
  });
  await fn(keys);
}

const otherKey = async () =>
  (await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])).privateKey;

test('a stored key that does not fit (an old one, or one of another kind) is dropped and unlocks nothing', () =>
  withStore(async (keys) => {
    assert.equal(await checkOwnerKey(), 'none');
    const { subtle } = globalThis.crypto;
    const hmac = await subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    for (const key of [await otherKey(), hmac]) {
      keys.key = key;
      assert.equal(hasOwnerKey(), false);
      assert.equal(await signAsOwner('anything'), null);
      keys.key = key;
      assert.equal(await checkOwnerKey(), 'removed');
      assert.equal(keys.key, null);
      assert.equal(hasOwnerKey(), false);
    }
    // A secret that doesn't fit isn't saved.
    assert.equal(await saveOwnerKey((await subtle.exportKey('jwk', (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])).privateKey)).d!), 'invalid');
    assert.equal(await saveOwnerKey('junk'), 'invalid');
    assert.equal(keys.key, null);
  }));

test('only a clean "does not verify" removes a stored key; an error keeps it', () =>
  withStore(async (keys) => {
    const proto = Object.getPrototypeOf(globalThis.crypto.subtle) as SubtleCrypto;
    const { verify } = proto;
    const key = await otherKey();
    try {
      proto.verify = () => Promise.reject(new DOMException('hiccup', 'OperationError'));
      keys.key = key;
      assert.equal(await checkOwnerKey(), 'unchecked');
      assert.equal(keys.key, key, 'kept after an error');
      proto.verify = verify;
      assert.equal(await checkOwnerKey(), 'removed');
      assert.equal(keys.key, null);
    } finally {
      proto.verify = verify;
    }
  }));

test('checks that come in together share one', () =>
  withStore(async (keys) => {
    const proto = Object.getPrototypeOf(globalThis.crypto.subtle) as SubtleCrypto;
    const { sign } = proto;
    let signs = 0;
    proto.sign = function (this: SubtleCrypto, ...args: Parameters<SubtleCrypto['sign']>) {
      signs++;
      return sign.apply(this, args);
    } as SubtleCrypto['sign'];
    try {
      keys.key = await otherKey();
      const results = await Promise.all(Array.from({ length: 8 }, () => checkOwnerKey()));
      assert.deepEqual(new Set(results), new Set(['removed']));
      assert.equal(signs, 1);
    } finally {
      proto.sign = sign;
    }
  }));

test('the key is asked for, never taken from the address', () =>
  withStore(async (keys) => {
    const page = { hash: '', replaced: '' };
    const saved = { location: Object.getOwnPropertyDescriptor(globalThis, 'location'), history: Object.getOwnPropertyDescriptor(globalThis, 'history') };
    Object.defineProperty(globalThis, 'location', { configurable: true, get: () => ({ hash: page.hash, pathname: '/', search: '' }) });
    Object.defineProperty(globalThis, 'history', {
      configurable: true,
      value: { state: null, replaceState: (_s: unknown, _t: string, url: string) => (page.replaced = url) },
    });
    try {
      const asked: string[] = [];
      const ask = () => (asked.push('asked'), 'not a key');
      page.hash = '';
      assert.equal(await takeOwnerKeyFromUrl(ask), null);
      // A secret in the address is already in the history: refused, and taken out of the address.
      page.hash = '#owner=' + 'A'.repeat(43);
      assert.equal(await takeOwnerKeyFromUrl(ask), 'in-address');
      assert.equal(page.replaced, '/');
      assert.equal(asked.length, 0);
      page.hash = '#owner';
      assert.equal(await takeOwnerKeyFromUrl(ask), 'invalid');
      assert.equal(asked.length, 1);
      page.hash = '#owner';
      assert.equal(await takeOwnerKeyFromUrl(() => null), 'cancelled');
      keys.key = await otherKey();
      page.hash = '#x=1&owner=forget';
      assert.equal(await takeOwnerKeyFromUrl(ask), 'forgotten');
      assert.equal(keys.key, null);
      assert.equal(page.replaced, '/#x=1');
    } finally {
      for (const [k, d] of Object.entries(saved)) {
        if (d) Object.defineProperty(globalThis, k, d);
        else delete (globalThis as Record<string, unknown>)[k];
      }
    }
  }));

test('the host challenge and the hello nonce have to be real nonces', () => {
  const secret = 'abcdefghijklmnopqrstuvwxyz012345';
  const nonce = 'Ab3_x-9Zq1Ab3_x-9Zq1';
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 7, nonce }), { t: 'hello', secret, name: 'Dori', v: 7, nonce });
  for (const bad of ['short', 'x'.repeat(65), 'has space here', 42])
    assert.equal(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 7, nonce: bad }), null, String(bad));
  assert.ok(parseHostMsg({ t: 'challenge', nonce: 'Ab3_x-9Zq1Ab3_x-9Zq1' }));
  assert.ok(parseHostMsg({ t: 'owner', owner: 'A'.repeat(86) }));
  assert.equal(parseHostMsg({ t: 'owner', owner: 'nope' }), null);
  for (const nonce of ['short', 'x'.repeat(65), 'has space here', 42, undefined])
    assert.equal(parseHostMsg({ t: 'challenge', nonce }), null, String(nonce));
});
