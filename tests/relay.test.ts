import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRelay, Relay } from '../src/lib/relay.ts';

const login = { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' };
const HOUR = 3_600_000;

test("the Worker's answer: STUN and TURN servers with their login, and how long it lasts", () => {
  assert.deepEqual(parseRelay({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, login], ttl: 86400 }), {
    iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }, login],
    ttl: 86400,
  });
});

test('a login is taken to last two days at most', () => {
  assert.equal(parseRelay({ iceServers: [login], ttl: 1e12 })?.ttl, 48 * 3600);
});

test('an answer that is anything else gives no relay', () => {
  for (const raw of [
    null,
    'x',
    { iceServers: [login] },
    { iceServers: [login], ttl: 0 },
    { iceServers: 'turn:x', ttl: 60 },
    { iceServers: [{ urls: [] }], ttl: 60 },
    { iceServers: [{ urls: 'https://example.com' }], ttl: 60 },
    { iceServers: [{ ...login, credential: 7 }], ttl: 60 },
    { iceServers: [null], ttl: 60 },
    { iceServers: [], ttl: 60 },
    // What a browser turns down, making every connection throw: a TURN server without its login, a STUN one with a query, a URL with a slash or another query.
    { iceServers: [{ urls: login.urls }], ttl: 60 },
    { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478?transport=udp' }], ttl: 60 },
    { iceServers: [{ ...login, urls: ['turn://turn.cloudflare.com:3478'] }], ttl: 60 },
    { iceServers: [{ ...login, urls: ['turn:turn.cloudflare.com:3478?transport=udp&x=1'] }], ttl: 60 },
    { iceServers: [{ ...login, credential: 'c'.repeat(510) }], ttl: 60 },
  ])
    assert.equal(parseRelay(raw), null, JSON.stringify(raw));
});

/** A Worker that answers each fetch with the next of `answers` (a Response's body, or an error to throw). */
function worker(...answers: unknown[]) {
  const calls: string[] = [];
  const get = (async (url: string) => {
    calls.push(url);
    const a = answers.shift();
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a), { status: a === undefined ? 502 : 200 });
  }) as typeof fetch;
  return { calls, get };
}

test('without a URL there is no relay and nothing is fetched', async () => {
  const w = worker();
  const r = new Relay('', w.get);
  assert.equal(r.due(), false);
  await r.load();
  assert.deepEqual(r.iceServers(), []);
  assert.equal(w.calls.length, 0);
});

test('a login is fetched once, then held until it runs low, and given until it runs out', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const w = worker({ iceServers: [login], ttl: 24 * 3600 }, { iceServers: [{ ...login, username: 'v' }], ttl: 24 * 3600 });
  const r = new Relay('https://relay.test/', w.get);
  assert.equal(r.due(), true);
  await r.load();
  assert.deepEqual(r.iceServers(), [login]);
  assert.equal(r.due(), false);
  await r.load();
  assert.equal(w.calls.length, 1);
  // Half a day left: still given, and fetched anew, but no peer waits for it.
  t.mock.timers.tick(12 * HOUR);
  assert.deepEqual(r.iceServers(), [login]);
  assert.equal(r.due(), true);
  assert.equal(r.wanted(), false);
  t.mock.timers.tick(12 * HOUR);
  assert.deepEqual(r.iceServers(), []);
  await r.load();
  assert.equal(w.calls.length, 2);
  assert.equal(r.iceServers()[0].username, 'v');
});

test('a login that could not be had is tried again after a while, not on every peer', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const w = worker(new Error('offline'), { iceServers: 'nonsense', ttl: 60 }, { iceServers: [login], ttl: 3600 });
  const r = new Relay('https://relay.test/', w.get);
  await r.load();
  assert.deepEqual(r.iceServers(), []);
  assert.equal(r.due(), false);
  await r.load();
  assert.equal(w.calls.length, 1);
  t.mock.timers.tick(30_000);
  await r.load();
  assert.equal(w.calls.length, 2);
  assert.deepEqual(r.iceServers(), []);
  t.mock.timers.tick(30_000);
  await r.load();
  assert.deepEqual(r.iceServers(), [login]);
});

test('a short login is fetched anew halfway through, not straight away', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const w = worker({ iceServers: [login], ttl: 3600 }, { iceServers: [login], ttl: 3600 });
  const r = new Relay('https://relay.test/', w.get);
  await r.load();
  assert.equal(r.due(), false);
  assert.equal(r.wanted(), false);
  t.mock.timers.tick(HOUR / 2 - 1);
  assert.equal(r.due(), false);
  t.mock.timers.tick(1);
  assert.equal(r.due(), true);
});

test('a slow login is waited for 3 s from when it was asked, by everyone together, then not at all', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  try {
    let answer!: (r: Response) => void;
    const get = (() => new Promise<Response>((r) => (answer = r))) as typeof fetch;
    const r = new Relay('https://relay.test/', get);
    let first = false;
    let second = false;
    const a = r.load().then(() => (first = true));
    // Nothing held and one on the way: the next peer waits too.
    assert.equal(r.wanted(), true);
    mock.timers.tick(2000);
    const b = r.load().then(() => (second = true));
    mock.timers.tick(999);
    await Promise.resolve();
    assert.equal(first || second, false);
    mock.timers.tick(1);
    await Promise.all([a, b]);
    assert.deepEqual(r.iceServers(), []);
    // Its wait over: the next peer is made at once, and no second fetch goes out.
    assert.equal(r.wanted(), false);
    assert.equal(r.due(), false);
    let third = false;
    await r.load().then(() => (third = true));
    assert.equal(third, true);
    answer(new Response(JSON.stringify({ iceServers: [login], ttl: 3600 })));
    await new Promise((done) => setImmediate(done));
    assert.deepEqual(r.iceServers(), [login]);
  } finally {
    mock.timers.reset();
  }
});

test('a login running low is asked for anew without waiting, once, by whatever reads the servers', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const w = worker({ iceServers: [login], ttl: 3600 }, { iceServers: [{ ...login, username: 'v' }], ttl: 3600 });
  const r = new Relay('https://relay.test/', w.get);
  await r.load();
  t.mock.timers.tick(HOUR / 2);
  r.start();
  r.start();
  assert.equal(w.calls.length, 2);
  assert.deepEqual(r.iceServers(), [login]);
  await new Promise((done) => setImmediate(done));
  assert.equal(r.iceServers()[0].username, 'v');
});

test('a Worker that says when to ask again is believed, up to a day', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  let wait = '3600';
  const calls: number[] = [];
  const get = (async () => {
    calls.push(Date.now());
    return new Response(null, { status: 503, headers: { 'Retry-After': wait } });
  }) as typeof fetch;
  const r = new Relay('https://relay.test/', get);
  await r.load();
  t.mock.timers.tick(HOUR - 1);
  assert.equal(r.due(), false);
  t.mock.timers.tick(1);
  assert.equal(r.due(), true);
  wait = String(30 * 24 * 3600);
  await r.load();
  t.mock.timers.tick(24 * HOUR - 1);
  assert.equal(r.due(), false);
  t.mock.timers.tick(1);
  assert.equal(r.due(), true);
  assert.equal(calls.length, 2);
});
