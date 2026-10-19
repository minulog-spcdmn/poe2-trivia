// The Wraeclast run's rules (wraeclast.html, src/wraeclast): a solo run of 15
// items, the first playable prototype of the mode. Pure: the run's state is a
// plain object (the page makes it reactive), every action a method that
// changes it, so a run plays the same in a test as on the page.
//
// A run: the camp (a vendor), zones 1 and 2 (three items each), the town
// (heals, a vendor again), zones 3 and 4, then the boss's chain of three. Each
// item: a category card picked (multiplier and all), then its name built from
// syllables (the Inscription), its art under a 4 x 4 veil, the zone's free
// clue, and supplies from the pack to learn more. A miss costs life; a right
// answer pays gold. docs/handoff (the prototype's handoff) has the reasons.

import { Engine, createGame, DEFAULT_SETTINGS, lastPicks, shuffle, type GameState, type Item, type Knobs, type Player } from '../lib/game.ts';
import { seededRandom } from '../lib/patches.ts';
import itemData from '../data/items.json' with { type: 'json' };
import syllableData from '../data/syllables.json' with { type: 'json' };
import clueData from '../data/clues.json' with { type: 'json' };

export type ZoneType = 'plain' | 'incursion' | 'ritual' | 'blight';
export const ZONE_TYPES: readonly ZoneType[] = ['plain', 'incursion', 'ritual', 'blight'];
export const ZONE_NAMES: Record<ZoneType, string> = { plain: 'Plain', incursion: 'Incursion', ritual: 'Ritual', blight: 'Blight' };

export type Supply = 'flare' | 'requirement' | 'wisdom' | 'strike' | 'lore';
export const SUPPLIES: readonly Supply[] = ['flare', 'requirement', 'wisdom', 'strike', 'lore'];
export const SUPPLY_NAMES: Record<Supply, string> = {
  flare: 'Flare',
  requirement: 'Requirement reveal',
  wisdom: 'Scroll of Wisdom',
  strike: 'Name strike',
  lore: 'Lore reveal',
};

/** The parts of a run that share their numbers: zones 1 and 2, zones 3 and 4, the boss. */
export type Section = 'early' | 'late' | 'boss';
export const BOARD_SIZES = [4, 6, 8, 10] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

/** The numbers a run is played with (the page's tuning panel sets them; the log keeps them). */
export interface Tuning {
  life: number;
  gold: number;
  flask: number;
  missCost: Record<Section, number>;
  reward: Record<Exclude<Section, 'boss'>, number>;
  price: Record<Supply, number>;
  board: Record<Section, BoardSize>;
  /** Whether each zone type gives its free clue (off: to see how experts do without). */
  freeClue: Record<ZoneType, boolean>;
  /** Whether the board says how many words the answer has. */
  wordCount: boolean;
}

export const DEFAULT_TUNING: Tuning = {
  life: 100,
  gold: 20,
  flask: 2,
  missCost: { early: 25, late: 35, boss: 60 },
  reward: { early: 5, late: 7 },
  price: { flare: 4, requirement: 3, wisdom: 6, strike: 6, lore: 8 },
  board: { early: 4, late: 6, boss: 10 },
  freeClue: { plain: true, incursion: true, ritual: true, blight: true },
  wordCount: false,
};

export const PACK_SLOTS = 8;
export const ZONES = 4;
export const ZONE_ITEMS = 3;
export const BOSS_ITEMS = 3;
export const ITEMS_IN_RUN = ZONES * ZONE_ITEMS + BOSS_ITEMS;
/** Items done when the town comes: after zone 2. */
export const TOWN_AFTER = 2 * ZONE_ITEMS;
export const TOWN_HEAL = 20;
/** A drink heals this much after each of the next FLASK_ITEMS items. */
export const FLASK_STEP = 10;
export const FLASK_ITEMS = 3;
/** The veil's grid: 4 x 4 patches. */
export const GRID = 4;
export const PATCHES = GRID * GRID;
/** A category picked is locked for this many picks after. */
export const LOCKOUT = 3;
/** Blight puts this many more names on the board. */
export const BLIGHT_NAMES = 2;
/** The board never holds more names than this, and Name strike never leaves fewer than MIN_NAMES. */
export const MAX_NAMES = 10;
export const MIN_NAMES = 3;
/** A card's multiplier, and how often it comes up against the others. */
export const MULTIPLIERS: readonly [number, number][] = [
  [1, 4],
  [1.25, 3],
  [1.5, 2],
  [2, 1],
];

/** How the board is asked for: the engine's own questions, name mode, look-alike names first, none made up. */
const KNOBS: Knobs = { options: 4, similarNames: 1, fakes: 0, artChance: 0, veil: 'off', grayscale: 'off', mirror: 0, lockout: 0 };

export type Clues = { req: string[]; mods: [string, string][]; flavor: string | null };
export const ITEMS = itemData as Item[];
export const SYLLABLES = syllableData as Record<string, string[][]>;
export const CLUES = clueData as unknown as Record<string, Clues>;

/** What a zone gave for free when an item opened. */
export type FreeClue = 'none' | 'patch' | 'patches' | 'flavor' | 'mod';

export type Phase = 'camp' | 'town' | 'between' | 'deal' | 'item' | 'end';

export interface Card {
  category: string;
  multiplier: number;
}

export interface BoardName {
  id: string;
  name: string;
  /** Its words, each as its syllables (syllables.json). */
  words: string[][];
}

export interface ItemLog {
  itemId: string;
  name: string;
  category: string;
  /** The zone's type, or "boss". */
  zone: ZoneType | 'boss';
  /** Which zone: 1 to 4, or 5 for the boss. */
  zoneNo: number;
  boss: boolean;
  /** How many names the board held. */
  names: number;
  freeClue: FreeClue;
  multiplier: number;
  supplies: { type: Supply; order: number; ms: number }[];
  /** Patches lifted, the free ones too. */
  patches: number;
  submits: { text: string; right: boolean; ms: number }[];
  lifeBefore: number;
  lifeAfter: number;
  /** The flask's heal after it (in lifeAfter already). */
  healed: number;
  gold: number;
  /** Whether a flask was drunk before it (since the item before). */
  drank: boolean;
}

export interface ItemPlay {
  /** Its place in the run, 0 to 14. */
  n: number;
  /** 1 to 4, or 5 at the boss. */
  zoneNo: number;
  /** Which of the boss's three, or null before the boss. */
  boss: number | null;
  category: string;
  multiplier: number;
  itemId: string;
  /** The names on the board, the answer among them. */
  names: BoardName[];
  /** The distinct syllables of every name on the board, shuffled. */
  tiles: string[];
  /** Ids of the names struck from the board. */
  struck: string[];
  /** Which of the 16 patches are lifted, row by row. */
  lifted: boolean[];
  /**
   * Which patches have nothing of the art's own box under them, row by row:
   * the page letterboxes a small or narrow item's art so its patches are big
   * enough to tap, and the patches over the letterbox alone (setBare) can't
   * be lifted and don't count as covered.
   */
  bare: boolean[];
  /** Random patches the zone (or the boss) still lifts as the item opens. */
  freePatches: number;
  /**
   * Patches the Flares used can still lift (the player taps them); `reach`
   * says how many of those can be lifted now (no more than are covered).
   */
  flare: number;
  /** What the clues show: the requirements, how many mod lines, the flavour text. */
  shown: { req: boolean; mods: number; flavor: boolean };
  freeClue: FreeClue;
  /** The syllables placed on the answer line, in order. */
  build: string[];
  misses: number;
  /** When it opened (the art in place), or null while it's being laid out. */
  openedAt: number | null;
  log: ItemLog;
}

/** The item just done, for the screen between items. */
export interface LastItem {
  itemId: string;
  name: string;
  right: boolean;
  gold: number;
  misses: number;
  healed: number;
}

export interface RunLog {
  v: 1;
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
  bought: Record<Supply, number>;
  used: Record<Supply, number>;
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
  /** The four zones' types, zone 1 first: all different. */
  zones: ZoneType[];
  phase: Phase;
  life: number;
  maxLife: number;
  gold: number;
  flask: { charges: number; /** Items the last drink still heals after. */ recovering: number };
  pack: Supply[];
  /** Categories locked for the next picks. */
  recent: string[];
  /** The boss's categories so far: never the same twice. */
  bossCats: string[];
  /** Items done. */
  done: number;
  /** The cards on offer (the boss's one at the boss). */
  offer: Card[];
  item: ItemPlay | null;
  last: LastItem | null;
  /** Drunk since the last item. */
  drank: boolean;
  /** The town's heal on arrival, for its screen. */
  arrivalHeal: number;
  log: RunLog;
}

const zero = (): Record<Supply, number> => ({ flare: 0, requirement: 0, wisdom: 0, strike: 0, lore: 0 });

/**
 * A name as the board compares it: no spaces, any case. A tile keeps its
 * case ("Heart" starts a word, "heart" ends Blackheart), but building a name
 * with the other one ("the" for "The") is no miss.
 */
const key = (text: string) => text.replace(/\s+/g, '').toLowerCase();
/** Whether two syllables are the same but for their case. */
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The section an item (0 to 14) is in. */
export const sectionOf = (n: number): Section => (n >= ZONES * ZONE_ITEMS ? 'boss' : n >= TOWN_AFTER ? 'late' : 'early');
/** The zone an item (0 to 14) is in: 1 to 4, 5 for the boss. */
export const zoneOf = (n: number) => Math.min(ZONES + 1, Math.floor(n / ZONE_ITEMS) + 1);

/** A draw from the multipliers, by their weights. */
function rollMultiplier(rng: () => number) {
  const total = MULTIPLIERS.reduce((t, [, w]) => t + w, 0);
  let r = rng() * total;
  for (const [m, w] of MULTIPLIERS) if ((r -= w) < 0) return m;
  return MULTIPLIERS[0][0];
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
  readonly engine: Engine;
  private readonly game: GameState;
  private readonly rng: () => number;
  private readonly now: () => number;

  constructor({ tuning = DEFAULT_TUNING, seed = Math.floor(Math.random() * 2 ** 32), now = Date.now, viewport = 0 }: RunOptions = {}) {
    this.rng = seededRandom(seed);
    this.now = now;
    this.engine = new Engine(ITEMS, { rng: this.rng });
    this.game = createGame(null, { ...DEFAULT_SETTINGS, difficulty: 'custom', custom: { ...KNOBS } });
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
      recent: [],
      bossCats: [],
      done: 0,
      offer: [],
      item: null,
      last: null,
      drank: false,
      arrivalHeal: 0,
      log: {
        v: 1,
        seed,
        start: new Date(now()).toISOString(),
        end: null,
        result: null,
        endedOn: null,
        zones: [...zones],
        misses: 0,
        noSupply: 0,
        bought: zero(),
        used: zero(),
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

  /** The zone type of zone 1 to 4 (null at the boss). */
  zoneType(zoneNo: number): ZoneType | null {
    return zoneNo >= 1 && zoneNo <= ZONES ? this.state.zones[zoneNo - 1] : null;
  }

  /** How many names the board of item n holds (before the engine caps a rare group's). */
  boardSize(n: number): number {
    const base = this.state.tuning.board[sectionOf(n)];
    const blight = this.zoneType(zoneOf(n)) === 'blight' ? BLIGHT_NAMES : 0;
    return Math.min(MAX_NAMES, base + blight);
  }

  /** Whether a supply can be bought now: at a vendor, with the gold and a free slot. */
  canBuy(supply: Supply): boolean {
    const s = this.state;
    return (s.phase === 'camp' || s.phase === 'town') && s.gold >= s.tuning.price[supply] && s.pack.length < PACK_SLOTS;
  }

  /** Whether the flask can be drunk now: between items, with a charge left. */
  canDrink(): boolean {
    const s = this.state;
    return (s.phase === 'camp' || s.phase === 'town' || s.phase === 'between') && s.flask.charges > 0;
  }

  /** Whether a supply has anything to show on the open item (whether or not the pack holds one). */
  works(supply: Supply): boolean {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || it.openedAt === null) return false;
    // The boss is Silent: only Flares work.
    if (it.boss !== null && supply !== 'flare') return false;
    const clues = CLUES[it.itemId];
    switch (supply) {
      case 'flare':
        return covered(it) > reach(it);
      case 'requirement':
        return !it.shown.req && clues.req.length > 0;
      case 'wisdom':
        return it.shown.mods < clues.mods.length;
      case 'strike':
        return remaining(it).length > MIN_NAMES;
      case 'lore':
        return this.zoneType(it.zoneNo) !== 'ritual' && !it.shown.flavor && clues.flavor !== null;
    }
  }

  /** Whether a supply can be used now: one in the pack, and something for it to show. */
  canUse(supply: Supply): boolean {
    return this.state.pack.includes(supply) && this.works(supply);
  }

  /** How many patches a Flare lifts on the open item. */
  flareLifts(): number {
    const it = this.state.item;
    if (!it) return 2;
    if (it.boss === BOSS_ITEMS - 1) return 1;
    if (this.zoneType(it.zoneNo) === 'incursion') return 1;
    return 2;
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
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || it.openedAt === null || !it.build.length) return false;
    return this.blocked() === null;
  }

  // ---- Actions ----

  buy(supply: Supply): boolean {
    if (!this.canBuy(supply)) return false;
    const s = this.state;
    const price = s.tuning.price[supply];
    s.gold -= price;
    s.pack.push(supply);
    s.log.bought[supply]++;
    s.log.goldSpent += price;
    return true;
  }

  /** Drinks a charge: it heals FLASK_STEP after each of the next FLASK_ITEMS items. A drink while one still heals starts over; the rest of that one is lost. */
  drink(): boolean {
    if (!this.canDrink()) return false;
    const s = this.state;
    s.flask.charges--;
    s.flask.recovering = FLASK_ITEMS;
    s.drank = true;
    s.log.drinks++;
    return true;
  }

  /** Leaves the camp or the town for the next zone. */
  leave(): boolean {
    const s = this.state;
    if (s.phase !== 'camp' && s.phase !== 'town') return false;
    this.deal();
    return true;
  }

  /** From the screen between items to the next: the town after zone 2, else the next deal. */
  next(): boolean {
    const s = this.state;
    if (s.phase !== 'between') return false;
    if (s.done === TOWN_AFTER) {
      const heal = Math.min(TOWN_HEAL, s.maxLife - s.life);
      s.life += heal;
      s.arrivalHeal = heal;
      s.phase = 'town';
      return true;
    }
    this.deal();
    return true;
  }

  /** Deals the next item's cards: three to pick from, or at the boss the one it picks. */
  private deal() {
    const s = this.state;
    if (sectionOf(s.done) === 'boss') {
      const left = this.engine.categories.filter((c) => !s.bossCats.includes(c));
      const category = left[Math.floor(this.rng() * left.length)];
      s.offer = [{ category, multiplier: 1 }];
    } else {
      const cats = this.engine.offerCategories(this.game, { recent: s.recent } as Player);
      s.offer = cats.map((category) => ({ category, multiplier: rollMultiplier(this.rng) }));
    }
    s.phase = 'deal';
  }

  /** Picks a card (at the boss, its one): the item is drawn and its board laid out. It opens with open(). */
  pick(i: number): boolean {
    const s = this.state;
    const card = s.offer[i];
    if (s.phase !== 'deal' || !card) return false;
    const n = s.done;
    const zoneNo = zoneOf(n);
    const boss = sectionOf(n) === 'boss' ? n - ZONES * ZONE_ITEMS : null;
    if (boss === null) s.recent = lastPicks([...s.recent, card.category], LOCKOUT);
    else s.bossCats.push(card.category);
    this.game.settings.custom = { ...KNOBS, options: this.boardSize(n) };
    const q = this.engine.makeQuestion(this.game, card.category);
    this.game.used.push(q.itemId);
    const names = q.options.map((id) => ({ id, name: this.engine.byId.get(id)!.name, words: SYLLABLES[id] }));
    const tiles = shuffle([...new Set(names.flatMap((nm) => nm.words.flat()))], this.rng);
    const zone = this.zoneType(zoneNo);
    const t = s.tuning;
    const clues = CLUES[q.itemId];
    let freeClue: FreeClue = 'none';
    let freePatches = 0;
    const shown = { req: false, mods: 0, flavor: false };
    if (boss !== null) {
      // The boss's first item starts with one patch lifted, the others with nothing.
      if (boss === 0) [freeClue, freePatches] = ['patch', 1];
    } else if (zone && t.freeClue[zone]) {
      if (zone === 'plain') [freeClue, freePatches] = ['patch', 1];
      else if (zone === 'blight') [freeClue, freePatches] = ['patches', 2];
      else if (zone === 'incursion' && clues.flavor !== null) [freeClue, shown.flavor] = ['flavor', true];
      else if (zone === 'ritual' && clues.mods.length) [freeClue, shown.mods] = ['mod', 1];
    }
    const name = this.engine.byId.get(q.itemId)!.name;
    s.item = {
      n,
      zoneNo,
      boss,
      category: card.category,
      multiplier: card.multiplier,
      itemId: q.itemId,
      names,
      tiles,
      struck: [],
      lifted: Array(PATCHES).fill(false),
      bare: Array(PATCHES).fill(false),
      freePatches,
      flare: 0,
      shown,
      freeClue,
      build: [],
      misses: 0,
      openedAt: null,
      log: {
        itemId: q.itemId,
        name,
        category: card.category,
        zone: zone ?? 'boss',
        zoneNo,
        boss: boss !== null,
        names: names.length,
        freeClue,
        multiplier: card.multiplier,
        supplies: [],
        patches: 0,
        submits: [],
        lifeBefore: s.life,
        lifeAfter: s.life,
        healed: 0,
        gold: 0,
        drank: s.drank,
      },
    };
    s.drank = false;
    s.offer = [];
    s.phase = 'item';
    return true;
  }

  /**
   * Opens the item laid out by pick(): its free patches lifted at random, from
   * those that cover some of the art where `coverage` says how much of each
   * patch the art fills (0 to 1, row by row; the page measures it once the
   * picture is decoded). Its clock starts here.
   */
  open(coverage: number[] | null = null): boolean {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || it.openedAt !== null) return false;
    for (let k = 0; k < it.freePatches; k++) {
      const closed = it.lifted.flatMap((up, i) => (up || it.bare[i] ? [] : [i]));
      const showing = coverage ? closed.filter((i) => (coverage[i] ?? 0) >= 0.08) : [];
      const from = showing.length ? showing : closed;
      if (!from.length) break;
      it.lifted[from[Math.floor(this.rng() * from.length)]] = true;
    }
    it.freePatches = 0;
    it.log.patches = it.lifted.filter(Boolean).length;
    it.openedAt = this.now();
    return true;
  }

  /** Milliseconds since the open item opened. */
  private since(it: ItemPlay) {
    return Math.max(0, this.now() - (it.openedAt ?? this.now()));
  }

  /** Uses a supply from the pack on the open item. A Flare then waits for the patches to be tapped (lift). */
  use(supply: Supply): boolean {
    if (!this.canUse(supply)) return false;
    const s = this.state;
    const it = s.item!;
    s.pack.splice(s.pack.indexOf(supply), 1);
    switch (supply) {
      case 'flare':
        // Its lifts all kept: reach() says how many can be lifted now, and a
        // layout that bares patches for a while costs none of them.
        it.flare += this.flareLifts();
        break;
      case 'requirement':
        it.shown.req = true;
        break;
      case 'wisdom':
        it.shown.mods++;
        break;
      case 'strike': {
        const wrong = remaining(it).filter((nm) => nm.id !== it.itemId);
        it.struck.push(wrong[Math.floor(this.rng() * wrong.length)].id);
        break;
      }
      case 'lore':
        it.shown.flavor = true;
        break;
    }
    it.log.supplies.push({ type: supply, order: it.log.supplies.length + 1, ms: this.since(it) });
    s.log.used[supply]++;
    return true;
  }

  /**
   * Says which patches are bare (row by row: nothing of the art's box under
   * them, as the page lays the art out now). A lifted patch stays lifted. A
   * Flare's lifts are kept: a layout that bares patches only lowers its reach
   * for as long as it lasts (a phone turned, a window resized).
   */
  setBare(bare: boolean[]): boolean {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || bare.length !== PATCHES) return false;
    it.bare = bare.map((b, i) => b && !it.lifted[i]);
    return true;
  }

  /** Lifts a patch the Flare in hand reaches (0 to 15, row by row; not a bare one). */
  lift(i: number): boolean {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || reach(it) <= 0 || i < 0 || i >= PATCHES || it.lifted[i] || it.bare[i]) return false;
    it.lifted[i] = true;
    it.flare--;
    it.log.patches = it.lifted.filter(Boolean).length;
    return true;
  }

  /** Adds a syllable to the answer line (one no name left on the board uses, in either case, can't be). */
  place(tile: string): boolean {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || it.openedAt === null || !it.tiles.includes(tile) || greyed(it, tile)) return false;
    it.build.push(tile);
    return true;
  }

  /** Takes the syllable at `index` back off the answer line. */
  unplace(index: number): boolean {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || index < 0 || index >= it.build.length) return false;
    it.build.splice(index, 1);
    return true;
  }

  clear(): boolean {
    const it = this.state.item;
    if (this.state.phase !== 'item' || !it || !it.build.length) return false;
    it.build = [];
    return true;
  }

  /**
   * Submits the answer line. Right: the item pays and ends. Wrong: life drops,
   * the reward halves, and a name of the board's is struck. At 0 life the run
   * ends. Returns whether it was right, or null if nothing could be submitted.
   */
  submit(): boolean | null {
    if (!this.canSubmit()) return null;
    const s = this.state;
    const it = s.item!;
    const text = buildText(it);
    const k = key(it.build.join(''));
    const answer = it.names.find((nm) => nm.id === it.itemId)!;
    const right = key(answer.name) === k;
    it.log.submits.push({ text, right, ms: this.since(it) });
    if (right) {
      const section = sectionOf(it.n);
      const gold = section === 'boss' ? 0 : Math.floor((s.tuning.reward[section] * it.multiplier) / 2 ** it.misses);
      s.gold += gold;
      s.log.goldEarned += gold;
      it.log.gold = gold;
      if (!it.log.supplies.length) s.log.noSupply++;
      this.finish(true);
      return true;
    }
    it.misses++;
    s.log.misses++;
    s.life = Math.max(0, s.life - s.tuning.missCost[sectionOf(it.n)]);
    const named = it.names.find((nm) => nm.id !== it.itemId && !it.struck.includes(nm.id) && key(nm.name) === k);
    if (named) it.struck.push(named.id);
    if (s.life <= 0) this.finish(false);
    return false;
  }

  /** The item ends: the flask heals (unless the run is lost), and the run moves on or ends. */
  private finish(right: boolean) {
    const s = this.state;
    const it = s.item!;
    let healed = 0;
    if (right && s.flask.recovering > 0) {
      healed = Math.min(FLASK_STEP, s.maxLife - s.life);
      s.life += healed;
      s.flask.recovering--;
    }
    it.log.lifeAfter = s.life;
    it.log.healed = healed;
    it.log.patches = it.lifted.filter(Boolean).length;
    s.log.items.push(it.log);
    s.last = { itemId: it.itemId, name: it.log.name, right, gold: it.log.gold, misses: it.misses, healed };
    s.done++;
    if (!right || s.done === ITEMS_IN_RUN) {
      s.log.end = new Date(this.now()).toISOString();
      s.log.result = right ? 'win' : 'loss';
      s.log.endedOn = { n: it.n, itemId: it.itemId, name: it.log.name };
      s.log.lifeEnd = s.life;
      s.phase = 'end';
    } else {
      s.phase = 'between';
    }
    s.item = null;
  }
}

// ---- Reading an item ----

/** Patches still covered (a bare one covers nothing). */
export const covered = (it: ItemPlay) => it.lifted.filter((up, i) => !up && !it.bare[i]).length;

/** Patches the Flares used can lift now: their lifts left, no more than are covered. */
export const reach = (it: ItemPlay) => Math.min(it.flare, covered(it));

/** The names not struck. */
export const remaining = (it: ItemPlay) => it.names.filter((nm) => !it.struck.includes(nm.id));

/** Whether no name left on the board uses a syllable, in either case (it's greyed out). */
export const greyed = (it: ItemPlay, tile: string) => !remaining(it).some((nm) => nm.words.some((w) => w.some((syl) => same(syl, tile))));

/** The answer's word count. */
export const answerWords = (it: ItemPlay) => it.names.find((nm) => nm.id === it.itemId)!.words.length;

/**
 * Whether a syllable starts a word on this board: wherever a name on it uses
 * the syllable, it's a word's first. The answer line puts a space before one.
 */
export function startsWord(it: ItemPlay, tile: string) {
  const places = it.names.flatMap((nm) => nm.words.flatMap((w) => w.flatMap((syl, i) => (syl === tile ? [i] : []))));
  return places.length > 0 && places.every((i) => i === 0);
}

/** The answer line as text: syllables joined, a space before each that starts a word (not after a hyphen). */
export function buildText(it: ItemPlay) {
  return it.build.map((syl, i) => (i > 0 && startsWord(it, syl) && !it.build[i - 1].endsWith('-') ? ` ${syl}` : syl)).join('');
}
