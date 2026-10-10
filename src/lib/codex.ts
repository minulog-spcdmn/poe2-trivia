// The codex: which items this browser has met in games, and how well its
// player knows them. Kept in localStorage only, never sent anywhere.
//
// Every question this device sees revealed counts as an encounter with its
// answer. Only this device's own answers count toward accuracy: its turn, its
// guess in a race (a turn that runs out of time counts as wrong). Watching
// someone else's turn, losing a race before guessing, or spectating only adds
// "seen". In hot-seat the device can't tell its players apart, so answers
// only count when one person plays alone.
//
// Delve answers also note their depth and run: each item keeps how deep it
// was answered and how often it cost a life, and the log links the lives a run
// lost to the items that took them (the run list is in lib/delveRecord.ts).
// Each also notes how many of its questions came from a find (or, logged by
// builds before dynamite blasted questions away, had a stick go off on them
// at half the clock), how many Azurite Wards broke in place of its lives, and, where a
// wrong answer to an Azurite Vein caved in for two, the lives it cost. A
// question dynamite blasts away counts as seen: blasting it costs nothing
// and misses nothing. Only a wrong answer given to it before (together, a
// teammate may blast a question someone already struck) counts, as a miss
// at what it cost them.
// The log also keeps, per Delve answer, the find it came from and what it
// earned, a flare burnt on it, and on a cave-in the lives and wards it took,
// so a run can be told back (codexStats.ts runStory), whether dynamite went off
// on it (older builds), and whether it was given in a run together (`team`), so the pages
// can tell alone and together apart.
//
// Together (co-op) everyone answers the same question: this player's answer
// is right if theirs cleared the depth (the reveal's winner), wrong if they
// struck an option (or let the clock run out while standing), and what that
// cost them is their own hit (the reveal's `hits`). Someone else clearing it
// first only adds "seen".
// Online, each Delve answer also notes whose it was (`who`): two tabs of one
// browser in the same room play two players, and a run is told back from its
// own player's answers.
//
// The fields Delve added are optional, so codexes written before them read as
// they were and the version stays. They live under a name of their own
// (`codex2`), though: a build from before them, still open in a tab after an
// update, reads the codex without them and writes back what it read, so
// under the old name (`codex`) every Delve field would go the first time it
// recorded an answer. The old name is only ever read, as where the codex
// starts from while the new one is still missing; nothing writes it again,
// and those builds never touch the new one. A stored codex this build can't
// read is never written over (lib/keepAside.ts).

import { difficultyOf, isFake, type Blast, type Difficulty, type GameState, type QuestionMode } from './game.ts';
import { ITEM_KINDS, delveTier, isGroupRun, type FindKind, type ItemKind } from './delve.ts';
import { clearAside, makeRoom } from './keepAside.ts';
import { readStored, removeStored, storeKey, tryReadStored, writeStored } from './storage.ts';

export interface Tally {
  /** Answers given. */
  n: number;
  /** Of those, right. */
  ok: number;
}

export interface ItemEntry {
  /** Questions about this item this device saw revealed. */
  seen: number;
  /** When it was first and last asked (the question's askedAt). */
  first: number;
  last: number;
  /** This player's answers, by question type: named from its art, or its art found for its name. */
  name: Tally;
  art: Tally;
  /**
   * The items whose names this one's art was taken for, by id, with how often:
   * their name picked for its art, or its art picked for their name.
   */
  mixed: Record<string, number>;
  /** This player's Delve answers to it; missing until there is one. */
  delve?: DelveItem;
}

/** One item's Delve answers. In Delve every wrong answer on your own turn costs a life. */
export interface DelveItem extends Tally {
  /** The deepest depth it was named right at (0: never). */
  deepest: number;
  /** The deepest depth it cost a life at (0: never; a wrong answer a ward took costs none). */
  lostAt: number;
  /** Of these answers: asked from a find (a deeper question, for an item). Missing for none. */
  finds?: number;
  /**
   * Questions on it where a stick of dynamite went off at half the clock,
   * logged by builds before dynamite blasted questions away. Missing for none.
   */
  blasted?: number;
  /** Azurite Wards that broke on its wrong answers, in place of lives. Missing for none. */
  warded?: number;
  /**
   * Lives it cost. Missing in codexes from before an Azurite Vein could cave
   * in for two: then one a wrong answer, but for those a ward took.
   */
  lives?: number;
}

/** Lives an item cost. */
export const livesCost = (d: DelveItem) => d.lives ?? Math.max(0, d.n - d.ok - (d.warded ?? 0));

/** One of this player's answers, for the stats that look at the recent past. */
export interface Answer {
  /** The question's askedAt. */
  t: number;
  id: string;
  mode: QuestionMode;
  ok: boolean;
  difficulty: Difficulty;
  race: boolean;
  /** From the first picture on this device to the click (missing on timeouts). */
  ms?: number;
  /** Delve: the depth it was answered at, and the run (its start, as the run list's id). */
  depth?: number;
  run?: number;
  /** Delve: wrong, but an Azurite Ward took the loss (no life lost). */
  warded?: true;
  /** Delve: asked from this find. */
  find?: FindKind;
  /** Delve: what a right answer to a find earned ('wards' for a shard that forged one). */
  gained?: ItemKind;
  /** Delve: a flare burnt on this question. */
  flared?: true;
  /** Delve, on a cave-in or together: lives it took and wards that broke in their place (otherwise see answerLives). */
  lives?: number;
  wards?: number;
  /** Delve: a stick of dynamite went off on this question (logged by builds before dynamite blasted questions away). */
  blasted?: true;
  /** Delve: answered in a run together. */
  team?: true;
  /** Delve online: the player who answered (two tabs of one browser in one room play two). */
  who?: string;
}

/** Lives a logged answer cost: one a wrong Delve answer, none if wards took it, a cave-in's own count. */
export const answerLives = (a: Answer) => a.lives ?? (a.ok || a.depth === undefined || a.warded ? 0 : 1);
/** Azurite Wards that broke on a logged answer, each in place of a life. */
export const answerWards = (a: Answer) => a.wards ?? (a.warded ? 1 : 0);

/** A made-up name this player fell for. */
export interface Fooled {
  /** The item whose name it copies. */
  of: string;
  n: number;
  last: number;
}

export interface Codex {
  items: Record<string, ItemEntry>;
  /** The latest answers, oldest first, at most LOG_LIMIT. */
  log: Answer[];
  byDifficulty: Partial<Record<Difficulty, Tally>>;
  /** By the made-up name. */
  fooled: Record<string, Fooled>;
  /** Right answers in a row, now and at best. */
  streak: number;
  best: number;
  /** Quickest right answer ever. */
  fastest: { ms: number; id: string } | null;
  /** Delve answers by depth. */
  byDepth: Record<number, Tally>;
}

/** What one revealed question means for the codex. */
export interface Encounter {
  /** The question's askedAt: when it was asked, and which question it was. */
  at: number;
  itemId: string;
  mode: QuestionMode;
  difficulty: Difficulty;
  race: boolean;
  /**
   * Present in Delve: the depth the question was asked at, and the run's start
   * (its id in the run list); the find it came from; whether dynamite went
   * off on it; whether wards took a wrong answer's whole loss; and on a
   * cave-in (an Azurite Vein missed), the lives and wards it took. Together,
   * `lost` is always this player's own hit when they answered wrong.
   */
  delve?: {
    depth: number;
    run: number;
    find?: FindKind;
    blasted?: true;
    warded?: true;
    lost?: { lives: number; wards: number };
    /** What a right answer to the find earned. */
    gained?: ItemKind;
    /** A flare burnt on the question. */
    flared?: true;
    /** A run together. */
    team?: true;
    /** This device's player, online. */
    who?: string;
  };
  /** Present when this device's player answered (or let their turn's time run out). */
  answer?: {
    ok: boolean;
    /** What they picked (a real item, or a made-up name's id); null on a timeout. */
    pickedId: string | null;
    /** The name on screen for what they picked (name questions). */
    pickedLabel: string | null;
    ms?: number;
  };
}

const CODEX = 'codex2';
export const CODEX_KEY = storeKey(CODEX);
/** Where builds from before the Delve fields keep the codex: only read, to start the new one from. */
const LEGACY = 'codex';
/** Bump when the stored shape changes incompatibly. */
export const CODEX_VERSION = 1;
export const LOG_LIMIT = 2000;
/** "Recent" accuracy looks at this many answers. */
export const RECENT = 100;

export const emptyCodex = (): Codex => ({ items: {}, log: [], byDifficulty: {}, fooled: {}, streak: 0, best: 0, fastest: null, byDepth: {} });

export const noTally = (): Tally => ({ n: 0, ok: 0 });
export const add = (t: Tally, ok: boolean): Tally => ({ n: t.n + 1, ok: t.ok + (ok ? 1 : 0) });

/**
 * The encounter a reveal means for this device, or null when there is none.
 * `me`: this device's player online (null in hot-seat).
 */
export function encounterAt(s: GameState, me: string | null, hotSeat: boolean, ms?: number): Encounter | null {
  const q = s.question;
  const r = s.reveal;
  if (s.phase !== 'reveal' || !q || !r || !r.correctId) return null;
  const race = s.settings.mode === 'race';
  // Delve answers are filed under the preset their depth plays like, not the room's leftover setting.
  const difficulty = s.delve ? delveTier(s.round) : difficultyOf(s.settings.difficulty);
  const e: Encounter = { at: q.askedAt, itemId: r.correctId, mode: q.mode, difficulty, race };
  if (s.delve)
    e.delve = {
      depth: Math.max(1, s.round),
      run: s.delve.startedAt,
      ...(q.find ? { find: q.find } : {}),
      ...(q.blasted ? { blasted: true as const } : {}),
      ...(r.warded ? { warded: true as const } : {}),
      ...(r.caveIn && r.lost ? { lost: { lives: r.lost.lives, wards: r.lost.wards } } : {}),
      ...(r.gained ? { gained: r.gained } : {}),
      ...(q.flared ? { flared: true as const } : {}),
      ...(me && !hotSeat ? { who: me } : {}),
    };
  let picked: number | null;
  let ok: boolean;
  if (s.delve && isGroupRun(s)) {
    // Together: right for whoever cleared it, wrong for whoever struck (or stood through the time-out).
    e.delve!.team = true;
    delete e.delve!.warded;
    delete e.delve!.lost;
    if (!me || hotSeat) return e;
    const struck = q.struck?.find((x) => x.by === me);
    const hit = r.hits?.find((h) => h.playerId === me);
    if (r.winnerId === me) [picked, ok] = [r.correctIndex, true];
    else if (struck || hit) [picked, ok] = [struck ? struck.index : null, false];
    else return e;
    const took = hit ?? struck;
    if (!ok && took) e.delve!.lost = { lives: took.lives, wards: took.wards };
    if (!ok) delete e.delve!.gained;
  } else if (race) {
    if (!me) return e;
    const miss = q.misses.find((m) => m.playerId === me);
    if (r.winnerId === me) [picked, ok] = [r.correctIndex, true];
    else if (miss) [picked, ok] = [miss.index, false];
    else return e;
  } else {
    const mine = hotSeat ? s.players.length === 1 : !!me && s.players[s.turn]?.id === me;
    if (!mine) return e;
    [picked, ok] = [r.chosenIndex, r.correct];
  }
  const pickedId = picked === null ? null : q.options[picked] || null;
  const pickedLabel = picked === null ? null : (q.labels[picked] ?? null);
  e.answer = { ok, pickedId, pickedLabel, ...(ok && ms !== undefined ? { ms } : {}) };
  return e;
}

/**
 * The encounter a question dynamite blasted away means for this device: its
 * item seen, filed under the run like any of its questions. Blasting it
 * answers nothing and costs nothing; but together, where this device's
 * player struck an option on it before a teammate blasted it, that wrong
 * answer stands, at what it cost them (its pick unknown: its options went
 * with it). `blast` is the new question's (game.ts Blast), which remembers
 * the one blasted away.
 */
export function blastedEncounter(s: GameState, blast: Blast, me: string | null, hotSeat: boolean): Encounter {
  const struck = me && !hotSeat ? blast.was.struck?.find((x) => x.by === me) : undefined;
  return {
    at: blast.was.at,
    itemId: blast.was.itemId,
    mode: blast.was.mode,
    difficulty: delveTier(s.round),
    race: false,
    ...(s.delve
      ? {
          delve: {
            depth: Math.max(1, s.round),
            run: s.delve.startedAt,
            ...(struck ? { lost: { lives: struck.lives, wards: struck.wards } } : {}),
            ...(isGroupRun(s) ? { team: true as const } : {}),
            ...(me && !hotSeat ? { who: me } : {}),
          },
        }
      : {}),
    ...(struck ? { answer: { ok: false, pickedId: null, pickedLabel: null } } : {}),
  };
}

const fresh = (at: number): ItemEntry => ({ seen: 1, first: at, last: at, name: noTally(), art: noTally(), mixed: {} });

/** The codex with the encounter added (the same codex if it was already). */
export function record(c: Codex, e: Encounter): Codex {
  const prev = c.items[e.itemId];
  // The same question again (a rejoin, a second tab in the same room): its
  // askedAt is what tells it apart, so `last` is always the latest question's.
  if (prev && prev.last === e.at) return c;
  const entry: ItemEntry = prev
    ? { ...prev, seen: prev.seen + 1, first: Math.min(prev.first, e.at), last: e.at, mixed: { ...prev.mixed } }
    : fresh(e.at);
  const next: Codex = { ...c, items: { ...c.items, [e.itemId]: entry } };
  const a = e.answer;
  if (!a) return next;
  entry[e.mode] = add(entry[e.mode], a.ok);
  next.byDifficulty = { ...c.byDifficulty, [e.difficulty]: add(c.byDifficulty[e.difficulty] ?? noTally(), a.ok) };
  next.streak = a.ok ? c.streak + 1 : 0;
  next.best = Math.max(c.best, next.streak);
  const ms = a.ok && a.ms !== undefined && Number.isFinite(a.ms) && a.ms > 0 ? Math.round(a.ms) : undefined;
  if (ms !== undefined && (!c.fastest || ms < c.fastest.ms)) next.fastest = { ms, id: e.itemId };
  const dv = e.delve;
  // What a wrong answer cost: one life, or a ward in its place; a cave-in two of them.
  const lives = a.ok || !dv ? 0 : (dv.lost?.lives ?? (dv.warded ? 0 : 1));
  const wardsBroke = a.ok || !dv ? 0 : (dv.lost?.wards ?? (dv.warded ? 1 : 0));
  const warded = !a.ok && !!dv && lives === 0;
  if (dv) {
    const was = entry.delve ?? { n: 0, ok: 0, deepest: 0, lostAt: 0 };
    const more = (n: number | undefined, yes: boolean) => (n ?? 0) + (yes ? 1 : 0) || undefined;
    const finds = more(was.finds, !!dv.find);
    const blasted = more(was.blasted, !!dv.blasted);
    const wards = (was.warded ?? 0) + wardsBroke;
    entry.delve = {
      ...add(was, a.ok),
      deepest: a.ok ? Math.max(was.deepest, dv.depth) : was.deepest,
      lostAt: lives ? Math.max(was.lostAt, dv.depth) : was.lostAt,
      ...(finds ? { finds } : {}),
      ...(blasted ? { blasted } : {}),
      ...(wards ? { warded: wards } : {}),
    };
    // Kept only where one life a wrong answer (but for a ward) doesn't add up: after a cave-in.
    const cost = livesCost(was) + lives;
    if (cost !== livesCost({ ...entry.delve, lives: undefined })) entry.delve.lives = cost;
    next.byDepth = { ...c.byDepth, [dv.depth]: add(c.byDepth[dv.depth] ?? noTally(), a.ok) };
  }
  if (!a.ok && a.pickedId) {
    if (isFake(a.pickedId)) {
      // fake:<id of the item it copies>:<which of its fakes>
      const of = a.pickedId.split(':')[1] ?? '';
      if (a.pickedLabel) {
        const was = c.fooled[a.pickedLabel];
        next.fooled = { ...c.fooled, [a.pickedLabel]: { of, n: (was?.n ?? 0) + 1, last: e.at } };
      }
    } else if (a.pickedId !== e.itemId && e.mode === 'name') {
      entry.mixed[a.pickedId] = (entry.mixed[a.pickedId] ?? 0) + 1;
    } else if (a.pickedId !== e.itemId) {
      // "Find the art": the art picked was taken for this name. The reveal
      // names it, so it counts as seen too.
      const was = next.items[a.pickedId];
      next.items[a.pickedId] = {
        ...(was ? { ...was, seen: was.seen + 1, first: Math.min(was.first, e.at), last: Math.max(was.last, e.at) } : fresh(e.at)),
        mixed: { ...was?.mixed, [e.itemId]: (was?.mixed[e.itemId] ?? 0) + 1 },
      };
    }
  }
  const log: Answer = {
    t: e.at,
    id: e.itemId,
    mode: e.mode,
    ok: a.ok,
    difficulty: e.difficulty,
    race: e.race,
    ...(ms !== undefined ? { ms } : {}),
    ...(dv ? { depth: dv.depth, run: dv.run } : {}),
    ...(warded ? { warded: true as const } : {}),
    ...(dv?.find ? { find: dv.find } : {}),
    ...(dv?.gained && a.ok ? { gained: dv.gained } : {}),
    ...(dv?.flared ? { flared: true as const } : {}),
    ...(dv?.lost && !a.ok ? { lives: lives, wards: wardsBroke } : {}),
    ...(dv?.blasted ? { blasted: true as const } : {}),
    ...(dv?.team ? { team: true as const } : {}),
    ...(dv?.who ? { who: dv.who } : {}),
  };
  next.log = [...c.log, log].slice(-LOG_LIMIT);
  return next;
}

// ---- reading a stored codex ------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
function tally(v: unknown): Tally {
  if (!isObj(v)) return noTally();
  const n = count(v.n);
  return { n, ok: Math.min(n, count(v.ok)) };
}
const isWho = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isMode = (v: unknown): v is QuestionMode => v === 'name' || v === 'art';
const isFind = (v: unknown): v is FindKind => v === 'azurite' || v === 'flare' || v === 'dynamite';
/** Lives or wards one answer can take: a cave-in takes at most two. */
const isLoss = (v: unknown) => v === 0 || v === 1 || v === 2;
/** A Delve depth (a whole number from 1), or 0. */
const depth = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1e6 ? v : 0);
function delveItem(v: unknown): DelveItem | undefined {
  if (!isObj(v)) return undefined;
  const t = tally(v);
  if (!t.n) return undefined;
  // Never more than there were answers (wrong ones, for those a ward took).
  const upTo = (x: unknown, max: number) => Math.min(max, count(x)) || undefined;
  const finds = upTo(v.finds, t.n);
  const blasted = upTo(v.blasted, t.n);
  // A wrong answer breaks at most two wards or takes two lives (a cave-in).
  const warded = upTo(v.warded, 2 * (t.n - t.ok));
  const lives = v.lives === undefined ? undefined : Math.min(2 * (t.n - t.ok), count(v.lives));
  const cost = lives ?? t.n - t.ok - Math.min(warded ?? 0, t.n - t.ok);
  // A right answer has a depth, a wrong one too; without one the depth is unknown (0).
  return {
    ...t,
    deepest: t.ok ? depth(v.deepest) : 0,
    lostAt: cost > 0 ? depth(v.lostAt) : 0,
    ...(finds ? { finds } : {}),
    ...(blasted ? { blasted } : {}),
    ...(warded ? { warded } : {}),
    ...(lives !== undefined ? { lives } : {}),
  };
}

/** A stored codex, cleaned up; null when it's missing, malformed or from another version. */
export function parseCodex(raw: string | null): Codex | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || v.v !== CODEX_VERSION || !isObj(v.items)) return null;
  const c = emptyCodex();
  for (const [id, e] of Object.entries(v.items)) {
    if (!isObj(e)) continue;
    const mixed: Record<string, number> = {};
    if (isObj(e.mixed)) for (const [k, n] of Object.entries(e.mixed)) if (count(n) > 0) mixed[k] = count(n);
    const dv = delveItem(e.delve);
    c.items[id] = {
      seen: Math.max(1, count(e.seen)),
      first: time(e.first),
      last: time(e.last),
      name: tally(e.name),
      art: tally(e.art),
      mixed,
      ...(dv ? { delve: dv } : {}),
    };
  }
  if (Array.isArray(v.log))
    for (const a of v.log.slice(-LOG_LIMIT)) {
      if (!isObj(a) || typeof a.id !== 'string' || !isMode(a.mode) || typeof a.ok !== 'boolean') continue;
      const ms = count(a.ms);
      const d = depth(a.depth);
      const run = typeof a.run === 'number' && Number.isSafeInteger(a.run) && a.run >= 0 ? a.run : null;
      c.log.push({
        t: time(a.t),
        id: a.id,
        mode: a.mode,
        ok: a.ok,
        difficulty: difficultyOf(a.difficulty),
        race: a.race === true,
        ...(ms ? { ms } : {}),
        ...(d && run !== null ? { depth: d, run } : {}),
        ...(a.warded === true && !a.ok ? { warded: true as const } : {}),
        ...(d && isFind(a.find) ? { find: a.find } : {}),
        ...(d && a.ok && ITEM_KINDS.includes(a.gained as ItemKind) ? { gained: a.gained as ItemKind } : {}),
        ...(d && a.flared === true ? { flared: true as const } : {}),
        ...(d && !a.ok && isLoss(a.lives) && isLoss(a.wards) ? { lives: a.lives as number, wards: a.wards as number } : {}),
        ...(d && a.blasted === true ? { blasted: true as const } : {}),
        ...(d && a.team === true ? { team: true as const } : {}),
        ...(d && run !== null && isWho(a.who) ? { who: a.who } : {}),
      });
    }
  if (isObj(v.byDifficulty))
    for (const [d, t] of Object.entries(v.byDifficulty)) if (difficultyOf(d) === d) c.byDifficulty[d as Difficulty] = tally(t);
  if (isObj(v.fooled))
    for (const [name, f] of Object.entries(v.fooled))
      if (isObj(f) && typeof f.of === 'string' && count(f.n) > 0) c.fooled[name] = { of: f.of, n: count(f.n), last: time(f.last) };
  c.streak = count(v.streak);
  c.best = Math.max(c.streak, count(v.best));
  if (isObj(v.fastest) && typeof v.fastest.id === 'string' && count(v.fastest.ms) > 0) c.fastest = { ms: count(v.fastest.ms), id: v.fastest.id };
  if (isObj(v.byDepth))
    for (const [k, t] of Object.entries(v.byDepth)) {
      const d = depth(Number(k));
      const n = tally(t);
      if (d && n.n) c.byDepth[d] = n;
    }
  return c;
}

export const serializeCodex = (c: Codex) => JSON.stringify({ v: CODEX_VERSION, ...c });

// ---- storage ---------------------------------------------------------------

/** What is stored: the codex, or while there is none yet, the one under the old name (null for neither). */
const storedRaw = (raw: string | null) => raw ?? readStored(LEGACY);

/** The stored codex (empty when there is none, or it can't be read; never written over for that). Always read fresh: another tab may have added to it. */
export function loadCodex(): Codex {
  return parseCodex(storedRaw(readStored(CODEX))) ?? emptyCodex();
}

/** Whether it could be stored. When storage is full, the older half of the log goes first. */
function write(c: Codex): boolean {
  for (let log = c.log; ; log = log.slice(Math.ceil(log.length / 2))) {
    if (writeStored(CODEX, serializeCodex({ ...c, log }))) return true;
    if (!log.length) return false;
  }
}

/** Changes the stored codex: not over one a newer build wrote, and anything else unreadable kept aside first. */
function update(change: (c: Codex) => Codex) {
  const raw = tryReadStored(CODEX);
  if (raw === undefined) return;
  // The first time, it starts from the old name's (left as it is).
  const stored = parseCodex(storedRaw(raw));
  if (raw && !stored && !makeRoom(CODEX, raw, CODEX_VERSION)) return;
  const prev = stored ?? emptyCodex();
  const next = change(prev);
  if (next !== prev) write(next);
}

/** Adds an encounter to the stored codex. */
export function recordEncounter(e: Encounter) {
  update((c) => record(c, e));
}

/**
 * Items met outside a game (today's unique on the start page, and in "Find
 * the art" a wrong pick, which the reveal names): seen, no answer counted.
 */
export function recordSeen(at: number, mode: QuestionMode, ids: string[]) {
  // (Difficulty and race only count with an answer.)
  update((c) => ids.reduce((x, itemId) => record(x, { at, itemId, mode, difficulty: 'custom', race: false }), c));
}

// ---- practice ----------------------------------------------------------

/**
 * Answers to the start page's practice questions: only how many were
 * right. They find no item and touch nothing in the codex (answers to be
 * had without end, they'd fill it without a game). Stored apart from it,
 * so a build from before them, writing the codex, can't drop them.
 */
const PRACTICE = 'practice';
export const PRACTICE_KEY = storeKey(PRACTICE);

/** A stored practice tally, or null when there is none or it can't be read. */
function parsePractice(raw: string | null): Tally | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isObj(v) ? tally(v) : null;
  } catch {
    return null;
  }
}

/** The stored practice tally (none when there is none, or it can't be read). */
export function loadPractice(): Tally {
  return parsePractice(readStored(PRACTICE)) ?? noTally();
}

/**
 * Adds a practice answer (the start page's) to its tally: as the codex is
 * written, never over a tally that couldn't be read (one that read wrong is
 * kept aside first), and when storage is full, room is made as the codex
 * makes it, its log's older half going.
 */
export function recordPractice(ok: boolean) {
  const raw = tryReadStored(PRACTICE);
  if (raw === undefined) return;
  const was = parsePractice(raw);
  if (raw && !was && !makeRoom(PRACTICE, raw, CODEX_VERSION)) return;
  const next = JSON.stringify(add(was ?? noTally(), ok));
  if (writeStored(PRACTICE, next)) return;
  const c = loadCodex();
  if (c.log.length && write({ ...c, log: c.log.slice(Math.ceil(c.log.length / 2)) })) writeStored(PRACTICE, next);
}

/**
 * Erases the codex, the old name's it started from and what was kept aside.
 * An empty codex is left in its place, so an older build's, written again
 * meanwhile under the old name, is never taken up.
 */
export function resetCodex() {
  removeStored(PRACTICE);
  clearAside(PRACTICE);
  for (const name of [CODEX, LEGACY]) {
    removeStored(name);
    clearAside(name);
  }
  writeStored(CODEX, serializeCodex(emptyCodex()));
}
