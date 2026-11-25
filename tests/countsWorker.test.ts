// The visitor counts the matchmaking server passes on to GoatCounter
// (signal/worker.js, "visitor counts passed on", its /counts path): for the
// live game's page only, with GoatCounter's key, within the rate limits (its
// own asked first), each batch checked whole, then sent on to GoatCounter's
// counting API with the address and browser string the page came from, an
// event counted each time under a session of its own. What GoatCounter's
// answer becomes for the page. What the page sends: countRelay.test.ts and
// countRoute.test.ts. GoatCounter's own counting is not run here: what its
// API does with a session, an address and a browser string was read from its
// source (handlers/api.go count, memstore.go session), not tried.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { COUNTER_API, MAX_COUNTED, MAX_COUNTS, answer, counted } from '../signal/worker.js';
import { COUNTER_ORIGIN } from '../src/lib/counter.ts';
import { MAX_RELAYED, hitOf, relayBody } from '../src/lib/countRelay.ts';

const realFetch = globalThis.fetch;
afterEach(() => void (globalThis.fetch = realFetch));

/** GoatCounter's API as the Worker reaches it: each call noted, answered `status` (null: the network failed). */
function goat(status: number | null = 202) {
  const calls: { url: string; init: RequestInit; body: { hits: Record<string, unknown>[] } }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    if (status === null) throw new TypeError('network');
    return new Response(null, { status });
  }) as typeof fetch;
  return calls;
}

/** The Worker's bindings: the rate limits as given, each asking noted, and GoatCounter's key unless `key` is ''. */
function env(key = 'test-key', limited = false, countsLimited = false) {
  const asked: string[] = [];
  const never = { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response(null, { status: 500 }) }) };
  return {
    asked,
    PER_ADDRESS: { limit: async () => (asked.push('PER_ADDRESS'), { success: !limited }) },
    KEEP_WRITES: { limit: async () => ({ success: true }) },
    TALLY_WRITES: { limit: async () => ({ success: true }) },
    COUNT_WRITES: { limit: async () => (asked.push('COUNT_WRITES'), { success: !countsLimited }) },
    SIGNAL: never,
    KEEP: never,
    TALLY: never,
    ...(key ? { GOATCOUNTER_KEY: key } : {}),
  };
}

/** Counts as count.ts would have sent them to GoatCounter itself (its send), as the page's relay batches them. */
const url = (params: Record<string, string>) => `${COUNTER_ORIGIN}/count?${new URLSearchParams({ ...params, rnd: 'k3j9' })}`;
const visit = hitOf(url({ p: '/', t: 'PoE2.Quest', r: 'https://www.reddit.com', q: '?utm_campaign=reddit-oct' }));
const event = hitOf(url({ p: 'error/script/lib/codex.ts:loadCodex', t: 'error/script/lib/codex.ts:loadCodex', e: 'true', ns: 'true' }));
const step = hitOf(url({ p: 'reach/played', t: 'reach/played', e: 'true' }));
const app = hitOf(url({ p: 'visit/app', t: 'visit/app', e: 'true' }));

const at = (e: object, body: string, origin = 'https://poe2.quest', method = 'POST') =>
  answer(
    new Request('https://x/counts', {
      method,
      ...(method === 'POST' ? { body } : {}),
      headers: { Origin: origin, 'Content-Type': 'text/plain', 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'Mozilla/5.0 (test)' },
    }),
    e as never,
  );

test("the Worker's limits are the page's, and it passes counts on to the site's own GoatCounter", () => {
  assert.equal(MAX_COUNTED, MAX_RELAYED);
  assert.ok(COUNTER_API.startsWith(`${COUNTER_ORIGIN}/`));
  assert.ok(relayBody(Array(MAX_RELAYED).fill(event)).length < MAX_COUNTS, 'a full batch of long events fits');
});

test("a page's counts go on to GoatCounter with the address and browser string they came from, an event counted each time under a session of its own", async () => {
  const calls = goat();
  const e = env();
  const r = await at(e, relayBody([visit, event, event, step]));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://poe2.quest');
  assert.deepEqual(e.asked, ['COUNT_WRITES', 'PER_ADDRESS']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, COUNTER_API);
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'), 'Bearer test-key');
  const [v, a, b, s] = calls[0].body.hits;
  const from = { ip: '203.0.113.7', user_agent: 'Mozilla/5.0 (test)' };
  assert.deepEqual(v, { path: '/', title: 'PoE2.Quest', event: false, ref: 'https://www.reddit.com', query: '?utm_campaign=reddit-oct', ...from });
  assert.deepEqual(s, { path: 'reach/played', title: 'reach/played', event: true, ...from }, 'a step keeps the visitor’s session: none of its own');
  assert.equal(typeof a.session, 'string');
  assert.notEqual(a.session, b.session, 'each event a session of its own');
  assert.deepEqual({ ...a, session: '' }, { path: event.p, title: event.t, event: true, ...from, session: '' });
  assert.deepEqual(Object.keys(calls[0].body), ['hits'], "GoatCounter's own filter (its ignored addresses) left as it is");
});

test('nothing goes on without the key, from anywhere but the live page, or but a batch to send', async () => {
  const calls = goat();
  const body = relayBody([visit]);
  assert.equal((await at(env(''), body)).status, 404, 'no key: as an older Worker');
  assert.equal((await at(env(), body, 'http://localhost:5173')).status, 404, 'the dev server never counts');
  assert.equal((await at(env(), body, 'https://poe2.quest', 'GET')).status, 404);
  assert.equal((await at(env(), body, 'https://elsewhere.example')).status, 403);
  assert.equal(calls.length, 0);
});

test('a batch off in its own shape is refused whole, GoatCounter not asked', async () => {
  const calls = goat();
  const off = ['not json', '[]', JSON.stringify({ h: [] }), JSON.stringify({ h: [visit], more: 1 }), JSON.stringify({ h: step }), relayBody(Array(MAX_COUNTED + 1).fill(step))];
  for (const body of off) {
    assert.equal(counted(new TextEncoder().encode(body)), null, body);
    assert.equal((await at(env(), body)).status, 400, body);
  }
  assert.equal(calls.length, 0);
});

test('a count off in any way is left out alone, the rest of its batch sent on', async () => {
  const off = [
    null,
    'play/race',
    [step],
    { ...step, x: '1' },
    { ...step, ns: 'false' },
    { ...step, e: true },
    { t: 'no path' },
    { ...step, p: 'https://elsewhere.example/page' },
    { ...step, p: '/?room=ABCD' },
    { ...step, p: 'reach//played' },
    { ...visit, r: 'https://www.reddit.com/r/secret-thread' },
    { ...visit, q: '?room=ABCD' },
    { ...visit, t: 'line\nbreak' },
  ];
  for (const x of off) {
    const calls = goat();
    const r = await at(env(), JSON.stringify({ h: [x, step] }));
    assert.equal(r.status, 204, JSON.stringify(x));
    assert.deepEqual(
      calls[0].body.hits.map((h) => h.path),
      ['reach/played'],
      JSON.stringify(x),
    );
  }
  const calls = goat();
  assert.equal((await at(env(), JSON.stringify({ h: [{ ...step, x: '1' }] }))).status, 204, 'none left: taken');
  assert.equal(calls.length, 0, 'GoatCounter not asked');
});

test('every name the page counts under passes, error places from a package and a function with $ among them', () => {
  const names = [
    'play/race',
    'size/delve-solo-3p',
    'delve/depth-190-199',
    'cohort/2026-W43',
    'frames2/desktop-chrome/some/reveal',
    'relay/no-login-unreached',
    'room/back-10s',
    'error/join-version-mismatch',
    'error/script/lib/codex.ts:loadCodex',
    'error/script/node_modules/@fontsource-variable/manuale',
    'error/script/lib/session.svelte.ts:$$render',
    'visit/blocked',
  ];
  const hits = names.map((p) => hitOf(url({ p, t: p, e: 'true', ns: 'true' })));
  assert.deepEqual(counted(new TextEncoder().encode(relayBody([visit, app, ...hits]))), [visit, app, ...hits]);
});

test('an address past its share is told to wait, the counts’ own limit asked first', async () => {
  const calls = goat();
  const few = env('test-key', false, true);
  assert.equal((await at(few, relayBody([visit]))).status, 429);
  assert.deepEqual(few.asked, ['COUNT_WRITES'], 'the address’s allowance left alone');
  const busy = env('test-key', true);
  assert.equal((await at(busy, relayBody([visit]))).status, 429);
  assert.equal(calls.length, 0);
});

test("GoatCounter's answer, as the page hears it: taken, sent again later, or the path gone", async () => {
  const cases: [number | null, number][] = [
    [202, 204],
    // Some turned down as they are (the rest taken): sending them again would count those twice.
    [400, 204],
    [429, 503],
    [500, 503],
    [null, 503],
    [401, 404],
    [403, 404],
  ];
  for (const [goatSays, page] of cases) {
    goat(goatSays);
    assert.equal((await at(env(), relayBody([step]))).status, page, String(goatSays));
  }
});
