// An Azurite Vein caving in worked out as plain samples, so the page
// (lib/sound.ts) and its worker (lib/caveInWorker.ts) work it out the same
// way. (What it sounds like: caveIn in lib/sound.ts.)

import { CAVE_IN } from './soundDesign.ts';

/** How many samples each channel of the cave-in has at `sampleRate`. */
export const caveInLength = (sampleRate: number) => Math.floor(sampleRate * CAVE_IN.seconds);

/**
 * The cave-in at `sr`, written into `left` and `right` (each caveInLength(sr)
 * long, and silent), in three parts: the rumble, then each side's stones,
 * with a pause between them (the page works it out a part per idle moment).
 */
export function* caveInParts(sr: number, left: Float32Array, right: Float32Array): Generator<void, void> {
  const seconds = CAVE_IN.seconds;
  const len = caveInLength(sr);
  const ch = [left, right];
  const at = (t: number) => Math.floor(t * sr);
  /** A knock of noise at `t0` (s), ringing at `hz` with decay `tau` (s), at `amp`, added to `d`. */
  const knock = (d: Float32Array, t0: number, hz: number, tau: number, amp: number) => {
    const w = (2 * Math.PI * Math.min(hz, sr * 0.45)) / sr;
    // A two-pole resonator: rings at hz, wider the shorter it is.
    const r = Math.exp(-1 / (tau * sr * 0.35));
    const [c1, c2] = [2 * r * Math.cos(w), -r * r];
    // Its peak gain at hz is about 1 / ((1 - r) * sqrt(1 - 2r cos 2w + r^2)): set it back to 1.
    const norm = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * w) + r * r);
    let [y1, y2] = [0, 0];
    const start = at(t0);
    const end = Math.min(len, start + at(tau * 6));
    for (let i = start; i < end; i++) {
      const k = (i - start) / sr;
      const x = (Math.random() * 2 - 1) * Math.exp(-k / tau) * Math.min(1, k / 0.0015);
      const y = x + c1 * y1 + c2 * y2;
      y2 = y1;
      y1 = y;
      d[i] += y * norm * amp;
    }
  };
  /** A low thud at `t0`: a sine falling from `hz` that dies away over `tau`. */
  const thud = (d: Float32Array, t0: number, hz: number, tau: number, amp: number) => {
    let phase = 0;
    const start = at(t0);
    const end = Math.min(len, start + at(tau * 6));
    for (let i = start; i < end; i++) {
      const k = (i - start) / sr;
      phase += (2 * Math.PI * hz * (0.75 + 0.25 * Math.exp(-k / 0.06))) / sr;
      d[i] += Math.sin(phase) * Math.exp(-k / tau) * Math.min(1, k / 0.004) * amp;
    }
  };
  // The rumble: noise kept to the low end (two lowpasses at 120 Hz, the
  // subsonic taken out), swelling in at once and dying away. The same in
  // both ears, as it fills the hall.
  const lp = 1 - Math.exp((-2 * Math.PI * 120) / sr);
  const hp = 1 - Math.exp((-2 * Math.PI * 35) / sr);
  let [a, b, lo] = [0, 0, 0];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    a += lp * (Math.random() * 2 - 1 - a);
    b += lp * (a - b);
    lo += hp * (b - lo);
    const env = Math.min(1, t / 0.03) * Math.exp(-t / 0.45);
    ch[0][i] += (b - lo) * env * CAVE_IN.rumble;
    ch[1][i] += (b - lo) * env * CAVE_IN.rumble;
  }
  for (let side = 0; side < 2; side++) {
    yield;
    const d = ch[side];
    // The crack as the rock gives, and the heavy blocks coming down.
    knock(d, 0.002 * side, 2600, 0.012, 0.9);
    knock(d, 0.004, 900, 0.03, 0.7);
    thud(d, 0.01, 62, 0.16, 0.9);
    thud(d, 0.16 + 0.04 * side, 48, 0.2, 0.75);
    // The collapse: stones, big and low first, smaller, higher and sparser as it settles.
    let t = 0.03 + Math.random() * 0.02;
    while (t < seconds - 0.12) {
      const u = t / seconds;
      const size = Math.pow(1 - u, 1.5) * (0.5 + Math.random() * 0.5);
      knock(d, t, 300 + 2800 * (1 - size) * (0.6 + Math.random() * 0.8), 0.006 + 0.03 * size, (0.18 + 0.75 * size) * CAVE_IN.stones);
      t += 0.012 + 0.09 * Math.pow(u, 1.2) * (0.4 + Math.random() * 1.2);
    }
  }
  // To about -1 dB at the peak, fading out over the last moment.
  let peak = 0;
  for (const d of ch) for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = 0.89 / (peak || 1);
  const tail = at(0.15);
  for (const d of ch) for (let i = 0; i < len; i++) d[i] *= k * Math.min(1, (len - i) / tail);
}
