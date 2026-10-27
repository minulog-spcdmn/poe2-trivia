// The hall's impulse (the reverb every sound plays into: lib/sound.ts) worked
// out as plain samples, so the page and its worker (lib/hallWorker.ts) work
// it out the same way.

/** How long (s) the hall's impulse response is. */
export const HALL_SECONDS = 2.8;

/** How many samples each channel of the hall's impulse has at `sampleRate`. */
export const hallLength = (sampleRate: number) => Math.floor(sampleRate * HALL_SECONDS);

/**
 * Samples `from` to `to` of one channel `d` of a dark stone-hall impulse
 * response: noise that decays and loses its highs as it goes. `lp` is where
 * the channel's lowpass stood at `from` (0 at its start); returns where it
 * stands at `to`, for the next part to go on from.
 */
export function fillHall(d: Float32Array, sampleRate: number, from: number, to: number, lp: number): number {
  const len = d.length;
  for (let i = from; i < to; i++) {
    const p = i / len;
    // One-pole lowpass whose cutoff falls over the tail.
    lp += (0.45 - 0.4 * p) * (Math.random() * 2 - 1 - lp);
    const onset = Math.min(1, i / (sampleRate * 0.015));
    d[i] = lp * onset * Math.pow(1 - p, 3);
  }
  return lp;
}
