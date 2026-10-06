// This browser's Delve runs: the deepest one alone and in a group (per
// ruleset, so a changed curve never compares old depths with new ones), and
// how each best grew; every counted run as a tally of where it ended and
// where its lives went; how deep this browser has ever been; and the last
// runs in full. Kept in localStorage, like the codex (lib/codex.ts).
//
// The stored shape only grows: fields added later are optional and, when
// missing, filled in from what is there (records written before tallies
// existed get them from their runs and bests). The version only changes for a
// shape older builds would misread, since a build that can't read the records
// starts them over and would lose the bests.
//
// Whose run is it? Online, the player this browser seats: two tabs of one
// browser in the same room keep a run each (`who`). In hot-seat with one
// player, theirs. In hot-seat with several, the device can't tell which of
// them is its owner (the codex doesn't count their answers either), so the
// group's run is recorded once, at its end, as deep as its deepest delver
// (`hot`); it counts as a run together, never as a win.
//
// A run left while still standing (leaving, the host closing the room, a
// dropped connection) is recorded as left at the depth it was on (`left`):
// it shows in the list and counts as a run that got that deep, but never as
// a best or a depth a run ended at. If the same run goes on and falls after
// all (a rejoin), the fall replaces it.

import { DELVE_LIVES, DELVE_RULESET, delveStandings, fellAt, isGroupRun } from './delve.ts';
import type { GameState } from './game.ts';
import { readStored, removeStored, storeKey, writeStored } from './storage.ts';

/** Where the records live (the beta keeps its own); the whole key, as storage events name it. */
const DELVE_RECORD_NAME = 'delve';
export const DELVE_RECORD_KEY = storeKey(DELVE_RECORD_NAME);
const VERSION = 1;
/** Runs kept in the list (bests and tallies are kept apart, however old). */
export const RUN_LIMIT = 40;
/**
 * The deepest depth the records take. No run gets near it (the clock bottoms
 * out at 7 s and the questions only get harder past 100); anything deeper is
 * read as damage and dropped, so no list or chart can be made endless.
 */
export const MAX_DEPTH = 999;
/** The most runs one depth of a tally can hold; more is read as this many. */
export const MAX_COUNT = 100_000;

export interface DelveRun {
  /** The run's start on the host's clock: one run, however often it is recorded (with `who`). */
  id: number;
  /** When it was first recorded (this browser's clock). */
  at: number;
  /** Where this player fell, or (left) the depth they were on. */
  depth: number;
  /** Players in the run (1 alone). */
  players: number;
  /** Delved deepest of a group. */
  won: boolean;
  ruleset: number;
  /** A run resumed by a build with other rules still shows, but never counts as a best. */
  mixed: boolean;
  /** Depths where each life was lost, oldest first; for a fall the last is `depth`. Missing in runs recorded before it was kept. */
  losses?: number[];
  /** The player it was (online): two players of one browser in one room keep a run each. Missing in older records and hot-seat. */
  who?: string;
  /** Ended without a fall: left (or the room closed) still standing at `depth`. */
  left?: true;
  /** Hot-seat with several players: the group's run, as deep as its deepest delver. */
  hot?: true;
}

/** Every counted run of one kind (alone or together) under one ruleset. */
export interface DelveTally {
  /** Group runs this player won. */
  wins: number;
  /** Runs by the depth they fell at. */
  ends: Record<number, number>;
  /** Lives lost before the last one, by depth (only runs that kept where); for runs left, every life they lost. */
  lost: Record<number, number>;
  /** Runs left standing, by the depth they were on (missing in older records). */
  left?: Record<number, number>;
}

/** A run that went deeper than any before it. */
export interface Frontier {
  depth: number;
  at: number;
}

export interface DelveRecords {
  runs: DelveRun[];
  /** The deepest counted run, by `${ruleset}:solo` or `${ruleset}:group`. */
  bests: Record<string, DelveRun>;
  /** Each new best, oldest first, by the same keys: the last is the best. */
  climbs: Record<string, Frontier[]>;
  /** By the same keys as the bests. Mixed runs aren't counted, as they never count as bests. */
  tallies: Record<string, DelveTally>;
  /** Each new deepest under any rules, alone or not, left or fallen, oldest first: the last is the deepest this browser has been. */
  frontier: Frontier[];
}

export const emptyRecords = (): DelveRecords => ({ runs: [], bests: {}, climbs: {}, tallies: {}, frontier: [] });
export const emptyTally = (): DelveTally => ({ wins: 0, ends: {}, lost: {} });
export const bestKey = (ruleset: number, solo: boolean) => `${ruleset}:${solo ? 'solo' : 'group'}`;
const keyOf = (run: DelveRun) => bestKey(run.ruleset, run.players < 2);
/** One run of one player: the same run recorded again (its win, its fall after it was left) replaces it. */
export const runKey = (run: DelveRun) => (run.who ? `${run.id}:${run.who}` : `${run.id}`);
/** Whether a run can be a best and an end in the tallies: fallen, under rules it kept to. */
export const counts = (run: DelveRun) => !run.mixed && !run.left;

const clampDepth = (d: number) => Math.max(1, Math.min(MAX_DEPTH, Math.floor(d)));

/** Whose run this device records: online its player; in hot-seat the one player, or the group as a whole (null for nobody). */
function selfIn(s: GameState, me: string | null, hotSeat: boolean): string | 'group' | null {
  const d = s.delve;
  if (!d) return null;
  if (hotSeat) return d.entrants.length > 1 ? 'group' : (s.players[0]?.id ?? null);
  return me && s.players.some((p) => p.id === me) ? me : null;
}

function base(s: GameState, depth: number, losses: number[], self: string | 'group'): DelveRun {
  const d = s.delve!;
  return {
    id: d.startedAt,
    at: Date.now(),
    depth: clampDepth(depth),
    players: Math.max(1, d.entrants.length),
    won: false,
    ruleset: d.ruleset,
    mixed: !!d.mixed,
    losses: losses.map(clampDepth),
    ...(self === 'group' ? { hot: true as const } : {}),
  };
}

/**
 * What the run in `next` adds to the records, if anything: this player's fall,
 * or (in a group) their win at the end. `me`: this device's player online;
 * `hotSeat`: the game is on this device alone (then its one player, or the
 * group's deepest once it is over).
 */
export function runEvent(prev: GameState | null, next: GameState, me: string | null, hotSeat = false): DelveRun | null {
  const d = next.delve;
  if (!d) return null;
  const self = selfIn(next, me, hotSeat);
  if (!self) return null;
  const same = prev?.delve?.startedAt === d.startedAt;
  if (self === 'group') {
    if (next.phase !== 'over' || (same && prev?.phase === 'over')) return null;
    const top = delveStandings(next)[0];
    return top ? base(next, fellAt(next, top.id) ?? next.round, top.losses, self) : null;
  }
  const depth = fellAt(next, self);
  if (depth === null) return null;
  const fellNow = !same || fellAt(prev!, self) === null;
  const wonNow = next.phase === 'over' && prev?.phase !== 'over' && next.winners.includes(self);
  if (!fellNow && !wonNow) return null;
  return { ...base(next, depth, d.losses[self] ?? [], self), won: isGroupRun(next) && next.winners.includes(self), ...(hotSeat ? {} : { who: self }) };
}

/**
 * The run this device is leaving while still standing in it (leaving, the
 * room closing, the connection dropping), or null: none underway, or this
 * player already fell (their fall is recorded).
 */
export function leftEvent(s: GameState | null, me: string | null, hotSeat = false): DelveRun | null {
  const d = s?.delve;
  if (!s || !d || s.phase === 'lobby' || s.phase === 'over' || s.round < 1) return null;
  const self = selfIn(s, me, hotSeat);
  if (!self) return null;
  if (self === 'group') {
    const top = delveStandings(s)[0];
    return top && top.lives > 0 ? { ...base(s, s.round, top.losses, self), left: true } : null;
  }
  if (fellAt(s, self) !== null) return null;
  return { ...base(s, s.round, d.losses[self] ?? [], self), left: true, ...(hotSeat ? {} : { who: self }) };
}

/** The tally with a run added (`by` 1) or taken back out (`by` -1). */
function counted(t: DelveTally, run: DelveRun, by: 1 | -1): DelveTally {
  const bump = (m: Record<number, number>, depth: number) => {
    const n = Math.min(MAX_COUNT, (m[depth] ?? 0) + by);
    if (n > 0) m[depth] = n;
    else delete m[depth];
  };
  const out: DelveTally = { wins: Math.max(0, t.wins + (run.won ? by : 0)), ends: { ...t.ends }, lost: { ...t.lost }, ...(t.left ? { left: { ...t.left } } : {}) };
  if (run.left) bump((out.left ??= {}), run.depth);
  else bump(out.ends, run.depth);
  for (const d of (run.left ? run.losses : run.losses?.slice(0, -1)) ?? []) bump(out.lost, d);
  if (out.left && !Object.keys(out.left).length) delete out.left;
  return out;
}

/** Adds (or updates, by runKey) a run. Returns the new records and the best it was measured against. */
export function addRun(r: DelveRecords, next: DelveRun): { records: DelveRecords; previousBest: number | null; best: boolean } {
  const id = runKey(next);
  const before = r.runs.find((o) => runKey(o) === id);
  // Its win at the end is the same run, recorded when it fell.
  const run: DelveRun = before && !before.left ? { ...next, at: before.at } : next;
  const runs = [...r.runs.filter((o) => runKey(o) !== id), run].sort((a, b) => a.at - b.at).slice(-RUN_LIMIT);
  const key = keyOf(run);
  const was = r.bests[key];
  const same = !!was && runKey(was) === id;
  const previousBest = was && !same ? was.depth : null;
  const best = counts(run) && (!was || same || run.depth > was.depth);
  const bests = { ...r.bests };
  const climbs = { ...r.climbs };
  if (best) {
    bests[key] = run;
    const steps = climbs[key] ?? [];
    if (run.depth > (steps.at(-1)?.depth ?? 0)) climbs[key] = [...steps, { depth: run.depth, at: run.at }];
  }
  // The same run again replaces what it counted the first time.
  const tallies = { ...r.tallies };
  if (before && !before.mixed) {
    const k = keyOf(before);
    tallies[k] = counted(tallies[k] ?? emptyTally(), before, -1);
  }
  if (!run.mixed) tallies[key] = counted(tallies[key] ?? emptyTally(), run, 1);
  const deepest = r.frontier.at(-1)?.depth ?? 0;
  const frontier = run.depth > deepest ? [...r.frontier, { depth: run.depth, at: run.at }] : r.frontier;
  return { records: { runs, bests, climbs, tallies, frontier }, previousBest, best: best && (previousBest === null || run.depth > previousBest) };
}

/** The deepest counted run alone or in a group, under a ruleset (this one by default). */
export function bestOf(r: DelveRecords, solo: boolean, ruleset = DELVE_RULESET): DelveRun | null {
  return r.bests[bestKey(ruleset, solo)] ?? null;
}

/** Every counted run alone or in a group, under a ruleset (this one by default). */
export function tallyOf(r: DelveRecords, solo: boolean, ruleset = DELVE_RULESET): DelveTally {
  return r.tallies[bestKey(ruleset, solo)] ?? emptyTally();
}

/** Each new best alone or in a group under a ruleset (this one by default), oldest first. */
export function climbOf(r: DelveRecords, solo: boolean, ruleset = DELVE_RULESET): Frontier[] {
  return r.climbs[bestKey(ruleset, solo)] ?? [];
}

/** The deepest this browser has been, in any run under any rules (0 before the first). */
export const deepestEver = (r: DelveRecords) => r.frontier.at(-1)?.depth ?? 0;

// ---- reading what was stored -------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);
const KEY = /^\d+:(solo|group)$/;

/**
 * Loss depths that can be true of a run at `depth`: up to three, in order,
 * none deeper; a run's third is where it fell, so a fall's is at `depth` and a
 * run left standing has fewer.
 */
function parseLosses(v: unknown, depth: number, left: boolean): number[] | undefined {
  if (!Array.isArray(v) || v.length > (left ? DELVE_LIVES - 1 : DELVE_LIVES) || (!v.length && !left)) return undefined;
  const out: number[] = [];
  for (const x of v) {
    const d = int(x, 1, depth);
    if (d === null || d < (out.at(-1) ?? 1)) return undefined;
    out.push(d);
  }
  return out.length === DELVE_LIVES && out.at(-1) !== depth ? undefined : out;
}

function parseRun(v: unknown): DelveRun | null {
  if (!isObj(v)) return null;
  const id = int(v.id, 0, Number.MAX_SAFE_INTEGER);
  const at = int(v.at, 0, Number.MAX_SAFE_INTEGER);
  const depth = int(v.depth, 1, MAX_DEPTH);
  const players = int(v.players, 1, 64);
  const ruleset = int(v.ruleset, 1, 1e6);
  if (id === null || at === null || depth === null || players === null || ruleset === null) return null;
  const left = v.left === true;
  const losses = parseLosses(v.losses, depth, left);
  const who = typeof v.who === 'string' && v.who.length > 0 && v.who.length <= 64 ? v.who : null;
  return {
    id,
    at,
    depth,
    players,
    won: v.won === true && players > 1 && v.hot !== true,
    ruleset,
    mixed: v.mixed === true,
    ...(losses ? { losses } : {}),
    ...(who ? { who } : {}),
    ...(left ? { left: true as const } : {}),
    ...(v.hot === true && players > 1 ? { hot: true as const } : {}),
  };
}

/** Counts by depth, keeping only whole depths and whole counts (at most MAX_COUNT each). */
function parseCounts(v: unknown): Record<number, number> {
  const out: Record<number, number> = {};
  if (isObj(v))
    for (const [k, n] of Object.entries(v)) {
      const depth = int(Number(k), 1, MAX_DEPTH);
      const count = int(n, 1, Number.MAX_SAFE_INTEGER);
      if (depth !== null && count !== null) out[depth] = Math.min(MAX_COUNT, count);
    }
  return out;
}

function parseTally(v: unknown): DelveTally | null {
  if (!isObj(v)) return null;
  const ends = parseCounts(v.ends);
  const left = parseCounts(v.left);
  const runs = Object.values(ends).reduce((a, b) => a + b, 0);
  return { wins: Math.min(runs, int(v.wins, 0, Number.MAX_SAFE_INTEGER) ?? 0), ends, lost: parseCounts(v.lost), ...(Object.keys(left).length ? { left } : {}) };
}

/** Steps that each go deeper, in time order: a frontier. */
function parseSteps(v: unknown): Frontier[] {
  const out: Frontier[] = [];
  if (Array.isArray(v))
    for (const f of v) {
      if (!isObj(f)) continue;
      const depth = int(f.depth, 1, MAX_DEPTH);
      const at = int(f.at, 0, Number.MAX_SAFE_INTEGER);
      if (depth !== null && at !== null) out.push({ depth, at });
    }
  return out;
}

/** The steps, each deeper than the last, in time order. */
function frontierOf(steps: Frontier[]): Frontier[] {
  const out: Frontier[] = [];
  for (const f of [...steps].sort((a, b) => a.at - b.at || a.depth - b.depth)) if (f.depth > (out.at(-1)?.depth ?? 0)) out.push(f);
  return out;
}

/** Each run once: the list and the bests (which may be older than the list). */
function known(r: DelveRecords): DelveRun[] {
  const byKey = new Map<string, DelveRun>();
  for (const run of [...Object.values(r.bests), ...r.runs]) byKey.set(runKey(run), run);
  return [...byKey.values()].sort((a, b) => a.at - b.at);
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
      if (run && KEY.test(k) && counts(run) && k === keyOf(run)) r.bests[k] = run;
    }
  if (isObj(v.tallies)) {
    for (const [k, t] of Object.entries(v.tallies)) {
      const tally = parseTally(t);
      if (tally && KEY.test(k)) r.tallies[k] = tally;
    }
  } else {
    // Written before tallies were kept (or by such a build): count what is known.
    for (const run of known(r))
      if (!run.mixed) {
        const k = keyOf(run);
        r.tallies[k] = counted(r.tallies[k] ?? emptyTally(), run, 1);
      }
  }
  // Each stored step, and every known run (records written before these were
  // kept, or a run they missed): a new deepest wherever one went deeper.
  const runs = known(r);
  r.frontier = frontierOf([...runs.map((run) => ({ depth: run.depth, at: run.at })), ...parseSteps(v.frontier)]);
  const stored = isObj(v.climbs) ? v.climbs : {};
  const keys = new Set([...Object.keys(r.bests), ...Object.keys(stored).filter((k) => KEY.test(k))]);
  for (const k of keys) {
    const steps = [...runs.filter((run) => counts(run) && keyOf(run) === k).map((run) => ({ depth: run.depth, at: run.at })), ...parseSteps(stored[k])];
    // Never past the best it climbs to.
    const best = r.bests[k]?.depth ?? 0;
    const climb = frontierOf(steps.filter((f) => f.depth <= best));
    if (climb.length) r.climbs[k] = climb;
  }
  return r;
}

export const serializeRecords = (r: DelveRecords) => JSON.stringify({ v: VERSION, ...r });

/** The stored records (empty when there are none or they can't be read). Read fresh: another tab may have added to them. */
export function loadRecords(): DelveRecords {
  return parseRecords(readStored(DELVE_RECORD_NAME)) ?? emptyRecords();
}

/** Records a run; returns how it measured up (null when it couldn't be stored). */
export function recordRun(run: DelveRun): { previousBest: number | null; best: boolean } | null {
  const { records, previousBest, best } = addRun(loadRecords(), run);
  if (!writeStored(DELVE_RECORD_NAME, serializeRecords(records))) return null;
  return { previousBest, best };
}

/**
 * Records the run this device is leaving while still standing in it, if any
 * (see leftEvent). For the session to call as it leaves a game, whatever the
 * way out: a later fall of the same run replaces it.
 */
export function recordLeft(s: GameState | null, me: string | null, hotSeat = false) {
  const run = leftEvent(s, me, hotSeat);
  if (run) recordRun(run);
}

export function resetRecords() {
  removeStored(DELVE_RECORD_NAME);
}
