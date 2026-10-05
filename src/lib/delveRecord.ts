// This browser's Delve runs: the deepest one alone and in a group (per
// ruleset, so a changed curve never compares old depths with new ones), and
// the last few runs. Kept in localStorage, like the codex (lib/codex.ts).

import { DELVE_RULESET, fellAt, isGroupRun } from './delve.ts';
import type { GameState } from './game.ts';

export const DELVE_RECORD_KEY = 'poe2trivia.delve';
const VERSION = 1;
/** Runs kept in the list (bests are kept apart, however old). */
export const RUN_LIMIT = 20;

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
}

export interface DelveRecords {
  runs: DelveRun[];
  /** The deepest counted run, by `${ruleset}:solo` or `${ruleset}:group`. */
  bests: Record<string, DelveRun>;
}

export const emptyRecords = (): DelveRecords => ({ runs: [], bests: {} });
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
  };
}

/** Adds (or updates, by id) a run. Returns the new records and the best it was measured against. */
export function addRun(r: DelveRecords, run: DelveRun): { records: DelveRecords; previousBest: number | null; best: boolean } {
  const runs = [...r.runs.filter((o) => o.id !== run.id), run].sort((a, b) => a.at - b.at).slice(-RUN_LIMIT);
  const key = bestKey(run.ruleset, run.players < 2);
  const was = r.bests[key];
  const previousBest = was && was.id !== run.id ? was.depth : null;
  const best = !run.mixed && (!was || was.id === run.id || run.depth > was.depth);
  const bests = { ...r.bests };
  if (best) bests[key] = run;
  return { records: { runs, bests }, previousBest, best: best && (previousBest === null || run.depth > previousBest) };
}

/** The deepest counted run alone or in a group, under a ruleset (this one by default). */
export function bestOf(r: DelveRecords, solo: boolean, ruleset = DELVE_RULESET): DelveRun | null {
  return r.bests[bestKey(ruleset, solo)] ?? null;
}

// ---- reading what was stored -------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);

function parseRun(v: unknown): DelveRun | null {
  if (!isObj(v)) return null;
  const id = int(v.id, 0, Number.MAX_SAFE_INTEGER);
  const at = int(v.at, 0, Number.MAX_SAFE_INTEGER);
  const depth = int(v.depth, 1, 1e6);
  const players = int(v.players, 1, 64);
  const ruleset = int(v.ruleset, 1, 1e6);
  if (id === null || at === null || depth === null || players === null || ruleset === null) return null;
  return { id, at, depth, players, won: v.won === true, ruleset, mixed: v.mixed === true };
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
