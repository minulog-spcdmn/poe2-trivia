import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKED, PACKED_SIDE, packedCorners } from '../src/lib/squarePacking.ts';

type Pt = [number, number];

/** How deep two convex shapes overlap (the least along any side's normal): at most 0 where they only touch or lie apart. */
function overlap(p: Pt[], q: Pt[]) {
  let least = Infinity;
  for (const shape of [p, q])
    for (let i = 0; i < shape.length; i++) {
      const [a, b] = [shape[i], shape[(i + 1) % shape.length]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n: Pt = [(a[1] - b[1]) / len, (b[0] - a[0]) / len];
      const on = (s: Pt[]) => s.map(([x, y]) => x * n[0] + y * n[1]);
      const [pp, qq] = [on(p), on(q)];
      least = Math.min(least, Math.min(Math.max(...pp), Math.max(...qq)) - Math.max(Math.min(...pp), Math.min(...qq)));
    }
  return least;
}

test("Bidwell's packing: 17 unit squares in a square of side 4.6755, none overlapping, none outside", () => {
  const squares = packedCorners();
  assert.equal(squares.length, 17);
  assert.equal(PACKED.length, 17);
  assert.ok(Math.abs(PACKED_SIDE - 4.6755) < 1e-4);
  for (const sq of squares) {
    for (let i = 0; i < 4; i++) {
      const [a, b] = [sq[i], sq[(i + 1) % 4]];
      assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 1) < 1e-12, 'a side of 1');
    }
    for (const [x, y] of sq) assert.ok(x > -1e-12 && y > -1e-12 && x < PACKED_SIDE + 1e-12 && y < PACKED_SIDE + 1e-12, 'inside the square');
  }
  let touching = 0;
  for (let i = 0; i < 17; i++)
    for (let j = i + 1; j < 17; j++) {
      const d = overlap(squares[i], squares[j]);
      assert.ok(d < 1e-12, `squares ${i} and ${j} overlap by ${d}`);
      if (d > -1e-9) touching++;
    }
  // (Tight: most of them lean on a neighbour.)
  assert.ok(touching >= 20);
  // Seven of them turned, two ways: the six together and the one alone.
  const turns = new Set(PACKED.filter((p) => p.turn).map((p) => p.turn.toFixed(4)));
  assert.equal(PACKED.filter((p) => p.turn).length, 7);
  assert.equal(turns.size, 2);
});
