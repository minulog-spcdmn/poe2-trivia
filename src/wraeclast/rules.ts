// The Wraeclast run's rules (wraeclast.html, src/wraeclast): a solo run across
// the map (map.ts) from the camp to the boss, the mode's prototype (v4, after
// the third playtest). Pure: the run's state is a plain object (the page
// makes it reactive), every action a method that changes it, so a run plays
// the same in a test as on the page.
//
// A run: the camp (a vendor), then a node at a time along the paths ahead:
// zones (2 items under the zone's type), Wells (the flask refilled on the way
// past), towns (healed, a vendor again) and at the end the boss's items under
// the Silent rule (only Torches work), with a modifier for each corruption
// front still alive. A front is a zone: only the zone it stands on is
// corrupted (Blood toll, double loot), and the map shows it. Each item: its
// name built from tiles (the Inscription: the answer's tiles among those of a
// few look-alike names and loose decoys), its art under the Veil, the zone's
// free clue and supplies from the pack. A miss costs life and marks the line
// as Wordle does; a right answer puts its loot in the pack at once.
// docs/wraeclast (the prototype's handoffs, on the orchestrator's branch) has
// the reasons.

import { nameSimilarity, shuffle, type Item } from '../lib/game.ts';
import { seededRandom } from '../lib/patches.ts';
import { readLooks, type LooksData } from '../lib/looks.ts';
import itemData from '../data/items.json' with { type: 'json' };
import syllableData from '../data/syllables.json' with { type: 'json' };
import looksData from '../data/looks.json' with { type: 'json' };
import clueData from '../data/clues.json' with { type: 'json' };
import {
  GRAPH,
  corruptedAt,
  creep,
  bossRulesOf,
  rollPlaces,
  seedFronts,
  weighted,
  type BossMod,
  type Front,
  type Hidden,
  type MapGraph,
  type MapNode,
  type Move,
  type Place,
  type ZoneType,
} from './map.ts';

export { ZONE_TYPES, ZONE_NAMES, HIDDEN, HIDDEN_NAMES, BOSS_MODS, BOSS_MOD_NAMES } from './map.ts';
export type { ZoneType, Hidden, BossMod, Place, MapNode, Move } from './map.ts';

/** The supplies, by their working keys (the log's): flare is the Torch, category the Ancient Orb, decoy the Tangled Fossil. */
export type Supply = 'flare' | 'wisdom' | 'lore' | 'category' | 'base' | 'decoy' | 'lengths' | 'first' | 'deck';
export const SUPPLIES: readonly Supply[] = ['flare', 'wisdom', 'lore', 'category', 'base', 'decoy', 'lengths', 'first', 'deck'];
export const SUPPLY_NAMES: Record<Supply, string> = {
  flare: 'Torch',
  wisdom: 'Scroll of Wisdom',
  lore: 'Golden Page',
  category: 'Ancient Orb',
  base: 'Base reveal',
  decoy: 'Tangled Fossil',
  lengths: 'Word lengths',
  first: 'First tile',
  deck: 'Stacked Deck',
};

export type LootKind = 'gold' | 'supply' | 'flask';
export const LOOT_KINDS: readonly LootKind[] = ['gold', 'supply', 'flask'];

/** Where a node's step puts it, for its decoys, miss costs and gold. */
export type Section = 'early' | 'mid' | 'late' | 'boss';
export const SECTIONS: readonly Section[] = ['early', 'mid', 'late', 'boss'];
export type Range = [number, number];

/** A tile's mark after a wrong submit: the right tile in the right place, in the answer elsewhere, or not in it. */
export type Mark = 'gold' | 'silver' | 'struck';
/** A placed tile's mark on the line; "none" where only gold is marked (tuning), and on a word gap. */
export type LineMark = Mark | 'none';

/** A word gap on the answer line: the player's own, never placed or suggested by the game; the check ignores it. */
export const GAP = ' ';

export interface Tuning {
  life: number;
  gold: number;
  /** Flask charges. */
  flask: number;
  /** Items in a zone (1 to 3). */
  itemsPerZone: number;
  /** The share of open nodes that become zones (the rest Wells), percent. */
  zoneShare: number;
  /** The tiles a pool holds (the answer's, the decoy names' and the loose decoys), by section: each item rolls its own within TILE_SPREAD of it. */
  tiles: Record<Section, number>;
  /** How many decoy names a board holds, by section: rolled for each item, never shown. */
  names: Record<Section, Range>;
  /** A miss's cost, a random whole number in the range, by section. */
  missCost: Record<Section, Range>;
  price: Record<Supply, number>;
  /** How many of each supply one card from the vendor holds. */
  stack: Record<Supply, number>;
  /** Patches a Torch burns in, a free burn-in (Blight, the boss's first item), and a Stacked Deck's. */
  burnIn: { flare: number; blight: number; boss: number; deck: number };
  /** The Veil's seeds across the art (about this many a side). */
  seeds: number;
  loot: {
    /** Loot cards a right answer deals, by zone type. */
    cards: Record<ZoneType, number>;
    weights: Record<LootKind, number>;
    gold: Record<'early' | 'mid' | 'late', Range>;
    /** How many of its supply a supply card holds. */
    supplies: number;
  };
  corruption: {
    /** Fronts seeded at the start (0 to 5). */
    seeds: number;
    /** Every how many steps the player takes the fronts creep (1 to 3). */
    creep: number;
    /** How many times its loot cards a corrupted zone deals. */
    multiplier: number;
  };
  /** Gold and silver marks, or gold only. */
  marks: 'both' | 'gold';
  freeClue: Record<ZoneType, boolean>;
}

/** The v4 handoff's numbers (docs/wraeclast/prototype-v4-handoff.md), the economy set with the bot (tests/wraeclastEconomy.test.ts). */
export const DEFAULT_TUNING: Tuning = {
  life: 100,
  gold: 40,
  flask: 2,
  itemsPerZone: 2,
  zoneShare: 83,
  tiles: { early: 14, mid: 20, late: 26, boss: 32 },
  names: { early: [1, 2], mid: [2, 3], late: [3, 4], boss: [4, 5] },
  missCost: { early: [20, 30], mid: [30, 40], late: [40, 50], boss: [55, 65] },
  price: { flare: 10, wisdom: 10, lore: 10, category: 10, base: 10, decoy: 10, lengths: 10, first: 10, deck: 10 },
  stack: { flare: 3, wisdom: 3, lore: 2, category: 2, base: 1, decoy: 3, lengths: 3, first: 2, deck: 2 },
  burnIn: { flare: 12, blight: 4, boss: 4, deck: 4 },
  seeds: 9,
  loot: {
    cards: { plain: 2, incursion: 2, essence: 1, ritual: 2, expedition: 1, blight: 2 },
    weights: { gold: 10, supply: 2, flask: 2 },
    // Late zones deal no gold: past the last town it buys nothing (but at an Expedition's vendor).
    gold: { early: [5, 7], mid: [6, 8], late: [0, 0] },
    supplies: 1,
  },
  corruption: {
    seeds: 3,
    creep: 2,
    multiplier: 2,
  },
  marks: 'both',
  freeClue: { plain: true, incursion: true, essence: true, ritual: true, expedition: true, blight: true },
};

/** The pack: this many stacks, each up to STACK_MAX of one supply. */
export const PACK_STACKS = 8;
export const STACK_MAX = 5;
/** A flask charge heals this much at once, and again as each of the next FLASK_ITEMS items ends. */
export const FLASK_STEP = 10;
export const FLASK_ITEMS = 2;
export const TOWN_HEAL = 20;
export const BOSS_ITEMS = 3;
/** Loose decoys a Blight zone and a Teeming boss add. */
export const BLIGHT_DECOYS = 6;
export const TEEMING_DECOYS = 8;
/** The most tiles a pool holds, the answer's included. */
export const MAX_TILES = 36;
/** How far an item's pool total strays from its section's, either way, so the total never gives the answer's tile count away. */
export const TILE_SPREAD = 3;
/** The fewest decoys a pool holds besides of, the, and and the possessives (the decoy names' tiles counting). */
export const MIN_DECOYS = 5;
/** Loose decoys are drawn at random from the best this many look-alikes. */
export const DECOY_POOL = 30;
/** Decoys one Tangled Fossil strikes. */
export const DECOY_SWEEP = 4;
/** Life a Blood toll takes as each item opens; misses a Bloodied boss costs more. */
export const BLOOD_TOLL = 10;
export const BLOODIED = 10;
/** Words that stay whole tiles, on every board. */
export const SMALL_WORDS: readonly string[] = ['of', 'the', 'and'];
/** Possessive tiles on every board, the answer's and the decoy names' counting toward them: a gem's name nearly always has one, so every board shows a few. */
export const POSSESSIVES: Range = [2, 3];
/** A possessive tile ("ahn's", "tus'"). */
export const isPossessive = (tile: string) => /('s|s')$/.test(tile);
/** A mod line shared by this many items or more is common: the only kind a zone gives free (a rarer line gives its item away). */
export const COMMON = 3;
/** How many look-alikes, by art and by name, a decoy name is drawn from. */
export const LOOKALIKES = 8;

/** A mod line: its kind (the tooltip section), its text (name words masked), and how many items share it. */
export type ModLine = [string, string, number];
export type Clues = { category: string; base: string; mods: ModLine[]; flavor: string | null; support: string | null };
export const ITEMS = itemData as Item[];
export const SYLLABLES = syllableData as Record<string, string[][]>;
export const CLUES = clueData as unknown as Record<string, Clues>;
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
/** An item's name, by id. */
export const nameOf = (id: string) => BY_ID.get(id)?.name ?? id;
const LOOKS = readLooks(looksData as unknown as LooksData);

/** What a zone gave for free when an item opened. */
export type FreeClue = 'none' | 'mod' | 'flavor' | 'base' | 'lengths' | 'burn';

/** What a Stacked Deck can draw: a mod line, the flavour text, the Ancient Orb's sibling, the base, the word lengths, or a small burn-in. */
export type DeckClue = 'mod' | 'flavor' | 'category' | 'base' | 'lengths' | 'burn';
export const DECK_CLUES: readonly DeckClue[] = ['mod', 'flavor', 'category', 'base', 'lengths', 'burn'];

/**
 * vendor: the camp's, a town's, or after an Expedition zone (the next place
 * picked from it). map: past a Well, picking the next place. boss: the boss's
 * threshold. item: an item open. solved: named, its loot in the pack (a full
 * pack asks first), then the next item or, a zone's last, the next place.
 */
export type Phase = 'vendor' | 'map' | 'boss' | 'item' | 'solved' | 'end';

/** A screen between items, as the log times it: a vendor (the camp's, a town's, an Expedition's), a Well's beat, the reveal (its loot and the next place), the boss's threshold. */
export type Screen = 'camp' | 'town' | 'vendor' | 'well' | 'loot' | 'boss';

/** A stack in the pack. */
export interface Stack {
  supply: Supply;
  n: number;
}

/** A loot card: what it gives. */
export interface LootCard {
  kind: LootKind;
  /** Gold on a gold card, else 0. */
  gold: number;
  /** The supply on a supply card, and how many, else null and 0. */
  supply: Supply | null;
  n: number;
}

export type BurnBy = 'zone' | 'flare' | 'deck';

export interface ItemLog {
  itemId: string;
  name: string;
  category: string;
  step: number;
  node: string;
  zoneType: ZoneType | 'boss';
  /** The zone's corruption, or null. */
  corruption: Hidden | null;
  boss: boolean;
  /** The board: the answer's tiles, the decoys (the decoy names' tiles, of, the, and, the possessives and the loose ones), and the decoy names. */
  tiles: { answer: string[]; decoys: string[]; names: string[] };
  /** The Ancient Orb's sibling, by name (its tiles kept off the board), or null when the category has none. */
  sibling: string | null;
  freeClue: FreeClue;
  supplies: { type: Supply; order: number; ms: number }[];
  /** What each Stacked Deck drew, in order. */
  deck: DeckClue[];
  /** Each burn-in: what made it, how many patches it took, when (ms after the item opened). */
  burnIns: { by: BurnBy; patches: number; ms: number }[];
  /** The Veil's patches, as the page cut it. */
  patches: number;
  /** Each submit: the tiles placed (breaks left out), where the player put word breaks (after that many tiles), right or not, the tiles' marks, the life a miss cost, when. */
  submits: { tiles: string[]; breaks: number[]; right: boolean; marks: LineMark[]; lost: number; ms: number }[];
  /** The pack as the item opened. */
  pack: Stack[];
  /** Stacks a loot card replaced in a full pack: the slot, what was there, what came. */
  replaced: { slot: number; was: Stack; by: Stack }[];
  lifeBefore: number;
  lifeAfter: number;
  /** Life a Blood toll took as it opened. */
  toll: number;
  /** The flask's heal as the item ended (in lifeAfter already). */
  healed: number;
  /** When a flask charge was drunk, ms after the item opened. */
  drank: number[];
  /** The loot cards dealt (none at the boss). */
  loot: LootCard[];
  misses: number;
  gold: number;
}

export interface ItemPlay {
  /** Its place in the run, from 0. */
  n: number;
  step: number;
  node: string;
  zoneType: ZoneType | null;
  /** Which of the boss's items (from 0), or null before the boss. */
  boss: number | null;
  /** The zone's corruption, or null. */
  hidden: Hidden | null;
  category: string;
  itemId: string;
  /** The answer's words, each as its tiles. */
  words: string[][];
  /** The answer's tiles, in order. */
  answer: string[];
  decoys: string[];
  /** Every distinct tile of the pool (the answer's and the decoys), shuffled. */
  tiles: string[];
  /** The Ancient Orb's sibling: another item of the same category sharing no word with the answer, by id, or null. */
  sibling: string | null;
  /** Each board tile's best mark so far. */
  marks: Record<string, Mark>;
  /** Decoys a Tangled Fossil struck. */
  swept: string[];
  /** The Veil's patches burned in, in the order they burned. */
  burned: number[];
  /** The Veil's patches (the page's cut), 0 until the item opens. */
  patches: number;
  /** Which patches touch which (the page's cut), null until the item opens. */
  adjacency: number[][] | null;
  /** The clues shown: mod lines (in the order shown, by their place in the tooltip), and which reveals. */
  shown: { mods: number[]; flavor: boolean; lengths: boolean; category: boolean; base: boolean };
  /** The clues a Stacked Deck drew (a mod line by its place), for their labels. */
  deck: { clue: DeckClue; mod?: number }[];
  freeClue: FreeClue;
  /** The answer line, in order: tiles and the player's word gaps (GAP). */
  build: string[];
  /** The last wrong submit's marks while its line stands (one for each entry of the line, "none" on a gap), else null. */
  lineMarks: LineMark[] | null;
  /** How many tiles at the start of the line are locked (First syllable). */
  locked: number;
  misses: number;
  /** When it opened (its Veil cut), or null while it's being laid out. */
  openedAt: number | null;
  log: ItemLog;
}

/** The loot of a named item, put in the pack as it was named; a supply that didn't fit waits for keep(). */
export interface LootDeal {
  cards: LootCard[];
  pending: LootCard[];
}

/** The node being played: how many items it holds, and how many are done. */
export interface Visit {
  node: string;
  items: number;
  done: number;
}

/** What passing a Well or arriving in a town did, for the screen's line. */
export type Beat = { kind: 'well'; node: string; refilled: number } | { kind: 'town'; node: string; healed: number };

export interface RunLog {
  v: 4;
  seed: number;
  start: string;
  end: string | null;
  /** Run time, ms. */
  ms: number;
  result: 'win' | 'loss' | null;
  /** The item the run ended on: its place, id, name and node. */
  endedOn: { n: number; itemId: string; name: string; node: string } | null;
  /** The node ids, from the camp. */
  route: string[];
  /** Each travel step: the nodes offered (what each was, and whether corrupted) and the one picked. */
  travel: { offered: string[]; picked: string; options: { node: string; kind: Place['kind']; zoneType: ZoneType | null; corrupted: boolean }[] }[];
  /** Each node arrived at: what it was, and its corruption. */
  /**
   * Each place arrived at, the camp first: its corruption and the boss rule
   * that corruption carries, a town's heal, and the gold spent and supplies
   * bought there.
   */
  met: {
    node: string;
    kind: Place['kind'];
    zoneType: ZoneType | null;
    corruption: Hidden | null;
    rule: BossMod | null;
    healed: number;
    spent: number;
    bought: number;
  }[];
  fronts: { seeded: number; stopped: number; aliveAtBoss: number | null; seeds: { node: string; rule: BossMod }[] };
  bossMods: BossMod[];
  misses: number;
  bought: Record<Supply, number>;
  found: Record<Supply, number>;
  used: Record<Supply, number>;
  loot: { dealt: Record<LootKind, number>; taken: Record<LootKind, number> };
  goldEarned: number;
  goldSpent: number;
  drinks: number;
  lifeEnd: number;
  /** Each visit to a screen between items: which, where, for how long. */
  screens: { screen: Screen; node: string; ms: number }[];
  tuning: Tuning;
  /** The device's viewport width, CSS pixels. */
  viewport: number;
  items: ItemLog[];
}

export interface RunState {
  seed: number;
  tuning: Tuning;
  /** What each node is this run. */
  places: Record<string, Place>;
  fronts: Front[];
  /** The fronts' last moves, as they crept (for the map to show), until the next step. */
  moves: Move[];
  /** The node the player is at. */
  at: string;
  /** Steps taken from the camp. */
  steps: number;
  /** The step count the fronts last crept at. */
  crept: number;
  /** The boss's modifiers, rolled as the player reaches it. */
  bossMods: BossMod[];
  phase: Phase;
  /** At a vendor: where (an Expedition's deals after its zone), and the town's heal on arrival. */
  vendor: { at: 'camp' | 'town' | 'expedition'; heal: number } | null;
  /** A ware bought into a full pack, waiting for a space to replace (or to be handed back), and where its card lay. */
  bought: { supply: Supply; n: number; price: number; at: number } | null;
  /** What the last Well or town did, for its line, until the next step. */
  beat: Beat | null;
  life: number;
  maxLife: number;
  gold: number;
  flask: { charges: number; /** Item ends the last drink still heals after. */ recovering: number };
  pack: Stack[];
  /** The vendor's wares left on this visit (the full set dealt again on each visit). */
  stock: Supply[];
  /** Items done. */
  done: number;
  visit: Visit | null;
  item: ItemPlay | null;
  loot: LootDeal | null;
  log: RunLog;
}

const count = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** A name or build as the check compares it: its letters only, lower case. */
export const letters = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** The line's tiles, its word gaps left out. */
export const tilesOf = (build: readonly string[]) => build.filter((t) => t !== GAP);

/**
 * The section a step puts an item in: the route's steps between the camp and
 * the boss in thirds (early, mid, late), whatever its length, then the boss.
 */
export function sectionOf(step: number, boss: boolean, last = GRAPH.boss.step): Section {
  if (boss) return 'boss';
  const n = Math.max(1, last - 1);
  return step * 3 <= n ? 'early' : step * 3 <= 2 * n ? 'mid' : 'late';
}

/** A whole number in [lo, hi], at random. */
const between = ([lo, hi]: Range, rng: () => number) => lo + Math.floor(rng() * (Math.max(lo, hi) - lo + 1));

/** Mod lines from the most common to the rarest (by how many items share them, ties in tooltip order). */
export const wisdomOrder = (clues: Clues) =>
  clues.mods
    .map((m, i) => ({ i, shared: m[2] }))
    .sort((a, b) => b.shared - a.shared || a.i - b.i)
    .map((m) => m.i);

/** The base reveal's text: the base type, or a gem's support description. */
export const baseText = (clues: Clues) => clues.support ?? clues.base;

/**
 * Marks a line against the answer's tiles, as Wordle does: the right tile in
 * the right place gold, a tile the answer holds elsewhere silver (as often as
 * the answer holds it), the rest struck.
 */
export function markLine(build: string[], answer: string[]): Mark[] {
  const marks: Mark[] = build.map(() => 'struck');
  const left = new Map<string, number>();
  answer.forEach((t, i) => {
    if (build[i] === t) marks[i] = 'gold';
    else left.set(t, (left.get(t) ?? 0) + 1);
  });
  build.forEach((t, i) => {
    if (marks[i] === 'gold') return;
    const c = left.get(t) ?? 0;
    if (c > 0) {
      marks[i] = 'silver';
      left.set(t, c - 1);
    }
  });
  return marks;
}

const RANK: Record<Mark, number> = { struck: 1, silver: 2, gold: 3 };

/** How many letters a tile shares with another, each letter counted once a match. */
function sharedLetters(tile: string, other: string) {
  const pool = [...other];
  let shared = 0;
  for (const ch of tile) {
    const k = pool.indexOf(ch);
    if (k >= 0) shared++, pool.splice(k, 1);
  }
  return shared;
}

/** Every tile of every name, by its length. */
let tilesByLength: Map<number, string[]> | null = null;

/** Every possessive tile as often as names hold it: what a possessive decoy is drawn against. */
let possessivesInNames: string[] | null = null;

/**
 * `k` loose decoy tiles for an item, among those `fit` allows: each drawn
 * against one of `against` (the answer's tiles) picked at random, from the
 * tiles of its length (any name, all categories alike; the nearest length
 * when none is left), at random among the DECOY_POOL sharing the most letters
 * with it. So a tile's length says nothing of whose it is. Never a tile in
 * `not` (the answer's among them).
 */
function pickDecoys(not: ReadonlySet<string>, k: number, rng: () => number, fit: (t: string) => boolean, against: string[]): string[] {
  if (k <= 0 || !against.length) return [];
  if (!tilesByLength) {
    tilesByLength = new Map();
    for (const t of new Set(ITEMS.flatMap((it) => SYLLABLES[it.id].flat()))) tilesByLength.set(t.length, [...(tilesByLength.get(t.length) ?? []), t]);
  }
  const out = new Set<string>();
  const open = (len: number) => (tilesByLength!.get(len) ?? []).filter((t) => !not.has(t) && !out.has(t) && fit(t));
  for (let tries = 0; out.size < k && tries < k * 4; tries++) {
    const a = against[Math.floor(rng() * against.length)];
    let pool: string[] = [];
    for (let d = 0; d <= 12 && !pool.length; d++) pool = shuffle([...open(a.length - d), ...(d ? open(a.length + d) : [])], rng);
    if (!pool.length) break;
    const ranked = pool
      .map((t) => ({ t, like: sharedLetters(t, a), tie: rng() }))
      .sort((x, y) => y.like - x.like || x.tie - y.tie)
      .slice(0, DECOY_POOL);
    out.add(ranked[Math.floor(rng() * ranked.length)].t);
  }
  return [...out];
}

/** An item's own seed in a run: its pool is the same however often it is dealt. */
export function itemSeed(seed: number, itemId: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < itemId.length; i++) h = Math.imul(h ^ itemId.charCodeAt(i), 2654435761) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** A name's words that count when two names are compared (of, the and and don't). */
const wordsOf = (name: string) => new Set(name.toLowerCase().split(/\s+/).map(letters).filter((w) => w && !SMALL_WORDS.includes(w)));
/** The shortest word looked for inside another (Girdle in Goregirdle): shorter ones sit inside too many words by chance. */
const COMPOUND_MIN = 4;
/** Whether two words are one, or one holds the other inside a compound (Goregirdle, Meginord's Girdle). */
const wordsMeet = (a: string, b: string) =>
  a === b || (a.length >= COMPOUND_MIN && b.includes(a)) || (b.length >= COMPOUND_MIN && a.includes(b));

/**
 * The Ancient Orb's sibling for an answer: another item of its category (a
 * lineage gem's is another lineage gem) sharing no word with it, nor holding
 * one of its words inside a compound (or the other way), at random, or null
 * when there is none.
 */
export function siblingOf(answer: Item, rng: () => number): Item | null {
  const own = [...wordsOf(answer.name)];
  const pool = ITEMS.filter((it) => it.id !== answer.id && it.category === answer.category && ![...wordsOf(it.name)].some((w) => own.some((o) => wordsMeet(w, o))));
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

/** A decoy name: a real item's name, and its tiles. */
export interface DecoyName {
  name: string;
  tiles: string[];
}

const nameLikes = new Map<string, Item[]>();
const wider = new Map<string, Item[]>();

/**
 * The names a board's decoy names come from, all real items, best first:
 * `near`, the answer's look-alikes (the items whose art looks most like it,
 * then whose names do), and `wide`, the rest of its category, the closest by
 * art and name first, for a board the near ones can't fill to its section's
 * fewest. Never the answer, and none whose tiles are the answer's own set.
 * (No made-up names: each was the answer with one word swapped, so the real
 * name it shared tiles with gave the answer away.)
 */
export function decoyNameCandidates(answer: Item): { near: DecoyName[]; wide: DecoyName[] } {
  const own = new Set(SYLLABLES[answer.id].flat());
  const sameSet = (tiles: string[]) => new Set(tiles).size === own.size && tiles.every((t) => own.has(t));
  const byArt = LOOKS.looksLike(answer.id)
    .slice(0, LOOKALIKES)
    .map((l) => BY_ID.get(l.id))
    .filter((it): it is Item => !!it && it.id !== answer.id);
  let byName = nameLikes.get(answer.id);
  if (!byName) {
    byName = ITEMS.filter((it) => it.id !== answer.id)
      .map((it) => ({ it, like: nameSimilarity(answer.name, it.name) }))
      .sort((a, b) => b.like - a.like || a.it.id.localeCompare(b.it.id))
      .slice(0, LOOKALIKES)
      .map((x) => x.it);
    nameLikes.set(answer.id, byName);
  }
  let rest = wider.get(answer.id);
  if (!rest) {
    // The category's others, by how alike they look (art rank) and read (name), best first.
    const artRank = new Map(LOOKS.looksLike(answer.id).map((l, i) => [l.id, i]));
    rest = ITEMS.filter((it) => it.id !== answer.id && it.category === answer.category)
      .map((it) => ({ it, like: nameSimilarity(answer.name, it.name) - (artRank.get(it.id) ?? ITEMS.length) / ITEMS.length }))
      .sort((a, b) => b.like - a.like || a.it.id.localeCompare(b.it.id))
      .map((x) => x.it);
    wider.set(answer.id, rest);
  }
  const usable = (items: Item[]) =>
    items
      .filter((it) => letters(it.name) !== letters(answer.name) && SYLLABLES[it.id])
      .map((it) => ({ name: it.name, tiles: SYLLABLES[it.id].flat() }))
      .filter((d) => !sameSet(d.tiles));
  const nearItems = [...new Map([...byArt, ...byName].map((it) => [it.id, it])).values()];
  const nearIds = new Set(nearItems.map((it) => it.id));
  return { near: usable(nearItems), wide: usable(rest.filter((it) => !nearIds.has(it.id))) };
}

/** A pool, as dealPool deals it. */
export interface Pool {
  decoys: string[];
  tiles: string[];
  /** The decoy names whose tiles are all on the board. */
  names: DecoyName[];
  /** The Ancient Orb's sibling, by id, or null. */
  sibling: string | null;
}

/**
 * An item's pool, from its own seed. The answer's tiles, and the full tiles of
 * `names` decoy names (rolled, never shown), look-alikes real and made up,
 * mixed: never the Ancient Orb's sibling, whose tiles stay off the board.
 * Loose decoys (length-matched) fill the rest of the total, rolled within
 * TILE_SPREAD of the section's `size`; the decoys besides of, the, and and
 * the possessives are at least MIN_DECOYS, and `extra` more come (Blight,
 * Teeming). On top, every board holds of, the and and, and POSSESSIVES
 * possessive tiles in all (the names' counting). Where the names don't fit
 * the total it grows, up to MAX_TILES: the cap trims the loose decoys first,
 * then decoy names past the fewest the section's range allows.
 */
export function dealPool(answer: Item, seed: number, size: number, extra: number, names: Range = [0, 0]): Pool {
  const rng = seededRandom(itemSeed(seed, answer.id));
  const ownList = SYLLABLES[answer.id].flat();
  const own = new Set(ownList);
  const total = size - TILE_SPREAD + Math.floor(rng() * (2 * TILE_SPREAD + 1));
  const sib = siblingOf(answer, rng);
  // The sibling's own tiles (not the answer's too) stay off the board: else they'd show it is wrong for free.
  const off = new Set(sib ? SYLLABLES[sib.id].flat().filter((t) => !own.has(t)) : []);
  const want = between(names, rng);
  const { near, wide } = decoyNameCandidates(answer);
  const fits = (d: DecoyName) => (!sib || letters(d.name) !== letters(sib.name)) && !d.tiles.some((t) => off.has(t));
  // The look-alikes at random, then the rest of the category best first: a board always gets its section's fewest.
  const order: DecoyName[] = [...shuffle(near.filter(fits), rng), ...wide.filter(fits)];
  const small = SMALL_WORDS.filter((w) => !own.has(w));
  const picked: DecoyName[] = [];
  const nameTiles = new Set<string>();
  const signatureFor = (tiles: Set<string>) => [...tiles].filter(isPossessive).length;
  for (const d of order) {
    if (picked.length >= want) break;
    const more = d.tiles.filter((t) => !own.has(t) && !nameTiles.has(t) && !small.includes(t));
    // The board's tiles so far, with this name's: room left under the cap, of, the and and on top.
    if (own.size + nameTiles.size + more.length + small.length > MAX_TILES && picked.length >= names[0]) continue;
    picked.push(d);
    for (const t of more) nameTiles.add(t);
  }
  // The possessives: the answer's and the names' count; loose ones make up the rest.
  possessivesInNames ??= ITEMS.flatMap((it) => SYLLABLES[it.id].flat().filter(isPossessive));
  const have = signatureFor(new Set([...own, ...nameTiles]));
  const notLoose = new Set([...own, ...nameTiles, ...off, ...SMALL_WORDS]);
  const possessive = pickDecoys(notLoose, between(POSSESSIVES, rng) - have, rng, isPossessive, possessivesInNames);
  const signature = [...small, ...possessive];
  for (const t of possessive) notLoose.add(t);
  // The rolled total is the answer's tiles, the names' and the loose decoys; of, the, and and the possessives come on top.
  const room = Math.max(0, MAX_TILES - own.size - nameTiles.size - signature.length);
  const loose = Math.min(room, Math.max(MIN_DECOYS - nameTiles.size, total - own.size - nameTiles.size, 0) + extra);
  // Against the answer's tiles and every decoy name's: else the answer's alone have look-alikes around them.
  const ordinary = pickDecoys(notLoose, loose, rng, (t) => !isPossessive(t), [...ownList, ...picked.flatMap((d) => d.tiles)]);
  const decoys = [...signature, ...nameTiles, ...ordinary];
  return { decoys, tiles: shuffle([...own, ...decoys], rng), names: picked, sibling: sib?.id ?? null };
}

/** The names a board lets the player build: the answer and every decoy name whose tiles are all there. */
export const buildable = (tiles: readonly string[], names: readonly DecoyName[]) => names.filter((d) => d.tiles.every((t) => tiles.includes(t)));

export interface RunOptions {
  tuning?: Tuning;
  seed?: number;
  now?: () => number;
  /** The device's viewport width, for the log. */
  viewport?: number;
  /** The map (tests and the bot play other routes); the owner's by default. */
  graph?: MapGraph;
}

export class Run {
  state: RunState;
  /** The map this run plays. */
  readonly graph: MapGraph;
  private readonly rng: () => number;
  private readonly now: () => number;
  /** Items drawn so far: none comes up twice. */
  private readonly drawn = new Set<string>();
  /** The screen between items being shown, and since when. */
  private screen: { screen: Screen; node: string; since: number } | null = null;

  constructor({ tuning = DEFAULT_TUNING, seed = Math.floor(Math.random() * 2 ** 32), now = Date.now, viewport = 0, graph = GRAPH }: RunOptions = {}) {
    this.rng = seededRandom(seed);
    this.now = now;
    this.graph = graph;
    const t: Tuning = structuredClone(tuning);
    const places = rollPlaces(graph, t.zoneShare, this.rng);
    const fronts = seedFronts(graph, places, t.corruption.seeds, this.rng);
    this.state = {
      seed,
      tuning: t,
      places,
      fronts,
      moves: [],
      at: graph.camp.id,
      steps: 0,
      crept: 0,
      bossMods: [],
      phase: 'vendor',
      vendor: { at: 'camp', heal: 0 },
      bought: null,
      beat: null,
      life: t.life,
      maxLife: t.life,
      gold: t.gold,
      flask: { charges: t.flask, recovering: 0 },
      pack: [],
      stock: [...SUPPLIES],
      done: 0,
      visit: null,
      item: null,
      loot: null,
      log: {
        v: 4,
        seed,
        start: new Date(now()).toISOString(),
        end: null,
        ms: 0,
        result: null,
        endedOn: null,
        route: [graph.camp.id],
        travel: [],
        met: [{ node: graph.camp.id, kind: 'camp', zoneType: null, corruption: null, rule: null, healed: 0, spent: 0, bought: 0 }],
        fronts: { seeded: fronts.length, stopped: 0, aliveAtBoss: null, seeds: fronts.map((f) => ({ node: f.at, rule: f.rule })) },
        bossMods: [],
        misses: 0,
        bought: count(SUPPLIES),
        found: count(SUPPLIES),
        used: count(SUPPLIES),
        loot: { dealt: count(LOOT_KINDS), taken: count(LOOT_KINDS) },
        goldEarned: 0,
        goldSpent: 0,
        drinks: 0,
        lifeEnd: t.life,
        screens: [],
        tuning: structuredClone(t),
        viewport,
        items: [],
      },
    };
    this.show('camp');
  }

  // ---- What's where ----

  /** The node the player is at. */
  get node(): MapNode {
    return this.graph.byId.get(this.state.at)!;
  }

  /** The nodes the player can travel to now (past a Well, from a vendor, or on a zone's last reveal), else none. */
  options(): string[] {
    const p = this.state.phase;
    return p === 'map' || (p === 'vendor' && !this.state.bought) || this.leaving() ? this.graph.next[this.state.at] : [];
  }

  /** Whether the named item is a zone's last, its loot settled, and the next place is picked from its reveal (an Expedition's trader comes first). */
  leaving(): boolean {
    const s = this.state;
    const v = s.visit;
    const place = s.places[s.at];
    return s.phase === 'solved' && !!v && v.done + 1 >= v.items && place.kind === 'zone' && place.type !== 'expedition' && !s.loot?.pending.length;
  }

  /** On a named item's reveal: whether next() goes on, and to what (the zone's or the boss's next item, an Expedition's vendor, the win). */
  ahead(): 'item' | 'vendor' | 'win' | null {
    const s = this.state;
    const v = s.visit;
    if (s.phase !== 'solved' || !v || s.loot?.pending.length) return null;
    if (v.done + 1 < v.items) return 'item';
    const place = s.places[s.at];
    if (place.kind === 'boss') return 'win';
    return place.kind === 'zone' && place.type === 'expedition' ? 'vendor' : null;
  }

  /** Whether a node is corrupted now: a live front stands on it. */
  corrupted(id: string): boolean {
    return this.state.places[id]?.kind === 'zone' && corruptedAt(this.state.fronts, id);
  }

  /** The section a step puts an item in, on this run's map. */
  sectionAt(step: number, boss: boolean): Section {
    return sectionOf(step, boss, this.graph.boss.step);
  }

  /** The section the open item (or the node the player is at) is in. */
  section(): Section {
    const it = this.state.item;
    if (it) return this.sectionAt(it.step, it.boss !== null);
    const n = this.node;
    return this.sectionAt(n.step, n.kind === 'boss');
  }

  /** A miss's cost on the open item (or at the node ahead), as a range: the item shows it before a submit. */
  missRange(): Range {
    const sec = this.section();
    const [lo, hi] = this.state.tuning.missCost[sec];
    const more = sec === 'boss' && this.state.bossMods.includes('bloodied') ? BLOODIED : 0;
    return [lo + more, hi + more];
  }

  /** The corruption of the zone the player is at, or null. */
  hiddenHere(): Hidden | null {
    return this.corrupted(this.state.at) ? 'blood' : null;
  }

  /** The loot cards a right answer deals here before misses: the zone type's, times the corruption's multiplier. */
  dealHere(): number {
    const p = this.state.places[this.state.at];
    if (p.kind !== 'zone') return 0;
    const t = this.state.tuning;
    return t.loot.cards[p.type] * (this.hiddenHere() ? t.corruption.multiplier : 1);
  }

  /** How many of a supply the pack holds. */
  held(supply: Supply): number {
    return this.state.pack.reduce((n, st) => n + (st.supply === supply ? st.n : 0), 0);
  }

  /** Whether `n` of a supply fit in the pack: topping its stacks up to STACK_MAX, then new stacks. */
  fits(supply: Supply, n: number): boolean {
    const s = this.state;
    const room = s.pack.reduce((r, st) => r + (st.supply === supply ? STACK_MAX - st.n : 0), 0);
    const more = Math.ceil(Math.max(0, n - room) / STACK_MAX);
    return s.pack.length + more <= PACK_STACKS;
  }

  /** Puts `n` of a supply in the pack (when it fits). */
  private stow(supply: Supply, n: number): boolean {
    if (!this.fits(supply, n)) return false;
    const s = this.state;
    for (const st of s.pack) {
      if (st.supply !== supply || n <= 0) continue;
      const add = Math.min(n, STACK_MAX - st.n);
      st.n += add;
      n -= add;
    }
    while (n > 0) {
      const add = Math.min(n, STACK_MAX);
      s.pack.push({ supply, n: add });
      n -= add;
    }
    return true;
  }

  /** Whether the ware at `i` on the vendor's table can be bought: at a vendor, with the gold, nothing bought still waiting for a space. A full pack doesn't stop it: a space is picked after. */
  canBuy(i: number): boolean {
    const s = this.state;
    const ware = s.stock[i];
    return s.phase === 'vendor' && !!ware && !s.bought && s.gold >= s.tuning.price[ware];
  }

  /** The open item, while it can be played on (opened, not yet named). */
  private live(): ItemPlay | null {
    const it = this.state.item;
    return this.state.phase === 'item' && it && it.openedAt !== null ? it : null;
  }

  /** Whether a flask charge can be drunk: an item open, a charge left, life below its most. */
  canDrink(): boolean {
    const s = this.state;
    return !!this.live() && s.flask.charges > 0 && s.life < s.maxLife;
  }

  /** How many patches a Torch burns in here: halved under Incursion, at the boss's third item and after (a Lingering fourth too), and again at a Murky boss. */
  flareBurn(): number {
    return this.burnSize(this.state.tuning.burnIn.flare);
  }

  /** A Torch's or a Stacked Deck's burn-in of `base` patches here, by the Torch's rules (flareBurn). */
  private burnSize(base: number): number {
    const s = this.state;
    const it = s.item;
    let b = base;
    if (it?.zoneType === 'incursion') b /= 2;
    if (it && it.boss !== null && it.boss >= 2) b /= 2;
    if (it && it.boss !== null && s.bossMods.includes('murky')) b /= 2;
    return Math.max(1, Math.round(b));
  }

  /** The decoys still on the board unstruck: what a Tangled Fossil can strike. */
  decoysLeft(it: ItemPlay): string[] {
    return it.decoys.filter((t) => it.marks[t] !== 'struck');
  }

  /** The clues a Stacked Deck could draw on the open item now: those not shown yet that the zone allows. */
  deckOptions(it: ItemPlay): DeckClue[] {
    const c = CLUES[it.itemId];
    const out: DeckClue[] = [];
    if (it.zoneType !== 'ritual' && it.shown.mods.length < c.mods.length) out.push('mod');
    if (c.flavor && !it.shown.flavor) out.push('flavor');
    if (it.sibling && !it.shown.category) out.push('category');
    if (!it.shown.base) out.push('base');
    if (!it.shown.lengths) out.push('lengths');
    if (it.adjacency && it.burned.length < it.patches) out.push('burn');
    return out;
  }

  /**
   * Why a supply would do nothing on the open item: none open, the boss's
   * Silent rule, a Ritual zone (no Scrolls), or nothing left for it to show.
   * Null when it works.
   */
  idle(supply: Supply): 'closed' | 'silent' | 'ritual' | 'done' | null {
    const it = this.live();
    if (!it) return 'closed';
    if (it.boss !== null && supply !== 'flare') return 'silent';
    if (supply === 'wisdom' && it.zoneType === 'ritual') return 'ritual';
    const c = CLUES[it.itemId];
    const done: Record<Supply, boolean> = {
      flare: !it.adjacency || it.burned.length >= it.patches,
      wisdom: it.shown.mods.length >= c.mods.length,
      lore: it.shown.flavor || !c.flavor,
      category: it.shown.category || !it.sibling,
      base: it.shown.base,
      decoy: !this.decoysLeft(it).length,
      lengths: it.shown.lengths,
      first: it.locked > 0,
      deck: !this.deckOptions(it).length,
    };
    return done[supply] ? 'done' : null;
  }

  /** Whether a supply would do something on the open item. */
  works(supply: Supply): boolean {
    return this.idle(supply) === null;
  }

  /** Whether a supply can be used now: the pack holds one and it works. */
  canUse(supply: Supply): boolean {
    return this.held(supply) > 0 && this.works(supply);
  }

  /** Why the line can't be sent though it holds tiles: the same tiles were sent on this item already, breaks aside (a miss never costs life twice). */
  blocked(): 'tried' | null {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it) return null;
    const line = tilesOf(it.build);
    if (!line.length) return null;
    return it.log.submits.some((sub) => sub.tiles.join('\u0001') === line.join('\u0001')) ? 'tried' : null;
  }

  /** Whether the line can be submitted: a tile on it, the item open, the line not sent before. */
  canSubmit(): boolean {
    const it = this.live();
    return !!it && tilesOf(it.build).length > 0 && !it.lineMarks && this.blocked() === null;
  }

  // ---- The log's screens ----

  /** Starts timing a screen between items (closing the one before), or just closes it (null). */
  private show(screen: Screen | null) {
    const s = this.state;
    const t = this.now();
    if (this.screen) s.log.screens.push({ screen: this.screen.screen, node: this.screen.node, ms: Math.max(0, t - this.screen.since) });
    this.screen = screen ? { screen, node: s.at, since: t } : null;
  }

  // ---- Actions ----

  /** Buys the ware at `i` on the vendor's table: its stack goes in the pack, and the card off the table until the next visit. */
  buy(i: number): boolean {
    if (!this.canBuy(i)) return false;
    const s = this.state;
    const ware = s.stock[i];
    const price = s.tuning.price[ware];
    const n = s.tuning.stack[ware];
    s.gold -= price;
    s.log.goldSpent += price;
    s.stock.splice(i, 1);
    const here = s.log.met.at(-1)!;
    here.spent += price;
    if (this.fits(ware, n)) {
      this.stow(ware, n);
      s.log.bought[ware] += n;
      here.bought += n;
    } else s.bought = { supply: ware, n, price, at: i };
    return true;
  }

  /** A ware bought into a full pack: it replaces the stack at `slot`, or (null) goes back on the table, its gold handed back. */
  placeBought(slot: number | null): boolean {
    const s = this.state;
    const b = s.bought;
    if (s.phase !== 'vendor' || !b) return false;
    if (slot !== null) {
      if (slot < 0 || slot >= s.pack.length) return false;
      s.pack[slot] = { supply: b.supply, n: b.n };
      s.log.bought[b.supply] += b.n;
      s.log.met.at(-1)!.bought += b.n;
    } else {
      s.gold += b.price;
      s.log.goldSpent -= b.price;
      s.log.met.at(-1)!.spent -= b.price;
      s.stock.splice(Math.min(b.at, s.stock.length), 0, b.supply);
    }
    s.bought = null;
    return true;
  }

  /**
   * The node is done, before the next place is offered: a cleared zone's
   * front stops for good (the zone normal again), and after every `creep`
   * steps the player takes the fronts creep, so the places offered show where
   * the corruption is now.
   */
  private depart() {
    const s = this.state;
    for (const f of s.fronts)
      if (f.alive && f.at === s.at) {
        f.alive = false;
        f.stoppedAt = s.at;
        s.log.fronts.stopped++;
      }
    const every = Math.max(1, s.tuning.corruption.creep);
    if (s.steps > 0 && s.steps % every === 0 && s.crept < s.steps) {
      s.crept = s.steps;
      s.moves = creep(this.graph, s.places, s.fronts, this.node.step, this.rng);
    }
  }

  /** When the fronts next creep: as the node `k` steps on from this one is left (0: this one), whatever is left of the run. */
  creepIn(): number {
    const s = this.state;
    const every = Math.max(1, s.tuning.corruption.creep);
    // At the camp, or crept as this node was done: the next creep is `every` steps on.
    if (s.steps === 0 || s.crept === s.steps) return every;
    return (every - (s.steps % every)) % every;
  }

  /**
   * Travels to a node linked ahead (from a vendor, past a Well, or from a
   * zone's last reveal), and arrives there: a Well refills the flask on the
   * way past, a town heals and deals its wares, the boss shows its threshold,
   * a zone opens its first item at once.
   */
  choose(id: string): boolean {
    const s = this.state;
    const offered = this.options();
    if (!offered.includes(id)) return false;
    if (s.phase === 'solved') this.logItem();
    s.stock = [];
    s.vendor = null;
    s.visit = null;
    s.moves = [];
    this.show(null);
    s.log.travel.push({
      offered: [...offered],
      picked: id,
      options: offered.map((o) => {
        const p = s.places[o];
        return { node: o, kind: p.kind, zoneType: p.kind === 'zone' ? p.type : null, corrupted: this.corrupted(o) };
      }),
    });
    s.log.route.push(id);
    s.at = id;
    s.steps++;
    s.beat = null;
    const place = s.places[id];
    const hidden = this.hiddenHere();
    const by = hidden ? s.fronts.find((f) => f.alive && f.at === id) : undefined;
    s.log.met.push({ node: id, kind: place.kind, zoneType: place.kind === 'zone' ? place.type : null, corruption: hidden, rule: by?.rule ?? null, healed: 0, spent: 0, bought: 0 });
    if (place.kind === 'well') {
      s.beat = { kind: 'well', node: id, refilled: s.tuning.flask - s.flask.charges };
      s.flask.charges = s.tuning.flask;
      s.phase = 'map';
      this.depart();
      this.show('well');
    } else if (place.kind === 'town') {
      const heal = Math.min(TOWN_HEAL, s.maxLife - s.life);
      s.life += heal;
      s.log.met.at(-1)!.healed = heal;
      s.beat = { kind: 'town', node: id, healed: heal };
      s.stock = [...SUPPLIES];
      s.vendor = { at: 'town', heal };
      s.phase = 'vendor';
      this.depart();
      this.show('town');
    } else if (place.kind === 'boss') {
      s.log.fronts.aliveAtBoss = s.fronts.filter((f) => f.alive).length;
      s.bossMods = bossRulesOf(s.fronts);
      s.log.bossMods = [...s.bossMods];
      s.visit = { node: id, items: BOSS_ITEMS + (s.bossMods.includes('lingering') ? 1 : 0), done: 0 };
      s.phase = 'boss';
      this.show('boss');
    } else {
      s.visit = { node: id, items: Math.max(1, Math.min(3, s.tuning.itemsPerZone)), done: 0 };
      this.draw();
    }
    return true;
  }

  /** Faces the boss, from its threshold: its first item. */
  face(): boolean {
    if (this.state.phase !== 'boss') return false;
    this.show(null);
    this.draw();
    return true;
  }

  /** On from a named item's reveal (ahead()), once a supply that didn't fit is kept or left: the visit's next item, an Expedition's vendor, or the win. */
  next(): boolean {
    const s = this.state;
    const to = this.ahead();
    if (!to) return false;
    this.logItem();
    if (to === 'item') this.draw();
    else if (to === 'win') this.end(true);
    else {
      this.depart();
      s.stock = [...SUPPLIES];
      s.vendor = { at: 'expedition', heal: 0 };
      s.phase = 'vendor';
      this.show('vendor');
    }
    return true;
  }

  /** Lays out the next item of the visit: any item not drawn before this run, at random (never by place, zone or category). It opens with open(). */
  private draw() {
    const s = this.state;
    const t = s.tuning;
    const node = this.node;
    const place = s.places[node.id];
    const boss = place.kind === 'boss' ? s.visit!.done : null;
    const zoneType = place.kind === 'zone' ? place.type : null;
    const hidden = this.hiddenHere();
    const fresh = ITEMS.filter((it) => !this.drawn.has(it.id));
    const answer = fresh[Math.floor(this.rng() * fresh.length)];
    const category = answer.category;
    this.drawn.add(answer.id);
    const words = SYLLABLES[answer.id];
    const answerTiles = words.flat();
    const sec = this.sectionAt(node.step, boss !== null);
    let extra = 0;
    if (zoneType === 'blight') extra += BLIGHT_DECOYS;
    if (boss !== null && s.bossMods.includes('teeming')) extra += TEEMING_DECOYS;
    // The pool's total is rolled, not the decoys: the board's size says next to nothing of the answer's.
    const pool = dealPool(answer, s.seed, t.tiles[sec], extra, t.names[sec]);
    const c = CLUES[answer.id];
    const shown = { mods: [] as number[], flavor: false, lengths: false, category: false, base: false };
    let freeClue: FreeClue = 'none';
    // The boss's first item opens with a small burn-in; its others with nothing.
    if (boss === 0) freeClue = 'burn';
    else if (zoneType && t.freeClue[zoneType]) {
      const order = wisdomOrder(c);
      if ((zoneType === 'plain' || zoneType === 'expedition') && order.length && c.mods[order[0]][2] >= COMMON) {
        shown.mods.push(order[0]);
        freeClue = 'mod';
      } else if (zoneType === 'incursion' && c.flavor) {
        shown.flavor = true;
        freeClue = 'flavor';
      } else if (zoneType === 'essence') {
        shown.base = true;
        freeClue = 'base';
      } else if (zoneType === 'blight') freeClue = 'burn';
      else {
        // Ritual's own, and every free clue the item lacks.
        shown.lengths = true;
        freeClue = 'lengths';
      }
    }
    const log: ItemLog = {
      itemId: answer.id,
      name: answer.name,
      category,
      step: node.step,
      node: node.id,
      zoneType: zoneType ?? 'boss',
      corruption: hidden,
      boss: boss !== null,
      tiles: { answer: [...answerTiles], decoys: [...pool.decoys], names: pool.names.map((d) => d.name) },
      sibling: pool.sibling ? BY_ID.get(pool.sibling)!.name : null,
      freeClue,
      supplies: [],
      deck: [],
      burnIns: [],
      patches: 0,
      submits: [],
      pack: [],
      replaced: [],
      lifeBefore: s.life,
      lifeAfter: s.life,
      toll: 0,
      healed: 0,
      drank: [],
      loot: [],
      misses: 0,
      gold: 0,
    };
    s.item = {
      n: s.done,
      step: node.step,
      node: node.id,
      zoneType,
      boss,
      hidden,
      category,
      itemId: answer.id,
      words,
      answer: answerTiles,
      decoys: pool.decoys,
      tiles: pool.tiles,
      sibling: pool.sibling,
      marks: {},
      swept: [],
      burned: [],
      patches: 0,
      adjacency: null,
      shown,
      deck: [],
      freeClue,
      build: [],
      lineMarks: null,
      locked: 0,
      misses: 0,
      openedAt: null,
      log,
    };
    s.loot = null;
    s.phase = 'item';
  }

  /**
   * Opens the item laid out by draw(), once the page has cut its Veil:
   * `adjacency` lists, for each of its patches, the patches it touches. A
   * Blood toll takes its life, the free burn-in burns, and the clock starts.
   */
  open(adjacency: number[][]): boolean {
    const s = this.state;
    const it = s.item;
    if (s.phase !== 'item' || !it || it.openedAt !== null || !adjacency.length) return false;
    it.adjacency = adjacency.map((nb) => nb.filter((j) => j >= 0 && j < adjacency.length));
    it.patches = adjacency.length;
    it.log.patches = it.patches;
    it.log.pack = s.pack.map((st) => ({ ...st }));
    it.openedAt = this.now();
    if (it.freeClue === 'burn') this.burnIn(it, it.boss !== null ? s.tuning.burnIn.boss : s.tuning.burnIn.blight, 'zone');
    if (it.hidden === 'blood') {
      // Never the last life point: it comes before the player can drink.
      const toll = Math.max(0, Math.min(s.life - 1, BLOOD_TOLL));
      s.life -= toll;
      it.log.toll = toll;
      it.log.lifeAfter = s.life;
    }
    return true;
  }

  /** Milliseconds since the open item opened. */
  private since(it: ItemPlay) {
    return Math.max(0, this.now() - (it.openedAt ?? this.now()));
  }

  /**
   * Burns in a cluster of up to `size` neighbouring patches around a random
   * patch not yet burned: outward from it, ring by ring, through burned
   * patches too, in random order within a ring. A cluster cut off before it
   * is whole starts again from another random patch. Returns the patches.
   */
  private burnIn(it: ItemPlay, size: number, by: BurnBy): number[] {
    const adj = it.adjacency;
    if (!adj) return [];
    const burned = new Set(it.burned);
    const out: number[] = [];
    while (out.length < size && burned.size < it.patches) {
      const left = [...Array(it.patches).keys()].filter((i) => !burned.has(i));
      const seen = new Set([left[Math.floor(this.rng() * left.length)]]);
      let ring = [...seen];
      while (ring.length && out.length < size) {
        for (const p of ring) {
          if (out.length >= size) break;
          if (!burned.has(p)) {
            burned.add(p);
            out.push(p);
          }
        }
        const nextRing: number[] = [];
        for (const p of ring) for (const q of adj[p]) if (!seen.has(q)) seen.add(q), nextRing.push(q);
        ring = shuffle(nextRing, this.rng);
      }
    }
    it.burned.push(...out);
    if (out.length) it.log.burnIns.push({ by, patches: out.length, ms: this.since(it) });
    return out;
  }

  /** Takes one of a supply out of the pack: from the stack at `slot` when it holds that supply, else its last stack. */
  private spend(supply: Supply, slot?: number) {
    const s = this.state;
    if (slot !== undefined && s.pack[slot]?.supply === supply) {
      if (--s.pack[slot].n <= 0) s.pack.splice(slot, 1);
      return;
    }
    for (let i = s.pack.length - 1; i >= 0; i--) {
      if (s.pack[i].supply !== supply) continue;
      if (--s.pack[i].n <= 0) s.pack.splice(i, 1);
      return;
    }
  }

  /** Shows the next mod line, from the most common to the rarest; returns its place. */
  private nextLine(it: ItemPlay): number | undefined {
    const line = wisdomOrder(CLUES[it.itemId]).find((i) => !it.shown.mods.includes(i));
    if (line !== undefined) it.shown.mods.push(line);
    return line;
  }

  /** Uses a supply from the pack on the open item (from the stack at `slot`, if given). */
  use(supply: Supply, slot?: number): boolean {
    if (!this.canUse(supply)) return false;
    const s = this.state;
    const it = s.item!;
    this.spend(supply, slot);
    switch (supply) {
      case 'flare':
        this.burnIn(it, this.flareBurn(), 'flare');
        break;
      case 'wisdom':
        this.nextLine(it);
        break;
      case 'lore':
        it.shown.flavor = true;
        break;
      case 'category':
        it.shown.category = true;
        break;
      case 'base':
        it.shown.base = true;
        break;
      case 'decoy':
        for (const t of shuffle(this.decoysLeft(it), this.rng).slice(0, DECOY_SWEEP)) {
          it.marks[t] = 'struck';
          it.swept.push(t);
        }
        break;
      case 'lengths':
        it.shown.lengths = true;
        break;
      case 'first': {
        const first = it.answer[0];
        it.build = it.lineMarks ? [first] : it.build[0] === first ? it.build : [first, ...it.build];
        it.lineMarks = null;
        it.locked = 1;
        it.marks[first] = 'gold';
        break;
      }
      case 'deck': {
        const options = this.deckOptions(it);
        const clue = options[Math.floor(this.rng() * options.length)];
        const drawn: { clue: DeckClue; mod?: number } = { clue };
        if (clue === 'mod') drawn.mod = this.nextLine(it);
        else if (clue === 'flavor') it.shown.flavor = true;
        else if (clue === 'category') it.shown.category = true;
        else if (clue === 'base') it.shown.base = true;
        else if (clue === 'lengths') it.shown.lengths = true;
        else this.burnIn(it, this.burnSize(s.tuning.burnIn.deck), 'deck');
        it.deck.push(drawn);
        it.log.deck.push(clue);
        break;
      }
    }
    it.log.supplies.push({ type: supply, order: it.log.supplies.length + 1, ms: this.since(it) });
    s.log.used[supply]++;
    return true;
  }

  /** Drinks a flask charge: it heals FLASK_STEP at once, and again as each of the next FLASK_ITEMS items ends (this one first). A drink while one still heals starts over; the rest of that one is lost. */
  drink(): boolean {
    if (!this.canDrink()) return false;
    const s = this.state;
    const it = s.item!;
    s.flask.charges--;
    s.flask.recovering = FLASK_ITEMS;
    s.life = Math.min(s.maxLife, s.life + FLASK_STEP);
    it.log.drank.push(this.since(it));
    s.log.drinks++;
    return true;
  }

  /** After a wrong submit the marked line stands; the next change starts a fresh line (the locked tile kept). */
  private fresh(it: ItemPlay) {
    if (!it.lineMarks) return;
    it.build = it.build.slice(0, it.locked);
    it.lineMarks = null;
  }

  /** Places a tile on the answer line. A tile can be placed more than once. */
  place(tile: string): boolean {
    const it = this.live();
    if (!it || !it.tiles.includes(tile)) return false;
    this.fresh(it);
    it.build.push(tile);
    return true;
  }

  /** Adds a word gap at the end of the line: after a tile, never two together. The check ignores it. */
  gap(): boolean {
    const it = this.live();
    if (!it) return false;
    this.fresh(it);
    if (!it.build.length || it.build.at(-1) === GAP) return false;
    it.build.push(GAP);
    return true;
  }

  /** Takes a placed tile (or a word gap) back off the line (a locked tile stays). */
  unplace(index: number): boolean {
    const it = this.live();
    if (!it || index < it.locked || index >= it.build.length) return false;
    if (it.lineMarks) this.fresh(it);
    else it.build.splice(index, 1);
    return true;
  }

  /** Empties the line, the locked tile kept. */
  clear(): boolean {
    const it = this.live();
    if (!it || it.build.length <= it.locked) return false;
    it.build = it.build.slice(0, it.locked);
    it.lineMarks = null;
    return true;
  }

  /**
   * Submits the line, its word gaps ignored. Right (its letters are the
   * answer's): the item is named, the flask's heal comes in, and its loot
   * goes in the pack at once (none at the boss). Wrong: life drops by a
   * random miss cost, the deal loses a card, and the line is marked tile by
   * tile, the board's tiles keeping their best marks. At 0 life the run ends.
   * Returns whether it was right, or null if nothing could be submitted.
   */
  submit(): boolean | null {
    if (!this.canSubmit()) return null;
    const s = this.state;
    const it = s.item!;
    const line = tilesOf(it.build);
    const breaks: number[] = [];
    let k = 0;
    for (const t of it.build) t === GAP ? breaks.push(k) : k++;
    const right = letters(line.join('')) === letters(it.log.name);
    const sub = { tiles: [...line], breaks, right, marks: [] as LineMark[], lost: 0, ms: this.since(it) };
    it.log.submits.push(sub);
    if (right) {
      let healed = 0;
      if (s.flask.recovering > 0) {
        healed = Math.min(FLASK_STEP, s.maxLife - s.life);
        s.life += healed;
        s.flask.recovering--;
      }
      it.log.healed = healed;
      it.log.lifeAfter = s.life;
      s.phase = 'solved';
      if (it.boss === null) this.takeLoot(it);
      // A zone's last item done: its front stops, the fronts creep, and the reveal offers where next (an Expedition's trader first).
      const v = s.visit!;
      const place = s.places[s.at];
      if (v.done + 1 >= v.items && place.kind === 'zone' && place.type !== 'expedition') this.depart();
      this.show('loot');
      return true;
    }
    const marks = markLine(line, it.answer);
    const goldOnly = s.tuning.marks === 'gold';
    sub.marks = marks.map((m) => (goldOnly && m !== 'gold' ? 'none' : m));
    let j = 0;
    it.lineMarks = it.build.map((t) => (t === GAP ? 'none' : sub.marks[j++]));
    line.forEach((tile, i) => {
      const m = sub.marks[i];
      if (m === 'none') return;
      const was = it.marks[tile];
      if (!was || RANK[m] > RANK[was]) it.marks[tile] = m;
    });
    it.misses++;
    it.log.misses = it.misses;
    s.log.misses++;
    sub.lost = Math.min(s.life, between(this.missRange(), this.rng));
    s.life -= sub.lost;
    it.log.lifeAfter = s.life;
    if (s.life <= 0) {
      s.log.items.push(it.log);
      this.end(false);
    }
    return false;
  }

  /**
   * The loot of a named zone item, into the pack at once: the zone's cards
   * (times the corruption's multiplier) less one a miss, never below 1. The
   * gold, the flask charge, the supplies; a supply that doesn't fit waits for
   * keep().
   */
  private takeLoot(it: ItemPlay) {
    const s = this.state;
    const size = Math.max(1, this.dealHere() - it.misses);
    const sec = this.sectionAt(it.step, false) as 'early' | 'mid' | 'late';
    const cards: LootCard[] = [];
    for (let k = 0; k < size; k++) cards.push(this.rollCard(sec, cards.filter((c) => c.kind === 'flask').length));
    const loot: LootDeal = { cards, pending: [] };
    s.loot = loot;
    it.log.loot = cards.map((c) => ({ ...c }));
    for (const card of cards) {
      s.log.loot.dealt[card.kind]++;
      if (card.kind === 'gold') {
        s.gold += card.gold;
        s.log.goldEarned += card.gold;
        it.log.gold += card.gold;
        s.log.loot.taken.gold++;
      } else if (card.kind === 'flask') {
        s.flask.charges = Math.min(s.tuning.flask, s.flask.charges + 1);
        s.log.loot.taken.flask++;
      } else if (this.stow(card.supply!, card.n)) {
        // Found once it is in the pack: a card left behind counts for nothing.
        s.log.found[card.supply!] += card.n;
        s.log.loot.taken.supply++;
      } else loot.pending.push(card);
    }
  }

  /** One loot card, by the tuning's weights (a flask card only while a charge is empty, counting the `flasks` already dealt with it; a gold card only where the section's gold isn't [0, 0]). */
  private rollCard(section: 'early' | 'mid' | 'late', flasks = 0): LootCard {
    const s = this.state;
    const t = s.tuning.loot;
    const weights = { ...t.weights };
    if (s.flask.charges + flasks >= s.tuning.flask) weights.flask = 0;
    // A section whose gold is [0, 0] deals none (past the last town gold buys nothing).
    if (t.gold[section][1] <= 0) weights.gold = 0;
    const kind = weighted(weights, LOOT_KINDS, this.rng) ?? 'supply';
    return {
      kind,
      gold: kind === 'gold' ? between(t.gold[section], this.rng) : 0,
      supply: kind === 'supply' ? SUPPLIES[Math.floor(this.rng() * SUPPLIES.length)] : null,
      n: kind === 'supply' ? t.supplies : 0,
    };
  }

  /** With the pack full, the first waiting supply card replaces the pack's stack `slot`, or is left (null). */
  keep(slot: number | null): boolean {
    const s = this.state;
    const loot = s.loot;
    const it = s.item;
    if (s.phase !== 'solved' || !it || !loot?.pending.length) return false;
    const card = loot.pending[0];
    if (slot !== null) {
      if (slot < 0 || slot >= s.pack.length) return false;
      const by = { supply: card.supply!, n: card.n };
      it.log.replaced.push({ slot, was: { ...s.pack[slot] }, by: { ...by } });
      s.pack[slot] = by;
      s.log.found[card.supply!] += card.n;
      s.log.loot.taken.supply++;
    }
    loot.pending.shift();
    return true;
  }

  /** The named item done, as its reveal is left: logged, and off the screen. */
  private logItem() {
    const s = this.state;
    const it = s.item!;
    this.show(null);
    it.log.lifeAfter = s.life;
    s.log.items.push(it.log);
    s.done++;
    s.item = null;
    s.loot = null;
    s.visit!.done++;
  }

  /** The run ends: won after the boss, lost at 0 life (on the item still open, or the last one logged). */
  private end(won: boolean) {
    const s = this.state;
    this.show(null);
    const last = s.log.items.at(-1);
    s.log.end = new Date(this.now()).toISOString();
    s.log.ms = Math.max(0, this.now() - Date.parse(s.log.start));
    s.log.result = won ? 'win' : 'loss';
    s.log.endedOn = last ? { n: s.log.items.length - 1, itemId: last.itemId, name: last.name, node: last.node } : null;
    s.log.lifeEnd = s.life;
    s.item = null;
    s.loot = null;
    s.visit = null;
    s.phase = 'end';
  }
}

// ---- Reading an item ----

/** An item by its id. */
export const itemOf = (id: string) => BY_ID.get(id)!;

/** The answer's word lengths, in tiles. */
export const lengthsOf = (it: ItemPlay) => it.words.map((w) => w.length);

/** A board tile's look: its best mark, or plain. Struck tiles grey out where they lie. */
export const markOf = (it: ItemPlay, tile: string): Mark | null => it.marks[tile] ?? null;

/** A plain n by n grid's adjacency: the patches of art that won't load (the run still plays, its Veil dark), and of tests and benches. */
export function gridAdjacency(n: number): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      out.push(
        [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ]
          .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n)
          .map(([a, b]) => b * n + a),
      );
  return out;
}
