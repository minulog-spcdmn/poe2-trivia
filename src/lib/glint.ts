// The glint that crosses the creator's gold-foil name now and then (see
// PlayerName.svelte). It is a soft band of light: a slit, masked to a narrow
// slanted stripe, holding a pale copy of the name. The slit slides across
// while the copy inside it slides back by the same amount, so the light
// moves and the letters stay put. Both are transform animations, which the
// browser runs on the compositor: the copy is painted once as a sweep
// begins, and nothing is repainted while it moves.
//
// One timer sweeps every such name on the page together, on the beat of the
// page clock, so they catch the same light; between sweeps nothing animates.

/** How often the light passes, and how long it takes to cross (ms). */
export const GLINT_EVERY = 9000;
export const GLINT_SWEEP = 1400;

const slits = new Set<HTMLElement>();
let timer: ReturnType<typeof setTimeout> | undefined;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// Both halves share one timing, so the copy's slide cancels the slit's exactly.
const timing: KeyframeAnimationOptions = { duration: GLINT_SWEEP, easing: 'cubic-bezier(0.45, 0, 0.4, 1)' };
const SLIT = [{ transform: 'translateX(-100%) skewX(-20deg)' }, { transform: 'translateX(100%) skewX(-20deg)' }];
const COPY = [{ transform: 'skewX(20deg) translateX(100%)' }, { transform: 'skewX(20deg) translateX(-100%)' }];

function schedule() {
  // The next beat, but never one that's about to happen: a timer firing a
  // hair early would otherwise sweep twice in a row.
  let wait = GLINT_EVERY - (performance.now() % GLINT_EVERY);
  if (wait < GLINT_SWEEP) wait += GLINT_EVERY;
  timer = setTimeout(sweep, wait);
}

function sweep() {
  if (!document.hidden && !reduced.matches) {
    for (const slit of slits) {
      slit.animate(SLIT, timing);
      slit.firstElementChild?.animate(COPY, timing);
    }
  }
  schedule();
}

/** Svelte action: the light passes over this slit (its first child is the copy of the name). */
export function glint(slit: HTMLElement) {
  slits.add(slit);
  if (!timer) schedule();
  return {
    destroy() {
      slits.delete(slit);
      if (slits.size || !timer) return;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
