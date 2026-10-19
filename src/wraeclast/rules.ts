// The Wraeclast run's rules (wraeclast.html, src/wraeclast): a solo run across
// the map (map.ts) from the camp to the boss, the mode's prototype (v3, after
// the second playtest). Pure: the run's state is a plain object (the page
// makes it reactive), every action a method that changes it, so a run plays
// the same in a test as on the page.
//
// A run: the camp (a vendor), then a node at a time along the paths ahead:
// zones (items under the zone's type), Wells (the flask refilled), towns
// (healed, a vendor again) and at the end the boss's items under the Silent
// rule (only Flares work), with a modifier for each corruption front still
// alive. Each item: its name built from tiles (the Inscription: the answer's
// tiles among decoys), its art under the Veil (burned in a cluster at a
// time), the zone's free clue and supplies from the pack. A miss costs life
// and marks the line as Wordle does; a right answer deals loot, all of it
// taken. docs/handoff/wraeclast (the prototype's handoffs) has the reasons.

import { shuffle, type Item } from '../lib/game.ts';
import { seededRandom } from '../lib/patches.ts';
import itemData from '../data/items.json' with { type: 'json' };
import syllableData from '../data/syllables.json' with { type: 'json' };
import clueData from '../data/clues.json' with { type: 'json' };
import {
  GRAPH,
  creep,
  rollBossMods,
  rollPlaces,
  seedFronts,
  weighted,
  type BossMod,
  type Corrupt,
  type Front,
  type Hidden,
  type MapNode,
  type Place,
  type ZoneType,
} from './map.ts';

export { ZONE_TYPES, ZONE_NAMES, HIDDEN, HIDDEN_NAMES, BOSS_MODS, BOSS_MOD_NAMES } from './map.ts';
export type { ZoneType, Hidden, BossMod, Place, MapNode } from './map.ts';

export type Supply = 'flare' | 'wisdom' | 'lore' | 'category' | 'base' | 'decoy' | 'lengths' | 'first';
export const SUPPLIES: readonly Supply[] = ['flare', 'wisdom', 'lore', 'category', 'base', 'decoy', 'lengths', 'first'];
export const SUPPLY_NAMES: Record<Supply, string> = {
  flare: 'Flare',
  wisdom: 'Scroll of Wisdom',
  lore: 'Lore reveal',
  category: 'Category reveal',
  base: 'Base reveal',
  decoy: 'Decoy sweep',
  lengths: 'Word lengths',
  first: 'First syllable',
};

export type LootKind = 'gold' | 'supply' | 'flask' | 'jackpot';
export const LOOT_KINDS: readonly LootKind[] = ['gold', 'supply', 'flask', 'jackpot'];

/** Where a node's step puts it, for its decoys, miss costs and gold. */
export type Section = 'early' | 'mid' | 'late' | 'boss';
export const SECTIONS: readonly Section[] = ['early', 'mid', 'late', 'boss'];
export type Range = [number, number];

/** A tile's mark after a wrong submit: the right tile in the right place, in the answer elsewhere, or not in it. */
export type Mark = 'gold' | 'silver' | 'struck';
/** A placed tile's mark on the line; "none" where only gold is marked (tuning). */
export type LineMark = Mark | 'none';

export interface Tuning {
  life: number;
  gold: number;
  /** Flask charges. */
  flask: number;
  /** Items in a zone (1 to 3, for shorter test runs). */
  itemsPerZone: number;
  /** The share of open nodes that become zones (the rest Wells), percent. */
  zoneShare: number;
  /** The tiles a pool holds in all (the answer's and the decoys), by section: each item rolls its own within TILE_SPREAD of it. */
  tiles: Record<Section, number>;
  /** A miss's cost, a random whole number in the range, by section. */
  missCost: Record<Section, Range>;
  price: Record<Supply, number>;
  /** How many of each supply one card from the vendor holds. */
  stack: Record<Supply, number>;
  /** Patches a Flare burns in, and a free burn-in (Blight). */
  burnIn: { flare: number; blight: number; boss: number };
  /** The Veil's seeds across the art (about this many a side). */
  seeds: number;
  loot: {
    /** Loot cards a right answer deals, by zone type. */
    cards: Record<ZoneType, number>;
    weights: Record<LootKind, number>;
    gold: Record<'early' | 'mid' | 'late', Range>;
    jackpot: number;
    /** How many of its supply a supply card holds. */
    supplies: number;
  };
  corruption: {
    /** Fronts seeded at the start (0 to 5). */
    seeds: number;
    /** Every how many steps the player takes the fronts creep (1 to 3). */
    creep: number;
    weights: Record<Hidden, number>;
    /** How many times its loot cards a corrupted zone deals. */
    multiplier: number;
  };
  /** Gold and silver marks, or gold only. */
  marks: 'both' | 'gold';
  freeClue: Record<ZoneType, boolean>;
}

/** The handoff's numbers (docs/handoff/wraeclast/v3.md). */
export const DEFAULT_TUNING: Tuning = {
  life: 100,
  gold: 20,
  flask: 2,
  itemsPerZone: 3,
  zoneShare: 83,
  tiles: { early: 14, mid: 20, late: 26, boss: 32 },
  missCost: { early: [20, 30], mid: [30, 40], late: [40, 50], boss: [55, 65] },
  price: { flare: 6, wisdom: 6, lore: 6, category: 6, base: 6, decoy: 6, lengths: 4, first: 6 },
  stack: { flare: 3, wisdom: 3, lore: 2, category: 2, base: 1, decoy: 3, lengths: 3, first: 2 },
  burnIn: { flare: 12, blight: 4, boss: 4 },
  seeds: 9,
  loot: {
    cards: { plain: 2, incursion: 2, essence: 1, ritual: 2, expedition: 1, blight: 2 },
    weights: { gold: 10, supply: 8, flask: 2, jackpot: 1 },
    gold: { early: [4, 8], mid: [6, 10], late: [8, 12] },
    jackpot: 25,
    supplies: 2,
  },
  corruption: {
    seeds: 3,
    creep: 2,
    weights: { blood: 2, sealed: 2, swarming: 2, dark: 2, bounty: 1 },
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
/** Decoys a Blight zone, a Swarming corruption and a Teeming boss add. */
export const BLIGHT_DECOYS = 6;
export const SWARMING_DECOYS = 8;
export const TEEMING_DECOYS = 8;
/** The most tiles a pool holds, the answer's included. */
export const MAX_TILES = 36;
/** How far an item's pool total strays from its section's, either way, so the total never gives the answer's tile count away. */
export const TILE_SPREAD = 3;
/** The fewest decoys a pool holds (before Blight, Swarming and Teeming add theirs). */
export const MIN_DECOYS = 5;
/** Decoys are drawn at random from the best this many look-alikes. */
export const DECOY_POOL = 30;
/** Decoys one Decoy sweep strikes. */
export const DECOY_SWEEP = 4;
/** Life a Blood toll takes as each item opens; misses a Bloodied boss costs more. */
export const BLOOD_TOLL = 10;
export const BLOODIED = 10;
/** Words that stay whole tiles. */
export const SMALL_WORDS: readonly string[] = ['of', 'the', 'and'];
/** Possessive tiles on every board, the answer's own counting toward them: a gem's name nearly always has one, so every board shows a few. */
export const POSSESSIVES: Range = [2, 3];
/** A possessive tile ("ahn's", "tus'"). */
export const isPossessive = (tile: string) => /('s|s')$/.test(tile);
/** A mod line shared by this many items or more is common: the only kind a zone gives free (a rarer line gives its item away). */
export const COMMON = 3;

/** A mod line: its kind (the tooltip section), its text (name words masked), and how many items share it. */
export type ModLine = [string, string, number];
export type Clues = { category: string; base: string; mods: ModLine[]; flavor: string | null; support: string | null };
export const ITEMS = itemData as Item[];
export const SYLLABLES = syllableData as Record<string, string[][]>;
export const CLUES = clueData as unknown as Record<string, Clues>;
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

/** What a zone gave for free when an item opened. */
export type FreeClue = 'none' | 'mod' | 'flavor' | 'base' | 'lengths' | 'burn';

export type Phase = 'vendor' | 'map' | 'well' | 'zone' | 'item' | 'solved' | 'loot' | 'end';

/** A stack in the pack. */
export interface Stack {
  supply: Supply;
  n: number;
}

/** A loot card: what it gives. */
export interface LootCard {
  kind: LootKind;
  /** Gold for gold and the jackpot, else 0. */
  gold: number;
  /** The supply on a supply card, and how many, else null and 0. */
  supply: Supply | null;
  n: number;
}

export type BurnBy = 'zone' | 'flare';

export interface ItemLog {
  itemId: string;
  name: string;
  category: string;
  step: number;
  node: string;
  zoneType: ZoneType | 'boss';
  /** The zone's hidden modifier, or null. */
  corruption: Hidden | null;
  boss: boolean;
  tiles: { answer: string[]; decoys: string[] };
  freeClue: FreeClue;
  supplies: { type: Supply; order: number; ms: number }[];
  /** Each burn-in: what made it, how many patches it took, when (ms after the item opened). */
  burnIns: { by: BurnBy; patches: number; ms: number }[];
  /** The Veil's patches, as the page cut it. */
  patches: number;
  /** Each submit: the tiles placed, right or not, the line's marks, the life a miss cost, when. */
  submits: { tiles: string[]; right: boolean; marks: LineMark[]; lost: number; ms: number }[];
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
  /** The zone's hidden modifier, while it's corrupted. */
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
  /** Each board tile's best mark so far. */
  marks: Record<string, Mark>;
  /** Decoys a Decoy sweep struck. */
  swept: string[];
  /** The Veil's patches burned in, in the order they burned. */
  burned: number[];
  /** The Veil's patches (the page's cut), 0 until the item opens. */
  patches: number;
  /** Which patches touch which (the page's cut), null until the item opens. */
  adjacency: number[][] | null;
  /** The clues shown: mod lines (in the order shown, by their place in the tooltip), and which reveals. */
  shown: { mods: number[]; flavor: boolean; lengths: boolean; category: boolean; base: boolean };
  freeClue: FreeClue;
  /** The tiles placed on the answer line, in order. */
  build: string[];
  /** The last wrong submit's marks while its line stands, else null. */
  lineMarks: LineMark[] | null;
  /** How many tiles at the start of the line are locked (First syllable). */
  locked: number;
  misses: number;
  /** When it opened (its Veil cut), or null while it's being laid out. */
  openedAt: number | null;
  log: ItemLog;
}

/** The loot deal after a right answer: every card taken at once; a supply that doesn't fit waits for keep(). */
export interface LootDeal {
  cards: LootCard[];
  collected: boolean;
  pending: LootCard[];
}

/** The node being played: how many items it holds, and how many are done. */
export interface Visit {
  node: string;
  items: number;
  done: number;
}

export interface RunLog {
  v: 3;
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
  /** Each travel step: the nodes offered and the one picked. */
  travel: { offered: string[]; picked: string }[];
  /** Each node arrived at: what it was, and its corruption. */
  met: { node: string; kind: Place['kind']; zoneType: ZoneType | null; corruption: Hidden | null }[];
  fronts: { seeded: number; stopped: number; aliveAtBoss: number | null };
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
  /** Corrupted nodes, by id. */
  corrupt: Record<string, Corrupt>;
  fronts: Front[];
  /** The node the player is at. */
  at: string;
  /** Steps taken from the camp. */
  steps: number;
  /** The step count the fronts last crept at. */
  crept: number;
  /** The boss's modifiers, rolled as the player reaches it. */
  bossMods: BossMod[];
  phase: Phase;
  /** At a vendor: where (an Expedition deals after its zone), and the town's heal on arrival. */
  vendor: { at: 'camp' | 'town' | 'expedition'; heal: number } | null;
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

/** The section a step puts an item in. */
export const sectionOf = (step: number, boss: boolean): Section => (boss ? 'boss' : step <= 5 ? 'early' : step <= 10 ? 'mid' : 'late');

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

/** How alike a decoy tile looks to the answer's: shared letters with its nearest tile, less half the length gap. */
function likeness(tile: string, answer: string[]) {
  let best = -Infinity;
  for (const a of answer) {
    const pool = [...a];
    let shared = 0;
    for (const ch of tile) {
      const k = pool.indexOf(ch);
      if (k >= 0) shared++, pool.splice(k, 1);
    }
    best = Math.max(best, shared - Math.abs(tile.length - a.length) / 2);
  }
  return best;
}

/** Every tile of every name. */
let allTiles: string[] | null = null;

/**
 * `k` decoy tiles for an item: drawn at random from the DECOY_POOL tiles of
 * any name (all categories alike) that look most like the answer's, among
 * those `fit` allows. Never a tile the answer has, or one in `not`.
 */
function pickDecoys(own: Set<string>, k: number, rng: () => number, fit: (t: string) => boolean, not: ReadonlySet<string> = new Set()): string[] {
  if (k <= 0) return [];
  allTiles ??= [...new Set(ITEMS.flatMap((it) => SYLLABLES[it.id].flat()))];
  const answer = [...own];
  const ranked = allTiles
    .filter((t) => !own.has(t) && !not.has(t) && fit(t))
    .map((t) => ({ t, like: likeness(t, answer), tie: rng() }))
    .sort((a, b) => b.like - a.like || a.tie - b.tie)
    .map((x) => x.t);
  return shuffle(ranked.slice(0, Math.max(DECOY_POOL, k)), rng).slice(0, k);
}

/** An item's own seed in a run: its pool is the same however often it is dealt. */
export function itemSeed(seed: number, itemId: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < itemId.length; i++) h = Math.imul(h ^ itemId.charCodeAt(i), 2654435761) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * An item's pool, from its own seed: the total rolled within TILE_SPREAD of
 * the section's `size`, at least MIN_DECOYS decoys, `extra` more (Blight,
 * Swarming, Teeming), at most MAX_TILES. Every board holds of, the and and,
 * and POSSESSIVES possessive tiles in all (the answer's counting); the cap
 * trims the ordinary decoys only.
 */
export function dealPool(answer: Item, seed: number, size: number, extra: number): { decoys: string[]; tiles: string[] } {
  const rng = seededRandom(itemSeed(seed, answer.id));
  const own = new Set(SYLLABLES[answer.id].flat());
  const total = size - TILE_SPREAD + Math.floor(rng() * (2 * TILE_SPREAD + 1));
  const small = SMALL_WORDS.filter((w) => !own.has(w));
  const ownPossessive = [...own].filter(isPossessive).length;
  const possessive = pickDecoys(own, between(POSSESSIVES, rng) - ownPossessive, rng, isPossessive);
  const signature = [...small, ...possessive];
  const room = Math.max(0, MAX_TILES - own.size - signature.length);
  const k = Math.min(room, Math.max(0, Math.max(MIN_DECOYS, total - own.size) + extra - signature.length));
  const ordinary = pickDecoys(own, k, rng, (t) => !isPossessive(t), new Set(SMALL_WORDS));
  const decoys = [...signature, ...ordinary];
  return { decoys, tiles: shuffle([...own, ...decoys], rng) };
}

export interface RunOptions {
  tuning?: Tuning;
  seed?: number;
  now?: () => number;
  /** The device's viewport width, for the log. */
  viewport?: number;
}

export class Run {
  state: RunState;
  private readonly rng: () => number;
  private readonly now: () => number;
  /** Items drawn so far: none comes up twice. */
  private readonly drawn = new Set<string>();

  constructor({ tuning = DEFAULT_TUNING, seed = Math.floor(Math.random() * 2 ** 32), now = Date.now, viewport = 0 }: RunOptions = {}) {
    this.rng = seededRandom(seed);
    this.now = now;
    const t: Tuning = structuredClone(tuning);
    const places = rollPlaces(GRAPH, t.zoneShare, this.rng);
    const { corrupt, fronts } = seedFronts(GRAPH, places, t.corruption.seeds, t.corruption.weights, this.rng);
    this.state = {
      seed,
      tuning: t,
      places,
      corrupt,
      fronts,
      at: GRAPH.camp.id,
      steps: 0,
      crept: 0,
      bossMods: [],
      phase: 'vendor',
      vendor: { at: 'camp', heal: 0 },
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
        v: 3,
        seed,
        start: new Date(now()).toISOString(),
        end: null,
        ms: 0,
        result: null,
        endedOn: null,
        route: [GRAPH.camp.id],
        travel: [],
        met: [],
        fronts: { seeded: fronts.length, stopped: 0, aliveAtBoss: null },
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
        tuning: structuredClone(t),
        viewport,
        items: [],
      },
    };
  }

  // ---- What's where ----

  /** The node the player is at. */
  get node(): MapNode {
    return GRAPH.byId.get(this.state.at)!;
  }

  /** The nodes the player can travel to now (on the map), else none. */
  options(): string[] {
    return this.state.phase === 'map' ? GRAPH.next[this.state.at] : [];
  }

  /** The section the open item (or the node the player is at) is in. */
  section(): Section {
    const it = this.state.item;
    if (it) return sectionOf(it.step, it.boss !== null);
    const n = this.node;
    return sectionOf(n.step, n.kind === 'boss');
  }

  /** A miss's cost on the open item (or at the node ahead), as a range: the item shows it before a submit. */
  missRange(): Range {
    const sec = this.section();
    const [lo, hi] = this.state.tuning.missCost[sec];
    const more = sec === 'boss' && this.state.bossMods.includes('bloodied') ? BLOODIED : 0;
    return [lo + more, hi + more];
  }

  /** The hidden modifier of the zone the player is at, while it's corrupted (not yet cleansed). */
  hiddenHere(): Hidden | null {
    const c = this.state.corrupt[this.state.at];
    return c && !c.cleansed && this.state.places[this.state.at].kind === 'zone' ? c.hidden : null;
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

  /** Whether the ware at `i` on the vendor's table can be bought: at a vendor, with the gold and the room. */
  canBuy(i: number): boolean {
    const s = this.state;
    const ware = s.stock[i];
    return s.phase === 'vendor' && !!ware && s.gold >= s.tuning.price[ware] && this.fits(ware, s.tuning.stack[ware]);
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

  /** How many patches a Flare burns in here: halved under Incursion, at the boss's third item and after (a Lingering fourth too), and again at a Murky boss. */
  flareBurn(): number {
    const s = this.state;
    const it = s.item;
    let b = s.tuning.burnIn.flare;
    if (it?.zoneType === 'incursion') b /= 2;
    if (it && it.boss !== null && it.boss >= 2) b /= 2;
    if (it && it.boss !== null && s.bossMods.includes('murky')) b /= 2;
    return Math.max(1, Math.round(b));
  }

  /** The decoys still on the board unstruck: what a Decoy sweep can strike. */
  decoysLeft(it: ItemPlay): string[] {
    return it.decoys.filter((t) => it.marks[t] !== 'struck');
  }

  /**
   * Why a supply would do nothing on the open item: none open, the boss's
   * Silent rule, a Sealed zone, a Dark one (no Flares), a Ritual zone (no
   * Scrolls), or nothing left for it to show. Null when it works.
   */
  idle(supply: Supply): 'closed' | 'silent' | 'sealed' | 'dark' | 'ritual' | 'done' | null {
    const it = this.live();
    if (!it) return 'closed';
    if (it.boss !== null && supply !== 'flare') return 'silent';
    if (it.hidden === 'sealed') return 'sealed';
    if (supply === 'flare' && it.hidden === 'dark') return 'dark';
    if (supply === 'wisdom' && it.zoneType === 'ritual') return 'ritual';
    const c = CLUES[it.itemId];
    const done: Record<Supply, boolean> = {
      flare: !it.adjacency || it.burned.length >= it.patches,
      wisdom: it.shown.mods.length >= c.mods.length,
      lore: it.shown.flavor || !c.flavor,
      category: it.shown.category,
      base: it.shown.base,
      decoy: !this.decoysLeft(it).length,
      lengths: it.shown.lengths,
      first: it.locked > 0,
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

  /** Why the build can't be sent though there is one: the same line was sent on this item already (a miss never costs life twice). */
  blocked(): 'tried' | null {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || !it.build.length) return null;
    return it.log.submits.some((sub) => sub.tiles.join('\u0001') === it.build.join('\u0001')) ? 'tried' : null;
  }

  /** Whether the build can be submitted: something built, the item open, the line not sent before. */
  canSubmit(): boolean {
    const it = this.live();
    return !!it && it.build.length > 0 && !it.lineMarks && this.blocked() === null;
  }

  // ---- Actions ----

  /** Buys the ware at `i` on the vendor's table: its stack goes in the pack, and the card off the table until the next visit. */
  buy(i: number): boolean {
    if (!this.canBuy(i)) return false;
    const s = this.state;
    const ware = s.stock[i];
    const price = s.tuning.price[ware];
    s.gold -= price;
    this.stow(ware, s.tuning.stack[ware]);
    s.stock.splice(i, 1);
    s.log.bought[ware] += s.tuning.stack[ware];
    s.log.goldSpent += price;
    return true;
  }

  /** Leaves a vendor or a Well for the map. */
  leave(): boolean {
    const s = this.state;
    if (s.phase !== 'vendor' && s.phase !== 'well') return false;
    s.stock = [];
    s.vendor = null;
    this.toMap();
    return true;
  }

  /** The map, the fronts creeping first after every `creep` steps the player takes. */
  private toMap() {
    const s = this.state;
    s.phase = 'map';
    s.visit = null;
    const every = Math.max(1, s.tuning.corruption.creep);
    if (s.steps > 0 && s.steps % every === 0 && s.crept < s.steps) {
      s.crept = s.steps;
      creep(GRAPH, s.places, s.corrupt, s.fronts, this.node.step, s.tuning.corruption.weights, this.rng);
    }
  }

  /** Travels to a node linked ahead, and arrives there: a Well refills the flask, a town heals and deals its wares, a zone or the boss shows its threshold. */
  choose(id: string): boolean {
    const s = this.state;
    const offered = this.options();
    if (!offered.includes(id)) return false;
    s.log.travel.push({ offered: [...offered], picked: id });
    s.log.route.push(id);
    s.at = id;
    s.steps++;
    const place = s.places[id];
    const hidden = this.hiddenHere();
    s.log.met.push({ node: id, kind: place.kind, zoneType: place.kind === 'zone' ? place.type : null, corruption: hidden });
    if (place.kind === 'well') {
      s.flask.charges = s.tuning.flask;
      s.phase = 'well';
    } else if (place.kind === 'town') {
      const heal = Math.min(TOWN_HEAL, s.maxLife - s.life);
      s.life += heal;
      s.stock = [...SUPPLIES];
      s.vendor = { at: 'town', heal };
      s.phase = 'vendor';
    } else if (place.kind === 'boss') {
      const alive = s.fronts.filter((f) => f.alive).length;
      s.log.fronts.aliveAtBoss = alive;
      s.bossMods = rollBossMods(alive, this.rng);
      s.log.bossMods = [...s.bossMods];
      s.visit = { node: id, items: BOSS_ITEMS + (s.bossMods.includes('lingering') ? 1 : 0), done: 0 };
      s.phase = 'zone';
    } else {
      s.visit = { node: id, items: Math.max(1, Math.min(3, s.tuning.itemsPerZone)), done: 0 };
      s.phase = 'zone';
    }
    return true;
  }

  /** From a zone's (or the boss's) threshold into its first item. */
  enter(): boolean {
    if (this.state.phase !== 'zone' || !this.state.visit) return false;
    this.draw();
    return true;
  }

  /**
   * On from a named item, or from its loot once collected (and any supply
   * that didn't fit kept or left): the loot deal after a right answer in a
   * zone (none at the boss), else the next item, or the node done.
   */
  next(): boolean {
    const s = this.state;
    const it = s.item;
    if (s.phase === 'solved' && it) {
      if (it.boss === null) {
        this.dealLoot(it);
        s.phase = 'loot';
        return true;
      }
      this.finish();
      return true;
    }
    if (s.phase === 'loot' && s.loot?.collected && !s.loot.pending.length) {
      this.finish();
      return true;
    }
    return false;
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
    const sec = sectionOf(node.step, boss !== null);
    let extra = 0;
    if (zoneType === 'blight') extra += BLIGHT_DECOYS;
    if (hidden === 'swarming') extra += SWARMING_DECOYS;
    if (boss !== null && s.bossMods.includes('teeming')) extra += TEEMING_DECOYS;
    // The pool's total is rolled, not the decoys: the board's size says next to nothing of the answer's.
    const { decoys, tiles } = dealPool(answer, s.seed, t.tiles[sec], extra);
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
      } else if (zoneType === 'blight') {
        // Dark wins: no burn-in, and nothing in its place.
        if (hidden !== 'dark') freeClue = 'burn';
      } else {
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
      tiles: { answer: [...answerTiles], decoys: [...decoys] },
      freeClue,
      supplies: [],
      burnIns: [],
      patches: 0,
      submits: [],
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
      decoys,
      tiles,
      marks: {},
      swept: [],
      burned: [],
      patches: 0,
      adjacency: null,
      shown,
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
      case 'wisdom': {
        const nextLine = wisdomOrder(CLUES[it.itemId]).find((i) => !it.shown.mods.includes(i));
        if (nextLine !== undefined) it.shown.mods.push(nextLine);
        break;
      }
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

  /** Takes a placed tile back off the line (a locked one stays). */
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
   * Submits the line. Right (its letters are the answer's): the item is
   * named, the flask's heal comes in, and next() deals the loot. Wrong: life
   * drops by a random miss cost, the deal loses a card, and the line is
   * marked tile by tile, the board's tiles keeping their best marks. At 0
   * life the run ends. Returns whether it was right, or null if nothing
   * could be submitted.
   */
  submit(): boolean | null {
    if (!this.canSubmit()) return null;
    const s = this.state;
    const it = s.item!;
    const right = letters(it.build.join('')) === letters(it.log.name);
    const sub = { tiles: [...it.build], right, marks: [] as LineMark[], lost: 0, ms: this.since(it) };
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
      return true;
    }
    const marks = markLine(it.build, it.answer);
    const goldOnly = s.tuning.marks === 'gold';
    sub.marks = marks.map((m) => (goldOnly && m !== 'gold' ? 'none' : m));
    it.lineMarks = sub.marks;
    it.build.forEach((tile, i) => {
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

  /** The loot deal for a named zone item: the zone's cards (times the corruption's multiplier) less one a miss, never below 1. */
  private dealLoot(it: ItemPlay) {
    const s = this.state;
    const size = Math.max(1, this.dealHere() - it.misses);
    const sec = sectionOf(it.step, false) as 'early' | 'mid' | 'late';
    const cards: LootCard[] = [];
    for (let k = 0; k < size; k++) cards.push(this.rollCard(sec, cards.filter((c) => c.kind === 'flask').length));
    s.loot = { cards, collected: false, pending: [] };
    it.log.loot = cards.map((c) => ({ ...c }));
    for (const c of cards) s.log.loot.dealt[c.kind]++;
  }

  /** One loot card, by the tuning's weights (a flask card only while a charge is empty, counting the `flasks` already dealt with it: else rolled again). */
  private rollCard(section: 'early' | 'mid' | 'late', flasks = 0): LootCard {
    const s = this.state;
    const t = s.tuning.loot;
    const weights = { ...t.weights };
    if (s.flask.charges + flasks >= s.tuning.flask) weights.flask = 0;
    const kind = weighted(weights, LOOT_KINDS, this.rng) ?? 'gold';
    return {
      kind,
      gold: kind === 'gold' ? between(t.gold[section], this.rng) : kind === 'jackpot' ? t.jackpot : 0,
      supply: kind === 'supply' ? SUPPLIES[Math.floor(this.rng() * SUPPLIES.length)] : null,
      n: kind === 'supply' ? t.supplies : 0,
    };
  }

  /** Takes every loot card: the gold, the flask charge, the supplies into the pack. A supply that doesn't fit waits for keep(). */
  collect(): boolean {
    const s = this.state;
    const loot = s.loot;
    if (s.phase !== 'loot' || !loot || loot.collected) return false;
    loot.collected = true;
    const it = s.item!;
    for (const card of loot.cards) {
      if (card.kind === 'gold' || card.kind === 'jackpot') {
        s.gold += card.gold;
        s.log.goldEarned += card.gold;
        it.log.gold += card.gold;
        s.log.loot.taken[card.kind]++;
      } else if (card.kind === 'flask') {
        s.flask.charges = Math.min(s.tuning.flask, s.flask.charges + 1);
        s.log.loot.taken.flask++;
      } else {
        s.log.found[card.supply!] += card.n;
        if (this.stow(card.supply!, card.n)) s.log.loot.taken.supply++;
        else loot.pending.push(card);
      }
    }
    return true;
  }

  /** With the pack full, the first waiting supply card replaces the pack's stack `slot`, or is left (null). */
  keep(slot: number | null): boolean {
    const s = this.state;
    const loot = s.loot;
    if (s.phase !== 'loot' || !loot?.pending.length) return false;
    const card = loot.pending[0];
    if (slot !== null) {
      if (slot < 0 || slot >= s.pack.length) return false;
      s.pack[slot] = { supply: card.supply!, n: card.n };
      s.log.loot.taken.supply++;
    }
    loot.pending.shift();
    return true;
  }

  /** The named item done: logged, then the visit's next item, or the node done. */
  private finish() {
    const s = this.state;
    const it = s.item!;
    it.log.lifeAfter = s.life;
    s.log.items.push(it.log);
    s.done++;
    s.item = null;
    s.loot = null;
    const v = s.visit!;
    v.done++;
    if (v.done < v.items) {
      this.draw();
      return;
    }
    const place = s.places[v.node];
    if (place.kind === 'boss') {
      this.end(true);
      return;
    }
    // Answering all its items cleanses a zone; cleansing a front's head stops it for good.
    const c = s.corrupt[v.node];
    if (c && !c.cleansed) {
      c.cleansed = true;
      for (const f of s.fronts)
        if (f.alive && f.at === v.node) {
          f.alive = false;
          f.stoppedAt = v.node;
          s.log.fronts.stopped++;
        }
    }
    if (place.kind === 'zone' && place.type === 'expedition') {
      s.stock = [...SUPPLIES];
      s.vendor = { at: 'expedition', heal: 0 };
      s.visit = null;
      s.phase = 'vendor';
      return;
    }
    this.toMap();
  }

  /** The run ends: won after the boss, lost at 0 life (on the item still open, or the last one logged). */
  private end(won: boolean) {
    const s = this.state;
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

