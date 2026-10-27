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
// Web Lock named after its slot for as long as its page has a game in it (a
// tab frozen in the background still holds it; one the browser killed
// doesn't), and only a page that gets a slot's lock picks its game up, so a
// game is never picked up twice, nor by a second tab while the first still
// has it. (A page with no game holds none: Chrome keeps a page that holds a
// lock out of its back/forward cache, so the start page, left by a link and
// gone back to, would load anew rather than come back at once.) Nor is a
// room picked up that a page still here is in as the same one (a guest's
// seat, a host's room): a player who joined again from a new tab plays on
// there, and the old tab coming back later never takes the seat from it. And
// a room a page leaves (on purpose, removed, closed, or for another game) is
// left for good: the older copies of it go too, so an old tab coming back
// never takes the player into a room they left from a newer one. A game whose
// page unloads (its tab closed, or the page left for another) is left too: a
// killed tab gets no pagehide, a closed one does. (Android Chrome's tab
// switcher closes a tab without that reaching storage, and its copy stays:
// what keeps it from being picked up is the tab's history, below.) Where there
// are no Web Locks (a page that isn't secure, a browser from before them)
// nothing is kept: whether the game's tab is still there can't be told, and
// a game played on in two tabs at once is worse than one lost.
//
// A tab picks up only its own game, which it knows by its history: a
// browser bringing a tab back brings its history back too, each entry's
// state and all, where its sessionStorage is gone, and a closed tab takes
// its history with it. Every entry the game's pages write names the tab's
// slot (withTab), and so does the entry the page is on once it gets a slot
// or goes to another. A page brought back in a tab picks up only the copy
// of the slot its entry names, and nothing when it names none. So after a
// kill, which brings every tab back with an empty sessionStorage, the tab in
// front (the codex, say) never takes the game of the tab behind it, which
// gets it back when it comes back in turn; and a closed tab's copy, which no
// tab's history names any more, stays where it is until it is too old.
//
// And only a page the browser brought back without its tab's sessionStorage
// picks up: brought back (a reload, or a history entry restored, which is
// what the browser's own restore is), yet with a sessionStorage that holds
// nothing of this site's, not even the mark every page of the game leaves
// there. A page opened anew (a second tab on purpose, an invite link, the
// site opened again after its tab was closed) starts fresh as it always has,
// and so does a tab of the site's gone back to (its game, if it had one, was
// left there). Except in an iPhone's home-screen app (installedApp.ts), which
// iOS brings back by opening it anew at its start page: it has one window,
// its storage apart from Safari's, and every link out of it opens in Safari,
// so any page of it opened with nothing in sessionStorage is the app coming
// back. Opened anew, it has no history to name a slot: being the one window
// there is, it picks up the newest game no page holds. (And a game the player
// swiped the app away from comes back the next time it's opened, as a native
// app's would.)

import { BOT, LAB, QA, readStored, readStoredStarting, removeStored, storeKey, writeStored } from './storage.ts';
import { randomToken } from './roomCode.ts';
import { installedApp } from './installedApp.ts';

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

/** In this tab's sessionStorage: its slot, so a reload keeps it (and a duplicated tab, which copies it, is told apart by its lock). Named in the tab's history too (TAB). */
const SLOT = 'session.slot';
/**
 * In the state of a history entry of the tab's: its slot, for a page brought
 * back on that entry, its sessionStorage gone, to know its own copy by.
 */
const TAB = 'tab';
/** In this tab's sessionStorage, from every page of the game's: that the tab has been here (restored, it hasn't). */
const HERE = 'session.here';
/**
 * In localStorage, a slot's copy: `{ v, at, room, save }`, `save` the save
 * as it is in sessionStorage, `v` the name it goes under there (SAVE, named
 * anew when its format changes) and `room` the online room it is in, as the
 * one it is there (keepCopy), or null.
 */
const copyName = (slot: string) => `kept.${slot}`;
/** Beside it, the host's last moment (session.svelte.ts ALIVE), which changes every ping: apart, so the game isn't written out again each time. */
const aliveName = (slot: string) => `keptAlive.${slot}`;
const COPY_START = 'kept.';
const ALIVE_START = 'keptAlive.';

/** A slot's copy as read back, newest first from `copies`. */
interface Copy {
  slot: string;
  at: number;
  room: string | null;
  save: unknown;
  alive: string | null;
}

/** What a page brought back picks up: the save and the host's last moment, as they go into its sessionStorage. */
export interface Taken {
  save: string;
  alive: string | null;
}

/** The slot a history entry's state names, or null. */
function slotNamed(state: unknown): string | null {
  const slot = (state as Record<string, unknown> | null)?.[TAB];
  return typeof slot === 'string' && slot ? slot : null;
}

/** `state` naming `slot`, whatever else it holds kept (the room's guard, a page's mark). */
const naming = (state: unknown, slot: string) => ({ ...(state as Record<string, unknown> | null), [TAB]: slot });

/** The history entry a page is on, as its keeper reads it and names the tab's slot in it: the browser's, or a test's. */
export interface Entry {
  state(): unknown;
  /** The entry made `state`, its address as it is. */
  replace(state: unknown): void;
}

/** The browser's (none where a test plays the page without one). */
const pageEntry: Entry = {
  state: () => (typeof history === 'undefined' ? null : history.state),
  replace: (state) => history.replaceState(state, ''),
};

/**
 * `state` for a history entry the page writes (pushState, replaceState),
 * with the tab's slot named in it: the one in its sessionStorage, or, in a
 * page brought back that hasn't taken its copy yet (its sessionStorage still
 * empty), the one the entry it is on names. Every entry the game's pages
 * write goes through here (the room's guard and the layers over a page,
 * backGuard.ts; the codex and the settings, hashRoute.svelte.ts), so
 * whichever entry the tab is left on, it comes back naming its slot. The
 * others that write one keep the state that is there (history.state).
 */
export function withTab(state: unknown): unknown {
  const slot = readStored(SLOT, 'session') ?? slotNamed(pageEntry.state());
  return slot ? naming(state, slot) : state;
}

/** Whether a copy saved or last left at `at` (or its host last here at `alive`) is still to be picked up at `now`. */
function fresh(c: Pick<Copy, 'at' | 'room' | 'alive'>, now: number): boolean {
  const last = Math.max(c.at, Number(c.alive) || 0);
  return now - last < (c.room ? KEEP_ONLINE_MS : KEEP_HERE_MS);
}

/**
 * A slot's copy, or null: damaged, or kept under another name than `save`.
 * The name changes with the save's format, and what a build takes of a save
 * in an older one is the session's to decide (OLD_SAVE_KEY turns old hosted
 * rooms away, their guests' tokens no longer matching): a copy in an older
 * format is let go of, never resumed as if it were new.
 */
function readCopy(slot: string, raw: string, save: string): Copy | null {
  const v = whereKept(raw);
  if (v?.v !== save || typeof v.save !== 'object' || v.save === null) return null;
  return { slot, at: v.at, room: v.room, save: v.save, alive: readStored(aliveName(slot)) };
}

/** A copy's own fields, whatever name it was kept under, or null when damaged: when and where it was, for any page to go by. */
function whereKept(raw: string): { v: unknown; at: number; room: string | null; save: unknown } | null {
  try {
    const v = JSON.parse(raw) as { v?: unknown; at?: unknown; room?: unknown; save?: unknown };
    if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
    return { v: v.v, at: v.at, room: typeof v.room === 'string' && v.room ? v.room : null, save: v.save };
  } catch {
    return null;
  }
}

/**
 * Every copy still to be picked up, newest first; the rest (damaged, kept
 * under another name, too old, past the newest few, or with no copy left
 * beside a host's moment) let go of. Whoever's they are: a page still
 * playing one let go of writes it again with its next save, or as it's left.
 * `mine`: the slot about to be written, left out and given room among the
 * few.
 */
function copies(save: string, now: number, mine?: string): Copy[] {
  const kept: Copy[] = [];
  for (const [slot, raw] of readStoredStarting(COPY_START)) {
    if (slot === mine) continue;
    const c = readCopy(slot, raw, save);
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
 * without this site's mark. `standalone`: the page is an iPhone's home-screen
 * app (installedApp.ts), where being opened anew is how iOS brings it back.
 */
export function restoredHere(tabNew: boolean, standalone: boolean): boolean {
  if (!tabNew) return false;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload' || nav?.type === 'back_forward' || (standalone && nav?.type === 'navigate');
  } catch {
    return false;
  }
}

/**
 * A page's keeping (one per page; a test makes one per tab it plays): with
 * `locks` (none: nothing is kept or picked up), whether the browser brought
 * the page back without its tab's sessionStorage, whether the page is an
 * iPhone's home-screen app (installedApp.ts), `save`, the name the save
 * goes under in sessionStorage (session.svelte.ts SAVE), and `entry`, the
 * history entry the page is on.
 */
export function keeper(locks: LockManager | undefined, restored: () => boolean, standalone: () => boolean, save: string, entry: Entry) {
  /** The slot whose lock this page holds (while it has a game, and a moment after), or null. */
  let mine: string | null = null;
  /** What lets go of its lock. */
  let release: (() => void) | null = null;
  /** While the slot is being got (what is wanted by then is written once it is). */
  let claiming = false;
  /** Whether the page has looked for a game to pick up (takeCopy): once, as it starts. */
  let looked = false;
  /** What the slot is to hold (null: nothing, the game left); `at`, when it was saved or the page last left. */
  let wanted: { raw: string; room: string | null; at: number } | null = null;
  let alive: string | null = null;
  /** Whether the page has gone for good (closing): nothing is kept after. */
  let gone = false;

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

  /**
   * The entry the page is on made to name `slot`, the tab's, whatever else
   * it holds kept: it is by its history that the tab, brought back, knows
   * its own copy.
   */
  function name(slot: string) {
    const state = entry.state();
    if (slotNamed(state) === slot) return;
    try {
      entry.replace(naming(state, slot));
    } catch {
      // (Turned down, as Safari does past so many in a few seconds: the entry stays as it was.)
    }
  }

  /** The slot written as it is wanted now. */
  function put(slot: string) {
    if (!wanted) {
      removeStored(copyName(slot));
      removeStored(aliveName(slot));
      letGoSoon();
      return;
    }
    // The save is JSON already: set in as it is, not quoted again on every write.
    writeStored(copyName(slot), `{"v":${JSON.stringify(save)},"at":${wanted.at},"room":${JSON.stringify(wanted.room)},"save":${wanted.raw}}`);
    if (alive) writeStored(aliveName(slot), alive);
  }

  /**
   * The slot emptied: its lock is let go of in a moment, unless a game is to
   * be kept in it again by then. A page holding a lock is kept out of
   * Chrome's back/forward cache, and the page left on the start page after a
   * game has nothing to hold it for. (A game started anew mostly saves in the
   * same task as its reset() let go of the last, and the lock stays; a room
   * opening saves later, and takes it again then.) The slot stays the tab's
   * (SLOT), for its next game to claim.
   */
  function letGoSoon() {
    setTimeout(() => {
      if (wanted || !release) return;
      release();
      release = null;
      mine = null;
    });
  }

  /**
   * Gets this page its slot: the tab's own, kept in its sessionStorage across
   * reloads, unless another page holds it (a duplicated tab copies the
   * tab's sessionStorage, and with it the slot), else a new one once there is
   * a game to keep. With nothing to keep and no slot, there's nothing to do.
   * The entry the page is on names the slot got (a duplicated tab's, copied
   * with its history, named the first tab's till then).
   */
  async function claim() {
    if (claiming || mine) return;
    const had = readStored(SLOT, 'session');
    if (!had && !wanted) return;
    // Set before the first wait and cleared right after the last, with
    // nothing between that and the write: whatever is wanted by then is
    // written here, and whatever comes after claims (or writes) for itself.
    claiming = true;
    let got: string | null = null;
    let letGo = had ? await hold(had) : null;
    if (letGo) got = had;
    else if (wanted) {
      const slot = randomToken(12);
      letGo = await hold(slot);
      if (letGo) {
        got = slot;
        writeStored(SLOT, slot, 'session');
      }
    }
    claiming = false;
    if (!got) return;
    mine = got;
    release = letGo;
    // The slot about to be written: room is made for it first.
    copies(save, Date.now(), mine);
    put(mine);
    name(mine);
  }

  /**
   * The rooms pages still here are in, by the copies of the slots they hold;
   * null when the browser can't say which those are. Read whatever their name
   * or age: what is asked is only where they are.
   */
  async function roomsHeld(): Promise<Set<string> | null> {
    const start = storeKey(COPY_START);
    let held: LockInfo[];
    try {
      held = (await locks!.query()).held ?? [];
    } catch {
      return null;
    }
    const rooms = new Set<string>();
    for (const { name } of held) {
      const raw = name?.startsWith(start) ? readStored(copyName(name.slice(start.length))) : null;
      const room = raw === null ? null : whereKept(raw)?.room;
      if (room) rooms.add(room);
    }
    return rooms;
  }

  /**
   * The page left `room` (the copy it had of it saved or last left at `at`):
   * every older copy of it goes too, another tab's the browser killed, so
   * that tab coming back never goes into the room again. (A newer one is a
   * tab's that joined it after this page last had it, and took the seat
   * over: still its own.)
   */
  function leftRoom(room: string, at: number) {
    for (const [slot, raw] of readStoredStarting(COPY_START)) {
      const c = slot === mine ? null : whereKept(raw);
      if (c?.room !== room || c.at >= at) continue;
      removeStored(copyName(slot));
      removeStored(aliveName(slot));
    }
  }

  return {
    /**
     * A save written (`raw`, its JSON): its copy is kept too. `room`: the
     * online room it is in, hosted or joined, named as the one it is there:
     * two pages under one name can't both play it. Null for a game on this
     * device.
     */
    keepCopy(raw: string, room: string | null) {
      if (!locks || gone) return;
      wanted = { raw, room, at: Date.now() };
      if (mine) put(mine);
      else void claim();
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

    /**
     * The page is going for good (its tab closed, or the page left for
     * another, or reloaded): its copy goes, as the game is let go of. A tab
     * the player closed is a game walked away from (the session counts it
     * so), and its copy, stamped as it went and its lock gone with the page,
     * would look just like a killed tab's. (Where this never reaches storage,
     * as from Android Chrome's tab switcher, no tab's history names the copy
     * any more, so it isn't picked up either.) A killed tab gets no pagehide,
     * so its copy stays; a reloaded page has its game from its tab's
     * sessionStorage, and keeps a copy again as it resumes. Nothing is
     * claimed, as the page is going.
     */
    closing() {
      if (!locks) return;
      if (wanted?.room) leftRoom(wanted.room, wanted.at);
      wanted = null;
      alive = null;
      gone = true;
      if (!mine) return;
      removeStored(copyName(mine));
      removeStored(aliveName(mine));
    },

    /**
     * The page hidden for the last time (pagehide), `persisted` when it went
     * into the back/forward cache: such a page may come back, and its copy is
     * only stamped; one that unloads never does, and its copy goes. Except in
     * an iPhone's home-screen app, whose one window swiped away is to come
     * back as it was: there is no other tab there to pick its game up wrongly.
     */
    pageHidden(persisted: boolean) {
      if (persisted || standalone()) this.leaving();
      else this.closing();
    },

    /**
     * The page went to another of its history entries (popstate): that one
     * names the tab's slot too. (The start page's entry under the room's
     * guard, put up before the tab had its slot, is where a Back in the game
     * goes, and the tab may be killed there with the Leave dialog open.)
     */
    moved() {
      if (!locks) return;
      const slot = readStored(SLOT, 'session');
      if (slot) name(slot);
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
      if (wanted?.room) leftRoom(wanted.room, wanted.at);
      wanted = null;
      alive = null;
      // (A page that hasn't kept anything yet may still be the tab whose last page
      // did: reloaded, and leaving before it saved again. Its slot is cleared too.)
      if (mine) put(mine);
      else void claim();
    },

    /**
     * A page the browser brought back without its tab's sessionStorage: its
     * tab's game, if no page holds it any more (nor plays on in it: its room,
     * as the same one, another page's), its slot taken over by this page, or
     * null. A tab's game is the copy of the slot its history entry names
     * (none named, none to pick up); the home-screen app's, opened anew with
     * no history and the one window there is, the newest. `may` says, once
     * the slot is got, whether the page still wants it (nothing else started
     * meanwhile); if not, the slot is let go of as it was. Looked for once,
     * as the page starts: a page that played its own game and left it never
     * goes on into another tab's.
     */
    async takeCopy(may: () => boolean): Promise<Taken | null> {
      if (looked) return null;
      looked = true;
      if (!locks || mine || claiming || !restored()) return null;
      const app = standalone();
      const own = app ? null : slotNamed(entry.state());
      if (!app && !own) return null;
      // Read before any copy is let go of below (an old one may be a page's still playing).
      const live = await roomsHeld();
      if (!live) return null;
      for (const c of copies(save, Date.now()).filter((c) => app || c.slot === own)) {
        const letGo = await hold(c.slot);
        // Its page is still here (in another tab, maybe frozen in the background): its game stays there.
        if (!letGo) continue;
        // Read again under its lock (another page may have taken it and let go of it meanwhile).
        const raw = readStored(copyName(c.slot));
        const got = raw === null ? null : readCopy(c.slot, raw, save);
        // A game started here meanwhile: nothing is picked up over it.
        if (mine || claiming || !may()) {
          letGo();
          return null;
        }
        if (got && fresh(got, Date.now()) && !(got.room && live.has(got.room))) {
          mine = c.slot;
          release = letGo;
          writeStored(SLOT, c.slot, 'session');
          name(c.slot);
          return { save: JSON.stringify(got.save), alive: got.alive };
        }
        // Gone, too old by now, or its room is another page's to play on in (the player
        // joined it again from a new tab): not to be picked up by this page or any later.
        removeStored(copyName(c.slot));
        removeStored(aliveName(c.slot));
        letGo();
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

/**
 * This page's keeping of the save that goes under `save` (session.svelte.ts
 * SAVE, which hands its name in rather than this module reaching back for
 * it). Called once, by the session.
 */
export function keeping(save: string) {
  const here = keeper(KEEPS ? navigator.locks : undefined, () => restoredHere(tabNew, installedApp()), () => installedApp(), save, pageEntry);
  // (No document where a test plays the page.)
  if (KEEPS && typeof document !== 'undefined') {
    // A phone's browser kills a tab only once it's out of sight.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && here.leaving());
    addEventListener('pagehide', (e) => here.pageHidden(e.persisted));
    addEventListener('popstate', () => here.moved());
  }
  return here;
}
