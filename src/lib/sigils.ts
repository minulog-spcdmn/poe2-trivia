// The class sigils this browser's player has unlocked and the one they wear
// (lib/classSigils.ts), kept in localStorage beside the achievements and
// never sent anywhere but as the one worn.
//
// Each achievement earned (lib/achievements.ts) unlocks one sigil, of the
// class the player picks, so the first can be their main and every class
// is as easy to come by as the next, ones not in the game yet included. One
// unlocked stays unlocked, also when the achievements are erased with the
// codex: those earned afresh then unlock more only once there are more of
// them than sigils already unlocked. Like the achievements, it's on the
// player's own device, so nothing stops them fooling themselves.

import { achievementById, loadAchievements, type AchievementStore } from './achievements.ts';
import { CLASSES, isPlayerClass, type PlayerClass } from './classSigils.ts';
import { openStored } from './keepAside.ts';
import { storeKey, tryReadStored, writeStored } from './storage.ts';

export interface SigilStore {
  /** The classes unlocked, in the order they were. */
  unlocked: PlayerClass[];
  /** The one worn, if any: one of `unlocked`. */
  worn: PlayerClass | null;
}

export const emptySigils = (): SigilStore => ({ unlocked: [], worn: null });

const NAME = 'sigils';
/** The whole key, as storage events name it. */
export const SIGILS_KEY = storeKey(NAME);
/** Bump when the stored shape changes incompatibly. */
export const SIGILS_VERSION = 1;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A stored entry, cleaned up; null when it's missing, malformed or from another version. */
export function parseSigils(raw: string | null): SigilStore | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || v.v !== SIGILS_VERSION || !Array.isArray(v.unlocked)) return null;
  const unlocked = [...new Set(v.unlocked.filter(isPlayerClass))];
  return { unlocked, worn: isPlayerClass(v.worn) && unlocked.includes(v.worn) ? v.worn : null };
}

export const serializeSigils = (s: SigilStore) => JSON.stringify({ v: SIGILS_VERSION, ...s });

/** How many achievements in `store` this build knows, each worth a sigil. */
export const achievementsIn = (store: AchievementStore) => Object.keys(store.earned).filter((id) => achievementById.has(id)).length;

/** How many more sigils can be unlocked with `achievements` earned. */
export const sigilsToUnlock = (s: SigilStore, achievements: number) => Math.max(0, Math.min(achievements, CLASSES.length) - s.unlocked.length);

/** `s` with `c` unlocked and worn; `s` itself when it's unlocked already or there's none to unlock. */
export function unlock(s: SigilStore, c: PlayerClass, achievements: number): SigilStore {
  if (s.unlocked.includes(c) || !sigilsToUnlock(s, achievements)) return s;
  return { unlocked: [...s.unlocked, c], worn: c };
}

/** `s` with `c` worn (null: none); `s` itself when `c` isn't unlocked. */
export function wear(s: SigilStore, c: PlayerClass | null): SigilStore {
  return c === null || s.unlocked.includes(c) ? { ...s, worn: c } : s;
}

// ---- storage -------------------------------------------------------------------

/** The stored sigils (none when there are none, or they can't be read). Always read fresh: another tab may have changed them. */
export function loadSigils(): SigilStore {
  return parseSigils(tryReadStored(NAME) ?? null) ?? emptySigils();
}

/**
 * Changes the stored sigils by `change`, and says where they stand now; null
 * when they can't be written (storage blocked, or a newer build's, which are
 * never written over). Anything else unreadable is kept aside first.
 */
function change(change: (s: SigilStore) => SigilStore): SigilStore | null {
  const o = openStored(NAME, SIGILS_VERSION, parseSigils);
  if (!o) return null;
  const was = o.was ?? emptySigils();
  const next = change(was);
  return next === was || writeStored(NAME, serializeSigils(next)) ? next : null;
}

/** Unlocks `c` with one of the `achievements` earned (those stored, unless given), and wears it. */
export const unlockSigil = (c: PlayerClass, achievements = achievementsIn(loadAchievements())) => change((s) => unlock(s, c, achievements));

/** Wears `c`, one unlocked (null: none). */
export const wearSigil = (c: PlayerClass | null) => change((s) => wear(s, c));
