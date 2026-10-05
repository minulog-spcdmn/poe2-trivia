// Delve: a game with no settings. Everyone has three lives and each round goes
// one depth deeper, where the questions get harder, the timer shorter and the
// lockout longer. The rules at a depth are the same in every run, so "depth N"
// means the same thing to everyone. Only types come from game.ts, so the engine
// can import this module without a cycle.

import type { DifficultyRules, GameState, Grayscale, Preset, Question, VeilSpeed } from './game.ts';

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

/**
 * Depths where the clock loses a second: 16 s from the start, 15 from depth
 * 13… down to DELVE_MIN_TIMER from 58. Slow at first, where a lost second
 * hurts most, then quicker; never on a depth where something else changes.
 */
const TIMER_FROM = [13, 19, 27, 34, 39, 44, 48, 53, 58];

/** Seconds per question: 16 at the top, one less at each of TIMER_FROM, never below DELVE_MIN_TIMER. */
export const delveTimer = (d: number) => {
  const depth = depthOf(d);
  return Math.max(DELVE_MIN_TIMER, 16 - TIMER_FROM.filter((from) => depth >= from).length);
};

/** Depths where the lockout grows: 2 turns from the start, then 3, 4… up to DELVE_MAX_LOCKOUT. */
const LOCKOUT_FROM = [1, 9, 23, 37, 66, 91];

/** Turns a picked category stays locked. */
export function delveLockout(d: number): number {
  const depth = depthOf(d);
  return 1 + LOCKOUT_FROM.filter((from) => depth >= from).length;
}

/**
 * Delve's own knob values: look-alikes and mirroring also come in quarters
 * (0.25, 0.75), between the steps the Custom editor offers, so the curve can
 * change one thing a little at a time.
 */
type DelveKnobs = Pick<DifficultyRules, 'options' | 'similarNames' | 'fakes' | 'artChance' | 'grayscale' | 'mirror'> & { veil: VeilSpeed };

/** How each veil speed cuts and paces the art (the same as game.ts VEILS; tests/delve.test.ts checks). */
const VEIL_PACE: Record<VeilSpeed, DifficultyRules['veil']> = {
  off: null,
  fast: { size: 5, share: 0.55 },
  slow: { size: 7, share: 0.7 },
  slowest: { size: 9, share: 0.8 },
};

/**
 * The question knobs, each from the depth where it starts: one change at a
 * time, and never on a depth where the timer or the lockout changes, so each
 * step can be felt (and named) on its own. Four options for the first ten
 * depths, made harder by look-alike and made-up names meanwhile; six from 11,
 * eight from 31. Options stop at 8: at 10 only pairs of groups can share a
 * question, so most small groups (wands, quivers, relics…) could never be the
 * answer. From depth 25 the art burns into view, slower from 50 and slowest
 * from 75 (its clock only starts once the art is out); grayscale only comes
 * after that, so the first art to burn in is in colour. The last step is at
 * 81; past depth 100 only delveMoreFakes and the tile veil keep rising.
 */
export const DELVE_STEPS: (DelveKnobs & { from: number })[] = [
  { from: 1, options: 4, similarNames: 0, fakes: 0, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 3, options: 4, similarNames: 0.25, fakes: 0, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 5, options: 4, similarNames: 0.25, fakes: 1, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 7, options: 4, similarNames: 0.5, fakes: 1, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 11, options: 6, similarNames: 0.5, fakes: 1, artChance: 0.4, grayscale: 'off', mirror: 0, veil: 'off' },
  { from: 15, options: 6, similarNames: 0.5, fakes: 1, artChance: 0.4, grayscale: 'off', mirror: 0.25, veil: 'off' },
  { from: 17, options: 6, similarNames: 0.5, fakes: 2, artChance: 0.4, grayscale: 'off', mirror: 0.25, veil: 'off' },
  { from: 21, options: 6, similarNames: 0.75, fakes: 2, artChance: 0.4, grayscale: 'off', mirror: 0.25, veil: 'off' },
  { from: 25, options: 6, similarNames: 0.75, fakes: 2, artChance: 0.4, grayscale: 'off', mirror: 0.25, veil: 'fast' },
  { from: 29, options: 6, similarNames: 0.75, fakes: 2, artChance: 0.4, grayscale: 'off', mirror: 0.5, veil: 'fast' },
  { from: 31, options: 8, similarNames: 0.75, fakes: 2, artChance: 0.4, grayscale: 'off', mirror: 0.5, veil: 'fast' },
  { from: 41, options: 8, similarNames: 0.75, fakes: 2, artChance: 0.5, grayscale: 'art', mirror: 0.5, veil: 'fast' },
  { from: 45, options: 8, similarNames: 0.75, fakes: 3, artChance: 0.5, grayscale: 'art', mirror: 0.5, veil: 'fast' },
  { from: 50, options: 8, similarNames: 0.75, fakes: 3, artChance: 0.5, grayscale: 'art', mirror: 0.5, veil: 'slow' },
  { from: 55, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'art', mirror: 0.5, veil: 'slow' },
  { from: 61, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 0.5, veil: 'slow' },
  { from: 71, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 0.75, veil: 'slow' },
  { from: 75, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 0.75, veil: 'slowest' },
  { from: 81, options: 8, similarNames: 1, fakes: 3, artChance: 0.5, grayscale: 'all', mirror: 1, veil: 'slowest' },
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

/**
 * Endless, past the last step: from this depth a growing share of name
 * questions gets a fourth made-up name (as many as eight options hold), two
 * percent more every depth, all of them by depth 150.
 */
export const MORE_FAKES_FROM = 101;

/** The share of a depth's name questions that get one more made-up name than its step's. */
export function delveMoreFakes(d: number): number {
  const depth = depthOf(d);
  return depth < MORE_FAKES_FROM ? 0 : Math.min(1, Math.round((depth - MORE_FAKES_FROM + 1) * 2) / 100);
}

/** The rules of a depth. */
export function delveRules(d: number): DifficultyRules {
  const { from: _, veil, ...k } = stepOf(d);
  const more = delveMoreFakes(d);
  return { ...k, veil: VEIL_PACE[veil], lockout: delveLockout(d), ...(more ? { moreFakes: more } : {}) };
}

/**
 * What gets harder at this depth, if anything: new question rules (a step of
 * the curve, or the first fourth made-up names), a longer lockout, or less
 * time. Only one at a time (tests/delve.test.ts checks).
 */
export function delveChangeAt(d: number): 'knobs' | 'lockout' | 'timer' | null {
  const depth = depthOf(d);
  if (depth === 1) return null;
  if (stepOf(depth) !== stepOf(depth - 1) || depth === MORE_FAKES_FROM) return 'knobs';
  if (delveLockout(depth) !== delveLockout(depth - 1)) return 'lockout';
  if (delveTimer(depth) !== delveTimer(depth - 1)) return 'timer';
  return null;
}

// ---- finds -----------------------------------------------------------------

/**
 * Special cards found among those on offer: pick one and answer right for an
 * item. An Azurite Vein yields an Azurite Ward (a ward takes a loss in place of
 * a life) to a fast answer and a shard to a slow one (two shards forge a ward);
 * a Flare Cache a flare (it burns by itself as the clock runs out, for more
 * time); a Dynamite Cache dynamite (it goes off by itself at half the clock,
 * blasting the art plain and half the wrong answers away).
 */
export type FindKind = 'azurite' | 'flare' | 'dynamite';

/** What a player carries through a run. */
export interface Inventory {
  wards: number;
  flares: number;
  dynamite: number;
  /** Azurite shards toward the next ward (two forge one, so never more than one held). */
  shards: number;
}
export type ItemKind = keyof Inventory;
/** Every item a player can carry. */
export const ITEM_KINDS: ItemKind[] = ['wards', 'flares', 'dynamite', 'shards'];

/** Azurite Wards a player can hold at once. */
export const DELVE_MAX_WARDS = 3;
/** Flares a player can hold at once. */
export const DELVE_MAX_FLARES = 3;
/** Sticks of dynamite a player can hold at once. */
export const DELVE_MAX_DYNAMITE = 3;
/** Azurite shards that forge a ward. */
export const SHARDS_PER_WARD = 2;

/**
 * Whether Dynamite Caches turn up. Switched off, no cache is ever rolled and
 * the other finds' caps grow to keep a third of offers holding a find.
 */
export const DYNAMITE_ON = true;

/** The depth by which every find has reached its full chance, which it holds from there on. */
export const FIND_RAMP_TO = 50;

/**
 * Where each find turns up, and how often: from depth `from` it is on an
 * offer `start` of the time, rising evenly to `cap` at FIND_RAMP_TO and
 * holding there. Fixed by depth, so a depth offers the same chances in every
 * run. One roll per offer against the finds' slices in turn, so an offer
 * holds at most one find, and a find whose item the player on turn can't
 * carry any more of is never rolled (its slice finds nothing), so it never
 * changes the others' chances.
 *
 * The Azurite Vein comes first and stays the rarer deep down: a ward takes a
 * whole loss, the strongest thing to carry. The Flare Cache comes deepest,
 * where clocks run short and flares get burnt, and so ends up the more
 * common. The Dynamite Cache comes in between, from depth 10, and stays the
 * rarest. Together, one offer in three from depth 50.
 */
export const FINDS: { kind: FindKind; item: ItemKind; from: number; start: number; cap: number; max: number; deeper: number; losses: number }[] = [
  { kind: 'azurite', item: 'wards', from: 5, start: 0.04, cap: DYNAMITE_ON ? 0.11 : 0.15, max: DELVE_MAX_WARDS, deeper: 15, losses: 2 },
  { kind: 'flare', item: 'flares', from: 15, start: 0.04, cap: DYNAMITE_ON ? 0.13 : 0.18, max: DELVE_MAX_FLARES, deeper: 20, losses: 1 },
  { kind: 'dynamite', item: 'dynamite', from: 10, start: DYNAMITE_ON ? 0.04 : 0, cap: DYNAMITE_ON ? 0.09 : 0, max: DELVE_MAX_DYNAMITE, deeper: 15, losses: 1 },
];

/** The find that yields an item. */
export const findFor = (kind: FindKind) => FINDS.find((f) => f.kind === kind)!;

/** How likely an offer at depth `d` is to hold a find of `kind` (for a player with room for its item). */
export function findChance(kind: FindKind, d: number): number {
  const { from, start, cap } = findFor(kind);
  const depth = depthOf(d);
  if (depth < from || cap <= 0) return 0;
  const t = Math.min(1, (depth - from) / (FIND_RAMP_TO - from));
  return Math.round((start + (cap - start) * t) * 10_000) / 10_000;
}

/** The shallowest depth with any find. */
export const FINDS_FROM = Math.min(...FINDS.filter((f) => f.cap > 0).map((f) => f.from));

/**
 * A find's question is the question of `deeper` depths down (FINDS): hard,
 * but not the hardest there is until the curve runs out. The Flare Cache
 * asks from further down than the Azurite Vein, whose risk is the cave-in
 * instead (see findLosses).
 */
export const findDepth = (kind: FindKind, d: number) => depthOf(d) + findFor(kind).deeper;

/**
 * Losses a wrong answer (or a time-out) to a find costs: two for an Azurite
 * Vein, whose seam caves in; one for the rest. Each is taken by a ward first
 * if the player holds one, and a player falls on their last life whatever is
 * left, so on it a cave-in costs no more than any miss. Dynamite going off
 * on it changes none of that.
 */
export const findLosses = (kind: FindKind) => findFor(kind).losses;

/** Whether a wrong answer to this find caves in (costs more than one loss). */
export const cavesIn = (kind: FindKind) => findLosses(kind) > 1;

/** Seconds on the clock for a find's question: the deeper depth's. */
export const findTimer = (kind: FindKind, d: number) => delveTimer(findDepth(kind, d));

/** The share of a find's "find the art" questions whose pictures burn into view: the deeper depth's. */
export const findTileVeil = (kind: FindKind, d: number) => delveTileVeil(findDepth(kind, d));

/**
 * The rules of a find's question at depth `d`: those of its deeper depth, a
 * risk for the reward. The mix of art and name questions and the lockout stay
 * the depth's: neither makes the question harder, and the art lean counts
 * every question alike.
 */
export function findRules(kind: FindKind, d: number): DifficultyRules {
  return { ...delveRules(findDepth(kind, d)), artChance: stepOf(d).artChance, lockout: delveLockout(d) };
}

/**
 * An Azurite Vein's fast window: a right answer this soon after the clock
 * starts mines a whole ward. The first half of the question's `secs`, rounded
 * up to a whole second so the ring and the note can say it plainly. Even at
 * the shortest clock under the slowest veil, half the art burns in before it
 * closes (tests/delveFinds.test.ts checks).
 */
export const veinWindow = (secs: number) => Math.ceil(secs / 2) * 1000;

/**
 * The shortest fast window there is (at the shortest clock).
 * @deprecated The window follows the question's clock: use veinWindowMs(s).
 */
export const AZURITE_FAST_MS = veinWindow(DELVE_MIN_TIMER);

/** When a flare burns: this long before the answering player's clock runs out. */
export const FLARE_AT_MS = 1000;

/** How much longer a burning flare keeps the clock running. */
export const FLARE_MS = 5000;

/**
 * When a stick of dynamite goes off (ms from the clock's start, for a
 * question that started with `secs`): once half the clock has run out,
 * rounded up to a whole second like the Azurite Vein's fast window, which it
 * closes, so a blast never helps mine a ward.
 */
export const blastAt = (secs: number) => veinWindow(secs);

/**
 * How many wrong answers dynamite blows away from a question of `options`:
 * half of the wrong ones, rounded down, never leaving fewer than two options.
 */
export const blastCount = (options: number) => Math.max(0, Math.min(Math.floor((options - 1) / 2), options - 2));

/**
 * Whether dynamite has anything to clear from a question's art: art burning
 * in, a picture mirrored, or art without colour (`grayscale`, the rules'),
 * so the host has plain art to send (on the host: the full question).
 */
export function blastClears(q: Pick<Question, 'mode' | 'veil' | 'mirrored'>, grayscale: Grayscale): boolean {
  return !!q.veil || !!q.mirrored?.some(Boolean) || grayscale === 'all' || (grayscale === 'art' && q.mode === 'art');
}

/** Seconds a Delve question at depth `d` starts with: a find's, or the depth's. */
export const delveQuestionTimer = (d: number, q: { find?: FindKind }) => (q.find ? findTimer(q.find, d) : delveTimer(d));

const CAPS: Inventory = { wards: DELVE_MAX_WARDS, flares: DELVE_MAX_FLARES, dynamite: DELVE_MAX_DYNAMITE, shards: SHARDS_PER_WARD - 1 };

/** Whether a player holding `inv` can take one more of `item` (a shard only toward a ward they have room for). */
export const hasRoom = (inv: Inventory, item: ItemKind) => (item === 'shards' ? inv.wards < DELVE_MAX_WARDS : inv[item] < CAPS[item]);

/**
 * What a right answer to a find earns a player holding `inv`: a ward from an
 * Azurite Vein answered `fast`, a shard from one answered slower, a flare or
 * dynamite from their caches; null if they can't carry it (no such find is
 * offered to them, but one could be planted by hand or come from an older save).
 */
export function findReward(kind: FindKind, inv: Inventory, fast: boolean): ItemKind | null {
  const own: ItemKind = kind === 'azurite' ? (fast ? 'wards' : 'shards') : findFor(kind).item;
  return hasRoom(inv, own) ? own : null;
}

/** The preset a depth plays most like, for filing answers in the codex. */
export function delveTier(d: number): Preset {
  const depth = depthOf(d);
  return depth < 11 ? 'cruel' : depth < 31 ? 'merciless' : 'eternal';
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

const EMPTY: Inventory = { wards: 0, flares: 0, dynamite: 0, shards: 0 };

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
  return { wards: clean('wards'), flares: clean('flares'), dynamite: clean('dynamite'), shards: clean('shards') };
}

/** Azurite Wards a player holds: each takes a loss in place of a life. */
export const wardsOf = (s: GameState, id: string) => inventoryOf(s, id).wards;
/** Flares a player holds. */
export const flaresOf = (s: GameState, id: string) => inventoryOf(s, id).flares;
/** Dynamite a player holds. */
export const dynamiteOf = (s: GameState, id: string) => inventoryOf(s, id).dynamite;
/** Azurite shards a player holds toward their next ward. */
export const shardsOf = (s: GameState, id: string) => inventoryOf(s, id).shards;

/** The find among the cards on offer to the player on turn, or null. */
export function findOffer(s: GameState): { category: string; kind: FindKind } | null {
  const f = s.delve?.find;
  return s.phase === 'choosing' && f && s.offered.includes(f.category) ? f : null;
}

/**
 * Seconds the question in play started with: a find's or the depth's (a
 * flare's extra time not counted).
 */
export const questionTimer = (s: GameState) => (s.delve && s.question ? delveQuestionTimer(s.round, s.question) : delveTimer(s.round));

/** An Azurite Vein's fast window for the question in play, in ms from its clock's start (0 for any other question). */
export const veinWindowMs = (s: GameState) => (s.delve && s.question?.find === 'azurite' ? veinWindow(questionTimer(s)) : 0);

/** When dynamite goes off on the question in play, in ms from its clock's start (blastAt). */
export const blastAtMs = (s: GameState) => blastAt(questionTimer(s));

/**
 * The depth where a player lost their last life, or null while they still
 * stand. A cave-in takes two lives at once, so the same depth can be in
 * `losses` twice, the fall among them.
 */
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
