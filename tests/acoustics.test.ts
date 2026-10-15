import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, energy, roomIR, roomSeed, roomSteps, rt60 } from '../src/lib/acoustics.ts';

/** Just enough of an AudioContext to build a buffer. */
const ac = {
  sampleRate: 24000,
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, getChannelData: (c: number) => data[c] } as unknown as AudioBuffer;
  },
};
const sr = ac.sampleRate;

/** A one-pole lowpass at 200 Hz: the part of a room a deep sound rings in. */
function lows(d: Float32Array) {
  const y = new Float32Array(d.length);
  const a = 1 - Math.exp((-2 * Math.PI * 200) / sr);
  let s = 0;
  for (let i = 0; i < d.length; i++) y[i] = s += a * (d[i] - s);
  return y;
}

test('every place in Delve has a room: the ten zones and the endgame’s twelve kinds of place', () => {
  for (let k = 0; k < 10; k++) assert.ok(ROOMS[`z${k}`], `z${k}`);
  for (let k = 0; k < 12; k++) assert.ok(ROOMS[`a${k}`], `a${k}`);
});

test('a room dies away about as long as it is meant to, and is as loud as the hall it stands in for', () => {
  for (const [key, room] of Object.entries(ROOMS)) {
    const buf = roomIR(ac, room, 2, 7);
    for (const c of [0, 1]) {
      const d = buf.getChannelData(c);
      assert.ok(d.every(Number.isFinite), key);
      // Its highs (and early reflections) die first, so the whole of it a little sooner than its mids.
      const t = rt60(d, sr);
      assert.ok(t > room.rt * 0.7 && t < room.rt * 1.1, `${key}: ${t.toFixed(2)} s for ${room.rt} s`);
      // Each channel at the energy asked for, times its level.
      const e = energy(d);
      const want = 2 * (room.level ?? 1) ** 2;
      assert.ok(Math.abs(e / want - 1) < 1e-3, `${key}: energy ${e} for ${want}`);
    }
  }
});

test('a room never leans: its two sides as loud, its lows alike, so a deep sound stays where it is put', () => {
  for (const [key, room] of Object.entries(ROOMS)) {
    const buf = roomIR(ac, room, 1, roomSeed(key));
    const l = lows(buf.getChannelData(0)).subarray(0, Math.round(0.7 * sr));
    const r = lows(buf.getChannelData(1)).subarray(0, Math.round(0.7 * sr));
    const lean = 10 * Math.log10(energy(r) / energy(l));
    assert.ok(Math.abs(lean) < 2, `${key}: lows lean ${lean.toFixed(1)} dB`);
  }
});

test('each place’s room has a seed of its own', () => {
  const seeds = Object.keys(ROOMS).map(roomSeed);
  assert.equal(new Set(seeds).size, seeds.length);
});

test('a room worked out in steps is the room worked out at once, and pauses more than once on the way', () => {
  const room = ROOMS.z5;
  const steps = roomSteps(ac, room, 1, 3);
  let pauses = 0;
  let s = steps.next();
  while (!s.done) {
    pauses++;
    s = steps.next();
  }
  assert.ok(pauses > 4, `${pauses} pauses`);
  const once = roomIR(ac, room, 1, 3);
  for (const c of [0, 1]) assert.deepEqual(s.value.getChannelData(c), once.getChannelData(c));
});
