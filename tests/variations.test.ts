import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded } from '../src/lib/acoustics.ts';
import { granular, resynthesized } from '../src/lib/variations.ts';

const SR = 48000;

/** A brush-like sound: noise, a little smoothed, starting at once and dying away over about 150 ms. */
function brush(seed = 3) {
  const rand = seeded(seed);
  const d = new Float32Array(Math.round(0.3 * SR));
  let lp = 0;
  for (let i = 0; i < d.length; i++) {
    lp += 0.35 * (rand() * 2 - 1 - lp);
    d[i] = lp * Math.exp(-i / (0.06 * SR)) * Math.min(1, i / (0.002 * SR));
  }
  return d;
}

const energy = (d: Float32Array) => d.reduce((s, x) => s + x * x, 0);
const corr = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s / Math.sqrt(energy(a) * energy(b));
};
/** Loudness over 5 ms windows. */
const envelope = (d: Float32Array) => {
  const w = Math.round(0.005 * SR);
  return Float32Array.from({ length: Math.floor(d.length / w) }, (_, k) => Math.sqrt(energy(d.subarray(k * w, (k + 1) * w)) / w));
};
/** How often it crosses zero: a rough measure of how bright it is. */
const brightness = (d: Float32Array) => {
  let n = 0;
  for (let i = 1; i < d.length; i++) if (d[i - 1] < 0 !== d[i] < 0) n++;
  return n / d.length;
};

const KINDS = {
  resynthesized: (d: Float32Array, v: number, seed: number) => resynthesized(d, v, seed),
  granular: (d: Float32Array, v: number, seed: number) => granular(d, SR, v, seed),
};

for (const [kind, make] of Object.entries(KINDS)) {
  test(`${kind}: a take is a new sound, as loud, shaped and bright as the recording`, () => {
    const src = brush();
    const a = make(src, 1, 11);
    const b = make(src, 1, 12);
    assert.equal(a.length, src.length);
    assert.ok(a.every(Number.isFinite));
    assert.ok(Math.abs(energy(a) / energy(src) - 1) < 1e-3, 'as loud');
    assert.ok(corr(envelope(a), envelope(src)) > 0.9, `shaped alike: ${corr(envelope(a), envelope(src)).toFixed(3)}`);
    const bright = brightness(a) / brightness(src);
    assert.ok(bright > 0.8 && bright < 1.2, `as bright: ${bright.toFixed(2)}`);
    // Another waveform, not the recording nudged, and two takes not each other
    // (past the attack, which granular takes keep as it is).
    const past = (d: Float32Array) => d.subarray(Math.round(0.01 * SR));
    assert.ok(Math.abs(corr(past(a), past(src))) < 0.5, `not the recording: ${corr(past(a), past(src)).toFixed(3)}`);
    assert.ok(Math.abs(corr(past(a), past(b))) < 0.5, `not each other: ${corr(past(a), past(b)).toFixed(3)}`);
  });

  test(`${kind}: with no variety, the recording itself; the same seed, the same take`, () => {
    const src = brush();
    assert.ok(corr(make(src, 0, 11), src) > 0.99);
    assert.deepEqual(make(src, 0.7, 5), make(src, 0.7, 5));
  });
}
