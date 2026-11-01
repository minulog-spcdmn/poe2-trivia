// The timing of a fossil's reveal (lib/fossilFlight.ts, where the motion is
// told in order), on its own so the tests read it without the page's effects.

export type FindSize = 'desk' | 'upright' | 'flat';

export const FOSSIL_REVEAL = {
  /** When each beat starts (ms from the verdict). */
  RISE: 300,
  LIT: 450,
  SWEPT: 820,
  SHARP: 900,
  GLINTS: 560,
  NAME: 700,
  COUNT: 1300,
  SHOWN: 1550,
  FLY: 2700,
  LANDS: 3360,
  /** A rare's second sweep and its ring. */
  RARE: 900,
  RARE_SWEEP: 400,
  RING: 900,
  /** The line's words fade in this long before the fossil lands in it. */
  LINE_LEAD: 260,
  /** The fossil's size (stage px): 120 on a desk, 88 on a phone upright, 64 on its side. */
  SIZE: { desk: 120, upright: 88, flat: 64 } as Record<FindSize, number>,
} as const;
