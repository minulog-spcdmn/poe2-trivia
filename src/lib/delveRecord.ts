// This browser's Delve runs: the deepest one alone and together (per ruleset,
// so a changed curve never compares old depths with new ones), and how each
// best grew; every counted run as a tally of where it ended and where its
// lives went; how deep this browser has ever been; and the last runs in full.
// Kept in localStorage, like the codex (lib/codex.ts).
//
// The stored shape only grows: fields added later are optional and, when
// missing, filled in from what is there (records written before tallies
// existed get them from their runs and bests). The version only changes for a
// shape older builds would misread: version 2 since runs "in a group" became
// runs "together" (keys `:together`, where version 1 had `:group`). Records
// this build can't read are never written over (lib/keepAside.ts): a newer
// build's stay untouched, anything else is kept aside before new records
// start.
//
// They live under a name of their own (`delve2`). Builds from before version
// 2 read the records without a version check of their own and write back
// what they read, so a tab of one still open would wipe them under the old
// name (`delve`), and a version they don't know they would take for none at
// all. The old name is only ever read, as where the records start from while
// the new one is still missing; nothing writes it again.
//
// Whose run is it? Online, the player this browser seats: two tabs of one
// browser in the same room keep a run each (`who`). On one device, its one
// player (a run together is only played online).
//
// Alone, a run is recorded as its player falls, at that depth. Together
// (co-op) nobody wins: the run is the team's, recorded once it is over, at
// the team's depth (where the last of them perished, delve.ts teamDepth),
// with this player's own part in it (the lives they lost, where they
// perished, the lives they gave and were given). A player who perishes and is
// brought back is still in the run, so nothing is recorded as they perish.
//
// A run left before its end (leaving, the host closing the room, a dropped
// connection, the tab closing) is recorded as left at the depth it was on
// (`left`): it shows in the list and counts as a run that got that deep, but
// never as a best or a depth a run ended at. It is provisional: if the same
// run goes on and ends after all (a rejoin), the end replaces it. An end is
// final: recording the same run again (a reload of the end screen, a save
// resumed under newer rules) changes nothing.
//
// Group runs from before co-op (a "last one standing" winner) were never
// released: they are dropped as the records are read.

import { DELVE_LIVES, DELVE_RULESET, delveStandings, fellAt, isGroupRun, standingIds, teamDepth } from './delve.ts';
import type { GameState } from './game.ts';
import { clearAside, makeRoom } from './keepAside.ts';
import { readStored, removeStored, storeKey, tryReadStored, writeStored } from './storage.ts';

/** Where the records live (the beta keeps its own); the whole key, as storage events name it. */
const DELVE_RECORD_NAME = 'delve2';
export const DELVE_RECORD_KEY = storeKey(DELVE_RECORD_NAME);
/** Where builds from before version 2 keep them: only read, to start from. */
const LEGACY = 'delve';
const VERSION = 2;
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
  /** When it was recorded (this browser's clock); an end replacing a run left keeps its own. */
  at: number;
  /**
   * Alone: where this player fell, or (left) the depth they were on.
   * Together: the team's depth, where the last of them perished, or (left)
   * the depth the team was on.
   */
  depth: number;
  /** Players who set out (1 alone, 2 or more together). */
  players: number;
  ruleset: number;
  /** A run resumed by a build with other rules still shows, but never counts as a best. */
  mixed: boolean;
  /**
   * Depths where this player lost a life, oldest first. Alone: three at
   * most, the last at `depth` for a fall. Together: any number (lives given
   * back can be lost again). Missing in runs recorded before it was kept.
   */
  losses?: number[];
  /** The player it was (online): two players of one browser in one room keep a run each. Missing on one device. */
  who?: string;
  /** Ended without its end: left (or the room closed) at `depth`. */
  left?: true;
  /** Together (always there): depths where this player perished, oldest first; all but the last were brought back. */
  perished?: number[];
  /** Together: lives this player gave to bring teammates back. */
  given?: number;
  /** Together: times a teammate brought this player back. */
  revived?: number;
  /** Azurite Wards that broke in this player's place, each a life saved. Missing where not known. */
  wards?: number;
}

/** Every counted run of one kind (alone or together) under one ruleset. */
export interface DelveTally {
  /** Runs by the depth they ended at (together: the team's). */
  ends: Record<number, number>;
  /**
   * This player's lives lost, by depth (only runs that kept where). Alone:
   * those before the last, which is the run's end; for runs left, all of
   * them. Together: all of them (the team's end isn't one of theirs).
   */
  lost: Record<number, number>;
  /** Runs left before their end, by the depth they were on (missing for none). */
  left?: Record<number, number>;
  /** Together: where this player perished, by depth (missing for none). */
  perished?: Record<number, number>;
  /** Together: lives this player gave, and times they were brought back (missing for none). */
  given?: number;
  revived?: number;
  /** Wards that broke in place of a life, over the runs that kept them (missing for none). */
  warded?: number;
}

/** A run that went deeper than any before it. */
export interface Frontier {
  depth: number;
  at: number;
}

export interface DelveRecords {
  runs: DelveRun[];
  /** The deepest counted run, by `${ruleset}:solo` or `${ruleset}:together`. */
  bests: Record<string, DelveRun>;
  /** Each new best, oldest first, by the same keys: the last is the best. */
  climbs: Record<string, Frontier[]>;
  /** By the same keys as the bests. Mixed runs aren't counted, as they never count as bests. */
  tallies: Record<string, DelveTally>;
  /** Each new deepest under any rules, alone or not, left or ended, oldest first: the last is the deepest this browser has been. */
  frontier: Frontier[];
}

/** How a run measured up against the best of its kind. */
export interface Measure {
  /** The best before it, or null when it was the first (or this run was already the best and nothing came before). */
  previousBest: number | null;
  /** It went deeper than every counted run of its kind before it. */
  best: boolean;
}

export const emptyRecords = (): DelveRecords => ({ runs: [], bests: {}, climbs: {}, tallies: {}, frontier: [] });
export const emptyTally = (): DelveTally => ({ ends: {}, lost: {} });
export const bestKey = (ruleset: number, solo: boolean) => `${ruleset}:${solo ? 'solo' : 'together'}`;
/** A run together: two or more set out. */
export const isTogether = (run: DelveRun) => run.players > 1;
const keyOf = (run: DelveRun) => bestKey(run.ruleset, !isTogether(run));
/** One run of one player: the same run recorded again (its end after it was left) replaces it. */
export const runKey = (run: DelveRun) => (run.who ? `${run.id}:${run.who}` : `${run.id}`);
/** Whether a run can be a best and an end in the tallies: ended, under rules it kept to. */
export const counts = (run: DelveRun) => !run.mixed && !run.left;

const clampDepth = (d: number) => Math.max(1, Math.min(MAX_DEPTH, Math.floor(d)));

// ---- from the game -----------------------------------------------------------

/** Whose run this device records: online its player; on one device its one player (null for nobody). */
function selfIn(s: GameState, me: string | null, hotSeat: boolean): string | null {
  if (!s.delve) return null;
  if (hotSeat) return s.players.length === 1 && !isGroupRun(s) ? s.players[0].id : null;
  return me && s.players.some((p) => p.id === me) ? me : null;
}

/**
 * lib/codex.ts keeps the codex under this name (or, before it first writes
 * there, the old one). Read raw here, so the game's first download doesn't
 * carry the codex.
 */
export const CODEX_NAMES = ['codex2', 'codex'] as const;

/**
 * Wards that broke in `self`'s place in the run: those of the answers the
 * codex logged for it (theirs: two tabs of one browser in one room play
 * two), and of the question just revealed (its answer may be on its way to
 * the codex still).
 */
function wardsIn(s: GameState, self: string): number {
  const id = s.delve!.startedAt;
  const r = s.phase === 'reveal' ? s.reveal : null;
  const now = r ? s.question?.askedAt : undefined;
  let n = 0;
  try {
    const v: unknown = JSON.parse(readStored(CODEX_NAMES[0]) ?? readStored(CODEX_NAMES[1]) ?? 'null');
    const log = isObj(v) && Array.isArray(v.log) ? v.log : [];
    for (const a of log) {
      if (!isObj(a) || a.run !== id || a.depth === undefined || a.ok !== false || (now !== undefined && a.t === now)) continue;
      if (a.who !== undefined && a.who !== self) continue;
      n += a.wards === 1 || a.wards === 2 ? a.wards : a.wards === undefined && a.warded === true ? 1 : 0;
    }
  } catch {
    /* no codex to read */
  }
  if (r) n += isGroupRun(s) ? (r.hits?.find((h) => h.playerId === self)?.wards ?? 0) : r.correct ? 0 : (r.lost?.wards ?? (r.warded ? 1 : 0));
  return Math.min(n, 2 * MAX_DEPTH);
}

function base(s: GameState, self: string, depth: number, hotSeat: boolean): DelveRun {
  const d = s.delve!;
  const wards = wardsIn(s, self);
  return {
    id: d.startedAt,
    at: Date.now(),
    depth: clampDepth(depth),
    players: Math.max(1, d.entrants.length),
    ruleset: d.ruleset,
    mixed: !!d.mixed,
    losses: (d.losses[self] ?? []).map(clampDepth),
    ...(hotSeat ? {} : { who: self }),
    ...(wards ? { wards } : {}),
  };
}

/** The team's run as this player had it: at the team's depth, with what they lost, gave and were given. */
function together(s: GameState, self: string, hotSeat: boolean): DelveRun {
  const row = delveStandings(s).find((r) => r.id === self);
  return {
    ...base(s, self, teamDepth(s), hotSeat),
    perished: (row?.perished ?? []).map(clampDepth),
    ...(row?.given ? { given: row.given } : {}),
    ...(row?.revived ? { revived: row.revived } : {}),
  };
}

/**
 * What the run in `next` adds to the records, if anything: alone, this
 * player's fall; together, the run once it is over. `me`: this device's
 * player online; `hotSeat`: the game is on this device alone (its one player).
 */
export function runEvent(prev: GameState | null, next: GameState, me: string | null, hotSeat = false): DelveRun | null {
  const d = next.delve;
  if (!d) return null;
  const self = selfIn(next, me, hotSeat);
  if (!self) return null;
  const same = prev?.delve?.startedAt === d.startedAt;
  if (isGroupRun(next)) {
    if (next.phase !== 'over' || (same && prev?.phase === 'over')) return null;
    return together(next, self, hotSeat);
  }
  const depth = fellAt(next, self);
  if (depth === null || (same && fellAt(prev!, self) !== null)) return null;
  return base(next, self, depth, hotSeat);
}

/**
 * The run this device is leaving before its end (leaving, the room closing,
 * the connection dropping, the tab closing), or null: none underway, or (alone)
 * this player already fell, their fall recorded. Together it is recorded
 * whether this player stands or lies perished (a teammate may still bring
 * them back), at the team's depth; once nobody stands the run is over, and
 * it is its end.
 */
export function leftEvent(s: GameState | null, me: string | null, hotSeat = false): DelveRun | null {
  const d = s?.delve;
  if (!s || !d || s.phase === 'lobby' || s.phase === 'over' || s.round < 1) return null;
  const self = selfIn(s, me, hotSeat);
  if (!self) return null;
  if (isGroupRun(s)) {
    const run = together(s, self, hotSeat);
    return standingIds(s).length ? { ...run, left: true } : run;
  }
  if (fellAt(s, self) !== null) return null;
  return { ...base(s, self, s.round, hotSeat), left: true };
}

// ---- adding up -----------------------------------------------------------------

/** The tally with a run added (`by` 1) or taken back out (`by` -1). */
function counted(t: DelveTally, run: DelveRun, by: 1 | -1): DelveTally {
  const bump = (m: Record<number, number>, depth: number) => {
    const n = Math.min(MAX_COUNT, (m[depth] ?? 0) + by);
    if (n > 0) m[depth] = n;
    else delete m[depth];
  };
  const team = isTogether(run);
  const ends = { ...t.ends };
  const lost = { ...t.lost };
  const left = { ...t.left };
  const perished = { ...t.perished };
  if (run.left) bump(left, run.depth);
  else bump(ends, run.depth);
  for (const d of (team || run.left ? run.losses : run.losses?.slice(0, -1)) ?? []) bump(lost, d);
  if (team) for (const d of run.perished ?? []) bump(perished, d);
  const sum = (was: number | undefined, n: number | undefined) => Math.max(0, Math.min(MAX_COUNT, (was ?? 0) + by * (n ?? 0)));
  const given = sum(t.given, run.given);
  const revived = sum(t.revived, run.revived);
  const warded = sum(t.warded, run.wards);
  return {
    ends,
    lost,
    ...(Object.keys(left).length ? { left } : {}),
    ...(Object.keys(perished).length ? { perished } : {}),
    ...(given ? { given } : {}),
    ...(revived ? { revived } : {}),
    ...(warded ? { warded } : {}),
  };
}

/**
 * How a run in the records measured up: a best if it is a step of its kind's
 * climb, measured against the step before it; otherwise against the best.
 * The same answer however often it is asked (a reload of the end screen).
 */
export function measure(r: DelveRecords, run: DelveRun): Measure {
  const key = keyOf(run);
  const steps = r.climbs[key] ?? [];
  const i = counts(run) ? steps.findIndex((f) => f.at === run.at && f.depth === run.depth) : -1;
  if (i >= 0) return { previousBest: steps[i - 1]?.depth ?? null, best: true };
  const was = r.bests[key];
  return { previousBest: was && runKey(was) !== runKey(run) ? was.depth : null, best: false };
}

/** The run already recorded under the same key, in the list or among the bests. */
const recorded = (r: DelveRecords, id: string) => r.runs.find((o) => runKey(o) === id) ?? Object.values(r.bests).find((o) => runKey(o) === id) ?? null;

/**
 * Adds (or updates, by runKey) a run, and says how it measured up. A run
 * ended is final: the same run again changes nothing (records returned
 * as they were). A run left gives way to its end, or to a later leave.
 */
export function addRun(r: DelveRecords, next: DelveRun): Measure & { records: DelveRecords } {
  const id = runKey(next);
  const before = recorded(r, id);
  if (before && !before.left) return { records: r, ...measure(r, before) };
  const run = next;
  const runs = [...r.runs.filter((o) => runKey(o) !== id), run].sort((a, b) => a.at - b.at).slice(-RUN_LIMIT);
  const key = keyOf(run);
  const was = r.bests[key];
  const bests = { ...r.bests };
  const climbs = { ...r.climbs };
  if (counts(run) && (!was || run.depth > was.depth)) {
    bests[key] = run;
    const steps = climbs[key] ?? [];
    if (run.depth > (steps.at(-1)?.depth ?? 0)) climbs[key] = [...steps, { depth: run.depth, at: run.at }];
  }
  // A run left again, or ended, replaces what it counted the first time.
  const tallies = { ...r.tallies };
  if (before && !before.mixed) {
    const k = keyOf(before);
    tallies[k] = counted(tallies[k] ?? emptyTally(), before, -1);
  }
  if (!run.mixed) tallies[key] = counted(tallies[key] ?? emptyTally(), run, 1);
  const deepest = r.frontier.at(-1)?.depth ?? 0;
  const frontier = run.depth > deepest ? [...r.frontier, { depth: run.depth, at: run.at }] : r.frontier;
  const records = { runs, bests, climbs, tallies, frontier };
  return { records, ...measure(records, run) };
}

/** The deepest counted run alone or together, under a ruleset (this one by default). */
export function bestOf(r: DelveRecords, solo: boolean, ruleset = DELVE_RULESET): DelveRun | null {
  return r.bests[bestKey(ruleset, solo)] ?? null;
}

/** Every counted run alone or together, under a ruleset (this one by default). */
export function tallyOf(r: DelveRecords, solo: boolean, ruleset = DELVE_RULESET): DelveTally {
  return r.tallies[bestKey(ruleset, solo)] ?? emptyTally();
}

/** Each new best alone or together under a ruleset (this one by default), oldest first. */
export function climbOf(r: DelveRecords, solo: boolean, ruleset = DELVE_RULESET): Frontier[] {
  return r.climbs[bestKey(ruleset, solo)] ?? [];
}

/** The deepest this browser has been, in any run under any rules (0 before the first). */
export const deepestEver = (r: DelveRecords) => r.frontier.at(-1)?.depth ?? 0;

// ---- reading what was stored -------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null);
const KEY = /^\d+:(solo|together)$/;

/** Depths in order, none deeper than `depth`, at most `max` of them; undefined if they can't be that. */
function parseDepths(v: unknown, depth: number, max: number): number[] | undefined {
  if (!Array.isArray(v) || v.length > max) return undefined;
  const out: number[] = [];
  for (const x of v) {
    const d = int(x, 1, depth);
    if (d === null || d < (out.at(-1) ?? 1)) return undefined;
    out.push(d);
  }
  return out;
}

/**
 * Loss depths that can be true of a run at `depth`. Alone: up to three, a
 * run's third where it fell, so a fall's is at `depth` and a run left
 * standing has fewer. Together: lives given back can be lost again, but a
 * question takes two at most (a cave-in), so never more than two a depth.
 */
function parseLosses(v: unknown, depth: number, left: boolean, team: boolean): number[] | undefined {
  if (team) return parseDepths(v, depth, 2 * depth);
  const out = parseDepths(v, depth, left ? DELVE_LIVES - 1 : DELVE_LIVES);
  if (!out || (!out.length && !left)) return undefined;
  return out.length === DELVE_LIVES && out.at(-1) !== depth ? undefined : out;
}

/** A group run from before co-op (one device's, or one with a winner): never released, dropped. */
const preCoop = (v: Record<string, unknown>) => v.hot === true || (typeof v.players === 'number' && v.players > 1 && !Array.isArray(v.perished));

function parseRun(v: unknown): DelveRun | null {
  if (!isObj(v)) return null;
  const id = int(v.id, 0, Number.MAX_SAFE_INTEGER);
  const at = int(v.at, 0, Number.MAX_SAFE_INTEGER);
  const depth = int(v.depth, 1, MAX_DEPTH);
  const players = int(v.players, 1, 64);
  const ruleset = int(v.ruleset, 1, 1e6);
  if (id === null || at === null || depth === null || players === null || ruleset === null) return null;
  const team = players > 1;
  if (preCoop(v)) return null;
  const left = v.left === true;
  const losses = parseLosses(v.losses, depth, left, team);
  const who = typeof v.who === 'string' && v.who.length > 0 && v.who.length <= 64 ? v.who : null;
  // Each perish is a life lost.
  const perished = team ? (parseDepths(v.perished, depth, losses?.length ?? 2 * depth) ?? []) : [];
  const given = team ? (int(v.given, 1, MAX_COUNT) ?? 0) : 0;
  const revived = team ? Math.min(perished.length, int(v.revived, 1, MAX_COUNT) ?? 0) : 0;
  const wards = int(v.wards, 1, 2 * MAX_DEPTH);
  return {
    id,
    at,
    depth,
    players,
    ruleset,
    mixed: v.mixed === true,
    ...(losses ? { losses } : {}),
    ...(who ? { who } : {}),
    ...(left ? { left: true as const } : {}),
    ...(team ? { perished } : {}),
    ...(given ? { given } : {}),
    ...(revived ? { revived } : {}),
    ...(wards ? { wards } : {}),
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
  const left = parseCounts(v.left);
  const perished = parseCounts(v.perished);
  const total = (n: unknown) => Math.min(MAX_COUNT, int(n, 1, Number.MAX_SAFE_INTEGER) ?? 0);
  const [given, revived, warded] = [total(v.given), total(v.revived), total(v.warded)];
  return {
    ends: parseCounts(v.ends),
    lost: parseCounts(v.lost),
    ...(Object.keys(left).length ? { left } : {}),
    ...(Object.keys(perished).length ? { perished } : {}),
    ...(given ? { given } : {}),
    ...(revived ? { revived } : {}),
    ...(warded ? { warded } : {}),
  };
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

/** Where the dropped group runs among these went: their steps of the frontier, as `${depth}:${at}`. */
function droppedSteps(...lists: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const v of lists.flatMap((l) => (Array.isArray(l) ? l : isObj(l) ? Object.values(l) : [])))
    if (isObj(v) && preCoop(v)) out.add(`${v.depth}:${v.at}`);
  return out;
}

/** Stored records, cleaned up; null when missing, malformed or from a version this build doesn't know (version 1 is read as it was). */
export function parseRecords(raw: string | null): DelveRecords | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || (v.v !== 1 && v.v !== VERSION)) return null;
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
  // Not those of the group runs dropped: they were never released.
  const dropped = droppedSteps(v.runs, v.bests);
  const kept = new Set(runs.map((run) => `${run.depth}:${run.at}`));
  const steps = parseSteps(v.frontier).filter((f) => !dropped.has(`${f.depth}:${f.at}`) || kept.has(`${f.depth}:${f.at}`));
  r.frontier = frontierOf([...runs.map((run) => ({ depth: run.depth, at: run.at })), ...steps]);
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

/** What is stored: the records, or while there are none yet, those under the old name (null for neither). */
const storedRaw = (raw: string | null) => raw ?? readStored(LEGACY);

/** The stored records (empty when there are none or they can't be read; never written over for that). Read fresh: another tab may have added to them. */
export function loadRecords(): DelveRecords {
  return parseRecords(storedRaw(readStored(DELVE_RECORD_NAME))) ?? emptyRecords();
}

/** Whether they could be stored. When storage is full, the oldest runs of the list go first (the bests, tallies and climbs stay). */
function write(r: DelveRecords): boolean {
  for (let runs = r.runs; ; runs = runs.slice(Math.ceil(runs.length / 2))) {
    if (writeStored(DELVE_RECORD_NAME, serializeRecords({ ...r, runs }))) return true;
    if (!runs.length) return false;
  }
}

/**
 * Records a run; returns how it measured up (null when it couldn't be
 * stored). Records a newer build wrote are left as they are; anything else
 * unreadable is kept aside first (lib/keepAside.ts).
 */
export function recordRun(run: DelveRun): Measure | null {
  const raw = tryReadStored(DELVE_RECORD_NAME);
  if (raw === undefined) return null;
  // The first time, they start from the old name's (left as they are).
  const stored = parseRecords(storedRaw(raw));
  if (raw && !stored && !makeRoom(DELVE_RECORD_NAME, raw, VERSION)) return null;
  const was = stored ?? emptyRecords();
  const { records, previousBest, best } = addRun(was, run);
  if (records !== was && !write(records)) return null;
  return { previousBest, best };
}

/**
 * Records the run this device is leaving before its end, if any (see
 * leftEvent). For the session to call as it leaves a game, whatever the way
 * out: the same run's end replaces it, and it never replaces an end.
 */
export function recordLeft(s: GameState | null, me: string | null, hotSeat = false) {
  const run = leftEvent(s, me, hotSeat);
  if (run) recordRun(run);
}

/**
 * Erases the records, the old name's they started from and what was kept
 * aside. Empty records are left in their place, so an older build's, written
 * again meanwhile under the old name, are never taken up.
 */
export function resetRecords() {
  for (const name of [DELVE_RECORD_NAME, LEGACY]) {
    removeStored(name);
    clearAside(name);
  }
  writeStored(DELVE_RECORD_NAME, serializeRecords(emptyRecords()));
}
