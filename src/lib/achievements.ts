// Achievements: feats this browser's player has earned, kept in localStorage
// like the codex and never sent anywhere.
//
// Few and chosen: each marks a moment worth telling or a goal worth chasing.
// Four groups of nine (Knowledge, Versus, Delve, Together), so the Codex page
// lays out evenly. Each group opens with a very easy one in lead, so a new
// player soon finds there are achievements at all, and holds one to laugh at
// and one that takes real mastery. Tiers are the seal's metal, the
// alchemist's way from lead through copper and silver to gold (METALS), and
// a series (one idea at rising tiers) shares a sign; no other achievements do.
//
// Where they come from:
// - What the codex (lib/codex.ts) and the Delve records (lib/delveRecord.ts)
//   keep: so games from before achievements existed count too. That first
//   check is quiet (see checkAchievements and the start page's notice).
// - Moments in a run of Delve as this device sees them happen (momentsIn):
//   reaching a depth, a ward saving the last life, a team falling together,
//   a full pack. Everything they read is in the copy of the state a guest gets.
// - Games against others online: a little tracker follows the game in play
//   (trackVersus: the biggest lead a rival had over you, your own answers,
//   rivals who guessed, race questions taken from veiled art), kept in the
//   tab's session storage so a reload doesn't lose it and a game in another
//   tab never touches it, and at its end (seen once, a reload in its last
//   moments too) versusEnd says how it went and what it earned. Only
//   online, in a seat, to 5 points or more, with someone else still there at
//   the end; on one device the game can't tell its players apart. The wins
//   in a row such games make are kept beside the list (loadWins).
//
// They are kept on this device for this player alone, so they don't guard
// against a player fooling themselves (leaving a room to save a streak, two
// tabs in one game). An achievement once earned stays earned, also when more
// items join the game or the codex log's oldest answers make way. Erasing the
// codex erases them too (resetAchievements).

import { answerLives, answerWards, loadCodex, type Answer, type Codex } from './codex.ts';
import { DELVE_MAX_DYNAMITE, DELVE_MAX_FLARES, DELVE_MAX_WARDS, fellAt, inventoryOf, isGroupRun, livesOf, shownDepth, standingIds } from './delve.ts';
import { isTogether, loadRecords, type DelveRecords, type DelveRun } from './delveRecord.ts';
import type { GameState, Item } from './game.ts';
import { clearAside, makeRoom, newerThan } from './keepAside.ts';
import { isHeldName } from './names.ts';
import { readStored, removeStored, storeKey, tryReadStored, writeStored } from './storage.ts';

/** The groups of the list, in the page's order. */
export type AchievementGroup = 'knowledge' | 'versus' | 'delve' | 'together';

export const GROUPS: { key: AchievementGroup; title: string; blurb: string }[] = [
  { key: 'knowledge', title: 'Knowledge', blurb: 'The items you know, from your own answers.' },
  { key: 'versus', title: 'Versus', blurb: 'Online games against other players, played to 5 points or more, with a rival still there at the end.' },
  { key: 'delve', title: 'Delve', blurb: 'Runs into the dark.' },
  { key: 'together', title: 'Together', blurb: 'Delve runs with others online, and the lives you share.' },
];

/** The sign engraved on an achievement's seal (lib/alchemy.ts SIGNS draws them). */
export type Sign =
  | 'fire'
  | 'mercury'
  | 'hexagram'
  | 'stone'
  | 'luna'
  | 'mars'
  | 'waves'
  | 'sol'
  | 'jupiter'
  | 'eye'
  | 'earth'
  | 'saturn'
  | 'salt'
  | 'cross'
  | 'hourglass'
  | 'pelican'
  | 'sublimation'
  | 'pisces'
  | 'antimony'
  | 'heptagram'
  | 'rings'
  | 'retort'
  | 'aries'
  | 'venus'
  | 'ouroboros'
  | 'sulphur'
  | 'cancer'
  | 'gemini'
  | 'scorpio';

/** How hard an achievement is: the seal's metal, lead (the very easy ones), copper, silver or gold. */
export type Tier = 0 | 1 | 2 | 3;

/**
 * Each tier's metal: its name, the colour its seal is struck in, and, where
 * the glow under the lines differs from the plain one, its sheen. Lead and
 * silver sit far apart: lead a dark, dull grey whose soft paler lustre keeps
 * it metal rather than stone, silver near white with a bright white lustre.
 * Gold is pale gold over a deep amber glow, like gilding.
 *
 * `light`: how light passes over an earned seal of the metal (lib/glint.ts),
 * every `every` ms, taking `sweep` to cross, a band `band`% either side of
 * its middle, in `gleam` at `strength`; gold's leaves a spark on the rim.
 * Dull lead gleams seldom, slowly and faintly; silver flashes quick, narrow
 * and white.
 */
export interface Metal {
  name: string;
  color: string;
  /** Its name's colour on the page, where the seal's own would be too dark to read. */
  label?: string;
  sheen?: { color: string; opacity: number };
  light: { every: number; sweep: number; band: number; gleam: string; strength: number; spark?: true };
}

export const METALS: Record<Tier, Metal> = {
  0: {
    name: 'Lead',
    color: '#6e7073',
    label: '#a2a7ac',
    sheen: { color: '#a2a7ac', opacity: 0.38 },
    light: { every: 13000, sweep: 2400, band: 26, gleam: '#d9dde1', strength: 0.35 },
  },
  1: { name: 'Copper', color: '#cf9366', light: { every: 11000, sweep: 1700, band: 18, gleam: '#ffd9b8', strength: 0.6 } },
  2: {
    name: 'Silver',
    color: '#eef1f4',
    sheen: { color: '#ffffff', opacity: 0.38 },
    light: { every: 8000, sweep: 1000, band: 10, gleam: '#ffffff', strength: 0.95 },
  },
  3: {
    name: 'Gold',
    color: '#f6d688',
    sheen: { color: '#e8962e', opacity: 0.5 },
    light: { every: 7000, sweep: 1400, band: 15, gleam: '#fff4cf', strength: 1, spark: true },
  },
};

/** The tiers, easiest first. */
export const TIERS: Tier[] = [0, 1, 2, 3];

export interface Progress {
  /** How far along (may run past `need`). */
  have: number;
  /** What it takes. */
  need: number;
  /** A word on where it stands ("Rings"), if any. */
  note?: string;
}

export interface Achievement {
  id: string;
  group: AchievementGroup;
  title: string;
  /** What earns it. */
  text: string;
  /** How hard it is (see Tier). */
  tier: Tier;
  sign: Sign;
  /** The idea its tiers share (they share the sign too); missing for one of a kind. */
  series?: string;
  /** Shown as a blank seal until earned. */
  secret?: true;
  /** How far along this player is, from what is kept; missing for a moment, which is earned as it happens. */
  progress?: (s: Summary) => Progress;
}

/** What the achievements read from the codex and the Delve records, worked out once. */
export interface Summary {
  /** Most right answers in a row on questions put to this player alone (races and runs together left out), and now. */
  streak: number;
  streakNow: number;
  /** Most of those in a row each within FAST_MS. */
  fast: number;
  /** An item answered right after REVENGE wrong answers to it in a row (any of this player's answers). */
  revenge: boolean;
  /** The category nearest to every item answered both ways. */
  twofold: Progress;
  /** Items of the game answered right at least once. */
  known: Progress;
  /** Most falls for one made-up name. */
  fooled: number;
  // The depths below are as players see them (shownDepth), as the texts name them.
  /** Deepest depth reached in a run alone (ended or left, under the rules it started with). */
  deepestAlone: number;
  /** Most depths survived in a row on the last life past THREAD_FROM, in a run alone. */
  thread: number;
  /** Deepest depth reached in a run alone with every life. */
  untouched: number;
  /** A ward broke in place of the last life, in a run alone. */
  savingGrace: boolean;
  /** A run alone fell at exactly the depth of the best before it, DEPTH_GRAVE or deeper. */
  grave: boolean;
  /** Most lives given in one run together. */
  given: number;
  /** Deepest depth stood at in a run together. */
  deepCompany: number;
  /** Deepest depth a run together got to (the team's), this player in it. */
  deepTeam: number;
  /** Most times brought back by teammates in one run together. */
  revived: number;
  /** Most games against others won in a row, and now (see loadWins). */
  wins: number;
  winsNow: number;
}

const count = (have: number, need: number, note?: string): Progress => ({ have, need, ...(note ? { note } : {}) });

/** A right answer this quick (ms from the art to the click) counts for Mercurial and Quicksilver. */
export const FAST_MS = 2000;
/** Prima Materia: different items answered right. */
export const PRIMA = 25;
/** Sweet Revenge: wrong answers to one item in a row, before the right one. */
export const REVENGE = 3;
/** Undefeated: games against others won in a row. */
export const WIN_RUN = 5;
/** Wins count to this target or more; Untarnished and Clean Sweep to TARGET_HIGH. */
export const TARGET_MIN = 5;
export const TARGET_HIGH = 10;
/** Tide Turner: how far a rival led you; Hubris: how far you led the winner. */
export const COMEBACK = 4;
/** Through the Veil: race questions taken, of VEIL_OPTIONS or more options, before VEIL_SHARE of the art burnt in. */
export const VEIL_TAKES = 3;
export const VEIL_SHARE = 0.25;
export const VEIL_OPTIONS = 6;
// Every depth an achievement names is a depth as players see it (shownDepth,
// one less than the run's own): its check compares shown depths, so "reach
// depth 50" is earned where the header reads 50.
/** By a Thread: depths survived in a row on the last life, past this depth. */
export const THREAD = 10;
export const THREAD_FROM = 30;
/** Untouched: the depth to reach without losing a life. */
export const UNTOUCHED = 40;
/** Familiar Grave: the shallowest best it counts at. */
export const DEPTH_GRAVE = 20;
/** Fell as One: the shallowest depth, and the fewest who fall. */
export const FALL_DEPTH = 20;
export const FALL_MANY = 3;
/** Lone Wolf: depths cleared without a loss as the last one standing, past this depth. */
export const LONE = 10;
export const LONE_FROM = 30;
/** Nobody Left Behind, Unbroken Circle, Roped Together and Deep Company: the depths to reach together. */
export const ALL_DEPTH = 30;
export const CIRCLE_DEPTH = 60;
export const ROPED_DEPTH = 10;
export const COMPANY_DEPTH = 75;
/** Dead Weight: times brought back in one run. */
export const DEAD_WEIGHT = 3;
/** Process of Elimination: options still open when you cleared it. */
export const OPEN_OPTIONS = 3;

export const ACHIEVEMENTS: Achievement[] = [
  // ---- knowledge ----
  {
    id: 'prima-materia',
    group: 'knowledge',
    tier: 0,
    sign: 'stone',
    series: 'known',
    title: 'Prima Materia',
    text: `Answer ${PRIMA} different items right.`,
    progress: (s) => count(s.known.have, PRIMA),
  },
  {
    id: 'streak-25',
    group: 'knowledge',
    tier: 1,
    sign: 'fire',
    series: 'streak',
    title: 'Burning Bright',
    text: 'Answer 25 questions right in a row on your own turns.',
    progress: (s) => count(s.streak, 25, s.streakNow ? `now ${s.streakNow} in a row` : undefined),
  },
  {
    id: 'streak-100',
    group: 'knowledge',
    tier: 3,
    sign: 'fire',
    series: 'streak',
    title: 'Undying Flame',
    text: 'Answer 100 questions right in a row on your own turns.',
    progress: (s) => count(s.streak, 100, s.streakNow ? `now ${s.streakNow} in a row` : undefined),
  },
  {
    id: 'mercurial',
    group: 'knowledge',
    tier: 2,
    sign: 'mercury',
    series: 'fast',
    title: 'Mercurial',
    text: `Answer 5 questions right in a row on your own turns, each within ${FAST_MS / 1000} seconds of its art appearing.`,
    progress: (s) => count(s.fast, 5),
  },
  {
    id: 'quicksilver',
    group: 'knowledge',
    tier: 3,
    sign: 'mercury',
    series: 'fast',
    title: 'Quicksilver',
    text: `Answer 20 questions right in a row on your own turns, each within ${FAST_MS / 1000} seconds of its art appearing.`,
    progress: (s) => count(s.fast, 20),
  },
  {
    id: 'twofold',
    group: 'knowledge',
    tier: 2,
    sign: 'hexagram',
    title: 'Twofold Lore',
    text: 'For every item of one category, name it from its art and find its art from its name.',
    progress: (s) => s.twofold,
  },
  { id: 'great-work', group: 'knowledge', tier: 3, sign: 'stone', series: 'known', title: 'The Great Work', text: 'Answer every item in the game right at least once.', progress: (s) => s.known },
  { id: 'fooled-twice', group: 'knowledge', tier: 1, sign: 'luna', secret: true, title: 'Fool Me Twice', text: 'Fall for the same made-up name a second time.', progress: (s) => count(s.fooled, 2) },
  { id: 'sweet-revenge', group: 'knowledge', tier: 1, sign: 'retort', title: 'Sweet Revenge', text: `Answer an item right after getting it wrong ${REVENGE} times in a row.` },

  // ---- versus ----
  { id: 'first-victory', group: 'versus', tier: 0, sign: 'aries', title: 'First Victory', text: 'Win a game against other players.' },
  { id: 'deathmatch', group: 'versus', tier: 1, sign: 'mars', title: 'Sudden Death', text: 'Win a deathmatch by answering its last round right while a rival gets it wrong.' },
  { id: 'tide-turner', group: 'versus', tier: 2, sign: 'waves', title: 'Tide Turner', text: `Win a game after a rival led you by ${COMEBACK} points or more, with them still there at the end.` },
  { id: 'untarnished', group: 'versus', tier: 2, sign: 'sol', series: 'perfect', title: 'Untarnished', text: `Win a game to ${TARGET_HIGH} points or more without a wrong answer.` },
  {
    id: 'clean-sweep',
    group: 'versus',
    tier: 3,
    sign: 'sol',
    series: 'perfect',
    title: 'Clean Sweep',
    text: `Win a race to ${TARGET_HIGH} points or more by taking every question, with every rival guessing at least once.`,
  },
  { id: 'usurper', group: 'versus', tier: 2, sign: 'jupiter', secret: true, title: 'Usurper', text: 'Win a game against the creator of PoE2.Quest.' },
  {
    id: 'through-the-veil',
    group: 'versus',
    tier: 3,
    sign: 'eye',
    title: 'Through the Veil',
    text: `Win a race without a wrong guess, taking ${VEIL_TAKES} questions with ${VEIL_OPTIONS} or more options before a quarter of their art has burned in.`,
  },
  {
    id: 'undefeated',
    group: 'versus',
    tier: 3,
    sign: 'ouroboros',
    title: 'Undefeated',
    text: `Win ${WIN_RUN} games against other players in a row.`,
    progress: (s) => count(s.wins, WIN_RUN, s.winsNow ? `now ${s.winsNow} in a row` : undefined),
  },
  { id: 'hubris', group: 'versus', tier: 1, sign: 'venus', title: 'Hubris', text: `Lose a game after leading the winner by ${COMEBACK} points or more.` },

  // ---- delve ----
  { id: 'depth-10', group: 'delve', tier: 0, sign: 'earth', series: 'depth', title: 'Into the Fissure', text: 'Reach depth 10 in a run alone.', progress: (s) => count(s.deepestAlone, 10) },
  { id: 'depth-50', group: 'delve', tier: 2, sign: 'earth', series: 'depth', title: 'Delve Master', text: 'Reach depth 50 in a run alone.', progress: (s) => count(s.deepestAlone, 50) },
  { id: 'depth-100', group: 'delve', tier: 3, sign: 'earth', series: 'depth', title: 'Endless Delver', text: 'Reach depth 100 in a run alone.', progress: (s) => count(s.deepestAlone, 100) },
  {
    id: 'untouched',
    group: 'delve',
    tier: 3,
    sign: 'salt',
    title: 'Untouched',
    text: `Reach depth ${UNTOUCHED} in a run alone without losing a life.`,
    progress: (s) => count(s.untouched, UNTOUCHED),
  },
  {
    id: 'by-a-thread',
    group: 'delve',
    tier: 2,
    sign: 'hourglass',
    title: 'By a Thread',
    text: `In a run alone, survive ${THREAD} depths in a row on your last life, all past depth ${THREAD_FROM}.`,
    progress: (s) => count(s.thread, THREAD),
  },
  { id: 'saving-grace', group: 'delve', tier: 1, sign: 'cross', title: 'Saving Grace', text: 'Have an Azurite Ward shatter in place of your last life.' },
  {
    id: 'familiar-grave',
    group: 'delve',
    tier: 1,
    sign: 'saturn',
    secret: true,
    title: 'Familiar Grave',
    text: `In a run alone, perish at exactly your best depth, when that is ${DEPTH_GRAVE} or deeper.`,
  },
  {
    id: 'fully-laden',
    group: 'delve',
    tier: 3,
    sign: 'cancer',
    title: 'Fully Laden',
    text: `In a run alone, carry ${DELVE_MAX_WARDS} Azurite Wards, ${DELVE_MAX_FLARES} flares and ${DELVE_MAX_DYNAMITE} sticks of dynamite at once.`,
  },
  { id: 'chain-reaction', group: 'delve', tier: 1, sign: 'sulphur', title: 'Chain Reaction', text: "Have a Dynamite Cache's blast destroy a stick of dynamite you carried." },

  // ---- together ----
  {
    id: 'roped-together',
    group: 'together',
    tier: 0,
    sign: 'gemini',
    title: 'Roped Together',
    text: `Reach depth ${ROPED_DEPTH} in a run together.`,
    progress: (s) => count(s.deepTeam, ROPED_DEPTH),
  },
  { id: 'selfless', group: 'together', tier: 2, sign: 'pelican', title: 'Selfless', text: 'Give away two of your own lives in one run to bring teammates back.', progress: (s) => count(s.given, 2) },
  {
    id: 'elimination',
    group: 'together',
    tier: 1,
    sign: 'sublimation',
    title: 'Process of Elimination',
    text: `Clear a depth after every other teammate still standing (two or more) got it wrong, with ${OPEN_OPTIONS} or more options still open.`,
  },
  {
    id: 'fell-as-one',
    group: 'together',
    tier: 1,
    sign: 'pisces',
    secret: true,
    title: 'Fell as One',
    text: `Perish on the same question as every teammate still standing (${FALL_MANY} or more of you), at depth ${FALL_DEPTH} or deeper.`,
  },
  {
    id: 'lone-wolf',
    group: 'together',
    tier: 2,
    sign: 'antimony',
    title: 'Lone Wolf',
    text: `As the last of your team still standing, go ${LONE} depths past depth ${LONE_FROM} without losing a life.`,
  },
  {
    id: 'nobody-left',
    group: 'together',
    tier: 2,
    sign: 'rings',
    series: 'whole',
    title: 'Nobody Left Behind',
    text: `Reach depth ${ALL_DEPTH} in a run together without any of you ever perishing.`,
  },
  {
    id: 'unbroken-circle',
    group: 'together',
    tier: 3,
    sign: 'rings',
    series: 'whole',
    title: 'Unbroken Circle',
    text: `Reach depth ${CIRCLE_DEPTH} in a run together without any of you ever perishing.`,
  },
  {
    id: 'deep-company',
    group: 'together',
    tier: 3,
    sign: 'heptagram',
    title: 'Deep Company',
    text: `Reach depth ${COMPANY_DEPTH} in a run together while still standing.`,
    progress: (s) => count(s.deepCompany, COMPANY_DEPTH),
  },
  {
    id: 'dead-weight',
    group: 'together',
    tier: 1,
    sign: 'scorpio',
    title: 'Dead Weight',
    text: `Be brought back by your teammates ${DEAD_WEIGHT} times in one run.`,
    progress: (s) => count(s.revived, DEAD_WEIGHT),
  },
];

export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Done: what it takes is there. */
export const isDone = (p: Progress) => p.need > 0 && p.have >= p.need;

// ---- from the codex and the records -------------------------------------------

/**
 * Runs of right answers in the log on questions put to this player alone:
 * own turns, a run alone, a game alone. A race question can be sat out and a
 * teammate can clear a depth, so those neither add to a run nor break it.
 */
function streaks(log: Answer[]) {
  let run = 0;
  let best = 0;
  let quick = 0;
  let fast = 0;
  for (const a of log) {
    if (a.race || a.team) continue;
    run = a.ok ? run + 1 : 0;
    best = Math.max(best, run);
    quick = a.ok && a.ms !== undefined && a.ms <= FAST_MS ? quick + 1 : 0;
    fast = Math.max(fast, quick);
  }
  return { best, now: run, fast };
}

/** Whether an item was ever answered right after REVENGE or more wrong answers to it in a row: all this player's answers, races and runs together too. */
function revenged(log: Answer[]): boolean {
  const misses = new Map<string, number>();
  for (const a of log) {
    if (a.ok && (misses.get(a.id) ?? 0) >= REVENGE) return true;
    misses.set(a.id, a.ok ? 0 : (misses.get(a.id) ?? 0) + 1);
  }
  return false;
}

/** The category whose share of `done` items is highest (fewest missing on a tie), as progress. */
function nearest(items: Item[], done: (it: Item) => boolean): Progress {
  const by = new Map<string, { have: number; need: number }>();
  for (const it of items) {
    const c = by.get(it.category) ?? { have: 0, need: 0 };
    c.need++;
    if (done(it)) c.have++;
    by.set(it.category, c);
  }
  let best: Progress = count(0, 1);
  for (const [category, c] of by) {
    const share = c.have / c.need;
    const was = best.have / best.need;
    if (share > was || (share === was && c.need - c.have < best.need - best.have)) best = count(c.have, c.need, category);
  }
  return best;
}

/** This player's runs alone and together that keep where their lives went (the latest list and the bests). */
function runsOf(delve: DelveRecords): DelveRun[] {
  const seen = new Set<string>();
  const out: DelveRun[] = [];
  for (const run of [...delve.runs, ...Object.values(delve.bests)]) {
    const key = `${run.id}:${run.who ?? ''}`;
    if (seen.has(key) || run.mixed) continue;
    seen.add(key);
    out.push(run);
  }
  return out;
}

/** Whether a run alone fell at exactly the depth of its best before it (the best's climb, under its ruleset). */
function tiedBest(delve: DelveRecords, run: DelveRun): boolean {
  if (isTogether(run) || run.left || shownDepth(run.depth) < DEPTH_GRAVE) return false;
  const before = (delve.climbs[`${run.ruleset}:solo`] ?? []).filter((c) => c.at < run.at).at(-1);
  return before?.depth === run.depth;
}

/**
 * The deepest depth this player stood at in a run together: where they last
 * perished, or for a run left on their feet (every fall answered by a life
 * given back), the depth it was left at.
 */
function stoodAt(r: DelveRun): number {
  const fell = r.perished?.at(-1) ?? 0;
  return r.left && (r.perished?.length ?? 0) === (r.revived ?? 0) ? r.depth : fell;
}

/** Everything the kept achievements read. `items`: the game's item list now; `wins`: the games against others won in a row. */
export function summarize(codex: Codex, delve: DelveRecords, items: Item[], wins: WinRun = emptyWins()): Summary {
  const { best, now, fast } = streaks(codex.log);
  const right = (id: string) => {
    const e = codex.items[id];
    return !!e && e.name.ok + e.art.ok > 0;
  };
  const both = (id: string) => {
    const e = codex.items[id];
    return !!e && e.name.ok > 0 && e.art.ok > 0;
  };
  const known = items.filter((it) => right(it.id)).length;

  const runs = runsOf(delve);
  const alone = runs.filter((r) => !isTogether(r));
  const together = runs.filter(isTogether);
  // A run alone is recorded where it fell or was left; either way it got that deep.
  const deepestAlone = Math.max(0, ...alone.map((r) => shownDepth(r.depth)));
  let thread = 0;
  let untouched = 0;
  for (const r of alone) {
    if (!r.losses) continue;
    // The last depth survived: before the fall, or before the depth it was left on.
    const survived = r.depth - 1;
    if (r.losses.length >= 2) thread = Math.max(thread, shownDepth(survived) - Math.max(shownDepth(r.losses[1]), THREAD_FROM));
    untouched = Math.max(untouched, shownDepth(r.losses.length ? r.losses[0] : r.depth));
  }
  // A ward that broke on the last life: a wrong answer that cost none, in a run alone that had lost two before it.
  const byId = new Map(alone.map((r) => [`${r.id}:${r.who ?? ''}`, r]));
  const savingGrace = codex.log.some((a) => {
    if (a.ok || a.team || a.depth === undefined || a.run === undefined || answerLives(a) > 0 || answerWards(a) === 0) return false;
    const r = byId.get(`${a.run}:${a.who ?? ''}`);
    return !!r?.losses && r.losses.filter((d) => d < a.depth!).length === 2;
  });

  return {
    streak: best,
    streakNow: now,
    fast,
    revenge: revenged(codex.log),
    twofold: nearest(items, (it) => both(it.id)),
    known: count(known, items.length),
    fooled: Math.max(0, ...Object.values(codex.fooled).map((f) => f.n)),
    deepestAlone,
    thread: Math.max(0, thread),
    untouched,
    savingGrace,
    grave: alone.some((r) => tiedBest(delve, r)),
    given: Math.max(0, ...together.map((r) => r.given ?? 0)),
    deepCompany: Math.max(0, ...together.map((r) => shownDepth(stoodAt(r)))),
    deepTeam: Math.max(0, ...together.map((r) => shownDepth(r.depth))),
    revived: Math.max(0, ...together.map((r) => r.revived ?? 0)),
    wins: wins.best,
    winsNow: wins.now,
  };
}

/** The ones the summary earns: those whose progress is done, and the moments the records keep. */
export function earnedFrom(s: Summary): string[] {
  const ids = ACHIEVEMENTS.filter((a) => a.progress && isDone(a.progress(s))).map((a) => a.id);
  if (s.revenge) ids.push('sweet-revenge');
  if (s.savingGrace) ids.push('saving-grace');
  if (s.grave) ids.push('familiar-grave');
  return ids;
}

/** Each achievement with its progress and when it was earned (null: not yet), in the list's order. */
export function standings(s: Summary, store: AchievementStore) {
  return ACHIEVEMENTS.map((a) => ({ achievement: a, progress: a.progress?.(s) ?? null, earned: store.earned[a.id] ?? null }));
}

// ---- moments in a run of Delve ------------------------------------------------

/** Whose run this device's player is in: online its seat; on one device its one player. */
function selfIn(s: GameState, me: string | null, hotSeat: boolean): string | null {
  if (!s.delve || s.phase === 'lobby') return null;
  if (hotSeat) return s.players.length === 1 ? s.players[0].id : null;
  return me && s.players.some((p) => p.id === me) ? me : null;
}

/** The reveal this change brings in (a question that wasn't revealing before), or null. */
function newReveal(prev: GameState | null, next: GameState) {
  if (next.phase !== 'reveal' || !next.reveal || !next.question) return null;
  if (prev?.phase === 'reveal' && prev.question?.askedAt === next.question.askedAt) return null;
  return next.reveal;
}

/**
 * The achievements a state change of a Delve run earns this device's player,
 * as it sees them happen. Each reads only what the state holds (a guest's copy
 * has all of it), so a reload or a rejoin at that point earns them the same;
 * earning one twice does nothing.
 */
export function momentsIn(prev: GameState | null, next: GameState, me: string | null, hotSeat: boolean): string[] {
  const d = next.delve;
  const self = selfIn(next, me, hotSeat);
  if (!d || !self || d.mixed) return [];
  const out: string[] = [];
  const losses = d.losses[self] ?? [];
  const lives = livesOf(next, self);
  const r = newReveal(prev, next);
  const playing = next.phase === 'choosing' || next.phase === 'question';

  // A Dynamite Cache's blast that took a stick of dynamite: alone the reveal's, together this player's own hit.
  const blown = isGroupRun(next) ? r?.hits?.find((h) => h.playerId === self)?.blown : r?.blown;
  if (blown === 'dynamite') out.push('chain-reaction');

  if (!isGroupRun(next)) {
    const depth = shownDepth(next.round);
    if (depth >= 10) out.push('depth-10');
    if (depth >= 50) out.push('depth-50');
    if (depth >= 100) out.push('depth-100');
    // Standing at the depth with every life (a loss at it still reached it).
    if (shownDepth(losses.length ? losses[0] : next.round) >= UNTOUCHED) out.push('untouched');
    if (r && lives === 1 && losses.length === 2 && depth - Math.max(shownDepth(losses[1]), THREAD_FROM) >= THREAD) out.push('by-a-thread');
    if (r && !r.correct && lives === 1) {
      const lost = r.lost ? r.lost.lives : r.warded ? 0 : 1;
      const broke = r.lost ? r.lost.wards : r.warded ? 1 : 0;
      if (lost === 0 && broke > 0) out.push('saving-grace');
    }
    const pack = inventoryOf(next, self);
    if (pack.wards >= DELVE_MAX_WARDS && pack.flares >= DELVE_MAX_FLARES && pack.dynamite >= DELVE_MAX_DYNAMITE) out.push('fully-laden');
    return out;
  }

  // ---- together ----
  const others = next.players.filter((p) => p.id !== self);
  const standing = standingIds(next);
  const revives = d.revives ?? [];
  if (revives.filter((v) => v.by === self).length >= 2) out.push('selfless');
  if (revives.filter((v) => v.to === self).length >= DEAD_WEIGHT) out.push('dead-weight');
  const depth = shownDepth(next.round);
  if (depth >= ROPED_DEPTH) out.push('roped-together');
  if (playing && depth >= COMPANY_DEPTH && lives > 0) out.push('deep-company');
  const whole = d.entrants.every((id) => next.players.some((p) => p.id === id));
  if (playing && whole && !revives.length && standing.length === next.players.length) {
    if (depth >= ALL_DEPTH) out.push('nobody-left');
    if (depth >= CIRCLE_DEPTH) out.push('unbroken-circle');
  }
  if (r) {
    const hit = r.hits?.find((h) => h.playerId === self);
    if (hit && hit.lives === 0 && hit.wards > 0 && lives === 1) out.push('saving-grace');
    const q = next.question!;
    // Cleared it after every other teammate standing struck an option, with options to spare.
    const strikers = new Set((q.struck ?? []).map((x) => x.by).filter((id) => others.some((p) => p.id === id)));
    const gone = new Set([...(q.struck ?? []).map((x) => x.index), ...(q.blownAway ?? [])]);
    if (
      r.winnerId === self &&
      strikers.size >= 2 &&
      standing.every((id) => id === self || strikers.has(id)) &&
      q.labels.length - gone.size >= OPEN_OPTIONS
    )
      out.push('elimination');
    // The whole team at once, nobody walking away on their feet at this depth.
    const fell = next.players.filter((p) => fellAt(next, p.id) === next.round).map((p) => p.id);
    if (r.winnerId === null && !standing.length && depth >= FALL_DEPTH && (d.leftAt ?? 0) < next.round && fell.length >= FALL_MANY && fell.includes(self))
      out.push('fell-as-one');
    // The last one standing, clean for LONE depths past the last of the others to fall or leave (and past
    // LONE_FROM). Who left is known only from a host that keeps where they fell (Delve.fellLeft).
    const known = whole || d.leftAt !== undefined || d.fellLeft !== undefined;
    if (known && standing.length === 1 && standing[0] === self) {
      const since = Math.max(LONE_FROM, ...[d.leftAt ?? 0, d.fellLeft ?? 0, ...others.map((p) => fellAt(next, p.id) ?? 0)].map(shownDepth));
      if (depth - since >= LONE && !losses.some((x) => shownDepth(x) > since) && r.winnerId === self) out.push('lone-wolf');
    }
  }
  return out;
}

// ---- games against others -------------------------------------------------------

/** The game against others in play, as this device has followed it. */
export interface VersusTrack {
  /** Which game: its start on the host's clock. */
  game: number;
  /** The largest lead each rival has had over this player, by id. */
  lead: Record<string, number>;
  /** The largest lead this player has had over each rival, by id (missing in trackers from before it). */
  ahead: Record<string, number>;
  /**
   * Followed from the game's first question: only then does `wrong` speak for
   * the whole game (a tab opened mid-game never saw the answers before it).
   */
  whole: boolean;
  /** This player's own answers seen revealed, and whether any was wrong (or ran out of time). */
  answered: number;
  wrong: boolean;
  /** Race: rivals seen guessing (taking a question, or missing one). */
  guessed: string[];
  /** Race: questions this player took before a quarter of their veiled art had burned in. */
  veiled: number;
  /** The question last counted (its askedAt), so none counts twice. */
  last: number;
}

/** A game against others: online, this player seated, someone else seated, not Delve. */
function versusGame(s: GameState, me: string | null, hotSeat: boolean): s is GameState & { startedAt: number } {
  return !hotSeat && !!me && !s.delve && !!s.startedAt && s.players.length >= 2 && s.players.some((p) => p.id === me);
}

/**
 * Whether a game is seen from its first question: its start came in with this
 * change (the state before was the lobby, or another game), or it stands at
 * its first question with nothing answered yet.
 */
function seenFromStart(prev: GameState | null, next: GameState & { startedAt: number }): boolean {
  if (prev && prev.startedAt !== next.startedAt) return true;
  return next.turnCount === 0 && !next.reveal && next.players.every((p) => p.score === 0) && !next.question?.misses.length;
}

/**
 * The tracker after a state change of a game against others (the same object
 * when nothing changed; null outside one). `veilShare`: the share of this
 * player's veiled art that had burned in when they answered the question just
 * revealed, if they did.
 */
export function trackVersus(
  track: VersusTrack | null,
  prev: GameState | null,
  next: GameState,
  me: string | null,
  hotSeat: boolean,
  veilShare?: { qid: number; share: number },
): VersusTrack | null {
  if (!versusGame(next, me, hotSeat) || next.phase === 'lobby') return track && track.game === next.startedAt ? track : null;
  let t: VersusTrack =
    track?.game === next.startedAt
      ? track
      : { game: next.startedAt, whole: seenFromStart(prev, next), lead: {}, ahead: {}, answered: 0, wrong: false, guessed: [], veiled: 0, last: 0 };
  const race = next.settings.mode === 'race';
  const r = newReveal(prev, next);
  const changed = () => (t === track ? (t = { ...t, lead: { ...t.lead }, ahead: { ...t.ahead }, guessed: [...t.guessed] }) : t);
  // Leads: at each round's end in turns (the scores mid-round only say who went first), at each reveal in a race.
  const sample = race ? !!r : prev?.startedAt === next.startedAt && prev.round < next.round && next.phase === 'choosing' && !next.deathmatch;
  if (sample) {
    const mine = next.players.find((p) => p.id === me)?.score ?? 0;
    for (const p of next.players) {
      if (p.id === me) continue;
      const lead = p.score - mine;
      if (lead > (t.lead[p.id] ?? 0)) changed().lead[p.id] = lead;
      if (-lead > (t.ahead[p.id] ?? 0)) changed().ahead[p.id] = -lead;
    }
  }
  const q = next.question;
  if (r && q && q.askedAt !== t.last) {
    changed().last = q.askedAt;
    // This player's own answer, as the codex counts it (lib/codex.ts encounterAt).
    const missed = q.misses.some((m) => m.playerId === me);
    const own = race ? r.winnerId === me || missed : next.players[next.turn]?.id === me;
    if (own) {
      t.answered++;
      if (race ? missed : !r.correct) t.wrong = true;
    }
    if (race) {
      for (const id of [r.winnerId, ...q.misses.map((m) => m.playerId)])
        if (id && id !== me && !t.guessed.includes(id)) t.guessed.push(id);
      const share = veilShare?.qid === q.askedAt ? veilShare.share : null;
      if (r.winnerId === me && q.veil && share !== null && share < VEIL_SHARE && q.options.length >= VEIL_OPTIONS) t.veiled++;
    }
  }
  return t;
}

/** How a game against others went, won or lost, from the state it ended on; null for a game that doesn't count (see versusGame) or isn't over. */
export function versusOutcome(s: GameState, me: string | null, hotSeat: boolean): Outcome | null {
  if (s.phase !== 'over' || !versusGame(s, me, hotSeat)) return null;
  if (s.settings.targetScore < TARGET_MIN || !s.players.some((p) => p.id !== me && p.connected)) return null;
  return s.winners.includes(me!) ? 'won' : 'lost';
}

export type Outcome = 'won' | 'lost';

/**
 * How a game against others that ended on `s` went for this device's player,
 * and what that earned (see versusOutcome for which games count). `track`:
 * the game as this device followed it.
 */
export function versusEnd(s: GameState, me: string | null, hotSeat: boolean, track: VersusTrack | null): { outcome: Outcome | null; earned: string[] } {
  const outcome = versusOutcome(s, me, hotSeat);
  if (!outcome) return { outcome, earned: [] };
  const t = track?.game === s.startedAt ? track : null;
  // Lost after leading the winner.
  if (outcome === 'lost') return { outcome, earned: t && s.winners.some((id) => (t.ahead[id] ?? 0) >= COMEBACK) ? ['hubris'] : [] };
  const there = s.players.filter((p) => p.id !== me && p.connected);
  const race = s.settings.mode === 'race';
  const flawless = !!t && t.whole && t.answered > 0 && !t.wrong;
  const out: string[] = ['first-victory'];
  const dm = s.deathmatch;
  if (dm && dm.results[me!] === true && dm.eliminated.some((id) => dm.results[id] === false)) out.push('deathmatch');
  if (t && there.some((p) => (t.lead[p.id] ?? 0) >= COMEBACK && !s.winners.includes(p.id))) out.push('tide-turner');
  if (s.settings.targetScore >= TARGET_HIGH && flawless) out.push('untarnished');
  const score = s.players.find((p) => p.id === me)?.score ?? 0;
  if (race && s.settings.targetScore >= TARGET_HIGH && score === s.round && t && there.every((p) => t.guessed.includes(p.id))) out.push('clean-sweep');
  if (there.some((p) => isHeldName(p.name) && !s.winners.includes(p.id))) out.push('usurper');
  if (race && flawless && (t?.veiled ?? 0) >= VEIL_TAKES) out.push('through-the-veil');
  return { outcome, earned: out };
}

// ---- reading a stored list --------------------------------------------------------

export interface AchievementStore {
  /** When each was earned (this browser's clock), by id. Ids this build doesn't know (a newer one's) are kept. */
  earned: Record<string, number>;
}

export const emptyStore = (): AchievementStore => ({ earned: {} });

const NAME = 'achievements';
/** The whole key, as storage events name it. */
export const ACHIEVEMENTS_KEY = storeKey(NAME);
/**
 * Where the wins in a row are kept: apart from the list, so a build from
 * before them, writing the list, leaves them be.
 */
const WINS = 'achievements.wins';
export const WINS_KEY = storeKey(WINS);
/** Bump when the stored shape changes incompatibly. */
export const ACHIEVEMENTS_VERSION = 1;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** A stored tracker, cleaned up; null when it's missing or malformed. */
export function parseTrack(raw: string | null): VersusTrack | null {
  let v: unknown;
  try {
    v = JSON.parse(raw ?? 'null');
  } catch {
    return null;
  }
  if (!isObj(v) || typeof v.game !== 'number' || !Number.isFinite(v.game)) return null;
  const leads = (o: unknown) => {
    const out: Record<string, number> = {};
    if (isObj(o)) for (const [id, n] of Object.entries(o)) if (id.length <= 64 && whole(n)) out[id] = whole(n);
    return out;
  };
  const guessed = Array.isArray(v.guessed) ? v.guessed.filter((id): id is string => typeof id === 'string' && id.length <= 64).slice(0, 64) : [];
  const last = typeof v.last === 'number' && Number.isFinite(v.last) ? v.last : 0;
  return { game: v.game, whole: v.whole === true, lead: leads(v.lead), ahead: leads(v.ahead), answered: whole(v.answered), wrong: v.wrong === true, guessed, veiled: whole(v.veiled), last };
}

/** A stored list, cleaned up; null when it's missing, malformed or from another version. */
export function parseStore(raw: string | null): AchievementStore | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || v.v !== ACHIEVEMENTS_VERSION || !isObj(v.earned)) return null;
  const s = emptyStore();
  for (const [id, at] of Object.entries(v.earned)) if (id.length <= 64 && typeof at === 'number' && Number.isFinite(at)) s.earned[id] = at;
  return s;
}

export const serializeStore = (s: AchievementStore) => JSON.stringify({ v: ACHIEVEMENTS_VERSION, ...s });

/**
 * Games against others won in a row (only those versusOutcome counts): now,
 * at best, and the last one counted (its start), so none counts twice.
 * Stored apart from the list, at a version of its own (WINS_VERSION).
 */
export interface WinRun {
  now: number;
  best: number;
  last: number;
}

export const emptyWins = (): WinRun => ({ now: 0, best: 0, last: 0 });

/** Bump when the stored wins' shape changes incompatibly. */
export const WINS_VERSION = 1;

export const serializeWins = (w: WinRun) => JSON.stringify({ v: WINS_VERSION, ...w });

/** A stored run of wins, cleaned up; empty when it's missing, malformed or from another version. */
export function parseWins(raw: string | null): WinRun {
  let v: unknown;
  try {
    v = JSON.parse(raw ?? 'null');
  } catch {
    return emptyWins();
  }
  if (!isObj(v) || v.v !== WINS_VERSION) return emptyWins();
  const now = whole(v.now);
  return { now, best: Math.max(now, whole(v.best)), last: typeof v.last === 'number' && Number.isFinite(v.last) ? v.last : 0 };
}

/** The run after a game that `outcome` went, started at `game`. */
export function nextWins(w: WinRun, outcome: Outcome, game: number): WinRun {
  if (game === w.last) return w;
  const now = outcome === 'won' ? w.now + 1 : 0;
  return { now, best: Math.max(w.best, now), last: game };
}

// ---- storage -------------------------------------------------------------------

/** The stored list (empty when there is none, or it can't be read). Always read fresh: another tab may have added to it. */
export function loadAchievements(): AchievementStore {
  return parseStore(tryReadStored(NAME) ?? null) ?? emptyStore();
}

/** The games against others won in a row, as stored. */
export function loadWins(): WinRun {
  return parseWins(tryReadStored(WINS) ?? null);
}

/**
 * Counts a game against others that ended `outcome` into the wins in a row,
 * and says where they stand now; null when they can't be written: storage
 * blocked, or a newer build's wins, which are never written over. Anything
 * else unreadable starts over.
 */
function countGame(outcome: Outcome, game: number): WinRun | null {
  const raw = tryReadStored(WINS);
  if (raw === undefined || (raw !== null && newerThan(raw, WINS_VERSION))) return null;
  const wins = nextWins(parseWins(raw), outcome, game);
  return writeStored(WINS, serializeWins(wins)) ? wins : null;
}

export interface Check {
  /** Earned by this check. */
  earned: Achievement[];
  /** There was no list before it: what it earned was earned before, in games from before achievements. */
  first: boolean;
}

const none = (): Check => ({ earned: [], first: false });

/**
 * The stored list, ready to change: null when it can't be (storage blocked,
 * or a newer build's list, which is never written over), and anything else
 * unreadable kept aside first (lib/keepAside.ts).
 */
function open(): { store: AchievementStore; first: boolean } | null {
  const raw = tryReadStored(NAME);
  if (raw === undefined) return null;
  const stored = parsed(raw);
  if (raw && !stored && !makeRoom(NAME, raw, ACHIEVEMENTS_VERSION)) return null;
  return { store: stored ?? emptyStore(), first: !stored };
}

/**
 * The last list read, so a run that keeps re-earning what it already has
 * (every state change past depth 10 earns depth 10 again) parses it once,
 * not on every change.
 */
let lastRead: { raw: string | null; store: AchievementStore | null } | null = null;
function parsed(raw: string | null): AchievementStore | null {
  if (lastRead?.raw !== raw) lastRead = { raw, store: parseStore(raw) };
  return lastRead.store;
}

/** Writes `store` with `ids` earned now (those it didn't have yet), and says which those were. */
function earn(store: AchievementStore, first: boolean, ids: string[]): Check {
  const fresh = [...new Set(ids)].filter((id) => store.earned[id] === undefined && achievementById.has(id));
  if (!fresh.length && !first) return none();
  const now = Date.now();
  const next: AchievementStore = { ...store, earned: { ...store.earned } };
  for (const id of fresh) next.earned[id] = now;
  const raw = serializeStore(next);
  if (!writeStored(NAME, raw)) return none();
  lastRead = { raw, store: next };
  return { earned: fresh.map((id) => achievementById.get(id)!), first };
}

/**
 * Brings the stored list up to date with the codex and the Delve records,
 * with `moments` (ids a state change earned) on top, and says what that earned.
 */
export function checkAchievements(items: Item[], moments: string[] = []): Check {
  const o = open();
  if (!o) return none();
  const s = summarize(loadCodex(), loadRecords(), items, loadWins());
  return earn(o.store, o.first, [...earnedFrom(s), ...moments]);
}

/**
 * The game against others this tab is in, as it has followed it: in this
 * tab's session storage, so a reload keeps it and a game in another tab
 * never touches it.
 */
const TRACK = 'achievements.versus';

/**
 * A state change of a room or a run as this device saw it: follows a game
 * against others, and says what its moments earned (written already).
 * Announced, unless there is no list yet: then the first check is made here,
 * quietly, with them (see checkAchievements).
 */
export function noteState(
  prev: GameState | null,
  next: GameState,
  me: string | null,
  hotSeat: boolean,
  { items = [], veilShare }: { items?: Item[]; veilShare?: { qid: number; share: number } } = {},
): Check {
  const delve = momentsIn(prev, next, me, hotSeat);
  const ended: string[] = [];
  if (versusGame(next, me, hotSeat) && next.phase !== 'lobby') {
    const was = parseTrack(readStored(TRACK, 'session'));
    const track = trackVersus(was, prev, next, me, hotSeat, veilShare);
    if (next.phase === 'over') {
      // Judged once: the first time the game this tab followed is seen over, its tracker still
      // kept (after a reload in its last moments too), which is then let go.
      if (was?.game === next.startedAt) {
        const end = versusEnd(next, me, hotSeat, track);
        ended.push(...end.earned);
        const wins = end.outcome && countGame(end.outcome, next.startedAt);
        if (wins && wins.now >= WIN_RUN) ended.push('undefeated');
      }
      removeStored(TRACK, 'session');
    } else if (track && track !== was) writeStored(TRACK, JSON.stringify(track), 'session');
  }
  const ids = [...delve, ...ended];
  if (!ids.length) return none();
  const o = open();
  if (!o) return none();
  // No list yet: these join the quiet first catch-up with the codex and the
  // records (`items`, the game's), which the start page tells, rather than
  // starting the list loudly and leaving the catch-up to be announced as new.
  if (o.first) return checkAchievements(items, ids);
  return earn(o.store, false, ids);
}

/**
 * Erases them with the codex. An empty list is left in their place, so the
 * next one earned is announced (the first check after none at all is quiet).
 */
export function resetAchievements() {
  // A newer build's are never written over, erased or not.
  const raw = tryReadStored(NAME);
  if (!raw || !newerThan(raw, ACHIEVEMENTS_VERSION)) writeStored(NAME, serializeStore(emptyStore()));
  const wins = tryReadStored(WINS);
  if (wins && !newerThan(wins, WINS_VERSION)) removeStored(WINS);
  clearAside(NAME);
}
