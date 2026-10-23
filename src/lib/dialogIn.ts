// How every dialog comes and goes (the leave dialog, the settings over a
// game, the custom difficulty, the codex's erase and its items, pairing a
// device): it rises a little out of the dark and settles, on the house's
// ease-out (app.css --ease-out), and goes quicker than it came, sinking
// back. A framed .panel draws its frame in as it rises (app.css: the
// filigree round its corners, a light along its top edge). Its backdrop
// fades as before. Held still (lib/motion.svelte.ts), it just appears.
// A <dialog> shown and closed in place, not made by Svelte (the privacy
// sheet), moves the same way through play().

import { cubicIn, cubicOut, quintOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import { calm } from './motion.svelte';

// (A dialog's own box takes no transform, so the motion sets it whole: read
// back mid-entrance, it would be the entrance's, and a close then would
// start from twice as far.)
export function dialogIn(_?: Element, { delay = 0 }: { delay?: number } = {}): TransitionConfig {
  return calm({
    delay,
    duration: 480,
    css: (t) => {
      const m = quintOut(t);
      return `opacity: ${cubicOut(Math.min(1, t / 0.4))}; transform: translateY(${((1 - m) * 18).toFixed(2)}px) scale(${(0.965 + 0.035 * m).toFixed(4)})`;
    },
  });
}

export function dialogOut(_?: Element): TransitionConfig {
  return calm({
    duration: 180,
    easing: cubicIn,
    css: (t: number, u: number) => `opacity: ${t}; transform: translateY(${(u * 10).toFixed(2)}px) scale(${(1 - 0.02 * u).toFixed(4)})`,
  });
}

/**
 * One of these run on an element Svelte doesn't make or remove, as Svelte
 * runs it: coming in (t from 0 to 1) or going (1 to 0), its styles sampled
 * along the way. Null when there's nothing to play (held still): it's done.
 */
export function play(el: Element, { css, duration = 0, delay = 0, easing = (t: number) => t }: TransitionConfig, going = false): Animation | null {
  if (!css || !duration) return null;
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 20; i++) {
    const e = easing(i / 20);
    const t = going ? 1 - e : e;
    const frame: Keyframe = {};
    for (const decl of css(t, 1 - t).split(';')) {
      const at = decl.indexOf(':');
      if (at > 0) frame[decl.slice(0, at).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = decl.slice(at + 1).trim();
    }
    frames.push(frame);
  }
  return el.animate(frames, { duration, delay, fill: 'both' });
}
