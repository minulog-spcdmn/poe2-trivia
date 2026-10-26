import { zoomOf } from './stage';

/**
 * Where `el` will stand once the animation flying it in (Svelte's in:fly)
 * has ended: its box on screen less how far that has yet to move it. A toast's
 * sparkle is thrown from that box once and stays where it's thrown, so
 * measured as the toast starts to come in (24px off on a phone, 56px on a
 * wide screen) it would spring up where the toast isn't.
 *
 * Svelte starts an intro with a stand-in: an animation of no length that
 * holds the first pose (its first and last keyframes the same) until the
 * real one is made, a frame later. While only that is there, the element
 * comes to rest where it stands without the pose it holds (a toast has no
 * transform of its own). With neither: its box as it is.
 */
export function restingBox(el: Element): DOMRect | Element {
  let held = false;
  for (const anim of el.getAnimations()) {
    const frames = (anim.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
    const from = frames[0]?.transform;
    const to = frames.at(-1)?.transform;
    if (typeof from !== 'string' || typeof to !== 'string') continue;
    if (from === to) held = true;
    else if (anim.playState === 'running') return moved(el, to);
  }
  return held ? moved(el, 'none') : el;
}

/** `el`'s box on screen as it would stand with `transform` in place of the one it has now. */
function moved(el: Element, transform: string): DOMRect | Element {
  try {
    const nowAt = new DOMMatrix(getComputedStyle(el).transform);
    const restAt = new DOMMatrix(transform);
    const z = zoomOf(el);
    const r = el.getBoundingClientRect();
    return new DOMRect(r.x + (restAt.e - nowAt.e) * z, r.y + (restAt.f - nowAt.f) * z, r.width, r.height);
  } catch {
    // (A transform DOMMatrix can't read, in % say: its box as it is now.)
    return el;
  }
}
