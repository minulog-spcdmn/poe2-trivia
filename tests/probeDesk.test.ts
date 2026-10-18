import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DataConnection } from 'peerjs';
import { ProbeDesk, answerOf, isProbe, ping, pingAnswer, pingOf } from '../src/lib/probeDesk.ts';
import { parseRoomInfo, type RoomInfo } from '../src/lib/roomInfo.ts';
import { PROTOCOL_VERSION } from '../src/lib/protocol.ts';

// The desk's limits run on Date.now and its hang-ups on setTimeout: both the test's to move.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 }));
afterEach(() => mock.timers.reset());
/** Lets settled promises run on (setImmediate isn't among the timers mocked). */
const flush = () => new Promise((r) => setImmediate(r));

const room: RoomInfo = { code: 'KXR4QT', host: 'Una', players: 3, maxPlayers: 12, spectators: 0, maxSpectators: 12, mode: 'turns', difficulty: 'cruel', target: 10, phase: 'lobby', v: PROTOCOL_VERSION };

/** A connection that records what it was sent and whether it was hung up on (closing it tells its 'close' listeners, as PeerJS does); `open()` opens it. */
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
      if (c.closed) return;
      c.closed = true;
      for (const fn of handlers.close ?? []) fn();
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
  await flush();
  assert.deepEqual(asked, ['c'.repeat(22)]);
  assert.equal((c.sent[0] as { room: { owner?: string } }).room.owner, 'x'.repeat(86));
  // A probe without one (or with junk) is answered too, unsigned.
  const old = conn({ probe: true, challenge: '<junk>' });
  desk.answer(asConn(old));
  old.open();
  await flush();
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

test('pings are answered with the room (signed over their challenge) or null', async () => {
  const asked: (string | null)[] = [];
  const desk = new ProbeDesk(async (challenge) => (asked.push(challenge), room));
  const replies: (RoomInfo | null)[] = [];
  desk.answerPing('scanner', 'c'.repeat(22), (r) => replies.push(r));
  await flush();
  assert.deepEqual(asked, ['c'.repeat(22)]);
  assert.deepEqual(replies, [room]);
  const none: (RoomInfo | null)[] = [];
  new ProbeDesk(() => null).answerPing('scanner', null, (r) => none.push(r));
  assert.deepEqual(none, [null]);
});

test('pings have a share of their own, and any one sender a little of it, so a flood of them leaves probes that connect answered', () => {
  const desk = new ProbeDesk(() => room);
  let answered = 0;
  for (let i = 0; i < 5; i++) desk.answerPing('flood', null, () => answered++);
  assert.equal(answered, 3);
  for (let i = 0; i < 100; i++) desk.answerPing(`id${i}`, null, () => answered++);
  assert.equal(answered, 60);
  const c = conn({ probe: true });
  desk.answer(asConn(c));
  c.open();
  assert.equal(c.sent.length, 1);
});

test("a refused ping (a banned peer's) is told at once there's nothing, without asking the room", () => {
  let asked = 0;
  const desk = new ProbeDesk(() => (asked++, room));
  const replies: (RoomInfo | null)[] = [];
  desk.answerPing('banned', 'c'.repeat(22), (r) => replies.push(r), true);
  assert.deepEqual(replies, [null]);
  assert.equal(asked, 0);
});

test('a probe hung up on frees its place: on its own, once answered, or at the latest after a while', () => {
  const desk = new ProbeDesk(() => room);
  const first = Array.from({ length: 8 }, () => conn({ probe: true }));
  for (const c of first) desk.answer(asConn(c));
  const turned = conn({ probe: true });
  desk.answer(asConn(turned));
  turned.open();
  assert.deepEqual([turned.sent.length, turned.closed], [0, true], 'eight at once, and no more');
  // One hangs up: its place is free.
  first[0].close();
  const next = conn({ probe: true });
  desk.answer(asConn(next));
  next.open();
  assert.equal(next.sent.length, 1);
  // The rest are answered, then hung up on 2 s later; one that never opens, after 4 s.
  for (const c of first.slice(1, 7)) c.open();
  mock.timers.tick(2000);
  assert.ok(first.slice(1, 7).every((c) => c.closed) && !first[7].closed);
  mock.timers.tick(2000);
  assert.ok(first[7].closed);
  const all = Array.from({ length: 8 }, () => conn({ probe: true }));
  for (const c of all) desk.answer(asConn(c));
  for (const c of all) c.open();
  assert.ok(all.every((c) => c.sent.length === 1), 'every place free again');
});

test('past 60 probes in 10 seconds more are refused, until the 10 seconds have passed', () => {
  const desk = new ProbeDesk(() => room);
  const probe = () => {
    const c = conn({ probe: true });
    desk.answer(asConn(c));
    c.open();
    c.close();
    return c.sent.length === 1;
  };
  for (let i = 0; i < 60; i++) assert.ok(probe(), `probe ${i}`);
  assert.equal(probe(), false, 'the 61st');
  mock.timers.tick(9999);
  assert.equal(probe(), false);
  mock.timers.tick(1);
  assert.equal(probe(), true, 'the first of them 10 s ago');
});

test("pings past their share are answered again once it frees up, a sender's own share too", () => {
  const desk = new ProbeDesk(() => room);
  let answered = 0;
  for (let i = 0; i < 4; i++) desk.answerPing('flood', null, () => answered++);
  assert.equal(answered, 3);
  for (let i = 0; i < 70; i++) desk.answerPing(`id${i}`, null, () => answered++);
  assert.equal(answered, 60);
  mock.timers.tick(10_000);
  desk.answerPing('flood', null, () => answered++);
  desk.answerPing('someone', null, () => answered++);
  assert.equal(answered, 62);
});
