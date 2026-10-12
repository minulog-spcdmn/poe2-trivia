// The way out as Temperance (temperance.ts), engraved into the category
// card's plate (lib/cardEngraving) by the hand that cut Delve's finds
// (lib/findEngraving; docs/arcane-style.md: exact geometry, one-sided
// hatching, lines stopping short of what they meet, a soft glow under them).
//
// The card of restraint, drawn as its essential sign: two cups held apart,
// a stream poured from one into the other. The upper cup, tipped, pours from
// its lip; the stream falls in a true parabola into the lower cup, which
// stands on the pedestal full to the brim, rings spreading where it lands.
// Behind them rise the angel's wings, made from the card's own glory: two
// fans of feathers out of the window's heart, their tips along the arch,
// and in the gap between them a narrow glory, the light at the end of the
// path. Each cup is a solid of revolution seen a little from above, its
// outline the hull of its circles, shaded down the meridians turned from the
// light (the upper left, as on the rest of the plate).
//
// In the spandrels: in Sol's place, the path climbing between two peaks to
// the light rising between them; in Luna's, the sign Temperance wears on her
// breast, a triangle in a square. The back holds that sign in its glory.
// Laid in a row (phones), the cups pour in the emblem's place and the peaks
// and their light stand at the row's far end.

import { arc, at, hatch, lerp, line, pt, subtract, type Cut, type Hole, type Pt } from '../arcane.ts';
import { throughDisc, type BackLayout, type Plate, type RowLayout, type TallLayout, type Variant } from '../cardEngraving.ts';

// ---- geometry -------------------------------------------------------------------

const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
const dot = (p: Pt, q: Pt) => p[0] * q[0] + p[1] * q[1];
const centroid = (ps: Pt[]): Pt => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
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

/** Whether `q` lies inside the convex polygon `ps`. */
const inside = (q: Pt, ps: Pt[]) => inPoly(q, [q[0] + 1e-3, q[1] + 1e-3], ps) !== null;

/** What lines stop short of: convex shapes standing in front, and discs. */
type Shields = { polys: Pt[][]; holes: Hole[] };
const NONE: Shields = { polys: [], holes: [] };
const join = (...s: Shields[]): Shields => ({ polys: s.flatMap((x) => x.polys), holes: s.flatMap((x) => x.holes) });

/** The stretches of the segment `p` to `q` hidden behind the shields. */
function hidden(p: Pt, q: Pt, s: Shields): Cut[] {
  const out: Cut[] = [];
  const [x0, x1, y0, y1] = [Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1])];
  for (const ps of s.polys) {
    // A quick look at its bounds first: most shields are nowhere near.
    let [a, b, c, d] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const v of ps) {
      a = Math.min(a, v[0]);
      b = Math.max(b, v[0]);
      c = Math.min(c, v[1]);
      d = Math.max(d, v[1]);
    }
    if (b < x0 || a > x1 || d < y0 || c > y1) continue;
    const cut = inPoly(p, q, ps);
    if (cut) out.push(cut);
  }
  for (const h of s.holes) {
    const cut = throughDisc(p, q, h.c, h.r);
    if (cut) out.push(cut);
  }
  return out;
}

/** A straight line, broken where it passes behind a shield. */
const seg = (p: Pt, q: Pt, s: Shields = NONE) => line(p, q, { cuts: hidden(p, q, s) });

/** A line through the points `ps` (closed, back to the first), broken where it passes behind a shield, unbroken stretches kept as one stroke. */
function trace(ps: Pt[], s: Shields = NONE, closed = false) {
  const pts = closed ? [...ps, ps[0]] : ps;
  let d = '';
  let open = false;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [p, q] = [pts[i], pts[i + 1]];
    const parts = subtract(0, 1, hidden(p, q, s));
    if (!parts.length) open = false;
    for (const [t0, t1] of parts) {
      if (open && t0 < 1e-6) d += `L${pt(lerp(p, q, t1))}`;
      else d += `M${pt(lerp(p, q, t0))}L${pt(lerp(p, q, t1))}`;
      open = t1 > 1 - 1e-6;
    }
  }
  return d;
}

/** The part of the segment `p` to `q` inside every one of the convex polygons `keep`, or null. */
function within(p: Pt, q: Pt, keep: Pt[][]): [Pt, Pt] | null {
  let [t0, t1] = [0, 1];
  for (const ps of keep) {
    const c = inPoly(p, q, ps);
    if (!c) return null;
    t0 = Math.max(t0, c[0]);
    t1 = Math.min(t1, c[1]);
  }
  return t1 - t0 > 1e-3 ? [lerp(p, q, t0), lerp(p, q, t1)] : null;
}

/** Points round an ellipse about `c`, `a` across and `b` deep, from `t0` to `t1` degrees (0 to the right, 90 to the front, below). */
const ellipse = (c: Pt, a: number, b: number, t0: number, t1: number, step = 6): Pt[] => {
  const n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = ((t0 + ((t1 - t0) * i) / n) * Math.PI) / 180;
    return [c[0] + a * Math.cos(t), c[1] + b * Math.sin(t)];
  });
};

/** Lines across the quadrilateral `a`, `b`, `c`, `d` parallel to its side `a` to `b`, stepping toward `d` to `c`, `gap` apart. */
function hatchQuad(a: Pt, b: Pt, c: Pt, d: Pt, gap: number, s: Shields = NONE) {
  const n = Math.floor(Math.max(Math.hypot(d[0] - a[0], d[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1])) / gap);
  let out = '';
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    out += seg(lerp(a, d, t), lerp(b, c, t), s);
  }
  return out;
}

/** Where the light falls from: the upper left, as on the rest of the plate. */
const LIGHT: Pt = [-0.6, -0.8];

// ---- the cups -------------------------------------------------------------------

/** How flat a level circle of a cup looks, seen a little from above. */
const FLAT = 0.3;

/**
 * A chalice: its rim's centre at `c`, `R` across the rim, tipped `tilt`
 * degrees clockwise about it; `full`, filled to the brim. In its own frame
 * (before tipping) it stands upright, y down from the rim: a bowl whose side
 * is a quarter ellipse, a girdle round it, a stem with a knop, a domed foot.
 */
type Chalice = { c: Pt; R: number; tilt: number; full: boolean };

/** Where a chalice's parts fall, in its own frame and on the plate. */
function chaliceShape({ c, R, tilt, full }: Chalice) {
  const [cos, sin] = [Math.cos((tilt * Math.PI) / 180), Math.sin((tilt * Math.PI) / 180)];
  const T = ([x, y]: Pt): Pt => [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos];
  const hb = 1.02 * R;
  /** The bowl's radius at `y` below the rim. */
  const bowl = (y: number) => R * Math.sqrt(Math.max(0, 1 - (y / hb) ** 2));
  const rs = 0.085 * R;
  const yb = hb * Math.sqrt(1 - (rs / R) ** 2);
  const girdle = 0.5 * hb;
  const knop = { y: yb + 0.36 * R, rx: 0.25 * R, ry: 0.13 * R };
  const ft = yb + 0.78 * R;
  const foot = { top: rs * 1.6, y: yb + 1.2 * R, r: 0.66 * R, edge: 0.09 * R };
  const level = (y: number, r: number, t0 = 0, t1 = 360) => ellipse([0, y], r, r * FLAT, t0, t1);
  // The bowl's outline: the hull of its circles, and the stretch of it below the rim's ends.
  const bowlHull = hull(Array.from({ length: 25 }, (_, i) => level((yb * i) / 24, bowl((yb * i) / 24))).flat());
  const lo = bowlHull.reduce((m, v, i) => (v[0] < bowlHull[m][0] ? i : m), 0);
  const hi = bowlHull.reduce((m, v, i) => (v[0] > bowlHull[m][0] ? i : m), 0);
  const walk = (step: number) => {
    const out = [bowlHull[lo]];
    for (let i = lo; i !== hi; ) out.push(bowlHull[(i = (i + step + bowlHull.length) % bowlHull.length)]);
    return out;
  };
  const [w1, w2] = [walk(1), walk(-1)];
  const mean = (w: Pt[]) => w.reduce((s, v) => s + v[1], 0) / w.length;
  const bowlFront = mean(w1) > mean(w2) ? w1 : w2;
  const knopHull = hull(Array.from({ length: 13 }, (_, i) => {
    const y = -knop.ry + (2 * knop.ry * i) / 12;
    return level(knop.y + y, knop.rx * Math.sqrt(Math.max(0, 1 - (y / knop.ry) ** 2)));
  }).flat());
  const footHull = hull([...level(ft, foot.top), ...level(foot.y, foot.r), ...level(foot.y + foot.edge, foot.r, 0, 180)]);
  const stem: Pt[] = [
    [-rs, yb - 0.5],
    [rs, yb - 0.5],
    [rs, ft + 0.6],
    [-rs, ft + 0.6],
  ];
  return { T, R, hb, bowl, rs, yb, girdle, knop, ft, foot, level, bowlHull, bowlFront, knopHull, footHull, stem, full, tilt };
}
type ChaliceShape = ReturnType<typeof chaliceShape>;

/** A chalice's outline on the plate, in convex parts, for what stands behind it to stop short of. */
const chaliceShields = (sh: ChaliceShape, d: number): Pt[][] => [sh.bowlHull, sh.knopHull, sh.footHull, sh.stem].map((ps) => grow(ps.map(sh.T), d));

/**
 * A chalice engraved: its rim and lip, the bowl's outline and girdle, the
 * stem, knop and foot; the bowl, knop and foot shaded down the meridians on
 * the side turned from the light, and a few at the far rim; inside, the dark
 * of the bowl hatched, or the brim of what fills it. `front`: what stands in
 * front of it (the stream). `fill` returns the liquid's surface (for rings).
 */
function chalice(p: Plate, sh: ChaliceShape, front: Shields, k: number) {
  const { T, R, bowl, yb, girdle, knop, ft, foot, level } = sh;
  const map = (ps: Pt[]) => ps.map(T);
  const S = (ps: Pt[], closed = false) => trace(map(ps), front, closed);
  const lip = R - 0.9 * k;
  let thin = '';
  let hair = '';
  let shade = '';
  // The rim, and the lip's inner edge.
  thin += S(level(0, R, 0, 360), true);
  hair += S(level(0, lip, 0, 360), true);
  // The bowl's outline below the rim, and its girdle (two lines round its front).
  thin += S(sh.bowlFront);
  for (const dy of [-0.7 * k, 0.7 * k]) hair += S(level(girdle + dy, bowl(girdle + dy), 0, 180));
  // The stem, broken at the knop.
  const knopTop = knop.y - knop.ry * 0.7;
  const knopFoot = knop.y + knop.ry * 0.7;
  for (const x of [-sh.rs, sh.rs]) thin += S([[x, yb - 0.2], [x, knopTop]]) + S([[x, knopFoot], [x, ft]]);
  thin += S(sh.knopHull.length ? [...sh.knopHull] : [], true);
  hair += S(level(knop.y, knop.rx, 0, 180));
  // The foot: its dome (the hull of its top and its rim), the rim's far side
  // (seen from above), behind the stem, and the band of its edge.
  const stemShield: Shields = { polys: [grow(map(sh.stem), 0.5 * k)], holes: [] };
  thin += trace(map(sh.footHull), join(front, stemShield), true);
  hair += trace(map(level(foot.y, foot.r, 180, 360)), join(front, stemShield));
  hair += S(level(foot.y, foot.r, 0, 180));

  // Shading down the meridians: on the right, crowding toward the edge, the
  // far left only at its rim. A meridian at `t` degrees round from the front.
  const meridian = (t: number, y0: number, y1: number, r: (y: number) => number) => {
    const n = 10;
    return Array.from({ length: n + 1 }, (_, i): Pt => {
      const y = y0 + ((y1 - y0) * i) / n;
      const rr = r(y);
      return [rr * Math.sin((t * Math.PI) / 180), y + rr * FLAT * Math.cos((t * Math.PI) / 180)];
    });
  };
  const gap = 0.75 * k;
  for (const t of [28, 38, 47, 55, 62, 68, 73, 78, 82, 86]) {
    const deep = t > 50;
    shade += S(meridian(t, deep ? 0.12 * R : 0.3 * R, girdle - gap - 0.4 * k, bowl));
    shade += S(meridian(t, girdle + gap + 0.4 * k, yb * (deep ? 0.97 : 0.88), bowl));
  }
  for (const t of [-86, -81]) {
    shade += S(meridian(t, 0.12 * R, girdle - gap - 0.4 * k, bowl));
    shade += S(meridian(t, girdle + gap + 0.4 * k, yb * 0.8, bowl));
  }
  // The stem's right side, and the knop's.
  for (const x of [sh.rs * 0.35]) shade += S([[x, yb + 0.6 * k], [x, knopTop - 0.4 * k]]) + S([[x, knopFoot + 0.4 * k], [x, ft - 0.4 * k]]);
  for (const t of [40, 58, 72, 84]) {
    const x = knop.rx * Math.sin((t * Math.PI) / 180);
    const h = knop.ry * Math.cos((t * Math.PI) / 180) * 0.75;
    shade += S([[x, knop.y - h], [x, knop.y + h + knop.rx * FLAT * 0.6]]);
  }
  // The foot's dome, on its right: straight from its top to its rim.
  for (const t of [30, 42, 53, 62, 70, 77, 83]) {
    const a = (t * Math.PI) / 180;
    const top: Pt = [foot.top * Math.sin(a), ft + foot.top * FLAT * Math.cos(a)];
    const rim: Pt = [foot.r * Math.sin(a), foot.y + foot.r * FLAT * Math.cos(a)];
    shade += S([lerp(top, rim, 0.12), lerp(top, rim, 0.9)]);
  }

  // Inside. Full: the brim of what fills it, a lit stretch along its near
  // side, the rest in level lines. Tipped and pouring: the dark of the bowl
  // in lines along the rim, its near wall lit.
  const lipPoly = map(level(0, lip - 0.5 * k, 0, 360));
  if (sh.full) {
    const d = 0.1 * R;
    const surface = level(d, bowl(d) - 0.9 * k, 180, 360);
    // The brim's far edge, where it shows inside the lip.
    const inLip = surface.filter((q) => inside(T(q), lipPoly));
    hair += S(inLip);
    const fill = map(level(d, bowl(d) - 1.3 * k, 0, 360));
    for (let y = d - (bowl(d) - 0.9 * k) * FLAT + 0.9 * k; y < lip * FLAT; y += 0.8 * k) {
      // Each line from a little in on the left (the light's side) to the right.
      const half = lip;
      const run = within(T([-half, y]), T([half, y]), [lipPoly, fill]);
      if (!run) continue;
      const [a, b] = run;
      shade += seg(lerp(a, b, 0.24 + 0.1 * Math.sin(y)), b, front);
    }
  } else {
    for (let y = -lip * FLAT + 0.8 * k; y < lip * FLAT - 0.5 * k; y += 0.8 * k) {
      const run = within(T([-lip, y]), T([lip, y]), [lipPoly]);
      if (!run) continue;
      const [a, b] = run;
      // Darker toward the far wall: the near half only part way.
      shade += seg(a, lerp(a, b, y < 0 ? 0.92 : 0.55), front);
    }
  }
  p.add(thin, 'thin');
  p.add(hair, 'hair');
  p.add(shade, 'hatch');
}

// ---- the stream -----------------------------------------------------------------

/**
 * The stream poured from `from` (the lip), leaving it heading at `dir`
 * (a unit vector) and falling in a parabola into `to`; `w0` and `w1` its
 * width at either end. Its two edges, a line along its shaded side, and
 * its outline in short quads (for what lies behind it).
 */
function streamShape(from: Pt, to: Pt, dir: Pt, w0: number, w1: number) {
  // P(t) = from + s dir t + (0, g t² / 2), with P(1) = to.
  const s = (to[0] - from[0]) / dir[0];
  const g = 2 * (to[1] - from[1] - s * dir[1]);
  const n = 36;
  const P = (t: number): Pt => [from[0] + s * dir[0] * t, from[1] + s * dir[1] * t + (g * t * t) / 2];
  const V = (t: number): Pt => {
    const v: Pt = [s * dir[0], s * dir[1] + g * t];
    const l = Math.hypot(v[0], v[1]);
    return [v[0] / l, v[1] / l];
  };
  const side = (t: number, off: number): Pt => {
    const v = V(t);
    // Spilled wide over the lip, it gathers quickly as it falls.
    const w = w1 + (w0 - w1) * (1 - t) ** 4;
    return [P(t)[0] - v[1] * off * w, P(t)[1] + v[0] * off * w];
  };
  const ts = Array.from({ length: n + 1 }, (_, i) => i / n);
  const quads = ts.slice(0, -1).map((t, i) => [side(t, -0.5), side(ts[i + 1], -0.5), side(ts[i + 1], 0.5), side(t, 0.5)]);
  return { P, V, side, ts, quads };
}

function stream(p: Plate, st: ReturnType<typeof streamShape>, front: Shields) {
  const { side, ts } = st;
  // Its edges: the upper one lit; the lower turned from the light, and a strand in along it.
  p.add(trace(ts.map((t) => side(t, 0.5)), front), 'thin');
  p.add(trace(ts.map((t) => side(t, -0.5)), front), 'thin');
  // The strands of the water, running its length and gathering as it falls.
  p.add(trace(ts.filter((t) => t > 0.08 && t < 0.95).map((t) => side(t, -0.24)), front), 'hair');
}

// ---- the wings ------------------------------------------------------------------

/** A feather out of `root` toward `a`, `len` long and `w` across its widest half. */
type Feather = { root: Pt; a: number; len: number; w: number };

/** A feather's outline: narrow at the quill, widest past its middle, its tip rounded. */
function featherShape({ root, a, len, w }: Feather) {
  const u = at([0, 0], a, 1);
  const n = at([0, 0], a + 90, 1);
  const place = (s: number, x: number): Pt => [root[0] + u[0] * s * len + n[0] * x, root[1] + u[1] * s * len + n[1] * x];
  const half = (s: number) => w * Math.sin(Math.PI * Math.min(1, Math.max(0, s)) ** 1.25) ** 0.5;
  const ss = Array.from({ length: 17 }, (_, i) => i / 16);
  const left = ss.map((s) => place(s, -half(s)));
  const right = ss.map((s) => place(s, half(s)));
  return { place, half, left, right, outline: hull([...left, ...right]), n };
}

/** A feather engraved: its edges, the quill, and its vane hatched in barbs on the side turned from the light. */
function feather(f: Feather, s: Shields, k: number) {
  const { place, half, left, right, n } = featherShape(f);
  const edges = trace([...left].reverse().concat(right.slice(1)), s);
  const quill = trace([place(0.02, 0), place(0.86, 0)], s);
  // The side turned from the light, in barbs slanting toward the tip.
  const sgn = dot(n, LIGHT) > 0 ? -1 : 1;
  let barbs = '';
  const step = (0.85 * k) / f.len;
  const slant = Math.min(0.12, (3 * f.w) / f.len / 1.6);
  for (let t = 0.06; t < 0.9 - slant; t += step) {
    const reach = half(t + slant) - 0.4 * k;
    if (reach < 0.6 * k) continue;
    barbs += seg(place(t, 0), place(t + slant, sgn * reach), s);
  }
  return { edges, quill, barbs };
}

/**
 * A wing spread from `shoulder`, its arm rising, bowed, to `wrist`: flight
 * feathers hanging from the arm, turning from `a[0]` at the shoulder to
 * `a[1]` at the wrist, and primaries fanned on from there to `a[2]`, each
 * as long as `reach` lets it (`lens` at the shoulder and the wrist); two
 * rows of coverts over their quills, and the arm's edge over all. Angles
 * are the left wing's; `side` 1 mirrors them. Drawn back to front, each
 * feather stopping short of those over it.
 */
function wing(p: Plate, side: number, shoulder: Pt, wrist: Pt, a: [number, number, number], lens: [number, number], reach: (q: Pt, a: number) => number, k: number) {
  const mid = lerp(shoulder, wrist, 0.5);
  const len = Math.hypot(wrist[0] - shoulder[0], wrist[1] - shoulder[1]);
  // The arm bows up: a quadratic through shoulder and wrist, `bow` above the chord at its middle.
  const bow = 0.16 * len;
  const ctrl: Pt = [mid[0], mid[1] - 2 * bow];
  const arm = (u: number): Pt => {
    const v = 1 - u;
    return [v * v * shoulder[0] + 2 * u * v * ctrl[0] + u * u * wrist[0], v * v * shoulder[1] + 2 * u * v * ctrl[1] + u * u * wrist[1]];
  };
  const turn = (deg: number) => (side < 0 ? deg : 360 - deg);
  const fit = (root: Pt, dir: number, want: number) => Math.min(want, reach(root, dir) - 4 * k);
  const N = 10;
  const flight: Feather[] = Array.from({ length: N }, (_, i) => {
    const u = i / (N - 1);
    const dir = turn(a[0] + (a[1] - a[0]) * u);
    const root = arm(u * 0.92);
    return { root, a: dir, len: fit(root, dir, (lens[0] + (lens[1] - lens[0]) * u) * k), w: 5 * k };
  });
  const P = 5;
  const primaries: Feather[] = Array.from({ length: P }, (_, j) => {
    const dir = turn(a[1] + ((a[2] - a[1]) * (j + 1)) / P);
    const root = arm(0.93 + (0.07 * (j + 1)) / P);
    return { root, a: dir, len: fit(root, dir, lens[1] * (1 + 0.1 * (j + 1)) * k), w: 4.6 * k };
  });
  const coverts = (n: number, share: number, w: number, from: number): Feather[] =>
    Array.from({ length: n }, (_, i) => {
      const u = from + ((1 - from) * (i + 0.5)) / n;
      const dir = turn(a[0] + (a[1] - a[0]) * u + 8 * (1 - u));
      const root = arm(Math.min(1, u * 0.97));
      return { root, a: dir, len: (lens[0] + (lens[1] - lens[0]) * u) * share * k, w: w * k };
    });
  // Back to front: the outermost primary first, in to the shoulder, then the coverts, outer row first.
  const order = [...primaries].reverse().concat([...flight].reverse(), coverts(11, 0.52, 4.6, 0).reverse(), coverts(13, 0.3, 3.6, 0.04).reverse());
  const shapes = order.map(featherShape);
  // The arm's edge, a band along the top, in front of all.
  const armPts = Array.from({ length: 25 }, (_, i) => arm(i / 24));
  const under = armPts.map((q, i): Pt => {
    const r = armPts[Math.min(24, i + 1)];
    const l = armPts[Math.max(0, i - 1)];
    const d = Math.hypot(r[0] - l[0], r[1] - l[1]);
    // Toward the feathers (down).
    let nn: Pt = [-(r[1] - l[1]) / d, (r[0] - l[0]) / d];
    if (nn[1] < 0) nn = [-nn[0], -nn[1]];
    return [q[0] + nn[0] * 1.8 * k, q[1] + nn[1] * 1.8 * k];
  });
  const band = hull([...armPts, ...under]);
  void band;
  const armShield: Pt[][] = armPts.slice(0, -1).map((q, i) => grow([q, armPts[i + 1], under[i + 1], under[i]], 0.5 * k));
  let edges = '';
  let quills = '';
  let barbs = '';
  order.forEach((f, i) => {
    const s: Shields = { polys: [...shapes.slice(i + 1).map((sh) => grow(sh.outline, 0.55 * k)), ...armShield], holes: [] };
    const out = feather(f, s, k);
    edges += out.edges;
    quills += out.quill;
    barbs += out.barbs;
  });
  p.add(edges, 'hair');
  p.add(quills, 'shade');
  p.add(barbs, 'shade');
  p.add(trace(armPts), 'thin');
  p.add(trace(under), 'hair');
  let h = '';
  for (let i = 1; i < 24; i++) h += seg(lerp(armPts[i], under[i], 0.25), lerp(armPts[i + 1], under[i + 1], 0.85));
  p.add(h, 'hatch');
  return { arm, shapes };
}

// ---- the signs ------------------------------------------------------------------

/** Temperance's sign, worn on her breast: a triangle standing in a square, `r` from the centre to the square's corners, the triangle hatched down its right. */
function breastSign(p: Plate, c: Pt, r: number) {
  const h = r / Math.SQRT2;
  const sq: Pt[] = [
    [c[0] - h, c[1] - h],
    [c[0] + h, c[1] - h],
    [c[0] + h, c[1] + h],
    [c[0] - h, c[1] + h],
  ];
  const tri: Pt[] = [
    [c[0], c[1] - h + 0.18 * h],
    [c[0] + h * 0.78, c[1] + h * 0.8],
    [c[0] - h * 0.78, c[1] + h * 0.8],
  ];
  p.add(poly(sq), 'sign');
  p.add(poly(grow(sq, 1.3)), 'hair');
  p.add(poly(tri), 'sign');
  p.add(hatch([c[0], tri[1][1]], tri[1], tri[0], Math.max(0.6, r * 0.075)), 'hatch');
}

/**
 * The path to the light, `r` across: two peaks, the far one lower, the sun
 * rising in the saddle between them, its rays above the slopes; the path
 * climbing from the foreground to the saddle. Each peak hatched down the
 * slope turned from the light.
 */
function pathToLight(p: Plate, c: Pt, r: number) {
  const P = (x: number, y: number): Pt => [c[0] + x * r, c[1] + y * r];
  const ground = 0.62;
  const left = [P(-1, ground), P(-0.42, -0.52), P(0.28, ground)];
  const right = [P(-0.2, ground), P(0.5, -0.22), P(1, ground)];
  // The saddle, where the near slope of the left peak meets the right's.
  const sun = P(0.06, 0.02);
  const sunR = 0.2 * r;
  const before: Shields = { polys: [grow(left, 0.5)], holes: [] };
  const both: Shields = { polys: [grow(left, 0.5), grow(right, 0.5)], holes: [] };
  // The left peak stands in front of the right, the sun behind both, its rays over them.
  p.add(trace(left) + trace(right, before), 'thin');
  p.add(trace(ellipse(sun, sunR, sunR, 0, 360, 10), both, true), 'hair');
  let rays = '';
  for (let a = -80; a <= 80; a += 10) rays += seg(at(sun, a, sunR + 1.2), at(sun, a, sunR + (a % 20 ? 0.3 * r : 0.5 * r)), both);
  p.add(rays, 'hair');
  // Each peak hatched down its right slope, turned from the light.
  const gap = Math.max(0.6, r * 0.07);
  p.add(hatchTri(lerp(left[0], left[2], 0.5), left[2], left[1], gap) + hatchTri(lerp(right[0], right[2], 0.5), right[2], right[1], gap, before), 'hatch');
  // The ground either side, and the path, narrowing as it climbs to the saddle.
  const foot = c[1] + 0.95 * r;
  const [pl, pr]: Pt[] = [
    [c[0] - 0.3 * r, foot],
    [c[0] + 0.24 * r, foot],
  ];
  p.add(seg(pl, lerp(pl, sun, 0.62)) + seg(pr, lerp(pr, sun, 0.62)), 'hair');
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

// ---- the faces ------------------------------------------------------------------

/** The cups, the stream and the wings in a window: `up` the tipped cup's rim, `down` the foot of the full one. */
function scene(p: Plate, k: number, up: Pt, down: Pt, R: [number, number], tilt: number) {
  const tipped = chaliceShape({ c: up, R: R[0] * k, tilt, full: false });
  // The full cup stands on its foot.
  const probe = chaliceShape({ c: [0, 0], R: R[1] * k, tilt: 0, full: true });
  const full = chaliceShape({ c: [down[0], down[1] - probe.foot.y - probe.foot.r * FLAT], R: R[1] * k, tilt: 0, full: true });
  // The stream leaves the tipped cup's lip at its lowest point, heading on along the tipped rim.
  const lip = tipped.T([tipped.R * Math.cos(0.3), tipped.R * FLAT * Math.sin(0.3)]);
  // It leaves the lip nearly level, as poured water does, and falls.
  const dir: Pt = [Math.cos(((tilt - 25) * Math.PI) / 180), Math.sin(((tilt - 25) * Math.PI) / 180)];
  const into = full.T([0.08 * full.R, 0.1 * full.R]);
  const st = streamShape(lip, into, dir, 4.6 * k, 2.3 * k);
  const streamShield: Shields = { polys: st.quads.slice(1).map((q) => grow(q, 0.5 * k)), holes: [] };
  chalice(p, tipped, streamShield, k);
  chalice(p, full, streamShield, k);
  stream(p, st, NONE);
  // Rings spreading on the brim where it lands, inside the lip, short of the stream.
  const lipPoly = full.level(0, full.R - 1.6 * k, 0, 360).map(full.T);
  let rings = '';
  for (const r of [2.6, 4.6]) {
    const ps = ellipse(into, r * k, r * k * FLAT, 0, 360, 8).filter((q) => inside(q, lipPoly));
    rings += trace(ps, streamShield);
  }
  p.add(rings, 'hair');
  // The plate stops short of all of it.
  p.knockout += [...chaliceShields(tipped, 1.4 * k), ...chaliceShields(full, 1.4 * k), ...st.quads.map((q) => grow(q, 1.2 * k))].map(poly).join('');
  return { tipped, full, st, shields: { polys: [...chaliceShields(tipped, 1.2 * k), ...chaliceShields(full, 1.2 * k), ...st.quads.map((q) => grow(q, 1 * k))], holes: [] } as Shields };
}

function tall(p: Plate, g: TallLayout) {
  const k = g.w / 218;
  const { A, ri } = g.arch;
  const MID = A[0];
  // The upper cup tipped toward the lower, which stands on the pedestal's cap to the right.
  scene(p, k, [MID - 40 * k, 104], [MID + 26 * k, g.pedestal.capTop + 1.5], [15, 17], 34);
  // The wings: part of the plate (they sit back), short of the cups and the stream.
  p.motif = false;
  const reach = (q: Pt, a: number) => {
    const u = at([0, 0], a, 1);
    // To the arch (inner line), or its sides below the springing, or the pedestal's cap.
    const [fx, fy] = [q[0] - A[0], q[1] - A[1]];
    const b = fx * u[0] + fy * u[1];
    let t = -b + Math.sqrt(Math.max(0, b * b - (fx * fx + fy * fy - ri * ri)));
    if (q[1] + u[1] * t > A[1]) t = Math.abs(u[0]) > 1e-9 ? ((u[0] > 0 ? A[0] + ri : A[0] - ri) - q[0]) / u[0] : Infinity;
    if (u[1] > 1e-9) t = Math.min(t, (g.pedestal.capTop - 8 - q[1]) / u[1]);
    return t;
  };
  for (const side of [-1, 1]) wing(p, side, [MID + side * 7 * k, 112], [MID + side * 46 * k, 80], [196, 248, 330], [44, 46], reach, k);
  p.motif = true;
}

function row(p: Plate, g: RowLayout) {
  const k = g.h / 110;
  const C = g.emblem;
  scene(p, k * 0.78, [C[0] - 24 * k, C[1] - 22 * k], [C[0] + 18 * k, C[1] + 38 * k], [12.5, 14], 38);
  pathToLight(p, [g.w - 42 * k, g.h / 2 + 4 * k], 30 * k);
}

/** The glory: only in the gap between the wings, straight up out of the window's heart, the light at the end of the path. */
function glory(p: Plate, c: Pt, reach: (deg: number) => number, isRow: boolean) {
  if (isRow) {
    p.glory(c, 64, 28, reach, 0.6);
    return;
  }
  const n = 15;
  let rays = '';
  for (let i = 0; i < n; i++) {
    const a = -21 + (42 * i) / (n - 1);
    const r1 = reach(a) - 2;
    const end = i % 2 ? 66 + (r1 - 66) * 0.7 : r1;
    rays += line(at(c, a, 40), at(c, a, end));
  }
  p.add(rays, 'ray');
}

function spandrels(p: Plate, sol: Hole, luna: Hole) {
  pathToLight(p, sol.c, sol.r * 0.95);
  breastSign(p, luna.c, luna.r * 0.85);
}

function back(p: Plate, g: BackLayout) {
  breastSign(p, g.c, g.row ? 9 : 15);
  p.motif = false;
  p.glory(g.c, g.row ? 72 : 96, (g.row ? 9 : 15) + 4, (deg) => g.room(deg) + 1, 0.68, { holes: g.holes });
  p.motif = true;
}

export const TEMPERANCE: Variant = {
  spandrels: (p, sol, luna) => spandrels(p, sol, luna),
  glory,
  face: (p, g) => (g.row ? row(p, g) : tall(p, g)),
  back,
};

