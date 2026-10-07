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
// shorter and shorter dashes as they fade into the dark, the strata closing
// up as they go, across the whole width of the column, and no floor is
// ever drawn. On that endless stretch a last seal holds the ouroboros, the
// serpent biting its tail (lib/alchemy).
//
// An eight-pointed star in a glory of rays marks your deepest on the pit's
// right wall (by the mouth before a first run, on the endless stretch past
// 100, its depth beside it). Each find you have met is tied to its heading
// in the finds list beside the plate (`targets`): a fine leader in its
// colour leaves the rock where it first turns up and runs across to its
// item; stacked on a phone, its item stands there beside the pit instead.
//
// Everything is exact geometry in px: the pit's sides are straight lines
// converging downward, every terrace an ellipse whose depth is a fifth of
// its width, every ring a circle, Sol's rays and the star's glory radial;
// lines stop short of every seal, sign, star and word (holes); the rock
// beside the pit and the terraces' faces are shaded in one-sided hatching
// (the light falls from the upper left, as on the cards); main lines carry
// a few nicks of wear. Each stroke comes with its timing, so the plate draws
// itself in from the surface down as one sweep of the pen.

import { at, hatch, line, seeded, star8, type Hole as Disc } from './arcane.ts';
import { shownDepth, type FindKind } from './delve.ts';
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
/** A find's heading in the finds list, where its leader ends: the left of its item and the middle of its line, in the plate's px. */
export type Target = { kind: FindKind; x: number; y: number };
/** A find you have met: the station on the rock where it first turns up; stacked, its item beside it (`item`: top left, height). */
export type Station = { kind: FindKind; c: Pt; delay: number; item?: { x: number; y: number; h: number } };
export type Plate = {
  w: number;
  h: number;
  parts: Part[];
  shades: Shade[];
  seals: Seal[];
  sol: { c: Pt; r: number };
  names: { x: number; y: number; text: string; color: string; delay: number }[];
  uncharted: Uncharted | null;
  stations: Station[];
  /** The last seal, on the endless stretch, holding the ouroboros; lit past 100. */
  endless: { c: Pt; r: number; lit: boolean; delay: number };
  /** The star, drawn about its centre `c` (its outline, ridges, hatching and glory are about 0, 0, so the glory can turn); its depth beside it where there is room. */
  star: { c: Pt; r: number; gloryR: number; outline: string; ridges: string; hatch: string; glory: string; delay: number; num: { text: string; x: number; y: number } | null };
};
export type Layout = {
  /** The column's caption ("The descent"), which Sol stands beside. */
  caption?: Box | null;
  /** The finds' headings beside the plate; with none (stacked), the items stand by the pit. */
  targets?: Target[] | null;
};

export const f = (v: number) => v.toFixed(2);
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const inHole = (p: Pt, h: Hole) => ('c' in h ? dist(p, h.c) < h.r : p[0] > h.box[0] && p[0] < h.box[2] && p[1] > h.box[1] && p[1] < h.box[3]);
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
      // A straight piece needs only its ends (and its corners); a curve keeps every other point.
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
/** The same, as one path, broken at the discs. */
const hatchPoly = (poly: Pt[], angle: number, gap: number, holes: Disc[] = [], pad = 0.5) =>
  hatchSegs(poly, angle, gap, pad)
    .map(([p, q]) => line(p, q, { holes }))
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

/** Whether the segments p-q and r-s cross (or touch within `pad`). */
function crosses([p, q]: [Pt, Pt], [r, s]: [Pt, Pt], pad = 1.2): boolean {
  // The leaders run level or upright, so boxes grown by `pad` tell it.
  const box = (a: Pt, b: Pt): Box => [Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad];
  const [A, B] = [box(p, q), box(r, s)];
  return A[0] < B[2] && B[0] < A[2] && A[1] < B[3] && B[1] < A[3];
}
const segBox = ([p, q]: [Pt, Pt], b: Box, pad = 1.5) =>
  Math.min(p[0], q[0]) < b[2] + pad && Math.max(p[0], q[0]) > b[0] - pad && Math.min(p[1], q[1]) < b[3] + pad && Math.max(p[1], q[1]) > b[1] - pad;

const rgb = (c: readonly number[]) => `rgb(${c.join(' ')})`;
/** The ten zones, as lib/descent names and colours them. */
export const ZONES = STRATA.slice(0, 10).map((z, k) => ({ name: z.name, color: rgb(z.look.accent), from: 10 * k + 1, sigil: sigilOf(z.name) }));
/** About how wide a zone's name is set (the display face's spaced capitals at 7.6 px), so the pit can stand clear of the longest. */
const nameW = (name: string) => name.length * 4.75 + 1;

/** The terraces' depth: each is the front of an ellipse this much as deep as it is wide. */
const TILT = 0.2;
/** The rock shaded beside the pit's sides. */
const ROCK = 6;
/** The star's glory: its radius, and where its depth starts beside it. */
const GLORY = 8.2;
const STAR_R = 4.4;
/** The depth beside the star: about this wide per figure (Cinzel's bold figures at 10 px), and half as tall as it stands. */
const FIGURE_W = 6.6;
const NUM_HALF = 4.2;

/**
 * The plate for a box `W` × `H` px, for a best run `deepest` deep (null
 * before a first run); `met` are the finds you have met, with the depth
 * each first turns up at; `layout` says where the caption is and where the
 * finds' headings are, when they stand beside it.
 */
export function descentPlate(W: number, H: number, deepest: number | null, met: { kind: FindKind; from: number }[] = [], layout: Layout = {}): Plate {
  const caption = layout.caption ?? null;
  const targets = layout.targets ?? null;
  const best = deepest && deepest > 0 ? Math.floor(deepest) : null;
  const reached = ZONES.filter((z) => best !== null && best >= z.from).length;
  const past = best !== null && best > 100;

  // ---- the layout, top to bottom: Sol beside the caption, the ten zones, the endless stretch ----
  const SOL_R = 8;
  const SOL_Y = SOL_R + 8.5;
  /** The front of the mouth (depth 0 on the pit's axis) and of the tenth zone's floor (depth 100). */
  const TOP = SOL_Y + SOL_R + 6;
  const END = Math.min(80, Math.max(52, H * 0.2));
  const BOTTOM = H - END;
  const band = (BOTTOM - TOP) / 10;
  /** Where depth `d` lies on the axis (the middle of its tenth of its zone). */
  const y = (d: number) => TOP + ((d - 0.5) * band) / 10;
  const R = Math.min(8.6, band / 2 - 1.7);
  const halfBot = R + 3.4;
  const halfTop = Math.max(halfBot + 6, 21);
  /** The pit's half-width at the front of the terrace at `yy` (it carries on narrowing past the tenth zone). */
  const half = (yy: number) => Math.max(4, halfTop + ((halfBot - halfTop) * (yy - TOP)) / (BOTTOM - TOP));
  const sealC0 = (k: number) => TOP + (k + 0.5) * band;

  // ---- and across: the zones' names | the pit | the leaders (or the items) ----
  // The pit stands just clear of the longest name, and Sol of the caption.
  const namesAX = 1 + Math.max(...ZONES.map((z, k) => nameW(z.name) + 3 + ROCK + half(sealC0(k))));
  const stacked = !targets || targets.length === 0;
  const off = stacked ? Math.max(0, (W - (namesAX + halfTop + ROCK + 16)) / 2) : 0;
  const capAX = caption && caption[3] > SOL_Y - SOL_R - 12 ? caption[2] + SOL_R + 11 + 3 : 0;
  const AX = Math.max(off + namesAX, capAX);
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
  const nameX = (yy: number) => side(yy, -1)[0] - ROCK - 3;
  /** The rock's outer edge on side `s` at height `yy` (a point on the slanting line, not a terrace's front). */
  const rockAt = (yy: number, s = -1) => {
    let t = yy;
    for (let i = 0; i < 6; i++) t = yy + TILT * half(t);
    return AX + s * (half(t) + ROCK);
  };

  // ---- the endless stretch: strata closing up below the tenth zone, a seal with the ouroboros among them ----
  const strata: number[] = [BOTTOM];
  for (let g = band * 0.62; strata.at(-1)! + g < H - 2 && g > 1.6; g *= 0.74) strata.push(strata.at(-1)! + g);
  const endR = R;
  const endC: Pt = [AX, Math.min(BOTTOM + END * 0.46, H - endR - 6)];
  const endHole: Hole = { c: endC, r: endR + 1.3 };

  // ---- the star ----
  const surfaceY = TOP - TILT * halfTop;
  // On the right wall's rock at your deepest, clear of the seal there; beside the mouth before a first run; on the endless stretch past 100.
  const starAt = (yy: number, r: number): Pt => [Math.max(side(yy, 1)[0] + ROCK / 2, AX + r + GLORY + 2.6), yy];
  const star: Pt = past ? starAt(endC[1], endR) : best ? starAt(side(y(best), 1)[1], R) : [side(TOP, 1)[0] + ROCK + 3, surfaceY];
  const starHole: Hole = { c: star, r: GLORY + 1 };
  const sol: Pt = [AX, SOL_Y];
  const solHole: Hole = { c: sol, r: SOL_R + 1.4 };
  const sealC = (k: number): Pt => [AX, sealC0(k)];
  const sealHoles: Hole[] = ZONES.map((_, k) => ({ c: sealC(k), r: R + 1.3 }));

  // ---- timing: the pen sweeps down the pit once ----
  const S0 = 0.4;
  const S = 1.35;
  const sweep = (yy: number) => S0 + ease((yy - TOP) / (H - TOP)) * S;
  const STAR_AT = 2.15;

  // ---- the finds you have met: a station on the rock where each first turns up ----
  const found = [...met].sort((a, b) => a.from - b.from);
  const stationAt = (from: number): Pt => {
    const p = side(TOP + ((Math.min(101, from) - 1) * band) / 10, 1);
    return [p[0] + ROCK, p[1]];
  };
  // Beside the finds: a leader from each station across to its heading, level, then upright in a lane of its own, then level to the item.
  type Leader = { kind: FindKind; s: Pt; e: Pt; path: Pt[] };
  const leaders: Leader[] = [];
  if (!stacked) {
    const ls = found.flatMap((m) => {
      const t = targets!.find((x) => x.kind === m.kind);
      return t ? [{ kind: m.kind, s: stationAt(m.from), e: [t.x - 2.6, t.y] as Pt }] : [];
    });
    if (ls.length) {
      const lo = Math.max(...ls.map((l) => l.s[0])) + 3.5;
      const hi = Math.min(...ls.map((l) => l.e[0])) - 3.5;
      const step = ls.length > 1 ? Math.min(5.5, Math.max(0, (hi - lo) / (ls.length - 1))) : 0;
      const lanes = ls.map((_, i) => (ls.length > 1 ? (lo + hi) / 2 + (i - (ls.length - 1) / 2) * step : (lo + hi) / 2));
      const pathOf = (l: (typeof ls)[number], x: number): Pt[] => (Math.abs(l.e[1] - l.s[1]) < 1 ? [l.s, l.e] : [l.s, [x, l.s[1]], [x, l.e[1]], l.e]);
      const segs = (p: Pt[]) => p.slice(1).map((q, i): [Pt, Pt] => [p[i], q]);
      // The lanes in the order that keeps every leader clear of the others.
      const orders = (n: number): number[][] => (n <= 1 ? [[0]] : orders(n - 1).flatMap((o) => Array.from({ length: n }, (_, i) => [...o.slice(0, i), n - 1, ...o.slice(i)])));
      const clear = (o: number[]) => {
        const ps = ls.map((l, i) => segs(pathOf(l, lanes[o[i]])));
        return ps.every((a, i) => ps.every((b, j) => j <= i || a.every((sa) => b.every((sb) => !crosses(sa, sb)))));
      };
      const order = orders(ls.length).find(clear) ?? ls.map((_, i) => i);
      ls.forEach((l, i) => leaders.push({ ...l, path: pathOf(l, lanes[order[i]]) }));
    }
  }
  // Your deepest beside the star, where no leader runs.
  const numText = best ? String(shownDepth(best)) : '';
  const numBox: Box | null = best ? [star[0] + GLORY + 2.2, star[1] - NUM_HALF, star[0] + GLORY + 2.2 + numText.length * FIGURE_W, star[1] + NUM_HALF] : null;
  const numFree = numBox !== null && leaders.every((l) => l.path.slice(1).every((q, i) => !segBox([l.path[i], q], numBox)));
  const num = numFree && numBox ? { text: numText, x: numBox[0], y: star[1] } : null;
  const numHole: Hole[] = num && numBox ? [{ box: [numBox[0] - 1.5, numBox[1] - 1.5, numBox[2] + 1.5, numBox[3] + 1.5] }] : [];

  const stations: Station[] = found.map((m) => {
    const c = stationAt(m.from);
    const delay = sweep(c[1]) + 0.45;
    if (!stacked) return { kind: m.kind, c, delay };
    // Stacked: its item beside the station, past the star if the star is there.
    const h = 9;
    let x = c[0] + 2.4;
    if (Math.abs(c[1] - star[1]) < GLORY + h / 2 + 1) x = Math.max(x, star[0] + GLORY + 2);
    // And past your deepest's number, if it stands there.
    if (num && numBox && Math.abs(c[1] - star[1]) < NUM_HALF + h / 2 + 1) x = Math.max(x, numBox[2] + 2.5);
    return { kind: m.kind, c, delay, item: { x, y: c[1] - h / 2, h } };
  });
  const stationHoles: Hole[] = stations.map((s) => ({ c: s.c, r: 1.8 }));
  const itemBoxes: Hole[] = stations.flatMap((s) => (s.item ? [{ box: [s.item.x - 1, s.item.y - 1, s.item.x + s.item.h + 1, s.item.y + s.item.h + 1] as Box }] : []));

  /** Every line, worn (for the lines) or whole (for the glow under them). */
  const build = (worn: boolean) => {
    const wear = (seed: number) => (worn ? wearOf(seed) : null);
    const parts: Omit<Part, 'glow'>[] = [];
    const rays: string[] = [];
    const add = (tone: Part['tone'], strokes: Stroke[], lit = true, color?: string) => parts.push({ tone, strokes, lit, color });
    const common: Hole[] = [starHole, ...numHole, ...itemBoxes];

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
      ...pen([mr, [mr[0] + ROCK + 4, surfaceY]], 'main', 0.2, 0.2, { holes: common }),
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
    // shorter and shorter dashes, each fainter than the last.
    const [p0, p1] = [side(TOP, 1), side(BOTTOM, 1)];
    const dir: Pt = [(p1[0] - p0[0]) / (p1[1] - p0[1]), 1];
    const run = (s: number, out: number, y0: number, y1: number): [Pt, Pt] => [
      [AX + s * (p0[0] - AX + out + dir[0] * (y0 - p0[1])), y0],
      [AX + s * (p0[0] - AX + out + dir[0] * (y1 - p0[1])), y1],
    ];
    const sides: Stroke[] = [];
    const deep: Stroke[] = [];
    const fadeT = (H - p1[1]) / (H - TOP);
    for (const s of [-1, 1]) {
      sides.push(...pen(run(s, 0, p0[1], p1[1]), 'main', S0, S * (1 - fadeT), { holes: common, wear: wear(s > 0 ? 11 : 13) }));
      sides.push(...pen(run(s, ROCK, p0[1], p1[1]), 'thin', S0 + 0.05, S * (1 - fadeT), { holes: [...common, ...stationHoles], wear: wear(s > 0 ? 19 : 23) }));
      for (const [out, kind] of [[0, 'main'], [ROCK, 'thin']] as const)
        deep.push(
          ...dashes(...run(s, out, p1[1], H - 0.5), kind, sweep(p1[1]), 0.5, (i) => 7 * 0.72 ** i + 0.6, (i) => 1.3 + 0.55 * i, (i) => 0.9 * 0.78 ** i, [...common, endHole]),
        );
    }
    add('gold', sides);

    // The terraces' fronts, lit as far as you have been, and the seams across the rock at their ends.
    for (let k = 0; k <= 10; k++) {
      const yy = TOP + k * band;
      const lit = k <= reached;
      const strokes = pen(front(yy), k % 10 ? 'thin' : 'main', k ? sweep(yy) : 0.2, 0.3, { holes: [...common, ...sealHoles], wear: k ? null : wear(7) });
      for (const s of [-1, 1]) {
        const p = side(yy, s);
        if (k > 0) strokes.push(...pen([p, [p[0] + s * ROCK, p[1]]], 'hair', sweep(yy), 0.06, { holes: common }));
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

    // The endless stretch: the strata below the tenth zone, closing up and fading, each a terrace's front in the pit and a seam
    // running out across the whole column on either side, broken into dashes; the walls' dashes above.
    for (let j = 1; j < strata.length; j++) {
      const yy = strata[j];
      const o = Math.max(0.12, 0.85 * 0.8 ** (j - 1));
      const d0 = sweep(yy);
      deep.push(...pen(front(yy), 'hair', d0, 0.25, { holes: [...common, endHole], o }));
    }
    for (let j = 0; j < strata.length; j++) {
      const yy = strata[j];
      const o = Math.max(0.1, 0.75 * 0.8 ** j);
      const yl = side(yy, -1)[1];
      const d0 = sweep(yy);
      // Out from the rock: long dashes near the pit, shorter and fainter toward the edges.
      const fadeOut = (i: number) => o * 0.9 ** i;
      deep.push(...dashes([rockAt(yl, -1) - 1.6, yl], [0.5, yl], 'hair', d0, 0.5, (i) => 5.5 * 0.86 ** i + 1, (i) => 1.6 + 0.25 * i, fadeOut, common));
      deep.push(...dashes([rockAt(yl, 1) + 1.6, yl], [stacked ? W - 0.5 : W - 4, yl], 'hair', d0, 0.5, (i) => 5.5 * 0.86 ** i + 1, (i) => 1.6 + 0.25 * i, fadeOut, common));
    }
    // The ground it runs through, either side of the pit: every other layer between the strata shaded in slanting strokes, which
    // fade out away from the pit and further down.
    for (let j = 0; j + 1 < strata.length; j += 2) {
      const [ya, yb] = [side(strata[j], -1)[1], side(strata[j + 1], -1)[1]];
      if (yb - ya < 2.4) break;
      const o = 0.6 * 0.7 ** j;
      const edge = stacked ? W - 1 : W - 4;
      for (const [poly, from, to] of [
        [[[1, ya], [rockAt(ya) - 1.6, ya], [rockAt(yb) - 1.6, yb], [1, yb]], rockAt(ya), 1],
        [[[rockAt(ya, 1) + 1.6, ya], [edge, ya], [edge, yb], [rockAt(yb, 1) + 1.6, yb]], rockAt(ya, 1), edge],
      ] as [Pt[], number, number][])
        for (const [p, q] of hatchSegs(poly, -60, 2.4, 0.7)) {
          const u = Math.min(1, Math.abs((p[0] + q[0]) / 2 - from) / Math.abs(to - from));
          const fade = o * (1 - u) ** 1.3;
          if (fade > 0.05) deep.push(...pen([p, q], 'hair', sweep(ya) + 0.1 + u * 0.4, 0.05, { holes: [...common, endHole], o: fade }));
        }
    }
    add(past ? 'gold' : 'dull', [...deep, ...pen(arcPts(endC, endR), 'thin', sweep(endC[1] - endR), 0.35, { wear: wear(60) }), ...pen(arcPts(endC, endR - 1.2), 'hair', sweep(endC[1] - endR) + 0.05, 0.35)], past);

    // The seals: a worn double ring, struck in the zone's colour once reached, a dull impression until then.
    for (let k = 0; k < 10; k++) {
      const c = sealC(k);
      const known = k < reached;
      const d = sweep(c[1] - R);
      const rings = [...pen(arcPts(c, R), 'thin', d, 0.35, { wear: wear(40 + k) }), ...pen(arcPts(c, R - 1.2), 'hair', d + 0.05, 0.35)];
      if (known) add('zone', rings, true, ZONES[k].color);
      else add('dull', rings, false);
    }

    // The finds' leaders: from the station on the rock, across to the heading's item.
    for (const l of leaders) {
      const st = stations.find((s) => s.kind === l.kind)!;
      const path = [[l.s[0] + 1.4, l.s[1]] as Pt, ...l.path.slice(1)];
      add('find', pen(path, 'hair', st.delay, 0.55, { holes: [starHole, ...numHole, solHole] }), false, `var(--find-${l.kind})`);
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
  const starDisc: Disc = { c: star, r: GLORY + 1 };
  const sealDiscs: Disc[] = ZONES.map((_, k) => ({ c: sealC(k), r: R + 1.3 }));
  const toneOf = (k: number) => (k < reached ? { tone: 'zone' as const, color: ZONES[k].color } : { tone: 'dull' as const });
  for (let k = 0; k < 10; k++) {
    const [y0, y1] = [TOP + k * band, TOP + (k + 1) * band];
    // The rock beside the pit, shaded on the right only, the side in shadow (the left is lit).
    const [p0, p1] = [side(y0, 1), side(y1, 1)];
    let d = hatchPoly([p0, [p0[0] + ROCK, p0[1]], [p1[0] + ROCK, p1[1]], p1], -45, 1.2, [starDisc]);
    // The terrace's face under its front, shaded on the right of the seal: arcs under the front, each shorter than the last.
    for (let j = 1; j <= 4; j++) {
      const pts = front(y0, j * 0.8, 0.52 + 0.04 * j, 0.99 - 0.07 * j);
      for (let i = 1; i < pts.length; i++) d += line(pts[i - 1], pts[i], { holes: [starDisc, ...sealDiscs] });
    }
    shades.push({ d, ...toneOf(k), delay: sweep(y0) + 0.1, t: 0.35 });
  }
  // The rock on the endless stretch, shaded on as it fades.
  for (let j = 0; j + 1 < strata.length; j++) {
    const [p0, p1] = [side(strata[j], 1), side(strata[j + 1], 1)];
    shades.push({
      d: hatchPoly([p0, [p0[0] + ROCK, p0[1]], [p1[0] + ROCK, p1[1]], p1], -45, 1.2, [starDisc]),
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
      [starDisc],
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
    return { k, c, r: R, known, delay: sweep(c[1] - R), ...(known ? { name: z.name, color: z.color, sigil: z.sigil } : { hollow: hollow(c, R - 1.9, 0.85) }) };
  });
  const names = seals.filter((s) => s.known).map((s) => ({ x: nameX(s.c[1]), y: s.c[1], text: s.name!, color: s.color!, delay: s.delay + 0.3 }));

  // ---- "uncharted": the zones not reached yet, bracketed together under one quiet word, the bracket's lines stopping short of it ----
  let uncharted: Uncharted | null = null;
  if (reached < ZONES.length) {
    const y0 = side(TOP + reached * band, -1)[1] + 2;
    const y1 = side(BOTTOM, -1)[1] - 3;
    const mid0 = (y0 + y1) / 2;
    const x = rockAt(mid0) - 3 - 21;
    let d = '';
    if (y1 - y0 > 26) {
      const tick = (yy: number) => line([x, yy], [rockAt(yy) - 2, yy]);
      d = tick(y0) + tick(y1) + pen([[x, y0], [x, y1]], 'hair', 0, 1, { holes: [{ box: [x - 22, mid0 - 6.5, x + 22, mid0 + 6.5] }] }).map((s) => s.d).join('');
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

  return {
    w: W,
    h: H,
    parts,
    shades,
    seals,
    sol: { c: sol, r: SOL_R },
    names,
    uncharted,
    stations,
    endless: { c: endC, r: endR, lit: past, delay: sweep(endC[1]) + 0.2 },
    star: { c: star, r: STAR_R, gloryR: GLORY, outline: st.outline, ridges: st.ridges, hatch: st.hatch, glory, delay: STAR_AT, num },
  };
}
