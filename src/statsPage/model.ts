// The ledger's numbers (stats.html): what GoatCounter counted for each path
// (lib/count.ts names them) worked into what the page shows. Pure, so the
// tests can feed it.

/** One path as GoatCounter's /stats/hits gives it: how often it was counted, all told and per day. */
export interface PathCount {
  path: string;
  event: boolean;
  count: number;
  /** Per day (YYYY-MM-DD), in the site's time zone. */
  days: Record<string, number>;
}

export type Mode = 'turns' | 'race' | 'delve';
export type Where = 'online' | 'hotseat';
export const MODES: readonly Mode[] = ['turns', 'race', 'delve'];
export const WHERES: readonly Where[] = ['online', 'hotseat'];
/** The party sizes count.ts sorts games into, fewest first. */
export const SIZES = ['1p', '2p', '3-4p', '5-8p', '9-12p'] as const;
export type Size = (typeof SIZES)[number];

export const MODE_NAMES: Record<Mode, string> = { turns: 'Take turns', race: 'Race', delve: 'Delve' };
export const WHERE_NAMES: Record<Where, string> = { online: 'Online', hotseat: 'Hot-seat' };
export const SIZE_NAMES: Record<Size, string> = { '1p': 'Alone', '2p': '2 players', '3-4p': '3 to 4', '5-8p': '5 to 8', '9-12p': '9 to 12' };

/** How a join started (count.ts JoinVia). */
export type Via = 'invite-link' | 'code' | 'open-rooms';
export const VIAS: readonly Via[] = ['invite-link', 'code', 'open-rooms'];
export const VIA_NAMES: Record<Via, string> = { 'invite-link': 'Invite link', code: 'Room code', 'open-rooms': 'Open rooms list' };

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
  sizes: Record<Size, number>;
}

export interface Ledger {
  days: string[];
  visitors: { total: number; perDay: number[] };
  games: { started: number; finished: number; perDay: number[]; rows: ModeRow[] };
  /** Delve runs by where they ended: every ten depths from 0 up to the deepest reached, as players see them. */
  delve: { total: number; ranges: { from: number; count: number }[] };
  daily: { right: number; wrong: number; rightPerDay: number[]; wrongPerDay: number[] };
  links: { invite: number; delve: number };
  joins: { via: Via; tried: number; joined: number }[];
  failures: { key: string; label: string; host: boolean; count: number }[];
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

export function ledgerOf(paths: PathCount[], days: string[]): Ledger {
  const byPath = new Map(paths.map((p) => [p.path, p]));
  const count = (path: string) => byPath.get(path)?.count ?? 0;
  const perDay = (match: (path: string) => boolean) => {
    const out = days.map(() => 0);
    for (const p of paths) if (match(p.path)) days.forEach((d, i) => (out[i] += p.days[d] ?? 0));
    return out;
  };

  const rows: ModeRow[] = [];
  for (const mode of MODES)
    for (const where of WHERES) {
      const key = `${mode}-${where}`;
      const sizes = Object.fromEntries(SIZES.map((s) => [s, count(`size/${key}-${s}`)])) as Record<Size, number>;
      const row = { mode, where, started: count(`play/${key}`), finished: count(`end/${key}`), sizes };
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
      perDay: perDay((p) => p.startsWith('play/')),
      rows,
    },
    delve: { total: delveRanges.reduce((n, r) => n + r.count, 0), ranges: delveRanges },
    daily: {
      right: count('daily/right'),
      wrong: count('daily/wrong'),
      rightPerDay: perDay((p) => p === 'daily/right'),
      wrongPerDay: perDay((p) => p === 'daily/wrong'),
    },
    links: { invite: count('open/invite-link'), delve: count('open/delve-link') },
    joins: VIAS.map((via) => ({ via, tried: count(`join/${via}`), joined: count(`joined/${via}`) })),
    failures,
  };
}

/** A mode over both places it's played: games started and finished, where, and how many played. */
export interface ModeSummary {
  mode: Mode;
  started: number;
  finished: number;
  online: number;
  hotseat: number;
  sizes: Record<Size, number>;
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
      sizes: Object.fromEntries(SIZES.map((s) => [s, sum((r) => r.sizes[s])])) as Record<Size, number>,
    };
  });
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
