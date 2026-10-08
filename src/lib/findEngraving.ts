// The engraved plates of Delve's finds (ChooseCategory): an Azurite Vein,
// a Flare Cache and a Dynamite Cache. They are the category cards'
// plates (lib/cardEngraving), cut by the same hand in the same way
// (docs/arcane-style.md: exact geometry, one-sided hatching, lines stopping
// short of what they meet, a soft glow under them), with parts redrawn as a
// Variant. What sets them apart is engraved, never painted: the motif and
// the tint the card gives the ink (ChooseCategory).
//
// Each card keeps the plain card's composition and puts the find in three
// places: in the left spandrel, in Sol's place, the find's seal; in the
// right, in Luna's, its alchemical sign; and round the emblem, made from the
// card's own glory, its motif, breaking out through the arch, whose lines
// stop short of it, as the band's rings stop at a seal.
//
// • Azurite Vein: a crystal seen end on, and Venus, copper's sign (azurite
//   is copper's blue ore); a cluster of hexagonal prisms grows out of the
//   floor in the window's right corner, out through the arch and the panel,
//   each computed from its section and hatched down the faces turned from
//   the light (the upper left, as on the rest of the plate), over a glory
//   that ends on a hexagon, as a crystal grows. The back holds the crystal
//   in that glory.
// • Flare Cache: a flare's burst about the sign of fire, so large it breaks
//   the arch, and sulphur, the flare's brimstone; the emblem in a sun, a
//   double ring with pointed rays hatched down one side, long and short in
//   turn, the long ones out to the panel, over a glory of fine rays in three
//   lengths. The back holds the burst.
// • Dynamite Cache: a small ring blown apart, its shards out over the arch,
//   and nitre, black powder's salt; the emblem in a ring blown apart, its
//   arcs thrown out each its own way, shards flying out between them in
//   rings. The back holds nitre in a ring blown apart.
//
// Laid in a row (phones) the spandrels are gone: the vein's crystals grow at
// the row's far end, the sun and the broken ring stand round the emblem.

import { arc, at, hatch, lerp, line, pointedRay, pt, rad, type Cut, type Hole, type Pt } from './arcane.ts';
import { type BackLayout, type Plate, type RowLayout, type TallLayout, type Variant } from './cardEngraving.ts';
import type { FindKind } from './delve.ts';

// ---- geometry -------------------------------------------------------------------

const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
const dot = (p: Pt, q: Pt) => p[0] * q[0] + p[1] * q[1];
const centroid = (poly: Pt[]): Pt => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
const poly = (ps: Pt[]) => `M${ps.map(pt).join('L')}Z`;

/** The convex hull of `ps`, in order round it. */
function hull(ps: Pt[]): Pt[] {
  const s = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(s), ...half([...s].reverse())];
}

/** A convex polygon grown outward by `d` (each side moved out, the corners where they meet). */
function grow(ps: Pt[], d: number): Pt[] {
  const c = centroid(ps);
  const sides = ps.map((a, i) => {
    const b = ps[(i + 1) % ps.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let n: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    if (dot(n, sub(a, c)) < 0) n = [-n[0], -n[1]];
    return { a: [a[0] + n[0] * d, a[1] + n[1] * d] as Pt, u: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] as Pt };
  });
  return sides.map((s, i) => {
    const prev = sides[(i + sides.length - 1) % sides.length];
    const den = prev.u[0] * s.u[1] - prev.u[1] * s.u[0];
    if (Math.abs(den) < 1e-9) return s.a;
    const t = ((s.a[0] - prev.a[0]) * s.u[1] - (s.a[1] - prev.a[1]) * s.u[0]) / den;
    return [prev.a[0] + prev.u[0] * t, prev.a[1] + prev.u[1] * t];
  });
}

/** Where a line from `p` to `q` runs inside the convex polygon `ps`, as a cut in [0, 1]. */
function inPoly(p: Pt, q: Pt, ps: Pt[]): Cut | null {
  const c = centroid(ps);
  const d = sub(q, p);
  let [t0, t1] = [0, 1];
  for (let i = 0; i < ps.length; i++) {
    const [a, b] = [ps[i], ps[(i + 1) % ps.length]];
    let n: Pt = [-(b[1] - a[1]), b[0] - a[0]];
    if (dot(n, sub(c, a)) < 0) n = [-n[0], -n[1]];
    const [num, den] = [dot(n, sub(p, a)), dot(n, d)];
    if (Math.abs(den) < 1e-12) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  return t0 < t1 ? [t0, t1] : null;
}

/** What a motif's lines stop short of: convex shapes standing in front, and discs. */
type Shields = { polys: Pt[][]; holes: Hole[] };
const NONE: Shields = { polys: [], holes: [] };
/** A straight line, broken where it passes behind a shield. */
const seg = (p: Pt, q: Pt, s: Shields = NONE) =>
  line(p, q, { holes: s.holes, cuts: s.polys.map((ps) => inPoly(p, q, ps)).filter((c): c is Cut => !!c) });

/** Lines across the quadrilateral `a`, `b`, `c`, `d` parallel to its side `a` to `b`, stepping toward `d` to `c`, `gap` apart, kept 0.5 in from its ends. */
function hatchQuad(a: Pt, b: Pt, c: Pt, d: Pt, gap: number, s: Shields = NONE) {
  const n = Math.floor(Math.max(Math.hypot(d[0] - a[0], d[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1])) / gap);
  let out = '';
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const [p, q] = [lerp(a, d, t), lerp(b, c, t)];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1.2) continue;
    const k = 0.5 / len;
    out += seg(lerp(p, q, k), lerp(p, q, 1 - k), s);
  }
  return out;
}

/** Lines across the triangle `o`, `l`, `t` parallel to its side `o` to `t`, stepping toward `l`. */
function hatchTri(o: Pt, l: Pt, t: Pt, gap: number, s: Shields = NONE) {
  const n = Math.floor(Math.hypot(l[0] - o[0], l[1] - o[1]) / gap);
  let out = '';
  for (let i = 1; i <= n; i++) {
    const u = i / (n + 1);
    out += seg(lerp(o, l, u), lerp(t, l, u), s);
  }
  return out;
}

// ---- crystals -------------------------------------------------------------------

/**
 * A hexagonal prism of azurite, out of `root` toward `a` (degrees clockwise
 * from the top), `len` long and `hw` across its widest half, the hexagon of
 * its section turned `phase` degrees, ending in a six-sided point. Seen a
 * little from below, so the shoulder where the point begins zigzags.
 */
type Prism = { root: Pt; a: number; len: number; hw: number; phase: number };

/** Where a prism's corners fall: its outline, and the ridges and faces seen from the front. */
function prismShape({ root, a, len, hw, phase }: Prism) {
  const u = at([0, 0], a, 1);
  const n = at([0, 0], a + 90, 1);
  const place = (x: number, s: number): Pt => [root[0] + n[0] * x + u[0] * s, root[1] + n[1] * x + u[1] * s];
  const T = hw * 1.35;
  const verts = Array.from({ length: 6 }, (_, k) => {
    const th = rad(phase + k * 60);
    const [x, z] = [hw * Math.cos(th), hw * Math.sin(th)];
    return { th: phase + k * 60, x, z, sh: len - T - 0.32 * z };
  });
  // The ridges seen from the front: from the leftmost corner to the rightmost, over the side facing out.
  const lo = verts.reduce((m, v, k) => (v.x < verts[m].x ? k : m), 0);
  const hi = verts.reduce((m, v, k) => (v.x > verts[m].x ? k : m), 0);
  const walk = (step: number) => {
    const out = [lo];
    for (let k = lo; k !== hi; ) out.push((k = (k + step + 6) % 6));
    return out;
  };
  const [w1, w2] = [walk(1), walk(-1)];
  const zsum = (w: number[]) => w.slice(1, -1).reduce((s, k) => s + verts[k].z, 0);
  const front = (zsum(w1) >= zsum(w2) ? w1 : w2).map((k) => verts[k]);
  const apex = place(0, len);
  const outline = hull([place(verts[lo].x, 0), place(verts[hi].x, 0), ...verts.map((v) => place(v.x, v.sh)), apex]);
  return { place, front, apex, outline, n };
}

/** Where the light falls from: the upper left, as on the rest of the plate. */
const LIGHT: Pt = [-0.6, -0.8];
/** A face turned more than this far from the light is shaded. */
const SHADED = 0.22;

/** A prism engraved: its edges and ridges, its shaded faces hatched along their length, its shaded point facets across. */
function prism(p: Plate, pr: Prism, s: Shields, k = 1) {
  const { place, front, apex, n } = prismShape(pr);
  const ends = [front[0], front.at(-1)!];
  let edges = '';
  let ridges = '';
  let shade = '';
  for (const v of front) {
    const [foot, sh] = [place(v.x, 0), place(v.x, v.sh)];
    if (ends.includes(v)) edges += seg(foot, sh, s) + seg(sh, apex, s);
    else ridges += seg(foot, sh, s) + seg(sh, apex, s);
  }
  for (let i = 0; i + 1 < front.length; i++) {
    const [v, w] = [front[i], front[i + 1]];
    ridges += seg(place(v.x, v.sh), place(w.x, w.sh), s);
    // How far this face turns away from the light (it faces out along n by its offset across).
    const dark = -((v.x + w.x) / 2 / pr.hw) * dot(n, LIGHT);
    if (dark <= SHADED) continue;
    const gap = (dark > 0.6 ? 0.75 : 1.2) * k;
    // Along the face, from its foot to the shoulder; its facet of the point, across.
    shade += hatchQuad(place(v.x, 0.8), place(v.x, v.sh - 0.6), place(w.x, w.sh - 0.6), place(w.x, 0.8), gap, s);
    shade += hatchTri(place(w.x, w.sh), place(v.x, v.sh), apex, gap * 1.1, s);
  }
  p.add(edges, 'thin');
  p.add(ridges, 'hair');
  p.add(shade, 'hatch');
}

/** The part of a convex polygon above the line y = `y`. */
function above(ps: Pt[], y: number): Pt[] {
  const out: Pt[] = [];
  ps.forEach((a, i) => {
    const b = ps[(i + 1) % ps.length];
    if (a[1] <= y) out.push(a);
    if (a[1] <= y !== b[1] <= y) out.push(lerp(a, b, (y - a[1]) / (b[1] - a[1])));
  });
  return out;
}

/**
 * A cluster of prisms drawn back to front, each stopping short of those
 * before it; their outlines are kept clear of the plate, above `top` only
 * (below it they stand behind the plate's pedestal).
 */
function cluster(p: Plate, prisms: Prism[], extra: Shields = NONE, k = 1, top = Infinity) {
  const shapes = prisms.map(prismShape);
  prisms.forEach((pr, i) => {
    const front = shapes.slice(i + 1).map((sh) => grow(sh.outline, 0.7));
    prism(p, pr, { polys: [...front, ...extra.polys], holes: extra.holes }, k);
  });
  p.knockout += shapes
    .map((sh) => above(grow(sh.outline, 1.4), top))
    .filter((ps) => ps.length > 2)
    .map(poly)
    .join('');
}

/** A crystal seen end on, `r` across its points: its hexagon, the table cut on its tip, the facets between, those turned from the light hatched. */
function crystalSeal(p: Plate, c: Pt, r: number) {
  const outer = Array.from({ length: 6 }, (_, k) => at(c, k * 60, r));
  const inner = Array.from({ length: 6 }, (_, k) => at(c, k * 60, r * 0.48));
  p.add(poly(outer), 'thin');
  p.add(poly(Array.from({ length: 6 }, (_, k) => at(c, k * 60, r + 1.6))), 'hair');
  p.add(poly(inner), 'hair');
  let facets = '';
  for (let k = 0; k < 6; k++) facets += line(inner[k], outer[k]);
  p.add(facets, 'hair');
  // The facets on the right and below, away from the light.
  let shade = '';
  for (const k of [1, 2, 3]) shade += hatchQuad(outer[k], outer[(k + 1) % 6], inner[(k + 1) % 6], inner[k], r * 0.11);
  // The table: a few strokes on its shaded side.
  shade += hatch(inner[1], inner[3], inner[2], r * 0.12);
  p.add(shade, 'hatch');
}

/** A glory ending on a hexagon (its points up and down), as a crystal grows: fine rays long and short in turn, and its six axes as pointed rays. */
function crystalGlory(p: Plate, c: Pt, reach: (deg: number) => number, row: boolean) {
  const r0 = row ? 28 : 66;
  const R = row ? 58 : 150;
  /** How far the hexagon of size `s` lies from the centre at `deg`. */
  const hexAt = (s: number, deg: number) => {
    const off = ((((deg - 30) % 60) + 60) % 60) - 30;
    return (s * Math.cos(rad(30))) / Math.cos(rad(off));
  };
  const n = row ? 60 : 72;
  let rays = '';
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * 360;
    const end = Math.min(reach(a) - 2, hexAt(k % 2 ? R * 0.7 : R, a));
    if (end - r0 > 4) rays += line(at(c, a, r0), at(c, a, end));
  }
  p.add(rays, 'ray');
  // The hexagons themselves, where they lie inside the reach.
  let hex = '';
  for (const s of [R * 0.7, R]) {
    for (let k = 0; k < 6; k++) {
      const [a0, a1] = [k * 60, k * 60 + 60];
      const steps = 24;
      for (let i = 0; i < steps; i++) {
        const [b0, b1] = [a0 + ((a1 - a0) * i) / steps, a0 + ((a1 - a0) * (i + 1)) / steps];
        const [q0, q1] = [at(c, b0, hexAt(s, b0)), at(c, b1, hexAt(s, b1))];
        if (hexAt(s, b0) < reach(b0) - 2 && hexAt(s, b1) < reach(b1) - 2) hex += line(q0, q1);
      }
    }
  }
  p.add(hex, 'ray');
  for (let k = 0; k < 6; k++) {
    const a = k * 60;
    const end = Math.min(reach(a) - 3, hexAt(R, a) - 3);
    if (end - r0 < 10) continue;
    const ray = pointedRay(c, a, r0, end, (Math.asin(2.2 / r0) * 180) / Math.PI, 0.9);
    p.add(ray.lines, 'hair');
    p.add(ray.hatch, 'hatch');
  }
}

// ---- the flare ------------------------------------------------------------------

/** The sign of fire, a triangle point up, `r` from its centre to its points, hatched down its right side. */
function fireSign(p: Plate, c: Pt, r: number) {
  const [top, right, left] = [at(c, 0, r), at(c, 120, r), at(c, 240, r)];
  p.add(poly([top, right, left]), 'sign');
  const mid = lerp(right, left, 0.5);
  p.add(hatch(mid, right, top, Math.max(0.55, r * 0.14)), 'hatch');
}

/**
 * A flare's burst about `c`, `r` to its longest rays: the sign of fire in a
 * double ring, pointed rays in three lengths hatched down one side, fine
 * rays between them.
 */
function burst(p: Plate, c: Pt, r: number, s: Shields = NONE) {
  const core = r * 0.3;
  p.add(arc(c, core, 0, 360), 'thin');
  p.add(arc(c, core - 1.3, 0, 360), 'hair');
  fireSign(p, c, core * 0.66);
  const n = 16;
  let fine = '';
  for (let k = 0; k < n; k++) {
    const a = k * (360 / n);
    const len = k % 4 === 0 ? r : k % 2 === 0 ? r * 0.78 : r * 0.6;
    const ray = pointedRay(c, a, core + 1.4, len, (Math.asin(Math.min(1, (k % 4 === 0 ? 2.4 : 1.8) / (core + 1.4))) * 180) / Math.PI, 0.7);
    p.add(ray.lines, 'hair');
    p.add(ray.hatch, 'hatch');
    // Two fine rays in each gap.
    for (const d of [1 / 3, 2 / 3]) {
      const b = a + (360 / n) * d;
      fine += seg(at(c, b, core + 2.2), at(c, b, core + (len - core) * 0.62), s);
    }
  }
  p.add(fine, 'hair');
}

/** The glory behind the emblem as a burst: fine rays in three lengths, long, short, middling, short. */
function burstGlory(p: Plate, c: Pt, reach: (deg: number) => number, row: boolean) {
  const r0 = row ? 28 : 66;
  const n = row ? 64 : 96;
  let rays = '';
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * 360;
    const r1 = reach(a) - 2;
    const end = r0 + (r1 - r0) * [1, 0.45, 0.72, 0.45][k % 4];
    if (end - r0 > 4) rays += line(at(c, a, r0), at(c, a, end));
  }
  p.add(rays, 'ray');
}

// ---- the signs ------------------------------------------------------------------

/** Venus, the sign of copper (azurite is copper's blue ore), `r` from its centre to its ends: a ring on a cross, the ring shaded inside. */
function copperSign(p: Plate, c: Pt, r: number) {
  const rr = r * 0.44;
  const o: Pt = [c[0], c[1] - r + rr];
  p.add(arc(o, rr, 0, 360) + line([c[0], o[1] + rr], [c[0], c[1] + r]) + line([c[0] - rr * 0.85, c[1] + r * 0.5], [c[0] + rr * 0.85, c[1] + r * 0.5]), 'sign');
  let h = '';
  for (let y = -rr + 1; y < rr - 0.6; y += 0.9) {
    const x = Math.sqrt(rr * rr - y * y) - 0.6;
    if (x > 0.8) h += line([o[0] + x * 0.25, o[1] + y], [o[0] + x, o[1] + y]);
  }
  p.add(h, 'hatch');
}

/** Sulphur, the flare's brimstone, `r` from its centre to its ends: the sign of fire over a cross, hatched down its right. */
function sulphurSign(p: Plate, c: Pt, r: number) {
  const [top, base] = [c[1] - r, c[1] + r * 0.12];
  const half = (base - top) * 0.62;
  const tri: Pt[] = [
    [c[0], top],
    [c[0] + half, base],
    [c[0] - half, base],
  ];
  p.add(poly(tri) + line([c[0], base], [c[0], c[1] + r]) + line([c[0] - half * 0.7, c[1] + r * 0.58], [c[0] + half * 0.7, c[1] + r * 0.58]), 'sign');
  p.add(hatch([c[0], base], tri[1], tri[0], 0.7), 'hatch');
}

// ---- the faces ------------------------------------------------------------------

/** The pedestal's outline on a tall face, which stands in front of anything behind the emblem. */
const pedestal = (g: TallLayout): Pt[] => {
  const { capTop, capR, baseR } = g.pedestal;
  const m = g.arch.A[0];
  return [
    [m - capR - 1, capTop - capR * 0.085 - 1],
    [m + capR + 1, capTop - capR * 0.085 - 1],
    [m + baseR + 1, g.floor - 6],
    [m + baseR + 1, g.floor + 6],
    [m - baseR - 1, g.floor + 6],
    [m - baseR - 1, g.floor - 6],
  ];
};

/** The Azurite Vein's crystals: a cluster rooted in the floor's right corner, out through the arch and the panel. */
function veinTall(p: Plate, g: TallLayout) {
  const k = g.w / 218;
  const root: Pt = [g.arch.A[0] + g.arch.ri - 10 * k, g.floor + 3];
  const P = (a: number, len: number, hw: number, phase: number, dx = 0): Prism => ({ root: [root[0] + dx * k, root[1]], a, len: len * k, hw: hw * k, phase });
  // Back to front.
  const prisms = [P(-32, 64, 5.6, 14, -8), P(40, 62, 5.4, 22, 5), P(-11, 92, 7.4, 40, -3), P(15, 128, 9.6, 18, 2), P(-50, 34, 4.2, 30, -12), P(5, 42, 5, 8, 0), P(30, 30, 4, 44, 9)];
  // The floor's front edge hides their roots.
  const ground: Pt[] = [
    [root[0] - 50 * k, g.floor + 0.6],
    [root[0] + 50 * k, g.floor + 0.6],
    [root[0] + 50 * k, g.floor + 40],
    [root[0] - 50 * k, g.floor + 40],
  ];
  cluster(p, prisms, { polys: [ground], holes: [{ c: g.luna.c, r: g.luna.r + 3 }] }, k);
}

/** The flare's sun round the emblem: long pointed rays out of the glory, breaking out through the arch to the panel, short ones between. */
function flareTall(p: Plate, g: TallLayout) {
  const k = g.w / 218;
  const C = g.emblem;
  // Short of the burst in Sol's place and the sign in Luna's.
  const holes = [
    { c: g.sol.c, r: BURST * k * 0.8 + 3 },
    { c: g.luna.c, r: g.luna.r + 3 },
  ];
  const r0 = 64 * k;
  sunRing(p, C, r0);
  for (const [a, long] of [-108, -84, -60, -38, 38, 60, 84, 108].map((a, i) => [a, i % 2 === (a < 0 ? 0 : 1)] as const)) {
    // The long ones out to just short of the panel's inner line, the short ones just through the arch.
    const u = at([0, 0], a, 1);
    const xs = u[0] > 0 ? (g.inner[2] - 2 - C[0]) / u[0] : (g.inner[0] + 2 - C[0]) / u[0];
    const ys = u[1] < 0 ? (g.inner[1] + 2 - C[1]) / u[1] : Infinity;
    let end = long ? Math.min(xs, ys) : Math.min(xs, ys, reachRay(C, a, g) + 6 * k);
    for (const h of holes) {
      const t = throughHole(C, a, h);
      if (t !== null) end = Math.min(end, t - 1);
    }
    const half = (Math.asin(((long ? 4.2 : 3) * k) / r0) * 180) / Math.PI;
    const ray = pointedRay(C, a, r0, end, half, 0.75);
    p.add(ray.lines, 'thin');
    p.add(ray.hatch, 'hatch');
    p.knockout += poly([at(C, a - half * 1.25, r0 - 1), at(C, a, end + 1.6), at(C, a + half * 1.25, r0 - 1)]);
  }
}

/** The ring a sun's rays stand on, drawn double round the emblem, shaded inside on the right, away from the light. */
function sunRing(p: Plate, c: Pt, r: number) {
  p.add(arc(c, r - 0.4, 0, 360), 'thin');
  p.add(arc(c, r - 2, 0, 360), 'hair');
  let h = '';
  for (let a = 20; a <= 160; a += 4) h += line(at(c, a, r - 2.6), at(c, a, r - 2.6 - 2.2 * Math.sin(rad(a))));
  p.add(h, 'hatch');
}

/** How far a ray out of the emblem at `a` runs before it meets the arch (its outer line), on a tall face. */
const reachRay = (c: Pt, a: number, g: TallLayout) => {
  const u = at([0, 0], a, 1);
  const { A, ro } = g.arch;
  const [fx, fy] = [c[0] - A[0], c[1] - A[1]];
  const b = fx * u[0] + fy * u[1];
  const t = -b + Math.sqrt(b * b - (fx * fx + fy * fy - ro * ro));
  // Below the springing, the arch's sides.
  if (c[1] + u[1] * t > A[1]) return (u[0] > 0 ? A[0] + ro - c[0] : A[0] - ro - c[0]) / u[0];
  return t;
};

/** How far a line out of `c` at `a` runs before it meets a hole, or null. */
const throughHole = (c: Pt, a: number, h: Hole) => {
  const u = at([0, 0], a, 1);
  const [fx, fy] = [c[0] - h.c[0], c[1] - h.c[1]];
  const b = fx * u[0] + fy * u[1];
  const disc = b * b - (fx * fx + fy * fy - h.r * h.r);
  return disc > 0 && -b - Math.sqrt(disc) > 0 ? -b - Math.sqrt(disc) : null;
};

/** The Azurite Vein in a row: its crystals rising at the row's far end. */
function veinRow(p: Plate, g: RowLayout) {
  const k = g.h / 110;
  const root: Pt = [g.w - 40 * k, g.h - 6];
  const P = (a: number, len: number, hw: number, phase: number, dx = 0): Prism => ({ root: [root[0] + dx * k, root[1]], a, len: len * k, hw: hw * k, phase });
  const prisms = [P(-34, 46, 4.2, 14, -6), P(34, 52, 4.4, 22, 6), P(-12, 70, 5.4, 40, -2), P(14, 92, 6.8, 18, 2), P(-50, 26, 3.4, 30, -10), P(4, 30, 3.8, 8, 0)];
  const ground: Pt[] = [
    [root[0] - 60, g.h - 9],
    [root[0] + 60, g.h - 9],
    [root[0] + 60, g.h + 30],
    [root[0] - 60, g.h + 30],
  ];
  cluster(p, prisms, { polys: [ground], holes: [] }, k);
}

/** The flare in a row, crowning the emblem: long pointed rays out of its glory. */
function flareRow(p: Plate, g: RowLayout) {
  const C = g.emblem;
  sunRing(p, C, 30);
  for (const a of [-120, -90, -60, 60, 90, 120, 0, 180]) {
    const u = at([0, 0], a, 1);
    const ends = [u[0] > 1e-9 ? (g.divider - 8 - C[0]) / u[0] : u[0] < -1e-9 ? (10 - C[0]) / u[0] : Infinity, u[1] > 1e-9 ? (g.h - 8 - C[1]) / u[1] : u[1] < -1e-9 ? (8 - C[1]) / u[1] : Infinity];
    const end = Math.min(...ends);
    const r0 = 30;
    if (end - r0 < 8) continue;
    const half = (Math.asin(2.4 / r0) * 180) / Math.PI;
    const ray = pointedRay(C, a, r0, end, half, 0.75);
    p.add(ray.lines, 'thin');
    p.add(ray.hatch, 'hatch');
    p.knockout += poly([at(C, a - half * 1.3, r0), at(C, a, end + 1.6), at(C, a + half * 1.3, r0)]);
  }
}

/** The backs: the find's own sign at the mandorla's heart, in its glory. */
function veinBack(p: Plate, g: BackLayout) {
  crystalSeal(p, g.c, g.row ? 11 : 19);
  // The glory sits back with the plate, not the motif.
  p.motif = false;
  crystalGlory(p, g.c, (deg) => g.room(deg) + 1, g.row);
  p.motif = true;
}
function flareBack(p: Plate, g: BackLayout) {
  burst(p, g.c, Math.min(g.room(0), g.row ? 26 : 44), { polys: [], holes: g.holes });
}

// ---- dynamite -------------------------------------------------------------------

/** Nitre, saltpetre, black powder's salt, `r` from its centre to its ends: a ring with an upright bar through it, the ring shaded inside on its right. */
function nitreSign(p: Plate, c: Pt, r: number) {
  const rr = r * 0.62;
  p.add(arc(c, rr, 0, 360) + line([c[0], c[1] - r], [c[0], c[1] + r]), 'sign');
  let h = '';
  for (let y = -rr + 0.9; y < rr - 0.6; y += 0.85) {
    const x = Math.sqrt(rr * rr - y * y) - 0.6;
    if (x > 1.4) h += line([c[0] + 0.9, c[1] + y], [c[0] + x, c[1] + y]);
  }
  p.add(h, 'hatch');
}

/** How far each of a shattered ring's twelve arcs is thrown out, as a share of the ring's radius. */
const THROWN = [0.02, 0.1, 0.05, 0.13, 0.03, 0.08, 0.11, 0.04, 0.12, 0.06, 0.09, 0.03];

/**
 * A ring blown apart, `r` across, about `c`: its double ring broken into
 * twelve arcs, each thrown straight out from the centre by its own amount;
 * then rings of shards flying out from the gaps, each a sliver pointing
 * away, hatched down one side, smaller the further out, as far as `room`
 * lets them (a shard whose point would leave it is left out). Shards and
 * arcs are kept clear of the plate.
 */
function shattered(p: Plate, c: Pt, r: number, room: (q: Pt) => boolean, rings = 3) {
  const n = THROWN.length;
  const gap = 360 / n;
  let arcs = '';
  let inner = '';
  let shade = '';
  for (let i = 0; i < n; i++) {
    const mid = (i + 0.5) * gap;
    const o = at(c, mid, r * THROWN[i]);
    const [a0, a1] = [i * gap + 3.2, (i + 1) * gap - 3.2];
    arcs += arc(o, r, a0, a1);
    inner += arc(o, r - 1.8, a0 + 0.4, a1 - 0.4);
    // Shaded inside on the right, away from the light.
    if (mid > 15 && mid < 165) for (let a = a0 + 2; a < a1 - 1; a += 3.4) shade += line(at(o, a, r - 2.4), at(o, a, r - 2.4 - 1.8 * Math.sin(rad(a))));
    p.knockout += poly([at(o, a0 - 1, r + 1.8), at(o, mid, r + 1.8), at(o, a1 + 1, r + 1.8), at(o, a1 + 1, r - 3.6), at(o, mid, r - 3.6), at(o, a0 - 1, r - 3.6)]);
  }
  p.add(arcs, 'thin');
  p.add(inner, 'hair');
  // The shards: out of each gap, then between, then out of the gaps again, smaller each ring.
  let edges = '';
  for (let k = 0; k < rings; k++) {
    const dist = r * (1.22 + 0.36 * k);
    const len = r * (0.26 - 0.05 * k);
    const half = Math.max(1.3, 2.4 - 0.4 * k) * (r / 60) ** 0.5;
    for (let i = 0; i < n; i++) {
      const a = i * gap + (k % 2 ? gap / 2 : 0) + (i % 2 ? 4 : -4) * (k + 1) * 0.5;
      const turn = (i % 3) * 7 - 7;
      const base = at(c, a, dist);
      const tip = at(base, a + turn, len);
      const [l, rt] = [at(base, a + turn - 90, half), at(base, a + turn + 90, half)];
      const back = at(base, a + turn + 180, len * 0.3);
      if (![tip, l, rt, back].every(room)) continue;
      edges += line(back, l) + line(l, tip) + line(tip, rt) + line(rt, back);
      shade += hatch(back, rt, tip, 0.7);
      p.knockout += poly(grow([back, l, tip, rt], 1.3));
    }
  }
  p.add(edges, 'hair');
  p.add(shade, 'hatch');
}

/** Whether `q` lies inside the convex polygon `ps`. */
const inside = (q: Pt, ps: Pt[]) => inPoly(q, [q[0] + 1e-3, q[1] + 1e-3], ps) !== null;

/** The Dynamite Cache crowning the emblem: a ring blown apart round it, its shards out through the arch. */
function dynamiteTall(p: Plate, g: TallLayout) {
  const k = g.w / 218;
  const ped = grow(pedestal(g), 2);
  // Clear of the small ring in Sol's place (and its shards) and the sign in Luna's.
  const clear = [
    { c: g.sol.c, r: SMALL_RING * k * 1.95 + 3 },
    { c: g.luna.c, r: g.luna.r + 4 },
  ];
  const room = (q: Pt) =>
    q[0] > g.inner[0] + 2 && q[0] < g.inner[2] - 2 && q[1] > g.inner[1] + 2 && q[1] < g.pedestal.capTop - 6 && !inside(q, ped) && clear.every((h) => Math.hypot(q[0] - h.c[0], q[1] - h.c[1]) > h.r);
  shattered(p, g.emblem, 58 * k, room);
}

/** The Dynamite Cache in a row: the ring blown apart round the emblem. */
function dynamiteRow(p: Plate, g: RowLayout) {
  const room = (q: Pt) => q[0] > 9 && q[0] < g.divider - 7 && q[1] > 7 && q[1] < g.h - 7;
  shattered(p, g.emblem, 29, room, 2);
}

function dynamiteBack(p: Plate, g: BackLayout) {
  const r = g.row ? 13 : 24;
  nitreSign(p, g.c, r * 0.55);
  const room = (q: Pt) => g.room(((Math.atan2(q[0] - g.c[0], g.c[1] - q[1]) * 180) / Math.PI + 360) % 360) > Math.hypot(q[0] - g.c[0], q[1] - g.c[1]) && g.holes.every((h) => Math.hypot(q[0] - h.c[0], q[1] - h.c[1]) > h.r);
  shattered(p, g.c, r, room, g.row ? 1 : 2);
}

// ---- the spandrels ------------------------------------------------------------

/** How far a flare's burst in Sol's place reaches, on a card 218 wide. */
const BURST = 30;
/** How wide the ring blown apart in Sol's place is, on a card 218 wide. */
const SMALL_RING = 14;

/** The outlines of a burst's pointed rays, for the plate to stop short of. */
const rayShadows = (c: Pt, r: number) =>
  Array.from({ length: 16 }, (_, i) => {
    const a = i * 22.5;
    const len = i % 4 === 0 ? r : i % 2 === 0 ? r * 0.78 : r * 0.6;
    const w = i % 4 === 0 ? 3.4 : 2.8;
    return poly([at(at(c, a, r * 0.3), a - 90, w), at(c, a, len + 1.5), at(at(c, a, r * 0.3), a + 90, w)]);
  }).join('');

/** A disc, as path data. */
const disc = (c: Pt, r: number) => `M${pt([c[0] + r, c[1]])}A${r} ${r} 0 1 1 ${pt([c[0] - r, c[1]])}A${r} ${r} 0 1 1 ${pt([c[0] + r, c[1]])}Z`;

/** The spandrels of a find's tall face: its seal in Sol's place, its alchemical sign in Luna's. */
function spandrels(kind: FindKind, p: Plate, sol: Hole, luna: Hole, w: number) {
  const k = w / 218;
  if (kind === 'azurite') {
    crystalSeal(p, sol.c, sol.r * 0.92);
    copperSign(p, luna.c, luna.r * 0.82);
  } else if (kind === 'flare') {
    // So large it breaks the arch: the plate stops short of its heart, its fine rays and each pointed ray.
    const r = BURST * k;
    burst(p, sol.c, r);
    p.knockout += disc(sol.c, r * 0.62 + 1.2) + rayShadows(sol.c, r);
    sulphurSign(p, luna.c, luna.r * 0.82);
  } else {
    // A flash at its heart; its shards fly out over the panel, clear of the plaque over the keystone.
    const r = SMALL_RING * k;
    const room = (q: Pt) => Math.hypot(q[0] - sol.c[0], q[1] - sol.c[1]) < r * 2 && q[0] > 12 && q[1] > 12 && !(q[1] < 30 && Math.abs(q[0] - w / 2) < 52);
    shattered(p, sol.c, r, room, 2);
    p.star(sol.c, r * 0.42);
    nitreSign(p, luna.c, luna.r * 0.82);
  }
}

// ---- the variants ---------------------------------------------------------------

/** The plate of a find's card. */
export function findVariant(kind: FindKind): Variant {
  const v: Variant = { spandrels: (p, sol, luna, w) => spandrels(kind, p, sol, luna, w) };
  if (kind === 'azurite') {
    v.back = veinBack;
    v.glory = crystalGlory;
  }
  if (kind === 'flare') {
    v.back = flareBack;
    v.glory = burstGlory;
  }
  if (kind === 'dynamite') v.back = dynamiteBack;
  v.face = (p, g) => {
    if (kind === 'azurite') {
      if (g.row) veinRow(p, g);
      else veinTall(p, g);
    } else if (kind === 'flare') {
      if (g.row) flareRow(p, g);
      else flareTall(p, g);
    } else if (g.row) dynamiteRow(p, g);
    else dynamiteTall(p, g);
  };
  return v;
}

// ---- the cave-in mark -----------------------------------------------------------

/**
 * The Azurite Vein's cave-in, as a small mark beside the depth its card asks
 * (ChooseCategory): a mine's arch with its keystone gone, the break jagged
 * either side, and two stones falling into the dark mouth (the two lives a
 * miss costs), each hatched down the side turned from the light, the mouth
 * shaded by level lines that stop short of them. In a box 20 × 16 round the
 * foot of the arch's middle.
 */
export const CAVE_IN_MARK = (() => {
  const c: Pt = [0, 6];
  const [ri, ro] = [6.4, 8.6];
  const gap = 15;
  // A wedge of the arch between `a0` and `a1`, moved by `d` and turned `turn` degrees about its middle.
  const wedge = (a0: number, a1: number, d: Pt, turn: number): Pt[] => {
    const ps = [at(c, a0, ro), at(c, a1, ro), at(c, a1, ri), at(c, a0, ri)];
    const m = centroid(ps);
    const [s, co] = [Math.sin(rad(turn)), Math.cos(rad(turn))];
    return ps.map(([x, y]) => [m[0] + (x - m[0]) * co - (y - m[1]) * s + d[0], m[1] + (x - m[0]) * s + (y - m[1]) * co + d[1]] as Pt);
  };
  const key = wedge(-gap + 2, gap - 2, [0.4, 5.4], 16);
  const chip = wedge(-gap - 2, -gap + 7, [-0.6, 7.6], -28).map((q) => lerp(centroid(wedge(-gap - 2, -gap + 7, [-0.6, 7.6], -28)), q, 0.62));
  const stones = [key, chip];
  const shields: Shields = { polys: stones.map((ps) => grow(ps, 0.7)), holes: [] };
  let main = '';
  // The arch, broken at the top where its keystone fell.
  for (const r of [ri, ro]) main += arc(c, r, -90, -gap) + arc(c, r, gap, 90);
  // Its stones' joints, and the jagged break either side of the gap.
  for (const a of [-62, -36, 36, 62]) main += line(at(c, a, ri), at(c, a, ro));
  for (const side of [-1, 1]) {
    const jag = [at(c, side * gap, ri), at(c, side * (gap + 3), ri + 0.8), at(c, side * (gap - 1.5), ri + 1.4), at(c, side * (gap + 2.5), ro - 0.5), at(c, side * gap, ro)];
    main += `M${jag.map(pt).join('L')}`;
  }
  // The ground either side of the mouth.
  main += line([-9.8, 6], [-ro - 0.4, 6]) + line([ro + 0.4, 6], [9.8, 6]);
  // The falling stones.
  for (const ps of stones) main += poly(ps);
  // Shading: the dark of the mouth in level lines, stopping short of the stones.
  let shade = '';
  for (let y = -1.4; y < 5.6; y += 1.1) {
    const half = Math.sqrt(Math.max(0, ri * ri - (c[1] - y) ** 2)) - 0.7;
    if (half > 1) shade += seg([-half, y], [half, y], shields);
  }
  // Each stone hatched down the side turned from the light (the lower right).
  let hatching = '';
  for (const ps of stones) {
    const [a, b, cc, d] = ps;
    hatching += hatchQuad(lerp(a, b, 0.5), b, cc, lerp(d, cc, 0.5), 0.55);
  }
  return { box: '-10 -4.5 20 12', main, shade, hatch: hatching };
})();
