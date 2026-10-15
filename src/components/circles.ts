// The rune circles: one craft in several plates (docs/arcane-style.md), so
// the same circle isn't behind everything. All take the same props.
import type { Component } from 'svelte';
import ArcaneCircle from './ArcaneCircle.svelte';
import BlackSunCircle from './BlackSunCircle.svelte';
import MonadCircle from './MonadCircle.svelte';
import RoseCircle from './RoseCircle.svelte';

type Circle = Component<{ state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number }>;

/** Behind a question's art (not Delve's): the eye and the monad, taking turns. */
export const QUESTION_CIRCLES: Circle[] = [ArcaneCircle, MonadCircle];
/** Behind today's unique: any of the four. */
export const DAILY_CIRCLES: Circle[] = [ArcaneCircle, MonadCircle, RoseCircle, BlackSunCircle];

/** The circle of `from` for `n` (a question's time, a day): the same for everyone who has the same `n`. */
export function circleFor(n: number | string, from: Circle[] = QUESTION_CIRCLES) {
  let k = 0;
  if (typeof n === 'number') k = Math.floor(n);
  else for (const ch of n) k = (k * 31 + ch.charCodeAt(0)) | 0;
  return from[((k % from.length) + from.length) % from.length];
}
