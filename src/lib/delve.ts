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

/** Seconds per question: 16 at the top, one less every six depths, down to DELVE_MIN_TIMER from depth 55. */
export const delveTimer = (d: number) => Math.max(DELVE_MIN_TIMER, 16 - Math.floor((depthOf(d) - 1) / 6));

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
 * be the answer. From depth 25 the art burns into view, one step slower every
 * 25 depths (and its clock only starts once the art is out); grayscale only
 * comes after that, so the first art to burn in is in colour.
 */
export const DELVE_STEPS: (DelveKnobs & { from: number })[] = [
  { from: 1, options: 4, similarNames: 0, fakes: 0, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 3, options: 6, similarNames: 0.5, fakes: 0, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 5, options: 6, similarNames: 0.5, fakes: 1, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 7, options: 8, similarNames: 0.5, fakes: 1, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 10, options: 8, similarNames: 1, fakes: 2, artChance: 0.5, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 13, options: 8, similarNames: 1, fakes: 2, artChance: 0.5, grayscale: 'off', mirror: 0.3, veil: 'off' },
  { from: 17, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'off', mirror: 0.3, veil: 'off' },
  { from: 21, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'off', mirror: 0.5, veil: 'off' },
  { from: 25, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'off', mirror: 0.5, veil: 'fast' },
  { from: 30, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'art', mirror: 0.5, veil: 'fast' },
  { from: 35, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'art', mirror: 1, veil: 'fast' },
  { from: 40, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 1, veil: 'fast' },
  { from: 50, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 1, veil: 'slow' },
  { from: 75, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 1, veil: 'slowest' },
];

/** The step of the curve a depth plays. */
function stepOf(d: number) {
  const depth = depthOf(d);
  return DELVE_STEPS.findLast((step) => depth >= step.from)!;
}

/** Depth where "find the art" pictures may burn in too: one more percent of them every depth after it. */
export const TILE_VEIL_FROM = 25;

/** The share of "find the art" questions whose pictures burn into view, when the art does at all. */
export function delveTileVeil(d: number): number {
  const depth = depthOf(d);
  return depth < TILE_VEIL_FROM ? 0 : Math.min(1, (depth - TILE_VEIL_FROM + 1) / 100);
}

/**
 * How finely a "find the art" picture is cut, for a veil cut `size` × `size`
 * over a whole item: much coarser, so up to eight pictures stay a few dozen
 * patches each to send and burn (3 × 3 fast, 4 × 4 slower).
 */
export const tileVeilSize = (size: number) => Math.min(4, Math.ceil(size / 2));

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

// ---- finds -----------------------------------------------------------------

/**
 * Special cards found among those on offer: pick one and answer right for an
 * item. An Azurite Vein yields an Azurite Ward (a ward takes a loss in place of
 * a life) but only to a fast answer; a Flare Cache a flare (it burns by itself
 * as the clock runs out, for more time); a Dynamite Cache dynamite (it blasts
 * open a fourth, easier card while choosing).
 */
export type FindKind = 'azurite' | 'flare' | 'dynamite';

/** What a player carries through a run. */
export interface Inventory {
  wards: number;
  flares: number;
  dynamite: number;
}
export type ItemKind = keyof Inventory;

/** Azurite Wards a player can hold at once. */
export const DELVE_MAX_WARDS = 3;
/** Flares a player can hold at once. */
export const DELVE_MAX_FLARES = 3;
/** Sticks of dynamite a player can hold at once. */
export const DELVE_MAX_DYNAMITE = 3;

/**
 * Where each find turns up, and how often. One roll per offer, against these
 * slices in turn, so an offer holds at most one find and every depth offers
 * the same chances in every run. A slice whose item the player already holds
 * all they can of comes up empty: the risk would win them nothing, and the
 * other finds keep their chances. Flares come first (more time is the gentlest
 * help), azurite where Eternal starts, dynamite once lockouts bite.
 */
export const FINDS: { kind: FindKind; item: ItemKind; from: number; chance: number; max: number }[] = [
  { kind: 'flare', item: 'flares', from: 8, chance: 0.1, max: DELVE_MAX_FLARES },
  { kind: 'azurite', item: 'wards', from: 13, chance: 0.15, max: DELVE_MAX_WARDS },
  { kind: 'dynamite', item: 'dynamite', from: 18, chance: 0.1, max: DELVE_MAX_DYNAMITE },
];

/** The find that yields an item. */
export const findFor = (kind: FindKind) => FINDS.find((f) => f.kind === kind)!;

/** The shallowest depth with any find. */
export const FINDS_FROM = Math.min(...FINDS.map((f) => f.from));

/** Seconds on the clock for a find's question: the fewest there are, at any depth. */
export const FIND_TIMER = DELVE_MIN_TIMER;

/** Every "find the art" picture of a find's question burns into view, as at the deepest depths. */
export const FIND_TILE_VEIL = 1;

/**
 * A right answer this soon after an Azurite Vein's clock started earns a ward
 * (4 of its 7 s, so the window closes as the clock shows 3). Under its slowest
 * veil that is the shortest window that still lets half the art burn in first
 * (tests/delveFinds.test.ts checks).
 */
export const AZURITE_FAST_MS = 4000;

/**
 * The rules of a find's question at depth `d`: the deepest step of the curve
 * whatever the depth (eight options, all look-alikes, three made-up names, all
 * art in grayscale and mirrored, the slowest veil), a risk for the reward. The
 * mix of art and name questions and the lockout stay the depth's: neither makes
 * the question harder, and the art lean counts every question alike.
 */
export function findRules(d: number): DifficultyRules {
  const { from: _, veil, ...k } = DELVE_STEPS.at(-1)!;
  return { ...k, artChance: stepOf(d).artChance, veil: VEIL_PACE[veil], lockout: delveLockout(d) };
}

/** When a flare burns: this long before the answering player's clock runs out. */
export const FLARE_AT_MS = 1000;

/** How much longer a burning flare keeps the clock running. */
export const FLARE_MS = 5000;

/** Options on a card blasted open with dynamite. */
export const BLAST_OPTIONS = 4;

/**
 * The rules of a card blasted open with dynamite: the depth's, with fewer
 * options to pick from (and no more made-up names than four options hold:
 * each copies a real name on screen, see game.ts maxFakes).
 */
export function blastRules(d: number): DifficultyRules {
  const r = delveRules(d);
  return { ...r, options: BLAST_OPTIONS, fakes: Math.min(r.fakes, Math.floor(BLAST_OPTIONS / 2)) };
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

const EMPTY: Inventory = { wards: 0, flares: 0, dynamite: 0 };
const CAPS: Inventory = { wards: DELVE_MAX_WARDS, flares: DELVE_MAX_FLARES, dynamite: DELVE_MAX_DYNAMITE };

/**
 * What a seated player carries: nothing outside Delve, for anyone without a
 * seat, or in older saves; odd counts read as something sane.
 */
export function inventoryOf(s: GameState, id: string): Inventory {
  const raw = s.delve && s.players.some((p) => p.id === id) ? s.delve.inventory?.[id] : undefined;
  if (!raw) return { ...EMPTY };
  const clean = (k: ItemKind) => {
    const n = raw[k];
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(CAPS[k], Math.floor(n))) : 0;
  };
  return { wards: clean('wards'), flares: clean('flares'), dynamite: clean('dynamite') };
}

/** Azurite Wards a player holds: each takes a loss in place of a life. */
export const wardsOf = (s: GameState, id: string) => inventoryOf(s, id).wards;
/** Flares a player holds. */
export const flaresOf = (s: GameState, id: string) => inventoryOf(s, id).flares;
/** Dynamite a player holds. */
export const dynamiteOf = (s: GameState, id: string) => inventoryOf(s, id).dynamite;

/** The find among the cards on offer to the player on turn, or null. */
export function findOffer(s: GameState): { category: string; kind: FindKind } | null {
  const f = s.delve?.find;
  return s.phase === 'choosing' && f && s.offered.includes(f.category) ? f : null;
}

/** The card the player on turn blasted open with dynamite, or null. */
export const blastedOffer = (s: GameState): string | null =>
  s.phase === 'choosing' && s.delve?.blasted && s.offered.includes(s.delve.blasted) ? s.delve.blasted : null;

/**
 * Seconds the question in play started with: a find's always has the fewest,
 * otherwise the depth's (a flare's extra time not counted).
 */
export const questionTimer = (s: GameState) => (s.delve && s.question?.find ? FIND_TIMER : delveTimer(s.round));

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
