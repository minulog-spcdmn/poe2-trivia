// Delve: a game with no settings. Everyone has three lives and each round goes
// one depth deeper, where the questions get harder, the timer shorter and the
// lockout longer. The rules at a depth are the same in every run, so "depth N"
// means the same thing to everyone. Only types come from game.ts, so the engine
// can import this module without a cycle.
//
// Alone, a run is turns of one player. Together (online only) it is co-op: the
// team votes for a card, everyone standing answers the one question, and a
// teammate with lives to spare can bring back one who perished.

import type { DifficultyRules, GameState, Grayscale, Player, Preset, Question, Revive } from './game.ts';
import { halfBurnt } from './patches.ts';

export const DELVE_LIVES = 3;

/**
 * Bumped whenever the curve below changes, together with PROTOCOL_VERSION:
 * guests read parts of the curve from their own copy, and records made under
 * one ruleset aren't compared with another.
 */
export const DELVE_RULESET = 1;

/** Ten categories, three on offer: a lockout of seven still leaves three to pick from. */
export const DELVE_MAX_LOCKOUT = 7;

/**
 * Co-op: the first vote gives everyone else this long to vote too before the
 * vote closes. Nothing is ever picked without a vote: until the first one the
 * team can take a breather on the cards for as long as it likes.
 */
export const VOTE_WINDOW_MS = 6000;

/** Co-op: a player who lets this many votes in a row pass is idle, and not waited for until they vote again. */
export const DELVE_IDLE_ROUNDS = 3;

/** Co-op: lives a player needs to give one to a perished teammate (so giving never makes them perish). */
export const REVIVE_FROM = 2;

/** After the host reloads, players who were cut off get this long to come back before a vote closes without them. */
export const DELVE_RESUME_GRACE_MS = 60_000;

/** Depth as a whole number from 1 (anything odd counts as the surface). */
const depthOf = (d: number) => (Number.isFinite(d) ? Math.max(1, Math.floor(d)) : 1);

/**
 * The shortest a question gets, from depth 96: very little, for the deepest
 * delvers. The art burns in faster on so short a clock (veilSeconds), so
 * half of it is still in with VEIL_LEFT_MS to answer.
 */
export const DELVE_MIN_TIMER = 5;

/**
 * Depths where the clock loses a second: 16 s from the start, 15 from depth
 * 13… 7 from 58, then 6 from 78 and DELVE_MIN_TIMER (5) from 96. Slow at
 * first, where a lost second hurts most, then quicker; never on a depth where
 * another step (options, made-up names, the lockout) comes.
 */
const TIMER_FROM = [13, 19, 27, 34, 39, 44, 48, 53, 58, 78, 96];

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
 * How a smooth rise goes: 0 up to depth `from`, 1 from depth `to` on, and in
 * between linear, or eased out with `ease` above 1 (quicker at first, gentler
 * as it nears the top).
 */
function ramp(d: number, from: number, to: number, ease = 1): number {
  const t = Math.min(1, Math.max(0, (depthOf(d) - from) / (to - from)));
  return Math.round((1 - (1 - t) ** ease) * 10_000) / 10_000;
}

/**
 * The knobs that rise a little at every depth instead of in steps, each from
 * the depth before it first shows (`from`, where it is still at `lo`) to the
 * depth where it tops out (`to`, at `hi`), so no single depth jumps. Spread
 * over the whole run to 100, where all of them are at their hardest:
 * - look-alike names, from depth 2, eased out (most of the rise by 40: they
 *   are what the first depths have to get harder with);
 * - "find the art" questions, none at depth 1, a percent more with every
 *   depth to 6 in 10 at 60 (they are easy while the art is plain, and grow
 *   hard as the unveil, mirroring, grayscale and look-alikes come in);
 * - mirrored pictures, from depth 15, every picture from 85;
 * - the unveil, from depth 25: its share of the clock from 30% to 80% and its
 *   patches from about 4 × 4 to 9 × 9 by depth 90 (on the shortest clocks
 *   it burns in faster still: veilSeconds);
 * - grayscale, a chance per question from depth 41, all of them from 90:
 *   after the unveil has started, so the first art to burn in is in colour.
 */
export const DELVE_CURVES = {
  similarNames: { from: 1, to: 80, lo: 0, hi: 1, ease: 2 },
  artChance: { from: 1, to: 60, lo: 0, hi: 0.6, ease: 1 },
  mirror: { from: 14, to: 85, lo: 0, hi: 1, ease: 1 },
  veilShare: { from: 24, to: 90, lo: 0.3, hi: 0.8, ease: 1 },
  veilSize: { from: 24, to: 90, lo: 4, hi: 9, ease: 1 },
  grayChance: { from: 40, to: 90, lo: 0, hi: 1, ease: 1 },
} as const;

/** Depth where the art starts to burn into view (the unveil). */
export const VEIL_FROM = DELVE_CURVES.veilShare.from + 1;

/** A smoothly rising knob at depth `d` (DELVE_CURVES). */
export function delveCurve(knob: keyof typeof DELVE_CURVES, d: number): number {
  const { from, to, lo, hi, ease } = DELVE_CURVES[knob];
  return Math.round((lo + (hi - lo) * ramp(d, from, to, ease)) * 10_000) / 10_000;
}

/**
 * The knobs that still come in steps, each from the depth where it starts:
 * options (four for the first ten depths, six from 11, eight from 31; they
 * stop at 8, since at 10 only pairs of groups can share a question, so most
 * small groups like wands, quivers or relics could never be the answer) and
 * made-up names. Never on a depth where another step, the timer or the
 * lockout changes.
 */
export const OPTIONS_FROM: { from: number; options: number }[] = [
  { from: 1, options: 4 },
  { from: 11, options: 6 },
  { from: 31, options: 8 },
];
export const FAKES_FROM: { from: number; fakes: number }[] = [
  { from: 1, fakes: 0 },
  { from: 5, fakes: 1 },
  { from: 17, fakes: 2 },
  { from: 45, fakes: 3 },
];

const stepAt = <T extends { from: number }>(steps: T[], d: number) => steps.findLast((step) => depthOf(d) >= step.from)!;

/** How the art burns in at depth `d` (from VEIL_FROM), before any cap on a short clock (veilSeconds). */
export function delveVeil(d: number): DifficultyRules['veil'] {
  if (depthOf(d) < VEIL_FROM) return null;
  return { size: delveCurve('veilSize', d), share: delveCurve('veilShare', d) };
}

/** Depth where "find the art" pictures may burn in too: one more percent of them every depth after it. */
export const TILE_VEIL_FROM = VEIL_FROM;

/** The share of "find the art" questions whose pictures burn into view, when the art does at all. */
export function delveTileVeil(d: number): number {
  const depth = depthOf(d);
  return depth < TILE_VEIL_FROM ? 0 : Math.min(1, (depth - TILE_VEIL_FROM + 1) / 100);
}

/**
 * How finely a "find the art" picture is cut, for a veil cut `size` × `size`
 * over a whole item: much coarser, so up to eight pictures stay a few dozen
 * patches each to send and burn (3 × 3 for a 5 × 5 veil, never past 4 × 4).
 */
export const tileVeilSize = (size: number) => Math.min(4, (size + 1) / 2);

/** Time left to answer, at the least, once half the art has burnt in (veilSeconds). */
export const VEIL_LEFT_MS = 3000;

/**
 * Seconds a veil cut `size` × `size` takes to burn in on a clock of `secs`:
 * its `share` of the clock, but never so long that half the art comes in
 * with less than VEIL_LEFT_MS left (halfBurnt), so on a short clock deep
 * down the art burns in faster instead. `tiles`: "find the art" pictures,
 * the last of which starts up to half a step late. The engine sets a
 * question's veil.seconds from it, and the host paces the patches by that,
 * at the pace of `size` × `size` of them however few the picture is cut
 * into (patches.ts veilPaceFor), so this holds for every real count.
 * 0 on a clock too short for even an instant veil to leave VEIL_LEFT_MS (a
 * Flare Cache's shortest, FIND_MIN_TIMER): the engine then shows the art
 * plain.
 */
export function veilSeconds(secs: number, share: number, size: number, tiles = false): number {
  const [count, late] = [size * size, tiles ? 0.5 : 0];
  const fits = (ms: number) => halfBurnt(ms, count, late) <= secs * 1000 - VEIL_LEFT_MS;
  if (fits(secs * share * 1000)) return secs * share;
  // The longest whole number of ms that fits (halfBurnt only grows with the time).
  let [lo, hi] = [0, Math.floor(secs * share * 1000)];
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo / 1000;
}

/**
 * Endless, past depth 100: from this depth a growing share of name
 * questions gets a fourth made-up name (as many as eight options hold), two
 * percent more every depth, all of them by depth 150.
 */
export const MORE_FAKES_FROM = 101;

/** The share of a depth's name questions that get one more made-up name than its step's. */
export function delveMoreFakes(d: number): number {
  const depth = depthOf(d);
  return depth < MORE_FAKES_FROM ? 0 : Math.min(1, Math.round((depth - MORE_FAKES_FROM + 1) * 2) / 100);
}

/**
 * From this depth a growing share of questions picks its look-alikes by their
 * art instead of their names: the wrong pictures of "find the art" look like
 * the answer's, and the wrong names of "name the item" belong to items drawn
 * like it. A little more of them every depth, every question from
 * LOOKALIKES_TO.
 */
export const LOOKALIKES_FROM = 50;
/** The depth from which every question picks its look-alikes by their art. */
export const LOOKALIKES_TO = 120;

/** The share of a depth's questions whose look-alikes are picked by their art (src/lib/looks.ts). */
export const delveLookalikes = (d: number) => ramp(d, LOOKALIKES_FROM - 1, LOOKALIKES_TO);

/** The rules of a depth. */
export function delveRules(d: number): DifficultyRules {
  const more = delveMoreFakes(d);
  const looks = delveLookalikes(d);
  const gray = delveCurve('grayChance', d);
  return {
    options: stepAt(OPTIONS_FROM, d).options,
    similarNames: delveCurve('similarNames', d),
    fakes: stepAt(FAKES_FROM, d).fakes,
    artChance: delveCurve('artChance', d),
    veil: delveVeil(d),
    // Rolled for each question instead (grayChance).
    grayscale: 'off',
    mirror: delveCurve('mirror', d),
    lockout: delveLockout(d),
    ...(gray ? { grayChance: gray } : {}),
    ...(looks ? { lookalikes: looks } : {}),
    ...(more ? { moreFakes: more } : {}),
  };
}

// ---- finds -----------------------------------------------------------------

/**
 * Special cards found among those on offer: pick one and answer right for an
 * item. An Azurite Vein yields an Azurite Ward (a ward takes a loss in place of
 * a life) to a fast answer and a shard to a slow one (two shards forge a ward);
 * a Flare Cache a flare (it burns by itself as the clock hits 0, for more
 * time); a Dynamite Cache dynamite (it goes off by itself at half the clock,
 * blasting the art plain and half the options away, every one of them wrong,
 * and holds the clock
 * while it does). Flares and dynamite never go off on a find's own question.
 */
export type FindKind = 'azurite' | 'flare' | 'dynamite';

/** What a player carries through a run. */
export interface Inventory {
  wards: number;
  flares: number;
  dynamite: number;
  /**
   * Azurite shards toward the next ward (two forge one, so never more than
   * one held), and none at all with DELVE_MAX_WARDS wards (see capShards).
   */
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

/** The depth by which every find has reached its full chance, which it holds to FIND_FADE_FROM. */
export const FIND_RAMP_TO = 50;
/** Past this depth the finds grow scarcer with every depth (FINDS, `late`)... */
export const FIND_FADE_FROM = 100;
/** ...until this one, from where they hold. */
export const FIND_FADE_TO = 200;

/**
 * Where each find turns up, and how often: from depth `from` it is on an
 * offer `start` of the time, rising evenly to `cap` at FIND_RAMP_TO and
 * holding there. Fixed by depth, so a depth offers the same chances in every
 * run. One roll per offer against the finds' slices in turn decides whether
 * it holds a find, and a find whose item the player on turn (in co-op:
 * nobody standing) can't carry any more of is never rolled (its slice finds
 * nothing), so it never changes the others' chances. An offer that holds one
 * rolls once more for a second find on another card (see SECOND_FIND).
 *
 * The Azurite Vein comes first and stays the rarer deep down: a ward takes a
 * whole loss, the strongest thing to carry. The Flare Cache comes deepest,
 * where clocks run short and flares get burnt, and so ends up the more
 * common. The Dynamite Cache comes in between, from depth 10, and stays the
 * rarest. Together, one offer in three from depth 50.
 *
 * Past depth 100 they grow scarcer, a little with every depth, down to
 * `late` of their cap at depth 200 (FIND_FADE_FROM to FIND_FADE_TO), and
 * hold there: a third for the vein, whose ward takes a whole loss, half for
 * the others; together about one offer in seven. So the deep end wears a
 * run down instead of letting it restock for ever.
 */
export const FINDS: {
  kind: FindKind;
  item: ItemKind;
  from: number;
  start: number;
  cap: number;
  late: number;
  max: number;
  deeper: number;
  losses: number;
  /** Seconds its question has less on the clock than its deeper depth's (never below FIND_MIN_TIMER). */
  shorter: number;
  /** Things a miss on it blows up from the player's pack (blastVictim), besides the life. */
  blows: number;
}[] = [
  { kind: 'azurite', item: 'wards', from: 5, start: 0.04, cap: DYNAMITE_ON ? 0.11 : 0.15, late: 1 / 3, max: DELVE_MAX_WARDS, deeper: 15, losses: 2, shorter: 0, blows: 0 },
  { kind: 'flare', item: 'flares', from: 15, start: 0.04, cap: DYNAMITE_ON ? 0.13 : 0.18, late: 0.5, max: DELVE_MAX_FLARES, deeper: 20, losses: 1, shorter: 3, blows: 0 },
  {
    kind: 'dynamite',
    item: 'dynamite',
    from: 10,
    start: DYNAMITE_ON ? 0.04 : 0,
    cap: DYNAMITE_ON ? 0.09 : 0,
    late: 0.5,
    max: DELVE_MAX_DYNAMITE,
    deeper: 15,
    losses: 1,
    shorter: 0,
    blows: 1,
  },
];

/**
 * A second find beside the first: an offer that holds a find rolls once more,
 * against the other kinds' slices at this share of their chance (a kind the
 * takers can't carry finds nothing, as in the first roll), and a hit puts that
 * find on another card. Never a third. Only an offer with a find rolls again,
 * so as many offers hold a find as with one roll; the second roll's chances
 * ramp with the depth's, so two finds side by side are rare early and grow
 * less rare with depth: about 1 offer in 500 at depth 10, 1 in 100 at depth
 * 20 and 1 in 28 from depth 50 (a ninth of those with a find), when the
 * takers have room for everything (tests/delveFinds.test.ts simulates it).
 */
export const SECOND_FIND = 0.5;

/** A find on one of the cards on offer. */
export interface CardFind {
  category: string;
  kind: FindKind;
}

/** At most this many finds on an offer, each on its own card and of its own kind. */
export const MAX_FINDS = 2;

/** The find that yields an item. */
export const findFor = (kind: FindKind) => FINDS.find((f) => f.kind === kind)!;

/** How likely an offer at depth `d` is to hold a find of `kind` (for a player with room for its item). */
export function findChance(kind: FindKind, d: number): number {
  const { from, start, cap, late } = findFor(kind);
  const depth = depthOf(d);
  if (depth < from || cap <= 0) return 0;
  const t = Math.min(1, (depth - from) / (FIND_RAMP_TO - from));
  const fade = Math.min(1, Math.max(0, (depth - FIND_FADE_FROM) / (FIND_FADE_TO - FIND_FADE_FROM)));
  return Math.round((start + (cap - start) * t) * (1 - (1 - late) * fade) * 10_000) / 10_000;
}

/** The shallowest depth with any find. */
export const FINDS_FROM = Math.min(...FINDS.filter((f) => f.cap > 0).map((f) => f.from));

/**
 * The shallowest depth whose questions may pick look-alikes by their art: a
 * find asks from further down, so a little above LOOKALIKES_FROM.
 */
export const LOOKALIKES_ASKED_FROM = LOOKALIKES_FROM - Math.max(...FINDS.filter((f) => f.cap > 0).map((f) => f.deeper));

/**
 * A find's question is the question of `deeper` depths down (FINDS): hard,
 * but not the hardest there is until the curve runs out (from about depth
 * 80 on there is little deeper left to ask from, so each find's own risk
 * carries the weight there: findLosses, findTimer, blowsUp). The Flare Cache
 * asks from further down than the others.
 */
export const findDepth = (kind: FindKind, d: number) => depthOf(d) + findFor(kind).deeper;

/**
 * Each find weighs its reward against a risk of its own:
 * - an Azurite Vein caves in on a miss, for two losses (findLosses);
 * - a Flare Cache gives less time to answer (findTimer, `shorter`): time
 *   now for time later;
 * - a Dynamite Cache is unstable: a miss costs the life and its blast
 *   destroys one thing the player carries (blowsUp, blastVictim).
 * A miss is a wrong answer or a time-out. No flare or dynamite goes off on
 * a find's question (itemsWorkOn).
 */

/**
 * Losses a wrong answer (or a time-out) to a find costs: two for an Azurite
 * Vein, whose seam caves in; one for the rest. Each is taken by a ward first
 * if the player holds one, and a player falls on their last life whatever is
 * left, so on it a cave-in costs no more than any miss.
 */
export const findLosses = (kind: FindKind) => findFor(kind).losses;

/** Whether a wrong answer to this find caves in (costs more than one loss). */
export const cavesIn = (kind: FindKind) => findLosses(kind) > 1;

/**
 * Whether a miss on this find also blows up something the player carries (a
 * Dynamite Cache). It comes after the loss (a ward may take that first), and
 * only to a player still standing: perishing drops the whole pack anyway.
 */
export const blowsUp = (kind: FindKind) => findFor(kind).blows > 0;

/**
 * What a Dynamite Cache's blast destroys of a pack `inv`, for a `roll` in
 * [0, 1) (the engine's roll: the host draws it and sends the outcome in
 * the state, so every screen shows the same loss): one thing, drawn at
 * random, each ward, flare and stick of dynamite one chance, and a shard
 * half of one, as it is half a ward. A ward drawn goes whole (a shard
 * held beside it stays); a pack of a shard alone loses the shard. Null for
 * an empty pack.
 */
export function blastVictim(inv: Inventory, roll: number): ItemKind | null {
  const weight = (k: ItemKind) => Math.max(0, inv[k]) * (k === 'shards' ? 1 / SHARDS_PER_WARD : 1);
  const held = ITEM_KINDS.filter((k) => weight(k) > 0);
  let r = Math.min(Math.max(roll, 0), 0.999_999) * held.reduce((sum, k) => sum + weight(k), 0);
  for (const k of held) {
    if (r < weight(k)) return k;
    r -= weight(k);
  }
  return held.at(-1) ?? null;
}

/**
 * The shortest a find's question gets (a Flare Cache's, `shorter` than the
 * shortest depth's): too short for any art to burn in fairly, so none does
 * (veilSeconds).
 */
export const FIND_MIN_TIMER = 3;

/** Seconds on the clock for a find's question: the deeper depth's, less its `shorter` (a Flare Cache's three), never below FIND_MIN_TIMER. */
export const findTimer = (kind: FindKind, d: number) => {
  const { shorter } = findFor(kind);
  const secs = delveTimer(findDepth(kind, d));
  return shorter ? Math.max(FIND_MIN_TIMER, secs - shorter) : secs;
};

/** The share of a find's "find the art" questions whose pictures burn into view: the deeper depth's. */
export const findTileVeil = (kind: FindKind, d: number) => delveTileVeil(findDepth(kind, d));

/**
 * The rules of a find's question at depth `d`: those of its deeper depth, a
 * risk for the reward. The mix of art and name questions and the lockout stay
 * the depth's: neither makes the question harder, and the art lean counts
 * every question alike.
 */
export function findRules(kind: FindKind, d: number): DifficultyRules {
  return { ...delveRules(findDepth(kind, d)), artChance: delveCurve('artChance', d), lockout: delveLockout(d) };
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

/**
 * How much longer a burning flare keeps the clock running. It burns as the
 * answering player's clock hits 0 (before the time-out is taken), so an
 * answer at any time before that keeps it.
 */
export const FLARE_MS = 5000;

/**
 * How long the clock holds when a stick of dynamite goes off: about as long
 * as the blast takes on screen (QuestionView), so watching it costs no time.
 * The deadline moves on by as much (see clockLeft).
 */
export const BLAST_PAUSE_MS = 1000;

/**
 * When a stick of dynamite goes off (ms from the clock's start, for a
 * question that started with `secs`): once half the clock has run out,
 * rounded up to a whole second like the Azurite Vein's fast window (it never
 * goes off on a vein, see itemsWorkOn).
 */
export const blastAt = (secs: number) => veinWindow(secs);

/**
 * How many options dynamite blows away from a question of `options` (co-op:
 * of those still in play, as if the struck were gone already): half of them,
 * rounded down, every one of them wrong, never leaving fewer than two (the
 * answer and one wrong). Four leave two, six three, eight four.
 */
export const blastCount = (options: number) => Math.max(0, Math.min(Math.floor(options / 2), options - 2));

/**
 * How many options a stick of dynamite would blow away from a question now
 * (blastCount of those still in play: co-op strikes take theirs out). Read
 * off the labels, which a guest's copy keeps (its options are hidden). None
 * left to blow away, no stick is spent on it.
 */
export const blastLeft = (q: Pick<Question, 'labels' | 'struck'>) => blastCount(q.labels.length - (q.struck?.length ?? 0));

/**
 * Whether dynamite has anything to clear from a question's art: art burning
 * in, a picture mirrored, or art without colour (`grayscale`, the rules'),
 * so the host has plain art to send (on the host: the full question).
 */
export function blastClears(q: Pick<Question, 'mode' | 'veil' | 'mirrored'>, grayscale: Grayscale): boolean {
  return !!q.veil || !!q.mirrored?.some(Boolean) || grayscale === 'all' || (grayscale === 'art' && q.mode === 'art');
}

/**
 * Whether flares and dynamite go off on a question: never on a find's own
 * (an Azurite Vein, a Flare or Dynamite Cache), whose risk is taken as it is.
 */
export const itemsWorkOn = (q: Pick<Question, 'find'>) => !q.find;

/**
 * Milliseconds left on a question's clock at `now` (host clock), holding
 * still while dynamite's pause lasts (`held`, whose time the deadline was
 * moved on by), so a ring drawn from it holds instead of jumping. Infinity
 * while the clock hasn't started.
 */
export function clockLeft(q: Pick<Question, 'deadline' | 'held'>, now: number): number {
  if (q.deadline === null) return Infinity;
  const h = q.held;
  // Before the pause (a screen whose clock runs a little behind the host's) all of it is still to come.
  const pausing = h && now < h.until ? h.until - Math.max(now, h.from) : 0;
  return Math.max(0, q.deadline - now - pausing);
}

/** Seconds a Delve question at depth `d` starts with: a find's, or the depth's. */
export const delveQuestionTimer = (d: number, q: { find?: FindKind }) => (q.find ? findTimer(q.find, d) : delveTimer(d));

const CAPS: Inventory = { wards: DELVE_MAX_WARDS, flares: DELVE_MAX_FLARES, dynamite: DELVE_MAX_DYNAMITE, shards: SHARDS_PER_WARD - 1 };

/**
 * An inventory with no shard beside DELVE_MAX_WARDS wards: with every ward a
 * player can hold, a shard has nothing left to forge, so none is kept. The
 * engine applies it whenever wards reach the most (a fast Vein's ward, a
 * forge), and inventoryOf whenever it reads one (an older or hand-made state).
 */
export function capShards(inv: Inventory): Inventory {
  if (inv.wards >= DELVE_MAX_WARDS) inv.shards = 0;
  return inv;
}

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

/** A co-op run: two or more players set out together (online only). One player is a solo run. */
export const isGroupRun = (s: GameState) => (s.delve?.entrants.length ?? 0) >= 2;

const seated = (s: GameState, id: string) => s.players.some((p) => p.id === id);

/** Lives a player gave to bring teammates back, and how often one was given to them. */
function gifts(s: GameState, id: string): { given: number; received: number } {
  const all = s.delve?.revives ?? [];
  return { given: all.filter((r) => r.by === id).length, received: all.filter((r) => r.to === id).length };
}

/**
 * Lives a seated player has left; 0 for anyone without a seat, or outside
 * Delve. Three, less each life lost (`losses`) and each given to a teammate,
 * plus each a teammate gave them: `losses` stays the record of where lives
 * went down there, and `revives` of the ones passed between players.
 */
export function livesOf(s: GameState, id: string): number {
  if (!s.delve || !seated(s, id)) return 0;
  const { given, received } = gifts(s, id);
  return Math.max(0, DELVE_LIVES - (s.delve.losses[id]?.length ?? 0) - given + received);
}

const EMPTY: Inventory = { wards: 0, flares: 0, dynamite: 0, shards: 0 };

/**
 * What a seated player carries: nothing outside Delve, for anyone without a
 * seat, or in older saves; odd counts read as something sane.
 */
export function inventoryOf(s: GameState, id: string): Inventory {
  const raw = s.delve && seated(s, id) ? s.delve.inventory?.[id] : undefined;
  if (!raw) return { ...EMPTY };
  const clean = (k: ItemKind) => {
    const n = raw[k];
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(CAPS[k], Math.floor(n))) : 0;
  };
  return capShards({ wards: clean('wards'), flares: clean('flares'), dynamite: clean('dynamite'), shards: clean('shards') });
}

/** Azurite Wards a player holds: each takes a loss in place of a life. */
export const wardsOf = (s: GameState, id: string) => inventoryOf(s, id).wards;
/** Flares a player holds. */
export const flaresOf = (s: GameState, id: string) => inventoryOf(s, id).flares;
/** Dynamite a player holds. */
export const dynamiteOf = (s: GameState, id: string) => inventoryOf(s, id).dynamite;
/** Azurite shards a player holds toward their next ward. */
export const shardsOf = (s: GameState, id: string) => inventoryOf(s, id).shards;

const FIND_KINDS: readonly string[] = ['azurite', 'flare', 'dynamite'] satisfies FindKind[];

/**
 * The finds among the cards on offer, in the order they were rolled (none
 * outside a vote or a pick): at most MAX_FINDS, each on its own card and of
 * its own kind. Older saves hold a single `find` instead of `finds`.
 */
export function findOffers(s: GameState): CardFind[] {
  const dm = s.delve;
  if (!dm || s.phase !== 'choosing') return [];
  const raw: unknown[] = Array.isArray(dm.finds) ? dm.finds : dm.find ? [dm.find] : [];
  const out: CardFind[] = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue;
    const { category, kind } = f as Partial<CardFind>;
    if (typeof category !== 'string' || typeof kind !== 'string' || !FIND_KINDS.includes(kind) || !s.offered.includes(category)) continue;
    if (out.some((o) => o.category === category || o.kind === kind)) continue;
    out.push({ category, kind });
    if (out.length >= MAX_FINDS) break;
  }
  return out;
}

/** The find on a card on offer, or null for an ordinary card. */
export const findOn = (s: GameState, category: string): FindKind | null => findOffers(s).find((f) => f.category === category)?.kind ?? null;

/**
 * The first find among the cards on offer, or null.
 * @deprecated An offer may hold two finds: use findOffers(s) or findOn(s, category).
 */
export const findOffer = (s: GameState): CardFind | null => findOffers(s)[0] ?? null;

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
 * The depth where a seated player lost their last life, or null while they
 * stand. A cave-in takes two lives at once, so the same depth can be in
 * `losses` twice, the perish among them. Brought back by a teammate, they
 * stand again (null) until they perish anew; perishesOf keeps every time.
 */
export function fellAt(s: GameState, id: string): number | null {
  const losses = s.delve?.losses[id];
  return losses?.length && seated(s, id) && livesOf(s, id) === 0 ? losses.at(-1)! : null;
}

/** Every depth where a seated player perished, oldest first: before each revive, and now if they lie there still. */
export function perishesOf(s: GameState, id: string): number[] {
  if (!seated(s, id)) return [];
  const before = (s.delve?.revives ?? []).filter((r) => r.to === id).map((r) => r.fell);
  const now = fellAt(s, id);
  return now === null ? before : [...before, now];
}

/** Seated players with lives left, in seat order. */
export const standingIds = (s: GameState) => s.players.filter((p) => livesOf(s, p.id) > 0).map((p) => p.id);

// ---- co-op ----------------------------------------------------------------

/** Co-op: a player who let DELVE_IDLE_ROUNDS votes in a row pass, not waited for until they vote again. */
export const isIdle = (s: GameState, id: string) => (s.delve?.missed?.[id] ?? 0) >= DELVE_IDLE_ROUNDS;

/** A player the host's reload cut off who hasn't come back yet, while their grace lasts. */
const inGrace = (s: GameState, p: Player, now: number) => !p.connected && !!s.delve?.excused.includes(p.id) && now < s.delve.graceUntil;

/**
 * Co-op: who a vote waits for at `now` (host clock): standing players who
 * aren't idle and are here, or were cut off by the host's reload and may
 * still come back. In seat order.
 */
export function expectedVoters(s: GameState, now: number): string[] {
  if (!s.delve) return [];
  return s.players.filter((p) => livesOf(s, p.id) > 0 && !isIdle(s, p.id) && (p.connected || inGrace(s, p, now))).map((p) => p.id);
}

/** Co-op, voting: the vote is in at `now`, as someone voted and everyone it waits for has. */
export function voteDone(s: GameState, now: number): boolean {
  const votes = s.delve?.votes ?? {};
  if (!isGroupRun(s) || s.phase !== 'choosing' || !Object.keys(votes).length) return false;
  return expectedVoters(s, now).every((id) => Object.hasOwn(votes, id));
}

/**
 * Co-op, voting: when the vote closes by the clock (host clock), or null
 * while nobody has voted (it waits for as long as it takes) and outside co-op.
 * VOTE_WINDOW_MS from the first vote, held to the end of a reload's grace
 * while anyone it cut off is still away.
 */
export function voteClosesAt(s: GameState): number | null {
  const dm = s.delve;
  if (!dm || !isGroupRun(s) || s.phase !== 'choosing' || dm.voteFrom === null || dm.voteFrom === undefined) return null;
  const away = s.players.some((p) => !p.connected && dm.excused.includes(p.id) && livesOf(s, p.id) > 0);
  return Math.max(dm.voteFrom + VOTE_WINDOW_MS, away ? dm.graceUntil : 0);
}

/** Co-op: the players who answered the question in play (each wrong, or it would be over), first first. */
export const answeredIds = (s: GameState) => (s.question?.struck ?? []).map((x) => x.by);

/** Co-op: standing players yet to answer the question in play, in seat order. */
export function waitingIds(s: GameState): string[] {
  const done = new Set(answeredIds(s));
  return standingIds(s).filter((id) => !done.has(id));
}

/** Standing players holding at least one of `item`, in seat order. */
export const holdersOf = (s: GameState, item: ItemKind) => standingIds(s).filter((id) => inventoryOf(s, id)[item] > 0);

/**
 * Co-op: whether a flare or a stick of dynamite can go off on the question in
 * play, from the pack of whoever standing holds one: its clock runs, it is no
 * find's, none went off on it yet, someone here still has an answer to
 * give (nobody else gains from it), and, for dynamite, something is left to
 * blow away (blastLeft). When it is due is the solo rule's.
 */
export function teamItemReady(s: GameState, item: 'flares' | 'dynamite'): boolean {
  const q = s.question;
  if (!isGroupRun(s) || s.phase !== 'question' || !q || q.deadline === null || !itemsWorkOn(q)) return false;
  if (item === 'flares' ? q.flared : q.blasted || q.clockAt === undefined || blastLeft(q) === 0) return false;
  const waiting = new Set(waitingIds(s));
  return holdersOf(s, item).length > 0 && s.players.some((p) => p.connected && waiting.has(p.id));
}

/**
 * Why `by` can't give one of their lives to bring `to` back, or null when
 * they can: only together, between questions, from a standing player with
 * REVIVE_FROM lives or more, for a teammate who perished.
 */
export function reviveProblem(s: GameState, by: string, to: string): string | null {
  if (!s.delve || !isGroupRun(s)) return 'Only a run together has revives.';
  if (s.phase !== 'choosing' && s.phase !== 'reveal') return 'Not during a question.';
  if (!seated(s, by)) return 'You are not in this run.';
  if (to === by) return 'Only a teammate can give you a life.';
  if (!seated(s, to)) return 'They are not in this run.';
  if (livesOf(s, to) > 0) return 'They are still standing.';
  // A life given to someone away would be lost again at the next time-out.
  if (!s.players.find((p) => p.id === to)?.connected) return 'They are away right now.';
  if (livesOf(s, by) < REVIVE_FROM) return `It takes ${REVIVE_FROM} lives to give one.`;
  return null;
}

// ---- the team's result ----------------------------------------------------

/**
 * The order of the result: someone still standing first (more lives first),
 * then whoever perished deeper, then whoever lost their earlier lives deeper.
 * Positive when `a` goes first; equal runs compare as 0.
 */
export function compareDelvers(s: GameState, a: string, b: string): number {
  const [livesA, livesB] = [livesOf(s, a), livesOf(s, b)];
  if (livesA > 0 !== livesB > 0) return livesA > 0 ? 1 : -1;
  const first = livesA > 0 ? livesA - livesB : (fellAt(s, a) ?? 0) - (fellAt(s, b) ?? 0);
  if (first !== 0) return first;
  const la = [...(s.delve?.losses[a] ?? [])].reverse();
  const lb = [...(s.delve?.losses[b] ?? [])].reverse();
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    const d = (la[i] ?? Infinity) - (lb[i] ?? Infinity);
    if (d !== 0) return d;
  }
  return 0;
}

export interface DelveStanding {
  id: string;
  /** Where they last perished, or the current depth while they stand. */
  depth: number;
  lives: number;
  /** Depths where they lost a life, oldest first (a life given to a teammate isn't one). */
  losses: number[];
  /** Depths where they perished, oldest first: more than one once brought back. */
  perished: number[];
  /** Lives they gave to bring teammates back. */
  given: number;
  /** Times a teammate brought them back. */
  revived: number;
  /** The order of the result (compareDelvers), 1 first; equal runs share it. Not a win: the team shares one depth. */
  rank: number;
}

/** The seated players as the result lists them (compareDelvers). */
export function delveStandings(s: GameState): DelveStanding[] {
  const ids = s.players.map((p) => p.id).sort((a, b) => compareDelvers(s, b, a));
  const out: DelveStanding[] = [];
  ids.forEach((id, i) => {
    const prev = out[i - 1];
    const rank = prev && compareDelvers(s, prev.id, id) === 0 ? prev.rank : i + 1;
    const { given, received } = gifts(s, id);
    out.push({
      id,
      depth: fellAt(s, id) ?? s.round,
      lives: livesOf(s, id),
      losses: [...(s.delve?.losses[id] ?? [])],
      perished: perishesOf(s, id),
      given,
      revived: received,
      rank,
    });
  });
  return out;
}

/**
 * The team's depth: the one in play while anyone stands, then the one where
 * the last of them perished, or left the run still standing (`leftAt`), 0
 * outside Delve. Alone, the player's own.
 */
export function teamDepth(s: GameState): number {
  if (!s.delve) return 0;
  if (standingIds(s).length) return s.round;
  const falls = s.players.map((p) => fellAt(s, p.id)).filter((d): d is number => d !== null);
  const left = s.delve.leftAt ?? 0;
  return falls.length || left ? Math.max(left, ...falls) : s.round;
}

/** A run's result, for the end screen and the records: one depth for the team, and what each player gave and lost. */
export interface DelveTeam {
  depth: number;
  /** Nobody stands any more. */
  perished: boolean;
  players: DelveStanding[];
  /** Every life given, oldest first. */
  revives: Revive[];
}

export function delveTeam(s: GameState): DelveTeam {
  return { depth: teamDepth(s), perished: !!s.delve && standingIds(s).length === 0, players: delveStandings(s), revives: [...(s.delve?.revives ?? [])] };
}
