// Veiled art is revealed piece by piece, and guests only ever receive the
// pieces uncovered so far. The pieces are organic patches of the item itself:
// its visible pixels split around seed points, with the borders warped by
// noise so no grid or straight edge shows. Transparent pixels belong to no
// patch, so every patch shows part of the item.

/** A seeded random number generator (mulberry32), in [0, 1). */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise in [0, 1]. */
export function valueNoise(x: number, y: number, seed: number): number {
  const hash = (i: number, j: number) => {
    let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * u;
  const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * u;
  return a + (b - a) * v;
}

export interface RawPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  /** RGBA, w × h: the patch's pixels, everything else transparent. */
  pixels: Uint8ClampedArray;
}

/** Pixels at or below this alpha count as transparent. */
const CLEAR = 8;

/**
 * Splits the visible pixels of a W × H RGBA picture into patches. `size` is
 * the veil's grid size: the patches come out about as big as the tiles of a
 * size × size grid over the whole picture used to, so the art reveals at the
 * same pace. Each patch also takes a 1px ring of its neighbours' pixels, so
 * patches drawn side by side and scaled meet without seams.
 */
export function cutPatches(rgba: Uint8ClampedArray, W: number, H: number, size: number, seed: number): RawPatch[] {
  const rand = seededRandom(seed);
  const lit: number[] = [];
  for (let i = 0; i < W * H; i++) if (rgba[i * 4 + 3] > CLEAR) lit.push(i);
  if (!lit.length) return [];
  const n = Math.max(1, Math.min(255, Math.round(((size * size) / (W * H)) * lit.length), lit.length));

  // Seeds spread evenly over the item: each the farthest of a few candidates
  // from those already placed.
  const sx: number[] = [];
  const sy: number[] = [];
  for (let k = 0; k < n; k++) {
    let best = -1;
    let bx = 0;
    let by = 0;
    for (let c = 0; c < 12; c++) {
      const p = lit[Math.floor(rand() * lit.length)];
      const x = p % W;
      const y = (p / W) | 0;
      let near = Infinity;
      for (let j = 0; j < sx.length; j++) near = Math.min(near, (x - sx[j]) ** 2 + (y - sy[j]) ** 2);
      if (near > best) {
        best = near;
        bx = x;
        by = y;
      }
    }
    sx.push(bx);
    sy.push(by);
  }

  // Each visible pixel joins the seed nearest to it after a noisy nudge,
  // which turns the straight borders between seeds ragged.
  const cell = Math.sqrt(lit.length / n);
  const amp = cell * 0.45;
  const freq = 1 / Math.max(2, cell * 0.5);
  const nseed = (rand() * 2 ** 31) | 0;
  const label = new Int16Array(W * H).fill(-1);
  for (const p of lit) {
    const x = p % W;
    const y = (p / W) | 0;
    const wx = x + (valueNoise(x * freq, y * freq, nseed) - 0.5) * 2 * amp;
    const wy = y + (valueNoise(x * freq + 31.7, y * freq + 11.3, nseed) - 0.5) * 2 * amp;
    let best = Infinity;
    let k = 0;
    for (let j = 0; j < n; j++) {
      const d = (wx - sx[j]) ** 2 + (wy - sy[j]) ** 2;
      if (d < best) {
        best = d;
        k = j;
      }
    }
    label[p] = k;
  }

  // Bounding boxes, grown by the 1px ring.
  const x0 = new Array(n).fill(W);
  const y0 = new Array(n).fill(H);
  const x1 = new Array(n).fill(-1);
  const y1 = new Array(n).fill(-1);
  for (const p of lit) {
    const k = label[p];
    const x = p % W;
    const y = (p / W) | 0;
    if (x < x0[k]) x0[k] = x;
    if (y < y0[k]) y0[k] = y;
    if (x > x1[k]) x1[k] = x;
    if (y > y1[k]) y1[k] = y;
  }
  const out: RawPatch[] = [];
  for (let k = 0; k < n; k++) {
    if (x1[k] < 0) continue;
    const px = Math.max(0, x0[k] - 1);
    const py = Math.max(0, y0[k] - 1);
    const w = Math.min(W - 1, x1[k] + 1) - px + 1;
    const h = Math.min(H - 1, y1[k] + 1) - py + 1;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = px + x;
        const gy = py + y;
        const g = gy * W + gx;
        if (label[g] < 0) continue;
        let mine = label[g] === k;
        for (let dy = -1; dy <= 1 && !mine; dy++) {
          for (let dx = -1; dx <= 1 && !mine; dx++) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < H && label[ny * W + nx] === k) mine = true;
          }
        }
        if (!mine) continue;
        const o = (y * w + x) * 4;
        pixels.set(rgba.subarray(g * 4, g * 4 + 4), o);
      }
    }
    out.push({ x: px, y: py, w, h, pixels });
  }
  return out;
}
