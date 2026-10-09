// Pure game logic. The host (or the single device in hot-seat mode) is the only
// place this runs; everyone else just renders the state it broadcasts.

import { cleanName, nameProblem, nameSkeleton } from './names.ts';
import { RUBY } from './palette.ts';
import type { Looks } from './looks.ts';
import {
  DELVE_MAX_LOCKOUT,
  DELVE_RESUME_GRACE_MS,
  DELVE_RULESET,
  FINDS,
  FLARE_MS,
  askedCards,
  blastProblem,
  delveLockout,
  delveQuestionTimer,
  delveRules,
  delveTileVeil,
  delveTimer,
  cavesIn,
  blastVictim,
  blowsUp,
  fellAt,
  findChance,
  findLosses,
  findReward,
  findRules,
  findTileVeil,
  fuseDue,
  hasRoom,
  holdersOf,
  inventoryOf,
  isGroupRun,
  itemsWorkOn,
  questionTimer,
  reviveProblem,
  teamItemReady,
  tileVeilSize,
  veinWindow,
  veilSeconds,
  voteClosesAt,
  voteDone,
  unaskedCards,
  waitingIds,
  SECOND_FIND,
  SHARDS_PER_WARD,
  capShards,
  findOn,
  livesOf,
  standingIds,
  type CardFind,
  type FindKind,
  type Inventory,
  type ItemKind,
} from './delve.ts';

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
 * size grid over the picture), and the share of the timer it takes the whole
 * item to burn in: less on a clock too short to leave 3 s to answer once
 * half the art is in (delve.ts veilSeconds).
 */
const VEILS: Record<VeilSpeed, { size: number; share: number } | null> = {
  off: null,
  fast: { size: 5, share: 0.55 },
  slow: { size: 7, share: 0.7 },
  slowest: { size: 9, share: 0.8 },
};

/**
 * The knobs as the engine uses them. Delve's curve also plays values between
 * the Custom editor's steps (look-alikes and mirroring in quarters).
 */
export interface DifficultyRules extends Omit<Knobs, 'veil'> {
  /** The art burns into view patch by patch; fraction of the timer it takes (at most, see veilSeconds). */
  veil: { size: number; share: number } | null;
  /** Delve, past depth 100: the share of name questions with one more made-up name than `fakes`, as far as they fit. */
  moreFakes?: number;
  /** Delve, from depth 50: the share of questions whose look-alikes are picked by their art instead of their names. */
  lookalikes?: number;
  /**
   * Delve: the chance that a question's art (all of it) is shown without
   * colour, rolled for each question (Question.gray) in place of `grayscale`.
   */
  grayChance?: number;
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
 * The most options a question about a rare group's item shows. Rare groups
 * never mix with others, and there are only nine tablets, so where the rules
 * ask for ten (Delve from depth 70) a tablet is asked with eight instead.
 */
export const RARE_MAX_OPTIONS = 8;

/** How many options a question with `it` as its answer shows, where the rules ask for `options`. */
const optionsFor = (it: Item, options: number) => (weightOf(it) === 1 ? options : Math.min(options, RARE_MAX_OPTIONS));

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

/**
 * The rules for the current question (deathmatch questions are one tier
 * harder; Delve's follow the depth, and a find's are those of deeper down).
 */
export function activeRules(s: GameState): DifficultyRules {
  if (!s.delve) {
    const r = rulesFor(s.settings, !!s.deathmatch);
    return initiateNow(s) ? { ...r, ...INITIATE_RULES } : r;
  }
  return delveQuestionRules(s.round, s.question ?? {});
}

/**
 * Initiate's grace: a player whose browser has never played gets this many
 * gentle questions on their own turns (Player.grace), whatever the room's
 * difficulty.
 */
export const INITIATE_GRACE = 3;

/**
 * An Initiate question's rules: a picture to find for a name among four,
 * nothing made up, flipped or drained of colour. The decoys come from other
 * families of item (Engine.wideDecoys); the timer and the lockout stay the room's.
 */
export const INITIATE_RULES: Partial<DifficultyRules> = { options: 4, similarNames: 0, fakes: 0, artChance: 1, mirror: 0, grayscale: 'off', veil: null };

/** The family an Initiate question's pictures are told apart by: its category, with every weapon one family. */
export const initiateFamily = (it: Item) => (it.category === 'One-Handed Weapons' || it.category === 'Two-Handed Weapons' ? 'Weapons' : it.category);

/**
 * Whether the question in play (or, between questions, the one the player on
 * turn will be asked) is an Initiate question. Never in a race, a Delve run
 * or a deathmatch. Once asked, the question's own flag decides (a reask
 * keeps it); before, the player's grace.
 */
export function initiateNow(s: GameState): boolean {
  if (s.settings.mode === 'race' || s.delve || s.deathmatch) return false;
  return s.question ? !!s.question.initiate : (s.players[s.turn]?.grace ?? 0) > 0;
}

/**
 * Which of the question in play's art is shown without colour: in Delve as
 * rolled for the question (Question.gray), otherwise the rules'.
 */
export function grayscaleFor(s: GameState): Grayscale {
  const gray = s.question?.gray;
  return gray === undefined ? activeRules(s).grayscale : gray ? 'all' : 'off';
}

/** The rules of a Delve question at depth `d`, for a find or not. */
function delveQuestionRules(d: number, q: Pick<Question, 'find'>): DifficultyRules {
  return q.find ? findRules(q.find, d) : delveRules(d);
}

/** The last `lockout` categories of a list (none for a lockout of 0). */
export const lastPicks = (picks: string[], lockout: number) => (lockout > 0 ? picks.slice(-lockout) : []);

export interface Veil {
  size: number;
  /** Seconds from the first patch starting to the last one done burning in. */
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

/** A Delve run (see delve.ts). Lives and perishes are read from `losses` and `revives`, never stored twice. */
export interface Delve {
  /** Everyone seated when the run started; only its length is read (one: a solo run, more: co-op). */
  entrants: string[];
  /**
   * Depths at which each seated player lost a life, oldest first. Three lose
   * all of them; brought back by a teammate (`revives`), a player can lose more.
   */
  losses: Record<string, number[]>;
  /** DELVE_RULESET when the run started. */
  ruleset: number;
  /** Resumed by a build with another ruleset: plays on, but never counts as a best. */
  mixed?: boolean;
  /**
   * Co-op: the deepest depth a player left the run at (or was removed) while
   * still standing, so the team's depth never drops below it once nobody
   * stands (delve.ts teamDepth). Missing until someone does.
   */
  leftAt?: number;
  /**
   * Co-op: the deepest depth where a player who has since left had perished
   * (their losses go with them), so who stood last and since when can still
   * be told (lib/achievements.ts). Missing until someone does, and from older hosts.
   */
  fellLeft?: number;
  /** Host clock when the run started (the run's id in records). */
  startedAt: number;
  /** Standing players the host's reload cut off who haven't come back since. */
  excused: string[];
  /** A vote waits for the excused at most until then (host clock). */
  graceUntil: number;
  /**
   * What each seated player carries (see delve.ts inventoryOf). A ward takes a
   * loss before a life does, so `losses` stays the only record of lives lost.
   * A player who perishes drops all of it, for good. Missing in older saves.
   */
  inventory?: Record<string, Inventory>;
  /**
   * The finds among the cards on offer (delve.ts findOffers): none, one, or
   * two on different cards and of different kinds. Missing in older saves.
   */
  finds?: CardFind[];
  /** Older saves only (now `finds`): the one find among the cards on offer, or null. */
  find?: { category: string; kind: FindKind } | null;
  /**
   * Co-op: this depth's votes, by player: the card each voted for (public).
   * Kept through the question it chose, cleared when the next vote opens.
   */
  votes?: Record<string, string>;
  /** Co-op: host clock of this vote's first vote, which opens its VOTE_WINDOW_MS; null before it. */
  voteFrom?: number | null;
  /** Co-op: votes in a row each player let pass while standing (idle from DELVE_IDLE_ROUNDS; voting resets it). */
  missed?: Record<string, number>;
  /** Co-op: every life given to bring a teammate back, oldest first (missing in solo runs and older saves). */
  revives?: Revive[];
  /**
   * What the question in play can change, as it was when its card was picked
   * (kept through a reask): a question set aside after a host reload puts it
   * all back, so it costs nobody anything. Gone once the question is
   * answered; missing between questions and in older saves.
   */
  snapshot?: DelveSnapshot;
  /**
   * Older saves only (now `snapshot.picks`): the lockout as it was before
   * the question in play was picked.
   */
  picksBefore?: string[];
  /**
   * The cards on this depth's offer asked so far (delve.ts askedCards): the
   * one picked, then each one a blast drew. Set at the pick, gone between
   * depths; missing in older saves.
   */
  asked?: string[];
  /** Questions dynamite blasted away in this run (missing for none, and in older saves). */
  blasts?: number;
}

/** Delve: everything a question can change, taken as its card is picked (see Delve.snapshot). */
export interface DelveSnapshot {
  /** The picks locked out: alone the player's `recent`, co-op the team's `recentCategories`. */
  picks: string[];
  /** Everyone's `losses` (lives, and where they perished). */
  losses: Record<string, number[]>;
  /** Everyone's pack: the wards a loss breaks, the flare or dynamite spent, all of it dropped by perishing. */
  inventory: Record<string, Inventory>;
  /** Each seated player's streak, which a loss ends. */
  streaks: Record<string, number>;
  /**
   * Co-op: `missed` as it was before the vote that picked the question
   * counted those who let it pass, so the vote again for the same cards
   * doesn't count them twice (missing alone).
   */
  missed?: Record<string, number>;
}

/** One life passed in co-op: `by` gave one of theirs at depth `depth` to bring back `to`, who had perished at `fell`. */
export interface Revive {
  by: string;
  to: string;
  depth: number;
  fell: number;
  /** Host clock when it was given. */
  at: number;
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
  /**
   * Questions in a row this player got right (missing in older saves and
   * from older hosts). Turns: their own questions; race: questions they won.
   */
  streak?: number;
  /**
   * Initiate's grace (INITIATE_GRACE): gentle questions left on their own
   * turns (taken at each pick). 0: graduated, gone at their next pick;
   * missing: none (everyone who has played before).
   */
  grace?: number;
}

/**
 * turns: players take turns choosing a category and answering.
 * race: everyone answers the same question; first correct answer scores,
 * wrong answers cost a point and lock that player out of the question.
 * delve: three lives and no settings, one depth deeper each question (see
 * delve.ts). Alone, a player's own turns; together (online), co-op: the team
 * votes for a card and answers one question, and nobody wins.
 */
export type GameMode = 'turns' | 'race' | 'delve';

/** A known game mode. */
export const isGameMode = (m: unknown): m is GameMode => m === 'turns' || m === 'race' || m === 'delve';

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

/** The seconds per question a room can pick, 0 = no timer. */
export const TIMER_STEPS = [0, 8, 16, 32, 64] as const;

/** The step nearest `v` (a timer from an older build or an odd action), ties going to the longer one. */
export function snapTimer(v: number) {
  let best: number = TIMER_STEPS[0];
  for (const t of TIMER_STEPS) if (Math.abs(t - v) <= Math.abs(best - v)) best = t;
  return best;
}

/** Race questions need an end, so "no timer" falls back to this. */
export const RACE_DEFAULT_TIMER = 16;

/**
 * Seconds on the clock of a question asked in `s` (`q`: a Delve find's has
 * its own): a Delve depth's, else the room's timer, or the default one
 * without. A veiled question's art is sized for it (veilSeconds), and the
 * host paces each picture's patches by it too (media.svelte.ts prepareMedia).
 */
export function questionClock(s: GameState, q: Pick<Question, 'find'>): number {
  if (s.delve) return delveQuestionTimer(s.round, q);
  const timer = s.settings.mode === 'race' ? s.settings.timer || RACE_DEFAULT_TIMER : s.settings.timer;
  return timer > 0 ? timer : DEFAULT_SETTINGS.timer;
}

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
  /**
   * The art burning into view patch by patch on name questions (merciless and
   * up), or on Delve's deep "find the art" questions each picture on its own.
   */
  veil: Veil | null;
  /**
   * Pictures shown flipped left to right (eternal): one flag per option on art
   * questions, one for the art on name questions. Empty for guests until the
   * reveal (missing in games saved before it existed).
   */
  mirrored?: boolean[];
  /** Delve: the art is shown without colour, as rolled against the rules' grayChance (see grayscaleFor). */
  gray?: boolean;
  /** Host-clock timestamp when the question was asked. */
  askedAt: number;
  /** Host-clock timestamp when time runs out, null without timer (and in Delve until the clock starts). */
  deadline: number | null;
  /** Delve: host clock when the clock started, once the art has reached the player answering. */
  clockAt?: number;
  /**
   * Delve: asked from a find, under the rules and clock of deeper down; a
   * right answer earns its item (see delve.ts findReward).
   */
  find?: FindKind;
  /**
   * Delve: asked in place of a question dynamite blasted away, at the same
   * depth (see Blast). Kept through a reask.
   */
  blast?: Blast;
  /**
   * Older saves only: dynamite went off on this question at half its clock
   * (the dynamite before it blasted questions away), and the wrong options
   * it blew away. Read only to give its stick back when the question is set
   * aside.
   */
  blasted?: boolean;
  blownAway?: number[];
  /**
   * The clock held still from `from` to `until` (host clock), the deadline
   * moved on by as much (delve.ts clockLeft): the lab's pause, and older
   * saves' dynamite.
   */
  held?: { from: number; until: number };
  /** Delve: a flare burnt on this question as its clock hit 0, and its deadline moved (once a question). */
  flared?: boolean;
  /** Delve, once `flared`: when it burnt (host clock). */
  flaredAt?: number;
  /** Race mode: wrong answers so far, in order. Those players are locked out. */
  misses: { playerId: string; index: number }[];
  /**
   * Delve co-op: wrong answers so far, in order: each strikes its option for
   * everyone, and its player (`by`, at host clock `at`) has answered. What
   * the loss took: `lives` and `wards` (two losses on an Azurite Vein).
   */
  struck?: Struck[];
  /** Delve co-op: whose flare burnt on this question (alone: the player's own). */
  flaredBy?: string;
  /** Older saves only (see `blasted`): whose dynamite went off on this question. */
  blastedBy?: string;
  /** An Initiate question (see initiateNow): its rules are INITIATE_RULES. Kept through a reask. */
  initiate?: true;
}

/**
 * Delve: a question dynamite blasted away for a new one at the same depth,
 * as the new one remembers it.
 */
export interface Blast {
  /** Who set it off; missing when it went off by itself as the clock hit 0. */
  by?: string;
  /** Whose stick it was (co-op: a standing holder's, drawn; alone the player's). */
  stick: string;
  /**
   * Where the new question's card lay on the offer from the blasted one's:
   * -1 to its left, 1 to its right (the screens swing that way).
   */
  side: -1 | 1;
  /**
   * The question blasted away: when it was asked, its answer and its kind,
   * and (co-op) the wrong answers given to it first, with what each cost,
   * as they stand paid. Public, as it can't be answered any more: every
   * screen counts its item as seen in the codex, and a player who struck an
   * option on it as having missed it, at that cost.
   */
  was: { at: number; itemId: string; mode: QuestionMode; struck?: Pick<Struck, 'by' | 'index' | 'lives' | 'wards'>[] };
}

/** A wrong answer in co-op Delve (see Question.struck). */
export interface Struck {
  index: number;
  by: string;
  at: number;
  lives: number;
  wards: number;
  /** A Dynamite Cache's blast destroyed this of their pack (delve.ts blastVictim). */
  blown?: ItemKind;
}

/** A loss a co-op question dealt one player: a wrong answer, or the time-out for one who never gave one. */
export interface Hit {
  playerId: string;
  lives: number;
  wards: number;
  timedOut: boolean;
  /** A Dynamite Cache's blast destroyed this of their pack (delve.ts blastVictim). */
  blown?: ItemKind;
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
  /** Delve: the item this right answer to a find earned ('wards' for a shard that forged one). */
  gained?: ItemKind;
  /**
   * Delve co-op, with `gained`: who took the item. The winner, if they had
   * room for it; otherwise the first standing teammate in seat order who had.
   */
  gainedBy?: string;
  /** Delve: the shard this answer earned forged a ward with the one held. */
  forged?: boolean;
  /** Delve: Azurite Wards took this answer's whole loss, so no life was lost. */
  warded?: boolean;
  /**
   * Delve: a wrong answer (or a time-out) to an Azurite Vein, which caves in
   * for two losses (delve.ts findLosses). Lost a life on the last one: just that.
   */
  caveIn?: boolean;
  /** Delve, on a cave-in: lives it took (0 to 2) and wards that broke in their place (0 to 2). */
  lost?: { lives: number; wards: number };
  /**
   * Delve: a miss on a Dynamite Cache, whose blast destroyed this of the
   * player's pack besides the loss (delve.ts blastVictim). Co-op: each
   * player's is on their hit.
   */
  blown?: ItemKind;
  /**
   * Delve co-op: every loss this question dealt, in order: the wrong answers
   * (as struck), then the time-out for each player standing who never
   * answered. `caveIn` marks an Azurite Vein's; `winnerId` is whoever cleared it.
   */
  hits?: Hit[];
}

/** Someone who joined a running game: they watch until the next game starts. */
export interface Spectator {
  id: string;
  name: string;
  /** Joined from a browser that has never played: seated as an Initiate. */
  initiate?: true;
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
  /** The Delve run in progress (or just over); null otherwise, missing in older saves. */
  delve?: Delve | null;
  /**
   * How many art questions each player is behind the difficulty's share
   * (negative: ahead), by player id; race mode keeps one for the room under
   * "". Missing in older saves.
   */
  artLean?: Record<string, number>;
  /** askedAt of the latest question (missing in games saved before it existed). */
  lastAskedAt?: number;
  /**
   * Host clock when the game started (missing in the lobby, and from older
   * hosts): which game it is, and which answers in a codex log belong to it.
   */
  startedAt?: number;
  /** Bumped on every change so clients can ignore stale messages. */
  version: number;
}

export type Action =
  /**
   * `returning`: set by the host for someone who was already in this room (may pass the lock).
   * `initiate`: from a browser that has never played, seated with Initiate's grace.
   */
  | { type: 'join'; playerId: string; name: string; returning?: boolean; initiate?: boolean }
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
  | { type: 'restart'; play?: boolean }
  /** Host only (Delve): the art has reached the player answering, so their clock starts at `at` (host clock). */
  | { type: 'clock'; askedAt: number; at?: number }
  /** Host only (Delve co-op): the vote's window ran out (or every vote it waits for is in): a card is drawn from the votes. */
  | { type: 'expire' }
  /** Delve co-op: a standing player votes for a card on offer (changeable until the vote closes). */
  | { type: 'vote'; category: string }
  /** Delve co-op: a standing player gives one of their lives to bring back a teammate who perished. */
  | { type: 'revive'; target: string }
  /** Host only (Delve): the host reopened its room after a reload. */
  | { type: 'resumed' }
  /** Host only (Delve): the clock is about to run out, so one of the answering player's flares burns (co-op: a random holder's). */
  | { type: 'flare'; askedAt: number }
  /**
   * Delve: a stick of dynamite blasts the question asked at `askedAt` away
   * for a new one at the same depth (alone the player's own; co-op anyone
   * standing who hasn't answered it, from a random holder's pack).
   */
  | { type: 'blast'; askedAt: number };

export const OFFER_COUNT = 3;
export const MAX_PLAYERS = 12;
export const MAX_SPECTATORS = 8;

const DEFAULT_PRESET: Preset = 'merciless';
export const DEFAULT_SETTINGS: Settings = {
  targetScore: 10,
  timer: 16,
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
    delve: null,
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
    seat(s, o.id, o.name, !!o.initiate);
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

/** Adds a player with the first free avatar colour (or their reserved one); an Initiate with their grace. */
function seat(s: GameState, id: string, name: string, initiate = false) {
  const p: Player = { id, name, score: 0, recent: [], connected: true, hue: -1, ...(initiate ? { grace: INITIATE_GRACE } : {}) };
  p.hue = freeHue(s);
  s.players.push(p);
  settleHue(s, p);
}

/**
 * The copy of the state guests receive: nothing that identifies the answer
 * before the reveal (the item ids behind the options, the list of used items).
 * Delve co-op: the votes, the struck options and who struck them are public;
 * which option is right stays hidden until the reveal.
 */
export function publicView(s: GameState): GameState {
  const q = s.question;
  if (!q) return { ...s, used: [] };
  if (s.phase === 'question') {
    const hidden = { ...q, itemId: '', options: [], mirrored: [] };
    // Delve: nothing to read off the clock either, until the art has reached the player answering.
    if (s.delve && q.deadline === null) return { ...s, used: [], question: { ...hidden, labels: q.labels.map(() => null), prompt: null, groups: [] } };
    return { ...s, used: [], question: hidden };
  }
  // Revealed: only the answer and the options someone actually picked are
  // identified; the untouched decoys stay anonymous for later questions.
  const known = new Set<number | null>([
    s.reveal?.correctIndex ?? -1,
    s.reveal?.chosenIndex ?? null,
    ...q.misses.map((m) => m.index),
    ...(q.struck ?? []).map((m) => m.index),
  ]);
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
 * (two rings and two belts, four of each, five boots and five gloves…),
 * when the answer's group has `siblings` unseen items besides it and the
 * other groups have `others`.
 */
function evenSizes(options: number, siblings: number, others: number[], fakes = 0): number[] {
  return [2, 3, 4, 5].filter(
    (m) => options % m === 0 && m < options && m - 1 <= siblings && others.filter((n) => n >= m).length >= options / m - 1 && fitsFakes(options, m, fakes),
  );
}

/**
 * Whether groups of `m` leave room for `fakes` made-up names: each copies a
 * real name of its own group, so a group holds m / 2 of them, rounded down
 * (two groups of three hold two, three pairs hold three, two groups of five
 * four).
 */
function fitsFakes(options: number, m: number, fakes: number): boolean {
  return (options / m) * Math.floor(m / 2) >= fakes;
}

function sample<T>(arr: T[], n: number, rng: Rng): T[] {
  return shuffle(arr, rng).slice(0, n);
}

/**
 * Counts a reveal into the streaks. Turns: whoever answered keeps theirs
 * going or loses it. Race: the winner's goes on and everyone else's breaks,
 * whether they guessed wrong or just weren't first. Delve co-op: whoever
 * cleared the depth keeps theirs going; a loss already broke anyone's it hit.
 */
function countStreaks(s: GameState, r: Reveal) {
  if (s.delve && isGroupRun(s)) {
    const winner = s.players.find((p) => p.id === r.winnerId);
    if (winner) winner.streak = (winner.streak ?? 0) + 1;
    return;
  }
  if (s.settings.mode === 'race') {
    for (const p of s.players) p.streak = p.id === r.winnerId ? (p.streak ?? 0) + 1 : 0;
    return;
  }
  const answered = s.players[s.turn];
  if (answered) answered.streak = r.correct ? (answered.streak ?? 0) + 1 : 0;
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
  /** Which items' art looks alike (src/lib/looks.ts), once it has been fetched. */
  private looks: Looks | null;

  /**
   * `fakes`: made-up names for items, by item name (src/data/fakes.json).
   * `looks`: the look-alike table, if at hand already (else see setLooks).
   */
  constructor(items: Item[], opts: { rng?: Rng; now?: () => number; fakes?: Record<string, string[]>; looks?: Looks | null } = {}) {
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
    this.looks = opts.looks ?? null;
  }

  /**
   * Hands over the look-alike table, fetched once a Delve run gets deep
   * enough to want it. Until then a question rolled to pick its look-alikes
   * by their art picks them by their names, as at shallower depths.
   */
  setLooks(looks: Looks | null) {
    this.looks = looks;
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
          // A guest coming back arrives here (the session only ever reports a drop as 'connection'); their excuse ends.
          if (s.delve) s.delve.excused = s.delve.excused.filter((id) => id !== existing.id);
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
        // A newcomer who watches first keeps being one: they're seated as an Initiate.
        const watcher: Spectator = { id: action.playerId, name, ...(action.initiate ? { initiate: true as const } : {}) };
        if (s.phase !== 'lobby') {
          // Too late for this game: watch it and take a seat in the next one.
          if (s.spectators.length >= MAX_SPECTATORS) throw new ActionError('That game has already started and has no room for more spectators.');
          s.spectators.push(watcher);
          break;
        }
        if (s.players.length >= MAX_PLAYERS) {
          // Someone who was already here (a spectator, after the host's refresh)
          // waits for a free seat instead of being turned away.
          if (action.returning && s.spectators.length < MAX_SPECTATORS) {
            s.spectators.push(watcher);
            break;
          }
          throw new ActionError('The lobby is full.');
        }
        seat(s, action.playerId, name, !!action.initiate);
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
        // Delve: whether they leave the run on their feet, or else where they fell (read while they still have a seat).
        const standing = !!s.delve && livesOf(s, action.playerId) > 0;
        const fell = s.delve ? fellAt(s, action.playerId) : null;
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
        } else {
          if (s.delve) {
            // Gone from the run: their losses, items, excuse and vote. Lives
            // they gave or were given stay on the record (`revives`): a
            // teammate they brought back keeps the life.
            const dm = s.delve;
            // The team got this deep with them: the run's depth never drops below it (delve.ts teamDepth).
            if (standing) dm.leftAt = Math.max(dm.leftAt ?? 0, s.round);
            else if (fell !== null) dm.fellLeft = Math.max(dm.fellLeft ?? 0, fell);
            delete dm.losses[action.playerId];
            if (dm.inventory) delete dm.inventory[action.playerId];
            dm.excused = dm.excused.filter((id) => id !== action.playerId);
            if (dm.missed) delete dm.missed[action.playerId];
            if (dm.votes) {
              delete dm.votes[action.playerId];
              if (!Object.keys(dm.votes).length) dm.voteFrom = null;
            }
            if (isGroupRun(s)) {
              if (s.turn >= s.players.length) s.turn = 0;
              this.coopCarryOn(s);
              break;
            }
          }
          if (idx < s.turn) s.turn--;
          // Their turn: carry on from the seat before, so the end of the round is still checked.
          else if (idx === s.turn) this.advance(s, idx - 1);
        }
        break;
      }
      case 'connection': {
        if (from !== null) throw new ActionError('Not allowed.');
        const p = s.players.find((p) => p.id === action.playerId);
        if (p) p.connected = action.connected;
        if (race) this.checkRaceDone(s);
        if (p && action.connected && s.delve) s.delve.excused = s.delve.excused.filter((id) => id !== p.id);
        // Co-op: a vote doesn't wait for someone who has just gone.
        if (s.delve && isGroupRun(s)) this.coopCarryOn(s);
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
        if (isGameMode(mode)) s.settings.mode = mode;
        // Custom starts out as the difficulty that was picked, the way it plays in the (new) mode.
        if (difficulty === 'custom' && !s.settings.custom) s.settings.custom = knobsOf(s.settings);
        if (isDifficulty(difficulty)) s.settings.difficulty = difficulty;
        // Knobs change one at a time; anything off the allowed steps keeps its old value.
        if (typeof custom === 'object' && custom !== null) s.settings.custom = cleanKnobs(custom, cleanKnobs(s.settings.custom));
        if (targetScore !== undefined) s.settings.targetScore = Math.max(1, Math.min(50, Math.round(targetScore)));
        if (typeof timer === 'number' && Number.isFinite(timer)) s.settings.timer = snapTimer(timer);
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
        // Delve together is co-op, played online: on one device it's a run alone (the lobby says so too).
        if (s.settings.mode === 'delve' && s.hostId === null && s.players.length > 1)
          throw new ActionError('Delve together is played online. On one device, Delve is for one player.');
        s.players = shuffle(s.players, this.rng);
        for (const p of s.players) {
          p.score = 0;
          p.recent = [];
          p.streak = 0;
        }
        s.round = 1;
        s.turnCount = 0;
        s.winners = [];
        s.deathmatch = null;
        s.recentCategories = [];
        s.artLean = {};
        s.delve = null;
        s.startedAt = this.now();
        if (s.settings.mode === 'delve') {
          // Every run draws from the whole pool, so one run's depth means the same as another's.
          s.used = [];
          s.delve = {
            entrants: s.players.map((p) => p.id),
            losses: {},
            ruleset: DELVE_RULESET,
            startedAt: this.now(),
            excused: [],
            graceUntil: 0,
            inventory: {},
            finds: [],
            ...(s.players.length > 1 ? { votes: {}, voteFrom: null, missed: {}, revives: [] } : {}),
          };
        }
        // The first turn goes to someone who is actually here.
        s.turn = Math.max(0, s.players.findIndex((p) => p.connected));
        if (race) this.beginRaceQuestion(s, true);
        else this.beginTurn(s, true);
        break;
      }
      case 'pick': {
        // Co-op: the team votes (a trusted pick, the host's own tooling, settles the vote at once).
        const coop = !!s.delve && isGroupRun(s);
        if (coop && from !== null) throw new ActionError('Vote for a card instead.');
        if (s.phase !== 'choosing') throw new ActionError("It's not time to pick a category.");
        if (!isActive) throw new ActionError("It's not your turn.");
        if (!s.offered.includes(action.category)) throw new ActionError('That category is not on offer.');
        if (coop) this.closeVote(s, action.category);
        else this.takePick(s, active, action.category);
        break;
      }
      case 'vote': {
        const dm = s.delve;
        if (!dm || !isGroupRun(s)) throw new ActionError('There is nothing to vote on.');
        if (from === null || !s.players.some((p) => p.id === from)) throw new ActionError('You are not in this game.');
        // A vote that crossed its close on the way is dropped quietly.
        if (s.phase !== 'choosing') throw new ActionError('Too late!', true);
        if (livesOf(s, from) <= 0) throw new ActionError('Only players still standing can vote.');
        if (typeof action.category !== 'string' || !s.offered.includes(action.category)) throw new ActionError('That category is not on offer.');
        (dm.votes ??= {})[from] = action.category;
        dm.voteFrom ??= this.now();
        // Voting is what ends being idle.
        (dm.missed ??= {})[from] = 0;
        this.coopCarryOn(s);
        break;
      }
      case 'revive': {
        if (from === null) throw new ActionError('Only a player can give a life.');
        const problem = reviveProblem(s, from, typeof action.target === 'string' ? action.target : '');
        // One that crossed the vote closing on its way (the question is on) is dropped quietly.
        if (problem) throw new ActionError(problem, s.phase === 'question');
        const dm = s.delve!;
        (dm.revives ??= []).push({ by: from, to: action.target, depth: s.round, fell: fellAt(s, action.target) ?? s.round, at: this.now() });
        // Back with one life and nothing else (their pack was lost where they perished), counted in the next vote.
        if (dm.missed) dm.missed[action.target] = 0;
        break;
      }
      case 'answer': {
        if (race) {
          this.raceAnswer(s, action, from);
          break;
        }
        if (s.delve && isGroupRun(s)) {
          this.coopAnswer(s, action, from);
          break;
        }
        if (s.phase !== 'question' || !s.question) {
          // An answer sent just as the timer ran out can land after the question closed; drop it quietly.
          if (action.askedAt !== undefined && action.askedAt === s.lastAskedAt) throw new ActionError('Too late!', true);
          throw new ActionError('There is no open question.');
        }
        if (!isActive) throw new ActionError("It's not your turn.");
        const q = s.question;
        if (action.askedAt !== undefined && action.askedAt !== q.askedAt) throw new ActionError('Too late!', true);
        // Delve: nobody answers a question whose clock hasn't started (a stray key in hot-seat included).
        if (s.delve && q.deadline === null && action.index !== null) throw new ActionError('Too early.', true);
        // Delve: the clock has hit 0 with a flare in hand that hasn't burnt
        // yet (its timer came late, or after this one). The time-out is not
        // taken: the flare burns instead, as it would have at 0. A player's
        // answer within the allowance for answers in flight was given before
        // then, so it counts and keeps the flare; one later than that finds
        // the flare burnt at 0 and is judged by the clock it left.
        let flareDue = this.flareDue(s, active) && this.now() >= q.deadline!;
        if (flareDue && from === null && action.index === null) {
          this.burnFlare(s, active.id);
          break;
        }
        if (flareDue && from !== null && this.now() > q.deadline! + ANSWER_GRACE_MS) {
          this.burnFlare(s, active.id, true);
          flareDue = false;
        }
        // With no flare to burn, a stick of dynamite goes off by itself in
        // place of the time-out, if the depth has a blast left (its fuse
        // has hissed over the clock's last DELVE_FUSE_MS on every screen:
        // delve.ts fuseLeft): as the host's time-out comes (0 and the
        // allowance for answers in flight), or as a player's answer later
        // than that arrives first (it was for the question blasted away, and
        // goes with it). Until then an answer counts as on any question.
        const timeOut = from === null && action.index === null;
        const late = from !== null && q.deadline !== null && this.now() > q.deadline + ANSWER_GRACE_MS;
        if (!flareDue && (timeOut || late) && fuseDue(s)) {
          this.blast(s, active.id, null);
          break;
        }
        const index = validIndex(action.index, q.options.length);
        const chosenId = index === null ? null : q.options[index];
        const timedOut =
          chosenId === null || (q.deadline !== null && from !== null && !flareDue && this.now() > q.deadline + ANSWER_GRACE_MS);
        const correct = !timedOut && chosenId === q.itemId;
        // A guest's answer that crossed the flare on its way (sent before their
        // clock hit 0, as the host's allowance for answers in flight has it)
        // keeps the flare: it goes back in their pack.
        if (!timedOut && q.flared && q.flaredAt !== undefined && from !== null && from !== s.hostId && this.now() <= q.flaredAt + ANSWER_GRACE_MS) {
          this.gain(s, active.id, 'flares');
          delete q.flared;
          delete q.flaredAt;
        }
        let gained: ItemKind | undefined;
        let forged = false;
        let warded = false;
        let caveIn: Pick<Reveal, 'caveIn' | 'lost'> = {};
        let blown: ItemKind | null = null;
        if (correct) {
          active.score += 1;
          // A right answer to a find earns its item (see delve.ts findReward): it is only offered to a player with room for it.
          const reward = s.delve && q.find ? findReward(q.find, inventoryOf(s, active.id), this.answeredFast(s, q, from)) : null;
          if (reward) [gained, forged] = this.gain(s, active.id, reward);
        } else if (s.delve) {
          // An Azurite Vein caves in for two losses, each taken by a ward if
          // one is held; on the last life the first loss is the fall, and
          // there is nothing left to take.
          const losses = q.find ? findLosses(q.find) : 1;
          const took = Array.from({ length: losses }, () => this.loseLife(s, active.id));
          const lost = { lives: took.filter((t) => t === 'life').length, wards: took.filter((t) => t === 'ward').length };
          warded = lost.wards > 0 && lost.lives === 0;
          if (q.find && cavesIn(q.find)) caveIn = { caveIn: true, lost };
          // A Dynamite Cache's blast takes one thing from their pack too.
          blown = this.blowUp(s, active.id);
        }
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
          ...(gained ? { gained } : {}),
          ...(forged ? { forged } : {}),
          ...(warded ? { warded } : {}),
          ...caveIn,
          ...(blown ? { blown } : {}),
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
        } else if (s.delve && isGroupRun(s)) {
          // The run moves on for everyone at once (by itself, online), and
          // anyone in it may move it on sooner: the first press counts, the
          // rest find nothing to continue.
          if (!isHost && !s.players.some((p) => p.id === from)) throw new ActionError('Only the team moves the run on.', true);
          this.advance(s);
        } else {
          if (!isActive && !isHost) throw new ActionError("It's not your turn.");
          this.advance(s);
        }
        break;
      }
      case 'skip': {
        // A skipped turn would cost a life, so nobody decides that by hand (the host's own id included).
        if (s.delve) throw new ActionError("Turns can't be skipped in Delve.");
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
        // Delve: a question on the clock can't be traded for another.
        if (s.delve && s.question.deadline !== null) throw new ActionError('The clock is already running.', true);
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
        // Delve: nobody has answered yet (no clock), so the pick's snapshot still holds.
        s.question = this.makeQuestion(s, voided.category, voided);
        // One a blast asked stays one (never a find's, see blast).
        if (voided.blast) s.question.blast = voided.blast;
        s.used.push(s.question.itemId);
        break;
      }
      case 'restart': {
        if (!isHost) throw new ActionError('Only the host can restart.');
        const fresh = createGame(s.hostId, s.settings);
        // Players who left during the game don't come back as ghosts in the lobby.
        fresh.players = s.players.filter((p) => p.connected).map((p) => ({ ...p, score: 0, recent: [], streak: 0 }));
        // Renames during the game take effect on colours now.
        const claims = fresh.players.filter((p) => reservedHue(p) !== undefined);
        for (const p of [...claims, ...fresh.players.filter((p) => !claims.includes(p))]) settleHue(fresh, p);
        fresh.spectators = s.spectators;
        fillSeats(fresh);
        fresh.version = s.version;
        fresh.lastAskedAt = s.lastAskedAt;
        fresh.used = s.used;
        Object.assign(s, fresh);
        delete s.startedAt;
        if (action.play) return this.apply(s, { type: 'start' }, from);
        break;
      }
      case 'clock': {
        if (from !== null) throw new ActionError('Not allowed.');
        const q = s.question;
        // Already running (a resumed host releasing the art again) or a question that is gone: nothing to start.
        if (!s.delve || s.phase !== 'question' || !q || q.askedAt !== action.askedAt || q.deadline !== null) break;
        const now = this.now();
        const at = typeof action.at === 'number' && Number.isFinite(action.at) ? action.at : now;
        q.clockAt = Math.min(Math.max(at, now), now + 1000);
        q.deadline = q.clockAt + questionTimer(s) * 1000;
        break;
      }
      case 'expire': {
        if (from !== null) throw new ActionError('Not allowed.');
        // Co-op: the vote's window ran out, or everyone it waits for has voted.
        // Without a vote it never runs out: nobody's card is picked for them.
        const closes = voteClosesAt(s);
        if (!s.delve || !isGroupRun(s) || s.phase !== 'choosing') break;
        if (voteDone(s, this.now()) || (closes !== null && this.now() >= closes - 250)) this.closeVote(s);
        break;
      }
      case 'resumed': {
        if (from !== null) throw new ActionError('Not allowed.');
        const dm = s.delve;
        if (!dm || s.phase === 'lobby' || s.phase === 'over') break;
        // Everyone the reload cut off gets a while to come back before a vote closes without them.
        const cutOff = () => s.players.filter((p) => !p.connected && livesOf(s, p.id) > 0).map((p) => p.id);
        dm.excused = cutOff();
        dm.graceUntil = this.now() + DELVE_RESUME_GRACE_MS;
        const coop = isGroupRun(s);
        // A question someone cut off may have answered while the host was gone
        // (co-op: anyone standing; alone, a guest can't have one): it is set
        // aside, and the same cards come back. Its pictures don't. It can't be
        // won any more, so it costs nobody anything either.
        if (s.phase === 'question' && s.question && (coop ? dm.excused.length > 0 : active && !active.connected)) {
          const voided = s.question;
          const snap = dm.snapshot;
          for (const id of voided.options) if (this.byId.has(id) && !s.used.includes(id)) s.used.push(id);
          this.tallyMode(s, voided.mode, -1);
          // The lockout goes back to what it was before the pick (the pick may
          // have pushed the oldest out of a full one; older saves: just undone).
          const before = snap?.picks ?? dm.picksBefore ?? (coop ? s.recentCategories : active.recent).slice(0, -1);
          if (coop) {
            s.recentCategories = before;
            dm.votes = {};
            dm.voteFrom = null;
          } else active.recent = before;
          if (snap) {
            // Everyone still here is put back as they were at the pick: the
            // lives and wards its wrong picks cost (co-op), the pack dropped
            // by perishing on it, a flare or dynamite spent on it, and their
            // streak; co-op, also how many votes in a row they let pass, as
            // the vote that picked it is held again. Someone who has left
            // stays gone. (A revive is never given during a question, so
            // none is undone.)
            const packs = (dm.inventory ??= {});
            const missed = snap.missed && (dm.missed ??= {});
            for (const p of s.players) {
              if (missed && snap.missed) {
                if (Object.hasOwn(snap.missed, p.id)) missed[p.id] = snap.missed[p.id];
                else delete missed[p.id];
              }
              if (Object.hasOwn(snap.losses, p.id)) dm.losses[p.id] = [...snap.losses[p.id]];
              else delete dm.losses[p.id];
              if (Object.hasOwn(snap.inventory, p.id)) packs[p.id] = { ...snap.inventory[p.id] };
              else delete packs[p.id];
              if (Object.hasOwn(snap.streaks, p.id)) p.streak = snap.streaks[p.id];
            }
            // Back on their feet, those cut off among them get the grace too.
            dm.excused = cutOff();
          } else {
            // Older saves: a flare or a stick of dynamite spent on it goes back
            // to whoever's it was (alone: the player's own), if they still
            // stand; losses stay.
            const owner = (by: string | undefined) => by ?? (coop ? undefined : active?.id);
            const flarer = voided.flared ? owner(voided.flaredBy) : undefined;
            const blaster = voided.blasted ? owner(voided.blastedBy) : undefined;
            if (flarer) this.gain(s, flarer, 'flares');
            if (blaster) this.gain(s, blaster, 'dynamite');
          }
          // Its blasts are undone with it (the snapshot gave their sticks
          // back): the same cards come back, none asked yet.
          const blasted = askedCards(s).length - 1;
          if (blasted > 0 && dm.blasts) dm.blasts = Math.max(0, dm.blasts - blasted);
          if (dm.blasts === 0) delete dm.blasts;
          delete dm.asked;
          delete dm.snapshot;
          delete dm.picksBefore;
          s.question = null;
          s.phase = 'choosing';
        }
        break;
      }
      case 'flare': {
        if (from !== null) throw new ActionError('Not allowed.');
        const q = s.question;
        const coop = !!s.delve && isGroupRun(s);
        // As the clock hits 0 (a timer a moment early still counts), and only before the time-out is in.
        if (!q || q.askedAt !== action.askedAt || !(coop ? teamItemReady(s, 'flares') : this.flareDue(s, active))) break;
        const now = this.now();
        if (now < q.deadline! - 250 || now > q.deadline! + ANSWER_GRACE_MS) break;
        this.burnFlare(s, coop ? this.anyHolder(s, 'flares') : active!.id);
        break;
      }
      case 'blast': {
        const q = s.question;
        // One that crossed its question's end on the way (a right answer,
        // the time-out, another blast: whichever the host took first) is
        // dropped quietly.
        if (!s.delve || s.phase !== 'question' || !q || action.askedAt !== q.askedAt) throw new ActionError('Too late!', true);
        const coop = isGroupRun(s);
        // Alone the player answering (on one device, whoever presses);
        // together anyone standing who hasn't answered it, or (null) the
        // host's own tooling for the team.
        const by = from ?? (coop ? null : (active?.id ?? null));
        const problem = blastProblem(s, by);
        if (problem) throw new ActionError(problem, true);
        // Past the allowance for answers in flight the time-out is due, and
        // deals with it: a flare burns first, or the dynamite goes off by
        // itself. While its fuse hisses before 0, Detonate sets it off at once.
        if (this.now() > q.deadline! + ANSWER_GRACE_MS) throw new ActionError('Too late!', true);
        this.blast(s, coop ? this.anyHolder(s, 'dynamite') : active!.id, by);
        break;
      }
    }
    if (s.reveal && !prev.reveal) {
      s.reveal.at = this.now();
      countStreaks(s, s.reveal);
      // Answered: what the question cost stands, and its snapshot goes.
      if (s.delve) {
        delete s.delve.snapshot;
        delete s.delve.picksBefore;
      }
    }
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

  // ---- delve ------------------------------------------------------------

  /**
   * The player on turn picks a category (co-op: the team's vote did, `active`
   * null). Picking a find is an ordinary pick of it: which card is which is
   * the host's own record, so a guest can't make one up. With two finds on
   * offer, the question is the picked card's find, if it holds one.
   */
  private takePick(s: GameState, active: Player | null, category: string, missedBefore?: Record<string, number>) {
    let kind: Pick<Question, 'find'> = {};
    if (s.delve) {
      // What the question can change, in case it is set aside (see 'resumed').
      // A reask remakes the question without coming here, so it keeps this.
      s.delve.snapshot = {
        picks: [...(active ? active.recent : s.recentCategories)],
        losses: structuredClone(s.delve.losses),
        inventory: structuredClone(s.delve.inventory ?? {}),
        streaks: Object.fromEntries(s.players.map((p) => [p.id, p.streak ?? 0])),
        ...(missedBefore ? { missed: missedBefore } : {}),
      };
      delete s.delve.picksBefore;
      // The first card of this depth's asked (more come with blasts, see blast).
      s.delve.asked = [category];
      // Co-op locks out the team's picks, alone the player's own.
      if (active) active.recent = lastPicks([...active.recent, category], DELVE_MAX_LOCKOUT);
      else s.recentCategories = lastPicks([...s.recentCategories, category], DELVE_MAX_LOCKOUT);
      const find = findOn(s, category);
      if (find) kind = { find };
    } else if (active && !s.deathmatch) {
      active.recent = lastPicks([...active.recent, category], rulesFor(s.settings).lockout);
    }
    // Initiate's grace, as it was before this pick decides the question (a deathmatch's takes none of it).
    const grace = !s.delve && !s.deathmatch ? active?.grace : undefined;
    s.question = this.makeQuestion(s, category, kind);
    s.used.push(s.question.itemId);
    s.phase = 'question';
    // One gentle question spent; the pick after the last one ends the grace.
    if (grace !== undefined && active) {
      if (grace > 0) active.grace = grace - 1;
      else delete active.grace;
    }
  }

  /**
   * A loss for a player who still has a life: an Azurite Ward takes it if they
   * hold one, a life otherwise. Either way their streak ends. Says which it
   * took. Perishing, a player drops everything they carry, for good: brought
   * back by a teammate, they start again with nothing.
   */
  private loseLife(s: GameState, id: string): 'ward' | 'life' | null {
    if (livesOf(s, id) <= 0) return null;
    const p = s.players.find((p) => p.id === id);
    if (p) p.streak = 0;
    if (this.spend(s, id, 'wards')) return 'ward';
    (s.delve!.losses[id] ??= []).push(s.round);
    if (livesOf(s, id) === 0 && s.delve!.inventory?.[id]) s.delve!.inventory[id] = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
    return 'life';
  }

  /**
   * One more of an item for a player still standing, if they have room for it
   * (delve.ts hasRoom). A shard that makes SHARDS_PER_WARD forges a ward.
   * Says what they gained (undefined for nothing) and whether a ward was forged.
   */
  private gain(s: GameState, id: string, item: ItemKind): [ItemKind | undefined, boolean] {
    const inv = inventoryOf(s, id);
    if (!hasRoom(inv, item) || livesOf(s, id) <= 0) return [undefined, false];
    let forged = false;
    if (item === 'shards' && inv.shards + 1 >= SHARDS_PER_WARD) {
      inv.shards = 0;
      inv.wards++;
      forged = true;
    } else inv[item]++;
    // With every ward a player can hold, no shard is kept (a fast Vein's ward or a forge may reach it).
    (s.delve!.inventory ??= {})[id] = capShards(inv);
    return [forged ? 'wards' : item, forged];
  }

  /**
   * Delve: a stick of `stick`'s dynamite blasts the question in play away
   * for a new one at the same depth, set off by `by` (null: by itself, as
   * the clock hit 0 with no flare to burn). Its card is drawn from those on
   * the offer not asked yet: together, the cards that got votes first (most
   * votes first, ties drawn), then the rest, drawn; alone, one of them,
   * drawn. The new question is a fresh one, on the depth's full clock and
   * rules (the clock starts once its art is out, as ever), and never a
   * find's, even on a find's card: dynamite is no way to fish for finds. It
   * locks its card out like a pick. What the blasted one cost stands (a
   * teammate's wrong answer stays paid); answers to it still on their way
   * are dropped, as its askedAt is gone. Nothing happens without a card left
   * or a stick to spend (blastProblem has said so already).
   */
  private blast(s: GameState, stick: string, by: string | null) {
    const dm = s.delve!;
    const was = s.question!;
    const cards = unaskedCards(s);
    if (!cards.length || !this.spend(s, stick, 'dynamite')) return;
    const votes = Object.values(dm.votes ?? {});
    const backing = (c: string) => votes.filter((v) => v === c).length;
    // Drawn, then (the sort is stable) those with the most votes to the front.
    const category = shuffle(cards, this.rng).sort((a, b) => backing(b) - backing(a))[0];
    dm.asked = [...askedCards(s), category];
    dm.blasts = (dm.blasts ?? 0) + 1;
    const active = isGroupRun(s) ? null : s.players[s.turn];
    if (active) active.recent = lastPicks([...active.recent, category], DELVE_MAX_LOCKOUT);
    else s.recentCategories = lastPicks([...s.recentCategories, category], DELVE_MAX_LOCKOUT);
    const side = s.offered.indexOf(category) < s.offered.indexOf(was.category) ? -1 : 1;
    // The wrong answers it took stay paid, so every screen logs them (codex.ts blastedEncounter).
    const struck = (was.struck ?? []).map(({ by, index, lives, wards }) => ({ by, index, lives, wards }));
    s.question = this.makeQuestion(s, category);
    s.question.blast = {
      ...(by ? { by } : {}),
      stick,
      side,
      was: { at: was.askedAt, itemId: was.itemId, mode: was.mode, ...(struck.length ? { struck } : {}) },
    };
    s.used.push(s.question.itemId);
  }

  /**
   * Delve: a flare would burn for the player answering once their clock hits
   * 0: it runs, none has burnt on this question, it isn't a find's, and they
   * are here and hold one (a flare can't help someone who can't answer).
   */
  private flareDue(s: GameState, active: Player | undefined): active is Player {
    const q = s.question;
    if (!s.delve || s.phase !== 'question' || !q || q.deadline === null || q.flared || !itemsWorkOn(q) || !active?.connected) return false;
    return inventoryOf(s, active.id).flares > 0;
  }

  /**
   * Delve: one of `holder`'s flares burns (see flareDue, delve.ts
   * teamItemReady), and the clock runs FLARE_MS longer from 0 (or from now,
   * should that be later), for everyone answering. `onTime`: it burns as it
   * should have at 0, its extra time counted from then even if that is past
   * (a player's answer arrived well after 0 with the flare still unburnt).
   * `flaredAt` is the deadline as it was before it moved, even for a flare
   * its timer burnt a moment early: an answer given in time is judged by
   * that 0 (its allowance for answers in flight counted from it), so it
   * gets the flare back.
   */
  private burnFlare(s: GameState, holder: string, onTime = false) {
    const q = s.question!;
    const now = this.now();
    if (!this.spend(s, holder, 'flares')) return;
    q.flared = true;
    q.flaredBy = holder;
    q.flaredAt = q.deadline!;
    q.deadline = (onTime ? q.deadline! : Math.max(q.deadline!, now)) + FLARE_MS;
  }

  /**
   * A miss on a Dynamite Cache (the question in play): after its loss, the
   * blast destroys one thing `id` carries, drawn with the engine's roll
   * (delve.ts blastVictim), and says what. Nothing on any other question,
   * for a player who perished on it (their pack is gone already) or who
   * carries nothing; no roll is used then.
   */
  private blowUp(s: GameState, id: string): ItemKind | null {
    const q = s.question;
    if (!s.delve || !q?.find || !blowsUp(q.find) || livesOf(s, id) <= 0) return null;
    const inv = inventoryOf(s, id);
    if (!blastVictim(inv, 0)) return null;
    const item = blastVictim(inv, this.rng())!;
    return this.spend(s, id, item) ? item : null;
  }

  /** Uses up one of an item; false when the player has none. */
  private spend(s: GameState, id: string, item: ItemKind): boolean {
    const inv = inventoryOf(s, id);
    if (inv[item] <= 0) return false;
    inv[item]--;
    (s.delve!.inventory ??= {})[id] = inv;
    return true;
  }

  /**
   * An answer arrived within an Azurite Vein's fast window (delve.ts
   * veinWindow) of the clock starting, measured on the host. A guest saw the clock start up to a one-way trip late and
   * their answer takes another to arrive, so it gets the same allowance as an
   * answer at the deadline; the host's own and hot-seat answers travel nowhere.
   */
  private answeredFast(s: GameState, q: Question, from: string | null): boolean {
    if (q.clockAt === undefined) return false;
    const guest = from !== null && from !== s.hostId;
    return this.now() - q.clockAt <= veinWindow(delveQuestionTimer(s.round, q)) + (guest ? ANSWER_GRACE_MS : 0);
  }

  /**
   * Which of the cards on offer are finds, and of what: one roll against the
   * finds' slices at this depth (delve.ts findChance), and, if that found
   * one, a second for another kind on another card, at SECOND_FIND of its
   * chance. Never more than two. A find whose item the player on turn
   * (co-op: anyone standing, as anyone may answer it) can't carry any more
   * of is never offered: its slice finds nothing, so the others' chances
   * stay the depth's.
   */
  private rollFinds(s: GameState, takers: string[]): CardFind[] {
    if (!s.delve || !takers.length || !s.offered.length) return [];
    const room = (item: ItemKind) => takers.some((id) => hasRoom(inventoryOf(s, id), item));
    const chances = (share: number, but?: FindKind) => FINDS.filter((f) => f.kind !== but).map((f) => ({ ...f, chance: findChance(f.kind, s.round) * share }));
    const first = this.rollFind(chances(1), room, s.offered);
    if (!first) return [];
    const second = this.rollFind(
      chances(SECOND_FIND, first.kind),
      room,
      s.offered.filter((c) => c !== first.category),
    );
    return second ? [first, second] : [first];
  }

  /** One roll against `slices` for a find on one of `cards` (none for a slice whose item nobody has `room` for). */
  private rollFind(slices: { kind: FindKind; item: ItemKind; chance: number }[], room: (item: ItemKind) => boolean, cards: string[]): CardFind | null {
    const live = slices.filter((f) => f.chance > 0);
    if (!live.length || !cards.length) return null;
    let r = this.rng();
    for (const f of live) {
      if (r < f.chance) return room(f.item) ? { category: sample(cards, 1, this.rng)[0], kind: f.kind } : null;
      r -= f.chance;
    }
    return null;
  }

  /**
   * Alone: moves on to the player's next turn, one depth deeper (the seat
   * after `from` with lives left; one player, so their own), or ends the run
   * with their last life: the depth is the result, nobody wins.
   */
  private advanceDelve(s: GameState, from: number) {
    const n = s.players.length;
    let next = from;
    let wrapped = false;
    let found = false;
    for (let i = 0; i < n; i++) {
      next++;
      if (next >= n) {
        next = 0;
        wrapped = true;
      }
      if (livesOf(s, s.players[next].id) > 0) {
        found = true;
        break;
      }
    }
    if (!found) {
      this.finish(s, []);
      return;
    }
    if (wrapped) s.round++;
    s.turn = next;
    this.beginTurn(s, false);
  }

  // ---- delve co-op --------------------------------------------------------

  /** Co-op: a random standing holder of `item` (the engine's roll, so a seeded run is repeatable). */
  private anyHolder(s: GameState, item: 'flares' | 'dynamite'): string {
    return sample(holdersOf(s, item), 1, this.rng)[0];
  }

  /**
   * Co-op: what a change of who is here (or seated, or voted) settles. A vote
   * is in once everyone it waits for has voted; a question is over once
   * nobody standing is left to answer it; with nobody standing at all
   * between questions, the run is over.
   */
  private coopCarryOn(s: GameState) {
    if (s.phase === 'choosing') {
      if (!standingIds(s).length) this.finish(s, []);
      else if (voteDone(s, this.now())) this.closeVote(s);
    } else if (s.phase === 'question' && s.question && !waitingIds(s).length) {
      this.coopReveal(s, null, false, []);
    }
  }

  /**
   * Co-op: the vote closes. Each vote is a ticket, drawn with the engine's
   * roll in seat order (two votes for a card, twice its chance); `forced` (a
   * trusted pick) settles it instead. Everyone standing who let it pass is
   * a vote nearer to idle.
   */
  private closeVote(s: GameState, forced?: string) {
    const dm = s.delve!;
    const votes = dm.votes ?? {};
    const tickets = s.players.flatMap((p) => (Object.hasOwn(votes, p.id) && s.offered.includes(votes[p.id]) ? [votes[p.id]] : []));
    const category = forced ?? (tickets.length ? tickets[Math.floor(this.rng() * tickets.length)] : undefined);
    if (category === undefined) return;
    const missed = (dm.missed ??= {});
    // As it was before this vote counted (see DelveSnapshot.missed).
    const missedBefore = { ...missed };
    for (const id of standingIds(s)) missed[id] = Object.hasOwn(votes, id) ? 0 : (missed[id] ?? 0) + 1;
    dm.voteFrom = null;
    this.takePick(s, null, category, missedBefore);
  }

  /**
   * Co-op: an answer to the team's question. The host's time-out (from
   * null, no index) costs everyone standing who hasn't answered; a player's
   * pick either clears the depth (the first right one) or strikes its option
   * for everyone at the cost of a life. Each player answers once; an option
   * struck already is not there to pick, and a pick of one is dropped at no
   * cost (another got there first).
   */
  private coopAnswer(s: GameState, action: Extract<Action, { type: 'answer' }>, from: string | null) {
    const q = s.question;
    if (s.phase !== 'question' || !q) {
      if (action.askedAt !== undefined && action.askedAt === s.lastAskedAt) throw new ActionError('Too late!', true);
      throw new ActionError('There is no open question.');
    }
    if (action.askedAt !== undefined && action.askedAt !== q.askedAt) throw new ActionError('Too late!', true);
    if (q.deadline === null) throw new ActionError('Too early.', true);
    const now = this.now();
    // A flare still to burn at 0 (its timer came late): time hasn't run out yet.
    let flareDue = teamItemReady(s, 'flares') && now >= q.deadline;
    if (from === null) {
      if (action.index !== null) throw new ActionError('Only players can answer.');
      if (flareDue) {
        this.burnFlare(s, this.anyHolder(s, 'flares'));
        return;
      }
      // With no flare to burn, a stick of dynamite from anyone's pack goes
      // off by itself, if the depth has a blast left (its fuse has hissed
      // over the clock's last seconds: delve.ts fuseLeft). Nobody is hit,
      // and the whole team gets the new question.
      if (fuseDue(s)) {
        this.blast(s, this.anyHolder(s, 'dynamite'), null);
        return;
      }
      const hits = waitingIds(s).map((id) => ({ playerId: id, ...this.hit(s, id), timedOut: true }));
      this.coopReveal(s, null, true, hits);
      return;
    }
    if (!s.players.some((p) => p.id === from)) throw new ActionError('You are not in this game.');
    if (livesOf(s, from) <= 0) throw new ActionError('Only players still standing can answer.');
    const struck = (q.struck ??= []);
    if (struck.some((x) => x.by === from)) throw new ActionError('You already answered.', true);
    const index = validIndex(action.index, q.options.length);
    if (index === null) throw new ActionError('Pick an answer.', true);
    // Later than the allowance for answers in flight, the flare burnt at 0
    // (as its timer should have had it), and the answer is judged by the
    // clock it left. Too late for that as well, the flare stays burnt (no
    // throw, which would undo it) and the answer is dropped: the host's
    // time-out, due already, deals with it.
    if (flareDue && now > q.deadline + ANSWER_GRACE_MS) {
      this.burnFlare(s, this.anyHolder(s, 'flares'), true);
      flareDue = false;
      if (now > q.deadline + ANSWER_GRACE_MS) return;
    }
    if (!flareDue && now > q.deadline + ANSWER_GRACE_MS) throw new ActionError('Too late!', true);
    if (struck.some((x) => x.index === index)) throw new ActionError('Someone already picked that.', true);
    if (q.options[index] === q.itemId) {
      this.coopReveal(s, { id: from, index }, false, []);
      return;
    }
    const took = this.hit(s, from);
    struck.push({ index, by: from, at: now, ...took });
    const chosenId = q.options[index];
    if (isFake(chosenId) && !s.used.includes(chosenId)) s.used.push(chosenId);
    this.coopCarryOn(s);
  }

  /**
   * Co-op: the losses one wrong answer (or the time-out) deals a player: two
   * on an Azurite Vein, each a ward's first; on a Dynamite Cache, also one
   * thing from their own pack (blowUp). Only the player who missed pays.
   */
  private hit(s: GameState, id: string): { lives: number; wards: number; blown?: ItemKind } {
    const q = s.question!;
    const took = Array.from({ length: q.find ? findLosses(q.find) : 1 }, () => this.loseLife(s, id));
    const blown = this.blowUp(s, id);
    return { lives: took.filter((t) => t === 'life').length, wards: took.filter((t) => t === 'ward').length, ...(blown ? { blown } : {}) };
  }

  /**
   * Co-op: the question is over, cleared by `winner`'s right answer or by
   * nobody (all wrong, or the time-out's `hits`). The winner earns the find's
   * item, if it is one, as alone (an Azurite Vein's fast window counted from
   * the clock's start to their answer); with no room for it, a standing
   * teammate who has room takes it (`gainedBy`).
   */
  private coopReveal(s: GameState, winner: { id: string; index: number } | null, timedOut: boolean, hits: Hit[]) {
    const q = s.question!;
    const struck = q.struck ?? [];
    let gained: ItemKind | undefined;
    let gainedBy: string | undefined;
    let forged = false;
    if (winner) {
      const p = s.players.find((p) => p.id === winner.id);
      if (p) p.score += 1;
      // A guest's right answer on its way as the flare burnt (sent before 0)
      // gives it back to whoever held it, unless the host's own answer used
      // the flare's time (it travels nowhere).
      const guest = winner.id !== s.hostId;
      if (guest && q.flared && q.flaredAt !== undefined && q.flaredBy && this.now() <= q.flaredAt + ANSWER_GRACE_MS && !struck.some((x) => x.by === s.hostId && x.at >= q.flaredAt!)) {
        this.gain(s, q.flaredBy, 'flares');
        delete q.flared;
        delete q.flaredAt;
        delete q.flaredBy;
      }
      // The find goes to the winner if they have room for it, or else to the
      // first standing teammate in seat order who has: it was offered as
      // anyone standing had room, so it never pays nothing.
      if (q.find) {
        const fast = this.answeredFast(s, q, winner.id);
        const takers = [winner.id, ...standingIds(s).filter((id) => id !== winner.id)];
        for (const id of takers) {
          const reward = findReward(q.find, inventoryOf(s, id), fast);
          if (!reward) continue;
          [gained, forged] = this.gain(s, id, reward);
          if (gained) {
            gainedBy = id;
            break;
          }
        }
      }
    }
    const all: Hit[] = [
      ...struck.map((x) => ({ playerId: x.by, lives: x.lives, wards: x.wards, timedOut: false, ...(x.blown ? { blown: x.blown } : {}) })),
      ...hits,
    ];
    s.reveal = {
      correctId: q.itemId,
      chosenId: winner ? q.itemId : null,
      correctIndex: q.options.indexOf(q.itemId),
      chosenIndex: winner ? winner.index : null,
      correct: !!winner,
      timedOut,
      winnerId: winner?.id ?? null,
      ...(gained ? { gained, gainedBy } : {}),
      ...(forged ? { forged } : {}),
      ...(q.find && cavesIn(q.find) && all.length ? { caveIn: true } : {}),
      hits: all,
    };
    s.phase = 'reveal';
  }

  /** Co-op: after a reveal, one depth deeper for whoever stands (a revived player too), or the end of the run. */
  private advanceCoop(s: GameState) {
    if (!standingIds(s).length) {
      this.finish(s, []);
      return;
    }
    s.round++;
    this.beginTurn(s, false);
  }

  // ---- turns mode -------------------------------------------------------

  private beginTurn(s: GameState, first: boolean) {
    if (!first) s.turnCount++;
    s.phase = 'choosing';
    s.question = null;
    s.reveal = null;
    const coop = !!s.delve && isGroupRun(s);
    if (coop) {
      const dm = s.delve!;
      dm.votes = {};
      dm.voteFrom = null;
      // Past the grace, anyone the reload cut off is just away.
      if (this.now() >= dm.graceUntil) dm.excused = [];
      // Whose seat the screens lean on: the first standing (nobody's turn as such).
      s.turn = Math.max(0, s.players.findIndex((p) => livesOf(s, p.id) > 0));
    }
    // In a deathmatch nobody picks their favourite: one random category.
    s.offered = s.deathmatch ? [this.randomCategory(s)] : this.offerCategories(s, s.players[s.turn]);
    if (s.delve) {
      s.delve.finds = this.rollFinds(s, coop ? standingIds(s) : s.players[s.turn] ? [s.players[s.turn].id] : []);
      delete s.delve.find;
      delete s.delve.asked;
    }
  }

  private finish(s: GameState, winners: string[]) {
    if (s.delve) {
      s.delve.finds = [];
      delete s.delve.find;
      if (s.delve.voteFrom !== undefined) s.delve.voteFrom = null;
      delete s.delve.snapshot;
      delete s.delve.picksBefore;
      delete s.delve.asked;
    }
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
    if (s.delve) {
      if (isGroupRun(s)) this.advanceCoop(s);
      else this.advanceDelve(s, from);
      return;
    }
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

  /** Three cards for `player` to pick from (co-op: for the team, whose picks lock out together). */
  offerCategories(s: GameState, player: Player | undefined): string[] {
    // Delve keeps a longer history and locks out as many picks as the depth says, from this turn on.
    const recent = s.delve && isGroupRun(s) ? s.recentCategories : (player?.recent ?? []);
    const locked = s.delve ? lastPicks(recent, delveLockout(s.round)) : recent;
    const allowed = this.categories.filter((c) => !locked.includes(c));
    const fresh = allowed.filter((c) => this.unusedIn(s, c).length > 0);
    const stale = allowed.filter((c) => !fresh.includes(c));
    const pick = sample(fresh, OFFER_COUNT, this.rng);
    if (pick.length < OFFER_COUNT) pick.push(...sample(stale, OFFER_COUNT - pick.length, this.rng));
    return pick;
  }

  /**
   * Decoys picked for looking alike: a cluster of names (or, `byArt`, of
   * pictures) around an anchor. The answer plays any role in it as often as a
   * decoy would (the anchor, another member, or one of the random fillers
   * outside it), so "the name that fits the others best" doesn't give it
   * away.
   */
  private lookalikes(answer: Item, pool: Item[], count: number, options: number, byArt = false): Item[] {
    if (count <= 0) return [];
    // By art only with the table at hand and the answer in it (items added
    // since it was built have no look-alikes); by name otherwise.
    const looks = byArt && this.looks?.looksLike(answer.id).length ? this.looks : null;
    const like = looks ? (a: Item, b: Item) => looks.lookScore(a.id, b.id) : (a: Item, b: Item) => this.similarity(a, b);
    // The items most like `to`, with a few to spare so the pick still varies.
    const near = (to: Item, from: Item[]) =>
      shuffle(from, this.rng) // random order among equal scores
        .map((it) => ({ it, score: like(to, it) + (it.group === to.group ? 0.15 : 0) }))
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
      // Art is ranked sparsely, within a group: an item with no score at all
      // can still have the answer among its closest, by chance, when the pool
      // runs low. So by art the anchor must look like the answer too.
      const anchors = pool.filter((a) => (!looks || like(a, answer) > 0) && near(a, [answer, ...others(a)]).includes(answer));
      // An odd picture may be among nobody's closest, and a cluster around any
      // item at all would leave it the odd one out: then the anchor is one of
      // the items it looks most like instead.
      const anchor = sample(anchors.length ? anchors : looks ? near(answer, pool) : pool, 1, this.rng)[0];
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
   * has to start over. Delve: a `find` gets the rules and clock of deeper
   * down (delve.ts findRules).
   */
  makeQuestion(s: GameState, category: string, kind: Pick<Question, 'find'> = {}): Question {
    const special: Pick<Question, 'find'> = s.delve && kind.find ? { find: kind.find } : {};
    // An Initiate question (INITIATE_RULES): always the art, its decoys from other families.
    const initiate = initiateNow(s);
    const rules = s.delve ? delveQuestionRules(s.round, special) : activeRules(s);
    const inCat = this.byCategory.get(category) ?? [];
    // Rolled all the same (with an art share of 1 it says art anyway), so every other question rolls as before.
    let mode = this.rollMode(s);
    if (initiate && mode !== 'art') {
      this.tallyMode(s, mode, -1);
      this.tallyMode(s, (mode = 'art'), 1);
    }
    let fakes = mode === 'name' && this.fakes.size ? rules.fakes : 0;
    // Delve, past depth 100: now and then one more made-up name, as far as they fit.
    if (fakes && rules.moreFakes && this.rng() < rules.moreFakes) fakes = Math.min(maxFakes(rules.options), fakes + 1);

    // Earlier answers never come back as decoys (they'd be easy to rule out).
    // An answer needs a full set of unseen decoys from its own group, or one
    // to share evenly with other groups (two of each, three of each…): a
    // group smaller than the rest would most likely hold the answer. A name
    // question also needs room for its made-up names: when only a picture
    // question fits (two groups of three can't hold three fakes), it turns
    // into one, and the art lean makes up for it later. With no picture
    // questions at all, it shows the fakes that fit instead. Rare groups
    // (tablets) never mix, or one would stand out. Other items sit out; once
    // none can be asked, the category starts over, except for its latest
    // answer.
    const answerable = (unused: Item[]) => {
      const roomy = shareable(unused, fakes);
      if (roomy.length || !fakes) return roomy;
      const any = shareable(unused, 0);
      if (any.length && rules.artChance > 0) {
        this.tallyMode(s, mode, -1);
        this.tallyMode(s, (mode = 'art'), 1);
        fakes = 0;
      }
      return any;
    };
    const shareable = (unused: Item[], fakes: number) => {
      const left = new Map<string, number>();
      for (const it of unused) left.set(it.group, (left.get(it.group) ?? 0) + 1);
      const others = (group: string) => [...left].flatMap(([g, n]) => (g === group || Object.hasOwn(RARE_GROUPS, g) ? [] : [n]));
      return unused.filter((it) => {
        const siblings = left.get(it.group)! - 1;
        return siblings >= optionsFor(it, rules.options) - 1 || (weightOf(it) === 1 && evenSizes(rules.options, siblings, others(it.group), fakes).length > 0);
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
    // Fewer for a rare group's item (RARE_MAX_OPTIONS), and its made-up names to match.
    const count = optionsFor(answer, rules.options);
    const need = count - 1;
    fakes = Math.min(fakes, maxFakes(count));

    let decoys: Item[];
    if (initiate) decoys = this.wideDecoys(answer, need, s);
    else {
      const sameGroup = unused.filter((it) => it.id !== answer.id && it.group === answer.group);
      // Decoys come from the answer's own group (all rings, all bows…): a flask
      // among tablets would stand out. Other groups only fill in when it runs
      // too low, evened out with it, and rare groups (tablets) not even then.
      const otherGroup = unused.filter((it) => it.id !== answer.id && it.group !== answer.group && weightOf(it) === 1);
      const pool = sameGroup.length >= need ? sameGroup : [...sameGroup, ...otherGroup];

      // Delve's look-alikes rise a little every depth: a share between two counts rolls for the one more.
      const sims = need * rules.similarNames;
      const simCount = Math.min(pool.length, s.delve ? Math.floor(sims) + (sims % 1 > 0 && this.rng() < sims % 1 ? 1 : 0) : Math.round(sims));
      // Delve, from depth 50: now and then the look-alikes are picked by their
      // art (for a picture question its wrong pictures, for a name question the
      // names of items drawn like it). Rolled whether or not the table has come
      // yet. When it comes up, picking by art rolls differently from picking by
      // name, so the rest of the question then differs with the table there or
      // not (the same seed only asks the same question if it was there both
      // times or neither).
      const byArt = !!rules.lookalikes && this.rng() < rules.lookalikes;
      decoys = this.lookalikes(answer, pool, simCount, count, byArt);
      // Rest at random, preferring the same group, then the category, then anything.
      for (const source of [pool, unused, inCat, this.items]) {
        if (decoys.length >= need) break;
        const taken = new Set([answer.id, ...decoys.map((it) => it.id)]);
        decoys.push(...sample(source.filter((it) => !taken.has(it.id)), need - decoys.length, this.rng));
      }
      if (pool !== sameGroup) this.evenOut(answer, decoys, pool, fakes);
    }

    const options = shuffle([answer, ...decoys], this.rng).map((it) => it.id);
    // Strictly increasing: it doubles as the question's id for late answers.
    const askedAt = Math.max(this.now(), (s.lastAskedAt ?? 0) + 1, (s.question?.askedAt ?? 0) + 1);
    s.lastAskedAt = askedAt;
    const timer = s.settings.mode === 'race' ? s.settings.timer || RACE_DEFAULT_TIMER : s.settings.timer;
    // Delve: the clock starts once the art has reached the player answering (the 'clock' action).
    const deadline = !s.delve && timer > 0 ? askedAt + timer * 1000 : null;
    // Delve: deep down, "find the art" pictures may burn in as well, each cut much coarser.
    const tiles = mode === 'art' && !!rules.veil && !!s.delve && this.rng() < (special.find ? findTileVeil(special.find, s.round) : delveTileVeil(s.round));
    const secs = questionClock(s, special);
    const size = rules.veil && (tiles ? tileVeilSize(rules.veil.size) : rules.veil.size);
    // Its share of the clock, faster on a short one (veilSeconds); none on a
    // clock too short for half the art to be in with VEIL_LEFT_MS to spare
    // (a Flare Cache's shortest).
    const veilSecs = rules.veil && size && (mode === 'name' || tiles) ? veilSeconds(secs, rules.veil.share, size, tiles) : 0;
    const veil: Veil | null = veilSecs > 0 && size ? { size, seconds: veilSecs, seed: Math.floor(this.rng() * 2 ** 31) } : null;
    const fakeNames = mode === 'name' ? this.mixInFakes(options, answer.id, fakes, new Set(s.used)) : new Map<string, string>();
    // Gem groups are attributes ("Intelligence"), not kinds of item.
    const groups = answer.kind === 'gem' ? [] : this.groupsOf(options);
    const labels = options.map((id) => (mode === 'name' ? (fakeNames.get(id) ?? this.byId.get(id)!.name) : null));
    const prompt = mode === 'art' ? answer.name : null;
    // Each picture flips on its own roll, so a flipped option says nothing about the answer.
    const mirrored = Array.from({ length: mode === 'art' ? options.length : 1 }, () => rules.mirror > 0 && this.rng() < rules.mirror);
    // Delve: the art in grayscale or not, rolled for each question.
    const gray = rules.grayChance ? { gray: this.rng() < rules.grayChance } : {};
    const initiated = initiate ? { initiate: true as const } : {};
    return { category, groups, mode, itemId: answer.id, options, labels, prompt, veil, mirrored, ...gray, askedAt, deadline, misses: [], ...special, ...initiated };
  }

  /**
   * An Initiate question's decoys: `need` pictures, each from another family
   * of item than the answer's and than each other's (initiateFamily), so only
   * the answer is from the category picked. Never a rare group's (tablets);
   * items not yet asked in this room first.
   */
  private wideDecoys(answer: Item, need: number, s: GameState): Item[] {
    const used = new Set(s.used);
    const byFamily = new Map<string, Item[]>();
    const own = initiateFamily(answer);
    for (const it of this.items) {
      const family = initiateFamily(it);
      if (it.id === answer.id || family === own || weightOf(it) !== 1) continue;
      const list = byFamily.get(family);
      if (list) list.push(it);
      else byFamily.set(family, [it]);
    }
    return sample([...byFamily.keys()], need, this.rng).map((family) => {
      const all = byFamily.get(family)!;
      const fresh = all.filter((it) => !used.has(it.id));
      return sample(fresh.length ? fresh : all, 1, this.rng)[0];
    });
  }
}

/** Whose art lean a question counts toward: the player answering it, or the whole room in a race or a co-op run. */
function artKey(s: GameState): string {
  return s.settings.mode === 'race' || (s.delve && isGroupRun(s)) ? '' : (s.players[s.turn]?.id ?? '');
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
