// Analytics' numbers (stats.html): what GoatCounter counted for each path
// (lib/count.ts names them) worked into what the page shows. Pure, so the
// tests can feed it.

import { DAILY_LAUNCH } from '../lib/dailyLaunch.ts';
import { midnight } from './zone.ts';

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
export const FIRSTS = ['lobby', 'played', 'finished'] as const;
export type First = (typeof FIRSTS)[number];

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

/** A day's ISO week ("2026-W43"). */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86_400_000);
  const year = thursday.getUTCFullYear();
  const week = 1 + Math.round((thursday.getTime() - firstThursday(year)) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
/** Noon of the year's first ISO Thursday (the one in the week of January 4th). */
const firstThursday = (year: number) => {
  const jan4 = Date.UTC(year, 0, 4, 12);
  return jan4 + (3 - ((new Date(jan4).getUTCDay() + 6) % 7)) * 86_400_000;
};
/** The Monday an ISO week ("2026-W43") begins (YYYY-MM-DD), or null for a name that isn't one. */
export function weekMonday(week: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 53) return null;
  return new Date(firstThursday(Number(m[1])) + ((Number(m[2]) - 1) * 7 - 3) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Those who first played in one week ("cohort/2026-W43", sent with a visit
 * from a device whose save began that week): how many first played then
 * (their "new/played", where the period holds that whole week), and their
 * visits in each week since, the first week its own (index 0).
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
  /** Visits and games started by weekday (Monday first) and hour in the account's zone (weekHours), null where GoatCounter gave no hours. */
  week: { visitors: number[][] | null; games: number[][] | null };
}

/** Monday 0 to Sunday 6, of a day (YYYY-MM-DD). */
export const weekday = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Paths' counts by weekday and hour: 7 rows (Monday first) of 24 hours, as
 * GoatCounter counted them in the account's zone, only `days` taken. Null
 * when a path with counts came without its hours. (On a day the clocks
 * change, the hours after the change sit an hour off.)
 */
export function weekHours(paths: PathCount[], days: string[]): number[][] | null {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const wanted = new Set(days);
  for (const p of paths) {
    if (!p.hours) {
      if (p.count > 0) return null;
      continue;
    }
    for (const [day, hours] of Object.entries(p.hours)) if (wanted.has(day)) hours.forEach((n, h) => (grid[weekday(day)][h] += n));
  }
  return grid;
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

/** `zone`: the account's time zone, which GoatCounter cuts its days in; Today's unique is counted by UTC days with it (utcPerDay). */
export function countsOf(counted: PathCount[], days: string[], zone?: string): Counts {
  const paths = underNamesNow(counted);
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
    const names = counted.filter((p) => p.count > 0 && currentName(p.path) === `play/${mode}`).map((p) => p.path);
    const row = { mode, started: count(`play/${mode}`), finished: count(`end/${mode}`), screen: count(`screen/${mode}`) + hotSeat(mode), sizes: sizes.sort(bySize), paths: names };
    if (row.started || row.finished) rows.push(row);
  }

  const ranges = new Map<number, number>();
  for (const p of paths) {
    const m = /^delve\/depth-(\d+)-\d+$/.exec(p.path);
    if (m && p.count > 0) ranges.set(Number(m[1]), (ranges.get(Number(m[1])) ?? 0) + p.count);
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
    cohorts: cohortsOf(paths, days, perDay((p) => p === 'new/played'), perDay((p) => p === 'visit/new')),
    sync: { paired: count('sync/paired') },
    week: {
      visitors: weekHours(paths.filter((p) => p.path === '/'), days),
      games: weekHours(paths.filter((p) => played.has(p.path)), days),
    },
  };
}

/**
 * The weeks' cohorts counted over `days` ("cohort/…"), oldest first;
 * `started`: those who first played each day ("new/played"), counted from
 * the first day of `fresh` ("visit/new", which came with it).
 */
function cohortsOf(paths: PathCount[], days: string[], started: number[], fresh: number[]): Cohort[] {
  const counting = fresh.findIndex((n) => n > 0);
  const out: Cohort[] = [];
  for (const p of paths) {
    const week = p.path.startsWith('cohort/') ? p.path.slice('cohort/'.length) : '';
    const monday = weekMonday(week);
    if (!monday || p.count <= 0) continue;
    const from = Date.parse(`${monday}T12:00:00Z`);
    const weekOf = (d: string) => Math.floor((Date.parse(`${d}T12:00:00Z`) - from) / (7 * 86_400_000));
    // Up to the period's last week; a week the period holds none of, null.
    const weeks: (number | null)[] = Array.from({ length: Math.max(0, weekOf(days[days.length - 1]) + 1) }, () => null);
    for (const d of days) {
      const k = weekOf(d);
      if (k >= 0) weeks[k] = (weeks[k] ?? 0) + (p.days[d] ?? 0);
    }
    // Only a week the period holds from its Monday, counted from then: one cut short would look small, its cells far over 100%.
    const at = days.indexOf(monday);
    const sum = at < 0 || counting < 0 || counting > at ? null : started.slice(at, at + 7).reduce((n, v) => n + v, 0);
    out.push({ week, monday, started: sum, weeks });
  }
  return out.sort((a, b) => a.monday.localeCompare(b.monday));
}

/**
 * A weekHours grid as an hour's average on that weekday: each weekday's row
 * over how many of `days` fell on it (a month has four or five of each).
 */
export function weekAverage(grid: number[][], days: string[]): number[][] {
  const many = Array<number>(7).fill(0);
  for (const d of days) many[weekday(d)]++;
  return grid.map((row, wd) => row.map((n) => (many[wd] ? n / many[wd] : 0)));
}

/** The busiest hour of a grid: its weekday (Monday 0), hour and figure, or null with nothing in it. */
export function busiest(grid: number[][]): { day: number; hour: number; value: number } | null {
  let best: { day: number; hour: number; value: number } | null = null;
  grid.forEach((row, day) => row.forEach((value, hour) => value > (best?.value ?? 0) && (best = { day, hour, value })));
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

/** Days grouped `size` at a time, the last group ending on the last day (so the newest is whole): each group's first day and sum. */
export function grouped(days: string[], values: number[], size: number): { days: string[]; values: number[] } {
  if (size <= 1) return { days, values };
  const out = { days: [] as string[], values: [] as number[] };
  for (let end = days.length; end > 0; end -= size) {
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

/**
 * The hardest and easiest days' items, by the share who named them, `top` of
 * each: days with at least `min` answers (all days answered, if none has so
 * many), today left out as it's still going. More answers first between
 * equal shares; a day is in only one of the two.
 */
export function hardestAndEasiest(days: DailyDay[], min = 3, top = 5): { hardest: DailyDay[]; easiest: DailyDay[] } {
  const over = days.slice(0, -1).filter((d) => d.answers > 0);
  const pool = over.some((d) => d.answers >= min) ? over.filter((d) => d.answers >= min) : over;
  const rank = (dir: 1 | -1) => [...pool].sort((a, b) => dir * ((a.named ?? 0) - (b.named ?? 0)) || b.answers - a.answers || a.day.localeCompare(b.day));
  const hardest = rank(1).slice(0, Math.min(top, Math.ceil(pool.length / 2)));
  const easiest = rank(-1)
    .filter((d) => !hardest.includes(d))
    .slice(0, top);
  return { hardest, easiest };
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
