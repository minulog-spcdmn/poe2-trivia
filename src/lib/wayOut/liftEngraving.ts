// The Lift's plate (see lift.ts): the mine's cage, hoisted out of the shaft,
// cut into the category card's plate (lib/cardEngraving) by the hand that cut
// the finds' (lib/findEngraving): exact geometry, one-sided hatching, lines
// stopping short of what stands in front of them, nothing painted.
//
// • The face: the headframe's wheel high in the arch, breaking out through
//   it at the upper right, its axle on an iron girder bedded in the arch's
//   left side. Over it runs the hoist chain, link by computed link, each
//   link seen flat and the next edge on, in turn, the edge-on link over the
//   one above it and under the one below. It drops from the wheel's left to
//   a ring, and from the ring a bridle of two chains holds the cage, which
//   hangs where an emblem would, in the window's light. The cage: corner
//   posts and three bands, riveted, bars above and a scissor gate below; its
//   right side and roof seen a little from above, the side in shade; a
//   miner's lamp hangs inside, its light kept clear of the shading and
//   shining out between the bars. From the wheel's right a second chain
//   lets down the counterweight, a stack of iron plates; two timber guides
//   run down past the cage, which they hold by its shoes, to the plinth,
//   which is the shaft's collar.
// • The spandrels: Sol, the daylight at the top of the shaft, keeps his
//   place; in Luna's, sublimation, what rises clear while the dross stays.
// • The back: the wheel at the mandorla's heart, in the glory.
// • In a row (phones): the wheel, the cage and the weight beside the name.

import { SUBLIMATION } from '../alchemy.ts';
import { arc, at, lerp, line, pt, type Cut, type Hole, type Pt } from '../arcane.ts';
import { inBox, transform, type BackLayout, type Plate, type RowLayout, type TallLayout, type Variant } from '../cardEngraving.ts';

// ---- geometry -------------------------------------------------------------------

const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
const dot = (p: Pt, q: Pt) => p[0] * q[0] + p[1] * q[1];
const centroid = (ps: Pt[]): Pt => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
const poly = (ps: Pt[]) => `M${ps.map(pt).join('L')}Z`;
const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
/** A band `w` either side of the line from `a` to `z`, as a polygon. */
const strip = (a: Pt, z: Pt, w: number): Pt[] => {
  const len = Math.hypot(z[0] - a[0], z[1] - a[1]);
  const n: Pt = [(-(z[1] - a[1]) / len) * w, ((z[0] - a[0]) / len) * w];
  return [
    [a[0] + n[0], a[1] + n[1]],
    [z[0] + n[0], z[1] + n[1]],
    [z[0] - n[0], z[1] - n[1]],
    [a[0] - n[0], a[1] - n[1]],
  ];
};
/** A disc, as path data. */
const disc = (c: Pt, r: number) => `M${pt([c[0] + r, c[1]])}A${r} ${r} 0 1 1 ${pt([c[0] - r, c[1]])}A${r} ${r} 0 1 1 ${pt([c[0] + r, c[1]])}Z`;

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

/** What a line stops short of: convex shapes standing in front of it, and discs. */
type Shields = { polys: Pt[][]; holes: Hole[] };
const NONE: Shields = { polys: [], holes: [] };
const join = (...s: Shields[]): Shields => ({ polys: s.flatMap((x) => x.polys), holes: s.flatMap((x) => x.holes) });
/** A straight line, broken where it passes behind a shield. */
const seg = (p: Pt, q: Pt, s: Shields = NONE) =>
  line(p, q, { holes: s.holes, cuts: s.polys.map((ps) => inPoly(p, q, ps)).filter((c): c is Cut => !!c) });
/** A polyline, broken where it passes behind a shield. */
const segs = (ps: Pt[], s: Shields = NONE) => ps.slice(1).map((q, i) => seg(ps[i], q, s)).join('');

/** Where the light falls from: the upper left, as on the rest of the plate. */
const LIGHT: Pt = [-0.6, -0.8];

// ---- the wheel ------------------------------------------------------------------

/**
 * The headframe's sheave, `R` across, about `W`: a rim of three rings (its
 * flange, the groove's lip and its inner edge), the band between them shaded
 * where it turns from the light; a hub with a ring of bolts round the axle;
 * and `n` tapered spokes, each shaded down the side away from the light.
 */
function wheel(p: Plate, W: Pt, R: number, k: number, n: number, turn: number, s: Shields = NONE) {
  const [rg, ri] = [R - 1.3 * k, R - 3.6 * k];
  const rh = Math.max(3.4 * k, R * 0.2);
  const rb = rh * 0.6;
  const ring = (r: number) => segs(Array.from({ length: 121 }, (_, i) => at(W, i * 3, r)), s);
  p.add(ring(R) + ring(ri) + ring(rh), 'thin');
  p.add(ring(rg) + ring(rb), 'hair');
  // The rim's band and the hub's, shaded on the lower right.
  let shade = '';
  const band = (r0: number, r1: number, step: number) => {
    for (let a = 0; a < 360; a += step) {
      const dark = -dot(at([0, 0], a, 1), LIGHT);
      if (dark < 0.2) continue;
      shade += seg(at(W, a, r0 + 0.5 * k), at(W, a, r0 + 0.5 * k + (r1 - r0 - 1 * k) * Math.min(1, dark * 1.15)), s);
    }
  };
  band(ri, rg, (1.5 * k * 180) / (Math.PI * R));
  band(rb, rh, (1.2 * k * 180) / (Math.PI * rh));
  // The axle, and the bolts round it.
  let dots = disc(W, 0.9 * k);
  for (let i = 0; i < 6; i++) dots += disc(at(W, i * 60 + 30, (rb + rh) / 2), 0.36 * k);
  p.add(dots, 'fill');
  // The spokes, from the hub to the rim, narrowing.
  let edges = '';
  for (let i = 0; i < n; i++) {
    const a = turn + (i * 360) / n;
    const u = at([0, 0], a, 1);
    const nn = at([0, 0], a + 90, 1);
    const [w0, w1] = [1.5 * k, 0.95 * k];
    const [s0, s1] = [Math.sqrt(rh * rh - w0 * w0), Math.sqrt(ri * ri - w1 * w1)];
    const P = (along: number, across: number): Pt => [W[0] + u[0] * along + nn[0] * across, W[1] + u[1] * along + nn[1] * across];
    for (const side of [-1, 1]) edges += seg(P(s0, side * w0), P(s1, side * w1), s);
    // The side turned from the light.
    const side = -dot(nn, LIGHT) > 0 ? 1 : -1;
    shade += seg(P(s0 + 0.9 * k, side * w0 * 0.45), P(s1 - 0.9 * k, side * w1 * 0.45), s);
  }
  p.add(edges, 'hair');
  p.add(shade, 'hatch');
}

// ---- chains ---------------------------------------------------------------------

/** A chain link's half width, half length and the thickness of its iron, at scale 1. */
const LINK = { a: 1.85, b: 3.3, t: 0.85, e: 0.48 };

/**
 * A chain from `from` toward `to`, as many links as fit: flat and edge on in
 * turn (`phase` picks which comes first), each edge-on link passing over the
 * end of the flat link before it and under the next. Flat links are shaded
 * down the side away from the light. Returns the strip it covers.
 */
function chain(p: Plate, from: Pt, to: Pt, k: number, s: Shields = NONE, phase = 0) {
  // As many links as reach from end to end, drawn a hair closer or looser to fit, an edge-on link at each end where `phase` puts one first.
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const u: Pt = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
  const n: Pt = [-u[1], u[0]];
  const [a, b, t, e] = [LINK.a * k, LINK.b * k, LINK.t * k, LINK.e * k];
  const gap = 0.35 * k;
  const ideal = (len - 2 * b) / (2 * (b - t)) + 1;
  let count = Math.max(1, Math.round(ideal));
  if (phase === 1 && count % 2 === 0) count = Math.max(1, count + (ideal > count ? 1 : -1));
  const pitch = count > 1 ? (len - 2 * b) / (count - 1) : 0;
  const m = b - a;
  const L = (x: number, y: number): Pt => [from[0] + n[0] * x + u[0] * y, from[1] + n[1] * x + u[1] * y];
  /** An arc of radius `r` about (0, `y`) in the link's frame, from `f0` to `f1` degrees (0 across, 90 along). */
  const arcL = (y: number, r: number, f0: number, f1: number) => {
    const steps = Math.max(2, Math.ceil(Math.abs(f1 - f0) / 12));
    return segs(
      Array.from({ length: steps + 1 }, (_, i) => {
        const f = ((f0 + ((f1 - f0) * i) / steps) * Math.PI) / 180;
        return L(r * Math.cos(f), y + r * Math.sin(f));
      }),
      s,
    );
  };
  let outer = '';
  let inner = '';
  let shade = '';
  // The side of a flat link turned from the light.
  const dark = -dot(n, LIGHT) > 0 ? 1 : -1;
  for (let j = 0; j < count; j++) {
    const y = b + j * pitch;
    const next = j + 1 < count;
    if ((j + phase) % 2 === 0) {
      for (const [r, into] of [
        [a, 'o'],
        [a - t, 'i'],
      ] as const) {
        const d = next ? (Math.asin(Math.min(1, (e + gap) / r)) * 180) / Math.PI : 0;
        const path =
          seg(L(-r, y - m), L(-r, y + m), s) +
          seg(L(r, y - m), L(r, y + m), s) +
          arcL(y + m, r, 0, 90 - d) +
          arcL(y + m, r, 90 + d, 180) +
          arcL(y - m, r, 180, 360);
        if (into === 'o') outer += path;
        else inner += path;
      }
      shade += seg(L(dark * (a - t / 2), y - m - 0.3 * k), L(dark * (a - t / 2), y + m + 0.3 * k), s);
    } else {
      // Edge on: under the next flat link's near end.
      const yn = y + pitch - m;
      const cut: [number, number] = [yn - Math.sqrt(a * a - e * e) - gap, yn - Math.sqrt(Math.max(0, (a - t) ** 2 - e * e)) + gap];
      const [y0, y1] = [y - b + e, y + b - e];
      for (const x of [-e, e]) {
        if (next) outer += seg(L(x, y0), L(x, cut[0]), s) + seg(L(x, cut[1]), L(x, y1), s);
        else outer += seg(L(x, y0), L(x, y1), s);
      }
      outer += arcL(y0, e, 180, 360) + arcL(y1, e, 0, 180);
    }
  }
  p.add(outer, 'thin');
  p.add(inner, 'hair');
  p.add(shade, 'hatch');
  const end = b + (count - 1) * pitch + b;
  return { strip: [L(-a - 0.9 * k, -0.5 * k), L(a + 0.9 * k, -0.5 * k), L(a + 0.9 * k, end + 0.5 * k), L(-a - 0.9 * k, end + 0.5 * k)], end: L(0, end) };
}

/**
 * A ring of iron `r` across, its wire `w` thick, the chains' edge-on links
 * passing over it at the headings `over`; its wire shaded on the lower right.
 */
function ringAt(p: Plate, c: Pt, r: number, w: number, k: number, over: number[]) {
  const holes = over.flatMap((a) => [at(c, a, r), at(c, a, r - w)]).map((q) => ({ c: q, r: (LINK.e + 0.35) * k }));
  p.add(arc(c, r, -180, 180, { holes }), 'thin');
  p.add(arc(c, r - w, -180, 180, { holes }), 'hair');
  let h = '';
  for (let a = 70; a <= 210; a += 20) if (over.every((o) => Math.abs(((a - o + 540) % 360) - 180) > 30)) h += line(at(c, a, r - 0.25 * w), at(c, a, r - 0.7 * w));
  p.add(h, 'hatch');
}
/** The heading from `c` to `q`, clockwise from the top. */
const heading = (c: Pt, q: Pt) => (Math.atan2(q[0] - c[0], -(q[1] - c[1])) * 180) / Math.PI;

// ---- the cage -------------------------------------------------------------------

type Cage = { x: number; y0: number; y1: number; hw: number; dx: number; dy: number };

/** The cage's outline (front, side and roof), for what stands behind it. */
const cageHull = (c: Cage): Pt[] => {
  const [x0, x1] = [c.x - c.dx / 2 - c.hw, c.x - c.dx / 2 + c.hw];
  return [
    [x0, c.y0],
    [x0 + c.dx, c.y0 - c.dy],
    [x1 + c.dx, c.y0 - c.dy],
    [x1 + c.dx, c.y1 - c.dy],
    [x1, c.y1],
    [x0, c.y1],
  ];
};

/**
 * The cage, its front `hw` either side of `x` less half its depth, seen a
 * little from above and the left, so its roof and right side show (the side
 * `dx` deep, rising `dy`). Returns where the bridle takes hold of the roof.
 */
function cage(p: Plate, c: Cage, k: number) {
  const { y0, y1, dx, dy } = c;
  const fc = c.x - dx / 2;
  const [x0, x1] = [fc - c.hw, fc + c.hw];
  const H = y1 - y0;
  const bh = 2.6 * k;
  const pw = 2.4 * k;
  const yg = y0 + H * 0.56;
  const bands: [number, number][] = [
    [y0, y0 + bh],
    [yg - bh / 2, yg + bh / 2],
    [y1 - bh, y1],
  ];
  const back = (q: Pt): Pt => [q[0] + dx, q[1] - dy];
  let main = '';
  let hair = '';
  let hatch = '';
  let dots = '';
  // The front's outline, the roof and the side.
  main += poly([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);
  main += segs([[x0, y0], back([x0, y0]), back([x1, y0]), back([x1, y1]), [x1, y1]]);
  // The corner posts, and the bands between them, riveted.
  hair += line([x0 + pw, y0 + bh], [x0 + pw, y1 - bh]) + line([x1 - pw, y0 + bh], [x1 - pw, y1 - bh]);
  for (const [ya, yb] of bands) {
    for (const yy of [ya, yb]) if (yy !== y0 && yy !== y1) hair += line([x0 + pw, yy], [x1 - pw, yy]);
    // Round the side, where the band runs back.
    for (const yy of [ya, yb]) if (yy !== y0 && yy !== y1) hair += line([x1, yy], back([x1, yy]));
    const ym = (ya + yb) / 2;
    const n = Math.round((x1 - x0) / (5.2 * k));
    for (let i = 0; i <= n; i++) dots += disc([x0 + pw / 2 + ((x1 - x0 - pw) * i) / n, ym], 0.42 * k);
  }
  // The back post, seen down the side.
  hair += line(back([x1 - pw * 0.7, y0 + bh * 0.4]), back([x1 - pw * 0.7, y1 - bh * 0.4]));
  // The bars above the gate, rods shaded on their right.
  const bars = [-0.56, -0.28, 0.28, 0.56].map((f) => fc + f * c.hw);
  const rod = 0.95 * k;
  for (const bx of bars) {
    main += line([bx, y0 + bh], [bx, yg - bh / 2]);
    hair += line([bx + rod, y0 + bh], [bx + rod, yg - bh / 2]);
  }
  // The roof: its boards run back, lit.
  for (const f of [0.25, 0.5, 0.75]) {
    const q = lerp([x0, y0], [x1, y0], f);
    hair += line([q[0] + 0.6 * k, q[1] - 0.4 * k], back(q));
  }
  // The side, in shade: upright strokes, short of the bands.
  const sideBands = bands.flatMap(([ya, yb]) => [ya, yb]).filter((yy) => yy !== y0 && yy !== y1);
  for (let f = 0.12; f < 0.97; f += 0.13) {
    const xs = x1 + dx * f;
    const lift = dy * f;
    const cuts: Cut[] = sideBands.map((yy) => {
      const t = (yy - lift - (y0 - lift)) / H;
      return [t - (0.5 * k) / H, t + (0.5 * k) / H];
    });
    if (Math.abs(f - (1 - (pw * 0.7) / dx)) < 0.07) continue;
    hatch += line([xs, y0 - lift + 0.5 * k], [xs, y1 - lift - 0.5 * k], { cuts });
  }
  // The lamp, hanging inside from the lintel, its light about it.
  const lamp: Pt = [fc, y0 + bh + (yg - bh / 2 - y0 - bh) * 0.52];
  const rl = (yg - bh / 2 - y0 - bh) * 0.5 + 1.2 * k;
  // The dark inside, in level strokes behind the bars, short of the light.
  const barShields: Shields = { polys: bars.map((bx) => box(bx - 0.5 * k, y0, bx + rod + 0.5 * k, y1)), holes: [] };
  // Every other stroke stops further from the light, so its edge is soft.
  let i = 0;
  for (let y = y0 + bh + 1.1 * k; y < yg - bh / 2 - 0.6 * k; y += 1.15 * k, i++)
    hatch += seg([x0 + pw + 0.6 * k, y], [x1 - pw - 0.6 * k, y], { ...barShields, holes: [{ c: lamp, r: rl + (i % 2) * 2.4 * k }] });
  lantern(p, lamp, k * 1.3, y0 + bh);
  // Rays from the lamp, out between the bars.
  let rays = '';
  for (let i = 0; i < 24; i++) {
    const a = i * 15 + 7.5;
    if (Math.abs(((a + 180) % 360) - 180) < 30) continue;
    rays += seg(at(lamp, a, 7 * k), at(lamp, a, i % 2 ? rl * 0.75 : rl - 0.6 * k), barShields);
  }
  p.add(rays, 'hatch');
  // The scissor gate below: a lattice of diamonds, riveted where its bars cross.
  const gate: [number, number, number, number] = [x0 + pw, yg + bh / 2, x1 - pw, y1 - bh];
  const [gw, gh] = [gate[2] - gate[0], gate[3] - gate[1]];
  const cols = 4;
  const lattice: [Pt, Pt][] = [];
  const P = gw / cols;
  const Q = gh / 2;
  for (let j = -cols; j <= 2 * cols; j++)
    for (const sgn of [1, -1]) {
      // Through (gate left + j P, gate top), going (P / 2, Q / 2) per half diamond, mirrored for sgn.
      const o: Pt = [gate[0] + j * P, sgn > 0 ? gate[1] : gate[3]];
      const q: Pt = [o[0] + P * 4, o[1] + sgn * Q * 4];
      const inside = inBox(lerp(o, q, -1), q, gate);
      if (!inside) continue;
      const a = lerp(lerp(o, q, -1), q, inside[0]);
      const z = lerp(lerp(o, q, -1), q, inside[1]);
      if (Math.hypot(z[0] - a[0], z[1] - a[1]) > 0.8 * k) {
        hair += line(a, z);
        lattice.push([a, z]);
      }
    }
  // The dark behind the gate, level strokes short of its bars.
  const latticeShields: Shields = { polys: lattice.map(([a, z]) => strip(a, z, 0.55 * k)), holes: [] };
  for (let y = gate[1] + 1.1 * k; y < gate[3] - 0.6 * k; y += 1.15 * k) hatch += seg([gate[0] + 0.6 * k, y], [gate[2] - 0.6 * k, y], latticeShields);
  for (let i = 0; i <= 2 * cols; i++)
    for (let j = 0; j <= 2; j++) {
      if ((i + j) % 2) continue;
      dots += disc([gate[0] + (i * P) / 2, gate[1] + (j * Q) / 1], 0.4 * k);
    }
  p.add(main, 'thin');
  p.add(hair, 'hair');
  p.add(hatch, 'hatch');
  p.add(dots, 'fill');
  p.knockout += poly(grow(cageHull(c), 1.2 * k));
  return { lugs: [back([x0 + c.hw * 0.4, y0]).map((v, i) => (v + [x0 + c.hw * 0.4, y0][i]) / 2) as Pt, back([x1 - c.hw * 0.4, y0]).map((v, i) => (v + [x1 - c.hw * 0.4, y0][i]) / 2) as Pt] };
}

/** A miner's lantern about `c`, hung from `top`: a loop, a cap, the glass with its flame, a foot. */
function lantern(p: Plate, c: Pt, k: number, top: number) {
  const [cx, cy] = c;
  let thin = '';
  let hair = '';
  hair += line([cx, top], [cx, cy - 5.6 * k]);
  hair += arc([cx, cy - 4.8 * k], 0.8 * k, 0, 360);
  thin += poly([
    [cx - 1.1 * k, cy - 4 * k],
    [cx + 1.1 * k, cy - 4 * k],
    [cx + 2.5 * k, cy - 2.7 * k],
    [cx - 2.5 * k, cy - 2.7 * k],
  ]);
  thin += line([cx - 2.1 * k, cy - 2.7 * k], [cx - 2.1 * k, cy + 2.6 * k]) + line([cx + 2.1 * k, cy - 2.7 * k], [cx + 2.1 * k, cy + 2.6 * k]);
  thin += poly([
    [cx - 2.5 * k, cy + 2.6 * k],
    [cx + 2.5 * k, cy + 2.6 * k],
    [cx + 1.7 * k, cy + 3.7 * k],
    [cx - 1.7 * k, cy + 3.7 * k],
  ]);
  p.add(thin, 'thin');
  p.add(hair, 'hair');
  // The flame: a pointed leaf of two arcs.
  const [ft, fb, fw] = [cy - 1.8 * k, cy + 1.6 * k, 0.75 * k];
  const half = (fb - ft) / 2;
  const r = (half * half + fw * fw) / (2 * fw);
  p.add(`M${pt([cx, ft])}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${pt([cx, fb])}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${pt([cx, ft])}Z`, 'fill');
  p.add(line([cx + 1.2 * k, cy - 2.6 * k + 0.5 * k], [cx + 2.4 * k, cy - 2.6 * k + 0.5 * k]) + line([cx + 1.5 * k, cy + 2.6 * k + 0.5 * k], [cx + 2 * k, cy + 2.6 * k + 0.5 * k]), 'hatch');
}

// ---- the counterweight ------------------------------------------------------------

/** The counterweight: a stack of iron plates on a tie rod, `hw` either side of `x`, seen as the cage is; shaded on its side. */
function weight(p: Plate, x: number, top: number, bottom: number, hw: number, dx: number, dy: number, k: number) {
  const fc = x - dx / 2;
  const [x0, x1] = [fc - hw, fc + hw];
  const back = (q: Pt): Pt => [q[0] + dx, q[1] - dy];
  let main = poly([
    [x0, top],
    [x1, top],
    [x1, bottom],
    [x0, bottom],
  ]);
  main += segs([[x0, top], back([x0, top]), back([x1, top]), back([x1, bottom]), [x1, bottom]]);
  let hair = '';
  let hatch = '';
  const plates = Math.max(3, Math.round((bottom - top) / (4.2 * k)));
  for (let i = 1; i < plates; i++) {
    const y = top + ((bottom - top) * i) / plates;
    hair += line([x0, y], [x1, y]) + line([x1, y], back([x1, y]));
  }
  // The side in shade, the front's lower edge of each plate shaded.
  for (let f = 0.2; f < 0.95; f += 0.2) {
    const cuts: Cut[] = Array.from({ length: plates - 1 }, (_, i) => {
      const t = (i + 1) / plates;
      return [t - (0.4 * k) / (bottom - top), t + (0.4 * k) / (bottom - top)];
    });
    hatch += line([x1 + dx * f, top - dy * f + 0.5 * k], [x1 + dx * f, bottom - dy * f - 0.5 * k], { cuts });
  }
  for (let i = 0; i < plates; i++) {
    const y = top + ((bottom - top) * (i + 1)) / plates - 0.75 * k;
    hatch += line([x0 + 0.8 * k, y], [x1 - 0.8 * k, y]);
  }
  // The tie rod's nut on top.
  const nut = box(fc + dx / 2 - 1.3 * k, top - dy / 2 - 1.6 * k, fc + dx / 2 + 1.3 * k, top - dy / 2);
  main += poly(nut);
  p.add(main, 'thin');
  p.add(hair, 'hair');
  p.add(hatch, 'hatch');
  p.knockout += poly(grow([[x0, top], back([x0, top]), back([x1, top]), back([x1, bottom]), [x1, bottom], [x0, bottom]], 1.2 * k));
}

// ---- the girder and the guides -----------------------------------------------------

/**
 * An iron girder from `x0` to `x1` about the level `y`, `h` deep: flanged
 * chords and a lattice web between them, the lower flange in shade. `x0at`
 * gives where it starts at each height (bedded in the arch).
 */
function girder(p: Plate, x0at: (y: number) => number, x1: number, y: number, h: number, k: number, s: Shields) {
  const [t, b] = [y - h / 2, y + h / 2];
  const fl = 1.1 * k;
  let thin = '';
  let hair = '';
  let hatch = '';
  thin += seg([x0at(t), t], [x1, t], s) + seg([x0at(b), b], [x1, b], s);
  hair += seg([x0at(t + fl), t + fl], [x1, t + fl], s) + seg([x0at(b - fl), b - fl], [x1, b - fl], s);
  const [wt, wb] = [t + fl, b - fl];
  const step = wb - wt;
  const xs = Math.min(x0at(wt), x0at(wb));
  for (let x = x1, i = 0; x - step > xs - step; x -= step, i++) {
    let [pa, pb]: Pt[] = i % 2 ? [[x, wt], [x - step, wb]] : [[x, wb], [x - step, wt]];
    const lim = (q: Pt) => x0at(q[1]);
    if (pb[0] < lim(pb)) {
      const f = (lim(pa) - pa[0]) / (pb[0] - pa[0]);
      if (f <= 0.05) break;
      pb = lerp(pa, pb, Math.min(1, (pa[0] - lim(pb)) / (pa[0] - pb[0])));
    }
    hair += seg(pa, pb, s);
  }
  for (let x = x1 - 0.6 * k; x > x0at(b) + 0.5 * k; x -= 0.9 * k) hatch += seg([x, b - fl + 0.35 * k], [x, b - 0.35 * k], s);
  p.add(thin, 'thin');
  p.add(hair, 'hair');
  p.add(hatch, 'hatch');
}

/** A timber guide at `x`, from `top` to `bottom`, shaded down its right. */
function guide(p: Plate, x: number, top: number, bottom: number, k: number, s: Shields) {
  const w = 1.1 * k;
  p.add(seg([x - w, top], [x - w, bottom], s) + seg([x + w, top], [x + w, bottom], s), 'hair');
  p.add(seg([x + w * 0.4, top], [x + w * 0.4, bottom], s), 'hatch');
}

// ---- the rig --------------------------------------------------------------------

type Rig = {
  /** The scale of the small parts (links, bands, rivets). */
  k: number;
  W: Pt;
  R: number;
  spokes: number;
  shackle: number;
  cage: Omit<Cage, 'x'>;
  weight: { top: number; bottom: number; hw: number };
  girder?: { y: number; h: number; x0at: (y: number) => number };
  guides?: { bottom: number };
  /** The plate's glory and arch: what the motif may break. */
  clear?: Shields;
};

/** Draws the lift: wheel, chains, cage, weight, girder and guides. */
function rig(p: Plate, r: Rig) {
  const { k, W, R } = r;
  const groove = R - 2.2 * k;
  const [hx, wx] = [W[0] - groove, W[0] + groove];
  const wheelHole: Hole = { c: W, r: R + 0.6 * k };
  const c: Cage = { x: hx, ...r.cage };
  const hull = grow(cageHull(c), 0.9 * k);
  const ring: Pt = [hx, r.shackle];
  const [ringR, ringW] = [3 * k, 1 * k];
  // The cage, and its bridle up to the ring: edge-on links over the ring and over the lugs' eyes.
  const { lugs } = cage(p, c, k);
  const eyeR = 1.35 * k;
  const bridle = lugs.map((l) => chain(p, at(ring, heading(ring, l), ringR - ringW - 0.4 * k), l, k * 0.8, NONE, 1).strip);
  for (const l of lugs) {
    ringAt(p, l, eyeR, 0.75 * k, k * 0.8, [heading(l, ring)]);
  }
  ringAt(p, ring, ringR, ringW, k, [0, ...lugs.map((l) => heading(ring, l))]);
  // The hoist chain, from the ring up into the wheel's groove, behind its flange.
  const hoist = chain(p, at(ring, 0, ringR - ringW - 0.4 * k), [hx, W[1]], k, { polys: [], holes: [wheelHole] }, 1);
  // The weight, hung by the eye on its tie rod, and its chain up into the groove.
  const wt = r.weight;
  const eye: Pt = [wx, wt.top - c.dy * 0.275 - 3.4 * k];
  weight(p, wx, wt.top, wt.bottom, wt.hw, c.dx * 0.55, c.dy * 0.55, k);
  ringAt(p, eye, 1.6 * k, 0.8 * k, k, [0]);
  p.knockout += disc(eye, 2.6 * k);
  const wc = chain(p, at(eye, 0, 0.4 * k), [wx, W[1]], k, { polys: [], holes: [wheelHole] }, 1);
  // The wheel over them.
  wheel(p, W, R, k, r.spokes, 0);
  p.knockout += disc(W, R + 1.2 * k);
  const strips = [hoist.strip, wc.strip, ...bridle];
  for (const st of strips) p.knockout += poly(st);
  p.knockout += disc(ring, ringR + 1.2 * k);
  for (const l of lugs) p.knockout += disc(l, eyeR + 1 * k);
  // Behind them all: the girder the wheel turns on, and the guides.
  const front: Shields = { polys: [hull, ...strips], holes: [{ c: W, r: R + 0.8 * k }, { c: ring, r: ringR + 0.8 * k }] };
  if (r.girder) {
    const g = r.girder;
    girder(p, g.x0at, W[0], g.y, g.h, k, front);
    p.knockout += poly([
      [g.x0at(g.y - g.h / 2) - 1, g.y - g.h / 2 - 1 * k],
      [W[0], g.y - g.h / 2 - 1 * k],
      [W[0], g.y + g.h / 2 + 1 * k],
      [g.x0at(g.y + g.h / 2) - 1, g.y + g.h / 2 + 1 * k],
    ]);
  }
  if (r.guides) {
    const fc = hx - c.dx / 2;
    const xs = [fc - c.hw - 3.2 * k, fc + c.hw + c.dx + 3.2 * k];
    const top = r.girder ? r.girder.y + r.girder.h / 2 : W[1];
    // The cage's shoes on them, top and bottom: the guides run through them.
    const shoes = xs.flatMap((x, i) =>
      [c.y0 + 1.2 * k, c.y1 - 4.2 * k].map((y) => {
        const yy = i ? y - c.dy : y;
        return box(x - 2.1 * k, yy, x + 2.1 * k, yy + 3 * k);
      }),
    );
    p.add(shoes.map(poly).join(''), 'thin');
    p.add(shoes.map((b) => line([b[1][0] - 0.6 * k, b[1][1] + 0.7 * k], [b[1][0] - 0.6 * k, b[2][1] - 0.7 * k])).join(''), 'hatch');
    for (const b of shoes) p.knockout += poly(grow(b, 1 * k));
    for (const x of xs) {
      guide(p, x, top, r.guides.bottom, k, join(front, { polys: shoes.map((b) => grow(b, 0.5 * k)), holes: [] }));
      p.knockout += poly(box(x - 2.1 * k, top, x + 2.1 * k, r.guides.bottom));
    }
  }
}

// ---- the faces ------------------------------------------------------------------

function liftTall(p: Plate, g: TallLayout) {
  const k = g.w / 218;
  const { A, ri } = g.arch;
  const R = 33 * k;
  const groove = R - 2.2 * k;
  // The cage hangs where the emblem would; the wheel above it to the right, breaking the arch.
  const W: Pt = [A[0] + groove, 66 * k];
  const archX = (y: number) => A[0] - Math.sqrt(Math.max(0, ri * ri - Math.min(0, y - A[1]) ** 2)) + 0.9 * k;
  rig(p, {
    k,
    W,
    R,
    spokes: 8,
    shackle: 102 * k,
    cage: { y0: 122 * k, y1: 186 * k, hw: 22 * k, dx: 6 * k, dy: 4 * k },
    weight: { top: 150 * k, bottom: 184 * k, hw: 5.5 * k },
    girder: { y: W[1], h: 5.6 * k, x0at: archX },
    guides: { bottom: g.pedestal.capTop },
  });
}

function liftRow(p: Plate, g: RowLayout) {
  const k = g.h / 110;
  const s = 0.62 * k;
  const R = 15.5 * k;
  const groove = R - 2.2 * s;
  const W: Pt = [g.emblem[0] + groove, 9 * k + R + 2 * k];
  rig(p, {
    k: s,
    W,
    R,
    spokes: 8,
    shackle: 44 * k,
    cage: { y0: 54 * k, y1: 96 * k, hw: 13.5 * k, dx: 4 * k, dy: 2.8 * k },
    weight: { top: 66 * k, bottom: 90 * k, hw: 3.6 * k },
    girder: { y: W[1], h: 3.8 * k, x0at: () => 12 * k },
  });
}

// ---- the spandrels and the back --------------------------------------------------

/** Sublimation, `r` from its centre to its ends: what rises clear in an arc over the dross, shaded under the arc on its right. */
function sublimation(p: Plate, c: Pt, r: number) {
  const s = r / 4.2;
  p.add(transform(SUBLIMATION, c, s), 'sign');
  let h = '';
  const [ac, ar] = [[c[0], c[1] + 0.6 * s] as Pt, 2.5 * s];
  for (let y = -ar + 0.9; y < -0.5; y += 0.85) {
    const x = Math.sqrt(ar * ar - y * y) - 0.6;
    if (x > 1) h += line([ac[0] + x * 0.2, ac[1] + y], [ac[0] + x, ac[1] + y]);
  }
  p.add(h, 'hatch');
}

function liftBack(p: Plate, g: BackLayout) {
  const R = g.row ? 13 : 24;
  // The glory sits back with the plate, not the motif.
  p.motif = false;
  p.glory(g.c, g.row ? 72 : 96, R + 3, (deg) => g.room(deg) + 1, 0.68, { holes: g.holes });
  p.motif = true;
  wheel(p, g.c, R, g.row ? 0.62 : 1, g.row ? 8 : 12, 0);
}

export const liftVariant: Variant = {
  spandrels(p, sol, luna) {
    p.sol(sol.c, sol.r);
    sublimation(p, luna.c, luna.r * 0.82);
  },
  face(p, g) {
    if (g.row) liftRow(p, g);
    else liftTall(p, g);
  },
  back: liftBack,
};
