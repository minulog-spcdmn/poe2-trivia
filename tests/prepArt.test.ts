import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addNoise, artScale, cutArt, transfers } from '../src/lib/prepArt.ts';
import { labelPatches, litMask, packLabels, patchShapes, seededRandom, spreadOrder, veilSchedule, visibleBox } from '../src/lib/patches.ts';

/** A W × H picture: an opaque ellipse with a soft edge on a transparent background, off centre. */
function ellipse(W: number, H: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = Math.hypot((x - W * 0.45) / (W * 0.35), (y - H / 2) / (H * 0.4));
      const o = (y * W + x) * 4;
      px[o] = (x * 7) & 255;
      px[o + 1] = (y * 5) & 255;
      px[o + 2] = 128;
      px[o + 3] = r < 0.95 ? 255 : r < 1 ? 100 : 0;
    }
  }
  return px;
}

const plan = { ms: 11000, halfBy: 17000, endBy: 19000, late: 0.5 };

test('a veil cut where the art is prepared is the cut the host always made', () => {
  const W = 96;
  const H = 130;
  const px = ellipse(W, H);
  const v = { size: 7, seed: 4242, plan };
  const cut = cutArt(px, W, H, v);

  // As media.svelte.ts cutVeil did it on the page.
  const lit = litMask(px, W, H);
  const label = labelPatches(W, H, v.size, v.seed, lit);
  const shapes = patchShapes(label, W, H);
  const order = spreadOrder(shapes, v.seed);
  const areas = order.map((i) => shapes[i].area);
  const schedule = veilSchedule(areas, plan);

  assert.equal(cut.w, W);
  assert.equal(cut.h, H);
  assert.deepEqual(cut.lit, lit);
  assert.deepEqual(cut.shapes, shapes);
  assert.deepEqual(cut.order, order);
  assert.deepEqual(cut.areas, areas);
  assert.deepEqual(cut.delays, schedule.delays);
  assert.equal(cut.gap, schedule.gap);
  assert.equal(cut.burn, Math.round(schedule.burn));
  assert.equal(cut.count, shapes.length);
  assert.deepEqual(cut.box, visibleBox(px, W, H));
  assert.deepEqual(new Uint16Array(cut.labels), packLabels(label));
  assert.ok(cut.count > 10);
});

test('the noise leaves clear pixels alone and moves the rest by a few levels, alike in each channel', () => {
  const px = new Uint8ClampedArray([10, 20, 30, 0, 100, 150, 200, 255, 0, 0, 0, 40, 255, 255, 255, 255]);
  const color = px.slice();
  addNoise(color, false, seededRandom(7));
  assert.deepEqual([...color.subarray(0, 4)], [10, 20, 30, 0]);
  for (let i = 4; i < color.length; i += 4) {
    const shift = [0, 1, 2].map((c) => color[i + c] - px[i + c]);
    assert.equal(color[i + 3], px[i + 3]);
    // Clamped at 0 and 255, else the same shift in each channel, at most 3 levels.
    for (const [c, d] of shift.entries()) {
      assert.ok(Math.abs(d) <= 3, `channel ${c} moved ${d}`);
      if (px[i + c] > 3 && px[i + c] < 252) assert.equal(d, shift[1]);
    }
  }

  const gray = px.slice();
  addNoise(gray, true, seededRandom(7));
  assert.deepEqual([...gray.subarray(0, 4)], [10, 20, 30, 0]);
  const g = gray[4];
  assert.equal(gray[5], g);
  assert.equal(gray[6], g);
  assert.ok(Math.abs(g - (0.3 * 100 + 0.59 * 150 + 0.11 * 200)) <= 3.5);

  // Seeded alike, noised alike.
  const again = px.slice();
  addNoise(again, false, seededRandom(7));
  assert.deepEqual(again, color);
});

test('a picture keeps as many pixels per art pixel as its file has, up to the most it may', () => {
  assert.equal(artScale(848, 212, 4), 4);
  assert.equal(artScale(848, 212, 2), 2);
  assert.equal(artScale(424, 212, 4), 2);
  assert.equal(artScale(212, 212, 4), 1);
  // A file smaller than the art still gets a pixel per art pixel.
  assert.equal(artScale(100, 212, 4), 1);
});

test('everything a prepared veil holds is handed over, nothing twice', () => {
  const W = 40;
  const H = 50;
  const px = ellipse(W, H);
  const cut = cutArt(px, W, H, { size: 5, seed: 9, plan });
  const pixels = { data: new Uint8ClampedArray(W * H * 16), width: W * 2, height: H * 2, colorSpace: 'srgb' } as ImageData;
  const data = new ArrayBuffer(10);
  const list = transfers({ w: W, h: H, data, cut: { ...cut, pixels } });
  assert.equal(new Set(list).size, list.length);
  for (const b of [data, cut.labels, cut.lit.buffer, pixels.data.buffer]) assert.ok(list.includes(b as ArrayBuffer));
  for (const s of cut.shapes) for (const a of [s.mask, s.own, s.edges]) assert.ok(list.includes(a.buffer as ArrayBuffer));
  assert.deepEqual(transfers({ w: W, h: H, data }), [data]);
});
