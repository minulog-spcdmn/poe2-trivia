import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeLaneMsg, LaneReceiver, LaneSender, MAX_LANE_MESSAGE, type LaneChannel } from '../src/lib/artLane.ts';
import {
  importSealKey,
  isKid,
  keyMsg,
  makeSealKey,
  MAX_SEALED_BYTES,
  MAX_SEALED_PLAIN,
  newKid,
  openSealed,
  parseKey,
  parseSealed,
  sealAvailable,
  sealMsg,
  SealedStore,
  SEAL_IV_BYTES,
  SEAL_KEY_BYTES,
  SEAL_TAG_BYTES,
  type SealedMsg,
} from '../src/lib/seal.ts';

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill).buffer;

const veil = (qid = 3) => ({
  t: 'veil',
  qid,
  tile: 2,
  w: 640,
  h: 480,
  burn: 9000,
  count: 12,
  box: [10, 20, 300, 400],
  data: new Uint8Array([1, 2, 3, 4, 5, 250]).buffer,
  labels: new Uint8Array(16).fill(9).buffer,
});

/** Every place `needle` occurs in `hay`, as byte offsets. */
function find(hay: ArrayBuffer, needle: Uint8Array): number {
  const h = new Uint8Array(hay);
  outer: for (let i = 0; i + needle.length <= h.length; i++) {
    for (let j = 0; j < needle.length; j++) if (h[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** A store and what it handed on. */
function store(limits = {}) {
  const got: { msg: Record<string, unknown>; kid: string }[] = [];
  const s = new SealedStore((msg, kid) => got.push({ msg, kid }), limits);
  return { s, got };
}

test('node has WebCrypto, so sealing is available', () => {
  assert.equal(sealAvailable(), true);
});

test('key ids are short and safe, fresh each time', () => {
  const a = newKid();
  assert.ok(isKid(a), a);
  assert.ok(a.length <= 12);
  assert.notEqual(a, newKid());
  assert.ok(isKid(`q12.3-${a}`));
  for (const bad of ['', 'a b', 'x'.repeat(49), '__proto__/', 'é', 12, null, undefined]) assert.equal(isKid(bad), false, String(bad));
});

test('a sealed message opens to the whole message, binary fields and all', async () => {
  const key = await makeSealKey();
  const sealed = await sealMsg(veil(), key);
  assert.deepEqual(Object.keys(sealed).sort(), ['data', 'iv', 'kid', 't']);
  assert.equal(sealed.t, 'sealed');
  assert.equal(sealed.kid, key.kid);
  assert.equal(sealed.iv.byteLength, SEAL_IV_BYTES);
  const opened = await openSealed(sealed, key.key);
  assert.deepEqual(opened, veil());
});

test('nothing of the message is readable while sealed', async () => {
  const key = await makeSealKey();
  const msg = { ...veil(4242), data: new TextEncoder().encode('PICTURE-BYTES-HERE').buffer };
  const sealed = await sealMsg(msg, key);
  const plain = encodeLaneMsg(msg);
  for (const needle of ['veil', '4242', 'qid', 'box', 'PICTURE-BYTES-HERE', '"w"']) {
    assert.equal(find(sealed.data, new TextEncoder().encode(needle)), -1, needle);
  }
  // Only the tag is added: the size says no more than the plain message's would.
  assert.equal(sealed.data.byteLength, plain.byteLength + SEAL_TAG_BYTES);
  // Framed for the lane, the sealed message carries no field but its id.
  const head = new TextDecoder().decode(encodeLaneMsg({ ...sealed }));
  assert.ok(!head.includes('qid') && !head.includes('4242') && !head.includes('veil'));
});

test('every message gets its own IV, and the same message seals differently each time', async () => {
  const key = await makeSealKey();
  const a = await sealMsg(veil(), key);
  const b = await sealMsg(veil(), key);
  assert.notDeepEqual(new Uint8Array(a.iv), new Uint8Array(b.iv));
  assert.notDeepEqual(new Uint8Array(a.data), new Uint8Array(b.data));
});

test('the wrong key, a re-labelled id or tampered bytes fail quietly', async () => {
  const key = await makeSealKey('q1-aaaa');
  const other = await makeSealKey('q1-aaaa');
  const sealed = await sealMsg(veil(), key);
  assert.equal(await openSealed(sealed, other.key), null);
  // Same key bytes, but the message said to be another id's: its tag binds the id.
  assert.equal(await openSealed({ ...sealed, kid: 'q2-bbbb' }, key.key), null);
  const flipped = new Uint8Array(sealed.data.slice(0));
  flipped[5] ^= 1;
  assert.equal(await openSealed({ ...sealed, data: flipped.buffer }, key.key), null);
  const iv = new Uint8Array(sealed.iv.slice(0));
  iv[0] ^= 1;
  assert.equal(await openSealed({ ...sealed, iv: iv.buffer }, key.key), null);
});

test('the key message carries the raw key, and a guest opens with it', async () => {
  const key = await makeSealKey();
  const k = keyMsg(key);
  assert.deepEqual(Object.keys(k).sort(), ['key', 'kid', 't']);
  assert.equal(k.key.byteLength, SEAL_KEY_BYTES);
  assert.notEqual(k.key, key.raw.buffer, 'a copy, not the bytes kept');
  const guestKey = await importSealKey(k.key);
  assert.ok(guestKey);
  assert.deepEqual(await openSealed(await sealMsg(veil(), key), guestKey), veil());
  assert.equal(await importSealKey(bytes(16)), null);
});

test('a message too large for the lane is not sealed', async () => {
  const key = await makeSealKey();
  await assert.rejects(sealMsg({ t: 'art', data: bytes(MAX_SEALED_PLAIN + 1) }, key), RangeError);
  assert.ok(MAX_SEALED_PLAIN < MAX_LANE_MESSAGE);
});

test('a sealed message goes down the art lane and parses on the other side', async () => {
  const channel: LaneChannel & { sent: ArrayBuffer[] } = {
    readyState: 'open',
    bufferedAmount: 0,
    bufferedAmountLowThreshold: 0,
    binaryType: 'arraybuffer',
    sent: [],
    send(data) {
      this.sent.push(data.slice().buffer);
    },
    close() {},
    addEventListener() {},
  };
  const key = await makeSealKey();
  const big = { t: 'art', qid: 1, w: 800, h: 600, data: bytes(100_000, 3) };
  new LaneSender(channel).send({ ...(await sealMsg(big, key)) });
  const out: Record<string, unknown>[] = [];
  const rx = new LaneReceiver((m) => out.push(m));
  for (const f of channel.sent) assert.ok(rx.take(f));
  const sealed = parseSealed(out[0]);
  assert.ok(sealed);
  assert.deepEqual(await openSealed(sealed, (await importSealKey(keyMsg(key).key))!), big);
});

test('parseSealed takes only well-formed sealed messages, and copies out their known fields', async () => {
  const key = await makeSealKey();
  const good = await sealMsg(veil(), key);
  const parsed = parseSealed({ ...good, qid: 4, extra: 'x' });
  assert.deepEqual(parsed, good);
  assert.deepEqual(Object.keys(parsed!).sort(), ['data', 'iv', 'kid', 't']);
  // A view of a larger buffer comes out as just its bytes.
  const wide = new Uint8Array(40);
  wide.set(new Uint8Array(good.iv), 8);
  assert.equal(parseSealed({ ...good, iv: wide.subarray(8, 20) })!.iv.byteLength, SEAL_IV_BYTES);
  const bad: unknown[] = [
    null,
    'sealed',
    [],
    { ...good, t: 'key' },
    { ...good, kid: undefined },
    { ...good, kid: 'a b' },
    { ...good, kid: 'k'.repeat(49) },
    { ...good, kid: 7 },
    { ...good, iv: bytes(11) },
    { ...good, iv: bytes(16) },
    { ...good, iv: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    { ...good, iv: 'abcdefghijkl' },
    { ...good, data: bytes(SEAL_TAG_BYTES) },
    { ...good, data: bytes(MAX_SEALED_BYTES + 1) },
    { ...good, data: 'x' },
    { ...good, data: undefined },
  ];
  for (const b of bad) assert.equal(parseSealed(b), null, JSON.stringify(b));
  assert.ok(parseSealed({ ...good, data: bytes(MAX_SEALED_BYTES) }));
});

test('parseKey takes only a 32-byte key under a safe id', () => {
  const good = { t: 'key', kid: 'q3-abc', key: bytes(SEAL_KEY_BYTES) };
  assert.deepEqual(parseKey({ ...good, extra: 1 }), good);
  assert.ok(parseKey({ ...good, key: new Uint8Array(SEAL_KEY_BYTES) }));
  for (const b of [
    null,
    { ...good, t: 'sealed' },
    { ...good, kid: '' },
    { ...good, kid: 'a/b' },
    { ...good, key: bytes(31) },
    { ...good, key: bytes(33) },
    { ...good, key: 'x'.repeat(32) },
    { ...good, key: undefined },
  ]) {
    assert.equal(parseKey(b), null, JSON.stringify(b));
  }
});

test('the store holds sealed messages until the key comes, then opens them in order', async () => {
  const key = await makeSealKey('q1-x');
  const { s, got } = store();
  const msgs = [veil(1), { t: 'patch', qid: 1, tile: 2, i: 0 }, { t: 'patch', qid: 1, tile: 2, i: 1 }, { t: 'option', qid: 1, index: 3, w: 9, h: 9, data: bytes(40) }];
  for (const m of msgs) s.take(await sealMsg(m, key));
  await s.idle();
  assert.equal(got.length, 0, 'nothing opens without the key');
  assert.equal(s.waitingFor('q1-x'), 4);
  assert.ok(s.bytes > 0);
  s.key(keyMsg(key));
  await s.idle();
  assert.deepEqual(got.map((g) => g.msg), msgs);
  assert.ok(got.every((g) => g.kid === 'q1-x'));
  assert.equal(s.bytes, 0);
  assert.equal(s.failed, 0);
});

test('a sealed message that comes after its key opens at once, behind those already opening', async () => {
  const key = await makeSealKey('q2-x');
  const { s, got } = store();
  s.take(await sealMsg({ t: 'patch', qid: 2, tile: 1, i: 0 }, key));
  s.key(keyMsg(key));
  s.take(await sealMsg({ t: 'patch', qid: 2, tile: 1, i: 1 }, key));
  s.take(await sealMsg({ t: 'patch', qid: 2, tile: 1, i: 2 }, key));
  await s.idle();
  assert.deepEqual(got.map((g) => g.msg.i), [0, 1, 2]);
  assert.ok(s.hasKey('q2-x'));
  assert.equal(s.waitingFor('q2-x'), 0);
});

test('ids are kept apart: a key opens only its own id', async () => {
  const a = await makeSealKey('qa');
  const b = await makeSealKey('qb');
  const { s, got } = store();
  s.take(await sealMsg({ t: 'art', qid: 1, w: 1, h: 1, data: bytes(4) }, a));
  s.take(await sealMsg({ t: 'art', qid: 2, w: 1, h: 1, data: bytes(4) }, b));
  s.key(keyMsg(b));
  await s.idle();
  assert.deepEqual(got.map((g) => [g.kid, g.msg.qid]), [['qb', 2]]);
  assert.equal(s.waitingFor('qa'), 1);
});

test('a wrong key or a re-labelled message is counted and dropped, never thrown', async () => {
  const key = await makeSealKey('q5');
  const imposter = await makeSealKey('q5');
  const { s, got } = store();
  s.take(await sealMsg(veil(), key));
  // Sealed under another id, then said to be q5's: it won't open under q5.
  const other = await makeSealKey('q6');
  s.take({ ...(await sealMsg(veil(), other)), kid: 'q5' });
  s.key(keyMsg(imposter));
  await s.idle();
  assert.equal(got.length, 0);
  assert.equal(s.failed, 2);
  // A second key for an id already keyed is ignored, so the right one can't rescue (or replace) it.
  s.key(keyMsg(key));
  s.take(await sealMsg(veil(), key));
  await s.idle();
  assert.equal(got.length, 0);
  assert.equal(s.failed, 3);
  // Tampered bytes under the right key.
  const k7 = await makeSealKey('q7');
  s.key(keyMsg(k7));
  const sealed = await sealMsg(veil(), k7);
  const data = new Uint8Array(sealed.data.slice(0));
  data[data.length - 1] ^= 0x80;
  s.take({ ...sealed, data: data.buffer });
  s.take(sealed);
  await s.idle();
  assert.equal(s.failed, 4);
  assert.equal(got.length, 1, 'the good one behind the bad one still opens');
});

test('a key the browser will not take fails its messages quietly', async () => {
  const { s, got } = store();
  const key = await makeSealKey('qz');
  s.take(await sealMsg(veil(), key));
  s.key({ t: 'key', kid: 'qz', key: bytes(7) });
  await s.idle();
  assert.equal(got.length, 0);
  assert.equal(s.failed, 1);
});

test('a throwing handler does not stop the messages behind it', async () => {
  const key = await makeSealKey('qt');
  const got: unknown[] = [];
  const s = new SealedStore((m) => {
    got.push(m.i);
    if (m.i === 0) throw new Error('handler broke');
  });
  const err = console.error;
  console.error = () => {};
  try {
    s.key(keyMsg(key));
    for (const i of [0, 1]) s.take(await sealMsg({ t: 'patch', qid: 1, tile: 1, i }, key));
    await s.idle();
  } finally {
    console.error = err;
  }
  assert.deepEqual(got, [0, 1]);
});

test('the byte cap drops the oldest id first, then the newest message of a lone id', async () => {
  const msg = (qid: number) => ({ t: 'art', qid, w: 1, h: 1, data: bytes(1000) });
  const k1 = await makeSealKey('k1');
  const k2 = await makeSealKey('k2');
  const one = await sealMsg(msg(1), k1);
  const size = one.data.byteLength + one.iv.byteLength;
  const { s, got } = store({ maxBytes: size * 3 });
  s.take(one);
  s.take(await sealMsg(msg(1), k1));
  s.take(await sealMsg(msg(2), k2));
  assert.equal(s.bytes, size * 3);
  // A fourth: k1 is the oldest id, so both of its go.
  s.take(await sealMsg(msg(2), k2));
  assert.equal(s.waitingFor('k1'), 0);
  assert.equal(s.waitingFor('k2'), 2);
  assert.equal(s.dropped, 2);
  s.take(await sealMsg(msg(2), k2));
  // k2 alone fills it: the newest is turned away, the first ones kept.
  s.take(await sealMsg(msg(2), k2));
  assert.equal(s.waitingFor('k2'), 3);
  assert.equal(s.dropped, 3);
  assert.ok(s.bytes <= size * 3);
  s.key(keyMsg(k1));
  s.key(keyMsg(k2));
  await s.idle();
  assert.equal(got.length, 3);
  assert.equal(s.failed, 0);
});

test('the default byte cap holds about 8 MB', async () => {
  const key = await makeSealKey('big');
  const { s } = store();
  const sealed = await sealMsg({ t: 'art', qid: 1, w: 1, h: 1, data: bytes(3 * 1024 * 1024) }, key);
  s.take(sealed);
  s.take(sealed);
  s.take(sealed);
  assert.equal(s.waitingFor('big'), 2);
  assert.ok(s.bytes <= 8 * 1024 * 1024);
  assert.equal(s.dropped, 1);
});

test('the number of waiting ids and kept keys is capped, oldest first', async () => {
  const { s, got } = store({ maxWaiting: 2, maxKeys: 2 });
  const keys = await Promise.all(['w1', 'w2', 'w3'].map((k) => makeSealKey(k)));
  for (const k of keys) s.take(await sealMsg({ t: 'patch', qid: 1, tile: 1, i: 0 }, k));
  assert.equal(s.waitingFor('w1'), 0);
  assert.equal(s.waitingFor('w2'), 1);
  assert.equal(s.waitingFor('w3'), 1);
  assert.equal(s.dropped, 1);
  for (const k of keys) s.key(keyMsg(k));
  assert.equal(s.hasKey('w1'), false, 'pushed out by the third');
  assert.ok(s.hasKey('w2') && s.hasKey('w3'));
  await s.idle();
  assert.deepEqual(got.map((g) => g.kid), ['w2', 'w3']);
});

test('a key pushed out before its messages opened lets them go', async () => {
  const { s, got } = store({ maxKeys: 1 });
  const a = await makeSealKey('pa');
  const b = await makeSealKey('pb');
  s.take(await sealMsg(veil(), a));
  s.key(keyMsg(a));
  s.key(keyMsg(b));
  await s.idle();
  assert.equal(got.length, 0);
  assert.equal(s.failed, 0);
  assert.ok(s.hasKey('pb') && !s.hasKey('pa'));
});

test('forget and clear let go of bytes and keys, even mid-opening', async () => {
  const a = await makeSealKey('fa');
  const b = await makeSealKey('fb');
  const { s, got } = store();
  s.take(await sealMsg(veil(), a));
  s.take(await sealMsg(veil(), b));
  s.forget('fa');
  assert.equal(s.waitingFor('fa'), 0);
  s.key(keyMsg(a));
  await s.idle();
  assert.equal(got.length, 0, 'what was forgotten does not come back with its key');
  // Keyed and opening, then forgotten before it finished.
  s.key(keyMsg(b));
  s.forget('fb');
  await s.idle();
  assert.equal(got.length, 0);
  assert.equal(s.hasKey('fb'), false);
  s.take(await sealMsg(veil(), a));
  s.clear();
  await s.idle();
  assert.equal(got.length, 0);
  assert.equal(s.bytes, 0);
  assert.equal(s.hasKey('fa'), false);
});

test('a host reload: the old id\'s bytes never open under the new key', async () => {
  const old = await makeSealKey('q1-gen1');
  const fresh = await makeSealKey('q1-gen2');
  const { s, got } = store();
  const stale: SealedMsg = await sealMsg({ t: 'art', qid: 1, w: 1, h: 1, data: bytes(8, 1) }, old);
  s.take(stale);
  s.take(await sealMsg({ t: 'art', qid: 1, w: 1, h: 1, data: bytes(8, 2) }, fresh));
  s.key(keyMsg(fresh));
  await s.idle();
  assert.equal(got.length, 1);
  assert.deepEqual(new Uint8Array(got[0].msg.data as ArrayBuffer), new Uint8Array(8).fill(2));
  assert.equal(s.waitingFor('q1-gen1'), 1);
});
