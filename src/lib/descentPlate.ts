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
// seal holding the ouroboros, after an old woodcut: a thick scaled serpent
// closing into a ring, its jaws open wide over its own tail, which turns. No floor is ever drawn. The zones not reached yet are held in a
// fine brace beside the wall, its beak on the word "uncharted", and the
// wall's outer line runs broken beside them.
//
// The pit's left wall is a wide band between two lines, and the stars stand
// in it like beads in a gauge: a gold one at your deepest (at the mouth
// before a first run) and a red one at your last run, each with its depth
// under it, their cutouts breaking the wall's lines round them. Past 100 a
// star sits inside the ouroboros, its depth beside the seal. When the two
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
 * The ouroboros about 0, 0 (the component turns it): its body's band (a fill
 * and its two edges), its belly line and belly scales, the scales of its
 * back; then the head as the user drew it (SKETCH): its tint, the dark of
 * its mouth, the eye, the fang, the tongue, the scales inside it, its lines
 * and its nostrils.
 */
export type Serpent = {
  rs: number;
  w: number;
  /** Where the band ends at the tail, coming into the head (clockwise from the top): the draw-in starts there and runs clockwise round to the neck. */
  tail: number;
  bodyFill: string;
  body: string;
  belly: string;
  scales: string;
  tint: string;
  dark: string;
  eye: string;
  fang: string;
  tongue: string;
  headScales: string;
  lines: string;
  inner: string;
  tongueLines: string;
  nostrils: string;
};
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
  } | null;
  lastNum: { text: string; x: number; y: number } | null;
};
/** The legend left of the ouroboros, half the seal's radius from it: a row for each kind of star, its small star at `x`, its words after it. */
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
const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
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
 * The serpent's head, traced from the user's own red-line sketch of it (a 1333 x 1367 px drawing over the reference woodcut): the
 * red thresholded, thinned to centrelines, split into strokes between their ends and junctions, simplified (Ramer-Douglas-Peucker,
 * then smoothed, each junction one point so the strokes meet), the strokes sorted into the silhouette, the lines inside it and the
 * tongue's edges, and the regions between the lines labelled by role. Generated by a throwaway script; regenerate rather than
 * edit by hand. In the sketch's px: the neck leaves at the left edge, the tail at the right, the head between them.
 */
const SKETCH = {
  /** Each stroke as x y pairs: the silhouette's, the lines inside it, the tongue's edges. */
  lines: [
    '714 107 719 100 722 96 725 93 728 91 732 89 736 87 741 85 746 85 752 84 756 84 760 84 763 84 765 84 767 84 769 85 771 87 774 88 776 90 777 91 778 93 779 94 780 97 780 101 781 106 782 113 782 118 784 123 785 127 787 130 789 133 791 136 793 138 794 140 797 142 800 144 805 146 811 148 816 150 820 153 824 157 826 160 828 163 829 166 830 168 831 170 831 172 831 175 831 178 830 182 829 186 828 188 827 191 826 192 824 193 823 194 821 194 817 195',
    '714 107 703 103 697 100 692 99 687 98 682 97 678 97 675 97 672 97 670 97 666 98 662 101 657 105 651 110 646 115 643 119 641 125 641 134',
    '641 134 627 135 619 135 613 136 608 137 604 139 600 141 597 143 595 145 593 147 592 151 590 156 588 164 584 180',
    '584 180 571 179 565 179 561 179 558 179 556 180 554 180 552 181 550 183 546 186',
    '546 186 542 188 539 188 536 188 532 187 527 186 521 184 515 184 509 183 502 183 496 184 491 184 486 185 481 186 475 188 469 191 461 196 452 201 445 207 439 211 434 216 431 220 428 224 424 230 420 237 416 244 411 251 405 257 398 263 390 268 382 274 376 279 371 283 367 288 362 292 356 295 350 297 343 298 337 300 331 303 325 307 320 312 315 315 310 318 305 319 300 320 295 320 290 322 284 323 279 325 273 328 266 332 257 337 248 343 241 348 235 351 231 353 228 354 224 355 219 355 213 355 206 355 198 356 190 358 182 361 173 365 163 368 154 370 144 371 133 372 124 372 118 374 113 375 110 377 107 380 105 382 104 385 102 388 101 391 99 394 97 396 94 398 88 401 78 404 59 409 19 418',
    '817 195 818 201 819 204 820 208 823 212 826 217 829 223 832 229 834 236 837 243 839 254 840 268 841 291 841 338',
    '841 338 848 340 854 342 860 344 867 348 876 352 884 355 891 357 898 358 905 358 910 358 914 359 917 359 918 360 920 362 922 364 925 367 929 370 933 373 938 377 944 380 951 383 957 386 961 388 964 389 966 390 968 390 972 390 977 390 982 389 987 389 991 391 994 393 997 396 1001 400 1007 405 1015 410 1025 416 1036 421 1047 424 1058 426 1070 426 1080 427 1087 428 1092 430 1095 432 1099 434 1105 437 1111 439 1119 442 1126 444 1132 446 1137 447 1141 448 1145 448 1147 449 1149 449 1150 450 1151 452 1152 454 1153 457 1154 460 1155 463 1157 466 1160 469 1163 471 1167 473 1173 476 1180 479 1189 482 1197 485 1204 487 1211 488 1216 489 1221 490 1225 491 1229 493 1232 496 1235 498 1237 502 1240 505 1243 509 1245 513 1247 515 1249 517 1250 518 1253 520 1257 522 1262 525 1269 528 1274 530 1280 532 1284 534 1288 535 1292 536 1295 538 1298 540 1300 542 1302 544 1303 546 1304 547 1304 548 1305 550 1306 552 1307 554 1309 556 1311 558 1313 561 1316 564 1319 567 1322 570 1325 572 1328 574 1332 575',
    '768 593 772 592 776 591 779 590 782 588 786 586 789 584 792 582 794 582 796 581 798 581 799 582 800 584 801 586 801 588 802 590 803 591 804 592 807 594 810 595 813 597 818 598 824 599 830 600 839 600 856 600',
    '768 593 762 612 758 624 755 637 752 653 748 670 745 685 743 698 743 708 743 715 744 723 745 731 746 739 748 748 749 758 749 768 749 780 748 793 748 805 748 818 748 834 750 862',
    '856 600 879 609 890 614 898 616 906 618 919 621',
    '919 621 929 627 936 631 942 633 950 636 958 638 965 640 970 641 974 641 979 640',
    '979 640 985 643 989 646 992 649 997 652 1002 657 1007 661 1012 665 1018 668 1024 670 1029 671 1033 672 1037 672 1042 671',
    '154 654 143 656 136 659 129 662 120 667 109 672 100 676 93 679 85 681 76 681',
    '154 654 166 656 171 657 174 659 176 660 177 661 179 663 183 667 189 671 196 675 203 680 210 683 217 686 225 688 231 690 237 693 242 696 247 699 250 701 254 703 257 704 259 704 261 704 263 705 265 706 269 708',
    '1042 671 1044 671 1046 671 1048 672 1051 674 1055 677 1060 680 1065 683 1071 686 1078 689 1084 691 1088 692 1092 693 1098 693',
    '76 681 72 690 68 695 64 698 57 703 43 711',
    '1098 693 1101 695 1103 696 1105 698 1107 701 1109 704 1112 707 1115 710 1120 714 1125 717 1129 720 1132 722 1134 724 1136 724 1138 725 1141 725 1147 725 1157 725',
    '269 708 282 719 290 726 296 732 302 739 309 746 314 751 320 755 325 758 334 760',
    '1157 725 1161 727 1163 729 1165 731 1167 735 1170 740 1173 743 1176 747 1178 750 1181 752 1185 754 1189 756 1193 758 1198 760 1203 761 1207 762 1211 762 1218 762',
    '334 760 344 773 350 780 354 784 358 788 361 792 364 794 368 796 371 797 374 798 377 798 380 797 383 796 386 795 390 794 393 794 395 793 398 793 402 794 407 795 414 797 422 800 429 803 435 806 441 811 446 816 450 821 454 825 458 830 461 834 465 839 469 845 473 852 478 860 483 867 489 874 496 880 503 886 510 891 517 895 524 898 530 900 536 903 541 907 545 912 549 918 552 924 556 929 560 934 564 938 568 941 571 944 574 945 577 946 581 947 586 947 591 947 598 947 605 947 611 946 617 945 623 944 629 943 635 943 643 943 650 944 656 944 660 944 663 945 664 945 667 946 670 949 675 952 681 957 686 960 691 963 694 964 697 965 699 966 703 966 707 966 711 966 716 966 721 965 726 964 732 963 737 961 743 959 749 957 754 954 760 951 766 948 773 944 780 940 785 936 789 934 791 932 793 929',
    '1218 762 1223 772 1227 777 1230 782 1234 788 1239 794 1246 798 1254 801 1264 802 1276 802 1285 802 1291 803 1295 804 1296 805 1298 807 1300 811 1303 816 1307 823 1311 830 1315 836 1321 843 1332 856',
    '866 1245 862 1265 861 1274 860 1280 860 1284 860 1289',
  ],
  inner: [
    '714 107 716 112 717 114 718 116 720 118 723 121',
    '759 115 760 117',
    '641 134 659 154',
    '584 180 586 184 588 186 590 188 595 190 605 195',
    '546 186 543 190 541 192 541 194 540 195 540 198',
    '817 195 791 196 778 197 771 199 765 201 762 203 759 206 757 209 756 213 756 218 755 222 753 224 752 226 749 226 746 226 744 227 741 229 735 232',
    '603 221 597 227 593 230 591 232 589 233 587 234 585 235 582 235 579 235 571 236',
    '512 228 504 228 501 228 498 228 496 229 493 232',
    '512 228 530 229 540 229 547 230 556 232 571 236',
    '512 228 513 234 514 237 515 239 517 242 518 245 519 248 520 252 520 257 520 263 520 267 520 270 519 272 518 273 517 273 516 273 514 273 512 272 511 271 509 271 508 270 507 269 506 266 504 261 501 252 493 232',
    '493 232 489 233 486 235 483 236 480 238 477 241 473 244 469 249 465 255 460 262 456 269 453 274 450 279 447 286',
    '735 232 721 235 715 237 711 238 709 240 708 241',
    '735 232 733 234 733 236 733 237 733 238 734 239 735 241 738 243 741 246 746 249 751 253 755 259 760 267 764 276 768 284 773 292 779 298 784 304 789 310 792 315 795 321 799 330',
    '571 236 571 241 569 245 567 250 564 255 559 262 555 267 552 272 550 277 549 280 547 284 543 287 538 291 531 294 525 298 519 303 514 308 509 314 505 318 500 322 495 324 487 326',
    '708 241 694 244 686 246 680 248 675 251 670 254 665 258 659 263 652 268 645 274 638 280 633 286 628 294 622 308',
    '708 241 713 252 715 259 718 267 720 277 723 288 725 298 727 307 728 317 729 332',
    '447 286 431 292',
    '447 286 450 295 452 300 454 305 457 309 460 314 464 317 468 320 473 321 478 322 482 322 484 323 486 324 487 326',
    '622 308 631 309 635 310 638 311 639 311 640 312 641 313 641 314 641 316 641 319',
    '622 308 617 318 614 324 613 327 612 331 612 334 612 336 612 338 612 339 614 339',
    '641 319 644 318 646 318 648 318 649 318 651 319 652 320 653 320 654 321 655 322 656 324 657 326 658 329 660 336',
    '641 319 635 332',
    '487 326 483 332 479 336 472 341 459 348 432 363',
    '799 330 782 328 774 327 767 328 761 329 756 330 751 331 746 332 740 332 729 332',
    '799 330 803 331 804 332 805 333 806 335 807 336 808 337 809 339 811 340 812 341 814 341 817 342 821 342 826 342 829 341 833 341 836 340 841 338',
    '635 332 614 339',
    '635 332 641 334 645 335 648 336 652 336 660 336',
    '729 332 728 349 727 359 725 369 722 379 718 390 714 400 711 407 708 412 705 415 702 417 700 419 698 420 697 421 695 421 694 420 692 419 691 418 690 415 689 411 688 404 687 396 685 388 683 380 680 371 677 362 674 354 672 349 670 345 668 342 666 340 665 338 663 337 660 336',
    '614 339 615 341 616 342 616 344 616 345 616 347 616 349 616 351 615 352 615 354 614 355 612 356 610 358 608 359 607 359 605 359 604 359 603 357',
    '614 339 610 342 607 343 606 344 604 346 603 348 602 349 601 351 601 353 601 355 601 357 601 358 603 357',
    '603 357 592 365 586 369 580 373 575 378 569 383 564 388 559 393 556 398 553 403 549 408 546 413 542 417 537 422 532 428 527 434 522 442 517 450 510 459 502 469 493 479 483 490 475 500 469 508 464 514 461 520 458 524 456 529 454 535 452 544',
    '452 544 445 543 442 542 439 543 436 545 434 547 430 552 425 557 420 565 413 574 407 582 404 587 402 591 402 593 402 595 402 598 402 602 403 607 404 612 408 619 413 627 419 637 424 645 428 651 431 655 434 658 436 660 439 661 442 662 447 661',
    '452 544 449 556 448 561 448 565 447 569 448 574',
    '448 574 464 571 472 570 477 568 481 567 484 565 487 564 490 563 492 562 493 562 495 563 498 564 501 565 505 567 509 568 514 570 519 571 525 572 531 572 537 572 544 572 550 571 556 571 561 572 566 573 570 576 574 578 579 580 583 581 588 582 593 582 599 581 605 580 612 579 618 578 624 576 629 574 634 572 638 570 642 569 646 568 650 568 654 568 660 570 667 572 675 575 683 577 690 579 697 581 704 582 710 583 715 584 720 585 723 586 727 587 730 588 735 589 743 589',
    '1332 570 1332 575',
    '448 574 447 586 447 592 447 596 447 601 448 605 449 610 449 616 449 624 449 632 449 639 449 645 448 652 447 661',
    '1332 575 1332 581',
    '743 589 748 587 750 587 753 587 755 587 758 587 760 587 761 587 763 588 764 588 765 588 765 589 766 590 768 593',
    '743 589 742 596 741 603 738 610 735 620 731 632 728 642 725 652 723 660 722 667 721 678 721 692 720 710 720 731 721 750 722 766 724 780 726 791 728 802 729 814 730 829 732 857',
    '855 594 856 600',
    '917 614 919 621',
    '978 635 979 640',
    '153 637 154 654',
    '1044 660 1042 671',
    '447 661 452 673 455 680 457 686 460 691 463 698 468 705 475 714 483 725 492 738 502 752 512 767 522 784 533 802 542 818 552 831 560 842 568 851 574 857 579 861 581 864 582 864 583 864 584 864 585 863 587 861',
    '265 663 264 670 264 675 264 679 264 685 264 691 264 696 265 700 266 704 269 708',
    '73 667 76 681',
    '1096 681 1098 693',
    '327 709 334 760',
    '1157 720 1157 725',
    '632 742 635 748 636 751 636 753 637 755 637 757 637 758 637 759 636 761 635 763',
    '1219 752 1218 762',
    '635 763 638 762 639 763 640 763 642 764 643 765 645 767 646 770 648 775 650 781 652 787 653 793 653 801 653 808 653 815 652 822 651 830 648 844',
    '635 763 629 778 625 786 624 793 623 801 622 808 621 814 620 820 619 824 617 827 615 830 612 834 608 837 604 841 600 845 596 849 593 853 587 861',
    '648 844 646 846 645 848 644 851 643 854 642 862',
    '1332 851 1332 856',
    '1332 856 1332 863',
    '642 862 640 863 640 865 639 867 638 870 637 878',
    '587 861 586 864 586 866 586 867 586 869 587 870 589 872 593 873 598 875 605 876 612 877 618 878 625 878 637 878',
    '637 878 643 882 646 885 649 887 651 890 654 893 658 895 663 898 670 900 678 901 686 903 694 906 702 910 710 915 717 918 723 920 727 922 730 922 733 922 736 922 739 921 742 920 744 919 746 917 749 915 754 909',
    '957 1269 959 1273',
  ],
  tongue: [
    '648 844 657 844 662 844 668 844 674 845 681 846 689 847 697 849 709 852 732 857',
    '732 857 733 859 735 860 737 860 741 861 750 862',
    '642 862 653 863 659 864 665 865 672 867 679 870 688 874 699 878 711 884 724 890 735 895 743 899 748 902 751 904 752 905 754 906 754 907 754 909',
    '750 862 752 865 756 867 762 870 770 874 781 879 791 883 799 888 806 893 811 898 816 902 821 906 826 909 831 911 835 914 840 919 846 924 851 931 857 937 863 943 869 948 875 953 881 957 887 963 892 968 897 974 902 980 907 985 912 989 916 993 920 997 923 1001 926 1005 929 1010 932 1016 935 1022 939 1030 942 1038 945 1047 949 1057 952 1068 955 1080 957 1091 959 1100 959 1107 959 1113 959 1121 958 1129 956 1140 954 1151 952 1162 951 1173 950 1183 950 1193 951 1201 951 1209 952 1216 953 1221 954 1228 955 1235 956 1247 957 1269',
    '754 909 759 909 762 910 767 912 772 914 779 917 784 920 787 923 790 925 793 929',
    '793 929 800 930 804 932 807 933 811 935 814 938 819 942 827 949 836 959 847 971 858 982 868 994 878 1006 886 1017 894 1028 901 1038 907 1048 911 1056 915 1063 918 1069 919 1073 920 1076 921 1080 921 1084 922 1089 922 1094 922 1101 921 1108 920 1117 919 1126 917 1134 914 1142 912 1148 909 1153 905 1159 900 1165 893 1172 886 1179 880 1187 875 1194 872 1202 869 1210 867 1217 866 1223 865 1229 865 1234 865 1239 865 1242 865 1244 866 1245',
    '932 1169 923 1181 918 1186 916 1189 914 1193 913 1197',
    '913 1197 909 1199 906 1202 901 1207 895 1215 887 1224 881 1232 876 1238 872 1242 866 1245',
    '913 1197 916 1200 918 1203 920 1208 922 1215 924 1224 926 1231 928 1238 931 1243 933 1248 936 1252 938 1256 940 1259 943 1262 945 1264 948 1265 951 1267 957 1269',
  ],
  /** The nostrils: x, y, radius. */
  dots: [[760,116,7.9],[684,135,6.3]],
  /** The regions between the lines, by what they are, each an outline as x y pairs. */
  regions: {
    head: [
      '745 91 762 91 772 96 775 127 790 148 817 159 824 176 822 185 764 191 750 200 748 218 678 239 634 271 616 295 614 307 591 350 548 384 536 410 516 433 506 452 462 501 449 523 447 535 437 533 410 561 396 582 393 605 398 621 429 668 434 671 442 668 459 708 499 760 541 834 561 853 581 878 608 885 637 888 657 906 688 911 698 919 723 930 744 928 751 925 758 916 782 929 742 951 711 959 689 954 668 937 630 934 619 938 583 940 572 936 559 921 545 896 517 888 489 865 475 838 456 814 437 796 402 785 370 790 343 757 337 736 335 706 331 700 324 699 319 704 324 751 273 698 273 659 267 654 261 655 257 662 257 696 239 684 219 680 207 674 184 657 185 649 181 645 162 649 160 631 151 627 145 632 146 647 129 652 87 674 82 674 77 659 69 659 65 663 67 683 62 691 47 702 37 704 34 709 4 709 4 421 11 421 15 426 31 425 83 412 100 405 109 395 112 384 118 380 162 378 199 362 230 362 257 349 275 335 296 327 318 325 336 307 352 306 368 300 383 281 409 267 419 257 430 233 439 221 476 195 490 191 526 192 532 195 534 206 543 209 548 204 552 190 559 186 569 186 602 203 609 203 613 199 613 192 592 179 602 146 635 142 655 162 664 164 669 159 669 152 650 129 649 120 664 107 677 104 701 111 720 130 727 130 732 121 722 108 728 99',
      '810 202 810 208 820 222 832 249 834 260 834 332 818 335 815 334 810 323 792 299 778 288 762 251 755 244 742 237 749 233 766 232 770 229 771 222 763 213 765 208 775 204',
      '751 594 757 595 756 603 749 625 745 653 739 667 735 689 736 733 742 754 743 768 742 795 740 804 741 854 738 835 737 806 728 764 728 678 732 654 738 639 739 629 749 608',
      '650 870 656 870 688 882 721 899 729 901 745 909 739 913 728 915 707 906 693 896 663 891 650 877 645 874 646 871',
    ],
    eye: [
      '522 235 546 237 554 241 562 242 546 265 542 279 514 294 495 317 492 314 471 315 459 299 457 293 459 276 467 263 477 250 488 242 500 273 512 283 522 283 527 278 529 262 528 244',
    ],
    dark: [
      '724 242 732 250 748 259 765 297 782 312 787 320 762 319 745 325 736 324 735 302 727 275 725 261 721 250 717 245',
      '492 569 511 578 535 581 546 581 555 576 580 590 616 587 641 576 657 575 681 586 733 596 716 653 712 692 713 770 722 811 724 847 690 839 657 836 661 821 661 786 644 737 637 731 625 732 620 737 626 766 615 788 614 817 609 825 582 854 555 826 512 750 471 697 455 659 457 611 454 582 482 576',
      '639 775 646 791 646 815 641 835 632 858 630 871 593 866 602 853 618 839 627 827 630 816 630 793',
    ],
    fang: [
      '700 250 708 260 719 303 721 350 718 367 706 401 697 411 692 378 677 340 658 313 648 306 632 300 641 286 659 274 669 264 686 253',
    ],
    tail: [
      '768 334 800 339 806 348 812 350 840 348 846 345 884 366 910 365 929 382 959 396 987 396 998 410 1036 433 1085 433 1097 443 1125 453 1143 455 1148 469 1161 480 1196 494 1222 497 1231 505 1243 524 1273 539 1292 544 1301 560 1322 581 1328 583 1328 842 1299 794 1250 796 1229 767 1227 746 1223 742 1215 742 1210 749 1210 755 1187 747 1173 732 1161 709 1153 709 1148 718 1141 718 1118 703 1100 671 1093 670 1089 673 1088 685 1055 668 1052 654 1047 649 1040 649 1036 653 1032 665 1009 655 982 622 973 623 970 633 936 624 921 602 914 602 910 606 910 612 893 607 867 595 864 585 859 581 851 581 846 587 846 594 830 593 809 587 808 573 803 567 795 568 774 584 761 579 727 580 714 575 686 571 662 560 640 560 616 571 585 575 561 561 550 561 540 566 509 561 496 553 488 553 477 561 455 566 463 531 481 502 512 470 530 441 544 425 549 425 557 417 573 394 590 378 606 372 620 361 624 354 624 344 636 341 662 346 677 383 683 425 689 431 698 431 720 409 735 364 736 339 750 340',
      '442 550 439 569 439 601 442 618 442 640 439 654 410 609 409 593 424 569',
    ],
    tongue: [
      '657 851 712 859 728 867 746 871 750 875 759 876 777 886 797 894 816 914 823 915 837 923 844 937 856 949 878 964 898 988 917 1004 926 1020 932 1038 940 1053 951 1097 952 1118 943 1161 942 1187 942 1209 947 1227 949 1257 941 1248 935 1235 926 1205 926 1198 922 1193 933 1182 940 1171 940 1165 934 1160 930 1160 925 1164 919 1174 886 1211 872 1231 874 1216 883 1192 913 1163 923 1145 926 1135 930 1104 929 1077 926 1067 910 1035 901 1021 874 987 817 929 750 893 729 885 703 871 661 855 651 854 652 852',
    ],
  },
};

/** The sketch, measured: its body's centre line where the neck leaves (left edge) and the tail (right edge), its half-width, the
 * head's middle, and how far the snout rises over the centre line there. */
const SK = { left: 565, right: 715, width: 1333, half: 144, mid: 650, rise: 566 };

/**
 * The ouroboros about 0, 0 in a seal of radius `R`, after the reference
 * woodcut: a thick serpent of almost even width closing into a ring, its
 * back covered in rows of overlapping rounded scales set half a scale
 * apart, their free edges toward the tail, a strong belly line along its
 * inner side over a row of broad belly scales.
 *
 * Its head is the user's sketch (SKETCH), set on the ring at the top at a
 * scale that keeps its snout inside the seal: the head itself is placed as
 * drawn (rigid), and the stretches of neck and tail either side of it bend
 * round onto the ring, so they meet the band where the sketch ends. The
 * band runs from there, from the neck round to the tail.
 */
function serpent(R: number): Serpent {
  const O: Pt = [0, 0];
  /** Sketch px to plate px; the body's half-width; the ring, so the snout's top stays inside the seal. */
  const k = (R * 0.023) / 38;
  const w = SK.half * k;
  const rs = R - 2 - SK.rise * k;
  const al = Math.atan2(SK.right - SK.left, SK.width);
  const [ca, sa] = [Math.cos(al), Math.sin(al)];
  const yc = SK.left + ((SK.right - SK.left) * SK.mid) / SK.width;
  /** A point of the sketch on the plate: along the centre line and off it, placed rigidly near the head, bent round the ring beyond. */
  const map = ([x, y]: Pt): Pt => {
    const [dx, dy] = [x - SK.mid, y - yc];
    const [u, v] = [dx * ca + dy * sa, -dx * sa + dy * ca];
    const rigid: Pt = [k * u, -rs + k * v];
    const bent = at(O, (k * u * 180) / (rs * Math.PI), rs - k * v);
    return lerp(rigid, bent, smooth((Math.abs(u) - 330) / 300));
  };
  const angleAt = (x: number, y: number) => {
    const [dx, dy] = [x - SK.mid, y - yc];
    return (k * (dx * ca + dy * sa) * 180) / (rs * Math.PI);
  };
  const nums = (s: string): Pt[] => {
    const n = s.split(' ').map(Number);
    return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]] as Pt);
  };

  // ---- the body: from the neck, where the sketch leaves it, anticlockwise all the way round to the tail, where it comes back ----
  const AN = angleAt(0, SK.left);
  const AE = angleAt(SK.width, SK.right);
  const span = 360 - (AE - AN);
  const A = (t: number) => AN - t * span;
  const bw = (t: number) => w * (1.02 - 0.05 * t);
  const B = (t: number, v: number): Pt => at(O, A(t), rs + v);
  const n = Math.ceil(span / 1.5);
  const ts = steps(0, 1, n);
  // The band's fill and edges run a little way in under the sketch at both ends, so they meet its slanted cuts without a gap.
  const under = (deg: number) => steps(-deg / span, 1 + deg / span, n + 4);
  const edge = (tt: number[], sgn: number) => tt.map((t) => B(t, sgn * bw(Math.min(1, Math.max(0, t)))));
  const bodyFill = path([...edge(under(4), 1), ...edge(under(4), -1).reverse()]) + 'Z';
  const body = path(edge(under(2.5), 1)) + path(edge(under(2.5), -1));
  const BELLY = -0.42;
  let belly = path(ts.map((t) => B(t, BELLY * bw(t))));
  const L = (span * Math.PI * rs) / 180;
  const scale = (s0: number, v0: number, v1: number, d: number) =>
    path(
      steps(-90, 90, 8).map((th) => {
        const r = (th * Math.PI) / 180;
        const t = Math.min(1, Math.max(0, (s0 + d * Math.cos(r)) / L));
        return B(t, ((v0 + v1) / 2 + ((v1 - v0) / 2) * Math.sin(r)) * bw(t));
      }),
    );
  const ROWS = 2;
  const pitch = 1.15 * w;
  let scales = '';
  for (let row = 0; row < ROWS; row++) {
    const v0 = BELLY + ((1 - BELLY) * row) / ROWS;
    const v1 = BELLY + ((1 - BELLY) * (row + 1)) / ROWS;
    for (let s = (row % 2) * pitch * 0.5; s < L; s += pitch) scales += scale(s, v0 + 0.03, v1 - 0.03, pitch * 0.62);
  }
  for (let s = 0.2 * w; s < L; s += 0.9 * w) belly += scale(s, -0.96, BELLY - 0.04, 0.4 * w);

  // ---- the head, from the sketch ----
  const region = (role: keyof typeof SKETCH.regions) => SKETCH.regions[role].map(nums);
  const fill = (role: keyof typeof SKETCH.regions) => region(role).map((poly) => path(poly.map(map)) + 'Z').join('');
  const lines = SKETCH.lines.map((s) => path(nums(s).map(map))).join('');
  const inner = SKETCH.inner.map((s) => path(nums(s).map(map))).join('');
  const tongueLines = SKETCH.tongue.map((s) => path(nums(s).map(map))).join('');
  const nostrils = SKETCH.dots
    .map(([x, y, r]) => path(steps(0, 1, 10).map((t) => map([x + r * Math.cos(t * Math.PI * 2), y + r * Math.sin(t * Math.PI * 2)]))) + 'Z')
    .join('');
  // Scales inside the head and the neck and tail stretches: rounded plates in rows half a plate apart, their free edges toward
  // the neck (to the left in the sketch), smaller on the head than on the body.
  const inside = (polys: Pt[][], x: number, y: number) => polys.some((poly) => inPoly([x, y], poly));
  let headScales = '';
  const body2 = [...region('head'), ...region('tail')];
  for (const [x0, x1, q] of [
    [0, 380, 100],
    [380, 930, 64],
    [930, SK.width, 100],
  ]) {
    let row = 0;
    for (let y = 60; y < 1000; y += q * 0.84, row++)
      for (let x = x0 + (row % 2) * q * 0.5 + q * 0.4; x < x1; x += q) {
        const r = q * 0.42;
        if (![[x, y], [x - r, y], [x + r, y], [x, y - r], [x, y + r]].every(([a, b]) => inside(body2, a, b))) continue;
        headScales += path(
          steps(-90, 90, 6).map((th) => {
            const t = (th * Math.PI) / 180;
            return map([x + 0.42 * q - 0.46 * q * Math.cos(t), y + 0.46 * q * Math.sin(t)]);
          }),
        );
      }
  }

  return {
    rs,
    w,
    tail: AE,
    bodyFill,
    body,
    belly,
    scales,
    tint: fill('head') + fill('tail'),
    dark: fill('dark'),
    eye: fill('eye'),
    fang: fill('fang'),
    tongue: fill('tongue'),
    headScales,
    lines,
    inner,
    tongueLines,
    nostrils,
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
/** The rock shaded beside the pit's right side; the left wall, a band the stars stand in. */
const ROCK = 6;
const LW = 13;
/** How much narrower the pit is at the tenth zone's floor than at its mouth (each side). */
const TAPER = 7;
/** A zone's name stands this far from the left wall. */
const NAME_GAP = 5.5;
/** The stars and their glories; smaller inside the ouroboros. */
const STAR_R = 4.4;
const GLORY = 7.4;
const STAR_R_IN = 4.2;
const GLORY_IN = 7;
/** A star's depth (Cinzel's bold figures at 13 px): about this wide a figure, this tall; two stacked this far apart. */
const BEST_W = 7.6;
const BEST_H = 9.8;
const STACK = 12;
/** A depth on a find's line (Cinzel's bold figures at 11 px). */
const MARK_W = 7;
const MARK_H = 8.2;
/** A find's line runs level this far out of the wall before it slants. */
const HANDLE = 5;
/** The seals' largest radius, and the room the lines need between the pit and the finds (less when no line is drawn). */
const R_MAX = 14;
const ROOM_BESIDE = 36;
const ROOM_STACKED = 34;
const ROOM_NONE = 12;
/** The last seal's radius: the ouroboros must read as a serpent at a glance, and hold a star; a little smaller on a narrow plate, so a star's depth still fits beside it. */
const END_R = 38;
const END_R_MIN = 34;
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

  // ---- across: the zones' names | the left wall (the stars' band) | the pit | the rock | the lines | the finds (beside) or the callouts (stacked) ----
  const nameW = (k: number) => layout.nameW?.[k] ?? ZONES[k].name.length * 5.9 + 1;
  const keyW = (layout.legendW ? Math.max(layout.legendW.best, lastD ? layout.legendW.last : 0) : lastD ? 44 : 46) + 2 * KEY_R + 5;
  const slant = (k: number) => (TAPER * (k + 0.5)) / 10;
  // The pit's half-width at the mouth plus what stands left of it: the names shown, or the brace of the zones not reached.
  const need = Math.max(30, ...ZONES.slice(0, reached).map((_, k) => nameW(k) + NAME_GAP + LW - slant(k)), reached < 10 ? UNCH_W + LW - slant((reached + 9) / 2) : 0);
  const wall = beside ? beside.wall : Math.min(...FINDS_IN_ORDER.map((x) => shapes[x.kind].x));
  const room = found.length ? (stacked ? ROOM_STACKED : ROOM_BESIDE) : ROOM_NONE;
  const SOL_Y = SOL_R + 12;
  const capAX = caption && caption[3] > SOL_Y - SOL_R - 12 ? caption[2] + SOL_R + 15 : 0;
  let halfTop = clamp((wall - room - 1 - need - ROCK) / 2, 19, stacked ? 56 : 34);
  const endR = clamp(Math.round(W * 0.2), END_R_MIN, END_R);
  let AX = Math.max(1 + need + halfTop, capAX, keyW + KEY_GAP_MIN + endR + 3);
  const spare = wall - room - ROCK - halfTop - AX;
  // Room to spare goes to the margin, and half of it to the lines when there are any; too little narrows the pit.
  if (spare > 0) AX += found.length ? spare / 2 : spare;
  else halfTop = Math.max(19, halfTop + spare);
  const halfBot = halfTop - TAPER;

  // ---- down: Sol over the mouth, the ten zones, the endless stretch ----
  const TOP = SOL_Y + SOL_R + 6;
  const Rw = Math.min(stacked ? R_MAX - 2 : R_MAX, halfBot - 6.5);
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
   * Where a star's depths can go: under it (or over it, if under won't fit);
   * beside the seal when it is in the ouroboros. Two (the one star for both):
   * the last run's over the star and yours under it (or both stacked under
   * it, if that won't fit); beside the seal, the last run's over yours.
   */
  const numOpts = (s: Spot, texts: string[]): { boxes: Box[]; cost: number }[] => {
    if (!texts.length) return [{ boxes: [], cost: 0 }];
    const n = texts.length;
    const boxAt = (i: number, x: number, top: number, anchor: 'middle' | 'start'): Box => {
      const w = texts[i].length * BEST_W;
      const x0 = anchor === 'start' ? x : x - w / 2;
      return [x0, top, x0 + w, top + BEST_H];
    };
    if (s.inSnake) return [{ boxes: texts.map((_, i) => boxAt(i, endC[0] + endR + 3, endC[1] - BEST_H / 2 + (i - (n - 1) / 2) * STACK, 'start')), cost: 0 }];
    const [x, y] = s.c;
    const g = GLORY + 0.8;
    const under = { boxes: texts.map((_, i) => boxAt(i, x, y + g + i * STACK, 'middle')), cost: 0 };
    const over = { boxes: texts.map((_, i) => boxAt(i, x, y - g - BEST_H - (n - 1 - i) * STACK, 'middle')), cost: 5 };
    if (n === 2) return [{ boxes: [boxAt(0, x, y - g - BEST_H, 'middle'), boxAt(1, x, y + g, 'middle')], cost: 0 }, { ...under, cost: 50 }, { ...over, cost: 55 }];
    return [under, over];
  };
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
    delay: COIL_AT + 1.1,
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
      if (won && (won as Choice).cost < 20 && lay.cost === 0) break;
    }
    const c = won as Choice | null;
    return { opts: c?.opts ?? [], tops: c?.tops ?? null };
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
    const m = found.find((x) => x.kind === o.kind)!;
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
    const ringAt = sweep(endC[1] - endR);
    add(
      past ? 'gold' : 'dull',
      [
        ...deep,
        ...pen(arcPts(endC, endR), 'thin', ringAt, 0.45, {
          wear: wear(60),
          holes: common,
        }),
        ...pen(arcPts(endC, endR - 1.3), 'hair', ringAt + 0.05, 0.45, { holes: common }),
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
    const numAt = (b: Box) => ({ x: s.inSnake ? b[0] : (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 });
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
      num: own && s.text ? { text: s.text, ...numAt(own), anchor: s.inSnake ? 'start' : 'middle' } : null,
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
      serpent: serpent(endR),
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
