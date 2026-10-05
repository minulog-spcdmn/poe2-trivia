import { test } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem() {} };
const { rumble } = await import('../src/lib/sound.ts');

/** Just enough of an AudioContext to build a buffer. */
const ac = {
  sampleRate: 8000,
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, getChannelData: (c: number) => data[c] } as unknown as AudioBuffer;
  },
};

const rms = (d: Float32Array, from = 0, to = d.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += d[i] * d[i];
  return Math.sqrt(s / (to - from));
};

test("Delve's rumble sits near the ambience file's level, and loops without a seam", () => {
  const buf = rumble(ac);
  for (const c of [0, 1]) {
    const d = buf.getChannelData(c);
    assert.ok(d.every(Number.isFinite));
    const level = 20 * Math.log10(rms(d));
    assert.ok(level > -32 && level < -22, `level ${level.toFixed(1)} dB`);
    // A seam would be a step at the loop point far bigger than the steps around it.
    const step = (i: number) => Math.abs(d[(i + 1) % d.length] - d[i]);
    let typical = 0;
    for (let i = 0; i < d.length - 1; i++) typical = Math.max(typical, step(i));
    assert.ok(step(d.length - 1) <= typical * 1.5, `loop step ${step(d.length - 1)} vs ${typical}`);
    // No dip in loudness where the end is faded into the start.
    const sr = ac.sampleRate;
    assert.ok(rms(d, 0, sr) > 0.4 * rms(d, sr, d.length), 'quiet at the loop point');
  }
});
