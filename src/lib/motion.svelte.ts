// Whether things may move: the battery saver switched on in the app
// (html[data-saver], set by fx/core.ts), kept live, and the still mode
// (lib/still.ts), which no player gets: the checks run in it, and it is
// settled as the page loads. The two hold different things still. The still
// mode holds everything: what runs its course (a transition, a moment's
// animation) is skipped, and what never ends is never started. The battery
// saver only stops what never ends (a glow that breathes, a light passing
// now and then, the backdrop's drift), so a screen where nothing happens
// draws nothing; a transition or a moment's animation still plays, a few
// frames that cost next to nothing. Anything that decides whether to
// animate, or whether to keep what only an animation shows, reads it here,
// so the saver switched mid-session takes at once.

import { STILL } from './still';

const root = typeof document === 'undefined' ? null : document.documentElement;

/** Counts the changes to html[data-saver] (the observer below), so that what reads `saving` in an effect or the markup follows them. */
let flips = $state(0);

class Motion {
  /** Held still: the page is in the still mode (lib/still.ts), never a player's. What runs its course is skipped, things just appear. */
  readonly still = STILL;
  /**
   * The battery saver is on in the app. Read off the attribute itself: the
   * observer hears of a change only a microtask later, and a read straight
   * after it must have it already (the zone tuning page sets it and plays a
   * zone's card at once).
   */
  get saving() {
    void flips;
    return !!root?.hasAttribute('data-saver');
  }
  /** Nothing endless runs: the still mode, or the battery saver. */
  get resting() {
    return this.still || this.saving;
  }
}

export const motion = new Motion();

/** A transition's settings, for Svelte's transitions (they run whatever the page's mode): held still, things just appear. */
export const calm = <T extends { duration?: number; delay?: number }>(p: T): T => (motion.still ? { ...p, duration: 0, delay: 0 } : p);

if (root && typeof MutationObserver === 'function') new MutationObserver(() => flips++).observe(root, { attributes: true, attributeFilter: ['data-saver'] });
