// The Wraeclast run's rules (wraeclast.html, src/wraeclast): a solo run of 15
// items, the mode's prototype (v2, after the first playtest). Pure: the run's
// state is a plain object (the page makes it reactive), every action a method
// that changes it, so a run plays the same in a test as on the page.
//
// A run: the camp (a vendor), zones 1 and 2 (three items each), the town
// (heals, a vendor again), zones 3 and 4, then the boss's chain of three
// under the Silent rule (only Flares work). Each item: its name built from
// syllables (the Inscription, its board mixing names of its own category and
// others), its art under the Veil (burned in a cluster at a time), the zone's
// free clue, supplies from the pack, and a Vaal Orb to gamble on. A miss costs
// life; a right answer deals loot cards to take one of. docs/handoff/wraeclast
// (the prototype's handoffs) has the reasons.

import { shuffle, type Item } from '../lib/game.ts';
import { seededRandom } from '../lib/patches.ts';
import itemData from '../data/items.json' with { type: 'json' };
import syllableData from '../data/syllables.json' with { type: 'json' };
import clueData from '../data/clues.json' with { type: 'json' };

export type ZoneType = 'plain' | 'incursion' | 'ritual' | 'blight';
export const ZONE_TYPES: readonly ZoneType[] = ['plain', 'incursion', 'ritual', 'blight'];
export const ZONE_NAMES: Record<ZoneType, string> = { plain: 'Plain', incursion: 'Incursion', ritual: 'Ritual', blight: 'Blight' };

export type Supply = 'flare' | 'wisdom' | 'strike' | 'lengths' | 'first' | 'decoy';
export const SUPPLIES: readonly Supply[] = ['flare', 'wisdom', 'strike', 'lengths', 'first', 'decoy'];
export const SUPPLY_NAMES: Record<Supply, string> = {
  flare: 'Flare',
  wisdom: 'Scroll of Wisdom',
  strike: 'Name strike',
  lengths: 'Word lengths',
  first: 'First syllable',
  decoy: 'Decoy sweep',
};

/** What the vendor sells and the pack holds: the supplies and Vaal Orbs. */
export type Ware = Supply | 'vaal';
export const WARES: readonly Ware[] = [...SUPPLIES, 'vaal'];
export const WARE_NAMES: Record<Ware, string> = { ...SUPPLY_NAMES, vaal: 'Vaal Orb' };

export type LootKind = 'gold' | 'supply' | 'vaal' | 'flask' | 'jackpot';
export const LOOT_KINDS: readonly LootKind[] = ['gold', 'supply', 'vaal', 'flask', 'jackpot'];
/** The loot cards an unidentified card rolls twice as often. */
export const RARE_LOOT: readonly LootKind[] = ['vaal', 'flask', 'jackpot'];

export type Corruption = 'gilded' | 'unveiled' | 'twisted' | 'bricked';
export const CORRUPTIONS: readonly Corruption[] = ['gilded', 'unveiled', 'twisted', 'bricked'];
export const CORRUPTION_NAMES: Record<Corruption, string> = { gilded: 'Gilded', unveiled: 'Unveiled', twisted: 'Twisted', bricked: 'Bricked' };
/** The cards each outcome adds to the item's deal (Bricked: a right answer deals nothing). */
export const CORRUPTION_CARDS: Record<Corruption, number> = { gilded: 2, unveiled: 1, twisted: 2, bricked: 0 };
/** The names a Twisted corruption adds to the board. */
export const TWISTED_NAMES = 3;

/** The parts of a run that share their numbers: zones 1 and 2, zones 3 and 4, the boss. */
export type Section = 'early' | 'late' | 'boss';
export const SECTIONS: readonly Section[] = ['early', 'late', 'boss'];
export type Range = [number, number];

/** The numbers a run is played with (the page's tuning panel sets them; the log keeps them). */
export interface Tuning {
  life: number;
  gold: number;
  /** The flask's charges, at the start and at most. */
  flask: number;
  /** A miss's cost, a random whole number in the range. */
  missCost: Record<Section, Range>;
  price: Record<Ware, number>;
  /** Names on the board (before Blight and Twisted add theirs). */
  board: Record<Section, number>;
  /** The share of a board's wrong names drawn from other categories, in percent. */
  otherNames: number;
  /** Patches a burn-in takes: a Flare's (halved by Incursion and the boss's third), Blight's free one, Unveiled's, the boss's first free one. */
  burnIn: { flare: number; blight: number; unveiled: number; boss: number };
  /** The Veil's cut: about this many seeds a side over the item's art (the page cuts it). */
  seeds: number;
  loot: {
    /** Cards a zone deals for a right answer, before misses and corruption. */
    deal: number;
    weights: Record<LootKind, number>;
    gold: Record<Exclude<Section, 'boss'>, Range>;
    jackpot: number;
  };
  corruption: Record<Corruption, number>;
  /** Whether each zone type gives its free clue (off: to see how experts do without). */
  freeClue: Record<ZoneType, boolean>;
  /** Whether the answer line spaces words by itself. */
  spacing: boolean;
}

export const DEFAULT_TUNING: Tuning = {
  life: 100,
  gold: 20,
  flask: 2,
  missCost: { early: [20, 30], late: [30, 40], boss: [55, 65] },
  price: { flare: 5, wisdom: 5, strike: 6, lengths: 4, first: 8, decoy: 6, vaal: 4 },
  board: { early: 4, late: 6, boss: 10 },
  otherNames: 50,
  burnIn: { flare: 4, blight: 2, unveiled: 12, boss: 4 },
  seeds: 9,
  loot: {
    deal: 3,
    weights: { gold: 10, supply: 8, vaal: 3, flask: 2, jackpot: 1 },
    gold: { early: [4, 8], late: [6, 10] },
    jackpot: 25,
  },
  corruption: { gilded: 2, unveiled: 2, twisted: 2, bricked: 1 },
  freeClue: { plain: true, incursion: true, ritual: true, blight: true },
  spacing: true,
};

export const PACK_SLOTS = 8;
export const ZONES = 4;
export const ZONE_ITEMS = 3;
export const BOSS_ITEMS = 3;
export const ITEMS_IN_RUN = ZONES * ZONE_ITEMS + BOSS_ITEMS;
/** Items done when the town comes: after zone 2. */
export const TOWN_AFTER = 2 * ZONE_ITEMS;
export const TOWN_HEAL = 20;
/** A drink heals this much at once, and again after each of the next FLASK_ITEMS items. */
export const FLASK_STEP = 10;
export const FLASK_ITEMS = 2;
/** Blight puts this many more names on the board. */
export const BLIGHT_NAMES = 2;
/** The board never holds more names than this, and Name strike never leaves fewer than MIN_NAMES. */
export const MAX_NAMES = 10;
export const MIN_NAMES = 3;
/** Wrong names are drawn at random from this many of the most alike. */
export const LOOKALIKE_POOL = 15;
/** A Decoy sweep greys out this many syllables. */
export const DECOY_SWEEP = 3;
/** A mod line this many items share (or more) is common: a Scroll of Wisdom or a Plain zone shows only those. */
export const COMMON_LINE = 3;
/** The three small words that are whole tiles. */
export const SMALL_WORDS: readonly string[] = ['of', 'the', 'and'];

/** A mod line: its kind as the tooltip draws it, its text (name words masked), and how many items share it. */
export type ModLine = [string, string, number];
export type Clues = { base: string; mods: ModLine[]; flavor: string | null };
export const ITEMS = itemData as Item[];
export const SYLLABLES = syllableData as Record<string, string[][]>;
export const CLUES = clueData as unknown as Record<string, Clues>;
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
const CATEGORIES = [...new Set(ITEMS.map((it) => it.category))].sort();

/** What a zone (or the boss) gave for free when an item opened. */
export type FreeClue = 'none' | 'mod' | 'flavor' | 'lengths' | 'burn';

export type Phase = 'camp' | 'travel' | 'item' | 'solved' | 'loot' | 'town' | 'end';

export interface BoardName {
  id: string;
  name: string;
  /** Its words, each as its syllables (syllables.json, lower case). */
  words: string[][];
}

/** A loot card: what it gives (gold, or a supply), and whether it was dealt face down. */
export interface LootCard {
  kind: LootKind;
  /** Gold for gold and the jackpot, else 0. */
  gold: number;
  /** The supply on a supply card, else null. */
  supply: Supply | null;
  unid: boolean;
}

export type BurnBy = 'zone' | 'boss' | 'flare' | 'vaal';

export interface ItemLog {
  itemId: string;
  name: string;
  category: string;
  /** Which zone: 1 to 4, or 5 for the boss. */
  zone: number;
  /** The zone's type, or "boss". */
  zoneType: ZoneType | 'boss';
  corruption: Corruption | null;
  boss: boolean;
  /** How many names the board held at the end (a Twisted corruption adds some). */
  names: number;
  /** The board's names, the answer marked. */
  board: { name: string; answer?: true }[];
  freeClue: FreeClue;
  supplies: { type: Supply; order: number; ms: number }[];
  /** Each burn-in: what made it, how many patches it took, when (ms after the item opened). */
  burnIns: { by: BurnBy; patches: number; ms: number }[];
  /** The Veil's patches, as the page cut it. */
  patches: number;
  /** Each submit: the line as built, right or not, when, and the life a miss cost (0 when right). */
  submits: { text: string; right: boolean; ms: number; lost: number }[];
  lifeBefore: number;
  lifeAfter: number;
  /** The flask's heal as the item ended (in lifeAfter already). */
  healed: number;
  /** The loot cards offered (none at the boss, or Bricked). */
  deal: LootCard[];
  /** The card taken: its place in the deal, and whether the pack kept what it gave. */
  took: { index: number; kept: boolean } | null;
  /** When a flask charge was drunk, ms after the item opened (each drink). */
  drank: number[];
  /** The Vaal Orb used: its outcome, how many supplies were used before it, when. */
  vaal: { outcome: Corruption; suppliesBefore: number; ms: number } | null;
  misses: number;
  gold: number;
}

export interface ItemPlay {
  /** Its place in the run, 0 to 14. */
  n: number;
  /** 1 to 4, or 5 at the boss. */
  zoneNo: number;
  zoneType: ZoneType | null;
  /** Which of the boss's three, or null before the boss. */
  boss: number | null;
  category: string;
  itemId: string;
  /** The names on the board, the answer among them. */
  names: BoardName[];
  /** The distinct syllables of every name on the board, shuffled. */
  tiles: string[];
  /** Ids of the names struck from the board. */
  struck: string[];
  /** Syllables a Decoy sweep greyed out. */
  swept: string[];
  /** The Veil's patches burned in, in the order they burned. */
  burned: number[];
  /** The Veil's patches (the page's cut), 0 until the item opens. */
  patches: number;
  /** Which patches touch which (the page's cut), null until the item opens. */
  adjacency: number[][] | null;
  /** The clues shown: mod lines (their places in the tooltip), the flavour text, the word lengths. */
  shown: { mods: number[]; flavor: boolean; lengths: boolean };
  freeClue: FreeClue;
  /** The syllables placed on the answer line, in order. */
  build: string[];
  /** How many syllables at the start of the line are locked (First syllable). */
  locked: number;
  misses: number;
  corruption: Corruption | null;
  /** When it opened (its Veil cut), or null while it's being laid out. */
  openedAt: number | null;
  log: ItemLog;
}

/** The loot deal after a right answer. */
export interface LootDeal {
  cards: LootCard[];
  /** The card taken, or null. */
  taken: number | null;
  /** A supply or Vaal Orb taken with the pack full, waiting for keep(). */
  pending: Ware | null;
}

export interface RunLog {
  v: 2;
  seed: number;
  start: string;
  end: string | null;
  result: 'win' | 'loss' | null;
  /** The item the run ended on: its place (0 to 14), id and name. */
  endedOn: { n: number; itemId: string; name: string } | null;
  zones: ZoneType[];
  misses: number;
  /** Items answered right without a supply used. */
  noSupply: number;
  bought: Record<Ware, number>;
  used: Record<Supply, number>;
  /** Supplies and Vaal Orbs taken from loot. */
  found: Record<Ware, number>;
  vaalUsed: number;
  outcomes: Record<Corruption, number>;
  /** Unidentified cards offered and taken. */
  unid: { offered: number; taken: number };
  goldEarned: number;
  goldSpent: number;
  drinks: number;
  lifeEnd: number;
  spacing: boolean;
  tuning: Tuning;
  /** The device's viewport width, CSS pixels. */
  viewport: number;
  items: ItemLog[];
}

export interface RunState {
  seed: number;
  tuning: Tuning;
  /** The four zones' types, zone 1 first: all different. */
  zones: ZoneType[];
  phase: Phase;
  life: number;
  maxLife: number;
  gold: number;
  flask: { charges: number; /** Item ends the last drink still heals after. */ recovering: number };
  pack: Ware[];
  /** The vendor's wares left on this visit (each dealt once a visit). */
  stock: Ware[];
  /** Items done. */
  done: number;
  item: ItemPlay | null;
  loot: LootDeal | null;
  /** The town's heal on arrival, for its screen. */
  arrivalHeal: number;
  log: RunLog;
}

const count = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** A name as the board compares it: no spaces, lower case. */
const key = (text: string) => text.replace(/\s+/g, '').toLowerCase();

/** The section an item (0 to 14) is in. */
export const sectionOf = (n: number): Section => (n >= ZONES * ZONE_ITEMS ? 'boss' : n >= TOWN_AFTER ? 'late' : 'early');
/** The zone an item (0 to 14) is in: 1 to 4, 5 for the boss. */
export const zoneOf = (n: number) => Math.min(ZONES + 1, Math.floor(n / ZONE_ITEMS) + 1);

/** A whole number in [lo, hi], at random. */
const between = ([lo, hi]: Range, rng: () => number) => lo + Math.floor(rng() * (Math.max(lo, hi) - lo + 1));

/** A draw by weight, or null when every weight is 0. */
function weighted<K extends string>(weights: Record<K, number>, keys: readonly K[], rng: () => number): K | null {
  const total = keys.reduce((t, k) => t + Math.max(0, weights[k]), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const k of keys) if ((r -= Math.max(0, weights[k])) < 0) return k;
  return keys[keys.length - 1];
}

const boardName = (it: Item): BoardName => ({ id: it.id, name: it.name, words: SYLLABLES[it.id] });

/**
 * `k` wrong names for `answer` from `pool`, the ones most alike first: ranked
 * by the syllables they share with it, then by how close their syllable count
 * is, drawn at random from the top LOOKALIKE_POOL so boards vary. Names whose
 * text is already in `taken` (the board's) are left out, and the drawn ones
 * are added to it.
 */
function lookalikes(answer: Item, pool: Item[], k: number, taken: Set<string>, rng: () => number): Item[] {
  if (k <= 0) return [];
  const own = SYLLABLES[answer.id].flat();
  const mine = new Set(own);
  const ranked = pool
    .filter((it) => !taken.has(key(it.name)))
    .map((it) => {
      const syl = SYLLABLES[it.id].flat();
      return { it, shared: new Set(syl.filter((s) => mine.has(s))).size, gap: Math.abs(syl.length - own.length), tie: rng() };
    })
    .sort((a, b) => b.shared - a.shared || a.gap - b.gap || a.tie - b.tie);
  const out: Item[] = [];
  for (const { it } of shuffle(ranked.slice(0, Math.max(LOOKALIKE_POOL, k)), rng)) {
    if (out.length >= k) break;
    if (taken.has(key(it.name))) continue;
    taken.add(key(it.name));
    out.push(it);
  }
  return out;
}

/**
 * `k` wrong names for a board: of them, `otherNames` percent (the rest of
 * rounding the own category's share down) from other categories, the rest
 * from the answer's own; either side short fills from the other.
 */
function wrongNames(answer: Item, k: number, otherNames: number, taken: Set<string>, rng: () => number): Item[] {
  const others = ITEMS.filter((it) => it.id !== answer.id && it.category !== answer.category);
  const own = ITEMS.filter((it) => it.id !== answer.id && it.category === answer.category);
  const ownCount = Math.floor((k * (100 - otherNames)) / 100);
  const fromOwn = lookalikes(answer, own, ownCount, taken, rng);
  const fromOthers = lookalikes(answer, others, k - fromOwn.length, taken, rng);
  const more = lookalikes(answer, own, k - fromOwn.length - fromOthers.length, taken, rng);
  return [...fromOwn, ...fromOthers, ...more];
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
    const zones = shuffle([...ZONE_TYPES], this.rng);
    this.state = {
      seed,
      tuning: t,
      zones,
      phase: 'camp',
      life: t.life,
      maxLife: t.life,
      gold: t.gold,
      flask: { charges: t.flask, recovering: 0 },
      pack: [],
      stock: [...WARES],
      done: 0,
      item: null,
      loot: null,
      arrivalHeal: 0,
      log: {
        v: 2,
        seed,
        start: new Date(now()).toISOString(),
        end: null,
        result: null,
        endedOn: null,
        zones: [...zones],
        misses: 0,
        noSupply: 0,
        bought: count(WARES),
        used: count(SUPPLIES),
        found: count(WARES),
        vaalUsed: 0,
        outcomes: count(CORRUPTIONS),
        unid: { offered: 0, taken: 0 },
        goldEarned: 0,
        goldSpent: 0,
        drinks: 0,
        lifeEnd: t.life,
        spacing: t.spacing,
        tuning: structuredClone(t),
        viewport,
        items: [],
      },
    };
  }

  // ---- What's where ----

  /** The zone type of zone 1 to 4 (null at the boss). */
  zoneType(zoneNo: number): ZoneType | null {
    return zoneNo >= 1 && zoneNo <= ZONES ? this.state.zones[zoneNo - 1] : null;
  }

  /** The zone the run is in or heads into next: 1 to 4, 5 for the boss. */
  get zoneNo() {
    const s = this.state;
    return s.item ? s.item.zoneNo : zoneOf(s.done);
  }

  /** How many names the board of item n holds, before a Twisted corruption adds its own. */
  boardSize(n: number): number {
    const base = this.state.tuning.board[sectionOf(n)];
    const blight = this.zoneType(zoneOf(n)) === 'blight' ? BLIGHT_NAMES : 0;
    return Math.max(2, Math.min(MAX_NAMES, base + blight));
  }

  /** A miss's cost on the open item, as a range: the item shows it before a submit. */
  missRange(): Range {
    const it = this.state.item;
    return this.state.tuning.missCost[sectionOf(it ? it.n : this.state.done)];
  }

  /** Whether a ware on the vendor's table (its place in stock) can be bought: at a vendor, with the gold and a free slot. */
  canBuy(i: number): boolean {
    const s = this.state;
    const ware = s.stock[i];
    return (s.phase === 'camp' || s.phase === 'town') && !!ware && s.gold >= s.tuning.price[ware] && s.pack.length < PACK_SLOTS;
  }

  /** Whether the open item can be played on (opened, not yet named). */
  private live(): ItemPlay | null {
    const it = this.state.item;
    return this.state.phase === 'item' && it && it.openedAt !== null ? it : null;
  }

  /** Whether the flask can be drunk now: during an item, with a charge left. */
  canDrink(): boolean {
    return !!this.live() && this.state.flask.charges > 0;
  }

  /** How many patches a Flare burns in on the open item: half under Incursion and on the boss's third. */
  flareBurn(): number {
    const it = this.state.item;
    const full = this.state.tuning.burnIn.flare;
    const half = it && (it.zoneType === 'incursion' || it.boss === BOSS_ITEMS - 1);
    return half ? Math.max(1, Math.round(full / 2)) : full;
  }

  /**
   * Why a supply has nothing to do on the open item, or null when it has:
   * 'silent' at the boss (only Flares work), 'corrupted', 'ritual' (Scrolls
   * don't work there), or 'done' (nothing left for it to show).
   */
  idle(supply: Supply): 'closed' | 'silent' | 'corrupted' | 'ritual' | 'done' | null {
    const it = this.live();
    if (!it) return 'closed';
    if (it.boss !== null && supply !== 'flare') return 'silent';
    if (it.corruption) return 'corrupted';
    switch (supply) {
      case 'flare':
        return it.burned.length < it.patches ? null : 'done';
      case 'wisdom':
        if (it.zoneType === 'ritual') return 'ritual';
        return commonUnshown(it).length ? null : 'done';
      case 'strike':
        return remaining(it).length > MIN_NAMES ? null : 'done';
      case 'lengths':
        return it.shown.lengths ? 'done' : null;
      case 'first':
        return it.locked ? 'done' : null;
      case 'decoy':
        return decoys(it).length ? null : 'done';
    }
  }

  /** Whether a supply has anything to do on the open item (whether or not the pack holds one). */
  works(supply: Supply): boolean {
    return this.idle(supply) === null;
  }

  /** Whether a supply can be used now: one in the pack, and something for it to do. */
  canUse(supply: Supply): boolean {
    return this.state.pack.includes(supply) && this.works(supply);
  }

  /** Whether a Vaal Orb can be used now: one in the pack, an item open that isn't the boss's or corrupted. */
  canCorrupt(): boolean {
    const it = this.live();
    return !!it && it.boss === null && !it.corruption && this.state.pack.includes('vaal');
  }

  /**
   * Why the build can't be sent though there is one: it is a name already
   * struck, or a build already sent on this item (so a miss never costs life
   * twice). Null when it can be.
   */
  blocked(): 'struck' | 'tried' | null {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || !it.build.length) return null;
    const k = key(it.build.join(''));
    if (it.names.some((n) => it.struck.includes(n.id) && key(n.name) === k)) return 'struck';
    if (it.log.submits.some((sub) => key(sub.text) === k)) return 'tried';
    return null;
  }

  /** Whether the build can be submitted: something built, the item open, and the build not blocked. */
  canSubmit(): boolean {
    const it = this.live();
    return !!it && it.build.length > 0 && this.blocked() === null;
  }

  // ---- Actions ----

  /** Buys the ware at `i` on the vendor's table: it goes in the pack, and off the table until the next visit. */
  buy(i: number): boolean {
    if (!this.canBuy(i)) return false;
    const s = this.state;
    const ware = s.stock[i];
    const price = s.tuning.price[ware];
    s.gold -= price;
    s.pack.push(ware);
    s.stock.splice(i, 1);
    s.log.bought[ware]++;
    s.log.goldSpent += price;
    return true;
  }

  /** Leaves the camp or the town for the next zone. */
  leave(): boolean {
    const s = this.state;
    if (s.phase !== 'camp' && s.phase !== 'town') return false;
    s.stock = [];
    s.phase = 'travel';
    return true;
  }

  /** From the zone's threshold into its first item. */
  enter(): boolean {
    if (this.state.phase !== 'travel') return false;
    this.draw();
    return true;
  }

  /**
   * On from a named item (or a taken card): the loot deal after a right
   * answer in a zone (none at the boss or when Bricked), else the next item,
   * the next zone's threshold, the town after zone 2, or the end after the
   * boss.
   */
  next(): boolean {
    const s = this.state;
    const it = s.item;
    if (s.phase === 'solved' && it) {
      if (it.boss === null && it.corruption !== 'bricked') {
        this.dealLoot(it);
        if (s.loot && s.loot.cards.length) {
          s.phase = 'loot';
          return true;
        }
      }
      this.finish();
      return true;
    }
    if (s.phase === 'loot' && s.loot && s.loot.taken !== null && s.loot.pending === null) {
      this.finish();
      return true;
    }
    return false;
  }

  /** Draws the next item: from a category picked at random (not the last item's), an item not drawn before; its board laid out. It opens with open(). */
  private draw() {
    const s = this.state;
    const n = s.done;
    const zoneNo = zoneOf(n);
    const boss = sectionOf(n) === 'boss' ? n - ZONES * ZONE_ITEMS : null;
    const last = s.log.items.at(-1)?.category;
    const fresh = CATEGORIES.filter((c) => ITEMS.some((it) => it.category === c && !this.drawn.has(it.id)));
    const cats = fresh.filter((c) => c !== last);
    const category = (cats.length ? cats : fresh)[Math.floor(this.rng() * (cats.length ? cats : fresh).length)];
    const pool = ITEMS.filter((it) => it.category === category && !this.drawn.has(it.id));
    const answer = pool[Math.floor(this.rng() * pool.length)];
    this.drawn.add(answer.id);
    const taken = new Set([key(answer.name)]);
    const wrong = wrongNames(answer, this.boardSize(n) - 1, s.tuning.otherNames, taken, this.rng);
    const names = shuffle([answer, ...wrong], this.rng).map(boardName);
    const zoneType = this.zoneType(zoneNo);
    const clues = CLUES[answer.id];
    const t = s.tuning;
    let freeClue: FreeClue = 'none';
    const shown = { mods: [] as number[], flavor: false, lengths: false };
    if (boss !== null) {
      // The boss's first item starts with a burn-in (at open), the others with nothing.
      if (boss === 0) freeClue = 'burn';
    } else if (zoneType && t.freeClue[zoneType]) {
      const common = commonLines(clues);
      if (zoneType === 'plain' && common.length) {
        freeClue = 'mod';
        shown.mods.push(common[Math.floor(this.rng() * common.length)]);
      } else if (zoneType === 'incursion' && clues.flavor !== null) {
        freeClue = 'flavor';
        shown.flavor = true;
      } else if (zoneType === 'blight') freeClue = 'burn';
      else {
        // Ritual's own clue, and the Plain clue of an item with no common line.
        freeClue = 'lengths';
        shown.lengths = true;
      }
    }
    s.item = {
      n,
      zoneNo,
      zoneType,
      boss,
      category,
      itemId: answer.id,
      names,
      tiles: shuffle([...new Set(names.flatMap((nm) => nm.words.flat()))], this.rng),
      struck: [],
      swept: [],
      burned: [],
      patches: 0,
      adjacency: null,
      shown,
      freeClue,
      build: [],
      locked: 0,
      misses: 0,
      corruption: null,
      openedAt: null,
      log: {
        itemId: answer.id,
        name: answer.name,
        category,
        zone: zoneNo,
        zoneType: zoneType ?? 'boss',
        corruption: null,
        boss: boss !== null,
        names: names.length,
        board: names.map((nm) => (nm.id === answer.id ? { name: nm.name, answer: true } : { name: nm.name })),
        freeClue,
        supplies: [],
        burnIns: [],
        patches: 0,
        submits: [],
        lifeBefore: s.life,
        lifeAfter: s.life,
        healed: 0,
        deal: [],
        took: null,
        drank: [],
        vaal: null,
        misses: 0,
        gold: 0,
      },
    };
    s.loot = null;
    s.phase = 'item';
  }

  /**
   * Opens the item laid out by draw(), once the page has cut its Veil:
   * `adjacency` lists, for each of its patches, the patches it touches. The
   * zone's (or the boss's) free burn-in burns here, and the item's clock
   * starts.
   */
  open(adjacency: number[][]): boolean {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || it.openedAt !== null || !adjacency.length) return false;
    it.adjacency = adjacency.map((nb) => nb.filter((j) => j >= 0 && j < adjacency.length));
    it.patches = adjacency.length;
    it.log.patches = it.patches;
    it.openedAt = this.now();
    if (it.freeClue === 'burn') {
      const b = this.state.tuning.burnIn;
      this.burnIn(it, it.boss !== null ? b.boss : b.blight, it.boss !== null ? 'boss' : 'zone');
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

  /** Uses a supply from the pack on the open item. */
  use(supply: Supply): boolean {
    if (!this.canUse(supply)) return false;
    const s = this.state;
    const it = s.item!;
    s.pack.splice(s.pack.indexOf(supply), 1);
    switch (supply) {
      case 'flare':
        this.burnIn(it, this.flareBurn(), 'flare');
        break;
      case 'wisdom': {
        const lines = commonUnshown(it);
        it.shown.mods.push(lines[Math.floor(this.rng() * lines.length)]);
        break;
      }
      case 'strike': {
        const wrong = remaining(it).filter((nm) => nm.id !== it.itemId);
        it.struck.push(wrong[Math.floor(this.rng() * wrong.length)].id);
        break;
      }
      case 'lengths':
        it.shown.lengths = true;
        break;
      case 'first': {
        const first = answerOf(it).words[0][0];
        if (it.build[0] !== first) it.build.unshift(first);
        it.locked = 1;
        break;
      }
      case 'decoy':
        it.swept.push(...shuffle(decoys(it), this.rng).slice(0, DECOY_SWEEP));
        break;
    }
    it.log.supplies.push({ type: supply, order: it.log.supplies.length + 1, ms: this.since(it) });
    s.log.used[supply]++;
    return true;
  }

  /**
   * Uses a Vaal Orb on the open item: it is corrupted (no more supplies on
   * it, the flask still), with an outcome drawn by the tuning's weights that
   * holds through all its submits. Returns the outcome, or null.
   */
  corrupt(): Corruption | null {
    if (!this.canCorrupt()) return null;
    const s = this.state;
    const it = s.item!;
    const outcome = weighted(s.tuning.corruption, CORRUPTIONS, this.rng) ?? 'gilded';
    s.pack.splice(s.pack.indexOf('vaal'), 1);
    it.corruption = outcome;
    it.log.corruption = outcome;
    it.log.vaal = { outcome, suppliesBefore: it.log.supplies.length, ms: this.since(it) };
    s.log.vaalUsed++;
    s.log.outcomes[outcome]++;
    if (outcome === 'unveiled') this.burnIn(it, s.tuning.burnIn.unveiled, 'vaal');
    if (outcome === 'twisted') this.twist(it);
    return outcome;
  }

  /** A Twisted corruption's names: up to TWISTED_NAMES more on the board (never above MAX_NAMES), their new syllables among the tiles at random places. */
  private twist(it: ItemPlay) {
    const answer = BY_ID.get(it.itemId)!;
    const room = Math.min(TWISTED_NAMES, MAX_NAMES - it.names.length);
    const taken = new Set(it.names.map((nm) => key(nm.name)));
    for (const extra of wrongNames(answer, room, this.state.tuning.otherNames, taken, this.rng)) {
      const nm = boardName(extra);
      it.names.splice(Math.floor(this.rng() * (it.names.length + 1)), 0, nm);
      for (const syl of nm.words.flat()) if (!it.tiles.includes(syl)) it.tiles.splice(Math.floor(this.rng() * (it.tiles.length + 1)), 0, syl);
    }
    it.log.names = it.names.length;
    it.log.board = it.names.map((nm) => (nm.id === it.itemId ? { name: nm.name, answer: true } : { name: nm.name }));
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

  /** Adds a syllable to the answer line (one greyed out can't be). A syllable can be placed more than once. */
  place(tile: string): boolean {
    const it = this.live();
    if (!it || !it.tiles.includes(tile) || greyed(it, tile)) return false;
    it.build.push(tile);
    return true;
  }

  /** Takes the syllable at `index` back off the answer line (not a locked one). */
  unplace(index: number): boolean {
    const it = this.live();
    if (!it || index < it.locked || index >= it.build.length) return false;
    it.build.splice(index, 1);
    return true;
  }

  /** Empties the answer line, but for its locked start. */
  clear(): boolean {
    const it = this.live();
    if (!it || it.build.length <= it.locked) return false;
    it.build = it.build.slice(0, it.locked);
    return true;
  }

  /**
   * Submits the answer line. Right: the item is named (next() deals its
   * loot). Wrong: life drops by a random miss cost, the coming deal loses a
   * card, and if the build is a name on the board, it's struck. At 0 life
   * the run ends. Returns whether it was right, or null if nothing could be
   * submitted.
   */
  submit(): boolean | null {
    if (!this.canSubmit()) return null;
    const s = this.state;
    const it = s.item!;
    const k = key(it.build.join(''));
    const right = key(answerOf(it).name) === k;
    const sub = { text: buildText(it, s.tuning.spacing), right, ms: this.since(it), lost: 0 };
    it.log.submits.push(sub);
    if (right) {
      if (!it.log.supplies.length) s.log.noSupply++;
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
    it.misses++;
    it.log.misses = it.misses;
    s.log.misses++;
    sub.lost = Math.min(s.life, between(this.missRange(), this.rng));
    s.life -= sub.lost;
    it.log.lifeAfter = s.life;
    const named = it.names.find((nm) => nm.id !== it.itemId && !it.struck.includes(nm.id) && key(nm.name) === k);
    if (named) it.struck.push(named.id);
    if (s.life <= 0) {
      s.log.items.push(it.log);
      this.end(false);
    }
    return false;
  }

  /** The loot deal for a named zone item: the zone's cards less one a miss (never below 1), plus its corruption's; one dealt face down. */
  private dealLoot(it: ItemPlay) {
    const s = this.state;
    const t = s.tuning;
    const size = Math.max(1, t.loot.deal - it.misses) + (it.corruption ? CORRUPTION_CARDS[it.corruption] : 0);
    const unid = Math.floor(this.rng() * size);
    const cards = Array.from({ length: size }, (_, i) => this.rollCard(sectionOf(it.n) === 'late' ? 'late' : 'early', i === unid));
    s.loot = { cards, taken: null, pending: null };
    it.log.deal = cards.map((c) => ({ ...c }));
    s.log.unid.offered++;
  }

  /** One loot card, by the tuning's weights (an unidentified one rolls the rare kinds twice as often; a flask card only while a charge is empty). */
  private rollCard(section: 'early' | 'late', unid: boolean): LootCard {
    const s = this.state;
    const t = s.tuning.loot;
    const weights = { ...t.weights };
    if (unid) for (const k of RARE_LOOT) weights[k] *= 2;
    if (s.flask.charges >= s.tuning.flask) weights.flask = 0;
    const kind = weighted(weights, LOOT_KINDS, this.rng) ?? 'gold';
    return {
      kind,
      gold: kind === 'gold' ? between(t.gold[section], this.rng) : kind === 'jackpot' ? t.jackpot : 0,
      supply: kind === 'supply' ? SUPPLIES[Math.floor(this.rng() * SUPPLIES.length)] : null,
      unid,
    };
  }

  /**
   * Takes the loot card at `i`: its gold, its flask charge, or its supply or
   * Vaal Orb into the pack. With the pack full, the ware waits for keep() to
   * replace a slot with it or leave it.
   */
  take(i: number): boolean {
    const s = this.state;
    const loot = s.loot;
    const card = loot?.cards[i];
    if (s.phase !== 'loot' || !loot || !card || loot.taken !== null) return false;
    loot.taken = i;
    const it = s.item!;
    it.log.took = { index: i, kept: true };
    if (card.unid) s.log.unid.taken++;
    if (card.kind === 'gold' || card.kind === 'jackpot') {
      s.gold += card.gold;
      s.log.goldEarned += card.gold;
      it.log.gold = card.gold;
    } else if (card.kind === 'flask') s.flask.charges = Math.min(s.tuning.flask, s.flask.charges + 1);
    else {
      const ware: Ware = card.kind === 'vaal' ? 'vaal' : card.supply!;
      s.log.found[ware]++;
      if (s.pack.length < PACK_SLOTS) s.pack.push(ware);
      else loot.pending = ware;
    }
    return true;
  }

  /** With the pack full, keeps the ware taken in place of the pack's slot `slot`, or leaves it (null). */
  keep(slot: number | null): boolean {
    const s = this.state;
    const loot = s.loot;
    if (s.phase !== 'loot' || !loot || loot.pending === null) return false;
    if (slot !== null) {
      if (slot < 0 || slot >= s.pack.length) return false;
      s.pack[slot] = loot.pending;
    } else s.item!.log.took!.kept = false;
    loot.pending = null;
    return true;
  }

  /** The named item done: logged, and the run moves on. */
  private finish() {
    const s = this.state;
    const it = s.item!;
    it.log.lifeAfter = s.life;
    s.log.items.push(it.log);
    s.done++;
    s.item = null;
    s.loot = null;
    if (s.done === ITEMS_IN_RUN) this.end(true);
    else if (s.done === TOWN_AFTER) {
      const heal = Math.min(TOWN_HEAL, s.maxLife - s.life);
      s.life += heal;
      s.arrivalHeal = heal;
      s.stock = [...WARES];
      s.phase = 'town';
    } else if (s.done % ZONE_ITEMS === 0) s.phase = 'travel';
    else this.draw();
  }

  /** The run ends: won after the boss, lost at 0 life (on the item still open, or the last one logged). */
  private end(won: boolean) {
    const s = this.state;
    const last = s.log.items.at(-1)!;
    s.log.end = new Date(this.now()).toISOString();
    s.log.result = won ? 'win' : 'loss';
    s.log.endedOn = { n: s.log.items.length - 1, itemId: last.itemId, name: last.name };
    s.log.lifeEnd = s.life;
    s.item = null;
    s.loot = null;
    s.phase = 'end';
  }
}

// ---- Reading an item ----

/** An item by its id. */
export const itemOf = (id: string) => BY_ID.get(id)!;

/** The answer's board name. */
export const answerOf = (it: ItemPlay) => it.names.find((nm) => nm.id === it.itemId)!;

/** The names not struck. */
export const remaining = (it: ItemPlay) => it.names.filter((nm) => !it.struck.includes(nm.id));

/** Whether a syllable is greyed out: no name left on the board uses it, or a Decoy sweep took it. */
export const greyed = (it: ItemPlay, tile: string) => it.swept.includes(tile) || !remaining(it).some((nm) => nm.words.some((w) => w.includes(tile)));

/** The syllables only wrong names left on the board use, not greyed out yet: what a Decoy sweep can take. */
export function decoys(it: ItemPlay) {
  const answer = new Set(answerOf(it).words.flat());
  return it.tiles.filter((t) => !answer.has(t) && !greyed(it, t));
}

/** A clue file's common mod lines: their places in the tooltip. */
export const commonLines = (clues: Clues) => clues.mods.flatMap(([, , shared], i) => (shared >= COMMON_LINE ? [i] : []));

/** The open item's common mod lines not shown yet. */
export const commonUnshown = (it: ItemPlay) => commonLines(CLUES[it.itemId]).filter((i) => !it.shown.mods.includes(i));

/** The answer's word lengths: its syllables in each word, as Word lengths shows them ("2 · 1 · 1 · 2"). */
export const lengthsOf = (it: ItemPlay) => answerOf(it).words.map((w) => w.length);

/** Whether a syllable starts a word in any name on the board: the answer line puts a space before one. */
export const startsWord = (it: ItemPlay, tile: string) => it.names.some((nm) => nm.words.some((w) => w[0] === tile));

/**
 * The answer line as text: syllables joined, with `spacing` a space before
 * each that starts a word in any name on the board (not first, not after a
 * hyphen). A syllable that starts a word in some names and not in others
 * gets one too, so the spaces never confirm the answer.
 */
export function buildText(it: ItemPlay, spacing: boolean) {
  return it.build.map((syl, i) => (spacing && i > 0 && startsWord(it, syl) && !it.build[i - 1].endsWith('-') ? ` ${syl}` : syl)).join('');
}

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
