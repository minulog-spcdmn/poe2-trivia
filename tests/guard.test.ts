import { test } from 'node:test';
import assert from 'node:assert/strict';
import peerjs from 'peerjs';
import { pack } from 'peerjs-js-binarypack';
import { capped, FrameGuard, hookFrames, JoinGate, MAX_FRAME_BYTES, roomSecret } from '../src/lib/guard.ts';
import { parseClientMsg } from '../src/lib/protocol.ts';

function clock() {
  let t = 1_000_000;
  const now = () => t;
  return { now, advance: (ms: number) => (t += ms) };
}

test('frame guard blocks oversized frames and drops floods', () => {
  const c = clock();
  const g = new FrameGuard(c.now);
  assert.equal(g.check(new ArrayBuffer(200)), 'ok');
  assert.equal(g.check(new Uint8Array(MAX_FRAME_BYTES)), 'ok');
  // A PeerJS chunk of a big message: no real client sends one.
  assert.equal(new FrameGuard(c.now).check(new ArrayBuffer(16300)), 'bad');
  // Anything that isn't bytes or text.
  assert.equal(new FrameGuard(c.now).check({}), 'bad');

  // Many small frames in a burst (a key held down): a flood, not abuse.
  const burst = new FrameGuard(c.now);
  const verdicts = Array.from({ length: 100 }, () => burst.check(new ArrayBuffer(10)));
  const ok = verdicts.filter((v) => v === 'ok').length;
  assert.ok(ok >= 20 && ok < 100, `accepted ${ok}`);
  assert.ok(verdicts.every((v) => v !== 'bad'));

  // A steady trickle of mid-sized frames runs out of bytes.
  const trickle = new FrameGuard(c.now);
  let sent = 0;
  while (trickle.check(new ArrayBuffer(1500)) === 'ok' && sent < 1000) {
    sent++;
    c.advance(200);
  }
  assert.ok(sent < 1000, 'byte budget never ran out');
});

test('frame guard lets a normal guest through for a long game', () => {
  const c = clock();
  const g = new FrameGuard(c.now);
  assert.equal(g.check(new ArrayBuffer(900)), 'ok'); // hello with a long name
  for (let i = 0; i < 2000; i++) {
    c.advance(3000);
    assert.equal(g.check(new ArrayBuffer(24)), 'ok', `pong ${i}`);
    if (i % 5 === 0) assert.equal(g.check(new ArrayBuffer(60)), 'ok', `action ${i}`);
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

  const frame = (m: unknown) => {
    const b = pack(m) as ArrayBuffer | Uint8Array;
    return b instanceof ArrayBuffer ? b : b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
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

test('rejected joins give the newcomer allowance back', () => {
  const c = clock();
  const gate = new JoinGate(c.now);
  // A script whose hellos are all turned down (bad name, locked room…).
  for (let i = 0; i < 100; i++) {
    assert.equal(gate.admit(`junk-${i}`, false), null);
    gate.rejected(`junk-${i}`, false);
  }
  for (let i = 0; i < 12; i++) assert.equal(gate.admit(`real-${i}`, false), null, `real ${i}`);
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
