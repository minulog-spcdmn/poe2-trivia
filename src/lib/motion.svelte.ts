// Whether things may move, kept live: the system's reduced motion, and the
// effects switched off in the app (html[data-still], set by App.svelte).
// Anything that decides whether to animate, or whether to keep what only an
// animation shows, reads it here, so a change mid-session takes at once.

const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const root = typeof document === 'undefined' ? null : document.documentElement;

/** Counts the changes to html[data-still] (the observer below), so that what reads `off` in an effect or the markup follows them. */
let flips = $state(0);

class Motion {
  /** The system asks for reduced motion. */
  reduced = $state(!!query?.matches);
  /**
   * The effects are off in the app. Read off the attribute itself: the
   * observer hears of a change only a microtask later, and a read straight
   * after it must have it already (the zone gate's tuning page sets it and
   * plays the gate at once).
   */
  get off() {
    void flips;
    return !!root?.hasAttribute('data-still');
  }
  /** Held still, either way. */
  get still() {
    return this.reduced || this.off;
  }
}

export const motion = new Motion();

/** A transition's settings, for Svelte's transitions (they run whatever the system says): held still (reduced motion, or the effects off), things just appear. */
export const calm = <T extends { duration?: number; delay?: number }>(p: T): T => (motion.still ? { ...p, duration: 0, delay: 0 } : p);

query?.addEventListener('change', () => (motion.reduced = query.matches));
if (root && typeof MutationObserver === 'function') new MutationObserver(() => flips++).observe(root, { attributes: true, attributeFilter: ['data-still'] });
