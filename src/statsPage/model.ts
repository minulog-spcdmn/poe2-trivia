// Analytics' numbers (stats.html): what GoatCounter counted for each path
// (lib/count.ts names them) worked into what the page shows. Pure, so the
// tests can feed it.

import { DAILY_LAUNCH } from '../lib/dailyLaunch.ts';
import { addDays, midnight } from './zone.ts';
import { isoWeekOfDay, weekMonday } from '../lib/isoWeek.ts';

/** One path as GoatCounter's /stats/hits gives it: how often it was counted, all told and per day. */
export interface PathCount {
  path: string;
  event: boolean;
  count: number;
  /** Per day (YYYY-MM-DD), in the site's time zone. */
  days: Record<string, number>;
  /** Per day as `days`, its 24 hours (from the day's midnight there), where GoatCounter gave them. */
  hours?: Record<string, number[]>;
}

export type Mode = 'turns' | 'race' | 'delve';
export const MODES: readonly Mode[] = ['turns', 'race', 'delve'];
/**
 * How many played a game: exactly (`from` = `to`, "size/race-5p"), or,
 * counted before sizes were exact, a range ("size/race-online-5-8p").
 */
export interface PartySize {
  from: number;
  to: number;
}
/** "5", or "5–8" for an older range. */
export const sizeName = (s: PartySize) => (s.from === s.to ? String(s.from) : `${s.from}–${s.to}`);
const sizeKey = (s: PartySize) => `${s.from}-${s.to}`;
/** Exact sizes first, fewest first; a range after them, by where it starts. */
const bySize = (a: PartySize, b: PartySize) => Number(a.from !== a.to) - Number(b.from !== b.to) || a.from - b.from || a.to - b.to;

export const MODE_NAMES: Record<Mode, string> = { turns: 'Take turns', race: 'Race', delve: 'Delve' };

/** How a join started (count.ts JoinVia). */
export type Via = 'invite-link' | 'code' | 'open-rooms';
export const VIAS: readonly Via[] = ['invite-link', 'code', 'open-rooms'];
export const VIA_NAMES: Record<Via, string> = { 'invite-link': 'Invite link', code: 'Room code', 'open-rooms': 'Open rooms' };

/**
 * The steps a visit reached (count.ts countReach, "reach/…"), each counted
 * once a visitor like visits, only on a device with a seat in the game (not
 * a spectator's): loaded the page (every load that counts, reloads too: what
 * the others are a share of), entered a game (a lobby, or straight into a
 * Delve run), started one, saw one decided, started a second and a fifth in
 * one page load, had the game on screen 2, 10 and 30 minutes in one page
 * load, opened the codex, the achievements.
 */
export const REACHES = ['page', 'lobby', 'played', 'finished', 'games-2', 'games-5', 'time-2m', 'time-10m', 'time-30m', 'codex', 'achievements'] as const;
export type Reach = (typeof REACHES)[number];
/** The first steps again, counted only in a page load whose visit found no save on the device ("new/…"): how far a first visit gets. */
export const FIRSTS = ['acted', 'create', 'host', 'room', 'solo', 'daily', 'practice', 'identify', 'lobby', 'played', 'finished', 'games-2', 'games-5'] as const;
export type First = (typeof FIRSTS)[number];
/**
 * The first steps counted later than the rest (count.ts NEWCOMER_STEPS), in
 * the groups that came together: from 2026-10-28, then the Daily's IDENTIFY
 * MORE, then a second and fifth game. Each group a share of the visits from the day it was first counted,
 * not from the first "visit/new".
 */
export const LATER_FIRSTS: readonly (readonly First[])[] = [['acted', 'create', 'host', 'room', 'solo', 'daily', 'practice'], ['identify'], ['games-2', 'games-5']];

/**
 * How long since a visitor coming back last played on that device
 * ("visit/back-…"): 8 to 24 hours, 2 to 7 days, 8 to 30, longer. Played less
 * than 8 hours ago, a visit says nothing (GoatCounter's visit is still open).
 */
export const RETURNS = ['back-1d', 'back-7d', 'back-30d', 'back-later'] as const;
export type Return = (typeof RETURNS)[number];
export const RETURN_NAMES: Record<Return, string> = {
  'back-1d': 'Back after 8 to 24 hours',
  'back-7d': 'Back after 2 to 7 days',
  'back-30d': 'Back after 8 to 30 days',
  'back-later': 'Back after longer',
};
/**
 * What a visit came with ("visit/…"), once a visitor like visits: no save on
 * the device ("new": a first visit, a private window, or a save the browser
 * cleared, as Safari does after about a week away), back after so long, or
 * opened as the installed app.
 */
export const VISIT_KINDS = ['new', ...RETURNS, 'app'] as const;
export type VisitKind = (typeof VISIT_KINDS)[number];

// The weeks' rules are the game's own (lib/isoWeek.ts), so a cohort it names is read back to the same Monday.
export { isoWeekOfDay as isoWeek, weekMonday };

/**
 * Those who first played in one week ("cohort/2026-W43", sent with a visit
 * from a device whose save began that week): how many first played then
 * (their "new/played", where the period holds that whole week), and their
 * visits in each week since, the first week its own (index 0).
 *
 * From 2026-10-28 a cohort is sent only beside a "visit/back-…" (count.ts
 * visitMarks); before, a page opened again within eight hours of the last
 * play sent it too, so a week's visits back read higher. A first week (and
 * any week) before that date doesn't compare with one after.
 */
export interface Cohort {
  week: string;
  monday: string;
  started: number | null;
  /** Each week from the first on, up to the period's last; null for a week before the period. */
  weeks: (number | null)[];
}

/**
 * A game's path under the name it has now: games were once counted online
 * and hot-seat apart ("play/race-online", "size/delve-hotseat-2p",
 * "end/turns-online"), and are now by mode alone ("play/race").
 */
export const currentName = (path: string) => path.replace(/^(play|end|size)\/(turns|race|delve)-(?:online|hotseat)(?=$|-)/, '$1/$2');

/** Two paths' hours added up: only where both have them, or the one without has nothing to add. */
function hoursTogether(a: PathCount, b: PathCount): Pick<PathCount, 'hours'> {
  if (a.hours && b.hours) {
    const hours: Record<string, number[]> = { ...a.hours };
    for (const [day, hs] of Object.entries(b.hours)) hours[day] = hs.map((n, h) => n + (hours[day]?.[h] ?? 0));
    return { hours };
  }
  const kept = !a.hours ? (a.count ? null : b) : b.count ? null : a;
  return kept?.hours ? { hours: kept.hours } : {};
}

/** Paths counted under an older name (currentName) added to the one they have now, so a period across the change reads as one. */
export function underNamesNow(paths: PathCount[]): PathCount[] {
  const out = new Map<string, PathCount>();
  for (const p of paths) {
    const name = currentName(p.path);
    const had = out.get(name);
    if (!had) {
      out.set(name, { ...p, path: name });
      continue;
    }
    const days = { ...had.days };
    for (const [d, n] of Object.entries(p.days)) days[d] = (days[d] ?? 0) + n;
    out.set(name, { path: name, event: had.event, count: had.count + p.count, days, ...hoursTogether(had, p) });
  }
  return [...out.values()];
}

/** What each counted failure (count.ts Failure) means, in a line; `host`: on the side opening a room; `script`: no part of joining, an error in the game's own scripts. */
export const FAILURES: Record<string, { label: string; host?: true; script?: true }> = {
  'join-no-answer': { label: "The room didn't answer" },
  'join-no-such-room': { label: 'No room with that code' },
  'join-refused': { label: 'Turned down: full, locked or a name' },
  'join-version-mismatch': { label: 'Different game versions' },
  'join-turned-away': { label: 'The room dropped the connection' },
  'join-no-connection': { label: "Couldn't reach the matchmaking server" },
  'host-no-connection': { label: "Couldn't reach the matchmaking server", host: true },
  'host-room-not-opened': { label: "The room couldn't be opened", host: true },
  'host-room-not-reopened': { label: "The room couldn't be reopened after a reload", host: true },
  script: { label: "An error in the game's own scripts", script: true },
};

export interface ModeRow {
  mode: Mode;
  started: number;
  finished: number;
  /** Of those started, the games with players seated at the host's own screen ("screen/turns"), hot-seat games before that was counted with them. */
  screen: number;
  sizes: (PartySize & { count: number })[];
  /** The names its starts were counted under in the period, older ones too (currentName): what GoatCounter is asked for them by. */
  paths: string[];
}

export interface Counts {
  days: string[];
  visitors: { total: number; perDay: number[] };
  games: { started: number; finished: number; perDay: number[]; finishedPerDay: number[]; rows: ModeRow[] };
  /** Delve runs by where they ended: every ten depths from 0 up to the deepest reached, as players see them. */
  delve: { total: number; ranges: { from: number; count: number }[] };
  /** Today's unique's answers, named and missed, by the game's (UTC) days when the hours were there to sort them (utcPerDay). */
  daily: { right: number; wrong: number; rightPerDay: number[]; wrongPerDay: number[] };
  links: { invite: number; delve: number };
  joins: { via: Via; tried: number; joined: number }[];
  /** Tries to join, and those let in, a day, every way in together. */
  joinsPerDay: { tried: number[]; joined: number[] };
  failures: { key: string; label: string; host: boolean; script: boolean; count: number }[];
  /** The failures joining a room or opening one a day, every cause together (not the scripts' errors). */
  failuresPerDay: number[];
  /** The steps visits reached, a day each, counted once a visitor like visits (count.ts countReach). */
  reach: Record<Reach, number[]>;
  /** What visits came with, a day each (new, back after so long, the installed app), counted once a visitor like visits. */
  visits: Record<VisitKind, number[]>;
  /** The first steps in a visit that found no save, a day each ("new/…"). */
  firsts: Record<First, number[]>;
  /** Those who first played in a week, and their visits each week since, oldest week first. */
  cohorts: Cohort[];
  /** Devices paired for sync. */
  sync: { paired: number };
  /** Visits and games started by weekday (Monday first) and hour in the account's zone (weekHours), null where GoatCounter gave no hours; `until`: the last day's hours taken, those before it (null: all of them). */
  week: { visitors: number[][] | null; games: number[][] | null; until: number | null };
  /**
   * What a usual day of the period had by the time the last one has reached
   * (usualByNow): visits, games started, and Today's unique's answers by its
   * own UTC day and hour. Null without the hours, or the time.
   */
  usual: { visitors: number | null; games: number | null; answers: number | null };
  /**
   * Today's unique on the game's day it is now (the UTC day at that time),
   * named and missed so far (gameDayOf): in a zone behind UTC, the evening
   * is already the next game day, which `daily`'s days don't hold. Null
   * without the hours, or the time.
   */
  gameDay: { day: string; right: number; wrong: number } | null;
}

/** Monday 0 to Sunday 6, of a day (YYYY-MM-DD). */
export const weekday = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Paths' counts by weekday and hour: 7 rows (Monday first) of 24 hours, as
 * GoatCounter counted them in the account's zone, only `days` taken, and of
 * the last of them only the hours before `until` (the hour it is now: the
 * rest hasn't happened, or is still going). Null when a path with counts
 * came without its hours. (On a day the clocks change, the hours after the
 * change sit an hour off.)
 */
export function weekHours(paths: PathCount[], days: string[], until: number | null = null): number[][] | null {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const wanted = new Set(days);
  const last = days[days.length - 1];
  for (const p of paths) {
    if (!p.hours) {
      if (p.count > 0) return null;
      continue;
    }
    for (const [day, hours] of Object.entries(p.hours)) if (wanted.has(day)) hours.forEach((n, h) => (day !== last || until === null || h < until) && (grid[weekday(day)][h] += n));
  }
  return grid;
}

/** How much of an hour that began `start` hours in has passed by `until` hours in: its share of what the hour brought. */
const hadOf = (start: number, until: number) => Math.min(1, Math.max(0, until - start));

/** The whole days a usual day is the average of (countsOf), the latest: four of each weekday. */
export const USUAL_DAYS = 28;

/**
 * What `paths` had on a usual day of `days` by `until` hours in (the time
 * it is now, so a part of an hour: of the hour it's in, as much as has
 * passed): the average, over every day but the last (still going). Null
 * when a path with counts came without its hours, or with no whole day to
 * average. A day from today against one day a period ago swings with every
 * few visits; against the period's usual day it says whether today is busy.
 */
export function usualByNow(paths: PathCount[], days: string[], until: number | null): number | null {
  const whole = days.slice(0, -1);
  if (until === null || !whole.length) return null;
  let sum = 0;
  for (const p of paths) {
    if (!p.hours) {
      if (p.count > 0) return null;
      continue;
    }
    for (const d of whole) (p.hours[d] ?? []).forEach((n, h) => (sum += n * hadOf(h, until)));
  }
  return sum / whole.length;
}

/** The time the last of `days` has reached `until` hours in, in `zone`. */
const timeOf = (zone: string, days: string[], until: number) => midnight(zone, days[days.length - 1]).getTime() + until * 3_600_000;
const utcDayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Hours since its UTC midnight, of a time. */
const utcHoursOf = (t: number) => (t - Date.parse(`${utcDayOf(t)}T00:00:00Z`)) / 3_600_000;

/**
 * usualByNow on UTC days, as Today's unique is counted (utcPerDay): what a
 * whole UTC day of `days` from `from` on had by the UTC time it is now (the
 * last day's `until` hours in, in `zone`). Only a UTC day read from its
 * start: in a zone behind UTC, the first began before the read did.
 */
export function usualByNowUtc(p: PathCount | undefined, days: string[], zone: string, until: number | null, from = ''): number | null {
  if (until === null || !days.length) return null;
  const now = timeOf(zone, days, until);
  const today = utcDayOf(now);
  const read = midnight(zone, days[0]).getTime();
  const whole = new Set(days.filter((d) => d < today && d >= from && Date.parse(`${d}T00:00:00Z`) >= read));
  if (!whole.size) return null;
  if (!p) return 0;
  if (!p.hours) return p.count > 0 ? null : 0;
  const by = utcHoursOf(now);
  let sum = 0;
  for (const [day, hours] of Object.entries(p.hours)) {
    const start = midnight(zone, day).getTime();
    hours.forEach((n, h) => {
      const at = start + h * 3_600_000;
      if (n && whole.has(utcDayOf(at))) sum += n * hadOf(utcHoursOf(at), by);
    });
  }
  return sum / whole.size;
}

/** Today's unique's answers on the game's (UTC) day at the last day's `until` hours in, in `zone`, so far; null where a path came without its hours. */
function gameDayOf(right: PathCount | undefined, wrong: PathCount | undefined, days: string[], zone: string, until: number): Counts['gameDay'] {
  const now = timeOf(zone, days, until);
  const day = utcDayOf(now);
  const soFar = (p: PathCount | undefined) => {
    if (!p) return 0;
    if (!p.hours) return p.count > 0 ? null : 0;
    let n = 0;
    for (const [d, hours] of Object.entries(p.hours)) {
      const start = midnight(zone, d).getTime();
      hours.forEach((v, h) => {
        const at = start + h * 3_600_000;
        if (at < now && utcDayOf(at) === day) n += v;
      });
    }
    return n;
  };
  const r = soFar(right);
  const w = soFar(wrong);
  return r === null || w === null ? null : { day, right: r, wrong: w };
}

/** The first day anything was counted on (YYYY-MM-DD), or null: the days before it weren't quiet, they weren't counted. */
export function firstCounted(paths: PathCount[]): string | null {
  let first: string | null = null;
  for (const p of paths) for (const [d, n] of Object.entries(p.days)) if (n > 0 && (first === null || d < first)) first = d;
  return first;
}

/**
 * Where a period's counts start, and whether it's compared with the period
 * before, from the day counting began (firstCounted). The days before it
 * weren't counted, so they aren't zeros; and it was counted only from when
 * counting began, part of the day, so a period starts on the day after,
 * the first whole one (today at the latest), and compares only with a
 * period before that whole days fill from its first.
 */
export function countedSpan(began: string | null, from: string, fromBefore: string, today: string): { start: string; compare: boolean } {
  const whole = began === null ? null : addDays(began, 1) > today ? today : addDays(began, 1);
  return { start: whole !== null && whole > from ? whole : from, compare: whole !== null && whole <= fromBefore };
}

/** Every day from `from` to `to` (YYYY-MM-DD, both included). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const at = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (at <= end && out.length < 1000) {
    out.push(at.toISOString().slice(0, 10));
    at.setUTCDate(at.getUTCDate() + 1);
  }
  return out;
}

/**
 * A path's count on each of `days` taken as UTC days, the days Today's unique
 * asks by: each hour GoatCounter counted (in the account's `zone`) moved to
 * the UTC day it fell on, an hour outside `days` left out. Without its hours
 * (or a zone), by GoatCounter's own days. (On a day the clocks change, an
 * hour after the change may land an hour off.)
 */
export function utcPerDay(p: PathCount | undefined, days: string[], zone?: string): number[] {
  if (!p) return days.map(() => 0);
  if (!zone || !p.hours) return days.map((d) => p.days[d] ?? 0);
  const out = new Map(days.map((d) => [d, 0]));
  for (const [day, hours] of Object.entries(p.hours)) {
    const start = midnight(zone, day).getTime();
    hours.forEach((n, h) => {
      const utc = new Date(start + h * 3_600_000).toISOString().slice(0, 10);
      if (n && out.has(utc)) out.set(utc, out.get(utc)! + n);
    });
  }
  return days.map((d) => out.get(d)!);
}

/**
 * `zone`: the account's time zone, which GoatCounter cuts its days in; Today's
 * unique is counted by UTC days with it (utcPerDay). `until`: the hours the
 * last day has reached there (it's still going; a part of the one it's in
 * too), so the week's hours take only the whole ones before it (weekHours),
 * and a usual day is had to then (usualByNow).
 */
export function countsOf(counted: PathCount[], days: string[], zone?: string, until: number | null = null): Counts {
  // Each path's total over these days alone, not all the call asked for: a period held at where counting began starts after it (countedSpan). GoatCounter's total is its days' sum.
  const windowed = counted.map((p): PathCount => ({ ...p, count: days.reduce((n, d) => n + (p.days[d] ?? 0), 0) }));
  const paths = underNamesNow(windowed);
  const hour = until === null ? null : Math.floor(until);
  const byPath = new Map(paths.map((p) => [p.path, p]));
  const count = (path: string) => byPath.get(path)?.count ?? 0;
  const perDay = (match: (path: string) => boolean) => {
    const out = days.map(() => 0);
    for (const p of paths) if (match(p.path)) days.forEach((d, i) => (out[i] += p.days[d] ?? 0));
    return out;
  };

  const played = new Set(MODES.map((mode) => `play/${mode}`));
  // Games once played hot-seat (`play/<mode>-hotseat`) were all at one screen: counted as such on the days before "screen/…" was.
  const screens = days.findIndex((d) => paths.some((p) => p.path.startsWith('screen/') && (p.days[d] ?? 0) > 0));
  const hotSeat = (mode: Mode) => {
    const old = counted.find((p) => p.path === `play/${mode}-hotseat`);
    return old ? days.slice(0, screens < 0 ? days.length : screens).reduce((n, d) => n + (old.days[d] ?? 0), 0) : 0;
  };
  const rows: ModeRow[] = [];
  for (const mode of MODES) {
    const sizes: ModeRow['sizes'] = [];
    for (const p of paths) {
      if (!p.path.startsWith(`size/${mode}-`) || p.count <= 0) continue;
      const m = /^(\d+)(?:-(\d+))?p$/.exec(p.path.slice(`size/${mode}-`.length));
      if (m) sizes.push({ from: Number(m[1]), to: Number(m[2] ?? m[1]), count: p.count });
    }
    const names = windowed.filter((p) => p.count > 0 && currentName(p.path) === `play/${mode}`).map((p) => p.path);
    const row = { mode, started: count(`play/${mode}`), finished: count(`end/${mode}`), screen: count(`screen/${mode}`) + hotSeat(mode), sizes: sizes.sort(bySize), paths: names };
    if (row.started || row.finished) rows.push(row);
  }

  // Every depth counted stands, even on a day with more depths than ends: before events went without a session (Oct 16 2026), a player's runs in one evening counted end/delve once but each range they ended in once.
  const ranges = new Map<number, number>();
  for (const p of paths) {
    const m = /^delve\/depth-(\d+)-\d+$/.exec(p.path);
    if (!m || p.count <= 0) continue;
    const from = Number(m[1]);
    ranges.set(from, (ranges.get(from) ?? 0) + p.count);
  }
  const deepest = Math.max(-1, ...ranges.keys());
  const delveRanges = deepest < 0 ? [] : Array.from({ length: deepest / 10 + 1 }, (_, i) => ({ from: i * 10, count: ranges.get(i * 10) ?? 0 }));

  const failures = paths
    .filter((p) => p.path.startsWith('error/') && p.count > 0)
    .map((p) => {
      const key = p.path.slice('error/'.length);
      const known = FAILURES[key];
      return { key, label: known?.label ?? key, host: !!known?.host || key.startsWith('host-'), script: !!known?.script, count: p.count };
    })
    .sort((a, b) => b.count - a.count);

  return {
    days,
    visitors: { total: count('/'), perDay: perDay((p) => p === '/') },
    games: {
      started: rows.reduce((n, r) => n + r.started, 0),
      finished: rows.reduce((n, r) => n + r.finished, 0),
      // The modes it knows, as started and finished are: a path from elsewhere would make them disagree.
      perDay: perDay((p) => played.has(p)),
      finishedPerDay: perDay((p) => p.startsWith('end/') && played.has(`play/${p.slice('end/'.length)}`)),
      rows,
    },
    delve: { total: delveRanges.reduce((n, r) => n + r.count, 0), ranges: delveRanges },
    daily: (() => {
      const rightPerDay = utcPerDay(byPath.get('daily/right'), days, zone);
      const wrongPerDay = utcPerDay(byPath.get('daily/wrong'), days, zone);
      const sum = (vs: number[]) => vs.reduce((n, v) => n + v, 0);
      return { right: sum(rightPerDay), wrong: sum(wrongPerDay), rightPerDay, wrongPerDay };
    })(),
    links: { invite: count('open/invite-link'), delve: count('open/delve-link') },
    joins: VIAS.map((via) => ({ via, tried: count(`join/${via}`), joined: count(`joined/${via}`) })),
    joinsPerDay: {
      tried: perDay((p) => VIAS.some((via) => p === `join/${via}`)),
      joined: perDay((p) => VIAS.some((via) => p === `joined/${via}`)),
    },
    failures,
    failuresPerDay: perDay((p) => p.startsWith('error/') && !FAILURES[p.slice('error/'.length)]?.script),
    reach: Object.fromEntries(REACHES.map((r) => [r, perDay((p) => p === `reach/${r}`)])) as Record<Reach, number[]>,
    visits: Object.fromEntries(VISIT_KINDS.map((k) => [k, perDay((p) => p === `visit/${k}`)])) as Record<VisitKind, number[]>,
    firsts: Object.fromEntries(FIRSTS.map((s) => [s, perDay((p) => p === `new/${s}`)])) as Record<First, number[]>,
    // (By UTC days, as a cohort's week is of its first answer's UTC time, where the hours came to sort them.)
    cohorts: cohortsOf(paths, days, utcPerDay(byPath.get('new/saved'), days, zone)),
    sync: { paired: count('sync/paired') },
    week: {
      visitors: weekHours(paths.filter((p) => p.path === '/'), days, hour),
      games: weekHours(paths.filter((p) => played.has(p.path)), days, hour),
      until: hour,
    },
    usual: (() => {
      // The last USUAL_DAYS whole days, not the whole period: on a quarter or a year, a game that grows would be busier than usual every day.
      const recent = days.slice(-(USUAL_DAYS + 1));
      const answers = (p: PathCount | undefined) => (zone ? usualByNowUtc(p, recent, zone, until, DAILY_FROM) : null);
      const right = answers(byPath.get('daily/right'));
      const wrong = answers(byPath.get('daily/wrong'));
      return {
        visitors: usualByNow(paths.filter((p) => p.path === '/'), recent, until),
        games: usualByNow(paths.filter((p) => played.has(p.path)), recent, until),
        answers: right === null || wrong === null ? null : right + wrong,
      };
    })(),
    gameDay: zone && until !== null ? gameDayOf(byPath.get('daily/right'), byPath.get('daily/wrong'), days, zone, until) : null,
  };
}

/**
 * The weeks' cohorts counted over `days` ("cohort/…"), oldest first;
 * `joined`: the newcomers whose save got its first item each day
 * ("new/saved", what puts them in a week), counted from its first day. A
 * week that had newcomers and none back since is a row of noughts.
 */
function cohortsOf(paths: PathCount[], days: string[], joined: number[]): Cohort[] {
  const counting = joined.findIndex((n) => n > 0);
  // The first day visits were told apart: any visit told new or back, or a cohort's (sent with them), so a quiet start of new visitors isn't taken for none counted.
  const told = days.findIndex((d) => paths.some((p) => (p.path.startsWith('visit/') || p.path.startsWith('cohort/')) && (p.days[d] ?? 0) > 0));
  const rowOf = (week: string, monday: string, p: PathCount | null): Cohort => {
    const from = Date.parse(`${monday}T12:00:00Z`);
    const weekOf = (d: string) => Math.floor((Date.parse(`${d}T12:00:00Z`) - from) / (7 * 86_400_000));
    // Up to the period's last week; a week the period holds none of, or one over before visits were told apart (none of it counted), null.
    const weeks: (number | null)[] = Array.from({ length: Math.max(0, weekOf(days[days.length - 1]) + 1) }, () => null);
    for (const [i, d] of days.entries()) {
      const k = weekOf(d);
      if (k >= 0 && told >= 0 && i >= told) weeks[k] = (weeks[k] ?? 0) + (p?.days[d] ?? 0);
    }
    // Only a week the period holds from its Monday, counted from then: one cut short would look small, its cells far over 100%.
    const at = days.indexOf(monday);
    const started = at < 0 || counting < 0 || counting > at ? null : joined.slice(at, at + 7).reduce((n, v) => n + v, 0);
    return { week, monday, started, weeks };
  };
  const out = new Map<string, Cohort>();
  for (const p of paths) {
    const week = p.path.startsWith('cohort/') ? p.path.slice('cohort/'.length) : '';
    const monday = weekMonday(week);
    if (monday && p.count > 0) out.set(week, rowOf(week, monday, p));
  }
  for (const [i, d] of days.entries()) {
    const week = isoWeekOfDay(d);
    if (i < counting || counting < 0 || weekMonday(week) !== d || out.has(week)) continue;
    const row = rowOf(week, d, null);
    if (row.started) out.set(week, row);
  }
  return [...out.values()].sort((a, b) => a.monday.localeCompare(b.monday));
}

/**
 * A weekHours grid as an hour's average on that weekday: each hour over how
 * many of `days` had it on that weekday (a month has four or five of each),
 * the last day only for its hours before `until` (weekHours). Null for an
 * hour no day has had yet (a week's today, later than now).
 */
export function weekAverage(grid: number[][], days: string[], until: number | null = null): (number | null)[][] {
  const many = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  days.forEach((d, i) => {
    for (let h = 0; h < 24; h++) if (i < days.length - 1 || until === null || h < until) many[weekday(d)][h]++;
  });
  return grid.map((row, wd) => row.map((n, h) => (many[wd][h] ? n / many[wd][h] : null)));
}

/**
 * A weekHours grid as one usual day: each hour's average over every one of
 * `days` that had it (the last only before `until`, weekHours), the weekdays
 * together. Null for an hour none had yet.
 */
export function dayAverageHours(grid: number[][], days: string[], until: number | null = null): (number | null)[] {
  return Array.from({ length: 24 }, (_, h) => {
    const many = days.filter((_, i) => i < days.length - 1 || until === null || h < until).length;
    return many ? grid.reduce((n, row) => n + row[h], 0) / many : null;
  });
}

/** The busiest hour of a grid: its weekday (Monday 0), hour and figure, or null with nothing in it. */
export function busiest(grid: (number | null)[][]): { day: number; hour: number; value: number } | null {
  let best: { day: number; hour: number; value: number } | null = null;
  grid.forEach((row, day) => row.forEach((value, hour) => value !== null && value > (best?.value ?? 0) && (best = { day, hour, value })));
  return best;
}

/**
 * Seats taken in games: every game's players added up, the people a period's
 * games brought together (one player in three games is three). An older
 * range of sizes counts by its middle. `games`: those whose size is known.
 */
export function seatsOf(rows: ModeRow[]): { seats: number; games: number } {
  let seats = 0;
  let games = 0;
  for (const r of rows)
    for (const s of r.sizes) {
      seats += ((s.from + s.to) / 2) * s.count;
      games += s.count;
    }
  return { seats: Math.round(seats), games };
}

/** A mode's games: started, finished, and those with players at the host's own screen. Every mode, played or not. */
export interface ModeSummary {
  mode: Mode;
  started: number;
  finished: number;
  screen: number;
}

export function modesOf(rows: ModeRow[]): ModeSummary[] {
  return MODES.map((mode) => {
    const r = rows.find((x) => x.mode === mode);
    return { mode, started: r?.started ?? 0, finished: r?.finished ?? 0, screen: r?.screen ?? 0 };
  });
}

/** One size of party (or an older range of them) and how many games each mode had of it. */
export interface SizeRow extends PartySize {
  modes: Record<Mode, number>;
  total: number;
}

/** Games by how many played them, a row for each size that came up, fewest first (older ranges last). */
export function sizesOf(rows: ModeRow[]): SizeRow[] {
  const out = new Map<string, SizeRow>();
  for (const r of rows)
    for (const s of r.sizes) {
      const row = out.get(sizeKey(s)) ?? { from: s.from, to: s.to, modes: { turns: 0, race: 0, delve: 0 }, total: 0 };
      row.modes[r.mode] += s.count;
      row.total += s.count;
      out.set(sizeKey(s), row);
    }
  return [...out.values()].sort(bySize);
}

/** Each ten depths of the descent: how many runs got there (ended there or deeper) and how many ended there. */
export function descentOf(ranges: { from: number; count: number }[]): { from: number; reached: number; ended: number }[] {
  let below = ranges.reduce((n, r) => n + r.count, 0);
  return ranges.map((r) => {
    const reached = below;
    below -= r.count;
    return { from: r.from, reached, ended: r.count };
  });
}

/**
 * Days grouped `size` at a time, the last group ending on the last day (so
 * the newest is whole): each group's first day and sum. A short first group
 * (a series begun inside the period, as Today's unique's) is left out where
 * there are whole ones: three days' sum among weeks would read as a slump.
 */
export function grouped(days: string[], values: number[], size: number): { days: string[]; values: number[] } {
  if (size <= 1) return { days, values };
  const out = { days: [] as string[], values: [] as number[] };
  for (let end = days.length; end > 0; end -= size) {
    if (end < size && out.days.length) break;
    const start = Math.max(0, end - size);
    out.days.unshift(days[start]);
    out.values.unshift(values.slice(start, end).reduce((n, v) => n + v, 0));
  }
  return out;
}

/** The depth range a run ends in by the middle of all runs (half end there or shallower), or null with none. */
export function medianRange(ranges: { from: number; count: number }[]): number | null {
  const total = ranges.reduce((n, r) => n + r.count, 0);
  if (!total) return null;
  let seen = 0;
  for (const r of ranges) {
    seen += r.count;
    if (seen * 2 >= total) return r.from;
  }
  return null;
}

/** Phone or computer, by the system GoatCounter names. */
export function deviceOf(system: string): 'Phone or tablet' | 'Computer' | 'Other' {
  const s = system.toLowerCase();
  if (/ios|ipados|android|harmony|kaios/.test(s)) return 'Phone or tablet';
  if (/windows|mac|linux|chrome ?os|ubuntu|fedora|freebsd/.test(s)) return 'Computer';
  return 'Other';
}

/**
 * A share per day as a whole percent, a day with nothing to share taking the
 * one before (0 before any). At most 100: games started late finish the next
 * day, which can have more finished than started.
 */
export function sharePerDay(part: number[], whole: number[]): number[] {
  let last = 0;
  return whole.map((w, i) => (last = w > 0 ? Math.min(100, Math.round((100 * (part[i] ?? 0)) / w)) : last));
}

/** Of games started, the share played to the end, at most 100%: games started late in the period before can end in this one. */
export const finishedShare = (finished: number, started: number) => percent(Math.min(finished, started), started);

/** A share as a whole percent, "–" with nothing to share. */
export const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : '–');

/** A rate's change against the period before, in percentage points, or null when either had nothing to rate. */
export function pointsChange(part: number, whole: number, partBefore: number, wholeBefore: number): number | null {
  if (!whole || !wholeBefore) return null;
  return Math.round((100 * part) / whole - (100 * partBefore) / wholeBefore);
}

/** A change against the period before, as a signed whole percent, or null when there was nothing before. */
export function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round((100 * (now - before)) / before);
}

/** A day of Today's unique: how many answered (each player once), and the share who named the item, as a whole percent. */
export interface DailyDay {
  day: string;
  right: number;
  wrong: number;
  answers: number;
  named: number | null;
}

/** A figure a day on average over the whole days, the last (still going) left out; null with none whole. */
export const wholeDayAverage = (vs: number[]): number | null => (vs.length > 1 ? vs.slice(0, -1).reduce((n, v) => n + v, 0) / (vs.length - 1) : null);

/**
 * A figure a day on average, now and in the period before (wholeDayAverage),
 * and the counts behind the two, over as many whole days, to weigh their
 * change (Delta's `of`).
 */
export function dayAverages(now: number[], before: number[]): { now: number | null; before: number | null; of?: { now: number; before: number } } {
  const a = { now: wholeDayAverage(now), before: wholeDayAverage(before) };
  const whole = now.length - 1;
  return a.now !== null && a.before !== null ? { ...a, of: { now: a.now * whole, before: a.before * whole } } : a;
}

/** Today's unique's answers each day, named or missed. */
export const answersPerDay = (c: Counts): number[] => c.daily.rightPerDay.map((r, i) => r + (c.daily.wrongPerDay[i] ?? 0));

export function dailyDays(c: Counts): DailyDay[] {
  return c.days.map((day, i) => {
    const right = c.daily.rightPerDay[i] ?? 0;
    const wrong = c.daily.wrongPerDay[i] ?? 0;
    const answers = right + wrong;
    return { day, right, wrong, answers, named: answers ? Math.round((100 * right) / answers) : null };
  });
}

/** How many answers a day's share is drawn toward the usual one by (hardestAndEasiest): 3 players of 3 naming it says less than 30 of 30. */
const SURE_AFTER = 5;

/**
 * The hardest and easiest days' items, `top` of each: days with at least
 * `min` answers (none, if no day has so many), today left out as it's still
 * going, and only those named by far fewer (or more) than the days' usual
 * share would have, beyond what chance does with so few players (two
 * standard deviations of as many answers at the usual share): with three
 * players a day, every day's share is chance's. Ranked by the share who
 * named them drawn toward the usual share by SURE_AFTER answers, so a day
 * few played can't top the list on its own luck. More answers first
 * between equals.
 */
export function hardestAndEasiest(days: DailyDay[], min = 3, top = 5): { hardest: DailyDay[]; easiest: DailyDay[] } {
  const pool = days.slice(0, -1).filter((d) => d.answers >= Math.max(1, min));
  const answers = pool.reduce((n, d) => n + d.answers, 0);
  const usual = answers ? pool.reduce((n, d) => n + d.right, 0) / answers : 0;
  const weighed = (d: DailyDay) => (d.right + SURE_AFTER * usual) / (d.answers + SURE_AFTER);
  /** How far under (below 0) or over the usual share's count the day's named were, in standard deviations. */
  const off = (d: DailyDay) => {
    const spread = Math.sqrt(d.answers * usual * (1 - usual));
    const by = d.right - d.answers * usual;
    return spread ? by / spread : by ? Math.sign(by) * Infinity : 0;
  };
  const rank = (dir: 1 | -1) => pool.filter((d) => dir * off(d) <= -2).sort((a, b) => dir * (weighed(a) - weighed(b)) || b.answers - a.answers || a.day.localeCompare(b.day));
  return { hardest: rank(1).slice(0, top), easiest: rank(-1).slice(0, top) };
}

/** The first day Today's unique asked (YYYY-MM-DD). */
export const DAILY_FROM = new Date(DAILY_LAUNCH).toISOString().slice(0, 10);
/** Whether Today's unique asked on a day: it had begun. */
export const asked = (day: string) => day >= DAILY_FROM;

/**
 * Players of Today's unique a day on average, over the whole days it asked
 * (the last day, still going, left out first), or null with none: so a
 * period whose only day of it is that last one has nothing to compare.
 */
export function dailyAverage(c: Counts, from = DAILY_FROM): number | null {
  const days = dailyDays(c)
    .slice(0, -1)
    .filter((d) => d.day >= from);
  return days.length ? days.reduce((n, d) => n + d.answers, 0) / days.length : null;
}
