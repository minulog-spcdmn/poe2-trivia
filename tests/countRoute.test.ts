// count.ts in a browser at the live game's address (globals set before it
// loads, as `counting` is settled then): a load's first count goes as a
// request that says whether it got there, and those counted meanwhile wait
// for its answer. A load whose blocker keeps GoatCounter's address from it
// sends its counts through the game's own server instead, the first among
// them, and a visit that went that way says so ("visit/blocked"); a load that
// reaches GoatCounter sends straight, as before. Nothing goes both ways. A
// load whose way round gives up goes straight again. What the relay does with
// a batch: countRelay.test.ts; what the Worker does: countsWorker.test.ts.
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

mock.timers.enable({ apis: ['setTimeout'] });
// The queue's first wait, at most 2 s (count.ts JITTER_MS), here 1.5 s.
Math.random = () => 0.75;

const beacons: string[] = [];
/** The counts sent as the check (countRelay.ts arrives). */
const checks: string[] = [];
const posts: { url: string; h: Record<string, string>[] }[] = [];
const listeners = new Map<string, ((e: unknown) => void)[]>();
/** How GoatCounter's address answers a count sent as the check: a blocker turns it away, it gets there, or it's on its way until `later` says. */
let goat: 'blocked' | 'there' | 'slow' = 'blocked';
const later: ((there: boolean) => void)[] = [];
/** How the counts' server answers a batch. */
let server = 204;
const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
set('location', { hostname: 'poe2.quest', pathname: '/', href: 'https://poe2.quest/', origin: 'https://poe2.quest', hash: '', search: '' });
// A count sent as the check, answered as `goat` says; the batches to the counts' server answered `server`. Never the network.
set('fetch', (url: string, init: RequestInit = {}) => {
  if (init.method === 'POST') {
    posts.push({ url, h: JSON.parse(String(init.body)).h });
    return Promise.resolve(new Response(null, { status: server }));
  }
  checks.push(url);
  if (goat === 'there') return Promise.resolve(new Response(null));
  if (goat === 'blocked') return Promise.reject(new TypeError('Failed to fetch'));
  return new Promise((ok, fail) => later.push((there) => (there ? ok(new Response(null)) : fail(new TypeError('Failed to fetch')))));
});
set('navigator', { webdriver: false, userAgent: 'test', sendBeacon: (url: string) => (beacons.push(url), true) });
const docListeners = new Map<string, ((e: unknown) => void)[]>();
const doc = {
  visibilityState: 'visible',
  referrer: 'https://www.reddit.com/r/PathOfExile2/comments/abc',
  title: 'PoE2.Quest',
  documentElement: { hasAttribute: () => false },
  addEventListener: (type: string, fn: (e: unknown) => void) => docListeners.set(type, [...(docListeners.get(type) ?? []), fn]),
  removeEventListener: (type: string, fn: (e: unknown) => void) => docListeners.set(type, (docListeners.get(type) ?? []).filter((f) => f !== fn)),
};
set('document', doc);
set('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
set('addEventListener', (type: string, fn: (e: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]));
set('removeEventListener', (type: string, fn: (e: unknown) => void) => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)));
const fire = (type: string) => {
  for (const fn of listeners.get(type) ?? []) fn({});
};
/** The page hidden or shown again (its visibilitychange). */
const show = (visible: boolean) => {
  doc.visibilityState = visible ? 'visible' : 'hidden';
  for (const fn of docListeners.get('visibilitychange') ?? []) fn({});
};
/** The promises waiting on a request's answer settled. */
const settled = () => new Promise((r) => setImmediate(r));
const paths = (urls: string[]) => urls.map((u) => new URL(u).searchParams.get('p'));

const { countEvent, countVisit, HOLD_MS } = await import('../src/lib/count.ts');
const { COUNTS_URL, GATHER_MS } = await import('../src/lib/countRelay.ts');
const { COUNTER_ORIGIN } = await import('../src/lib/counter.ts');
/** A page load of its own (the query makes it a module of its own). */
const load = async (name: string) => (await import(`../src/lib/count.ts?${name}`)) as typeof import('../src/lib/count.ts');

test('a load whose blocker keeps GoatCounter away sends its counts through the game’s own server, the first among them, and its visit says so', async () => {
  countVisit(() => null, 'reddit-oct', () => {});
  // The visit went as the check, at GoatCounter's count address: no beacon as well.
  assert.equal(beacons.length, 0);
  assert.equal(checks.length, 1);
  assert.ok(checks[0].startsWith(`${COUNTER_ORIGIN}/count?`));
  assert.equal(new URL(checks[0]).searchParams.get('p'), '/');
  await settled();
  countEvent('play/race');
  // The game's start through the queue (1.5 s), then the batch it gathers in with the visit.
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
  assert.equal(beacons.length, 0, 'nothing straight');
  assert.equal(checks.length, 1, 'checked once');
});

test('the counts that wait for the gathering go at once as the page is left, as one batch, and one counted after goes then too', async () => {
  countEvent('end/race');
  countEvent('screen/race');
  fire('pagehide');
  assert.equal(posts.length, 2, 'one batch');
  assert.deepEqual(
    posts[1].h.map((h) => h.p),
    ['end/race', 'screen/race'],
  );
  // (Counted as the page goes, after what waited has gone, as an error's listener does: count.ts countScriptError.)
  countEvent('error/script', true);
  await settled();
  assert.equal(posts.length, 3, 'without waiting for others');
  assert.deepEqual(
    posts[2].h.map((h) => h.p),
    ['error/script'],
  );
  // Shown again (from the back-forward cache): a count waits for others to go with it again.
  fire('pageshow');
  countEvent('play/race');
  mock.timers.tick(1_500);
  await settled();
  assert.equal(posts.length, 3, 'held for others to go with it');
  mock.timers.tick(GATHER_MS);
  assert.equal(posts.length, 4);
  assert.equal(beacons.length, 0);
});

test('a load that reaches GoatCounter sends straight after its first, as before, and nothing through the server', async () => {
  goat = 'there';
  const before = posts.length;
  const { countEvent: count } = await load('reached');
  count('play/turns');
  mock.timers.tick(1_500);
  await settled();
  count('end/turns');
  mock.timers.tick(1_500);
  mock.timers.tick(GATHER_MS);
  assert.deepEqual(paths(checks.slice(-1)), ['play/turns']);
  assert.deepEqual(paths(beacons), ['end/turns']);
  assert.equal(posts.length, before);
});

test('counts made while the first one’s answer is on its way wait for it, and go its way: straight', async () => {
  goat = 'slow';
  const sent = beacons.length;
  const { countEvent: count } = await load('held-there');
  count('play/turns', true);
  count('end/turns', true);
  assert.equal(beacons.length, sent, 'waiting');
  later.shift()?.(true);
  await settled();
  assert.deepEqual(paths(beacons.slice(sent)), ['end/turns']);
});

test('… or round the blocker, with the first: none of them straight as well', async () => {
  goat = 'slow';
  const sent = beacons.length;
  const before = posts.length;
  const { countEvent: count, countVisit: visit } = await load('held-blocked');
  visit(() => null, null, () => {});
  count('play/race', true);
  later.shift()?.(false);
  await settled();
  mock.timers.tick(GATHER_MS);
  assert.equal(beacons.length, sent);
  assert.equal(posts.length, before + 1);
  assert.deepEqual(
    posts[before].h.map((h) => h.p),
    ['/', 'visit/blocked', 'play/race'],
  );
});

test('counts wait for the answer a few seconds at most, then go straight', async () => {
  goat = 'slow';
  const sent = beacons.length;
  const { countEvent: count } = await load('slow');
  count('play/turns', true);
  count('end/turns', true);
  mock.timers.tick(HOLD_MS - 1);
  assert.equal(beacons.length, sent);
  mock.timers.tick(1);
  assert.deepEqual(paths(beacons.slice(sent)), ['end/turns']);
  later.shift()?.(true);
  await settled();
});

test('a load left before it knew sends what waited straight, and its first round the blocker once it knows, the visit’s mark with it', async () => {
  goat = 'slow';
  const sent = beacons.length;
  const before = posts.length;
  const { countEvent: count, countVisit: visit } = await load('left');
  visit(() => null, null, () => {});
  count('play/race', true);
  fire('pagehide');
  assert.deepEqual(paths(beacons.slice(sent)), ['play/race'], 'the page may not be back for the answer');
  later.shift()?.(false);
  await settled();
  assert.equal(posts.length, before + 1);
  assert.deepEqual(
    posts[before].h.map((h) => h.p),
    ['/', 'visit/blocked'],
  );
  fire('pageshow');
});

test('a load hidden before it had finished loading still sends at once once it knows: its own pageshow comes hidden', async () => {
  goat = 'blocked';
  const before = posts.length;
  const { countVisit: visit } = await load('hidden-early');
  visit(() => null, null, () => {});
  show(false);
  fire('pageshow');
  await settled();
  assert.equal(posts.length, before + 1, 'not held for others: the page may not be back');
  assert.deepEqual(
    posts[before].h.map((h) => h.p),
    ['/', 'visit/blocked'],
  );
  show(true);
});

test('a load whose way round is gone (the server hasn’t the path) goes straight again, with what never left, the visit’s mark not among them', async () => {
  goat = 'blocked';
  server = 404;
  const sent = beacons.length;
  const before = posts.length;
  const { countEvent: count, countVisit: visit } = await load('gone');
  visit(() => null, null, () => {});
  await settled();
  count('play/race', true);
  mock.timers.tick(GATHER_MS);
  await settled();
  assert.equal(posts.length, before + 1);
  count('end/race', true);
  assert.deepEqual(paths(beacons.slice(sent)), ['/', 'play/race', 'end/race']);
  assert.equal(posts.length, before + 1, 'nothing more round');
  server = 204;
});

test('a load left before its first count had gone sends that one as the check and the rest straight, none held for an answer the page may not see', async () => {
  goat = 'slow';
  const sent = beacons.length;
  const checked = checks.length;
  const { countEvent: count } = await load('left-queued');
  // (Both in the queue, its first wait not over: nothing has gone yet.)
  count('play/race');
  count('end/race');
  assert.equal(checks.length, checked);
  fire('pagehide');
  assert.deepEqual(paths(checks.slice(checked)), ['play/race']);
  assert.deepEqual(paths(beacons.slice(sent)), ['end/race']);
  later.shift()?.(true);
  await settled();
  fire('pageshow');
});
