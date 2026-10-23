// The answer's right and wrong as fine cut lines (docs/arcane-style.md): a
// tick, a cross, and the hour run out as an hourglass whose sand has fallen.
// The answer tiles' marks (AnswerMark) and the verdict's seal (VerdictSign)
// both draw from these. On a grid of ±12; the marks reach about ±8.

import { ringParts, wear, type Part } from './arcane.ts';

/** The tick in one stroke: down into the turn and on up out of it. */
export const CHECK = ['M-7.6 0.4L-2.6 5.8L7.8 -6.6'];

/** The cross: one stroke from top left to bottom right, then the other. */
export const CROSS = ['M-6.6 -6.6L6.6 6.6', 'M6.6 -6.6L-6.6 6.6'];

/** The hour run out: an hourglass (alchemy's HOUR, grown) in its frame, its sand heaped in the lower bulb. */
export const HOURGLASS = ['M-5 -6.8H5M-5 6.8H5', 'M-3.9 -5.45H3.9L-3.9 5.45H3.9Z', 'M-2.8 5.45L0 2.4L2.8 5.45'];

/** The seal's rings: the outer worn (the same nicks on every seal), the inner whole. */
export const SEAL = {
  outer: ringParts([0, 0], 11, { wear: wear(211) }) as Part[],
  inner: 9.5,
};
