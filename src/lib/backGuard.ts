// The browser's back in a room, its lobby or a game (Android's back button or
// gesture, an iPhone's swipe in from the edge, the installed app's back): it
// closes what's open over the game first (a dialog, the item's window), and
// with nothing open asks before leaving (App's Leave dialog), as the header's
// leave does. It never takes the player off the site by itself.
//
// One history entry stands guard over the page while a room is open: the
// same address, no hash, so the #codex and #settings pages
// (lib/hashRoute.svelte.ts) never take it for theirs, and never over a page's
// entry (a room resumed on a load of #settings goes up under the page's,
// opened again over it), so Back from it never opens a page again under the
// game. Back takes it away; the
// page does what Back was for and puts it back in the next tap, so there's
// only ever the one, put back on top of itself, never a step per screen. It
// goes up only in a tap (the one that starts, makes or joins the room; after
// each Back, and in a room resumed on a load, the next one): an entry a page
// makes with nobody touching it, Chrome's back button and iOS's swipe both
// pass over. Leaving, it's gone back from (as HashRoute.close() goes), so a
// room left leaves no steps behind.
//
// (Not put back from Back itself, which is no tap: iOS's swipe passes over an
// entry made then, and the one under it, however often the page is tapped
// after, so every later swipe would leave. Until the next tap a second Back
// leaves: the way out for whoever means it.)
//
// Out of a room, on a page over the start page (the codex), what's open over
// the page is closed first too, each a step of its own (PageLayers, below).
//
// The one modal <dialog>, the privacy sheet, opens only in the iPhone's
// home-screen app (lib/legalSheet.svelte.ts; everywhere else the privacy link
// opens a tab of its own), where Back (the edge swipe) doesn't close it by
// itself: it's closed first, as its own back button would. (Were it ever on
// Android, Chrome's close watchers would close it with no history step, and
// Back wouldn't come here at all.) One already sliding away is passed over.

/** The history the guard stands in: the browser's, or one of its own (tests, the QA desk's frames). */
export interface Steps {
  /** The state of the entry the page is on. */
  state(): unknown;
  /** Whether that entry's address has a hash (a page's: #settings). */
  hashed(): boolean;
  /** A new entry, its address the page's without a hash. */
  push(state: unknown): void;
  /** A new entry at the address the page is on, its hash and all (#codex). */
  stack(state: unknown): void;
  /** The entry the page is on made `state`, its address losing any hash. */
  replace(state: unknown): void;
  back(): void;
  /** `heard` is called whenever the page goes back or forward to another of its entries. */
  listen(heard: () => void): void;
  /** Whether the page is in a tap or key press (or just after one), where an entry it makes is one the browser's back stops at. */
  inTap(): boolean;
  /** `run` is called once, within the next tap or key press on the page. */
  nextTap(run: () => void): void;
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
  /** To go up again in the next tap. */
  private tapping = false;
  /** What's open over the game, the last opened on top. */
  private layers: (() => void)[] = [];
  /** With nothing open: App's ask before leaving. */
  private onBack = () => {};
  /** An open modal <dialog> the browser left open, to close first; the page's, in the browser. */
  topDialog: () => (() => void) | null = () => null;
  /**
   * A page's entry the guard would go up over (a room resumed on a load of
   * #settings, which then shows them over the game): the guard (`guard`)
   * goes up under it instead, the page's entry made a plain step and the
   * page opened again over the guard. So nothing goes from under the tap
   * that puts it up (a slider in the sheet, the game beneath it), and Back
   * from the guard never opens the page again under the game. The page's
   * own, in the browser (App); here, the page closed (made a plain step).
   */
  liftPage: (guard: () => void) => void = (guard) => {
    this.steps.replace(null);
    guard();
  };

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
    if (!this.steps.inTap()) return this.again();
    this.placed = true;
    if (isGuard(this.steps.state())) return;
    const guard = () => this.steps.push({ [KEY]: true });
    if (this.steps.hashed()) this.liftPage(guard);
    else guard();
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

  /** It goes up again in the next tap on the page (any: a Stay, an answer), not now (the head of this file says why). */
  private again() {
    if (this.tapping) return;
    this.tapping = true;
    const steps = this.steps;
    steps.nextTap(() => {
      this.tapping = false;
      if (this.steps === steps) this.place();
    });
  }

  /** The page went back (or forward) to another of its entries. */
  private heard() {
    const state = this.steps.state();
    if (this.going) {
      this.going = false;
      // (A room opened again meanwhile: its guard goes up in the next tap, as after a Back.)
      if (this.wanted) this.again();
      return;
    }
    if (!this.placed) {
      // One left behind, with no room now: passed over, gone back from as
      // remove() goes. (A page over a room still joining, closed back onto
      // it, is heard here before the room wants it again: that one goes up
      // in the next tap, and this back isn't taken for the player's.)
      if (isGuard(state) && !this.wanted) {
        this.going = true;
        this.steps.back();
      }
      return;
    }
    // Back onto it, from a page over the game (#settings): the page's to close.
    if (isGuard(state)) return;
    // Back took it: Back does what it's for, and it goes up again in the next tap.
    this.placed = false;
    this.again();
    const close = this.topDialog() ?? this.layers.at(-1);
    if (close) close();
    else this.onBack();
  }
}

/** What a layer's entry is marked with: how many layers it stands over its page's own entry. */
const LAYER = 'over';
/** The layers an entry stands over its page's own (0: the page's, or no page's). */
export const layerDepth = (state: unknown) => Number((state as Record<string, unknown> | null)?.[LAYER]) || 0;

/**
 * The browser's back on a page over the start page (#codex), out of a room,
 * where no guard stands: what's open over the page (the codex's item card)
 * is closed first, and the page stays as it was, its scroll and all, rather
 * than closing under it. Each layer is a history entry of its own over the
 * page's, at the page's own address and marked as the page's entry is (so
 * HashRoute.close() still knows where the page was opened from), put up in
 * the tap that opens it (Chrome's back passes over an entry a page makes
 * with nobody touching it). Closed some other way (its own close, Escape),
 * it's gone back from, so no step stays behind.
 *
 * (An entry a layer left on a reload stands as one with nothing open: Back
 * from it changes nothing on the screen, and the next Back closes the page.)
 */
export class PageLayers {
  private steps!: Steps;
  /** Open over the page, the last opened on top, each with the depth of its entry. */
  private open: { depth: number; close: () => void }[] = [];

  constructor(steps: Steps) {
    this.use(steps);
  }

  /** The history it stands in from now on (the QA desk's frames: one of their own, as the guard's). */
  use(steps: Steps) {
    this.steps = steps;
    steps.listen(() => this.steps === steps && this.heard());
  }

  /** Something open over the page, which Back closes (`close`); gone, the returned function takes it off (going back from its entry if it's still there). */
  layer(close: () => void) {
    const under = this.steps.state();
    const depth = layerDepth(under) + 1;
    this.steps.stack({ ...(under as Record<string, unknown> | null), [LAYER]: depth });
    const layer = { depth, close };
    this.open.push(layer);
    return () => {
      const at = this.open.indexOf(layer);
      // (Closed by Back: its entry is gone already.)
      if (at < 0) return;
      this.open.splice(at, 1);
      if (layerDepth(this.steps.state()) === depth) this.steps.back();
    };
  }

  /** Back (or a page's close going back past them) took the entries of those over where it is now: each is closed, the top first. */
  private heard() {
    const now = layerDepth(this.steps.state());
    for (const layer of this.open.filter((l) => l.depth > now).reverse()) {
      this.open.splice(this.open.indexOf(layer), 1);
      layer.close();
    }
  }
}

/**
 * A history of its own, starting on one entry (`state`, its address's hash
 * `hash`), going back a moment later, as a browser's does. (`page` puts an
 * entry with a hash on top, as a page's own opening does.)
 */
export function memorySteps(state: unknown = null, hash = '') {
  // (Both the guard and the pages' layers listen, as both hear the browser's popstate.)
  const heard: (() => void)[] = [];
  const steps = {
    entries: [state],
    hashes: [hash],
    at: 0,
    state: () => steps.entries[steps.at],
    hashed: () => !!steps.hashes[steps.at],
    push(s: unknown) {
      steps.page(s, '');
    },
    stack(s: unknown) {
      steps.page(s, steps.hashes[steps.at]);
    },
    page(s: unknown, hash: string) {
      steps.at++;
      steps.entries.splice(steps.at, Infinity, s);
      steps.hashes.splice(steps.at, Infinity, hash);
    },
    replace(s: unknown) {
      steps.entries[steps.at] = s;
      steps.hashes[steps.at] = '';
    },
    /** (On the entry it was on till then, as a browser is till its popstate.) */
    back() {
      queueMicrotask(() => {
        if (steps.at === 0) return;
        steps.at--;
        heard.forEach((h) => h());
      });
    },
    listen(h: () => void) {
      heard.push(h);
    },
    /** (Always, unless a test says not: the QA desk's frames put a scene's room up with no tap.) */
    inTap: () => true,
    /** Waiting for the next tap. */
    taps: [] as (() => void)[],
    nextTap(run: () => void) {
      steps.taps.push(run);
      // (In a page, the QA desk's frames: its own taps.)
      if (typeof window !== 'undefined') onNextTap(() => steps.tap());
    },
    /** A tap on the page. */
    tap() {
      for (const run of steps.taps.splice(0)) run();
    },
  };
  return steps satisfies Steps;
}

/** `run` once, in the next tap or key press on the page (touchend too: on iOS a tap on nothing clickable fires no click). */
function onNextTap(run: () => void) {
  const types = ['touchend', 'click', 'keydown'];
  const once = () => {
    for (const t of types) removeEventListener(t, once, true);
    run();
  };
  for (const t of types) addEventListener(t, once, true);
}

function browserSteps(): Steps {
  const here = () => location.pathname + location.search;
  return {
    state: () => history.state,
    hashed: () => !!location.hash,
    push: (s) => history.pushState(s, '', here()),
    stack: (s) => history.pushState(s, '', location.href),
    replace: (s) => history.replaceState(s, '', here()),
    back: () => history.back(),
    listen: (heard) => addEventListener('popstate', heard),
    // (A browser that can't tell: as if it were.)
    inTap: () => navigator.userActivation?.isActive ?? true,
    nextTap: onNextTap,
  };
}

/**
 * The page's own modal <dialog> open on top, if any, closed as its Escape
 * would (its cancel first, which it may take over). One already sliding away
 * (LegalSheet's `going`, still open until it's gone) isn't, so a Back
 * meanwhile goes to what's under it.
 */
function openDialog() {
  const d = [...document.querySelectorAll('dialog')].filter((d) => d.open && d.matches(':modal') && !d.classList.contains('going')).at(-1);
  if (!d) return null;
  return () => {
    if (d.dispatchEvent(new Event('cancel', { cancelable: true }))) d.close();
  };
}

const pageSteps = typeof window === 'undefined' ? memorySteps() : browserSteps();
export const backGuard = new BackGuard(pageSteps);
export const pageLayers = new PageLayers(pageSteps);
if (typeof window !== 'undefined') {
  backGuard.topDialog = openDialog;
  backGuard.adopt();
}
