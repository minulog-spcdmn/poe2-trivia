import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEFORE, CheckError, apiOf, checkDay, firedOf, hourStart, hourWindowsOf, lastHoursOf, main, windowsOf } from '../scripts/daily-health.mjs';
import { passing, pathCounts } from '../src/statsPage/hits.ts';
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

const run = async (argv: string[], plan: Plan = {}, env: Record<string, string> = { GOATCOUNTER_KEY: KEY }, at = AT) => {
  const site = goat(plan);
  const lines: string[] = [];
  const slept: number[] = [];
  const code = await main(argv, env, { fetch: site.fetch, now: () => at, sleep: async (ms) => void slept.push(ms), log: (l) => lines.push(l) });
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

test('what the stats page and the daily check both ask again: a 404 or a 5xx, nothing else', () => {
  for (const status of [404, 500, 502, 503]) assert.equal(passing(status), true, String(status));
  for (const status of [200, 400, 401, 403, 429]) assert.equal(passing(status), false, String(status));
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

test("a device stuttering more is said by visits where those were weighed, by games where they weren't yet counted", () => {
  const check = (by: 'visits' | 'games') => ({ day: YESTERDAY, trouble: null, health: { errors: [], stutter: [{ device: 'android' as const, share: 57.1, before: 14.7, of: 21, by }] } });
  assert.deepEqual(firedOf(check('visits')), ['Android: the first game stuttered on 57% of 21 visits, against 15% before']);
  assert.deepEqual(firedOf(check('games')), ['Android: 57% of 21 games stuttered, against 15% before']);
});

test("the check itself goes by visits once they're counted on 3 of the 7 days before: one phone's evening of games is no mail, most phones stuttering is", () => {
  const days = Array.from({ length: BEFORE + 2 }, (_, i) => addDays(YESTERDAY, i - BEFORE - 1));
  /** A path counted `n` on each of the last `last` days before yesterday, and `y` yesterday. */
  const p = (path: string, n: number, y: number, last = days.length) => {
    const per = Object.fromEntries(days.map((d, i) => [d, d === YESTERDAY ? y : i >= days.length - 1 - last ? n : 0]));
    return { path, event: path !== '/', count: Object.values(per).reduce((a, b) => a + b, 0), days: per };
  };
  const quiet = [p('/', 100, 100), p('frames2/android/smooth', 12, 0), p('frames2/android/some/reveal', 3, 9)];
  // By games, as before visits were counted: nine stuttered games of nine.
  assert.deepEqual(firedOf(checkDay(quiet, YESTERDAY, ZONE)), ['Android: 100% of 9 games stuttered, against 20% before']);
  // Visits counted on two of the days before: still by games.
  const two = [...quiet, p('frames2/android/visit/smooth', 5, 0, 2), p('frames2/android/visit/stuttered', 1, 1, 2)];
  assert.equal(firedOf(checkDay(two, YESTERDAY, ZONE)).length, 1);
  // On three: the nine games were one visit, which says nothing.
  const three = [...quiet, p('frames2/android/visit/smooth', 5, 0, 3), p('frames2/android/visit/stuttered', 1, 1, 3)];
  assert.deepEqual(firedOf(checkDay(three, YESTERDAY, ZONE)), []);
  // Most of a day's visits stuttering is said, by visits.
  const worse = [...quiet, p('frames2/android/visit/smooth', 5, 3, 3), p('frames2/android/visit/stuttered', 1, 11, 3)];
  assert.deepEqual(firedOf(checkDay(worse, YESTERDAY, ZONE)), ['Android: the first game stuttered on 79% of 14 visits, against 17% before']);
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

// The midday check (--last-24h): the 24 hours to the start of this hour.
// The pretend GoatCounter's hourly counts all fall in each day's 12:00 to
// 13:00 in Berlin.
/** 13:30 in Berlin on Nov 6: the window ends at 13:00, so it holds Nov 6's 12:00 hour. */
const MIDDAY = Date.parse('2026-11-06T12:30:00Z');
const TODAY = '2026-11-06';

test('the midday check reads from the midnight before its first window to the start of this hour, its windows named as the days they end on', () => {
  const w = hourWindowsOf(ZONE, new Date(MIDDAY));
  assert.equal(new Date(w.bounds.at(-1)!).toISOString(), '2026-11-06T12:00:00.000Z');
  assert.equal(w.bounds.length, w.labels.length + 1);
  assert.deepEqual(w.checked, [TODAY]);
  assert.equal(w.labels.length, BEFORE + 2);
  assert.equal(w.labels[0], addDays(TODAY, -BEFORE - 1));
  // The oldest window starts at 13:00 on Oct 28, so Oct 28 is read whole.
  assert.equal(w.span.start.toISOString(), '2026-10-27T23:00:00.000Z');
  assert.equal(w.span.end.toISOString(), '2026-11-06T11:59:59.999Z');
  assert.equal(hourWindowsOf(ZONE, new Date(MIDDAY), 20).labels.length, 20 + BEFORE + 1);
  // An hour on Kolkata's clock begins at half past, in UTC.
  assert.equal(hourStart('Asia/Kolkata', new Date('2026-11-06T12:20:00Z')).toISOString(), '2026-11-06T11:30:00.000Z');
});

test('a quiet 24 hours passes, saying which', async () => {
  const r = await run(['--last-24h'], { hourly: true }, undefined, MIDDAY);
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, [`Midday health check: the 24 hours to 13:00 on ${TODAY} as usual against the 7 days before at the same hours (${ZONE}).`]);
});

test("a fault in this morning's hours fails the midday run, before the night's check could see it", async () => {
  const r = await run(['--last-24h'], { hourly: true, on: { 'error/chunk': { [TODAY]: 40 } } }, undefined, MIDDAY);
  assert.equal(r.code, 1);
  // The words the health responder reads as an alert.
  assert.match(r.lines[0], /^Midday health check: the 24 hours to 13:00 on 2026-11-06 went worse than the 7 days before at the same hours/);
  assert.deepEqual(r.lines.filter((l) => l.startsWith('::')), [`::error::the 24 hours to 13:00 on ${TODAY}: parts of the game that didn't load: 40, against 1.0 usual for as many visits`]);
  assert.ok(!r.lines.join('\n').includes(KEY));
});

test('a window ends where this hour starts: the hour now is left for the next check', async () => {
  // 12:30 in Berlin: the window is 12:00 to 12:00, so it holds Nov 5's 12:00 hour and not Nov 6's.
  const noon = Date.parse('2026-11-06T11:30:00Z');
  assert.equal((await run(['--last-24h'], { hourly: true, on: { 'error/chunk': { [TODAY]: 40 } } }, undefined, noon)).code, 0);
  const r = await run(['--last-24h'], { hourly: true, on: { 'error/chunk': { [YESTERDAY]: 40 } } }, undefined, noon);
  assert.equal(r.code, 1);
  assert.match(r.lines[0], /the 24 hours to 12:00 on 2026-11-06 went worse/);
});

test("without GoatCounter's hours the midday check can't cut its window: an answer of a new shape, so the check broken, not a quiet pass every day", async () => {
  const r = await run(['--last-24h'], {}, undefined, MIDDAY);
  assert.equal(r.code, 2);
  assert.match(r.lines.at(-1)!, /^::error::Midday health check broke: GoatCounter gave no hours/);
});

test('each window ends at the same hour on the clock, a day across a clock change holding 23 or 25 hours', () => {
  // Nov 6 13:00 in Berlin; Oct 25, when the clocks went back, is among the windows before.
  const w = hourWindowsOf(ZONE, new Date(MIDDAY), 20);
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
  assert.ok(w.bounds.every((b) => clock.format(new Date(b)) === '13:00'));
  const long = w.labels.indexOf('2026-10-25');
  assert.equal(w.bounds[long + 1] - w.bounds[long], 25 * 3_600_000);
  assert.ok(w.labels.every((l, i) => i === 0 || l === addDays(w.labels[i - 1], 1)));
  // Ending at midnight, each window is named as the day it holds.
  const night = hourWindowsOf(ZONE, new Date('2026-11-05T23:30:00Z'));
  assert.equal(night.checked[0], YESTERDAY);
  assert.equal(new Date(night.bounds.at(-2)!).toISOString(), '2026-11-04T23:00:00.000Z');
});

test('a backtest of the midday check names each 24 hours that would have mailed', async () => {
  const spike = addDays(TODAY, -10);
  const r = await run(['--last-24h', '--backtest', '30'], { hourly: true, on: { 'error/chunk': { [spike]: 40 } } }, undefined, MIDDAY);
  assert.equal(r.code, 0);
  assert.deepEqual(r.lines, [
    `the 24 hours to 13:00 on ${spike}: parts of the game that didn't load: 40, against 1.0 usual for as many visits`,
    `Backtest of the midday check (${ZONE}): 1 of 30 checks would have mailed; 2 requests.`,
  ]);
});

test('a window across the night the clocks go back holds all of its 25 hours, each hour where it began', () => {
  // Oct 25 2026 in Berlin has 25 hours: the window to Oct 26's midnight holds them all, and Oct 24's evening is the window before.
  // An hour's count each, the doubled 02:00 cell holding both of its hours.
  const hours = { '2026-10-24': Array.from({ length: 24 }, (_, h) => (h === 23 ? 1 : 0)), '2026-10-25': Array.from({ length: 24 }, (_, h) => (h === 2 ? 2 : 1)) };
  const path = { path: '/', event: false, count: 26, days: { '2026-10-24': 1, '2026-10-25': 25 }, hours };
  const w = hourWindowsOf(ZONE, new Date('2026-10-25T23:30:00Z'));
  assert.deepEqual(w.checked, ['2026-10-25']);
  const [cut] = lastHoursOf([path], ZONE, w.bounds, w.labels);
  assert.equal(cut.days['2026-10-25'], 25);
  assert.equal(cut.days['2026-10-24'], 1);
  assert.equal(cut.count, 26);
  assert.throws(() => lastHoursOf([{ ...path, hours: undefined }], ZONE, w.bounds, w.labels), /gave no hours/);
});
