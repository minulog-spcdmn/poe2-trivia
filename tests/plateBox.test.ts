import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WHOLE, boxOf, insideOut, placed, reachOf, union, type Box } from '../src/lib/plateBox.ts';
import { PLATES } from '../src/lib/plates/index.ts';
import type { StageLayer } from '../src/lib/engraver.ts';

const near = (a: Box | null, b: Box, eps = 0.05) => {
  assert.ok(a, 'a box');
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${a} vs ${b}`));
};

/** The room a box leaves round its paths (plateBox: half the widest stroke, and some). */
const R = 1.5;

test('a box holds its lines, with room for their strokes', () => {
  near(boxOf('<path d="M0 0L10 20"/>'), [-R, -R, 10 + R, 20 + R]);
  assert.equal(boxOf('<path d=""/>'), null);
  assert.equal(boxOf(''), null);
});

test('a ring drawn as two half arcs is measured whole, not by its ends', () => {
  near(boxOf('<path d="M50 0A50 50 0 0 1 -50 0A50 50 0 0 1 50 0"/>'), [-50 - R, -50 - R, 50 + R, 50 + R]);
  // A quarter: from the right round to the bottom (y grows down), clockwise.
  near(boxOf('<path d="M40 0A40 40 0 0 1 0 40"/>'), [-R, -R, 40 + R, 40 + R]);
  // The same ends the long way round take in the rest of the circle.
  near(boxOf('<path d="M40 0A40 40 0 1 0 0 40"/>'), [-40 - R, -40 - R, 40 + R, 40 + R]);
});

test('an arc whose radius is too small to reach is grown to, as SVG does', () => {
  near(boxOf('<path d="M-10 0A1 1 0 0 1 10 0"/>'), [-10 - R, -10 - R, 10 + R, R]);
});

test('a curve is held by its control points', () => {
  near(boxOf('<path d="M0 0C0 -30 40 -30 40 0"/>'), [-R, -30 - R, 40 + R, R]);
});

test('several paths and closed shapes', () => {
  // (The closed triangle's corners mitre out a little past its points.)
  const b = boxOf('<path d="M0 0L5 0L5 5Z"/><path d="M-20 -20L-10 -10"/>')!;
  assert.ok(b[0] <= -20 - R && b[1] <= -20 - R && b[2] >= 5 + R && b[3] >= 5 + R, `${b}`);
  near(union([0, 0, 1, 1], [-1, 2, 0.5, 3])!, [-1, 0, 1, 3]);
  assert.equal(union(null, null), null);
});

test('arc flags run together are read a character at a time', () => {
  near(boxOf('<path d="M40 0A40 40 0 1040 40"/>'), boxOf('<path d="M40 0A40 40 0 1 0 40 40"/>')!);
});

test("a path it can't read takes the whole plate, never failing the circle", () => {
  assert.deepEqual(boxOf('<path d="M0 0h10"/>'), WHOLE);
  assert.deepEqual(boxOf('<path d="M0 0Q5 5 10 0"/>'), WHOLE);
  assert.deepEqual(boxOf('<path d="M0 0A5 5 0 2 0 10 0"/>'), WHOLE);
});

test("a sharp corner's mitre is held; one past the limit is cut off", () => {
  // A spike 60 long and 10 across at its foot: about 9.5 degrees, past the limit of 12 (bevelled).
  const blunt = boxOf('<path d="M-5 0L0 -60L5 0"/>')!;
  assert.ok(Math.abs(blunt[1] - (-60 - R)) < 0.01, `${blunt}`);
  // 30 long and 20 across: about 37 degrees, mitred out 1.1 / sin(18.4) = 3.5 past the tip.
  const sharp = boxOf('<path d="M-10 0L0 -30L10 0"/>')!;
  assert.ok(sharp[1] < -30 - 3.4 && sharp[1] > -30 - 3.6 - R, `${sharp}`);
  // Closed, its first corner too.
  const tri = boxOf('<path d="M0 -30L10 0L-10 0Z"/>')!;
  assert.ok(tri[1] < -33, `${tri}`);
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

/**
 * Every point a path passes through, found apart from plateBox: the ends of
 * each segment, a curve's control points, and points along each circular
 * arc (its centre from the chord: which way round it turns, and whether it
 * goes the long way, pick the side).
 */
function pathPoints(d: string): [number, number][] {
  const tok = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const pts: [number, number][] = [];
  let i = 0;
  let cmd = '';
  let cur: [number, number] = [0, 0];
  let start = cur;
  const n = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'Z') {
      cur = start;
      continue;
    }
    if (cmd === 'M' || cmd === 'L') {
      cur = [n(), n()];
      if (cmd === 'M') {
        start = cur;
        cmd = 'L';
      }
      pts.push(cur);
    } else if (cmd === 'C') {
      for (let k = 0; k < 3; k++) pts.push((cur = [n(), n()]));
    } else if (cmd === 'A') {
      const [rx, ry, , large, sweep, x, y] = [n(), n(), n(), n(), n(), n(), n()];
      const to: [number, number] = [x, y];
      pts.push(to);
      if (Math.abs(rx - ry) < 1e-6) {
        const half = Math.hypot(to[0] - cur[0], to[1] - cur[1]) / 2;
        const r = Math.max(rx, half);
        const m = [(cur[0] + to[0]) / 2, (cur[1] + to[1]) / 2];
        const along = [(to[0] - cur[0]) / (2 * half), (to[1] - cur[1]) / (2 * half)];
        const side = Math.sqrt(Math.max(0, r * r - half * half)) * (large === sweep ? -1 : 1);
        const c = [m[0] - along[1] * side, m[1] + along[0] * side];
        const a0 = Math.atan2(cur[1] - c[1], cur[0] - c[0]);
        let da = Math.atan2(to[1] - c[1], to[0] - c[0]) - a0;
        if (sweep && da < 0) da += 2 * Math.PI;
        if (!sweep && da > 0) da -= 2 * Math.PI;
        for (let k = 1; k < 32; k++) pts.push([c[0] + r * Math.cos(a0 + (da * k) / 32), c[1] + r * Math.sin(a0 + (da * k) / 32)]);
      }
      cur = to;
    }
  }
  return pts;
}

test("the points along an arc found apart agree with plateBox's", () => {
  const box = boxOf('<path d="M40 0A40 40 0 0 1 0 40"/>')!;
  for (const [x, y] of pathPoints('M40 0A40 40 0 0 1 0 40')) assert.ok(x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]);
  // The short way turns about (0, 0); the long way the other way round about it too, and the long way the same way round about (40, 40).
  assert.ok(!pathPoints('M40 0A40 40 0 0 1 0 40').some(([x, y]) => x < -1 || y < -1));
  assert.ok(pathPoints('M40 0A40 40 0 1 0 0 40').some(([x]) => x < -39));
  assert.ok(pathPoints('M40 0A40 40 0 1 1 0 40').some(([x]) => x > 79));
  near(boxOf('<path d="M40 0A40 40 0 1 1 0 40"/>'), [-R, -R, 80 + R, 80 + R]);
});

test("every circle's layers get a box that holds every point they draw, and most are small", async () => {
  for (const [name, build] of Object.entries(PLATES)) {
    for (const hollow of [false, true]) {
      const built = (await build(hollow)) as StageLayer[] | { layers: StageLayer[] };
      const layers = Array.isArray(built) ? built : built.layers;
      let area = 0;
      for (const l of layers) {
        assert.ok(l.box, `${name} ${l.name} has a box`);
        const [x0, y0, x1, y1] = l.box;
        assert.ok(x0 < x1 && y0 < y1 && x0 > -115 && y0 > -115 && x1 < 115 && y1 < 115, `${name} ${l.name}: ${l.box}`);
        // The lines and the glow both (the box is the glow's: the lines must lie within it too, a stroke's half width in).
        for (const markup of [l.lines.still, l.glow.still]) {
          for (const [, d] of markup.matchAll(/\sd="([^"]*)"/g)) {
            for (const [x, y] of pathPoints(d)) {
              assert.ok(x >= x0 + 1 && x <= x1 - 1 && y >= y0 + 1 && y <= y1 - 1, `${name}${hollow ? ' hollow' : ''} ${l.name}: ${x},${y} outside ${l.box}`);
            }
          }
        }
        // And its seals at the size they're stamped in from.
        const reach = union(l.lines.reach ?? null, l.glow.reach ?? null);
        if (reach) assert.ok(reach[0] >= x0 && reach[1] >= y0 && reach[2] <= x1 && reach[3] <= y1, `${name} ${l.name}: stamp ${reach} outside ${l.box}`);
        area += ((x1 - x0) * (y1 - y0)) / (200 * 200);
      }
      // Drawn whole-size, every layer took the whole plate.
      assert.ok(area < layers.length * 0.5, `${name}${hollow ? ' hollow' : ''}: ${area.toFixed(1)} plates for ${layers.length} layers`);
    }
  }
});

test("the eye's box holds the eye and its glance", async () => {
  const { build } = await import('../src/lib/plates/eye.ts');
  const { eye, eyeBox } = build(false);
  assert.ok(eyeBox);
  for (const markup of eye) {
    for (const [, d] of markup.matchAll(/\sd="([^"]*)"/g)) {
      for (const [x, y] of pathPoints(d)) assert.ok(x - 5 >= eyeBox[0] && x + 5 <= eyeBox[2] && y >= eyeBox[1] && y <= eyeBox[3], `${x},${y} outside ${eyeBox}`);
    }
  }
  assert.equal(build(true).eyeBox, undefined);
});

test('rings are gone through from the centre out, those reaching as far in their own order', () => {
  assert.equal(reachOf([-30, -10, 20, 40]), 40);
  assert.equal(reachOf(WHOLE), 100);
  assert.deepEqual(insideOut([WHOLE, [-20, -20, 20, 20], [-60, -50, 60, 50], [-20, -15, 15, 20]]), [1, 3, 2, 0]);
  assert.deepEqual(insideOut([]), []);
});

test("the eye takes an answer's colour from its glory out to its band", async () => {
  // As ArcaneStage goes through its rings (each outermost layer, and those beside it under one mask, as one).
  const { layers } = (await PLATES.eye(false)) as { layers: StageLayer[] };
  const rings = layers.filter((l) => !l.within);
  const order = insideOut(rings.map((l) => l.box ?? WHOLE)).map((i) => rings[i].name);
  assert.equal(order.at(-1), 'band');
  assert.ok(order.indexOf('glory0') < order.indexOf('star') && order.indexOf('heart') < order.indexOf('band'), order.join(', '));
});
