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
// animates, and a sweep lights only what is on screen. A light that travels reaches things further down and to the
// right a moment later, as if it passed over the page. A light can also kindle
// sparks as it leaves: a small star that flares and fades.

import { motion } from './motion.svelte';

/** How often the light on the creator's name passes, and how long it takes to cross (ms). */
export const GLINT_EVERY = 9000;
export const GLINT_SWEEP = 1400;

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
  /**
   * Where each slit or spark is, fixed as it joins: the place its caller
   * names (a seal names itself for its slit and spark alike), else its
   * parent (a slit waits outside it, often clipped away, between passes).
   * What is on screen is watched there, once a place however many live in
   * it, and a travelling light is timed from there, so a seal's slit and
   * spark keep in step.
   */
  const places = new Map<Element, Element>();
  const lodgers = new Map<Element, number>();
  const placeOf = (el: Element) => places.get(el) ?? el;
  /** The places on screen now: a pass lights only what is in them (all, where nothing can tell). */
  const shown = new Set<Element>();
  const watch =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (e.isIntersecting) shown.add(e.target);
            else shown.delete(e.target);
          }
        })
      : null;
  const onScreen = (el: Element) => !watch || shown.has(placeOf(el));
  // Both halves share one timing, so the copy's slide cancels the slit's exactly.
  const timing: KeyframeAnimationOptions = { duration: sweep, easing: 'cubic-bezier(0.45, 0, 0.4, 1)' };

  /** A travelling light's delay at each place, read once a pass. */
  const delayAt = (place: Element) => {
    if (!travel) return 0;
    const r = place.getBoundingClientRect();
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
    if (!document.hidden && !motion.still) {
      // Every position is read, once a place, before any animation starts, so the page is laid out once a pass.
      const delays = new Map<Element, number>();
      const delayOf = (el: Element) => {
        const place = placeOf(el);
        if (!delays.has(place)) delays.set(place, delayAt(place));
        return delays.get(place)!;
      };
      const lit = [...slits].filter(onScreen).map((slit) => [slit, delayOf(slit)] as const);
      const kindled = [...sparks].filter(onScreen).map((spark) => [spark, delayOf(spark)] as const);
      for (const [slit, delay] of lit) {
        slit.animate(SLIT, { ...timing, delay, fill: 'backwards' });
        slit.firstElementChild?.animate(COPY, { ...timing, delay, fill: 'backwards' });
      }
      for (const [spark, delay] of kindled) spark.animate(SPARK, { duration: SPARK_MS, delay: delay + sweep * SPARK_AT, easing: 'ease-out' });
    }
    schedule();
  }

  /** Lit by this light while it's on the page. */
  function join(set: Set<Element>, el: Element, place: Element = el.parentElement ?? el) {
    set.add(el);
    places.set(el, place);
    const n = lodgers.get(place) ?? 0;
    lodgers.set(place, n + 1);
    if (!n) watch?.observe(place);
    if (!timer) schedule();
    return {
      destroy() {
        // The place it joined at (by now it may be detached from it).
        set.delete(el);
        places.delete(el);
        const left = (lodgers.get(place) ?? 1) - 1;
        if (left) lodgers.set(place, left);
        else {
          lodgers.delete(place);
          shown.delete(place);
          watch?.unobserve(place);
        }
        if (slits.size || sparks.size || !timer) return;
        clearTimeout(timer);
        timer = undefined;
      },
    };
  }

  return {
    /** Svelte action: the light passes over this slit (its first child is the copy), watched and timed at `place`. */
    glint: (slit: Element, place?: Element) => join(slits, slit, place),
    /** Svelte action: the light kindles this spark as it leaves, watched and timed at `place`. */
    spark: (spark: Element, place?: Element) => join(sparks, spark, place),
  };
}

/** Svelte action: the light on the creator's name passes over this slit (its first child is the copy of the name). */
export const { glint } = passingLight(GLINT_EVERY, GLINT_SWEEP);
