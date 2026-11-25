// count.ts in a browser at the live game's address (globals set before it
// loads, as `counting` is settled then): a load whose blocker keeps
// GoatCounter's address from it sends its counts through the matchmaking
// server instead, those it sent straight before it knew among them, and its
// visit says so ("visit/blocked"); a load that reaches GoatCounter sends
// straight, as before. What the relay does with a batch: countRelay.test.ts;
// what the Worker does: countsWorker.test.ts.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

mock.timers.enable({ apis: ['setTimeout'] });
// The queue's first wait, at most 2 s (count.ts JITTER_MS), here 1.5 s.
Math.random = () => 0.75;

const beacons: string[] = [];
const posts: { url: string; h: Record<string, string>[] }[] = [];
const listeners = new Map<string, ((e: unknown) => void)[]>();
/** Whether a blocker turns GoatCounter's address away. */
let blocked = true;
const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
set('location', { hostname: 'poe2.quest', pathname: '/', href: 'https://poe2.quest/', origin: 'https://poe2.quest', hash: '', search: '' });
// GoatCounter's address checked with a HEAD (countRelay.ts reaches), failed by the blocker; the batches to the matchmaking server taken. Never the network.
set('fetch', async (url: string, init: RequestInit) => {
  if (init.method === 'HEAD') {
    if (blocked) throw new TypeError('Failed to fetch');
    return new Response(null);
  }
  posts.push({ url, h: JSON.parse(String(init.body)).h });
  return new Response(null, { status: 204 });
});
set('navigator', { webdriver: false, userAgent: 'test', sendBeacon: (url: string) => (beacons.push(url), true) });
set('document', {
  visibilityState: 'visible',
  referrer: 'https://www.reddit.com/r/PathOfExile2/comments/abc',
  title: 'PoE2.Quest',
  documentElement: { hasAttribute: () => false },
  addEventListener: () => {},
  removeEventListener: () => {},
});
set('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
set('addEventListener', (type: string, fn: (e: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]));
set('removeEventListener', (type: string, fn: (e: unknown) => void) => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)));
const fire = (type: string) => {
  for (const fn of listeners.get(type) ?? []) fn({});
};
/** The promises waiting on the check of GoatCounter's address settled. */
const settled = () => new Promise((r) => setImmediate(r));

const { countEvent, countVisit } = await import('../src/lib/count.ts');
const { COUNTS_URL, GATHER_MS } = await import('../src/lib/countRelay.ts');

test('a load whose blocker keeps GoatCounter away sends its counts through the matchmaking server, and its visit says so', async () => {
  countVisit(() => null, 'reddit-oct', () => {});
  // (Sent straight before it was known: the beacon the blocker turned away.)
  assert.deepEqual(
    beacons.map((u) => new URL(u).searchParams.get('p')),
    ['/'],
  );
  await settled();
  countEvent('play/race');
  // The mark and the game's start, through the queue (1.5 s, then 0.6 s apart), then the batch they gather in.
  mock.timers.tick(1_500);
  mock.timers.tick(600);
  assert.equal(posts.length, 0, 'held for others to go with them');
  mock.timers.tick(GATHER_MS);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, COUNTS_URL);
  assert.deepEqual(posts[0].h, [
    { p: '/', t: 'PoE2.Quest', r: 'https://www.reddit.com', q: '?utm_campaign=reddit-oct' },
    { p: 'visit/blocked', t: 'visit/blocked', e: 'true' },
    { p: 'play/race', t: 'play/race', e: 'true', ns: 'true' },
  ]);
  assert.equal(beacons.length, 1, 'nothing more straight');
});

test('the counts that wait for the gathering go at once as the page is left', () => {
  countEvent('end/race');
  fire('pagehide');
  assert.equal(posts.length, 2);
  assert.deepEqual(
    posts[1].h.map((h) => h.p),
    ['end/race'],
  );
  assert.equal(beacons.length, 1);
});

test('a load that reaches GoatCounter sends straight, as before, and nothing through the server', async () => {
  blocked = false;
  const before = posts.length;
  // A page of its own (the query makes it a module of its own).
  const reached = '../src/lib/count.ts?reached';
  const { countEvent: count } = (await import(reached)) as typeof import('../src/lib/count.ts');
  count('play/turns');
  await settled();
  count('end/turns');
  mock.timers.tick(1_500);
  mock.timers.tick(GATHER_MS);
  assert.deepEqual(
    beacons.slice(1).map((u) => new URL(u).searchParams.get('p')),
    ['play/turns', 'end/turns'],
  );
  assert.equal(posts.length, before);
});
