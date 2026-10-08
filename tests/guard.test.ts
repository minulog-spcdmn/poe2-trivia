import { test } from 'node:test';
import assert from 'node:assert/strict';
import peerjs from 'peerjs';
import { pack } from 'peerjs-js-binarypack';
import { capped, FrameGuard, hookFrames, JoinGate, plausiblePack, roomSecret } from '../src/lib/guard.ts';
import { parseClientMsg } from '../src/lib/protocol.ts';

function clock() {
  let t = 1_000_000;
  const now = () => t;
  return { now, advance: (ms: number) => (t += ms) };
}

/** A frame as PeerJS's binary serialization sends it. */
function frame(m: unknown): ArrayBuffer {
  const b = pack(m) as ArrayBuffer | Uint8Array;
  return b instanceof ArrayBuffer ? b : (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}
const secret = 'abcdefghijklmnopqrstuvwxyz012345';
const hello = frame({ t: 'hello', secret, name: '語'.repeat(200), v: 5, tab: 'y'.repeat(64) });
const pong = frame({ t: 'pong', n: 4294967295 });
const answer = frame({ t: 'action', action: { type: 'answer', index: 3, askedAt: 1790642896195 } });

test('real guest messages pass the shape check', () => {
  for (const f of [hello, pong, answer, frame({ t: 'action', action: { type: 'next' } }), frame({ a: [1, -2, 1.5, null, true, 'x'] })])
    assert.ok(plausiblePack(new Uint8Array(f)));
});

test('lengths that cannot fit in the frame are refused before decoding', () => {
  const bombs = [
    [0xdd, 0xff, 0xff, 0xff, 0xff], // array of 4 billion
    [0xdd, 0x04, 0x00, 0x00, 0x00],
    [0xdf, 0xff, 0xff, 0xff, 0xff], // map of 4 billion
    [0xdc, 0xff, 0xff, 0x01], // array of 65535 with one byte
    [0xd9, 0xff, 0xff, 0xff, 0xff, 0x41], // string of 4 GB
    [0xdb, 0x00, 0x00, 0x10, 0x00], // bytes past the end
    [0x92, 0x01], // array of 2, one element
    [0x81, 0xa1, 0x74], // map entry without a value
    [0xce, 0x01], // uint32 cut short
    [0xc7], // not a binarypack type
    [0x01, 0x02], // trailing bytes
    Array(20).fill(0x91), // nested too deep
  ];
  for (const b of bombs) assert.equal(plausiblePack(new Uint8Array(b)), false, b.join(','));
  const g = new FrameGuard(clock().now);
  assert.equal(g.check(new Uint8Array([0xdd, 0xff, 0xff, 0xff, 0xff]).buffer), 'bad');
});

test('frame guard blocks oversized frames and drops floods', () => {
  const c = clock();
  const g = new FrameGuard(c.now);
  assert.equal(g.check(pong), 'ok');
  assert.equal(g.check(hello), 'ok');
  // A PeerJS chunk of a big message: no real client sends one.
  assert.equal(new FrameGuard(c.now).check(new ArrayBuffer(16300)), 'bad');
  // Anything that isn't bytes (a text frame included).
  assert.equal(new FrameGuard(c.now).check({}), 'bad');
  assert.equal(new FrameGuard(c.now).check('語'.repeat(1000)), 'bad');

  // Many small frames in a burst (a key held down): a flood, not abuse.
  const burst = new FrameGuard(c.now);
  const verdicts = Array.from({ length: 100 }, () => burst.check(answer));
  const ok = verdicts.filter((v) => v === 'ok').length;
  assert.ok(ok >= 20 && ok < 100, `accepted ${ok}`);
  assert.ok(verdicts.every((v) => v !== 'bad'));

  // A steady trickle of mid-sized frames runs out of bytes.
  const trickle = new FrameGuard(c.now);
  const mid = frame({ t: 'pong', pad: 'x'.repeat(1500) });
  let sent = 0;
  while (trickle.check(mid) === 'ok' && sent < 1000) {
    sent++;
    c.advance(200);
  }
  assert.ok(sent < 1000, 'byte budget never ran out');
});

test('frame guard lets a normal guest through for a long game', () => {
  const c = clock();
  const g = new FrameGuard(c.now);
  assert.equal(g.check(hello), 'ok');
  for (let i = 0; i < 2000; i++) {
    c.advance(3000);
    assert.equal(g.check(pong), 'ok', `pong ${i}`);
    if (i % 5 === 0) assert.equal(g.check(answer), 'ok', `action ${i}`);
  }
});

test('the frame hook fits the installed PeerJS: checks come before decoding, chunks never buffer', () => {
  // The class PeerJS uses for (default) binary connections isn't exported;
  // a Peer has it. If an upgrade renames what hookFrames wraps, this fails.
  // Node loads PeerJS's CommonJS build, whose default export is the whole module.
  const Peer = (peerjs as unknown as { Peer: typeof peerjs }).Peer;
  const peer = new Peer('guard-test', { host: '127.0.0.1', port: 1, secure: false });
  peer.on('error', () => {});
  const Binary = (peer as unknown as { _serializers: Record<string, { prototype: object }> })._serializers.binary;
  peer.destroy();
  const conn = Object.create(Binary.prototype) as {
    _handleDataMessage(e: { data: unknown }): void;
    _chunkedData: Record<string, unknown>;
    emit(ev: string, data: unknown): void;
  };
  conn._chunkedData = {};
  const got: unknown[] = [];
  conn.emit = (ev, data) => ev === 'data' && got.push(data);
  const seen: unknown[] = [];
  let chunks = 0;
  assert.ok(hookFrames(conn, (d) => (seen.push(d), (d as ArrayBuffer).byteLength < 100), () => chunks++));

  conn._handleDataMessage({ data: frame({ t: 'pong', n: 1 }) });
  assert.deepEqual(got, [{ t: 'pong', n: 1 }]);
  // Refused by the check: never unpacked.
  conn._handleDataMessage({ data: frame({ t: 'pong', n: 2, pad: 'x'.repeat(200) }) });
  assert.equal(got.length, 1);
  assert.equal(seen.length, 2);
  // Part of a split message: reported, not buffered.
  conn._handleDataMessage({ data: frame({ __peerData: 7, n: 0, total: 2, data: new ArrayBuffer(4) }) });
  assert.equal(chunks, 1);
  assert.deepEqual(conn._chunkedData, {});
});

test("PeerJS's binary connections report their send queue, which Delve's clock waits on", () => {
  const Peer = (peerjs as unknown as { Peer: typeof peerjs }).Peer;
  const peer = new Peer('queue-test', { host: '127.0.0.1', port: 1, secure: false });
  peer.on('error', () => {});
  const Binary = (peer as unknown as { _serializers: Record<string, { prototype: object }> })._serializers.binary;
  peer.destroy();
  // A getter on the prototype chain (BufferedConnection), and the channel PeerJS keeps on each connection.
  let proto: object | null = Binary.prototype;
  let getter: PropertyDescriptor | undefined;
  while (proto && !getter) {
    getter = Object.getOwnPropertyDescriptor(proto, 'bufferSize');
    proto = Object.getPrototypeOf(proto);
  }
  assert.equal(typeof getter?.get, 'function');
  const conn = Object.create(Binary.prototype) as { _bufferSize: number; bufferSize: number };
  conn._bufferSize = 2;
  assert.equal(conn.bufferSize, 2);
});

test('join gate lets a full lobby in at once, then throttles newcomers', () => {
  const c = clock();
  const gate = new JoinGate(c.now);
  for (let i = 0; i < 12; i++) assert.equal(gate.admit(`new-${i}`, false), null);
  assert.match(gate.admit('new-12', false) ?? '', /Lots of people/);
  // People the host already knows (e.g. after the host's refresh) still get in.
  assert.equal(gate.admit('known-1', true), null);
  c.advance(4000);
  assert.equal(gate.admit('new-13', false), null);
  assert.notEqual(gate.admit('new-14', false), null);
});

test('join gate stops one player rejoining in a loop', () => {
  const c = clock();
  const gate = new JoinGate(c.now);
  let ok = 0;
  for (let i = 0; i < 20; i++) if (gate.admit('same', true) === null) ok++;
  assert.equal(ok, 6);
  assert.match(gate.admit('same', true) ?? '', /reconnected too often/);
  c.advance(10_000);
  assert.equal(gate.admit('same', true), null);
});

test('turned-down joins are free at a human pace, but a stream of them is throttled', () => {
  const c = clock();
  const gate = new JoinGate(c.now);
  // Someone retrying a taken name now and then: no cost to anyone.
  for (let i = 0; i < 60; i++) {
    assert.equal(gate.admit(`typo-${i}`, false), null);
    gate.rejected(`typo-${i}`, false);
    c.advance(1000);
  }
  for (let i = 0; i < 12; i++) assert.equal(gate.admit(`real-${i}`, false), null, `real ${i}`);
  // A script firing rejected hellos as fast as it can runs out of allowance.
  const flood = new JoinGate(c.now);
  let through = 0;
  for (let i = 0; i < 200; i++) {
    if (flood.admit(`junk-${i}`, false) !== null) continue;
    through++;
    flood.rejected(`junk-${i}`, false);
  }
  assert.ok(through < 30, `${through} rejected hellos went through`);
});

test('a player who keeps rejoining never ages out of the gate', () => {
  const c = clock();
  const gate = new JoinGate(c.now);
  for (let i = 0; i < 6; i++) assert.equal(gate.admit('looper', true), null);
  // 500 newcomers trickle in (one every 4 s) while the looper keeps trying.
  for (let i = 0; i < 500; i++) {
    c.advance(4000);
    gate.admit(`new-${i}`, false);
    gate.admit('looper', true);
  }
  // Still throttled: its budget refills at 1 per 10 s, not a fresh 6.
  let ok = 0;
  for (let i = 0; i < 6; i++) if (gate.admit('looper', true) === null) ok++;
  assert.ok(ok <= 1, `rejoined ${ok} times in a row`);
});

test('junk tokens cannot reset a player\'s rejoin budget', () => {
  const gate = new JoinGate(clock().now);
  for (let i = 0; i < 6; i++) assert.equal(gate.admit('looper', true), null);
  assert.notEqual(gate.admit('looper', true), null);
  // A burst of hellos with fresh tokens: only the shared allowance gets in.
  let admitted = 0;
  for (let i = 0; i < 600; i++) if (gate.admit(`junk-${i}`, false) === null) admitted++;
  assert.equal(admitted, 12);
  assert.notEqual(gate.admit('looper', true), null, 'looper got a fresh budget');
});

test('room secrets differ per room, stay stable, and pass the hello check', async () => {
  const secret = 'abcdefghijklmnopqrstuvwxyz012345';
  const a = await roomSecret(secret, 'ABCDEF');
  const b = await roomSecret(secret, 'ABCDEG');
  assert.equal(a, await roomSecret(secret, 'ABCDEF'));
  assert.notEqual(a, b);
  assert.notEqual(a, await roomSecret('zyxwvutsrqponmlkjihgfedcba543210', 'ABCDEF'));
  assert.ok(!a.includes(secret));
  for (const s of [a, b]) assert.ok(parseClientMsg({ t: 'hello', secret: s, name: 'Dori', v: 1 }), s);
});

test('capped keeps the newest entries', () => {
  assert.deepEqual(capped([1, 2, 3, 4], 2), [3, 4]);
  assert.deepEqual(capped([1], 2), [1]);
});
