// How every dialog comes and goes (the leave dialog, the settings over a
// game, the custom difficulty, the codex's erase and its items, pairing a
// device): it rises a little out of the dark and settles, on the house's
// ease-out (app.css --ease-out), and goes quicker than it came, sinking
// back. A framed .panel draws its frame in as it rises (app.css: the
// filigree round its corners, a light along its top edge). Its backdrop
// fades as before. Held still (lib/motion.svelte.ts), it just appears.

import { cubicIn, cubicOut, quintOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import { motion } from './motion.svelte';

/** The element's own transform, for the motion to go on top of (a dialog centred by one keeps its place). */
function own(node: Element) {
  const t = getComputedStyle(node).transform;
  return t === 'none' ? '' : `${t} `;
}

export function dialogIn(node: Element, { delay = 0 }: { delay?: number } = {}): TransitionConfig {
  if (motion.still) return { duration: 0 };
  const base = own(node);
  return {
    delay,
    duration: 480,
    css: (t) => {
      const m = quintOut(t);
      return `opacity: ${cubicOut(Math.min(1, t / 0.4))}; transform: ${base}translateY(${((1 - m) * 18).toFixed(2)}px) scale(${(0.965 + 0.035 * m).toFixed(4)})`;
    },
  };
}

export function dialogOut(node: Element): TransitionConfig {
  if (motion.still) return { duration: 0 };
  const base = own(node);
  return {
    duration: 180,
    easing: cubicIn,
    css: (t, u) => `opacity: ${t}; transform: ${base}translateY(${(u * 10).toFixed(2)}px) scale(${(1 - 0.02 * u).toFixed(4)})`,
  };
}
