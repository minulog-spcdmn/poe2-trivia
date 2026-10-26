// The browser's back in a room, its lobby or a game (Android's back button or
// gesture, an iPhone's swipe in from the edge, the installed app's back): it
// closes what's open over the game first (a dialog, the item's window), and
// with nothing open asks before leaving (App's Leave dialog), as the header's
// leave does. It never takes the player off the site by itself.
//
// One history entry stands guard over the page while a room is open: the
// same address, no hash, so the #codex and #settings pages
// (lib/hashRoute.svelte.ts) never take it for theirs. Back takes it away; the
// page puts it back at once and does what Back was for, so there's only ever
// the one, put back on top of itself, never a step per screen. It goes up in
// the tap that starts, makes or joins the room: an entry a page makes with
// nobody touching it, Chrome's back button and iOS's swipe both pass over.
// Leaving, it's gone back from (as HashRoute.close() goes), so a room left
// leaves no steps behind.
//
// (Put back from Back itself, it has no fresh tap behind it, so a second Back
// at once may pass over it and really leave: the way out for whoever means
// it. The next tap on the page makes it hold again.)
//
// A modal <dialog> (the privacy sheet) already closes on Android's back by
// itself (Chrome's close watchers), with no history step: Back only comes here
// when the browser didn't close it (an iPhone's swipe, a desktop's back), and
// it's closed first, as the browser would have.

/** The history the guard stands in: the browser's, or one of its own (tests, the QA desk's frames). */
export interface Steps {
  /** The state of the entry the page is on. */
  state(): unknown;
  push(state: unknown): void;
  replace(state: unknown): void;
  back(): void;
  /** `heard` is called whenever the page goes back or forward to another of its entries. */
  listen(heard: () => void): void;
}

/** What the guard's entry is marked with. */
const KEY = 'guard';
const isGuard = (state: unknown) => !!(state as Record<string, unknown> | null)?.[KEY];

export class BackGuard {
  private steps!: Steps;
  /** A room is open: the guard should stand. */
  private wanted = false;
  /** The guard is the entry the page is on (or one over it is a page's, #settings over the game). */
  private placed = false;
  /** Gone back from it, until the browser says it's done. */
  private going = false;
  /** What's open over the game, the last opened on top. */
  private layers: (() => void)[] = [];
  /** With nothing open: App's ask before leaving. */
  private onBack = () => {};
  /** An open modal <dialog> the browser left open, to close first; the page's, in the browser. */
  topDialog: () => (() => void) | null = () => null;

  constructor(steps: Steps) {
    this.use(steps);
  }

  /** The history it stands in from now on (the QA desk's frames: one of their own, so the desk's back stays the desk's). */
  use(steps: Steps) {
    this.steps = steps;
    steps.listen(() => this.steps === steps && this.heard());
  }

  /**
   * A guard from an earlier load of the page (a reload in a game): what's
   * behind it is that load, so Back from it would load the page again rather
   * than come here. Made a plain step, for a guard of this load's own to go over.
   */
  adopt() {
    if (isGuard(this.steps.state())) this.steps.replace(null);
  }

  /** In a room or not: the guard goes up (in the tap that opened it, where it can) or is gone back from. */
  want(on: boolean) {
    this.wanted = on;
    if (on) this.place();
    else this.remove();
  }

  /** What Back does with nothing open over the game. */
  asked(onBack: () => void) {
    this.onBack = onBack;
    return () => {
      if (this.onBack === onBack) this.onBack = () => {};
    };
  }

  /** Something open over the game, which Back closes (`close`) before anything under it; gone, the returned function takes it off. */
  layer(close: () => void) {
    const layer = () => close();
    this.layers.push(layer);
    return () => {
      const at = this.layers.lastIndexOf(layer);
      if (at >= 0) this.layers.splice(at, 1);
    };
  }

  private place() {
    // (Going back from the last one: this one goes up once that's done.)
    if (!this.wanted || this.placed || this.going) return;
    this.placed = true;
    if (!isGuard(this.steps.state())) this.steps.push({ [KEY]: true });
  }

  private remove() {
    if (!this.placed) return;
    this.placed = false;
    // With a page's entry over it (the settings over the game when the room
    // ended), it stays behind, and is passed over when Back comes to it.
    if (!isGuard(this.steps.state())) return;
    this.going = true;
    this.steps.back();
  }

  /** The page went back (or forward) to another of its entries. */
  private heard() {
    const state = this.steps.state();
    if (this.going) {
      this.going = false;
      // (A room opened again meanwhile.)
      this.place();
      return;
    }
    if (!this.placed) {
      // One left behind, with no room now: passed over.
      if (isGuard(state) && !this.wanted) this.steps.back();
      return;
    }
    // Back onto it, from a page over the game (#settings): the page's to close.
    if (isGuard(state)) return;
    // Back took it: it goes up again, and Back does what it's for.
    this.placed = false;
    this.place();
    const close = this.topDialog() ?? this.layers.at(-1);
    if (close) close();
    else this.onBack();
  }
}

/** A history of its own, starting on one entry (`state`), going back a moment later, as a browser's does. */
export function memorySteps(state: unknown = null) {
  let heard = () => {};
  const steps = {
    entries: [state],
    at: 0,
    state: () => steps.entries[steps.at],
    push(s: unknown) {
      steps.entries.splice(++steps.at, Infinity, s);
    },
    replace(s: unknown) {
      steps.entries[steps.at] = s;
    },
    back() {
      if (steps.at === 0) return;
      steps.at--;
      queueMicrotask(() => heard());
    },
    listen(h: () => void) {
      heard = h;
    },
  };
  return steps satisfies Steps;
}

function browserSteps(): Steps {
  return {
    state: () => history.state,
    push: (s) => history.pushState(s, ''),
    replace: (s) => history.replaceState(s, ''),
    back: () => history.back(),
    listen: (heard) => addEventListener('popstate', heard),
  };
}

/** The page's own modal <dialog> open on top, if any, closed as its Escape would (its cancel first, which it may take over). */
function openDialog() {
  const d = [...document.querySelectorAll('dialog')].filter((d) => d.open && d.matches(':modal')).at(-1);
  if (!d) return null;
  return () => {
    if (d.dispatchEvent(new Event('cancel', { cancelable: true }))) d.close();
  };
}

export const backGuard = new BackGuard(typeof window === 'undefined' ? memorySteps() : browserSteps());
if (typeof window !== 'undefined') {
  backGuard.topDialog = openDialog;
  backGuard.adopt();
}
