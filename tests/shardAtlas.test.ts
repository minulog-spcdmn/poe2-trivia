// What the effects' particle shader looks up rather than works out
// (lib/fx/shardAtlas.ts, lib/fx/curves.ts). A shard's cell is read right up
// to its edge, so each cell's border is left empty (a kind never shows a
// sliver of the next); its faces share each texel, never more than all of
// it; and the curves end where the shader takes them to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARD_ATLAS, SHARD_CELL, SHARD_GRID, SHARD_KINDS, shardAtlas, shardFaces } from '../src/lib/fx/shardAtlas.ts';
import { CURVES, GLINT_PEAK, curves, glintAt } from '../src/lib/fx/curves.ts';

test('every kind fits its cell, its border left empty', () => {
  const a = shardAtlas();
  assert.equal(SHARD_KINDS, SHARD_GRID * SHARD_GRID);
  for (let y = 0; y < SHARD_ATLAS; y++) {
    for (let x = 0; x < SHARD_ATLAS; x++) {
      const cx = x % SHARD_CELL;
      const cy = y % SHARD_CELL;
      if (cx > 0 && cx < SHARD_CELL - 1 && cy > 0 && cy < SHARD_CELL - 1) continue;
      const o = (y * SHARD_ATLAS + x) * 4;
      assert.deepEqual([...a.subarray(o, o + 4)], [0, 0, 0, 0], `texel ${x}, ${y}`);
    }
  }
});

test("a texel's faces cover at most all of it, and every kind has all three", () => {
  const a = shardAtlas();
  const seen = Array.from({ length: SHARD_KINDS }, () => [false, false, false]);
  for (let i = 0; i < a.length; i += 4) {
    assert.ok(a[i] + a[i + 1] + a[i + 2] <= 256);
    const t = i / 4;
    const k = Math.floor(t / SHARD_ATLAS / SHARD_CELL) * SHARD_GRID + Math.floor((t % SHARD_ATLAS) / SHARD_CELL);
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
