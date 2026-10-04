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
  /**
   * Where the item carries on into another patch: (x, y, patch) triples, x and
   * y relative to this patch, for each of its own pixels that touches a pixel
   * of that other patch (`patch` is its index in the result). Guests use it to
   * show where something is still missing.
   */
  edges: Uint16Array;
}

/** Pixels at or below this alpha count as transparent. */
const CLEAR = 8;

/** Where a picture's visible pixels are: x, y, w, h (the whole picture if none are). */
export function visibleBox(rgba: Uint8ClampedArray, W: number, H: number): [number, number, number, number] {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (rgba[(y * W + x) * 4 + 3] <= CLEAR) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? [0, 0, W, H] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}


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

  // A few rounds of moving each seed to the middle of the pixels nearest to
  // it (Lloyd's relaxation) even out the patches' sizes, so every step of the
  // reveal shows about as much. Each seed lands on its own pixel nearest that
  // middle, so it stays on the item even where the item curves.
  const near = new Int16Array(lit.length);
  for (let round = 0; round < 8; round++) {
    const cx = new Float64Array(n);
    const cy = new Float64Array(n);
    const count = new Uint32Array(n);
    lit.forEach((p, q) => {
      const x = p % W;
      const y = (p / W) | 0;
      let best = Infinity;
      let k = 0;
      for (let j = 0; j < n; j++) {
        const d = (x - sx[j]) ** 2 + (y - sy[j]) ** 2;
        if (d < best) {
          best = d;
          k = j;
        }
      }
      near[q] = k;
      cx[k] += x;
      cy[k] += y;
      count[k]++;
    });
    const best = new Float64Array(n).fill(Infinity);
    const nx = sx.slice();
    const ny = sy.slice();
    lit.forEach((p, q) => {
      const k = near[q];
      const x = p % W;
      const y = (p / W) | 0;
      const d = (x - cx[k] / count[k]) ** 2 + (y - cy[k] / count[k]) ** 2;
      if (d < best[k]) {
        best[k] = d;
        nx[k] = x;
        ny[k] = y;
      }
    });
    sx.splice(0, n, ...nx);
    sy.splice(0, n, ...ny);
  }

  // Each visible pixel joins the seed nearest to it after a noisy nudge,
  // which turns the straight borders between seeds ragged.
  const cell = Math.sqrt(lit.length / n);
  const amp = cell * 0.32;
  const freq = 1 / Math.max(2, cell * 0.5);
  const nseed = (rand() * 2 ** 31) | 0;
  const label = new Int16Array(W * H).fill(-1);
  for (const p of lit) {
    const x = p % W;
    const y = (p / W) | 0;
    // Two scales of nudge: broad bends, and a finer wobble on top, so no
    // border runs straight for long.
    const f2 = freq * 3;
    const wx =
      x +
      (valueNoise(x * freq, y * freq, nseed) - 0.5) * 2 * amp +
      (valueNoise(x * f2 + 7.1, y * f2 + 3.9, nseed) - 0.5) * amp * 0.8;
    const wy =
      y +
      (valueNoise(x * freq + 31.7, y * freq + 11.3, nseed) - 0.5) * 2 * amp +
      (valueNoise(x * f2 + 51.3, y * f2 + 23.9, nseed) - 0.5) * amp * 0.8;
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
  // Seeds can end up with no pixels; the rest are numbered as they come out.
  const index = new Int16Array(n).fill(-1);
  for (let k = 0, m = 0; k < n; k++) if (x1[k] >= 0) index[k] = m++;
  const out: RawPatch[] = [];
  for (let k = 0; k < n; k++) {
    if (x1[k] < 0) continue;
    const px = Math.max(0, x0[k] - 1);
    const py = Math.max(0, y0[k] - 1);
    const w = Math.min(W - 1, x1[k] + 1) - px + 1;
    const h = Math.min(H - 1, y1[k] + 1) - py + 1;
    const pixels = new Uint8ClampedArray(w * h * 4);
    const edges: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = px + x;
        const gy = py + y;
        const g = gy * W + gx;
        if (label[g] < 0) continue;
        const own = label[g] === k;
        let mine = own;
        const others: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const l = label[ny * W + nx];
            if (l === k) mine = true;
            else if (l >= 0 && !others.includes(l)) others.push(l);
          }
        }
        if (!mine) continue;
        const o = (y * w + x) * 4;
        pixels.set(rgba.subarray(g * 4, g * 4 + 4), o);
        if (own) for (const l of others) edges.push(x, y, index[l]);
      }
    }
    out.push({ x: px, y: py, w, h, pixels, edges: Uint16Array.from(edges) });
  }
  return out;
}

/**
 * The order patches are revealed in: the reveal spreads through the item
 * like fire. It starts at a random patch, and each next one is a neighbour
 * of what's already revealed (one sharing more border with it is likelier,
 * so the revealed part grows as a whole rather than in tendrils). Only when
 * nothing revealed touches the rest (an item in separate pieces) does it
 * start again somewhere new.
 */
export function spreadOrder(patches: RawPatch[], seed: number): number[] {
  const n = patches.length;
  const rand = seededRandom(seed ^ 0x5bd1e995);
  // How many border pixels each pair of patches shares.
  const contact = patches.map(() => new Map<number, number>());
  patches.forEach((p, k) => {
    for (let j = 2; j < p.edges.length; j += 3) contact[k].set(p.edges[j], (contact[k].get(p.edges[j]) ?? 0) + 1);
  });
  const done = new Uint8Array(n);
  const pull = new Float64Array(n);
  const order: number[] = [];
  while (order.length < n) {
    let next = -1;
    let total = 0;
    for (let k = 0; k < n; k++) if (!done[k]) total += pull[k];
    if (total > 0) {
      let r = rand() * total;
      for (let k = 0; k < n && next < 0; k++) if (!done[k] && (r -= pull[k]) <= 0) next = k;
      if (next < 0) for (let k = n - 1; k >= 0 && next < 0; k--) if (!done[k] && pull[k] > 0) next = k;
    } else {
      const left = [];
      for (let k = 0; k < n; k++) if (!done[k]) left.push(k);
      next = left[Math.floor(rand() * left.length)];
    }
    done[next] = 1;
    order.push(next);
    for (const [j, c] of contact[next]) if (!done[j]) pull[j] += c;
  }
  return order;
}
