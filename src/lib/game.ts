// Pure game logic. The host (or the single device in hot-seat mode) is the only
// place this runs; everyone else just renders the state it broadcasts.

import { cleanName, nameProblem, nameSkeleton } from './names.ts';
import { RUBY } from './palette.ts';

export interface Item {
  id: string;
  name: string;
  base: string;
  /** Fine-grained class (Rings, Bows, Strength gems…) used for tough decoys. */
  group: string;
  /** Broad category offered to players. */
  category: string;
  kind: 'unique' | 'gem';
}

/** The three ready-made difficulties. */
export type Preset = 'cruel' | 'merciless' | 'eternal';
/** A preset, or the host's own mix of the knobs. */
export type Difficulty = Preset | 'custom';

/** Name the item from its art, or pick the right art for a name. */
export type QuestionMode = 'name' | 'art';

/** How the art burns into view: not at all, or ever slower in ever finer patches. */
export type VeilSpeed = 'off' | 'fast' | 'slow' | 'slowest';
/** Which art is shown without colour: none, the pictures of "find the art" questions, or all of it. */
export type Grayscale = 'off' | 'art' | 'all';

/** What a difficulty is made of: each knob takes one of the values in `KNOB_STEPS`. */
export interface Knobs {
  options: number;
  /** Share of decoys picked for having a name that looks like the answer. */
  similarNames: number;
  /** Decoys swapped for made-up names on "name" questions. */
  fakes: number;
  /** Share of "art" questions instead of "name" ones (the roll leans against long runs of either). */
  artChance: number;
  /** The art burns into view patch by patch (presets: race only). */
  veil: VeilSpeed;
  grayscale: Grayscale;
  /** Chance of each picture being shown flipped left to right. */
  mirror: number;
  /** How many turns a chosen category stays locked. */
  lockout: number;
}

/** The values each knob can take, easiest first (the last ones go past Eternal). */
export const KNOB_STEPS = {
  options: [4, 6, 8, 10],
  similarNames: [0, 0.5, 1],
  fakes: [0, 1, 2, 3],
  artChance: [0, 0.4, 0.5, 1],
  veil: ['off', 'fast', 'slow', 'slowest'],
  grayscale: ['off', 'art', 'all'],
  mirror: [0, 0.3, 0.5, 1],
  lockout: [0, 2, 3, 4, 5],
} as const satisfies { [K in keyof Knobs]: readonly Knobs[K][] };

export const PRESETS: Record<Preset, Knobs> = {
  cruel: { options: 4, similarNames: 0, fakes: 0, artChance: 0.4, veil: 'off', grayscale: 'off', mirror: 0, lockout: 2 },
  merciless: { options: 6, similarNames: 0.5, fakes: 1, artChance: 0.4, veil: 'fast', grayscale: 'off', mirror: 0, lockout: 3 },
  eternal: { options: 8, similarNames: 1, fakes: 2, artChance: 0.5, veil: 'slow', grayscale: 'art', mirror: 0.3, lockout: 4 },
};

/**
 * How finely the art is cut (patches about as big as the tiles of a size ×
 * size grid over the picture), and the share of the timer it takes the last
 * patch to appear.
 */
const VEILS: Record<VeilSpeed, { size: number; share: number } | null> = {
  off: null,
  fast: { size: 5, share: 0.55 },
  slow: { size: 7, share: 0.7 },
  slowest: { size: 9, share: 0.8 },
};

/** The knobs as the engine uses them. */
export interface DifficultyRules extends Omit<Knobs, 'veil'> {
  /** The art burns into view patch by patch; fraction of the timer it takes. */
  veil: { size: number; share: number } | null;
}

/** Knobs from anywhere (an action, an old save): each one off the allowed steps takes its value in `fallback`. */
export function cleanKnobs(raw: unknown, fallback: Knobs = PRESETS[DEFAULT_PRESET]): Knobs {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out = { ...fallback } as Record<keyof Knobs, unknown>;
  for (const k of Object.keys(KNOB_STEPS) as (keyof Knobs)[]) {
    if ((KNOB_STEPS[k] as readonly unknown[]).includes(o[k])) out[k] = o[k];
  }
  const knobs = out as unknown as Knobs;
  knobs.fakes = Math.min(knobs.fakes, maxFakes(knobs.options));
  return knobs;
}

/**
 * Most made-up names a question with `options` options can show: each one
 * copies a real name that stays on screen, so they take up two options each.
 */
export function maxFakes(options: number) {
  return Math.floor(options / 2);
}

/** One step harder on every knob that makes a question harder (a deathmatch on Eternal or Custom). */
function harderKnobs(k: Knobs): Knobs {
  const up = <K extends keyof Knobs>(key: K): Knobs[K] => {
    const steps = KNOB_STEPS[key] as unknown as readonly Knobs[K][];
    return steps[Math.min(steps.length - 1, steps.indexOf(k[key]) + 1)];
  };
  // The question mix and lockout stay, and a veil the host turned off stays off.
  return {
    ...k,
    options: up('options'),
    similarNames: up('similarNames'),
    fakes: up('fakes'),
    veil: k.veil === 'off' ? 'off' : up('veil'),
    grayscale: up('grayscale'),
    mirror: up('mirror'),
  };
}

/**
 * Groups that come up less often (relative weight when picking the answer),
 * and only appear as decoys when nothing else fits. Players found precursor
 * tablets a chore.
 */
export const RARE_GROUPS: Record<string, number> = { Tablets: 0.25 };

const weightOf = (it: Item) => RARE_GROUPS[it.group] ?? 1;

/**
 * How hard the art/name roll leans toward whichever has come up less than its
 * share: each question it runs behind adds this much to its chance.
 */
const ART_LEAN = 0.3;

/** Categories that were renamed, by their old name. */
const RENAMED_CATEGORIES: Record<string, string> = { 'Flasks, Jewels & Relics': 'Flasks, Charms, Jewels, Relics & Tablets' };

/** Categories and groups named as a single item, for the line under "Unidentified". */
const SINGULAR: Record<string, string> = {
  'Amulets & Belts': 'Amulet or Belt',
  'Body Armours': 'Body Armour',
  'Flasks, Charms, Jewels, Relics & Tablets': 'Flask, Charm, Jewel, Relic or Tablet',
  'Gloves & Boots': 'Gloves or Boots',
  'Lineage Gems': 'Lineage Gem',
  'Off-Hands': 'Off-Hand',
  'One-Handed Weapons': 'One-Handed Weapon',
  'Two-Handed Weapons': 'Two-Handed Weapon',
  Amulets: 'Amulet',
  Belts: 'Belt',
  Boots: 'Boots',
  Bows: 'Bow',
  Charms: 'Charm',
  Crossbows: 'Crossbow',
  Flasks: 'Flask',
  Foci: 'Focus',
  Gloves: 'Gloves',
  Helmets: 'Helmet',
  Jewels: 'Jewel',
  'One-Handed Maces': 'One-Handed Mace',
  Quarterstaves: 'Quarterstaff',
  Quivers: 'Quiver',
  Relics: 'Relic',
  Rings: 'Ring',
  Sceptres: 'Sceptre',
  Shields: 'Shield',
  Spears: 'Spear',
  Staves: 'Staff',
  Tablets: 'Tablet',
  Talismans: 'Talisman',
  'Two-Handed Maces': 'Two-Handed Mace',
  Wands: 'Wand',
};

/** A category or group named as a single item ("Rings" → "Ring"). */
export function singular(name: string) {
  return SINGULAR[name] ?? name;
}

/** A game saved before categories were renamed, with the new names. */
export function renameCategories(s: GameState): GameState {
  const rename = (c: string) => RENAMED_CATEGORIES[c] ?? c;
  return {
    ...s,
    players: s.players.map((p) => ({ ...p, recent: p.recent.map(rename) })),
    offered: s.offered.map(rename),
    recentCategories: s.recentCategories.map(rename),
    question: s.question && { ...s.question, category: rename(s.question.category) },
  };
}

/**
 * What the question is about: its groups when that is shorter than the category
 * name. `one` names a single item ("Flask or Relic") for the unidentified item.
 */
export function questionTopic(q: Question, one = false): string {
  const groups = q.groups?.join(' • ');
  if (!groups || groups.length >= q.category.length) return one ? singular(q.category) : q.category;
  if (!one) return groups;
  const names = q.groups!.map(singular);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0];
}

/** Option ids of made-up names: `fake:<id of the item it copies>:<which of its fakes>`. */
const FAKE_PREFIX = 'fake:';

/** A made-up name, not a real item. */
export function isFake(optionId: string): boolean {
  return optionId.startsWith(FAKE_PREFIX);
}

/** A known difficulty (its own key, so names like "toString" don't count). */
export function isDifficulty(d: unknown): d is Difficulty {
  return d === 'custom' || (typeof d === 'string' && Object.hasOwn(PRESETS, d));
}

/** The difficulty to play, falling back to the default for a missing or unknown one. */
export function difficultyOf(d: unknown): Difficulty {
  return isDifficulty(d) ? d : DEFAULT_SETTINGS.difficulty;
}

/**
 * The knobs a room plays with: its preset's, or the host's own; `harder` for
 * deathmatch questions (one preset up, or one step up on each custom knob). A
 * preset only veils the art in race: on your own turn nobody beats you to the
 * answer, so waiting for it is just a delay. A custom veil applies in both modes.
 */
export function knobsOf(settings: Pick<Settings, 'difficulty'> & Partial<Settings>, harder = false): Knobs {
  const d = difficultyOf(settings.difficulty);
  if (d === 'custom') {
    const k = cleanKnobs(settings.custom);
    return harder ? harderKnobs(k) : k;
  }
  // Past Eternal, a deathmatch goes on to the steps no preset uses.
  const k = !harder ? PRESETS[d] : d === 'eternal' ? harderKnobs(PRESETS.eternal) : PRESETS[HARDER[d]];
  return settings.mode === 'race' ? { ...k } : { ...k, veil: 'off' };
}

/** The rules a room plays with (see `knobsOf`). */
export function rulesFor(settings: Pick<Settings, 'difficulty'> & Partial<Settings>, harder = false): DifficultyRules {
  const k = knobsOf(settings, harder);
  return { ...k, veil: VEILS[k.veil] };
}

/** The rules for the current question (deathmatch questions are one tier harder). */
export function activeRules(s: GameState): DifficultyRules {
  return rulesFor(s.settings, !!s.deathmatch);
}

/** The last `lockout` categories of a list (none for a lockout of 0). */
export const lastPicks = (picks: string[], lockout: number) => (lockout > 0 ? picks.slice(-lockout) : []);

export interface Veil {
  size: number;
  /** Seconds until the last patch has appeared. */
  seconds: number;
  seed: number;
}

export interface Deathmatch {
  /** Players still in, in turn order. */
  alive: string[];
  /** Everyone who entered the deathmatch. */
  entrants: string[];
  round: number;
  /** This round's answers so far: player id → answered correctly. */
  results: Record<string, boolean>;
  /** Knocked out at the end of the previous round. */
  eliminated: string[];
  /** turnCount when it started (lets clients play the intro once). */
  startedAt: number;
}

/** Deathmatch questions are one tier harder (Eternal goes one step up on each knob). */
const HARDER: Record<Exclude<Preset, 'eternal'>, Preset> = { cruel: 'merciless', merciless: 'eternal' };

export type Phase = 'lobby' | 'choosing' | 'question' | 'reveal' | 'over';

export interface Player {
  id: string;
  name: string;
  score: number;
  /** Categories this player picked on their last turns (most recent last). */
  recent: string[];
  connected: boolean;
  /** Stable colour slot for avatars. */
  hue: number;
}

/**
 * turns: players take turns choosing a category and answering.
 * race: everyone answers the same question; first correct answer scores,
 * wrong answers cost a point and lock that player out of the question.
 */
export type GameMode = 'turns' | 'race';

export interface Settings {
  targetScore: number;
  /** Seconds per question, 0 = no timer (race mode always uses a timer). */
  timer: number;
  difficulty: Difficulty;
  /** The knobs for the "custom" difficulty, kept while a preset is picked (missing until it's first chosen). */
  custom?: Knobs;
  mode: GameMode;
  /** Online rooms only: listed in the "open rooms" browser. */
  public: boolean;
  /** No new players may join (people already in the game can still rejoin). */
  locked: boolean;
}

/** Answers sent just before time ran out still count if they arrive this late (network delay). */
export const ANSWER_GRACE_MS = 500;

/** Online, a reveal moves on by itself this long after it was shown. */
export const AUTO_NEXT_MS = 4000;

/**
 * Milliseconds until a reveal stamped `at` moves on by itself, at host-clock
 * time `now` (the full delay for a reveal without a stamp).
 */
export function autoNextLeft(at: number | undefined, now: number) {
  return at === undefined ? AUTO_NEXT_MS : Math.min(AUTO_NEXT_MS, Math.max(0, at + AUTO_NEXT_MS - now));
}

/** Race questions need an end, so "no timer" falls back to this. */
export const RACE_DEFAULT_TIMER = 30;

export interface Question {
  category: string;
  /**
   * Groups of the options on screen (Boots, Charms…), sorted, a made-up name
   * counting under the item it copies. Says what is in play without pointing
   * at the answer. Empty for gems and when a group has a single option;
   * missing in older saves.
   */
  groups?: string[];
  mode: QuestionMode;
  /** The answer. Empty in the copy guests receive until the reveal. */
  itemId: string;
  /** Option item ids in display order. Empty for guests until the reveal. */
  options: string[];
  /** Name questions: option names in display order. Art questions: nulls. */
  labels: (string | null)[];
  /** Art questions: the name to find the picture for. */
  prompt: string | null;
  /** The art burning into view patch by patch on name questions (merciless and up). */
  veil: Veil | null;
  /**
   * Pictures shown flipped left to right (eternal): one flag per option on art
   * questions, one for the art on name questions. Empty for guests until the
   * reveal (missing in games saved before it existed).
   */
  mirrored?: boolean[];
  /** Host-clock timestamp when the question was asked. */
  askedAt: number;
  /** Host-clock timestamp when time runs out, null without timer. */
  deadline: number | null;
  /** Race mode: wrong answers so far, in order. Those players are locked out. */
  misses: { playerId: string; index: number }[];
}

export interface Reveal {
  correctId: string;
  chosenId: string | null;
  correctIndex: number;
  chosenIndex: number | null;
  correct: boolean;
  timedOut: boolean;
  /** Race mode: who answered correctly first. */
  winnerId: string | null;
  /** Host-clock timestamp of the reveal, so every screen counts down to the same move on (missing in older saves). */
  at?: number;
}

/** Someone who joined a running game: they watch until the next game starts. */
export interface Spectator {
  id: string;
  name: string;
}

export interface GameState {
  phase: Phase;
  hostId: string | null;
  players: Player[];
  /** Watching this game; they get a seat when the host starts the next one (missing in older saves). */
  spectators?: Spectator[];
  settings: Settings;
  /** Index into players of whose turn it is. */
  turn: number;
  round: number;
  turnCount: number;
  offered: string[];
  question: Question | null;
  reveal: Reveal | null;
  /**
   * Items asked about in this room, and made-up names someone fell for (not
   * asked again). Kept from one game to the next, so a new game in the same
   * room doesn't repeat the last one; categories start over as they run out.
   */
  used: string[];
  winners: string[];
  /** Sudden-death playoff between players tied at or above the target. */
  deathmatch: Deathmatch | null;
  /** Race mode: categories of the last questions, to avoid repeats. */
  recentCategories: string[];
  /**
   * How many art questions each player is behind the difficulty's share
   * (negative: ahead), by player id; race mode keeps one for the room under
   * "". Missing in older saves.
   */
  artLean?: Record<string, number>;
  /** askedAt of the latest question (missing in games saved before it existed). */
  lastAskedAt?: number;
  /** Bumped on every change so clients can ignore stale messages. */
  version: number;
}

export type Action =
  /** `returning`: set by the host for someone who was already in this room (may pass the lock). */
  | { type: 'join'; playerId: string; name: string; returning?: boolean }
  | { type: 'rename'; playerId: string; name: string }
  | { type: 'remove'; playerId: string }
  | { type: 'connection'; playerId: string; connected: boolean }
  /** `custom`: only the knobs that change. */
  | { type: 'settings'; settings: Partial<Omit<Settings, 'custom'>> & { custom?: Partial<Knobs> } }
  | { type: 'start' }
  | { type: 'pick'; category: string }
  | { type: 'answer'; index: number | null; askedAt?: number }
  | { type: 'next' }
  | { type: 'skip' }
  /** Host: swap the open question for a new one in the same category (its art failed to load). */
  | { type: 'reask' }
  /** Back to the lobby, seating the spectators; with `play`, the next game starts right away. */
  | { type: 'restart'; play?: boolean };

export const OFFER_COUNT = 3;
export const MAX_PLAYERS = 12;
export const MAX_SPECTATORS = 8;

const DEFAULT_PRESET: Preset = 'merciless';
export const DEFAULT_SETTINGS: Settings = {
  targetScore: 10,
  timer: 20,
  difficulty: DEFAULT_PRESET,
  mode: 'turns',
  public: false,
  locked: false,
};

export class ActionError extends Error {
  /** Expected races (e.g. an answer arriving after the question closed): don't bother the user. */
  readonly silent: boolean;
  constructor(message: string, silent = false) {
    super(message);
    this.silent = silent;
  }
}

type Rng = () => number;

export function createGame(hostId: string | null, settings: Settings = DEFAULT_SETTINGS): GameState {
  return {
    phase: 'lobby',
    hostId,
    players: [],
    spectators: [],
    settings: { ...settings },
    turn: 0,
    round: 1,
    turnCount: 0,
    offered: [],
    question: null,
    reveal: null,
    used: [],
    winners: [],
    deathmatch: null,
    recentCategories: [],
    artLean: {},
    lastAskedAt: 0,
    version: 0,
  };
}

/** Spectators take the free seats, in the order they arrived; the rest keep watching. */
function fillSeats(s: GameState) {
  const waiting = s.spectators ?? [];
  while (waiting.length && s.players.length < MAX_PLAYERS) {
    const o = waiting.shift()!;
    seat(s, o.id, o.name);
  }
  s.spectators = waiting;
}

/**
 * Avatar colours that always go to one player, even if someone else had them.
 * Keyed by name skeleton, so every spelling the name check treats as the same
 * person ("Zoe Arcana", "zoe-arcana") counts.
 */
const RESERVED_HUES = new Map([[nameSkeleton('zoe_arcana'), RUBY]]);
const RESERVED = new Set(RESERVED_HUES.values());

/** The colour reserved for this player's name, if any. */
const reservedHue = (p: Player) => RESERVED_HUES.get(nameSkeleton(p.name));

/** The first avatar colour nobody else is using, skipping the reserved ones while others are free. */
function freeHue(s: GameState, except?: Player): number {
  const used = new Set(s.players.filter((p) => p !== except).map((p) => p.hue));
  const free = Array.from({ length: MAX_PLAYERS }, (_, i) => i).filter((h) => !used.has(h));
  return free.find((h) => !RESERVED.has(h)) ?? free[0];
}

/**
 * Gives a player their reserved colour if their name has one, moving whoever
 * had it to a free one; a player without one gives up a reserved colour while
 * others are free. Only between games, so nobody changes colour mid-match.
 */
function settleHue(s: GameState, p: Player) {
  const hue = reservedHue(p);
  if (hue === undefined) {
    if (RESERVED.has(p.hue)) p.hue = freeHue(s, p);
    return;
  }
  if (p.hue === hue) return;
  const holder = s.players.find((o) => o !== p && o.hue === hue);
  p.hue = hue;
  if (holder) holder.hue = freeHue(s, holder);
}

/** Adds a player with the first free avatar colour (or their reserved one). */
function seat(s: GameState, id: string, name: string) {
  const p: Player = { id, name, score: 0, recent: [], connected: true, hue: -1 };
  p.hue = freeHue(s);
  s.players.push(p);
  settleHue(s, p);
}

/**
 * The copy of the state guests receive: nothing that identifies the answer
 * before the reveal (the item ids behind the options, the list of used items).
 */
export function publicView(s: GameState): GameState {
  const q = s.question;
  if (!q) return { ...s, used: [] };
  if (s.phase === 'question') return { ...s, used: [], question: { ...q, itemId: '', options: [], mirrored: [] } };
  // Revealed: only the answer and the options someone actually picked are
  // identified; the untouched decoys stay anonymous for later questions.
  const known = new Set<number | null>([s.reveal?.correctIndex ?? -1, s.reveal?.chosenIndex ?? null, ...q.misses.map((m) => m.index)]);
  return { ...s, used: [], question: { ...q, options: q.options.map((id, i) => (known.has(i) ? id : '')) } };
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sizes every group on screen could share in a question that mixes groups
 * (two rings and two belts, four of each…), when the answer's group has
 * `siblings` unseen items besides it and the other groups have `others`.
 */
function evenSizes(options: number, siblings: number, others: number[], fakes = 0): number[] {
  return [2, 3, 4].filter(
    (m) => options % m === 0 && m < options && m - 1 <= siblings && others.filter((n) => n >= m).length >= options / m - 1 && fitsFakes(options, m, fakes),
  );
}

/**
 * Whether groups of `m` leave room for `fakes` made-up names: each copies a
 * real name of its own group, so a group holds m / 2 of them, rounded down
 * (two groups of three hold two, three pairs hold three).
 */
function fitsFakes(options: number, m: number, fakes: number): boolean {
  return (options / m) * Math.floor(m / 2) >= fakes;
}

function sample<T>(arr: T[], n: number, rng: Rng): T[] {
  return shuffle(arr, rng).slice(0, n);
}

export class Engine {
  readonly items: Item[];
  readonly byId: Map<string, Item>;
  readonly byCategory: Map<string, Item[]>;
  readonly categories: string[];
  /** Made-up names for each item (by id), for difficulties that mix them in. */
  private readonly fakes: Map<string, string[]>;
  private rng: Rng;
  private now: () => number;

  /** `fakes`: made-up names for items, by item name (src/data/fakes.json). */
  constructor(items: Item[], opts: { rng?: Rng; now?: () => number; fakes?: Record<string, string[]> } = {}) {
    this.items = items;
    this.byId = new Map(items.map((it) => [it.id, it]));
    this.fakes = new Map(items.filter((it) => opts.fakes?.[it.name]?.length).map((it) => [it.id, opts.fakes![it.name]]));
    this.byCategory = new Map();
    for (const it of items) {
      const list = this.byCategory.get(it.category) ?? [];
      list.push(it);
      this.byCategory.set(it.category, list);
    }
    this.categories = [...this.byCategory.keys()].sort();
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Applies an action. `from` is the player sending it, or null for a trusted
   * local caller (hot-seat mode, host timers). Returns a new state object.
   */
  apply(prev: GameState, action: Action, from: string | null): GameState {
    const s: GameState = structuredClone(prev);
    s.spectators ??= [];
    const isHost = from === null || from === s.hostId;
    const race = s.settings.mode === 'race';
    const active = s.players[s.turn];
    const isActive = from === null || (active && from === active.id);

    switch (action.type) {
      case 'join': {
        if (from !== null && from !== action.playerId) throw new ActionError('Not allowed.');
        const existing = s.players.find((p) => p.id === action.playerId);
        if (existing) {
          // Rejoining keeps the original name, so a seat can't be renamed on the way back.
          existing.connected = true;
          break;
        }
        // Already watching (e.g. a second connection after a refresh): nothing changes.
        if (s.spectators.some((o) => o.id === action.playerId)) break;
        const name = cleanName(action.name);
        // Someone the host already knows may come back through the lock (a lobby
        // drops people who disconnect, so a refresh would otherwise shut them out).
        if (s.settings.locked && !action.returning) throw new ActionError('The host has locked this room.');
        const problem = nameProblem(name, [...s.players, ...s.spectators].map((o) => o.name));
        if (problem) throw new ActionError(problem);
        if (s.phase !== 'lobby') {
          // Too late for this game: watch it and take a seat in the next one.
          if (s.spectators.length >= MAX_SPECTATORS) throw new ActionError('That game has already started and has no room for more spectators.');
          s.spectators.push({ id: action.playerId, name });
          break;
        }
        if (s.players.length >= MAX_PLAYERS) {
          // Someone who was already here (a spectator, after the host's refresh)
          // waits for a free seat instead of being turned away.
          if (action.returning && s.spectators.length < MAX_SPECTATORS) {
            s.spectators.push({ id: action.playerId, name });
            break;
          }
          throw new ActionError('The lobby is full.');
        }
        seat(s, action.playerId, name);
        break;
      }
      case 'rename': {
        if (!isHost && from !== action.playerId) throw new ActionError('Not allowed.');
        const p = s.players.find((p) => p.id === action.playerId);
        const name = cleanName(action.name);
        const problem = nameProblem(
          name,
          [...s.players, ...s.spectators].filter((o) => o.id !== action.playerId).map((o) => o.name),
        );
        if (problem) throw new ActionError(problem);
        if (p) {
          p.name = name;
          if (s.phase === 'lobby') settleHue(s, p);
        }
        break;
      }
      case 'remove': {
        if (!isHost && from !== action.playerId) throw new ActionError('Only the host can remove players.');
        if (action.playerId === s.hostId) throw new ActionError('The host cannot leave their own game.');
        s.spectators = s.spectators.filter((o) => o.id !== action.playerId);
        const idx = s.players.findIndex((p) => p.id === action.playerId);
        if (idx < 0) break;
        s.players.splice(idx, 1);
        if (s.phase === 'lobby') fillSeats(s);
        if (s.phase === 'lobby' || s.phase === 'over') break;
        if (s.players.length === 0) {
          const fresh = { ...createGame(s.hostId, s.settings), spectators: s.spectators, lastAskedAt: s.lastAskedAt, version: s.version + 1 };
          fillSeats(fresh);
          return fresh;
        }
        if (race) {
          s.turn = 0;
          this.checkRaceDone(s);
        } else if (s.deathmatch) {
          const dm = s.deathmatch;
          dm.alive = dm.alive.filter((id) => id !== action.playerId);
          const wasActive = idx === s.turn;
          if (idx < s.turn) s.turn--;
          if (dm.alive.length <= 1) this.finish(s, dm.alive);
          else if (wasActive || !dm.alive.includes(s.players[s.turn]?.id)) {
            s.turn = (s.turn - 1 + s.players.length) % s.players.length;
            this.nextDuelist(s);
          }
        } else if (idx < s.turn) s.turn--;
        // Their turn: carry on from the seat before, so the end of the round is still checked.
        else if (idx === s.turn) this.advance(s, idx - 1);
        break;
      }
      case 'connection': {
        if (from !== null) throw new ActionError('Not allowed.');
        const p = s.players.find((p) => p.id === action.playerId);
        if (p) p.connected = action.connected;
        if (race) this.checkRaceDone(s);
        break;
      }
      case 'settings': {
        if (!isHost) throw new ActionError('Only the host can change settings.');
        // Listing and locking the room can be switched any time; the rules only between games.
        if (typeof action.settings.public === 'boolean') s.settings.public = action.settings.public;
        if (typeof action.settings.locked === 'boolean') s.settings.locked = action.settings.locked;
        if (Object.keys(action.settings).every((k) => k === 'public' || k === 'locked')) break;
        if (s.phase !== 'lobby' && s.phase !== 'over') throw new ActionError('Settings are locked during a game.');
        const { targetScore, timer, difficulty, custom, mode } = action.settings;
        if (mode === 'turns' || mode === 'race') s.settings.mode = mode;
        // Custom starts out as the difficulty that was picked, the way it plays in the (new) mode.
        if (difficulty === 'custom' && !s.settings.custom) s.settings.custom = knobsOf(s.settings);
        if (isDifficulty(difficulty)) s.settings.difficulty = difficulty;
        // Knobs change one at a time; anything off the allowed steps keeps its old value.
        if (typeof custom === 'object' && custom !== null) s.settings.custom = cleanKnobs(custom, cleanKnobs(s.settings.custom));
        if (targetScore !== undefined) s.settings.targetScore = Math.max(1, Math.min(50, Math.round(targetScore)));
        if (timer !== undefined) s.settings.timer = Math.max(0, Math.min(120, Math.round(timer)));
        break;
      }
      case 'start': {
        if (!isHost) throw new ActionError('Only the host can start the game.');
        if (s.phase !== 'lobby') throw new ActionError('The game is already running.');
        // Seats held for people who haven't come back since the host's refresh
        // go to whoever is waiting.
        s.players = s.players.filter((p) => p.connected);
        fillSeats(s);
        if (s.players.length === 0) throw new ActionError('Add at least one player.');
        s.players = shuffle(s.players, this.rng);
        for (const p of s.players) {
          p.score = 0;
          p.recent = [];
        }
        s.round = 1;
        s.turnCount = 0;
        s.winners = [];
        s.deathmatch = null;
        s.recentCategories = [];
        s.artLean = {};
        // The first turn goes to someone who is actually here.
        s.turn = Math.max(0, s.players.findIndex((p) => p.connected));
        if (race) this.beginRaceQuestion(s, true);
        else this.beginTurn(s, true);
        break;
      }
      case 'pick': {
        if (s.phase !== 'choosing') throw new ActionError('Not the time to pick a category.');
        if (!isActive) throw new ActionError("It's not your turn.");
        if (!s.offered.includes(action.category)) throw new ActionError('That category is not on offer.');
        if (!s.deathmatch) {
          active.recent = lastPicks([...active.recent, action.category], rulesFor(s.settings).lockout);
        }
        s.question = this.makeQuestion(s, action.category);
        s.used.push(s.question.itemId);
        s.phase = 'question';
        break;
      }
      case 'answer': {
        if (race) {
          this.raceAnswer(s, action, from);
          break;
        }
        if (s.phase !== 'question' || !s.question) throw new ActionError('There is no open question.');
        if (!isActive) throw new ActionError("It's not your turn.");
        const q = s.question;
        if (action.askedAt !== undefined && action.askedAt !== q.askedAt) throw new ActionError('Too late!', true);
        const index = validIndex(action.index, q.options.length);
        const chosenId = index === null ? null : q.options[index];
        const timedOut =
          chosenId === null || (q.deadline !== null && from !== null && this.now() > q.deadline + ANSWER_GRACE_MS);
        const correct = !timedOut && chosenId === q.itemId;
        if (correct) active.score += 1;
        if (!timedOut && chosenId && isFake(chosenId)) s.used.push(chosenId);
        if (s.deathmatch) s.deathmatch.results[active.id] = correct;
        s.reveal = {
          correctId: q.itemId,
          chosenId: timedOut ? null : chosenId,
          correctIndex: q.options.indexOf(q.itemId),
          chosenIndex: timedOut ? null : index,
          correct,
          timedOut,
          winnerId: correct ? active.id : null,
        };
        s.phase = 'reveal';
        break;
      }
      case 'next': {
        // Two people pressing Next (or Next and the automatic move on) at once is expected.
        if (s.phase !== 'reveal') throw new ActionError('Nothing to continue.', true);
        if (race) {
          if (!isHost) throw new ActionError('The host moves the race on.');
          this.advanceRace(s);
        } else {
          if (!isActive && !isHost) throw new ActionError("It's not your turn.");
          this.advance(s);
        }
        break;
      }
      case 'skip': {
        if (!isHost) throw new ActionError('Only the host can skip a turn.');
        if (s.phase !== 'choosing' && s.phase !== 'question') throw new ActionError('Nothing to skip.');
        if (race) this.advanceRace(s);
        else {
          if (s.deathmatch && s.players[s.turn]) s.deathmatch.results[s.players[s.turn].id] = false;
          this.advance(s);
        }
        break;
      }
      case 'reask': {
        if (!isHost) throw new ActionError('Only the host can change the question.');
        if (s.phase !== 'question' || !s.question) throw new ActionError('There is no open question.', true);
        const voided = s.question;
        // Race: blind guesses on a question that is thrown out don't cost anything.
        for (const m of voided.misses) {
          const p = s.players.find((p) => p.id === m.playerId);
          if (p) p.score += 1;
        }
        // None of its pictures come back in the new one (one of them didn't load).
        for (const id of voided.options) if (this.byId.has(id) && !s.used.includes(id)) s.used.push(id);
        // Nor does it count toward the run of art and name questions.
        this.tallyMode(s, voided.mode, -1);
        s.question = this.makeQuestion(s, voided.category);
        s.used.push(s.question.itemId);
        break;
      }
      case 'restart': {
        if (!isHost) throw new ActionError('Only the host can restart.');
        const fresh = createGame(s.hostId, s.settings);
        // Players who left during the game don't come back as ghosts in the lobby.
        fresh.players = s.players.filter((p) => p.connected).map((p) => ({ ...p, score: 0, recent: [] }));
        // Renames during the game take effect on colours now.
        const claims = fresh.players.filter((p) => reservedHue(p) !== undefined);
        for (const p of [...claims, ...fresh.players.filter((p) => !claims.includes(p))]) settleHue(fresh, p);
        fresh.spectators = s.spectators;
        fillSeats(fresh);
        fresh.version = s.version;
        fresh.lastAskedAt = s.lastAskedAt;
        fresh.used = s.used;
        Object.assign(s, fresh);
        if (action.play) return this.apply(s, { type: 'start' }, from);
        break;
      }
    }
    if (s.reveal && !prev.reveal) s.reveal.at = this.now();
    s.version = prev.version + 1;
    return s;
  }

  // ---- race mode --------------------------------------------------------

  private raceAnswer(s: GameState, action: Extract<Action, { type: 'answer' }>, from: string | null) {
    const q = s.question;
    // Late clicks from the previous question are expected; drop them quietly.
    if (s.phase !== 'question' || !q) throw new ActionError('Too late!', true);
    if (action.askedAt !== undefined && action.askedAt !== q.askedAt) throw new ActionError('Too late!', true);

    if (from === null) {
      // Host timer: time is up, nobody got it.
      s.reveal = this.noWinner(q, true);
      s.phase = 'reveal';
      return;
    }
    const player = s.players.find((p) => p.id === from);
    if (!player) throw new ActionError('You are not in this game.');
    if (q.misses.some((m) => m.playerId === from)) throw new ActionError('You already answered.', true);
    const index = validIndex(action.index, q.options.length);
    if (index === null) throw new ActionError('Too late!', true);
    if (q.deadline !== null && this.now() > q.deadline + ANSWER_GRACE_MS) throw new ActionError('Too late!', true);

    if (q.options[index] === q.itemId) {
      player.score += 1;
      s.reveal = {
        correctId: q.itemId,
        chosenId: q.itemId,
        correctIndex: index,
        chosenIndex: index,
        correct: true,
        timedOut: false,
        winnerId: player.id,
      };
      s.phase = 'reveal';
      return;
    }
    player.score -= 1;
    q.misses.push({ playerId: player.id, index });
    const chosenId = q.options[index];
    if (isFake(chosenId) && !s.used.includes(chosenId)) s.used.push(chosenId);
    this.checkRaceDone(s);
  }

  private noWinner(q: Question, timedOut: boolean): Reveal {
    return {
      correctId: q.itemId,
      chosenId: null,
      correctIndex: q.options.indexOf(q.itemId),
      chosenIndex: null,
      correct: false,
      timedOut,
      winnerId: null,
    };
  }

  /** Ends the question once every connected player has answered wrong. */
  private checkRaceDone(s: GameState) {
    const q = s.question;
    if (s.phase !== 'question' || !q) return;
    const missed = new Set(q.misses.map((m) => m.playerId));
    const waiting = s.players.filter((p) => p.connected && !missed.has(p.id));
    if (waiting.length === 0) {
      s.reveal = this.noWinner(q, false);
      s.phase = 'reveal';
    }
  }

  private advanceRace(s: GameState) {
    const best = Math.max(...s.players.map((p) => p.score));
    if (best >= s.settings.targetScore) {
      s.phase = 'over';
      s.winners = s.players.filter((p) => p.score === best).map((p) => p.id);
      s.question = null;
      s.reveal = null;
      return;
    }
    this.beginRaceQuestion(s, false);
  }

  private beginRaceQuestion(s: GameState, first: boolean) {
    if (!first) s.turnCount++;
    s.round = s.turnCount + 1;
    const allowed = this.categories.filter((c) => !s.recentCategories.includes(c));
    const fresh = allowed.filter((c) => this.unusedIn(s, c).length > 0);
    const category = sample(fresh.length ? fresh : allowed, 1, this.rng)[0];
    s.recentCategories = lastPicks([...s.recentCategories, category], rulesFor(s.settings).lockout);
    s.offered = [];
    s.reveal = null;
    s.question = this.makeQuestion(s, category);
    s.used.push(s.question.itemId);
    s.phase = 'question';
  }

  // ---- turns mode -------------------------------------------------------

  private beginTurn(s: GameState, first: boolean) {
    if (!first) s.turnCount++;
    s.phase = 'choosing';
    s.question = null;
    s.reveal = null;
    // In a deathmatch nobody picks their favourite: one random category.
    s.offered = s.deathmatch ? [this.randomCategory(s)] : this.offerCategories(s, s.players[s.turn]);
  }

  private finish(s: GameState, winners: string[]) {
    s.phase = 'over';
    s.winners = winners;
    s.question = null;
    s.reveal = null;
    s.offered = [];
  }

  private randomCategory(s: GameState): string {
    const fresh = this.categories.filter((c) => this.unusedIn(s, c).length > 0);
    return sample(fresh.length ? fresh : this.categories, 1, this.rng)[0];
  }

  // ---- deathmatch -------------------------------------------------------

  private startDeathmatch(s: GameState, tied: string[]) {
    s.deathmatch = { alive: tied, entrants: [...tied], round: 1, results: {}, eliminated: [], startedAt: s.turnCount + 1 };
    this.nextDuelist(s);
  }

  /** Next duelist who hasn't answered this round; resolves the round when everyone has. */
  private nextDuelist(s: GameState) {
    const dm = s.deathmatch!;
    const connected = (id: string) => s.players.find((p) => p.id === id)?.connected ?? false;
    const waiting = dm.alive.filter((id) => !(id in dm.results) && connected(id));
    if (waiting.length) {
      // Keep seating order: the first waiting duelist after the current seat.
      const n = s.players.length;
      for (let i = 1; i <= n; i++) {
        const idx = (s.turn + i) % n;
        if (waiting.includes(s.players[idx].id)) {
          s.turn = idx;
          break;
        }
      }
      if (!waiting.includes(s.players[s.turn]?.id)) s.turn = s.players.findIndex((p) => p.id === waiting[0]);
      this.beginTurn(s, false);
      return;
    }
    // Round over. Missing answers (disconnected, skipped) count as wrong.
    const right = dm.alive.filter((id) => dm.results[id] === true);
    const stillHere = (ids: string[]) => ids.filter(connected);
    let alive = right.length > 0 && right.length < dm.alive.length ? right : dm.alive;
    if (stillHere(alive).length === 1) alive = stillHere(alive);
    dm.eliminated = dm.alive.filter((id) => !alive.includes(id));
    dm.alive = alive;
    if (alive.length <= 1 || stillHere(alive).length === 0) {
      this.finish(s, alive.length ? alive : right);
      return;
    }
    dm.round++;
    dm.results = {};
    const first = s.players.findIndex((p) => alive.includes(p.id) && p.connected);
    s.turn = first === 0 ? s.players.length - 1 : first - 1;
    this.nextDuelist(s);
  }

  /**
   * Moves to the next connected player after seat `from` (-1: before the
   * first seat), ending the game at a round boundary.
   */
  private advance(s: GameState, from = s.turn) {
    if (s.deathmatch) {
      this.nextDuelist(s);
      return;
    }
    const n = s.players.length;
    let next = from;
    let wrapped = false;
    for (let i = 0; i < n; i++) {
      next++;
      if (next >= n) {
        next = 0;
        wrapped = true;
      }
      if (s.players[next].connected) break;
    }
    if (wrapped) {
      const best = Math.max(...s.players.map((p) => p.score));
      if (best >= s.settings.targetScore) {
        const leaders = s.players.filter((p) => p.score === best);
        if (leaders.length === 1) {
          this.finish(s, leaders.map((p) => p.id));
          return;
        }
        this.startDeathmatch(s, leaders.map((p) => p.id));
        return;
      }
      s.round++;
    }
    s.turn = next;
    this.beginTurn(s, false);
  }

  private unusedIn(s: GameState, category: string): Item[] {
    const used = new Set(s.used);
    return (this.byCategory.get(category) ?? []).filter((it) => !used.has(it.id));
  }

  offerCategories(s: GameState, player: Player): string[] {
    const allowed = this.categories.filter((c) => !player.recent.includes(c));
    const fresh = allowed.filter((c) => this.unusedIn(s, c).length > 0);
    const stale = allowed.filter((c) => !fresh.includes(c));
    const pick = sample(fresh, OFFER_COUNT, this.rng);
    if (pick.length < OFFER_COUNT) pick.push(...sample(stale, OFFER_COUNT - pick.length, this.rng));
    return pick;
  }

  /**
   * Decoys picked for looking alike: a cluster of names around an anchor. The
   * answer plays any role in it as often as a decoy would (the anchor, another
   * member, or one of the random fillers outside it), so "the name that fits
   * the others best" doesn't give it away.
   */
  private lookalikes(answer: Item, pool: Item[], count: number, options: number): Item[] {
    if (count <= 0) return [];
    // The items most like `to`, with a few to spare so the pick still varies.
    const near = (to: Item, from: Item[]) =>
      shuffle(from, this.rng) // random order among equal scores
        .map((it) => ({ it, score: this.similarity(to, it) + (it.group === to.group ? 0.15 : 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(count + 2, Math.ceil(count * 1.5)))
        .map((r) => r.it);
    const others = (it: Item) => pool.filter((o) => o !== it);
    // The cluster has count + 1 places, counting the answer's.
    const role = this.rng() * options;
    if (role < 1) {
      // The answer is the anchor.
      return sample(near(answer, pool), count, this.rng);
    }
    if (role < count + 1) {
      // The answer is a member: anchor on an item that has the answer among its look-alikes.
      const anchors = pool.filter((a) => near(a, [answer, ...others(a)]).includes(answer));
      const anchor = sample(anchors.length ? anchors : pool, 1, this.rng)[0];
      const mates = near(anchor, [answer, ...others(anchor)]).filter((it) => it !== answer);
      return [anchor, ...sample(mates, count - 1, this.rng)];
    }
    // The answer is a filler: the cluster forms around some other item.
    const anchor = sample(pool, 1, this.rng)[0];
    return [anchor, ...sample(near(anchor, others(anchor)), count, this.rng)];
  }

  /**
   * Swaps `count` decoys for made-up names (in place) and returns the names by
   * option id. Each fake copies one of the real names left on screen, the
   * answer as often as any decoy, so a real name next to its fake twin says
   * nothing about which option is right. A fake takes the place of a decoy
   * from its twin's group, so each group keeps its count on screen. Fakes in
   * `used` (someone fell for them this game) only come back when nothing
   * else is left.
   */
  private mixInFakes(options: string[], answerId: string, count: number, used: Set<string>): Map<string, string> {
    const names = new Map<string, string>();
    if (count <= 0 || !this.fakes.size) return names;
    const fakeId = (source: string, n: number) => `${FAKE_PREFIX}${source}:${n}`;
    /** Which of an item's fakes nobody has fallen for yet. */
    const fresh = (source: string) => this.fakes.get(source)!.flatMap((_, n) => (used.has(fakeId(source, n)) ? [] : [n]));
    const group = (i: number) => this.byId.get(options[i])!.group;
    const sources = new Set<number>();
    const swapped = new Set<number>();
    const free = (i: number) => !swapped.has(i) && !sources.has(i) && !isFake(options[i]);
    /** Real names of `i`'s group that stay on screen and could lend it a fake. */
    const twins = (i: number, freshOnly: boolean) =>
      options.flatMap((id, j) => (j !== i && free(j) && this.fakes.has(id) && group(j) === group(i) && (!freshOnly || fresh(id).length) ? [j] : []));
    /** Decoys a fake could stand in for. */
    const spots = (freshOnly: boolean) => options.flatMap((id, i) => (id !== answerId && free(i) && twins(i, freshOnly).length ? [i] : []));
    for (let k = 0; k < count; k++) {
      const freshOnly = spots(true).length > 0;
      const spot = sample(spots(freshOnly), 1, this.rng)[0];
      if (spot === undefined) break;
      const twin = sample(twins(spot, freshOnly), 1, this.rng)[0];
      const source = options[twin];
      const open = fresh(source);
      const n = open.length ? open[Math.floor(this.rng() * open.length)] : Math.floor(this.rng() * this.fakes.get(source)!.length);
      const id = fakeId(source, n);
      sources.add(twin);
      swapped.add(spot);
      options[spot] = id;
      names.set(id, this.fakes.get(source)![n]);
    }
    return names;
  }

  private simCache = new Map<string, number>();

  private similarity(a: Item, b: Item): number {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    let v = this.simCache.get(key);
    if (v === undefined) this.simCache.set(key, (v = nameSimilarity(a.name, b.name)));
    return v;
  }

  private weightedPick(list: Item[]): Item {
    const total = list.reduce((sum, it) => sum + weightOf(it), 0);
    let r = this.rng() * total;
    for (const it of list) {
      r -= weightOf(it);
      if (r < 0) return it;
    }
    return list[list.length - 1];
  }

  /**
   * Reshapes the decoys (in place) so every group on screen shows up as often
   * as the others (two rings and two belts, four of each…), keeping the
   * decoys' groups where it can. Groups only mix when the answer's own group
   * runs low, so a group smaller than the rest would most likely hold the
   * answer. Leaves the decoys be when `pool` has no such set. Prefers sizes
   * with room for `fakes` made-up names.
   */
  private evenOut(answer: Item, decoys: Item[], pool: Item[], fakes: number): void {
    const options = decoys.length + 1;
    const byGroup = new Map<string, Item[]>();
    for (const it of pool) byGroup.set(it.group, [...(byGroup.get(it.group) ?? []), it]);
    const siblings = byGroup.get(answer.group) ?? [];
    byGroup.delete(answer.group);
    const sizes = evenSizes(options, siblings.length, [...byGroup.values()].map((g) => g.length));
    const roomy = sizes.filter((m) => fitsFakes(options, m, fakes));
    const m = sample(roomy.length ? roomy : sizes, 1, this.rng)[0];
    if (!m) return;
    // Groups the decoys already favour first (look-alike names), the rest at random.
    const onScreen = (group: string) => decoys.filter((d) => d.group === group);
    const groups = shuffle([...byGroup.keys()].filter((g) => byGroup.get(g)!.length >= m), this.rng)
      .sort((a, b) => onScreen(b).length - onScreen(a).length)
      .slice(0, options / m - 1);
    const fill = (group: string, n: number, from: Item[]) => {
      const kept = onScreen(group).slice(0, n);
      return [...kept, ...sample(from.filter((it) => !kept.includes(it)), n - kept.length, this.rng)];
    };
    const picked = [...fill(answer.group, m - 1, siblings), ...groups.flatMap((g) => fill(g, m, byGroup.get(g)!))];
    decoys.splice(0, decoys.length, ...shuffle(picked, this.rng));
  }

  /**
   * Groups of the options, sorted, for the question's topic. A made-up name
   * counts under the item it copies, the group it looks like, so the topic
   * only says what is on screen and nothing about which names are real.
   * Empty when a group has a single option: decoys come from the answer's
   * group first, so a lone option would most likely be the answer.
   */
  private groupsOf(options: string[]): string[] {
    const counts = new Map<string, number>();
    for (const option of options) {
      const id = isFake(option) ? option.slice(FAKE_PREFIX.length, option.lastIndexOf(':')) : option;
      const group = this.byId.get(id)!.group;
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return [...counts.values()].some((n) => n === 1) ? [] : [...counts.keys()].sort();
  }

  /**
   * Art or name, leaning toward whichever this player (the room, in a race)
   * has had less of than its share, so long runs of one are rarer and
   * everyone gets about the same mix. Over a game the share stays
   * `artChance`. Says nothing about which option is right.
   */
  private rollMode(s: GameState): QuestionMode {
    const behind = s.artLean?.[artKey(s)] ?? 0;
    const mode: QuestionMode = this.rng() < activeRules(s).artChance + ART_LEAN * behind ? 'art' : 'name';
    this.tallyMode(s, mode, 1);
    return mode;
  }

  /** Counts a question toward its player's art lean (`sign` -1 takes it back). */
  private tallyMode(s: GameState, mode: QuestionMode, sign: 1 | -1) {
    const lean = (s.artLean ??= {});
    const key = artKey(s);
    lean[key] = (lean[key] ?? 0) + sign * (activeRules(s).artChance - (mode === 'art' ? 1 : 0));
  }

  /**
   * Builds a question from the category. Updates `s.used` when the category
   * has to start over.
   */
  makeQuestion(s: GameState, category: string): Question {
    const rules = activeRules(s);
    const inCat = this.byCategory.get(category) ?? [];
    const need = rules.options - 1;
    const mode = this.rollMode(s);
    const fakes = mode === 'name' ? rules.fakes : 0;

    // Earlier answers never come back as decoys (they'd be easy to rule out).
    // An answer needs a full set of unseen decoys from its own group, or one
    // to share evenly with other groups (two of each, three of each…): a
    // group smaller than the rest would most likely hold the answer, and
    // with room for the made-up names. Rare groups (tablets) never mix, or
    // one would stand out. Other items sit out; once none can be asked, the
    // category starts over, except for its latest answer.
    const answerable = (unused: Item[]) => {
      const left = new Map<string, number>();
      for (const it of unused) left.set(it.group, (left.get(it.group) ?? 0) + 1);
      const others = (group: string) => [...left].flatMap(([g, n]) => (g === group || Object.hasOwn(RARE_GROUPS, g) ? [] : [n]));
      return unused.filter((it) => {
        const siblings = left.get(it.group)! - 1;
        return siblings >= need || (weightOf(it) === 1 && evenSizes(rules.options, siblings, others(it.group), fakes).length > 0);
      });
    };
    let unused = this.unusedIn(s, category);
    let candidates = answerable(unused);
    if (!candidates.length) {
      const inThis = new Set(inCat.map((it) => it.id));
      const latest = s.used.findLast((id) => inThis.has(id));
      s.used = s.used.filter((id) => !inThis.has(id) || id === latest);
      unused = this.unusedIn(s, category);
      candidates = answerable(unused);
    }
    const answer = this.weightedPick(candidates.length ? candidates : unused.length ? unused : inCat);

    const sameGroup = unused.filter((it) => it.id !== answer.id && it.group === answer.group);
    // Decoys come from the answer's own group (all rings, all bows…): a flask
    // among tablets would stand out. Other groups only fill in when it runs
    // too low, evened out with it, and rare groups (tablets) not even then.
    const otherGroup = unused.filter((it) => it.id !== answer.id && it.group !== answer.group && weightOf(it) === 1);
    const pool = sameGroup.length >= need ? sameGroup : [...sameGroup, ...otherGroup];

    const simCount = Math.min(pool.length, Math.round(need * rules.similarNames));
    const decoys = this.lookalikes(answer, pool, simCount, rules.options);
    // Rest at random, preferring the same group, then the category, then anything.
    for (const source of [pool, unused, inCat, this.items]) {
      if (decoys.length >= need) break;
      const taken = new Set([answer.id, ...decoys.map((it) => it.id)]);
      decoys.push(...sample(source.filter((it) => !taken.has(it.id)), need - decoys.length, this.rng));
    }
    if (pool !== sameGroup) this.evenOut(answer, decoys, pool, fakes);

    const options = shuffle([answer, ...decoys], this.rng).map((it) => it.id);
    // Strictly increasing: it doubles as the question's id for late answers.
    const askedAt = Math.max(this.now(), (s.lastAskedAt ?? 0) + 1, (s.question?.askedAt ?? 0) + 1);
    s.lastAskedAt = askedAt;
    const timer = s.settings.mode === 'race' ? s.settings.timer || RACE_DEFAULT_TIMER : s.settings.timer;
    const deadline = timer > 0 ? askedAt + timer * 1000 : null;
    const veil: Veil | null =
      rules.veil && mode === 'name'
        ? {
            size: rules.veil.size,
            seconds: (timer > 0 ? timer : 20) * rules.veil.share,
            seed: Math.floor(this.rng() * 2 ** 31),
          }
        : null;
    const fakeNames = mode === 'name' ? this.mixInFakes(options, answer.id, fakes, new Set(s.used)) : new Map<string, string>();
    // Gem groups are attributes ("Intelligence"), not kinds of item.
    const groups = answer.kind === 'gem' ? [] : this.groupsOf(options);
    const labels = options.map((id) => (mode === 'name' ? (fakeNames.get(id) ?? this.byId.get(id)!.name) : null));
    const prompt = mode === 'art' ? answer.name : null;
    // Each picture flips on its own roll, so a flipped option says nothing about the answer.
    const mirrored = Array.from({ length: mode === 'art' ? options.length : 1 }, () => rules.mirror > 0 && this.rng() < rules.mirror);
    return { category, groups, mode, itemId: answer.id, options, labels, prompt, veil, mirrored, askedAt, deadline, misses: [] };
  }
}

/** Whose art lean a question counts toward: the player answering it, or the whole room in a race. */
function artKey(s: GameState): string {
  return s.settings.mode === 'race' ? '' : (s.players[s.turn]?.id ?? '');
}

function bigrams(name: string): string[] {
  const clean = name.toLowerCase().replace(/[^a-z]/g, '');
  const out: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) out.push(clean.slice(i, i + 2));
  return out;
}

/**
 * How alike two names look: letter-pair overlap (Dice coefficient) plus
 * bonuses for the same "shape" (possessive, "The …", word count), the same
 * opening letters and shared words.
 */
export function nameSimilarity(a: string, b: string): number {
  const ba = bigrams(a);
  const bb = bigrams(b);
  const counts = new Map<string, number>();
  for (const g of ba) counts.set(g, (counts.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of bb) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      shared++;
      counts.set(g, n - 1);
    }
  }
  let score = ba.length + bb.length ? (2 * shared) / (ba.length + bb.length) : 0;

  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la[0] === lb[0]) score += 0.3;
  if (la.slice(0, 2) === lb.slice(0, 2)) score += 0.2;
  const possessive = (n: string) => /'s?\b/.test(n);
  if (possessive(la) === possessive(lb)) score += 0.2;
  if (la.startsWith('the ') === lb.startsWith('the ')) score += 0.15;
  const wordsA = la.split(/\s+/);
  const wordsB = lb.split(/\s+/);
  if (wordsA.length === wordsB.length) score += 0.2;
  const significant = (w: string[]) => new Set(w.map((x) => x.replace(/[^a-z]/g, '')).filter((x) => x.length > 3));
  const sa = significant(wordsA);
  for (const w of significant(wordsB)) if (sa.has(w)) score += 0.5;
  if (Math.abs(a.length - b.length) <= 2) score += 0.15;
  return score;
}

function validIndex(index: unknown, count: number): number | null {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < count ? index : null;
}
