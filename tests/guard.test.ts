import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capped, FrameGuard, JoinGate, MAX_FRAME_BYTES, roomSecret } from '../src/lib/guard.ts';
import { parseClientMsg } from '../src/lib/protocol.ts';

function clock() {
  let t = 1_000_000;
  const now = () => t;
  return { now, advance: (ms: number) => (t += ms) };
}

test('frame guard drops oversized frames, chunk floods and byte floods', () => {
  const c = clock();
  const g = new FrameGuard(c.now);
  assert.ok(g.accept(new ArrayBuffer(200)));
  assert.ok(g.accept(new Uint8Array(MAX_FRAME_BYTES)));
  // A PeerJS chunk of a big message.
  assert.equal(new FrameGuard(c.now).accept(new ArrayBuffer(16300)), false);
  // Anything that isn't bytes or text.
  assert.equal(new FrameGuard(c.now).accept({}), false);

  // Many small frames in a burst.
  const burst = new FrameGuard(c.now);
  let ok = 0;
  for (let i = 0; i < 100; i++) if (burst.accept(new ArrayBuffer(10))) ok++;
  assert.ok(ok >= 20 && ok < 100, `accepted ${ok}`);

  // A steady trickle of mid-sized frames runs out of bytes.
  const trickle = new FrameGuard(c.now);
  let sent = 0;
  while (trickle.accept(new ArrayBuffer(1500)) && sent < 1000) {
    sent++;
    c.advance(200);
  }
  assert.ok(sent < 1000, 'byte budget never ran out');
});

test('frame guard lets a normal guest through for a long game', () => {
  const c = clock();
  const g = new FrameGuard(c.now);
  assert.ok(g.accept(new ArrayBuffer(900))); // hello with a long name
  for (let i = 0; i < 2000; i++) {
    c.advance(3000);
    assert.ok(g.accept(new ArrayBuffer(24)), `pong ${i}`);
    if (i % 5 === 0) assert.ok(g.accept(new ArrayBuffer(60)), `action ${i}`);
  }
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
