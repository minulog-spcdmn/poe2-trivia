// The host's room settings, remembered in this browser so the next room they
// open starts the way they left the last one.

import { DEFAULT_SETTINGS, cleanKnobs, difficultyOf, isDifficulty, snapTimer, type Difficulty, type GameMode, type Knobs, type Settings } from './game.ts';
import { removeLegacy, storeKey, tryReadStored, writeStored } from './storage.ts';

export interface RoomPrefs {
  targetScore: number;
  timer: number;
  difficulty: Difficulty;
  /** The host's last custom difficulty (missing until they first pick it). */
  custom?: Knobs;
  mode: GameMode;
  public: boolean;
  /** Streamer mode: don't show the room code on screen. */
  hideCode: boolean;
}

/** Bump when the stored shape changes: entries from another version are replaced with the defaults. */
export const PREFS_VERSION = 1;
const PREFS = 'roomPrefs';
export const PREFS_KEY = storeKey(PREFS);
/** Where "hide the room code" was kept before the other settings were remembered too. */
const LEGACY_HIDE_KEY = 'poe2trivia.hideCode';

export const DEFAULT_PREFS: RoomPrefs = {
  targetScore: DEFAULT_SETTINGS.targetScore,
  timer: DEFAULT_SETTINGS.timer,
  difficulty: DEFAULT_SETTINGS.difficulty,
  mode: 'turns',
  public: false,
  // Hidden until the host shows it, so a streamer can't put it on screen by accident.
  hideCode: true,
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
    // Older builds offered other steps: take the nearest one.
    timer: snapTimer(o.timer),
    difficulty: o.customOn === true && o.custom !== undefined ? 'custom' : o.difficulty,
    // Added later: knobs another build allowed are snapped to this one's, and the rest is kept.
    ...(o.custom === undefined ? {} : { custom: cleanKnobs(o.custom) }),
    mode: o.mode,
    public: o.public,
    hideCode: o.hideCode,
  };
}

/**
 * Custom is stored as a flag next to a preset, so a tab still running a build
 * from before Custom reads the entry (with the preset) instead of throwing
 * every saved setting away.
 */
export const serializePrefs = (p: RoomPrefs) =>
  JSON.stringify({
    v: PREFS_VERSION,
    ...p,
    ...(p.difficulty === 'custom' ? { difficulty: DEFAULT_SETTINGS.difficulty, customOn: true } : {}),
  });

/** Whether the entry could be stored. */
function write(p: RoomPrefs): boolean {
  return writeStored(PREFS, serializePrefs(p));
}

/**
 * The saved settings. A missing, malformed or outdated entry is replaced with
 * the defaults (which hide the room code, so a streamer's code doesn't
 * suddenly show up on screen).
 */
export function loadPrefs(): RoomPrefs {
  const raw = tryReadStored(PREFS);
  // Unreadable isn't missing: leave whatever is stored alone.
  if (raw === undefined) return { ...DEFAULT_PREFS };
  const saved = parsePrefs(raw);
  if (saved) return saved;
  const fresh = { ...DEFAULT_PREFS };
  // The old key goes only once the new entry holds its value.
  if (write(fresh)) removeLegacy(LEGACY_HIDE_KEY);
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
  if (serializePrefs(next) === serializePrefs(prev)) return;
  write(next);
}

/** The game settings a new room starts with. */
export function roomSettings(p: RoomPrefs = roomPrefs()): Settings {
  return {
    ...DEFAULT_SETTINGS,
    targetScore: p.targetScore,
    timer: p.timer,
    difficulty: p.difficulty,
    ...(p.custom ? { custom: { ...p.custom } } : {}),
    mode: p.mode,
    public: p.public,
    locked: false,
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
  timer: snapTimer(clampInt(s.timer, 0, 120, DEFAULT_PREFS.timer)),
  difficulty: difficultyOf(s.difficulty),
  // Only once the room has one, so a room that never used it keeps the saved one.
  ...(s.custom ? { custom: cleanKnobs(s.custom) } : {}),
  // Rooms from before race mode existed played in turns.
  mode: s.mode === 'race' ? 'race' : 'turns',
  public: !!s.public,
});
