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
// slab's edges, as the icons are; the flows it was laid down in (the
// layers of resin, nested round the drop that caught what's inside, warped
// and fading in and out); clouds of it, denser and clearer; specks of
// debris and small bubbles, some sharp, some deep and soft; the planes it
// has cracked along inside, each a wedge of brighter amber with a sharp
// break that catches the light (what gives the icons their angular gold);
// for a rare, sun spangles, the flat fractures in old amber that catch the
// light gold.
//
// It's painted in layers the page lays over each other (FossilAmber.svelte):
//   light   the lamp behind, a soft warm light falling off to the dark (it
//           moves: the lamp's drift, and as the card tilts);
//   body    what the amber lets through of each colour (multiplied over the
//           light: so wherever the light goes, the amber colours it, flows
//           and specks and all, as a lamp passing behind it would);
//   bloom   the lamp's heart, too bright for the amber to hold, pale gold
//           (screened, moving with the light);
//   sheen   the bubbles' bright rims, the planes' breaks and a rare's
//           spangles' light (screened).
// and the back, seen only as it's dealt, as one still image (`flat`).
//
// Every layer is dithered as it's rounded to 8 bits (CLAUDE.md, "No
// banding"): its own light varies smoothly over large areas, and each of
// 8-bit's levels would show as a ring. Pure: no DOM, so the worker
// (amberWorker.ts) and the page alike can paint it.

export type Pt = [number, number];
export type AmberLayer = 'light' | 'body' | 'bloom' | 'sheen' | 'flat' | 'spangle';

/** Where the slab is lit and what shape its flows follow, in its own layout px. */
export type AmberSlab = {
  /** The slab's size. */
  w: number;
  h: number;
  /** Where the lamp stands behind it, and how far its light carries across and down. */
  lamp: Pt;
  rx: number;
  ry: number;
  /** The drop of resin the flows are laid round (lib/findEngraving's), or none (the back: round the lamp). */
  drop: { c: Pt; r: number; tipY: number } | null;
  rare: boolean;
  /** Each card's amber its own. */
  seed: number;
};

/** One image of a layer: `W` x `H` device px, covering the slab's layout px from `ox`, `oy` at `s` device px to one. */
export type AmberJob = { layer: AmberLayer; slab: AmberSlab; W: number; H: number; s: number; ox: number; oy: number };

/** How fast amber takes each colour (red, green, blue) per unit of thickness; a rare's deeper, red-gold. */
const SIGMA: Record<'common' | 'rare', [number, number, number]> = {
  common: [0.04, 0.44, 2.9],
  rare: [0.07, 0.62, 3.6],
};
/** Thickness at the lamp's heart, and how much it deepens out to the light's reach: a rare's hotter at its heart and redder at its edges, the brighter card. */
const DEPTH: Record<'common' | 'rare', [number, number]> = {
  common: [0.55, 2.5],
  rare: [0.42, 2.95],
};
/** The lamp's colour (a flame's, through a little smoke), and the light left far from it. */
const LAMP: [number, number, number] = [1, 0.94, 0.8];
const AMBIENT = 0.035;
/** How much of the light at the heart is too bright for the amber: the bloom's colour and strength. */
const BLOOM: Record<'common' | 'rare', { c: [number, number, number]; a: number; r: number }> = {
  common: { c: [1, 0.86, 0.42], a: 0.26, r: 0.3 },
  rare: { c: [1, 0.8, 0.36], a: 0.38, r: 0.32 },
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

/** How far a point lies outside the drop's outline (inside, less than 0), in layout px: the flows' level lines are its offsets. */
function dropDistance(slab: AmberSlab, x: number, y: number) {
  const d = slab.drop;
  if (!d) return Math.hypot(x - slab.lamp[0], (y - slab.lamp[1]) * 0.9) - 40;
  // Mirrored about its middle; its sides meet its round where the radius turns `phi` from straight up.
  const [qx, qy] = [Math.abs(x - d.c[0]), y - d.c[1]];
  const cos = Math.min(1, d.r / (d.c[1] - d.tipY));
  const sin = Math.sqrt(1 - cos * cos);
  // Above those points (nearer straight up than they are), the side is nearest: its outward normal is the radius's there.
  if (qy < 0 && Math.atan2(qx, -qy) < Math.acos(cos)) return qx * sin - qy * cos - d.r;
  return Math.hypot(qx, qy) - d.r;
}

/**
 * The light behind at a point, before its colour: full at the lamp's heart,
 * falling off softly to the dark (an inverse power of the distance, as a
 * lamp's through a diffusing pane), on an elliptical reach.
 */
function lightAt(slab: AmberSlab, x: number, y: number) {
  const [dx, dy] = [(x - slab.lamp[0]) / slab.rx, (y - slab.lamp[1]) / slab.ry];
  return AMBIENT + (1 - AMBIENT) * Math.pow(1 + (dx * dx + dy * dy) / 0.64, -1.6);
}

/** The inclusions: specks of debris, fibres and bubbles, each at its depth (how soft), placed from the slab's seed. */
type Speck = { x: number; y: number; r: number; soft: number; dark: number; long: number; turn: number };
type Bubble = { x: number; y: number; r: number; soft: number };
type Spangle = { x: number; y: number; r: number; turn: number; flat: number; seed: number };
/** A fracture plane seen aslant: its break a line through `x`, `y` along (`c`, `s`), `len` long, its ends slanting by `lean`; the plane `wide` to its side, clearing the amber by `lift`. */
type Plane = { x: number; y: number; c: number; s: number; len: number; wide: number; lean: number; lift: number };
function inclusions(slab: AmberSlab) {
  const rnd = stream(slab.seed * 7919 + (slab.rare ? 13 : 0) + 1);
  const area = slab.w * slab.h;
  const specks: Speck[] = [];
  const bubbles: Bubble[] = [];
  const spangles: Spangle[] = [];
  const planes: Plane[] = [];
  // Mostly near the light (where they show), thinning out to the edges; few in a row's name.
  const place = (): Pt => {
    for (let i = 0; i < 8; i++) {
      const p: Pt = [rnd() * slab.w, rnd() * slab.h];
      if (lightAt(slab, p[0], p[1]) > rnd() * 0.9) return p;
    }
    return [slab.lamp[0] + (rnd() - 0.5) * slab.rx, slab.lamp[1] + (rnd() - 0.5) * slab.ry];
  };
  const nSpecks = Math.round(area / 6000);
  for (let i = 0; i < nSpecks; i++) {
    const [x, y] = place();
    const fibre = rnd() < 0.18;
    // Most lie deep, soft and faint; a few near the face, small and sharp.
    const deep = rnd() < 0.7;
    specks.push({ x, y, r: fibre ? 0.18 + rnd() * 0.15 : 0.2 + rnd() * rnd() * 0.9, soft: deep ? 0.7 + rnd() * 1.4 : 0.12, dark: deep ? 0.12 + rnd() * 0.22 : 0.3 + rnd() * 0.3, long: fibre ? 2.5 + rnd() * 6 : 0.6 + rnd() * 0.8, turn: rnd() * Math.PI });
  }
  const nBubbles = Math.round(area / 9000) + 2;
  for (let i = 0; i < nBubbles; i++) {
    const [x, y] = place();
    bubbles.push({ x, y, r: 0.5 + rnd() * rnd() * 1.6, soft: rnd() < 0.6 ? 0 : 0.5 + rnd() });
  }
  if (slab.rare) {
    const n = Math.max(4, Math.round(area / 9000));
    for (let i = 0; i < n; i++) {
      // Round the drop, never on the emblem's heart.
      const a = (i / n) * Math.PI * 2 + rnd() * 0.9;
      const k = 0.42 + rnd() * 0.5;
      spangles.push({ x: slab.lamp[0] + Math.sin(a) * slab.rx * k, y: slab.lamp[1] - Math.cos(a) * slab.ry * k * 0.95, r: 1.9 + rnd() * 2.2, turn: rnd() * Math.PI, flat: 0.28 + rnd() * 0.4, seed: Math.floor(rnd() * 1e6) });
    }
  }
  // (Last, so the rest lie where they always have.)
  const nPlanes = Math.max(3, Math.round(area / 20000));
  for (let i = 0; i < nPlanes; i++) {
    const a = (i / nPlanes) * Math.PI * 2 + rnd() * 1.4;
    const k = 0.22 + rnd() * 0.62;
    const turn = rnd() * Math.PI * 2;
    planes.push({ x: slab.lamp[0] + Math.sin(a) * slab.rx * k, y: slab.lamp[1] - Math.cos(a) * slab.ry * k, c: Math.cos(turn), s: Math.sin(turn), len: (0.3 + rnd() * 0.45) * Math.min(slab.rx, slab.ry), wide: 12 + rnd() * 26, lean: (rnd() - 0.5) * 1.6, lift: 0.32 + rnd() * 0.26 });
  }
  return { specks, bubbles, spangles, planes };
}

/** Where a point lies to a plane: how far across it from its break (on its side, more than 0), and how much it shows there along it (its ends fade, aslant). */
function planeAt(pl: Plane, x: number, y: number): [number, number] {
  const [dx, dy] = [x - pl.x, y - pl.y];
  const across = -dx * pl.s + dy * pl.c;
  const along = dx * pl.c + dy * pl.s + across * pl.lean;
  return [across, 1 - smooth(pl.len * 0.15, pl.len * 0.5, Math.abs(along))];
}
const planeReach = (pl: Plane) => pl.len / 2 + pl.wide * (1 + Math.abs(pl.lean)) + 2;

/** The slab's inclusions, as the page places a rare's spangles (each its own small image that catches the light in its turn). */
export const spanglesOf = (slab: AmberSlab) => inclusions(slab).spangles;

// ---- painting -------------------------------------------------------------------

/** Rounds `v` (0 to 1) to 8 bits, dithered: a level up or down at random in proportion, so a slow gradient never shows its steps. */
const dither = (v: number, r: number) => Math.max(0, Math.min(255, Math.floor(v * 255 + r)));

/** Paints one layer of the slab: RGBA, `job.W` x `job.H`, straight (not premultiplied) alpha. */
export function paintAmber(job: AmberJob): Uint8ClampedArray {
  const { slab, W, H, s, ox, oy, layer } = job;
  const out = new Uint8ClampedArray(W * H * 4);
  const rnd = stream(slab.seed * 31 + W * 7 + H + layer.length);
  // (Triangular dither: two uniforms, so its noise has no mean and little low-frequency weight.)
  const tri = () => rnd() + rnd();
  const tier = slab.rare ? 'rare' : 'common';
  const at = (i: number, j: number): Pt => [ox + (i + 0.5) / s, oy + (j + 0.5) / s];

  if (layer === 'spangle') return paintSpangle(job, out, tri);

  if (layer === 'light' || layer === 'bloom') {
    const b = BLOOM[tier];
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const [x, y] = at(i, j);
        const o = (j * W + i) * 4;
        if (layer === 'light') {
          const L = lightAt(slab, x, y);
          out[o] = dither(L * LAMP[0], tri());
          out[o + 1] = dither(L * LAMP[1], tri());
          out[o + 2] = dither(L * LAMP[2], tri());
          out[o + 3] = 255;
        } else {
          const [dx, dy] = [(x - slab.lamp[0]) / slab.rx, (y - slab.lamp[1]) / slab.ry];
          const a = b.a * Math.exp(-(dx * dx + dy * dy) / (b.r * b.r));
          out[o] = 255 * b.c[0];
          out[o + 1] = 255 * b.c[1];
          out[o + 2] = 255 * b.c[2];
          out[o + 3] = dither(a, tri());
        }
      }
    return out;
  }

  const { specks, bubbles, spangles, planes } = inclusions(slab);
  const sigma = SIGMA[tier];
  const [t0, deepen] = DEPTH[tier];

  if (layer === 'sheen') {
    // Light only where something catches it: a bubble's rim on the side toward the lamp and a
    // point of it inside; a rare's spangles, faintly, as they lie (the page winks each in its turn).
    const a = new Float32Array(W * H);
    for (const bu of bubbles) {
      const L = lightAt(slab, bu.x, bu.y);
      const toward = Math.atan2(slab.lamp[0] - bu.x, -(slab.lamp[1] - bu.y));
      stamp(job, bu.x, bu.y, bu.r + 1.5, (x, y) => {
        const [dx, dy] = [x - bu.x, y - bu.y];
        const d = Math.hypot(dx, dy);
        const facing = Math.cos(Math.atan2(dx, -dy) - toward);
        const rim = Math.exp(-(((d - bu.r * 0.78) / Math.max(0.22, bu.r * 0.12 + bu.soft * 0.4)) ** 2)) * Math.max(0, facing) * 0.75;
        const spot = Math.exp(-((Math.hypot(dx + bu.r * 0.32, dy + bu.r * 0.36) / Math.max(0.2, bu.r * 0.2)) ** 2)) * 0.9;
        return (rim + spot) * (0.35 + 0.65 * L);
      }, a, W, H);
    }
    // A plane's break, a fine line of light, as bright as the light that reaches it.
    for (const pl of planes) {
      stamp(job, pl.x, pl.y, planeReach(pl), (x, y) => {
        const [across, shows] = planeAt(pl, x, y);
        // (Uneven along it, as a break is: brighter where it turns to the light.)
        const along = x * pl.c + y * pl.s;
        return shows && Math.exp(-(((across - 0.25) / 0.38) ** 2)) * shows * pl.lift * 1.3 * smooth(0.3, 0.75, noise(along / 9, 0, pl.x | 0)) * Math.sqrt(lightAt(slab, x, y));
      }, a, W, H);
    }
    for (const sp of spangles) {
      stamp(job, sp.x, sp.y, sp.r + 1, (x, y) => spangleAt(sp, x, y) * 0.22, a, W, H);
    }
    for (let p = 0; p < W * H; p++) {
      const o = p * 4;
      out[o] = 255;
      out[o + 1] = 243;
      out[o + 2] = 205;
      out[o + 3] = dither(Math.min(1, a[p]), tri());
    }
    return out;
  }

  // The body (and, for the flat back, the light and bloom worked in): the thickness at each point, then what passes.
  const tau = new Float32Array(W * H);
  // The slow fields (clouds, the flows' warp and how strongly each shows), on a grid every 3 layout px, then eased between.
  const step = 3;
  const gw = Math.ceil((W / s) / step) + 2;
  const gh = Math.ceil((H / s) / step) + 2;
  const cloud = new Float32Array(gw * gh);
  const warp = new Float32Array(gw * gh);
  const showing = new Float32Array(gw * gh);
  const fine = new Float32Array(gw * gh);
  const sd = slab.seed * 131;
  for (let gj = 0; gj < gh; gj++)
    for (let gi = 0; gi < gw; gi++) {
      const [x, y] = [ox + gi * step, oy + gj * step];
      const g = gj * gw + gi;
      // (The clouds swirled: looked up where a slower field pushes them.)
      const [qx, qy] = [fbm(x / 70, y / 64, sd + 5, 2) - 0.5, fbm(x / 64 + 9, y / 70, sd + 6, 2) - 0.5];
      cloud[g] = fbm(x / 40 + qx * 2.4, y / 46 + qy * 2.4, sd + 1, 4);
      warp[g] = fbm(x / 34 + 3.1, y / 30, sd + 2, 3) - 0.5;
      showing[g] = smooth(0.48, 0.78, fbm(x / 26, y / 30 + 7, sd + 3, 3));
      fine[g] = fbm(x / 9, y / 13, sd + 4, 2) - 0.5;
    }
  const ease = (f: Float32Array, x: number, y: number) => {
    const [gx, gy] = [(x - ox) / step, (y - oy) / step];
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
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const [x, y] = at(i, j);
      const [dx, dy] = [(x - slab.lamp[0]) / slab.rx, (y - slab.lamp[1]) / slab.ry];
      const d = Math.sqrt(dx * dx + dy * dy);
      let t = t0 + deepen * Math.pow(d, 1.6);
      t += (ease(cloud, x, y) - 0.5) * 1.2;
      // The flows: the drop's offsets, warped, broad layers showing and fading by turns, a fine one here and there.
      const wp = ease(warp, x, y);
      const u = dropDistance(slab, x, y) + wp * 22;
      const shows = ease(showing, x, y);
      t += 0.24 * shows * band(u / 11 + wp * 0.8, 0.3);
      // Each flow its own density, a sharp edge between one and the next (eased over half a device
      // px) and a fine line on it where the light bends: layers of resin laid one over another.
      const ph = u / 7.5 + wp * 1.3;
      const kf = Math.floor(ph);
      const fr = ph - kf;
      const aa = 0.5 / s / 7.5;
      const edge = smooth(0, aa * 2, fr) * (1 - smooth(1 - aa * 2, 1, fr));
      const layerOf = (n: number) => hash(n, 7, sd) - 0.5;
      t += shows * 0.7 * (layerOf(kf - 1) + (layerOf(kf) - layerOf(kf - 1)) * smooth(0, aa * 3, fr));
      t += shows * shows * 0.16 * (1 - edge) + 0.06 * shows * band(u / 2.6 + wp * 2.2, 0.12);
      t += ease(fine, x, y) * 0.14;
      // Clear inside the drop, where it caught what it holds.
      if (slab.drop) t -= 0.24 * smooth(0, 16, -dropDistance(slab, x, y));
      // Deeper toward the slab's edges, as a piece of amber is (in the slab's own px: the light's layer runs past them).
      const e = Math.min(x, slab.w - x, y, slab.h - y);
      t += 0.8 * (1 - smooth(0, 18, e));
      tau[j * W + i] = Math.max(0.05, t);
    }
  // Specks and fibres: thicker, darker resin, sharp or soft as they lie near the face or deep.
  const dark = new Float32Array(W * H);
  for (const sp of specks) {
    const [c, sn] = [Math.cos(sp.turn), Math.sin(sp.turn)];
    stamp(job, sp.x, sp.y, sp.long + sp.r + sp.soft * 2, (x, y) => {
      const [dx, dy] = [x - sp.x, y - sp.y];
      const along = dx * c + dy * sn;
      const across = -dx * sn + dy * c;
      const half = sp.long / 2;
      const off = Math.max(0, Math.abs(along) - half);
      const dd = Math.hypot(off, across);
      return sp.dark * Math.exp(-((Math.max(0, dd - sp.r) / (0.25 + sp.soft)) ** 2));
    }, dark, W, H);
  }
  // Bubbles: a darker rim (the light turned away at their edge) round a clearer heart.
  const clear = new Float32Array(W * H);
  for (const bu of bubbles) {
    stamp(job, bu.x, bu.y, bu.r + 1.5 + bu.soft, (x, y) => {
      const d = Math.hypot(x - bu.x, y - bu.y);
      return Math.exp(-(((d - bu.r) / (0.3 + bu.r * 0.12 + bu.soft * 0.5)) ** 2)) * 0.55;
    }, dark, W, H);
    stamp(job, bu.x, bu.y, bu.r, (x, y) => (Math.hypot(x - bu.x, y - bu.y) < bu.r * 0.8 ? 0.18 : 0), clear, W, H);
  }
  // A rare's spangles: flat discs, a little clearer, their fractures darker lines (their light is the sheen's).
  for (const sp of spangles) {
    stamp(job, sp.x, sp.y, sp.r + 1, (x, y) => spangleAt(sp, x, y) * 0.35, clear, W, H);
  }
  // The planes: the amber clearer on a plane's side, evenly near its break (sharp, eased over
  // half a device px), then fading out across it, unevenly; a thin dark line just outside the break.
  const aa = 0.5 / s;
  for (const pl of planes) {
    stamp(job, pl.x, pl.y, planeReach(pl), (x, y) => {
      const [across, shows] = planeAt(pl, x, y);
      if (!shows || across > pl.wide) return 0;
      return smooth(-aa, aa, across) * (1 - smooth(pl.wide * 0.3, pl.wide, across)) * (0.8 + ease(fine, x, y) * 1.4) * pl.lift * shows;
    }, clear, W, H);
    stamp(job, pl.x, pl.y, planeReach(pl), (x, y) => {
      const [across, shows] = planeAt(pl, x, y);
      return shows && Math.exp(-(((across + 0.55) / 0.42) ** 2)) * 0.2 * shows;
    }, dark, W, H);
  }
  const flat = layer === 'flat';
  const b = BLOOM[tier];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const p = j * W + i;
      const o = p * 4;
      const t = tau[p] * (1 - Math.min(0.85, clear[p]));
      const keep = 1 - Math.min(0.92, dark[p]);
      let r = Math.exp(-sigma[0] * t) * keep;
      let g = Math.exp(-sigma[1] * t) * keep * (1 - dark[p] * 0.25);
      let bl = Math.exp(-sigma[2] * t) * keep * (1 - dark[p] * 0.5);
      if (flat) {
        // The back: the light worked in (dimmer: it's the back), and its heart's bloom screened over.
        const [x, y] = at(i, j);
        const L = lightAt(slab, x, y) * 0.8;
        [r, g, bl] = [r * L * LAMP[0], g * L * LAMP[1], bl * L * LAMP[2]];
        const [dx, dy] = [(x - slab.lamp[0]) / slab.rx, (y - slab.lamp[1]) / slab.ry];
        const a = b.a * 0.7 * Math.exp(-(dx * dx + dy * dy) / (b.r * b.r));
        [r, g, bl] = [1 - (1 - r) * (1 - a * b.c[0]), 1 - (1 - g) * (1 - a * b.c[1]), 1 - (1 - bl) * (1 - a * b.c[2])];
      }
      out[o] = dither(r, tri());
      out[o + 1] = dither(g, tri());
      out[o + 2] = dither(bl, tri());
      out[o + 3] = 255;
    }
  return out;
}

/** Runs `f` (a point in layout px to a value) over the device px within `reach` of `x`, `y`, adding what it gives into `into`. */
function stamp(job: AmberJob, x: number, y: number, reach: number, f: (x: number, y: number) => number, into: Float32Array, W: number, H: number) {
  const { s, ox, oy } = job;
  const [i0, i1] = [Math.max(0, Math.floor((x - reach - ox) * s)), Math.min(W - 1, Math.ceil((x + reach - ox) * s))];
  const [j0, j1] = [Math.max(0, Math.floor((y - reach - oy) * s)), Math.min(H - 1, Math.ceil((y + reach - oy) * s))];
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const v = f(ox + (i + 0.5) / s, oy + (j + 0.5) / s);
      if (v > 0) into[j * W + i] += v;
    }
}

/**
 * A sun spangle at a point: a flat disc of fracture seen aslant (an
 * ellipse, `flat` as deep as wide, turned), its edge a fine bright line,
 * brightest where it faces the light (its upper left), and fine fractures
 * out from its middle like a lily pad's veins, the disc between them all
 * but clear. 0 to 1.
 */
function spangleAt(sp: Spangle, x: number, y: number) {
  const [c, sn] = [Math.cos(sp.turn), Math.sin(sp.turn)];
  const [dx, dy] = [x - sp.x, y - sp.y];
  const u = (dx * c + dy * sn) / sp.r;
  const v = (-dx * sn + dy * c) / (sp.r * sp.flat);
  const d = Math.hypot(u, v);
  if (d > 1.3) return 0;
  // (Its edge's width in the disc's own units: a fine line, a third of a layout px.)
  const fine = 0.32 / (sp.r * sp.flat);
  const a = Math.atan2(v, u);
  const lit = 0.35 + 0.65 * Math.max(0, Math.cos(Math.atan2(dy, dx) + 2.3));
  const rim = Math.exp(-(((d - 1) / fine) ** 2)) * lit;
  const veins = Math.exp(-(((Math.sin(a * 6.5 + noise(a * 2.2, 0, sp.seed) * 2.4) * d * sp.r) / 0.22) ** 2)) * smooth(0.12, 0.5, d) * (1 - smooth(0.82, 1, d));
  return Math.min(1, rim + veins * 0.55 + 0.06 * (1 - smooth(0.9, 1.05, d)));
}

/** One spangle alone, as its own small image: `job.slab.seed` picks it among the slab's (`job.ox` its index). */
function paintSpangle(job: AmberJob, out: Uint8ClampedArray, tri: () => number) {
  const sp = inclusions(job.slab).spangles[job.ox];
  const { W, H, s } = job;
  if (!sp) return out;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const [x, y] = [sp.x + (i + 0.5 - W / 2) / s, sp.y + (j + 0.5 - H / 2) / s];
      const v = spangleAt(sp, x, y);
      const o = (j * W + i) * 4;
      out[o] = 255;
      out[o + 1] = 236;
      out[o + 2] = 178;
      out[o + 3] = dither(Math.min(1, v), tri());
    }
  return out;
}
