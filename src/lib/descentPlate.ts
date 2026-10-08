// The descent plate on Delve's rules page (DelveLadder.svelte): the pit the
// players go down, engraved as the alchemist's circle is (docs/arcane-style.md).
//
// Sol stands over the mouth of a pit seen a little from above, its rays
// turning slowly, those below the ground hidden by it. The pit
// narrows down through the ten zones, each a ring of terrace whose edge is
// an ellipse (its near half firm, its far half a hairline passing behind
// the seal above). Each terrace holds a seal on the pit's axis: a zone you
// have reached is struck in its colour with its sigil (lib/zoneSigils) and
// named in the margin, its terrace lit; one you haven't is a dull
// impression, an empty hollow.
//
// Past the tenth zone the pit never ends: its walls carry on, breaking into
// shorter and shorter dashes as they fade into the dark round a last, larger
// seal holding the ouroboros (the user's own artwork, after an old woodcut:
// a thick scaled serpent closing into a ring, its jaws open wide over its
// own tail; its head reaches over the seal's ring), which turns. No floor
// is ever drawn. The zones not reached yet are held in a fine brace beside
// the wall, its beak on the word "uncharted", and the wall's outer line
// runs broken beside them.
//
// The pit's left wall is a wide band between two lines, and the stars stand
// in it like beads in a gauge: a gold one at your deepest (at the mouth
// before a first run) and a red one at your last run, each with its depth
// under it, their cutouts breaking the wall's lines round them. Past 100 a
// star sits inside the ouroboros, its depth under it inside the ring. When the two
// would overlap they are one star, its colour drifting between gold and
// red, the last run's depth over it and yours under it. A legend level
// with the ouroboros, half its radius from it, says which star is which.
//
// Each find you have met is tied to its heading (`beside`: the finds list
// to the right of the plate) or to its callout (stacked on a phone or a
// tablet: the plate stands the finds' items and names on its own right) by
// a gold line: out of the right wall level at the depth where it first
// turns up, one straight slant, then a short level stub into the heading,
// that depth written in the middle of the slant (the line broken round it).
// The lines, their depths, the stars and their depths are fitted together
// (fitLeaders()) so that none of them crosses another.
//
// Everything is exact geometry in px: the pit's sides are straight lines
// converging downward, every terrace an ellipse whose depth is a fifth of
// its width, every ring a circle, Sol's rays and the stars' glories radial;
// lines stop short of every seal, sign and word (holes; the stars' own
// cutouts are masks in the component, so they move with a star); the rock
// beside the pit and the terraces' faces are shaded in one-sided hatching
// (the light falls from the upper left, as on the cards); main lines carry
// a few nicks of wear.
//
// Each stroke comes with its timing, so the plate engraves itself in a
// sequence (about 2 s): Sol kindles over the mouth; the walls are inked
// down the shaft (a bright nib at the head of each, the line cooling behind
// it), each terrace opening out from its middle and each seal stamped as
// the pen passes; the finds' lines reach out from the wall to their
// headings one after another, shallowest first; the ouroboros coils in;
// then the gold star comes down the wall from the mouth to your deepest,
// gathering speed and slowing to settle there (longer the farther it goes),
// a glint ringing out as it lands, and the red one appears where your last
// run ended.

import { at, hatch, line, seeded, star8 } from './arcane.ts';
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
/**
 * The zones not reached yet, held in a brace beside the wall: its two halves
 * (each from the beak out to a terminal, so they draw outward), the ball at
 * each terminal, and where the word stands (its right end, by the beak).
 */
export type Uncharted = {
  upper: string;
  lower: string;
  balls: Pt[];
  x: number;
  y: number;
  delay: number;
};
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
 * The ouroboros on the last seal (lib/ouroborosArt: two snakes, each biting
 * the other's tail, in its drawing's px about the ring's centre), drawn at
 * `scale` on the seal's centre (and mirrored, so the snakes look clockwise,
 * the way it turns). Each snake draws in from where its body meets the
 * other's head (`from`, degrees clockwise from the top, in the drawing) round
 * to its own head; the second is the first turned half round.
 * `inner` and `reach` are how near the centre (the heads' jaws) and how far
 * from it (the heads' crowns) it goes, `hole` the radius of the ring's hole
 * and `mid` the middle of its body, in px.
 */
export type Ouro = { scale: number; from: number; inner: number; hole: number; mid: number; reach: number };
/**
 * A star, drawn about its centre `c` (its outline, ridges, hatching and glory
 * are about 0, 0, so the glory can turn), its depth by it. The gold one comes
 * down from the mouth (`from`, relative to `c`, by way of `mid` when it goes
 * into the ouroboros) in `travel` s, starting at `delay`; the red one appears
 * at `delay`. `cut` is the radius its cutout clears round it. `both`: the
 * last run is at your best (or would overlap it), so this one star stands
 * for both, its colour drifting between them, the last run's depth
 * (`lastNum`) over yours.
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
  both: boolean;
  delay: number;
  from: Pt;
  mid: Pt | null;
  travel: number;
  num: {
    text: string;
    x: number;
    y: number;
    anchor: 'middle' | 'start';
    /** Its size, as a share of the usual (less only where it must fit inside the ouroboros' ring). */
    size: number;
  } | null;
  lastNum: { text: string; x: number; y: number; size: number } | null;
};
/** The legend left of the ouroboros, about 30 px from it: a row for each kind of star, its small star at `x`, its words after it. */
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
  /**
   * Sol over the mouth, on a layer of its own: its rings, its rays (pointed,
   * hatched down one side, and fine between them) all round it about 0, 0,
   * so they can turn, hidden below the ground (`horizon`: a clipping path
   * about `c` round what lies over the surface and the mouth's far rim).
   */
  sol: { c: Pt; r: number; rays: string; hatch: string; fine: string; horizon: string };
  /**
   * The walls as they are inked down, from the mouth to the tenth zone's
   * floor: each line whole (a short hot stretch of it runs down with the
   * pen), and the nibs at the head of the pen on the pit's sides.
   */
  ink: { d: string; delay: number; t: number }[];
  nibs: { from: Pt; to: Pt; delay: number; t: number }[];
  /** The left wall (the stars' band): its inner and outer lines' x at the mouth (`y0`) and at the tenth zone's floor (`y1`). */
  wallL: { y0: number; y1: number; inner: [number, number]; outer: [number, number] };
  names: { x: number; y: number; text: string; color: string; delay: number }[];
  uncharted: Uncharted | null;
  stations: Station[];
  marks: Mark[];
  /** Stacked: the finds' callouts on the plate's right; null beside the finds list. */
  callouts: Callout[] | null;
  /** The last seal, on the endless stretch, holding the ouroboros; lit past 100. */
  endless: { c: Pt; r: number; lit: boolean; delay: number; ouro: Ouro };
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
/** A line's pieces as one path, with no timing (hatching and the like, drawn at once). */
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
 * The ouroboros' ring, measured in its drawing's px (lib/ouroborosArt): the
 * hole's radius and the body's outer edge (each to the outside of its
 * outline), how far the heads reach and how near the centre their jaws come;
 * and where each snake's body meets the other's head (clockwise from the top).
 */
const OURO = { hole: 197.8, outer: 243.7, reach: 248.9, inner: 169.4, from: 156 };

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
/** The rock shaded beside the pit's right side; the left wall, a band the stars stand in. */
const ROCK = 6;
const LW = 13;
/** How much narrower the pit is at the tenth zone's floor than at its mouth (each side). */
const TAPER = 7;
/** A zone's name stands this far from the left wall. */
const NAME_GAP = 5.5;
/** The stars and their glories; larger inside the ouroboros, which they have to themselves. */
const STAR_R = 4.4;
const GLORY = 7.4;
const STAR_R_IN = 6;
const GLORY_IN = 9.6;
/** A star's depth (Cinzel's bold figures at 13 px): about this wide a figure, this tall; two stacked this far apart. */
const BEST_W = 7.6;
const BEST_H = 9.8;
const STACK = 12;
/** A depth on a find's line (Cinzel's bold figures at 11 px). */
const MARK_W = 7;
const MARK_H = 8.2;
/** A find's line runs level this far out of the wall before it slants. */
const HANDLE = 5;
/** The seals' largest radius, and the room the lines need between the pit and the finds (kept whether any is drawn or not). */
const R_MAX = 14;
const ROOM_BESIDE = 36;
const ROOM_STACKED = 34;
/** The last seal's radius (the ouroboros' body's outer edge): it must read at a glance and hold a star and its depths; set by the plate's width alone. */
const END_R = 38;
const END_R_MIN = 32;
/** "uncharted" as set (EB Garamond italic, 12.5 px), with its brace (the brace's curl, its gap from the wall). */
const UNCH_WORD = 50;
const BRACE = 3;
const BRACE_GAP = 3.2;
const UNCH_W = UNCH_WORD + 3 + 2 * BRACE + BRACE_GAP;
/** Sol. */
const SOL_R = 8.5;
/** The legend's small stars and its words (12 px): the star's radius, the words' height, a row's height. */
export const KEY_R = 3.4;
const KEY_ROW = 14;
/** The legend stands level with the ouroboros, right-aligned about 30 px from it (at least KEY_GAP_MIN where there is room). */
const KEY_GAP = 30;
const KEY_GAP_MIN = 24;

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
  // The plate is laid out as if every find were met (their lines and depths fitted in), so nothing moves as finds are met; only
  // the lines of the finds met are drawn.
  const allFinds = FINDS_IN_ORDER.map((x) => ({ kind: x.kind, from: x.from }));
  const isMet = (k: FindKind) => found.some((m) => m.kind === k);

  // ---- across: the zones' names | the left wall (the stars' band) | the pit | the rock | the lines | the finds (beside) or the callouts (stacked) ----
  const nameW = (k: number) => layout.nameW?.[k] ?? ZONES[k].name.length * 5.9 + 1;
  const keyW = (layout.legendW ? Math.max(layout.legendW.best, lastD ? layout.legendW.last : 0) : lastD ? 44 : 46) + 2 * KEY_R + 5;
  const slant = (k: number) => (TAPER * (k + 0.5)) / 10;
  // The pit's half-width at the mouth plus what stands left of it: the names shown, or the brace of the zones not reached.
  const need = Math.max(30, ...ZONES.slice(0, reached).map((_, k) => nameW(k) + NAME_GAP + LW - slant(k)), reached < 10 ? UNCH_W + LW - slant((reached + 9) / 2) : 0);
  const wall = beside ? beside.wall : Math.min(...FINDS_IN_ORDER.map((x) => shapes[x.kind].x));
  const room = stacked ? ROOM_STACKED : ROOM_BESIDE;
  const SOL_Y = SOL_R + 12;
  const capAX = caption && caption[3] > SOL_Y - SOL_R - 12 ? caption[2] + SOL_R + 15 : 0;
  let halfTop = clamp((wall - room - 1 - need - ROCK) / 2, 19, stacked ? 56 : 34);
  const endR0 = clamp(Math.round(W * 0.2), END_R_MIN, END_R);
  let AX = Math.max(1 + need + halfTop, capAX, keyW + KEY_GAP_MIN + endR0 + 3);
  const spare = wall - room - ROCK - halfTop - AX;
  // Room to spare goes to the margin, and half of it to the lines when there are any; too little narrows the pit.
  if (spare > 0) AX += spare / 2;
  else halfTop = Math.max(19, halfTop + spare);
  const halfBot = halfTop - TAPER;
  // The last seal (the ouroboros): the depths past 100 go inside its ring, so nothing beside it limits its size.
  const reachOf = (r: number) => ((r - 1.4) * OURO.reach) / OURO.outer;
  const endR = endR0;

  // ---- down: Sol over the mouth, the ten zones, the endless stretch ----
  const TOP = SOL_Y + SOL_R + 6;
  const Rw = Math.min(stacked ? R_MAX - 2 : R_MAX, halfBot - 6.5);
  // The ouroboros: its body just inside the seal's ring, its head reaching over it.
  const ouroScale = (endR - 1.4) / OURO.outer;
  const endReach = reachOf(endR);
  const END = endR + Math.ceil(endReach) + 12;
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
  /** The x of the line `out` beyond the pit's side `s` at height `yy` (a point on the slanting line, not a terrace's front). */
  const edgeAt = (yy: number, s: number, out: number) => {
    let t = yy;
    for (let i = 0; i < 6; i++) t = yy + TILT * half(t);
    return AX + s * (half(t) + out);
  };
  /** The wall's outer edge on side `s`: the stars' band on the left, the rock on the right. */
  const rockAt = (yy: number, s = -1) => edgeAt(yy, s, s < 0 ? LW : ROCK);
  const nameX = (yy: number) => rockAt(yy) - NAME_GAP;
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

  // ---- timing: the walls are inked down the shaft, then the finds' lines reach out, the ouroboros coils in, the stars come ----
  const surfaceY = TOP - TILT * halfTop;
  const [wTop, wBot] = [side(TOP, 1)[1], side(BOTTOM, 1)[1]];
  /** The walls' pen: it sets off down the shaft at INK and reaches the tenth zone's floor INK_T later, then runs on into the dark. */
  const INK = 0.32;
  const INK_T = 0.82;
  const DEEP_T = 0.4;
  const sweep = (yy: number) => (yy <= wBot ? INK + ease((yy - wTop) / (wBot - wTop)) * INK_T : INK + INK_T + DEEP_T * clamp((yy - wBot) / (H - wBot), 0, 1));
  /** The finds' lines reach out one after another, shallowest first. */
  const LINES_AT = 1.02;
  const LINE_STEP = 0.17;
  const LINE_T = 0.5;
  /** The ouroboros coils in, then the gold star sets off from the mouth. */
  const COIL_AT = Math.max(1.18, sweep(BOTTOM + 6) + 0.02);
  const STAR_AT = 1.3;

  // ---- the stars: in the left wall at their depth, by the mouth before a first run, in the ouroboros past 100 ----
  const laneAt = (y: number): Pt => [edgeAt(y, -1, LW / 2), y];
  const home = laneAt(surfaceY);
  // About a seal's radius from it, less on a narrow plate, never off the plate's left edge.
  const keyGap = Math.min(KEY_GAP, endC[0] - endR - keyW - 3);
  const legendX = endC[0] - endR - keyGap - keyW;
  const keyBox = (rows: number): Box => [legendX - 2, endC[1] - (rows * KEY_ROW) / 2 - 3, legendX + keyW + 2, endC[1] + (rows * KEY_ROW) / 2 + 3];
  const nameBoxes: Box[] = ZONES.slice(0, reached).map((_, k) => {
    const y = sealC(k)[1];
    return [nameX(y) - nameW(k), y - 6, nameX(y), y + 6];
  });
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
  /**
   * Where a star's depths can go: under it (or over it, if under won't fit).
   * Two (the one star for both): the last run's over the star and yours
   * under it (or both stacked under it, if that won't fit). In the
   * ouroboros they stay inside its ring, clear of the heads at any turn,
   * set a little smaller if they must (`snakeSize`).
   */
  const numOpts = (s: Spot, texts: string[]): { boxes: Box[]; cost: number }[] => {
    if (!texts.length) return [{ boxes: [], cost: 0 }];
    const n = texts.length;
    const boxAt = (i: number, x: number, top: number, anchor: 'middle' | 'start'): Box => {
      const w = texts[i].length * BEST_W;
      const x0 = anchor === 'start' ? x : x - w / 2;
      return [x0, top, x0 + w, top + BEST_H];
    };
    if (s.inSnake) {
      const [x, y] = endC;
      const k = snakeSize(texts);
      const g = GLORY_IN + 0.6;
      const box = (i: number, top: number): Box => {
        const w = texts[i].length * BEST_W * k;
        return [x - w / 2, top, x + w / 2, top + BEST_H * k];
      };
      return [{ boxes: n === 2 ? [box(0, y - g - BEST_H * k), box(1, y + g)] : [box(0, y + g)], cost: 0 }];
    }
    const [x, y] = s.c;
    const g = GLORY + 0.8;
    const under = { boxes: texts.map((_, i) => boxAt(i, x, y + g + i * STACK, 'middle')), cost: 0 };
    const over = { boxes: texts.map((_, i) => boxAt(i, x, y - g - BEST_H - (n - 1 - i) * STACK, 'middle')), cost: 5 };
    if (n === 2) return [{ boxes: [boxAt(0, x, y - g - BEST_H, 'middle'), boxAt(1, x, y + g, 'middle')], cost: 0 }, { ...under, cost: 50 }, { ...over, cost: 55 }];
    return [under, over];
  };
  /** The size the depths in the ouroboros are set at: as large as fits inside its ring (the heads' jaws, at any turn), at most the usual. */
  function snakeSize(texts: string[]) {
    const room = OURO.inner * ouroScale - 1.2;
    const w = Math.max(...texts.map((t) => t.length)) * BEST_W;
    let k = 1;
    while (k > 0.6 && Math.hypot((w * k) / 2, GLORY_IN + 0.6 + BEST_H * k) > room) k -= 0.02;
    return k;
  }
  const discOf = (s: Spot) => ({
    c: s.c,
    r: (s.inSnake ? GLORY_IN : GLORY) + 1,
  });
  /** What a star's depth must keep clear of: the top edge, Sol, the caption, the zones' names, the ouroboros' seal (from the wall), the legend. */
  const numBad = (b: Box, s: Spot, rows: number) =>
    b[1] < 0 ||
    boxBox(b, solBox, 1) ||
    (caption ? boxBox(b, caption, 2) : false) ||
    nameBoxes.some((n) => boxBox(b, n, 1)) ||
    (!s.inSnake && boxDisc(b, endC, endR + 1.5)) ||
    boxBox(b, keyBox(rows), 4) ||
    (beside ? b[2] > beside.wall - 2 : b[2] > W);
  const gold = spot(best);
  const red = lastD !== null ? spot(lastD) : null;
  const rows0 = red ? 2 : 1;
  const bad = (bs: Box[], s: Spot) => bs.some((b) => numBad(b, s, rows0));
  // Two stars, when they stand apart and both their depths find a place clear of everything.
  type Pick = { gold: Box[]; red: Box[] | null; cost: number };
  let pick: Pick | null = null;
  const apart = red !== null && (best === null || (shownDepth(lastD!) !== shownDepth(best) && !(red.inSnake && gold.inSnake) && dist(red.c, gold.c) >= GLORY * 2 + 2));
  if (red && apart)
    for (const g of numOpts(gold, gold.text ? [gold.text] : []))
      for (const r of numOpts(red, [red.text])) {
        const clash =
          g.boxes.some((b) => boxDisc(b, red.c, discOf(red).r + 1) || r.boxes.some((rb) => boxBox(b, rb, 2))) || r.boxes.some((b) => boxDisc(b, gold.c, discOf(gold).r + 1)) || bad(r.boxes, red);
        if (clash) continue;
        const c = g.cost + r.cost + (bad(g.boxes, gold) ? 100 : 0);
        if (!pick || c < pick.cost) pick = { gold: g.boxes, red: r.boxes, cost: c };
      }
  // Otherwise one star for both, the last run's depth over yours.
  const both = red !== null && best !== null && !pick;
  if (!pick)
    for (const g of numOpts(gold, both ? [red!.text, gold.text] : gold.text ? [gold.text] : [])) {
      const c = g.cost + (bad(g.boxes, gold) ? 100 : 0);
      if (!pick || c < pick.cost) pick = { gold: g.boxes, red: null, cost: c };
    }
  const showRed = red !== null && pick!.red !== null;
  const keyRows = showRed || both ? 2 : 1;
  const numBoxesShown = [...pick!.gold, ...(pick!.red ?? [])];
  const numHoles: Hole[] = numBoxesShown.map((b) => ({ box: grow(b, 1.5) }));
  const legend: Legend = {
    x: legendX,
    rows: [...(keyRows > 1 ? [{ kind: 'last' as const }] : []), { kind: 'best' as const }].map((r, i) => ({ ...r, y: endC[1] + (i - (keyRows - 1) / 2) * KEY_ROW })),
    delay: COIL_AT + 1.3,
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
      /** How far along the line its depth stands. */
      along: number;
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

    /** Every way to draw find `m`'s line to its heading at `E`: the stub's length, where on the slant its depth sits. */
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
        const L = dist(Hd, Sx);
        const u: Pt = [(Sx[0] - Hd[0]) / L, (Sx[1] - Hd[1]) / L];
        // In the middle of the slant (or a little either side of it), the line breaking round it and showing on both sides.
        const exit = Math.min((mw / 2 + 1.6) / Math.max(1e-6, Math.abs(u[0])), (mh / 2 + 1.6) / Math.max(1e-6, Math.abs(u[1])));
        const marks: { box: Box; along: number; cost: number }[] = [];
        for (const [dt, cost] of [
          [0, 0],
          [-4, 1.5],
          [4, 1.5],
          [-8, 3.5],
          [8, 3.5],
        ]) {
          const t = L / 2 + dt;
          if (t - exit < 3 || L - t - exit < 3) continue;
          const c: Pt = [Hd[0] + u[0] * t, Hd[1] + u[1] * t];
          marks.push({ box: [c[0] - mw / 2, c[1] - mh / 2, c[0] + mw / 2, c[1] + mh / 2], along: HANDLE + t, cost });
        }
        // Too short a slant (a line running nearly level): in the middle of the whole line.
        if (!marks.length) {
          const ps = [Wd, Hd, Sx, E];
          const lens = ps.slice(1).map((p, i) => dist(ps[i], p));
          const total = lens.reduce((a, b) => a + b, 0);
          for (const [dt, cost] of [
            [0, 6],
            [-3, 7],
            [3, 7],
          ]) {
            let d = total / 2 + dt;
            let i = 0;
            while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
            const v: Pt = [(ps[i + 1][0] - ps[i][0]) / lens[i], (ps[i + 1][1] - ps[i][1]) / lens[i]];
            const ex = Math.min((mw / 2 + 1.6) / Math.max(1e-6, Math.abs(v[0])), (mh / 2 + 1.6) / Math.max(1e-6, Math.abs(v[1])));
            if (total / 2 + dt - ex < 3 || total / 2 - dt - ex < 3) continue;
            const c: Pt = [ps[i][0] + v[0] * d, ps[i][1] + v[1] * d];
            marks.push({ box: [c[0] - mw / 2, c[1] - mh / 2, c[0] + mw / 2, c[1] + mh / 2], along: total / 2 + dt, cost });
          }
        }
        // Too short a line: over the handle (or under it), on the side the slant leaves from.
        if (!marks.length) {
          const up = Sx[1] >= Hd[1] - 1;
          for (const dx of [0.6, 3])
            marks.push({
              box: up ? [Wd[0] + dx, Wd[1] - 1.8 - mh, Wd[0] + dx + mw, Wd[1] - 1.8] : [Wd[0] + dx, Wd[1] + 1.8, Wd[0] + dx + mw, Wd[1] + 1.8 + mh],
              along: 0,
              cost: 30 + dx,
            });
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
            along: mk.along,
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
      const ms = allFinds.filter((m) => Es[m.kind]);
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
      if (won && (won as Choice).cost < 20 && lay.cost === 0) break;
    }
    const c = won as Choice | null;
    return { opts: (c?.opts ?? []).filter((o) => isMet(o.kind)), tops: c?.tops ?? null };
  }

  // The lines in depth order, each reaching out from the wall in its turn; its depth comes as the pen passes it.
  const order = [...fit.opts].sort((a, b) => a.W[1] - b.W[1]);
  const lineAt = (o: { kind: FindKind }) => LINES_AT + LINE_STEP * order.findIndex((x) => x.kind === o.kind);
  const lineLen = (ps: Pt[]) => ps.slice(1).reduce((a, p, i) => a + dist(ps[i], p), 0);
  const markHoles: Hole[] = fit.opts.map((o) => ({ box: grow(o.box, 1.5) }));
  const stations: Station[] = fit.opts.map((o) => ({
    kind: o.kind,
    c: o.W,
    delay: lineAt(o),
  }));
  const marks: Mark[] = fit.opts.map((o) => {
    const m = allFinds.find((x) => x.kind === o.kind)!;
    return {
      kind: o.kind,
      text: String(shownDepth(m.from)),
      x: o.mark[0],
      y: o.mark[1],
      delay: lineAt(o) + ease(o.along / lineLen(o.path)) * LINE_T + 0.02,
    };
  });
  const callouts: Callout[] | null =
    stacked && fit.tops
      ? FINDS_IN_ORDER.map((x, i) => {
          const o = fit.opts.find((q) => q.kind === x.kind);
          return {
            kind: x.kind,
            top: fit.tops![x.kind],
            met: found.some((m) => m.kind === x.kind),
            delay: o ? lineAt(o) + LINE_T * 0.8 : LINES_AT + 0.25 + 0.1 * i,
          };
        })
      : null;

  // ---- the zones not reached yet: a brace beside the wall, its beak on the word ----
  let uncharted: Uncharted | null = null;
  /** Where the uncharted stretch starts on the left wall (its outer line runs broken from there). */
  const unchY = reached < 10 ? side(TOP + reached * band, -1)[1] : null;
  if (unchY !== null) {
    let y0 = unchY + 2.5;
    const y1 = side(BOTTOM, -1)[1] - 1;
    const spine = (yy: number) => edgeAt(yy, -1, LW + BRACE_GAP + BRACE);
    // The brace keeps clear of a star's depth over its top.
    const left = spine((y0 + y1) / 2) - BRACE - 3.5 - UNCH_WORD;
    const below = Math.max(y0, ...numBoxesShown.filter((b) => b[3] > y0 - 2.5 && b[1] < y0 + 16 && b[0] < spine(y0) + BRACE + 2 && b[2] > left).map((b) => b[3] + 2.5));
    if (below > y0 && y1 - below > 30) y0 = below;
    const ym = (y0 + y1) / 2;
    const r = BRACE;
    /** A quarter of a circle about (cx from the spine, cy), from angle a0 to a1 (degrees, as on screen: 0 to the right, 90 down). */
    const arc = (cx: number, cy: number, a0: number, a1: number): Pt[] =>
      steps(a0, a1, 8).map((a) => {
        const yy = cy + r * Math.sin((a * Math.PI) / 180);
        return [spine(yy) + cx + r * Math.cos((a * Math.PI) / 180), yy];
      });
    const halfBrace = (s: number) => {
      // From the beak out along the spine to the terminal, which curls toward the wall: s -1 up, 1 down.
      const yEnd = s < 0 ? y0 : y1;
      return path([...arc(-r, ym + s * r, s < 0 ? 90 : 270, s < 0 ? 0 : 360), ...arc(r, yEnd - s * r, 180, s < 0 ? 270 : 90)]);
    };
    if (y1 - y0 > 24) {
      uncharted = {
        upper: halfBrace(-1),
        lower: halfBrace(1),
        balls: [
          [spine(y0) + r, y0],
          [spine(y1) + r, y1],
        ],
        x: spine(ym) - r - 3.5,
        y: ym,
        delay: sweep(y0) + 0.2,
      };
    }
  }

  /** Every line, worn (for the lines) or whole (for the glow under them). */
  const build = (worn: boolean) => {
    const wear = (seed: number) => (worn ? wearOf(seed) : null);
    const parts: Omit<Part, 'glow'>[] = [];
    const add = (tone: Part['tone'], strokes: Stroke[], lit = true, color?: string) => parts.push({ tone, strokes, lit, color });
    const common: Hole[] = [...numHoles, ...markHoles, keyHole];

    // The surface, level out from the mouth to the column's edge on the left, a short way on the right; a hairline under it on the left.
    const [ml, mr] = [side(TOP, -1), side(TOP, 1)];
    const surface = [
      ...pen([ml, [1, surfaceY]], 'main', 0.18, 0.5, {
        holes: common,
        wear: wear(3),
      }),
      ...pen([mr, [mr[0] + ROCK + 2.5, surfaceY]], 'main', 0.18, 0.2, {
        holes: common,
      }),
      ...pen(
        [
          [ml[0] - LW - 1.2, surfaceY + 2.4],
          [3, surfaceY + 2.4],
        ],
        'hair',
        0.26,
        0.45,
        { holes: common },
      ),
    ];
    // The mouth: its far rim, behind Sol, and its near one (the first terrace's front).
    const back = Array.from({ length: 41 }, (_, i) => {
      const phi = Math.PI + (Math.PI * i) / 40;
      return [AX + halfTop * Math.cos(phi), surfaceY + TILT * halfTop * Math.sin(phi)] as Pt;
    });
    surface.push(...pen(back.slice(0, 21).reverse(), 'thin', 0.12, 0.3, { holes: [solHole] }), ...pen(back.slice(20), 'thin', 0.12, 0.3, { holes: [solHole] }));
    add('gold', surface);

    // The pit's sides and the walls' outer edges beside them, inked down from the mouth to the tenth zone's floor (the left wall's
    // outer line broken beside the zones not reached), then on into the dark in shorter and shorter dashes, each fainter than the
    // last, broken round the last seal.
    const [p0, p1] = [side(TOP, 1), side(BOTTOM, 1)];
    const dir: Pt = [(p1[0] - p0[0]) / (p1[1] - p0[1]), 1];
    const run = (s: number, out: number, y0: number, y1: number): [Pt, Pt] => [
      [AX + s * (p0[0] - AX + out + dir[0] * (y0 - p0[1])), y0],
      [AX + s * (p0[0] - AX + out + dir[0] * (y1 - p0[1])), y1],
    ];
    const sides: Stroke[] = [];
    const deep: Stroke[] = [];
    const stationHoles: Hole[] = stations.map((s) => ({ c: s.c, r: 1.9 }));
    /** The uncharted stretch of a line from the mouth down, as cuts: short dashes from `from` (a fraction of the line) on. */
    const broken =
      (from: number, base: Wear): Wear =>
      (len) => {
        const out = base ? base(len) : [];
        for (let d = from * len + 2.2; d < len; d += 3.7) out.push([d / len, (d + 1.5) / len]);
        return out;
      };
    for (const s of [-1, 1]) {
      const out = s < 0 ? LW : ROCK;
      sides.push(
        ...pen(run(s, 0, p0[1], p1[1]), 'main', INK, INK_T, {
          holes: common,
          wear: wear(s > 0 ? 11 : 13),
        }),
      );
      const outerWear = wear(s > 0 ? 19 : 23);
      sides.push(
        ...pen(run(s, out, p0[1], p1[1]), 'thin', INK + 0.05, INK_T, {
          holes: [...common, ...stationHoles],
          wear: s < 0 && unchY !== null ? broken((unchY - p0[1]) / (p1[1] - p0[1]), outerWear) : outerWear,
        }),
      );
      for (const [o, kind] of [
        [0, 'main'],
        [out, 'thin'],
      ] as const)
        deep.push(
          ...dashes(
            ...run(s, o, p1[1], H - 0.5),
            kind,
            sweep(p1[1]),
            DEEP_T,
            (i) => 7 * 0.72 ** i + 0.6,
            (i) => 1.3 + 0.55 * i,
            (i) => 0.9 * 0.8 ** i,
            [...common, endHole],
          ),
        );
    }
    add('gold', sides);

    // The terraces' fronts, each opening out from its middle as the pen passes, lit as far as you have been, and the seams across
    // the walls at their ends.
    for (let k = 0; k <= 10; k++) {
      const yy = TOP + k * band;
      const lit = k <= reached;
      const fr = front(yy);
      const at0 = k ? sweep(yy) : 0.2;
      const opts = { holes: [...common, ...sealHoles, endHole] };
      const kind = k % 10 ? 'thin' : 'main';
      const strokes = [...pen(fr.slice(0, 21).reverse(), kind, at0, 0.28, { ...opts, wear: k ? null : wear(7) }), ...pen(fr.slice(20), kind, at0, 0.28, { ...opts, wear: k ? null : wear(8) })];
      for (const s of [-1, 1]) {
        const p = side(yy, s);
        if (k > 0)
          strokes.push(
            ...pen([p, [p[0] + s * (s < 0 ? LW : ROCK), p[1]]], 'hair', sweep(yy), 0.08, {
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
    // No ring round the last seal: the ouroboros stands on its own at the foot of the pit.
    add(past ? 'gold' : 'dull', deep, past);

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
      add('lead', pen(o.path, 'hair', lineAt(o), LINE_T, { holes }), false);
    }
    return { parts };
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
    shades.push({ d, ...toneOf(k), delay: sweep(y0) + 0.08, t: 0.35 });
  }
  // The rock on the endless stretch, shaded on as it fades.
  for (let j = 0; j + 1 < strata.length; j++) {
    const [p0, p1] = [side(strata[j], 1), side(strata[j + 1], 1)];
    shades.push({
      d: hatchPoly([p0, [p0[0] + ROCK, p0[1]], [p1[0] + ROCK, p1[1]], p1], -45, 1.2, [...shadeHoles, endHole]),
      tone: past ? 'gold' : 'dull',
      delay: sweep(strata[j]) + 0.08,
      t: 0.3,
      o: Math.max(0.1, 0.8 ** j),
    });
  }
  // The ground under the surface, in short slanting strokes.
  shades.push({
    d: hatchPoly(
      [
        [3, surfaceY],
        [side(TOP, -1)[0] - LW - 1.2, surfaceY],
        [side(TOP, -1)[0] - LW - 1.2, surfaceY + 2.4],
        [3, surfaceY + 2.4],
      ],
      -60,
      1.6,
      numHoles,
      0.3,
    ),
    tone: 'gold',
    delay: 0.35,
    t: 0.4,
  });

  // ---- Sol: twelve pointed rays all round it, long and short in turn, each hatched down one side, and fine rays between ----
  const O: Pt = [0, 0];
  let solRays = '';
  let solHatch = '';
  let solFine = '';
  for (let i = 0; i < 12; i++) {
    const a = i * 30;
    const [l, r, tip] = [at(O, a - 4.4, SOL_R + 1.6), at(O, a + 4.4, SOL_R + 1.6), at(O, a, SOL_R + (i % 2 ? 7.5 : 10.5))];
    solRays += path([l, tip, r]);
    solHatch += hatch(at(O, a, SOL_R + 1.6), l, tip, 0.62);
    solFine += line(at(O, a + 15, SOL_R + 1.8), at(O, a + 15, SOL_R + 5.2));
  }

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
      delay: s.delay + 0.2,
    }));

  // ---- the stars, each in a glory of fine rays between its points, long and short in turn ----
  const glory = (r: number, g: number) =>
    Array.from({ length: 16 }, (_, k) => {
      const a = k * 22.5 + 11.25;
      return line(at(O, a, r * 0.62 + 1.4), at(O, a, k % 2 ? g - 2 : g));
    }).join('');
  /** The gold star's descent: longer the farther it goes (down the wall, and on into the ouroboros), within bounds. */
  const travelOf = (s: Spot) => {
    if (!best) return 0;
    const foot = laneAt(side(BOTTOM, -1)[1]);
    const d = s.inSnake ? dist(home, foot) + dist(foot, s.c) : dist(home, s.c);
    return clamp(0.85 + d / 260, 0.95, 2.1);
  };
  const starOf = (s: Spot, nums: Box[], delay: number, moves: boolean, two: boolean): Star => {
    const [r, g] = s.inSnake ? [STAR_R_IN, GLORY_IN] : [STAR_R, GLORY];
    const st = star8(O, r);
    // Into the ouroboros: down the wall to the foot of the pit, then in.
    const foot = laneAt(side(BOTTOM, -1)[1]);
    const size = s.inSnake ? snakeSize(two ? [red!.text, s.text] : [s.text]) : 1;
    const numAt = (b: Box) => ({ x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, size });
    const own = nums.at(-1);
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
      both: two,
      delay,
      from: moves ? [home[0] - s.c[0], home[1] - s.c[1]] : [0, 0],
      mid: moves && s.inSnake ? [foot[0] - s.c[0], foot[1] - s.c[1]] : null,
      travel: moves ? travelOf(s) : 0,
      num: own && s.text ? { text: s.text, ...numAt(own), anchor: 'middle' } : null,
      lastNum: two ? { text: red!.text, ...numAt(nums[0]) } : null,
    };
  };
  const star = starOf(gold, pick!.gold, best ? STAR_AT : 1.6, !!best, both);
  const landed = star.delay + 0.25 + star.travel;
  const last = showRed ? starOf(red!, pick!.red!, landed + 0.05, false, false) : null;

  const [l0, l1] = [side(TOP, -1), side(BOTTOM, -1)];
  return {
    w: W,
    h: H,
    natural,
    parts,
    shades,
    seals,
    sol: { c: sol, r: SOL_R, rays: solRays, hatch: solHatch, fine: solFine, horizon: solClip() },
    ink: [-1, 1].flatMap((s) =>
      [0, s < 0 ? LW : ROCK].map((out) => {
        const [a, b] = [side(TOP, s), side(BOTTOM, s)];
        return { d: path([a, b].map((q): Pt => [q[0] + s * out, q[1]])), delay: INK + (out ? 0.05 : 0), t: INK_T };
      }),
    ),
    nibs: [-1, 1].map((s) => {
      const [a, b] = [side(TOP, s), side(BOTTOM, s)];
      return { from: a, to: b, delay: INK, t: INK_T };
    }),
    wallL: { y0: l0[1], y1: l1[1], inner: [l0[0], l1[0]], outer: [l0[0] - LW, l1[0] - LW] },
    names,
    uncharted,
    stations,
    marks,
    callouts,
    endless: {
      c: endC,
      r: endR,
      lit: past,
      delay: COIL_AT,
      ouro: { scale: ouroScale, from: OURO.from, inner: OURO.inner * ouroScale, hole: OURO.hole * ouroScale, mid: ((OURO.hole + OURO.outer) / 2) * ouroScale, reach: endReach },
    },
    legend,
    star,
    last,
  };

  /** Sol's rays show only over the ground: above the surface and the mouth's far rim (relative to Sol), as a clipping path. */
  function solClip(): string {
    const pts: Pt[] = [
      [-200, -200],
      [200, -200],
      [200, surfaceY - 0.8],
    ];
    for (let i = 0; i <= 40; i++) {
      const phi = (Math.PI * i) / 40;
      pts.push([AX + halfTop * Math.cos(phi), surfaceY - TILT * halfTop * Math.sin(phi) - 0.8]);
    }
    pts.push([-200, surfaceY - 0.8]);
    return path(pts.map(([x, y], i) => (i < 3 || i === pts.length - 1 ? [x, y - SOL_Y] : [x - AX, y - SOL_Y]))) + 'Z';
  }
}
