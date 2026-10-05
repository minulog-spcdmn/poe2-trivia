// Delve: a game with no settings. Everyone has three lives and each round goes
// one depth deeper, where the questions get harder, the timer shorter and the
// lockout longer. The rules at a depth are the same in every run, so "depth N"
// means the same thing to everyone. Only types come from game.ts, so the engine
// can import this module without a cycle.

import type { DifficultyRules, GameState, Preset } from './game.ts';

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

/** Depths per stratum: the rules change at the first depth of each. */
export const STRATUM_DEPTHS = 4;

/** Depth as a whole number from 1 (anything odd counts as the surface). */
const depthOf = (d: number) => (Number.isFinite(d) ? Math.max(1, Math.floor(d)) : 1);

/** Which stratum a depth is in: 1 for depths 1-4, 2 for 5-8, and so on. */
export const delveStratum = (d: number) => Math.ceil(depthOf(d) / STRATUM_DEPTHS);

/** Seconds per question: 20 at the top, one less each stratum, never under 5. */
export const delveTimer = (d: number) => Math.max(5, 21 - delveStratum(d));

const LOCKOUTS = [2, 2, 2, 3, 3, 3, 4, 4, 5, 6];

/** Turns a picked category stays locked: longer each few strata, at most DELVE_MAX_LOCKOUT. */
export const delveLockout = (d: number) => LOCKOUTS[delveStratum(d) - 1] ?? DELVE_MAX_LOCKOUT;

type DelveKnobs = Pick<DifficultyRules, 'options' | 'similarNames' | 'fakes' | 'artChance' | 'grayscale' | 'mirror'>;

/**
 * The question knobs of each stratum, one step at a time: Cruel without art
 * questions, then Cruel, Merciless and Eternal as turns plays them, then past
 * Eternal. Options stop at 8: at 10 only pairs of groups can share a question,
 * so most small groups (wands, quivers, relics…) could never be the answer.
 * No veil: on your own turn it would only eat into the timer.
 */
const DELVE_KNOBS: DelveKnobs[] = [
  { options: 4, similarNames: 0, fakes: 0, artChance: 0, grayscale: 'off', mirror: 0 },
  { options: 4, similarNames: 0, fakes: 0, artChance: 0.4, grayscale: 'off', mirror: 0 },
  { options: 6, similarNames: 0, fakes: 0, artChance: 0.4, grayscale: 'off', mirror: 0 },
  { options: 6, similarNames: 0.5, fakes: 1, artChance: 0.4, grayscale: 'off', mirror: 0 },
  { options: 8, similarNames: 0.5, fakes: 1, artChance: 0.4, grayscale: 'off', mirror: 0 },
  { options: 8, similarNames: 1, fakes: 2, artChance: 0.5, grayscale: 'off', mirror: 0 },
  { options: 8, similarNames: 1, fakes: 2, artChance: 0.5, grayscale: 'art', mirror: 0.3 },
  { options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'art', mirror: 0.3 },
  { options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 0.5 },
  { options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 1 },
];

/** The rules of a depth. */
export function delveRules(d: number): DifficultyRules {
  const k = DELVE_KNOBS[Math.min(delveStratum(d), DELVE_KNOBS.length) - 1];
  return { ...k, veil: null, lockout: delveLockout(d) };
}

/** The preset a depth plays most like, for filing answers in the codex. */
export function delveTier(d: number): Preset {
  const stratum = delveStratum(d);
  return stratum <= 3 ? 'cruel' : stratum <= 6 ? 'merciless' : 'eternal';
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
