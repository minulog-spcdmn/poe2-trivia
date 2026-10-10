import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOMENTS } from '../src/lib/soundDesign.ts';

// The azurite smoke of a ward taking a loss (edgeWard in src/lib/fx/effects.ts,
// WARD_SMOKE and WARD_STRIKE) follows the wardShatter sound, its keyframes
// measured from this mix: its strike and shimmer, the swell to 0.4 s and its
// cut, the ring dying away by about 1.1 s. Retuning the sound moves those:
// measure it again, set the keyframes to it, then update this.
test('the ward smoke keyframes were measured from this wardShatter', () => {
  assert.deepEqual(
    MOMENTS.wardShatter.layers.map((l) => [l.file, l.rate, l.delay]),
    [
      ['defeat-3', 1.8, 55],
      ['layer-sub-5', 0.85, 0],
      ['layer-metal-2', 0.77, 55],
      ['reveal-4', 1.8, 0],
    ],
  );
});
