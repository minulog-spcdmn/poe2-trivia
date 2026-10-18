import { BETA, LOCAL } from './channel.ts';

/**
 * The effects lab (lab.html, src/lab: dev and beta builds only) marks its
 * page `<html data-lab>`. Its keys get a start of their own, so nothing it
 * plays (runs, codex, saves, settings) reaches the game's records.
 */
export const LAB = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-lab');
/**
 * The backdrop tool (backdrop.html, src/backdropTool: dev and beta builds
 * only) marks its page `<html data-backdrop-tool>`, and its keys get a start
 * of their own the same way (its drafts, and the effects setting it runs
 * with), apart from the game's and the lab's.
 */
export const BACKDROP_TOOL = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-backdrop-tool');
/**
 * The zone tuning page (zones.html, src/zonebanner: dev and beta builds
 * only) runs the lab's game, marked `<html data-lab data-zones>`: its keys
 * start apart from the lab's too, so its run never moves the lab's.
 */
export const ZONES_PREVIEW = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-zones');
/**
 * The spatial sound page (spatial.html, src/spatialPage: dev and beta builds
 * only) runs the lab's game too, marked `<html data-lab data-spatial>`: its
 * keys start apart from the lab's in the same way.
 */
export const SPATIAL_PAGE = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-spatial');
/**
 * The end screen's test page (endscreen.html, src/endscreenPreview: dev and
 * beta builds only) marks its page `<html data-endscreen>`: the codex and the
 * Delve records it writes for each state start apart, never over the game's.
 */
export const END_PREVIEW = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-endscreen');
/**
 * The room bot (bot.html, src/bot: dev and bot builds only) marks its page
 * `<html data-bot>`: its keys start apart too, so a bot opened in someone's
 * own browser never takes over their saves, codex or settings.
 */
export const BOT = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-bot');

/**
 * localStorage and sessionStorage, for the whole site (a test keeps every
 * other module off them). Reads and writes never throw: storage can be
 * missing, blocked or full.
 *
 * The beta shares the live game's origin, so its keys start differently: a
 * codex or save in a format the beta is trying out never reaches the live
 * game's. The local channel (the dev server, src/lib/channel.ts) keeps its
 * own the same way, so a room saved there never reopens in the live rooms
 * (npm run dev:live shares localhost's origin). readStored, writeStored and removeStored take a name and add the
 * start; the *Key versions take a whole key, for the few the beta must share
 * with the live game or leave alone.
 */
/** The channel's start, before any page's own. */
const CHANNEL = BETA ? 'poe2trivia.beta.' : LOCAL ? 'poe2trivia.local.' : 'poe2trivia.';
export const STORE =
  CHANNEL +
  (LAB ? 'lab.' : '') +
  (ZONES_PREVIEW ? 'zones.' : '') +
  (SPATIAL_PAGE ? 'spatial.' : '') +
  (BACKDROP_TOOL ? 'backdrops.' : '') +
  (BOT ? 'bot.' : '') +
  (END_PREVIEW ? 'endscreen.' : '');
/** Where the lab's own keys start, on every page that runs its game (the lab, zones.html, spatial.html): for settings they share. */
export const LAB_STORE = CHANNEL + 'lab.';

export type Area = 'local' | 'session';

/** The whole key for a name, as other tabs see it in storage events. */
export const storeKey = (name: string) => STORE + name;

/**
 * Calls each handler when another tab writes its value (by whole key, as
 * storeKey gives it) or clears storage; returns what stops listening.
 */
export function onStoredElsewhere(handlers: Record<string, () => void>): () => void {
  const on = (e: StorageEvent) => {
    for (const [key, fn] of Object.entries(handlers)) if (e.key === key || e.key === null) fn();
  };
  addEventListener('storage', on);
  return () => removeEventListener('storage', on);
}

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

/** Whether it could be removed. */
export function removeKey(key: string, where: Area = 'local'): boolean {
  try {
    area(where).removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const readStored = (name: string, where: Area = 'local') => readKey(storeKey(name), where);
export const writeStored = (name: string, value: string, where: Area = 'local') => writeKey(storeKey(name), value, where);
export const removeStored = (name: string, where: Area = 'local') => removeKey(storeKey(name), where);
/**
 * Removes every entry of this build's whose name starts with `start` (only
 * its own: the beta's and the lab's keys start differently).
 */
export function removeStoredStarting(start: string, where: Area = 'local') {
  try {
    const s = area(where);
    for (const k of keysStarting(start, where)) s.removeItem(k);
  } catch {
    /* ignore */
  }
}
/** The whole keys of this build's entries whose names start with `start`. */
function keysStarting(start: string, where: Area): string[] {
  const from = storeKey(start);
  const keys: string[] = [];
  try {
    const s = area(where);
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null && k.startsWith(from)) keys.push(k);
    }
  } catch {
    /* ignore */
  }
  return keys;
}
/** Every entry of this build's whose name starts with `start`, as [the rest of its name, its value]. */
export function readStoredStarting(start: string, where: Area = 'local'): [string, string][] {
  const from = storeKey(start);
  const out: [string, string][] = [];
  for (const k of keysStarting(start, where)) {
    const v = readKey(k, where);
    if (v !== null) out.push([k.slice(from.length), v]);
  }
  return out;
}
/** For code that must not take a read error for an empty entry (and write over it). */
export const tryReadStored = (name: string, where: Area = 'local') => tryReadKey(storeKey(name), where);

/**
 * A key the live game wrote before it moved to a newer one. Only the live
 * game reads or clears these: they were never the beta's to take over.
 */
export const readLegacy = (key: string, where: Area = 'local') => (BETA || LOCAL || LAB || BACKDROP_TOOL || BOT ? null : readKey(key, where));
export const removeLegacy = (key: string, where: Area = 'local') => {
  if (!BETA && !LOCAL && !LAB && !BACKDROP_TOOL && !BOT) removeKey(key, where);
};
