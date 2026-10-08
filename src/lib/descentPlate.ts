// The descent plate on Delve's rules page (DelveLadder.svelte): the pit the
// players go down, engraved as the alchemist's circle is (docs/arcane-style.md).
//
// Sol stands over the mouth of a pit seen a little from above. The pit
// narrows down through the ten zones, each a ring of terrace whose edge is
// an ellipse (its near half firm, its far half a hairline passing behind
// the seal above). Each terrace holds a seal on the pit's axis: a zone you
// have reached is struck in its colour with its sigil (lib/zoneSigils) and
// named in the margin, its terrace lit; one you haven't is a dull
// impression, an empty hollow, and the zones not reached yet are bracketed
// together in the margin under one word, "uncharted".
//
// Past the tenth zone the pit never ends: its walls carry on, breaking into
// shorter and shorter dashes as they fade into the dark round a last, larger
// seal holding the ouroboros, an engraved serpent biting its tail, which
// turns slowly. No floor is ever drawn.
//
// Two eight-pointed stars in a glory of rays stand in a lane on the pit's
// left, between the zones' names and the rock: a gold one at your deepest
// (at the mouth before a first run) and a red one at your last run, each
// with its depth under it. Past 100 a star sits inside the ouroboros, its
// depth beside the seal. When the two would overlap, only the gold one is
// drawn. A small legend left of the ouroboros says which star is which.
//
// Each find you have met is tied to its heading (`beside`: the finds list
// to the right of the plate) or to its callout (stacked on a phone or a
// tablet: the plate stands the finds' items and names on its own right) by
// a gold line: from the heading a short level stub, one straight slant,
// then a short level handle into the right wall at the depth where it first
// turns up, that depth written by it. The lines, their depths, the stars
// and their depths are fitted together (fitLeaders()) so that none of them
// crosses another.
//
// Everything is exact geometry in px: the pit's sides are straight lines
// converging downward, every terrace an ellipse whose depth is a fifth of
// its width, every ring a circle, Sol's rays and the stars' glories radial;
// lines stop short of every seal, sign and word (holes; the stars' own
// cutouts are masks in the component, so they move with a star); the rock
// beside the pit and the terraces' faces are shaded in one-sided hatching
// (the light falls from the upper left, as on the cards); main lines carry
// a few nicks of wear. Each stroke comes with its timing, so the plate draws
// itself in from the surface down as one sweep of the pen; then the gold
// star comes down the lane from the mouth to your deepest and the red one
// appears where your last run ended.

import { at, hatch, line, seeded, star8, type Hole as Disc } from './arcane.ts';
import { FINDS_IN_ORDER, shownDepth, type FindKind } from './delve.ts';
import { STRATA } from './descent.ts';
import { sigilOf, type Sigil } from './zoneSigils.ts';

export type Pt = [number, number];
/** A box: left, top, right, bottom. */
export type Box = [number, number, number, number];
/** main: an outline; thin: a second line; hair: the finest. */
export type Kind = 'main' | 'thin' | 'hair';
/** A piece of a line, when the pen reaches it and how long it takes over it (s); `o` fades it (the endless stretch). */
export type Stroke = {
  d: string;
  kind: Kind;
  delay: number;
  t: number;
  o?: number;
};
/** What lines stop short of: a circle, a box, or a polygon. */
type Hole = { c: Pt; r: number } | { box: Box } | { poly: Pt[] };
/**
 * A set of lines in one tone: gold (the plate's lines), dull (what is not
 * reached yet), zone (a reached zone's, in `color`), lead (a find's line,
 * gold and finer). `lit` ones have a glow under them: the same lines whole
 * (unworn), drawn wide and soft.
 */
export type Tone = 'gold' | 'dull' | 'zone' | 'lead';
export type Part = {
  tone: Tone;
  color?: string;
  lit: boolean;
  strokes: Stroke[];
  glow: { d: string; kind: Kind }[];
};
/** Hatching (one path, drawn at once), in the tone of its zone or dull; `o` fades it. */
export type Shade = {
  d: string;
  tone: Tone;
  color?: string;
  delay: number;
  t: number;
  o?: number;
};
export type Seal = {
  k: number;
  c: Pt;
  r: number;
  known: boolean;
  name?: string;
  color?: string;
  sigil?: Sigil;
  delay: number;
  hollow?: string;
};
/** The zones not reached yet, under one word: the bracket's lines, and where the word sits. */
export type Uncharted = { d: string; x: number; y: number; delay: number };
/** A find's heading beside the plate, where its line ends: the left of its item and the middle of its line, in the plate's px. */
export type Target = { kind: FindKind; x: number; y: number };
/** A callout as the page sets it (stacked): its left and size, and its item's and its name's boxes inside it (from its top left). */
export type CalloutShape = {
  x: number;
  w: number;
  h: number;
  icon: Box;
  name: Box;
};
/** Where a callout stands (its top, in the plate's px), and whether you have met its find (only then is it tied to the pit). */
export type Callout = {
  kind: FindKind;
  top: number;
  met: boolean;
  delay: number;
};
/** A find you have met: the station on the wall where it first turns up. */
export type Station = { kind: FindKind; c: Pt; delay: number };
/** A depth written by a find's line, centred on `x`, `y`. */
export type Mark = {
  kind: FindKind;
  text: string;
  x: number;
  y: number;
  delay: number;
};
/**
 * The ouroboros about 0, 0 (the component turns it): its outline, the plates
 * across its belly, the line along its side, its scales, its head (outline,
 * brow, lips, jaw and fang), the shading under its jaw, its eye.
 */
export type Serpent = {
  body: string;
  belly: string;
  scales: string;
  head: string;
  details: string;
  shade: string;
  eye: { c: Pt; r: number };
  pupil: string;
};
/**
 * A star, drawn about its centre `c` (its outline, ridges, hatching and glory
 * are about 0, 0, so the glory can turn), its depth by it. The gold one comes
 * down from the mouth (`from`, relative to `c`, by way of `mid` when it goes
 * into the ouroboros) in `travel` s, starting at `delay`; the red one appears
 * at `delay`. `cut` is the radius its cutout clears round it.
 */
export type Star = {
  c: Pt;
  r: number;
  gloryR: number;
  outline: string;
  ridges: string;
  hatch: string;
  glory: string;
  cut: number;
  inSnake: boolean;
  delay: number;
  from: Pt;
  mid: Pt | null;
  travel: number;
  num: {
    text: string;
    x: number;
    y: number;
    anchor: 'middle' | 'start';
  } | null;
};
/** The legend left of the ouroboros: a row for each star drawn, its small star at `x`, its words after it. */
export type Legend = {
  x: number;
  rows: { kind: 'best' | 'last'; y: number }[];
  delay: number;
};
export type Plate = {
  w: number;
  h: number;
  /** The height the plate wants at this width (stacked, where the page gives it its own height). */
  natural: number;
  parts: Part[];
  shades: Shade[];
  seals: Seal[];
  sol: { c: Pt; r: number };
  names: { x: number; y: number; text: string; color: string; delay: number }[];
  uncharted: Uncharted | null;
  stations: Station[];
  marks: Mark[];
  /** Stacked: the finds' callouts on the plate's right; null beside the finds list. */
  callouts: Callout[] | null;
  /** The last seal, on the endless stretch, holding the ouroboros; lit past 100. */
  endless: { c: Pt; r: number; lit: boolean; delay: number; serpent: Serpent };
  legend: Legend;
  /** Your deepest (gold), and your last run (red; null when there is none, or it would overlap the gold one). */
  star: Star;
  last: Star | null;
};
export type Layout = {
  /** The column's caption ("The descent"), which Sol stands beside. */
  caption?: Box | null;
  /** The finds list beside the plate: its headings' items, and where its text starts (lines and figures stay left of it). */
  beside?: { targets: Target[]; wall: number } | null;
  /** Stacked: the callouts' shapes, as measured on the page. */
  callouts?: Partial<Record<FindKind, CalloutShape>> | null;
  /** The zones' names as set (px), measured on the page. */
  nameW?: number[] | null;
  /** The legend's words as set (px): "your best" and "last run". */
  legendW?: { best: number; last: number } | null;
};

export const f = (v: number) => v.toFixed(2);
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Whether `p` is inside the polygon (even-odd). */
const inPoly = (p: Pt, poly: Pt[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
const inHole = (p: Pt, h: Hole) => ('c' in h ? dist(p, h.c) < h.r : 'box' in h ? p[0] > h.box[0] && p[0] < h.box[2] && p[1] > h.box[1] && p[1] < h.box[3] : inPoly(p, h.poly));
const grow = (b: Box, d: number): Box => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
/** The pen's pace: fast at first, slowing at the end (the circle's stroke()). */
const ease = (u: number) => 1 - Math.sqrt(1 - Math.min(1, Math.max(0, u)));
const path = (pts: Pt[]) => 'M' + pts.map((q) => `${f(q[0])} ${f(q[1])}`).join('L');
const steps = (a0: number, a1: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n);

/** The plate's wear: nicks of 0.5 to 0.9 px every 110 or so, from a fixed seed, as cuts in [0, 1] of a line `len` long. */
type Wear = ((len: number) => [number, number][]) | null;
const wearOf = (seed: number): Wear => {
  const rnd = seeded(seed);
  return (len) =>
    Array.from({ length: Math.round((len / 110) * (0.4 + rnd() * 1.2)) }, () => {
      const t = 0.12 + rnd() * 0.76;
      const w = (0.5 + rnd() * 0.4) / len;
      return [t - w / 2, t + w / 2];
    });
};

/**
 * A line through `pts`, straight or curved, as the pen draws it in `t`
 * seconds after `delay`: broken where it meets a hole or a nick, each piece
 * starting when the pen reaches it (so a broken line still draws as one
 * stroke rather than as scattered dashes). It keeps the points of a curve,
 * so the small rings stay round.
 */
function pen(pts: Pt[], kind: Kind, delay: number, t: number, { holes = [], wear = null, o }: { holes?: Hole[]; wear?: Wear; o?: number } = {}): Stroke[] {
  const ds: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const n = Math.max(1, Math.ceil(dist(pts[i - 1], pts[i]) / 0.3));
    for (let k = 1; k <= n; k++) ds.push(lerp(pts[i - 1], pts[i], k / n));
  }
  const run = [0];
  for (let i = 1; i < ds.length; i++) run.push(run[i - 1] + dist(ds[i - 1], ds[i]));
  const len = run.at(-1)! || 1;
  const cuts = wear ? wear(len) : [];
  const gone = ds.map((p, i) => holes.some((h) => inHole(p, h)) || cuts.some(([a, b]) => run[i] / len > a && run[i] / len < b));
  const out: Stroke[] = [];
  for (let i = 0; i < ds.length; i++) {
    if (gone[i]) continue;
    let j = i;
    while (j + 1 < ds.length && !gone[j + 1]) j++;
    if (run[j] - run[i] > 0.25) {
      const seg = ds.slice(i, j + 1);
      const [p, q] = [seg[0], seg.at(-1)!];
      const chord = dist(p, q);
      // A straight piece needs only its ends; a curve keeps every other point.
      const straight = chord > 0.2 && seg.every((s) => Math.abs((s[0] - p[0]) * (q[1] - p[1]) - (s[1] - p[1]) * (q[0] - p[0])) / chord < 0.02);
      const keep = straight ? [p, q] : seg.filter((_, k) => k % 2 === 0 || k === seg.length - 1);
      const [a, b] = [ease(run[i] / len), ease(run[j] / len)];
      out.push({
        d: path(keep),
        kind,
        delay: delay + a * t,
        t: Math.max(0.03 * t, (b - a) * t),
        ...(o === undefined ? {} : { o }),
      });
    }
    i = j;
  }
  return out;
}
/** A line's pieces as one path, with no timing (the serpent's lines, drawn at once). */
const cut = (pts: Pt[], holes: Hole[] = []) =>
  pen(pts, 'hair', 0, 0, { holes })
    .map((s) => s.d)
    .join('');

/**
 * A line from `p` to `q` that breaks up as it goes: dashes `dash(i)` long
 * with gaps `gap(i)` between them, each fainter than the last (`fade(i)`),
 * drawn by one sweep of the pen.
 */
function dashes(p: Pt, q: Pt, kind: Kind, delay: number, t: number, dash: (i: number) => number, gap: (i: number) => number, fade: (i: number) => number, holes: Hole[] = []): Stroke[] {
  const L = dist(p, q);
  const out: Stroke[] = [];
  let s = 0;
  for (let i = 0; s < L && i < 60; i++) {
    const e = Math.min(L, s + dash(i));
    const o = fade(i);
    if (o > 0.04 && e - s > 0.3) out.push(...pen([lerp(p, q, s / L), lerp(p, q, e / L)], kind, delay + (s / L) * t, ((e - s) / L) * t, { holes, o }));
    s = e + gap(i);
  }
  return out;
}

/** Points round a circle about `c`, from `a0` to `a1` degrees clockwise from the top (lib/arcane's `at`). */
const arcPts = (c: Pt, r: number, a0 = 0, a1 = 360) => {
  const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.PI * r) / 180 / 0.5));
  return Array.from({ length: n + 1 }, (_, k) => at(c, a0 + ((a1 - a0) * k) / n, r));
};

/** Parallel hatching across the convex polygon `poly`, `angle` degrees from the horizontal, `gap` apart, `pad` short of its edges: its strokes. */
function hatchSegs(poly: Pt[], angle: number, gap: number, pad = 0.5): [Pt, Pt][] {
  const a = (angle * Math.PI) / 180;
  const u: Pt = [Math.cos(a), Math.sin(a)];
  const across = (p: Pt) => -p[0] * u[1] + p[1] * u[0];
  const along = (p: Pt) => p[0] * u[0] + p[1] * u[1];
  const ps = poly.map(across);
  const out: [Pt, Pt][] = [];
  for (let s = Math.min(...ps) + gap / 2; s < Math.max(...ps); s += gap) {
    const xs: Pt[] = [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length];
      const [dp, dq] = [across(p) - s, across(q) - s];
      if (dp * dq < 0) xs.push(lerp(p, q, dp / (dp - dq)));
    });
    if (xs.length < 2) continue;
    xs.sort((x, y) => along(x) - along(y));
    const [p, q] = [xs[0], xs.at(-1)!];
    const L = dist(p, q);
    if (L > 2 * pad + 0.3) out.push([lerp(p, q, pad / L), lerp(p, q, 1 - pad / L)]);
  }
  return out;
}
/** The same, as one path, broken at the holes (circles or boxes). */
const hatchPoly = (poly: Pt[], angle: number, gap: number, holes: Hole[] = [], pad = 0.5) =>
  hatchSegs(poly, angle, gap, pad)
    .map(([p, q]) => cut([p, q], holes))
    .join('');

/**
 * An empty seal's hollow: the shadow under its upper left rim, a crescent
 * (the circle less the same circle moved down and right, as Luna is cut),
 * shaded in level strokes.
 */
function hollow(c: Pt, r: number, gap: number): string {
  const o = r * 0.36;
  let d = '';
  for (let y = -r + gap * 0.7; y < r; y += gap) {
    const x1 = Math.sqrt(r * r - y * y);
    const dy = y - o;
    const end = Math.abs(dy) < r ? Math.min(x1, o - Math.sqrt(r * r - dy * dy)) : x1;
    if (end - 0.35 - (-x1 + 0.35) > 0.35) d += `M${f(c[0] - x1 + 0.35)} ${f(c[1] + y)}H${f(c[0] + end - 0.35)}`;
  }
  return d;
}

/**
 * The ouroboros, engraved about 0, 0: a serpent on the circle `rs`, its body
 * `w` either side of it at the neck, swelling a little and then tapering to
 * its tail. Its head lies along the ring at the top, facing anticlockwise:
 * broad at the jaw's hinge, a ridge of brow over the eye, the snout running
 * out round, the jaws open on the tip of its tail, which runs in between
 * them under a fang. Its back carries two rows of scales, their free edges
 * toward the tail; a line runs along its side, and below it the broad
 * plates cross its belly (the inner edge). The throat is shaded in short
 * strokes. Everything about the head is laid out along the ring (`u` from
 * the neck toward the snout, `v` out from the ring), so it bends with it.
 */
function serpent(rs: number, w: number): Serpent {
  const O: Pt = [0, 0];
  const deg = (u: number, r = rs) => (u / r) * (180 / Math.PI);
  /** The neck, at this angle clockwise from the top; the head runs anticlockwise from it, the body clockwise round to its tail. */
  const A0 = 22;
  const LH = 3.2 * w;
  const Hd = (u: number, v: number): Pt => at(O, A0 - deg(u, rs + v), rs + v);
  const B = (a: number, v: number): Pt => at(O, a, rs + v);
  // The tail's tip, inside the mouth past the corner of the jaws.
  const TIP = 360 + A0 - deg(1.4 * w);
  const span = TIP - A0;
  const bw = (a: number) => {
    const t = (a - A0) / span;
    return w * (t < 0.25 ? 1 + 0.07 * Math.sin(((t / 0.25) * Math.PI) / 2) : 1.07 - 0.88 * ((t - 0.25) / 0.75) ** 1.5);
  };

  // The head: the crown swelling to the hinge, level over the brow, then running down to the snout; the upper lip back to the
  // corner of the mouth; the lower lip out to the chin; the chin's underside back past the swollen throat to the neck.
  const crownV = (u: number) =>
    u <= 0.9 * w
      ? w * (1 + 0.5 * Math.sin(((u / (0.9 * w)) * Math.PI) / 2))
      : u <= 2 * w
        ? w * (1.5 - (0.12 * (u - 0.9 * w)) / w)
        : w * (0.5 + 0.87 * Math.max(0, Math.cos(((u - 2 * w) / (LH - 2 * w)) * (Math.PI / 2))) ** 0.8);
  const upperV = (u: number) => w * (0.03 + 0.22 * Math.max(0, (u - w) / (LH - w)) ** 0.8);
  const CHIN = LH - 0.42 * w;
  const lowerV = (u: number) => -w * (0.03 + 0.25 * Math.max(0, (u - w) / (CHIN - w)) ** 0.9);
  const underV = (u: number) => (u >= 0.8 * w ? -w * (0.52 + 0.76 * Math.sin(((CHIN - u) / (CHIN - 0.8 * w)) * (Math.PI / 2))) : -w * (1 + 0.28 * Math.sin(((u / (0.8 * w)) * Math.PI) / 2)));
  const crown = steps(0, LH, 40).map((u) => Hd(u, crownV(u)));
  const snout = [Hd(LH + 0.1 * w, 0.32 * w), Hd(LH + 0.06 * w, 0.22 * w)];
  const upper = steps(LH - 0.02 * w, w, 16).map((u) => Hd(u, upperV(u)));
  const lower = steps(w, CHIN, 12).map((u) => Hd(u, lowerV(u)));
  const chin = [Hd(CHIN + 0.08 * w, -0.38 * w)];
  const under = steps(CHIN - 0.04 * w, 0, 30).map((u) => Hd(u, underV(u)));
  const headPts = [...crown, ...snout, ...upper, ...lower, ...chin, ...under];
  // A fang from the upper jaw, down over the tail.
  const FU = LH - 0.62 * w;
  const fang: Pt[] = [Hd(FU - 0.12 * w, upperV(FU - 0.12 * w)), Hd(FU + 0.02 * w, -0.16 * w), Hd(FU + 0.12 * w, upperV(FU + 0.12 * w))];
  const head: Hole = { poly: headPts };
  const holes: Hole[] = [head, { poly: fang }];

  // The body: its two edges, round the tail's tip, broken where the head lies over the tail.
  const n = Math.ceil(span / 1.2);
  const as = steps(A0, TIP, n);
  const outer = as.map((a) => B(a, bw(a)));
  const inner = as.map((a) => B(a, -bw(a)));
  const tip = [B(TIP + deg(0.12 * w), 0.06 * w), B(TIP + deg(0.16 * w), 0), B(TIP + deg(0.12 * w), -0.06 * w)];
  const body = cut([...outer, ...tip, ...inner.reverse()], holes);

  // Along the arc: positions every `gap(a)` px from the neck to where the body is too thin for them.
  const along = (from: number, gap: (a: number) => number, stop: (a: number) => boolean) => {
    const out: number[] = [];
    for (let a = A0 + from; a < TIP && !stop(a); a += deg(gap(a))) out.push(a);
    return out;
  };
  // The side: a line along the body a third of the way in from the belly; under it, the belly's plates straight across.
  const SIDE = -0.3;
  const side = cut(
    steps(A0 + 0.5, TIP - deg(0.9 * w), n).map((a) => B(a, SIDE * bw(a))),
    holes,
  );
  let belly = side;
  for (const a of along(
    1.2,
    (a) => Math.max(0.95, 0.42 * bw(a)),
    (a) => bw(a) < 0.75,
  ))
    belly += cut([B(a, -bw(a) + 0.28), B(a, SIDE * bw(a) - 0.12)], holes);
  // The back: two rows of scales, each a little arc whose free edge bulges toward the tail; the rows set half a scale apart.
  let scales = '';
  const rows = [
    [SIDE, 0.36],
    [0.36, 1],
  ] as const;
  rows.forEach(([v0, v1], row) => {
    const sp = (a: number) => Math.max(0.9, 0.62 * (v1 - v0) * bw(a) * 1.25);
    for (const a0 of along(1.4 + row * 0.5 * deg(0.6 * w), sp, (a) => bw(a) < 0.95)) {
      const b = bw(a0);
      const [lo, hi] = [v0 * b + (row ? 0.06 : 0.12), v1 * b - (row ? 0.3 : 0.06)];
      if (hi - lo < 0.5) continue;
      const [vc, hh, ds] = [(lo + hi) / 2, (hi - lo) / 2, sp(a0) * 0.62];
      const arc = steps(-90, 90, 8).map((th) => {
        const t = (th * Math.PI) / 180;
        const v = vc + hh * Math.sin(t);
        return B(a0 + deg(ds * Math.cos(t), rs + v), v);
      });
      scales += cut(arc, holes);
    }
  });

  // The head's lines: the brow over the eye, the line of the upper lip, the jaw's line back from the corner of the mouth, the
  // scales of the lower lip, a nostril, the fang.
  const browV = (u: number) => w * (0.98 + 0.13 * Math.sin(((u - 0.95 * w) / (1.3 * w)) * Math.PI));
  let details = cut(steps(0.95 * w, 2.25 * w, 14).map((u) => Hd(u, browV(u))));
  details += cut(steps(1.25 * w, LH - 0.18 * w, 10).map((u) => Hd(u, upperV(u) + 0.24 * w)));
  details += cut(steps(w, 0.3 * w, 8).map((u) => Hd(u, -0.05 * w - 0.5 * w * Math.max(0, (w - u) / (0.7 * w)) ** 1.4)));
  for (let u = 1.25 * w; u < CHIN - 0.15 * w; u += 0.38 * w) details += cut([Hd(u, lowerV(u) - 0.05 * w), Hd(u - 0.1 * w, lowerV(u) - 0.28 * w)]);
  details += cut([Hd(LH - 0.28 * w, 0.52 * w), Hd(LH - 0.16 * w, 0.46 * w)]);
  // Over the brow, the crown in shadow: short strokes from the brow up toward the crown's edge.
  let shade = '';
  for (let u = 1.05 * w; u < 2.15 * w; u += 0.22 * w) shade += cut([Hd(u, browV(u) + 0.14 * w), Hd(u, Math.min(crownV(u) - 0.16 * w, browV(u) + 0.3 * w))]);
  // The throat: strokes in from its underside.
  for (let u = 0.25 * w; u < CHIN - 0.4 * w; u += 0.2 * w) shade += cut([Hd(u, underV(u) + 0.14 * w), Hd(u, underV(u) * 0.62)]);
  const eyeC = Hd(1.55 * w, 0.62 * w);
  const pupil = path([Hd(1.55 * w, 0.5 * w), Hd(1.55 * w, 0.74 * w)]);
  return {
    body,
    belly,
    scales,
    head: path(headPts) + path(fang),
    details,
    shade,
    eye: { c: eyeC, r: 0.32 * w },
    pupil,
  };
}

// ---- collisions: segments, boxes and discs ----
type Seg = [Pt, Pt];
const segPt = ([p, q]: Seg, r: Pt) => {
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  const L = dx * dx + dy * dy;
  const t = L ? clamp(((r[0] - p[0]) * dx + (r[1] - p[1]) * dy) / L, 0, 1) : 0;
  return dist([p[0] + t * dx, p[1] + t * dy], r);
};
const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const segSeg = (a: Seg, b: Seg) => {
  const [d1, d2, d3, d4] = [cross(b[0], b[1], a[0]), cross(b[0], b[1], a[1]), cross(a[0], a[1], b[0]), cross(a[0], a[1], b[1])];
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(segPt(a, b[0]), segPt(a, b[1]), segPt(b, a[0]), segPt(b, a[1]));
};
/** Whether the segment passes through the box grown by `pad` (Liang and Barsky's clipping). */
function segBox([p, q]: Seg, b: Box, pad = 0): boolean {
  const [x0, y0, x1, y1] = grow(b, pad);
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  let [t0, t1] = [0, 1];
  for (const [pp, qq] of [
    [-dx, p[0] - x0],
    [dx, x1 - p[0]],
    [-dy, p[1] - y0],
    [dy, y1 - p[1]],
  ]) {
    if (pp === 0) {
      if (qq < 0) return false;
      continue;
    }
    const t = qq / pp;
    if (pp < 0) {
      if (t > t1) return false;
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) return false;
      t1 = Math.min(t1, t);
    }
  }
  return t0 <= t1;
}
const boxBox = (a: Box, b: Box, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
const boxDisc = (b: Box, c: Pt, r: number) => dist([clamp(c[0], b[0], b[2]), clamp(c[1], b[1], b[3])], c) < r;

const rgb = (c: readonly number[]) => `rgb(${c.join(' ')})`;
/** The ten zones, as lib/descent names and colours them. */
export const ZONES = STRATA.slice(0, 10).map((z, k) => ({
  name: z.name,
  color: rgb(z.look.accent),
  from: 10 * k + 1,
  sigil: sigilOf(z.name),
}));

/** The terraces' depth: each is the front of an ellipse this much as deep as it is wide. */
const TILT = 0.2;
/** The rock shaded beside the pit's sides. */
const ROCK = 6;
/** How much narrower the pit is at the tenth zone's floor than at its mouth (each side). */
const TAPER = 7;
/** A zone's name stands this far from the stars' lane. */
const NAME_GAP = 4;
/** The stars and their glories; smaller inside the ouroboros. */
const STAR_R = 4.6;
const GLORY = 8.5;
const STAR_R_IN = 4.2;
const GLORY_IN = 7;
/** A star's depth (Cinzel's bold figures at 13 px): about this wide a figure, this tall. */
const BEST_W = 7.6;
const BEST_H = 9.8;
/** The lane on the pit's left the stars stand in: its stars' centres this far left of the rock (a two-figure depth under one clears it). */
const LANE_IN = Math.max(GLORY - 2.5, BEST_W + 1.6);
const LANE = LANE_IN + GLORY + 0.8;
/** A depth on a find's line (Cinzel's bold figures at 11 px). */
const MARK_W = 7;
const MARK_H = 8.2;
/** A find's line runs level this far out of the wall before it slants. */
const HANDLE = 5;
/** The seals' largest radius, and the room the lines need between the pit and the finds (less when no line is drawn). */
const R_MAX = 14;
const ROOM_BESIDE = 38;
const ROOM_STACKED = 34;
const ROOM_NONE = 12;
/** The last seal's radius: the ouroboros must read as a serpent, and hold a star. */
const END_R = 21;
/** "uncharted" as set (EB Garamond italic, 12.5 px), with its bracket's arms. */
const UNCH_W = 54;
/** Sol. */
const SOL_R = 8.5;
/** The legend's small stars and its words (12 px): the star's radius, the words' height, a row's height. */
export const KEY_R = 3.4;
const KEY_ROW = 14;

/** A callout's shape before the page has measured it: its item over its name in two lines. */
const CALLOUT_GUESS = (W: number): CalloutShape => ({
  x: W - 64,
  w: 64,
  h: 52,
  icon: [0, 0, 10, 22],
  name: [0, 25, 62, 52],
});

/**
 * The plate for a box `W` × `H` px, for a best run `deepest` deep (null
 * before a first run) and a last run `lastRun` deep (null for none); `met`
 * are the finds you have met, with the depth each first turns up at;
 * `layout` says where the caption is, and either where the finds' headings
 * are beside it or how its callouts are shaped.
 */
export function descentPlate(W: number, H: number, deepest: number | null, met: { kind: FindKind; from: number }[] = [], layout: Layout = {}, lastRun: number | null = null): Plate {
  const caption = layout.caption ?? null;
  const beside = layout.beside ?? null;
  const stacked = !beside;
  const best = deepest && deepest > 0 ? Math.floor(deepest) : null;
  const lastD = lastRun && lastRun > 0 ? Math.floor(lastRun) : null;
  // The zones you have been to, in either run.
  const been = Math.max(best ?? 0, lastD ?? 0);
  const reached = ZONES.filter((z) => been >= z.from).length;
  const past = best !== null && best > 100;
  const shapes = Object.fromEntries(FINDS_IN_ORDER.map((x) => [x.kind, layout.callouts?.[x.kind] ?? CALLOUT_GUESS(W)])) as Record<FindKind, CalloutShape>;
  const found = [...met].sort((a, b) => a.from - b.from);

  // ---- across: the zones' names | the stars' lane | the pit | the lines | the finds (beside) or the callouts (stacked) ----
  const nameW = (k: number) => layout.nameW?.[k] ?? ZONES[k].name.length * 5.9 + 1;
  const keyW = (layout.legendW ? Math.max(layout.legendW.best, lastD ? layout.legendW.last : 0) : lastD ? 44 : 46) + 2 * KEY_R + 5;
  const slant = (k: number) => (TAPER * (k + 0.5)) / 10;
  // The pit's half-width at the mouth plus what stands left of it: the names shown, or the bracket of the zones not reached.
  const need = Math.max(30, ...ZONES.slice(0, reached).map((_, k) => nameW(k) + NAME_GAP + LANE + ROCK - slant(k)), reached < 10 ? UNCH_W + 5 + ROCK - slant((reached + 9) / 2) : 0);
  const wall = beside ? beside.wall : Math.min(...FINDS_IN_ORDER.map((x) => shapes[x.kind].x));
  const room = found.length ? (stacked ? ROOM_STACKED : ROOM_BESIDE) : ROOM_NONE;
  const SOL_Y = SOL_R + 9;
  const capAX = caption && caption[3] > SOL_Y - SOL_R - 12 ? caption[2] + SOL_R + 14 : 0;
  let halfTop = clamp((wall - room - 1 - need - ROCK) / 2, 19, stacked ? 56 : 28);
  let AX = Math.max(1 + need + halfTop, capAX, keyW + END_R + 7);
  const spare = wall - room - ROCK - halfTop - AX;
  // Room to spare goes to the margin (where the bracket of the zones not reached spreads into it), and half of it to the lines when
  // there are any; too little narrows the pit.
  if (spare > 0) AX += found.length ? spare / 2 : spare;
  else halfTop = Math.max(19, halfTop + spare);
  const halfBot = halfTop - TAPER;

  // ---- down: Sol over the mouth, the ten zones, the endless stretch ----
  const TOP = SOL_Y + SOL_R + 6;
  const Rw = Math.min(stacked ? R_MAX - 2 : R_MAX, halfBot - 6.5);
  const endR = END_R;
  const END = 2 * endR + 12;
  const natural = Math.ceil(TOP + 10 * (2 * Rw + 7) + END);
  const BOTTOM = Math.max(TOP + 150, H - END);
  const band = (BOTTOM - TOP) / 10;
  const R = Math.max(6, Math.min(Rw, band / 2 - 3.5));
  /** The pit's half-width at the front of the terrace at `yy` (it carries on narrowing past the tenth zone). */
  const half = (yy: number) => Math.max(4, halfTop + ((halfBot - halfTop) * (yy - TOP)) / (BOTTOM - TOP));
  /** A point on the pit's side (`s` -1 left, 1 right) at the ends of the terrace whose front is at `yy`. */
  const side = (yy: number, s: number): Pt => [AX + s * half(yy), yy - TILT * half(yy)];
  /** The near half of the ellipse whose front is at `yy`, from left to right. */
  const front = (yy: number, drop = 0, from = 0, to = 1): Pt[] => {
    const [a, b] = [half(yy), TILT * half(yy)];
    return Array.from({ length: 41 }, (_, i) => {
      const phi = Math.PI * (1 - from - ((to - from) * i) / 40);
      return [AX + a * Math.cos(phi), yy - b + b * Math.sin(phi) + drop] as Pt;
    });
  };
  const sealC = (k: number): Pt => [AX, TOP + (k + 0.5) * band];
  /** The rock's outer edge on side `s` at height `yy` (a point on the slanting line, not a terrace's front). */
  const rockAt = (yy: number, s = -1) => {
    let t = yy;
    for (let i = 0; i < 6; i++) t = yy + TILT * half(t);
    return AX + s * (half(t) + ROCK);
  };
  const nameX = (yy: number) => rockAt(yy) - LANE - NAME_GAP;
  /** The height of shown depth `s` on the walls. */
  const depthY = (s: number) => side(TOP + (Math.min(100, s) * band) / 10, 1)[1];
  /** Shown depth `s` on the right wall, just outside the rock. */
  const onWall = (s: number): Pt => [rockAt(depthY(s), 1), depthY(s)];

  // ---- the endless stretch: strata closing up below the tenth zone round a last, larger seal holding the ouroboros ----
  const strata: number[] = [BOTTOM];
  for (let g = band * 0.55; strata.at(-1)! + g < H - 2 && g > 1.6; g *= 0.72) strata.push(strata.at(-1)! + g);
  const endC: Pt = [AX, BOTTOM + 6 + endR];
  const endHole: Hole = { c: endC, r: endR + 1.4 };
  const sol: Pt = [AX, SOL_Y];
  const solHole: Hole = { c: sol, r: SOL_R + 1.4 };
  const solBox: Box = [sol[0] - SOL_R - 12, 0, sol[0] + SOL_R + 12, sol[1] + SOL_R + 3];
  const sealHoles: Hole[] = ZONES.map((_, k) => ({ c: sealC(k), r: R + 1.3 }));

  // ---- timing: the pen sweeps down the pit once, then the gold star comes down and the red one appears ----
  const S0 = 0.4;
  const S = 1.35;
  const sweep = (yy: number) => S0 + ease((yy - TOP) / (H - TOP)) * S;
  const STAR_AT = 1.85;

  // ---- the stars: in the lane at their depth, by the mouth before a first run, in the ouroboros past 100 ----
  const surfaceY = TOP - TILT * halfTop;
  const laneAt = (y: number): Pt => [rockAt(y) - LANE_IN, y];
  const home = laneAt(surfaceY);
  const legendX = endC[0] - endR - 6 - keyW;
  const keyBox = (rows: number): Box => [legendX - 2, endC[1] - (rows * KEY_ROW) / 2 - 3, endC[0] - endR - 3, endC[1] + (rows * KEY_ROW) / 2 + 3];
  type Spot = { c: Pt; inSnake: boolean; text: string };
  const spot = (d: number | null): Spot =>
    d === null
      ? { c: home, inSnake: false, text: '' }
      : d > 100
        ? { c: endC, inSnake: true, text: String(shownDepth(d)) }
        : {
            c: laneAt(depthY(shownDepth(d))),
            inSnake: false,
            text: String(shownDepth(d)),
          };
  /** Where a star's depth can go: under it (or above it, if under won't fit); beside the seal when the star is in the ouroboros. */
  const numBoxes = (s: Spot): { box: Box; cost: number }[] => {
    if (!s.text) return [{ box: [0, 0, 0, 0], cost: 0 }];
    const w = s.text.length * BEST_W;
    if (s.inSnake)
      return [
        {
          box: [endC[0] + endR + 3, endC[1] - BEST_H / 2, endC[0] + endR + 3 + w, endC[1] + BEST_H / 2],
          cost: 0,
        },
      ];
    const [x, y] = s.c;
    return [
      {
        box: [x - w / 2, y + GLORY + 0.8, x + w / 2, y + GLORY + 0.8 + BEST_H],
        cost: 0,
      },
      {
        box: [x - w / 2, y - GLORY - 0.8 - BEST_H, x + w / 2, y - GLORY - 0.8],
        cost: 5,
      },
    ];
  };
  const discOf = (s: Spot) => ({
    c: s.c,
    r: (s.inSnake ? GLORY_IN : GLORY) + 1,
  });
  /** What a star's depth must keep clear of: Sol, the caption, the ouroboros' seal (from the lane), the legend. */
  const numBad = (b: Box, s: Spot, rows: number) =>
    (s.text && b[1] < 0) ||
    boxBox(b, solBox, 1) ||
    (caption ? boxBox(b, caption, 2) : false) ||
    (!s.inSnake && boxDisc(b, endC, endR + 1.5)) ||
    boxBox(b, keyBox(rows), 4) ||
    (beside ? b[2] > beside.wall - 2 : b[2] > W);
  const gold = spot(best);
  const red = lastD !== null && (best === null || shownDepth(lastD) !== shownDepth(best)) ? spot(lastD) : null;
  type Pick = { gold: Box; red: Box | null; cost: number };
  let pick: Pick = { gold: numBoxes(gold)[0].box, red: null, cost: 1e9 };
  for (const g of numBoxes(gold)) {
    const gc = g.cost + (gold.text && numBad(g.box, gold, red ? 2 : 1) ? 100 : 0);
    if (gc < pick.cost) pick = { gold: g.box, red: null, cost: gc + 1000 };
    if (!red) continue;
    for (const r of numBoxes(red)) {
      // Both stars and both depths clear of each other; past 100 there is room for only one star.
      const clash =
        (red.inSnake && gold.inSnake) ||
        dist(red.c, gold.c) < GLORY * 2 + 2 ||
        (gold.text && (boxDisc(g.box, red.c, discOf(red).r + 1) || boxBox(g.box, r.box, 2))) ||
        boxDisc(r.box, gold.c, discOf(gold).r + 1) ||
        numBad(r.box, red, 2);
      if (clash) continue;
      const c = gc + r.cost;
      if (c < pick.cost) pick = { gold: g.box, red: r.box, cost: c };
    }
  }
  const showRed = red !== null && pick.red !== null;
  const keyRows = showRed ? 2 : 1;
  const goldNum = gold.text ? pick.gold : null;
  const redNum = showRed ? pick.red : null;
  const numBoxesShown = [goldNum, redNum].filter((b): b is Box => !!b);
  const numHoles: Hole[] = numBoxesShown.map((b) => ({ box: grow(b, 1.5) }));
  const legend: Legend = {
    x: legendX,
    rows: [{ kind: 'best' as const }, ...(showRed ? [{ kind: 'last' as const }] : [])].map((r, i) => ({ ...r, y: endC[1] + (i - (keyRows - 1) / 2) * KEY_ROW })),
    delay: sweep(endC[1]) + 0.3,
  };
  const keyHole: Hole = { box: keyBox(keyRows) };

  // ---- the finds: lines, their depths, fitted together ----
  const fit = fitLeaders();

  function fitLeaders() {
    type Opt = {
      kind: FindKind;
      W: Pt;
      segs: Seg[];
      path: Pt[];
      box: Box;
      mark: Pt;
      cost: number;
    };
    /** The boxes nothing may cross: Sol, the stars' depths, the legend, and the callouts (each kind's item and name) or, beside, the finds' text. */
    const fixed: { box: Box; kind?: FindKind; icon?: boolean }[] = [{ box: solBox }, ...numBoxesShown.map((box) => ({ box })), { box: keyBox(keyRows) }];
    if (beside) fixed.push({ box: [wall - 1, -1e4, 1e5, 1e5] });
    const discs = [{ c: endC, r: endR + 2 }, discOf(gold), ...(showRed ? [discOf(red!)] : [])];
    const edgeX = (yy: number) => rockAt(yy, 1);

    /** The callouts' tops, as tried (stacked): spread evenly down the plate, spread down the pit, or each just above where its find turns up. */
    const layouts: { tops: Record<FindKind, number>; cost: number }[] = [];
    if (stacked) {
      const mid = (k: FindKind) => (shapes[k].icon[1] + shapes[k].icon[3]) / 2;
      const settle = (ys: number[]) => {
        const tops = FINDS_IN_ORDER.map((x, i) => ys[i] - mid(x.kind));
        for (let i = 1; i < tops.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + shapes[FINDS_IN_ORDER[i - 1].kind].h + 8);
        const over = tops.at(-1)! + shapes[FINDS_IN_ORDER.at(-1)!.kind].h - (H - 2);
        return Object.fromEntries(FINDS_IN_ORDER.map((x, i) => [x.kind, Math.max(0, tops[i] - Math.max(0, over))])) as Record<FindKind, number>;
      };
      // Evenly: the same gap between them, half of it over the first and under the last.
      const hs = FINDS_IN_ORDER.map((x) => shapes[x.kind].h);
      const g = Math.max(8, (H - hs.reduce((a, b) => a + b, 0)) / hs.length);
      let y = g / 2;
      const even = FINDS_IN_ORDER.map((x, i) => {
        const top = y;
        y += hs[i] + g;
        return top + mid(x.kind);
      });
      layouts.push({ tops: settle(even), cost: 0 });
      const spread = (fr: number[]) => settle(fr.map((v) => TOP + (BOTTOM - TOP) * v));
      layouts.push({ tops: spread([0.08, 0.43, 0.78]), cost: 2 });
      layouts.push({ tops: spread([0.06, 0.3, 0.54]), cost: 4 });
      layouts.push({
        tops: settle(FINDS_IN_ORDER.map((x) => onWall(shownDepth(x.from))[1] - band * 0.3)),
        cost: 8,
      });
    } else layouts.push({ tops: {} as Record<FindKind, number>, cost: 0 });

    /** Every way to draw find `m`'s line to its heading at `E`: the stub's length, where its depth sits. */
    const optsFor = (m: { kind: FindKind; from: number }, E: Pt, blocks: { box: Box; kind?: FindKind; icon?: boolean }[]): Opt[] => {
      const W0 = onWall(shownDepth(m.from));
      const Wd: Pt = [W0[0] + 1.3, W0[1]];
      const Hd: Pt = [Wd[0] + HANDLE, Wd[1]];
      const text = String(shownDepth(m.from));
      const [mw, mh] = [text.length * MARK_W + 1, MARK_H];
      const out: Opt[] = [];
      for (const stub of [5, 9, 14, 20, 27, 35]) {
        const Sx: Pt = [E[0] - stub, E[1]];
        if (Sx[0] - Hd[0] < 6) continue;
        const segs: Seg[] = [
          [E, Sx],
          [Sx, Hd],
          [Hd, Wd],
        ];
        const marks: { box: Box; cost: number }[] = [];
        // Over the handle (or under it), on the side the slant leaves from: the line runs the other way.
        const up = Sx[1] >= Hd[1] - 1;
        for (const dx of [0.6, 3])
          marks.push({
            box: up ? [Wd[0] + dx, Wd[1] - 1.8 - mh, Wd[0] + dx + mw, Wd[1] - 1.8] : [Wd[0] + dx, Wd[1] + 1.8, Wd[0] + dx + mw, Wd[1] + 1.8 + mh],
            cost: dx,
          });
        // Or on the slant, a little way out, the line stopping short of it either side.
        const u: Pt = [(Sx[0] - Hd[0]) / dist(Hd, Sx), (Sx[1] - Hd[1]) / dist(Hd, Sx)];
        const L = dist(Hd, Sx);
        let t0 = 0;
        for (let t = 3; t < L - 3; t += 0.5) {
          const c = [Hd[0] + u[0] * t, Hd[1] + u[1] * t];
          const b: Box = [c[0] - mw / 2, c[1] - mh / 2, c[0] + mw / 2, c[1] + mh / 2];
          if (b[0] < Math.max(edgeX(b[1]), edgeX(b[3]), Wd[0]) + 2.6) continue;
          if (t + mw / 2 > L - 2) break;
          if (!t0) t0 = t;
          if (t === t0 || t === t0 + 7 || t === t0 + 14) marks.push({ box: b, cost: 4 + t0 * 0.08 + (t - t0) * 0.3 });
        }
        for (const mk of marks) {
          let bad = 0;
          for (const s of segs) for (const bl of blocks) if (!(bl.kind === m.kind && bl.icon) && segBox(s, bl.box, 1.2)) bad++;
          for (const s of segs) for (const d of discs) if (segPt(s, d.c) < d.r) bad++;
          for (const bl of blocks) if (boxBox(mk.box, bl.box, 1.5)) bad++;
          for (const d of discs) if (boxDisc(mk.box, d.c, d.r)) bad++;
          if (mk.box[0] < Math.max(edgeX(mk.box[1]), edgeX(mk.box[3])) + 0.5) bad++;
          out.push({
            kind: m.kind,
            W: Wd,
            segs,
            path: [Wd, Hd, Sx, E],
            box: mk.box,
            mark: [(mk.box[0] + mk.box[2]) / 2, (mk.box[1] + mk.box[3]) / 2],
            cost: 1000 * bad + mk.cost + Math.abs(stub - 9) * 0.15,
          });
        }
      }
      return out.sort((a, b) => a.cost - b.cost).slice(0, 7);
    };

    type Choice = { cost: number; opts: Opt[]; tops: Record<FindKind, number> };
    let won: Choice | null = null;
    for (const lay of layouts) {
      const blocks = [...fixed];
      const Es: Partial<Record<FindKind, Pt>> = {};
      let base = lay.cost;
      if (stacked)
        for (const x of FINDS_IN_ORDER) {
          const s = shapes[x.kind];
          const top = lay.tops[x.kind];
          const icon: Box = [s.x + s.icon[0], top + s.icon[1], s.x + s.icon[2], top + s.icon[3]];
          const name: Box = [s.x + s.name[0], top + s.name[1], s.x + s.name[2], top + s.name[3]];
          // A callout keeps clear of the stars' depths and the ouroboros.
          for (const b of [icon, name]) if (fixed.some((fx) => boxBox(b, fx.box, 2)) || boxDisc(b, endC, endR + 2)) base += 1000;
          blocks.push({ box: icon, kind: x.kind, icon: true }, { box: name, kind: x.kind });
          Es[x.kind] = [s.x + s.icon[0] - 2.5, top + (s.icon[1] + s.icon[3]) / 2];
        }
      else for (const t of beside!.targets) Es[t.kind] = [t.x - 2.6, t.y];
      const ms = found.filter((m) => Es[m.kind]);
      const per = ms.map((m) => optsFor(m, Es[m.kind]!, blocks));
      if (per.some((p) => p.length === 0)) continue;
      // Every pairing of the options, kept clear of each other.
      const choose = (i: number, chosen: Opt[]): void => {
        if (i < per.length) {
          for (const o of per[i]) choose(i + 1, [...chosen, o]);
          return;
        }
        let cost = base;
        for (let a = 0; a < chosen.length; a++) {
          cost += chosen[a].cost;
          for (let b = a + 1; b < chosen.length; b++) {
            const [A, B] = [chosen[a], chosen[b]];
            if (A.segs.some((s) => B.segs.some((t) => segSeg(s, t) < 2.2))) cost += 1000;
            if (boxBox(A.box, B.box, 1.5)) cost += 1000;
            if (A.segs.some((s) => segBox(s, B.box, 1.2)) || B.segs.some((s) => segBox(s, A.box, 1.2))) cost += 1000;
            if (A.segs.some((s) => segPt(s, B.W) < 2.2) || B.segs.some((s) => segPt(s, A.W) < 2.2)) cost += 1000;
          }
        }
        if (!won || cost < won.cost) won = { cost, opts: chosen, tops: lay.tops };
      };
      choose(0, []);
      if (won && (won as Choice).cost < 1000 && lay.cost === 0) break;
    }
    const c = won as Choice | null;
    return { opts: c?.opts ?? [], tops: c?.tops ?? null };
  }

  const markHoles: Hole[] = fit.opts.map((o) => ({ box: grow(o.box, 1.5) }));
  const lineAt = (o: { W: Pt }) => sweep(o.W[1]) + 0.45;
  const stations: Station[] = fit.opts.map((o) => ({
    kind: o.kind,
    c: o.W,
    delay: lineAt(o),
  }));
  const marks: Mark[] = fit.opts.map((o) => {
    const m = found.find((x) => x.kind === o.kind)!;
    return {
      kind: o.kind,
      text: String(shownDepth(m.from)),
      x: o.mark[0],
      y: o.mark[1],
      delay: lineAt(o) + 0.4,
    };
  });
  const callouts: Callout[] | null =
    stacked && fit.tops
      ? FINDS_IN_ORDER.map((x, i) => ({
          kind: x.kind,
          top: fit.tops![x.kind],
          met: found.some((m) => m.kind === x.kind),
          delay: 1.1 + 0.12 * i,
        }))
      : null;

  /** Every line, worn (for the lines) or whole (for the glow under them). */
  const build = (worn: boolean) => {
    const wear = (seed: number) => (worn ? wearOf(seed) : null);
    const parts: Omit<Part, 'glow'>[] = [];
    const rays: string[] = [];
    const add = (tone: Part['tone'], strokes: Stroke[], lit = true, color?: string) => parts.push({ tone, strokes, lit, color });
    const common: Hole[] = [...numHoles, ...markHoles, keyHole];

    // Sol over the mouth: a double ring in a glory over the surface, seven pointed rays (hatched down one side) and fine rays between, long and short in turn.
    const glory: Stroke[] = [];
    const gHoles: Hole[] = [
      ...numHoles,
      ...(caption
        ? [
            {
              box: [caption[0] - 2, caption[1] - 2, caption[2] + 2, caption[3] + 1] as Box,
            },
          ]
        : []),
    ];
    const at0 = (a: number) => 0.35 + (Math.abs(a) / 90) * 0.3;
    for (let i = 0; i < 7; i++) {
      const a = -90 + i * 30;
      const [l, r, tip] = [at(sol, a - 4.2, SOL_R + 1.6), at(sol, a + 4.2, SOL_R + 1.6), at(sol, a, SOL_R + (i % 2 ? 8.5 : 11))];
      glory.push(...pen([l, tip], 'thin', at0(a), 0.3, { holes: gHoles }), ...pen([r, tip], 'thin', at0(a), 0.3, { holes: gHoles }));
      rays.push(
        hatch(at(sol, a, SOL_R + 1.6), l, tip, 0.62, {
          holes: gHoles.filter((g): g is Disc => 'c' in g),
        }),
      );
    }
    for (const a of [-100, ...Array.from({ length: 12 }, (_, i) => -80 + Math.floor(i / 2) * 30 + (i % 2) * 10), 100])
      glory.push(...pen([at(sol, a, SOL_R + 1.8), at(sol, a, SOL_R + (Math.abs(a) === 100 ? 4.2 : 5.6))], 'hair', at0(a) + 0.05, 0.22, { holes: gHoles }));
    add('gold', [...pen(arcPts(sol, SOL_R), 'main', 0.05, 0.45, { wear: wear(5) }), ...pen(arcPts(sol, SOL_R - 1.3), 'hair', 0.1, 0.45), ...glory]);

    // The surface, level out from the mouth to the column's edge on the left, a short way on the right; a hairline under it on the left.
    const [ml, mr] = [side(TOP, -1), side(TOP, 1)];
    const surface = [
      ...pen([ml, [1, surfaceY]], 'main', 0.2, 0.5, {
        holes: common,
        wear: wear(3),
      }),
      ...pen([mr, [mr[0] + ROCK + 2.5, surfaceY]], 'main', 0.2, 0.2, {
        holes: common,
      }),
      ...pen(
        [
          [ml[0] - ROCK - 1.2, surfaceY + 2.4],
          [3, surfaceY + 2.4],
        ],
        'hair',
        0.28,
        0.45,
        { holes: common },
      ),
    ];
    // The mouth: its far rim, behind Sol, and its near one (the first terrace's front).
    const back = Array.from({ length: 41 }, (_, i) => {
      const phi = Math.PI + (Math.PI * i) / 40;
      return [AX + halfTop * Math.cos(phi), surfaceY + TILT * halfTop * Math.sin(phi)] as Pt;
    });
    surface.push(...pen(back, 'thin', 0.15, 0.4, { holes: [solHole] }));
    add('gold', surface);

    // The pit's sides and the rock's outer edges beside them, from the mouth down to the tenth zone's floor, then on into the dark in
    // shorter and shorter dashes, each fainter than the last, broken round the last seal.
    const [p0, p1] = [side(TOP, 1), side(BOTTOM, 1)];
    const dir: Pt = [(p1[0] - p0[0]) / (p1[1] - p0[1]), 1];
    const run = (s: number, out: number, y0: number, y1: number): [Pt, Pt] => [
      [AX + s * (p0[0] - AX + out + dir[0] * (y0 - p0[1])), y0],
      [AX + s * (p0[0] - AX + out + dir[0] * (y1 - p0[1])), y1],
    ];
    const sides: Stroke[] = [];
    const deep: Stroke[] = [];
    const fadeT = (H - p1[1]) / (H - TOP);
    const stationHoles: Hole[] = stations.map((s) => ({ c: s.c, r: 1.9 }));
    for (const s of [-1, 1]) {
      sides.push(
        ...pen(run(s, 0, p0[1], p1[1]), 'main', S0, S * (1 - fadeT), {
          holes: common,
          wear: wear(s > 0 ? 11 : 13),
        }),
      );
      sides.push(
        ...pen(run(s, ROCK, p0[1], p1[1]), 'thin', S0 + 0.05, S * (1 - fadeT), {
          holes: [...common, ...stationHoles],
          wear: wear(s > 0 ? 19 : 23),
        }),
      );
      for (const [out, kind] of [
        [0, 'main'],
        [ROCK, 'thin'],
      ] as const)
        deep.push(
          ...dashes(
            ...run(s, out, p1[1], H - 0.5),
            kind,
            sweep(p1[1]),
            0.5,
            (i) => 7 * 0.72 ** i + 0.6,
            (i) => 1.3 + 0.55 * i,
            (i) => 0.9 * 0.8 ** i,
            [...common, endHole],
          ),
        );
    }
    add('gold', sides);

    // The terraces' fronts, lit as far as you have been, and the seams across the rock at their ends.
    for (let k = 0; k <= 10; k++) {
      const yy = TOP + k * band;
      const lit = k <= reached;
      const strokes = pen(front(yy), k % 10 ? 'thin' : 'main', k ? sweep(yy) : 0.2, 0.3, { holes: [...common, ...sealHoles, endHole], wear: k ? null : wear(7) });
      for (const s of [-1, 1]) {
        const p = side(yy, s);
        if (k > 0)
          strokes.push(
            ...pen([p, [p[0] + s * ROCK, p[1]]], 'hair', sweep(yy), 0.06, {
              holes: [...common, ...stationHoles],
            }),
          );
      }
      // Its far rim, behind the seal above.
      if (k > 0) {
        const [a, b] = [half(yy), TILT * half(yy)];
        const back = Array.from({ length: 41 }, (_, i) => {
          const phi = Math.PI + (Math.PI * i) / 40;
          return [AX + a * Math.cos(phi), yy - b + b * Math.sin(phi)] as Pt;
        });
        strokes.push(
          ...pen(back, 'hair', sweep(yy - 2 * b), 0.3, {
            holes: [...common, ...sealHoles],
          }),
        );
      }
      add(lit ? 'gold' : 'dull', strokes, lit);
    }

    // The endless stretch: the strata below the tenth zone, closing up and fading in the pit, round the last seal.
    for (let j = 1; j < strata.length; j++) {
      const yy = strata[j];
      const o = Math.max(0.12, 0.85 * 0.78 ** (j - 1));
      deep.push(
        ...pen(front(yy), 'hair', sweep(yy), 0.25, {
          holes: [...common, endHole],
          o,
        }),
      );
    }
    add(
      past ? 'gold' : 'dull',
      [
        ...deep,
        ...pen(arcPts(endC, endR), 'thin', sweep(endC[1] - endR), 0.4, {
          wear: wear(60),
          holes: common,
        }),
        ...pen(arcPts(endC, endR - 1.3), 'hair', sweep(endC[1] - endR) + 0.05, 0.4, { holes: common }),
      ],
      past,
    );

    // The seals: a worn double ring, struck in the zone's colour once reached, a dull impression until then.
    for (let k = 0; k < 10; k++) {
      const c = sealC(k);
      const known = k < reached;
      const d = sweep(c[1] - R);
      const rings = [
        ...pen(arcPts(c, R), 'thin', d, 0.35, {
          wear: wear(40 + k),
          holes: numHoles,
        }),
        ...pen(arcPts(c, R - 1.2), 'hair', d + 0.05, 0.35, { holes: numHoles }),
      ];
      if (known) add('zone', rings, true, ZONES[k].color);
      else add('dull', rings, false);
    }

    // The finds' lines, in gold: out of the wall level, slanting out to the stub, and level to the heading's item.
    for (const o of fit.opts) {
      const holes: Hole[] = [{ box: grow(o.box, 1.6) }, ...numHoles, solHole];
      add('lead', pen(o.path, 'hair', lineAt(o), 0.55, { holes }), false);
    }
    return { parts, rays: rays.join('') };
  };
  const worn = build(true);
  const whole = build(false);
  const parts: Part[] = worn.parts.map((p, i) => {
    const glow = new Map<Kind, string>();
    if (p.lit) for (const s of whole.parts[i].strokes) if (s.o === undefined || s.o > 0.5) glow.set(s.kind, (glow.get(s.kind) ?? '') + s.d);
    return { ...p, glow: [...glow].map(([kind, d]) => ({ kind, d })) };
  });

  // ---- the shading ----
  const shades: Shade[] = [];
  const shadeHoles: Hole[] = [...numHoles, ...markHoles];
  const toneOf = (k: number) => (k < reached ? { tone: 'zone' as const, color: ZONES[k].color } : { tone: 'dull' as const });
  for (let k = 0; k < 10; k++) {
    const [y0, y1] = [TOP + k * band, TOP + (k + 1) * band];
    // The rock beside the pit, shaded on the right only, the side in shadow (the left is lit).
    const [p0, p1] = [side(y0, 1), side(y1, 1)];
    let d = hatchPoly([p0, [p0[0] + ROCK, p0[1]], [p1[0] + ROCK, p1[1]], p1], -45, 1.2, shadeHoles);
    // The terrace's face under its front, shaded on the right of the seal: arcs under the front, each shorter than the last.
    for (let j = 1; j <= 4; j++) d += cut(front(y0, j * 0.85, 0.52 + 0.04 * j, 0.99 - 0.07 * j), [...shadeHoles, ...sealHoles]);
    shades.push({ d, ...toneOf(k), delay: sweep(y0) + 0.1, t: 0.35 });
  }
  // The rock on the endless stretch, shaded on as it fades.
  for (let j = 0; j + 1 < strata.length; j++) {
    const [p0, p1] = [side(strata[j], 1), side(strata[j + 1], 1)];
    shades.push({
      d: hatchPoly([p0, [p0[0] + ROCK, p0[1]], [p1[0] + ROCK, p1[1]], p1], -45, 1.2, [...shadeHoles, endHole]),
      tone: past ? 'gold' : 'dull',
      delay: sweep(strata[j]) + 0.1,
      t: 0.3,
      o: Math.max(0.1, 0.8 ** j),
    });
  }
  // Sol's pointed rays, each hatched down one side.
  shades.push({ d: worn.rays, tone: 'gold', delay: 0.6, t: 0.3 });
  // The ground under the surface, in short slanting strokes.
  shades.push({
    d: hatchPoly(
      [
        [3, surfaceY],
        [side(TOP, -1)[0] - ROCK - 1.2, surfaceY],
        [side(TOP, -1)[0] - ROCK - 1.2, surfaceY + 2.4],
        [3, surfaceY + 2.4],
      ],
      -60,
      1.6,
      numHoles,
      0.3,
    ),
    tone: 'gold',
    delay: 0.4,
    t: 0.4,
  });

  // ---- seals and names ----
  const seals: Seal[] = ZONES.map((z, k) => {
    const known = k < reached;
    const c = sealC(k);
    return {
      k,
      c,
      r: R,
      known,
      delay: sweep(c[1] - R),
      ...(known ? { name: z.name, color: z.color, sigil: z.sigil } : { hollow: hollow(c, R - 1.9, 0.9) }),
    };
  });
  const names = seals
    .filter((s) => s.known)
    .map((s) => ({
      x: nameX(s.c[1]),
      y: s.c[1],
      text: s.name!,
      color: s.color!,
      delay: s.delay + 0.3,
    }));

  // ---- "uncharted": the zones not reached yet, bracketed together under one quiet word, the bracket's lines stopping short of it ----
  let uncharted: Uncharted | null = null;
  if (reached < ZONES.length) {
    let y0 = side(TOP + reached * band, -1)[1] + 2;
    const y1 = side(BOTTOM, -1)[1] - 3;
    // The word keeps clear of a star's depth over the bracket's top.
    const below = Math.max(y0, ...numBoxesShown.filter((b) => b[3] > y0 - 4 && b[1] < y0 + 12).map((b) => b[3] + 3));
    if (below > y0 && y1 - below > 30) y0 = below;
    const mid0 = (y0 + y1) / 2;
    // The bracket stands in the middle of the margin left of the lane (the names' column), the word on it.
    const edge = Math.min(
      rockAt(mid0) - LANE - NAME_GAP - Math.max(0, ...names.map((n) => layout.nameW?.[ZONES.findIndex((z) => z.name === n.text)] ?? n.text.length * 5.9)),
      rockAt(mid0) - 5 - UNCH_W,
    );
    const x = clamp((1 + edge) / 2 + UNCH_W / 2, UNCH_W / 2 + 1, rockAt(mid0) - 5 - UNCH_W / 2);
    let d = '';
    if (y1 - y0 > 30) {
      const tick = (yy: number) =>
        cut(
          [
            [x, yy],
            [rockAt(yy) - 2.5, yy],
          ],
          numHoles,
        );
      d =
        tick(y0) +
        tick(y1) +
        cut(
          [
            [x, y0],
            [x, y1],
          ],
          [{ box: [x - 30, mid0 - 8.5, x + 30, mid0 + 8.5] }, ...numHoles],
        );
    }
    uncharted = { d, x, y: mid0, delay: sweep(y0) + 0.35 };
  }

  // ---- the stars, each in a glory of fine rays between its points, long and short in turn ----
  const O: Pt = [0, 0];
  const glory = (r: number, g: number) =>
    Array.from({ length: 16 }, (_, k) => {
      const a = k * 22.5 + 11.25;
      return line(at(O, a, r * 0.62 + 1.4), at(O, a, k % 2 ? g - 2 : g));
    }).join('');
  const travelOf = (s: Spot) => (best ? clamp(0.8 + (0.4 * (s.c[1] - home[1])) / (H - home[1]), 0.8, 1.2) + (s.inSnake ? 0.25 : 0) : 0);
  const starOf = (s: Spot, num: Box | null, delay: number, moves: boolean): Star => {
    const [r, g] = s.inSnake ? [STAR_R_IN, GLORY_IN] : [STAR_R, GLORY];
    const st = star8(O, r);
    // Into the ouroboros: down the lane to the foot of the pit, then in.
    const foot = laneAt(side(BOTTOM, -1)[1]);
    return {
      c: s.c,
      r,
      gloryR: g,
      outline: st.outline,
      ridges: st.ridges,
      hatch: st.hatch,
      glory: glory(r, g),
      cut: g + 1,
      inSnake: s.inSnake,
      delay,
      from: moves ? [home[0] - s.c[0], home[1] - s.c[1]] : [0, 0],
      mid: moves && s.inSnake ? [foot[0] - s.c[0], foot[1] - s.c[1]] : null,
      travel: moves ? travelOf(s) : 0,
      num: num
        ? {
            text: s.text,
            x: s.inSnake ? num[0] : (num[0] + num[2]) / 2,
            y: (num[1] + num[3]) / 2,
            anchor: s.inSnake ? 'start' : 'middle',
          }
        : null,
    };
  };
  const star = starOf(gold, goldNum, best ? STAR_AT : 2, !!best);
  const landed = star.delay + 0.25 + star.travel;
  const last = showRed ? starOf(red!, redNum, landed + 0.1, false) : null;

  return {
    w: W,
    h: H,
    natural,
    parts,
    shades,
    seals,
    sol: { c: sol, r: SOL_R },
    names,
    uncharted,
    stations,
    marks,
    callouts,
    endless: {
      c: endC,
      r: endR,
      lit: past,
      delay: sweep(endC[1]) + 0.2,
      serpent: serpent((endR - 1.9) / 1.375, ((endR - 1.9) / 1.375) * 0.25),
    },
    legend,
    star,
    last,
  };
}
