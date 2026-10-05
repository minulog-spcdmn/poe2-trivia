import { BETA } from './channel.ts';

/**
 * localStorage and sessionStorage, for the whole site (a test keeps every
 * other module off them). Reads and writes never throw: storage can be
 * missing, blocked or full.
 *
 * The beta shares the live game's origin, so its keys start differently: a
 * codex or save in a format the beta is trying out never reaches the live
 * game's. readStored, writeStored and removeStored take a name and add the
 * start; the *Key versions take a whole key, for the few the beta must share
 * with the live game or leave alone.
 */
export const STORE = BETA ? 'poe2trivia.beta.' : 'poe2trivia.';

export type Area = 'local' | 'session';

/** The whole key for a name, as other tabs see it in storage events. */
export const storeKey = (name: string) => STORE + name;

const area = (where: Area) => (where === 'local' ? localStorage : sessionStorage);

export function readKey(key: string, where: Area = 'local'): string | null {
  try {
    return area(where).getItem(key);
  } catch {
    return null;
  }
}

/** Whether it could be stored. */
export function writeKey(key: string, value: string, where: Area = 'local'): boolean {
  try {
    area(where).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string, where: Area = 'local') {
  try {
    area(where).removeItem(key);
  } catch {
    /* ignore */
  }
}

export const readStored = (name: string, where: Area = 'local') => readKey(storeKey(name), where);
export const writeStored = (name: string, value: string, where: Area = 'local') => writeKey(storeKey(name), value, where);
export const removeStored = (name: string, where: Area = 'local') => removeKey(storeKey(name), where);

/**
 * A key the live game wrote before it moved to a newer one. Only the live
 * game reads or clears these: they were never the beta's to take over.
 */
export const readLegacy = (key: string, where: Area = 'local') => (BETA ? null : readKey(key, where));
export const removeLegacy = (key: string, where: Area = 'local') => {
  if (!BETA) removeKey(key, where);
};
