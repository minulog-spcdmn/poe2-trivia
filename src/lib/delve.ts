// Delve: a game with no settings. Everyone has three lives and each round goes
// one depth deeper, where the questions get harder, the timer shorter and the
// lockout longer. The rules at a depth are the same in every run, so "depth N"
// means the same thing to everyone. Only types come from game.ts, so the engine
// can import this module without a cycle.

import type { DifficultyRules, GameState, Preset, VeilSpeed } from './game.ts';

export const DELVE_LIVES = 3;

/**
 * Bumped whenever the curve below changes, together with PROTOCOL_VERSION:
 * guests read parts of the curve from their own copy, and records made under
 * one ruleset aren't compared with another.
 */
export const DELVE_RULESET = 1;

/** Ten categories, three on offer: a lockout of seven still leaves three to pick from. */
export const DELVE_MAX_LOCKOUT = 7;

/** Online group runs: how long a player has to pick a category before one is picked for them. */
export const DELVE_PICK_MS = 20_000;

/** A player who comes back with less than this left to pick gets this much, once per turn. */
export const DELVE_REJOIN_MS = 10_000;

/** After the host reloads, players who were cut off get this long to come back before their turn runs. */
export const DELVE_RESUME_GRACE_MS = 60_000;

/** Depth as a whole number from 1 (anything odd counts as the surface). */
const depthOf = (d: number) => (Number.isFinite(d) ? Math.max(1, Math.floor(d)) : 1);

/**
 * The shortest a question gets. Long enough that, under the slowest veil, half
 * the art has burnt in with over 3 s still left to answer (at 6 s it would be 2.7).
 */
export const DELVE_MIN_TIMER = 7;

/** Seconds per question: 16 at the top, one less every three depths, never under DELVE_MIN_TIMER (from depth 28). */
export const delveTimer = (d: number) => Math.max(DELVE_MIN_TIMER, 16 - Math.floor((depthOf(d) - 1) / 3));

/** Depths where the lockout grows: 2 turns from the start, then 3, 4… up to DELVE_MAX_LOCKOUT. */
const LOCKOUT_FROM = [1, 7, 13, 21, 29, 37];

/** Turns a picked category stays locked. */
export function delveLockout(d: number): number {
  const depth = depthOf(d);
  return 1 + LOCKOUT_FROM.filter((from) => depth >= from).length;
}

type DelveKnobs = Pick<DifficultyRules, 'options' | 'similarNames' | 'fakes' | 'artChance' | 'grayscale' | 'mirror'> & { veil: VeilSpeed };

/** How each veil speed cuts and paces the art (the same as game.ts VEILS; tests/delve.test.ts checks). */
const VEIL_PACE: Record<VeilSpeed, DifficultyRules['veil']> = {
  off: null,
  fast: { size: 5, share: 0.55 },
  slow: { size: 7, share: 0.7 },
  slowest: { size: 9, share: 0.8 },
};

/**
 * The question knobs, each from the depth where it starts. Quick steps at
 * first, so a run gets going: Cruel at the top, Merciless by depth 5, Eternal
 * by 13, then past Eternal. Options stop at 8: at 10 only pairs of groups can
 * share a question, so most small groups (wands, quivers, relics…) could never
 * be the answer. From depth 25 the art of name questions burns into view,
 * one step slower every 25 depths; its clock only starts once the art is out.
 */
export const DELVE_STEPS: (DelveKnobs & { from: number })[] = [
  { from: 1, options: 4, similarNames: 0, fakes: 0, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 3, options: 6, similarNames: 0.5, fakes: 0, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 5, options: 6, similarNames: 0.5, fakes: 1, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 7, options: 8, similarNames: 0.5, fakes: 1, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 10, options: 8, similarNames: 1, fakes: 2, artChance: 0.5, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 13, options: 8, similarNames: 1, fakes: 2, artChance: 0.5, grayscale: 'art', mirror: 0.3, veil: 'off' },
  { from: 17, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'art', mirror: 0.3, veil: 'off' },
  { from: 21, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 0.5, veil: 'off' },
  { from: 25, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 1, veil: 'fast' },
  { from: 50, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 1, veil: 'slow' },
  { from: 75, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 1, veil: 'slowest' },
];

/** The step of the curve a depth plays. */
function stepOf(d: number) {
  const depth = depthOf(d);
  return DELVE_STEPS.findLast((step) => depth >= step.from)!;
}

/** The rules of a depth. */
export function delveRules(d: number): DifficultyRules {
  const { from: _, veil, ...k } = stepOf(d);
  return { ...k, veil: VEIL_PACE[veil], lockout: delveLockout(d) };
}

/** What gets harder at this depth, if anything: new question rules, a longer lockout, or less time. */
export function delveChangeAt(d: number): 'knobs' | 'lockout' | 'timer' | null {
  const depth = depthOf(d);
  if (depth === 1) return null;
  if (stepOf(depth) !== stepOf(depth - 1)) return 'knobs';
  if (delveLockout(depth) !== delveLockout(depth - 1)) return 'lockout';
  if (delveTimer(depth) !== delveTimer(depth - 1)) return 'timer';
  return null;
}

/** The preset a depth plays most like, for filing answers in the codex. */
export function delveTier(d: number): Preset {
  const depth = depthOf(d);
  return depth < 5 ? 'cruel' : depth < 13 ? 'merciless' : 'eternal';
}

// ---- reading a run --------------------------------------------------------

/** The depth of the run in progress (the round), 0 outside Delve. */
export const delveDepth = (s: GameState) => (s.delve ? s.round : 0);

/** A run of two or more players (last one standing), not a solo one. */
export const isGroupRun = (s: GameState) => (s.delve?.entrants.length ?? 0) >= 2;

/** Lives a seated player has left; 0 for anyone without a seat, or outside Delve. */
export function livesOf(s: GameState, id: string): number {
  if (!s.delve || !s.players.some((p) => p.id === id)) return 0;
  return Math.max(0, DELVE_LIVES - (s.delve.losses[id]?.length ?? 0));
}

/** The depth where a player lost their last life, or null while they still stand. */
export function fellAt(s: GameState, id: string): number | null {
  return s.delve?.losses[id]?.[DELVE_LIVES - 1] ?? null;
}

/** Seated players with lives left, in seat order. */
export const standingIds = (s: GameState) => s.players.filter((p) => livesOf(s, p.id) > 0).map((p) => p.id);

/**
 * Who went deeper, positive when `a` did: someone still standing first, then
 * the deeper fall, then whoever lost their second-to-last life deeper, then
 * their first. Equal runs compare as 0.
 */
export function compareDelvers(s: GameState, a: string, b: string): number {
  const standA = livesOf(s, a) > 0;
  const standB = livesOf(s, b) > 0;
  if (standA !== standB) return standA ? 1 : -1;
  const la = [...(s.delve?.losses[a] ?? [])].reverse();
  const lb = [...(s.delve?.losses[b] ?? [])].reverse();
  // Standing players: fewer losses is better, then later ones.
  if (standA && la.length !== lb.length) return lb.length - la.length;
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    const d = (la[i] ?? Infinity) - (lb[i] ?? Infinity);
    if (d !== 0) return d;
  }
  return 0;
}

export interface DelveStanding {
  id: string;
  /** Where they fell, or the current depth while they still stand. */
  depth: number;
  lives: number;
  losses: number[];
  /** 1 for the deepest; equal runs share a rank. */
  rank: number;
}

/** The seated players, deepest first. */
export function delveStandings(s: GameState): DelveStanding[] {
  const ids = s.players.map((p) => p.id).sort((a, b) => compareDelvers(s, b, a));
  const out: DelveStanding[] = [];
  ids.forEach((id, i) => {
    const prev = out[i - 1];
    const rank = prev && compareDelvers(s, prev.id, id) === 0 ? prev.rank : i + 1;
    out.push({ id, depth: fellAt(s, id) ?? s.round, lives: livesOf(s, id), losses: [...(s.delve?.losses[id] ?? [])], rank });
  });
  return out;
}
