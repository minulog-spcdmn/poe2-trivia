import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEFORE, CheckError, apiOf, checkDay, firedOf, main, windowsOf } from '../scripts/daily-health.mjs';
import { pathCounts } from '../src/statsPage/hits.ts';
import { addDays, dayIn } from '../src/statsPage/zone.ts';

// The daily health check (scripts/daily-health.mjs) on a made-up GoatCounter
// and no network: the days it reads and checks, how it pages and paces its
// calls, and what it exits with.

const KEY = 'secret-test-key';
const ZONE = 'Europe/Berlin';
/** 01:30 in Berlin on Nov 6: yesterday is Nov 5. */
const AT = Date.parse('2026-11-06T00:30:00Z');
const YESTERDAY = '2026-11-05';

/** A quiet day's counts by path; `on` changes a path's count on given days. */
const QUIET: Record<string, number> = { '/': 100, 'play/turns': 40, 'join/code': 20, 'error/join-no-answer': 2, 'error/chunk': 1, 'error/script/lib/a.ts:f': 1 };
type Plan = { on?: Record<string, Record<string, number>>; from?: string; hourly?: boolean; pageSize?: number; status?: number[]; retryAfter?: string; garbled?: boolean };

/**
 * A pretend GoatCounter: the account in Berlin, /stats/hits paging `pageSize`
 * paths at a time (leaving out those asked to), each with its days in the
 * span asked for (none before `from`, where counting began). `status`: what
 * the first calls answer instead; `garbled`: every other answer not JSON.
 */
function goat(plan: Plan = {}) {
  const asked: { path: string; query: URLSearchParams; auth: string | null }[] = [];
  const statuses = [...(plan.status ?? [])];
  const ids = Object.keys(QUIET);
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get('Authorization');
    asked.push({ path: url.pathname, query: url.searchParams, auth });
    const status = statuses.shift();
    if (status) return new Response('', { status, headers: plan.retryAfter ? { 'Retry-After': plan.retryAfter } : {} });
    if (plan.garbled) return new Response('<html>Maintenance</html>');
    if (url.pathname === '/api/v0/me') return Response.json({ user: { settings: { timezone: `DE.${ZONE}` } } });
    assert.equal(url.pathname, '/api/v0/stats/hits');
    const start = new Date(url.searchParams.get('start')!);
    const end = new Date(url.searchParams.get('end')!);
    const days: string[] = [];
    for (let d = dayIn(ZONE, start); d <= dayIn(ZONE, end); d = addDays(d, 1)) days.push(d);
    const left = new Set((url.searchParams.get('exclude_paths') ?? '').split(',').filter(Boolean));
    const page = ids.map((p, i) => ({ p, id: i + 1 })).filter(({ id }) => !left.has(String(id)));
    const size = plan.pageSize ?? 100;
    const hits = page.slice(0, size).map(({ p, id }) => {
      const stats = days.map((day) => {
        const daily = plan.from && day < plan.from ? 0 : (plan.on?.[p]?.[day] ?? QUIET[p]);
        return { day, daily, ...(plan.hourly ? { hourly: Array.from({ length: 24 }, (_, h) => (h === 12 ? daily : 0)) } : {}) };
      });
      return { path_id: id, path: p, event: p !== '/', count: stats.reduce((n, s) => n + s.daily, 0), stats };
    });
    return Response.json({ hits, more: page.length > size });
  }) as typeof globalThis.fetch;
  return { fetch, asked };
}

const run = async (argv: string[], plan: Plan = {}, env: Record<string, string> = { GOATCOUNTER_KEY: KEY }) => {
  const site = goat(plan);
  const lines: string[] = [];
  const slept: number[] = [];
  const code = await main(argv, env, { fetch: site.fetch, now: () => AT, sleep: async (ms) => void slept.push(ms), log: (l) => lines.push(l) });
  return { code, lines, slept, asked: site.asked };
};

test('without a key it says the check is off, asks nothing and passes', async () => {
  const r = await run([], {}, {});
  assert.equal(r.code, 0);
  assert.equal(r.lines.length, 1);
  assert.match(r.lines[0], /off.*GOATCOUNTER_KEY/);
  assert.equal(r.asked.length, 0);
});

test("yesterday is the account's day before today, read from the day before its 7 to just before today's midnight there", () => {
  const w = windowsOf(ZONE, new Date(AT));
  assert.deepEqual(w.checked, [YESTERDAY]);
  assert.equal(w.span.start.toISOString(), '2026-10-27T23:00:00.000Z');
  assert.equal(w.span.end.toISOString(), '2026-11-05T22:59:59.999Z');
  // Late on Nov 5 in UTC is already Nov 6 in Berlin; and a backtest reads every day's 7 before in the one span.
  assert.deepEqual(windowsOf(ZONE, new Date('2026-11-05T23:30:00Z')).checked, [YESTERDAY]);
  const back = windowsOf(ZONE, new Date(AT), 30);
  assert.equal(back.checked.length, 30);
  assert.equal(back.checked[29], YESTERDAY);
  assert.equal(back.span.start.getTime(), new Date(`${addDays(back.checked[0], -BEFORE - 1)}T00:00:00+01:00`).getTime() - 3_600_000);
});

test('a quiet day passes with one line, from the zone and the paths read page by page with the key', async () => {
  const r = await run([], { pageSize: 4 });
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, [`Daily health check: ${YESTERDAY} as usual against the 7 days before (${ZONE}).`]);
  assert.deepEqual(r.asked.map((a) => a.path), ['/api/v0/me', '/api/v0/stats/hits', '/api/v0/stats/hits']);
  assert.ok(r.asked.every((a) => a.auth === `Bearer ${KEY}`));
  const [first, second] = r.asked.slice(1).map((a) => a.query);
  assert.equal(first.get('group'), 'day');
  assert.equal(first.get('start'), '2026-10-27T23:00:00.000Z');
  assert.equal(first.get('end'), '2026-11-05T22:59:59.999Z');
  assert.equal(first.get('exclude_paths'), null);
  assert.equal(second.get('exclude_paths'), '1,2,3,4');
  // A second apart, sent one at a time.
  assert.deepEqual(r.slept, [1000, 1000]);
});

test('parts that failed to load far above the week before fail the run, saying how many, never with the key', async () => {
  const r = await run([], { on: { 'error/chunk': { [YESTERDAY]: 40 } } });
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /2026-11-05 went worse/);
  assert.ok(r.lines.some((l) => /parts of the game that didn't load: 40, against 1\.0 usual/.test(l)));
  // Each fired line an annotation too, so the run's page says why.
  assert.deepEqual(
    r.lines.filter((l) => l.startsWith('::')),
    [`::error::${YESTERDAY}: parts of the game that didn't load: 40, against 1.0 usual for as many visits`],
  );
  assert.ok(!r.lines.join('\n').includes(KEY));
});

test('joining failing far more for as many games fails the run', async () => {
  const r = await run([], { on: { 'error/join-no-answer': { [YESTERDAY]: 25 } } });
  assert.equal(r.code, 1);
  assert.ok(r.lines.some((l) => /joining failed 25 times, against 2\.0 usual/.test(l)));
});

test("GoatCounter's hours put onto the clock come to the same days", async () => {
  assert.equal((await run([], { hourly: true })).code, 0);
  assert.equal((await run([], { hourly: true, on: { 'error/chunk': { [YESTERDAY]: 40 } } })).code, 1);
});

test('a 429 waits out its Retry-After and is asked again', async () => {
  const r = await run([], { status: [429], retryAfter: '7' });
  assert.equal(r.code, 0);
  assert.ok(r.slept.includes(7000));
  assert.deepEqual(r.asked.map((a) => a.path).slice(0, 2), ['/api/v0/me', '/api/v0/me']);
});

test('a 5xx is asked again, later each time', async () => {
  const r = await run([], { status: [502, 503] });
  assert.equal(r.code, 0);
  assert.ok(r.slept.includes(1500) && r.slept.includes(3000));
  assert.deepEqual(r.asked.map((a) => a.path).slice(0, 3), ['/api/v0/me', '/api/v0/me', '/api/v0/me']);
});

test("a 404 is asked again too (GoatCounter answers some of its own failures so, gone a moment later), and one that stays is a day it couldn't read", async () => {
  const once = await run([], { status: [404] });
  assert.equal(once.code, 0);
  assert.match(once.lines[0], /^Daily health check: .* as usual/);
  assert.deepEqual(once.asked.map((a) => a.path).slice(0, 2), ['/api/v0/me', '/api/v0/me']);
  const stays = await run([], { status: [404, 404, 404, 404] });
  assert.equal(stays.code, 0);
  assert.equal(stays.asked.length, 4);
  assert.match(stays.lines[0], /^::warning::Daily health check couldn't run today: GoatCounter answered 404/);
});

const unsaid = (lines: string[]) => !lines.join('\n').includes(KEY) && !lines.join('\n').includes('goatcounter.com');

test('only a key turned down fails the run, as an error that says so, the key unsaid', async () => {
  for (const status of [401, 403]) {
    const denied = await run([], { status: [status] });
    assert.equal(denied.code, 2);
    assert.equal(denied.asked.length, 1);
    assert.equal(denied.lines.length, 1);
    assert.match(denied.lines[0], /^::error::.*key was refused.*turned the key down/);
    assert.ok(unsaid(denied.lines));
  }
});

test("GoatCounter not read passes with a warning that the check couldn't run today: an hour's limit spent, a 5xx or no answer past the tries, an answer it can't use", async () => {
  const busy = await run([], { status: [429], retryAfter: '3600' });
  assert.equal(busy.asked.length, 1);
  assert.match(busy.lines[0], /slow down/);
  const down = await run([], { status: [503, 503, 503, 503] });
  assert.equal(down.asked.length, 4);
  assert.match(down.lines[0], /answered 503/);
  // (Backed off, it still gives up within a minute.)
  assert.ok(down.slept.reduce((a, b) => a + b, 0) < 60_000);
  const garbled = await run([], { garbled: true });
  const lines: string[] = [];
  const unreached = {
    code: await main([], { GOATCOUNTER_KEY: KEY }, { fetch: (async () => Promise.reject(new TypeError('fetch failed'))) as typeof fetch, now: () => AT, sleep: async () => {}, log: (l) => lines.push(l) }),
    lines,
  };
  assert.match(lines[0], /GoatCounter didn't answer/);
  for (const r of [busy, down, garbled, unreached]) {
    assert.equal(r.code, 0);
    assert.equal(r.lines.length, 1);
    assert.match(r.lines[0], /^::warning::Daily health check couldn't run today: /);
    assert.ok(unsaid(r.lines));
  }
});

test('the check itself broken (answers of a new shape, a bug) fails the run, not a warning every day', async () => {
  const lines: string[] = [];
  const reshaped = (async (input: string | URL | Request) =>
    new URL(String(input)).pathname === '/api/v0/me' ? Response.json({ user: { settings: { timezone: `DE.${ZONE}` } } }) : Response.json({ paths: [] })) as typeof fetch;
  const code = await main([], { GOATCOUNTER_KEY: KEY }, { fetch: reshaped, now: () => AT, sleep: async () => {}, log: (l) => lines.push(l) });
  assert.equal(code, 2);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^::error::Daily health check broke: /);
  assert.ok(unsaid(lines));
});

test('a day without its 7 before counted is not checked: counting began too late', async () => {
  const r = await run([], { from: addDays(YESTERDAY, -3) });
  assert.equal(r.code, 0);
  assert.match(r.lines[0], /not checked/);
});

test('a backtest reads once and names each day that would have mailed', async () => {
  const spike = addDays(YESTERDAY, -10);
  const r = await run(['--backtest', '30'], { pageSize: 4, on: { 'error/chunk': { [spike]: 40 } } });
  assert.equal(r.code, 0);
  assert.equal(r.asked.length, 3);
  assert.deepEqual(r.lines, [`${spike}: parts of the game that didn't load: 40, against 1.0 usual for as many visits`, `Backtest (${ZONE}): 1 of 30 days would have mailed; 3 requests.`]);
  assert.equal((await run(['--backtest', 'x'])).code, 2);
});

test('the days before counting began are left out of a backtest, not taken for quiet ones', async () => {
  const r = await run(['--backtest', '10'], { from: addDays(YESTERDAY, -12) });
  assert.match(r.lines.at(-1)!, /0 of 5 days would have mailed \(5 before counting allowed a check\)/);
});

test('a checked day holds against the 7 whole days before it, and says nothing where nothing fired', async () => {
  const api = apiOf(KEY, { fetch: goat().fetch, now: () => AT, sleep: async () => {} });
  const { paths } = await pathCounts(api.get, windowsOf(ZONE, new Date(AT)).span, ZONE, () => new CheckError('muddled'), () => AT);
  const c = checkDay(paths, YESTERDAY, ZONE);
  assert.equal(c?.day, YESTERDAY);
  assert.deepEqual(firedOf(c), []);
  assert.equal(checkDay(paths, addDays(YESTERDAY, -BEFORE), ZONE), null);
});
