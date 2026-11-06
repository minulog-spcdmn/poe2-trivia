#!/usr/bin/env node
// Analytics' own health checks (stats.html: insights.ts troubleOf and
// healthOf, the same beyond-chance tests, no new ones) on yesterday against
// the 7 days before, once a day (.github/workflows/daily-health.yml). When
// one fires it says what, and fails, so GitHub emails the owner the failed
// run: a fault the counts show is mailed within a day, not found days later.
// A failed run means just that, a key GoatCounter refuses, or the check
// itself broken: a day GoatCounter can't be read passes with a warning on
// the run's page.
//
// It reads GoatCounter's API as Analytics does (hits.ts), asking with its
// own calls (api.ts's need the browser's storage): the account's time zone,
// then every path's days for one span, a page of 100 paths at a time. The
// days are the account's, cut at its zone's midnights as Analytics cuts them
// (zone.ts), and the counts are model.ts countsOf's over each window's days,
// so one read holds every window. GoatCounter takes 500 requests an hour and
// 4 a second, shared with the owner's stats page: calls go out a second
// apart, a 429 waits out its Retry-After, a 5xx or no answer is asked again
// later each time, and a run makes a handful (the zone and a few pages).
//
// Usage: GOATCOUNTER_KEY=<key> node --experimental-strip-types scripts/daily-health.mjs
//        GOATCOUNTER_KEY=<key> node --experimental-strip-types scripts/daily-health.mjs --backtest 60
// --backtest <days>: each of the last <days> days against the 7 before it,
// from one read, with a line for each day that would have mailed.
// Exits 1 when a check fires (not with --backtest), each fired line also an
// ::error:: annotation, so the run's page says why; 2 when GoatCounter
// refuses the key or the check breaks (a bug, or answers of a new shape),
// with an ::error::, or --backtest takes no number; 0 otherwise.
// GoatCounter not read (no answer, a 5xx or 429 past the retries, an answer
// that isn't JSON or doesn't add up) is 0 with a ::warning:: that the check
// couldn't run today; without GOATCOUNTER_KEY, 0 with a line saying so.

import { fileURLToPath } from 'node:url';
import { COUNTER_ORIGIN } from '../src/lib/counter.ts';
import { accountZone, pathCounts } from '../src/statsPage/hits.ts';
import { healthOf, troubleOf } from '../src/statsPage/insights.ts';
import { DEVICE_NAMES, countedSpan, countsOf, daysBetween, firstCounted } from '../src/statsPage/model.ts';
import { addDays, dayIn, midnight } from '../src/statsPage/zone.ts';

/** The days each day is held against. */
export const BEFORE = 7;
/** Between the starts of two calls: GoatCounter takes 4 a second, and the owner's page may be asking too. */
const APART_MS = 1000;
const TRIES = 4;
/** The longest Retry-After waited out: past it, the hour's 500 are spent and the run gives up. */
const LONGEST_WAIT_MS = 5 * 60_000;
/** The most days a backtest goes back (model.ts daysBetween stops at 1000). */
const MOST_DAYS = 365;

/** Why it couldn't check: never with the key or an address in it. */
export class CheckError extends Error {}
/** GoatCounter refused the key: the one reason not to check that fails the run. */
export class KeyRefused extends CheckError {}

/** A GitHub annotation line (`kind`: error or warning), shown on the run's page; its message escaped as GitHub reads them. */
const annotation = (kind, message) => `::${kind}::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`;

/** Seconds, or a date, as Retry-After gives them; null for neither. */
function retryAfter(value, now) {
  if (!value) return null;
  const s = Number(value);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/**
 * A GET of GoatCounter's API with `key`: one call at a time, APART_MS
 * between their starts; a 429 tried again after its Retry-After, no answer
 * or a 5xx later each time (TRIES in all, about ten seconds). `deps`: fetch,
 * sleep and the clock, so the tests can feed it. `calls`: how many went out.
 */
export function apiOf(key, { fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  let lastStart = -Infinity;
  const api = {
    calls: 0,
    async get(path, query = {}, tried = 0) {
      const wait = lastStart + APART_MS - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
      api.calls++;
      const url = `${COUNTER_ORIGIN}/api/v0${path}${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'poe2.quest daily health check' } }).catch(() => null);
      const again = async (ms) => {
        if (tried + 1 >= TRIES) return null;
        await sleep(ms);
        return api.get(path, query, tried + 1);
      };
      if (!res) {
        const r = await again(1500 * 2 ** tried);
        if (r) return r;
        throw new CheckError(`GoatCounter didn't answer (${path}).`);
      }
      if (res.status === 429) {
        const ms = retryAfter(res.headers.get('Retry-After'), now()) ?? 1500 * 2 ** tried;
        const r = ms <= LONGEST_WAIT_MS ? await again(Math.max(ms, APART_MS)) : null;
        if (r) return r;
        throw new CheckError(`GoatCounter asked to slow down (${path}): the hour's 500 requests may be spent.`);
      }
      if (res.status >= 500) {
        const r = await again(1500 * 2 ** tried);
        if (r) return r;
        throw new CheckError(`GoatCounter answered ${res.status} (${path}).`);
      }
      if (res.status === 401 || res.status === 403) throw new KeyRefused('GoatCounter turned the key down. It may have been deleted, or lack "Read statistics".');
      if (!res.ok) throw new CheckError(`GoatCounter answered ${res.status} (${path}).`);
      return res.json().catch(() => {
        throw new CheckError(`GoatCounter's answer wasn't JSON (${path}).`);
      });
    },
  };
  return api;
}

/**
 * The days to check at `at` in `zone`: the last `days` whole ones (to
 * yesterday), and the span read for them all, from the day before the
 * first one's 7 (as read.ts spansOf reads one more, so firstCounted tells
 * whether they were all counted) to just before today begins (GoatCounter
 * gives the hour a span ends in whole).
 */
export function windowsOf(zone, at, days = 1) {
  const today = dayIn(zone, at);
  const checked = daysBetween(addDays(today, -days), addDays(today, -1));
  const span = { start: midnight(zone, addDays(checked[0], -BEFORE - 1)), end: new Date(midnight(zone, today).getTime() - 1) };
  return { today, checked, span };
}

/**
 * `day` against the 7 before it, as the overview holds the period against
 * the one before (troubleOf, healthOf), only where those 7 were all counted
 * (read.ts compare): null where counting began too late.
 */
export function checkDay(paths, day, zone) {
  const fromBefore = addDays(day, -BEFORE);
  if (!countedSpan(firstCounted(paths), day, fromBefore, day).compare) return null;
  const now = countsOf(paths, [day], zone);
  const before = countsOf(paths, daysBetween(fromBefore, addDays(day, -1)), zone);
  return { day, trouble: troubleOf(now, before), health: healthOf(now, before) };
}

const round = (n) => (n >= 10 ? String(Math.round(n)) : n.toFixed(1));
const ERRORS = { script: "errors in the game's own scripts", chunk: "parts of the game that didn't load" };

/** What fired on a checked day, a short line each; none where nothing did. */
export function firedOf(c) {
  if (!c) return [];
  const out = [];
  for (const t of [c.trouble?.period, c.trouble?.today]) if (t) out.push(`joining failed ${t.failed} times, against ${round(t.expected)} usual for as many games and tries`);
  for (const e of c.health?.errors ?? []) out.push(`${ERRORS[e.key]}: ${e.count}, against ${round(e.expected)} usual for as many visits`);
  for (const s of c.health?.stutter ?? []) out.push(`${DEVICE_NAMES[s.device]}: ${round(s.share)}% of ${s.games} games stuttered, against ${round(s.before)}% before`);
  return out;
}

/** Reads and checks; the exit code. `deps`: fetch, sleep, the clock and where lines go, for the tests. */
export async function main(argv, env, deps = {}) {
  const log = deps.log ?? ((line) => console.log(line));
  const now = deps.now ?? (() => Date.now());
  const key = (env.GOATCOUNTER_KEY ?? '').trim();
  if (!key) {
    log('Daily health check is off: no GOATCOUNTER_KEY (set it as a repository secret to turn it on).');
    return 0;
  }
  const at = argv.indexOf('--backtest');
  const backtest = at >= 0 ? Number(argv[at + 1]) : null;
  if (backtest !== null && !(Number.isInteger(backtest) && backtest >= 1 && backtest <= MOST_DAYS)) {
    log(`--backtest takes a number of days, 1 to ${MOST_DAYS}.`);
    return 2;
  }
  const api = apiOf(key, { fetch: deps.fetch, sleep: deps.sleep, now });
  try {
    const zone = await accountZone(api.get);
    const { checked, span } = windowsOf(zone, new Date(now()), backtest ?? 1);
    const { paths, complete } = await pathCounts(api.get, span, zone, () => new CheckError("GoatCounter's list of paths didn't add up."), now);
    if (!complete) log('(More paths than GoatCounter gave in 10 pages: some were left out.)');
    const results = checked.map((day) => ({ day, check: checkDay(paths, day, zone) }));

    if (backtest === null) {
      const { day, check } = results[0];
      if (!check) {
        log(`Daily health check: ${day} not checked, counting began too late to hold it against the ${BEFORE} days before.`);
        return 0;
      }
      const fired = firedOf(check);
      if (!fired.length) {
        log(`Daily health check: ${day} as usual against the ${BEFORE} days before (${zone}).`);
        return 0;
      }
      log(`Daily health check: ${day} went worse than the ${BEFORE} days before (${zone}), beyond chance. See stats.html.`);
      for (const line of fired) log(`- ${line}`);
      for (const line of fired) log(annotation('error', `${day}: ${line}`));
      return 1;
    }

    let mailed = 0;
    let skipped = 0;
    for (const { day, check } of results) {
      if (!check) {
        skipped++;
        continue;
      }
      const fired = firedOf(check);
      if (!fired.length) continue;
      mailed++;
      log(`${day}: ${fired.join('; ')}`);
    }
    const of = results.length - skipped;
    log(`Backtest (${zone}): ${mailed} of ${of} days would have mailed${skipped ? ` (${skipped} before counting allowed a check)` : ''}; ${api.calls} requests.`);
    return 0;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    if (e instanceof KeyRefused) {
      log(annotation('error', `Daily health check: the GoatCounter key was refused. ${why}`));
      return 2;
    }
    // (GoatCounter not read today is no reason to mail; anything else is the check itself broken, a bug or answers of a new shape, and would warn every day unseen.)
    if (e instanceof CheckError) {
      log(annotation('warning', `Daily health check couldn't run today: ${why}`));
      return 0;
    }
    log(annotation('error', `Daily health check broke: ${why}`));
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2), process.env);
