// Achievements: feats this browser's player has earned, kept in localStorage
// like the codex and never sent anywhere.
//
// Most are read straight off what the game keeps already: the codex
// (lib/codex.ts: items seen, answers, streaks, times, made-up names, Delve
// answers) and the Delve records (lib/delveRecord.ts: runs, depths, lives
// given and brought back). So a codex from before achievements existed earns
// its share the first time they are checked; that first time is quiet (no
// notice for each one, see primeAchievements). The one thing neither keeps is
// how games against other players ended, so those are tallied here, once per
// game (`counted`).
//
// Games against others only count online, in a seat, with someone else
// seated: on one device the game can't tell its players apart, as with the
// codex's answers. Whether a win was flawless, or came back from below zero,
// is read from this game's answers in the codex log (those since the game's
// start, GameState.startedAt; a host too old to send it gives neither).
//
// An achievement once earned stays earned: more items coming into the game
// later, or the codex log's oldest answers making way for new ones, never
// take one back. Erasing the codex erases them too (resetAchievements).

import { loadCodex, type Answer, type Codex } from './codex.ts';
import { loadRecords, type DelveRecords } from './delveRecord.ts';
import type { GameState, Item } from './game.ts';
import { clearAside, makeRoom } from './keepAside.ts';
import { isHeldName } from './names.ts';
import { storeKey, tryReadStored, writeStored } from './storage.ts';

/** The pages of the list. */
export type AchievementGroup = 'collection' | 'knowledge' | 'versus' | 'delve';

export const GROUPS: { key: AchievementGroup; title: string; blurb: string }[] = [
  { key: 'collection', title: 'Collection', blurb: 'Items you have discovered.' },
  { key: 'knowledge', title: 'Knowledge', blurb: 'Questions you have answered, in any mode.' },
  { key: 'versus', title: 'Versus', blurb: 'Games won against other players online.' },
  { key: 'delve', title: 'Delve', blurb: 'Runs into the dark, alone and together.' },
];

/** The sign engraved on an achievement's seal (lib/alchemy.ts draws them). */
export type Sign =
  | 'sol'
  | 'luna'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'fire'
  | 'water'
  | 'air'
  | 'earth'
  | 'salt'
  | 'sulphur'
  | 'antimony'
  | 'arsenic'
  | 'cross';

export interface Progress {
  /** How far along (may run past `need`). */
  have: number;
  /** What it takes. */
  need: number;
  /** A word on where it stands ("closest: Rings"), if any. */
  note?: string;
}

export interface Achievement {
  id: string;
  group: AchievementGroup;
  title: string;
  /** What earns it. */
  text: string;
  /** How hard it is: the seal's metal, copper, silver or gold. */
  tier: 1 | 2 | 3;
  sign: Sign;
  /** Shown as a blank seal until earned. */
  secret?: true;
  progress: (s: Summary) => Progress;
}

/** How games against other players have ended for this player. */
export interface GameTally {
  /** Played to the end, online, in a seat, with others seated. */
  played: number;
  won: number;
  /** Of the wins: races, deathmatches, without a wrong answer, in a race from below zero, on Eternal, against four or more. */
  race: number;
  duel: number;
  flawless: number;
  comeback: number;
  eternal: number;
  crowd: number;
  /** Games (a Delve run together too) played to the end with the creator seated. */
  creator: number;
}

export interface AchievementStore {
  /** When each was earned (this browser's clock), by id. Ids this build doesn't know (a newer one's) are kept. */
  earned: Record<string, number>;
  games: GameTally;
  /** The ids of the last games tallied (their start on the host's clock), so none counts twice. */
  counted: number[];
}

/** Everything the achievements look at, worked out once from the codex, the Delve records and the tally. */
export interface Summary {
  /** Items of the game's list discovered, of how many. */
  seen: number;
  total: number;
  /** The category nearest to all discovered, and to all answered right at least once. */
  catSeen: Progress;
  catKnown: Progress;
  /** Right answers: all of them, "find the art" ones, and on Eternal. */
  right: number;
  artRight: number;
  eternalRight: number;
  /** Best run of right answers in a row. */
  best: number;
  /** Quickest right answer (ms), or null. */
  fastest: number | null;
  /** An item answered right after three wrong answers to it (in the log). */
  nemesis: boolean;
  /** Made-up names fallen for. */
  fooled: number;
  games: GameTally;
  /** Deepest counted run alone and together (the team's depth), under any rules. */
  deepestAlone: number;
  deepestTogether: number;
  /** Counted runs (ended, under the rules they started with). */
  runs: number;
  runsTogether: number;
  /** Together: lives given to teammates, times brought back. */
  given: number;
  revived: number;
  /** Azurite Wards that broke in place of a life. */
  warded: number;
  /** Answers given by a flare's light, with dynamite gone off, and missed on an Azurite Vein. */
  flares: number;
  blasts: number;
  caveIns: number;
  /** The most depths cleared from the top of a run before losing a life. */
  clean: number;
}

const count = (have: number, need: number, note?: string): Progress => ({ have, need, ...(note ? { note } : {}) });
const yes = (done: boolean, note?: string) => count(done ? 1 : 0, 1, note);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Fastest right answer that earns Quicksilver. */
export const QUICK_MS = 1500;
/** Depths cleared without losing a life for Unscathed. */
export const CLEAN_DEPTHS = 20;
/** Players in a game (you and four or more) for Warlord. */
export const CROWD = 5;
/** Wrong answers to an item before a right one slays it as a nemesis. */
export const NEMESIS_WRONG = 3;

export const ACHIEVEMENTS: Achievement[] = [
  // ---- collection ----
  { id: 'discover-1', group: 'collection', tier: 1, sign: 'salt', title: 'Scroll of Wisdom', text: 'Discover your first item.', progress: (s) => count(s.seen, 1) },
  { id: 'discover-100', group: 'collection', tier: 1, sign: 'jupiter', title: 'Collector', text: 'Discover 100 items.', progress: (s) => count(s.seen, 100) },
  { id: 'discover-250', group: 'collection', tier: 2, sign: 'jupiter', title: 'Curator', text: 'Discover 250 items.', progress: (s) => count(s.seen, 250) },
  { id: 'discover-all', group: 'collection', tier: 3, sign: 'sol', title: 'The Complete Codex', text: 'Discover every item.', progress: (s) => count(s.seen, s.total) },
  { id: 'category-seen', group: 'collection', tier: 2, sign: 'air', title: 'Cartographer', text: 'Discover every item of one category.', progress: (s) => s.catSeen },
  {
    id: 'category-known',
    group: 'collection',
    tier: 3,
    sign: 'sulphur',
    title: 'Specialist',
    text: 'Get every item of one category right at least once.',
    progress: (s) => s.catKnown,
  },

  // ---- knowledge ----
  { id: 'right-25', group: 'knowledge', tier: 1, sign: 'antimony', title: 'Initiate', text: 'Answer 25 questions right.', progress: (s) => count(s.right, 25) },
  { id: 'right-250', group: 'knowledge', tier: 2, sign: 'antimony', title: 'Scholar', text: 'Answer 250 questions right.', progress: (s) => count(s.right, 250) },
  { id: 'right-1000', group: 'knowledge', tier: 3, sign: 'antimony', title: 'Loremaster', text: 'Answer 1000 questions right.', progress: (s) => count(s.right, 1000) },
  { id: 'streak-5', group: 'knowledge', tier: 1, sign: 'mars', title: 'Onslaught', text: 'Answer 5 questions right in a row.', progress: (s) => count(s.best, 5) },
  { id: 'streak-15', group: 'knowledge', tier: 2, sign: 'mars', title: 'Frenzy', text: 'Answer 15 questions right in a row.', progress: (s) => count(s.best, 15) },
  { id: 'streak-40', group: 'knowledge', tier: 3, sign: 'mars', title: 'Unbroken', text: 'Answer 40 questions right in a row.', progress: (s) => count(s.best, 40) },
  {
    id: 'quick',
    group: 'knowledge',
    tier: 2,
    sign: 'mercury',
    title: 'Quicksilver',
    text: `Answer right within ${QUICK_MS / 1000} seconds of seeing the art.`,
    progress: (s) => yes(s.fastest !== null && s.fastest <= QUICK_MS, s.fastest === null ? undefined : `your fastest: ${secs(s.fastest)}`),
  },
  { id: 'find-art-50', group: 'knowledge', tier: 2, sign: 'luna', title: 'Keen Eye', text: 'Find the right art for 50 names.', progress: (s) => count(s.artRight, 50) },
  { id: 'eternal-100', group: 'knowledge', tier: 3, sign: 'saturn', title: 'Eternal Scholar', text: 'Answer 100 questions right on Eternal.', progress: (s) => count(s.eternalRight, 100) },
  {
    id: 'nemesis',
    group: 'knowledge',
    tier: 2,
    sign: 'cross',
    title: 'Nemesis Slain',
    text: `Get an item right after getting it wrong ${NEMESIS_WRONG} times.`,
    progress: (s) => yes(s.nemesis),
  },
  { id: 'fooled', group: 'knowledge', tier: 1, sign: 'water', secret: true, title: "Fool's Gold", text: 'Fall for a made-up name.', progress: (s) => count(s.fooled, 1) },

  // ---- versus ----
  { id: 'win-1', group: 'versus', tier: 1, sign: 'sol', title: 'Victor', text: 'Win a game against other players.', progress: (s) => count(s.games.won, 1) },
  { id: 'win-10', group: 'versus', tier: 2, sign: 'sol', title: 'Champion', text: 'Win 10 games against other players.', progress: (s) => count(s.games.won, 10) },
  { id: 'win-race', group: 'versus', tier: 1, sign: 'mercury', title: 'Quickdraw', text: 'Win a race.', progress: (s) => count(s.games.race, 1) },
  { id: 'win-duel', group: 'versus', tier: 2, sign: 'arsenic', title: 'Last One Standing', text: 'Win a deathmatch.', progress: (s) => count(s.games.duel, 1) },
  { id: 'flawless', group: 'versus', tier: 3, sign: 'water', title: 'Flawless', text: 'Win a game without a single wrong answer.', progress: (s) => count(s.games.flawless, 1) },
  { id: 'comeback', group: 'versus', tier: 2, sign: 'fire', title: 'Back from the Brink', text: 'Win a race after your score fell below zero.', progress: (s) => count(s.games.comeback, 1) },
  { id: 'win-eternal', group: 'versus', tier: 3, sign: 'saturn', title: 'Eternal Glory', text: 'Win a game on Eternal.', progress: (s) => count(s.games.eternal, 1) },
  { id: 'warlord', group: 'versus', tier: 2, sign: 'jupiter', title: 'Warlord', text: `Win a game against ${CROWD - 1} or more players.`, progress: (s) => count(s.games.crowd, 1) },
  { id: 'creator', group: 'versus', tier: 1, sign: 'venus', secret: true, title: 'An Audience', text: 'Play a game to its end with the creator of PoE2.Quest.', progress: (s) => count(s.games.creator, 1) },

  // ---- delve ----
  { id: 'delve-1', group: 'delve', tier: 1, sign: 'earth', title: 'Into the Dark', text: 'Finish a Delve run.', progress: (s) => count(s.runs, 1) },
  { id: 'depth-10', group: 'delve', tier: 1, sign: 'earth', title: 'Delver', text: 'Reach depth 10 in a run alone.', progress: (s) => count(s.deepestAlone, 10) },
  { id: 'depth-25', group: 'delve', tier: 2, sign: 'earth', title: 'Deep Delver', text: 'Reach depth 25 in a run alone.', progress: (s) => count(s.deepestAlone, 25) },
  { id: 'depth-50', group: 'delve', tier: 3, sign: 'earth', title: 'Delve Master', text: 'Reach depth 50 in a run alone.', progress: (s) => count(s.deepestAlone, 50) },
  { id: 'depth-100', group: 'delve', tier: 3, sign: 'sol', title: 'Endless Delver', text: 'Reach depth 100 in a run alone.', progress: (s) => count(s.deepestAlone, 100) },
  {
    id: 'clean',
    group: 'delve',
    tier: 3,
    sign: 'salt',
    title: 'Unscathed',
    text: `Clear the first ${CLEAN_DEPTHS} depths of a run without losing a life.`,
    progress: (s) => count(s.clean, CLEAN_DEPTHS),
  },
  { id: 'runs-25', group: 'delve', tier: 2, sign: 'antimony', title: 'Seasoned Delver', text: 'Finish 25 Delve runs.', progress: (s) => count(s.runs, 25) },
  { id: 'together-1', group: 'delve', tier: 1, sign: 'venus', title: 'Fellowship', text: 'Finish a Delve run together.', progress: (s) => count(s.runsTogether, 1) },
  { id: 'together-25', group: 'delve', tier: 2, sign: 'venus', title: 'Roped Together', text: 'Reach depth 25 in a run together.', progress: (s) => count(s.deepestTogether, 25) },
  { id: 'lifeline', group: 'delve', tier: 1, sign: 'cross', title: 'Lifeline', text: 'Give a teammate one of your lives.', progress: (s) => count(s.given, 1) },
  { id: 'revived', group: 'delve', tier: 1, sign: 'luna', title: 'Second Wind', text: 'Be brought back by a teammate.', progress: (s) => count(s.revived, 1) },
  { id: 'warded', group: 'delve', tier: 1, sign: 'salt', title: 'Warded', text: 'Have an Azurite Ward break in place of a life.', progress: (s) => count(s.warded, 1) },
  { id: 'flare', group: 'delve', tier: 1, sign: 'fire', title: 'Light in the Dark', text: 'Answer by the light of a flare.', progress: (s) => count(s.flares, 1) },
  { id: 'dynamite', group: 'delve', tier: 1, sign: 'sulphur', title: 'Demolition', text: 'Have dynamite go off on one of your questions.', progress: (s) => count(s.blasts, 1) },
  { id: 'cave-in', group: 'delve', tier: 1, sign: 'arsenic', secret: true, title: 'Cave-in', text: 'Miss on an Azurite Vein.', progress: (s) => count(s.caveIns, 1) },
];

export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Done: what it takes is there. */
export const isDone = (p: Progress) => p.need > 0 && p.have >= p.need;

// ---- the summary ------------------------------------------------------------

export const emptyTally = (): GameTally => ({ played: 0, won: 0, race: 0, duel: 0, flawless: 0, comeback: 0, eternal: 0, crowd: 0, creator: 0 });
export const emptyStore = (): AchievementStore => ({ earned: {}, games: emptyTally(), counted: [] });

/** Whether the log holds an item answered right after NEMESIS_WRONG wrong answers to it. */
function slewNemesis(log: Answer[]): boolean {
  const wrong = new Map<string, number>();
  for (const a of log) {
    const n = wrong.get(a.id) ?? 0;
    if (a.ok && n >= NEMESIS_WRONG) return true;
    wrong.set(a.id, a.ok ? n : n + 1);
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

/** Everything the achievements look at. `items`: the game's item list now. */
export function summarize(codex: Codex, delve: DelveRecords, games: GameTally, items: Item[]): Summary {
  const entries = Object.values(codex.items);
  const seen = items.filter((it) => codex.items[it.id]).length;
  const right = (id: string) => {
    const e = codex.items[id];
    return !!e && e.name.ok + e.art.ok > 0;
  };

  // Delve: bests and tallies are kept per ruleset; achievements look across all of them.
  let deepestAlone = 0;
  let deepestTogether = 0;
  for (const [key, run] of Object.entries(delve.bests)) {
    if (key.endsWith(':solo')) deepestAlone = Math.max(deepestAlone, run.depth);
    else deepestTogether = Math.max(deepestTogether, run.depth);
  }
  let runs = 0;
  let runsTogether = 0;
  let given = 0;
  let revived = 0;
  let wardedRuns = 0;
  for (const [key, t] of Object.entries(delve.tallies)) {
    const ended = Object.values(t.ends).reduce((a, b) => a + b, 0);
    runs += ended;
    if (key.endsWith(':together')) runsTogether += ended;
    given += t.given ?? 0;
    revived += t.revived ?? 0;
    wardedRuns += t.warded ?? 0;
  }
  // A run's losses say how far it went before the first: alone, a run that
  // ended always lost its last life at its end.
  let clean = 0;
  for (const run of [...delve.runs, ...Object.values(delve.bests)]) {
    if (!run.losses || run.mixed) continue;
    clean = Math.max(clean, run.losses.length ? run.losses[0] - 1 : run.depth - 1);
  }

  return {
    seen,
    total: items.length,
    catSeen: nearest(items, (it) => !!codex.items[it.id]),
    catKnown: nearest(items, (it) => right(it.id)),
    right: entries.reduce((n, e) => n + e.name.ok + e.art.ok, 0),
    artRight: entries.reduce((n, e) => n + e.art.ok, 0),
    eternalRight: codex.byDifficulty.eternal?.ok ?? 0,
    best: codex.best,
    fastest: codex.fastest?.ms ?? null,
    nemesis: slewNemesis(codex.log),
    fooled: Object.values(codex.fooled).reduce((n, f) => n + f.n, 0),
    games,
    deepestAlone,
    deepestTogether,
    runs,
    runsTogether,
    given,
    revived,
    warded: Math.max(
      wardedRuns,
      entries.reduce((n, e) => n + (e.delve?.warded ?? 0), 0),
    ),
    flares: codex.log.filter((a) => a.depth !== undefined && a.flared).length,
    blasts: entries.reduce((n, e) => n + (e.delve?.blasted ?? 0), 0),
    caveIns: codex.log.filter((a) => a.find === 'azurite' && !a.ok).length,
    clean,
  };
}

/** Each achievement with its progress, in the list's order. */
export function standings(s: Summary, store: AchievementStore) {
  return ACHIEVEMENTS.map((a) => {
    const p = a.progress(s);
    const at = store.earned[a.id];
    return { achievement: a, progress: p, earned: at ?? null };
  });
}

/** The achievements `s` earns that `store` doesn't have yet. */
export function newlyEarned(s: Summary, store: AchievementStore): Achievement[] {
  return ACHIEVEMENTS.filter((a) => store.earned[a.id] === undefined && isDone(a.progress(s)));
}

// ---- games against others -----------------------------------------------------

/** How a game against others ended for this player. */
export interface GameResult {
  /** Which game: its start on the host's clock (or, from an older host, its last question's). */
  id: number;
  /** Its start, to pick its answers out of the codex log; null when the host didn't send it. */
  since: number | null;
  /** A Delve run together: only the creator's company counts from it. */
  delve: boolean;
  won: boolean;
  race: boolean;
  duel: boolean;
  eternal: boolean;
  players: number;
  /** The creator played it, and it wasn't this player. */
  creator: boolean;
}

/**
 * The game this state change ends for this device's player, or null: online
 * (`me` seated; not on one device) with someone else seated, as it goes over.
 */
export function gameEnded(prev: GameState | null, next: GameState, me: string | null, hotSeat: boolean): GameResult | null {
  if (!prev || prev.phase === 'over' || next.phase !== 'over') return null;
  if (hotSeat || !me || next.players.length < 2 || !next.players.some((p) => p.id === me)) return null;
  const since = next.delve ? next.delve.startedAt : (next.startedAt ?? null);
  const id = since ?? next.lastAskedAt ?? 0;
  if (!id) return null;
  return {
    id,
    since,
    delve: !!next.delve,
    won: next.winners.includes(me),
    race: next.settings.mode === 'race',
    duel: !!next.deathmatch,
    eternal: next.settings.difficulty === 'eternal',
    players: next.players.length,
    creator: next.players.some((p) => p.id !== me && isHeldName(p.name)),
  };
}

/** How many game ids to remember, against counting one twice (a second tab, a rejoin). */
const COUNTED = 20;

/** The store with the game tallied (the same store if it already was). `log`: the codex log, for this game's answers. */
export function tallyGame(store: AchievementStore, g: GameResult, log: Answer[]): AchievementStore {
  if (store.counted.includes(g.id)) return store;
  const t = { ...store.games };
  if (g.creator) t.creator++;
  if (!g.delve) {
    t.played++;
    if (g.won) {
      t.won++;
      if (g.race) t.race++;
      if (g.duel) t.duel++;
      if (g.eternal) t.eternal++;
      if (g.players >= CROWD) t.crowd++;
      if (g.since !== null) {
        const since = g.since;
        const mine = log.filter((a) => a.t >= since && a.depth === undefined);
        if (mine.length && mine.every((a) => a.ok)) t.flawless++;
        // In a race a right answer is +1 and a wrong one −1, all of them this player's own.
        let score = 0;
        let low = 0;
        for (const a of mine) low = Math.min(low, (score += a.ok ? 1 : -1));
        if (g.race && low < 0) t.comeback++;
      }
    }
  }
  return { ...store, games: t, counted: [...store.counted, g.id].slice(-COUNTED) };
}

// ---- reading a stored list -----------------------------------------------------

const NAME = 'achievements';
/** The whole key, as storage events name it. */
export const ACHIEVEMENTS_KEY = storeKey(NAME);
/** Bump when the stored shape changes incompatibly. */
export const ACHIEVEMENTS_VERSION = 1;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

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
  if (isObj(v.games)) {
    const g = v.games;
    for (const k of Object.keys(s.games) as (keyof GameTally)[]) s.games[k] = whole(g[k]);
  }
  if (Array.isArray(v.counted)) s.counted = v.counted.filter((id): id is number => typeof id === 'number' && Number.isFinite(id)).slice(-COUNTED);
  return s;
}

export const serializeStore = (s: AchievementStore) => JSON.stringify({ v: ACHIEVEMENTS_VERSION, ...s });

// ---- storage -------------------------------------------------------------------

/** The stored list (empty when there is none, or it can't be read). Always read fresh: another tab may have added to it. */
export function loadAchievements(): AchievementStore {
  return parseStore(tryReadStored(NAME) ?? null) ?? emptyStore();
}

export interface Check {
  /** Earned by this check. */
  earned: Achievement[];
  /** There was no list before it: what it earned was earned before, in games played before achievements existed. */
  first: boolean;
}

/**
 * Brings the stored list up to date with the codex and the Delve records
 * (and `game`, a game against others that just ended), and says what that
 * earned. Never over a list a newer build wrote, and anything else unreadable
 * is kept aside first (lib/keepAside.ts).
 */
export function checkAchievements(items: Item[], game?: GameResult | null): Check {
  const none: Check = { earned: [], first: false };
  const raw = tryReadStored(NAME);
  if (raw === undefined) return none;
  const stored = parseStore(raw);
  if (raw && !stored && !makeRoom(NAME, raw, ACHIEVEMENTS_VERSION)) return none;
  let store = stored ?? emptyStore();
  const codex = loadCodex();
  if (game) store = tallyGame(store, game, codex.log);
  const earned = newlyEarned(summarize(codex, loadRecords(), store.games, items), store);
  if (earned.length || store !== stored) {
    const now = Date.now();
    const next = { ...store, earned: { ...store.earned } };
    for (const a of earned) next.earned[a.id] = now;
    if (!writeStored(NAME, serializeStore(next))) return none;
  }
  return { earned, first: !stored };
}

/**
 * Erases them with the codex. An empty list is left in their place, so the
 * next one earned is announced (the first check after none at all is quiet).
 */
export function resetAchievements() {
  writeStored(NAME, serializeStore(emptyStore()));
  clearAside(NAME);
}
