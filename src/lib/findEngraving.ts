// The engraved plates of Delve's finds (ChooseCategory): an Azurite Vein,
// a Flare Cache and a Dynamite Cache. They are the category cards'
// plates (lib/cardEngraving), cut by the same hand in the same way
// (docs/arcane-style.md: exact geometry, one-sided hatching, lines stopping
// short of what they meet, a soft glow under them), with parts redrawn as a
// Variant. What sets them apart is engraved, never painted: the motif and
// the tint the card gives the ink (ChooseCategory).
//
// Each crowns the emblem: what the plain card has as its glory of rays is
// made into the find, and breaks out through the arch, whose lines stop
// short of it, as the band's rings stop at a seal.
//
// • Azurite Vein: seven hexagonal prisms fanned out from behind the
//   pedestal, each computed from its section, hatched down the faces turned
//   from the light (the upper left, as on the rest of the plate), the inner
//   ones standing in front. The back holds a crystal seen end on, in a glory
//   that ends on a hexagon.
// • Flare Cache: the emblem in a sun, a double ring with pointed rays,
//   hatched down one side, long and short in turn, the long ones out to the
//   panel; the glory behind it a burst of fine rays in three lengths. The
//   back holds a flare's burst about the sign of fire.
// • Dynamite Cache: the emblem in a ring blown apart, its arcs thrown out
//   each its own way, shards flying out between them in rings, the outer
//   ones out through the arch. The back holds nitre, black powder's salt,
//   in a ring blown apart.
//
// Laid in a row (phones) the same, round the emblem at the row's start.

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

// ---- the faces ------------------------------------------------------------------

/** Where a prism out of `root` toward `a` meets a circle about `c` of radius `r` (how long it is to there). */
const reachCircle = (root: Pt, a: number, c: Pt, r: number) => {
  const u = at([0, 0], a, 1);
  const fx = root[0] - c[0];
  const fy = root[1] - c[1];
  const b = fx * u[0] + fy * u[1];
  return -b + Math.sqrt(b * b - (fx * fx + fy * fy - r * r));
};

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

/** The Azurite Vein crowning the emblem: prisms fanned out from behind the pedestal, each breaking out through the arch. */
function veinTall(p: Plate, g: TallLayout) {
  const k = g.w / 218;
  const root: Pt = [g.arch.A[0], g.pedestal.capTop - 4];
  const out = g.arch.ro + 7 * k;
  const P = (a: number, hw: number, phase: number, over = 0): Prism => ({ root, a, len: reachCircle(root, a, g.arch.A, out + over * k), hw: hw * k, phase });
  // Outer first, so the inner stand in front.
  const prisms = [P(-74, 6, 20), P(74, 6, 160), P(-52, 7.4, 10), P(52, 7.4, 170), P(-32, 8.6, 25, -2), P(32, 8.6, 155, -2), P(0, 10, 90, -14)];
  const ped = pedestal(g);
  cluster(p, prisms, { polys: [ped], holes: [g.sol, g.luna].map((h) => ({ c: h.c, r: h.r + 3 })) }, k, ped[0][1]);
}

/** The flare crowning the emblem: long pointed rays out of the glory, breaking out through the arch to the panel, short ones between. */
function flareTall(p: Plate, g: TallLayout) {
  const k = g.w / 218;
  const C = g.emblem;
  const holes = [g.sol, g.luna].map((h) => ({ c: h.c, r: h.r + 3 }));
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

/** The Azurite Vein in a row, crowning the emblem: prisms fanned out behind it. */
function veinRow(p: Plate, g: RowLayout) {
  const k = g.h / 110;
  const root: Pt = [g.emblem[0], g.h - 4];
  const P = (a: number, len: number, hw: number, phase: number): Prism => ({ root, a, len: len * k, hw: hw * k, phase });
  cluster(p, [P(-66, 62, 4.4, 20), P(66, 62, 4.4, 40), P(-40, 84, 5.2, 10), P(40, 84, 5.2, 30), P(-16, 96, 6, 25), P(16, 96, 6, 5)], NONE, k);
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
  const room = (q: Pt) =>
    q[0] > g.inner[0] + 2 && q[0] < g.inner[2] - 2 && q[1] > g.inner[1] + 2 && q[1] < g.pedestal.capTop - 6 && !inside(q, ped) && [g.sol, g.luna].every((h) => Math.hypot(q[0] - h.c[0], q[1] - h.c[1]) > h.r + 4);
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

// ---- the variants ---------------------------------------------------------------

/** The plate of a find's card. */
export function findVariant(kind: FindKind): Variant {
  const v: Variant = {};
  if (kind === 'azurite') v.back = veinBack;
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
