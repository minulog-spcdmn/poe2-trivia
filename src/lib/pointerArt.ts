// The pointer every player is shown as (their own: lib/ownCursor.ts; the
// others': PeerCursors.svelte), engraved in the style of the alchemist's
// circle (docs/arcane-style.md): one point of its compass star made into a
// dart, leaning as a pointer does, with a ridge down its middle and one side
// hatched along it, as the star's points are (lib/arcane.ts pointedRay).

import { hatch, line, pt, type Pt } from './arcane';

/** How far the dart leans from upright (radians, counter-clockwise). */
const LEAN = -0.42;
const lean = ([x, y]: Pt): Pt => [x * Math.cos(LEAN) - y * Math.sin(LEAN), x * Math.sin(LEAN) + y * Math.cos(LEAN)];

// Upright, tip at the origin: the barbs, and the notch between them where the ridge ends.
const TIP: Pt = [0, 0];
const [LEFT, NOTCH, RIGHT] = ([[-6.6, 19.5], [0, 14.6], [6.6, 19.5]] as Pt[]).map(lean);

/** Its outline (closed), the ridge, and the hatching down its left side. */
export const POINTER = {
  outline: `M${pt(TIP)}L${pt(LEFT)}L${pt(NOTCH)}L${pt(RIGHT)}Z`,
  ridge: line(TIP, NOTCH),
  hatch: hatch(NOTCH, LEFT, TIP, 1.25),
};

/** Room round the dart for its dark rim and glow: the tip sits at (PAD_X, PAD_Y) in a box SIZE across (CSS px). */
export const PAD_X = 5;
export const PAD_Y = 4;
export const SIZE: Pt = [24, 30];

/** Line weights (CSS px): fine and even, as cut. */
export const WEIGHT = { outline: 1.05, ridge: 0.8, hatch: 0.55, rim: 3 };
