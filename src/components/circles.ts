// The rune circles: one craft in several plates (docs/arcane-style.md), so
// the same circle isn't behind everything. The eye's (ArcaneCircle), the
// monad's and the rose's; all take the same props. (Delve has its own,
// BlackSunCircle.)
import ArcaneCircle from './ArcaneCircle.svelte';
import MonadCircle from './MonadCircle.svelte';
import RoseCircle from './RoseCircle.svelte';

export const CIRCLES = [ArcaneCircle, MonadCircle, RoseCircle];

/** The circle for `n` (a question's time, a day, an item's name): the same for everyone who has the same `n`. */
export function circleFor(n: number | string) {
  let k = 0;
  if (typeof n === 'number') k = Math.floor(n);
  else for (const ch of n) k = (k * 31 + ch.charCodeAt(0)) | 0;
  return CIRCLES[((k % CIRCLES.length) + CIRCLES.length) % CIRCLES.length];
}
