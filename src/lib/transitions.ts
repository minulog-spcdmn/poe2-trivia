// Svelte's fade, fly, scale and slide, the same transitions, with their
// styles read together. Each of Svelte's reads its element's computed style
// as it is made (the opacity and transform it comes in to, a slide's height),
// and Svelte makes them one at a time as a screen comes in, among the effects
// and actions that write to the page: every read after a write had the
// browser work the page's styles out again. On an iPhone a tap's flush did
// that about ten times over (5 to 6 ms of fade and fly a tap). These are made
// a moment later, as Svelte makes a crossfade, once the flush has written
// everything: the first one wanted then reads the styles of all that are
// waiting, one after another, so the page's styles are worked out once.

import {
  fade as svelteFade,
  fly as svelteFly,
  scale as svelteScale,
  slide as svelteSlide,
  type FadeParams,
  type FlyParams,
  type ScaleParams,
  type SlideParams,
  type TransitionConfig,
} from 'svelte/transition';

type Waiting = { make: () => TransitionConfig; made?: TransitionConfig };

/** Transitions made in this flush whose styles are still to be read. */
let waiting: Waiting[] = [];

/** Reads the styles of every transition waiting, all at once. */
function readAll() {
  const now = waiting;
  waiting = [];
  for (const w of now) w.made ??= w.make();
}

/**
 * A transition to be made once the flush is done (Svelte calls the function
 * it gets back then), its styles read with those of every other one waiting.
 * The same config each time it's asked for, as Svelte's own is, so one turned
 * round mid-way goes back from where it was.
 */
function together(make: () => TransitionConfig): () => TransitionConfig {
  const w: Waiting = { make };
  // (Read by the time the flush's microtasks are done, should Svelte never
  // ask for it, an outro cut short: nothing is kept waiting past them.)
  if (!waiting.length) queueMicrotask(readAll);
  waiting.push(w);
  return () => {
    if (!w.made) readAll();
    return w.made!;
  };
}

/** Svelte's fade (svelte/transition), its style read with the others'. */
export const fade = (node: Element, params?: FadeParams) => together(() => svelteFade(node, params));
/** Svelte's fly (svelte/transition), its style read with the others'. */
export const fly = (node: Element, params?: FlyParams) => together(() => svelteFly(node, params));
/** Svelte's scale (svelte/transition), its style read with the others'. */
export const scale = (node: Element, params?: ScaleParams) => together(() => svelteScale(node, params));
/** Svelte's slide (svelte/transition), its style read with the others'. */
export const slide = (node: Element, params?: SlideParams) => together(() => svelteSlide(node, params));
