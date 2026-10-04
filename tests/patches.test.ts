import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutPatches, spreadOrder, visibleBox } from '../src/lib/patches.ts';

/** A W × H picture: an opaque ellipse with a soft edge on a transparent background. */
function ellipse(W: number, H: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = Math.hypot((x - W / 2) / (W * 0.4), (y - H / 2) / (H * 0.4));
      const o = (y * W + x) * 4;
      px[o] = (x * 7) & 255;
      px[o + 1] = (y * 5) & 255;
      px[o + 2] = 128;
      px[o + 3] = r < 0.95 ? 255 : r < 1 ? 100 : 0;
    }
  }
  return px;
}

test('patches cover every visible pixel exactly as it is, and nothing else', () => {
  const W = 90;
  const H = 120;
  const art = ellipse(W, H);
  const patches = cutPatches(art, W, H, 5, 1234);
  const covered = new Uint8Array(W * H);
  for (const p of patches) {
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= W && p.y + p.h <= H);
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const o = (y * p.w + x) * 4;
        if (!p.pixels[o + 3]) continue;
        const g = (p.y + y) * W + p.x + x;
        assert.deepEqual([...p.pixels.subarray(o, o + 4)], [...art.subarray(g * 4, g * 4 + 4)]);
        covered[g] = 1;
      }
    }
  }
  for (let g = 0; g < W * H; g++) assert.equal(covered[g], art[g * 4 + 3] > 8 ? 1 : 0, `pixel ${g}`);
});

test('patches come out about as big as the old grid tiles over the item', () => {
  const W = 90;
  const H = 120;
  const art = ellipse(W, H);
  let visible = 0;
  for (let g = 0; g < W * H; g++) if (art[g * 4 + 3] > 8) visible++;
  for (const size of [5, 7]) {
    const n = cutPatches(art, W, H, size, 7).length;
    const expected = Math.round(((size * size) / (W * H)) * visible);
    assert.ok(Math.abs(n - expected) <= 1, `size ${size}: ${n} patches, expected about ${expected}`);
  }
});

test('the same seed cuts the same patches', () => {
  const art = ellipse(60, 60);
  assert.deepEqual(cutPatches(art, 60, 60, 5, 99), cutPatches(art, 60, 60, 5, 99));
  assert.notDeepEqual(cutPatches(art, 60, 60, 5, 99), cutPatches(art, 60, 60, 5, 100));
});

test('a fully transparent picture has no patches', () => {
  assert.deepEqual(cutPatches(new Uint8ClampedArray(20 * 20 * 4), 20, 20, 5, 1), []);
});

test('edges mark where a patch meets another, from both sides', () => {
  const W = 90;
  const H = 120;
  const patches = cutPatches(ellipse(W, H), W, H, 5, 321);
  const meets = new Set<string>();
  patches.forEach((p, k) => {
    assert.equal(p.edges.length % 3, 0);
    assert.ok(p.edges.length > 0, `patch ${k} touches nothing`);
    for (let e = 0; e < p.edges.length; e += 3) {
      const [x, y, other] = [p.edges[e], p.edges[e + 1], p.edges[e + 2]];
      assert.ok(other < patches.length && other !== k);
      assert.ok(x < p.w && y < p.h && p.pixels[(y * p.w + x) * 4 + 3] > 0, 'an edge lies on the patch');
      meets.add(`${k}-${other}`);
    }
  });
  for (const m of meets) assert.ok(meets.has(m.split('-').reverse().join('-')), `${m} one-sided`);
});

test('patches are about the same size, so every step reveals about as much', () => {
  const W = 180;
  const H = 240;
  const art = ellipse(W, H);
  for (const seed of [1, 2, 3]) {
    const areas = cutPatches(art, W, H, 5, seed).map((p) => {
      let a = 0;
      for (let i = 0; i < p.w * p.h; i++) if (p.pixels[i * 4 + 3]) a++;
      return a;
    });
    const mean = areas.reduce((a, b) => a + b, 0) / areas.length;
    const spread = Math.sqrt(areas.reduce((a, b) => a + (b - mean) ** 2, 0) / areas.length) / mean;
    assert.ok(spread < 0.3, `seed ${seed}: sizes vary by ${(spread * 100).toFixed(0)}%`);
  }
});

test('the reveal spreads: each patch touches one revealed before it', () => {
  const W = 180;
  const H = 240;
  const patches = cutPatches(ellipse(W, H), W, H, 5, 11);
  const touches = (a: number, b: number) => {
    const e = patches[a].edges;
    for (let j = 2; j < e.length; j += 3) if (e[j] === b) return true;
    return false;
  };
  for (const seed of [1, 2, 3]) {
    const order = spreadOrder(patches, seed);
    assert.deepEqual([...order].sort((a, b) => a - b), patches.map((_, k) => k));
    order.forEach((k, r) => {
      if (r > 0) assert.ok(order.slice(0, r).some((j) => touches(k, j)), `patch ${k} (step ${r}) touches nothing revealed`);
    });
  }
  assert.deepEqual(spreadOrder(patches, 5), spreadOrder(patches, 5));
});

test('the visible box hugs the visible pixels', () => {
  const W = 40;
  const H = 30;
  const px = new Uint8ClampedArray(W * H * 4);
  px[(5 * W + 7) * 4 + 3] = 255;
  px[(20 * W + 31) * 4 + 3] = 255;
  px[(25 * W + 2) * 4 + 3] = 5;
  assert.deepEqual(visibleBox(px, W, H), [7, 5, 25, 16]);
  assert.deepEqual(visibleBox(new Uint8ClampedArray(W * H * 4), W, H), [0, 0, W, H]);
});
