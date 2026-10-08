// Whether things may move, kept live: the system's reduced motion, and the
// effects switched off in the app (html[data-still], set by App.svelte).
// Anything that decides whether to animate, or whether to keep what only an
// animation shows, reads it here, so a change mid-session takes at once.

const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const root = typeof document === 'undefined' ? null : document.documentElement;

class Motion {
  /** The system asks for reduced motion. */
  reduced = $state(!!query?.matches);
  /** The effects are off in the app. */
  off = $state(!!root?.hasAttribute('data-still'));
  /** Held still, either way. */
  get still() {
    return this.reduced || this.off;
  }
}

export const motion = new Motion();

query?.addEventListener('change', () => (motion.reduced = query.matches));
if (root && typeof MutationObserver === 'function')
  new MutationObserver(() => (motion.off = root.hasAttribute('data-still'))).observe(root, { attributes: true, attributeFilter: ['data-still'] });
