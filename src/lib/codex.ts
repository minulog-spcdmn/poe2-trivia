// The codex: which items this browser has met in games, and how well its
// player knows them. Kept in localStorage only, never sent anywhere.
//
// Every question this device sees revealed counts as an encounter with its
// answer. Only this device's own answers count toward accuracy: its turn, its
// guess in a race (a turn that runs out of time counts as wrong). Watching
// someone else's turn, losing a race before guessing, or spectating only adds
// "seen". In hot-seat the device can't tell its players apart, so answers
// only count when one person plays alone.

import { difficultyOf, isFake, type Difficulty, type GameState, type QuestionMode } from './game.ts';

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
  /** Real items picked instead of this one, by id, with how often. */
  mixed: Record<string, number>;
}

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
}

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
}

/** What one revealed question means for the codex. */
export interface Encounter {
  /** The question's askedAt: when it was asked, and which question it was. */
  at: number;
  itemId: string;
  mode: QuestionMode;
  difficulty: Difficulty;
  race: boolean;
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

export const CODEX_KEY = 'poe2trivia.codex';
/** Bump when the stored shape changes incompatibly. */
export const CODEX_VERSION = 1;
export const LOG_LIMIT = 2000;
/** "Recent" accuracy looks at this many answers. */
export const RECENT = 100;

export const emptyCodex = (): Codex => ({ items: {}, log: [], byDifficulty: {}, fooled: {}, streak: 0, best: 0, fastest: null });

const noTally = (): Tally => ({ n: 0, ok: 0 });
const add = (t: Tally, ok: boolean): Tally => ({ n: t.n + 1, ok: t.ok + (ok ? 1 : 0) });

/**
 * The encounter a reveal means for this device, or null when there is none.
 * `me`: this device's player online (null in hot-seat).
 */
export function encounterAt(s: GameState, me: string | null, hotSeat: boolean, ms?: number): Encounter | null {
  const q = s.question;
  const r = s.reveal;
  if (s.phase !== 'reveal' || !q || !r || !r.correctId) return null;
  const race = s.settings.mode === 'race';
  const e: Encounter = { at: q.askedAt, itemId: r.correctId, mode: q.mode, difficulty: difficultyOf(s.settings.difficulty), race };
  let picked: number | null;
  let ok: boolean;
  if (race) {
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

/** The codex with the encounter added (the same codex if it was already). */
export function record(c: Codex, e: Encounter): Codex {
  const prev = c.items[e.itemId];
  // The same question again (a rejoin, a second tab in the same room): its
  // askedAt is what tells it apart, so `last` is always the latest question's.
  if (prev && prev.last === e.at) return c;
  const entry: ItemEntry = prev
    ? { ...prev, seen: prev.seen + 1, first: Math.min(prev.first, e.at), last: e.at, mixed: { ...prev.mixed } }
    : { seen: 1, first: e.at, last: e.at, name: noTally(), art: noTally(), mixed: {} };
  const next: Codex = { ...c, items: { ...c.items, [e.itemId]: entry } };
  const a = e.answer;
  if (!a) return next;
  entry[e.mode] = add(entry[e.mode], a.ok);
  next.byDifficulty = { ...c.byDifficulty, [e.difficulty]: add(c.byDifficulty[e.difficulty] ?? noTally(), a.ok) };
  next.streak = a.ok ? c.streak + 1 : 0;
  next.best = Math.max(c.best, next.streak);
  const ms = a.ok && a.ms !== undefined && Number.isFinite(a.ms) && a.ms > 0 ? Math.round(a.ms) : undefined;
  if (ms !== undefined && (!c.fastest || ms < c.fastest.ms)) next.fastest = { ms, id: e.itemId };
  if (!a.ok && a.pickedId) {
    if (isFake(a.pickedId)) {
      // fake:<id of the item it copies>:<which of its fakes>
      const of = a.pickedId.split(':')[1] ?? '';
      if (a.pickedLabel) {
        const was = c.fooled[a.pickedLabel];
        next.fooled = { ...c.fooled, [a.pickedLabel]: { of, n: (was?.n ?? 0) + 1, last: e.at } };
      }
    } else if (a.pickedId !== e.itemId) {
      entry.mixed[a.pickedId] = (entry.mixed[a.pickedId] ?? 0) + 1;
    }
  }
  const log: Answer = { t: e.at, id: e.itemId, mode: e.mode, ok: a.ok, difficulty: e.difficulty, race: e.race, ...(ms !== undefined ? { ms } : {}) };
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
const isMode = (v: unknown): v is QuestionMode => v === 'name' || v === 'art';

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
    c.items[id] = { seen: Math.max(1, count(e.seen)), first: time(e.first), last: time(e.last), name: tally(e.name), art: tally(e.art), mixed };
  }
  if (Array.isArray(v.log))
    for (const a of v.log.slice(-LOG_LIMIT)) {
      if (!isObj(a) || typeof a.id !== 'string' || !isMode(a.mode) || typeof a.ok !== 'boolean') continue;
      const ms = count(a.ms);
      c.log.push({ t: time(a.t), id: a.id, mode: a.mode, ok: a.ok, difficulty: difficultyOf(a.difficulty), race: a.race === true, ...(ms ? { ms } : {}) });
    }
  if (isObj(v.byDifficulty))
    for (const [d, t] of Object.entries(v.byDifficulty)) if (difficultyOf(d) === d) c.byDifficulty[d as Difficulty] = tally(t);
  if (isObj(v.fooled))
    for (const [name, f] of Object.entries(v.fooled))
      if (isObj(f) && typeof f.of === 'string' && count(f.n) > 0) c.fooled[name] = { of: f.of, n: count(f.n), last: time(f.last) };
  c.streak = count(v.streak);
  c.best = Math.max(c.streak, count(v.best));
  if (isObj(v.fastest) && typeof v.fastest.id === 'string' && count(v.fastest.ms) > 0) c.fastest = { ms: count(v.fastest.ms), id: v.fastest.id };
  return c;
}

export const serializeCodex = (c: Codex) => JSON.stringify({ v: CODEX_VERSION, ...c });

// ---- storage ---------------------------------------------------------------

/** The stored codex (empty when there is none, or it can't be read). Always read fresh: another tab may have added to it. */
export function loadCodex(): Codex {
  try {
    return parseCodex(localStorage.getItem(CODEX_KEY)) ?? emptyCodex();
  } catch {
    return emptyCodex();
  }
}

/** Whether it could be stored. When storage is full, the older half of the log goes first. */
function write(c: Codex): boolean {
  for (let log = c.log; ; log = log.slice(Math.ceil(log.length / 2))) {
    try {
      localStorage.setItem(CODEX_KEY, serializeCodex({ ...c, log }));
      return true;
    } catch {
      if (!log.length) return false;
    }
  }
}

/** Adds an encounter to the stored codex. */
export function recordEncounter(e: Encounter) {
  const prev = loadCodex();
  const next = record(prev, e);
  if (next !== prev) write(next);
}

export function resetCodex() {
  try {
    localStorage.removeItem(CODEX_KEY);
  } catch {
    /* ignore */
  }
}
