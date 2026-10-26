// Delve's rumble worked out as plain samples, so the page (lib/sound.ts) and
// its worker (lib/rumbleWorker.ts) work it out the same way.

/** How long (s) the rumble's loop is. */
const SECONDS = 6;

/** How many samples each channel of the rumble has at `sampleRate`. */
export const rumbleLength = (sampleRate: number) => Math.floor(sampleRate * SECONDS);

/**
 * Brown noise, lowpassed twice at `lp` Hz, that loops without a seam (its end
 * is faded into its start), written into `left`; `right` gets the same loop
 * half a turn on. Both are rumbleLength(sampleRate) long.
 */
export function fillRumble(sampleRate: number, lp: number, left: Float32Array, right: Float32Array) {
  const fade = Math.floor(sampleRate * 0.75);
  const len = rumbleLength(sampleRate);
  const k = 1 - Math.exp((-2 * Math.PI * lp) / sampleRate);
  const raw = new Float32Array(len + fade);
  let brown = 0;
  let a = 0;
  let b = 0;
  let sum = 0;
  for (let i = 0; i < raw.length; i++) {
    brown = (brown + 0.02 * (Math.random() * 2 - 1)) * 0.998;
    a += k * (brown - a);
    b += k * (a - b);
    raw[i] = b;
    sum += b * b;
  }
  // About -26 dB RMS, like the ambience file's -29 mean with a little more weight.
  const scale = 0.05 / Math.sqrt(sum / raw.length || 1);
  const half = len >> 1;
  for (let i = 0; i < len; i++) {
    // The tail past the end crossfades into the start, so the loop point is
    // seamless. Equal power: the two halves are unrelated noise, so a straight
    // fade would dip.
    const t = i < fade ? i / fade : 1;
    left[i] = (raw[i] * Math.sqrt(t) + (i < fade ? raw[len + i] * Math.sqrt(1 - t) : 0)) * scale;
  }
  for (let i = 0; i < len; i++) right[i] = left[(i + half) % len];
}
