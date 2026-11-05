// The game's own matchmaking server (signal/worker.js), on Node with
// Cloudflare's parts faked: the PeerJS server's protocol as the game leans on
// it (OPEN, ID-TAKEN, messages passed on with their sender, EXPIRE for an id
// nobody holds, a ping carried as a CANDIDATE), its limits, and whom it answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALIVE_MS, Board, EXPIRE_MS, MAX_BURST, MAX_PEERS, MAX_TEXT, MAX_WAITING, answer } from '../signal/worker.js';

/** A socket that keeps what it's told, and whether it was closed. */
class Sock {
  said: Record<string, unknown>[] = [];
  closed = false;
  send(text: string) {
    if (this.closed) throw new Error('closed');
    this.said.push(JSON.parse(text));
  }
  close() {
    this.closed = true;
  }
  types() {
    return this.said.map((m) => m.type);
  }
}

const T = 1_000_000;
const offer = (dst: string, payload: unknown = { sdp: 'x', connectionId: 'dc_1' }) => JSON.stringify({ type: 'OFFER', dst, payload });

test('a peer is told OPEN, and its id is taken while it holds it', () => {
  const b = new Board();
  const host = new Sock();
  assert.equal(b.join(host, 'room', 't1', T), true);
  assert.deepEqual(host.said, [{ type: 'OPEN' }]);
  const other = new Sock();
  assert.equal(b.join(other, 'room', 't2', T + 1000), false);
  assert.deepEqual(other.said, [{ type: 'ID-TAKEN', payload: { msg: 'ID is taken' } }]);
  assert.equal(other.closed, true);
  assert.equal(host.closed, false);
});

test("the same token takes its id back from the page's old socket, told OPEN again", () => {
  const b = new Board();
  const old = new Sock();
  b.join(old, 'room', 't1', T);
  const again = new Sock();
  assert.equal(b.join(again, 'room', 't1', T + 1000), true);
  assert.equal(old.closed, true);
  assert.deepEqual(again.types(), ['OPEN']);
  // The old socket's close, heard after, leaves the id with the new one.
  b.left(old);
  const guest = new Sock();
  b.join(guest, 'guest', 'g', T + 2000);
  b.heard(guest, offer('room'), T + 2000);
  assert.deepEqual(again.said.at(-1), { type: 'OFFER', src: 'guest', dst: 'room', payload: { sdp: 'x', connectionId: 'dc_1' } });
});

test('a closed socket frees its id at once', () => {
  const b = new Board();
  const a = new Sock();
  b.join(a, 'room', 't1', T);
  b.left(a);
  const next = new Sock();
  assert.equal(b.join(next, 'room', 't2', T + 10), true);
});

test('messages go to their dst with the sender as src, whatever src they claim', () => {
  const b = new Board();
  const host = new Sock();
  const guest = new Sock();
  b.join(host, 'room', 'h', T);
  b.join(guest, 'g1', 'g', T);
  b.heard(guest, JSON.stringify({ type: 'OFFER', src: 'someone-else', dst: 'room', payload: { a: 1 } }), T);
  b.heard(host, JSON.stringify({ type: 'ANSWER', dst: 'g1', payload: { b: 2 } }), T);
  assert.deepEqual(host.said.at(-1), { type: 'OFFER', src: 'g1', dst: 'room', payload: { a: 1 } });
  assert.deepEqual(guest.said.at(-1), { type: 'ANSWER', src: 'room', dst: 'g1', payload: { b: 2 } });
});

test("a ping, sent as a CANDIDATE with the probe's own fields, reaches the room untouched (lib/probeDesk.ts)", async () => {
  const { ping, pingOf } = await import('../src/lib/probeDesk.ts');
  const b = new Board();
  const room = new Sock();
  const scanner = new Sock();
  b.join(room, 'pub-1', 'r', T);
  b.join(scanner, 'scan', 's', T);
  b.heard(scanner, JSON.stringify(ping('pub-1', 'dc_ping', 'challenge-123')), T);
  assert.deepEqual(pingOf(room.said.at(-1)), { src: 'scan', connectionId: 'dc_ping', challenge: null });
  assert.equal((room.said.at(-1)!.payload as { probe: string }).probe, 'challenge-123');
});

test('a message for an id nobody holds waits for it, and is handed over after OPEN', () => {
  const b = new Board();
  const guest = new Sock();
  b.join(guest, 'g1', 'g', T);
  b.heard(guest, offer('room'), T);
  b.heard(guest, JSON.stringify({ type: 'CANDIDATE', dst: 'room', payload: { c: 1 } }), T + 100);
  const host = new Sock();
  b.join(host, 'room', 'h', T + 2000);
  assert.deepEqual(host.types(), ['OPEN', 'OFFER', 'CANDIDATE']);
  b.expire(T + EXPIRE_MS + 1000);
  assert.deepEqual(guest.types(), ['OPEN']);
});

test('one that waited EXPIRE_MS tells each sender EXPIRE once, as the room not being there', () => {
  const b = new Board();
  const a = new Sock();
  const c = new Sock();
  b.join(a, 'a', 'a', T);
  b.join(c, 'c', 'c', T);
  b.heard(a, offer('gone'), T);
  b.heard(a, JSON.stringify({ type: 'CANDIDATE', dst: 'gone', payload: {} }), T + 10);
  b.heard(c, offer('gone'), T + 3000);
  b.expire(T + EXPIRE_MS - 1);
  assert.deepEqual(a.types(), ['OPEN']);
  b.expire(T + EXPIRE_MS);
  assert.deepEqual(a.said.slice(1), [{ type: 'EXPIRE', src: 'gone', dst: 'a' }]);
  assert.deepEqual(c.said.slice(1), [{ type: 'EXPIRE', src: 'gone', dst: 'c' }]);
  // Let go: the id taken later gets none of it.
  const late = new Sock();
  b.join(late, 'gone', 'l', T + EXPIRE_MS + 10);
  assert.deepEqual(late.types(), ['OPEN']);
});

test('a goodbye to an id nobody holds goes nowhere, and nobody is told EXPIRE for it', () => {
  const b = new Board();
  const a = new Sock();
  b.join(a, 'a', 'a', T);
  b.heard(a, JSON.stringify({ type: 'LEAVE', dst: 'gone' }), T);
  b.heard(a, JSON.stringify({ type: 'EXPIRE', dst: 'gone' }), T);
  b.expire(T + EXPIRE_MS);
  assert.deepEqual(a.types(), ['OPEN']);
  assert.equal(b.waiting.size, 0);
});

test('heartbeats keep a socket; one silent for ALIVE_MS is dropped and its id freed', () => {
  const b = new Board();
  const kept = new Sock();
  const silent = new Sock();
  b.join(kept, 'kept', 'k', T);
  b.join(silent, 'silent', 's', T);
  b.heard(kept, JSON.stringify({ type: 'HEARTBEAT' }), T + ALIVE_MS - 1000);
  b.sweep(T + ALIVE_MS);
  assert.equal(silent.closed, true);
  assert.equal(kept.closed, false);
  assert.deepEqual(kept.types(), ['OPEN']);
  assert.equal(b.join(new Sock(), 'silent', 'other', T + ALIVE_MS + 1), true);
});

test('an id held by a socket silent for ALIVE_MS goes to whoever asks next, even before a sweep', () => {
  const b = new Board();
  const dead = new Sock();
  b.join(dead, 'room', 't1', T);
  const reload = new Sock();
  assert.equal(b.join(reload, 'room', 't2', T + ALIVE_MS), true);
  assert.equal(dead.closed, true);
});

test('unknown types are ignored; junk and floods cut the sender off, told why', () => {
  const b = new Board();
  const host = new Sock();
  const a = new Sock();
  b.join(host, 'room', 'h', T);
  b.join(a, 'a', 'a', T);
  b.heard(a, JSON.stringify({ type: 'WHATEVER', dst: 'room' }), T);
  assert.deepEqual(host.types(), ['OPEN']);
  assert.equal(a.closed, false);
  b.heard(a, 'not json', T);
  assert.equal(a.closed, true);
  assert.equal(a.said.at(-1)!.type, 'ERROR');

  const long = new Sock();
  b.join(long, 'long', 'l', T);
  b.heard(long, offer('room', 'x'.repeat(MAX_TEXT)), T);
  assert.equal(long.closed, true);

  const flood = new Sock();
  b.join(flood, 'flood', 'f', T);
  for (let i = 0; i < MAX_BURST; i++) b.heard(flood, JSON.stringify({ type: 'HEARTBEAT' }), T + i);
  assert.equal(flood.closed, false);
  b.heard(flood, JSON.stringify({ type: 'HEARTBEAT' }), T + MAX_BURST);
  assert.equal(flood.closed, true);
  assert.deepEqual(flood.said.at(-1), { type: 'ERROR', payload: { msg: 'Too many messages' } });
  // Its id is free again.
  assert.equal(b.join(new Sock(), 'flood', 'other', T + MAX_BURST + 1), true);
});

test('what waits for an id is kept to MAX_WAITING', () => {
  const b = new Board();
  const a = new Sock();
  b.join(a, 'a', 'a', T);
  for (let i = 0; i < MAX_WAITING + 20; i++) b.heard(a, offer('gone'), T + i * 40);
  assert.equal(b.waiting.get('gone')!.messages.length, MAX_WAITING);
  b.expire(T + 60_000);
  assert.equal(b.waitingAll, 0);
});

test('past MAX_PEERS a newcomer is refused, as the PeerJS server says it', () => {
  const b = new Board();
  for (let i = 0; i < MAX_PEERS; i++) b.join(new Sock(), `p${i}`, 't', T);
  const late = new Sock();
  assert.equal(b.join(late, 'late', 't', T), false);
  assert.deepEqual(late.said, [{ type: 'ERROR', payload: { msg: 'Server has reached its concurrent user limit' } }]);
});

/** The Worker's bindings: a rate limit allowing `allowed` asks, and the Object, which keeps what reaches it. */
function env(allowed = Infinity) {
  const reached: { request: Request; hint?: string }[] = [];
  const keys: string[] = [];
  return {
    reached,
    keys,
    PER_ADDRESS: { limit: async ({ key }: { key: string }) => (keys.push(key), { success: keys.length <= allowed }) },
    SIGNAL: {
      idFromName: (name: string) => name,
      get: (_id: unknown, o?: { locationHint?: string }) => ({
        fetch: async (request: Request) => (reached.push({ request, hint: o?.locationHint }), new Response('object')),
      }),
    },
  };
}
const socket = (query: string, origin = 'https://poe2.quest') =>
  new Request(`https://poe2-signal.example.workers.dev/peerjs?${query}`, { headers: { Origin: origin, Upgrade: 'websocket', 'CF-Connecting-IP': '203.0.113.9' } });

test("only the game's own pages are answered", async () => {
  for (const origin of ['https://example.com', '', 'https://poe2.quest.evil.com', 'http://poe2.quest']) {
    const e = env();
    const r = await answer(socket('key=peerjs&id=room&token=t', origin), e);
    assert.equal(r.status, 403, origin);
    assert.equal(e.reached.length, 0);
  }
  for (const origin of ['https://poe2.quest', 'http://localhost:5173', 'http://192.168.1.20:5173', 'http://host.localhost:5173']) {
    const e = env();
    const r = await answer(socket('key=peerjs&id=room&token=t', origin), e);
    assert.equal(await r.text(), 'object', origin);
  }
});

test('a socket goes to the one Object, in western Europe, only with what PeerJS sends', async () => {
  const e = env();
  await answer(socket('key=peerjs&id=poe2q-v5-ABC123&token=abc&version=1.5.5'), e);
  assert.equal(e.reached.length, 1);
  assert.equal(e.reached[0].hint, 'weur');
  assert.deepEqual(e.keys, ['203.0.113.9']);
  for (const q of ['key=other&id=room&token=t', 'key=peerjs&token=t', 'key=peerjs&id=room', 'key=peerjs&id=bad%20%20id&token=t', `key=peerjs&id=${'a'.repeat(300)}&token=t`]) {
    const r = await answer(socket(q), e);
    assert.equal(r.status, 400, q);
  }
  assert.equal(e.reached.length, 1);
});

test('a peer made without an id is given a fresh one, readable by the page', async () => {
  const r = await answer(new Request('https://x.workers.dev/peerjs/id?ts=1&version=1.5.5', { headers: { Origin: 'https://poe2.quest' } }), env());
  assert.equal(r.status, 200);
  assert.match(await r.text(), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://poe2.quest');
});

test('an address past its share is told to wait; anything else is not found', async () => {
  const e = env(1);
  assert.equal((await answer(socket('key=peerjs&id=room&token=t'), e)).status, 200);
  const r = await answer(socket('key=peerjs&id=room&token=t'), e);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('Retry-After'), '60');
  assert.equal((await answer(new Request('https://x.workers.dev/peerjs/peers', { headers: { Origin: 'https://poe2.quest' } }), env())).status, 404);
  assert.equal((await answer(new Request('https://x.workers.dev/peerjs', { headers: { Origin: 'https://poe2.quest' } }), env())).status, 404);
});
