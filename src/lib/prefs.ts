// The host's room settings, remembered in this browser so the next room they
// open starts the way they left the last one.

import { DEFAULT_SETTINGS, isDifficulty, type Difficulty, type GameMode, type Settings } from './game.ts';

export interface RoomPrefs {
  targetScore: number;
  timer: number;
  difficulty: Difficulty;
  mode: GameMode;
  public: boolean;
  /** Streamer mode: don't show the room code on screen. */
  hideCode: boolean;
}

/** Bump when the stored shape changes: entries from another version are replaced with the defaults. */
export const PREFS_VERSION = 1;
export const PREFS_KEY = 'poe2trivia.roomPrefs';
/** Where "hide the room code" was kept before the other settings were remembered too. */
const LEGACY_HIDE_KEY = 'poe2trivia.hideCode';

export const DEFAULT_PREFS: RoomPrefs = {
  targetScore: DEFAULT_SETTINGS.targetScore,
  timer: DEFAULT_SETTINGS.timer,
  difficulty: DEFAULT_SETTINGS.difficulty,
  mode: 'race',
  public: false,
  hideCode: false,
};

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** A stored entry, or null when it's missing, malformed or from another version. */
export function parsePrefs(raw: string | null): RoomPrefs | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.v !== PREFS_VERSION) return null;
  // Same limits the game itself applies to settings.
  if (!isInt(o.targetScore, 1, 50) || !isInt(o.timer, 0, 120)) return null;
  if (!isDifficulty(o.difficulty) || (o.mode !== 'turns' && o.mode !== 'race')) return null;
  if (typeof o.public !== 'boolean' || typeof o.hideCode !== 'boolean') return null;
  return {
    targetScore: o.targetScore,
    timer: o.timer,
    difficulty: o.difficulty,
    mode: o.mode,
    public: o.public,
    hideCode: o.hideCode,
  };
}

export const serializePrefs = (p: RoomPrefs) => JSON.stringify({ v: PREFS_VERSION, ...p });

function write(p: RoomPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, serializePrefs(p));
  } catch {
    /* ignore */
  }
}

/**
 * The saved settings. A missing, malformed or outdated entry is replaced with
 * the defaults (keeping a hidden room code from before, so a streamer's code
 * doesn't suddenly show up on screen).
 */
export function loadPrefs(): RoomPrefs {
  let raw: string | null = null;
  let legacyHide = false;
  try {
    raw = localStorage.getItem(PREFS_KEY);
    legacyHide = localStorage.getItem(LEGACY_HIDE_KEY) === '1';
  } catch {
    return { ...DEFAULT_PREFS };
  }
  const saved = parsePrefs(raw);
  if (saved) return saved;
  const fresh = { ...DEFAULT_PREFS, hideCode: legacyHide };
  write(fresh);
  try {
    localStorage.removeItem(LEGACY_HIDE_KEY);
  } catch {
    /* ignore */
  }
  return fresh;
}

let current: RoomPrefs | null = null;

export function roomPrefs(): RoomPrefs {
  return (current ??= loadPrefs());
}

export function savePrefs(change: Partial<RoomPrefs>) {
  const next = { ...roomPrefs(), ...change };
  const prev = current!;
  if ((Object.keys(next) as (keyof RoomPrefs)[]).every((k) => next[k] === prev[k])) return;
  current = next;
  write(next);
}

/** The game settings a new room starts with. */
export function roomSettings(p: RoomPrefs = roomPrefs()): Settings {
  return {
    ...DEFAULT_SETTINGS,
    targetScore: p.targetScore,
    timer: p.timer,
    difficulty: p.difficulty,
    mode: p.mode,
    public: p.public,
    locked: false,
  };
}

/** The part of a room's settings worth remembering (whether it's locked is not). */
export const prefsFrom = (s: Settings): Partial<RoomPrefs> => ({
  targetScore: s.targetScore,
  timer: s.timer,
  difficulty: s.difficulty,
  mode: s.mode,
  public: !!s.public,
});
