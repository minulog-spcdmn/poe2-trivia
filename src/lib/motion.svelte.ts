// Whether things may move, kept live: the system's reduced motion, and the
// battery saver switched on in the app (html[data-saver], set by fx/core.ts).
// The two hold different things still. Reduced motion is for whoever wants
// the motion gone: what runs its course (a transition, a moment's
// animation) is skipped, and what never ends is never started. The battery
// saver only stops what never ends (a glow that breathes, a light passing
// now and then, the backdrop's drift), so a screen where nothing happens
// draws nothing; a transition or a moment's animation still plays, a few
// frames that cost next to nothing. Anything that decides whether to
// animate, or whether to keep what only an animation shows, reads it here,
// so a change mid-session takes at once.

const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const root = typeof document === 'undefined' ? null : document.documentElement;

/** Counts the changes to html[data-saver] (the observer below), so that what reads `saving` in an effect or the markup follows them. */
let flips = $state(0);

class Motion {
  /** The system asks for reduced motion. */
  reduced = $state(!!query?.matches);
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
  /** Held still: reduced motion. What runs its course is skipped, things just appear. */
  get still() {
    return this.reduced;
  }
  /** Nothing endless runs: reduced motion, or the battery saver. */
  get resting() {
    return this.reduced || this.saving;
  }
}

export const motion = new Motion();

/** A transition's settings, for Svelte's transitions (they run whatever the system says): held still (reduced motion), things just appear. */
export const calm = <T extends { duration?: number; delay?: number }>(p: T): T => (motion.still ? { ...p, duration: 0, delay: 0 } : p);

query?.addEventListener('change', () => (motion.reduced = query.matches));
if (root && typeof MutationObserver === 'function') new MutationObserver(() => flips++).observe(root, { attributes: true, attributeFilter: ['data-saver'] });
