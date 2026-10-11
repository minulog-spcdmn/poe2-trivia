import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOMENTS } from '../src/lib/soundDesign.ts';

// The azurite smoke of a ward taking a loss (edgeWard in src/lib/fx/effects.ts,
// WARD_SMOKE and WARD_STRIKE) follows the wardShatter sound, its keyframes
// measured from this mix: its strike and shimmer, the swell to 0.4 s and its
// cut, the ring dying away by about 1.1 s. Retuning the sound moves those:
// measure it again, set the keyframes to it, then update this.
test('the ward smoke keyframes were measured from this wardShatter', () => {
  // All of it: gains, filters and softening shape its loudness as much as its timing.
  assert.deepEqual(MOMENTS.wardShatter, {
    soften: 3,
    varyPitch: 0.045,
    varyGain: 1.5,
    layers: [
      { file: 'defeat-3', gain: -38, rate: 1.8, delay: 55, hp: 972, lp: 4055, send: 0.4 },
      { file: 'layer-sub-5', gain: -29, rate: 0.85, delay: 0, hp: 20, lp: 1175, send: 0.5 },
      { file: 'layer-metal-2', gain: -43, rate: 0.77, delay: 55, hp: 20, lp: 20000, send: 0.3 },
      { file: 'reveal-4', gain: -44, rate: 1.8, delay: 0, hp: 200, lp: 6999, send: 0.45 },
    ],
  });
});
