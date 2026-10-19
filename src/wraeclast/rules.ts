// The Wraeclast run's rules (wraeclast.html, src/wraeclast): a solo run across
// the map (map.ts) from the camp to the boss, the mode's prototype (v5 in the
// making: v4e with what v5 drops taken out, still on v4e's linear route).
// Pure: the run's state is a plain object (the page makes it reactive), every
// action a method that changes it, so a run plays the same in a test as on
// the page.
//
// A run: the camp (a vendor), then a node at a time along the paths ahead:
// zones (one item each), towns (healed, a vendor again) and at the end the
// boss's items. Each item: its name built from tiles (the Inscription: the
// answer's tiles among those of a few look-alike names and loose decoys), its
// art all under the Veil, and the supplies from the pack. A miss costs life
// and marks the line as Wordle does; a zone's item named pays its gold.
// docs/wraeclast (the prototype's handoffs, on the orchestrator's branch) has
// the reasons.

import { shuffle, type Item } from '../lib/game.ts';
import { seededRandom } from '../lib/patches.ts';
import { readLooks, type LooksData } from '../lib/looks.ts';
import itemData from '../data/items.json' with { type: 'json' };
import syllableData from '../data/syllables.json' with { type: 'json' };
import looksData from '../data/looks.json' with { type: 'json' };
import clueData from '../data/clues.json' with { type: 'json' };
import { GRAPH, rollPlaces, type MapGraph, type MapNode, type Place } from './map.ts';

export type { Place, MapNode } from './map.ts';

/** The supplies, by their working keys (the log's): flare is the Torch, lore the Golden Page, category the Ancient Orb, wisdom the Scroll of Wisdom. */
export type Supply = 'flare' | 'lore' | 'category' | 'wisdom';
export const SUPPLIES: readonly Supply[] = ['flare', 'lore', 'category', 'wisdom'];
export const SUPPLY_NAMES: Record<Supply, string> = {
  flare: 'Torch',
  lore: 'Golden Page',
  category: 'Ancient Orb',
  wisdom: 'Scroll of Wisdom',
};

/** Where a node's step puts it, for its board, miss costs and gold. */
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
  /** Life a town heals. */
  townHeal: number;
  /** The tiles a pool holds (the answer's, the decoy names' and the loose decoys), by section: each item rolls its own within TILE_SPREAD of it. */
  tiles: Record<Section, number>;
  /** How many decoy names a board holds, by section: rolled for each item, never shown. */
  names: Record<Section, Range>;
  /** A miss's cost, a random whole number in the range, by section. */
  missCost: Record<Section, Range>;
  /** Each supply's price, one at a time. */
  price: Record<Supply, number>;
  /** Patches a Torch burns in. */
  torch: number;
  /** The Veil's seeds across the art (about this many a side). */
  seeds: number;
  /** The gold a zone's item pays when named, by section (v4e's old ranges, until v5's depth pay). */
  pay: Record<'early' | 'mid' | 'late', Range>;
  /** Gold and silver marks, or gold only. */
  marks: 'both' | 'gold';
}

/** v4e's numbers with what v5 drops taken out; the v5 handoff's prices (docs/wraeclast/prototype-v5-handoff.md). */
export const DEFAULT_TUNING: Tuning = {
  life: 100,
  gold: 40,
  townHeal: 10,
  tiles: { early: 14, mid: 20, late: 26, boss: 32 },
  names: { early: [1, 2], mid: [2, 3], late: [3, 4], boss: [4, 5] },
  missCost: { early: [30, 40], mid: [40, 50], late: [50, 60], boss: [65, 75] },
  price: { flare: 10, lore: 8, category: 8, wisdom: 8 },
  torch: 12,
  seeds: 9,
  // Late zones pay no gold: past the last town it buys nothing.
  pay: { early: [5, 7], mid: [6, 8], late: [0, 0] },
  marks: 'both',
};

export const BOSS_ITEMS = 3;
/** The most tiles a pool holds, the answer's included. */
export const MAX_TILES = 36;
/** How far an item's pool total strays from its section's, either way, so the total never gives the answer's tile count away. */
export const TILE_SPREAD = 3;
/** The fewest decoys a pool holds besides of, the, and and the possessives (the decoy names' tiles counting). */
export const MIN_DECOYS = 5;
/** Loose decoys are drawn at random from the best this many look-alikes. */
export const DECOY_POOL = 30;
/** Words that stay whole tiles, on every board. */
export const SMALL_WORDS: readonly string[] = ['of', 'the', 'and'];
/** Possessive tiles on every board, the answer's and the decoy names' counting toward them: a gem's name nearly always has one, so every board shows a few. */
export const POSSESSIVES: Range = [2, 3];
/** A possessive tile ("ahn's", "tus'"). */
export const isPossessive = (tile: string) => /('s|s')$/.test(tile);
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

/**
 * vendor: the camp's or a town's (the next place picked from it). item: an
 * item open. solved: named, its gold paid, then the next item or, a zone's
 * last, the next place.
 */
export type Phase = 'vendor' | 'item' | 'solved' | 'end';

/** A screen between items, as the log times it: a vendor (the camp's, a town's), or a named item's reveal. */
export type Screen = 'camp' | 'town' | 'reveal';

/** The pack: how many of each supply, no stacks, no cap. */
export type Pack = Record<Supply, number>;

export interface ItemLog {
  itemId: string;
  name: string;
  category: string;
  step: number;
  node: string;
  boss: boolean;
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
  /** The gold it paid when named (0 at the boss). */
  gold: number;
}

export interface ItemPlay {
  /** Its place in the run, from 0. */
  n: number;
  step: number;
  node: string;
  /** Which of the boss's items (from 0), or null before the boss. */
  boss: number | null;
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

/** The node being played: how many items it holds, and how many are done. */
export interface Visit {
  node: string;
  items: number;
  done: number;
}

export interface RunLog {
  v: 5;
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
  /** Each travel step: the nodes offered (what each was) and the one picked. */
  travel: { offered: string[]; picked: string; options: { node: string; kind: Place['kind'] }[] }[];
  /** Each place arrived at, the camp first: a town's heal, and the gold spent and supplies bought there. */
  met: { node: string; kind: Place['kind']; healed: number; spent: number; bought: number }[];
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

export interface RunState {
  seed: number;
  tuning: Tuning;
  /** What each node is this run. */
  places: Record<string, Place>;
  /** The node the player is at. */
  at: string;
  /** Steps taken from the camp. */
  steps: number;
  phase: Phase;
  /** At a vendor: where, and the town's heal on arrival. */
  vendor: { at: 'camp' | 'town'; heal: number } | null;
  life: number;
  maxLife: number;
  gold: number;
  pack: Pack;
  /** Items done. */
  done: number;
  visit: Visit | null;
  item: ItemPlay | null;
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
  const nearItems = nearOf(answer);
  const rest = wideOf(answer);
  const usable = (items: Item[]) =>
    items
      .filter((it) => letters(it.name) !== letters(answer.name) && SYLLABLES[it.id])
      .map((it) => ({ name: it.name, tiles: SYLLABLES[it.id].flat() }))
      .filter((d) => !sameSet(d.tiles));
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
 * `names` decoy names (rolled, never shown), real items: never the Ancient
 * Orb's sibling, whose tiles stay off the board. Each decoy name is a
 * look-alike of a name already on the board, picked at random (the answer
 * half as often), so the names look like each other and not only like the
 * answer; and the fewer look-alike lists a name sits in, the likelier it is
 * picked, so a name seldom seen as a decoy says nothing either.
 * Loose decoys (length-matched) fill the rest of the total, rolled within
 * TILE_SPREAD of the section's `size`; the decoys besides of, the, and and
 * the possessives are at least MIN_DECOYS.
 * On top, every board holds of, the and and, and POSSESSIVES possessive
 * tiles in all (the names' counting). Where the names don't fit the total it
 * grows, up to MAX_TILES: the cap trims the loose decoys first, and a name
 * that would pass it is never dealt.
 */
export function dealPool(answer: Item, seed: number, size: number, names: Range = [0, 0]): Pool {
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
    this.state = {
      seed,
      tuning: t,
      places: rollPlaces(graph),
      at: graph.camp.id,
      steps: 0,
      phase: 'vendor',
      vendor: { at: 'camp', heal: 0 },
      life: t.life,
      maxLife: t.life,
      gold: t.gold,
      pack: count(SUPPLIES),
      done: 0,
      visit: null,
      item: null,
      log: {
        v: 5,
        seed,
        start: new Date(now()).toISOString(),
        end: null,
        ms: 0,
        result: null,
        endedOn: null,
        route: [graph.camp.id],
        travel: [],
        met: [{ node: graph.camp.id, kind: 'camp', healed: 0, spent: 0, bought: 0 }],
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
    this.show('camp');
  }

  // ---- What's where ----

  /** The node the player is at. */
  get node(): MapNode {
    return this.graph.byId.get(this.state.at)!;
  }

  /** The nodes the player can travel to now (from a vendor, or on a zone's reveal), else none. */
  options(): string[] {
    return this.state.phase === 'vendor' || this.leaving() ? this.graph.next[this.state.at] : [];
  }

  /** Whether the named item is a zone's last, and the next place is picked from its reveal. */
  leaving(): boolean {
    const s = this.state;
    const v = s.visit;
    return s.phase === 'solved' && !!v && v.done + 1 >= v.items && s.places[s.at].kind === 'zone';
  }

  /** On a named item's reveal: whether next() goes on, and to what (the boss's next item, the win). */
  ahead(): 'item' | 'win' | null {
    const s = this.state;
    const v = s.visit;
    if (s.phase !== 'solved' || !v) return null;
    if (v.done + 1 < v.items) return 'item';
    return s.places[s.at].kind === 'boss' ? 'win' : null;
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
    const [lo, hi] = this.state.tuning.missCost[this.section()];
    return [lo, hi];
  }

  /** The gold the open item (or a zone at the node ahead) pays when named, as a range; nothing at the boss. */
  payRange(): Range {
    const sec = this.section();
    if (sec === 'boss') return [0, 0];
    const [lo, hi] = this.state.tuning.pay[sec];
    return [lo, hi];
  }

  /** How many of a supply the pack holds. */
  held(supply: Supply): number {
    return this.state.pack[supply];
  }

  /** Whether one of a supply can be bought: at a vendor, with the gold. */
  canBuy(supply: Supply): boolean {
    const s = this.state;
    return s.phase === 'vendor' && s.gold >= s.tuning.price[supply];
  }

  /** The open item, while it can be played on (opened, not yet named). */
  private live(): ItemPlay | null {
    const it = this.state.item;
    return this.state.phase === 'item' && it && it.openedAt !== null ? it : null;
  }

  /** How many patches a Torch burns in. */
  flareBurn(): number {
    return Math.max(1, this.state.tuning.torch);
  }

  /** Why a supply would do nothing on the open item: none open, or nothing left for it to show (the Ancient Orb with no sibling too). Null when it works. */
  idle(supply: Supply): 'closed' | 'done' | null {
    const it = this.live();
    if (!it) return 'closed';
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

  /** Buys one of a supply at a vendor: its price out of the gold, one more in the pack. */
  buy(supply: Supply): boolean {
    if (!this.canBuy(supply)) return false;
    const s = this.state;
    const price = s.tuning.price[supply];
    s.gold -= price;
    s.log.goldSpent += price;
    s.pack[supply]++;
    s.log.bought[supply]++;
    const here = s.log.met.at(-1)!;
    here.spent += price;
    here.bought++;
    return true;
  }

  /**
   * Travels to a node linked ahead (from a vendor, or from a zone's reveal),
   * and arrives there: a town heals and opens its vendor, a zone or the boss
   * opens its first item at once.
   */
  choose(id: string): boolean {
    const s = this.state;
    const offered = this.options();
    if (!offered.includes(id)) return false;
    if (s.phase === 'solved') this.logItem();
    s.vendor = null;
    s.visit = null;
    this.show(null);
    s.log.travel.push({ offered: [...offered], picked: id, options: offered.map((o) => ({ node: o, kind: s.places[o].kind })) });
    s.log.route.push(id);
    s.at = id;
    s.steps++;
    const place = s.places[id];
    s.log.met.push({ node: id, kind: place.kind, healed: 0, spent: 0, bought: 0 });
    if (place.kind === 'town') {
      const heal = Math.min(s.tuning.townHeal, s.maxLife - s.life);
      s.life += heal;
      s.log.met.at(-1)!.healed = heal;
      s.vendor = { at: 'town', heal };
      s.phase = 'vendor';
      this.show('town');
    } else {
      s.visit = { node: id, items: place.kind === 'boss' ? BOSS_ITEMS : 1, done: 0 };
      this.draw();
    }
    return true;
  }

  /** On from a named item's reveal (ahead()): the boss's next item, or the win. */
  next(): boolean {
    const to = this.ahead();
    if (!to) return false;
    this.logItem();
    if (to === 'item') this.draw();
    else this.end(true);
    return true;
  }

  /** Lays out the next item of the visit: any item not drawn before this run, at random (never by place or category). It opens with open(). */
  private draw() {
    const s = this.state;
    const t = s.tuning;
    const node = this.node;
    const boss = s.places[node.id].kind === 'boss' ? s.visit!.done : null;
    const fresh = ITEMS.filter((it) => !this.drawn.has(it.id));
    const answer = fresh[Math.floor(this.rng() * fresh.length)];
    const category = answer.category;
    this.drawn.add(answer.id);
    const words = SYLLABLES[answer.id];
    const answerTiles = words.flat();
    const sec = this.sectionAt(node.step, boss !== null);
    // The pool's total is rolled, not the decoys: the board's size says next to nothing of the answer's.
    const pool = dealPool(answer, s.seed, t.tiles[sec], t.names[sec]);
    const log: ItemLog = {
      itemId: answer.id,
      name: answer.name,
      category,
      step: node.step,
      node: node.id,
      boss: boss !== null,
      tiles: { answer: [...answerTiles], decoys: [...pool.decoys], names: pool.names.map((d) => d.name) },
      sibling: pool.sibling ? BY_ID.get(pool.sibling)!.name : null,
      supplies: [],
      burnIns: [],
      patches: 0,
      submits: [],
      pack: { ...s.pack },
      lifeBefore: s.life,
      lifeAfter: s.life,
      misses: 0,
      gold: 0,
    };
    s.item = {
      n: s.done,
      step: node.step,
      node: node.id,
      boss,
      category,
      itemId: answer.id,
      words,
      answer: answerTiles,
      decoys: pool.decoys,
      tiles: pool.tiles,
      sibling: pool.sibling,
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
   * art starts all under the Veil, and the clock starts.
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
   * Submits the line, its word gaps ignored. Right (its letters are the
   * answer's): the item is named, and a zone's pays its gold at once. Wrong:
   * life drops by a random miss cost, and the line is marked tile by tile,
   * the board's tiles keeping their best marks. At 0 life the run ends.
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
      it.log.lifeAfter = s.life;
      s.phase = 'solved';
      if (it.boss === null) {
        const gold = between(this.payRange(), this.rng);
        s.gold += gold;
        s.log.goldEarned += gold;
        it.log.gold = gold;
      }
      this.show('reveal');
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

  /** The named item done, as its reveal is left: logged, and off the screen. */
  private logItem() {
    const s = this.state;
    const it = s.item!;
    this.show(null);
    it.log.lifeAfter = s.life;
    s.log.items.push(it.log);
    s.done++;
    s.item = null;
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
    s.visit = null;
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
