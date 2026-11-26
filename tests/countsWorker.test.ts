// The visitor counts the game's own counts server passes on to GoatCounter
// (counts/worker.js, its /counts path): for the live game's page only, with
// GoatCounter's key, within its rate limit, each batch checked whole, then
// sent on to GoatCounter's counting API with the address and browser string
// the page came from (the address as the one asking too), an event counted
// each time under a session of its own (its id from the page, the same
// however often its batch comes), and a count from a cloud or hosting
// provider's address marked as the bot GoatCounter's /count would call it
// (botOf). What GoatCounter's
// answer becomes for the page. What the page sends: countRelay.test.ts and
// countRoute.test.ts. GoatCounter's own counting is not run here: what its
// API does with a session, an address and a browser string was read from its
// source (handlers/api.go count, memstore.go session), not tried.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ASKER, COUNTER_API, MAX_COUNTED, MAX_COUNTS, answer, botOf, counted, words } from '../counts/worker.js';
import { ISBOT, V4_CODES, V6_CODES } from '../counts/botRanges.js';
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

/** The Worker's bindings: its rate limit as given, each asking noted (by whom), and GoatCounter's key unless `key` is ''. */
function env(key = 'test-key', limited = false) {
  const asked: string[] = [];
  return {
    asked,
    COUNT_WRITES: { limit: async (o: { key: string }) => (asked.push(o.key), { success: !limited }) },
    ...(key ? { GOATCOUNTER_KEY: key } : {}),
  };
}

/** Counts as count.ts would have sent them to GoatCounter itself (its send), as the page's relay batches them. */
const url = (params: Record<string, string>) => `${COUNTER_ORIGIN}/count?${new URLSearchParams({ ...params, rnd: 'k3j9' })}`;
const visit = hitOf(url({ p: '/', t: 'PoE2.Quest', r: 'https://www.reddit.com', q: '?utm_campaign=reddit-oct' }));
const event = hitOf(url({ p: 'error/script/lib/codex.ts:loadCodex', t: 'error/script/lib/codex.ts:loadCodex', e: 'true', ns: 'true' }));
const step = hitOf(url({ p: 'reach/played', t: 'reach/played', e: 'true' }));
const app = hitOf(url({ p: 'visit/app', t: 'visit/app', e: 'true' }));

const at = (e: object, body: string, origin = 'https://poe2.quest', method = 'POST', ip = '203.0.113.7') =>
  answer(
    new Request('https://x/counts', {
      method,
      ...(method === 'POST' ? { body } : {}),
      headers: { Origin: origin, 'Content-Type': 'text/plain', 'CF-Connecting-IP': ip, 'User-Agent': 'Mozilla/5.0 (test)' },
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
  assert.deepEqual(e.asked, ['203.0.113.7'], 'its own limit, the address’s');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, COUNTER_API);
  assert.equal(new Headers(calls[0].init.headers).get('Authorization'), 'Bearer test-key');
  assert.equal(new Headers(calls[0].init.headers).get(ASKER), '203.0.113.7', 'the visitor as the one asking');
  const [v, a, b, s] = calls[0].body.hits;
  const from = { ip: '203.0.113.7', user_agent: 'Mozilla/5.0 (test)' };
  assert.deepEqual(v, { path: '/', title: 'PoE2.Quest', event: false, ref: 'https://www.reddit.com', query: '?utm_campaign=reddit-oct', ...from });
  assert.deepEqual(s, { path: 'reach/played', title: 'reach/played', event: true, ...from }, 'a step keeps the visitor’s session: none of its own');
  assert.equal(typeof a.session, 'string');
  assert.notEqual(a.session, b.session, 'each event a session of its own');
  assert.deepEqual({ ...a, session: '' }, { path: event.p, title: event.t, event: true, ...from, session: '' });
  assert.deepEqual(Object.keys(calls[0].body), ['hits'], "GoatCounter's own filter (its ignored addresses) left as it is");
});

test('an event with its id goes under that id as its session, so its batch sent again (an answer lost) counts it once; the id GoatCounter’s alone to see', async () => {
  const calls = goat();
  const one = { ...event, i: '0123456789abcdef0123456789abcdef' };
  const two = { ...event, i: 'fedcba9876543210fedcba9876543210' };
  const batch = relayBody([visit, one, two]);
  await at(env(), batch);
  await at(env(), batch);
  const sessions = calls.map((c) => c.body.hits.map((h) => h.session));
  assert.deepEqual(sessions, [
    [undefined, one.i, two.i],
    [undefined, one.i, two.i],
  ]);
  assert.ok(calls.every((c) => c.body.hits.every((h) => !('i' in h))), 'only GoatCounter’s own fields');
  // An id off in its shape leaves that count out, as any part off does.
  await at(env(), relayBody([visit, { ...event, i: 'not-an-id' }]));
  assert.deepEqual(
    calls[2].body.hits.map((h) => h.path),
    ['/'],
  );
});

test("a count from a cloud or hosting provider's address goes as the bot GoatCounter's /count calls it; one from a home's as none", async () => {
  const calls = goat();
  await at(env(), relayBody([visit, step]), 'https://poe2.quest', 'POST', '3.5.0.1');
  assert.deepEqual(
    calls[0].body.hits.map((h) => h.bot),
    [8, 8],
    'AWS',
  );
  await at(env(), relayBody([visit]));
  assert.equal(calls[1].body.hits[0].bot, undefined, 'a documentation address, no provider’s');
});

test("an address's provider, as isbot's ranges have it, its first and last address and the one past them", () => {
  const cases: [string, number][] = [
    ['3.5.0.1', 8],
    ['5.9.1.1', 12],
    ['1.178.1.0', 8],
    ['1.178.1.255', 8],
    ['1.178.2.0', 0],
    ['203.0.113.7', 0],
    ['8.8.8.8', 0],
    ['2600:1f00:1000::1', 8],
    ['2600:1f00:0fff:ffff:ffff:ffff:ffff:ffff', 0],
    ['2603:1020:1404:4a2c:c5c:7fd0:a6a3:a450', 13],
    ['2001:db8::1', 0],
    // (An IPv4 address within IPv6 is none of the IPv6 ranges, as with isbot.)
    ['::ffff:3.5.0.1', 0],
    ['not an address', 0],
    ['1.2.3', 0],
    ['1:2:3:4:5:6:7:8:9', 0],
    ['', 0],
  ];
  for (const [ip, bot] of cases) assert.equal(botOf(ip), bot, ip);
  assert.deepEqual(words('::ffff:1.2.3.4'), [0, 0, 0xffff, 0x01020304]);
  assert.deepEqual(words('10.0.0.1'), [0x0a000001]);
  assert.equal(words('1.2.3.256'), null);
  // isbot's codes for its providers (BotRangeAWS 8 to BotRangeOVH 17), at the version GoatCounter's go.mod names.
  const codes = new Set([...atob(V4_CODES), ...atob(V6_CODES)].map((c) => c.charCodeAt(0)));
  assert.ok([...codes].every((c) => c >= 8 && c <= 17), [...codes].join());
  assert.equal(ISBOT, 'v1.1.0');
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
    // (Keys every object has from its prototype are none of a count's either.)
    { ...step, constructor: 'x' },
    { ...step, toString: 'x' },
  ];
  // (`__proto__` as JSON text: an object literal makes no key of it.)
  const bodies = [...off.map((x) => JSON.stringify({ h: [x, step] })), `{"h":[{"p":"reach/played","__proto__":"x"},${JSON.stringify(step)}]}`];
  for (const body of bodies) {
    const calls = goat();
    const r = await at(env(), body);
    assert.equal(r.status, 204, body);
    assert.deepEqual(
      calls[0].body.hits.map((h) => h.path),
      ['reach/played'],
      body,
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

test('an address past its share is told to wait, GoatCounter not asked', async () => {
  const calls = goat();
  assert.equal((await at(env('test-key', true), relayBody([visit]))).status, 429);
  assert.equal(calls.length, 0);
});

test("GoatCounter's answer, as the page hears it: taken, sent again later, or the path gone", async () => {
  const cases: [number | null, number][] = [
    [202, 204],
    // (Taken all the same, however GoatCounter says so: sent again, they would count twice.)
    [200, 204],
    [204, 204],
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
