// The fossils' amber, for what the fx renderer and the backdrop's lights draw
// (lib/fx, lib/lights.ts): the same palette as app.css's --fossil-*, which
// every fossil surface's CSS reads (tests/fossilPalette.test.ts holds the two
// together). HDR: a gain past 1 is light brighter than a colour can hold.
//
// And the amber itself, painted (paintAmber): a piece of resin tumbled
// smooth (lib/amberStone) held up to a lamp, as PoE's fossils are in their
// icons. The light behind it comes through the resin, which drinks the blue
// first, then the green: where its way through is short (the middle, where
// it's thin) it comes out a pale honey, and where it runs long (toward the
// rim, bent round inside the stone) orange, then a deep red. Through it runs
// what real amber holds: patches where the resin lies thinner or deeper,
// edged as the flows that laid them were; flakes of fracture, pale where
// they catch the light and brightest along their lit edge; the folds the
// resin set in, a bright crest each with its shadow under it; clouded
// patches, milky with the finest bubbles; specks of what it swallowed; and
// round its foot a polished bevel, where the light that came through
// gathers. Worked out pixel by pixel in linear light, the same every time
// (seeded), and dithered as it's rounded to 8 bits, so its broad, slow
// gradients never band (CLAUDE.md). A rare's is the deeper amber, cherry to
// cognac.

import type { Vec3 } from './fx/core.ts';
import type { Pt } from './arcane.ts';
import type { Flake } from './amberStone.ts';

export const FOSSIL_AMBER = {
  core: '#ffe066',
  mid: '#ffaa2c',
  edge: '#ec6a10',
  resin: '#5a2004',
  fleck: '#fff2c4',
  rareCore: '#ffc43a',
  rareMid: '#f27c1c',
  rareEdge: '#c8300c',
  rareResin: '#4a1204',
} as const;

/** A palette colour as the fx's light, `gain` times as bright. */
export function amberLight(name: keyof typeof FOSSIL_AMBER, gain = 1): Vec3 {
  const n = parseInt(FOSSIL_AMBER[name].slice(1), 16);
  return [(((n >> 16) & 255) / 255) * gain, (((n >> 8) & 255) / 255) * gain, ((n & 255) / 255) * gain];
}

export type AmberTier = 'common' | 'rare';

/**
 * How each tier's resin takes the light: how fast it drinks each of red,
 * green and blue along the way (per unit of the way), how long the way is
 * in the middle and at the rim, the lamp's light (linear, past 1 brighter
 * than white), and the milk of its clouded patches.
 */
const GLASS: Record<AmberTier, { sigma: Vec3; near: number; far: number; lamp: Vec3; milk: Vec3 }> = {
  common: { sigma: [0.14, 1.05, 4.4], near: 0.55, far: 2.8, lamp: [1.3, 1.12, 0.92], milk: [1, 0.74, 0.36] },
  rare: { sigma: [0.24, 1.55, 6.4], near: 0.46, far: 2.9, lamp: [1.4, 1.14, 0.9], milk: [1, 0.66, 0.3] },
};

/** What paintAmber paints: a stone's outline, flakes, folds and lamp (card px), onto `w` x `h` pixels, `s` of them to a card px, the pixel (0, 0) at (`ox`, `oy`). */
export type AmberJob = {
  w: number;
  h: number;
  s: number;
  ox: number;
  oy: number;
  tier: AmberTier;
  outline: Pt[];
  flakes: Flake[];
  folds: Pt[][];
  c: Pt;
  rx: number;
  ry: number;
  lamp: Pt;
  seed: number;
};

// ---- noise ---------------------------------------------------------------------

/** A hash of a lattice point, in [0, 1). */
function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Gradient noise (Perlin's), about -0.7 to 0.7. */
function noise(x: number, y: number, seed: number) {
  const [xi, yi] = [Math.floor(x), Math.floor(y)];
  const [xf, yf] = [x - xi, y - yi];
  const g = (ix: number, iy: number, dx: number, dy: number) => {
    const a = hash(ix, iy, seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const n00 = g(xi, yi, xf, yf);
  const n10 = g(xi + 1, yi, xf - 1, yf);
  const n01 = g(xi, yi + 1, xf, yf - 1);
  const n11 = g(xi + 1, yi + 1, xf - 1, yf - 1);
  return n00 + (n10 - n00) * u + (n01 - n00) * v + (n00 - n10 - n01 + n11) * u * v;
}
/** Noise in octaves, about -1 to 1. */
function fbm(x: number, y: number, seed: number, octaves = 4) {
  let [sum, amp, f, norm] = [0, 1, 1, 0];
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return (sum / norm) * 1.6;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Linear light (0 to 1, in 4096 steps) to sRGB, 0 to 255, kept fractional for the dither. */
const SRGB = (() => {
  const t = new Float32Array(4097);
  for (let i = 0; i <= 4096; i++) {
    const v = i / 4096;
    t[i] = 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  }
  return t;
})();

/** How far the dither stirs each channel, in levels (times a triangle two either way). */
const DITHER = 1.8;

/** Light past 1 eased toward white rather than cut off: what a lamp seen through amber does to the eye. */
const ease = (v: number) => (v < 0.8 ? v : 1 - 0.2 * Math.exp(-(v - 0.8) / 0.2));

// ---- the paint ----------------------------------------------------------------

/** A convex polygon's sides as lines with inward normals (toward `m`): inside it, the least distance to them is its depth. */
function sidesOf(ps: Pt[], m: Pt) {
  return ps.map((a, i) => {
    const b = ps[(i + 1) % ps.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    if (nx * (m[0] - a[0]) + ny * (m[1] - a[1]) < 0) [nx, ny] = [-nx, -ny];
    return [a[0], a[1], nx, ny] as const;
  });
}
/** How far (x, y) lies from the segment a to b, and how far along it (0 to 1). */
function toSegment(x: number, y: number, a: Pt, b: Pt): [number, number] {
  const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.min(1, Math.max(0, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
  return [Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t), t];
}

/** The amber of `job`, into `out` (RGBA, w x h, not premultiplied). */
export function paintAmber(job: AmberJob, out: Uint8ClampedArray) {
  const { w, h, s, ox, oy, outline, flakes, folds, c, rx, ry, lamp, seed } = job;
  const glass = GLASS[job.tier];
  const R = Math.max(rx, ry);
  const sides = sidesOf(outline, c);
  const mid = (ps: Pt[]): Pt => [ps.reduce((t, p) => t + p[0], 0) / ps.length, ps.reduce((t, p) => t + p[1], 0) / ps.length];
  const flakeSides = flakes.map(({ pts }) => sidesOf(pts, mid(pts)));
  /** Each flake's size, corner to corner across it: how far in from its lit edge its light runs. */
  const flakeSize = flakes.map(({ pts }) => Math.max(...pts.map((p, i) => Math.hypot(p[0] - pts[(i + 2) % pts.length][0], p[1] - pts[(i + 2) % pts.length][1]))));
  // Each fold's segments, where each starts along the run (its ends fade), and its box, grown a little.
  const foldSegs = folds.map((run) => {
    let total = 0;
    const segs = run.slice(1).map((b, i) => {
      const a = run[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      total += len;
      return { a, b, len, at: total - len };
    });
    const xs = run.map((p) => p[0]);
    const ys = run.map((p) => p[1]);
    return { segs, total, box: [Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) + 4, Math.max(...ys) + 4] };
  });
  // How deep the rim runs in, card px: where the way through the stone bends long.
  const D = Math.min(rx, ry) * 0.62;
  // The specks: on a lattice of cells, now and then one, seeded.
  const CELL = 6;
  let rng = (seed * 2654435761) >>> 0 || 1;
  const rand = () => {
    rng ^= rng << 13;
    rng ^= rng >>> 17;
    rng ^= rng << 5;
    return (rng >>> 0) / 4294967296;
  };
  const sig = glass.sigma;
  const [lr, lg, lb] = glass.lamp;
  const [mr, mg, mb] = glass.milk;
  const toLight = [-0.6, -0.8];
  for (let j = 0; j < h; j++) {
    const y = oy + (j + 0.5) / s;
    for (let i = 0; i < w; i++) {
      const x = ox + (i + 0.5) / s;
      // Its depth, and the side it's nearest: which way the surface there faces.
      let d = Infinity;
      let ny = 0;
      for (const [ax, ay, nx, nyy] of sides) {
        const dd = (x - ax) * nx + (y - ay) * nyy;
        if (dd < d) [d, ny] = [dd, nyy];
      }
      const o = (j * w + i) * 4;
      const alpha = Math.min(1, Math.max(0, d * s + 0.5));
      if (alpha <= 0) {
        out[o + 3] = 0;
        continue;
      }
      const e = Math.min(1, Math.max(0, d / D));
      const [qx, qy] = [(x - c[0]) / R, (y - c[1]) / R];
      // The patches, where the resin lies thinner (1) or deeper (0), edged as the flows that laid
      // them; and finer, its grain.
      // (Laid in layers that bow as its foot does, bent by slow noise.)
      const warp = fbm(qx * 1.1 + 3.1, qy * 1.1 - 1.7, seed, 3);
      const layer = qy * 2.4 - 0.9 * qx * qx + 0.55 * warp;
      const flow = fbm(qx * 1.5 + 0.4 * warp - 4.2, layer + 2.3, seed + 5, 4);
      const blot = smooth(-0.2, 0.24, flow);
      // (Where one layer meets the next, a fine line of light.)
      const seam = Math.exp(-(((flow - 0.02) / 0.022) ** 2)) * smooth(0.15, 0.6, e);
      const grain = fbm(qx * 8 + 1.9, qy * 8 - 8.2, seed + 21, 3);
      // The way through: short in the middle, long toward the rim, varied by the patches.
      let way = glass.near + (glass.far - glass.near) * (1 - e) ** 1.5 + 0.95 * (0.5 - blot) * (0.4 + 0.6 * e) + 0.1 * grain;
      let glow = 0.16 * seam;
      // The flakes: paler where they lie, their light brightest along their lit edge, which shows sharp.
      for (let k = 0; k < flakes.length; k++) {
        const { pts, edge, lit } = flakes[k];
        const [dl] = toSegment(x, y, pts[edge], pts[(edge + 1) % pts.length]);
        let inside = true;
        for (const [ax, ay, nx, nyy] of flakeSides[k]) {
          if ((x - ax) * nx + (y - ay) * nyy < 0) {
            inside = false;
            break;
          }
        }
        if (inside) {
          const near = Math.exp(-dl / (flakeSize[k] * 0.28));
          way -= lit * (0.15 + 0.5 * near);
          glow += lit * 0.05 * near;
        }
        if (dl < 1.4) glow += lit * 0.2 * Math.exp(-((dl / 0.26) ** 2));
      }
      // The folds: a bright crest, and under it (toward the foot) its shadow.
      for (const { segs, total, box } of foldSegs) {
        if (x < box[0] || y < box[1] || x > box[2] || y > box[3]) continue;
        let best = Infinity;
        let along = 0;
        let below = false;
        for (const { a, b, len, at } of segs) {
          const [dd, t] = toSegment(x, y, a, b);
          if (dd < best) {
            best = dd;
            along = (at + t * len) / total;
            // Below the crest: on its outer side (the run goes right to left along the foot).
            below = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0;
          }
        }
        if (best > 3.5) continue;
        const k = Math.sin(Math.PI * along) ** 0.7;
        glow += 0.36 * k * Math.exp(-((best / 0.4) ** 2));
        if (below) way += 1.1 * k * Math.exp(-best / 1.1) * (1 - Math.exp(-((best / 0.45) ** 2)));
        else way -= 0.35 * k * Math.exp(-best / 2.2);
      }
      // The lamp behind it, broad, a little below and left of the middle.
      const [dx, dy] = [(x - lamp[0]) / (R * 0.8), (y - lamp[1]) / (R * 0.86)];
      const lit = 0.6 + 0.4 * Math.exp(-(dx * dx + dy * dy) * 0.5);
      way = Math.max(0.12, way);
      let r = lr * lit * Math.exp(-sig[0] * way);
      let g = lg * lit * Math.exp(-sig[1] * way);
      let b = lb * lit * Math.exp(-sig[2] * way);
      // Clouded patches: milky where the finest bubbles scatter the light, a few and soft.
      const cloud = smooth(0.55, 1.1, fbm(qx * 2.1 + 9.4, qy * 2.1 - 6.1, seed + 9, 3)) * 0.38 * (0.3 + 0.7 * e);
      r += (mr * lit * 0.55 - r) * cloud;
      g += (mg * lit * 0.55 - g) * cloud;
      b += (mb * lit * 0.55 - b) * cloud;
      // What catches the light in it, gold.
      r += glow * 1.05;
      g += glow * 0.72;
      b += glow * 0.22;
      // The rim gathers the light on the side away from the lamp; the edge itself is dark.
      const qn = Math.hypot(qx, qy) || 1;
      const away = Math.max(0, -((qx / qn) * toLight[0] + (qy / qn) * toLight[1]));
      const gather = Math.exp(-(((e - 0.14) / 0.08) ** 2)) * away * 0.22 * (0.6 + 0.4 * blot);
      r += gather * 0.9;
      g += gather * 0.4;
      b += gather * 0.05;
      const edge = 0.34 + 0.66 * smooth(0, 0.2, e);
      r *= edge;
      g *= edge;
      b *= edge;
      // The bevel round its foot, polished, where the light that came through gathers: a band of
      // pale gold just in from the edge.
      const foot = smooth(0.35, 0.85, -ny);
      const bevel = foot * Math.exp(-(((d - 1.6) / 0.8) ** 2)) * (0.5 + 0.3 * blot);
      r += (1.05 - r) * bevel;
      g += (0.66 - g) * bevel;
      b += (0.22 - b) * bevel;
      // Specks of what it swallowed: one in a cell now and then, a dark mote with a soft edge.
      const [cx, cy] = [Math.floor(x / CELL), Math.floor(y / CELL)];
      const hh = hash(cx, cy, seed + 31);
      if (hh < 0.06) {
        const px = (cx + 0.2 + 0.6 * hash(cx, cy, seed + 37)) * CELL;
        const py = (cy + 0.2 + 0.6 * hash(cx, cy, seed + 41)) * CELL;
        const rad = 0.22 + hash(cx, cy, seed + 43) * 0.6;
        const dd = Math.hypot(x - px, y - py);
        if (dd < rad + 0.6) {
          const k = (1 - smooth(rad - 0.35, rad + 0.45, dd)) * (0.4 + hh * 7);
          r *= 1 - k * 0.7;
          g *= 1 - k * 0.82;
          b *= 1 - k * 0.9;
        }
      }
      // To sRGB, dithered, and out: by more than the level or so a dither needs, as a fine grain,
      // since a sharp face's filter (ChooseCategory's SHARP_KERNEL) smooths away most of it before
      // it's rounded again, and less left bands there.
      const d1 = DITHER * (rand() + rand() - rand() - rand());
      const d2 = DITHER * (rand() + rand() - rand() - rand());
      const d3 = DITHER * (rand() + rand() - rand() - rand());
      out[o] = SRGB[Math.round(Math.min(1, Math.max(0, ease(r))) * 4096)] + d1;
      out[o + 1] = SRGB[Math.round(Math.min(1, Math.max(0, ease(g))) * 4096)] + d2;
      out[o + 2] = SRGB[Math.round(Math.min(1, Math.max(0, ease(b))) * 4096)] + d3;
      out[o + 3] = alpha * 255;
    }
  }
}
