// The game's own matchmaking server (signal/worker.js), on Node with
// Cloudflare's parts faked: the PeerJS server's protocol as the game leans on
// it (OPEN, ID-TAKEN, messages passed on with their sender, EXPIRE for an id
// nobody holds, a ping carried as a CANDIDATE), its limits, and whom it answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADDRESS_HEADER,
  ALIVE_MS,
  Board,
  EXPIRE_MS,
  HEARTBEAT,
  MAX_BURST,
  MAX_FLOOD,
  MAX_PEERS,
  MAX_PER_ADDRESS,
  MAX_TEXT,
  MAX_WAITING,
  MAX_WAITING_ALL,
  MAX_WAITING_CHARS,
  MAX_WAITING_FROM,
  RESERVE_MS,
  Signal,
  addressKey,
  answer,
} from '../signal/worker.js';

/** A socket that keeps what it's told, whether it was closed, and its attachment. */
class Sock {
  said: Record<string, unknown>[] = [];
  closed = false;
  readyState = 1;
  attachment: unknown = null;
  send(text: string) {
    if (this.closed) throw new Error('closed');
    this.said.push(JSON.parse(text));
  }
  close() {
    this.closed = true;
  }
  serializeAttachment(value: unknown) {
    this.attachment = value;
  }
  deserializeAttachment() {
    return this.attachment;
  }
  types() {
    return this.said.map((m) => m.type);
  }
}

/** The Object on a fake state holding `sockets`, its timers stopped once `use` is done. */
function withSignal(sockets: Sock[], use: (o: Signal) => void) {
  const o = new Signal({ acceptWebSocket() {}, getWebSockets: () => sockets });
  try {
    use(o);
  } finally {
    clearTimeout(o.sweeping ?? undefined);
    clearTimeout(o.expiring ?? undefined);
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
  // The old socket's close, heard after, leaves the id with the new one, and keeps nothing.
  b.left(old, T + 1500, false);
  assert.equal(b.reserved.size, 0);
  const guest = new Sock();
  b.join(guest, 'guest', 'g', T + 2000);
  b.heard(guest, offer('room'), T + 2000);
  assert.deepEqual(again.said.at(-1), { type: 'OFFER', src: 'guest', dst: 'room', payload: { sdp: 'x', connectionId: 'dc_1' } });
});

test('a socket the page closed frees its id at once', () => {
  const b = new Board();
  const a = new Sock();
  b.join(a, 'room', 't1', T);
  b.left(a, T, true);
  const next = new Sock();
  assert.equal(b.join(next, 'room', 't2', T + 10), true);
});

test("a lost socket's id is kept for its token RESERVE_MS: another is told ID-TAKEN, the page itself takes it back", () => {
  const b = new Board();
  const host = new Sock();
  b.join(host, 'room', 'h', T);
  b.left(host, T, false);
  const stranger = new Sock();
  assert.equal(b.join(stranger, 'room', 's', T + RESERVE_MS - 1), false);
  assert.deepEqual(stranger.said, [{ type: 'ID-TAKEN', payload: { msg: 'ID is taken' } }]);
  const back = new Sock();
  assert.equal(b.join(back, 'room', 'h', T + 1000), true);
  assert.deepEqual(back.types(), ['OPEN']);
  assert.equal(b.reserved.size, 0);
  // Let go cleanly by the page, it's free at once.
  b.left(back, T + 2000, true);
  assert.equal(b.join(new Sock(), 'room', 's', T + 2001), true);
});

test('a kept id is free once RESERVE_MS is up, and the sweep lets the keeping go', () => {
  const b = new Board();
  const a = new Sock();
  const c = new Sock();
  b.join(a, 'a', 'a', T);
  b.join(c, 'c', 'c', T);
  b.left(a, T, false);
  b.left(c, T, false);
  assert.equal(b.reserved.size, 2);
  assert.equal(b.join(new Sock(), 'a', 'other', T + RESERVE_MS), true);
  b.sweep(T + RESERVE_MS);
  assert.equal(b.reserved.size, 0);
});

test('a socket cut off, or swept as silent, keeps its id a while as a lost one', () => {
  const b = new Board();
  const junk = new Sock();
  b.join(junk, 'junk', 'j', T);
  b.heard(junk, 'not json', T);
  assert.equal(junk.closed, true);
  assert.equal(b.join(new Sock(), 'junk', 'other', T + 10), false);
  assert.equal(b.join(new Sock(), 'junk', 'j', T + 20), true);

  const silent = new Sock();
  b.join(silent, 'silent', 's', T);
  b.sweep(T + ALIVE_MS);
  assert.equal(silent.closed, true);
  assert.equal(b.join(new Sock(), 'silent', 'other', T + ALIVE_MS + 1), false);
  assert.equal(b.join(new Sock(), 'silent', 'other', T + ALIVE_MS + RESERVE_MS), true);
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

test('what waits is kept as the text to send, handed over as is, and its size counted', () => {
  const b = new Board();
  const a = new Sock();
  b.join(a, 'a', 'a', T);
  const payload = [{}, {}, { x: 'é' }];
  b.heard(a, offer('room', payload), T);
  const kept = b.waiting.get('room')!.messages[0];
  // (Its sender's share by its id, as it came from no address.)
  assert.deepEqual(kept, { src: 'a', text: JSON.stringify({ type: 'OFFER', src: 'a', dst: 'room', payload }), from: 'a' });
  assert.equal(b.waitingChars, kept.text.length);
  assert.equal(b.waitingFrom.get('a'), kept.text.length);
  const host = new Sock();
  b.join(host, 'room', 'h', T + 100);
  assert.deepEqual(host.said.at(-1), { type: 'OFFER', src: 'a', dst: 'room', payload });
  assert.equal(b.waitingChars, 0);
  assert.equal(b.waitingAll, 0);
  assert.equal(b.waitingFrom.size, 0);
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
  assert.equal(b.waitingChars, 0);
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

test('heartbeats keep a socket; one silent for ALIVE_MS is dropped', () => {
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
  assert.equal(b.peers.has('silent'), false);
});

test('an id held by a socket silent for ALIVE_MS is lost even before a sweep: kept for its token from then, then free', () => {
  const b = new Board();
  const dead = new Sock();
  b.join(dead, 'room', 't1', T);
  assert.equal(b.join(new Sock(), 'room', 't2', T + ALIVE_MS), false);
  assert.equal(dead.closed, true);
  assert.equal(b.join(new Sock(), 'room', 't1', T + ALIVE_MS + 10), true);
  // Found long after its time was up: its page may not know yet, so kept from when it's found.
  const later = new Board();
  later.join(new Sock(), 'room', 't1', T);
  const found = T + ALIVE_MS + RESERVE_MS;
  assert.equal(later.join(new Sock(), 'room', 't2', found), false);
  assert.equal(later.join(new Sock(), 'room', 't2', found + RESERVE_MS), true);
});

test("a socket swept late (the sweep runs every 15 s) keeps its id RESERVE_MS from the sweep, not from when it fell silent", () => {
  const b = new Board();
  b.join(new Sock(), 'room', 't1', T);
  const swept = T + ALIVE_MS + 14_000;
  b.sweep(swept);
  assert.equal(b.join(new Sock(), 'room', 'stranger', swept + RESERVE_MS - 1000), false);
  assert.equal(b.join(new Sock(), 'room', 't1', swept + RESERVE_MS - 500), true);
});

test("a heartbeat Cloudflare echoed (which never reaches the board) keeps a socket as one heard", () => {
  const b = new Board();
  const beating = new Sock();
  const silent = new Sock();
  b.join(beating, 'beating', 'b', T);
  b.join(silent, 'silent', 's', T);
  b.echoed = (ws) => (ws === beating ? T + ALIVE_MS - 1000 : 0);
  b.sweep(T + ALIVE_MS);
  assert.equal(beating.closed, false);
  assert.equal(silent.closed, true);
  assert.equal(b.join(new Sock(), 'beating', 'stranger', T + ALIVE_MS), false, 'not taken as stale on a join either');
});

test("the Object has Cloudflare echo PeerJS's heartbeat, and reads when it last did", () => {
  const g = globalThis as { WebSocketRequestResponsePair?: unknown };
  g.WebSocketRequestResponsePair = class {
    request: string;
    response: string;
    constructor(request: string, response: string) {
      this.request = request;
      this.response = response;
    }
  };
  try {
    const got: { pair?: { request: string; response: string } } = {};
    const sock = new Sock();
    const o = new Signal({
      acceptWebSocket() {},
      getWebSockets: () => [],
      setWebSocketAutoResponse: (p: never) => void (got.pair = p),
      getWebSocketAutoResponseTimestamp: (ws: unknown) => (ws === sock ? new Date(T + 5) : null),
    });
    assert.deepEqual(got.pair && [got.pair.request, got.pair.response], [HEARTBEAT, HEARTBEAT]);
    assert.equal(HEARTBEAT, JSON.stringify({ type: 'HEARTBEAT' }), "as PeerJS's socket sends it");
    assert.equal(o.board.echoed(sock), T + 5);
    assert.equal(o.board.echoed(new Sock()), 0);
  } finally {
    delete g.WebSocketRequestResponsePair;
  }
});

test('unknown types are ignored; past MAX_BURST messages are let go; junk and floods cut the sender off, its connections kept', () => {
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
  // Hung up on without a server-error, which PeerJS would destroy the peer for, games and all.
  assert.ok(!a.said.some((m) => m.type === 'ERROR'));

  const long = new Sock();
  b.join(long, 'long', 'l', T);
  b.heard(long, offer('room', 'x'.repeat(MAX_TEXT)), T);
  assert.equal(long.closed, true);

  const busy = new Sock();
  b.join(busy, 'busy', 'b', T);
  const before = host.said.length;
  for (let i = 0; i < MAX_BURST + 10; i++) b.heard(busy, offer('room', `o${i}`), T + i);
  assert.equal(host.said.length - before, MAX_BURST, 'the rest let go');
  assert.equal(busy.closed, false);
  // A new while, and it's passed on again.
  b.heard(busy, offer('room', 'later'), T + 10_000);
  assert.equal(host.said.length - before, MAX_BURST + 1);

  const flood = new Sock();
  b.join(flood, 'flood', 'f', T);
  for (let i = 0; i < MAX_FLOOD; i++) b.heard(flood, JSON.stringify({ type: 'HEARTBEAT' }), T + i);
  assert.equal(flood.closed, false);
  b.heard(flood, JSON.stringify({ type: 'HEARTBEAT' }), T + MAX_FLOOD);
  assert.equal(flood.closed, true);
  assert.ok(!flood.said.some((m) => m.type === 'ERROR'));
  // Its id is kept a while for its page, as a lost one's.
  assert.equal(b.join(new Sock(), 'flood', 'other', T + MAX_FLOOD + 1), false);
  assert.equal(b.join(new Sock(), 'flood', 'f', T + MAX_FLOOD + 2), true);
});

test('a flood is 600 messages in 10 s, well past a burst', () => {
  assert.equal(MAX_FLOOD, 600);
  assert.equal(MAX_BURST, 300);
});

test('what waits for an id is kept to MAX_WAITING; one past it is answered EXPIRE at once', () => {
  const b = new Board();
  const a = new Sock();
  b.join(a, 'a', 'a', T);
  for (let i = 0; i < MAX_WAITING; i++) b.heard(a, offer('gone'), T + i * 40);
  assert.deepEqual(a.types(), ['OPEN']);
  b.heard(a, offer('gone'), T + 4500);
  assert.deepEqual(a.said.slice(1), [{ type: 'EXPIRE', src: 'gone', dst: 'a' }]);
  assert.equal(b.waiting.get('gone')!.messages.length, MAX_WAITING);
  b.expire(T + 60_000);
  assert.equal(b.waitingAll, 0);
  assert.equal(b.waitingChars, 0);
  // Told once more, for the ones that waited.
  assert.deepEqual(a.types(), ['OPEN', 'EXPIRE', 'EXPIRE']);
});

test('past MAX_WAITING_CHARS waiting, a message is answered EXPIRE at once instead of kept', () => {
  const b = new Board();
  const big = 'x'.repeat(MAX_TEXT - 200);
  const n = Math.ceil(MAX_WAITING_CHARS / big.length) + 5;
  const answered: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = new Sock();
    b.join(s, `s${i}`, 't', T);
    b.heard(s, offer(`gone${i}`, big), T);
    if (s.types().includes('EXPIRE')) {
      assert.deepEqual(s.said.at(-1), { type: 'EXPIRE', src: `gone${i}`, dst: `s${i}` });
      answered.push(i);
    }
  }
  assert.ok(b.waitingChars <= MAX_WAITING_CHARS);
  assert.ok(answered.length >= 5);
  assert.equal(b.waiting.size, n - answered.length);
});

test("one address can't fill what waits for everyone: past MAX_WAITING_FROM its own are answered EXPIRE, another's still wait", () => {
  const b = new Board();
  const big = 'x'.repeat(MAX_TEXT - 200);
  const flood = Array.from({ length: 8 }, (_, i) => {
    const s = new Sock();
    b.join(s, `f${i}`, 't', T, '203.0.113.9');
    return s;
  });
  let expired = 0;
  for (let i = 0; i < 40; i++) {
    const s = flood[i % flood.length];
    const before = s.said.length;
    b.heard(s, offer(`gone${i}`, big), T + i);
    if (s.said.length > before) expired++;
  }
  assert.ok(b.waitingChars <= MAX_WAITING_FROM, 'the address kept to its share');
  assert.ok(expired >= 35);
  const guest = new Sock();
  b.join(guest, 'guest', 'g', T, '198.51.100.7');
  b.heard(guest, offer('host'), T + 50);
  assert.deepEqual(guest.types(), ['OPEN'], "another address's offer waits");
  assert.equal(b.waiting.get('host')?.messages.length, 1);
  // Its share is back once what it had waiting is gone.
  b.expire(T + EXPIRE_MS + 100);
  assert.equal(b.waitingChars, 0);
  assert.equal(b.waitingFrom.size, 0);
});

test('past MAX_WAITING_ALL waiting, a message is answered EXPIRE at once instead of kept', () => {
  const b = new Board();
  const a = new Sock();
  b.join(a, 'a', 'a', T);
  // Spread over sockets, so none is past its burst.
  for (let i = 0; b.waitingAll < MAX_WAITING_ALL; i++) {
    const s = new Sock();
    b.join(s, `s${i}`, 't', T);
    for (let j = 0; j < MAX_WAITING && b.waitingAll < MAX_WAITING_ALL; j++) b.heard(s, JSON.stringify({ type: 'CANDIDATE', dst: `gone${i}`, payload: {} }), T);
  }
  b.heard(a, offer('another'), T);
  assert.deepEqual(a.said.slice(1), [{ type: 'EXPIRE', src: 'another', dst: 'a' }]);
  assert.equal(b.waiting.has('another'), false);
});

test('past MAX_PEERS a newcomer is refused, as the PeerJS server says it', () => {
  const b = new Board();
  for (let i = 0; i < MAX_PEERS; i++) b.join(new Sock(), `p${i}`, 't', T);
  const late = new Sock();
  assert.equal(b.join(late, 'late', 't', T), false);
  assert.deepEqual(late.said, [{ type: 'ERROR', payload: { msg: 'Server has reached its concurrent user limit' } }]);
});

test('past MAX_PER_ADDRESS live sockets an address is refused; one gone makes room, and others are not held up', () => {
  const b = new Board();
  const socks: Sock[] = [];
  for (let i = 0; i < MAX_PER_ADDRESS; i++) {
    const s = new Sock();
    assert.equal(b.join(s, `p${i}`, 't', T, '198.51.100.7'), true);
    socks.push(s);
  }
  const late = new Sock();
  assert.equal(b.join(late, 'late', 't', T, '198.51.100.7'), false);
  assert.deepEqual(late.said, [{ type: 'ERROR', payload: { msg: 'Too many connections from this address' } }]);
  assert.equal(late.closed, true);
  assert.equal(b.join(new Sock(), 'elsewhere', 't', T, '198.51.100.8'), true);
  // A page's reconnect moves its id without counting twice.
  assert.equal(b.join(new Sock(), 'p0', 't', T + 10, '198.51.100.7'), true);
  assert.equal(b.perAddress.get('198.51.100.7'), MAX_PER_ADDRESS);
  b.left(socks[1], T + 20, true);
  b.heard(socks[2], 'not json', T + 20);
  assert.equal(b.perAddress.get('198.51.100.7'), MAX_PER_ADDRESS - 2);
  assert.equal(b.join(new Sock(), 'late', 't', T + 30, '198.51.100.7'), true);
});

test('a socket hung up on has its attachment cleared, and the Object takes back only open sockets with one', () => {
  const b = new Board();
  const a = new Sock();
  a.attachment = { id: 'a', token: 'a', address: 'x' };
  b.join(a, 'a', 'a', T, 'x');
  b.heard(a, 'not json', T);
  assert.equal(a.attachment, null);

  const open = new Sock();
  open.attachment = { id: 'host', token: 'h', address: '203.0.113.9' };
  const closing = new Sock();
  closing.attachment = { id: 'dead', token: 'd' };
  closing.readyState = 2;
  withSignal([open, closing, new Sock()], (o) => {
    assert.deepEqual([...o.board.peers.keys()], ['host']);
    assert.equal(o.board.perAddress.get('203.0.113.9'), 1);
  });
});

test("the Object hears a page's close as letting go, and a dropped connection or an error as lost", () => {
  withSignal([], (o) => {
    // By the code alone (what the page sent as it let go), not Cloudflare's wasClean.
    for (const [code, kept] of [
      [1000, false],
      [1001, false],
      [1005, false],
      [1006, true],
      [1011, true],
    ] as const) {
      const s = new Sock();
      o.board.join(s, 'room', 'h', Date.now());
      o.webSocketClose(s, code);
      assert.equal(o.board.reserved.has('room'), kept, `${code}`);
      o.board.reserved.clear();
    }
    const s = new Sock();
    o.board.join(s, 'room', 'h', Date.now());
    o.webSocketError(s);
    assert.equal(o.board.reserved.has('room'), true);
  });
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
    // (The buckets aren't met here: tests/backup.test.ts.)
    KEEP: { idFromName: (name: string) => name, get: () => ({ fetch: async () => new Response(null, { status: 500 }) }) },
    KEEP_WRITES: { limit: async () => ({ success: true }) },
  };
}
const socket = (query: string, origin = 'https://poe2.quest', more: Record<string, string> = {}) =>
  new Request(`https://poe2-signal.example.workers.dev/peerjs?${query}`, { headers: { Origin: origin, Upgrade: 'websocket', 'CF-Connecting-IP': '203.0.113.9', ...more } });

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
  assert.equal(e.reached[0].request.headers.get(ADDRESS_HEADER), '203.0.113.9');
  assert.equal(new URL(e.reached[0].request.url).searchParams.get('id'), 'poe2q-v5-ABC123');
  for (const q of ['key=other&id=room&token=t', 'key=peerjs&token=t', 'key=peerjs&id=room', 'key=peerjs&id=bad%20%20id&token=t', `key=peerjs&id=${'a'.repeat(300)}&token=t`]) {
    const r = await answer(socket(q), e);
    assert.equal(r.status, 400, q);
  }
  assert.equal(e.reached.length, 1);
});

test("the address key the Object is handed is the Worker's, never one the page sent", async () => {
  const e = env();
  await answer(socket('key=peerjs&id=room&token=t', 'https://poe2.quest', { 'CF-Connecting-IP': '2001:db8:1:2ff::9', [ADDRESS_HEADER]: 'someone-else' }), e);
  assert.equal(e.reached[0].request.headers.get(ADDRESS_HEADER), '2001:db8:1:200::/56');
});

test('an address key is an IPv4 address, or an IPv6 one’s /56', () => {
  assert.equal(addressKey('203.0.113.7'), '203.0.113.7');
  assert.equal(addressKey('2001:DB8:0000:0001:aaaa:bbbb:cccc:dddd'), '2001:db8:0:0::/56');
  assert.equal(addressKey('2001:db8:0:12ab::1'), '2001:db8:0:1200::/56');
  assert.equal(addressKey('2001:db8:0:12cd::1'), '2001:db8:0:1200::/56');
  assert.equal(addressKey('2001:db8::1'), '2001:db8:0:0::/56');
  assert.equal(addressKey('::1'), '0:0:0:0::/56');
  assert.equal(addressKey('fe80::'), 'fe80:0:0:0::/56');
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
