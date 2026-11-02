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
// slab's edges, as the icons are, and in it what a slab of real amber holds
// up to the light:
//   the drop  the resin that ran over what it caught, clearer than the
//             older amber it lies in, the step between them sharp;
//   flows     the layers the rest was laid down in, nested round the drop,
//             each its own density, a sharp step from one to the next and,
//             where a film of dust lay between two, a fine dark line with a
//             hair of light on its side toward the lamp, showing in runs;
//   clouds    broad and soft, denser and clearer;
//   spangles  a rare's sun spangles, flat discs of fracture seen aslant,
//             gold where they turn to the lamp, fine ridges running out
//             from where each began, their rim a line of light; each its
//             own image too, to catch the light in turn;
//   specks    of debris, a few, most deep and soft.
//
// The page lays it over the lamp (FossilAmber.svelte): the lamp's moving
// heart and its bloom are CSS gradients (lampLight, below), and the amber, a
// still image (`body`, the light its seams and spangles catch worked in), is
// multiplied over the one and under the other. So wherever the heart goes as
// the card tilts, the amber colours it, flows and all, as a lamp passing
// behind it would. The back, seen only as it's dealt, is one still image of
// it all (`flat`).
//
// What the amber caught (a fossil's emblem) is painted here too, from its
// mask (paintInclusion): thick and dark where its body is, letting the
// amber's light through where it thins, mottled, its edges lit from behind.
//
// Every image is painted at the density it's shown at and dithered as it's
// rounded to 8 bits (CLAUDE.md, "No banding"), strongly enough that a sharp
// face's filter, which smooths what it's given before it's shrunk, still
// finds the noise; the gradients over and under it are carried through by
// its grain. Pure: no DOM, so the worker (amberWorker.ts) and the page alike
// can paint it.

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

/** How fast amber takes each colour (red, green, blue) per unit of thickness; a rare's deeper, red-gold. */
const SIGMA: Record<'common' | 'rare', [number, number, number]> = {
  common: [0.035, 0.42, 4.5],
  rare: [0.07, 0.6, 5.6],
};
/** Thickness at the lamp's heart, and how much it deepens out to the light's reach: a rare's hotter at its heart and redder at its edges, the brighter card. */
const DEPTH: Record<'common' | 'rare', [number, number]> = {
  common: [0.5, 3.1],
  rare: [0.72, 3.8],
};
/** The lamp's colour (a flame's, through a little smoke), and the light left far from it. */
const LAMP: [number, number, number] = [1, 0.95, 0.82];
const AMBIENT = 0.035;
/** How much of the light at the heart is too bright for the amber: the bloom's colour and strength. */
const BLOOM: Record<'common' | 'rare', { c: [number, number, number]; a: number; r: number }> = {
  common: { c: [1, 0.9, 0.4], a: 0.2, r: 0.3 },
  rare: { c: [1, 0.84, 0.32], a: 0.3, r: 0.32 },
};
/** The colour of the light the seams and spangles catch: the lamp's, pale gold. */
const SHEEN: [number, number, number] = [1, 0.92, 0.62];
/** A spangle's gold, where it turns to the lamp: the lamp's light come back through the amber. */
const GOLD: [number, number, number] = [1, 0.52, 0.06];

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

/** A speck of debris, at its depth (how soft). */
type Speck = { x: number; y: number; r: number; soft: number; dark: number };
/**
 * A sun spangle: a disc of fracture `r` across, seen aslant (`flat` as deep
 * as wide), turned `turn`; where its fracture began (`from`, in the disc's
 * own units), its ridges `n`. Each catches the light in its turn as its own
 * image, the body holding only its ghost.
 */
export type Spangle = { x: number; y: number; r: number; turn: number; flat: number; from: Pt; n: number; shine: number; seed: number };

/** What lies in the amber, placed from the slab's seed: specks of debris, each at its depth (how soft), and sun spangles round the drop. */
function inclusions(slab: AmberSlab) {
  const rnd = stream(slab.seed * 7919 + (slab.rare ? 13 : 0) + 1);
  const area = slab.w * slab.h;
  const specks: Speck[] = [];
  const spangles: Spangle[] = [];
  // Mostly near the light (where they show), thinning out to the edges.
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
    // Most lie deep, soft and faint; a few near the face, small and sharp.
    const deep = rnd() < 0.75;
    specks.push({ x, y, r: 0.2 + rnd() * rnd() * 0.5, soft: deep ? 0.8 + rnd() * 1.4 : 0.12, dark: deep ? 0.1 + rnd() * 0.16 : 0.22 + rnd() * 0.22 });
  }
  // A rare's sun spangles: four round the lamp in the light's reach (a row's two), outside the drop
  // and apart, a large one and a small in turn.
  const row = slab.w > slab.h;
  const want = !slab.rare ? 0 : row ? 2 : 4;
  const outside = slab.drop ? dropDistance(slab.drop) : () => Infinity;
  for (let tries = 0; spangles.length < want && tries < 80; tries++) {
    const a = rnd() * Math.PI * 2;
    const k = 0.62 + rnd() * 0.36;
    const [ax, ay] = row ? [slab.ry * 1.3, slab.ry * 0.6] : [slab.rx, slab.ry];
    const x = slab.lamp[0] + Math.sin(a) * ax * k;
    const y = slab.lamp[1] - Math.cos(a) * ay * k;
    const r = (row ? 0.62 : 1) * (spangles.length % 2 === 0 ? 7.5 + rnd() * 3.5 : 4.8 + rnd() * 2);
    if (x < 10 || y < 10 || x > slab.w - 10 || y > slab.h - 10 || outside(x, y) < 6) continue;
    // Clear of what's set over the amber: a tall face's nameplate and its seals in the top corners, a row's name.
    if (row ? x > 108 : y > slab.h * 0.74 || (y < 62 && (x < 62 || x > slab.w - 62))) continue;
    if (spangles.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + r) * 1.6 + 8)) continue;
    const flat = 0.42 + rnd() * 0.4;
    const from: Pt = [(rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5];
    // How squarely it faces the lamp: all catch some of it, some much.
    const shine = 0.6 + 0.4 * rnd() ** 0.7;
    spangles.push({ x, y, r, turn: rnd() * Math.PI, flat, from, n: Math.max(12, Math.round((2 * Math.PI * r) / 1.1)), shine, seed: Math.floor(rnd() * 1e6) });
  }
  return { specks, spangles };
}

/** A rare's spangles, which catch the light in turn, each its own small image (FossilAmber). */
export const spanglesOf = (slab: AmberSlab) => inclusions(slab).spangles;

/**
 * A spangle at a point (layout px), lit from `toward` (radians, the way to
 * the lamp in the slab): how much of the lamp's light it throws back, gold
 * (0 to about 1), how much clearer the amber is where it lies, and a hair
 * of dark along its rim on the side away from the light. Zero outside it.
 * A flat fracture, seen aslant: its rim lobed, as a crack's is; its face a
 * mirror catching the light, brighter on its side toward the lamp, and
 * streaked out from where it began (what makes it a sun), the streaks
 * alternately catching it and not.
 */
function spangleAt(sp: Spangle, x: number, y: number, toward: number): [number, number, number, number] {
  const [c, sn] = [Math.cos(sp.turn), Math.sin(sp.turn)];
  const [dx, dy] = [x - sp.x, y - sp.y];
  const [px, py] = [dx * c + dy * sn, -dx * sn + dy * c];
  const u = px / sp.r;
  const v = py / (sp.r * sp.flat);
  const d = Math.hypot(u, v);
  if (d > 1.35) return [0, 0, 0, 0];
  const th = Math.atan2(v, u);
  const ph = sp.seed % 997;
  const lobe = 1 + 0.08 * Math.sin(3 * th + ph) + 0.05 * Math.sin(5 * th + ph * 1.7) + 0.03 * Math.sin(9 * th + ph * 2.3);
  // How far from its rim, in layout px (the ellipse's radius that way).
  const reach = (sp.r * sp.flat) / Math.hypot(sp.flat * Math.cos(th), Math.sin(th));
  const off = (d / lobe - 1) * reach * lobe;
  const inside = 1 - smooth(-0.3, 0.3, off);
  if (!inside && off > 0.9) return [0, 0, 0, 0];
  // Toward the lamp across it, -1 to 1.
  const facing = Math.cos(Math.atan2(dy, dx) - toward) * Math.min(1, Math.hypot(dx, dy) / sp.r);
  // The streaks: fine lines out from where it began, each a little off its place and its own
  // brightness, on a face that's itself faintly lit.
  const [fu, fv] = [u - sp.from[0], v - sp.from[1]];
  const turns = ((Math.atan2(fv, fu) / (2 * Math.PI)) * sp.n + sp.n) % sp.n;
  const k = Math.round(turns) % sp.n;
  const along = Math.hypot(fu, fv);
  const across = Math.abs(((turns - Math.round(turns) - (hash(k, 7, sp.seed) - 0.5) * 0.5) * 2 * Math.PI) / sp.n) * along * reach;
  const streak = (0.35 + 0.65 * hash(k, 3, sp.seed)) * Math.exp(-((across / 0.3) ** 2)) * smooth(0.1, 0.45, along);
  const face = inside * sp.shine * (0.5 + 0.5 * facing) * (0.22 + 0.78 * streak);
  // Its rim catching the light on its side toward the lamp, and dark on the other.
  const rim = Math.exp(-((off / 0.34) ** 2));
  const lit = rim * Math.max(0, facing) * 0.75;
  const dark = rim * Math.max(0, -facing) * 0.15;
  return [face, lit, inside * 0.25, dark];
}

// ---- painting -------------------------------------------------------------------

/** How far the dither stirs each level, either way (a triangle): enough that a sharp face's filter, which smooths what it's given, still finds its noise. */
const DITHER = 3.6;
/** Rounds `v` (0 to 1) to 8 bits, dithered by `r` (a triangle, -1 to 1): a slow gradient never shows its steps. Nothing stays nothing. */
const dither = (v: number, r: number) => (v <= 0 ? 0 : Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5 + r * DITHER))));

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

  const { tau, bent, glow, gild, light } = field(job);
  // What passes: each colour by how far it's carried through, the light as the planes bend it; and
  // the light the seams and spangles throw back, screened over that as it will be once the face's
  // moving light is under it (the body is multiplied over the light: worked in as the light stands
  // at rest). On the back, the lamp's light and bloom worked in too.
  const sigma = SIGMA[tier];
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
      const L = (flat ? light[p] * 0.8 : light[p] / sway) * bent[p];
      const top = flat ? 0.8 : 1 / sway;
      const [a, g] = [Math.min(1, glow[p]), Math.min(1, gild[p])];
      const rgb = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        let v = Math.exp(-sigma[c] * t) * L * LAMP[c];
        v += a * SHEEN[c] * (top - v);
        v += g * GOLD[c] * (top - v);
        rgb[c] = Math.min(1, v);
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
 * The flows' layers: where each starts (out from the drop's outline, in
 * layout px), how dense it is and how it bends the light (a layer laid down
 * a little lens-shaped gathers it or spreads it), and the film of dust along
 * its inner edge, if any (0 to 1).
 */
type Flow = { at: number; density: number; bend: number; film: number };
/** The slab's flows, from well inside the drop to past its corners: wider further out, each its own, about half with a film. */
function flowsOf(seed: number): Flow[] {
  const rnd = stream(seed * 977 + 5);
  const flows: Flow[] = [];
  for (let at = -90; at < 320; ) {
    const film = rnd() < (at < 0 ? 0.5 : 0.62) ? 0.45 + rnd() * 0.55 : 0;
    flows.push({ at, density: rnd() - 0.5, bend: rnd() - 0.5, film });
    at += (at < 0 ? 16 : 8 + Math.min(1, at / 150) * 14) * (0.6 + rnd() * 0.9);
  }
  return flows;
}

/**
 * The slab at each pixel of `job`: its thickness (how far the light is
 * carried through it), how its planes bend the light there, the light its
 * seams throw back (pale) and its spangles (gold), and the lamp's light.
 */
function field(job: AmberJob) {
  const { slab, W, H, s, ox, oy } = job;
  const tier = slab.rare ? 'rare' : 'common';
  const [t0, deepen] = DEPTH[tier];
  const { specks, spangles } = inclusions(slab);
  const tau = new Float32Array(W * H);
  const bent = new Float32Array(W * H);
  const glow = new Float32Array(W * H);
  const gild = new Float32Array(W * H);
  const light = new Float32Array(W * H);
  const sd = slab.seed * 131;
  // The slow fields (the clouds; the flows' warp, broad and gentle so they run in long curves, not
  // wobbles; where the layering shows; where each seam shows), on a grid every 3 of the slab's layout
  // px, eased between: on the slab's own grid, so strips of it painted apart meet.
  const step = 3;
  const [gx0, gy0] = [Math.floor(ox / step) * step, Math.floor(oy / step) * step];
  const gw = Math.ceil((ox + W / s - gx0) / step) + 3;
  const gh = Math.ceil((oy + H / s - gy0) / step) + 3;
  const cloud = new Float32Array(gw * gh);
  const warp = new Float32Array(gw * gh);
  const showing = new Float32Array(gw * gh);
  const seamA = new Float32Array(gw * gh);
  const seamB = new Float32Array(gw * gh);
  for (let gj = 0; gj < gh; gj++)
    for (let gi = 0; gi < gw; gi++) {
      const [x, y] = [gx0 + (gi - 1) * step, gy0 + (gj - 1) * step];
      const g = gj * gw + gi;
      // (The clouds swirled: looked up where a slower field pushes them.)
      const [qx, qy] = [fbm(x / 70, y / 64, sd + 5, 2) - 0.5, fbm(x / 64 + 9, y / 70, sd + 6, 2) - 0.5];
      cloud[g] = fbm(x / 40 + qx * 2.4, y / 46 + qy * 2.4, sd + 1, 4);
      warp[g] = (fbm(x / 96 + 3.1, y / 88, sd + 2, 2) - 0.5) * 30 + (fbm(x / 34, y / 30 + 5, sd + 12, 2) - 0.5) * 6;
      showing[g] = smooth(0.4, 0.64, fbm(x / 30, y / 34 + 7, sd + 3, 3));
      seamA[g] = fbm(x / 30, y / 34, sd + 11, 2);
      seamB[g] = fbm(x / 28 + 17, y / 31, sd + 13, 2);
    }
  const ease = (f: Float32Array, x: number, y: number) => {
    const [gx, gy] = [(x - gx0) / step + 1, (y - gy0) / step + 1];
    const [i, j] = [Math.max(0, Math.min(gw - 2, Math.floor(gx))), Math.max(0, Math.min(gh - 2, Math.floor(gy)))];
    const [u, v] = [Math.min(1, Math.max(0, gx - i)), Math.min(1, Math.max(0, gy - j))];
    const g = j * gw + i;
    return f[g] + (f[g + 1] - f[g]) * u + (f[g + gw] - f[g]) * v + (f[g] - f[g + 1] - f[g + gw] + f[g + gw + 1]) * u * v;
  };
  /** Half a device px, in layout px: the sharp edges' easing. */
  const aa = 0.5 / s;
  /** A seam's width, in layout px: a hair, never less than a device px. */
  const hair = Math.max(0.45, 1.1 * aa);
  // The flows lie round the drop (on the back, round the lamp).
  const outside = slab.drop ? dropDistance(slab.drop) : (x: number, y: number) => Math.hypot(x - slab.lamp[0], (y - slab.lamp[1]) * 0.9) - 40;
  const flows = flowsOf(slab.seed);
  // Which flow a point lies in, looked up by how far out it lies (an eighth of a layout px at a time).
  const U0 = flows[0].at;
  const lut = new Int16Array(Math.ceil((flows.at(-1)!.at - U0) * 8) + 1);
  for (let i = 0, k = 0; i < lut.length; i++) {
    const u = U0 + i / 8;
    while (k + 1 < flows.length && flows[k + 1].at <= u) k++;
    lut[i] = k;
  }
  const flowAt = (u: number) => lut[Math.max(0, Math.min(lut.length - 1, Math.floor((u - U0) * 8)))];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const [x, y] = [ox + (i + 0.5) / s, oy + (j + 0.5) / s];
      const p = j * W + i;
      const [dx, dy] = [(x - slab.lamp[0]) / slab.rx, (y - slab.lamp[1]) / slab.ry];
      const L = (light[p] = lightAt(slab, x, y));
      let t = t0 + deepen * Math.pow(Math.sqrt(dx * dx + dy * dy), 1.6);
      // A slab, not a lens: thinner toward the upper left, where the plate's light falls, thicker toward the lower right.
      t += 0.32 * (dx * 0.55 + dy * 0.75);
      t += (ease(cloud, x, y) - 0.5) * 1.15;
      // The flows: each its own density and its own bend of the light, a sharp step from one to the
      // next, where the layering shows.
      const dd = outside(x, y);
      const u = dd + ease(warp, x, y);
      const k = flowAt(u);
      const f = flows[k];
      const next = flows[Math.min(flows.length - 1, k + 1)];
      const prev = flows[Math.max(0, k - 1)];
      const toNext = next.at - u;
      const fromHere = u - f.at;
      // (Eased over a device px either side of each step.)
      let [density, bend] = [f.density, f.bend];
      if (toNext < aa) {
        const e = smooth(aa, -aa, toNext);
        [density, bend] = [density + (next.density - density) * e, bend + (next.bend - bend) * e];
      } else if (fromHere < aa) {
        const e = smooth(aa, -aa, fromHere);
        [density, bend] = [density + (prev.density - density) * e, bend + (prev.bend - bend) * e];
      }
      const shows = ease(showing, x, y);
      t += 0.55 * shows * density;
      let b = 1 + 0.22 * shows * bend;
      // Its film, along its inner edge, where a seam runs: the light bent away from a fine line just
      // outside it and gathered in a hair just inside (toward the lamp), as a seam in clear resin shows.
      for (const [g, o] of [
        [f, fromHere],
        [next, -toNext],
      ] as [Flow, number][]) {
        if (!g.film || Math.abs(o) > 2.5) continue;
        const run = smooth(0.46, 0.66, ease((flows.indexOf(g) & 1) === 0 ? seamA : seamB, x, y));
        if (run <= 0) continue;
        const line = Math.exp(-(((o - 0.2) / hair) ** 2));
        b *= 1 - 0.4 * g.film * run * line;
        t += 0.25 * g.film * run * line;
        glow[p] += 0.42 * g.film * run * L * Math.exp(-(((o + 0.6) / hair) ** 2));
      }
      // The drop: clearer than the amber round it, the step between them sharp, and clearer still toward its heart.
      // Deeper again just inside its outline, where the drop's resin curves away (its meniscus).
      if (slab.drop) t += -0.22 * smooth(-aa, aa, -dd) - 0.12 * smooth(0, 30, -dd) + 0.42 * smooth(-aa, aa, -dd) * Math.exp(dd / 5);
      // Deeper toward the slab's edges, as a piece of amber is (in the slab's own px: the light's layer runs past them).
      const e = Math.min(x, slab.w - x, y, slab.h - y);
      t += 0.8 * (1 - smooth(0, 18, e));
      tau[p] = t;
      bent[p] = b;
    }
  // The spangles: clearer where they lie, their face and rim throwing back the lamp's light, gold
  // (only faintly here: each one's own image catches the rest), a hair of dark on the far side.
  const clear = new Float32Array(W * H);
  const dark = new Float32Array(W * H);
  const kept = 0.35;
  for (const sp of spangles) {
    const toward = Math.atan2(slab.lamp[1] - sp.y, slab.lamp[0] - sp.x);
    const Ls = lightAt(slab, sp.x, sp.y) ** 0.5;
    stamp(job, sp.x, sp.y, sp.r * 1.4 + 1, (x, y, p) => {
      const [face, lit, cl, dk] = spangleAt(sp, x, y, toward);
      bent[p] *= 1 + 1.4 * face * kept;
      gild[p] += 0.15 * face * kept * Ls;
      glow[p] += lit * kept * Ls;
      dark[p] += dk * 0.3;
      return cl;
    }, clear, W, H);
  }
  // Specks: darker resin, sharp or soft as they lie near the face or deep.
  for (const sp of specks)
    stamp(job, sp.x, sp.y, sp.r + sp.soft * 2.2, (x, y) => sp.dark * Math.exp(-((Math.max(0, Math.hypot(x - sp.x, y - sp.y) - sp.r) / (0.25 + sp.soft)) ** 2)), dark, W, H);
  for (let p = 0; p < W * H; p++) tau[p] = Math.max(0.05, tau[p] * (1 - Math.min(0.6, clear[p])) + 2.2 * Math.min(0.9, dark[p]));
  return { tau, bent, glow, gild, light };
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

/** One spangle alone, as its own small image (`job.ox` its index among them), its face and rim in gold. */
function paintSpangle(job: AmberJob, out: Uint8ClampedArray, tri: () => number) {
  const sp = spanglesOf(job.slab)[job.ox];
  const { W, H, s, slab } = job;
  if (!sp) return out;
  const toward = Math.atan2(slab.lamp[1] - sp.y, slab.lamp[0] - sp.x);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const [x, y] = [sp.x + (i + 0.5 - W / 2) / s, sp.y + (j + 0.5 - H / 2) / s];
      const o = (j * W + i) * 4;
      const [face, lit] = spangleAt(sp, x, y, toward);
      out[o] = 255 * GOLD[0];
      out[o + 1] = 255 * GOLD[1];
      out[o + 2] = 255 * GOLD[2];
      out[o + 3] = dither(Math.min(1, 0.8 * face + lit), tri());
    }
  return out;
}

// ---- what the amber caught ----------------------------------------------------------

/**
 * What a fossil's creature takes of each colour per unit of its thickness:
 * where it's thickest, multiplied over the amber's light, an olive brown,
 * dark but never black (as the icons' are); where it thins, the amber's
 * own light through it.
 */
const CAUGHT: [number, number, number] = [0.6, 1.25, 3.2];
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
 * it lies in, not on. Both opaque: the emblem's mask cuts them. `grain`,
 * as an AmberJob's.
 */
export function paintInclusion(alpha: Float32Array, W: number, H: number, s: number, grain = 1) {
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
        body[o + c] = dither(Math.exp(-CAUGHT[c] * th), tri());
        const a = Math.min(1, veil + wrap + 0.45 * edge);
        lit[o + c] = dither(WRAP[c] * a, tri());
      }
      body[o + 3] = lit[o + 3] = 255;
    }
  return { body, rim: lit };
}
