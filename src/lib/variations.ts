// New takes of a short sound made from its own recording, for a sound heard
// so often that the very same sample again wears on the ear (the hover:
// lib/spatial.svelte.ts). Two ways, each a new instance with the same
// colour and envelope, not the same one nudged:
//
// - resynthesized: the recording cut into short overlapping slices; each
//   slice keeps its spectrum (its tone) but its fine detail (the phases) is
//   made afresh, and the slices are put back together. On a noisy sound (a
//   brush, a swish) every take is new grain in the same sound.
// - granular: the attack kept as it is; the rest rebuilt from small
//   overlapping grains of the recording, each from a little before or after
//   where it is put, at the original's loudness there.
//
// `variety` (0 to 1) sets how far from the original a take goes; the same
// seed gives the same take.

import { seeded } from './acoustics.ts';

/** In-place radix-2 FFT of (re, im), its length a power of two; `inverse` the other way (scaled by 1/n). */
function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
}

const hann = (n: number) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));

/** The energy (sum of squares) of a stretch of samples. */
const energyOf = (d: ArrayLike<number>, from = 0, to = d.length) => {
  let e = 0;
  for (let i = from; i < to; i++) e += d[i] * d[i];
  return e;
};

/** Scales `out` to the energy of `like`, so a take is as loud as the recording. */
function matchEnergy(out: Float32Array<ArrayBuffer>, like: Float32Array) {
  const g = Math.sqrt(energyOf(like) / (energyOf(out) || 1));
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

/**
 * A resynthesized take of `data`: slices of `frame` samples (a power of
 * two), a quarter apart, each with its spectrum kept and its phases moved
 * by up to `variety` of a full turn at random; the first slice (the attack)
 * is moved by half as much.
 */
export function resynthesized(data: Float32Array, variety: number, seed: number, frame = 512): Float32Array<ArrayBuffer> {
  const rand = seeded(seed);
  const hop = frame / 4;
  const win = hann(frame);
  const out = new Float64Array(data.length + frame);
  const norm = new Float64Array(data.length + frame);
  const re = new Float64Array(frame);
  const im = new Float64Array(frame);
  for (let at = -frame + hop, n = 0; at < data.length; at += hop, n++) {
    for (let i = 0; i < frame; i++) {
      const j = at + i;
      re[i] = j >= 0 && j < data.length ? data[j] * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    const turn = variety * (n < 4 ? 0.5 : 1) * Math.PI;
    for (let k = 1; k < frame / 2; k++) {
      const mag = Math.hypot(re[k], im[k]);
      const ph = Math.atan2(im[k], re[k]) + (rand() * 2 - 1) * turn;
      re[k] = mag * Math.cos(ph);
      im[k] = mag * Math.sin(ph);
      // The other half mirrors it, so the slice stays real.
      re[frame - k] = re[k];
      im[frame - k] = -im[k];
    }
    fft(re, im, true);
    for (let i = 0; i < frame; i++) {
      const j = at + i;
      if (j < 0 || j >= data.length) continue;
      out[j] += re[i] * win[i];
      norm[j] += win[i] * win[i];
    }
  }
  const take = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) take[i] = norm[i] > 1e-6 ? out[i] / norm[i] : 0;
  return matchEnergy(take, data);
}

/**
 * A granular take of `data` (at `sampleRate`): its first `attackMs` as they
 * are, the rest rebuilt from grains of `grainMs`, half overlapping, each
 * taken from up to `variety` × `spreadMs` before or after where it is put,
 * and scaled to the recording's loudness there.
 */
export function granular(data: Float32Array, sampleRate: number, variety: number, seed: number, attackMs = 8, grainMs = 20, spreadMs = 30): Float32Array<ArrayBuffer> {
  const rand = seeded(seed);
  const grain = Math.max(16, Math.round((grainMs / 1000) * sampleRate)) & ~1;
  const hop = grain / 2;
  const win = hann(grain);
  const attack = Math.min(data.length, Math.round((attackMs / 1000) * sampleRate));
  const spread = (variety * spreadMs * sampleRate) / 1000;
  const out = new Float32Array(data.length);
  // The attack as it is, fading into the grains over a grain's half.
  for (let i = 0; i < attack + hop && i < data.length; i++) out[i] = data[i] * (i < attack ? 1 : 1 - (i - attack) / hop);
  for (let at = attack - hop; at < data.length; at += hop) {
    const from = Math.max(0, Math.min(data.length - grain, Math.round(at + (rand() * 2 - 1) * spread)));
    // Its loudness where it goes, not where it came from.
    const here = Math.sqrt(energyOf(data, Math.max(0, at), Math.min(data.length, at + grain)) / grain);
    const there = Math.sqrt(energyOf(data, from, from + grain) / grain);
    const g = there > 1e-9 ? here / there : 0;
    for (let i = 0; i < grain; i++) {
      const j = at + i;
      if (j < 0 || j >= data.length) continue;
      // Grains fade in over the attack's tail, where it fades out.
      const fadeIn = j < attack + hop ? Math.max(0, (j - attack) / hop) : 1;
      out[j] += data[from + i] * win[i] * g * fadeIn;
    }
  }
  return matchEnergy(out, data);
}
