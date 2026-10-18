import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DataConnection } from 'peerjs';
import { ProbeDesk, answerOf, isProbe, ping, pingAnswer, pingOf } from '../src/lib/probeDesk.ts';
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

test("a probe's challenge reaches the room, and a listing signed over it (later) goes out", async () => {
  const asked: (string | null)[] = [];
  const desk = new ProbeDesk(async (challenge) => (asked.push(challenge), { ...room, owner: 'x'.repeat(86) }));
  const c = conn({ probe: true, challenge: 'c'.repeat(22) });
  desk.answer(asConn(c));
  c.open();
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(asked, ['c'.repeat(22)]);
  assert.equal((c.sent[0] as { room: { owner?: string } }).room.owner, 'x'.repeat(86));
  // A probe without one (or with junk) is answered too, unsigned.
  const old = conn({ probe: true, challenge: '<junk>' });
  desk.answer(asConn(old));
  old.open();
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(asked, ['c'.repeat(22), null]);
});

/** What the signalling server hands on: the message as sent, with `src` set to the sender and `dst` left as it was. */
const relayed = (msg: object, src: string) => JSON.parse(JSON.stringify({ ...msg, src }));

test('a ping looks to the signalling server like an ICE candidate, the only kind the free one passes on from strangers', () => {
  const msg = ping('room-pub-1', 'dc_abc', 'c'.repeat(22));
  assert.equal(msg.type, 'CANDIDATE');
  assert.equal(msg.dst, 'room-pub-1');
  // The free server cut off a sender whose candidate lacked any of these (checked against it).
  assert.deepEqual(msg.payload.candidate, { candidate: '', sdpMid: '0', sdpMLineIndex: 0 });
  assert.equal(msg.payload.type, 'data');
  assert.equal(msg.payload.connectionId, 'dc_abc');
  assert.equal(pingAnswer('scanner', 'dc_abc', room).type, 'CANDIDATE');
  assert.deepEqual(pingAnswer('scanner', 'dc_abc', room).payload.candidate, msg.payload.candidate);
});

test('a ping is read back with who sent it and its challenge, and its answer with the room', () => {
  const heard = pingOf(relayed(ping('room-pub-1', 'dc_abc', 'c'.repeat(22)), 'scanner'));
  assert.deepEqual(heard, { src: 'scanner', connectionId: 'dc_abc', challenge: 'c'.repeat(22) });
  // Junk where the challenge goes is answered unsigned.
  assert.equal(pingOf(relayed(ping('room-pub-1', 'dc_abc', '<junk>'), 'scanner'))?.challenge, null);
  // An answer isn't a ping, nor a ping an answer, nor anything else either.
  const answer = relayed(pingAnswer('scanner', 'dc_abc', room), 'room-pub-1');
  assert.equal(pingOf(answer), null);
  assert.equal(answerOf(relayed(ping('room-pub-1', 'dc_abc', 'c'.repeat(22)), 'scanner')), null);
  const a = answerOf(answer);
  assert.equal(a?.src, 'room-pub-1');
  assert.equal(a?.connectionId, 'dc_abc');
  assert.deepEqual(parseRoomInfo(a?.room), room);
  assert.equal(answerOf(relayed(pingAnswer('scanner', 'dc_abc', null), 'room-pub-1'))?.room, null);
  const real = { type: 'CANDIDATE', src: 'x', payload: { candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host' }, type: 'data', connectionId: 'dc_1' } };
  for (const m of [real, { type: 'OFFER', src: 'x', payload: { connectionId: 'dc_1', probe: 'c' } }, { type: 'CANDIDATE', payload: { connectionId: 'dc_1', probe: 'c' } }, null, 'CANDIDATE']) {
    assert.equal(pingOf(m), null);
    assert.equal(answerOf(m), null);
  }
});

test('pings are answered with the room (signed over their challenge) or null, and count toward the same limit as connections', async () => {
  const asked: (string | null)[] = [];
  const desk = new ProbeDesk(async (challenge) => (asked.push(challenge), room));
  const replies: (RoomInfo | null)[] = [];
  desk.answerPing('c'.repeat(22), (r) => replies.push(r));
  await new Promise((r) => setTimeout(r));
  assert.deepEqual(asked, ['c'.repeat(22)]);
  assert.deepEqual(replies, [room]);
  const none: (RoomInfo | null)[] = [];
  new ProbeDesk(() => null).answerPing(null, (r) => none.push(r));
  assert.deepEqual(none, [null]);

  const busy = new ProbeDesk(() => room);
  let answered = 0;
  for (let i = 0; i < 70; i++) busy.answerPing(null, () => answered++);
  assert.equal(answered, 60);
  const c = conn({ probe: true });
  busy.answer(asConn(c));
  c.open();
  assert.deepEqual(c.sent, []);
  assert.equal(c.closed, true);
});
