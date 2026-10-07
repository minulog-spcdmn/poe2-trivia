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
// seal holding the ouroboros, an engraved serpent biting its tail, with the
// word "endless" beside it. No floor is ever drawn.
//
// An eight-pointed star in a glory of rays marks your deepest on the pit's
// right wall (by the mouth before a first run, beside the ouroboros past
// 100), its depth always beside it. Each find you have met is tied to its
// heading (`beside`: the finds list to the right of the plate) or to its
// callout (stacked on a phone or a tablet: the plate stands the finds'
// items and names on its own right): from the heading a short level stub,
// then one straight slanting line to the wall at the depth where it first
// turns up, that depth written on the line just outside the wall. The
// lines, their depths, the star and its depth are fitted together (fit())
// so that none of them crosses another.
//
// Everything is exact geometry in px: the pit's sides are straight lines
// converging downward, every terrace an ellipse whose depth is a fifth of
// its width, every ring a circle, Sol's rays and the star's glory radial;
// lines stop short of every seal, sign, star and word (holes); the rock
// beside the pit and the terraces' faces are shaded in one-sided hatching
// (the light falls from the upper left, as on the cards); main lines carry
// a few nicks of wear. Each stroke comes with its timing, so the plate draws
// itself in from the surface down as one sweep of the pen; then the star
// comes down the pit from the mouth to your deepest.

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
export type Stroke = { d: string; kind: Kind; delay: number; t: number; o?: number };
/** What lines stop short of: a circle, or a box. */
type Hole = { c: Pt; r: number } | { box: Box };
/**
 * A set of lines in one tone: gold (the plate's lines), dull (what is not
 * reached yet), zone (a reached zone's, in `color`), find (a find's leader,
 * in its colour). `lit` ones have a glow under them: the same lines whole
 * (unworn), drawn wide and soft.
 */
export type Tone = 'gold' | 'dull' | 'zone' | 'find';
export type Part = { tone: Tone; color?: string; lit: boolean; strokes: Stroke[]; glow: { d: string; kind: Kind }[] };
/** Hatching (one path, drawn at once), in the tone of its zone or dull; `o` fades it. */
export type Shade = { d: string; tone: Tone; color?: string; delay: number; t: number; o?: number };
export type Seal = { k: number; c: Pt; r: number; known: boolean; name?: string; color?: string; sigil?: Sigil; delay: number; hollow?: string };
/** The zones not reached yet, under one word: the bracket's lines, and where the word sits. */
export type Uncharted = { d: string; x: number; y: number; delay: number };
/** A find's heading beside the plate, where its leader ends: the left of its item and the middle of its line, in the plate's px. */
export type Target = { kind: FindKind; x: number; y: number };
/** A callout as the page sets it (stacked): its left and size, and its item's and its name's boxes inside it (from its top left). */
export type CalloutShape = { x: number; w: number; h: number; icon: Box; name: Box };
/** Where a callout stands (its top, in the plate's px), and whether you have met its find (only then is it tied to the pit). */
export type Callout = { kind: FindKind; top: number; met: boolean; delay: number };
/** A find you have met: the station on the wall where it first turns up (none when its line ends at the star). */
export type Station = { kind: FindKind; c: Pt; delay: number };
/** A depth written on a find's line, centred on `x`, `y`. */
export type Mark = { kind: FindKind; text: string; x: number; y: number; delay: number };
/** The serpent biting its tail, in the plate's px: its body, its head over the tip of its tail, its scales, the shading along its belly, its eye. */
export type Serpent = { body: string; head: string; scales: string; shade: string; eye: Pt };
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
  /** The last seal, on the endless stretch, holding the ouroboros; lit past 100. "endless" is written beside it. */
  endless: { c: Pt; r: number; lit: boolean; delay: number; serpent: Serpent; word: { x: number; y: number } };
  /**
   * The star, drawn about its centre `c` (its outline, ridges, hatching and glory are about 0, 0, so the glory can turn), and your
   * deepest beside it. It comes down from the mouth (`from`, relative to `c`) in `travel` s, starting at `delay`.
   */
  star: {
    c: Pt;
    r: number;
    gloryR: number;
    outline: string;
    ridges: string;
    hatch: string;
    glory: string;
    delay: number;
    from: Pt;
    travel: number;
    num: { text: string; x: number; y: number } | null;
  };
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
};

export const f = (v: number) => v.toFixed(2);
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const inHole = (p: Pt, h: Hole) => ('c' in h ? dist(p, h.c) < h.r : p[0] > h.box[0] && p[0] < h.box[2] && p[1] > h.box[1] && p[1] < h.box[3]);
const grow = (b: Box, d: number): Box => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
/** The pen's pace: fast at first, slowing at the end (the circle's stroke()). */
const ease = (u: number) => 1 - Math.sqrt(1 - Math.min(1, Math.max(0, u)));

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
      out.push({ d: 'M' + keep.map((s) => `${f(s[0])} ${f(s[1])}`).join('L'), kind, delay: delay + a * t, t: Math.max(0.03 * t, (b - a) * t), ...(o === undefined ? {} : { o }) });
    }
    i = j;
  }
  return out;
}

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
    .flatMap(([p, q]) => pen([p, q], 'hair', 0, 0, { holes }))
    .map((s) => s.d)
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
 * The ouroboros, engraved: a serpent on the circle `r` about `c`, its body
 * `w` either side of the circle at the neck and tapering to its tail, its
 * head at the top facing anticlockwise, broad at the jaw's hinge, its jaws
 * open on the tip of its tail, which runs into its mouth. Scales cross its
 * body as chevrons pointing to the tail, its belly (the inner edge) is
 * shaded in short strokes, and a ridge runs over its brow to the eye.
 */
function serpent(c: Pt, r: number, w: number): Serpent {
  const p = (a: number, rr: number) => at(c, a, rr);
  const path = (pts: Pt[]) => 'M' + pts.map((q) => `${f(q[0])} ${f(q[1])}`).join('L');
  const steps = (a0: number, a1: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n);
  /** The head runs from the neck (NECK) back anticlockwise to the snout (SNOUT), `ha(t)` of the way; the body from the neck clockwise round to its tail's tip, in the mouth. */
  const NECK = 34;
  const SNOUT = -20;
  const ha = (t: number) => NECK + (SNOUT - NECK) * t;
  const CORNER = 0.56;
  const TAIL = 360 + ha(0.66);
  const bw = (a: number) => w * (1 - 0.7 * ((a - NECK) / (TAIL - NECK)) ** 1.2);
  // The body: its two edges, closed round the tail's tip.
  const body = steps(NECK, TAIL - 2, 140);
  const outer = body.map((a) => p(a, r + bw(a)));
  const inner = body.map((a) => p(a, r - bw(a)));
  const bodyD = path([...outer, p(TAIL, r), ...inner.reverse()]) + 'Z';
  // The head over it: the crown swelling to the hinge and running out to a rounded snout; the upper lip back to the corner of the
  // mouth; the lower jaw out from there to its tip, and its underside back to the neck.
  const swell = (t: number) => Math.sin((Math.PI / 2) * Math.min(1, t / 0.34));
  const crown = steps(0, 0.97, 30).map((t) => p(ha(t), r + w * (t <= 0.34 ? 1 + 0.6 * swell(t) : 0.55 + 1.05 * (1 - ((t - 0.34) / 0.66) ** 1.7))));
  const snout = [p(ha(0.995), r + w * 0.4), p(ha(1), r + w * 0.22)];
  const upperLip = steps(0.985, CORNER, 10).map((t) => p(ha(t), r + w * (0.08 + 0.12 * ((t - CORNER) / (1 - CORNER)))));
  const lowerLip = steps(CORNER, 0.88, 8).map((t) => p(ha(t), r - w * (0.1 + 0.28 * ((t - CORNER) / (0.88 - CORNER)))));
  const jaw = steps(0.88, 0, 26).map((t) => p(ha(t), r - w * (t >= 0.86 ? 0.38 + 0.32 * ((0.88 - t) / 0.02) : t <= 0.34 ? 1 + 0.45 * swell(t) : 0.7 + 0.75 * ((0.86 - t) / 0.52) ** 0.8)));
  const head = path([...crown, ...snout, ...upperLip, ...lowerLip, ...jaw]) + 'Z';
  // Scales: chevrons across the body every 2.6 px or so, their points toward the tail, short of the edges.
  let scales = '';
  const arcLen = ((TAIL - 22 - NECK) * Math.PI * r) / 180;
  const n = Math.floor(arcLen / 2.6);
  for (let i = 0; i <= n; i++) {
    const a = NECK + 4 + ((TAIL - 26 - NECK) * i) / n;
    const b = bw(a) - 0.45;
    if (b < 0.45) continue;
    const da = ((b * 0.75) / r) * (180 / Math.PI);
    scales += path([p(a, r + b), p(a + da, r), p(a, r - b)]);
  }
  // The brow: a ridge from the neck over the eye.
  scales += path(steps(0.04, 0.44, 12).map((t) => p(ha(t), r + w * (t <= 0.34 ? 1 + 0.6 * swell(t) : 1.6) * 0.62)));
  // The belly in shadow: short strokes in from the inner edge.
  let shade = '';
  const m = Math.floor(arcLen / 1.05);
  for (let i = 0; i <= m; i++) {
    const a = NECK + 3 + ((TAIL - 24 - NECK) * i) / m;
    const b = bw(a);
    if (b < 0.8) continue;
    shade += path([p(a, r - b + 0.35), p(a, r - b * 0.4)]);
  }
  return { body: bodyD, head, scales, shade, eye: p(ha(0.3), r + w * 0.55) };
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
/** Where the segment p-q first enters the disc and where it leaves it (fractions of p-q), or null if it misses. */
function discCut(p: Pt, q: Pt, c: Pt, r: number): [number, number] | null {
  const d: Pt = [q[0] - p[0], q[1] - p[1]];
  const e: Pt = [p[0] - c[0], p[1] - c[1]];
  const a = d[0] * d[0] + d[1] * d[1];
  const b = 2 * (e[0] * d[0] + e[1] * d[1]);
  const k = e[0] * e[0] + e[1] * e[1] - r * r;
  const disc = b * b - 4 * a * k;
  if (disc <= 0 || a === 0) return null;
  const s = Math.sqrt(disc);
  const [t0, t1] = [(-b - s) / (2 * a), (-b + s) / (2 * a)];
  if (t1 < 0 || t0 > 1) return null;
  return [Math.max(0, t0), Math.min(1, t1)];
}

const rgb = (c: readonly number[]) => `rgb(${c.join(' ')})`;
/** The ten zones, as lib/descent names and colours them. */
export const ZONES = STRATA.slice(0, 10).map((z, k) => ({ name: z.name, color: rgb(z.look.accent), from: 10 * k + 1, sigil: sigilOf(z.name) }));

/** The terraces' depth: each is the front of an ellipse this much as deep as it is wide. */
const TILT = 0.2;
/** The rock shaded beside the pit's sides. */
const ROCK = 6;
/** How much narrower the pit is at the tenth zone's floor than at its mouth (each side). */
const TAPER = 7;
/** A zone's name stands this far from the rock. */
const NAME_GAP = 4;
/** The star and its glory. */
const STAR_R = 4.6;
const GLORY = 8.5;
/** Your deepest beside the star (Cinzel's bold figures at 13 px): about this wide a figure, this tall. */
const BEST_W = 7.6;
const BEST_H = 9.8;
/** A depth on a find's line (Cinzel's bold figures at 11 px). */
const MARK_W = 7;
const MARK_H = 8.2;
/** The seals' largest radius, and the room the lines need between the pit and the finds. */
const R_MAX = 14;
const ROOM_BESIDE = 40;
const ROOM_STACKED = 44;
/** Sol. */
const SOL_R = 8.5;

/** A callout's shape before the page has measured it: its item over its name in two lines. */
const CALLOUT_GUESS = (W: number): CalloutShape => ({ x: W - 64, w: 64, h: 52, icon: [0, 0, 10, 22], name: [0, 25, 62, 52] });

/**
 * The plate for a box `W` × `H` px, for a best run `deepest` deep (null
 * before a first run); `met` are the finds you have met, with the depth
 * each first turns up at; `layout` says where the caption is, and either
 * where the finds' headings are beside it or how its callouts are shaped.
 */
export function descentPlate(W: number, H: number, deepest: number | null, met: { kind: FindKind; from: number }[] = [], layout: Layout = {}): Plate {
  const caption = layout.caption ?? null;
  const beside = layout.beside ?? null;
  const stacked = !beside;
  const best = deepest && deepest > 0 ? Math.floor(deepest) : null;
  const reached = ZONES.filter((z) => best !== null && best >= z.from).length;
  const past = best !== null && best > 100;
  const shapes = Object.fromEntries(FINDS_IN_ORDER.map((x) => [x.kind, layout.callouts?.[x.kind] ?? CALLOUT_GUESS(W)])) as Record<FindKind, CalloutShape>;

  // ---- across: the zones' names | the pit | the lines | the finds (beside) or the callouts (stacked) ----
  const nameW = (k: number) => layout.nameW?.[k] ?? ZONES[k].name.length * 5.9 + 1;
  /** The pit's axis stands this far right of its half-width at the mouth, just clear of the longest name. */
  const C = 1 + Math.max(...ZONES.map((_, k) => nameW(k) + NAME_GAP + ROCK - (TAPER * (k + 0.5)) / 10));
  const wall = beside ? beside.wall : Math.min(...FINDS_IN_ORDER.map((x) => shapes[x.kind].x));
  const halfTop = clamp((wall - (stacked ? ROOM_STACKED : ROOM_BESIDE) - C - ROCK) / 2, 19, 36);
  const halfBot = halfTop - TAPER;
  const SOL_Y = SOL_R + 9;
  const capAX = caption && caption[3] > SOL_Y - SOL_R - 12 ? caption[2] + SOL_R + 14 : 0;
  const AX = Math.max(C + halfTop, capAX);

  // ---- down: Sol over the mouth, the ten zones, the endless stretch ----
  const TOP = SOL_Y + SOL_R + 6;
  const Rw = Math.min(R_MAX, halfBot - 6.5);
  const endR = clamp(Rw * 1.5, 15, 18);
  const END = 2 * endR + 21;
  const natural = Math.ceil(TOP + 10 * (2 * Rw + 8) + END);
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
  const nameX = (yy: number) => side(yy, -1)[0] - ROCK - NAME_GAP;
  /** The rock's outer edge on side `s` at height `yy` (a point on the slanting line, not a terrace's front). */
  const rockAt = (yy: number, s = -1) => {
    let t = yy;
    for (let i = 0; i < 6; i++) t = yy + TILT * half(t);
    return AX + s * (half(t) + ROCK);
  };
  /** Shown depth `s` on the right wall, just outside the rock. */
  const onWall = (s: number): Pt => {
    const p = side(TOP + (Math.min(100, s) * band) / 10, 1);
    return [p[0] + ROCK, p[1]];
  };

  // ---- the endless stretch: strata closing up below the tenth zone round a last, larger seal holding the ouroboros ----
  const strata: number[] = [BOTTOM];
  for (let g = band * 0.55; strata.at(-1)! + g < H - 2 && g > 1.6; g *= 0.72) strata.push(strata.at(-1)! + g);
  const endC: Pt = [AX, BOTTOM + 8 + endR];
  const endHole: Hole = { c: endC, r: endR + 1.4 };

  // ---- the star ----
  const surfaceY = TOP - TILT * halfTop;
  const mouth: Pt = [AX + halfTop + ROCK - 1, surfaceY];
  const star: Pt = past ? [AX + endR + GLORY + 1.5, endC[1]] : best ? [onWall(shownDepth(best))[0] - 1, onWall(shownDepth(best))[1]] : [AX + halfTop + ROCK + 4, surfaceY - 1];
  const sol: Pt = [AX, SOL_Y];
  const solHole: Hole = { c: sol, r: SOL_R + 1.4 };
  const sealHoles: Hole[] = ZONES.map((_, k) => ({ c: sealC(k), r: R + 1.3 }));

  // ---- timing: the pen sweeps down the pit once, then the star comes down ----
  const S0 = 0.4;
  const S = 1.35;
  const sweep = (yy: number) => S0 + ease((yy - TOP) / (H - TOP)) * S;
  const STAR_AT = 1.85;
  const travel = best ? clamp(0.8 + (0.4 * (star[1] - mouth[1])) / (H - mouth[1]), 0.8, 1.2) : 0;

  // ---- the finds: lines, their depths, the star's depth, fitted together ----
  const found = [...met].sort((a, b) => a.from - b.from);
  const fit = fitLeaders();

  function fitLeaders() {
    type Opt = { kind: FindKind; W: Pt; segs: Seg[]; path: Pt[]; box: Box; mark: Pt; cut: Hole | null; dot: boolean; cost: number };
    const starDisc = { c: star, r: GLORY + 1.6 };
    const bestText = best ? String(shownDepth(best)) : '';
    /** The boxes nothing may cross: Sol, and the callouts (each kind's item and name) or, beside, the finds' text. */
    const fixed: { box: Box; kind?: FindKind; icon?: boolean }[] = [{ box: [sol[0] - SOL_R - 12, 0, sol[0] + SOL_R + 12, sol[1] + SOL_R + 3] }];
    if (beside) fixed.push({ box: [wall - 1, -1e4, 1e5, 1e5] });
    const edgeX = (yy: number) => rockAt(yy, 1);

    /** The callouts' tops, as tried (stacked): spread down the pit, or each just above where its find turns up. */
    const layouts: { tops: Record<FindKind, number>; cost: number }[] = [];
    if (stacked) {
      const mid = (k: FindKind) => (shapes[k].icon[1] + shapes[k].icon[3]) / 2;
      const settle = (ys: number[]) => {
        const tops = FINDS_IN_ORDER.map((x, i) => ys[i] - mid(x.kind));
        for (let i = 1; i < tops.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + shapes[FINDS_IN_ORDER[i - 1].kind].h + 8);
        const over = tops.at(-1)! + shapes[FINDS_IN_ORDER.at(-1)!.kind].h - (H - 2);
        return Object.fromEntries(FINDS_IN_ORDER.map((x, i) => [x.kind, Math.max(0, tops[i] - Math.max(0, over))])) as Record<FindKind, number>;
      };
      const spread = (fr: number[]) => settle(fr.map((v) => TOP + (BOTTOM - TOP) * v));
      layouts.push({ tops: spread([0.08, 0.43, 0.78]), cost: 0 });
      layouts.push({ tops: spread([0.08, 0.38, 0.68]), cost: 2 });
      layouts.push({ tops: spread([0.06, 0.3, 0.54]), cost: 4 });
      layouts.push({ tops: settle(FINDS_IN_ORDER.map((x) => onWall(shownDepth(x.from))[1] - band * 0.3)), cost: 8 });
    } else layouts.push({ tops: {} as Record<FindKind, number>, cost: 0 });

    /** Every way to draw find `m`'s line to its heading at `E`: the stub's length, where its depth sits. */
    const optsFor = (m: { kind: FindKind; from: number }, E: Pt, blocks: { box: Box; kind?: FindKind; icon?: boolean }[]): Opt[] => {
      const W0 = onWall(shownDepth(m.from));
      const Wd: Pt = [W0[0] + 1.3, W0[1]];
      const text = String(shownDepth(m.from));
      const [mw, mh] = [text.length * MARK_W + 1, MARK_H];
      const out: Opt[] = [];
      for (const stub of [5, 9, 14, 20, 27, 35]) {
        const Sx: Pt = [E[0] - stub, E[1]];
        if (Sx[0] - Wd[0] < 8) continue;
        // The slant from the stub to the wall; if the star stands in its way near the wall, it ends at the star instead, or passes under it.
        const cut = discCut(Sx, Wd, starDisc.c, starDisc.r);
        const ends: { end: Pt; cut: Hole | null; dot: boolean; cost: number }[] = [];
        if (!cut) ends.push({ end: Wd, cut: null, dot: true, cost: 0 });
        else {
          if (dist(Wd, star) < GLORY + 16) ends.push({ end: lerp(Sx, Wd, cut[0]), cut: null, dot: false, cost: 22 });
          ends.push({ end: Wd, cut: { c: star, r: GLORY + 1.6 }, dot: true, cost: 60 });
        }
        for (const e of ends) {
          const u: Pt = [(Sx[0] - e.end[0]) / dist(Sx, e.end), (Sx[1] - e.end[1]) / dist(Sx, e.end)];
          const L = dist(Sx, e.end);
          const marks: { box: Box; cost: number }[] = [];
          // On the line, just outside the wall (or the star), or a little further out: the line stops short of it either side.
          let t0 = 0;
          for (let t = 3; t < L - 3; t += 0.5) {
            const c = [e.end[0] + u[0] * t, e.end[1] + u[1] * t];
            const b: Box = [c[0] - mw / 2, c[1] - mh / 2, c[0] + mw / 2, c[1] + mh / 2];
            if (b[0] < Math.max(edgeX(b[1]), edgeX(b[3]), Wd[0] + 1.1) + 2.6) continue;
            if (boxDisc(b, star, GLORY + 1.2)) continue;
            if (t + mw / 2 > L - 2) break;
            if (!t0) t0 = t;
            if (t === t0 || t === t0 + 7 || t === t0 + 14 || t === t0 + 21) marks.push({ box: b, cost: t0 * 0.08 + (t - t0) * 0.3 });
          }
          // Beside the station, on the side away from the line.
          if (e.dot) {
            const below = Sx[1] < Wd[1] - 1;
            const b: Box = below ? [Wd[0] + 2.2, Wd[1] + 1.8, Wd[0] + 2.2 + mw, Wd[1] + 1.8 + mh] : [Wd[0] + 2.2, Wd[1] - 1.8 - mh, Wd[0] + 2.2 + mw, Wd[1] - 1.8];
            marks.push({ box: b, cost: 3 });
          }
          for (const mk of marks) {
            const segs: Seg[] = [
              [E, Sx],
              [Sx, e.end],
            ];
            // Against what is fixed: Sol, the callouts (its own item excepted), the finds' text, the star.
            let bad = 0;
            for (const s of segs) for (const bl of blocks) if (!(bl.kind === m.kind && bl.icon) && segBox(s, bl.box, 1.2)) bad++;
            if (!e.cut && e.dot && segs.some((s) => discCut(s[0], s[1], starDisc.c, starDisc.r - 0.4))) bad++;
            for (const bl of blocks) if (boxBox(mk.box, bl.box, 1.5)) bad++;
            if (boxDisc(mk.box, star, GLORY + 1.2)) bad++;
            out.push({
              kind: m.kind,
              W: Wd,
              segs,
              path: [e.end, Sx, E],
              box: mk.box,
              mark: [(mk.box[0] + mk.box[2]) / 2, (mk.box[1] + mk.box[3]) / 2],
              cut: e.cut,
              dot: e.dot,
              cost: 1000 * bad + e.cost + mk.cost + Math.abs(stub - 9) * 0.15,
            });
          }
        }
      }
      return out.sort((a, b) => a.cost - b.cost).slice(0, 7);
    };

    /** Where your deepest can stand: beside the star, level with it, or a little above or below, tucked under its glory. */
    const bestBoxes = (): { box: Box; cost: number }[] => {
      if (!best) return [];
      const [bw, bh] = [bestText.length * BEST_W, BEST_H];
      const out: { box: Box; cost: number }[] = [];
      for (const dy of [0, -6, 6, -11, 11, -16, 16, -21, 21]) {
        const cy = star[1] + dy;
        const off = Math.max(0, Math.abs(dy) - bh / 2);
        const hx = Math.sqrt(Math.max(0, (GLORY + 1.6) ** 2 - off * off));
        const wallX = past ? endC[0] + endR + 2 : Math.max(edgeX(cy - bh / 2), edgeX(cy + bh / 2)) + 1.5;
        const left = Math.max(star[0] + hx + 1.5, wallX);
        out.push({ box: [left, cy - bh / 2, left + bw, cy + bh / 2], cost: Math.abs(dy) * 0.7 });
      }
      // Or right under the star, or over it, on the rock (whose lines stop short of it), clear of the seals.
      if (!past)
        for (const [top, cost] of [
          [star[1] + GLORY + 1.2, 9],
          [star[1] - GLORY - 1.2 - bh, 10],
        ]) {
          const b: Box = [star[0] - bw / 2, top, star[0] + bw / 2, top + bh];
          if (ZONES.every((_, k) => !boxDisc(b, sealC(k), R + 2))) out.push({ box: b, cost });
        }
      return out;
    };

    type Choice = { cost: number; opts: Opt[]; num: Box | null; tops: Record<FindKind, number> };
    const won: { c: Choice | null } = { c: null };
    for (const lay of layouts) {
      const blocks = [...fixed];
      const Es: Partial<Record<FindKind, Pt>> = {};
      if (stacked)
        for (const x of FINDS_IN_ORDER) {
          const s = shapes[x.kind];
          const top = lay.tops[x.kind];
          blocks.push({ box: [s.x + s.icon[0], top + s.icon[1], s.x + s.icon[2], top + s.icon[3]], kind: x.kind, icon: true });
          blocks.push({ box: [s.x + s.name[0], top + s.name[1], s.x + s.name[2], top + s.name[3]], kind: x.kind });
          Es[x.kind] = [s.x + s.icon[0] - 2.5, top + (s.icon[1] + s.icon[3]) / 2];
        }
      else for (const t of beside!.targets) Es[t.kind] = [t.x - 2.6, t.y];
      const ms = found.filter((m) => Es[m.kind]);
      const per = ms.map((m) => optsFor(m, Es[m.kind]!, blocks));
      if (per.some((p) => p.length === 0)) continue;
      const nums = best ? bestBoxes() : [{ box: null as Box | null, cost: 0 }];
      // Every pairing of the options, kept clear of each other.
      const pick = (i: number, chosen: Opt[]): void => {
        if (i < per.length) {
          for (const o of per[i]) pick(i + 1, [...chosen, o]);
          return;
        }
        let base = lay.cost;
        for (let a = 0; a < chosen.length; a++) {
          base += chosen[a].cost;
          for (let b = a + 1; b < chosen.length; b++) {
            const [A, B] = [chosen[a], chosen[b]];
            if (A.segs.some((s) => B.segs.some((t) => segSeg(s, t) < 2.2))) base += 1000;
            if (boxBox(A.box, B.box, 1.5)) base += 1000;
            if (A.segs.some((s) => segBox(s, B.box, 1.2)) || B.segs.some((s) => segBox(s, A.box, 1.2))) base += 1000;
            if (A.segs.some((s) => segPt(s, B.W) < 2.2) || B.segs.some((s) => segPt(s, A.W) < 2.2)) base += 1000;
          }
        }
        for (const n of nums) {
          let cost = base + n.cost;
          if (n.box) {
            const nb = n.box;
            if (chosen.some((o) => o.segs.some((s) => segBox(s, nb, 1.5)) || boxBox(o.box, nb, 1.5))) cost += 1000;
            // Not so close to a line's depth that the two read as one.
            if (chosen.some((o) => boxBox(o.box, nb, 7))) cost += 12;
            if (blocks.some((bl) => boxBox(nb, bl.box, 1.5))) cost += 1000;
            if (nb[2] > W + (stacked ? 0 : 1e4) || nb[1] < 0 || nb[3] > H) cost += 1000;
          }
          if (!won.c || cost < won.c.cost) won.c = { cost, opts: chosen, num: n.box, tops: lay.tops };
        }
      };
      pick(0, []);
      if (won.c && won.c.cost < 1000 && lay.cost === 0) break;
    }
    const c = won.c;
    const num = c?.num && best ? { text: bestText, x: (c.num[0] + c.num[2]) / 2, y: (c.num[1] + c.num[3]) / 2 } : null;
    return { opts: c?.opts ?? [], num, numBox: c?.num ?? null, tops: c?.tops ?? null };
  }

  const starHole: Hole = { c: star, r: GLORY + 1 };
  const numHole: Hole[] = fit.numBox ? [{ box: grow(fit.numBox, 1.5) }] : [];
  const markHoles: Hole[] = fit.opts.map((o) => ({ box: grow(o.box, 1.5) }));
  const stations: Station[] = fit.opts.filter((o) => o.dot).map((o) => ({ kind: o.kind, c: o.W, delay: sweep(o.W[1]) + 0.45 }));
  const lineAt = (o: { W: Pt }) => sweep(o.W[1]) + 0.45;
  const marks: Mark[] = fit.opts.map((o) => {
    const m = found.find((x) => x.kind === o.kind)!;
    return { kind: o.kind, text: String(shownDepth(m.from)), x: o.mark[0], y: o.mark[1], delay: lineAt(o) + 0.4 };
  });
  const callouts: Callout[] | null =
    stacked && fit.tops ? FINDS_IN_ORDER.map((x, i) => ({ kind: x.kind, top: fit.tops![x.kind], met: found.some((m) => m.kind === x.kind), delay: 1.1 + 0.12 * i })) : null;

  /** Every line, worn (for the lines) or whole (for the glow under them). */
  const build = (worn: boolean) => {
    const wear = (seed: number) => (worn ? wearOf(seed) : null);
    const parts: Omit<Part, 'glow'>[] = [];
    const rays: string[] = [];
    const add = (tone: Part['tone'], strokes: Stroke[], lit = true, color?: string) => parts.push({ tone, strokes, lit, color });
    const common: Hole[] = [starHole, ...numHole, ...markHoles];

    // Sol over the mouth: a double ring in a glory over the surface, seven pointed rays (hatched down one side) and fine rays between, long and short in turn.
    const glory: Stroke[] = [];
    const gHoles: Hole[] = [starHole, ...(caption ? [{ box: [caption[0] - 2, caption[1] - 2, caption[2] + 2, caption[3] + 1] as Box }] : [])];
    const at0 = (a: number) => 0.35 + (Math.abs(a) / 90) * 0.3;
    for (let i = 0; i < 7; i++) {
      const a = -90 + i * 30;
      const [l, r, tip] = [at(sol, a - 4.2, SOL_R + 1.6), at(sol, a + 4.2, SOL_R + 1.6), at(sol, a, SOL_R + (i % 2 ? 8.5 : 11))];
      glory.push(...pen([l, tip], 'thin', at0(a), 0.3, { holes: gHoles }), ...pen([r, tip], 'thin', at0(a), 0.3, { holes: gHoles }));
      rays.push(hatch(at(sol, a, SOL_R + 1.6), l, tip, 0.62, { holes: gHoles.filter((g): g is Disc => 'c' in g) }));
    }
    for (const a of [-100, ...Array.from({ length: 12 }, (_, i) => -80 + Math.floor(i / 2) * 30 + (i % 2) * 10), 100])
      glory.push(...pen([at(sol, a, SOL_R + 1.8), at(sol, a, SOL_R + (Math.abs(a) === 100 ? 4.2 : 5.6))], 'hair', at0(a) + 0.05, 0.22, { holes: gHoles }));
    add('gold', [...pen(arcPts(sol, SOL_R), 'main', 0.05, 0.45, { wear: wear(5) }), ...pen(arcPts(sol, SOL_R - 1.3), 'hair', 0.1, 0.45), ...glory]);

    // The surface, level out from the mouth to the column's edge on the left, a short way on the right; a hairline under it on the left.
    const [ml, mr] = [side(TOP, -1), side(TOP, 1)];
    const surface = [
      ...pen([ml, [1, surfaceY]], 'main', 0.2, 0.5, { holes: common, wear: wear(3) }),
      ...pen([mr, [mr[0] + ROCK + 2.5, surfaceY]], 'main', 0.2, 0.2, { holes: common }),
      ...pen([[ml[0] - ROCK - 1.2, surfaceY + 2.4], [3, surfaceY + 2.4]], 'hair', 0.28, 0.45, { holes: common }),
    ];
    // The mouth: its far rim, behind Sol, and its near one (the first terrace's front).
    const back = Array.from({ length: 41 }, (_, i) => {
      const phi = Math.PI + (Math.PI * i) / 40;
      return [AX + halfTop * Math.cos(phi), surfaceY + TILT * halfTop * Math.sin(phi)] as Pt;
    });
    surface.push(...pen(back, 'thin', 0.15, 0.4, { holes: [solHole, starHole] }));
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
      sides.push(...pen(run(s, 0, p0[1], p1[1]), 'main', S0, S * (1 - fadeT), { holes: common, wear: wear(s > 0 ? 11 : 13) }));
      sides.push(...pen(run(s, ROCK, p0[1], p1[1]), 'thin', S0 + 0.05, S * (1 - fadeT), { holes: [...common, ...stationHoles], wear: wear(s > 0 ? 19 : 23) }));
      for (const [out, kind] of [
        [0, 'main'],
        [ROCK, 'thin'],
      ] as const)
        deep.push(
          ...dashes(...run(s, out, p1[1], H - 0.5), kind, sweep(p1[1]), 0.5, (i) => 7 * 0.72 ** i + 0.6, (i) => 1.3 + 0.55 * i, (i) => 0.9 * 0.8 ** i, [...common, endHole]),
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
        if (k > 0) strokes.push(...pen([p, [p[0] + s * ROCK, p[1]]], 'hair', sweep(yy), 0.06, { holes: [...common, ...stationHoles] }));
      }
      // Its far rim, behind the seal above.
      if (k > 0) {
        const [a, b] = [half(yy), TILT * half(yy)];
        const back = Array.from({ length: 41 }, (_, i) => {
          const phi = Math.PI + (Math.PI * i) / 40;
          return [AX + a * Math.cos(phi), yy - b + b * Math.sin(phi)] as Pt;
        });
        strokes.push(...pen(back, 'hair', sweep(yy - 2 * b), 0.3, { holes: [...common, ...sealHoles] }));
      }
      add(lit ? 'gold' : 'dull', strokes, lit);
    }

    // The endless stretch: the strata below the tenth zone, closing up and fading in the pit, round the last seal.
    for (let j = 1; j < strata.length; j++) {
      const yy = strata[j];
      const o = Math.max(0.12, 0.85 * 0.78 ** (j - 1));
      deep.push(...pen(front(yy), 'hair', sweep(yy), 0.25, { holes: [...common, endHole], o }));
    }
    add(
      past ? 'gold' : 'dull',
      [...deep, ...pen(arcPts(endC, endR), 'thin', sweep(endC[1] - endR), 0.4, { wear: wear(60), holes: common }), ...pen(arcPts(endC, endR - 1.3), 'hair', sweep(endC[1] - endR) + 0.05, 0.4, { holes: common })],
      past,
    );

    // The seals: a worn double ring, struck in the zone's colour once reached, a dull impression until then.
    for (let k = 0; k < 10; k++) {
      const c = sealC(k);
      const known = k < reached;
      const d = sweep(c[1] - R);
      const rings = [...pen(arcPts(c, R), 'thin', d, 0.35, { wear: wear(40 + k), holes: [starHole, ...numHole] }), ...pen(arcPts(c, R - 1.2), 'hair', d + 0.05, 0.35, { holes: [starHole, ...numHole] })];
      if (known) add('zone', rings, true, ZONES[k].color);
      else add('dull', rings, false);
    }

    // The finds' lines: from the wall (or the star), slanting out to the stub, and level to the heading's item.
    for (const o of fit.opts) {
      const holes: Hole[] = [{ box: grow(o.box, 1.6) }, ...numHole, solHole, ...(o.cut ? [o.cut] : [])];
      add('find', pen(o.path, 'hair', lineAt(o), 0.55, { holes }), false, `var(--find-${o.kind})`);
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
  const shadeHoles: Hole[] = [starHole, ...numHole, ...markHoles];
  const toneOf = (k: number) => (k < reached ? { tone: 'zone' as const, color: ZONES[k].color } : { tone: 'dull' as const });
  for (let k = 0; k < 10; k++) {
    const [y0, y1] = [TOP + k * band, TOP + (k + 1) * band];
    // The rock beside the pit, shaded on the right only, the side in shadow (the left is lit).
    const [p0, p1] = [side(y0, 1), side(y1, 1)];
    let d = hatchPoly([p0, [p0[0] + ROCK, p0[1]], [p1[0] + ROCK, p1[1]], p1], -45, 1.2, shadeHoles);
    // The terrace's face under its front, shaded on the right of the seal: arcs under the front, each shorter than the last.
    for (let j = 1; j <= 4; j++) d += pen(front(y0, j * 0.85, 0.52 + 0.04 * j, 0.99 - 0.07 * j), 'hair', 0, 0, { holes: [...shadeHoles, ...sealHoles] }).map((s) => s.d).join('');
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
      [starHole],
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
    return { k, c, r: R, known, delay: sweep(c[1] - R), ...(known ? { name: z.name, color: z.color, sigil: z.sigil } : { hollow: hollow(c, R - 1.9, 0.9) }) };
  });
  const names = seals.filter((s) => s.known).map((s) => ({ x: nameX(s.c[1]), y: s.c[1], text: s.name!, color: s.color!, delay: s.delay + 0.3 }));

  // ---- "uncharted": the zones not reached yet, bracketed together under one quiet word, the bracket's lines stopping short of it ----
  let uncharted: Uncharted | null = null;
  if (reached < ZONES.length) {
    const y0 = side(TOP + reached * band, -1)[1] + 2;
    const y1 = side(BOTTOM, -1)[1] - 3;
    const mid0 = (y0 + y1) / 2;
    const x = rockAt(mid0) - 5 - 27;
    let d = '';
    if (y1 - y0 > 30) {
      const tick = (yy: number) => line([x, yy], [rockAt(yy) - 2.5, yy]);
      d = tick(y0) + tick(y1) + pen([[x, y0], [x, y1]], 'hair', 0, 1, { holes: [{ box: [x - 30, mid0 - 8.5, x + 30, mid0 + 8.5] }] }).map((s) => s.d).join('');
    }
    uncharted = { d, x, y: mid0, delay: sweep(y0) + 0.35 };
  }

  // ---- the star, in a glory of fine rays between its points, long and short in turn ----
  const O: Pt = [0, 0];
  const st = star8(O, STAR_R);
  const glory = Array.from({ length: 16 }, (_, k) => {
    const a = k * 22.5 + 11.25;
    return line(at(O, a, STAR_R * 0.62 + 1.4), at(O, a, k % 2 ? GLORY - 2 : GLORY));
  }).join('');
  const endW = Math.max(endR, half(endC[1]) + ROCK) + 6;

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
      serpent: serpent(endC, endR - 3 - endR * 0.2, endR * 0.14),
      word: { x: endC[0] - endW, y: endC[1] },
    },
    star: {
      c: star,
      r: STAR_R,
      gloryR: GLORY,
      outline: st.outline,
      ridges: st.ridges,
      hatch: st.hatch,
      glory,
      delay: best ? STAR_AT : 2,
      from: best ? [mouth[0] - star[0], mouth[1] - star[1]] : [0, 0],
      travel,
      num: fit.num,
    },
  };
}
