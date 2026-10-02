import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, looksLikeOwner, nameProblem } from '../src/lib/names.ts';
import { hostClaim, importOwnerKey, joinClaim, listClaim, verifyOwner } from '../src/lib/owner.ts';
import { parseClientMsg, parseHostMsg } from '../src/lib/protocol.ts';

test("names that pass for the creator's are caught, however they're spelled", () => {
  const lookalikes = [
    'zoe_arcana', 'Zoe', 'ZOE', 'zoë', 'Zoé', 'z0e', 'Z0Ë', 'zo3', '2oe', 'z o e', 'z.o.e', 'Zooee', 'Zoe!', 'zoe1',
    'zoe arcana', 'Zoë Arcana', 'ZOE_4RCANA', 'zoe_arcanna', 'Zoe_Arcana2', 'z0e.arcana', 'ｚｏｅ', '𝓩𝓸𝓮', 'ᴢᴏᴇ',
    'Ζoe', 'zοe', 'zое', 'zøe', 'z\u200boe', 'z\u0308oe',
  ];
  for (const raw of lookalikes) {
    const name = cleanName(raw);
    assert.ok(looksLikeOwner(name), raw);
    assert.match(nameProblem(name, []) ?? '', /creator/, raw);
    // The creator, once proven, may use any of them.
    assert.equal(nameProblem(name, [], true), null, raw);
  }
  // Only the name itself: other names that happen to contain it are fine.
  for (const name of ['Ozoemena', 'Zoey', 'xX_Zoe_Xx', 'Zoe the Bold', 'zoe_arcana_fan', 'Zana', 'Zeo', 'Arcana', 'Rose', 'Joe', 'Chloe', 'Doryani']) {
    assert.equal(looksLikeOwner(name), false, name);
    assert.equal(nameProblem(name, []), null, name);
  }
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
  const claim = joinClaim('ABCDEF', 'token-token-token-token');
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, other.privateKey, new TextEncoder().encode(claim)));
  const forged = Buffer.from(sig).toString('base64url');
  assert.equal(forged.length, 86);
  for (const proof of [forged, 'A'.repeat(86), '', undefined, 42, forged + 'x'])
    assert.equal(await verifyOwner(claim, proof), false, String(proof));
});

test('claims name the room and the asker, and never stand in for one another', () => {
  const claims = [
    joinClaim('ABCDEF', 'tok'),
    joinClaim('ABCDEG', 'tok'),
    joinClaim('ABCDEF', 'tok2'),
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
