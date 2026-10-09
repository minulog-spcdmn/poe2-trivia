// Quick hunts: a turns game alone on this device, to 5 on a preset, started
// in one tap from the start page (Play now) or the empty Codex. This browser
// keeps a small record of them: how many it finished, the fewest questions it
// took to reach 5 on each difficulty, and the difficulty last chosen (Play
// now's chips). Stored apart from the codex, through lib/storage.ts, and
// never written over when this build can't read it (lib/keepAside.ts).

import type { Preset } from './game.ts';
import { makeRoom } from './keepAside.ts';
import { tryReadStored, writeStored } from './storage.ts';

/** A quick hunt is to this many points... */
export const QUICK_TARGET = 5;
/** ...with this many seconds a question... */
export const QUICK_TIMER = 16;
/** ...on this difficulty, until another is chosen (and always for a newcomer). */
export const QUICK_DEFAULT: Preset = 'cruel';
/** The difficulties Play now offers, in order. */
export const QUICK_PRESETS: readonly Preset[] = ['cruel', 'merciless', 'eternal'];

/**
 * Where the codex is stored (codex.ts: its name, and the one builds before it
 * used). codex.ts is a chunk of its own, loaded later, so the names are kept
 * here too; a test pins them to codex.ts's.
 */
export const CODEX_NAMES = ['codex2', 'codex'];

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

/** Remembers the difficulty chosen for Play now. */
export function setQuickDifficulty(d: Preset) {
  const h = writable();
  if (h && h.last !== d) writeStored(HUNTS, serializeHunts({ ...h, last: d }));
}

/**
 * Whether this browser has never played: nothing in its codex and no hunt
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
