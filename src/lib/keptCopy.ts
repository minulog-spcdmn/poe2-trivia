// A tab's save (session.svelte.ts SAVE) lives in its sessionStorage: the
// tab's own, kept through a reload, gone with the tab. A phone's browser
// killed in the background (budget Android phones do it whenever the camera
// or a chat app wants the memory; an iPhone under memory pressure too) brings
// its tabs back with their addresses and history but with sessionStorage
// empty, so a run in progress came back as the start page, without a word.
// A copy of the save is kept here in localStorage, one slot per tab, for a
// tab that comes back that way to pick up, as a reload would.
//
// Only a game no page is playing any more is ever picked up. A tab holds a
// Web Lock named after its slot from its first game on, for as long as the
// page lives (a tab frozen in the background still holds it; one the browser
// killed doesn't), and only a page that gets a slot's lock picks its game up,
// so a game is never picked up twice, nor by a second tab while the first
// still has it. Where there are no Web Locks (a page that isn't secure, a
// browser from before them) nothing is kept: whether the game's tab is still
// there can't be told, and a game played on in two tabs at once is worse
// than one lost.
//
// And only a page the browser brought back without its tab's sessionStorage
// picks up: brought back (a reload, or a history entry restored, which is
// what the browser's own restore is), yet with a sessionStorage that holds
// nothing of this site's, not even the mark every page of the game leaves
// there. A page opened anew (a second tab on purpose, an invite link, the
// site opened again after its tab was closed) starts fresh as it always has,
// and so does a tab of the site's gone back to (its game, if it had one, was
// left there).

import { BOT, LAB, QA, readStored, readStoredStarting, removeStored, storeKey, writeStored } from './storage.ts';
import { randomToken } from './roomCode.ts';

/** How long a game on this device (hot-seat, a Delve run alone, a room that never went online) is kept for its tab to come back to: as long as the tab would have shown it, had it lived. */
export const KEEP_HERE_MS = 24 * 3600_000;
/**
 * How long an online room's is (hosted or joined). Its people are waiting
 * meanwhile: a guest cut off keeps the room on screen to reconnect to, and a
 * host is waited for in the same way, but after an hour they have moved on.
 * (A guest's copy only ever joins its host's room again, which fails, as it
 * says, once the host is gone: it never opens the room itself.)
 */
export const KEEP_ONLINE_MS = 3600_000;
/** At most this many copies are kept (the newest), whatever their age: one per tab that had a game. */
export const MAX_COPIES = 4;

/** In this tab's sessionStorage: its slot, so a reload keeps it (and a duplicated tab, which copies it, is told apart by its lock). */
const SLOT = 'session.slot';
/** In this tab's sessionStorage, from every page of the game's: that the tab has been here (restored, it hasn't). */
const HERE = 'session.here';
/** In localStorage, a slot's copy: `{ at, online, save }`, `save` the save as it is in sessionStorage. */
const copyName = (slot: string) => `kept.${slot}`;
/** Beside it, the host's last moment (session.svelte.ts ALIVE), which changes every ping: apart, so the game isn't written out again each time. */
const aliveName = (slot: string) => `keptAlive.${slot}`;
const COPY_START = 'kept.';
const ALIVE_START = 'keptAlive.';

/** A slot's copy as read back, newest first from `copies`. */
interface Copy {
  slot: string;
  at: number;
  online: boolean;
  save: unknown;
  alive: string | null;
}

/** What a page brought back picks up: the save and the host's last moment, as they go into its sessionStorage. */
export interface Taken {
  save: string;
  alive: string | null;
}

/** Whether a copy saved or last left at `at` (or its host last here at `alive`) is still to be picked up at `now`. */
function fresh(c: Pick<Copy, 'at' | 'online' | 'alive'>, now: number): boolean {
  const last = Math.max(c.at, Number(c.alive) || 0);
  return now - last < (c.online ? KEEP_ONLINE_MS : KEEP_HERE_MS);
}

function readCopy(slot: string, raw: string): Copy | null {
  try {
    const v = JSON.parse(raw) as { at?: unknown; online?: unknown; save?: unknown };
    if (typeof v.at !== 'number' || !Number.isFinite(v.at) || typeof v.save !== 'object' || v.save === null) return null;
    return { slot, at: v.at, online: v.online === true, save: v.save, alive: readStored(aliveName(slot)) };
  } catch {
    return null;
  }
}

/**
 * Every copy still to be picked up, newest first; the rest (damaged, too
 * old, past the newest few, or with no copy left beside a host's moment) let
 * go of. Whoever's they are: a page still playing one let go of writes it
 * again with its next save. `mine`: the slot about to be written, left out
 * and given room among the few.
 */
function copies(now: number, mine?: string): Copy[] {
  const kept: Copy[] = [];
  for (const [slot, raw] of readStoredStarting(COPY_START)) {
    if (slot === mine) continue;
    const c = readCopy(slot, raw);
    if (c && fresh(c, now)) kept.push(c);
    else removeStored(copyName(slot));
  }
  kept.sort((a, b) => b.at - a.at);
  for (const c of kept.splice(mine ? MAX_COPIES - 1 : MAX_COPIES)) removeStored(copyName(c.slot));
  const slots = new Set(kept.map((c) => c.slot));
  for (const [slot] of readStoredStarting(ALIVE_START)) if (slot !== mine && !slots.has(slot)) removeStored(aliveName(slot));
  return kept;
}

/**
 * Whether this page was brought back (reloaded, or its history entry
 * restored) rather than opened anew, and `tabNew`: its tab's sessionStorage
 * without this site's mark.
 */
export function restoredHere(tabNew: boolean): boolean {
  if (!tabNew) return false;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload' || nav?.type === 'back_forward';
  } catch {
    return false;
  }
}

/**
 * A page's keeping (one per page; a test makes one per tab it plays): with
 * `locks` (none: nothing is kept or picked up), and whether the browser
 * brought the page back without its tab's sessionStorage.
 */
export function keeper(locks: LockManager | undefined, restored: () => boolean) {
  /** The slot whose lock this page holds (from its first game on), or null. */
  let mine: string | null = null;
  /** While the slot is being got (what is wanted by then is written once it is). */
  let claiming: Promise<void> | null = null;
  /** What the slot is to hold (null: nothing, the game left); `at`, when it was saved or the page last left. */
  let wanted: { raw: string; online: boolean; at: number } | null = null;
  let alive: string | null = null;

  /**
   * Takes `slot`'s lock if no page holds it; what lets it go again, or null.
   * Named by its copy's whole key: the beta shares the live game's origin,
   * and with it the locks.
   */
  const hold = (slot: string) =>
    new Promise<(() => void) | null>((resolve) => {
      locks!
        .request(storeKey(copyName(slot)), { ifAvailable: true }, (lock) => (lock ? new Promise<void>((release) => resolve(release)) : resolve(null)))
        .catch(() => resolve(null));
    });

  /** The slot written as it is wanted now. */
  function put(slot: string) {
    if (!wanted) {
      removeStored(copyName(slot));
      removeStored(aliveName(slot));
      return;
    }
    // The save is JSON already: set in as it is, not quoted again on every write.
    writeStored(copyName(slot), `{"at":${wanted.at},"online":${wanted.online},"save":${wanted.raw}}`);
    if (alive) writeStored(aliveName(slot), alive);
  }

  /**
   * Gets this page its slot: the tab's own, kept in its sessionStorage across
   * reloads, unless another page holds it (a duplicated tab copies the
   * tab's sessionStorage, and with it the slot), else a new one once there is
   * a game to keep. With nothing to keep and no slot, there's nothing to do.
   */
  function claim() {
    claiming ??= (async () => {
      const had = readStored(SLOT, 'session');
      if (had && (await hold(had))) mine = had;
      else if (wanted) {
        const slot = randomToken(12);
        if (await hold(slot)) {
          mine = slot;
          writeStored(SLOT, slot, 'session');
        }
      }
      claiming = null;
      if (!mine) return;
      // The slot about to be written: room is made for it first.
      copies(Date.now(), mine);
      put(mine);
    })();
  }

  return {
    /** A save written (`raw`, its JSON): its copy is kept too. `online`: a room's, hosted or joined. */
    keepCopy(raw: string, online: boolean) {
      if (!locks) return;
      wanted = { raw, online, at: Date.now() };
      if (mine) put(mine);
      else claim();
    },

    /**
     * The page is being left (hidden, or going): its copy is stamped now. A
     * guest saves only as it joins, so its copy's age would be its time in
     * the room, not the time since it was last looked at, which is what the
     * copy is kept for.
     */
    leaving() {
      if (!mine || !wanted) return;
      wanted.at = Date.now();
      put(mine);
    },

    /** The host's last moment noted (session.svelte.ts noteAlive), beside the copy. */
    keepAlive(at: string) {
      if (!locks) return;
      alive = at;
      if (mine && wanted) writeStored(aliveName(mine), at);
    },

    /** The save let go of (the game left, ended for good, or never to be picked up): so is its copy. */
    dropCopy() {
      if (!locks) return;
      wanted = null;
      alive = null;
      // (A page that hasn't kept anything yet may still be the tab whose last page
      // did: reloaded, and leaving before it saved again. Its slot is cleared too.)
      if (mine) put(mine);
      else claim();
    },

    /**
     * A page the browser brought back without its tab's sessionStorage: the
     * newest game no page holds any more, its slot taken over by this page,
     * or null. `may` says, once the slot is got, whether the page still wants
     * it (nothing else started meanwhile); if not, the slot is let go of as
     * it was.
     */
    async takeCopy(may: () => boolean): Promise<Taken | null> {
      if (!locks || mine || claiming || !restored()) return null;
      for (const c of copies(Date.now())) {
        const release = await hold(c.slot);
        // Its page is still here (in another tab, maybe frozen in the background): its game stays there.
        if (!release) continue;
        // Read again under its lock (another page may have taken it and let go of it meanwhile).
        const raw = readStored(copyName(c.slot));
        const got = raw === null ? null : readCopy(c.slot, raw);
        // A game started here meanwhile: nothing is picked up over it.
        if (mine || claiming || !may()) {
          release();
          return null;
        }
        if (!got || !fresh(got, Date.now())) {
          release();
          continue;
        }
        mine = c.slot;
        writeStored(SLOT, c.slot, 'session');
        return { save: JSON.stringify(got.save), alive: got.alive };
      }
      return null;
    },
  };
}

/**
 * The game's own pages keep copies; the lab's, the QA desk's and the room
 * bot's don't (the bot keeps its room's save its own way, src/bot/host.ts).
 */
const KEEPS = !QA && !BOT && !LAB && typeof navigator !== 'undefined' && !!navigator.locks;
/** Read as the page starts, before it marks the tab. */
const tabNew = KEEPS && readStored(HERE, 'session') === null;
if (KEEPS) writeStored(HERE, '1', 'session');

const here = keeper(KEEPS ? navigator.locks : undefined, () => restoredHere(tabNew));
export const { keepCopy, keepAlive, dropCopy, takeCopy } = here;
if (KEEPS) {
  // A phone's browser kills a tab only once it's out of sight.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && here.leaving());
  addEventListener('pagehide', () => here.leaving());
}
