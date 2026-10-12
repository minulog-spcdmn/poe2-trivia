// The Hermit's plate (see hermit.ts): the way out of a vein as the ninth
// trump, engraved into the category card's plate (lib/cardEngraving) by the
// hand that cut the finds' (lib/findEngraving; docs/arcane-style.md).
//
// In the window an old sage stands on a ledge of rock where the pedestal
// would be: hooded, bearded, in a long robe falling in straight folds,
// leaning on a staff, his lantern held up before him. In the lantern burns a
// six-pointed star, the brightest point on the card, and the glory behind
// him is its light: the rays run out of the lantern, not the window's
// middle, and stop short of him. Lit from the lantern, he is shaded down his
// back. The spandrels hold the star (in Sol's place) and the moon he walks
// by (Luna's); the back, the star in its glory.
//
// The figure is built, as everything on the plate is, from exact geometry:
// circular arcs through chosen points, straight folds converging on one
// point above him, hatching in parallel lines; each part is drawn back to
// front, its lines stopping short of the parts before it.

import { at, lerp, pt, pointedRay, rad, type Hole, type Pt } from '../arcane.ts';
import type { BackLayout, Cls, Plate, RowLayout, TallLayout, Variant } from '../cardEngraving.ts';

type Poly = Pt[];

// ---- geometry -------------------------------------------------------------------

/** Points along the circle through `a`, `m` and `b`, from `a` to `b` by way of `m` (a straight line if they are in line). */
function arc3(a: Pt, m: Pt, b: Pt, step = 1.6): Pt[] {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < 1e-9) return [a, b];
  const sq = (p: Pt) => p[0] * p[0] + p[1] * p[1];
  const ux = (sq(a) * (m[1] - b[1]) + sq(m) * (b[1] - a[1]) + sq(b) * (a[1] - m[1])) / d;
  const uy = (sq(a) * (b[0] - m[0]) + sq(m) * (a[0] - b[0]) + sq(b) * (m[0] - a[0])) / d;
  const r = Math.hypot(a[0] - ux, a[1] - uy);
  const ang = (p: Pt) => Math.atan2(p[1] - uy, p[0] - ux);
  const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const t0 = ang(a);
  let span = norm(ang(b) - t0);
  if (norm(ang(m) - t0) > span) span -= 2 * Math.PI;
  const n = Math.max(2, Math.ceil((Math.abs(span) * r) / step));
  const out = Array.from({ length: n + 1 }, (_, i): Pt => [ux + r * Math.cos(t0 + (span * i) / n), uy + r * Math.sin(t0 + (span * i) / n)]);
  out[0] = a;
  out[n] = b;
  return out;
}

/** Point lists joined end to end (a point shared by two is kept once). */
const chain = (...parts: Pt[][]): Pt[] =>
  parts.reduce<Pt[]>((out, p) => {
    const last = out.at(-1);
    return out.concat(last && p.length && Math.hypot(last[0] - p[0][0], last[1] - p[0][1]) < 1e-6 ? p.slice(1) : p);
  }, []);

/** Points round a circle about `c`, from `a0` to `a1` degrees clockwise from the top. */
const circ = (c: Pt, r: number, a0: number, a1: number, step = 1): Pt[] => {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * Math.PI * r) / 180 / step));
  return Array.from({ length: n + 1 }, (_, i) => at(c, a0 + ((a1 - a0) * i) / n, r));
};

/** Whether `q` lies inside the polygon `ps` (even-odd). */
function within(q: Pt, ps: Poly) {
  let inside = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [a, b] = [ps[i], ps[j]];
    if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** A polygon moved out by `d` (in by a negative `d`) along each corner's mean normal: a margin round a smooth outline. */
function swell(ps: Poly, d: number): Poly {
  // Which way round the polygon runs, so its normals point out.
  let area = 0;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) area += (ps[j][0] - ps[i][0]) * (ps[j][1] + ps[i][1]);
  const s = area > 0 ? -1 : 1;
  return ps.map((p, i) => {
    const [a, b] = [ps[(i + ps.length - 1) % ps.length], ps[(i + 1) % ps.length]];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(dx, dy) || 1;
    return [p[0] - (s * dy * d) / len, p[1] + (s * dx * d) / len];
  });
}

/** The side of the line through `a` and `b` to the right of the way from `a` to `b` (as seen on the card), as a polygon. */
function beyond(a: Pt, b: Pt, far = 400): Poly {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n: Pt = [-u[1], u[0]];
  const [p, q]: Pt[] = [
    [a[0] - u[0] * far, a[1] - u[1] * far],
    [b[0] + u[0] * far, b[1] + u[1] * far],
  ];
  return [p, q, [q[0] + n[0] * far, q[1] + n[1] * far], [p[0] + n[0] * far, p[1] + n[1] * far]];
}

/** A polygon and its bounds, for clipping lines against. */
type Region = { ps: Poly; box: [number, number, number, number] };
const region = (ps: Poly): Region => {
  const xs = ps.map((p) => p[0]);
  const ys = ps.map((p) => p[1]);
  return { ps, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
};

/** Where the segment from `p` to `q` crosses the outline of `r`, as fractions of its length. */
function crossings(p: Pt, q: Pt, r: Region, out: number[]) {
  const [x0, y0, x1, y1] = r.box;
  if (Math.max(p[0], q[0]) < x0 || Math.min(p[0], q[0]) > x1 || Math.max(p[1], q[1]) < y0 || Math.min(p[1], q[1]) > y1) return;
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  const ps = r.ps;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [a, b] = [ps[j], ps[i]];
    const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const [fx, fy] = [a[0] - p[0], a[1] - p[1]];
    const t = (fx * ey - fy * ex) / den;
    const u = (fx * dy - fy * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u < 1) out.push(t);
  }
}

// ---- the engraver ---------------------------------------------------------------

/**
 * Draws in a frame of its own (the figure's: x to the right, y down, the
 * ground under him at 0, units of a tall card 218 wide) onto the plate,
 * placed at `o` and scaled `k`. Lines stop short of what stands in `front`
 * (the parts drawn later, grown by a margin) and stay inside all of `keep`.
 */
class Engraver {
  front: Region[] = [];
  keep: Region[] = [];
  readonly p: Plate;
  readonly o: Pt;
  readonly k: number;
  constructor(p: Plate, o: Pt, k: number) {
    this.p = p;
    this.o = o;
    this.k = k;
  }
  /** Where a point of the figure lands on the card. */
  P = (q: Pt): Pt => [this.o[0] + this.k * q[0], this.o[1] + this.k * q[1]];
  /** A length on the card (in pixels) in the figure's units. */
  px = (v: number) => v / this.k;
  /** `ps` grown by `m` pixels, as a region lines stop short of. */
  hider = (ps: Poly, m = 0.8) => region(swell(ps, this.px(m)));
  /** `ps` shrunk by `m` pixels, as a region lines stay inside. */
  holder = (ps: Poly, m = 0.6) => region(m ? swell(ps, -this.px(m)) : ps);
  private shown(q: Pt) {
    return this.keep.every((r) => within(q, r.ps)) && !this.front.some((r) => within(q, r.ps));
  }
  /** Where the segment from `a` to `b` shows, as stretches of [0, 1]. */
  private runs(a: Pt, b: Pt): [number, number][] {
    const ts = [0, 1];
    for (const r of this.front) crossings(a, b, r, ts);
    for (const r of this.keep) crossings(a, b, r, ts);
    ts.sort((x, y) => x - y);
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < ts.length; i++) {
      const [t0, t1] = [ts[i], ts[i + 1]];
      if (t1 - t0 < 1e-9 || !this.shown(lerp(a, b, (t0 + t1) / 2))) continue;
      const last = out.at(-1);
      if (last && Math.abs(last[1] - t0) < 1e-9) last[1] = t1;
      else out.push([t0, t1]);
    }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return out.filter(([t0, t1]) => (t1 - t0) * len > this.px(0.3) || (t0 < 1e-9 && t1 > 1 - 1e-9));
  }
  /** Polylines, broken where hidden, as one stroke class. */
  lines(pls: Pt[][], cls: Cls, closed = false) {
    let d = '';
    for (const pl0 of pls) {
      const pl = closed ? [...pl0, pl0[0]] : pl0;
      let open = false;
      for (let i = 0; i + 1 < pl.length; i++) {
        const [a, b] = [pl[i], pl[i + 1]];
        const rs = this.runs(a, b);
        rs.forEach(([t0, t1], j) => {
          if (!(open && j === 0 && t0 < 1e-9)) d += `M${pt(this.P(lerp(a, b, t0)))}`;
          d += `L${pt(this.P(lerp(a, b, t1)))}`;
        });
        open = rs.length > 0 && rs.at(-1)![1] > 1 - 1e-9;
      }
    }
    this.p.add(d, cls);
  }
  /** Parallel lines across `s` (kept 0.5 px in from its outline) at `deg` (clockwise from the top), `gap` pixels apart, inside all of `also` too. */
  hatch(s: Poly, deg: number, gap: number, also: Poly[] = [], cls: Cls = 'hatch') {
    const u = at([0, 0], deg, 1);
    const n: Pt = [-u[1], u[0]];
    const proj = s.map((q) => q[0] * n[0] + q[1] * n[1]);
    const along = s.map((q) => q[0] * u[0] + q[1] * u[1]);
    const [lo, hi] = [Math.min(...proj), Math.max(...proj)];
    const [a0, a1] = [Math.min(...along) - 1, Math.max(...along) + 1];
    const g = this.px(gap);
    const keep = this.keep;
    this.keep = [...keep, this.holder(s, 0.5), ...also.map((ps) => region(ps))];
    const pls: Pt[][] = [];
    for (let v = lo + g / 2; v < hi; v += g) pls.push([[n[0] * v + u[0] * a0, n[1] * v + u[1] * a0], [n[0] * v + u[0] * a1, n[1] * v + u[1] * a1]]);
    this.lines(pls, cls);
    this.keep = keep;
  }
  /** Fills `ps` (no line, a solid shape), unbroken. */
  fill(ps: Poly) {
    this.p.add(`M${ps.map((q) => pt(this.P(q))).join('L')}Z`, 'fill');
  }
  /** Keeps the plate's own lines out of `ps`, `d` pixels round it. */
  knock(ps: Poly, d = 1.4) {
    this.p.knockout += `M${swell(ps, this.px(d))
      .map((q) => pt(this.P(q)))
      .join('L')}Z`;
  }
}

/** A part of the figure: its outline (which what is behind it stops short of) and how it is drawn. */
type Part = { ps: Poly; draw: (e: Engraver) => void };

/** Draws parts back to front, each one's lines stopping short of those before it. */
function drawParts(e: Engraver, parts: Part[]) {
  const hiders = parts.map((q) => e.hider(q.ps));
  parts.forEach((part, i) => {
    e.front = hiders.slice(i + 1);
    e.keep = [];
    part.draw(e);
  });
  e.front = [];
  e.keep = [];
}

// ---- the figure -----------------------------------------------------------------

/** Where the lantern's star burns, in the figure's frame. */
const STAR: Pt = [-46.5, -102.2];
/** How far the star reaches. */
const STAR_R = 5.2;

/** The Seal's two triangles, `r` to their points, about `c`. */
const triangles = (c: Pt, r: number, turn = 0): [Poly, Poly] => [
  [0, 120, 240].map((a) => at(c, a + turn, r)),
  [60, 180, 300].map((a) => at(c, a + turn, r)),
];

/** The six-pointed star: its two triangles drawn whole, each broken where it passes under the other in turn, and its heart filled. */
function sealOfLight(e: Engraver, c: Pt, r: number, cls: Cls = 'thin') {
  const [up, down] = triangles(c, r);
  // Where the triangles cross, over and under in turn round the star.
  const inner = Array.from({ length: 6 }, (_, k) => at(c, 30 + k * 60, r / Math.sqrt(3)));
  const gap = e.px(0.55);
  const sides = (tri: Poly, first: number) =>
    tri.map((a, i) => {
      const b = tri[(i + 1) % 3];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // Each side crosses the other triangle at a third and two thirds of its length.
      const cuts = [1 / 3, 2 / 3].filter((_, j) => (i + j + first) % 2 === 0).map((t): [number, number] => [t - gap / len, t + gap / len]);
      let from = 0;
      const out: Pt[][] = [];
      for (const [t0, t1] of cuts) {
        out.push([lerp(a, b, from), lerp(a, b, t0)]);
        from = t1;
      }
      out.push([lerp(a, b, from), b]);
      return out;
    });
  e.lines([...sides(up, 0), ...sides(down, 1)].flat(), cls);
  e.fill(inner);
}

/** The Hermit, drawn by `e`: ledge, staff, robe, sleeves, cowl, beard and lantern. */
function hermitFigure(e: Engraver, ledge = true) {
  // ---- the robe: a long gown flaring to its hem, its back bowed with age, a cord at the waist.
  const hemFeet = [-27, -19.5, -11, -2.5, 6, 14, 20.5, 25];
  const hemY = (x: number) => -1.6 + 2.4 * Math.sqrt(Math.max(0, 1 - ((x + 1) / 27) ** 2));
  const hem = chain(
    ...hemFeet.slice(1).map((x, i) => {
      const x0 = hemFeet[i];
      return arc3([x0, hemY(x0)], [(x0 + x) / 2, (hemY(x0) + hemY(x)) / 2 + 1.2], [x, hemY(x)]);
    }),
  );
  const back = arc3(hem.at(-1)!, [28, -54], [24.5, -100]);
  const fore = arc3([-17.5, -97], [-22, -50], hem[0]);
  const robe: Poly = chain(hem, back, [[4, -108]], fore);
  /** Where the robe meets a level line: its front and back edges at `y`. */
  const edgesAt = (y: number): [number, number] => {
    const xs: number[] = [];
    for (let i = 0; i + 1 < robe.length; i++) {
      const [a, b] = [robe[i], robe[i + 1]];
      if (a[1] > y !== b[1] > y) xs.push(a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]));
    }
    return [Math.min(...xs), Math.max(...xs)];
  };
  // The cord: round the waist, sagging at the front where it is knotted.
  const waist = -66;
  const [wf, wb] = edgesAt(waist);
  const cord = arc3([wf, waist], [4, waist + 2.6], [wb, waist - 1.2]);
  const cord2 = cord.map(([x, y]): Pt => [x, y + 1.5]);
  const knot: Pt = [-13, waist + 2.3];
  /** The point the robe's folds fall from. */
  const F: Pt = [-1, -200];
  const robePart: Part = {
    ps: robe,
    draw: (e) => {
      e.lines([robe], 'thin', true);
      e.keep = [e.holder(robe)];
      e.lines([cord, cord2], 'hair');
      // The folds, from the cord to where they meet the hem, and a few above it.
      const folds = hemFeet.slice(1, -1).map((x, i): Pt[] => {
        const foot: Pt = [x, hemY(x)];
        return [lerp(F, foot, (waist + 3 + (i % 3) * 6 - F[1]) / (foot[1] - F[1])), foot];
      });
      e.lines(folds, 'hair');
      e.lines(
        [
          [
            [-9, -94],
            [-8, waist - 1],
          ],
          [
            [3, -93],
            [3.5, waist - 0.5],
          ],
        ],
        'hair',
      );
      // Each fold shaded on its far side, a narrow wedge of strokes; the
      // robe shaded down its back, away from the lantern, in strokes along
      // the folds crowding toward its edge; and the chest under the cape.
      const pls: Pt[][] = [];
      folds.forEach(([top, foot]) => {
        for (let j = 1; j <= 3; j++) pls.push([lerp(top, foot, 0.12 + 0.08 * j), [foot[0] + j * 1.05, foot[1]]]);
      });
      for (let i = 0; i < 16; i++) {
        const t = (i + 0.5) / 16;
        const x = 5 + 21.5 * Math.sin((Math.PI / 2) * Math.sqrt(t));
        pls.push([lerp(F, [x, 4], 0.5 + 0.035 * (i % 4)), [x, 4]]);
      }
      for (let x = 9; x < 26; x += 2.1) pls.push([[x, -96], [x - 0.4, waist - 1.5]]);
      e.lines(pls, 'hatch');
      // The cord's knot, and its ends hanging down his front.
      e.keep = [];
      e.lines([circ(knot, 1.5, 0, 360)], 'hair');
      e.lines(
        [
          arc3([knot[0] - 0.7, knot[1] + 1.4], [knot[0] - 1.6, knot[1] + 12], [knot[0] - 0.6, knot[1] + 25]),
          arc3([knot[0] + 0.8, knot[1] + 1.3], [knot[0] + 1, knot[1] + 10], [knot[0] + 2.6, knot[1] + 19]),
        ],
        'hair',
      );
    },
  };

  // ---- the staff, in his left hand, standing at his side.
  const sBase: Pt = [40, 0.6];
  const sTop: Pt = [35, -158];
  const sw = 1.35;
  const sn: Pt = (() => {
    const len = Math.hypot(sTop[0] - sBase[0], sTop[1] - sBase[1]);
    return [-(sTop[1] - sBase[1]) / len, (sTop[0] - sBase[0]) / len];
  })();
  const off = (q: Pt, d: number): Pt => [q[0] + sn[0] * d, q[1] + sn[1] * d];
  const along = (y: number) => lerp(sBase, sTop, (y - sBase[1]) / (sTop[1] - sBase[1]));
  const staffTop = arc3(off(sTop, -sw), at(sTop, -6, sw * 1.15), off(sTop, sw));
  const staff: Poly = chain([off(sBase, sw), off(sBase, -sw)], staffTop);
  const staffPart: Part = {
    ps: staff,
    draw: (e) => {
      e.lines([[off(sBase, -sw), off(sTop, -sw)], [off(sBase, sw), off(sTop, sw)], staffTop], 'thin');
      // Round, and shaded down its far side: lines along it.
      e.lines(
        [0.25, 0.62].map((d) => [off(along(-1.5), sw * d), off(along(-156), sw * d)]),
        'hatch',
      );
      // A band bound round it under the head.
      e.lines([[off(along(-150), -sw), off(along(-150), sw)], [off(along(-148.6), -sw), off(along(-148.6), sw)]], 'hair');
    },
  };

  // ---- his left sleeve, hanging from the shoulder to the hand on the staff.
  const grip = along(-86);
  const lSleeve: Poly = chain(arc3([17, -99], [27, -97], [grip[0] - 2.4, -92.5]), [[grip[0] - 3.4, -82.5]], arc3([grip[0] - 3.4, -82.5], [26, -79], [18, -81.5]));
  const lSleevePart: Part = {
    ps: lSleeve,
    draw: (e) => {
      e.lines([lSleeve], 'thin', true);
      e.lines([[[grip[0] - 4.3, -92.2], [grip[0] - 5.1, -83.2]]], 'hair');
      e.hatch(lSleeve, 95, 0.95, [beyond([20, -93], [40, -88])]);
    },
  };
  // His left hand closed round the staff, the fingers across it.
  const hw = 3;
  const lHand: Poly = chain(
    arc3([grip[0] - hw, grip[1] - 4], [grip[0] - 0.4, grip[1] - 5.2], [grip[0] + hw - 0.4, grip[1] - 4.2]),
    arc3([grip[0] + hw - 0.4, grip[1] - 4.2], [grip[0] + hw + 0.5, grip[1]], [grip[0] + hw - 0.6, grip[1] + 4]),
    arc3([grip[0] + hw - 0.6, grip[1] + 4], [grip[0], grip[1] + 4.9], [grip[0] - hw, grip[1] + 3.6]),
  );
  const lHandPart: Part = {
    ps: lHand,
    draw: (e) => {
      e.lines([lHand], 'thin', true);
      e.keep = [e.holder(lHand, 0.45)];
      e.lines([-1.6, 0.4, 2.3].map((dy) => [[grip[0] - 0.6, grip[1] + dy], [grip[0] + hw + 1, grip[1] + dy - 0.3]] as Pt[]), 'hair');
    },
  };

  // ---- his right sleeve, raised to hold up the lantern: a wide sleeve hanging from the forearm.
  const cuffTop: Pt = [-36.5, -130.5];
  const cuffLow: Pt = [-44.5, -121];
  const rSleeve: Poly = chain(arc3([-8, -111], [-23, -124.5], cuffTop), [cuffLow], arc3(cuffLow, [-35, -99], [-14, -93]));
  const rSleevePart: Part = {
    ps: rSleeve,
    draw: (e) => {
      e.lines([rSleeve], 'thin', true);
      e.keep = [e.holder(rSleeve)];
      // The cuff turned back, and the folds hanging from the forearm.
      e.lines([[lerp(cuffTop, [-23, -124.5], 0.12), lerp(cuffLow, [-35, -99], 0.1)]], 'hair');
      e.lines([arc3([-30.5, -124], [-28, -111], [-26, -98.5]), arc3([-23.5, -121], [-20.5, -108], [-19.5, -96.5])], 'hair');
      // Its upper side, turned from the lantern below, shaded along the arm.
      e.hatch(rSleeve, 52, 1.0, [beyond([-8, -104], [-33, -116])]);
    },
  };

  // ---- the cowl: the hood, peaked and falling back, and its cape over the shoulders.
  const tip: Pt = [4.5, -146.5];
  const brow: Pt = [-18, -129.5];
  const chin: Pt = [-15.5, -115.5];
  const nape: Pt = [12, -121];
  const shoulder: Pt = [23, -109];
  const capeBack: Pt = [25.5, -97];
  const capeFront: Pt = [-19, -95.5];
  const hoodTop = chain(arc3(brow, [-8, -144], tip), arc3(tip, [13.5, -134.5], nape));
  const capeHem = arc3(capeBack, [3, -90.5], capeFront);
  const cowl: Poly = chain(hoodTop, arc3(nape, [18.5, -116.5], shoulder), arc3(shoulder, [25.5, -103.5], capeBack), capeHem, arc3(capeFront, [-18.2, -106], chin), arc3(chin, [-19, -122.5], brow));
  const rimFoot: Pt = [-7.5, -115];
  const rim = arc3(brow, [-9.5, -124], rimFoot);
  const opening: Poly = chain(arc3(rimFoot, [-11.5, -116.2], chin), arc3(chin, [-19, -122.5], brow), rim.slice(1, -1));
  const cowlPart: Part = {
    ps: cowl,
    draw: (e) => {
      e.lines([cowl], 'thin', true);
      // The opening's rim, and the fold of cloth round it.
      e.lines([rim, arc3(rimFoot, [-11.5, -116.2], chin)], 'thin');
      e.keep = [e.holder(cowl)];
      e.front.push(e.hider(opening, 0.7));
      e.lines([arc3(lerp(brow, [-8, -144], 0.1), [-5.5, -125], [-4.5, -114])], 'hair');
      // The hood's seam down its back, and the cape's folds.
      e.lines([arc3([-3, -142], [7, -132], [9.5, -119])], 'hair');
      e.lines(
        [
          [
            [-4, -111],
            [-5.5, -92],
          ],
          [
            [8, -112],
            [9, -91],
          ],
          [
            [17.5, -110],
            [19.5, -93.5],
          ],
        ],
        'hair',
      );
      // Shaded down its back, away from the light.
      e.hatch(cowl, 60, 0.95, [beyond([6, -90], [-2, -150])]);
      e.front.pop();
    },
  };

  // ---- the beard, long and white, falling from the dark of the hood over his chest.
  const bTopL: Pt = [-16.6, -115.8];
  const bTopR: Pt = [-7.6, -114.8];
  const bTip: Pt = [-17.5, -82];
  const beard: Poly = chain(arc3(bTopL, [-20.5, -100], bTip), arc3(bTip, [-8.6, -97], bTopR));
  const beardPart: Part = {
    ps: beard,
    draw: (e) => {
      e.lines([beard.slice(0, -1)], 'thin');
      e.keep = [e.holder(beard, 0.45)];
      const pls: Pt[][] = [];
      for (let i = 1; i < 7; i++) {
        const t = i / 7;
        const top = lerp(bTopL, bTopR, t);
        const end = lerp(bTip, top, 0.12 + 0.5 * Math.abs(t - 0.45) ** 1.5);
        const mid = lerp(top, end, 0.5);
        pls.push(arc3(top, [mid[0] - 1.6 - 0.8 * (1 - t), mid[1]], end));
      }
      e.lines(pls, 'hair');
    },
  };

  // ---- the lantern, hung from his raised hand by a ring.
  const L = STAR;
  const body = { x: 8.5, top: L[1] - 9.5, foot: L[1] + 8.6 };
  const [x, t, b] = [L[0], body.top, body.foot];
  const roof: Poly = [
    [x - 1.6, t - 9.2],
    [x + 1.6, t - 9.2],
    [x + 10, t - 1.6],
    [x - 10, t - 1.6],
  ];
  const base: Poly = [
    [x - 10, b + 1.6],
    [x - 3, b + 5],
    [x + 3, b + 5],
    [x + 10, b + 1.6],
  ];
  const lanternOutline: Poly = [...roof.slice(0, 3), [x + 10, t], [x + body.x, t], [x + body.x, b], [x + 10, b], ...base.slice().reverse(), [x - 10, b], [x - body.x, b], [x - body.x, t], [x - 10, t], roof[3]];
  const ring: Pt = [x, t - 11];
  const right = beyond([x + 0.6, 10], [x + 0.6, -10]);
  const lanternPart: Part = {
    ps: lanternOutline,
    draw: (e) => {
      e.front.push(region(circ(L, STAR_R + 1.4, 0, 360)));
      // The roof, its eave, the base and its foot.
      e.lines([roof], 'thin', true);
      e.lines(
        [
          [
            [x - 10, t - 1.6],
            [x - 10, t],
            [x + 10, t],
            [x + 10, t - 1.6],
          ],
          [
            [x - 10, b],
            [x + 10, b],
            [x + 10, b + 1.6],
            [x - 10, b + 1.6],
            [x - 10, b],
          ],
          base,
        ],
        'thin',
      );
      // The body's six sides seen from the front: its corners as bars.
      e.lines([-body.x, -body.x / 2, body.x / 2, body.x].map((dx) => [[x + dx, t], [x + dx, b]] as Pt[]), 'thin');
      // The roof and the foot shaded on their right.
      e.hatch(roof, 0, 0.75, [right]);
      e.hatch(base, 0, 0.75, [right]);
      // The ring it hangs by.
      e.lines([circ(ring, 1.7, 0, 360)], 'hair');
      // The star burning inside.
      e.front.pop();
      sealOfLight(e, L, STAR_R);
    },
  };

  // ---- his right hand, closed round the ring.
  const H: Pt = [ring[0] + 1.6, ring[1] - 4.2];
  const rHand: Poly = chain(
    arc3([H[0] - 3, H[1] + 2.4], [H[0] - 3.3, H[1] - 1.6], [H[0] + 0.4, H[1] - 3.4]),
    arc3([H[0] + 0.4, H[1] - 3.4], [H[0] + 3.2, H[1] - 1.4], [H[0] + 2.8, H[1] + 2.2]),
    arc3([H[0] + 2.8, H[1] + 2.2], [H[0], H[1] + 3.1], [H[0] - 3, H[1] + 2.4]),
  );
  const rHandPart: Part = {
    ps: rHand,
    draw: (e) => {
      e.lines([rHand], 'thin', true);
      e.keep = [e.holder(rHand, 0.45)];
      e.lines([-0.9, 0.9].map((dy) => [[H[0] - 3, H[1] + dy], [H[0] + 1.2, H[1] + dy - 0.2]] as Pt[]), 'hair');
    },
  };

  const parts: Part[] = [];
  if (ledge) parts.push(ledgePart());
  parts.push(staffPart, robePart, lSleevePart, lHandPart, rSleevePart, cowlPart, beardPart, lanternPart, rHandPart);
  drawParts(e, parts);
  for (const part of parts) e.knock(part.ps);
}

/** Where the light falls from, on the ledge: the lantern's side, above and in front. */
const LIGHT3 = (() => {
  const v = [-0.6, -0.45, 0.66];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

/**
 * The ledge he stands on, where the pedestal would be: a crag cut in flat
 * facets, each lit by how it faces the lantern (its corners given a depth,
 * so each facet has a true normal), those turned away hatched along the
 * line it keeps its depth on, closer the darker. Only the edges where the
 * light changes are cut.
 */
function ledgePart(): Part {
  type P3 = [number, number, number];
  // Its top's back edge, its top's front edge, a ridge across its face, and its foot.
  const back: Pt[] = [
    [-42, 2],
    [-30, -1.6],
    [-8, -3.2],
    [16, -3],
    [36, -1.4],
    [46.5, 3.5],
  ];
  const top: P3[] = [
    [-50, 12, -3],
    [-41, 4.2, 0],
    [-22, 3, 1],
    [-3, 4.4, 0],
    [17, 3, 1],
    [35, 3.6, 0],
    [48, 6.5, -1],
    [55, 14, -4],
  ];
  const mid: P3[] = [
    [-55, 21, -1],
    [-37, 14.5, 7],
    [-14, 18, 4],
    [7, 14, 8],
    [27, 17.5, 5],
    [44, 15.5, 4],
    [58, 22, -3],
  ];
  const foot: P3[] = [
    [-59, 30, 0],
    [-46, 30, 5],
    [-27, 30, 7],
    [-4, 30, 6],
    [16, 30, 7],
    [36, 30, 5],
    [52, 30, 3],
    [61, 30, 0],
  ];
  const flat = (q: P3): Pt => [q[0], q[1]];
  const outline: Poly = chain(back.slice(0, -1), top.slice(-2).map(flat), [flat(mid.at(-1)!), flat(foot.at(-1)!), flat(foot[0]), flat(mid[0])], top.slice(0, 2).map(flat), [back[0]]);
  // The face in facets: between the top's edge and the ridge, and the ridge and the foot, staggered.
  const facets: P3[][] = [
    [top[0], top[1], mid[1], mid[0]],
    [top[1], top[2], mid[1]],
    [top[2], top[3], mid[2], mid[1]],
    [top[3], top[4], mid[3], mid[2]],
    [top[4], top[5], mid[4], mid[3]],
    [top[5], top[6], mid[5], mid[4]],
    [top[6], top[7], mid[6], mid[5]],
    [mid[0], mid[1], foot[1], foot[0]],
    [mid[1], foot[2], foot[1]],
    [mid[1], mid[2], foot[2]],
    [mid[2], mid[3], foot[3], foot[2]],
    [mid[3], foot[4], foot[3]],
    [mid[3], mid[4], foot[4]],
    [mid[4], mid[5], foot[5], foot[4]],
    [mid[5], foot[6], foot[5]],
    [mid[5], mid[6], foot[7], foot[6]],
  ];
  /** How each facet faces the light, by Newell's normal (its corners need not lie in one plane). */
  const shade = facets.map((f) => {
    const n = [0, 0, 0];
    f.forEach((a, i) => {
      const b = f[(i + 1) % f.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]);
      n[1] += (a[2] - b[2]) * (a[0] + b[0]);
      n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    });
    if (n[2] < 0) n.forEach((_, i) => (n[i] = -n[i]));
    const len = Math.hypot(...n);
    return { n, lit: (n[0] * LIGHT3[0] + n[1] * LIGHT3[1] + n[2] * LIGHT3[2]) / len };
  });
  return {
    ps: outline,
    draw: (e) => {
      e.lines([outline], 'thin', true);
      e.lines([top.slice(1, -1).map(flat)], 'thin');
      // The edges between facets, where the light changes across them.
      const edges = new Map<string, { a: Pt; b: Pt; lit: number[] }>();
      facets.forEach((f, i) =>
        f.forEach((a, j) => {
          const b = f[(j + 1) % f.length];
          const key = [a, b]
            .map((q) => q.join())
            .sort()
            .join('|');
          const edge = edges.get(key) ?? { a: flat(a), b: flat(b), lit: [] };
          edge.lit.push(shade[i].lit);
          edges.set(key, edge);
        }),
      );
      e.keep = [e.holder(outline, 0.3)];
      e.lines([...edges.values()].filter((x) => x.lit.length === 2 && Math.abs(x.lit[0] - x.lit[1]) > 0.06).map((x) => [x.a, x.b]), 'hair');
      e.keep = [];
      facets.forEach((f, i) => {
        const { n, lit } = shade[i];
        if (lit > 0.66) return;
        // Along the line on which it keeps its depth.
        const deg = (Math.atan2(-n[1], -n[0]) * 180) / Math.PI;
        e.hatch(f.map(flat), deg, lit < 0.42 ? 0.75 : 1.15);
      });
    },
  };
}

// ---- the faces ------------------------------------------------------------------

/** The Hermit on a tall face, standing where the pedestal stood. */
function hermitTall(p: Plate, g: TallLayout) {
  const k = g.w / 218;
  const o: Pt = [g.arch.A[0] + 4 * k, g.floor - 27 * k];
  const e = new Engraver(p, o, k);
  // The pedestal gives way to his ledge.
  const { capTop, capR, baseR } = g.pedestal;
  const m = g.arch.A[0];
  p.knockout += `M${pt([m - capR - 2, capTop - 7])}L${pt([m + capR + 2, capTop - 7])}L${pt([m + baseR + 2, g.floor - 6])}L${pt([m + baseR + 2, g.panel[3] + 1])}L${pt([m - baseR - 2, g.panel[3] + 1])}L${pt([m - baseR - 2, g.floor - 6])}Z`;
  hermitFigure(e);
  // His light: a glory out of the lantern, faded from it.
  const c = e.P(STAR);
  p.fade = { c, from: STAR_R * k * 2.2, r: 190 * k };
}

/** The glory as the lantern's light: fine rays out of its star to the arch and the floor, long and short in turn. */
function lanternGlory(p: Plate, c: Pt, reach: (q: Pt, deg: number) => number, r0: number, n: number) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * 360;
    const r1 = reach(c, a) - 2;
    const end = i % 2 ? r0 + (r1 - r0) * 0.55 : r1;
    if (end - r0 > 3) d += `M${pt(at(c, a, r0))}L${pt(at(c, a, end))}`;
  }
  p.add(d, 'ray');
}

/** How far a ray out of `q` at `deg` runs inside the window of a tall face (to the arch's inner line and the floor). */
const windowReach = (g: TallLayout) => (q: Pt, deg: number) => {
  const u: Pt = [Math.sin(rad(deg)), -Math.cos(rad(deg))];
  const { A, ri } = g.arch;
  const ts: number[] = [];
  if (u[1] > 1e-9) ts.push((g.floor - q[1]) / u[1]);
  if (Math.abs(u[0]) > 1e-9) {
    const t = ((u[0] > 0 ? A[0] + ri : A[0] - ri) - q[0]) / u[0];
    if (q[1] + t * u[1] >= A[1]) ts.push(t);
  }
  const [fx, fy] = [q[0] - A[0], q[1] - A[1]];
  const b = fx * u[0] + fy * u[1];
  const disc = b * b - (fx * fx + fy * fy - ri * ri);
  if (disc > 0) {
    const t = -b + Math.sqrt(disc);
    if (q[1] + t * u[1] <= A[1]) ts.push(t);
  }
  return Math.min(...ts.filter((t) => t > 0));
};

/** The Hermit in a row, beside the divider. */
function hermitRow(p: Plate, g: RowLayout) {
  const k = (g.h - 14) / 176;
  const o: Pt = [g.emblem[0] + 4 * k, g.h - 7 - 6 * k];
  const e = new Engraver(p, o, k);
  hermitFigure(e, false);
  // The ground he stands on, a line to either side.
  const y = o[1] + 1.4 * k;
  p.add(`M${pt([g.emblem[0] - 46, y])}L${pt([o[0] - 30 * k, y])}M${pt([o[0] + 32 * k, y])}L${pt([g.divider - 10, y])}`, 'hair');
  const c = e.P(STAR);
  p.motif = false;
  const box = [10, 8, g.divider - 7, y - 1];
  lanternGlory(p, c, (q, deg) => {
    const u: Pt = [Math.sin(rad(deg)), -Math.cos(rad(deg))];
    const ts = [u[0] > 1e-9 ? (box[2] - q[0]) / u[0] : u[0] < -1e-9 ? (box[0] - q[0]) / u[0] : Infinity, u[1] > 1e-9 ? (box[3] - q[1]) / u[1] : u[1] < -1e-9 ? (box[1] - q[1]) / u[1] : Infinity];
    return Math.min(...ts);
  }, STAR_R * k * 2, 56);
  p.motif = true;
  p.fade = { c, from: STAR_R * k * 2, r: 80 };
}

// ---- the spandrels and the back -------------------------------------------------

/** The star of the lantern in a spandrel or at the heart of the back: the Seal woven, a glow at its heart, pointed rays from its six points and fine ones between. */
function starSeal(p: Plate, c: Pt, r: number) {
  const e = new Engraver(p, c, r / 10);
  sealOfLight(e, [0, 0], 10, 'sign');
  let rays = '';
  for (let k = 0; k < 6; k++) {
    const a = k * 60 + 30;
    const ray = pointedRay(c, a, r * 1.04, r * 1.55, 4, 0.7);
    rays += ray.lines;
    p.add(ray.hatch, 'hatch');
  }
  p.add(rays, 'hair');
  let fine = '';
  for (let k = 0; k < 6; k++) fine += `M${pt(at(c, k * 60, r * 0.62))}L${pt(at(c, k * 60, r * 1.25))}`;
  p.add(fine, 'hair');
}

function spandrels(p: Plate, sol: Hole, luna: Hole) {
  starSeal(p, sol.c, sol.r * 0.62);
  p.luna(luna.c, (luna.r / 8.5) * 0.95, 180);
}

function hermitBack(p: Plate, g: BackLayout) {
  const r = g.row ? 8 : 15;
  starSeal(p, g.c, r);
  p.motif = false;
  let d = '';
  const n = g.row ? 72 : 96;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * 360;
    const r1 = g.room(a);
    const end = i % 2 ? r * 1.7 + (r1 - r * 1.7) * 0.6 : r1;
    if (end - r * 1.7 > 3) d += `M${pt(at(g.c, a, r * 1.7))}L${pt(at(g.c, a, end))}`;
  }
  p.add(d, 'ray');
  p.motif = true;
}

/** The plate of the Hermit's card. */
export const hermitVariant: Variant = {
  spandrels: (p, sol, luna) => spandrels(p, sol, luna),
  // His light is drawn from the lantern, over the face.
  glory: () => {},
  face: (p, g) => {
    if (g.row) hermitRow(p, g);
    else {
      p.motif = false;
      const k = g.w / 218;
      const c: Pt = [g.arch.A[0] + 4 * k + STAR[0] * k, g.floor - 27 * k + STAR[1] * k];
      lanternGlory(p, c, windowReach(g), STAR_R * k * 2.2, 88);
      p.motif = true;
      hermitTall(p, g);
    }
  },
  back: hermitBack,
};

