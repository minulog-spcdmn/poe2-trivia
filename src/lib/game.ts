// Pure game logic. The host (or the single device in hot-seat mode) is the only
// place this runs; everyone else just renders the state it broadcasts.

import { cleanName, isHeldName, nameProblem, nameSkeleton } from './names.ts';
import { RUBY, isChoosableHue } from './palette.ts';
import { isPlayerClass, type PlayerClass } from './classSigils.ts';
import type { Looks } from './looks.ts';
import {
  CRAFT,
  canScramble,
  craftOver,
  deal,
  guessedBy,
  holds,
  isOrb,
  madeBy,
  ORBS,
  rightGuess,
  scramble,
  settle,
  stepMs,
  undo,
  type Craft,
  type CraftItem,
  type CraftStep,
  type ModLines,
  type Orb,
  type Piece,
  type Table,
} from './craft.ts';
import {
  DELVE_MAX_LOCKOUT,
  DELVE_RESUME_GRACE_MS,
  DELVE_RESUME_MIN_MS,
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
  clockLeft,
  cutOffAnswering,
  heldAhead,
  blastVictim,
  blowsUp,
  fellAt,
  findChance,
  firstFindAt,
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
  veilSeconds,
  voteClosesAt,
  voteDone,
  opensZone,
  ZONE_DESCENT_MS,
  dealIn,
  DEAL_SLACK_MS,
  unaskedCards,
  waitingIds,
  SECOND_FIND,
  findOn,
  livesOf,
  standingIds,
  WAY_OUT,
  digOf,
  digRunsOn,
  isWayOut,
  lampAfter,
  wardRoom,
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
  /** Its art's size, in art pixels (poe2db's, about 104 per inventory cell); its picture is artScale times that (ui-paths.ts). */
  w: number;
  h: number;
  /**
   * The other ways the game draws it, each with its own base and tooltip:
   * Grand Spectrum is a Ruby, an Emerald or a Sapphire, each its own colour,
   * and Grip of Kulemak glows brighter with each desecrated mod it can take.
   * A question shows any of its art, each as often (Question.variant).
   */
  variants?: ArtVariant[];
}

/** One more way an item is drawn (Item.variants): its art's id (its picture's file, as an item's id is), base and size. */
export interface ArtVariant {
  id: string;
  base: string;
  w: number;
  h: number;
}

/**
 * An item as one of its pictures draws it (drawnAs): `art` is the picture's
 * id (its file, and its tooltip's key; the item's own id for its own art),
 * and the base and size are that picture's. The rest, its id included, stay
 * the item's.
 */
export interface DrawnItem extends Item {
  art: string;
}

/** Each item's drawings, made once, so the same picture is always the same object. */
const drawings = new WeakMap<Item, readonly DrawnItem[]>();

/** Every picture the item is drawn with, its own first (Question.variant counts them so). */
export function allArt(item: Item): readonly DrawnItem[] {
  let all = drawings.get(item);
  if (!all) {
    all = [{ ...item, art: item.id }, ...(item.variants ?? []).map((v) => ({ ...item, art: v.id, base: v.base, w: v.w, h: v.h }))];
    drawings.set(item, all);
  }
  return all;
}

/** The item as its picture `variant` draws it (Question.variant: 0, none, or one it lacks: its own art). */
export const drawnAs = (item: Item, variant = 0): DrawnItem => allArt(item)[variant] ?? allArt(item)[0];

/**
 * The item ids a question's pictures show, in order (as Question.mirrored and
 * .variant count them): the options' on an art question, the answer's alone
 * on a name question.
 */
export const picturesOf = (q: Pick<Question, 'mode' | 'options' | 'itemId'>): string[] => (q.mode === 'art' ? q.options : [q.itemId]);

/** Which of a question's pictures (picturesOf) is the answer's. */
export const answerPicture = (q: Pick<Question, 'mode' | 'options' | 'itemId'>): number => (q.mode === 'art' ? q.options.indexOf(q.itemId) : 0);

/** The answer `item` as the question's picture draws it (Grand Spectrum's Emerald…). */
export const answerDrawn = (item: Item, q: Pick<Question, 'mode' | 'options' | 'itemId' | 'variant'>): DrawnItem => drawnAs(item, q.variant?.[answerPicture(q)]);

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
  /**
   * Delve: the depth whose twins (TWINS) may meet, a find's deeper one.
   * Missing elsewhere, where they meet once every wrong answer is a look-alike.
   */
  twins?: number;
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

/** The deepest twins (TWINS) that may meet under `rules`: Delve's depth, elsewhere all or none. */
const twinReach = (rules: DifficultyRules) => rules.twins ?? (rules.similarNames >= 1 ? Infinity : 0);

/**
 * Items whose art only a detail tells apart, by name (each set from one
 * group). Players found them a coin toss, but they can be learnt, so they
 * meet in a question (one the answer and another a wrong option, or two
 * wrong options) only where questions are at their hardest: in Delve from
 * `depth`, elsewhere once every wrong answer is a look-alike (Eternal, or
 * Custom with all look-alike names). Until then a question shows at most one
 * of a set, picked at random when the answer is none of them, so seeing one
 * says nothing about which option is right. A set told apart by its colours
 * alone (`colour`) never meets in a question whose art is in grayscale,
 * where nothing could tell them apart.
 */
export const TWINS: { names: readonly string[]; depth: number; colour?: true; what: string }[] = [
  // Each comes in with a zone, whose card says so (lib/zoneTitle.ts, `what` they are).
  // Two stones each, told apart mostly by their colours.
  { names: ["Berek's Grip", "Berek's Pass", "Berek's Respite"], depth: 51, what: 'rings' },
  // The same brooch, turned another way.
  { names: ["Zarokh's Refrain", "Zarokh's Revolt"], depth: 51, what: 'gems' },
  // The same lantern, at another angle or in another light.
  { names: ["Uhtred's Omen", "Uhtred's Augury", "Uhtred's Exodus"], depth: 51, what: 'gems' },
  // The same sceptre, its glow cyan, red or violet.
  { names: ['Guiding Palm of the Eye', 'Guiding Palm of the Heart', 'Guiding Palm of the Mind'], depth: 61, colour: true, what: 'sceptres' },
  // The same band, its blue and gold swapped and its glyph changed.
  { names: ['Call of the Brotherhood', 'Whisper of the Brotherhood'], depth: 71, what: 'rings' },
];

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
  if (!s.delve) return rulesFor(s.settings, !!s.deathmatch);
  return delveQuestionRules(s.round, s.question ?? {});
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
function delveQuestionRules(d: number, q: Pick<Question, 'find' | 'strike'>): DifficultyRules {
  return q.find ? findRules(q.find, d, q.strike) : delveRules(d);
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
  /** The round each duelist was knocked out in, by id (missing in older saves): who lasted longer ranks higher. */
  out?: Record<string, number>;
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
   * The cards on this depth's offer asked so far (delve.ts askedCards): the
   * one picked, then each one a blast drew. Set at the pick, gone between
   * depths; missing in older saves.
   */
  asked?: string[];
  /** Questions dynamite blasted away in this run (missing for none, and in older saves). */
  blasts?: number;
  /** An Azurite Vein being dug: from its first right strike to the way out or a cave-in (delve.ts, the dig). */
  dig?: Dig;
  /** The haul a way out just put into the pack: how many wards, when (host clock). Gone at the next pick. */
  banked?: { wards: number; at: number };
  /**
   * Co-op: depths the team cleared in a row with nobody missing (a wrong
   * answer breaks it even when a ward took the loss, and so does a time-out
   * or an answer given to a question blasted away). Missing for none, in
   * solo runs and in older saves.
   */
  teamStreak?: number;
  /** Co-op: the longest `teamStreak` this run (missing for none). */
  bestTeamStreak?: number;
  /** Co-op: someone answered wrong on this offer (the question picked, or one a blast drew from it); gone with the next offer, at this depth or the next. */
  missedHere?: true;
  /**
   * Host clock the cards on offer are dealt at: a new zone's, ZONE_DESCENT_MS
   * after the run moved on to it, as the plunge into it lands. Every screen
   * shows them then. A pick sooner is refused; a vote sooner is kept, but
   * opens its window no sooner, nor closes the vote (delve.ts voteDone).
   * Missing for any other depth, and in older saves.
   */
  dealAt?: number;
  /**
   * Together: host clock the team's vote drew a vein's way out at. The two
   * cards stay up, the vote closed, for LEAVING_MS while its draw plays on
   * them (as a question waits for its draw, delveSession COOP_DRAW_MS); then
   * the host's 'expire' takes the team back to the light. Missing otherwise.
   */
  leaving?: number;
}

/** An Azurite Vein being dug (delve.ts, the dig). */
export interface Dig {
  /** Strikes answered right so far (1 to VEIN_MAX_STRIKES). */
  strikes: number;
  /** The wards in hand, one entry each: whose hand (co-op: whoever cleared that strike, or a teammate with room). */
  haul: string[];
  /** Seconds of the lamp's light for the next strike. */
  light: number;
  /** The categories struck so far, strike 1's first: the vein never runs on into one of them again. */
  struck: string[];
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

/** `craft`: a Craft game under way, its own steps in GameState.craft. */
export type Phase = 'lobby' | 'choosing' | 'question' | 'reveal' | 'over' | 'craft';

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
   * Plays at the host's screen: a guest the host added on its own device,
   * answering there on their turns. Turns only (see GameState.aside).
   */
  local?: true;
  /** The class sigil they wear on their avatar (lib/sigils.ts), if any. */
  sigil?: PlayerClass;
  /** The colour they'd like (lib/colour.ts), if any: their `hue` once it's theirs to have (settleHue). */
  colour?: number;
}

/**
 * turns: players take turns choosing a category and answering.
 * race: everyone answers the same question; first correct answer scores,
 * wrong answers cost a point and lock that player out of the question.
 * delve: three lives and no settings, one depth deeper each question cleared (see
 * delve.ts). Alone, a player's own turns; together (online), co-op: the team
 * votes for a card and answers one question, and nobody wins.
 * craft: online, two or more: each round everyone scrambles an item with
 * currency bought with gold and passes it on, and names the one passed to
 * them (craft.ts). The gold is the score.
 */
export type GameMode = 'turns' | 'race' | 'delve' | 'craft';

/** A known game mode. */
export const isGameMode = (m: unknown): m is GameMode => m === 'turns' || m === 'race' || m === 'delve' || m === 'craft';

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
 * How long a question's clock runs once it starts (ms): Delve's depth (or
 * find), a race's timer or its default, a turn's timer. Null on untimed
 * turns: their clock starts all the same, and never runs out.
 */
export function clockMs(s: GameState): number | null {
  if (s.delve) return questionTimer(s) * 1000;
  if (s.settings.mode === 'race') return (s.settings.timer || RACE_DEFAULT_TIMER) * 1000;
  return s.settings.timer > 0 ? s.settings.timer * 1000 : null;
}

/**
 * Whether the question's clock has started ('clock'), in every mode. Before
 * it nobody sees its art, names or prompt, and every answer is too early. A
 * Delve clock held still by the host's reload (paused) has not started again.
 */
export const clockRuns = (q: Pick<Question, 'clockAt'> | null | undefined) => q?.clockAt !== undefined;

/**
 * Seconds on the clock of a question asked in `s` (`q`: a Delve find's has
 * its own, a vein's later strikes the lamp's light): a Delve depth's, else the room's timer, or the default one
 * without. A veiled question's art is sized for it (veilSeconds), and the
 * host paces each picture's patches by it too (media.svelte.ts prepareMedia).
 */
export function questionClock(s: GameState, q: Pick<Question, 'find' | 'light'>): number {
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
  /**
   * Art questions whose every picture stands at least about twice as tall as
   * wide (TALL_ART_GROUPS): wide screens show them in one row of tall tiles.
   * Says nothing about the answer. Missing from older hosts (two rows).
   * Kept in Delve's copy before the clock runs (publicView), unlike the
   * groups: the pictures' layout must not change as they arrive, and all it
   * tells is that every option is a staff, spear, wand, flask, bow, crossbow
   * or two-handed mace.
   */
  tall?: boolean;
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
  /**
   * Which of its item's art each picture shows (drawnAs), counted as
   * `mirrored` counts them: missing where every picture shows its item's own.
   * Guests get it as the options: none until the reveal (an empty list), then
   * for the pictures the reveal names.
   */
  variant?: number[];
  /** Delve: the art is shown without colour, as rolled against the rules' grayChance (see grayscaleFor). */
  gray?: boolean;
  /** Host-clock timestamp when the question was asked. */
  askedAt: number;
  /** Host-clock timestamp when time runs out: null until the clock starts, and for good on untimed turns. */
  deadline: number | null;
  /**
   * Host clock when the clock started ('clock'), once the art has reached
   * those answering. Missing until then: nobody sees or answers any of the
   * question before it (see clockRuns).
   */
  clockAt?: number;
  /**
   * Delve: the clock held still by the host's reload (a player was cut off):
   * its `clockAt` as it was, when it stopped (`at`, host clock), and the time
   * it has `left` when it starts again ('clock'). `deadline` is null meanwhile.
   */
  paused?: { clockAt: number; at: number; left: number };
  /**
   * Delve: asked from a find, under the rules and clock of deeper down; a
   * right answer earns its item (see delve.ts findReward).
   */
  find?: FindKind;
  /**
   * Delve, an Azurite Vein's: which strike of the dig it is (delve.ts, the
   * dig), asked from veinDeeper(strike) further down. Missing: strike 1.
   */
  strike?: number;
  /** Delve, a vein's strike after the first: its clock, the lamp's light left (seconds). */
  light?: number;
  /**
   * Delve: asked in place of a question dynamite blasted away, at the same
   * depth (see Blast). Kept through a reask.
   */
  blast?: Blast;
  /**
   * Older saves only: dynamite went off on this question at half its clock
   * (the dynamite before it blasted questions away), and the wrong options
   * it blew away (the codex and achievements still read them).
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
}

/**
 * Delve: a question dynamite blasted away for a new one at the same depth,
 * as the new one remembers it.
 */
export interface Blast {
  /** Who set it off; missing when it went off by itself as the clock hit 0. */
  by?: string;
  /** Whose stick it was: whoever set it off (alone the player's); otherwise in co-op a standing holder's, drawn. */
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
  /** Delve: the item this right answer to a find earned. */
  gained?: ItemKind;
  /**
   * Delve co-op, with `gained`: who took the item. The winner, if they had
   * room for it; otherwise the first standing teammate in seat order who had.
   */
  gainedBy?: string;
  /** Delve: Azurite Wards took this answer's whole loss, so no life was lost. */
  warded?: boolean;
  /**
   * Delve co-op: the team's streak (Delve.teamStreak) as this reveal leaves
   * it, and `teamLost`, the one it ended (missing when none ended). What the
   * verdict's chip burns with, for everyone.
   */
  teamStreak?: number;
  teamLost?: number;
  /**
   * Delve: a wrong answer (or a time-out) to an Azurite Vein, which caves in
   * for two losses (delve.ts findLosses). Lost a life on the last one: just that.
   */
  caveIn?: boolean;
  /** Delve, on a cave-in: lives it took (0 to 2) and wards that broke in their place (0 to 2). */
  lost?: { lives: number; wards: number };
  /** Delve, an Azurite Vein's strike: which (1 on). */
  strike?: number;
  /** Delve: the ward this strike earned (`gained`) went into the dig's haul, in hand, not into the pack. */
  dug?: true;
  /** Delve: the dig ended with this strike (no further strike to be had), its whole haul going into the pack now: how many wards. */
  banked?: number;
  /** Delve, on a cave-in: the wards in hand it buried. */
  buried?: number;
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

/**
 * A game told back at its end (GameOver.svelte, lib/recap.ts): kept by the
 * host as it goes, the same for everyone in the room: a line per player,
 * per category and per item a find gave, and the misses. Guests get it only
 * with the end (publicView).
 */
export interface Recap {
  /** Each player's answers on their own turn (a race's guesses, a run's answers), by id. */
  answers: Record<string, RecapTally>;
  /** The fastest right answer of the game: who, the item, and its time on their own device. */
  fastest?: { by: string; id: string; ms: number };
  /** Delve: the right answer given with the least of its clock left (ms), at which depth. */
  closest?: { by: string; id: string; left: number; depth: number };
  /** Take turns: each category picked, as [questions, answered right]. */
  cats?: Record<string, [number, number]>;
  /** Race: wrong guesses on each item. */
  wrong?: Record<string, number>;
  /** Race: the longest run of questions one player was first on, and the run under way. */
  firsts?: { by: string; n: number };
  run?: { by: string; n: number };
  /** Every miss outside Delve (a wrong answer, a turn run out, a race's wrong guess), oldest first. */
  misses: RecapMiss[];
  /** Delve: each item a find gave, oldest first, and what became of it. */
  items?: RecapItem[];
  /** Everyone the recap names, as they were when it named them: a player removed before the end is still told by name. */
  people?: Record<string, { name: string; hue: number; sigil?: PlayerClass }>;
}

export interface RecapTally {
  /** Answers given (a turn run out counts), and right. */
  n: number;
  ok: number;
  /** The fastest right one, in ms on their device. */
  ms?: number;
  /** The same in a deathmatch, kept apart (its answers aren't in `n`). */
  dn?: number;
  dok?: number;
}

export interface RecapMiss {
  by: string;
  id: string;
  /** In the deathmatch. */
  dm?: true;
}

export interface RecapItem {
  kind: ItemKind;
  /** The depth (round) it was won at, and by whom. */
  at: number;
  by: string;
  /** The depth it went at, and how: set off, burnt, broken taking a loss, or blown up by a Dynamite Cache's blast. */
  used?: number;
  how?: 'blast' | 'flare' | 'ward' | 'blown';
}

/** An answer's own time, as its device sends it: whole ms within reason, or nothing. */
export const answerMs = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 50 && v <= 600_000 ? Math.round(v) : undefined);
/** The quickest an answer is believed to be, whatever its device says. */
export const ANSWER_MS_FLOOR = 250;
/**
 * How much sooner than the host's clock says a device may report its answer:
 * the picture travelling and loading there (outside Delve, where the clock
 * starts as the question is asked, not as its art arrives).
 */
export const ANSWER_MS_SLACK = 5000;

/**
 * An answer's time for the recap: what its device says (`ms`), held to what
 * the host saw. Never longer than since the question was asked (`asked`: no
 * device saw it sooner, a clock held still by a reload included), and never
 * more than ANSWER_MS_SLACK shorter than its clock has run (`clock`: Delve's
 * from its art reaching the player, which the host knows; otherwise the same
 * as `asked`), nor under ANSWER_MS_FLOOR. So a device can't claim the room's
 * fastest answer, and a slow picture or a reload doesn't cut an honest one.
 */
export function heldMs(ms: number | undefined, asked: number, clock = asked): number | undefined {
  if (ms === undefined || !Number.isFinite(asked) || !Number.isFinite(clock)) return undefined;
  const hi = Math.max(ANSWER_MS_FLOOR, Math.round(asked));
  return Math.min(hi, Math.max(ms, ANSWER_MS_FLOOR, Math.round(clock) - ANSWER_MS_SLACK));
}

/** Someone watching: they joined a running game, or stepped aside to watch. */
export interface Spectator {
  id: string;
  name: string;
  /** Keeps watching: not seated when the next game starts (missing: they take a seat). */
  stay?: true;
  /** The class sigil they wear, kept for when they take a seat. */
  sigil?: PlayerClass;
  /** The colour they'd like, kept for when they take a seat. */
  colour?: number;
}

export interface GameState {
  phase: Phase;
  hostId: string | null;
  players: Player[];
  /** Watching this game; they get a seat when the host starts the next one unless they `stay` (missing in older saves). */
  spectators?: Spectator[];
  /**
   * The players at the host's screen (Player.local) while the mode isn't
   * Turns, which they can't play at one screen: back in their seats as soon
   * as it is again (missing: none).
   */
  aside?: Player[];
  /**
   * Online: who plays under the held name (names.ts), as the host says: it
   * let them in only with the owner key's signature over its own challenge
   * (ownerKey.ts), or is the owner itself. Guests take its word.
   */
  owner?: { id: string };
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
  /** The Craft game in progress (or just over); missing otherwise. */
  craft?: Craft | null;
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
  /** What the end screen tells of the game, kept by the host as it goes (missing in the lobby and older saves). */
  recap?: Recap;
  /** Bumped on every change so clients can ignore stale messages. */
  version: number;
}

export type Action =
  /**
   * `returning`: set by the host for someone who was already in this room (may pass the lock).
   * `watch`: they'd rather watch than play (a spectator who stays one, see 'watch').
   */
  /**
   * `owner`: the host checked the owner key's signature for the held name (session.svelte.ts). `sigil`: the class sigil they wear.
   * `local`: the host adds a player at its own screen (Player.local), in a Turns lobby.
   */
  | { type: 'join'; playerId: string; name: string; returning?: boolean; watch?: boolean; owner?: true; sigil?: PlayerClass; colour?: number; local?: true }
  /** Host: its own player plays under the held name (the host holds the owner key). */
  | { type: 'owner'; playerId: string }
  | { type: 'rename'; playerId: string; name: string }
  | { type: 'remove'; playerId: string }
  | { type: 'connection'; playerId: string; connected: boolean }
  /** `custom`: only the knobs that change. */
  | { type: 'settings'; settings: Partial<Omit<Settings, 'custom'>> & { custom?: Partial<Knobs> } }
  | { type: 'start' }
  | { type: 'pick'; category: string }
  /** `ms`: how long it took on the device that gave it (the end screen's fastest answer). */
  | { type: 'answer'; index: number | null; askedAt?: number; ms?: number }
  | { type: 'next' }
  | { type: 'skip' }
  /** Host: swap the open question for a new one in the same category (its art failed to load). */
  | { type: 'reask' }
  /** Back to the lobby, seating the spectators; with `play`, the next game starts right away. */
  | { type: 'restart'; play?: boolean }
  /**
   * A guest chooses to watch rather than play (`watch`), or to take a seat
   * again. A spectator can choose any time, for the next game; a player only
   * in the lobby, where they give up their seat.
   */
  | { type: 'watch'; watch: boolean }
  /** The class sigil the sender wears now (none: taken off); on this device (from null), `playerId`'s. */
  | { type: 'sigil'; sigil?: PlayerClass; playerId?: string }
  /** The colour the sender would like now (none: any); on this device (from null), `playerId`'s. */
  | { type: 'colour'; colour?: number; playerId?: string }
  /** Host only (Delve): the art has reached the player answering, so their clock starts at `at` (host clock). */
  | { type: 'clock'; askedAt: number; at?: number }
  /** Host only (Delve co-op): the vote's window ran out (or every vote it waits for is in): a card is drawn from the votes. */
  | { type: 'expire' }
  /** Delve co-op: a standing player votes for a card on offer (changeable until the vote closes). */
  | { type: 'vote'; category: string }
  /** Delve co-op: a standing player gives one of their lives to bring back a teammate who perished. */
  | { type: 'revive'; target: string }
  /** Host only (Delve): the host reopened its room after a reload; `at`: its last moment before it (host clock). */
  | { type: 'resumed'; at?: number }
  /** Host only (Delve): the clock is about to run out, so one of the answering player's flares burns (co-op: a random holder's). */
  | { type: 'flare'; askedAt: number }
  /**
   * Delve: a stick of dynamite blasts the question asked at `askedAt` away
   * for a new one at the same depth (alone the player's own; co-op the own
   * of a player standing who hasn't answered it and holds one).
   */
  | { type: 'blast'; askedAt: number }
  /**
   * Craft: buy an orb in the shop, use one (a scramble on your own item, an
   * undo on the one you name), be done with the step, or name the item
   * (`index` into its options).
   */
  | { type: 'craft'; do: 'buy' | 'use' | 'ready' | 'guess'; orb?: Orb; index?: number }
  /** Host only (Craft): the step's time is up. */
  | { type: 'craftTime'; round: number; step: CraftStep };

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

/** Spectators take the free seats, in the order they arrived; the rest, and those who stay, keep watching. */
function fillSeats(s: GameState) {
  const watching: Spectator[] = [];
  for (const o of s.spectators ?? []) {
    if (!o.stay && s.players.length < MAX_PLAYERS) seat(s, o.id, o.name, { sigil: o.sigil, colour: o.colour });
    else watching.push(o);
  }
  s.spectators = watching;
}

/**
 * The players at the host's screen go with the mode, between games: aside
 * while it isn't Turns, back in the seats left (after anyone already seated)
 * once it is. Nothing is lost by looking at another mode.
 */
function placeLocals(s: GameState) {
  if (s.settings.mode === 'turns') {
    const back = s.aside ?? [];
    const room = Math.max(0, MAX_PLAYERS - s.players.length);
    for (const p of back.slice(0, room)) {
      // Their colour is theirs from joining: kept, unless someone seated has it now.
      if (p.hue < 0 || s.players.some((o) => o.hue === p.hue)) p.hue = freeHue(s);
      s.players.push(p);
      settleHue(s, p);
    }
    s.aside = back.slice(room);
  } else {
    s.aside = [...(s.aside ?? []), ...s.players.filter((p) => p.local)];
    s.players = s.players.filter((p) => !p.local);
  }
  if (!s.aside.length) delete s.aside;
}

/** Everyone in the room: seated, watching or set aside. */
const everyoneIn = (s: GameState): { id: string; name: string }[] => [...s.players, ...(s.spectators ?? []), ...(s.aside ?? [])];

/** Every name in the room (`except` one's). */
const namesIn = (s: GameState, except?: string) =>
  everyoneIn(s)
    .filter((o) => o.id !== except)
    .map((o) => o.name);

/**
 * Avatar colours that always go to one player, even if someone else had them.
 * Keyed by name skeleton, so every spelling the name check treats as the same
 * person ("Zoe Arcana", "zoe-arcana") counts.
 */
const RESERVED_HUES = new Map([[nameSkeleton('zoe_arcana'), RUBY]]);
const RESERVED = new Set(RESERVED_HUES.values());

/** The colour reserved for a name, if any: theirs in every room, whatever colour they pick. */
export const reservedHueOf = (name: string) => RESERVED_HUES.get(nameSkeleton(name));
const reservedHue = (p: Player) => reservedHueOf(p.name);

/** The first avatar colour nobody else is using, skipping the reserved ones while others are free. */
function freeHue(s: GameState, except?: Player): number {
  const used = new Set(s.players.filter((p) => p !== except).map((p) => p.hue));
  const free = Array.from({ length: MAX_PLAYERS }, (_, i) => i).filter((h) => !used.has(h));
  return free.find((h) => !RESERVED.has(h)) ?? free[0];
}

/**
 * Gives a player their reserved colour if their name has one, moving whoever
 * had it to a free one; a player without one gives up a reserved colour while
 * others are free. Then the colour they'd like (lib/colour.ts): theirs when
 * nobody has it, and between games from whoever has it without having asked
 * for it, who takes theirs in exchange; first come keeps it. Nobody else
 * changes colour mid-match.
 */
function settleHue(s: GameState, p: Player) {
  const hue = reservedHue(p);
  if (hue !== undefined) {
    if (p.hue === hue) return;
    const holder = s.players.find((o) => o !== p && o.hue === hue);
    p.hue = hue;
    if (holder) holder.hue = freeHue(s, holder);
    return;
  }
  if (RESERVED.has(p.hue)) p.hue = freeHue(s, p);
  const want = p.colour;
  if (want === undefined || p.hue === want) return;
  const holder = s.players.find((o) => o !== p && o.hue === want);
  if (holder && (holder.colour === want || s.phase !== 'lobby')) return;
  if (holder) holder.hue = p.hue;
  p.hue = want;
}

/** Adds a player with the first free avatar colour (or their reserved one). */
/** Whoever has the most gold (all of them on a tie). */
function craftLeaders(s: GameState): string[] {
  const best = Math.max(...s.players.map((p) => p.score));
  return s.players.filter((p) => p.score === best).map((p) => p.id);
}

function seat(s: GameState, id: string, name: string, o: { local?: boolean; sigil?: PlayerClass; colour?: number } = {}) {
  const p: Player = {
    id,
    name,
    score: 0,
    recent: [],
    connected: true,
    hue: -1,
    ...(o.local ? { local: true as const } : {}),
    ...(o.sigil ? { sigil: o.sigil } : {}),
    ...(o.colour !== undefined ? { colour: o.colour } : {}),
  };
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
/**
 * What a guest receives of the state. The recap stays with the host until
 * the game is over: only the end screen reads it, and it grows with every
 * answer, so it would ride along on every change for nothing.
 */
export function publicView(s: GameState, viewer?: string | null): GameState {
  const v = s.craft ? craftView(guestView(s), viewer ?? null) : guestView(s);
  if (s.phase === 'over' || !v.recap) return v;
  const { recap: _, ...rest } = v;
  return rest;
}

/**
 * What `viewer` may see of a Craft game: their own currency and nothing of
 * anyone else's; until the reveal, the others' gold as their shop opened
 * (what they bought would show in it) and of the items only their own, in
 * full, and the one passed to them as it now looks (not what it is, nor
 * what was done to it). At the reveal everything comes out.
 */
export function craftView(s: GameState, viewer: string | null): GameState {
  const c = s.craft!;
  const open = s.phase === 'over' || c.step === 'reveal';
  const stash = viewer && c.stash[viewer] ? { [viewer]: c.stash[viewer] } : {};
  const players = open ? s.players : s.players.map((p) => (p.id === viewer ? p : { ...p, score: c.opening[p.id] ?? p.score }));
  const pieces = open
    ? c.pieces
    : c.pieces.map((p): Piece => {
        if (p.maker === viewer) return p;
        const hidden: Piece = { maker: p.maker, guesser: p.guesser, item: '', slots: [], picture: null, veil: 0, seed: 0, options: [], shown: [], look: 0 };
        if (p.guesser === viewer && c.step === 'guess') {
          const { item: _, slots: __, picture: ___, veil: ____, seed: _____, ...seen } = p;
          return { ...hidden, ...seen };
        }
        // Whether they have named theirs yet, but not what: -1.
        return p.guess === undefined ? hidden : { ...hidden, guess: -1 };
      });
  return { ...s, players, craft: { ...c, stash, pieces } };
}

function guestView(s: GameState): GameState {
  const q = s.question;
  if (!q) return { ...s, used: [] };
  if (s.phase === 'question') {
    const hidden = { ...q, itemId: '', options: [], mirrored: [], variant: [] };
    // Nothing to read off the clock either, until it starts (the art has reached those answering):
    // not the names, nor the name to find, nor the groups in play.
    if (!clockRuns(q)) return { ...s, used: [], question: { ...hidden, labels: q.labels.map(() => null), prompt: null, groups: [] } };
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
  // An art question's pictures are the options' (picturesOf); a name question's one is the answer's.
  const variant = q.mode === 'art' ? q.variant?.map((v, i) => (known.has(i) ? v : 0)) : q.variant;
  const { variant: _, ...rest } = q;
  return { ...s, used: [], question: { ...rest, options: q.options.map((id, i) => (known.has(i) ? id : '')), ...(variant?.some(Boolean) ? { variant } : {}) } };
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
 * The team's goes on with a question cleared with nobody missing on its offer;
 * an Azurite Vein's later strikes keep it as it is (the vein clears one depth).
 */
function countStreaks(s: GameState, r: Reveal) {
  if (s.delve && isGroupRun(s)) {
    const winner = s.players.find((p) => p.id === r.winnerId);
    if (winner) winner.streak = (winner.streak ?? 0) + 1;
    const dm = s.delve;
    const was = dm.teamStreak ?? 0;
    const n = r.correct && !dm.missedHere && !r.hits?.length ? was + ((r.strike ?? 1) > 1 ? 0 : 1) : 0;
    if (n) dm.teamStreak = n;
    else delete dm.teamStreak;
    if (n > (dm.bestTeamStreak ?? 0)) dm.bestTeamStreak = n;
    r.teamStreak = n;
    if (!n && was) r.teamLost = was;
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
  /** The items' mod lines, for Craft (setCraftLines). */
  private craftLines: ModLines | null = null;
  /** TWINS, as items (sets with fewer than two of them left out). */
  private readonly twins: { items: Item[]; depth: number; colour?: true }[];
  /** Every question's clock starts as it is asked (see the constructor). */
  private readonly autoClock: boolean;

  /**
   * `fakes`: made-up names for items, by item name (src/data/fakes.json).
   * `looks`: the look-alike table, if at hand already (else see setLooks).
   * `twins`: false lets twins (TWINS) meet anywhere (Today's unique).
   * `autoClock`: every question's clock starts as it is asked, for an engine
   * played without a session (tests, tools). A session leaves it off: it
   * starts the clock itself ('clock'), once the art has reached those
   * answering.
   */
  constructor(
    items: Item[],
    opts: { rng?: Rng; now?: () => number; fakes?: Record<string, string[]>; looks?: Looks | null; twins?: boolean; autoClock?: boolean } = {},
  ) {
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
    this.autoClock = !!opts.autoClock;
    const byName = new Map(items.map((it) => [it.name, it]));
    this.twins = opts.twins === false ? [] : TWINS.map(({ names, ...when }) => ({ items: names.flatMap((n) => byName.get(n) ?? []), ...when })).filter((t) => t.items.length > 1);
  }

  /**
   * Hands over the look-alike table, fetched once a Delve run gets deep
   * enough to want it. Until then a question rolled to pick its look-alikes
   * by their art picks them by their names, as at shallower depths.
   */
  setLooks(looks: Looks | null) {
    this.looks = looks;
  }

  /** Hands over the items' mod lines (itemStats.json), which Craft deals and scrambles from; the host loads them before a Craft game starts. */
  setCraftLines(lines: ModLines) {
    this.craftLines = lines;
  }

  /** Whether Craft's mod lines are here. */
  get craftReady() {
    return !!this.craftLines;
  }

  /**
   * The host seats a player at its own screen (Player.local): in a room's
   * Turns lobby only, since the others can't be played at one screen, and
   * never on a guest's word. On one device (hot-seat), every player is.
   */
  private joinLocal(s: GameState, id: string, raw: string, from: string | null) {
    if (s.hostId === null || (from !== null && from !== s.hostId)) throw new ActionError('Not allowed.');
    if (s.phase !== 'lobby') throw new ActionError('Players at your screen join between games.');
    if (s.settings.mode !== 'turns') throw new ActionError('Players at your screen play Turns.');
    if (everyoneIn(s).some((o) => o.id === id)) throw new ActionError('Not allowed.');
    const name = cleanName(raw);
    const problem = nameProblem(name, namesIn(s));
    if (problem) throw new ActionError(problem);
    if (s.players.length >= MAX_PLAYERS) throw new ActionError('The lobby is full.');
    seat(s, id, name, { local: true });
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
        if (action.local) {
          this.joinLocal(s, action.playerId, action.name, from);
          break;
        }
        if (from !== null && from !== action.playerId) throw new ActionError('Not allowed.');
        // The owner key's signature names whoever joins under the held name (a seat coming back keeps its own name, so it must be that).
        const own = (name: string) => {
          if (action.owner && isHeldName(name)) s.owner = { id: action.playerId };
        };
        const sigil = isPlayerClass(action.sigil) ? action.sigil : undefined;
        const colour = isChoosableHue(action.colour) ? action.colour : undefined;
        const looks = { ...(sigil ? { sigil } : {}), ...(colour !== undefined ? { colour } : {}) };
        /**
         * The one they wear now and the colour they'd like, coming back too:
         * they may have changed meanwhile. Mid-game the sigil stays as the
         * game began (as the 'sigil' action's does; the session sends it again
         * back in the lobby); the colour waits for the next.
         */
        const wear = (o: { sigil?: PlayerClass; colour?: number }) => {
          if (s.phase === 'lobby') {
            if (sigil) o.sigil = sigil;
            else delete o.sigil;
          }
          if (colour !== undefined) o.colour = colour;
          else delete o.colour;
        };
        const existing = s.players.find((p) => p.id === action.playerId);
        if (existing) {
          own(existing.name);
          wear(existing);
          if (s.phase === 'lobby') settleHue(s, existing);
          // Rejoining keeps the original name, so a seat can't be renamed on the way back.
          existing.connected = true;
          // A guest coming back arrives here (the session only ever reports a drop as 'connection'); their excuse ends.
          if (s.delve) s.delve.excused = s.delve.excused.filter((id) => id !== existing.id);
          break;
        }
        // Already watching (e.g. a second connection after a refresh): nothing changes.
        const watching = s.spectators.find((o) => o.id === action.playerId);
        if (watching) {
          own(watching.name);
          wear(watching);
          break;
        }
        const name = cleanName(action.name);
        // Someone the host already knows may come back through the lock (a lobby
        // drops people who disconnect, so a refresh would otherwise shut them out).
        if (s.settings.locked && !action.returning) throw new ActionError('The host has locked this room.');
        const problem = nameProblem(name, namesIn(s));
        if (problem) throw new ActionError(problem);
        // (A join turned down below leaves the state as it was, this with it.)
        own(name);
        // Someone who'd rather watch does, while there's room (in the lobby, they take a seat otherwise).
        if (action.watch && s.spectators.length < MAX_SPECTATORS) {
          s.spectators.push({ id: action.playerId, name, stay: true, ...looks });
          break;
        }
        if (s.phase !== 'lobby') {
          // Too late for this game: watch it and take a seat in the next one.
          if (s.spectators.length >= MAX_SPECTATORS) throw new ActionError('That game has already started and has no room for more spectators.');
          s.spectators.push({ id: action.playerId, name, ...looks });
          break;
        }
        if (s.players.length >= MAX_PLAYERS) {
          // Every seat taken: watch, and take one once it is free (at the start
          // at the latest), as a game under way lets them watch for the next.
          // Not on one screen (hot-seat, from null): nobody there watches, and
          // the one being added is turned down instead.
          if (from !== null && s.spectators.length < MAX_SPECTATORS) {
            s.spectators.push({ id: action.playerId, name, ...looks });
            break;
          }
          throw new ActionError('The lobby is full.');
        }
        seat(s, action.playerId, name, looks);
        break;
      }
      case 'owner': {
        if (!isHost) throw new ActionError('Not allowed.');
        s.owner = { id: action.playerId };
        break;
      }
      case 'rename': {
        if (!isHost && from !== action.playerId) throw new ActionError('Not allowed.');
        const p = s.players.find((p) => p.id === action.playerId);
        const name = cleanName(action.name);
        const problem = nameProblem(name, namesIn(s, action.playerId));
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
        if (s.aside) {
          s.aside = s.aside.filter((p) => p.id !== action.playerId);
          if (!s.aside.length) delete s.aside;
        }
        const idx = s.players.findIndex((p) => p.id === action.playerId);
        if (idx < 0) break;
        // Delve: whether they leave the run on their feet, or else where they fell (read while they still have a seat).
        const standing = !!s.delve && livesOf(s, action.playerId) > 0;
        const fell = s.delve ? fellAt(s, action.playerId) : null;
        s.players.splice(idx, 1);
        if (s.phase === 'lobby') {
          fillSeats(s);
          // Someone at the host's screen still waiting for a seat (a full room) takes one freed.
          placeLocals(s);
        }
        if (s.phase === 'lobby' || s.phase === 'over') break;
        if (s.players.length === 0) {
          const fresh = { ...createGame(s.hostId, s.settings), spectators: s.spectators, lastAskedAt: s.lastAskedAt, version: s.version + 1, ...(s.aside ? { aside: s.aside } : {}) };
          fillSeats(fresh);
          placeLocals(fresh);
          return fresh;
        }
        if (s.craft) {
          s.turn = 0;
          this.craftLeaves(s, action.playerId);
        } else if (race) {
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
        if (s.craft && s.phase === 'craft') this.craftCarryOn(s);
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
        // The end screen keeps the game as it was played; the restart places them.
        if (s.phase === 'lobby') placeLocals(s);
        break;
      }
      case 'start': {
        if (!isHost) throw new ActionError('Only the host can start the game.');
        if (s.phase !== 'lobby') throw new ActionError('The game is already running.');
        // Seats held for people who haven't come back since the host's refresh
        // go to whoever is waiting.
        s.players = s.players.filter((p) => p.connected);
        fillSeats(s);
        placeLocals(s);
        if (s.players.length === 0) throw new ActionError('Add at least one player.');
        // Delve together is co-op, played online: on one device it's a run alone (the lobby says so too).
        if (s.settings.mode === 'delve' && s.hostId === null && s.players.length > 1)
          throw new ActionError('Delve together is played online. On one device, Delve is for one player.');
        if (s.settings.mode === 'craft') {
          if (s.hostId === null) throw new ActionError('Craft is played online.');
          if (s.players.length < 2) throw new ActionError('Craft needs at least two players.');
          if (!this.craftLines) throw new ActionError('The items are still loading. Try again in a moment.');
        }
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
        delete s.craft;
        s.startedAt = this.now();
        s.recap = { answers: {}, misses: [] };
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
        if (s.settings.mode === 'craft') this.beginCraft(s);
        else if (race) this.beginRaceQuestion(s, true);
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
        // A new zone's cards are still on their way (no screen shows them yet): a pick sooner is dropped quietly
        // (not one a screen whose guess at this clock runs a little ahead showed them for).
        if (from !== null && dealIn(s, this.now()) > DEAL_SLACK_MS) throw new ActionError('Too early.', true);
        if (coop) this.closeVote(s, action.category);
        else this.takePick(s, active, action.category);
        break;
      }
      case 'vote': {
        const dm = s.delve;
        if (!dm || !isGroupRun(s)) throw new ActionError('There is nothing to vote on.');
        if (from === null || !s.players.some((p) => p.id === from)) throw new ActionError('You are not in this game.');
        // A vote that crossed its close on the way is dropped quietly (the way out's draw playing too).
        if (s.phase !== 'choosing' || dm.leaving !== undefined) throw new ActionError('Too late!', true);
        if (livesOf(s, from) <= 0) throw new ActionError('Only players still standing can vote.');
        if (typeof action.category !== 'string' || !s.offered.includes(action.category)) throw new ActionError('That category is not on offer.');
        (dm.votes ??= {})[from] = action.category;
        dm.voteFrom ??= Math.max(this.now(), dm.dealAt ?? 0);
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
        this.person(s, from);
        this.person(s, action.target);
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
        // Nobody answers a question whose clock hasn't started (the host and a stray key in hot-seat included).
        if (!clockRuns(q)) throw new ActionError('Too early.', true);
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
        // place of the time-out, if the offer has a blast left (its fuse
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
          this.refund(s, active.id);
          delete q.flared;
          delete q.flaredAt;
        }
        let gained: ItemKind | undefined;
        let warded = false;
        let caveIn: Pick<Reveal, 'caveIn' | 'lost'> = {};
        let blown: ItemKind | null = null;
        let vein: Pick<Reveal, 'strike' | 'dug' | 'buried' | 'banked'> = {};
        if (s.delve && q.find === 'azurite') vein = { strike: q.strike ?? 1 };
        if (correct) {
          active.score += 1;
          if (s.delve && q.find === 'azurite') {
            // A vein's ward goes into the dig's haul, in hand (see delve.ts, the dig).
            if (this.strikeRight(s, q, [active.id])) {
              gained = 'wards';
              vein.dug = true;
            }
            const banked = this.endDig(s);
            if (banked) vein.banked = banked;
          } else {
            // A right answer to a find earns its item (see delve.ts findReward): it is only offered to a player with room for it.
            const reward = s.delve && q.find ? findReward(q.find, inventoryOf(s, active.id)) : null;
            if (reward) gained = this.gain(s, active.id, reward);
          }
        } else if (s.delve) {
          const buried = this.caveInDig(s);
          if (buried) vein.buried = buried;
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
        this.note(s, active.id, q.itemId, correct, answerMs(action.ms));
        // Take turns: how each category picked went (a deathmatch's is drawn, not picked).
        if (s.recap && !s.delve && !s.deathmatch) {
          const c = ((s.recap.cats ??= {})[q.category] ??= [0, 0]);
          c[0]++;
          if (correct) c[1]++;
        }
        s.reveal = {
          correctId: q.itemId,
          chosenId: timedOut ? null : chosenId,
          correctIndex: q.options.indexOf(q.itemId),
          chosenIndex: timedOut ? null : index,
          correct,
          timedOut,
          winnerId: correct ? active.id : null,
          ...(gained ? { gained } : {}),
          ...(warded ? { warded } : {}),
          ...caveIn,
          ...(blown ? { blown } : {}),
          ...vein,
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
        if (s.delve && clockRuns(s.question)) throw new ActionError('The clock is already running.', true);
        const voided = s.question;
        // Race: blind guesses on a question that is thrown out don't cost anything.
        for (const m of voided.misses) {
          const p = s.players.find((p) => p.id === m.playerId);
          if (p) p.score += 1;
          this.unnote(s, m.playerId, voided.itemId);
        }
        // None of its pictures come back in the new one (one of them didn't load).
        for (const id of voided.options) if (this.byId.has(id) && !s.used.includes(id)) s.used.push(id);
        // Nor does it count toward the run of art and name questions.
        this.tallyMode(s, voided.mode, -1);
        // Delve: no clock yet, or one paused by the host's reload whose art
        // won't load again (what its wrong answers cost stands).
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
        // Renames during the game take effect on colours now, and so do the colours asked for: reserved ones first.
        const rank = new Map(fresh.players.map((p) => [p, reservedHue(p) !== undefined ? 0 : p.colour !== undefined ? 1 : 2]));
        for (const p of [...fresh.players].sort((a, b) => rank.get(a)! - rank.get(b)!)) settleHue(fresh, p);
        fresh.spectators = s.spectators;
        fillSeats(fresh);
        if (s.aside) fresh.aside = s.aside;
        placeLocals(fresh);
        fresh.version = s.version;
        fresh.lastAskedAt = s.lastAskedAt;
        fresh.used = s.used;
        Object.assign(s, fresh);
        delete s.startedAt;
        delete s.recap;
        if (!fresh.aside) delete s.aside;
        if (action.play) return this.apply(s, { type: 'start' }, from);
        break;
      }
      case 'watch': {
        if (from === null || from === s.hostId) throw new ActionError('The host plays in their own game.');
        const watcher = s.spectators.find((o) => o.id === from);
        if (watcher) {
          if (action.watch) watcher.stay = true;
          else delete watcher.stay;
          // In the lobby, a free seat is theirs right away.
          if (s.phase === 'lobby') fillSeats(s);
          break;
        }
        const idx = s.players.findIndex((p) => p.id === from);
        if (idx < 0 || !action.watch) break;
        if (s.phase !== 'lobby') throw new ActionError('You can step aside to watch in the lobby.');
        const [p] = s.players.splice(idx, 1);
        s.spectators.push({ id: p.id, name: p.name, stay: true, ...(p.sigil ? { sigil: p.sigil } : {}) });
        // Their seat goes to whoever was waiting for one, which makes room to watch.
        fillSeats(s);
        placeLocals(s);
        if (s.spectators.length > MAX_SPECTATORS) throw new ActionError('There is no room for more spectators.');
        break;
      }
      case 'sigil': {
        // Worn as the game began until it is back in the lobby.
        if (s.phase !== 'lobby') break;
        const id = from ?? action.playerId;
        const o = s.players.find((p) => p.id === id) ?? s.spectators.find((w) => w.id === id);
        if (!o) break;
        if (isPlayerClass(action.sigil)) o.sigil = action.sigil;
        else delete o.sigil;
        break;
      }
      case 'colour': {
        // Mid-game it waits for the next one: nobody changes colour while it's played.
        const id = from ?? action.playerId;
        const p = s.players.find((p) => p.id === id);
        const o = p ?? s.spectators.find((w) => w.id === id);
        if (!o) break;
        if (isChoosableHue(action.colour)) o.colour = action.colour;
        else delete o.colour;
        if (p && s.phase === 'lobby') settleHue(s, p);
        break;
      }
      case 'clock': {
        if (from !== null) throw new ActionError('Not allowed.');
        const q = s.question;
        // Already running (a resumed host releasing the art again) or a question that is gone: nothing to start.
        if (s.phase !== 'question' || !q || q.askedAt !== action.askedAt || clockRuns(q)) break;
        const now = this.now();
        const at = timeOr(action.at, now);
        this.startClock(s, q, Math.min(Math.max(at, now), now + 1000));
        break;
      }
      case 'expire': {
        if (from !== null) throw new ActionError('Not allowed.');
        // Co-op: the vote's window ran out, or everyone it waits for has voted.
        // Without a vote it never runs out: nobody's card is picked for them;
        // nor before a new zone's cards are dealt, however soon it is due.
        const closes = voteClosesAt(s);
        if (!s.delve || !isGroupRun(s) || s.phase !== 'choosing' || dealIn(s, this.now()) > 0) break;
        // The way out drawn: once its draw has played, back to the light.
        if (s.delve.leaving !== undefined) {
          if (closes !== null && this.now() >= closes - 250) {
            delete s.delve.leaving;
            this.takePick(s, null, WAY_OUT);
          }
          break;
        }
        if (voteDone(s, this.now()) || (closes !== null && this.now() >= closes - 250)) this.closeVote(s);
        break;
      }
      case 'resumed': {
        if (from !== null) throw new ActionError('Not allowed.');
        const dm = s.delve;
        if (!dm || s.phase === 'lobby' || s.phase === 'over') break;
        // Everyone the reload cut off gets a while to come back before a vote closes without them.
        dm.excused = s.players.filter((p) => !p.connected && livesOf(s, p.id) > 0).map((p) => p.id);
        dm.graceUntil = this.now() + DELVE_RESUME_GRACE_MS;
        // A question on the clock that someone cut off could still answer
        // (co-op: anyone standing yet to answer it; alone, a guest's) holds
        // still: their answer may never have arrived, and the clock ran on
        // while the host was gone. It starts again with the time it had left
        // (at least DELVE_RESUME_MIN_MS) once the art is back on screens
        // ('clock'). What was answered on it stands.
        const q = s.question;
        if (s.phase === 'question' && q && q.deadline !== null && q.clockAt !== undefined && cutOffAnswering(s).length > 0) {
          // The host's last moment before the reload, never before the clock started nor after now.
          const at = timeOr(action.at, this.now());
          const stop = Math.min(Math.max(at, q.clockAt), this.now());
          q.paused = { clockAt: q.clockAt, at: stop, left: Math.max(DELVE_RESUME_MIN_MS, clockLeft(q, stop)) };
          q.deadline = null;
          delete q.clockAt;
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
        // together a player standing who hasn't answered it and holds a
        // stick, or (null) the host's own tooling for the team.
        const by = from ?? (coop ? null : (active?.id ?? null));
        const problem = blastProblem(s, by);
        if (problem) throw new ActionError(problem, true);
        // Past the allowance for answers in flight the time-out is due, and
        // deals with it: a flare burns first, or the dynamite goes off by
        // itself. While its fuse hisses before 0, Detonate sets it off at once.
        if (this.now() > q.deadline! + ANSWER_GRACE_MS) throw new ActionError('Too late!', true);
        this.blast(s, coop ? (by ?? this.anyHolder(s, 'dynamite')) : active!.id, by);
        break;
      }
      case 'craft':
        this.craftAct(s, action, from);
        break;
      case 'craftTime': {
        if (from !== null) throw new ActionError('Not allowed.');
        const c = s.craft;
        if (s.phase === 'craft' && c && c.round === action.round && c.step === action.step) this.craftNext(s);
        break;
      }
    }
    if (s.reveal && !prev.reveal) {
      s.reveal.at = this.now();
      countStreaks(s, s.reveal);
    }
    // Without a session to wait for the art, a question's clock starts as it is asked.
    const q = s.question;
    if (this.autoClock && s.phase === 'question' && q && !clockRuns(q) && !q.paused && q.askedAt !== prev.question?.askedAt) this.startClock(s, q, q.askedAt);
    s.version = prev.version + 1;
    return s;
  }

  /**
   * The question's clock starts at `start` (host clock) and runs for as long
   * as the question has (clockMs); untimed turns get a start and no
   * deadline. A Delve clock the host's reload held still carries on instead.
   */
  private startClock(s: GameState, q: Question, start: number) {
    const p = q.paused;
    if (p) {
      // Held still since the host's reload ('resumed') at `p.at`: it
      // carries on with the time it had left. Everything timed on it
      // moves on by as long as it was held, so what had gone of it stays
      // gone (an Azurite Vein's fast window too); only the deadline gets
      // the time it had left (with a hold still to come, see clockLeft).
      const shift = start - p.at;
      q.clockAt = p.clockAt + shift;
      q.deadline = start + p.left + heldAhead(q.held, p.at);
      if (q.flaredAt !== undefined) q.flaredAt += shift;
      if (q.held) q.held = { from: q.held.from + shift, until: q.held.until + shift };
      for (const x of q.struck ?? []) x.at += shift;
      delete q.paused;
      return;
    }
    q.clockAt = start;
    const ms = clockMs(s);
    q.deadline = ms === null ? null : start + ms;
  }

  // ---- race mode --------------------------------------------------------

  private raceAnswer(s: GameState, action: Extract<Action, { type: 'answer' }>, from: string | null) {
    const q = s.question;
    // Late clicks from the previous question are expected; drop them quietly.
    if (s.phase !== 'question' || !q) throw new ActionError('Too late!', true);
    if (action.askedAt !== undefined && action.askedAt !== q.askedAt) throw new ActionError('Too late!', true);
    // Nobody answers before the clock starts, the host included; nor can time be up.
    if (!clockRuns(q)) throw new ActionError('Too early.', true);

    if (from === null) {
      // Host timer: time is up, nobody got it.
      s.reveal = this.noWinner(q, true, s);
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
      this.note(s, player.id, q.itemId, true, answerMs(action.ms));
      if (s.recap) {
        const r = s.recap;
        r.run = r.run?.by === player.id ? { by: player.id, n: r.run.n + 1 } : { by: player.id, n: 1 };
        if (!r.firsts || r.run.n > r.firsts.n) r.firsts = { ...r.run };
      }
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
    this.note(s, player.id, q.itemId, false, undefined);
    if (s.recap) (s.recap.wrong ??= {})[q.itemId] = (s.recap.wrong[q.itemId] ?? 0) + 1;
    const chosenId = q.options[index];
    if (isFake(chosenId) && !s.used.includes(chosenId)) s.used.push(chosenId);
    this.checkRaceDone(s);
  }

  private noWinner(q: Question, timedOut: boolean, s?: GameState): Reveal {
    // Nobody first on it: a run of firsts ends.
    if (s?.recap) delete s.recap.run;
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
      s.reveal = this.noWinner(q, false, s);
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
  private takePick(s: GameState, active: Player | null, category: string) {
    let kind: Pick<Question, 'find' | 'strike' | 'light'> = {};
    if (s.delve) {
      delete s.delve.banked;
      // Whatever was picked, a way out's draw (closeVote) is over: left set, it would hold every later vote.
      delete s.delve.leaving;
      const dig = digOf(s);
      if (dig && isWayOut(category)) {
        this.leaveVein(s);
        return;
      }
      // The first card of this depth's asked (more come with blasts, see blast).
      s.delve.asked = [category];
      // Co-op locks out the team's picks, alone the player's own. A vein's
      // later strikes lock nothing: so many picks at one depth would leave
      // too few cards for the next offer.
      if (!dig) {
        if (active) active.recent = lastPicks([...active.recent, category], DELVE_MAX_LOCKOUT);
        else s.recentCategories = lastPicks([...s.recentCategories, category], DELVE_MAX_LOCKOUT);
      }
      const find = findOn(s, category);
      if (find) kind = dig && find === 'azurite' ? { find, strike: dig.strikes + 1, light: dig.light } : { find };
    } else if (active && !s.deathmatch) {
      active.recent = lastPicks([...active.recent, category], rulesFor(s.settings).lockout);
    }
    s.question = this.makeQuestion(s, category, kind);
    s.used.push(s.question.itemId);
    s.phase = 'question';
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
    if (this.spend(s, id, 'wards', 'ward')) return 'ward';
    (s.delve!.losses[id] ??= []).push(s.round);
    if (livesOf(s, id) === 0 && s.delve!.inventory?.[id]) s.delve!.inventory[id] = { wards: 0, flares: 0, dynamite: 0 };
    return 'life';
  }

  /**
   * One more of an item for a player still standing, if they have room for it
   * (delve.ts hasRoom). Says what they gained (undefined for nothing).
   */
  private gain(s: GameState, id: string, item: ItemKind): ItemKind | undefined {
    const inv = inventoryOf(s, id);
    if (!hasRoom(inv, item) || livesOf(s, id) <= 0) return undefined;
    inv[item]++;
    (s.delve!.inventory ??= {})[id] = inv;
    if (s.recap) {
      (s.recap.items ??= []).push({ kind: item, at: s.round, by: id });
      this.person(s, id);
    }
    return item;
  }

  /**
   * A flare that burnt as a guest's answer in time crossed it goes back in
   * its holder's pack, unspent: if they still stand with room for it, as any
   * item gained (one who perished since has no pack to put it in).
   */
  private refund(s: GameState, id: string) {
    const inv = inventoryOf(s, id);
    if (!hasRoom(inv, 'flares') || livesOf(s, id) <= 0) return;
    inv.flares++;
    (s.delve!.inventory ??= {})[id] = inv;
    const it = s.recap?.items?.findLast((x) => x.by === id && x.kind === 'flares' && x.how === 'flare');
    if (it) {
      delete it.used;
      delete it.how;
    }
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
    if (!cards.length || !this.spend(s, stick, 'dynamite', 'blast')) return;
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
    if (!this.spend(s, holder, 'flares', 'flare')) return;
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
    return this.spend(s, id, item, 'blown') ? item : null;
  }

  /** Uses up one of an item (`how`, for the recap); false when the player has none. */
  private spend(s: GameState, id: string, item: ItemKind, how: NonNullable<RecapItem['how']>): boolean {
    const inv = inventoryOf(s, id);
    if (inv[item] <= 0) return false;
    inv[item]--;
    (s.delve!.inventory ??= {})[id] = inv;
    // The oldest of theirs still unspent: what went first.
    const it = s.recap?.items?.find((x) => x.by === id && x.kind === item && x.used === undefined);
    if (it) Object.assign(it, { used: s.round, how });
    return true;
  }

  // ---- the recap -----------------------------------------------------------

  /** An answer for the end screen (GameState.recap): `by`'s, on item `id`, right or not, `ms` its time on their device. */
  private note(s: GameState, by: string, id: string, ok: boolean, sent: number | undefined) {
    const r = s.recap;
    if (!r) return;
    this.person(s, by);
    const q0 = s.question;
    // As the host saw it: since the question was asked, and since its clock started (Delve: as its art reached the player).
    const ms = q0 ? heldMs(sent, this.now() - q0.askedAt, this.now() - (q0.clockAt ?? q0.askedAt)) : undefined;
    const t = (r.answers[by] ??= { n: 0, ok: 0 });
    if (s.deathmatch) {
      t.dn = (t.dn ?? 0) + 1;
      if (ok) t.dok = (t.dok ?? 0) + 1;
    } else {
      t.n++;
      if (ok) t.ok++;
    }
    if (ok && ms !== undefined) {
      if (t.ms === undefined || ms < t.ms) t.ms = ms;
      if (!r.fastest || ms < r.fastest.ms) r.fastest = { by, id, ms };
    }
    // Delve's misses are lives, which each device tells from its own codex.
    // All of them: they go to the guests once, with the end (publicView).
    if (!ok && !s.delve) r.misses.push({ by, id, ...(s.deathmatch ? { dm: true as const } : {}) });
    const q = s.question;
    if (ok && s.delve && q?.deadline != null) {
      const left = Math.max(0, q.deadline - this.now());
      if (!r.closest || left < r.closest.left) r.closest = { by, id, left, depth: s.round };
    }
  }

  /** A race's wrong guess taken back (its question thrown out, its point refunded): out of the recap as well. */
  private unnote(s: GameState, by: string, id: string) {
    const r = s.recap;
    if (!r) return;
    const t = r.answers[by];
    if (t && t.n > 0) t.n--;
    const i = r.misses.findLastIndex((m) => m.by === by && m.id === id);
    if (i >= 0) r.misses.splice(i, 1);
    if (r.wrong?.[id]) {
      if (--r.wrong[id] <= 0) delete r.wrong[id];
    }
  }

  /** Keeps a player's name and colour for the recap, as they are now. */
  private person(s: GameState, id: string) {
    const p = s.players.find((x) => x.id === id);
    if (s.recap && p) (s.recap.people ??= {})[id] = { name: p.name, hue: p.hue, ...(p.sigil ? { sigil: p.sigil } : {}) };
  }

  /**
   * Which of the cards on offer are finds, and of what: one roll against the
   * finds' slices at this depth (delve.ts findChance), and, if that found
   * one, a second for another kind on another card, at SECOND_FIND of its
   * chance. Never more than two. On a find's own first depth (delve.ts
   * firstFindAt) the depth's first offer (`fresh`) holds that find, certain;
   * one after a miss there rolls as any other. A find whose item the
   * player on turn (co-op: anyone standing, as anyone may answer it) can't
   * carry any more of is never offered: its slice finds nothing, so the
   * others' chances stay the depth's.
   */
  private rollFinds(s: GameState, takers: string[], fresh: boolean): CardFind[] {
    if (!s.delve || !takers.length || !s.offered.length) return [];
    const room = (item: ItemKind) => takers.some((id) => hasRoom(inventoryOf(s, id), item));
    const chances = (share: number, but?: FindKind) => FINDS.filter((f) => f.kind !== but).map((f) => ({ ...f, chance: findChance(f.kind, s.round) * share }));
    const certain = fresh ? FINDS.find((f) => f.kind === firstFindAt(s.round) && room(f.item)) : undefined;
    const first = certain ? { category: sample(s.offered, 1, this.rng)[0], kind: certain.kind } : this.rollFind(chances(1), room, s.offered);
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

  // ---- the Azurite Vein's dig ---------------------------------------------

  /**
   * A vein's strike `q` answered right (its clock stopped now): one more
   * strike in the dig, the lamp's light left the next one's (delve.ts
   * lampAfter), and a ward into the haul for the first of `takers` with room
   * for it, the haul counted. Says whose hand it went to (null: nobody had
   * room, which the offer rules out).
   */
  private strikeRight(s: GameState, q: Question, takers: string[]): string | null {
    const dm = s.delve!;
    const dig = digOf(s) ?? { strikes: 0, haul: [], light: 0, struck: [] };
    const strike = q.strike ?? 1;
    const left = q.deadline === null ? 0 : clockLeft(q, this.now()) / 1000;
    const by = takers.find((id) => wardRoom(s, id)) ?? null;
    dm.dig = {
      strikes: strike,
      haul: by ? [...dig.haul, by] : dig.haul,
      light: lampAfter(s.round, strike + 1, left),
      struck: [...dig.struck, q.category],
    };
    return by;
  }

  /**
   * After a right strike: the dig over if it can't run on (VEIN_MAX_STRIKES
   * struck, too little light, no room for another ward), its haul going into
   * the pack at once, at this reveal, rather than when the run moves on.
   * Says how many wards went in.
   */
  private endDig(s: GameState): number {
    return digOf(s) && !digRunsOn(s) ? this.bankHaul(s) : 0;
  }

  /** A miss on a vein: the dig is over, and its haul buried. Says how many wards it buried. */
  private caveInDig(s: GameState): number {
    const dig = digOf(s);
    delete s.delve!.dig;
    return dig?.haul.length ?? 0;
  }

  /**
   * The vein runs on: the same depth's next cards are two, the vein in a
   * category drawn from those the lockout leaves (a later strike locks
   * nothing), not struck in this dig yet and with items left if any have,
   * and WAY_OUT. False with no such category: the dig ends there.
   */
  private dealDig(s: GameState): boolean {
    const dm = s.delve!;
    const dig = digOf(s)!;
    const coop = isGroupRun(s);
    const recent = coop ? s.recentCategories : (s.players[s.turn]?.recent ?? []);
    const locked = lastPicks(recent, delveLockout(s.round));
    const allowed = this.categories.filter((c) => !locked.includes(c) && !dig.struck.includes(c));
    const fresh = allowed.filter((c) => this.unusedIn(s, c).length > 0);
    const next = sample(fresh.length ? fresh : allowed, 1, this.rng)[0];
    if (!next) return false;
    s.turnCount++;
    s.phase = 'choosing';
    s.question = null;
    s.reveal = null;
    s.offered = [next, WAY_OUT];
    dm.finds = [{ category: next, kind: 'azurite' }];
    delete dm.find;
    delete dm.asked;
    delete dm.missedHere;
    delete dm.dealAt;
    if (coop) {
      dm.votes = {};
      dm.voteFrom = null;
      if (this.now() >= dm.graceUntil) dm.excused = [];
      // Whose seat the screens lean on: the first standing, as beginTurn has it (the strike may have felled the last).
      s.turn = Math.max(0, s.players.findIndex((p) => livesOf(s, p.id) > 0));
    }
    return true;
  }

  /**
   * The dig's haul into the pack, each ward its holder's if they stand with
   * room for it, or else the first standing teammate's who has, in seat
   * order; the dig is over. Says how many went in.
   */
  private bankHaul(s: GameState): number {
    const dm = s.delve!;
    const dig = digOf(s);
    delete dm.dig;
    let banked = 0;
    for (const holder of dig?.haul ?? []) {
      const to = [holder, ...standingIds(s).filter((id) => id !== holder)].find((id) => hasRoom(inventoryOf(s, id), 'wards') && livesOf(s, id) > 0);
      if (to && this.gain(s, to, 'wards')) banked++;
    }
    if (banked) dm.banked = { wards: banked, at: this.now() };
    return banked;
  }

  /** WAY_OUT picked: the haul into the pack, and the run a depth deeper (the vein was this depth's question, cleared). */
  private leaveVein(s: GameState) {
    this.bankHaul(s);
    const banked = s.delve!.banked;
    if (isGroupRun(s)) this.advanceCoop(s, true);
    else this.advanceDelve(s, s.turn, true);
    // Dealing the next cards forgets the last pick's moment: keep the way out's.
    if (banked) s.delve!.banked = banked;
  }

  /**
   * Alone: moves on to the player's next turn (the seat after `from` with
   * lives left; one player, so their own), one depth deeper if the question
   * was `cleared` and at the same depth if not, or ends the run with their
   * last life: the depth is the result, nobody wins.
   */
  private advanceDelve(s: GameState, from: number, cleared: boolean) {
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
    const deeper = wrapped && cleared;
    if (deeper) s.round++;
    s.turn = next;
    this.beginTurn(s, false, deeper);
  }

  // ---- delve co-op --------------------------------------------------------

  /** Co-op: a random standing holder of `item` (the engine's roll, so a seeded run is repeatable). */
  private anyHolder(s: GameState, item: 'flares' | 'dynamite'): string {
    return sample(holdersOf(s, item), 1, this.rng)[0];
  }

  /**
   * Co-op: what a change of who is here (or seated, or voted) settles. A vote
   * is in once everyone it waits for has voted (and the cards are dealt: a
   * new zone's vote in sooner is closed by the host's 'expire' as they are);
   * a question is over once nobody standing is left to answer it; with
   * nobody standing at all between questions, the run is over.
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
    for (const id of standingIds(s)) missed[id] = Object.hasOwn(votes, id) ? 0 : (missed[id] ?? 0) + 1;
    dm.voteFrom = null;
    // The way out drawn: its cards stay up while the draw plays on them, as a question waits for its draw.
    if (isWayOut(category) && digOf(s)) {
      dm.leaving = this.now();
      return;
    }
    this.takePick(s, null, category);
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
    if (!clockRuns(q) || q.deadline === null) throw new ActionError('Too early.', true);
    const now = this.now();
    // A flare still to burn at 0 (its timer came late): time hasn't run out yet.
    let flareDue = teamItemReady(s, 'flares') && now >= q.deadline;
    if (from === null) {
      if (action.index !== null) throw new ActionError('Only players can answer.');
      if (flareDue) {
        this.burnFlare(s, this.anyHolder(s, 'flares'));
        return;
      }
      // With no flare to burn, a stick of dynamite goes off by itself, from
      // a random standing holder's pack, if the offer has a blast left (its
      // fuse has hissed over the clock's last seconds: delve.ts fuseLeft).
      // Nobody is hit, and the whole team gets the new question.
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
      this.note(s, from, q.itemId, true, answerMs(action.ms));
      this.coopReveal(s, { id: from, index }, false, []);
      return;
    }
    this.note(s, from, q.itemId, false, undefined);
    const took = this.hit(s, from);
    struck.push({ index, by: from, at: now, ...took });
    s.delve!.missedHere = true;
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
   * item, if it is one, as alone; with no room for it, a standing teammate
   * who has room takes it (`gainedBy`).
   */
  private coopReveal(s: GameState, winner: { id: string; index: number } | null, timedOut: boolean, hits: Hit[]) {
    const q = s.question!;
    const struck = q.struck ?? [];
    let gained: ItemKind | undefined;
    let gainedBy: string | undefined;
    let banked = 0;
    if (winner) {
      const p = s.players.find((p) => p.id === winner.id);
      if (p) p.score += 1;
      // A guest's right answer on its way as the flare burnt (sent before 0)
      // gives it back to whoever held it, unless the host's own answer used
      // the flare's time (it travels nowhere).
      const guest = winner.id !== s.hostId;
      if (guest && q.flared && q.flaredAt !== undefined && q.flaredBy && this.now() <= q.flaredAt + ANSWER_GRACE_MS && !struck.some((x) => x.by === s.hostId && x.at >= q.flaredAt!)) {
        this.refund(s, q.flaredBy);
        delete q.flared;
        delete q.flaredAt;
        delete q.flaredBy;
      }
      // The find goes to the winner if they have room for it, or else to the
      // first standing teammate in seat order who has: it was offered as
      // anyone standing had room, so it never pays nothing. A vein's goes
      // into the dig's haul, in hand, the same way.
      if (q.find === 'azurite') {
        const by = this.strikeRight(s, q, [winner.id, ...standingIds(s).filter((id) => id !== winner.id)]);
        if (by) {
          gained = 'wards';
          gainedBy = by;
        }
        banked = this.endDig(s);
      } else if (q.find) {
        const takers = [winner.id, ...standingIds(s).filter((id) => id !== winner.id)];
        for (const id of takers) {
          const reward = findReward(q.find, inventoryOf(s, id));
          if (!reward) continue;
          gained = this.gain(s, id, reward);
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
    // Nobody got it: the vein caves in on the whole haul.
    const buried = winner ? 0 : this.caveInDig(s);
    const vein: Pick<Reveal, 'strike' | 'dug' | 'buried' | 'banked'> =
      q.find === 'azurite' ? { strike: q.strike ?? 1, ...(gained ? { dug: true as const } : {}), ...(buried ? { buried } : {}), ...(banked ? { banked } : {}) } : {};
    s.reveal = {
      correctId: q.itemId,
      chosenId: winner ? q.itemId : null,
      correctIndex: q.options.indexOf(q.itemId),
      chosenIndex: winner ? winner.index : null,
      correct: !!winner,
      timedOut,
      winnerId: winner?.id ?? null,
      ...(gained ? { gained, gainedBy } : {}),
      ...(q.find && cavesIn(q.find) && all.length ? { caveIn: true } : {}),
      ...vein,
      hits: all,
    };
    s.phase = 'reveal';
  }

  /**
   * Co-op: after a reveal, a new offer for whoever stands (a revived player
   * too), one depth deeper if the team `cleared` the question and at the
   * same depth if not, or the end of the run.
   */
  private advanceCoop(s: GameState, cleared: boolean) {
    if (!standingIds(s).length) {
      this.finish(s, []);
      return;
    }
    if (cleared) s.round++;
    this.beginTurn(s, false, cleared);
  }

  // ---- turns mode -------------------------------------------------------

  /** `deeper`: the run just went a depth deeper (a new zone's cards are dealt as the plunge into it lands, dealAt). */
  private beginTurn(s: GameState, first: boolean, deeper = false) {
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
      // The depth's first offer (a new depth's, or the run's), not one after a miss at it.
      s.delve.finds = this.rollFinds(s, coop ? standingIds(s) : s.players[s.turn] ? [s.players[s.turn].id] : [], first || deeper);
      delete s.delve.find;
      delete s.delve.asked;
      delete s.delve.missedHere;
      if (deeper && opensZone(s.round)) s.delve.dealAt = this.now() + ZONE_DESCENT_MS;
      else delete s.delve.dealAt;
    }
  }

  // ---- craft ------------------------------------------------------------

  /** What Craft's rules work with (craft.ts Table). */
  private craftTable(): Table {
    if (!this.craftLines) throw new ActionError('The items are still loading.');
    return { items: this.items, lines: this.craftLines, rng: this.rng };
  }

  /** Five names for a Craft item: half of them look alike (as on Merciless), the rest from the pool at random. */
  private craftDecoys = (answer: CraftItem, pool: CraftItem[], count: number): CraftItem[] => {
    const items = pool as Item[];
    const alike = this.lookalikes(answer as Item, items, Math.round(count * PRESETS.merciless.similarNames), CRAFT.options, false, (it) => [it.id]);
    const rest = sample(
      items.filter((it) => !alike.includes(it)),
      count - alike.length,
      this.rng,
    );
    return [...alike, ...rest];
  };

  /** A Craft game starts: everyone's gold, and the first shop. */
  private beginCraft(s: GameState) {
    s.phase = 'craft';
    for (const p of s.players) p.score = CRAFT.startGold;
    s.craft = { round: 1, step: 'shop', until: this.now() + CRAFT.shopMs, stash: {}, ready: [], pieces: [], opening: this.goldOf(s) };
  }

  private goldOf(s: GameState): Record<string, number> {
    return Object.fromEntries(s.players.map((p) => [p.id, p.score]));
  }

  /** Whom the step waits for: everyone here in the shop and at the reveal, makers while they scramble, guessers yet to name theirs. */
  private craftWaitsFor(s: GameState): string[] {
    const c = s.craft!;
    const here = s.players.filter((p) => p.connected).map((p) => p.id);
    if (c.step === 'craft') return here.filter((id) => madeBy(c, id) && !c.ready.includes(id));
    if (c.step === 'guess') return here.filter((id) => guessedBy(c, id)?.guess === undefined);
    return here.filter((id) => !c.ready.includes(id));
  }

  /** The step ends early once nobody is left to wait for. */
  private craftCarryOn(s: GameState) {
    if (s.phase === 'craft' && s.craft && !this.craftWaitsFor(s).length) this.craftNext(s);
  }

  /** On to the next step: deal, pass the items on, settle the names, then the next round (or the end). */
  private craftNext(s: GameState) {
    const c = s.craft!;
    if (c.step === 'shop') {
      const t = this.craftTable();
      // Everyone here is dealt in; with fewer than two here, everyone seated.
      let ids = s.players.filter((p) => p.connected).map((p) => p.id);
      if (ids.length < 2) ids = s.players.map((p) => p.id);
      const used = new Set(s.used);
      c.pieces = ids.map((id, i) => {
        const p = deal(t, id, ids[(i + 1) % ids.length], used, this.craftDecoys);
        used.add(p.item);
        s.used.push(p.item);
        return p;
      });
      c.step = 'craft';
    } else if (c.step === 'craft') {
      c.step = 'guess';
    } else if (c.step === 'guess') {
      const byId = new Map(s.players.map((p) => [p.id, p]));
      // A guesser who left has nothing to pay or be paid; their item's maker gets nothing for it.
      c.pieces = c.pieces.filter((p) => byId.has(p.guesser));
      settle(
        c,
        (id) => byId.get(id)?.score ?? 0,
        (id, n) => {
          const p = byId.get(id);
          if (p) p.score += n;
        },
      );
      for (const p of c.pieces) {
        const by = byId.get(p.guesser);
        if (by) by.streak = rightGuess(p) ? (by.streak ?? 0) + 1 : 0;
      }
      c.step = 'reveal';
    } else {
      if (craftOver(c.round, s.players.map((p) => p.score))) {
        this.finish(s, craftLeaders(s));
        return;
      }
      c.round++;
      s.round = c.round;
      c.pieces = [];
      c.opening = this.goldOf(s);
      c.step = 'shop';
    }
    c.ready = [];
    c.until = this.now() + stepMs(c.step);
  }

  /** Someone left the game: with one player left, it's over. */
  private craftLeaves(s: GameState, id: string) {
    const c = s.craft!;
    delete c.stash[id];
    c.ready = c.ready.filter((r) => r !== id);
    if (s.phase !== 'craft') return;
    if (s.players.length < 2) {
      this.finish(s, craftLeaders(s));
      return;
    }
    // Their own item still goes to its guesser; the one passed to them is put back.
    if (c.step === 'craft' || c.step === 'guess') c.pieces = c.pieces.filter((p) => p.guesser !== id);
    this.craftCarryOn(s);
  }

  /** A player's move in Craft. */
  private craftAct(s: GameState, a: Extract<Action, { type: 'craft' }>, from: string | null) {
    const c = s.craft;
    if (s.phase !== 'craft' || !c) throw new ActionError('Too late!', true);
    const me = s.players.find((p) => p.id === from);
    if (!me) throw new ActionError('Not allowed.');
    const step = c.step;
    switch (a.do) {
      case 'buy': {
        if (step !== 'shop' || c.ready.includes(me.id)) throw new ActionError('The shop is closed.', true);
        if (!isOrb(a.orb)) throw new ActionError('Not allowed.');
        const price = ORBS[a.orb].price;
        if (me.score < price) throw new ActionError('Not enough gold.', true);
        me.score -= price;
        const mine = (c.stash[me.id] ??= {});
        mine[a.orb] = (mine[a.orb] ?? 0) + 1;
        break;
      }
      case 'use': {
        if (!isOrb(a.orb)) throw new ActionError('Not allowed.');
        if (holds(c, me.id, a.orb) < 1) throw new ActionError('You have none of those.', true);
        const t = this.craftTable();
        let piece: Piece | null;
        if (ORBS[a.orb].side === 'scramble') {
          piece = madeBy(c, me.id);
          if (step !== 'craft' || !piece || c.ready.includes(me.id)) throw new ActionError('Too late!', true);
          if (!canScramble(piece, a.orb)) throw new ActionError('That would do nothing more.', true);
          if (a.orb === 'chance') {
            const used = new Set([...s.used, ...c.pieces.map((p) => p.item)]);
            const fresh = deal(t, piece.maker, piece.guesser, used, this.craftDecoys);
            fresh.look = piece.look + 1;
            s.used.push(fresh.item);
            c.pieces[c.pieces.indexOf(piece)] = piece = fresh;
            piece.last = { orb: a.orb, hit: true };
          } else piece.last = { orb: a.orb, hit: scramble(t, piece, a.orb) };
        } else {
          piece = guessedBy(c, me.id);
          if (step !== 'guess' || !piece || piece.guess !== undefined) throw new ActionError('Too late!', true);
          piece.last = { orb: a.orb, hit: undo(t, piece, a.orb) };
        }
        c.stash[me.id]![a.orb]! -= 1;
        break;
      }
      case 'ready': {
        if (step === 'guess') throw new ActionError('Name the item first.', true);
        if (!c.ready.includes(me.id)) c.ready.push(me.id);
        break;
      }
      case 'guess': {
        const piece = guessedBy(c, me.id);
        if (step !== 'guess' || !piece || piece.guess !== undefined) throw new ActionError('Too late!', true);
        if (typeof a.index !== 'number' || !Number.isInteger(a.index) || a.index < 0 || a.index >= piece.options.length) throw new ActionError('Not allowed.');
        piece.guess = a.index;
        break;
      }
    }
    this.craftCarryOn(s);
  }

  private finish(s: GameState, winners: string[]) {
    if (s.craft) s.craft.ready = [];
    if (s.delve) {
      delete s.delve.dig;
      delete s.delve.leaving;
      s.delve.finds = [];
      delete s.delve.find;
      if (s.delve.voteFrom !== undefined) s.delve.voteFrom = null;
      delete s.delve.asked;
      delete s.delve.dealAt;
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
    for (const id of dm.eliminated) (dm.out ??= {})[id] = dm.round;
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
      // Only a question cleared takes the run a depth deeper: after a miss (or a time-out) the next one is asked at the same depth.
      const cleared = s.phase === 'reveal' && !!s.reveal?.correct;
      // A vein struck right: its two cards, or (no strike left in it) the haul into the pack and on.
      if (cleared && digOf(s)) {
        if (digRunsOn(s) && this.dealDig(s)) return;
        this.bankHaul(s);
      }
      if (isGroupRun(s)) this.advanceCoop(s, cleared);
      else this.advanceDelve(s, from, cleared);
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
  private lookalikes(answer: Item, pool: Item[], count: number, options: number, byArt: boolean, arts: (it: Item) => readonly string[]): Item[] {
    if (count <= 0) return [];
    // By art only with the table at hand and the answer in it (items added
    // since it was built have no look-alikes); by name otherwise. By art,
    // two items look as alike as the likest of their pictures (`arts`: the
    // one the question shows, or each it could, Item.variants).
    const looks = byArt && this.looks?.looksLike(arts(answer)[0]).length ? this.looks : null;
    const like = looks
      ? (a: Item, b: Item) => Math.max(...arts(a).flatMap((x) => arts(b).map((y) => looks.lookScore(x, y))))
      : (a: Item, b: Item) => this.similarity(a, b);
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

  /** The sets of twins (TWINS) that may not meet under `rules`, in a question whose art is `gray` or not. */
  private apartTwins(rules: DifficultyRules, gray: boolean): Item[][] {
    const reach = twinReach(rules);
    return this.twins.flatMap((t) => (t.depth > reach || (t.colour && gray) ? [t.items] : []));
  }

  /**
   * The twins that sit out a question about `answer`: of each set in `apart`,
   * all but the answer, or, the answer being none of them, all but one of
   * those in `unused` (the category's unseen items), picked at random, or
   * of the whole set when all of them were seen (as a decoy once the unseen
   * run out). A set from another category only comes up as the very last
   * resort, from all items, so it keeps its first without a roll.
   */
  private benchTwins(answer: Item, apart: Item[][], unused: ReadonlySet<Item>): Set<string> {
    const out = new Set<string>();
    for (const set of apart) {
      const open = set.filter((it) => unused.has(it));
      const pick = open.length ? open : set[0].category === answer.category ? set : [];
      const keep = set.includes(answer) ? answer : pick.length > 1 ? pick[Math.floor(this.rng() * pick.length)] : (pick[0] ?? set[0]);
      for (const it of set) if (it !== keep) out.add(it.id);
    }
    return out;
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
  makeQuestion(s: GameState, category: string, kind: Pick<Question, 'find' | 'strike' | 'light'> = {}): Question {
    const special: Pick<Question, 'find' | 'strike' | 'light'> =
      s.delve && kind.find
        ? {
            find: kind.find,
            ...(kind.find === 'azurite' && (kind.strike ?? 1) > 1 ? { strike: kind.strike } : {}),
            ...(kind.find === 'azurite' && typeof kind.light === 'number' ? { light: kind.light } : {}),
          }
        : {};
    const rules = s.delve ? delveQuestionRules(s.round, special) : activeRules(s);
    const inCat = this.byCategory.get(category) ?? [];
    let mode = this.rollMode(s);
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
      const roomy = shareable(unused, fakes, mode);
      if (roomy.length || !fakes) return roomy;
      // Counted as the picture question it would turn into, its twins kept apart as there.
      const asArt = rules.artChance > 0 ? shareable(unused, 0, 'art') : [];
      if (asArt.length) {
        this.tallyMode(s, mode, -1);
        this.tallyMode(s, (mode = 'art'), 1);
        fakes = 0;
        return asArt;
      }
      return shareable(unused, 0, mode);
    };
    // Delve: the art in grayscale or not, rolled for each question: here
    // where twins told apart by their colours could meet (whether they may
    // depends on it), else after the rest as before there were any.
    const grayFirst = !!rules.grayChance && this.twins.some((t) => t.colour && t.depth <= twinReach(rules));
    const grayRoll = grayFirst ? this.rng() < rules.grayChance! : undefined;
    // Twins that may not meet yet, as a name or a picture question ("find the
    // art" may be in grayscale where the art to name isn't): all but one of
    // each set sit out, so they don't count.
    const apart: Record<QuestionMode, Item[][]> = {
      name: this.apartTwins(rules, grayRoll ?? rules.grayscale === 'all'),
      art: this.apartTwins(rules, grayRoll ?? rules.grayscale !== 'off'),
    };
    const shareable = (unused: Item[], fakes: number, as: QuestionMode) => {
      const left = new Map<string, number>();
      for (const it of unused) left.set(it.group, (left.get(it.group) ?? 0) + 1);
      const open = apart[as].length ? new Set(unused) : null;
      for (const set of apart[as]) {
        const n = set.filter((it) => open!.has(it)).length;
        if (n > 1) left.set(set[0].group, left.get(set[0].group)! - (n - 1));
      }
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

    const benched = this.benchTwins(answer, apart[mode], new Set(unused));
    const fits = (it: Item) => !benched.has(it.id);
    const sameGroup = unused.filter((it) => it.id !== answer.id && it.group === answer.group && fits(it));
    // Decoys come from the answer's own group (all rings, all bows…): a flask
    // among tablets would stand out. Other groups only fill in when it runs
    // too low, evened out with it, and rare groups (tablets) not even then.
    const otherGroup = unused.filter((it) => it.id !== answer.id && it.group !== answer.group && weightOf(it) === 1 && fits(it));
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
    // An item drawn more than one way shows any of its art, each as often.
    // By art, the pictures to be shown are drawn before the look-alikes are
    // picked (only those items roll), so they look like the art the question
    // shows: the answer's, and on an art question every picture's. A name
    // question shows no decoy's art, so a decoy there counts as the likest of
    // its own. Else each picture is drawn once the options are known
    // (rollArt below).
    const drawnWith = new Map<string, number>();
    const rollArt = (it: Item) => {
      const n = it.variants?.length ?? 0;
      return n ? Math.floor(this.rng() * (n + 1)) : 0;
    };
    if (byArt) for (const it of mode === 'art' ? [answer, ...pool] : [answer]) if (it.variants) drawnWith.set(it.id, rollArt(it));
    // Each item's art ids, worked out once: the look-alikes score many pairs.
    const artIds = new Map<Item, readonly string[]>();
    const arts = (it: Item) => {
      let ids = artIds.get(it);
      if (!ids) artIds.set(it, (ids = mode === 'art' || it === answer ? [drawnAs(it, drawnWith.get(it.id)).art] : allArt(it).map((a) => a.art)));
      return ids;
    };
    const decoys = this.lookalikes(answer, pool, simCount, count, byArt, arts);
    // Rest at random, preferring the same group, then the category, then anything.
    for (const source of [pool, unused, inCat, this.items]) {
      if (decoys.length >= need) break;
      const taken = new Set([answer.id, ...decoys.map((it) => it.id)]);
      decoys.push(...sample(source.filter((it) => !taken.has(it.id) && fits(it)), need - decoys.length, this.rng));
    }
    if (pool !== sameGroup) this.evenOut(answer, decoys, pool, fakes);

    const options = shuffle([answer, ...decoys], this.rng).map((it) => it.id);
    // Strictly increasing: it doubles as the question's id for late answers.
    const askedAt = Math.max(this.now(), (s.lastAskedAt ?? 0) + 1, (s.question?.askedAt ?? 0) + 1);
    s.lastAskedAt = askedAt;
    // Delve: deep down, "find the art" pictures may burn in as well, each cut much coarser.
    const tiles = mode === 'art' && !!rules.veil && !!s.delve && this.rng() < (special.find ? findTileVeil(special.find, s.round, special.strike) : delveTileVeil(s.round));
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
    const gray = rules.grayChance ? { gray: grayRoll ?? this.rng() < rules.grayChance } : {};
    const tall = mode === 'art' && options.every((id) => TALL_ART_GROUPS.has(this.byId.get(id)!.group)) ? { tall: true } : {};
    // Each picture's art, as drawn for the look-alikes or rolled now (only
    // items drawn more than one way roll, so a game without one asks what it
    // always asked).
    const variant = picturesOf({ mode, options, itemId: answer.id }).map((id) => drawnWith.get(id) ?? rollArt(this.byId.get(id)!));
    const drawn = variant.some(Boolean) ? { variant } : {};
    // No deadline yet, in any mode: the clock starts once the art has reached those answering (the 'clock' action).
    return { category, groups, ...tall, mode, itemId: answer.id, options, labels, prompt, veil, mirrored, ...gray, ...drawn, askedAt, deadline: null, misses: [], ...special };
  }
}

/**
 * Groups whose art is at least about twice as tall as wide, measured from the
 * pictures (height over width): spears, staves and quarterstaves 3.9, wands
 * 2.9, flasks 2.0, bows, crossbows and two-handed maces 2.0. (Body armours,
 * quivers, sceptres and one-handed maces are 1.5; talismans are square.)
 */
export const TALL_ART_GROUPS = new Set(['Spears', 'Staves', 'Quarterstaves', 'Wands', 'Flasks', 'Bows', 'Crossbows', 'Two-Handed Maces']);

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

/** A host-clock time an action carries, or `fallback` when it has none (or a broken one). */
function timeOr(at: unknown, fallback: number): number {
  return typeof at === 'number' && Number.isFinite(at) ? at : fallback;
}
