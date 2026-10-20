import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, type Pixels } from '../src/qa/desk/diff.ts';

/** A picture `w` by `h` of one colour, with `boxes` painted another. */
function picture(w: number, h: number, boxes: [number, number, number, number, number][] = []): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([20, 18, 16, 255], i);
  for (const [x0, y0, bw, bh, v] of boxes)
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) data.set([v, v, v, 255], (y * w + x) * 4);
  return { width: w, height: h, data };
}

// The QA desk's before and after (src/qa/desk/diff.ts): a change that shows
// as no difference, or noise that shows as one, would mislead whoever checks.
test('the same picture looks the same, and a shade off counts as the same', () => {
  const a = picture(200, 120);
  assert.deepEqual(compare(a, picture(200, 120)).areas, []);
  assert.deepEqual(compare(a, picture(200, 120, [[10, 10, 50, 50, 30]])).areas, []);
});

test('each part that changed is an area round it, largest first; parts near each other are one', () => {
  const before = picture(400, 300);
  const now = picture(400, 300, [
    [20, 20, 30, 10, 200],
    [55, 22, 10, 10, 200],
    [300, 200, 60, 60, 200],
  ]);
  const d = compare(before, now);
  assert.equal(d.areas.length, 2);
  const [big, small] = d.areas;
  assert.ok(big.x <= 300 && big.y <= 200 && big.x + big.w >= 360 && big.y + big.h >= 260);
  assert.ok(small.x <= 20 && small.x + small.w >= 65 && small.y <= 20);
  assert.equal(big.px, 3600);
  // (A cell with a pixel or two off at an area's edge isn't counted.)
  assert.ok(Math.abs(d.share - (3600 + 400) / (400 * 300)) < 0.001);
});

test("what moves between two shots of the code now isn't the change's", () => {
  const before = picture(300, 200);
  const now = picture(300, 200, [[100, 100, 20, 20, 200], [10, 10, 20, 20, 120]]);
  const again = picture(300, 200, [[100, 100, 20, 20, 90], [10, 10, 20, 20, 120]]);
  const d = compare(before, now, again);
  assert.equal(d.restless, 1);
  assert.equal(d.areas.length, 1);
  assert.ok(d.areas[0].x <= 10 && d.areas[0].y <= 10 && d.areas[0].w < 60);
});

test('pictures of other sizes differ all over', () => {
  const d = compare(picture(100, 100), picture(120, 100));
  assert.equal(d.share, 1);
  assert.equal(d.areas.length, 1);
});
