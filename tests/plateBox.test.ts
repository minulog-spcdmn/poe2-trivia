import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHOLE, boxOf, placed, union, type Box } from '../src/lib/plateBox.ts';
import { PLATES } from '../src/lib/plates/index.ts';
import type { StageLayer } from '../src/lib/engraver.ts';

const near = (a: Box | null, b: Box, eps = 0.05) => {
  assert.ok(a, 'a box');
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${a} vs ${b}`));
};

test('a box holds its lines, with room for their strokes', () => {
  near(boxOf('<path d="M0 0L10 20"/>'), [-3, -3, 13, 23]);
  assert.equal(boxOf('<path d=""/>'), null);
  assert.equal(boxOf(''), null);
});

test('a ring drawn as two half arcs is measured whole, not by its ends', () => {
  near(boxOf('<path d="M50 0A50 50 0 0 1 -50 0A50 50 0 0 1 50 0"/>'), [-53, -53, 53, 53]);
  // A quarter: from the right round to the bottom (y grows down), clockwise.
  near(boxOf('<path d="M40 0A40 40 0 0 1 0 40"/>'), [-3, -3, 43, 43]);
  // The same ends the long way round take in the rest of the circle.
  near(boxOf('<path d="M40 0A40 40 0 1 0 0 40"/>'), [-43, -43, 43, 43]);
});

test('an arc whose radius is too small to reach is grown to, as SVG does', () => {
  near(boxOf('<path d="M-10 0A1 1 0 0 1 10 0"/>'), [-13, -13, 13, 3]);
});

test('a curve is held by its control points', () => {
  near(boxOf('<path d="M0 0C0 -30 40 -30 40 0"/>'), [-3, -33, 43, 3]);
});

test('several paths and closed shapes', () => {
  near(boxOf('<path d="M0 0L5 0L5 5Z"/><path d="M-20 -20L-10 -10"/>'), [-23, -23, 8, 8]);
  near(union([0, 0, 1, 1], [-1, 2, 0.5, 3])!, [-1, 0, 1, 3]);
  assert.equal(union(null, null), null);
});

test('a layer placed in its box keeps its place and the point it turns about', () => {
  // A seal at the top right, inside the whole plate.
  const at = placed([40, -80, 60, -60], WHOLE, [50, -70]);
  assert.deepEqual([at.left, at.top, at.width, at.height], ['70%', '10%', '10%', '10%']);
  assert.equal(at.origin, '50% 50%');
  assert.equal(at.viewBox, '40 -80 20 20');
  // Without a pivot it turns about the plate's centre, wherever its box is.
  assert.equal(placed([0, 0, 50, 100], WHOLE).origin, '0% 0%');
  // The whole plate in the whole plate is as every layer was before.
  const whole = placed(WHOLE, WHOLE);
  assert.deepEqual([whole.left, whole.top, whole.width, whole.height, whole.origin], ['0%', '0%', '100%', '100%', '50% 50%']);
  // A layer within another is placed in its parent's box.
  const child = placed([45, -75, 55, -65], [40, -80, 60, -60]);
  assert.deepEqual([child.left, child.top, child.width, child.height], ['25%', '25%', '50%', '50%']);
});

test('every circle\'s layers get a box that holds their drawing, and most are small', async () => {
  for (const [name, build] of Object.entries(PLATES)) {
    for (const hollow of [false, true]) {
      const built = (await build(hollow)) as StageLayer[] | { layers: StageLayer[] };
      const layers = Array.isArray(built) ? built : built.layers;
      let area = 0;
      for (const l of layers) {
        assert.ok(l.box, `${name} ${l.name} has a box`);
        const [x0, y0, x1, y1] = l.box;
        assert.ok(x0 < x1 && y0 < y1 && x0 > -110 && y0 > -110 && x1 < 110 && y1 < 110, `${name} ${l.name}: ${l.box}`);
        // The box holds every point the layer's paths pass through.
        for (const markup of [l.lines.still, l.glow.still]) {
          for (const [, d] of markup.matchAll(/\sd="([^"]*)"/g)) {
            const nums = (d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? []).map(Number);
            for (const m of d.matchAll(/[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g)) {
              const [x, y] = [Number(m[1]), Number(m[2])];
              assert.ok(x >= x0 && x <= x1 && y >= y0 && y <= y1, `${name} ${l.name}: ${x},${y} outside ${l.box}`);
            }
            assert.ok(nums.length > 0);
          }
        }
        area += ((x1 - x0) * (y1 - y0)) / (200 * 200);
      }
      // Drawn whole-size, every layer took the whole plate.
      assert.ok(area < layers.length * 0.5, `${name}${hollow ? ' hollow' : ''}: ${area.toFixed(1)} plates for ${layers.length} layers`);
    }
  }
});
