// An item picture's drop shadow, worked out once as a bitmap (lib/castShadow.ts,
// in a worker: lib/artShadowWorker.ts) in place of the CSS filter that drew it
// again whenever what held it was painted. It must look as the filter did:
// the blur the filter spec defines (and WebKit draws), nothing of it cut off,
// at a texel a CSS px no different from the blur at a phone's pixels, in the
// box the picture has, and the shadow ArtImage's CSS still writes.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { SHADOW, blurAlpha, boxes, castBox, fitOf, reach, shadowOf } = await import('../src/lib/castShadow.ts');

/** The spec's three box blurs, summed out pixel by pixel: across, then down. */
function bySpec(src: Float32Array, w: number, h: number, sigma: number) {
  let a = Float32Array.from(src);
  for (const [back, on] of boxes(sigma)) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = x - back; i <= x + on; i++) if (i >= 0 && i < w) s += a[y * w + i]!;
        out[y * w + x] = s / (back + on + 1);
      }
    a = out;
  }
  for (const [back, on] of boxes(sigma)) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = y - back; i <= y + on; i++) if (i >= 0 && i < h) s += a[i * w + x]!;
        out[y * w + x] = s / (back + on + 1);
      }
    a = out;
  }
  return a;
}

/** An item-like shape (a disc, a thin bar, a block) in a `w` x `h` px field, `k` texels to the px, each texel the share of it the shape covers. */
function shape(w: number, h: number, k: number) {
  const a = new Float32Array(w * k * h * k);
  const S = 3;
  for (let y = 0; y < h * k; y++)
    for (let x = 0; x < w * k; x++) {
      let n = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const px = (x + (sx + 0.5) / S) / k;
          const py = (y + (sy + 0.5) / S) / k;
          if ((px - 140) ** 2 + (py - 130) ** 2 < 40 ** 2 || (px > 110 && px < 111.5 && py > 100 && py < 210) || (px > 150 && px < 190 && py > 160 && py < 205)) n++;
        }
      a[y * w * k + x] = n / (S * S);
    }
  return a;
}

/** `a` (w·k x h·k) with each k x k patch averaged into one texel, as a picture drawn smaller is. */
function averaged(a: Float32Array, w: number, h: number, k: number) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) out[Math.floor(y / k) * w + Math.floor(x / k)]! += a[y * w * k + x]! / (k * k);
  return out;
}

test('the blur is the three boxes the filter spec makes of a Gaussian blur', () => {
  // d = ⌊25 · 3√(2π)/4 + 0.5⌋ = 47: odd, so three centred on the pixel.
  assert.deepEqual(boxes(SHADOW.blur), [
    [23, 23],
    [23, 23],
    [23, 23],
  ]);
  assert.equal(reach(SHADOW.blur), 69);
  // d = 6: even, two on the pixel's edges and one a pixel wider on it.
  assert.deepEqual(boxes(3), [
    [3, 2],
    [2, 3],
    [3, 3],
  ]);
  for (const sigma of [3, 5]) {
    const [w, h] = [41, 29];
    const src = Float32Array.from({ length: w * h }, (_, i) => ((i * 7919) % 101) / 100);
    const mine = blurAlpha(Float32Array.from(src), w, h, sigma);
    const spec = bySpec(src, w, h, sigma);
    for (let i = 0; i < mine.length; i++) assert.ok(Math.abs(mine[i]! - spec[i]!) < 1e-5, `texel ${i} at sigma ${sigma}: ${mine[i]} against ${spec[i]}`);
  }
});

test('nothing of the shadow is cut off at its bitmap’s edges', () => {
  const [w, h] = [96.4, 171.7];
  const { pad, cw, ch } = castBox(w, h);
  const rgba = new Uint8ClampedArray(cw * ch * 4);
  let area = 0;
  for (let y = pad; y < pad + Math.floor(h); y++)
    for (let x = pad; x < pad + Math.floor(w); x++) {
      rgba[(y * cw + x) * 4 + 3] = 255;
      area++;
    }
  shadowOf(rgba, cw, ch);
  let total = 0;
  for (let i = 0; i < cw * ch; i++) {
    assert.equal(rgba[i * 4]! + rgba[i * 4 + 1]! + rgba[i * 4 + 2]!, 0, 'the shadow is black');
    total += rgba[i * 4 + 3]!;
  }
  // (Rounded to 8 bits each, so only near the picture's own sum.)
  assert.ok(Math.abs(total / 255 - area * SHADOW.alpha) < area * 0.002, `the shadow holds all the picture's alpha, times ${SHADOW.alpha}: ${total / 255} against ${area * SHADOW.alpha}`);
  for (let x = 0; x < cw; x++) assert.equal(rgba[x * 4 + 3], 0, 'its top row is clear');
  for (let x = 0; x < cw; x++) assert.equal(rgba[((ch - 1) * cw + x) * 4 + 3], 0, 'its bottom row is clear');
  for (let y = 0; y < ch; y++) assert.equal(rgba[y * cw * 4 + 3], 0, 'its left column is clear');
  for (let y = 0; y < ch; y++) assert.equal(rgba[(y * cw + cw - 1) * 4 + 3], 0, 'its right column is clear');
});

test('at a texel a CSS px, the shadow drawn up to a phone’s pixels is the one worked out at them', () => {
  // The browser drew the filter at the screen's pixels: three to a px on an
  // iPhone, the blur three times as wide in them. The bitmap is a texel to
  // the px, the picture drawn into it that much smaller, and drawn up three
  // times (bilinear, as a canvas is drawn bigger).
  const [w, h] = [280, 280];
  const k = 3;
  const fine = shape(w, h, k);
  const lo = blurAlpha(averaged(fine, w, h, k), w, h, SHADOW.blur);
  const hi = blurAlpha(fine, w * k, h * k, SHADOW.blur * k);
  let worst = 0;
  for (let y = 0; y < h * k; y++)
    for (let x = 0; x < w * k; x++) {
      const u = Math.min(w - 1, Math.max(0, (x + 0.5) / k - 0.5));
      const v = Math.min(h - 1, Math.max(0, (y + 0.5) / k - 0.5));
      const [x0, y0] = [Math.floor(u), Math.floor(v)];
      const [x1, y1] = [Math.min(w - 1, x0 + 1), Math.min(h - 1, y0 + 1)];
      const [fx, fy] = [u - x0, v - y0];
      const up = (lo[y0 * w + x0]! * (1 - fx) + lo[y0 * w + x1]! * fx) * (1 - fy) + (lo[y1 * w + x0]! * (1 - fx) + lo[y1 * w + x1]! * fx) * fy;
      worst = Math.max(worst, Math.abs(up - hi[y * w * k + x]!) * SHADOW.alpha * 255);
    }
  assert.ok(worst < 0.05, `within a twentieth of an 8-bit level everywhere: ${worst.toFixed(4)}`);
});

test('the shadow is made for the box the picture is drawn in, as app.css fits .art-fit', () => {
  const near = (a: { w: number; h: number }, b: { w: number; h: number }) => assert.ok(Math.abs(a.w - b.w) < 1e-9 && Math.abs(a.h - b.h) < 1e-9, `${JSON.stringify(a)} against ${JSON.stringify(b)}`);
  // A ring: no bigger than its art times the scale.
  near(fitOf(300, 300, 50, 50, 1.6), { w: 80, h: 80 });
  // A tile's tall weapon: as tall as the slot, at its proportions.
  near(fitOf(110, 180, 104, 312, 1.6), { w: 60, h: 180 });
  // A wide one: as wide as the slot.
  near(fitOf(110, 180, 208, 104, 1.6), { w: 110, h: 55 });
  // Today's unique, round (--round 1.4167): a belt as wide as the circle holds it, past the box's sides.
  const diag = Math.hypot(200, 50);
  near(fitOf(100, 100, 200, 50, 4, 1.4167), { w: (1.4167 * 100 * 200) / diag, h: (1.4167 * 100 * 50) / diag });
  const css = readFileSync('src/app.css', 'utf8');
  assert.match(css, /\.art-fit \{[^}]*width: min\(100cqw, 100cqh \* var\(--w\) \/ var\(--h\), var\(--w\) \* var\(--s\) \* 1px\);/, 'app.css fits .art-fit as fitOf does: change both');
  assert.match(css, /\.art-fit\.round \{[^}]*width: min\(var\(--w\) \* var\(--s\) \* 1px, max\(min\(100cqw, 100cqh \* var\(--w\) \/ var\(--h\)\), var\(--round, 1\) \* 100cqw \* var\(--w\) \/ var\(--diag\)\)\);/, 'app.css fits a round .art-fit as fitOf does: change both');
});

test('the shadow is the one ArtImage’s CSS draws where it can’t have the bitmap', () => {
  const art = readFileSync('src/components/ArtImage.svelte', 'utf8');
  const filter = art.match(/\.shot > img\.filtered \{\s*filter: ([^;]+);/);
  assert.ok(filter, 'ArtImage keeps the filter for a picture whose shadow is not made');
  assert.equal(filter[1], `drop-shadow(0 ${SHADOW.dy}px ${SHADOW.blur}px rgba(0, 0, 0, ${SHADOW.alpha}))`);
});
