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
 * The card bench (cards.html, src/cardBench: dev and beta builds only) runs
 * the lab's game too, marked `<html data-lab data-cards>`: its keys start
 * apart from the lab's in the same way.
 */
export const CARD_BENCH = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-cards');
/**
 * The room bot (bot.html, src/bot: dev and bot builds only) marks its page
 * `<html data-bot>`: its keys start apart too, so a bot opened in someone's
 * own browser never takes over their saves, codex or settings.
 */
export const BOT = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-bot');
/**
 * The QA desk (qa.html, src/qa: dev and beta builds only) marks the desk
 * `<html data-qa="desk">` and each frame of the game it shows
 * `<html data-qa="<its slot>">`, before anything reads storage
 * (src/qa/main.ts). Each gets keys of its own: frames side by side on one
 * page share its sessionStorage and localStorage, so without a start apart
 * every seat would be the same player, with one save between them.
 */
const QA_SLOT = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-qa') ? document.documentElement.getAttribute('data-qa') : null;
/**
 * A seat of a live room on the QA desk ("Play from here", src/qa/live: dev
 * and beta only): its frame is named `qa:<room>:<seat>`, a name kept across
 * the frame's reloads, as a query the app rewrites wouldn't be. Its keys
 * start apart the same way, and its rooms are the desk room's own
 * (lib/peer.ts). The live game never reads it: any page that opens ours can
 * set a window's name.
 */
const SEAT = (BETA || LOCAL) && typeof window !== 'undefined' && typeof window.name === 'string' ? /^qa:(\w+):(\w+)$/.exec(window.name) : null;
export const QA_ROOM = SEAT?.[1] ?? null;
export const QA_SEAT = SEAT?.[2] ?? null;
export const QA = QA_SLOT !== null || QA_SEAT !== null;
/** A frame of the desk showing a still scene (not the desk, not a live seat): it stages whatever the scene holds. */
export const QA_FRAME = QA_SLOT !== null && QA_SLOT !== 'desk';

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
  (CARD_BENCH ? 'cards.' : '') +
  (BACKDROP_TOOL ? 'backdrops.' : '') +
  (BOT ? 'bot.' : '') +
  (QA ? `qa.${(QA_SLOT ?? QA_SEAT)!.replace(/[^a-z0-9-]/gi, '') || 'frame'}.` : '');
/** Where the lab's own keys start, on every page that runs its game (the lab, zones.html, spatial.html, cards.html): for settings they share. */
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
    for (const [key, fn] of Object.entries(handlers)) if (e.key === key || e.key === null || (e.key === ALSO[key.slice(STORE.length)] && key.startsWith(STORE))) fn();
  };
  addEventListener('storage', on);
  return () => removeEventListener('storage', on);
}

/**
 * What else an entry's value is read with, by name: the copies sync keeps of
 * the player's other devices (lib/sync/store.ts, which names them from here)
 * are read into the codex, the Delve records and the practice tally, so a
 * change to them is a change to those too.
 */
export const COPIES_OF = { codex2: 'sync.copies.codex', delve2: 'sync.copies.delve', practice: 'sync.copies.practice' } as const;
const ALSO: Record<string, string> = Object.fromEntries(Object.entries(COPIES_OF).map(([name, copies]) => [name, storeKey(copies)]));

/**
 * Tells this tab's onStoredElsewhere handlers that these entries changed, as
 * a write in another tab would (other tabs hear of it from the browser): for
 * changes that come from outside this tab's own code, as sync's do.
 */
export function announceStored(names: string[]) {
  for (const name of names) dispatchEvent(new StorageEvent('storage', { key: storeKey(name) }));
}

const written = new Set<(name: string) => void>();
/** Calls `fn` with the name of each entry this tab writes or removes in localStorage; returns what stops it. */
export function onStoredHere(fn: (name: string) => void): () => void {
  written.add(fn);
  return () => written.delete(fn);
}
const wrote = (name: string, where: Area, ok: boolean) => {
  if (ok && where === 'local') for (const fn of written) fn(name);
  return ok;
};

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

/** What may be let go of when the browser has no room left (onStorageFull). */
const spares: { fn: () => boolean; except: readonly string[] }[] = [];
/**
 * Registers what may be let go of when the browser has no room left for an
 * entry of this build's (sync's copies of the player's other devices, which
 * come again at the next meeting: lib/sync/store.ts): `fn` lets one thing
 * go and says whether it did. Never for the entries named in `except`.
 */
export function onStorageFull(fn: () => boolean, except: readonly string[]) {
  spares.push({ fn, except });
}
function writeRoomy(name: string, value: string, where: Area): boolean {
  for (;;) {
    if (writeKey(storeKey(name), value, where)) return true;
    if (where !== 'local' || !spares.some((s) => !s.except.includes(name) && s.fn())) return false;
  }
}

export const readStored = (name: string, where: Area = 'local') => readKey(storeKey(name), where);
export const writeStored = (name: string, value: string, where: Area = 'local') => wrote(name, where, writeRoomy(name, value, where));
export const removeStored = (name: string, where: Area = 'local') => wrote(name, where, removeKey(storeKey(name), where));
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
export const readLegacy = (key: string, where: Area = 'local') => (BETA || LOCAL || LAB || BACKDROP_TOOL || BOT || QA ? null : readKey(key, where));
export const removeLegacy = (key: string, where: Area = 'local') => {
  if (!BETA && !LOCAL && !LAB && !BACKDROP_TOOL && !BOT && !QA) removeKey(key, where);
};
