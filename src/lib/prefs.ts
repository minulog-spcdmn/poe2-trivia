// The host's room settings, remembered in this browser so the next room they
// open starts the way they left the last one.

import { DEFAULT_SETTINGS, difficultyOf, isDifficulty, type Difficulty, type GameMode, type Settings } from './game.ts';

export interface RoomPrefs {
  targetScore: number;
  timer: number;
  difficulty: Difficulty;
  mode: GameMode;
  public: boolean;
  /** Streamer mode: don't show the room code on screen. */
  hideCode: boolean;
  /**
   * The host pressed the eye themselves. Only then does their choice hide the
   * code from guests too: the hidden default alone must not lock a whole room.
   */
  hideCodeChosen: boolean;
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
  // Hidden until the host shows it, so a streamer can't put it on screen by accident.
  hideCode: true,
  hideCodeChosen: false,
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
  // Entries saved before this existed lack it: the eye was never pressed since.
  if (o.hideCodeChosen !== undefined && typeof o.hideCodeChosen !== 'boolean') return null;
  return {
    targetScore: o.targetScore,
    timer: o.timer,
    difficulty: o.difficulty,
    mode: o.mode,
    public: o.public,
    hideCode: o.hideCode,
    hideCodeChosen: o.hideCodeChosen === true,
  };
}

export const serializePrefs = (p: RoomPrefs) => JSON.stringify({ v: PREFS_VERSION, ...p });

/** Whether the entry could be stored. */
function write(p: RoomPrefs): boolean {
  try {
    localStorage.setItem(PREFS_KEY, serializePrefs(p));
    return true;
  } catch {
    return false;
  }
}

/**
 * The saved settings. A missing, malformed or outdated entry is replaced with
 * the defaults (which hide the room code, so a streamer's code doesn't
 * suddenly show up on screen).
 */
export function loadPrefs(): RoomPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFS_KEY);
  } catch {
    return { ...DEFAULT_PREFS };
  }
  const saved = parsePrefs(raw);
  if (saved) return saved;
  const fresh = { ...DEFAULT_PREFS };
  // The old key goes only once the new entry holds its value.
  if (write(fresh)) {
    try {
      localStorage.removeItem(LEGACY_HIDE_KEY);
    } catch {
      /* ignore */
    }
  }
  return fresh;
}

/** Always read fresh: another tab may have changed them since this page loaded. */
export const roomPrefs = loadPrefs;

/** Stores the changed fields, keeping whatever is saved for the rest (maybe by another tab). */
export function savePrefs(change: Partial<RoomPrefs>) {
  const prev = loadPrefs();
  const next = { ...prev, ...change };
  // Never store what loadPrefs would throw away (and with it, a hidden room code).
  if (!parsePrefs(serializePrefs(next))) return;
  if ((Object.keys(next) as (keyof RoomPrefs)[]).every((k) => next[k] === prev[k])) return;
  write(next);
}

/** Whether a room this host opens hides the code from its guests too. */
export const hostHidesCode = (p: RoomPrefs = roomPrefs()) => p.hideCode && p.hideCodeChosen;

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
    hideCode: hostHidesCode(p),
  };
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;

/**
 * The part of a room's settings worth remembering (whether it's locked is
 * not), made valid first: a room saved by an older build may lack some.
 */
export const prefsFrom = (s: Settings): Partial<RoomPrefs> => ({
  targetScore: clampInt(s.targetScore, 1, 50, DEFAULT_PREFS.targetScore),
  timer: clampInt(s.timer, 0, 120, DEFAULT_PREFS.timer),
  difficulty: difficultyOf(s.difficulty),
  // Rooms from before race mode existed played in turns.
  mode: s.mode === 'race' ? 'race' : 'turns',
  public: !!s.public,
});
