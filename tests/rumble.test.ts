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

test('a cave-in is short and heavy: loud at once, low, dying away, never clipping', async () => {
  const { caveIn } = await import('../src/lib/sound.ts');
  const sr = 16000;
  const ac16 = { ...ac, sampleRate: sr };
  const buf = caveIn(ac16);
  for (const c of [0, 1]) {
    const d = buf.getChannelData(c);
    assert.ok(d.every((v) => Number.isFinite(v) && Math.abs(v) <= 0.9));
    assert.ok(d.length <= sr * 1.5, 'over in about a second');
    const head = rms(d, 0, Math.floor(sr * 0.25));
    const tail = rms(d, Math.floor(sr * 0.9), d.length);
    assert.ok(head > 0.08, `loud at once: ${head}`);
    assert.ok(tail < head / 8, 'dies away');
  }
});

test('a cave-in is worked out at no more than 22.05 kHz, whatever the context runs at (its layer is lowpassed at 7 kHz)', async () => {
  const { caveIn, CAVE_IN_RATE } = await import('../src/lib/sound.ts');
  const { CAVE_IN, MOMENTS } = await import('../src/lib/soundDesign.ts');
  let rate = 0;
  const ac48 = {
    sampleRate: 48000,
    createBuffer(channels: number, length: number, sampleRate: number) {
      rate = sampleRate;
      return ac.createBuffer(channels, length);
    },
  };
  const buf = caveIn(ac48);
  assert.equal(rate, CAVE_IN_RATE);
  assert.equal(buf.length, Math.floor(CAVE_IN_RATE * CAVE_IN.seconds));
  const lp = MOMENTS.caveIn.layers.find((l) => l.file === CAVE_IN.file)!.lp;
  assert.ok(lp < CAVE_IN_RATE / 2, 'its lowpass under the Nyquist frequency');
});
