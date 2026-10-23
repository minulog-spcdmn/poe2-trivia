// The answer's right and wrong, engraved (docs/arcane-style.md): a tick and a
// cross cut as burin strokes, each stroke a blade that swells from its
// point, lit on the side the light comes from (above) and shaded on the
// other, and the hour run out as an hourglass whose sand has all fallen.
// The answer tiles' marks (AnswerMark) and the verdict's seal (VerdictSign)
// are both cut from these. On a grid of ±12; the strokes reach about ±8.

import { hatch, lerp, pt, ringParts, wear, type Part, type Pt } from './arcane.ts';

/** One stroke of a mark: its two facets, its outline, and the way the pen runs along it. */
export type Blade = {
  /** The facet towards the light, and the one away from it (closed paths). */
  lit: string;
  shade: string;
  /** Its edge all round, and the shaded facet's hatching (for a mark large enough to show it). */
  edge: string;
  hatch: string;
  /** The pen: along the stroke from where it starts to where it ends, run on a little past both. */
  pen: string;
  /** How wide the pen has to be to cover it. */
  reach: number;
};

const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
const add = (p: Pt, v: Pt, k = 1): Pt => [p[0] + v[0] * k, p[1] + v[1] * k];
const unit = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
};
const poly = (pts: Pt[]) => `M${pts.map(pt).join('L')}Z`;
/** The normal to a stroke running along `d` on the side the light comes from: above (or, for an upright stroke, the left). */
const towardLight = ([x, y]: Pt): Pt => (x > 0 || (x === 0 && y < 0) ? [y, -x] : [-y, x]);
/** A blade's shaded facet hatched along its length, `HATCH` apart across it, from its line out to its swell `R`, `w` from the line. */
const HATCH = 0.42;
/** How far the pen runs on past a stroke's ends, so its points (and the mitres of their edges) are whole. */
const RUN = 1.5;
const hatchAlong = (p: Pt, R: Pt, q: Pt, w: number) => hatch(p, R, q, (HATCH * Math.hypot(R[0] - p[0], R[1] - p[1])) / w);

/** A half-plane a stroke keeps to: the side of the line through `o` that `n` points to. */
type Side = { o: Pt; n: Pt };
const onSide = (p: Pt, { o, n }: Side) => (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1];

/** Sutherland-Hodgman: what is left of the convex polygon `pts` on `side`. */
function keepSide(pts: Pt[], side: Side): Pt[] {
  const out: Pt[] = [];
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const [sp, sq] = [onSide(p, side), onSide(q, side)];
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) out.push(lerp(p, q, sp / (sp - sq)));
  });
  return out;
}

/** What is left of the line from `p` to `q` on `side`, or nothing. */
function lineOnSide(p: Pt, q: Pt, side: Side) {
  const [sp, sq] = [onSide(p, side), onSide(q, side)];
  if (sp < 0 && sq < 0) return '';
  const [a, b] = [sp < 0 ? lerp(p, q, sp / (sp - sq)) : p, sq < 0 ? lerp(q, p, sq / (sq - sp)) : q];
  return `M${pt(a)}L${pt(b)}`;
}

/**
 * A blade from its point `p` to its point `q`: it swells to `w` either side
 * over its first quarter, keeps that width and narrows again over its last,
 * so it reads as a stroke rather than a diamond. Cut from `p`. `pieces`, if
 * given, are the half-planes its pieces keep to: where it passes under
 * another stroke, it is cut away.
 */
function blade(p: Pt, q: Pt, w: number, pieces: Side[] = []): Blade {
  const d = unit(sub(q, p));
  const n = towardLight(d);
  const [m1, m2] = [lerp(p, q, 0.28), lerp(q, p, 0.28)];
  const [L1, L2, R1, R2] = [add(m1, n, w), add(m2, n, w), add(m1, n, -w), add(m2, n, -w)];
  const cut = (pts: Pt[]) => (pieces.length ? pieces.map((side) => poly(keepSide(pts, side))).join('') : poly(pts));
  // Lines along the stroke, stepping from its middle out to its shaded edge, each from slope to slope.
  const count = Math.floor(w / HATCH);
  const lines = Array.from({ length: count }, (_, i): [Pt, Pt] => {
    const k = (i + 1) / (count + 1);
    return [lerp(p, R1, k), lerp(q, R2, k)];
  });
  const hatchLines = lines.map(([a, b]) => (pieces.length ? pieces.map((side) => lineOnSide(a, b, side)).join('') : `M${pt(a)}L${pt(b)}`)).join('');
  return {
    lit: cut([p, L1, L2, q]),
    shade: cut([p, R1, R2, q]),
    edge: cut([p, L1, L2, q, R2, R1]),
    hatch: hatchLines,
    pen: `M${pt(add(p, d, -RUN))}L${pt(add(q, d, RUN))}`,
    reach: 2 * w + 4,
  };
}

/** Where the line through `a` and `b` meets the one through `c` and `d`. */
function meet(a: Pt, b: Pt, c: Pt, d: Pt): Pt {
  const [r, s] = [sub(b, a), sub(d, c)];
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / (r[0] * s[1] - r[1] * s[0]);
  return add(a, r, t);
}

/**
 * The tick, in one movement: from its point down into the turn, swelling,
 * and on up out of it to its other point, swelling again. The turn is solid:
 * the two arms' edges carried on until they meet, sharp inside, mitred
 * outside, the ridge running through it.
 */
export const CHECK: Blade[] = (() => {
  const [p, turn, q]: Pt[] = [
    [-8, 0.2],
    [-2.6, 6.2],
    [8.6, -7.2],
  ];
  // Each arm swells to `w` at `t` of the way from its point, and is still `e` either side at the turn.
  const [w1, t1, w2, t2, e] = [1.75, 0.6, 1.95, 0.7, 1];
  const [d1, d2] = [unit(sub(turn, p)), unit(sub(q, turn))];
  const [n1, n2] = [towardLight(d1), towardLight(d2)];
  const [m1, m2] = [lerp(p, turn, t1), lerp(q, turn, t2)];
  const [a1, b1, a2, b2] = [add(m1, n1, w1), add(m1, n1, -w1), add(m2, n2, w2), add(m2, n2, -w2)];
  // The light falls inside the turn: its inner corner on the lit side, its outer on the shaded.
  const inner = meet(a1, add(turn, n1, e), a2, add(turn, n2, e));
  const outer = meet(b1, add(turn, n1, -e), b2, add(turn, n2, -e));
  return [
    {
      lit: poly([p, a1, inner, a2, q, turn]),
      shade: poly([p, b1, outer, b2, q, turn]),
      edge: poly([p, a1, inner, a2, q, b2, outer, b1]),
      hatch: hatchAlong(p, b1, turn, w1) + hatchAlong(q, b2, turn, w2),
      pen: `M${pt(add(p, d1, -RUN))}L${pt(turn)}L${pt(add(q, d2, RUN))}`,
      reach: 2 * Math.max(w1, w2) + 4,
    },
  ];
})();

/**
 * The cross: one stroke from top left to bottom right, then the other, which
 * passes under it, cut clear of it either side as an engraver draws a
 * strand beneath another.
 */
export const CROSS: Blade[] = (() => {
  const w = 1.6;
  // The first stroke at the crossing is `w` either side of its line: the second stops 0.7 short of that.
  const n = unit([1, -1]);
  const clear = w + 0.7;
  const pieces: Side[] = [
    { o: add([0, 0], n, clear), n },
    { o: add([0, 0], n, -clear), n: [-n[0], -n[1]] },
  ];
  return [blade([-7.4, -7.4], [7.4, 7.4], w), blade([7.4, -7.4], [-7.4, 7.4], w, pieces)];
})();

/**
 * The hour run out: an hourglass (alchemy's HOUR, grown), its sand all in
 * the lower bulb, hatched, and a last grain falling through the neck.
 */
export const HOURGLASS = {
  edge: 'M-3.9 -5.45H3.9L-3.9 5.45H3.9Z',
  // Its frame: a bar across the top and the foot, clear of the seal's inner ring.
  frame: 'M-5 -6.8H5M-5 6.8H5',
  // The sand: a heap in the lower bulb, clear of its sides, hatched level as strata (0.47 apart up its 2.95).
  sand: 'M-3 4.85L0 1.9L3 4.85Z',
  sandHatch: hatch([-3, 4.85], [0, 1.9], [3, 4.85], (0.47 * Math.hypot(3, 2.95)) / 2.95),
  // The last grain, falling clear of the neck.
  grain: 'M0 0.7V1.2',
};

/** The seal's rings: the outer worn (the same nicks on every seal), the inner whole. */
export const SEAL = {
  outer: ringParts([0, 0], 11, { wear: wear(211) }) as Part[],
  inner: 9.5,
};
