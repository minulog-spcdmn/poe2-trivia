// The timing of a fossil's reveal (lib/fossilFlight.ts, where the motion is
// told in order), on its own so the tests read it without the page's effects.

export type FindSize = 'desk' | 'upright' | 'flat';

export const FOSSIL_REVEAL = {
  /**
   * When each beat starts (ms from the verdict). The lamp behind the name
   * plate's seals comes up from the verdict (NamePlate's kindle) until the
   * fossil comes out of the left one, thrown up and over into the circle's
   * heart, growing as it comes; the item dims under it.
   */
  LAUNCH: 520,
  /** It lands there, a touch past its size, settled by SETTLED; glints ring off it; a band of lamplight has swept it by SWEPT. */
  ARRIVES: 1060,
  GLINTS: 1100,
  SETTLED: 1340,
  SWEPT: 1500,
  /** Its name is written in, then its count comes in under it. */
  NAME: 1280,
  COUNT: 1900,
  SHOWN: 2150,
  /** Held; then it flies to the line, and lands. */
  FLY: 3150,
  LANDS: 3810,
  /** A rare: its seals surge twice, and it comes out (and all after) this much later for it; rays behind it, and a second sweep, red-gold. */
  RARE_LATER: 260,
  RARE_SWEEP: 420,
  /** The line's words fade in this long before the fossil lands in it. */
  LINE_LEAD: 260,
  /** The fossil's size (stage px): 120 on a desk, 88 on a phone upright, 64 on its side. */
  SIZE: { desk: 120, upright: 88, flat: 64 } as Record<FindSize, number>,
} as const;

/** When a beat comes for a fossil of this tier: a rare's from LAUNCH on, RARE_LATER later. */
export const beatAt = (ms: number, rare: boolean) => ms + (rare && ms >= FOSSIL_REVEAL.LAUNCH ? FOSSIL_REVEAL.RARE_LATER : 0);
