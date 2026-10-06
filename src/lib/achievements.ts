// Achievements: feats this browser's player has earned, kept in localStorage
// like the codex and never sent anywhere.
//
// Few and chosen: each marks a moment worth telling or a goal worth chasing.
// Four groups of six (Knowledge, Versus, Delve, Together), so the Codex page
// lays out evenly. Tiers are the seal's metal (copper, silver, gold), and a
// series (one idea at rising tiers) shares a sign; no other achievements do.
//
// Where they come from:
// - What the codex (lib/codex.ts) and the Delve records (lib/delveRecord.ts)
//   keep: so games from before achievements existed count too. That first
//   check is quiet (see checkAchievements and the start page's notice).
// - Moments in a run of Delve as this device sees them happen (momentsIn):
//   reaching a depth, a ward saving the last life, a team falling together.
//   Everything they read is in the copy of the state a guest gets.
// - Games against others online: a little tracker follows the game in play
//   (trackVersus: the biggest lead a rival had over you, rivals who guessed,
//   race questions taken from veiled art), kept in the stored list so a
//   reload doesn't lose it, and at the end versusEnd says what it earned.
//   Only online, in a seat, to 5 points or more, with someone else still
//   there at the end; on one device the game can't tell its players apart.
//
// They are kept on this device for this player alone, so they don't guard
// against a player fooling themselves (leaving a room to save a streak, two
// tabs in one game). An achievement once earned stays earned, also when more
// items join the game or the codex log's oldest answers make way. Erasing the
// codex erases them too (resetAchievements).

import { answerLives, answerWards, loadCodex, type Answer, type Codex } from './codex.ts';
import { fellAt, isGroupRun, livesOf, standingIds } from './delve.ts';
import { isTogether, loadRecords, type DelveRecords, type DelveRun } from './delveRecord.ts';
import type { GameState, Item } from './game.ts';
import { clearAside, makeRoom } from './keepAside.ts';
import { isHeldName } from './names.ts';
import { storeKey, tryReadStored, writeStored } from './storage.ts';

/** The groups of the list, in the page's order. */
export type AchievementGroup = 'knowledge' | 'versus' | 'delve' | 'together';

export const GROUPS: { key: AchievementGroup; title: string; blurb: string }[] = [
  { key: 'knowledge', title: 'Knowledge', blurb: 'The items you know, from your own answers.' },
  { key: 'versus', title: 'Versus', blurb: 'Games online against other players, to 5 points or more.' },
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
  | 'rings';

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
  /** How hard it is: the seal's metal, copper, silver or gold. */
  tier: 1 | 2 | 3;
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
  /** The category nearest to every item answered both ways. */
  twofold: Progress;
  /** Items of the game answered right at least once. */
  known: Progress;
  /** Most falls for one made-up name. */
  fooled: number;
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
}

const count = (have: number, need: number, note?: string): Progress => ({ have, need, ...(note ? { note } : {}) });

/** A right answer this quick (ms from the art to the click) counts for Mercurial. */
export const FAST_MS = 2000;
/** Wins count to this target or more; Untarnished and Clean Sweep to TARGET_HIGH. */
export const TARGET_MIN = 5;
export const TARGET_HIGH = 10;
/** Tide Turner: how far a rival led you. */
export const COMEBACK = 4;
/** Through the Veil: race questions taken, of VEIL_OPTIONS or more options, before VEIL_SHARE of the art burnt in. */
export const VEIL_TAKES = 3;
export const VEIL_SHARE = 0.25;
export const VEIL_OPTIONS = 6;
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
/** Nobody Left Behind and Deep Company: the depths to reach together. */
export const ALL_DEPTH = 30;
export const COMPANY_DEPTH = 75;
/** Process of Elimination: options still open when you cleared it. */
export const OPEN_OPTIONS = 3;

export const ACHIEVEMENTS: Achievement[] = [
  // ---- knowledge ----
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
    title: 'Mercurial',
    text: `Answer 5 questions right in a row on your own turns, each within ${FAST_MS / 1000} seconds of its art appearing.`,
    progress: (s) => count(s.fast, 5),
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
  { id: 'great-work', group: 'knowledge', tier: 3, sign: 'stone', title: 'The Great Work', text: 'Answer every item in the game right at least once.', progress: (s) => s.known },
  { id: 'fooled-twice', group: 'knowledge', tier: 1, sign: 'luna', secret: true, title: 'Fool Me Twice', text: 'Fall for the same made-up name a second time.', progress: (s) => count(s.fooled, 2) },

  // ---- versus ----
  { id: 'deathmatch', group: 'versus', tier: 1, sign: 'mars', title: 'Sudden Death', text: 'Win a deathmatch, answering its last round right as a rival gets it wrong.' },
  { id: 'tide-turner', group: 'versus', tier: 2, sign: 'waves', title: 'Tide Turner', text: `Win a game after a rival led you by ${COMEBACK} points or more.` },
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
    text: `Win a race without a wrong guess, taking ${VEIL_TAKES} questions of ${VEIL_OPTIONS} or more options before a quarter of their art had burned in.`,
  },

  // ---- delve ----
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
    text: `Survive ${THREAD} depths in a row on your last life, all past depth ${THREAD_FROM}, in a run alone.`,
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
    text: `Fall in a run alone at exactly the depth of your best, ${DEPTH_GRAVE} or deeper.`,
  },

  // ---- together ----
  { id: 'selfless', group: 'together', tier: 2, sign: 'pelican', title: 'Selfless', text: 'Give away two of your own lives to bring teammates back, in one run.', progress: (s) => count(s.given, 2) },
  {
    id: 'elimination',
    group: 'together',
    tier: 1,
    sign: 'sublimation',
    title: 'Process of Elimination',
    text: `Clear a depth that every other teammate still standing, two or more, got wrong, with ${OPEN_OPTIONS} or more options still open.`,
  },
  {
    id: 'fell-as-one',
    group: 'together',
    tier: 1,
    sign: 'pisces',
    secret: true,
    title: 'Fell as One',
    text: `Perish on the same question as every teammate still standing, ${FALL_MANY} or more of you, at depth ${FALL_DEPTH} or deeper.`,
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
    title: 'Nobody Left Behind',
    text: `Reach depth ${ALL_DEPTH} in a run together with the whole team, none of you ever perishing.`,
  },
  {
    id: 'deep-company',
    group: 'together',
    tier: 3,
    sign: 'heptagram',
    title: 'Deep Company',
    text: `Reach depth ${COMPANY_DEPTH} still standing, in a run together.`,
    progress: (s) => count(s.deepCompany, COMPANY_DEPTH),
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
  if (isTogether(run) || run.left || run.depth < DEPTH_GRAVE) return false;
  const before = (delve.climbs[`${run.ruleset}:solo`] ?? []).filter((c) => c.at < run.at).at(-1);
  return before?.depth === run.depth;
}

/** Everything the kept achievements read. `items`: the game's item list now. */
export function summarize(codex: Codex, delve: DelveRecords, items: Item[]): Summary {
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
  const deepestAlone = Math.max(0, ...alone.map((r) => r.depth));
  let thread = 0;
  let untouched = 0;
  for (const r of alone) {
    if (!r.losses) continue;
    // The last depth survived: before the fall, or before the depth it was left on.
    const survived = r.depth - 1;
    if (r.losses.length >= 2) thread = Math.max(thread, survived - Math.max(r.losses[1], THREAD_FROM));
    untouched = Math.max(untouched, r.losses.length ? r.losses[0] : r.depth);
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
    twofold: nearest(items, (it) => both(it.id)),
    known: count(known, items.length),
    fooled: Math.max(0, ...Object.values(codex.fooled).map((f) => f.n)),
    deepestAlone,
    thread: Math.max(0, thread),
    untouched,
    savingGrace,
    grave: alone.some((r) => tiedBest(delve, r)),
    given: Math.max(0, ...together.map((r) => r.given ?? 0)),
    // Where this player finally fell in a run that ended. A run left counts only if they never fell in it
    // (one who fell may not have been brought back before leaving).
    deepCompany: Math.max(0, ...together.map((r) => (r.left ? (r.perished?.length ? 0 : r.depth) : (r.perished?.at(-1) ?? 0)))),
  };
}

/** The ones the summary earns: those whose progress is done, and the moments the records keep. */
export function earnedFrom(s: Summary): string[] {
  const ids = ACHIEVEMENTS.filter((a) => a.progress && isDone(a.progress(s))).map((a) => a.id);
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

  if (!isGroupRun(next)) {
    if (next.round >= 50) out.push('depth-50');
    if (next.round >= 100) out.push('depth-100');
    // Standing at the depth with every life (a loss at it still reached it).
    if ((losses.length ? losses[0] : next.round) >= UNTOUCHED) out.push('untouched');
    if (r && lives === 1 && losses.length === 2 && next.round - Math.max(losses[1], THREAD_FROM) >= THREAD) out.push('by-a-thread');
    if (r && !r.correct && lives === 1) {
      const lost = r.lost ? r.lost.lives : r.warded ? 0 : 1;
      const broke = r.lost ? r.lost.wards : r.warded ? 1 : 0;
      if (lost === 0 && broke > 0) out.push('saving-grace');
    }
    return out;
  }

  // ---- together ----
  const others = next.players.filter((p) => p.id !== self);
  const standing = standingIds(next);
  const revives = d.revives ?? [];
  if (revives.filter((v) => v.by === self).length >= 2) out.push('selfless');
  if (playing && next.round >= COMPANY_DEPTH && lives > 0) out.push('deep-company');
  const whole = d.entrants.every((id) => next.players.some((p) => p.id === id));
  if (playing && next.round >= ALL_DEPTH && whole && !revives.length && standing.length === next.players.length) out.push('nobody-left');
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
    if (r.winnerId === null && !standing.length && next.round >= FALL_DEPTH && (d.leftAt ?? 0) < next.round && fell.length >= FALL_MANY && fell.includes(self))
      out.push('fell-as-one');
    // The last one standing, clean for LONE depths past the last fall (and past LONE_FROM).
    if (whole && standing.length === 1 && standing[0] === self) {
      const since = Math.max(LONE_FROM, ...others.map((p) => fellAt(next, p.id) ?? 0));
      if (next.round - since >= LONE && !losses.some((x) => x > since) && r.winnerId === self) out.push('lone-wolf');
    }
  }
  return out;
}

// ---- games against others -------------------------------------------------------

/** The game against others in play, as this device has followed it. */
export interface VersusTrack {
  /** Which game: its start on the host's clock. */
  game: number;
  /** The largest lead each rival has had over this player (whose score counts from zero), by id. */
  lead: Record<string, number>;
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
  let t: VersusTrack = track?.game === next.startedAt ? track : { game: next.startedAt, lead: {}, guessed: [], veiled: 0, last: 0 };
  const race = next.settings.mode === 'race';
  const r = newReveal(prev, next);
  const sample =
    race ? !!r : prev?.startedAt === next.startedAt && prev.round < next.round && next.phase === 'choosing' && !next.deathmatch;
  const changed = () => (t === track ? (t = { ...t, lead: { ...t.lead }, guessed: [...t.guessed] }) : t);
  if (sample) {
    const mine = Math.max(0, next.players.find((p) => p.id === me)?.score ?? 0);
    for (const p of next.players) {
      if (p.id === me) continue;
      const lead = p.score - mine;
      if (lead > (t.lead[p.id] ?? 0)) changed().lead[p.id] = lead;
    }
  }
  const q = next.question;
  if (race && r && q && q.askedAt !== t.last) {
    changed().last = q.askedAt;
    for (const id of [r.winnerId, ...q.misses.map((m) => m.playerId)])
      if (id && id !== me && !t.guessed.includes(id)) t.guessed.push(id);
    const share = veilShare?.qid === q.askedAt ? veilShare.share : null;
    if (r.winnerId === me && q.veil && share !== null && share > 0 && share < VEIL_SHARE && q.options.length >= VEIL_OPTIONS) t.veiled++;
  }
  return t;
}

/**
 * What the end of a game against others earns this device's player: online,
 * in a seat, to TARGET_MIN or more, with someone else still there. `log`:
 * the codex log, for this game's own answers.
 */
export function versusEnd(prev: GameState | null, next: GameState, me: string | null, hotSeat: boolean, track: VersusTrack | null, log: Answer[]): string[] {
  if (!prev || prev.phase === 'over' || next.phase !== 'over' || !versusGame(next, me, hotSeat)) return [];
  const s = next;
  if (s.settings.targetScore < TARGET_MIN || !s.winners.includes(me!)) return [];
  const rivals = s.players.filter((p) => p.id !== me);
  const there = rivals.filter((p) => p.connected);
  if (!there.length) return [];
  const t = track?.game === s.startedAt ? track : null;
  const race = s.settings.mode === 'race';
  const mine = log.filter((a) => a.t >= s.startedAt && a.depth === undefined);
  const flawless = mine.length > 0 && mine.every((a) => a.ok);
  const out: string[] = [];
  const dm = s.deathmatch;
  if (dm && dm.results[me!] === true && dm.eliminated.some((id) => dm.results[id] === false)) out.push('deathmatch');
  if (t && there.some((p) => (t.lead[p.id] ?? 0) >= COMEBACK && !s.winners.includes(p.id))) out.push('tide-turner');
  if (s.settings.targetScore >= TARGET_HIGH && flawless) out.push('untarnished');
  const score = s.players.find((p) => p.id === me)?.score ?? 0;
  if (race && s.settings.targetScore >= TARGET_HIGH && score === s.round && t && there.every((p) => t.guessed.includes(p.id))) out.push('clean-sweep');
  if (there.some((p) => isHeldName(p.name) && !s.winners.includes(p.id))) out.push('usurper');
  if (race && flawless && (t?.veiled ?? 0) >= VEIL_TAKES) out.push('through-the-veil');
  return out;
}

// ---- reading a stored list --------------------------------------------------------

export interface AchievementStore {
  /** When each was earned (this browser's clock), by id. Ids this build doesn't know (a newer one's) are kept. */
  earned: Record<string, number>;
  /** The game against others in play (see trackVersus); missing outside one. */
  versus?: VersusTrack;
}

export const emptyStore = (): AchievementStore => ({ earned: {} });

const NAME = 'achievements';
/** The whole key, as storage events name it. */
export const ACHIEVEMENTS_KEY = storeKey(NAME);
/** Bump when the stored shape changes incompatibly. */
export const ACHIEVEMENTS_VERSION = 1;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

function parseTrack(v: unknown): VersusTrack | undefined {
  if (!isObj(v) || typeof v.game !== 'number' || !Number.isFinite(v.game)) return undefined;
  const lead: Record<string, number> = {};
  if (isObj(v.lead)) for (const [id, n] of Object.entries(v.lead)) if (id.length <= 64 && whole(n)) lead[id] = whole(n);
  const guessed = Array.isArray(v.guessed) ? v.guessed.filter((id): id is string => typeof id === 'string' && id.length <= 64).slice(0, 64) : [];
  return { game: v.game, lead, guessed, veiled: whole(v.veiled), last: typeof v.last === 'number' && Number.isFinite(v.last) ? v.last : 0 };
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
  const track = parseTrack(v.versus);
  if (track) s.versus = track;
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
  const stored = parseStore(raw);
  if (raw && !stored && !makeRoom(NAME, raw, ACHIEVEMENTS_VERSION)) return null;
  return { store: stored ?? emptyStore(), first: !stored };
}

/** Writes `store` with `ids` earned now (those it didn't have yet), and says which those were. */
function earn(store: AchievementStore, first: boolean, ids: string[], force = false): Check {
  const fresh = [...new Set(ids)].filter((id) => store.earned[id] === undefined && achievementById.has(id));
  if (!fresh.length && !first && !force) return none();
  const now = Date.now();
  const next: AchievementStore = { ...store, earned: { ...store.earned } };
  for (const id of fresh) next.earned[id] = now;
  if (!writeStored(NAME, serializeStore(next))) return none();
  return { earned: fresh.map((id) => achievementById.get(id)!), first };
}

/**
 * Brings the stored list up to date with the codex and the Delve records,
 * with `moments` (ids a state change earned) on top, and says what that earned.
 */
export function checkAchievements(items: Item[], moments: string[] = []): Check {
  const o = open();
  if (!o) return none();
  const s = summarize(loadCodex(), loadRecords(), items);
  return earn(o.store, o.first, [...earnedFrom(s), ...moments]);
}

/**
 * A state change of a room or a run as this device saw it: follows a game
 * against others, and says what its moments earned (written already). Reads
 * the codex only when a game against others ends.
 */
export function noteState(
  prev: GameState | null,
  next: GameState,
  me: string | null,
  hotSeat: boolean,
  items: Item[],
  veilShare?: { qid: number; share: number },
): Check {
  const delve = momentsIn(prev, next, me, hotSeat);
  const watching = versusGame(next, me, hotSeat);
  if (!delve.length && !watching && !loadAchievements().versus) return none();
  const o = open();
  if (!o) return none();
  const { store, first } = o;
  const track = trackVersus(store.versus ?? null, prev, next, me, hotSeat, veilShare);
  const ended = next.phase === 'over' ? versusEnd(prev, next, me, hotSeat, track, loadCodex().log) : [];
  const ids = [...delve, ...ended].filter((id) => store.earned[id] === undefined);
  // The tracker is let go once its game is over (or another began).
  const keep = track && next.phase !== 'over' ? track : undefined;
  const moved = keep !== store.versus;
  if (!ids.length && !moved) return none();
  // A first check that only follows a game stays quiet about what the codex would earn: the start page tells that.
  const base: AchievementStore = { ...store };
  if (keep) base.versus = keep;
  else delete base.versus;
  const check = earn(base, first, ids, moved);
  // What the codex and records earn waits for the check after them (lib/session.svelte.ts); a moment is never quiet.
  return first ? { earned: check.earned, first: false } : check;
}

/**
 * Erases them with the codex. An empty list is left in their place, so the
 * next one earned is announced (the first check after none at all is quiet).
 */
export function resetAchievements() {
  writeStored(NAME, serializeStore(emptyStore()));
  clearAside(NAME);
}
