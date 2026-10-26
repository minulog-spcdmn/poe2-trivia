// The arithmetic of a veiled patch burning in (materialize.ts): where the
// magic starts, when each pixel comes in, and each frame's pixels as the
// front sweeps across. Shared by the worker that draws the burns away from
// the page's main thread (burnWorker.ts) and the page itself, where no
// worker can: on an iPhone each new patch and every frame of its fizzle held
// the page there, the question screens of a race at 50 to 54 fps with frames
// of 60 to 120 ms, and the reveal's last patches burning in at once gave
// frames of 100 to 158 ms.

import { BURN_COOL, BURN_LINE, BURN_RIM, valueNoise } from './patches';
import { rankAscending } from './rank';

/**
 * As fractions of the burn: the mist ahead of the front, the twinkling ahead
 * of that, how long each grain glints, and how long its light takes to cool
 * (in patches.ts, where the host paces the veil by them: burntShare).
 */
const RIM = BURN_RIM;
const AHEAD = 0.14;
const LINE = BURN_LINE;
const COOL = BURN_COOL;
/** How ragged the front is, in art pixels either way. */
const ROUGH = 5;
/** How far single grains stray from the front, in art pixels either way: the fizzle. */
const GRAIN = 4;
/** Share of the pixels ahead of the front that twinkle. */
const SPARKLY = 0.08;
/** Sparks off the front per second, at most. */
const SPARKS = 130;

const HOT = [255, 250, 232];
/** The mist the item gathers out of. */
const MIST = [255, 190, 100];
/** The inner light, added to the art: pale gold while hot, cooling to amber. */
const LIGHT_HOT = [235, 200, 130];
const LIGHT_COOL = [150, 75, 15];

/** Distance (in pixels) from the nearest zero, in place: two chamfer passes. */
function chamfer(d: Float32Array, W: number, H: number) {
  const D = Math.SQRT2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - W] + 1);
        if (x > 0) v = Math.min(v, d[i - W - 1] + D);
        if (x < W - 1) v = Math.min(v, d[i - W + 1] + D);
      }
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < H - 1) {
        v = Math.min(v, d[i + W] + 1);
        if (x < W - 1) v = Math.min(v, d[i + W + 1] + D);
        if (x > 0) v = Math.min(v, d[i + W - 1] + D);
      }
      d[i] = v;
    }
  }
}

/** A patch to burn in, drawn W × H on its canvas. */
export interface BurnSetup {
  W: number;
  H: number;
  /** Canvas pixels per art pixel, across and down. */
  sx: number;
  sy: number;
  /** The patch's edges: (x, y, patch) triples in art pixels (see PatchShape.edges). */
  edges: Uint16Array;
  /** Patches already there when this one arrived: the magic spreads in from them. */
  before: number[];
  /** How long it takes to burn in, ms. */
  duration: number;
  /** How many of its sparks fly (fxDensity, as the burn starts). */
  density: number;
}

/** A frame of the burn: the box it changed on the canvas (x, y, w, h), the sparks flying off the front, and whether it's done. */
export interface BurnFrame {
  box: [number, number, number, number] | null;
  /** (x, y, lean x, lean y) for each spark: where on the canvas (px) and which way the front pushes it (screen px/s). */
  sparks: number[];
  done: boolean;
}

/**
 * A patch burning in, worked out from its pixels as drawn (`px`, RGBA,
 * W × H), which it then draws into: made, it has cleared those still to
 * come in (for the whole of them to go on the canvas once), and each frame
 * changes them within that frame's box.
 */
export class Burn {
  /** Where the magic caught (canvas px), when nothing was there yet; null when it spreads in from a seam. */
  readonly origin: [number, number] | null = null;
  /** Nothing of it is visible: there's nothing to burn. */
  readonly empty: boolean = false;

  private readonly W: number;
  private readonly H: number;
  private readonly sx: number;
  private readonly sy: number;
  private readonly duration: number;
  private readonly density: number;
  private readonly src: Uint8ClampedArray;
  private dist = new Float32Array(0);
  /** The visible pixels, by when they burn in, and when each does (0 to 1 of the sweep). */
  private lit = new Uint32Array(0);
  private order = new Float32Array(0);
  private spark = new Uint8Array(0);
  private settled = 0;
  private line = 0;
  private shown = 0;
  private rim = 0;
  private ahead = 0;
  private start = 0;
  private last = 0;
  /** Sparks owed: the front gives off a few a second, one whenever a whole one is due. */
  private owed = 0;

  constructor(
    private readonly px: Uint8ClampedArray,
    s: BurnSetup,
  ) {
    const { W, H, sx, sy } = s;
    this.W = W;
    this.H = H;
    this.sx = sx;
    this.sy = sy;
    this.duration = s.duration;
    this.density = s.density;
    const src = (this.src = px.slice());
    let n = 0;
    for (let i = 0; i < W * H; i++) if (src[i * 4 + 3] > 0) n++;
    if (!n) {
      this.empty = true;
      return;
    }
    const vis = new Uint32Array(n);
    for (let i = 0, j = 0; i < W * H; i++) if (src[i * 4 + 3] > 0) vis[j++] = i;

    // The magic starts where this patch meets what's already there.
    const dist = (this.dist = new Float32Array(W * H).fill(Infinity));
    const before = new Set(s.before);
    const e = s.edges;
    let seeded = false;
    for (let j = 0; j + 2 < e.length; j += 3) {
      if (!before.has(e[j + 2])) continue;
      const x0 = Math.floor(e[j] * sx);
      const y0 = Math.floor(e[j + 1] * sy);
      const x1 = Math.min(W, Math.ceil((e[j] + 1) * sx));
      const y1 = Math.min(H, Math.ceil((e[j + 1] + 1) * sy));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) dist[y * W + x] = 0;
      seeded = true;
    }
    // Nothing there yet: it catches near the middle of the patch.
    if (!seeded) {
      let cx = 0;
      let cy = 0;
      for (const i of vis) {
        cx += i % W;
        cy += (i / W) | 0;
      }
      cx = cx / vis.length + (Math.random() - 0.5) * W * 0.3;
      cy = cy / vis.length + (Math.random() - 0.5) * H * 0.3;
      let best = Infinity;
      let origin = -1;
      for (const i of vis) {
        const d = ((i % W) - cx) ** 2 + (((i / W) | 0) - cy) ** 2;
        if (d < best) {
          best = d;
          origin = i;
        }
      }
      dist[origin] = 0;
      this.origin = [origin % W, (origin / W) | 0];
    }
    chamfer(dist, W, H);

    // When each pixel comes in: its distance from where the magic started,
    // made ragged with noise so the front licks forward unevenly, and each
    // grain nudged on its own so the front fizzles.
    const seed = (Math.random() * 2 ** 31) | 0;
    const when = new Float32Array(vis.length);
    let lo = Infinity;
    let hi = -Infinity;
    vis.forEach((i, j) => {
      const ax = (i % W) / sx;
      const ay = ((i / W) | 0) / sy;
      const rough = valueNoise(ax / 5, ay / 5, seed) * 0.65 + valueNoise(ax / 2, ay / 2, seed + 1) * 0.35;
      const v = dist[i] / sx + (rough - 0.5) * 2 * ROUGH + (Math.random() - 0.5) * 2 * GRAIN;
      when[j] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    });
    // Sorted by when they burn in, so each frame only visits the pixels that
    // are changing: those settled are done, those far ahead stay clear.
    // (A radix sort: a patch has tens of thousands of them.)
    const rank = rankAscending(when);
    const span = hi - lo || 1;
    const lit = (this.lit = new Uint32Array(vis.length));
    const order = (this.order = new Float32Array(vis.length));
    for (let r = 0; r < n; r++) {
      const j = rank[r];
      lit[r] = vis[j];
      order[r] = (when[j] - lo) / span;
    }
    const spark = (this.spark = new Uint8Array(lit.length));
    for (let j = 0; j < lit.length; j++) if (Math.random() < SPARKLY) spark[j] = 1 + Math.floor(Math.random() * 255);
    for (const i of lit) px[i * 4 + 3] = 0;
  }

  /** Which way the front is moving at pixel i, as a sideways push (screen px/s) for its sparks. */
  private lean(i: number): [number, number] {
    const { W, H, dist } = this;
    const x = i % W;
    const y = (i / W) | 0;
    const gx = (x < W - 1 ? dist[i + 1] : dist[i]) - (x > 0 ? dist[i - 1] : dist[i]);
    const gy = (y < H - 1 ? dist[i + W] : dist[i]) - (y > 0 ? dist[i - W] : dist[i]);
    const len = Math.hypot(gx, gy);
    if (!isFinite(len) || len === 0) return [0, 0];
    return [(gx / len) * 30, (gy / len) * 30];
  }

  /** Draws the burn as it stands at `now` (ms, its first frame's clock its start) into its pixels. */
  frame(now: number): BurnFrame {
    const { W, H, px, src, lit, order, spark } = this;
    if (!this.start) this.start = this.last = now;
    const p = Math.min(1, (now - this.start) / this.duration);
    const from = -RIM;
    const to = 1 + LINE + COOL;
    const t = from + (to - from) * p;
    const was = this.settled;
    let settled = this.settled;
    while (settled < lit.length && t - order[settled] >= LINE + COOL) {
      const o = lit[settled++] * 4;
      px[o] = src[o];
      px[o + 1] = src[o + 1];
      px[o + 2] = src[o + 2];
      px[o + 3] = src[o + 3];
    }
    this.settled = settled;
    let { line, shown, rim, ahead } = this;
    while (line < lit.length && t - order[line] >= LINE) line++;
    while (shown < lit.length && order[shown] <= t) shown++;
    while (rim < lit.length && order[rim] <= t + RIM) rim++;
    while (ahead < lit.length && order[ahead] <= t + RIM + AHEAD) ahead++;
    this.line = line;
    this.shown = shown;
    this.rim = rim;
    this.ahead = ahead;

    // Far ahead: sparks twinkle in and out.
    for (let j = rim; j < ahead; j++) {
      if (!spark[j]) continue;
      const o = lit[j] * 4;
      const near = 1 - (order[j] - t - RIM) / AHEAD;
      px[o] = HOT[0];
      px[o + 1] = HOT[1];
      px[o + 2] = HOT[2];
      px[o + 3] = src[o + 3] * near * (0.5 + 0.5 * Math.sin(now / 38 + spark[j]));
    }
    // Just ahead: a faint golden mist gathers in the item's shape, the
    // twinkling sparks brighter in it.
    for (let j = shown; j < rim; j++) {
      const o = lit[j] * 4;
      const k = 1 - (order[j] - t) / RIM;
      if (spark[j]) {
        px[o] = HOT[0];
        px[o + 1] = HOT[1];
        px[o + 2] = HOT[2];
        px[o + 3] = src[o + 3] * (0.5 + 0.5 * k) * (0.5 + 0.5 * Math.sin(now / 38 + spark[j]));
      } else {
        px[o] = MIST[0];
        px[o + 1] = MIST[1];
        px[o + 2] = MIST[2];
        px[o + 3] = src[o + 3] * 0.4 * k * k;
      }
    }
    // The front: each grain flares up as a hot glint and settles into the lit picture.
    for (let j = line; j < shown; j++) {
      const o = lit[j] * 4;
      const u = (t - order[j]) / LINE;
      for (let c = 0; c < 3; c++) px[o + c] = HOT[c] + (src[o + c] + LIGHT_HOT[c] - HOT[c]) * u;
      px[o + 3] = src[o + 3] * (0.45 + 0.55 * u);
    }
    // Behind it: the art, lit from within, the light cooling and fading.
    for (let j = settled; j < line; j++) {
      const o = lit[j] * 4;
      const g = 1 - (t - order[j] - LINE) / COOL;
      const k = g * g;
      for (let c = 0; c < 3; c++) px[o + c] = src[o + c] + (LIGHT_COOL[c] + (LIGHT_HOT[c] - LIGHT_COOL[c]) * g) * k;
      px[o + 3] = src[o + 3];
    }
    // Only the box this frame changes goes to the canvas: round the pixels
    // from the first one settling to the last one sparkling ahead.
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (let j = was; j < ahead; j++) {
      const i = lit[j];
      const y = (i / W) | 0;
      const x = i - y * W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const box: BurnFrame['box'] = y1 >= 0 ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null;

    // Sparks fly off the front, more the longer it is.
    const sparks: number[] = [];
    const front = shown - line;
    if (front > 0) {
      const rate = Math.min(SPARKS, 16 + (front / (this.sx * this.sy)) * 1.6) * this.density;
      this.owed = Math.min(6, this.owed + ((now - this.last) / 1000) * rate);
      for (; this.owed >= 1; this.owed--) {
        const i = lit[line + Math.floor(Math.random() * front)];
        sparks.push(i % W, (i / W) | 0, ...this.lean(i));
      }
    }
    this.last = now;
    return { box, sparks, done: p >= 1 };
  }
}
