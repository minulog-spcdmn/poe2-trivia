// A patch of veiled art burns into being. The fire comes from the part of
// the item already there: a ragged front sweeps across the patch from the
// seam it shares with it (the very first patch catches at a point and burns
// outward). Just ahead of the front the item's shape glows like embers with
// a few sparks; on the front a hot line runs from deep orange to white; behind
// it the art stands lit from within, the light cooling to amber. Flames lick
// off the front, leaning the way the fire is moving. Transparent pixels are
// never touched, so the fire keeps to the item's own shape.

import { valueNoise } from './patches';
import { fxDensity, veilFlame, veilIgnites } from './fx/moments';

/** How long a patch takes to burn in, given the time between patches: a bit longer, so the fire never stops. */
export function burnDuration(step: number) {
  return Math.min(2400, Math.max(900, step * 1.6));
}

/** As fractions of the burn: the ember glow ahead of the front, the sparks ahead of that, the hot line, the cooling light. */
const RIM = 0.1;
const AHEAD = 0.12;
const LINE = 0.07;
const COOL = 0.4;
/** How ragged the front is, in art pixels either way. */
const ROUGH = 5;
/** Share of the pixels ahead of the front that spark. */
const SPARKLY = 0.05;
/** Flames off the front per second, at most. */
const FLAMES = 70;
/** Burns at once; past this (a picture arriving with many patches in) patches just fade in. */
const MAX_BURNING = 10;

const HOT = [255, 246, 220];
const FRONT = [255, 120, 30];
const PREHEAT = [255, 84, 16];
/** The inner light, added to the art: pale gold while hot, cooling to amber. */
const LIGHT_HOT = [230, 180, 100];
const LIGHT_COOL = [140, 60, 10];

const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let burning = 0;

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

export interface BurnParams {
  url: string;
  /** The patch's edges: (x, y, patch) triples (see RawPatch.edges). */
  edges: Uint16Array;
  /** Patches already there when this one arrived: the fire spreads in from them. */
  before: number[];
  /** Time between patches, ms. */
  step: number;
}

/**
 * Svelte action for a veiled patch's <canvas>, sized and placed by CSS: draws
 * the patch (at screen resolution, capped at twice the art's) and burns it in.
 */
export function materialize(canvas: HTMLCanvasElement, params: BurnParams) {
  let W = 0;
  let H = 0;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  let stopped = false;
  let counted = false;
  let raf = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    if (counted) burning--;
  };

  const burn = (sx: number, sy: number) => {
    const art = ctx.getImageData(0, 0, W, H);
    const src = art.data.slice();
    const px = art.data;
    const vis: number[] = [];
    for (let i = 0; i < W * H; i++) if (src[i * 4 + 3] > 0) vis.push(i);
    if (!vis.length) return stop();

    // The fire starts where this patch meets what's already there.
    const dist = new Float32Array(W * H).fill(Infinity);
    const before = new Set(params.before);
    const e = params.edges;
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
    let origin = -1;
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
      for (const i of vis) {
        const d = ((i % W) - cx) ** 2 + (((i / W) | 0) - cy) ** 2;
        if (d < best) {
          best = d;
          origin = i;
        }
      }
      dist[origin] = 0;
    }
    chamfer(dist, W, H);

    // When each pixel burns in: its distance from the fire's start, made
    // ragged with noise so the front licks forward unevenly.
    const seed = (Math.random() * 2 ** 31) | 0;
    const when = new Float32Array(vis.length);
    let lo = Infinity;
    let hi = -Infinity;
    vis.forEach((i, j) => {
      const ax = (i % W) / sx;
      const ay = ((i / W) | 0) / sy;
      const n = valueNoise(ax / 5, ay / 5, seed) * 0.65 + valueNoise(ax / 2, ay / 2, seed + 1) * 0.35;
      const v = dist[i] / sx + (n - 0.5) * 2 * ROUGH;
      when[j] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    });
    // Sorted by when they burn in, so each frame only visits the pixels that
    // are changing: those settled are done, those far ahead stay clear.
    const rank = Uint32Array.from(vis.keys()).sort((a, b) => when[a] - when[b]);
    const span = hi - lo || 1;
    const lit = new Uint32Array(vis.length);
    const order = new Float32Array(vis.length);
    rank.forEach((j, r) => {
      lit[r] = vis[j];
      order[r] = (when[j] - lo) / span;
    });
    const spark = new Uint8Array(lit.length);
    for (let j = 0; j < lit.length; j++) if (Math.random() < SPARKLY) spark[j] = 1 + Math.floor(Math.random() * 255);
    for (const i of lit) px[i * 4 + 3] = 0;
    ctx.putImageData(art, 0, 0);

    /** Which way the fire is moving at pixel i, as a sideways push (screen px/s) for its flames. */
    const lean = (i: number) => {
      const x = i % W;
      const y = (i / W) | 0;
      const gx = (x < W - 1 ? dist[i + 1] : dist[i]) - (x > 0 ? dist[i - 1] : dist[i]);
      const gy = (y < H - 1 ? dist[i + W] : dist[i]) - (y > 0 ? dist[i - W] : dist[i]);
      const len = Math.hypot(gx, gy);
      if (!isFinite(len) || len === 0) return { x: 0, y: 0 };
      return { x: (gx / len) * 30, y: (gy / len) * 30 };
    };

    const duration = burnDuration(params.step);
    const from = -RIM;
    const to = 1 + LINE + COOL;
    let settled = 0;
    let line = 0;
    let shown = 0;
    let rim = 0;
    let ahead = 0;
    let start = 0;
    let last = 0;
    let flames = 0;
    const density = fxDensity();

    const frame = (now: number) => {
      if (stopped) return;
      if (!canvas.isConnected) return stop();
      if (!start) start = last = now;
      const p = Math.min(1, (now - start) / duration);
      const t = from + (to - from) * p;
      while (settled < lit.length && t - order[settled] >= LINE + COOL) {
        const o = lit[settled++] * 4;
        px[o] = src[o];
        px[o + 1] = src[o + 1];
        px[o + 2] = src[o + 2];
        px[o + 3] = src[o + 3];
      }
      while (line < lit.length && t - order[line] >= LINE) line++;
      while (shown < lit.length && order[shown] <= t) shown++;
      while (rim < lit.length && order[rim] <= t + RIM) rim++;
      while (ahead < lit.length && order[ahead] <= t + RIM + AHEAD) ahead++;

      // Far ahead: a spark here and there.
      for (let j = rim; j < ahead; j++) {
        if (!spark[j]) continue;
        const o = lit[j] * 4;
        const near = 1 - (order[j] - t - RIM) / AHEAD;
        px[o] = HOT[0];
        px[o + 1] = HOT[1];
        px[o + 2] = HOT[2];
        px[o + 3] = src[o + 3] * near * (0.5 + 0.5 * Math.sin(now / 40 + spark[j]));
      }
      // Just ahead: the item's shape glows like embers, hotter near the front.
      for (let j = shown; j < rim; j++) {
        const o = lit[j] * 4;
        const k = 1 - (order[j] - t) / RIM;
        px[o] = PREHEAT[0];
        px[o + 1] = PREHEAT[1];
        px[o + 2] = PREHEAT[2];
        px[o + 3] = src[o + 3] * 0.6 * k * k;
      }
      // The front: deep orange at its leading edge, white-hot, then the art.
      for (let j = line; j < shown; j++) {
        const o = lit[j] * 4;
        const u = (t - order[j]) / LINE;
        if (u < 0.35) {
          const m = u / 0.35;
          for (let c = 0; c < 3; c++) px[o + c] = FRONT[c] + (HOT[c] - FRONT[c]) * m;
        } else {
          const m = (u - 0.35) / 0.65;
          for (let c = 0; c < 3; c++) px[o + c] = HOT[c] + (src[o + c] + LIGHT_HOT[c] - HOT[c]) * m;
        }
        px[o + 3] = src[o + 3];
      }
      // Behind it: the art, lit from within, the light cooling and fading.
      for (let j = settled; j < line; j++) {
        const o = lit[j] * 4;
        const g = 1 - (t - order[j] - LINE) / COOL;
        const k = g * g;
        for (let c = 0; c < 3; c++) px[o + c] = src[o + c] + (LIGHT_COOL[c] + (LIGHT_HOT[c] - LIGHT_COOL[c]) * g) * k;
        px[o + 3] = src[o + 3];
      }
      ctx.putImageData(art, 0, 0);

      // Flames lick off the front, more the longer it is.
      const front = shown - line;
      if (front > 0) {
        const r = canvas.getBoundingClientRect();
        const scale = r.width / W;
        const rate = Math.min(FLAMES, 10 + (front / (sx * sy)) * 0.9) * density;
        flames = Math.min(4, flames + ((now - last) / 1000) * rate);
        for (; flames >= 1; flames--) {
          const i = lit[line + Math.floor(Math.random() * front)];
          veilFlame({ x: r.left + (i % W) * scale, y: r.top + ((i / W) | 0) * scale }, lean(i), 1.15);
        }
      }
      last = now;

      if (p >= 1) return stop();
      raf = requestAnimationFrame(frame);
    };

    if (origin >= 0) {
      const r = canvas.getBoundingClientRect();
      const scale = r.width / W;
      veilIgnites({ x: r.left + (origin % W) * scale, y: r.top + ((origin / W) | 0) * scale }, r.width);
    }
    raf = requestAnimationFrame(frame);
  };

  const img = new Image();
  img.src = params.url;
  const begin = () => {
    if (stopped) return;
    // Screen resolution, but no more than twice the art's own: the picture
    // has no finer detail, and every pixel costs work on each frame.
    W = Math.max(1, Math.round(Math.min(canvas.clientWidth * (window.devicePixelRatio || 1), img.naturalWidth * 2)));
    H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth));
    canvas.width = W;
    canvas.height = H;
    ctx.drawImage(img, 0, 0, W, H);
    if (reduce?.matches || burning >= MAX_BURNING) {
      canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce?.matches ? 300 : 450, easing: 'ease-out' });
      return;
    }
    burning++;
    counted = true;
    burn(W / img.naturalWidth, H / img.naturalHeight);
  };
  img.decode().then(begin, () => {});

  return { destroy: stop };
}
