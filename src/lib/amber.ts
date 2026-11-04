// Amber, painted: the fossils' material (the card on the offer, and what is
// built from it: the reveal, the codex, the end screen). A slab of resin
// held to a lamp, as PoE's fossils are lit and as amber is looked at: the
// light comes through it from behind, and what it crosses colours it.
//
// What makes it read as amber rather than an orange fill is how real amber
// colours light: it takes the blue first, then the green, so a thin pass is
// pale honey, a thicker one orange and the thickest red-brown (Beer and
// Lambert: what's left of each colour falls off exponentially with the
// thickness crossed, each at its own rate, SIGMA). So it's painted as a
// thickness, not a colour: deeper away from the lamp's heart and toward the
// slab's edges, as the icons are, and in it:
//   flows   the layers it was laid down in, round the drop that caught what's
//           inside, each its own density, a sharp step from one to the next
//           and, here and there where they meet, the light bent along it: a
//           fine seam of it; broad, soft bands of denser resin among them;
//   flakes  of fracture seen aslant, each a little clearer than the amber
//           round it and lit across from its side toward the lamp;
//   crazing hairline cracks in patches, a hair of light beside each;
//   specks  of debris, some sharp, some deep and soft;
//   spangles for a rare, sun spangles, flat gold discs of fracture that catch
//           the light (each its own small image, gold, screened).
//
// The page lays it over the lamp (FossilAmber.svelte): the lamp's moving
// heart and its bloom are CSS gradients (lampLight, below), and the amber, a
// still image (`body`, the light its seams and flakes catch worked in), is
// multiplied over the one and under the other. So wherever the heart goes as
// the card tilts, the amber colours it, flows and all, as a lamp passing
// behind it would. The back, seen only as
// it's dealt, is one still image of it all (`flat`).
//
// What the amber caught (a fossil's emblem) is painted here too, from its
// mask (paintInclusion): thick and dark where its body is, letting the
// amber's light through where it thins, mottled, its edges lit from behind.
//
// Every image is painted at the density it's shown at and dithered as it's
// rounded to 8 bits (CLAUDE.md, "No banding"), strongly enough that a sharp
// face's filter, which smooths what it's given before it's shrunk, still
// finds the noise; the gradients over and under it are carried through by
// its grain.
// Pure: no DOM, so the worker (amberWorker.ts) and the page alike can paint it.

export type Pt = [number, number];
export type AmberLayer = 'body' | 'flat' | 'spangle';

/** Where the slab is lit and what shape its flows follow, in its own layout px. */
export type AmberSlab = {
  /** The slab's size. */
  w: number;
  h: number;
  /** Where the lamp stands behind it, and how far its light carries across and down. */
  lamp: Pt;
  rx: number;
  ry: number;
  /** A second light, broad and dim, along a long slab (a row's), so its far end is amber too and not near black. */
  fill?: { c: Pt; rx: number; ry: number; a: number };
  /** The drop of resin that caught what's inside (lib/findEngraving's), clearer than the slab round it, or none (the back). */
  drop: { c: Pt; r: number; tipY: number } | null;
  rare: boolean;
  /** Each card's amber its own. */
  seed: number;
};

/**
 * One image of a layer: `W` x `H` device px, covering the slab's layout px
 * from `ox`, `oy` at `s` device px to one; `grain`, how much harder its
 * dither is stirred: 3 on a sharp face, whose filter and shrink leave about
 * a third of it (ChooseCategory's SHARP_KERNEL), else 1.
 */
export type AmberJob = { layer: AmberLayer; slab: AmberSlab; W: number; H: number; s: number; ox: number; oy: number; grain?: number };

/**
 * How fast amber takes each colour (red, green, blue) per unit of
 * thickness: a common's warm honey, a rare's deeper and redder, the
 * red-gold of old amber.
 */
const SIGMA: Record<'common' | 'rare', [number, number, number]> = {
  common: [0.04, 0.44, 2.9],
  rare: [0.07, 0.6, 5.6],
};
/** Thickness at the lamp's heart, and how much it deepens out to the light's reach: a rare's hotter at its heart and redder at its edges, the brighter card. */
const DEPTH: Record<'common' | 'rare', [number, number]> = {
  common: [0.55, 2.5],
  rare: [0.5, 3.8],
};
/** The lamp's colour (a flame's, through a little smoke), and the light left far from it. */
const LAMP: Record<'common' | 'rare', [number, number, number]> = {
  common: [1, 0.94, 0.8],
  rare: [1.12, 1.06, 0.9],
};
const AMBIENT = 0.035;
/** How much of the light at the heart is too bright for the amber: the bloom's colour and strength. */
const BLOOM: Record<'common' | 'rare', { c: [number, number, number]; a: number; r: number }> = {
  common: { c: [1, 0.86, 0.42], a: 0.26, r: 0.3 },
  rare: { c: [1, 0.84, 0.32], a: 0.38, r: 0.32 },
};

// ---- noise ----------------------------------------------------------------------

const hash = (ix: number, iy: number, seed: number) => {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
/** Value noise, 0 to 1, smooth between whole coordinates. */
const noise = (x: number, y: number, seed: number) => {
  const [ix, iy] = [Math.floor(x), Math.floor(y)];
  const [fx, fy] = [x - ix, y - iy];
  const [u, v] = [fx * fx * fx * (fx * (fx * 6 - 15) + 10), fy * fy * fy * (fy * (fy * 6 - 15) + 10)];
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
/** Fractal noise, 0 to 1, `oct` octaves. */
const fbm = (x: number, y: number, seed: number, oct: number) => {
  let [s, a, n, f] = [0, 0.5, 0, 1];
  for (let i = 0; i < oct; i++) {
    s += a * noise(x * f, y * f, seed + i * 101);
    n += a;
    a *= 0.5;
    f *= 2.07;
  }
  return s / n;
};
/** A seeded random stream, 0 to 1. */
const stream = (seed: number) => {
  let t = seed >>> 0 || 1;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---- the slab -------------------------------------------------------------------

/** How far a point lies outside the drop's outline (inside, less than 0), in layout px: a function of the point. */
function dropDistance(d: NonNullable<AmberSlab['drop']>) {
  // Mirrored about its middle; its sides meet its round where the radius turns `phi` from straight up.
  const cos = Math.min(1, d.r / (d.c[1] - d.tipY));
  const sin = Math.sqrt(1 - cos * cos);
  const phi = Math.acos(cos);
  return (x: number, y: number) => {
    const [qx, qy] = [Math.abs(x - d.c[0]), y - d.c[1]];
    // Above those points (nearer straight up than they are), the side is nearest: its outward normal is the radius's there.
    if (qy < 0 && Math.atan2(qx, -qy) < phi) return qx * sin - qy * cos - d.r;
    return Math.hypot(qx, qy) - d.r;
  };
}

/**
 * The light behind at a point, before its colour: full at the lamp's heart,
 * falling off softly to the dark (an inverse power of the distance, as a
 * lamp's through a diffusing pane), on an elliptical reach; and a long
 * slab's fill.
 */
function lightAt(slab: AmberSlab, x: number, y: number) {
  const [dx, dy] = [(x - slab.lamp[0]) / slab.rx, (y - slab.lamp[1]) / slab.ry];
  let L = AMBIENT + (1 - AMBIENT) * Math.pow(1 + (dx * dx + dy * dy) / 0.64, -1.6);
  const f = slab.fill;
  if (f) L += f.a * Math.exp(-(((x - f.c[0]) / f.rx) ** 2) - ((y - f.c[1]) / f.ry) ** 2);
  return L;
}

/**
 * The share of the light that moves with the lamp (lampLight's `light`):
 * its heart, never less than SWAY's floor of it. The rest (lightAt over
 * this, as it stands at rest) is painted into the body, still: multiplied
 * over a light that fell to almost nothing in the dark, the body's dither
 * would be multiplied away with it, and its dark resin would band.
 */
const SWAY = 0.7;
const swayOf = (d2: number) => SWAY + (1 - SWAY) * Math.exp(-d2 / 0.32);
function swayAt(slab: AmberSlab, x: number, y: number) {
  const [dx, dy] = [(x - slab.lamp[0]) / slab.rx, (y - slab.lamp[1]) / slab.ry];
  return swayOf(dx * dx + dy * dy);
}

/**
 * The lamp's moving light, as CSS backgrounds for a box whose top left lies
 * at (`ox`, `oy`) of the slab: `light`, its heart over SWAY's floor (the
 * body is multiplied over it), and `bloom`, the heart too bright for the
 * amber (screened over the body). Smooth gradients, not dithered: the
 * body's grain, multiplied into the one and under the other, carries
 * through both, and they move (as the card tilts) where an image would be
 * drawn again.
 */
export function lampLight(slab: AmberSlab, ox: number, oy: number): { light: string; bloom: string } {
  const [x, y] = [slab.lamp[0] - ox, slab.lamp[1] - oy];
  const rad = (k: number) => `${(slab.rx * k).toFixed(1)}px ${(slab.ry * k).toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px`;
  const D = 1.5;
  const light = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.1, 1.3, 1.5].map((d) => {
    const v = Math.round(255 * swayOf(d * d));
    return `rgb(${v} ${v} ${v}) ${((d / D) * 100).toFixed(1)}%`;
  });
  const b = BLOOM[slab.rare ? 'rare' : 'common'];
  const E = 2.6 * b.r;
  const [r, g, bl] = b.c.map((c) => Math.round(255 * c));
  const bloom = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 1].map((k) => {
    const d = k * E;
    return `rgb(${r} ${g} ${bl} / ${(b.a * Math.exp(-(d * d) / (b.r * b.r))).toFixed(4)}) ${(k * 100).toFixed(1)}%`;
  });
  return { light: `radial-gradient(${rad(D)}, ${light.join(', ')})`, bloom: `radial-gradient(${rad(E)}, ${bloom.join(', ')})` };
}

/** What lies in the amber, placed from the slab's seed: specks of debris, each at its depth (how soft); flakes of fracture; a rare's sun spangles. */
type Speck = { x: number; y: number; r: number; soft: number; dark: number };
/** A flake of fracture seen aslant: a small convex polygon, its side `edge` (from point `edge` to the next) the one toward the lamp, which catches its light, `lit` strong. */
type Flake = { pts: Pt[]; c: Pt; reach: number; edge: number; lit: number };
type Spangle = { x: number; y: number; r: number; turn: number; flat: number; seed: number };
function inclusions(slab: AmberSlab) {
  const rnd = stream(slab.seed * 7919 + (slab.rare ? 13 : 0) + 1);
  const area = slab.w * slab.h;
  const specks: Speck[] = [];
  const spangles: Spangle[] = [];
  const flakes: Flake[] = [];
  // Mostly near the light (where they show), thinning out to the edges.
  const place = (): Pt => {
    for (let i = 0; i < 8; i++) {
      const p: Pt = [rnd() * slab.w, rnd() * slab.h];
      if (lightAt(slab, p[0], p[1]) > rnd() * 0.9) return p;
    }
    return [slab.lamp[0] + (rnd() - 0.5) * slab.rx, slab.lamp[1] + (rnd() - 0.5) * slab.ry];
  };
  const nSpecks = Math.round(area / 9000);
  for (let i = 0; i < nSpecks; i++) {
    const [x, y] = place();
    // Most lie deep, soft and faint; a few near the face, small and sharp.
    const deep = rnd() < 0.75;
    specks.push({ x, y, r: 0.2 + rnd() * rnd() * 0.6, soft: deep ? 0.8 + rnd() * 1.4 : 0.12, dark: deep ? 0.1 + rnd() * 0.18 : 0.25 + rnd() * 0.25 });
  }
  if (slab.rare) {
    const n = Math.max(4, Math.round(area / 9000));
    for (let i = 0; i < n; i++) {
      // Round the drop, never on the emblem's heart.
      const a = (i / n) * Math.PI * 2 + rnd() * 0.9;
      const k = 0.42 + rnd() * 0.5;
      spangles.push({ x: slab.lamp[0] + Math.sin(a) * slab.rx * k, y: slab.lamp[1] - Math.cos(a) * slab.ry * k * 0.95, r: 2.2 + rnd() * 2.4, turn: rnd() * Math.PI, flat: 0.3 + rnd() * 0.4, seed: Math.floor(rnd() * 1e6) });
    }
  }
  // The flakes: many small, a few larger, each a few points round its middle, flattened as it lies aslant.
  const nFlakes = Math.round(area / (slab.rare ? 4200 : 5400));
  for (let i = 0; i < nFlakes; i++) {
    const c = place();
    const r = 2.6 + rnd() * rnd() * 11;
    const n = 5 + Math.floor(rnd() * 3);
    const [turn, flat] = [rnd() * Math.PI, 0.35 + rnd() * 0.5];
    const [ct, st] = [Math.cos(turn), Math.sin(turn)];
    const pts: Pt[] = [];
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.25 + rnd() * 0.5) / n) * Math.PI * 2;
      const [u, v] = [Math.cos(a) * r * (0.82 + rnd() * 0.18), Math.sin(a) * r * flat * (0.82 + rnd() * 0.18)];
      pts.push([c[0] + u * ct - v * st, c[1] + u * st + v * ct]);
    }
    // The side whose outward normal turns most toward the lamp.
    const toward = Math.atan2(slab.lamp[1] - c[1], slab.lamp[0] - c[0]);
    let [edge, best] = [0, -Infinity];
    for (let k = 0; k < n; k++) {
      const [a, b] = [pts[k], pts[(k + 1) % n]];
      const mid: Pt = [(a[0] + b[0]) / 2 - c[0], (a[1] + b[1]) / 2 - c[1]];
      const facing = Math.cos(Math.atan2(mid[1], mid[0]) - toward);
      if (facing > best) [edge, best] = [k, facing];
    }
    flakes.push({ pts, c, reach: r * 1.05, edge, lit: (0.45 + rnd() * 0.55) * lightAt(slab, c[0], c[1]) ** 0.4 });
  }
  return { specks, spangles, flakes };
}

/** The slab's inclusions, as the page places a rare's spangles (each its own small image that catches the light in its turn). */
export const spanglesOf = (slab: AmberSlab) => inclusions(slab).spangles;

/** How far (x, y) lies from the segment a to b. */
function toSegment(x: number, y: number, a: Pt, b: Pt) {
  const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.min(1, Math.max(0, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t);
}

/** Where (x, y) lies to a flake: how far inside it (less than 0, outside), how far from its lit side, and from its nearest other side. */
function flakeAt(fl: Flake, x: number, y: number): [number, number, number] {
  const n = fl.pts.length;
  let inside = Infinity;
  let other = Infinity;
  for (let k = 0; k < n; k++) {
    const [a, b] = [fl.pts[k], fl.pts[(k + 1) % n]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // (Inward, whichever way round its points go.)
    let d = ((x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0])) / len;
    if ((fl.c[0] - a[0]) * (b[1] - a[1]) - (fl.c[1] - a[1]) * (b[0] - a[0]) < 0) d = -d;
    inside = Math.min(inside, d);
    if (k !== fl.edge) other = Math.min(other, Math.abs(d));
  }
  return [inside, toSegment(x, y, fl.pts[fl.edge], fl.pts[(fl.edge + 1) % n]), other];
}

/** How far (x, y) lies from the nearest crack of the slab's crazing (its cells about 13 px across), in layout px. */
function crackAt(x: number, y: number, seed: number) {
  const S = 13;
  const [gx, gy] = [x / S, y / S];
  const [ix, iy] = [Math.floor(gx), Math.floor(gy)];
  let [d1, d2] = [9, 9];
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const [cx, cy] = [ix + di + hash(ix + di, iy + dj, seed), iy + dj + hash(ix + di, iy + dj, seed + 1)];
      const d = (gx - cx) ** 2 + (gy - cy) ** 2;
      if (d < d1) [d2, d1] = [d1, d];
      else if (d < d2) d2 = d;
    }
  return ((Math.sqrt(d2) - Math.sqrt(d1)) * S) / 2;
}

// ---- painting -------------------------------------------------------------------

/** How far the dither stirs each level, either way (a triangle): enough that a sharp face's filter, which smooths what it's given, still finds its noise. */
const DITHER = 3.6;
/** Rounds `v` (0 to 1) to 8 bits, dithered by `r` (a triangle, -1 to 1): a slow gradient never shows its steps. Nothing stays nothing. */
const dither = (v: number, r: number) => (v <= 0 ? 0 : Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5 + r * DITHER))));
/** The colour of the light the seams, flakes and cracks catch: the lamp's, pale gold. */
const SHEEN: [number, number, number] = [1, 0.93, 0.75];

/** Paints one image of the slab: RGBA, `job.W` x `job.H`, straight (not premultiplied) alpha. */
export function paintAmber(job: AmberJob): Uint8ClampedArray {
  const { slab, W, H, layer } = job;
  const out = new Uint8ClampedArray(W * H * 4);
  const rnd = stream(slab.seed * 31 + W * 7 + H + Math.round(job.oy * 13) + layer.length);
  // (Triangular: two uniforms, so its noise has no mean and little low-frequency weight.)
  const grain = job.grain ?? 1;
  const tri = () => (rnd() + rnd() - 1) * grain;
  const tier = slab.rare ? 'rare' : 'common';

  if (layer === 'spangle') return paintSpangle(job, out, tri);

  const { tau, glow, light } = field(job);
  // What passes: each colour by how far it's carried through; and the light the seams and flakes
  // catch, screened over that as it will be once the face's moving light is under it (the body is
  // multiplied over the light: worked in as the light stands at rest). On the back, the lamp's
  // light and bloom worked in too.
  const sigma = SIGMA[tier];
  const lamp = LAMP[tier];
  const flat = layer === 'flat';
  const b = BLOOM[tier];
  const screen = (v: number, a: number) => 1 - (1 - v) * (1 - a);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const p = j * W + i;
      const o = p * 4;
      const t = tau[p];
      const [x, y] = [job.ox + (i + 0.5) / job.s, job.oy + (j + 0.5) / job.s];
      // The lamp's colour and its light as it falls off, but for the share that moves (the face's
      // light), or all of it, dimmer, on the back.
      const sway = flat ? 1 : swayAt(slab, x, y);
      const L = flat ? light[p] * 0.8 : light[p] / sway;
      const a = Math.min(1, glow[p]) * (flat ? 0.8 : 1);
      const rgb = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const v = Math.exp(-sigma[c] * t) * L * lamp[c];
        rgb[c] = Math.min(1, v + a * SHEEN[c] * (1 / sway - v));
      }
      if (flat) {
        const [dx, dy] = [(x - slab.lamp[0]) / slab.rx, (y - slab.lamp[1]) / slab.ry];
        const k = b.a * 0.7 * Math.exp(-(dx * dx + dy * dy) / (b.r * b.r));
        for (let c = 0; c < 3; c++) rgb[c] = screen(rgb[c], k * b.c[c]);
      }
      out[o] = dither(rgb[0], tri());
      out[o + 1] = dither(rgb[1], tri());
      out[o + 2] = dither(rgb[2], tri());
      out[o + 3] = 255;
    }
  return out;
}

/**
 * The slab's thickness at each pixel of `job` (how far the light is carried
 * through it), the light it catches on its way (the seams', the flakes' and
 * the cracks'), and the lamp's light there.
 */
function field(job: AmberJob) {
  const { slab, W, H, s, ox, oy } = job;
  const tier = slab.rare ? 'rare' : 'common';
  const [t0, deepen] = DEPTH[tier];
  const { specks, spangles, flakes } = inclusions(slab);
  const tau = new Float32Array(W * H);
  const glow = new Float32Array(W * H);
  const light = new Float32Array(W * H);
  const sd = slab.seed * 131;
  // The slow fields (clouds, the flows' warp and how strongly each shows, the crazing's patches), on
  // a grid every 3 of the slab's layout px, eased between: on the slab's own grid, so strips of it
  // painted apart meet.
  const step = 3;
  const [gx0, gy0] = [Math.floor(ox / step) * step, Math.floor(oy / step) * step];
  const gw = Math.ceil((ox + W / s - gx0) / step) + 3;
  const gh = Math.ceil((oy + H / s - gy0) / step) + 3;
  const cloud = new Float32Array(gw * gh);
  const warp = new Float32Array(gw * gh);
  const showing = new Float32Array(gw * gh);
  const fine = new Float32Array(gw * gh);
  const crazed = new Float32Array(gw * gh);
  for (let gj = 0; gj < gh; gj++)
    for (let gi = 0; gi < gw; gi++) {
      const [x, y] = [gx0 + (gi - 1) * step, gy0 + (gj - 1) * step];
      const g = gj * gw + gi;
      // (The clouds swirled: looked up where a slower field pushes them.)
      const [qx, qy] = [fbm(x / 70, y / 64, sd + 5, 2) - 0.5, fbm(x / 64 + 9, y / 70, sd + 6, 2) - 0.5];
      cloud[g] = fbm(x / 40 + qx * 2.4, y / 46 + qy * 2.4, sd + 1, 4);
      warp[g] = fbm(x / 34 + 3.1, y / 30, sd + 2, 3) - 0.5;
      showing[g] = smooth(0.42, 0.7, fbm(x / 26, y / 30 + 7, sd + 3, 3));
      fine[g] = fbm(x / 9, y / 13, sd + 4, 2) - 0.5;
      crazed[g] = smooth(0.62, 0.78, fbm(x / 48 + 4, y / 52 - 2, sd + 7, 3));
    }
  const ease = (f: Float32Array, x: number, y: number) => {
    const [gx, gy] = [(x - gx0) / step + 1, (y - gy0) / step + 1];
    const [i, j] = [Math.max(0, Math.min(gw - 2, Math.floor(gx))), Math.max(0, Math.min(gh - 2, Math.floor(gy)))];
    const [u, v] = [Math.min(1, Math.max(0, gx - i)), Math.min(1, Math.max(0, gy - j))];
    const g = j * gw + i;
    return f[g] + (f[g + 1] - f[g]) * u + (f[g + gw] - f[g]) * v + (f[g] - f[g + 1] - f[g + gw] + f[g + gw + 1]) * u * v;
  };
  /** A peak at the middle of each band, `w` of it wide: a layer of denser resin. */
  const band = (phase: number, w: number) => {
    const fr = phase - Math.floor(phase) - 0.5;
    return Math.exp(-((fr / w) ** 2));
  };
  /** Half a device px, in layout px: the sharp edges' easing. */
  const aa = 0.5 / s;
  // The flows lie round the drop (on the back, round the lamp).
  const outside = slab.drop ? dropDistance(slab.drop) : (x: number, y: number) => Math.hypot(x - slab.lamp[0], (y - slab.lamp[1]) * 0.9) - 40;
  const layerOf = (n: number) => hash(n, 7, sd) - 0.5;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const [x, y] = [ox + (i + 0.5) / s, oy + (j + 0.5) / s];
      const p = j * W + i;
      const [dx, dy] = [(x - slab.lamp[0]) / slab.rx, (y - slab.lamp[1]) / slab.ry];
      const L = (light[p] = lightAt(slab, x, y));
      let t = t0 + deepen * Math.pow(Math.sqrt(dx * dx + dy * dy), 1.6);
      t += (ease(cloud, x, y) - 0.5) * 1.0;
      // The flows: the drop's offsets, warped, broad layers showing and fading by turns.
      const wp = ease(warp, x, y);
      const dd = outside(x, y);
      const u = dd + wp * 22;
      const shows = ease(showing, x, y);
      t += 0.22 * shows * band(u / 11 + wp * 0.8, 0.3);
      // Layers of resin laid one over another, each its own density, a sharp step between one and
      // the next; and where one meets the next, the light bent along it: a fine seam, lit.
      const ph = u / 7.5 + wp * 1.3;
      const kf = Math.floor(ph);
      const fr = ph - kf;
      t += shows * 0.75 * (layerOf(kf - 1) + (layerOf(kf) - layerOf(kf - 1)) * smooth(0, (aa * 2) / 7.5, fr));
      const off = Math.min(fr, 1 - fr) * 7.5;
      const seam = Math.exp(-((off / Math.max(0.32, aa)) ** 2)) * shows * smooth(0.45, 0.85, hash(kf, 11, sd));
      t -= 0.3 * seam;
      glow[p] += 0.42 * seam * L;
      t += ease(fine, x, y) * 0.14;
      // The crazing, in patches: hairline cracks, dark, a hair of light beside each.
      const cz = ease(crazed, x, y);
      if (cz > 0.01) {
        // (Warped, and broken into runs: cracks, not a net.)
        const k = crackAt(x + wp * 9, y - wp * 7, sd + 9);
        const run = cz * smooth(0.48, 0.66, fbm(x / 7, y / 7, sd + 8, 2));
        t += 0.3 * run * Math.exp(-((k / Math.max(0.26, aa)) ** 2));
        glow[p] += 0.1 * run * L * Math.exp(-(((k - 0.5) / Math.max(0.28, aa)) ** 2));
      }
      // Clear inside the drop, where it caught what it holds.
      if (slab.drop) t -= 0.24 * smooth(0, 16, -dd);
      // Deeper toward the slab's edges, as a piece of amber is.
      const e = Math.min(x, slab.w - x, y, slab.h - y);
      t += 0.8 * (1 - smooth(0, 18, e));
      tau[p] = t;
    }
  // The flakes: clearer where they lie, and lit across from their side toward the lamp (a glint
  // fading over the flake, not a bright line along it); a fine dark line round their other sides.
  const clear = new Float32Array(W * H);
  const dark = new Float32Array(W * H);
  for (const fl of flakes) {
    stamp(job, fl.c[0], fl.c[1], fl.reach + 1.5, (x, y, p) => {
      const [inside, lit, other] = flakeAt(fl, x, y);
      if (inside < -1.2) return 0;
      const within = smooth(-aa, aa, inside);
      glow[p] += fl.lit * 0.3 * within * Math.exp(-lit / (fl.reach * 0.4));
      dark[p] += within * 0.12 * fl.lit * Math.exp(-((other / Math.max(0.24, aa)) ** 2));
      return within * fl.lit * (0.18 + 0.4 * Math.exp(-lit / (fl.reach * 0.35)));
    }, clear, W, H);
  }
  // A rare's spangles: flat discs, clearer (their gold is their own images').
  for (const sp of spangles) stamp(job, sp.x, sp.y, sp.r + 1, (x, y) => spangleAt(sp, x, y) * 0.3, clear, W, H);
  // Specks: darker resin, sharp or soft as they lie near the face or deep.
  for (const sp of specks)
    stamp(job, sp.x, sp.y, sp.r + sp.soft * 2 + 0.5, (x, y) => sp.dark * Math.exp(-((Math.max(0, Math.hypot(x - sp.x, y - sp.y) - sp.r) / (0.25 + sp.soft)) ** 2)), dark, W, H);
  for (let p = 0; p < W * H; p++) tau[p] = Math.max(0.05, tau[p] * (1 - Math.min(0.85, clear[p])) + 2.2 * Math.min(0.9, dark[p]));
  return { tau, glow, light };
}

/** Runs `f` (a point in layout px, and its pixel's index, to a value) over the device px within `reach` of `x`, `y`, adding what it gives into `into`. */
function stamp(job: AmberJob, x: number, y: number, reach: number, f: (x: number, y: number, p: number) => number, into: Float32Array, W: number, H: number) {
  const { s, ox, oy } = job;
  const [i0, i1] = [Math.max(0, Math.floor((x - reach - ox) * s)), Math.min(W - 1, Math.ceil((x + reach - ox) * s))];
  const [j0, j1] = [Math.max(0, Math.floor((y - reach - oy) * s)), Math.min(H - 1, Math.ceil((y + reach - oy) * s))];
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const v = f(ox + (i + 0.5) / s, oy + (j + 0.5) / s, j * W + i);
      if (v > 0) into[j * W + i] += v;
    }
}

/**
 * A sun spangle at a point: a flat disc of fracture seen aslant (an
 * ellipse, `flat` as deep as wide, turned), gold through, its rim a fine
 * line of light, brightest on the side toward the light (its upper left).
 * 0 to 1.
 */
function spangleAt(sp: Spangle, x: number, y: number) {
  const [c, sn] = [Math.cos(sp.turn), Math.sin(sp.turn)];
  const [dx, dy] = [x - sp.x, y - sp.y];
  const u = (dx * c + dy * sn) / sp.r;
  const v = (-dx * sn + dy * c) / (sp.r * sp.flat);
  const d = Math.hypot(u, v);
  if (d > 1.3) return 0;
  // (Its rim's width in the disc's own units: a fine line, a third of a layout px.)
  const fine = 0.34 / (sp.r * sp.flat);
  const lit = 0.25 + 0.75 * Math.max(0, Math.cos(Math.atan2(dy, dx) + 2.3));
  const rim = Math.exp(-(((d - 1) / fine) ** 2)) * lit;
  const body = 0.34 * (1 - smooth(0.9, 1, d)) * (0.75 + 0.25 * noise(u * 2.2 + 3, v * 2.2, sp.seed));
  return Math.min(1, rim + body);
}

/** One spangle alone, as its own small image (`job.ox` its index among the slab's), gold. */
function paintSpangle(job: AmberJob, out: Uint8ClampedArray, tri: () => number) {
  const sp = inclusions(job.slab).spangles[job.ox];
  const { W, H, s } = job;
  if (!sp) return out;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const [x, y] = [sp.x + (i + 0.5 - W / 2) / s, sp.y + (j + 0.5 - H / 2) / s];
      const o = (j * W + i) * 4;
      out[o] = 255;
      out[o + 1] = 204;
      out[o + 2] = 104;
      out[o + 3] = dither(Math.min(1, spangleAt(sp, x, y)), tri());
    }
  return out;
}

// ---- what the amber caught ----------------------------------------------------------

/**
 * What a fossil's creature takes of each colour per unit of its thickness:
 * where it's thickest, multiplied over the amber's light, dark but never
 * black (as the icons' are); where it thins, the amber's own light through
 * it. In a common's honey a grey olive, its red taken nearly as fast as its
 * green; in a rare's red-gold a deep red-brown.
 */
const CAUGHT = { common: [0.75, 1.08, 2.6], rare: [0.6, 1.25, 3.2] };
/** The light that wraps its edges from behind, and the veil of amber in front of it: the amber's pale gold. */
const WRAP: [number, number, number] = [1, 0.8, 0.32];

/** How far inside the shape `inside` (W x H, true or not) each pixel lies from its edge, in px (0 outside): a two-pass chamfer. */
function depthIn(inside: Uint8Array, W: number, H: number) {
  const d = new Float32Array(W * H);
  const [A, B] = [1, Math.SQRT2];
  for (let p = 0; p < W * H; p++) d[p] = inside[p] ? 1e6 : 0;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const p = j * W + i;
      if (!d[p]) continue;
      let v = d[p];
      if (i > 0) v = Math.min(v, d[p - 1] + A);
      else v = Math.min(v, A);
      if (j > 0) v = Math.min(v, d[p - W] + A, i > 0 ? d[p - W - 1] + B : B, i < W - 1 ? d[p - W + 1] + B : B);
      else v = Math.min(v, A);
      d[p] = v;
    }
  for (let j = H - 1; j >= 0; j--)
    for (let i = W - 1; i >= 0; i--) {
      const p = j * W + i;
      if (!d[p]) continue;
      let v = d[p];
      if (i < W - 1) v = Math.min(v, d[p + 1] + A);
      else v = Math.min(v, A);
      if (j < H - 1) v = Math.min(v, d[p + W] + A, i < W - 1 ? d[p + W + 1] + B : B, i > 0 ? d[p + W - 1] + B : B);
      else v = Math.min(v, A);
      d[p] = v;
    }
  return d;
}

/**
 * A fossil's emblem as what the amber caught (ChooseCategory's emblem, from
 * its mask, `alpha`, W x H at `s` device px to a layout px): `body`, what it
 * lets through of each colour, multiplied over the amber: as thick as it
 * lies deep inside its own outline, so its body is dark and its limbs and
 * edges thin, the amber's light through them; mottled, as a creature in
 * the resin is; a little thinner on its side toward the light. And `rim`,
 * screened over it: the lamp's light wrapping its edges from behind, a hair
 * of it brighter along its edge toward the light (its upper left, as the
 * plate's light falls), and a veil of the amber in front of it all, which
 * it lies in, not on. Both opaque: the emblem's mask cuts them. `rare`
 * and `grain`, as an AmberJob's.
 */
export function paintInclusion(alpha: Float32Array, W: number, H: number, s: number, rare: boolean, grain = 1) {
  const caught = CAUGHT[rare ? 'rare' : 'common'];
  const rnd = stream(W * 31 + H);
  const tri = () => (rnd() + rnd() - 1) * grain;
  const inside = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) inside[p] = alpha[p] > 0.5 ? 1 : 0;
  const depth = depthIn(inside, W, H);
  // (Up and to the left: toward the light, a little over a layout px.)
  const sh = Math.max(1, Math.round(1.1 * s * 0.7071));
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : alpha[j * W + i]);
  const body = new Uint8ClampedArray(W * H * 4);
  const lit = new Uint8ClampedArray(W * H * 4);
  const seed = W * 7 + H * 3;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const p = j * W + i;
      const o = p * 4;
      const [x, y] = [i / s, j / s];
      // How deep inside its own outline, in layout px: its thickness, full a few px in.
      const dIn = depth[p] / s;
      const deep = 1 - Math.exp(-dIn / 3);
      // Mottled, at the creature's own scale.
      const mottle = fbm(x / 5.5, y / 5.5, seed, 3) - 0.5;
      // Its edge toward the light, and how far from it (a hair: the light catching it there).
      const edge = alpha[p] * (1 - at(i - sh, j - sh));
      const th = Math.max(0.12, 0.5 + 1.6 * deep + 0.5 * mottle * deep - 0.2 * edge);
      const wrap = Math.exp(-dIn / 0.5) * 0.12;
      const veil = 0.04;
      for (let c = 0; c < 3; c++) {
        body[o + c] = dither(Math.exp(-caught[c] * th), tri());
        const a = Math.min(1, veil + wrap + 0.45 * edge);
        lit[o + c] = dither(WRAP[c] * a, tri());
      }
      body[o + 3] = lit[o + 3] = 255;
    }
  return { body, rim: lit };
}
