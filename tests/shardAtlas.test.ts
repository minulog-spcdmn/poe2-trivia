// What the effects' particle shader looks up rather than works out
// (lib/fx/shardAtlas.ts, lib/fx/curves.ts). Every sliver fits inside its
// layer, its edge left empty (the shader reads nothing past it, so one that
// ran up to it would be cut off there); its faces share each texel, never
// more than all of it; and the curves end where the shader takes them to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARD_CELL, SHARD_KINDS, shardAtlas, shardFaces } from '../src/lib/fx/shardAtlas.ts';
import { CURVES, GLINT_PEAK, curves, glintAt } from '../src/lib/fx/curves.ts';

test('every kind fits its layer, its edge left empty', () => {
  const a = shardAtlas();
  assert.equal(a.length, SHARD_KINDS * SHARD_CELL * SHARD_CELL * 4);
  for (let k = 0; k < SHARD_KINDS; k++) {
    for (let y = 0; y < SHARD_CELL; y++) {
      for (let x = 0; x < SHARD_CELL; x++) {
        if (x > 0 && x < SHARD_CELL - 1 && y > 0 && y < SHARD_CELL - 1) continue;
        const o = ((k * SHARD_CELL + y) * SHARD_CELL + x) * 4;
        assert.deepEqual([...a.subarray(o, o + 4)], [0, 0, 0, 0], `kind ${k}, texel ${x}, ${y}`);
      }
    }
  }
});

test("a texel's faces cover at most all of it, and every kind has all three", () => {
  const a = shardAtlas();
  const seen = Array.from({ length: SHARD_KINDS }, () => [false, false, false]);
  for (let i = 0; i < a.length; i += 4) {
    assert.ok(a[i] + a[i + 1] + a[i + 2] <= 256);
    const k = Math.floor(i / 4 / SHARD_CELL / SHARD_CELL);
    for (let j = 0; j < 3; j++) if (a[i + j] === 255) seen[k][j] = true;
  }
  assert.ok(seen.every((faces) => faces.every(Boolean)));
  assert.equal(shardFaces().length, SHARD_KINDS * 3 * 4);
});

test('the curves: a smoothstep from 0 to 1, and a glint brightest in its middle and gone at its reach', () => {
  const c = curves();
  assert.equal(c[1], 0);
  assert.equal(c[(CURVES - 1) * 2 + 1], 1);
  for (let i = 1; i < CURVES; i++) assert.ok(c[i * 2 + 1] > c[(i - 1) * 2 + 1]);
  assert.equal(c[0], 1);
  assert.equal(glintAt(0, 0), GLINT_PEAK);
  assert.ok(c[(CURVES * CURVES - 1) * 2] < 1e-3);
});
