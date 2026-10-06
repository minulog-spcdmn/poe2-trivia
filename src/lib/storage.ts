import { BETA } from './channel.ts';

/**
 * The effects lab (lab.html, src/lab: dev and beta builds only) marks its
 * page `<html data-lab>`. Its keys get a start of their own, so nothing it
 * plays (runs, codex, saves, settings) reaches the game's records.
 */
export const LAB = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-lab');

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
export const STORE = (BETA ? 'poe2trivia.beta.' : 'poe2trivia.') + (LAB ? 'lab.' : '');

export type Area = 'local' | 'session';

/** The whole key for a name, as other tabs see it in storage events. */
export const storeKey = (name: string) => STORE + name;

const area = (where: Area) => (where === 'local' ? localStorage : sessionStorage);

export function readKey(key: string, where: Area = 'local'): string | null {
  return tryReadKey(key, where) ?? null;
}

/** Like readKey, but undefined when storage can't be read at all (rather than holding nothing). */
function tryReadKey(key: string, where: Area): string | null | undefined {
  try {
    return area(where).getItem(key);
  } catch {
    return undefined;
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
/** For code that must not take a read error for an empty entry (and write over it). */
export const tryReadStored = (name: string, where: Area = 'local') => tryReadKey(storeKey(name), where);

/**
 * A key the live game wrote before it moved to a newer one. Only the live
 * game reads or clears these: they were never the beta's to take over.
 */
export const readLegacy = (key: string, where: Area = 'local') => (BETA || LAB ? null : readKey(key, where));
export const removeLegacy = (key: string, where: Area = 'local') => {
  if (!BETA && !LAB) removeKey(key, where);
};
