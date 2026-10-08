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
  /** How many of the item's pixels are this patch's own (its ring of neighbours' not counted). */
  area: number;
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
    let area = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = px + x;
        const gy = py + y;
        const g = gy * W + gx;
        if (label[g] < 0) continue;
        const own = label[g] === k;
        if (own) area++;
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
    out.push({ x: px, y: py, w, h, pixels, edges: Uint16Array.from(edges), area });
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

/** The shortest a patch takes to burn in (ms), so many small ones still read as a burn. */
const MIN_BURN = 900;
/** A patch burns this many times the gap between patches, so the magic never stalls. */
const BURN_OVERLAP = 1.6;

/**
 * How a veil of `count` patches comes in over `ms`: a patch starts every `gap`
 * ms and takes `burn` ms, so the last one has burnt in `ms` after the first
 * started, however many patches there are (a single one burns all along).
 */
export function veilPace(ms: number, count: number): { gap: number; burn: number } {
  if (count <= 1) return { gap: 0, burn: ms };
  const burn = Math.max(Math.min(MIN_BURN, ms), (BURN_OVERLAP * ms) / (count - 1 + BURN_OVERLAP));
  return { gap: (ms - burn) / (count - 1), burn };
}

/**
 * How long a veil of `count` patches takes to burn in: `ms` (its share of the
 * clock), unless half of it would then come in after `halfBy` (ms after its
 * art goes out, halfBurnt), when it is the longest whole number of ms that
 * still has half of it in by then (0 if none does). `late` as for halfBurnt.
 * delve.ts veilSeconds sizes a question's veil by it for `size` × `size`
 * patches; the host then paces each picture by its own patches (veilSchedule).
 */
export function veilSpan(ms: number, count: number, halfBy: number, late = 0): number {
  return longestFitting(ms, (t) => halfBurnt(t, count, late) <= halfBy);
}

/** `ms` if it `fits`, else the longest whole number of ms below it that does (0 if none does); `fits` only fails more as the time grows. */
function longestFitting(ms: number, fits: (t: number) => boolean): number {
  if (fits(ms)) return ms;
  let [lo, hi] = [0, Math.floor(ms)];
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * A burning patch's front, as fractions of its sweep (materialize.ts): a mist
 * runs RIM ahead of it, and behind it each grain glints for LINE and cools
 * for COOL more. The sweep runs from -RIM to 1 + LINE + COOL over the burn.
 */
export const BURN_RIM = 0.1;
export const BURN_LINE = 0.06;
export const BURN_COOL = 0.45;

/**
 * The share of a patch's area in view `p` of the way through its burn: a
 * grain shows (as the art, glinting) once the front has reached it, and the
 * front crosses the patch from 6% to 68% of the burn (materialize.ts). The
 * grains are taken as spread evenly along its way, so the area comes in
 * steadily between the two.
 */
export function burntShare(p: number): number {
  return Math.min(1, Math.max(0, p * (1 + BURN_RIM + BURN_LINE + BURN_COOL) - BURN_RIM));
}

/** How much of the area is in view at `t` with patches of `areas` starting at `delays` (ms), each taking `burn`. */
export function areaIn(t: number, delays: number[], burn: number, areas: number[]): number {
  let sum = 0;
  for (let r = 0; r < delays.length; r++) {
    if (t < delays[r]) continue;
    sum += areas[r] * (burn > 0 ? burntShare((t - delays[r]) / burn) : 1);
  }
  return sum;
}

/** When `part` of the area (half, by default) is in view, as areaIn has it. */
export function areaTime(delays: number[], burn: number, areas: number[], part = 0.5): number {
  const total = areas.reduce((a, b) => a + b, 0);
  if (!delays.length || total <= 0) return 0;
  const goal = total * part;
  // areaIn only grows: halve the stretch from the first start to the last end.
  let [lo, hi] = [delays[0], delays[delays.length - 1] + burn];
  if (areaIn(lo, delays, burn, areas) >= goal) return lo;
  for (let i = 0; i < 48 && hi - lo > 1e-6; i++) {
    const mid = (lo + hi) / 2;
    if (areaIn(mid, delays, burn, areas) >= goal) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** What a veiled picture is paced for (ms after its art goes out, its clock starting then too). */
export interface VeilPlan {
  /** The longest it may take: its share of the clock. */
  ms: number;
  /** Half its area is in by then at the latest (VEIL_LEFT_MS before the clock ends). */
  halfBy: number;
  /** Where its last patch lands, unless that would be sooner than paced for the half (about a second before the clock ends). */
  endBy: number;
  /** Steps of its pace it may start late, as for halfBurnt. */
  late?: number;
}

/**
 * When a picture's patches start burning in, in reveal order (ms after its
 * art goes out), how long each takes, the steady pace's gap up to the half,
 * and when half its area and all of it are in.
 */
export interface VeilSchedule {
  delays: number[];
  burn: number;
  gap: number;
  half: number;
  end: number;
}

/**
 * How a picture cut into patches of `areas` (in the order they are revealed)
 * burns in, as `plan` has it. Patches differ in size, so "half" is half the
 * area (areaTime). It comes in two speeds:
 * - a steady pace (veilPace) up to its half: over all of `ms` where half of
 *   the area is still in by `halfBy`, else just fast enough for half of it to
 *   be in right then (`late` steps late, for a picture that may start late);
 * - then the patches not started by the half come in at a pace of their own,
 *   the last done `ms` after the first started or at `endBy`, whichever is
 *   sooner. That is mostly slower: where the steady pace would bring the
 *   whole art in long before the end, a deeper depth's shorter clock would
 *   leave more time once it is in. Only where the steady pace would land
 *   after `endBy` (a 6 s clock) is the rest faster, so the art is in about a
 *   second before the end there too, and no shallower depth leaves less.
 * A picture that may start `late` lands late by as much as its half does,
 * so its half, its end and its whole span (late start and all) are paced to
 * fit all the same. The host paces the patches by this (media.svelte.ts
 * cutVeil) and sends each picture's burn, so guests follow the same pace.
 */
export function veilSchedule(areas: number[], plan: VeilPlan): VeilSchedule {
  const n = areas.length;
  if (!n) return { delays: [], burn: 0, gap: 0, half: 0, end: 0 };
  const late = plan.late ?? 0;
  const steady = (span: number) => {
    const { gap, burn } = veilPace(span, n);
    const delays = Array.from({ length: n }, (_, r) => FIRST_PATCH_MS + r * gap);
    return { gap, burn, delays, half: areaTime(delays, burn, areas) };
  };
  const span = longestFitting(plan.ms, (t) => {
    const { gap, half } = steady(t);
    return half + late * gap <= plan.halfBy && t + late * gap <= plan.ms;
  });
  const { gap, burn, delays, half } = steady(span);
  const end = Math.min(FIRST_PATCH_MS + plan.ms, plan.endBy) - late * gap;
  // The first patch not started by the half and those after it take their
  // own pace, none of them starting before the half, so it stays where it is
  // (a few big patches may then land a little after `end`).
  const h = delays.findIndex((d) => d >= half);
  if (h > 0) {
    const rest = Math.max(0, (end - burn - delays[h - 1]) / (n - h));
    const from = Math.max(half, delays[h - 1] + rest);
    const step = from === half && n - h > 1 ? Math.max(0, (end - burn - half) / (n - h - 1)) : rest;
    for (let r = h; r < n; r++) delays[r] = from + (r - h) * step;
  }
  return { delays, burn, gap, half: half + late * gap, end: delays[n - 1] + burn };
}

/** When a veil's first patch starts burning in, ms after its art goes out (veilSchedule). */
export const FIRST_PATCH_MS = 400;

/**
 * When half of a veil of `count` patches, coming in over `ms` (veilPace), has
 * burnt in: ms after its art goes out. `late`: steps of the pace a picture
 * starts behind the first (session.svelte.ts burnVeil staggers several
 * pictures by up to half a step).
 */
export function halfBurnt(ms: number, count: number, late = 0): number {
  const { gap, burn } = veilPace(ms, count);
  return FIRST_PATCH_MS + (count / 2 + late) * gap + burn;
}
