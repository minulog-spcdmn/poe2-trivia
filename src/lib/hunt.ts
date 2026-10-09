// Quick hunts: a turns game alone on this device, to 5 on a preset, started
// in one tap from the start page (Play now) or the empty Codex. This browser
// keeps a small record of them: how many it finished, the fewest questions it
// took to reach 5 on each difficulty, and the difficulty last chosen (Play
// now's chips). Stored apart from the codex, through lib/storage.ts, and
// never written over when this build can't read it (lib/keepAside.ts).
// Also when a turns reveal begins (newReveal), which the Codex ticker under
// the answers follows (Session.discovery), and the tally of a turns game's
// reveals that its end screen recaps (tallyHunt, HuntRecap.svelte).

import { CODEX_NAMES } from './delveRecord.ts';
import type { GameState, Preset } from './game.ts';
import { clearAside, makeRoom } from './keepAside.ts';
import { removeStored, tryReadStored, writeStored } from './storage.ts';

/** A quick hunt is to this many points... */
export const QUICK_TARGET = 5;
/** ...with this many seconds a question... */
export const QUICK_TIMER = 16;
/** ...on this difficulty, until another is chosen (and always for a newcomer). */
export const QUICK_DEFAULT: Preset = 'cruel';
/** The difficulties Play now offers, in order. */
export const QUICK_PRESETS: readonly Preset[] = ['cruel', 'merciless', 'eternal'];

export const HUNTS = 'hunts';
/** Bump when the stored shape changes incompatibly. */
export const HUNTS_VERSION = 1;

/** A hunt's points (right) and the questions it took (asked). */
export interface HuntBest {
  right: number;
  asked: number;
}

export interface Hunts {
  /** Quick hunts finished. */
  games: number;
  /** The one with the fewest questions, per difficulty. */
  best: Partial<Record<Preset, HuntBest>>;
  /** The difficulty last played or chosen. */
  last?: Preset;
  /** When the last hunt ended. */
  lastAt?: number;
  /** The last one recorded (its startedAt), so a game is never counted twice. */
  game?: number;
}

/** A hunt as it ended. */
export interface HuntRun {
  difficulty: Preset;
  right: number;
  asked: number;
  /** Its startedAt. */
  game: number;
  /** When it ended. */
  at: number;
}

/** How a hunt measured up. `first`: this browser's first; `best`: fewer questions than ever on its difficulty. */
export interface HuntMeasure {
  hunts: Hunts;
  first: boolean;
  best: boolean;
  previousBest: HuntBest | null;
}

export const emptyHunts = (): Hunts => ({ games: 0, best: {} });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export const isQuickPreset = (v: unknown): v is Preset => QUICK_PRESETS.includes(v as Preset);

/** The stored record, or null when it is unreadable (damaged, or another version's). Anything odd inside is dropped. */
export function parseHunts(raw: string | null): Hunts | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || v.v !== HUNTS_VERSION) return null;
  const h = emptyHunts();
  if (isCount(v.games)) h.games = v.games;
  if (isObj(v.best))
    for (const [d, b] of Object.entries(v.best))
      if (isQuickPreset(d) && isObj(b) && isCount(b.right) && isCount(b.asked) && b.right >= 1 && b.right <= b.asked)
        h.best[d] = { right: b.right, asked: b.asked };
  if (isQuickPreset(v.last)) h.last = v.last;
  if (isTime(v.lastAt)) h.lastAt = v.lastAt;
  if (isTime(v.game)) h.game = v.game;
  return h;
}

export const serializeHunts = (h: Hunts) => JSON.stringify({ v: HUNTS_VERSION, ...h });

/** The record with a hunt added; the same game a second time changes nothing. */
export function addHunt(h: Hunts, run: HuntRun): HuntMeasure {
  const previousBest = h.best[run.difficulty] ?? null;
  if (h.game === run.game) return { hunts: h, first: false, best: false, previousBest };
  const best = !previousBest || run.asked < previousBest.asked;
  return {
    hunts: {
      ...h,
      games: h.games + 1,
      best: best ? { ...h.best, [run.difficulty]: { right: run.right, asked: run.asked } } : h.best,
      last: run.difficulty,
      lastAt: run.at,
      game: run.game,
    },
    first: h.games === 0,
    best,
    previousBest,
  };
}

/** The stored record (empty when there is none or it can't be read; never written over for that). Read fresh: another tab may have added to it. */
export function loadHunts(): Hunts {
  const raw = tryReadStored(HUNTS);
  return (raw ? parseHunts(raw) : null) ?? emptyHunts();
}

/**
 * The record to build on, or null when nothing may be written: storage can't
 * be read, or it holds a newer build's record (left as it is). Anything else
 * unreadable is kept aside first.
 */
function writable(): Hunts | null {
  const raw = tryReadStored(HUNTS);
  if (raw === undefined) return null;
  if (raw === null) return emptyHunts();
  const h = parseHunts(raw);
  if (h) return h;
  return makeRoom(HUNTS, raw, HUNTS_VERSION) ? emptyHunts() : null;
}

/** Records a finished hunt; returns how it measured up (null when it couldn't be stored). */
export function recordHunt(run: HuntRun): HuntMeasure | null {
  const was = writable();
  if (!was) return null;
  const m = addHunt(was, run);
  if (m.hunts !== was && !writeStored(HUNTS, serializeHunts(m.hunts))) return null;
  return m;
}

/** Forgets every hunt (the Codex's erase, which takes every record with it). */
export function resetHunts() {
  removeStored(HUNTS);
  clearAside(HUNTS);
}

/** Remembers the difficulty chosen for Play now. */
export function setQuickDifficulty(d: Preset) {
  const h = writable();
  if (h && h.last !== d) writeStored(HUNTS, serializeHunts({ ...h, last: d }));
}

/**
 * Whether this browser has never played: nothing in its codex (its names are
 * delveRecord.ts's, read raw so the codex's chunk stays unloaded) and no hunt
 * recorded. Storage that can't be read never counts as new.
 */
export function isNewcomer(): boolean {
  return CODEX_NAMES.every((n) => tryReadStored(n) === null) && !loadHunts().games;
}

/**
 * What a join from this browser carries: while it has never played, the
 * player joins as an Initiate (game.ts INITIATE_GRACE: three gentle questions).
 */
export function initiateFlag(): { initiate?: true } {
  return isNewcomer() ? { initiate: true } : {};
}

/** At most this many Initiates are remembered by a room's host (initiatesKept). */
export const INITIATES_MAX = 400;

/**
 * The players a room's host remembers as Initiates (Session's HostPrivate),
 * after a state change: everyone seated with gentle questions left, and
 * everyone watching who joined as one, so the next join of theirs (a
 * reconnect, after the host's own refresh, a lobby that let their seat go)
 * seats them as an Initiate again, whatever their browser says by then (it
 * stops being new with the first reveal it records). Once seated with none
 * left, they're forgotten. Unchanged: the same array.
 */
export function initiatesKept(kept: readonly string[], s: GameState): readonly string[] {
  const out = new Set(kept);
  for (const p of s.players)
    if ((p.grace ?? 0) > 0) out.add(p.id);
    else out.delete(p.id);
  for (const o of s.spectators ?? []) if (o.initiate) out.add(o.id);
  if (out.size === kept.length && kept.every((id) => out.has(id))) return kept;
  // The oldest ones first, the same order as kept.
  return [...out].slice(-INITIATES_MAX);
}

/** A turns reveal as it begins: its question (askedAt), the item, whether the player answering got it, and who that was. */
export interface RevealSeen {
  at: number;
  id: string;
  ok: boolean;
  by: string;
}

/**
 * The reveal a turns game's state change begins, or null: once per question,
 * however often its reveal state comes again (a guest joining, the room
 * going public), and never on the first state seen (a reload into a reveal
 * saw it before). Races and Delve have none.
 */
export function newReveal(prev: GameState | null, next: GameState): RevealSeen | null {
  const q = next.question;
  const r = next.reveal;
  if (!prev || next.phase !== 'reveal' || !q || !r || next.delve || next.settings.mode === 'race') return null;
  if (prev.phase === 'reveal' && prev.question?.askedAt === q.askedAt) return null;
  return { at: q.askedAt, id: r.correctId, ok: r.correct, by: next.players[next.turn]?.id ?? '' };
}

/** One reveal as the recap keeps it: the question (askedAt), the item, who answered, whether they got it, and whether the item was new to this browser's codex. */
export interface TallySeen {
  at: number;
  id: string;
  by: string;
  ok: boolean;
  fresh: boolean;
}

/** A player's part in the game, as far as this device saw it: right answers, questions asked, and the longest run of right answers. */
export interface TallyPlayer {
  right: number;
  asked: number;
  peak: number;
}

/**
 * A turns game as this device saw it, for its end screen's recap: every
 * reveal in order, and each player's count. Kept in the tab's session
 * storage (Session.huntTally), so a reload on the end screen keeps it.
 */
export interface HuntTally {
  /** The game's startedAt. */
  game: number;
  seen: TallySeen[];
  players: Record<string, TallyPlayer>;
  /** The achievements this browser had earned as the game began, once read (Session.earnedAtStart). */
  earned?: string[];
  /** How many of the game's items this browser's codex held as the game began, once read. */
  known?: number;
  /** A quick hunt, once recorded: how it measured up (Session.huntResult), which a reload can't work out again. */
  result?: HuntResult;
}

/** How a quick hunt measured up as it ended (HuntMeasure, without the record), with its points and questions. */
export interface HuntResult {
  first: boolean;
  best: boolean;
  previousBest: HuntBest | null;
  right: number;
  asked: number;
}

/** At most this many reveals are kept (a long game's recap shows the latest). */
export const TALLY_MAX = 300;

/**
 * The tally after a state change: a new one as a turns game starts (a new
 * startedAt), one more reveal as each begins (newReveal: once each, never on
 * a reload into one), and unchanged (the same object) otherwise. `fresh`:
 * the revealed item was new to the codex (Session.discovery). Null outside a
 * turns game under way: a lobby, a race, a Delve run.
 */
export function tallyHunt(t: HuntTally | null, prev: GameState | null, next: GameState, fresh: boolean): HuntTally | null {
  const game = next.startedAt;
  if (!game || next.delve || next.settings.mode === 'race' || next.phase === 'lobby') return null;
  let out = t?.game === game ? t : { game, seen: [], players: {} };
  const r = newReveal(prev, next);
  if (!r || !r.by || out.seen.some((x) => x.at === r.at)) return out;
  const was = out.players[r.by] ?? { right: 0, asked: 0, peak: 0 };
  // The engine has counted this answer into the streak already.
  const streak = next.players.find((p) => p.id === r.by)?.streak ?? 0;
  out = {
    ...out,
    seen: [...out.seen, { at: r.at, id: r.id, by: r.by, ok: r.ok, fresh }].slice(-TALLY_MAX),
    players: { ...out.players, [r.by]: { right: was.right + (r.ok ? 1 : 0), asked: was.asked + 1, peak: Math.max(was.peak, streak) } },
  };
  return out;
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

/** A stored tally, cleaned up; null when it is missing or malformed. */
export function parseTally(raw: string | null): HuntTally | null {
  let v: unknown;
  try {
    v = JSON.parse(raw ?? 'null');
  } catch {
    return null;
  }
  if (!isObj(v) || !isTime(v.game) || !v.game || !Array.isArray(v.seen) || !isObj(v.players)) return null;
  const seen: TallySeen[] = [];
  for (const x of v.seen.slice(-TALLY_MAX))
    if (isObj(x) && isTime(x.at) && isId(x.id) && isId(x.by) && typeof x.ok === 'boolean' && typeof x.fresh === 'boolean')
      seen.push({ at: x.at, id: x.id, by: x.by, ok: x.ok, fresh: x.fresh });
  const players: Record<string, TallyPlayer> = {};
  for (const [id, p] of Object.entries(v.players))
    if (isId(id) && isObj(p) && isCount(p.right) && isCount(p.asked) && isCount(p.peak) && p.right <= p.asked)
      players[id] = { right: p.right, asked: p.asked, peak: p.peak };
  const t: HuntTally = { game: v.game, seen, players };
  if (Array.isArray(v.earned)) t.earned = v.earned.filter(isId).slice(0, 200);
  if (isCount(v.known)) t.known = v.known;
  const r = v.result;
  const was = isObj(r) ? r.previousBest : undefined;
  const previousBest = isObj(was) && isCount(was.right) && isCount(was.asked) ? { right: was.right, asked: was.asked } : was === null ? null : undefined;
  if (isObj(r) && typeof r.first === 'boolean' && typeof r.best === 'boolean' && previousBest !== undefined && isCount(r.right) && isCount(r.asked))
    t.result = { first: r.first, best: r.best, previousBest, right: r.right, asked: r.asked };
  return t;
}
