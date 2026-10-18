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
export type Where = 'online' | 'hotseat';
export const MODES: readonly Mode[] = ['turns', 'race', 'delve'];
export const WHERES: readonly Where[] = ['online', 'hotseat'];
/**
 * How many played a game: exactly (`from` = `to`, "size/race-online-5p"), or,
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

/** What each counted failure (count.ts Failure) means, in a line; `host`: on the side opening a room. */
export const FAILURES: Record<string, { label: string; host?: true }> = {
  'join-no-answer': { label: "The room didn't answer" },
  'join-no-such-room': { label: 'No room with that code' },
  'join-refused': { label: 'Turned down: full, locked or a name' },
  'join-version-mismatch': { label: 'Different game versions' },
  'join-turned-away': { label: 'The room dropped the connection' },
  'join-no-connection': { label: "Couldn't reach the matchmaking server" },
  'host-no-connection': { label: "Couldn't reach the matchmaking server", host: true },
  'host-room-not-opened': { label: "The room couldn't be opened", host: true },
  'host-room-not-reopened': { label: "The room couldn't be reopened after a reload", host: true },
};

export interface ModeRow {
  mode: Mode;
  where: Where;
  started: number;
  finished: number;
  sizes: (PartySize & { count: number })[];
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
  failures: { key: string; label: string; host: boolean; count: number }[];
  /** Every failure a day, all causes together. */
  failuresPerDay: number[];
  /** The steps visits reached a day, counted once a visitor like visits (count.ts countReach): played a game, finished one. */
  reach: { playedPerDay: number[]; finishedPerDay: number[] };
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
export function countsOf(paths: PathCount[], days: string[], zone?: string): Counts {
  const byPath = new Map(paths.map((p) => [p.path, p]));
  const count = (path: string) => byPath.get(path)?.count ?? 0;
  const perDay = (match: (path: string) => boolean) => {
    const out = days.map(() => 0);
    for (const p of paths) if (match(p.path)) days.forEach((d, i) => (out[i] += p.days[d] ?? 0));
    return out;
  };

  const played = new Set(MODES.flatMap((mode) => WHERES.map((where) => `play/${mode}-${where}`)));
  const rows: ModeRow[] = [];
  for (const mode of MODES)
    for (const where of WHERES) {
      const key = `${mode}-${where}`;
      const sizes: ModeRow['sizes'] = [];
      for (const p of paths) {
        if (!p.path.startsWith(`size/${key}-`) || p.count <= 0) continue;
        const m = /^(\d+)(?:-(\d+))?p$/.exec(p.path.slice(`size/${key}-`.length));
        if (m) sizes.push({ from: Number(m[1]), to: Number(m[2] ?? m[1]), count: p.count });
      }
      const row = { mode, where, started: count(`play/${key}`), finished: count(`end/${key}`), sizes: sizes.sort(bySize) };
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
      return { key, label: known?.label ?? key, host: !!known?.host || key.startsWith('host-'), count: p.count };
    })
    .sort((a, b) => b.count - a.count);

  return {
    days,
    visitors: { total: count('/'), perDay: perDay((p) => p === '/') },
    games: {
      started: rows.reduce((n, r) => n + r.started, 0),
      finished: rows.reduce((n, r) => n + r.finished, 0),
      // The modes and places it knows, as started and finished are: a path from elsewhere would make them disagree.
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
    failuresPerDay: perDay((p) => p.startsWith('error/')),
    reach: { playedPerDay: perDay((p) => p === 'reach/played'), finishedPerDay: perDay((p) => p === 'reach/finished') },
    week: {
      visitors: weekHours(paths.filter((p) => p.path === '/'), days),
      games: weekHours(paths.filter((p) => played.has(p.path)), days),
    },
  };
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

/** A mode over both places it's played: games started and finished, and where. */
export interface ModeSummary {
  mode: Mode;
  started: number;
  finished: number;
  online: number;
  hotseat: number;
}

export function modesOf(rows: ModeRow[]): ModeSummary[] {
  return MODES.map((mode) => {
    const of = rows.filter((r) => r.mode === mode);
    const sum = (f: (r: ModeRow) => number) => of.reduce((n, r) => n + f(r), 0);
    return {
      mode,
      started: sum((r) => r.started),
      finished: sum((r) => r.finished),
      online: sum((r) => (r.where === 'online' ? r.started : 0)),
      hotseat: sum((r) => (r.where === 'hotseat' ? r.started : 0)),
    };
  });
}

/** One size of party (or an older range of them) and how many games each mode had of it, played anywhere. */
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
