// Delve: the backdrop while an Azurite Vein is dug (delve.ts, the dig). Off
// the lit path the hall goes cold and dark, and seams of azurite glow in the
// rock of the walls, nearer the more there is of it. One channel, eased in
// and out by itself, read by the backdrop's shader (uVein, backdrop.ts) and
// the CSS backdrop drawn without WebGL (Background.svelte).

import { digOf, isWayOut } from './delve.ts';
import type { GameState } from './game.ts';

/** Seconds the vein takes to come in, and to fade as the dig ends. */
export const VEIN_IN_S = 1.6;
export const VEIN_OUT_S = 1.2;

/**
 * Whether `s` is in a vein: its strike 1 asked, its two cards dealt, a later
 * strike asked, or one revealed (a cave-in fades it as the next cards come).
 */
export function inVein(s: GameState | null | undefined): boolean {
  if (!s?.delve) return false;
  if (s.phase === 'choosing') return s.offered.some(isWayOut) && !!digOf(s);
  if (s.phase === 'question' || s.phase === 'reveal') return s.question?.find === 'azurite';
  return false;
}

let target = 0;
let level = 0;
let at = -1;
const listeners = new Set<(on: boolean) => void>();

/** In a vein or not: the backdrop eases toward it. */
export function setVein(on: boolean) {
  const next = on ? 1 : 0;
  if (next === target) return;
  target = next;
  for (const f of listeners) f(on);
}

/** Calls `f` each time the vein comes or goes (the CSS backdrop; a drawing loop asleep wakes up). */
export function onVein(f: (on: boolean) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Whether the vein is in or on its way (the target), for those that only switch. */
export const veinOn = () => target === 1;

/**
 * How far the vein has come in at `now` (ms), 0 to 1, eased; `still`
 * (reduced motion, the effects off): at once.
 */
export function veinLevel(now = performance.now(), still = false): number {
  if (at < 0) at = now;
  // (A tenth of a second at most a step: a loop waking from sleep eases on from where it was.)
  const dt = Math.min(0.1, Math.max(0, now - at) / 1000);
  at = now;
  if (still) level = target;
  else if (level < target) level = Math.min(target, level + dt / VEIN_IN_S);
  else if (level > target) level = Math.max(target, level - dt / VEIN_OUT_S);
  // Smooth at both ends.
  return level * level * (3 - 2 * level);
}
