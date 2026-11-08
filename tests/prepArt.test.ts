import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addNoise, artScale, cutArt, prepare, transfers } from '../src/lib/prepArt.ts';
import { areaTime, FIRST_PATCH_MS, litMask, patchShapes, seededRandom, unpackLabels, visibleBox } from '../src/lib/patches.ts';

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

test('a veil cut where the art is prepared reads back on a guest as the same patches, all of the item and only it', () => {
  const W = 96;
  const H = 130;
  const px = ellipse(W, H);
  const cut = cutArt(px, W, H, { size: 7, seed: 4242, plan });
  assert.equal(cut.w, W);
  assert.equal(cut.h, H);
  assert.ok(cut.count > 10);

  // What a guest makes of the labels it is sent.
  const label = unpackLabels(new Uint16Array(cut.labels), W * H);
  assert.ok(label, 'the labels unpack');
  assert.deepEqual(patchShapes(label, W, H), cut.shapes);
  assert.equal(cut.shapes.length, cut.count);

  // Every pixel of the item is in a patch, and no clear one.
  const lit = litMask(px, W, H);
  assert.deepEqual(cut.lit, lit);
  for (let i = 0; i < W * H; i++) assert.equal(label[i] >= 0, lit[i] === 1, `pixel ${i}`);

  // Each patch uncovers once, at its own time within the plan, its area as cut.
  assert.deepEqual([...cut.order].sort((x, y) => x - y), cut.shapes.map((_, i) => i));
  assert.deepEqual(cut.areas, cut.order.map((i) => cut.shapes[i].area));
  assert.equal(cut.delays.length, cut.count);
  for (let r = 1; r < cut.count; r++) assert.ok(cut.delays[r] >= cut.delays[r - 1], `patch ${r} after the one before`);
  // The pace guests burn the patches in by: the first a gap after the
  // second, every patch burning for a whole number of ms, half the item in
  // by the plan's half and all of it within the plan's span.
  assert.ok(cut.gap > 0 && cut.burn > 0 && Number.isInteger(cut.burn), `gap ${cut.gap}, burn ${cut.burn}`);
  assert.equal(cut.delays[0], FIRST_PATCH_MS);
  assert.ok(Math.abs(cut.delays[1] - cut.delays[0] - cut.gap) < 1e-9);
  assert.ok(areaTime(cut.delays, cut.burn, cut.areas) <= plan.halfBy);
  assert.ok(cut.delays.at(-1)! + cut.burn <= FIRST_PATCH_MS + plan.ms, `all in by ${cut.delays.at(-1)! + cut.burn}`);
  assert.deepEqual(cut.box, visibleBox(px, W, H));
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
  const place: [number, number, number, number] = [3, 3, W - 6, H - 6];
  const list = transfers({ w: W, h: H, place, data, cut: { ...cut, pixels } });
  assert.equal(new Set(list).size, list.length);
  for (const b of [data, cut.labels, cut.lit.buffer, pixels.data.buffer]) assert.ok(list.includes(b as ArrayBuffer));
  for (const s of cut.shapes) for (const a of [s.mask, s.own, s.edges]) assert.ok(list.includes(a.buffer as ArrayBuffer));
  assert.deepEqual(transfers({ w: W, h: H, place, data }), [data]);
});

/**
 * A canvas that keeps what is drawn on it as rectangles where they land
 * (translate, scale and drawImage are all prepare uses to place the art),
 * with empty pixels to read back.
 */
function canvasThatRecords(width: number, height: number) {
  const drawn: [number, number, number, number][] = [];
  let t = { x: 0, y: 0, sx: 1, sy: 1 };
  const ctx = {
    imageSmoothingQuality: 'low',
    filter: 'none',
    translate: (x: number, y: number) => (t = { ...t, x: t.x + x * t.sx, y: t.y + y * t.sy }),
    scale: (sx: number, sy: number) => (t = { ...t, sx: t.sx * sx, sy: t.sy * sy }),
    setTransform: () => (t = { x: 0, y: 0, sx: 1, sy: 1 }),
    drawImage: (_: unknown, x: number, y: number, w: number, h: number) => {
      const xs = [t.x + t.sx * x, t.x + t.sx * (x + w)];
      const ys = [t.y + t.sy * y, t.y + t.sy * (y + h)];
      drawn.push([Math.min(...xs), Math.min(...ys), Math.abs(t.sx * w), Math.abs(t.sy * h)]);
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
  };
  return { width, height, drawn, getContext: () => ctx };
}

test('a prepared picture says where the item’s own art lies in it, so the original takes over there at the reveal', async () => {
  for (const mirror of [false, true]) {
    for (let run = 0; run < 20; run++) {
      const canvases: ReturnType<typeof canvasThatRecords>[] = [];
      const surface = (w: number, h: number) => {
        const c = canvasThatRecords(w, h);
        canvases.push(c);
        return c as unknown as OffscreenCanvas;
      };
      const job = { w: 104, h: 208, most: 4, grayscale: false, mirror };
      const out = await prepare({} as CanvasImageSource, 416, job, surface, async () => new ArrayBuffer(4));
      const S = 4;
      const [page] = canvases;
      assert.equal(page.drawn.length, 1);
      // Where the art was drawn, in the picture's art pixels: its place.
      const [x, y, w, h] = page.drawn[0].map((v) => v / S);
      assert.deepEqual(out.place, [x, y, w, h], `mirrored ${mirror}`);
      assert.equal(out.w, page.width / S);
      assert.equal(out.h, page.height / S);
      // Inside the picture, a little smaller than the art and in proportion.
      assert.ok(x > 0 && y > 0 && x + w < out.w && y + h < out.h, `${out.place} in ${out.w} x ${out.h}`);
      assert.ok(w >= job.w * 0.9 - 0.5 && w <= job.w && h >= job.h * 0.9 - 0.5 && h <= job.h);
      assert.ok(Math.abs(w / h - job.w / job.h) < 0.01);
    }
  }
});
