// This browser's Delve runs: the deepest one alone and in a group (per
// ruleset, so a changed curve never compares old depths with new ones), every
// counted run as a tally of where it ended and where its lives went, how deep
// this browser has ever been, and the last runs in full. Kept in localStorage,
// like the codex (lib/codex.ts).
//
// The stored shape only grows: fields added later are optional and, when
// missing, filled in from what is there (records written before tallies
// existed get them from their runs and bests). The version only changes for a
// shape older builds would misread, since a build that can't read the records
// starts them over and would lose the bests.

import { DELVE_LIVES, DELVE_RULESET, fellAt, isGroupRun } from './delve.ts';
import type { GameState } from './game.ts';

export const DELVE_RECORD_KEY = 'poe2trivia.delve';
const VERSION = 1;
/** Runs kept in the list (bests and tallies are kept apart, however old). */
export const RUN_LIMIT = 40;

export interface DelveRun {
  /** The run's start on the host's clock: one run, however often it is recorded. */
  id: number;
  /** When it was recorded (this browser's clock). */
  at: number;
  /** Where this player fell. */
  depth: number;
  /** Players in the run (1 alone). */
  players: number;
  /** Delved deepest of a group. */
  won: boolean;
  ruleset: number;
  /** A run resumed by a build with other rules still shows, but never counts as a best. */
  mixed: boolean;
  /** Depths where each life was lost, oldest first; the last is `depth`. Missing in runs recorded before it was kept. */
  losses?: number[];
}

/** Every counted run of one kind (alone or together) under one ruleset. */
export interface DelveTally {
  /** Group runs this player won. */
  wins: number;
  /** Runs by the depth they ended at. */
  ends: Record<number, number>;
  /** Lives lost before the last one, by depth (only runs that kept where). */
  lost: Record<number, number>;
}

/** A run that went deeper than any before it, under any rules. */
export interface Frontier {
  depth: number;
  at: number;
}

export interface DelveRecords {
  runs: DelveRun[];
  /** The deepest counted run, by `${ruleset}:solo` or `${ruleset}:group`. */
  bests: Record<string, DelveRun>;
  /** By the same keys as the bests. Mixed runs aren't counted, as they never count as bests. */
  tallies: Record<string, DelveTally>;
  /** Each new deepest, oldest first: the last is the deepest this browser has been. */
  frontier: Frontier[];
}

export const emptyRecords = (): DelveRecords => ({ runs: [], bests: {}, tallies: {}, frontier: [] });
export const emptyTally = (): DelveTally => ({ wins: 0, ends: {}, lost: {} });
const bestKey = (ruleset: number, solo: boolean) => `${ruleset}:${solo ? 'solo' : 'group'}`;

/** What the run of `me` in `next` adds to the records, if anything: their fall, or (in a group) their win at the end. */
export function runEvent(prev: GameState | null, next: GameState, me: string | null): DelveRun | null {
  const d = next.delve;
  if (!d || !me || !next.players.some((p) => p.id === me)) return null;
  const depth = fellAt(next, me);
  if (depth === null) return null;
  const fellNow = prev?.delve?.startedAt !== d.startedAt || fellAt(prev, me) === null;
  const wonNow = next.phase === 'over' && prev?.phase !== 'over' && next.winners.includes(me);
  if (!fellNow && !wonNow) return null;
  return {
    id: d.startedAt,
    at: Date.now(),
    depth,
    players: d.entrants.length,
    won: isGroupRun(next) && next.winners.includes(me),
    ruleset: d.ruleset,
    mixed: !!d.mixed,
    losses: [...(d.losses[me] ?? [])],
  };
}

/** The tally with a run added (`by` 1) or taken back out (`by` -1). */
function counted(t: DelveTally, run: DelveRun, by: 1 | -1): DelveTally {
  const bump = (m: Record<number, number>, depth: number) => {
    const n = (m[depth] ?? 0) + by;
    if (n > 0) m[depth] = n;
    else delete m[depth];
  };
  const out: DelveTally = { wins: Math.max(0, t.wins + (run.won ? by : 0)), ends: { ...t.ends }, lost: { ...t.lost } };
  bump(out.ends, run.depth);
  for (const d of run.losses?.slice(0, -1) ?? []) bump(out.lost, d);
  return out;
}

/** Adds (or updates, by id) a run. Returns the new records and the best it was measured against. */
export function addRun(r: DelveRecords, run: DelveRun): { records: DelveRecords; previousBest: number | null; best: boolean } {
  const before = r.runs.find((o) => o.id === run.id);
  const runs = [...r.runs.filter((o) => o.id !== run.id), run].sort((a, b) => a.at - b.at).slice(-RUN_LIMIT);
  const key = bestKey(run.ruleset, run.players < 2);
  const was = r.bests[key];
  const previousBest = was && was.id !== run.id ? was.depth : null;
  const best = !run.mixed && (!was || was.id === run.id || run.depth > was.depth);
  const bests = { ...r.bests };
  if (best) bests[key] = run;
  // The same run again (its win at the end) replaces what it counted the first time.
  const tallies = { ...r.tallies };
  if (before && !before.mixed) {
    const k = bestKey(before.ruleset, before.players < 2);
    tallies[k] = counted(tallies[k] ?? emptyTally(), before, -1);
  }
  if (!run.mixed) tallies[key] = counted(tallies[key] ?? emptyTally(), run, 1);
  const deepest = r.frontier.at(-1)?.depth ?? 0;
  const frontier = run.depth > deepest ? [...r.frontier, { depth: run.depth, at: run.at }] : r.frontier;
  return { records: { runs, bests, tallies, frontier }, previousBest, best: best && (previousBest === null || run.depth > previousBest) };
}

/** The deepest counted run alone or in a group, under a ruleset (this one by default). */
export function bestOf(r: DelveRecords, solo: boolean, ruleset = DELVE_RULESET): DelveRun | null {
  return r.bests[bestKey(ruleset, solo)] ?? null;
}

/** Every counted run alone or in a group, under a ruleset (this one by default). */
export function tallyOf(r: DelveRecords, solo: boolean, ruleset = DELVE_RULESET): DelveTally {
  return r.tallies[bestKey(ruleset, solo)] ?? emptyTally();
}

/** The deepest this browser has been, in any run under any rules (0 before the first). */
export const deepestEver = (r: DelveRecords) => r.frontier.at(-1)?.depth ?? 0;

// ---- reading what was stored -------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);
const MAX_DEPTH = 1e6;

/** Loss depths that can be true of a run that fell at `depth`: up to three, in order, the last at `depth`. */
function parseLosses(v: unknown, depth: number): number[] | undefined {
  if (!Array.isArray(v) || !v.length || v.length > DELVE_LIVES) return undefined;
  const out: number[] = [];
  for (const x of v) {
    const d = int(x, 1, depth);
    if (d === null || d < (out.at(-1) ?? 1)) return undefined;
    out.push(d);
  }
  return out.at(-1) === depth ? out : undefined;
}

function parseRun(v: unknown): DelveRun | null {
  if (!isObj(v)) return null;
  const id = int(v.id, 0, Number.MAX_SAFE_INTEGER);
  const at = int(v.at, 0, Number.MAX_SAFE_INTEGER);
  const depth = int(v.depth, 1, MAX_DEPTH);
  const players = int(v.players, 1, 64);
  const ruleset = int(v.ruleset, 1, 1e6);
  if (id === null || at === null || depth === null || players === null || ruleset === null) return null;
  const losses = parseLosses(v.losses, depth);
  return { id, at, depth, players, won: v.won === true, ruleset, mixed: v.mixed === true, ...(losses ? { losses } : {}) };
}

/** Counts by depth, keeping only whole depths and whole counts. */
function parseCounts(v: unknown): Record<number, number> {
  const out: Record<number, number> = {};
  if (isObj(v))
    for (const [k, n] of Object.entries(v)) {
      const depth = int(Number(k), 1, MAX_DEPTH);
      const count = int(n, 1, Number.MAX_SAFE_INTEGER);
      if (depth !== null && count !== null) out[depth] = count;
    }
  return out;
}

function parseTally(v: unknown): DelveTally | null {
  if (!isObj(v)) return null;
  const ends = parseCounts(v.ends);
  const runs = Object.values(ends).reduce((a, b) => a + b, 0);
  return { wins: Math.min(runs, int(v.wins, 0, Number.MAX_SAFE_INTEGER) ?? 0), ends, lost: parseCounts(v.lost) };
}

/** Each run once: the list and the bests (which may be older than the list). */
function known(r: DelveRecords): DelveRun[] {
  const byId = new Map<number, DelveRun>();
  for (const run of [...Object.values(r.bests), ...r.runs]) byId.set(run.id, run);
  return [...byId.values()].sort((a, b) => a.at - b.at);
}

/** Stored records, cleaned up; null when missing, malformed or from another version. */
export function parseRecords(raw: string | null): DelveRecords | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || v.v !== VERSION) return null;
  const r = emptyRecords();
  if (Array.isArray(v.runs)) r.runs = v.runs.map(parseRun).filter((x): x is DelveRun => !!x).slice(-RUN_LIMIT);
  if (isObj(v.bests))
    for (const [k, b] of Object.entries(v.bests)) {
      const run = parseRun(b);
      if (run && /^\d+:(solo|group)$/.test(k) && !run.mixed) r.bests[k] = run;
    }
  if (isObj(v.tallies)) {
    for (const [k, t] of Object.entries(v.tallies)) {
      const tally = parseTally(t);
      if (tally && /^\d+:(solo|group)$/.test(k)) r.tallies[k] = tally;
    }
  } else {
    // Written before tallies were kept (or by such a build): count what is known.
    for (const run of known(r))
      if (!run.mixed) {
        const k = bestKey(run.ruleset, run.players < 2);
        r.tallies[k] = counted(r.tallies[k] ?? emptyTally(), run, 1);
      }
  }
  // Each stored step, and every known run (records written before the
  // frontier was kept, or a run it missed): a new deepest wherever one went deeper.
  const steps: Frontier[] = known(r).map((run) => ({ depth: run.depth, at: run.at }));
  if (Array.isArray(v.frontier))
    for (const f of v.frontier) {
      if (!isObj(f)) continue;
      const depth = int(f.depth, 1, MAX_DEPTH);
      const at = int(f.at, 0, Number.MAX_SAFE_INTEGER);
      if (depth !== null && at !== null) steps.push({ depth, at });
    }
  for (const f of steps.sort((a, b) => a.at - b.at || a.depth - b.depth)) if (f.depth > deepestEver(r)) r.frontier.push(f);
  return r;
}

export const serializeRecords = (r: DelveRecords) => JSON.stringify({ v: VERSION, ...r });

/** The stored records (empty when there are none or they can't be read). Read fresh: another tab may have added to them. */
export function loadRecords(): DelveRecords {
  try {
    return parseRecords(localStorage.getItem(DELVE_RECORD_KEY)) ?? emptyRecords();
  } catch {
    return emptyRecords();
  }
}

/** Records a run; returns how it measured up (null when it couldn't be stored). */
export function recordRun(run: DelveRun): { previousBest: number | null; best: boolean } | null {
  const { records, previousBest, best } = addRun(loadRecords(), run);
  try {
    localStorage.setItem(DELVE_RECORD_KEY, serializeRecords(records));
  } catch {
    return null;
  }
  return { previousBest, best };
}

export function resetRecords() {
  try {
    localStorage.removeItem(DELVE_RECORD_KEY);
  } catch {
    /* nothing stored, or no storage */
  }
}
