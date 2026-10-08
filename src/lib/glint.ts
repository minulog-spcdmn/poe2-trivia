// The glint that crosses the creator's gold-foil name now and then (see
// PlayerName.svelte), and the sheen on the achievements' seals
// (AchievementSeal.svelte). It is a soft band of light: a slit, masked to a
// narrow slanted stripe, holding a pale copy of what it crosses. The slit
// slides across while the copy inside it slides back by the same amount, so
// the light moves and the copy stays put. Both are transform animations,
// which the browser runs on the compositor: the copy is painted once as a
// sweep begins, and nothing is repainted while it moves.
//
// A light (passingLight) sweeps everything it lights together, on the beat of
// the page clock, so they catch the same light; between sweeps nothing
// animates. A light that travels reaches things further down and to the
// right a moment later, as if it passed over the page. A light can also kindle
// sparks as it leaves: a small star that flares and fades.

/** How often the light on the creator's name passes, and how long it takes to cross (ms). */
export const GLINT_EVERY = 9000;
export const GLINT_SWEEP = 1400;

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
/** Held still: reduced motion, or the effects switched off in the app (html[data-still]). */
export const still = () => reduced.matches || document.documentElement.hasAttribute('data-still');

const SLIT = [{ transform: 'translateX(-100%) skewX(-20deg)' }, { transform: 'translateX(100%) skewX(-20deg)' }];
const COPY = [{ transform: 'skewX(20deg) translateX(100%)' }, { transform: 'skewX(20deg) translateX(-100%)' }];
const SPARK = [
  { opacity: 0, transform: 'translate(-50%, -50%) scale(0.2) rotate(0deg)' },
  { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(45deg)', offset: 0.35 },
  { opacity: 0, transform: 'translate(-50%, -50%) scale(0.3) rotate(90deg)' },
];
/** How long a spark burns (ms), and how far into the sweep it kindles. */
const SPARK_MS = 900;
const SPARK_AT = 0.55;
/** A travelling light reaches a point this many ms per pixel of (left + top) later, at most TRAVEL_MAX. */
const TRAVEL = 0.35;
const TRAVEL_MAX = 700;

/**
 * A light passing every `every` ms, taking `sweep` to cross: `glint`, a
 * Svelte action for each slit it crosses (its first child is the copy), and
 * `spark`, one for each spark it kindles. `travel`: it moves over the page.
 */
export function passingLight(every: number, sweep: number, { travel = false } = {}) {
  const slits = new Set<Element>();
  const sparks = new Set<Element>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Both halves share one timing, so the copy's slide cancels the slit's exactly.
  const timing: KeyframeAnimationOptions = { duration: sweep, easing: 'cubic-bezier(0.45, 0, 0.4, 1)' };

  const delayOf = (el: Element) => {
    if (!travel) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(TRAVEL_MAX, Math.max(0, (r.left + r.top) * TRAVEL));
  };

  function schedule() {
    // The next beat, but never one that's about to happen: a timer firing a
    // hair early would otherwise sweep twice in a row.
    let wait = every - (performance.now() % every);
    if (wait < sweep) wait += every;
    timer = setTimeout(pass, wait);
  }

  function pass() {
    if (!document.hidden && !still()) {
      // Every position is read before any animation starts, so the page is laid out once a pass, not once a seal.
      const lit = [...slits].map((slit) => [slit, delayOf(slit)] as const);
      const kindled = [...sparks].map((spark) => [spark, delayOf(spark)] as const);
      for (const [slit, delay] of lit) {
        slit.animate(SLIT, { ...timing, delay, fill: 'backwards' });
        slit.firstElementChild?.animate(COPY, { ...timing, delay, fill: 'backwards' });
      }
      for (const [spark, delay] of kindled) spark.animate(SPARK, { duration: SPARK_MS, delay: delay + sweep * SPARK_AT, easing: 'ease-out' });
    }
    schedule();
  }

  /** Lit by this light while it's on the page. */
  function join(set: Set<Element>, el: Element) {
    set.add(el);
    if (!timer) schedule();
    return {
      destroy() {
        set.delete(el);
        if (slits.size || sparks.size || !timer) return;
        clearTimeout(timer);
        timer = undefined;
      },
    };
  }

  return {
    /** Svelte action: the light passes over this slit (its first child is the copy). */
    glint: (slit: Element) => join(slits, slit),
    /** Svelte action: the light kindles this spark as it leaves. */
    spark: (spark: Element) => join(sparks, spark),
  };
}

/** Svelte action: the light on the creator's name passes over this slit (its first child is the copy of the name). */
export const { glint } = passingLight(GLINT_EVERY, GLINT_SWEEP);
