// The Wraeclast run's rules (wraeclast.html, src/wraeclast): a solo run in an
// open region (map.ts) from the camp to the Seed of Corruption's lair, the
// mode's prototype (v5). Pure: the run's state is a plain object (the page
// makes it reactive), every action a method that changes it, so a run plays
// the same in a test as on the page.
//
// A run: the camp's shop, then any place linked to one cleared (the lair at
// any time). A zone holds one item, at its depth (Known, Obscure, Forgotten:
// src/data/wraeclastDepth.json) and maybe a waystone mod; named, it pays gold
// and spreads the corruption one ring out from the lair, which makes the Seed
// stronger and the zones it reaches deeper. Towns heal once and sell the four
// supplies. At the lair, the duel: an item at a time, one submit each, the
// Seed hitting you as each opens and a right name hitting it back.
// Each item: its name built from tiles (the Inscription: the answer's tiles
// among those of a few look-alike names and loose decoys), its art all under
// the Veil, and the supplies from the pack. A zone's miss costs life and
// marks the line as Wordle does. docs/wraeclast (the prototype's handoffs, on
// the orchestrator's branch) has the reasons.

import { shuffle, type Item } from '../lib/game.ts';
import { seededRandom } from '../lib/patches.ts';
import { readLooks, type LooksData } from '../lib/looks.ts';
import itemData from '../data/items.json' with { type: 'json' };
import syllableData from '../data/syllables.json' with { type: 'json' };
import looksData from '../data/looks.json' with { type: 'json' };
import clueData from '../data/clues.json' with { type: 'json' };
import depthData from '../data/wraeclastDepth.json' with { type: 'json' };
import { REGION, type PlaceKind, type RegionPlace } from './map.ts';
import { HOLD, NAMES, dealDraft, namedBy, type Boon } from './boons.ts';

export type { PlaceKind } from './map.ts';
export type { Boon } from './boons.ts';

/** The supplies, by their working keys (the log's): flare is the Torch, lore the Golden Page, category the Ancient Orb, wisdom the Scroll of Wisdom. */
export type Supply = 'flare' | 'lore' | 'category' | 'wisdom';
export const SUPPLIES: readonly Supply[] = ['flare', 'lore', 'category', 'wisdom'];
export const SUPPLY_NAMES: Record<Supply, string> = {
  flare: 'Torch',
  lore: 'Golden Page',
  category: 'Ancient Orb',
  wisdom: 'Scroll of Wisdom',
};

/** How well known an item is (poe.ninja's listings, scripts/wraeclast-depth.mjs): a zone's depth. */
export type Depth = 'known' | 'obscure' | 'forgotten';
export const DEPTHS: readonly Depth[] = ['known', 'obscure', 'forgotten'];
/** Each item's depth, by id (an item the file lacks is Forgotten). */
const DEPTH_OF = (depthData as { depth: Record<string, Depth> }).depth;
export const depthOf = (id: string): Depth => DEPTH_OF[id] ?? 'forgotten';

/** A zone's waystone mod: extra damage (a miss costs more), less recovery (the next town's heal doesn't happen), more monsters (one more decoy name), armoured (no supply till the first submit). */
export type Mod = 'damage' | 'recovery' | 'monsters' | 'armoured';
const MODS: readonly Mod[] = ['damage', 'recovery', 'monsters', 'armoured'];

export type Range = [number, number];

/** A tile's mark after a wrong submit: the right tile in the right place, in the answer elsewhere, or not in it. */
export type Mark = 'gold' | 'silver' | 'struck';
/** A placed tile's mark on the line; "none" where only gold is marked (tuning), and on a word gap. */
export type LineMark = Mark | 'none';

/** A word gap on the answer line: the player's own, never placed or suggested by the game; the check ignores it. */
export const GAP = ' ';

/** A board: a zone's or the duel's. */
type Board = 'zone' | 'duel';
export const BOARDS: readonly Board[] = ['zone', 'duel'];

export interface Tuning {
  life: number;
  gold: number;
  /** Life a town heals the first time it's entered (the camp never heals). */
  townHeal: number;
  /** The tiles a pool holds (the answer's, the decoy names' and the loose decoys), by board: each item rolls its own within TILE_SPREAD of it. */
  tiles: Record<Board, number>;
  /** How many decoy names a board holds, by board: rolled for each item, never shown. */
  names: Record<Board, Range>;
  /** A zone's miss, in life, by its depth. */
  missCost: Record<Depth, number>;
  /** The gold a zone's item pays when named, by its depth. */
  pay: Record<Depth, number>;
  /** Each zone's depth at the run's start, in percent weights (the camp's neighbours never Forgotten). */
  depthRoll: Record<Depth, number>;
  /** A zone rolls a mod at the start 1 in this many. */
  modOdds: number;
  /** The gold a mod adds to a zone's pay. */
  modGold: number;
  /** What "Monsters deal extra damage" adds to a miss. */
  modDamage: number;
  /** The Seed of Corruption: its life and hit at the start, the life each zone that spreads the corruption adds, and every how many such zones its hit grows by 1. */
  seedLife: number;
  seedHit: number;
  seedGrowth: number;
  seedHitEvery: number;
  /** A right name at the duel hits the Seed for: no supply used, one kind, two kinds or more. */
  duelHit: [number, number, number];
  /** A wrong name at the duel costs this much life. */
  duelMiss: number;
  /** Each supply's price, one at a time. */
  price: Record<Supply, number>;
  /** Patches a Torch burns in. */
  torch: number;
  /** The Veil's seeds across the art (about this many a side). */
  seeds: number;
  /** Gold and silver marks, or gold only. */
  marks: 'both' | 'gold';
  /** Boons: Honoured Challenger's heal, Earned Honour's, the life Sanguine Vial takes off the Seed, the gold each Upward Path step adds, and what Ornate Dagger and Assassin's Blade multiply a hit by. */
  challengerHeal: number;
  honourHeal: number;
  vialLife: number;
  upwardGold: number;
  boonHit: number;
}

/** The v5 handoff's numbers (docs/wraeclast/prototype-v5-handoff.md). */
export const DEFAULT_TUNING: Tuning = {
  life: 100,
  gold: 20,
  townHeal: 25,
  tiles: { zone: 20, duel: 32 },
  names: { zone: [2, 3], duel: [4, 5] },
  missCost: { known: 15, obscure: 20, forgotten: 25 },
  pay: { known: 8, obscure: 12, forgotten: 16 },
  depthRoll: { known: 40, obscure: 35, forgotten: 25 },
  modOdds: 3,
  modGold: 6,
  modDamage: 10,
  seedLife: 30,
  seedHit: 5,
  seedGrowth: 8,
  seedHitEvery: 2,
  duelHit: [20, 12, 6],
  duelMiss: 10,
  price: { flare: 10, lore: 8, category: 8, wisdom: 8 },
  torch: 12,
  seeds: 9,
  marks: 'both',
  challengerHeal: 15,
  honourHeal: 30,
  vialLife: 5,
  upwardGold: 5,
  boonHit: 2,
};

/** The most tiles a pool holds, the answer's included. */
export const MAX_TILES = 36;
/** How far an item's pool total strays from its board's, either way, so the total never gives the answer's tile count away. */
export const TILE_SPREAD = 3;
/** The fewest decoys a pool holds besides of, the, and and the possessives (the decoy names' tiles counting). */
export const MIN_DECOYS = 5;
/** Loose decoys are drawn at random from the best this many look-alikes. */
const DECOY_POOL = 30;
/** Words that stay whole tiles, on every board. */
export const SMALL_WORDS: readonly string[] = ['of', 'the', 'and'];
/** Possessive tiles on every board, the answer's and the decoy names' counting toward them: a gem's name nearly always has one, so every board shows a few. */
export const POSSESSIVES: Range = [2, 3];
/** A possessive tile ("ahn's", "tus'"). */
export const isPossessive = (tile: string) => /('s|s')$/.test(tile);
/** How many look-alikes, by art and by name, a decoy name is drawn from. */
export const LOOKALIKES = 8;

/** A mod line: its kind (the tooltip section), its text (name words masked), and how many items share it. */
type ModLine = [string, string, number];
export type Clues = { category: string; base: string; mods: ModLine[]; flavor: string | null; support: string | null };
export const ITEMS = itemData as Item[];
export const SYLLABLES = syllableData as Record<string, string[][]>;
export const CLUES = clueData as unknown as Record<string, Clues>;
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
/** An item's name, by id. */
export const nameOf = (id: string) => BY_ID.get(id)?.name ?? id;
const LOOKS = readLooks(looksData as unknown as LooksData);


/**
 * draft: a town's boon draft, on its first entry (the camp's at the start),
 * before its shop. vendor: a town's shop. map: the region, a place
 * to enter picked. item: an item open. solved: a zone's item named (its
 * reveal, then the map), or a duel item answered, right or wrong (then the
 * next). end: won or lost.
 */
export type Phase = 'draft' | 'vendor' | 'map' | 'item' | 'solved' | 'end';

/** A screen between items, as the log times it: a boon draft, a shop (the camp's, a town's), the map, or an item's reveal. */
export type Screen = 'draft' | 'camp' | 'town' | 'map' | 'reveal';

/** A boon firing on an item: which, its number (the hit, the life, the gold, the Seed's new hit), and on which submit (its index). */
export interface Fired {
  boon: Boon;
  n: number;
  submit: number;
}

/** The pack: how many of each supply, no stacks, no cap. */
export type Pack = Record<Supply, number>;

/** The duel's two lines as a duel item opens (after the Seed's hit): the Seed's life and hit, your life and what a bare answer hits. */
interface DuelLines {
  seed: { life: number; hit: number };
  you: { life: number; hit: number };
}

export interface ItemLog {
  itemId: string;
  name: string;
  category: string;
  node: string;
  /** A zone's item, or the duel's. */
  duel: boolean;
  /** Its depth (a duel item's own, from any depth). */
  depth: Depth;
  /** The zone's mod, or null. */
  mod: Mod | null;
  /** Whether the zone was corrupted as it was entered. */
  corrupted: boolean;
  /** The board: the answer's tiles, the decoys (the decoy names' tiles, of, the, and, the possessives and the loose ones), and the decoy names. */
  tiles: { answer: string[]; decoys: string[]; names: string[] };
  /** The Ancient Orb's sibling, by name (its tiles kept off the board), or null when the category has none. */
  sibling: string | null;
  supplies: { type: Supply; order: number; ms: number }[];
  /** Each Torch's burn-in: how many patches it took, when (ms after the item opened). */
  burnIns: { patches: number; ms: number }[];
  /** The Veil's patches, as the page cut it. */
  patches: number;
  /** Each submit: the tiles placed (breaks left out), where the player put word breaks (after that many tiles), right or not, the tiles' marks, the life a miss cost, when. */
  submits: { tiles: string[]; breaks: number[]; right: boolean; marks: LineMark[]; lost: number; ms: number }[];
  /** The pack as the item opened. */
  pack: Pack;
  lifeBefore: number;
  lifeAfter: number;
  misses: number;
  /** The gold it paid when named (0 at the duel). */
  gold: number;
  /** The spread after it (a zone's named item spreads it one ring). */
  spread: number;
  /** At the duel: both lines as it opened, the Seed's hit on you, the supply kinds used, and your hit on the Seed (0 on a miss). Null in a zone. */
  duelLog: (DuelLines & { took: number; kinds: number; dealt: number }) | null;
  /** The boons held as it opened. */
  boons: Boon[];
  /** The boons that fired on it, in order. */
  fired: Fired[];
}

export interface ItemPlay {
  /** Its place in the run, from 0. */
  n: number;
  node: string;
  /** At the duel (the lair), or in a zone. */
  duel: boolean;
  depth: Depth;
  mod: Mod | null;
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
  /** The Veil's patches burned in, in the order they burned. */
  burned: number[];
  /** The Veil's patches (the page's cut), 0 until the item opens. */
  patches: number;
  /** Which patches touch which (the page's cut), null until the item opens. */
  adjacency: number[][] | null;
  /** The clues shown: mod lines (in the order shown, by their place in the tooltip), the flavour text, the Ancient Orb's sibling. */
  shown: { mods: number[]; flavor: boolean; category: boolean };
  /** The answer line, in order: tiles and the player's word gaps (GAP). */
  build: string[];
  /** The last wrong submit's marks while its line stands (one for each entry of the line, "none" on a gap), else null. */
  lineMarks: LineMark[] | null;
  misses: number;
  /** When it opened (its Veil cut), or null while it's being laid out. */
  openedAt: number | null;
  log: ItemLog;
}

/** What a place is this run: its kind, a zone's depth and mod as rolled at the start (and the mod corruption gives it, if it has none), and whether it's cleared. */
interface PlaceState {
  kind: PlaceKind;
  depth: Depth | null;
  mod: Mod | null;
  /** The mod corruption gives a zone that has none. */
  spare: Mod | null;
  /** The camp from the start, a town once entered, a zone once its item is named. */
  cleared: boolean;
}

export interface RunLog {
  v: 7;
  seed: number;
  start: string;
  end: string | null;
  /** Run time, ms. */
  ms: number;
  result: 'win' | 'loss' | null;
  /** The item the run ended on: its place, id, name and node. */
  endedOn: { n: number; itemId: string; name: string; node: string } | null;
  /** The places entered, in order, the camp first. */
  route: string[];
  /** Each zone's depth and mod as the run started. */
  region: { node: string; depth: Depth; mod: Mod | null }[];
  /** Each place entered, the camp first: a town's heal (or the heal less recovery took), and the gold spent and supplies bought there. */
  met: { node: string; kind: PlaceKind; healed: number; noHeal: boolean; spent: number; bought: number }[];
  /** Each boon draft: where, the cards offered, the one taken (null: passed). */
  drafts: { node: string; offered: Boon[]; took: Boon | null }[];
  /** The boons held, in the order taken. */
  boons: Boon[];
  /** Zones that spread the corruption. */
  spread: number;
  /** The Seed's line at the end. */
  seedEnd: { life: number; hit: number };
  misses: number;
  bought: Record<Supply, number>;
  used: Record<Supply, number>;
  goldEarned: number;
  goldSpent: number;
  lifeEnd: number;
  /** Each visit to a screen between items: which, where, for how long. */
  screens: { screen: Screen; node: string; ms: number }[];
  tuning: Tuning;
  /** The device's viewport width, CSS pixels. */
  viewport: number;
  items: ItemLog[];
}

interface RunState {
  seed: number;
  tuning: Tuning;
  /** What each place is this run. */
  places: Record<string, PlaceState>;
  /** The place the player is at (or last was). */
  at: string;
  phase: Phase;
  /** In a town (a draft, then its shop): where, the heal on this entry, whether less recovery took it, whether it's the first entry, and whether a draft came first. */
  vendor: { at: 'camp' | 'town'; heal: number; noHeal: boolean; first: boolean; drafted: boolean } | null;
  /** The boons held, in the order taken (at most HOLD). */
  boons: Boon[];
  /** The draft's cards while it's open, else null. */
  draft: Boon[] | null;
  /** The once-a-run boons that have fired (Sekhema's Cloak). */
  spent: Boon[];
  /** Balbala's Gift: whether the next Torch bought in a town is free (once per arrival after a zone, and at the start). */
  freeTorch: boolean;
  /** Upward Path's streak: items named in a row with no supply while it's held (a supply used or bought ends it). */
  streak: number;
  life: number;
  maxLife: number;
  gold: number;
  pack: Pack;
  /** Zones that spread the corruption: places at that ring from the lair or nearer are corrupted (cleared ones and towns aside). */
  spread: number;
  /** The Seed of Corruption's line: its life and its hit. */
  foe: { life: number; hit: number };
  /** A zone with less recovery was cleared: the next town's heal doesn't happen. */
  noHeal: boolean;
  /** Items done. */
  done: number;
  item: ItemPlay | null;
  log: RunLog;
}
const count = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** A name or build as the check compares it: its letters only, lower case. */
export const letters = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** The line's tiles, its word gaps left out. */
const tilesOf = (build: readonly string[]) => build.filter((t) => t !== GAP);


/** A whole number in [lo, hi], at random. */
const between = ([lo, hi]: Range, rng: () => number) => lo + Math.floor(rng() * (Math.max(lo, hi) - lo + 1));

/** Mod lines from the most common to the rarest (by how many items share them, ties in tooltip order). */
export const wisdomOrder = (clues: Clues) =>
  clues.mods
    .map((m, i) => ({ i, shared: m[2] }))
    .sort((a, b) => b.shared - a.shared || a.i - b.i)
    .map((m) => m.i);

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
function itemSeed(seed: number, itemId: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < itemId.length; i++) h = Math.imul(h ^ itemId.charCodeAt(i), 2654435761) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** A name's words that count when two names are compared (of, the and and don't). */
const wordsOf = (name: string) => new Set(name.toLowerCase().split(/\s+/).map(letters).filter((w) => w && !SMALL_WORDS.includes(w)));
/** The shortest word looked for inside another (Girdle in Goregirdle): shorter ones sit inside too many words by chance. */
const COMPOUND_MIN = 4;
/** Two words starting with this many letters alike share a stem (Blackflame, Blackheart). */
const STEM = 5;
/**
 * Whether two words are one, one holds the other inside a compound
 * (Goregirdle, Meginord's Girdle), they share a stem, or a short word starts
 * the other (Red, Redflare).
 */
const wordsMeet = (a: string, b: string) =>
  a === b ||
  (a.length >= COMPOUND_MIN && b.includes(a)) ||
  (b.length >= COMPOUND_MIN && a.includes(b)) ||
  (a.length >= STEM && b.length >= STEM && a.slice(0, STEM) === b.slice(0, STEM)) ||
  (a.length >= 3 && b.startsWith(a)) ||
  (b.length >= 3 && a.startsWith(b));

/**
 * The Ancient Orb's sibling for an answer: another item of its category (a
 * lineage gem's is another lineage gem) sharing no word with it, nor holding
 * one of its words inside a compound (or the other way), at random, or null
 * when there is none.
 */
function siblingOf(answer: Item, rng: () => number): Item | null {
  const own = [...wordsOf(answer.name)];
  const pool = ITEMS.filter((it) => it.id !== answer.id && it.category === answer.category && ![...wordsOf(it.name)].some((w) => own.some((o) => wordsMeet(w, o))));
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

/** A decoy name: a real item's name, and its tiles. */
interface DecoyName {
  name: string;
  tiles: string[];
}

/** A name, read once for `likeness`: what nameSimilarity reads off it on every call. */
interface NameShape {
  pairs: Int16Array;
  first: string;
  two: string;
  possessive: boolean;
  the: boolean;
  words: number;
  significant: Set<string>;
  length: number;
}
const shapes = new Map<string, NameShape>();
function shapeOf(name: string): NameShape {
  let sh = shapes.get(name);
  if (sh) return sh;
  const clean = name.toLowerCase().replace(/[^a-z]/g, '');
  const pairs = new Int16Array(Math.max(0, clean.length - 1));
  for (let i = 0; i < pairs.length; i++) pairs[i] = (clean.charCodeAt(i) - 97) * 26 + clean.charCodeAt(i + 1) - 97;
  const la = name.toLowerCase();
  const words = la.split(/\s+/);
  sh = {
    pairs,
    first: la[0],
    two: la.slice(0, 2),
    possessive: /'s?\b/.test(la),
    the: la.startsWith('the '),
    words: words.length,
    significant: new Set(words.map((x) => x.replace(/[^a-z]/g, '')).filter((x) => x.length > 3)),
    length: name.length,
  };
  shapes.set(name, sh);
  return sh;
}
const pairCounts = new Int16Array(26 * 26);
/** nameSimilarity (src/lib/game.ts), the same sum in the same order, off names read once: the look-alike lists of every item take it 250,000 times. */
function likeness(a: string, b: string): number {
  const sa = shapeOf(a);
  const sb = shapeOf(b);
  for (const g of sa.pairs) pairCounts[g]++;
  let shared = 0;
  for (const g of sb.pairs) {
    if (pairCounts[g] > 0) {
      shared++;
      pairCounts[g]--;
    }
  }
  for (const g of sa.pairs) pairCounts[g] = 0;
  let score = sa.pairs.length + sb.pairs.length ? (2 * shared) / (sa.pairs.length + sb.pairs.length) : 0;
  if (sa.first === sb.first) score += 0.3;
  if (sa.two === sb.two) score += 0.2;
  if (sa.possessive === sb.possessive) score += 0.2;
  if (sa.the === sb.the) score += 0.15;
  if (sa.words === sb.words) score += 0.2;
  for (const w of sb.significant) if (sa.significant.has(w)) score += 0.5;
  if (Math.abs(sa.length - sb.length) <= 2) score += 0.15;
  return score;
}

const nameLikes = new Map<string, Item[]>();
const nearLists = new Map<string, Item[]>();
const wider = new Map<string, Item[]>();

/** An item's look-alikes: the items whose art looks most like it, then whose names read most like it, never itself. */
function nearOf(item: Item): Item[] {
  let near = nearLists.get(item.id);
  if (near) return near;
  const byArt = LOOKS.looksLike(item.id)
    .slice(0, LOOKALIKES)
    .map((l) => BY_ID.get(l.id))
    .filter((it): it is Item => !!it && it.id !== item.id);
  let byName = nameLikes.get(item.id);
  if (!byName) {
    byName = ITEMS.filter((it) => it.id !== item.id)
      .map((it) => ({ it, like: likeness(item.name, it.name) }))
      .sort((a, b) => b.like - a.like || a.it.id.localeCompare(b.it.id))
      .slice(0, LOOKALIKES)
      .map((x) => x.it);
    nameLikes.set(item.id, byName);
  }
  near = [...new Map([...byArt, ...byName].map((it) => [it.id, it])).values()];
  nearLists.set(item.id, near);
  return near;
}

/** The rest of an item's category, by how alike they look (art rank) and read (name), best first. */
function wideOf(item: Item): Item[] {
  let rest = wider.get(item.id);
  if (rest) return rest;
  const artRank = new Map(LOOKS.looksLike(item.id).map((l, i) => [l.id, i]));
  rest = ITEMS.filter((it) => it.id !== item.id && it.category === item.category)
    .map((it) => ({ it, like: likeness(item.name, it.name) - (artRank.get(it.id) ?? ITEMS.length) / ITEMS.length }))
    .sort((a, b) => b.like - a.like || a.it.id.localeCompare(b.it.id))
    .map((x) => x.it);
  wider.set(item.id, rest);
  return rest;
}

let heldByCount: Map<string, number> | null = null;
/** How many items' look-alike lists hold this one (some sit in 30, others in under 10). */
function heldBy(id: string): number {
  if (!heldByCount) {
    heldByCount = new Map();
    for (const it of ITEMS) for (const x of nearOf(it)) heldByCount.set(x.id, (heldByCount.get(x.id) ?? 0) + 1);
  }
  return heldByCount.get(id) ?? 1;
}

/** One of `xs` at random, each as likely as its weight. */
function pickWeighted<T>(xs: readonly T[], weight: (x: T, i: number) => number, rng: () => number): T {
  const w = xs.map(weight);
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) if ((r -= w[i]) < 0) return xs[i];
  return xs[xs.length - 1];
}

/** A pool, as dealPool deals it. */
interface Pool {
  decoys: string[];
  tiles: string[];
  /** The decoy names whose tiles are all on the board. */
  names: DecoyName[];
  /** The Ancient Orb's sibling, by id, or null. */
  sibling: string | null;
}

/**
 * An item's pool, from its own seed. The answer's tiles, and the full tiles of
 * `names` decoy names (rolled, never shown), real items: never the Ancient
 * Orb's sibling, whose tiles stay off the board. Each decoy name is a
 * look-alike of a name already on the board, picked at random (the answer
 * half as often), so the names look like each other and not only like the
 * answer; and the fewer look-alike lists a name sits in, the likelier it is
 * picked, so a name seldom seen as a decoy says nothing either.
 * Loose decoys (length-matched) fill the rest of the total, rolled within
 * TILE_SPREAD of the board's `size`; the decoys besides of, the, and and
 * the possessives are at least MIN_DECOYS.
 * On top, every board holds of, the and and, and POSSESSIVES possessive
 * tiles in all (the names' counting). Where the names don't fit the total it
 * grows, up to MAX_TILES: the cap trims the loose decoys first, and a name
 * that would pass it is never dealt.
 */
export function dealPool(answer: Item, seed: number, size: number, names: Range = [0, 0], shut: ReadonlySet<string> = new Set()): Pool {
  const rng = seededRandom(itemSeed(seed, answer.id));
  const ownList = SYLLABLES[answer.id].flat();
  const own = new Set(ownList);
  const total = size - TILE_SPREAD + Math.floor(rng() * (2 * TILE_SPREAD + 1));
  const sib = siblingOf(answer, rng);
  // The sibling's own tiles (not the answer's too) stay off the board: else they'd show it is wrong for free.
  const off = new Set(sib ? SYLLABLES[sib.id].flat().filter((t) => !own.has(t)) : []);
  const want = between(names, rng);
  const sameSet = (tiles: string[]) => new Set(tiles).size === own.size && tiles.every((t) => own.has(t));
  const ok = (it: Item) =>
    it.id !== answer.id &&
    !shut.has(it.id) &&
    !!SYLLABLES[it.id] &&
    letters(it.name) !== letters(answer.name) &&
    (!sib || letters(it.name) !== letters(sib.name)) &&
    !sameSet(SYLLABLES[it.id].flat()) &&
    !SYLLABLES[it.id].flat().some((t) => off.has(t));
  const small = SMALL_WORDS.filter((w) => !own.has(w));
  const picked: DecoyName[] = [];
  const nameTiles = new Set<string>();
  const signatureFor = (tiles: Set<string>) => [...tiles].filter(isPossessive).length;
  /** The answer, then each name dealt: the names the next one is a look-alike of. */
  const onBoard: Item[] = [answer];
  const tried = new Set<string>([answer.id]);
  const take = (it: Item) => {
    tried.add(it.id);
    const tiles = SYLLABLES[it.id].flat();
    const more = tiles.filter((t) => !own.has(t) && !nameTiles.has(t) && !small.includes(t));
    // The board's tiles so far, with this name's: room left under the cap, of, the and and on top.
    if (own.size + nameTiles.size + more.length + small.length > MAX_TILES) return;
    picked.push({ name: it.name, tiles });
    onBoard.push(it);
    for (const t of more) nameTiles.add(t);
  };
  for (let guard = 0; picked.length < want && guard < 60; guard++) {
    const pivot = pickWeighted(onBoard, (_, i) => (i === 0 ? 0.5 : 1), rng);
    const can = nearOf(pivot).filter((it) => !tried.has(it.id) && ok(it));
    if (can.length) take(pickWeighted(can, (it) => 1 / heldBy(it.id), rng));
  }
  // Still short (a thin answer, a crowded board): the answer's own look-alikes, then the rest of its category, each at random.
  if (picked.length < want) {
    for (const it of [...shuffle(nearOf(answer), rng), ...shuffle(wideOf(answer), rng)]) {
      if (picked.length >= want) break;
      if (!tried.has(it.id) && ok(it)) take(it);
    }
  }
  // The possessives: the answer's and the names' count; loose ones make up the rest.
  possessivesInNames ??= ITEMS.flatMap((it) => SYLLABLES[it.id].flat().filter(isPossessive));
  const have = signatureFor(new Set([...own, ...nameTiles]));
  const notLoose = new Set([...own, ...nameTiles, ...off, ...SMALL_WORDS]);
  // Never past the cap: a board the names filled gets fewer.
  const possessive = pickDecoys(notLoose, Math.min(between(POSSESSIVES, rng) - have, MAX_TILES - own.size - nameTiles.size - small.length), rng, isPossessive, possessivesInNames);
  const signature = [...small, ...possessive];
  for (const t of possessive) notLoose.add(t);
  // The rolled total is the answer's tiles, the names' and the loose decoys; of, the, and and the possessives come on top.
  const room = Math.max(0, MAX_TILES - own.size - nameTiles.size - signature.length);
  const loose = Math.min(room, Math.max(MIN_DECOYS - nameTiles.size, total - own.size - nameTiles.size, 0));
  // Against the answer's tiles and every decoy name's: else the answer's alone have look-alikes around them.
  const ordinary = pickDecoys(notLoose, loose, rng, (t) => !isPossessive(t), [...ownList, ...picked.flatMap((d) => d.tiles)]);
  const decoys = [...signature, ...nameTiles, ...ordinary];
  return { decoys, tiles: shuffle([...own, ...decoys], rng), names: picked, sibling: sib?.id ?? null };
}

interface RunOptions {
  tuning?: Tuning;
  seed?: number;
  now?: () => number;
  /** The device's viewport width, for the log. */
  viewport?: number;
}

/** One depth deeper (Forgotten stays Forgotten). */
const deeper = (d: Depth): Depth => DEPTHS[Math.min(DEPTHS.length - 1, DEPTHS.indexOf(d) + 1)];

export class Run {
  state: RunState;
  /** The region this run plays. */
  readonly region = REGION;
  private readonly rng: () => number;
  private readonly now: () => number;
  /** Items drawn so far: none comes up twice. */
  private readonly drawn = new Set<string>();
  /** The screen between items being shown, and since when. */
  private screen: { screen: Screen; node: string; since: number } | null = null;

  constructor({ tuning = DEFAULT_TUNING, seed = Math.floor(Math.random() * 2 ** 32), now = Date.now, viewport = 0 }: RunOptions = {}) {
    this.rng = seededRandom(seed);
    this.now = now;
    const t: Tuning = structuredClone(tuning);
    const places = this.rollPlaces(t);
    const camp = REGION.camp.id;
    this.state = {
      seed,
      tuning: t,
      places,
      at: camp,
      phase: 'vendor',
      vendor: { at: 'camp', heal: 0, noHeal: false, first: true, drafted: false },
      boons: [],
      draft: null,
      spent: [],
      freeTorch: true,
      streak: 0,
      life: t.life,
      maxLife: t.life,
      gold: t.gold,
      pack: count(SUPPLIES),
      spread: 0,
      foe: { life: t.seedLife, hit: t.seedHit },
      noHeal: false,
      done: 0,
      item: null,
      log: {
        v: 7,
        seed,
        start: new Date(now()).toISOString(),
        end: null,
        ms: 0,
        result: null,
        endedOn: null,
        route: [camp],
        region: REGION.places.filter((p) => p.kind === 'zone').map((p) => ({ node: p.id, depth: places[p.id].depth!, mod: places[p.id].mod })),
        met: [{ node: camp, kind: 'camp', healed: 0, noHeal: false, spent: 0, bought: 0 }],
        drafts: [],
        boons: [],
        spread: 0,
        seedEnd: { life: t.seedLife, hit: t.seedHit },
        misses: 0,
        bought: count(SUPPLIES),
        used: count(SUPPLIES),
        goldEarned: 0,
        goldSpent: 0,
        lifeEnd: t.life,
        screens: [],
        tuning: structuredClone(t),
        viewport,
        items: [],
      },
    };
    this.openDraft(true);
  }

  /** Each place this run: a zone rolls its depth (the camp's neighbours never Forgotten), a mod 1 in modOdds, and the mod corruption would give it. */
  private rollPlaces(t: Tuning): Record<string, PlaceState> {
    const nextToCamp = new Set(REGION.camp.links);
    const out: Record<string, PlaceState> = {};
    for (const p of REGION.places) {
      if (p.kind !== 'zone') {
        out[p.id] = { kind: p.kind, depth: null, mod: null, spare: null, cleared: p.kind === 'camp' };
        continue;
      }
      const depths = DEPTHS.filter((d) => !(d === 'forgotten' && nextToCamp.has(p.id)));
      const weights = depths.map((d) => Math.max(0, t.depthRoll[d]));
      const depth = weights.some((w) => w > 0) ? pickWeighted(depths, (_, i) => weights[i], this.rng) : depths[0];
      const mod = this.rng() * Math.max(1, t.modOdds) < 1 ? MODS[Math.floor(this.rng() * MODS.length)] : null;
      const spare = MODS[Math.floor(this.rng() * MODS.length)];
      out[p.id] = { kind: 'zone', depth, mod, spare, cleared: false };
    }
    return out;
  }

  // ---- What's where ----

  /** The place the player is at. */
  get node(): RegionPlace {
    return REGION.byId.get(this.state.at)!;
  }

  /** Whether a place is corrupted now: a zone not cleared, within the spread's ring of the lair. Towns never. */
  corrupted(id: string): boolean {
    const p = this.state.places[id];
    const r = REGION.byId.get(id);
    return !!p && !!r && p.kind === 'zone' && !p.cleared && r.ring <= this.state.spread;
  }

  /** What the spread has changed since it stood at `since`: the places it corrupted (the map plays them once), and the rings it moved. */
  spreadSince(since: number): { places: string[]; rings: number } {
    const s = this.state;
    return { places: REGION.places.filter((p) => p.ring > since && this.corrupted(p.id)).map((p) => p.id), rings: Math.max(0, s.spread - since) };
  }

  /** Whether the next zone named would corrupt a place: a zone not cleared, at the next ring out. */
  corruptsNext(id: string): boolean {
    const p = this.state.places[id];
    const r = REGION.byId.get(id);
    return !!p && !!r && p.kind === 'zone' && !p.cleared && r.ring === this.state.spread + 1;
  }

  /** A zone's depth now: one deeper while corrupted. */
  depthAt(id: string): Depth {
    const d = this.state.places[id]?.depth ?? 'known';
    return this.corrupted(id) ? deeper(d) : d;
  }

  /** A zone's mod now: its own, or the one corruption gives it. */
  modAt(id: string): Mod | null {
    const p = this.state.places[id];
    if (!p) return null;
    return p.mod ?? (this.corrupted(id) ? p.spare : null);
  }

  /** The gold a zone pays when its item is named, now. */
  goldAt(id: string): number {
    const t = this.state.tuning;
    return t.pay[this.depthAt(id)] + (this.modAt(id) ? t.modGold : 0);
  }

  /** Whether a town's next entry heals: its first, and not after less recovery. The camp never heals. */
  healsAt(id: string): boolean {
    const p = this.state.places[id];
    return !!p && p.kind === 'town' && !p.cleared;
  }

  /** Whether a place can be entered from the map: the lair always; a town or a zone not yet cleared, linked to a place cleared. */
  canEnter(id: string): boolean {
    const s = this.state;
    const p = s.places[id];
    const r = REGION.byId.get(id);
    if (s.phase !== 'map' || !p || !r) return false;
    if (p.kind === 'lair') return true;
    if (p.kind === 'zone' && p.cleared) return false;
    return r.links.some((to) => s.places[to]?.cleared);
  }

  /** A miss's cost on the open item: the duel's, or the zone's by depth (more under extra damage). */
  missCost(): number {
    const s = this.state;
    const it = s.item;
    const t = s.tuning;
    if (!it) return 0;
    if (it.duel) return t.duelMiss;
    return t.missCost[it.depth] + (it.mod === 'damage' ? t.modDamage : 0);
  }

  /** The gold the open item pays when named: none at the duel. */
  payGold(): number {
    const it = this.state.item;
    if (!it || it.duel) return 0;
    const t = this.state.tuning;
    return t.pay[it.depth] + (it.mod ? t.modGold : 0);
  }

  /** The kinds of supply used on an item. */
  private usedOn(it: ItemPlay): Set<Supply> {
    return new Set(it.log.supplies.map((u) => u.type));
  }

  /** Whether only this supply was used on an item (no other, and it at least once). */
  private only(it: ItemPlay, supply: Supply): boolean {
    const used = this.usedOn(it);
    return used.size === 1 && used.has(supply);
  }

  /** The gold boons on a zone's item named now (Raincaller, Upward Path): each with what it adds. */
  private goldBoons(it: ItemPlay): { boon: Boon; n: number }[] {
    const s = this.state;
    if (it.duel) return [];
    const out: { boon: Boon; n: number }[] = [];
    if (this.has('raincaller') && this.only(it, 'lore')) out.push({ boon: 'raincaller', n: this.payGold() });
    if (this.has('upward') && this.usedOn(it).size === 0) out.push({ boon: 'upward', n: s.tuning.upwardGold * (s.streak + 1) });
    return out;
  }

  /** The gold the open item pays if named now, its boons with it. */
  payNow(): number {
    const it = this.state.item;
    return it ? this.payGold() + this.goldBoons(it).reduce((a, g) => a + g.n, 0) : 0;
  }

  /** The boon that doubles a right name at the duel now: Ornate Dagger (only the Torch) or Assassin's Blade (no supply). */
  private hitBoon(it: ItemPlay): Boon | null {
    if (this.has('dagger') && this.only(it, 'flare')) return 'dagger';
    if (this.has('assassin') && this.usedOn(it).size === 0) return 'assassin';
    return null;
  }

  /** What a right name on the open duel item hits the Seed for now, its boons with it. */
  hitNow(): number {
    const it = this.state.item;
    if (!it) return 0;
    const hit = this.duelHit(this.kindsUsed());
    return this.hitBoon(it) ? hit * this.state.tuning.boonHit : hit;
  }

  /** What a bare answer (no supply) hits the Seed for: Assassin's Blade doubles it. */
  bareHit(): number {
    const hit = this.duelHit(0);
    return this.has('assassin') ? hit * this.state.tuning.boonHit : hit;
  }

  /** A boon fires on an item, on its last submit. */
  private fire(it: ItemPlay, boon: Boon, n: number) {
    it.log.fired.push({ boon, n, submit: it.log.submits.length - 1 });
  }

  /** Heals up to `n`, never past the most life; returns what it healed. */
  private heal(n: number): number {
    const s = this.state;
    const h = Math.max(0, Math.min(n, s.maxLife - s.life));
    s.life += h;
    return h;
  }

  /** The boons of a right name, in a zone and at the duel alike: Honoured Challenger, Earned Honour, Sanguine Vial, Fright Mask. */
  private namedBoons(it: ItemPlay) {
    const s = this.state;
    const t = s.tuning;
    const used = this.usedOn(it);
    if (this.has('challenger') && this.only(it, 'lore')) this.fire(it, 'challenger', this.heal(t.challengerHeal));
    if (this.has('honour') && used.size === 2 && used.has('lore') && used.has('wisdom')) this.fire(it, 'honour', this.heal(t.honourHeal));
    if (this.has('vial') && this.only(it, 'category')) {
      const off = Math.max(0, Math.min(t.vialLife, s.foe.life - 1));
      s.foe.life -= off;
      this.fire(it, 'vial', off);
    }
    if (this.has('fright') && this.only(it, 'wisdom')) {
      s.foe.hit = Math.max(1, s.foe.hit - 1);
      this.fire(it, 'fright', s.foe.hit);
    }
  }

  /** The boon that would cover a miss of `cost` on an item now: Moment's Peace (a Torch and a Golden Page used), else Sekhema's Cloak (a Torch and an Ancient Orb used, the miss would end the run, once a run). */
  private coverOf(it: ItemPlay, cost: number): 'peace' | 'cloak' | null {
    const s = this.state;
    const used = this.usedOn(it);
    if (cost > 0 && this.has('peace') && used.has('flare') && used.has('lore')) return 'peace';
    if (s.life - cost <= 0 && this.has('cloak') && !s.spent.includes('cloak') && used.has('flare') && used.has('category')) return 'cloak';
    return null;
  }

  /** The life a miss on the open item would cost now, its boons applied (Moment's Peace or Sekhema's Cloak covering it: none). */
  missNow(): number {
    const it = this.state.item;
    if (!it) return 0;
    const cost = this.missCost();
    return this.coverOf(it, cost) ? 0 : Math.min(this.state.life, cost);
  }

  /**
   * A miss's life on the open item, its boons applied: Moment's Peace (a
   * Torch and a Golden Page used: no life), Sekhema's Cloak (a Torch and an
   * Ancient Orb used: a miss that would end the run leaves you at full life,
   * once). Returns the life lost.
   */
  private missBoons(it: ItemPlay, cost: number): number {
    const s = this.state;
    const cover = this.coverOf(it, cost);
    if (cover === 'peace') {
      this.fire(it, 'peace', cost);
      return 0;
    }
    if (cover === 'cloak') {
      s.spent.push('cloak');
      const back = s.maxLife - s.life;
      s.life = s.maxLife;
      this.fire(it, 'cloak', back);
      return 0;
    }
    const lost = Math.min(s.life, cost);
    s.life -= lost;
    return lost;
  }

  /** What a right name at the duel hits the Seed for, by how many kinds of supply were used on the item. */
  duelHit(kinds: number): number {
    const [none, one, more] = this.state.tuning.duelHit;
    return kinds <= 0 ? none : kinds === 1 ? one : more;
  }

  /** The kinds of supply used on the open item. */
  kindsUsed(): number {
    const it = this.state.item;
    return it ? new Set(it.log.supplies.map((u) => u.type)).size : 0;
  }

  /** How many of a supply the pack holds. */
  held(supply: Supply): number {
    return this.state.pack[supply];
  }

  /** Whether a boon is held. */
  has(boon: Boon): boolean {
    return this.state.boons.includes(boon);
  }

  /** A supply's price in this shop: Balbala's Gift makes the first Torch after a zone free; Silver Tongue halves (rounded up) the supplies the boons held name. */
  priceOf(supply: Supply): number {
    const s = this.state;
    const base = s.tuning.price[supply];
    if (supply === 'flare' && this.has('balbala') && s.vendor && s.freeTorch) return 0;
    if (this.has('silver') && namedBy(s.boons).has(supply)) return Math.ceil(base / 2);
    return base;
  }

  /** Whether one of a supply can be bought: in a shop, with the gold. */
  canBuy(supply: Supply): boolean {
    const s = this.state;
    return s.phase === 'vendor' && s.gold >= this.priceOf(supply);
  }

  /** The open item, while it can be played on (opened, not yet answered). */
  private live(): ItemPlay | null {
    const it = this.state.item;
    return this.state.phase === 'item' && it && it.openedAt !== null ? it : null;
  }

  /** How many patches a Torch burns in. */
  flareBurn(): number {
    return Math.max(1, this.state.tuning.torch);
  }

  /** Why a supply would do nothing on the open item: none open, armoured (before the first submit), or nothing left for it to show (the Ancient Orb with no sibling too). Null when it works. */
  idle(supply: Supply): 'closed' | 'armoured' | 'done' | null {
    const it = this.live();
    if (!it) return 'closed';
    if (it.mod === 'armoured' && !it.log.submits.length) return 'armoured';
    const c = CLUES[it.itemId];
    const done: Record<Supply, boolean> = {
      flare: !it.adjacency || it.burned.length >= it.patches,
      wisdom: it.shown.mods.length >= c.mods.length,
      lore: it.shown.flavor || !c.flavor,
      category: it.shown.category || !it.sibling,
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

  /** Buys one of a supply in a shop: its price out of the gold, one more in the pack (two Scrolls with Sacred Mirror). Buying ends Upward Path's streak. */
  buy(supply: Supply): boolean {
    if (!this.canBuy(supply)) return false;
    const s = this.state;
    const price = this.priceOf(supply);
    const n = supply === 'wisdom' && this.has('mirror') ? 2 : 1;
    s.gold -= price;
    s.log.goldSpent += price;
    s.pack[supply] += n;
    s.log.bought[supply] += n;
    if (supply === 'flare' && price === 0) s.freeTorch = false;
    s.streak = 0;
    const here = s.log.met.at(-1)!;
    here.spent += price;
    here.bought += n;
    return true;
  }

  /** Back to the map: out of a shop, or on from a zone's reveal. */
  leave(): boolean {
    const s = this.state;
    if (s.phase === 'solved' && s.item && !s.item.duel) this.logItem();
    else if (s.phase !== 'vendor') return false;
    s.vendor = null;
    s.phase = 'map';
    this.show('map');
    return true;
  }

  /** A town's first entry: its boon draft (the camp's: three singles), or straight to the shop when the hold is full or no card is left. */
  private openDraft(first: boolean) {
    const s = this.state;
    const cards = s.boons.length < HOLD ? dealDraft(s.boons, first, this.rng) : [];
    if (!cards.length) return this.toShop();
    // The order says nothing of why a card is there.
    s.draft = shuffle(cards, this.rng);
    s.vendor!.drafted = true;
    s.log.drafts.push({ node: s.at, offered: [...s.draft], took: null });
    s.phase = 'draft';
    this.show('draft');
  }

  /** On to the town's shop. */
  private toShop() {
    const s = this.state;
    s.draft = null;
    s.phase = 'vendor';
    this.show(s.vendor?.at === 'town' ? 'town' : 'camp');
  }

  /** Takes a boon from the draft (the other cards are gone), then the shop. */
  take(boon: Boon): boolean {
    const s = this.state;
    if (s.phase !== 'draft' || !s.draft?.includes(boon) || s.boons.length >= HOLD) return false;
    s.boons.push(boon);
    s.log.boons = [...s.boons];
    s.log.drafts.at(-1)!.took = boon;
    this.toShop();
    return true;
  }

  /** Passes on the draft: no boon, then the shop. */
  pass(): boolean {
    if (this.state.phase !== 'draft') return false;
    this.toShop();
    return true;
  }

  /**
   * Enters a place from the map (canEnter): a town heals on its first entry
   * (not after less recovery) and opens its shop; a zone opens its item at
   * once; the lair starts the duel.
   */
  enter(id: string): boolean {
    if (!this.canEnter(id)) return false;
    const s = this.state;
    const place = s.places[id];
    this.show(null);
    s.log.route.push(id);
    s.at = id;
    s.log.met.push({ node: id, kind: place.kind, healed: 0, noHeal: false, spent: 0, bought: 0 });
    if (place.kind === 'town' || place.kind === 'camp') {
      const first = !place.cleared;
      let heal = 0;
      let noHeal = false;
      if (place.kind === 'town' && first) {
        if (s.noHeal) {
          noHeal = true;
          s.noHeal = false;
        } else {
          heal = Math.min(s.tuning.townHeal, s.maxLife - s.life);
          s.life += heal;
        }
      }
      place.cleared = true;
      const met = s.log.met.at(-1)!;
      met.healed = heal;
      met.noHeal = noHeal;
      s.vendor = { at: place.kind === 'camp' ? 'camp' : 'town', heal, noHeal, first, drafted: false };
      if (first) this.openDraft(false);
      else this.toShop();
      return true;
    }
    if (place.kind === 'zone') s.freeTorch = true;
    if (place.kind === 'zone') this.draw({ duel: false, depth: this.depthAt(id), mod: this.modAt(id), corrupted: this.corrupted(id) });
    else this.draw({ duel: true, depth: null, mod: null, corrupted: false });
    return true;
  }

  /** On from a duel item answered: the next one. */
  next(): boolean {
    const s = this.state;
    if (s.phase !== 'solved' || !s.item?.duel) return false;
    this.logItem();
    this.draw({ duel: true, depth: null, mod: null, corrupted: false });
    return true;
  }

  /** Lays out an item: a zone's at its depth, the duel's from any depth, never one drawn before this run. It opens with open(). */
  private draw({ duel, depth, mod, corrupted }: { duel: boolean; depth: Depth | null; mod: Mod | null; corrupted: boolean }) {
    const s = this.state;
    const t = s.tuning;
    const node = this.node;
    const fresh = ITEMS.filter((it) => !this.drawn.has(it.id));
    const atDepth = depth ? fresh.filter((it) => depthOf(it.id) === depth) : fresh;
    const pool = atDepth.length ? atDepth : fresh;
    const answer = pool[Math.floor(this.rng() * pool.length)];
    const category = answer.category;
    this.drawn.add(answer.id);
    const words = SYLLABLES[answer.id];
    const answerTiles = words.flat();
    const board: Board = duel ? 'duel' : 'zone';
    const [lo, hi] = t.names[board];
    const names: Range = mod === 'monsters' ? [lo + 1, hi + 1] : [lo, hi];
    // The pool's total is rolled, not the decoys: the board's size says next to nothing of the answer's.
    const dealt = dealPool(answer, s.seed, t.tiles[board], names, this.drawn);
    const log: ItemLog = {
      itemId: answer.id,
      name: answer.name,
      category,
      node: node.id,
      duel,
      depth: depthOf(answer.id),
      mod,
      corrupted,
      tiles: { answer: [...answerTiles], decoys: [...dealt.decoys], names: dealt.names.map((d) => d.name) },
      sibling: dealt.sibling ? BY_ID.get(dealt.sibling)!.name : null,
      supplies: [],
      burnIns: [],
      patches: 0,
      submits: [],
      pack: { ...s.pack },
      lifeBefore: s.life,
      lifeAfter: s.life,
      misses: 0,
      gold: 0,
      spread: s.spread,
      duelLog: null,
      boons: [...s.boons],
      fired: [],
    };
    s.item = {
      n: s.done,
      node: node.id,
      duel,
      depth: depth ?? depthOf(answer.id),
      mod,
      category,
      itemId: answer.id,
      words,
      answer: answerTiles,
      decoys: dealt.decoys,
      tiles: dealt.tiles,
      sibling: dealt.sibling,
      marks: {},
      burned: [],
      patches: 0,
      adjacency: null,
      shown: { mods: [], flavor: false, category: false },
      build: [],
      lineMarks: null,
      misses: 0,
      openedAt: null,
      log,
    };
    s.phase = 'item';
  }

  /**
   * Opens the item laid out by draw(), once the page has cut its Veil:
   * `adjacency` lists, for each of its patches, the patches it touches. The
   * art starts all under the Veil, and the clock starts. At the duel the Seed
   * hits you as it opens (at 0 life the run is lost).
   */
  open(adjacency: number[][]): boolean {
    const s = this.state;
    const it = s.item;
    if (s.phase !== 'item' || !it || it.openedAt !== null || !adjacency.length) return false;
    it.adjacency = adjacency.map((nb) => nb.filter((j) => j >= 0 && j < adjacency.length));
    it.patches = adjacency.length;
    it.log.patches = it.patches;
    it.log.pack = { ...s.pack };
    it.openedAt = this.now();
    if (it.duel) {
      const took = Math.min(s.life, s.foe.hit);
      s.life -= took;
      it.log.lifeBefore = s.life + took;
      it.log.lifeAfter = s.life;
      it.log.duelLog = { seed: { ...s.foe }, you: { life: s.life, hit: this.bareHit() }, took, kinds: 0, dealt: 0 };
      if (s.life <= 0) {
        s.log.items.push(it.log);
        this.end(false);
      }
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
  private burnIn(it: ItemPlay, size: number): number[] {
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
    if (out.length) it.log.burnIns.push({ patches: out.length, ms: this.since(it) });
    return out;
  }

  /** Shows the next mod line, from the most common to the rarest; returns its place. */
  private nextLine(it: ItemPlay): number | undefined {
    const line = wisdomOrder(CLUES[it.itemId]).find((i) => !it.shown.mods.includes(i));
    if (line !== undefined) it.shown.mods.push(line);
    return line;
  }

  /** Uses one of a supply from the pack on the open item. */
  use(supply: Supply): boolean {
    if (!this.canUse(supply)) return false;
    const s = this.state;
    const it = s.item!;
    s.pack[supply]--;
    switch (supply) {
      case 'flare':
        this.burnIn(it, this.flareBurn());
        break;
      case 'wisdom':
        this.nextLine(it);
        break;
      case 'lore':
        it.shown.flavor = true;
        break;
      case 'category':
        it.shown.category = true;
        // A sibling shown by name is never a later answer, nor a decoy name.
        if (it.sibling) this.drawn.add(it.sibling);
        break;
    }
    it.log.supplies.push({ type: supply, order: it.log.supplies.length + 1, ms: this.since(it) });
    s.log.used[supply]++;
    return true;
  }

  /** After a wrong submit the marked line stands; the next change starts a fresh line. */
  private fresh(it: ItemPlay) {
    if (!it.lineMarks) return;
    it.build = [];
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

  /** Takes a placed tile (or a word gap) back off the line. */
  unplace(index: number): boolean {
    const it = this.live();
    if (!it || index < 0 || index >= it.build.length) return false;
    if (it.lineMarks) this.fresh(it);
    else it.build.splice(index, 1);
    return true;
  }

  /** Empties the line. */
  clear(): boolean {
    const it = this.live();
    if (!it || !it.build.length) return false;
    it.build = [];
    it.lineMarks = null;
    return true;
  }

  /**
   * Submits the line, its word gaps ignored. In a zone: right (its letters
   * are the answer's), the item is named, its gold paid and the corruption
   * spreads a ring (the Seed growing with it); wrong, life drops by the
   * miss's cost and the line is marked tile by tile, the board's tiles
   * keeping their best marks. At the duel, one submit an item: right hits
   * the Seed (at 0 the run is won at once), wrong costs the duel's miss and
   * shows the answer. At 0 life the run ends. Returns whether it was right,
   * or null if nothing could be submitted.
   */
  submit(): boolean | null {
    if (!this.canSubmit()) return null;
    const s = this.state;
    const t = s.tuning;
    const it = s.item!;
    const line = tilesOf(it.build);
    const breaks: number[] = [];
    let k = 0;
    for (const tile of it.build) tile === GAP ? breaks.push(k) : k++;
    const right = letters(line.join('')) === letters(it.log.name);
    const sub = { tiles: [...line], breaks, right, marks: [] as LineMark[], lost: 0, ms: this.since(it) };
    it.log.submits.push(sub);
    if (it.duel) return this.answerDuel(it, sub, right);
    if (right) {
      s.phase = 'solved';
      let gold = this.payGold();
      for (const g of this.goldBoons(it)) {
        gold += g.n;
        this.fire(it, g.boon, g.n);
      }
      // Upward Path's streak: on with no supply, ended by one.
      if (this.has('upward')) s.streak = this.usedOn(it).size ? 0 : s.streak + 1;
      s.gold += gold;
      s.log.goldEarned += gold;
      it.log.gold = gold;
      // The zone is cleared and the corruption spreads one ring (not under Hare Foot); the Seed grows with it.
      s.places[it.node].cleared = true;
      if (it.mod === 'recovery') s.noHeal = true;
      if (this.has('hare') && this.only(it, 'category')) this.fire(it, 'hare', s.spread);
      else {
        s.spread++;
        s.foe.life += t.seedGrowth;
        if (s.spread % Math.max(1, t.seedHitEvery) === 0) s.foe.hit++;
      }
      this.namedBoons(it);
      it.log.lifeAfter = s.life;
      it.log.spread = s.spread;
      s.log.spread = s.spread;
      s.log.seedEnd = { ...s.foe };
      this.show('reveal');
      return true;
    }
    const marks = markLine(line, it.answer);
    const goldOnly = t.marks === 'gold';
    sub.marks = marks.map((m) => (goldOnly && m !== 'gold' ? 'none' : m));
    let j = 0;
    it.lineMarks = it.build.map((tile) => (tile === GAP ? 'none' : sub.marks[j++]));
    line.forEach((tile, i) => {
      const m = sub.marks[i];
      if (m === 'none') return;
      const was = it.marks[tile];
      if (!was || RANK[m] > RANK[was]) it.marks[tile] = m;
    });
    it.misses++;
    it.log.misses = it.misses;
    s.log.misses++;
    sub.lost = this.missBoons(it, this.missCost());
    it.log.lifeAfter = s.life;
    if (s.life <= 0) {
      s.log.items.push(it.log);
      this.end(false);
    }
    return false;
  }

  /** A duel item's one submit: right hits the Seed by the kinds of supply used, wrong costs life; either way it's answered. */
  private answerDuel(it: ItemPlay, sub: ItemLog['submits'][number], right: boolean): boolean {
    const s = this.state;
    const kinds = this.kindsUsed();
    const duel = it.log.duelLog ?? { seed: { ...s.foe }, you: { life: s.life, hit: this.bareHit() }, took: 0, kinds: 0, dealt: 0 };
    duel.kinds = kinds;
    if (right) {
      this.namedBoons(it);
      const full = this.hitNow();
      const boon = this.hitBoon(it);
      if (boon) this.fire(it, boon, full);
      const hit = Math.min(s.foe.life, full);
      s.foe.life -= hit;
      duel.dealt = hit;
    } else {
      it.misses++;
      it.log.misses = it.misses;
      s.log.misses++;
      sub.marks = markLine(sub.tiles, it.answer);
      sub.lost = this.missBoons(it, s.tuning.duelMiss);
    }
    it.log.duelLog = duel;
    it.log.lifeAfter = s.life;
    s.log.seedEnd = { ...s.foe };
    if (s.foe.life <= 0 || s.life <= 0) {
      s.log.items.push(it.log);
      this.end(s.foe.life <= 0);
      return right;
    }
    s.phase = 'solved';
    this.show('reveal');
    return right;
  }

  /** The answered item done, as its reveal is left: logged, and off the screen. */
  private logItem() {
    const s = this.state;
    const it = s.item!;
    this.show(null);
    it.log.lifeAfter = s.life;
    s.log.items.push(it.log);
    s.done++;
    s.item = null;
  }

  /** The run ends: won when the Seed falls, lost at 0 life (on the item still open). */
  private end(won: boolean) {
    const s = this.state;
    this.show(null);
    const last = s.log.items.at(-1);
    s.log.end = new Date(this.now()).toISOString();
    s.log.ms = Math.max(0, this.now() - Date.parse(s.log.start));
    s.log.result = won ? 'win' : 'loss';
    s.log.endedOn = last ? { n: s.log.items.length - 1, itemId: last.itemId, name: last.name, node: last.node } : null;
    s.log.lifeEnd = s.life;
    s.log.seedEnd = { ...s.foe };
    s.item = null;
    s.phase = 'end';
  }
}


// ---- Reading an item ----

/** An item by its id. */
export const itemOf = (id: string) => BY_ID.get(id)!;

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
