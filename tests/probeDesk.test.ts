import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DataConnection } from 'peerjs';
import { ProbeDesk, isProbe } from '../src/lib/probeDesk.ts';
import { parseRoomInfo, type RoomInfo } from '../src/lib/roomInfo.ts';
import { PROTOCOL_VERSION } from '../src/lib/protocol.ts';

const room: RoomInfo = { code: 'KXR4QT', host: 'Una', players: 3, maxPlayers: 12, spectators: 0, maxSpectators: 12, mode: 'turns', difficulty: 'cruel', target: 10, phase: 'lobby', v: PROTOCOL_VERSION };

/** A connection that records what it was sent and whether it was hung up on; `open()` opens it. */
function conn(metadata?: unknown) {
  const handlers: Record<string, (() => void)[]> = {};
  const c = {
    metadata,
    sent: [] as unknown[],
    closed: false,
    on(ev: string, fn: () => void) {
      (handlers[ev] ??= []).push(fn);
    },
    send(msg: unknown) {
      c.sent.push(msg);
    },
    close() {
      c.closed = true;
    },
    open() {
      for (const fn of handlers.open ?? []) fn();
    },
  };
  return c;
}
const asConn = (c: ReturnType<typeof conn>) => c as unknown as DataConnection;

test('a probe is told the room, which a stranger can read back, and only probes count as one', () => {
  const desk = new ProbeDesk(() => room);
  const c = conn({ probe: true });
  assert.equal(isProbe(asConn(c)), true);
  assert.equal(isProbe(asConn(conn())), false);
  assert.equal(isProbe(asConn(conn({ token: 'x' }))), false);
  desk.answer(asConn(c));
  c.open();
  assert.equal(c.sent.length, 1);
  const msg = c.sent[0] as { t: string; room: unknown };
  assert.equal(msg.t, 'info');
  assert.deepEqual(parseRoomInfo(msg.room), room);
});

test('a room with nothing to say (not hosting) sends nothing', () => {
  const c = conn({ probe: true });
  new ProbeDesk(() => null).answer(asConn(c));
  c.open();
  assert.deepEqual(c.sent, []);
});

test('too many probes at once are hung up on unanswered', () => {
  const desk = new ProbeDesk(() => room);
  const all = Array.from({ length: 10 }, () => conn({ probe: true }));
  for (const c of all) desk.answer(asConn(c));
  for (const c of all) c.open();
  const answered = all.filter((c) => c.sent.length).length;
  assert.equal(answered, 8);
  assert.equal(all.filter((c) => c.closed && !c.sent.length).length, 2);
});
