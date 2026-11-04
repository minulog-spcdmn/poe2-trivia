// The timing of a fossil's reveal (lib/fossilFlight.ts, where the motion is
// told in order), on its own so the tests read it without the page's effects.

export type FindSize = 'desk' | 'upright' | 'flat';

export const FOSSIL_REVEAL = {
  /** When each beat starts (ms from the verdict). The lamp behind the stage's amber comes up, and is at its fullest. */
  KINDLE: 260,
  LIT: 760,
  /** The fossil's shape darkens into view in the light, caught in the amber. */
  SHAPE: 600,
  /** It comes free, lit from within, as the amber round it darkens; glints ring off it; the band of lamplight has crossed it; it's sharp. */
  FREE: 1060,
  GLINTS: 1100,
  SWEPT: 1500,
  SHARP: 1560,
  /** Its name is written in, then its count comes in under it. */
  NAME: 1280,
  COUNT: 1900,
  SHOWN: 2150,
  /** Held; then it flies to the line, and lands. */
  FLY: 3150,
  LANDS: 3810,
  /** A rare: its lamp surges again, hotter, and the fossil comes free (and all after) this much later for it; a second sweep, red-gold, and a ring of light. */
  SURGE: 820,
  RARE_LATER: 260,
  RARE_SWEEP: 420,
  RING: 1000,
  /** The line's words fade in this long before the fossil lands in it. */
  LINE_LEAD: 260,
  /** The fossil's size (stage px): 120 on a desk, 88 on a phone upright, 64 on its side. */
  SIZE: { desk: 120, upright: 88, flat: 64 } as Record<FindSize, number>,
} as const;

/** When a beat comes for a fossil of this tier: a rare's from FREE on, RARE_LATER later. */
export const beatAt = (ms: number, rare: boolean) => ms + (rare && ms >= FOSSIL_REVEAL.FREE ? FOSSIL_REVEAL.RARE_LATER : 0);
