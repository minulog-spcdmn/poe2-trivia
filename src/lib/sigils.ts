// The class sigils this browser's player has unlocked and the one they wear
// (lib/classSigils.ts), kept in localStorage beside the achievements and
// never sent anywhere but as the one worn, and to the player's own devices,
// paired to sync (lib/sync: absorbSigils).
//
// The first achievement earned (lib/achievements.ts) unlocks a sigil, and
// then every third one another (SIGIL_EVERY), of the class the player picks,
// so the first can be their main and every class is as easy to come by as
// the next, ones not in the game yet included. One unlocked stays unlocked,
// also when the achievements are erased with the codex: those earned afresh
// then unlock more only once they're worth more sigils than are unlocked
// already. Like the achievements, it's on the player's own device, so
// nothing stops them fooling themselves.

import { achievementById, loadAchievements, type AchievementStore } from './achievements.ts';
import { CLASSES, isPlayerClass, type PlayerClass } from './classSigils.ts';
import { openStored } from './keepAside.ts';
import { storeKey, tryReadStored, writeStored } from './storage.ts';

export interface SigilStore {
  /** The classes unlocked, in the order they were. */
  unlocked: PlayerClass[];
  /** The one worn, if any: one of `unlocked`. */
  worn: PlayerClass | null;
  /** When the one worn was put on (or taken off), on this browser's clock: the latest of the player's devices' is worn on all (lib/sync). Missing before it was kept. */
  wornAt?: number;
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
  const wornAt = typeof v.wornAt === 'number' && Number.isSafeInteger(v.wornAt) && v.wornAt > 0 ? v.wornAt : undefined;
  return { unlocked, worn: isPlayerClass(v.worn) && unlocked.includes(v.worn) ? v.worn : null, ...(wornAt ? { wornAt } : {}) };
}

export const serializeSigils = (s: SigilStore) => JSON.stringify({ v: SIGILS_VERSION, ...s });

/** How many achievements in `store` this build knows, the count the sigils go by (sigilsFor). */
export const achievementsIn = (store: AchievementStore) => Object.keys(store.earned).filter((id) => achievementById.has(id)).length;

/** Achievements from one sigil to the next, after the first (which the first achievement unlocks). */
export const SIGIL_EVERY = 3;

/** The achievements it takes for the `n`th sigil (1: the first). */
export const achievementsForSigil = (n: number) => 1 + (n - 1) * SIGIL_EVERY;

/** How many sigils `achievements` earned are worth, at most every class's. */
export const sigilsFor = (achievements: number) => (achievements < 1 ? 0 : Math.min(CLASSES.length, 1 + Math.floor((achievements - 1) / SIGIL_EVERY)));

/** How many more sigils can be unlocked with `achievements` earned. */
export const sigilsToUnlock = (s: SigilStore, achievements: number) => Math.max(0, sigilsFor(achievements) - s.unlocked.length);

/** How many more achievements until another sigil can be unlocked: 0 when one can now, null once every class is. */
export function achievementsToNext(s: SigilStore, achievements: number): number | null {
  if (s.unlocked.length >= CLASSES.length) return null;
  if (sigilsToUnlock(s, achievements)) return 0;
  return achievementsForSigil(Math.max(s.unlocked.length, sigilsFor(achievements)) + 1) - achievements;
}

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
  const changed = change(was);
  const next = changed.worn === was.worn ? changed : { ...changed, wornAt: Date.now() };
  return next === was || writeStored(NAME, serializeSigils(next)) ? next : null;
}

/** This device's sigils as stored, for sync to pass on (lib/sync/shared.ts); null for none. */
export const ownSigilsRaw = () => tryReadStored(NAME) ?? null;

/**
 * Takes in another of the player's devices' sigils: those it unlocked that
 * this one hasn't, and the one it wears if it put that on later. Whether it
 * changed anything.
 */
export function absorbSigils(raw: string): boolean {
  const theirs = parseSigils(raw);
  const o = theirs && openStored(NAME, SIGILS_VERSION, parseSigils);
  if (!theirs || !o) return false;
  const was = o.was ?? emptySigils();
  // (Both devices may have unlocked one with the same achievement, before they were paired: both are kept, as
  // taking one away would be worse; the next sigil just takes the longer to come, sigilsToUnlock counting both.)
  const unlocked = [...new Set([...was.unlocked, ...theirs.unlocked])];
  const later = (theirs.wornAt ?? 0) > (was.wornAt ?? 0);
  const next: SigilStore = later ? { unlocked, worn: theirs.worn, wornAt: theirs.wornAt } : { ...was, unlocked };
  if (unlocked.length === was.unlocked.length && next.worn === was.worn) return false;
  return writeStored(NAME, serializeSigils(next));
}

/** Unlocks `c` with one of the `achievements` earned (those stored, unless given), and wears it. */
export const unlockSigil = (c: PlayerClass, achievements = achievementsIn(loadAchievements())) => change((s) => unlock(s, c, achievements));

/** Wears `c`, one unlocked (null: none). */
export const wearSigil = (c: PlayerClass | null) => change((s) => wear(s, c));
