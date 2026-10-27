// A page opened over the start page with an address of its own (#codex,
// #settings), so it can be linked to and the browser's back button closes it.
// Each entry it writes names the tab's slot too (lib/keptCopy.ts withTab).

import { layerDepth } from './backGuard';
import { withTab } from './keptCopy';

export class HashRoute {
  open = $state(false);
  /** Its address ('#codex'). */
  readonly hash: string;
  /** What its history entry is marked with, to know a back goes where it was opened from. */
  readonly key: string;

  constructor(hash: string, key: string) {
    this.hash = hash;
    this.key = key;
    this.open = this.here();
    const sync = () => (this.open = this.here());
    addEventListener('popstate', sync);
    addEventListener('hashchange', sync);
  }

  /** The address's hash, whatever follows it (?off=: lib/switchedOff.ts). */
  private here() {
    return location.hash.split('?')[0] === this.hash;
  }

  show() {
    if (this.open) return;
    history.pushState(withTab({ [this.key]: true }), '', this.hash);
    this.open = true;
  }

  /**
   * Back to where it was opened from; an address typed or linked with its
   * hash just loses it. Either way past what's open over it, each a step of
   * its own (lib/backGuard.ts PageLayers), which that closes.
   */
  close() {
    if (!this.open) return;
    const over = layerDepth(history.state);
    if ((history.state as Record<string, unknown> | null)?.[this.key]) {
      history.go(-(over + 1));
      return;
    }
    if (!over) {
      this.drop();
      return;
    }
    // Typed: back to the page's own entry first, then that loses its hash.
    const there = () => {
      removeEventListener('popstate', there);
      this.drop();
    };
    addEventListener('popstate', there);
    history.go(-over);
  }

  /**
   * Opened again over what `under` puts up (the room's guard, lib/backGuard.ts
   * liftPage), its entry where it stands made a plain step: open all along,
   * so nothing on the screen changes. (Not open, the hash is no page's, such
   * as the beta's switches, #?off= (lib/switchedOff.ts): kept where it is.)
   */
  lift(under: () => void) {
    if (!this.open) return under();
    const hash = location.hash;
    history.replaceState(withTab(null), '', location.pathname + location.search);
    under();
    history.pushState(withTab({ [this.key]: true }), '', hash);
  }

  /** Gone where it stands, the address losing its hash: for when what it was over has gone (a room it was opened in, ended). */
  drop() {
    if (!this.open) return;
    history.replaceState(withTab(null), '', location.pathname + location.search);
    this.open = false;
  }
}
