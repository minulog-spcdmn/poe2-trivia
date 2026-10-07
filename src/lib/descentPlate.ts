// The descent plate on Delve's rules page (DelveLadder.svelte): the pit the
// players go down, engraved as the alchemist's circle is (docs/arcane-style.md).
//
// Sol stands over the mouth of a pit seen a little from above. The pit
// narrows down through the ten zones, each a ring of terrace whose edge is
// an ellipse (its near half firm, its far half a hairline passing behind
// the seal above), to its floor. Below it, in clear air, lies the
// ouroboros (lib/serpent): a serpent in a figure eight on its side biting
// its tail, for no end past 100. Each terrace holds a seal on the pit's
// axis: a zone you have reached is struck in its colour with its sigil
// (lib/zoneSigils) and named in the margin, its terrace lit; one you
// haven't is a dull impression, an empty hollow, and the zones not reached
// yet are bracketed together in the margin under one word, "uncharted".
// An eight-pointed star in a glory of rays marks your deepest on the pit's
// right wall (at the mouth before a first run, in the serpent's right loop
// past 100). The notes in the right margin say what lies ahead. Each find
// you have met has a callout in the left margin: a fine leader from the
// wall where it first turns up to its item and that depth.
//
// Everything is exact geometry in plate units (px at scale 1): the pit's
// sides are straight lines converging downward, every terrace an ellipse
// whose depth is a fifth of its width, every ring a circle, Sol's rays and
// the star's glory radial; lines
// stop short of every seal, sign, star and word (holes); the rock beside the
// pit and the terraces' faces are shaded in one-sided hatching (the light
// falls from the upper left, as on the cards); main lines carry a few nicks
// of wear. Each stroke comes with its timing, so the plate draws itself in
// from the surface down as one sweep of the pen.

import { at, hatch, line, seeded, star8, type Hole as Disc } from './arcane.ts';
import { shownDepth, type FindKind } from './delve.ts';
import { serpent, serpentSize } from './serpent.ts';
import { STRATA } from './descent.ts';
import { sigilOf, type Sigil } from './zoneSigils.ts';

export type Pt = [number, number];
/** main: an outline; thin: a second line; hair: the finest. */
export type Kind = 'main' | 'thin' | 'hair';
/** A piece of a line, when the pen reaches it and how long it takes over it (s). */
export type Stroke = { d: string; kind: Kind; delay: number; t: number };
/** What lines stop short of: a circle, or a box (x0, y0, x1, y1). */
type Hole = { c: Pt; r: number } | { box: [number, number, number, number] };
/**
 * A set of lines in one tone: gold (the plate's lines), dull (what is not
 * reached yet), zone (a reached zone's, in `color`). `lit` ones have a glow
 * under them: the same lines whole (unworn), drawn wide and soft.
 */
/** dim: the serpent before you are past 100, a dark gold; find: a find's leader, in its colour (`color`). */
export type Tone = 'gold' | 'dull' | 'zone' | 'dim' | 'find';
export type Part = { tone: Tone; color?: string; lit: boolean; strokes: Stroke[]; glow: { d: string; kind: Kind }[] };
/** Hatching (one path, drawn at once), in the tone of its zone or dull. */
export type Shade = { d: string; tone: Tone; color?: string; delay: number; t: number };
export type Seal = { k: number; c: Pt; r: number; known: boolean; name?: string; color?: string; sigil?: Sigil; delay: number; hollow?: string };
/** A find you have met, by the depth it first turns up at: its items' icons from `x` (left), the depth from `numX`, on the line `y`. */
export type Callout = { kinds: FindKind[]; num: string; x: number; numX: number; y: number; dot: Pt; delay: number };
/** The zones not reached yet, under one word: the bracket's lines, and where the word sits. */
export type Uncharted = { d: string; x: number; y: number; delay: number };
export type Note = { id: string; word?: string; num?: string; lines: string[]; y: number; best?: boolean };
export type Plate = {
  /** The plate's size in its own units; the drawing is shown at `scale` px per unit. */
  w: number;
  h: number;
  scale: number;
  parts: Part[];
  shades: Shade[];
  seals: Seal[];
  sol: { c: Pt; r: number };
  names: { x: number; y: number; text: string; color: string; delay: number }[];
  uncharted: Uncharted | null;
  callouts: Callout[];
  /** The star, drawn about its centre `c` (its outline, ridges, hatching and glory are about 0, 0, so the glory can turn). */
  star: { c: Pt; r: number; gloryR: number; outline: string; ridges: string; hatch: string; glory: string; delay: number };
  /**
   * The serpent: lit past 100; its eye (a ring, a slit, a glint); the line
   * down its back in pieces, each `from` along it, `len` long all told, for
   * the sheen; the middle of its right loop and what fits there.
   */
  ouro: {
    lit: boolean;
    eye: { c: Pt; r: number; glint: Pt; angle: number };
    sheen: { d: string; from: number }[];
    sheenLen: number;
    /** The sheen's reach either side of the back line (it lights the body's own lines as it passes), and those lines, whole. */
    sheenW: number;
    lines: string;
    loop: Pt;
    inner: number;
    delay: number;
    done: number;
  };
  notes: Note[];
  noteX: number;
  /** Where the number by the star starts (clear of its glory). */
  bestX: number;
  pips: Pt[];
};

export const f = (v: number) => v.toFixed(2);
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const inHole = (p: Pt, h: Hole) => ('c' in h ? dist(p, h.c) < h.r : p[0] > h.box[0] && p[0] < h.box[2] && p[1] > h.box[1] && p[1] < h.box[3]);
/** The pen's pace: fast at first, slowing at the end (the circle's stroke()). */
const ease = (u: number) => 1 - Math.sqrt(1 - Math.min(1, Math.max(0, u)));

/** The plate's wear: nicks of 0.5 to 0.9 units every 110 or so, from a fixed seed, as cuts in [0, 1] of a line `len` long. */
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
 * stroke rather than as scattered dashes). As the zone gate's pen
 * (components/zonebanner/pen.ts), but it keeps the points of a curve, so
 * the small rings stay round.
 */
function pen(pts: Pt[], kind: Kind, delay: number, t: number, { holes = [], wear = null }: { holes?: Hole[]; wear?: Wear } = {}): Stroke[] {
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
      out.push({ d: 'M' + keep.map((s) => `${f(s[0])} ${f(s[1])}`).join('L'), kind, delay: delay + a * t, t: Math.max(0.03 * t, (b - a) * t) });
    }
    i = j;
  }
  return out;
}

/** Points round a circle about `c`, from `a0` to `a1` degrees clockwise from the top (lib/arcane's `at`). */
const arcPts = (c: Pt, r: number, a0 = 0, a1 = 360) => {
  const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.PI * r) / 180 / 0.5));
  return Array.from({ length: n + 1 }, (_, k) => at(c, a0 + ((a1 - a0) * k) / n, r));
};

/** Parallel hatching across the convex polygon `poly`, `angle` degrees from the horizontal, `gap` apart, `pad` short of its edges, broken at the discs. */
function hatchPoly(poly: Pt[], angle: number, gap: number, holes: Disc[] = [], pad = 0.5): string {
  const a = (angle * Math.PI) / 180;
  const u: Pt = [Math.cos(a), Math.sin(a)];
  const across = (p: Pt) => -p[0] * u[1] + p[1] * u[0];
  const along = (p: Pt) => p[0] * u[0] + p[1] * u[1];
  const ps = poly.map(across);
  let d = '';
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
    if (L > 2 * pad + 0.3) d += line(lerp(p, q, pad / L), lerp(p, q, 1 - pad / L), { holes });
  }
  return d;
}

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

/** Notes: a line apart, and at least GAP apart from the next. */
export const LINE = 10.5;
const GAP = 11.5;
/** The notes and your deepest, top to bottom, each at about its `y`, nudged apart where they would touch (your deepest never moves). */
function spread(notes: Note[]): Note[] {
  const out = notes.map((n) => ({ ...n })).sort((a, b) => a.y - b.y);
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 1; i < out.length; i++) {
      const [a, b] = [out[i - 1], out[i]];
      const over = a.y + Math.max(0, a.lines.length - 1) * LINE + GAP - b.y;
      if (over < 0.01) continue;
      moved = true;
      if (a.best) b.y += over;
      else if (b.best) a.y -= over;
      else [a.y, b.y] = [a.y - over / 2, b.y + over / 2];
    }
    if (!moved) break;
  }
  return out;
}

const rgb = (c: readonly number[]) => `rgb(${c.join(' ')})`;
/** The ten zones, as lib/descent names and colours them. */
export const ZONES = STRATA.slice(0, 10).map((z, k) => ({ name: z.name, color: rgb(z.look.accent), from: 10 * k + 1, sigil: sigilOf(z.name) }));

/** The plate's design width: the column it fills beside the finds. Wider, it is drawn larger (up to MAX_SCALE) and centred. */
export const DESIGN_W = 224;
const MAX_SCALE = 1.3;
/** The terraces' depth: each is the front of an ellipse this much as deep as it is wide. */
const TILT = 0.2;
/** The rock shaded beside the pit's sides. */
const ROCK = 6;
/** The notes' column, from the right edge. */
const NOTES_W = 88;

/**
 * The plate for a box `pw` × `ph` px, for a best run `deepest` deep (null
 * before a first run); `lives` (in words) and `findsFrom` go into the notes;
 * `met` are the finds you have met, with the depth each first turns up at.
 */
export function descentPlate(
  pw: number,
  ph: number,
  deepest: number | null,
  lives: string,
  findsFrom: number,
  met: { kind: FindKind; from: number }[] = [],
): Plate {
  const scale = Math.min(MAX_SCALE, Math.max(1, pw / DESIGN_W));
  const W = pw / scale;
  const H = ph / scale;
  const best = deepest && deepest > 0 ? Math.floor(deepest) : null;
  const reached = ZONES.filter((z) => best !== null && best >= z.from).length;
  const past = best !== null && best > 100;

  // ---- the layout, top to bottom ----
  const SOL_R = Math.min(10, Math.max(8, H * 0.033));
  const SOL_Y = SOL_R + 8.5;
  /** The front of the mouth (depth 0 on the pit's axis) and of the deepest terrace (depth 100). */
  const TOP = SOL_Y + SOL_R + 6;
  // The serpent at the foot, as large as the plate can spare (on a tall plate it takes a little from the terraces), in clear air below the pit.
  const SH = Math.min(50, Math.max(35, H * 0.112));
  const SW = SH * 0.088;
  const sz = serpentSize(SH / 2, SW);
  const OY = H - 1.5 - SH / 2;
  const BOTTOM = OY - SH / 2 - 6.5;
  const band = (BOTTOM - TOP) / 10;
  /** Where depth `d` lies on the axis (the middle of its tenth of its zone). */
  const y = (d: number) => TOP + ((d - 0.5) * band) / 10;
  const R = Math.min(8.6, band / 2 - 1.7);

  // ---- and across: zone names | the pit | the notes ----
  const off = (W - DESIGN_W) / 2;
  const noteX = W - off - NOTES_W;
  const pipX = noteX - 6;
  const AX = off + 102;
  const halfTop = Math.min(30, pipX - AX - ROCK);
  const halfBot = R + 3.4;
  /** The pit's half-width at the front of the terrace at `yy`, and a point on its side there (`s` -1 left, 1 right), at the ellipse's ends. */
  const half = (yy: number) => halfTop + ((halfBot - halfTop) * (yy - TOP)) / (BOTTOM - TOP);
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
  /** The left rock's outer edge at height `yy` (a point on the slanting line, not a terrace's front). */
  const rockAt = (yy: number) => {
    let t = yy;
    for (let i = 0; i < 6; i++) t = yy + TILT * half(t);
    return AX - half(t) - ROCK;
  };
  // The serpent reaches as far right as the notes allow; its crossing lies left of the pit's axis, its right loop under the floor.
  const SX = Math.max(off + 3 + sz.halfW, pipX - 5 - sz.halfW);
  const snake = serpent([SX, OY], sz.r, sz.d, SW);
  const loopR = snake.loops[1];

  // ---- what lines stop short of ----
  const STAR_R = 4.4;
  /** The star's glory: inside the ouroboros, clear of the ring there. */
  const GLORY = past ? Math.min(8.2, snake.inner - 0.5) : 8.2;
  const surfaceY = TOP - TILT * halfTop;
  // On the right wall's rock at your deepest, clear of the seal there; at the mouth on the left before a first run; inside the ouroboros past 100.
  const star: Pt = past
    ? loopR
    : best
      ? [Math.max(side(y(best), 1)[0] + ROCK / 2, AX + R + GLORY + 2.6), side(y(best), 1)[1]]
      : [side(TOP, -1)[0] - ROCK / 2, surfaceY];
  const starHole: Hole = { c: star, r: GLORY + 1 };
  const sol: Pt = [AX, SOL_Y];
  const solHole: Hole = { c: sol, r: SOL_R + 1.4 };
  const sealC = (k: number): Pt => [AX, TOP + (k + 0.5) * band];
  const sealHoles: Hole[] = ZONES.map((_, k) => ({ c: sealC(k), r: R + 1.3 }));

  // ---- the notes, at about the depths they're about ----
  const NOTES: Note[] = [
    { id: 'lives', num: String(shownDepth(1)), lines: [`${lives} lives`], y: surfaceY + 1 },
    { id: 'finds', num: String(shownDepth(findsFrom)), lines: ['finds appear'], y: y(findsFrom) + 2 },
    { id: 'zones', word: 'every', num: '10', lines: ['a new zone'], y: TOP + 2 * band },
    { id: 'deeper', word: 'deeper', lines: ['less time,', 'trickier questions'], y: y(60) },
    { id: 'endless', num: '100+', lines: ['endless'], y: OY },
  ];
  const notes = spread(best ? [...NOTES, { id: 'best', num: String(shownDepth(best)), lines: [], y: star[1], best: true }] : NOTES);
  const pips: Pt[] = notes.filter((n) => !n.best).map((n) => [pipX, n.y]);
  const pipHoles: Hole[] = pips.map((p) => ({ c: p, r: 2.8 }));
  /** The notes' words (the glory above stops short of them). */
  const noteBoxes: Hole[] = notes.map((n) => ({ box: [noteX - 1.5, n.y - 6.5, W, n.y + 6.5 + (n.lines.length - 1) * LINE] }));


  // ---- timing: the pen sweeps down the pit once ----
  const S0 = 0.4;
  const S = 1.25;
  const sweep = (yy: number) => S0 + ease((yy - TOP) / (OY - TOP)) * S;
  const OURO_AT = sweep(BOTTOM) + 0.05;
  /** How long the pen takes round the serpent. */
  const OURO_T = 1.1;
  const STAR_AT = 2.15;

  // ---- the finds you have met, a callout each in the left margin ----
  // From the wall where a find first turns up (for depth 10k + 1, the end of a terrace), its leader runs down to the line
  // halfway between two zones' names and out along it to the find's items and that depth. Finds that turn up together share one.
  const byFrom = new Map<number, FindKind[]>();
  for (const m of [...met].sort((a, b) => a.from - b.from)) byFrom.set(m.from, [...(byFrom.get(m.from) ?? []), m.kind]);
  const callouts: Callout[] = [...byFrom].map(([from, kinds]) => {
    const yy = y(Math.min(100, from) - 0.5);
    const wall = side(yy, -1);
    const x = off + 3;
    return {
      kinds,
      num: String(shownDepth(from)),
      x,
      numX: x + kinds.length * 6.6 + 1,
      y: TOP + Math.min(9, Math.max(1, Math.round((yy - TOP) / band))) * band,
      dot: [wall[0] - ROCK, wall[1]],
      delay: sweep(yy) + 0.45,
    };
  });
  /** The rock's edge stops short of each leader's station. */
  const calloutHoles: Hole[] = callouts.map((c) => ({ c: c.dot, r: 1.8 }));

  /** Every line, worn (for the lines) or whole (for the glow under them). */
  const build = (worn: boolean) => {
    const wear = (seed: number) => (worn ? wearOf(seed) : null);
    const parts: Omit<Part, 'glow'>[] = [];
    const rays: string[] = [];
    const add = (tone: Part['tone'], strokes: Stroke[], lit = true, color?: string) => parts.push({ tone, strokes, lit, color });

    // Sol over the mouth: a double ring in a glory over the surface, seven pointed rays (hatched down one side) and fine rays between, long and short in turn.
    const glory: Stroke[] = [];
    const gHoles: Hole[] = [...noteBoxes, ...pipHoles, starHole];
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

    // The surface, level out from the mouth to the plate's edge on the left and to the notes on the right; a hairline under it on the left.
    const [ml, mr] = [side(TOP, -1), side(TOP, 1)];
    const surface = [
      ...pen([ml, [off + 2, surfaceY]], 'main', 0.2, 0.5, { holes: [starHole], wear: wear(3) }),
      ...pen([mr, [pipX - 4, surfaceY]], 'main', 0.2, 0.2, { holes: [starHole, ...pipHoles] }),
      ...pen([[ml[0] - ROCK - 1.2, surfaceY + 2.4], [off + 4, surfaceY + 2.4]], 'hair', 0.28, 0.45, { holes: [starHole] }),
    ];
    // The mouth: its far rim, behind Sol, and its near one (the first terrace's front).
    const back = Array.from({ length: 41 }, (_, i) => {
      const phi = Math.PI + (Math.PI * i) / 40;
      return [AX + halfTop * Math.cos(phi), surfaceY + TILT * halfTop * Math.sin(phi)] as Pt;
    });
    surface.push(...pen(back, 'thin', 0.15, 0.4, { holes: [solHole, starHole] }));
    add('gold', surface);

    // The pit's sides and the rock's outer edges beside them, from the mouth down to the floor's ends.
    const [p0, p1] = [side(TOP, 1), side(BOTTOM, 1)];
    const dir: Pt = [(p1[0] - p0[0]) / (p1[1] - p0[1]), 1];
    const end = p1[1];
    const run = (s: number, out: number): [Pt, Pt] => [
      [AX + s * (p0[0] - AX + out), p0[1]],
      [AX + s * (p0[0] - AX + out + dir[0] * (end - p0[1])), end],
    ];
    const sides: Stroke[] = [];
    for (const s of [-1, 1]) {
      sides.push(...pen(run(s, 0), 'main', S0, S, { holes: [starHole], wear: wear(s > 0 ? 11 : 13) }));
      sides.push(...pen(run(s, ROCK), 'thin', S0 + 0.05, S, { holes: [starHole, ...pipHoles, ...calloutHoles], wear: wear(s > 0 ? 19 : 23) }));
    }
    add('gold', sides);

    // The terraces' fronts, lit as far as you have been, and the seams across the rock at their ends.
    for (let k = 0; k <= 10; k++) {
      const yy = TOP + k * band;
      const lit = k <= reached;
      const strokes = pen(front(yy), k % 10 ? 'thin' : 'main', k ? sweep(yy) : 0.2, 0.3, { holes: [starHole, ...sealHoles], wear: k ? null : wear(7) });
      for (const s of [-1, 1]) {
        const p = side(yy, s);
        if (k > 0) strokes.push(...pen([p, [p[0] + s * ROCK, p[1]]], 'hair', sweep(yy), 0.06, { holes: [starHole, ...pipHoles] }));
      }
      // Its far rim, behind the seal above.
      if (k > 0) {
        const [a, b] = [half(yy), TILT * half(yy)];
        const back = Array.from({ length: 41 }, (_, i) => {
          const phi = Math.PI + (Math.PI * i) / 40;
          return [AX + a * Math.cos(phi), yy - b + b * Math.sin(phi)] as Pt;
        });
        strokes.push(...pen(back, 'hair', sweep(yy - 2 * b), 0.3, { holes: [starHole, ...sealHoles] }));
      }
      add(lit ? 'gold' : 'dull', strokes, lit);
    }

    // The seals: a worn double ring, struck in the zone's colour once reached, a dull impression until then.
    for (let k = 0; k < 10; k++) {
      const c = sealC(k);
      const known = k < reached;
      const d = sweep(c[1] - R);
      const rings = [...pen(arcPts(c, R), 'thin', d, 0.35, { wear: wear(40 + k) }), ...pen(arcPts(c, R - 1.2), 'hair', d + 0.05, 0.35)];
      if (known) add('zone', rings, true, ZONES[k].color);
      else add('dull', rings, false);
    }

    // The serpent, drawn round from its tail to its head; its edges worn.
    add(
      past ? 'gold' : 'dim',
      snake.lines.flatMap((l, i) => pen(l.pts, l.kind, OURO_AT + l.at * OURO_T, Math.max(0.06, l.span * OURO_T), { wear: l.kind === 'main' ? wear(71 + i) : null })),
      past,
    );

    // The finds' leaders: from the left wall where each first turns up, down to the line between the zones' names, and out to its label.
    for (const c of callouts) {
      const [x0, y0] = [c.dot[0] - 1.3, c.dot[1]];
      const drop = c.y - y0;
      const knee: Pt = [x0 - Math.max(2.5, Math.abs(drop) * 1.1), c.y];
      const endX = c.numX + c.num.length * 5.4 + 2.2;
      add('find', pen([[x0, y0], knee, [endX, c.y]], 'hair', c.delay, 0.45), false, `var(--find-${c.kinds[0]})`);
    }
    return { parts, rays: rays.join('') };
  };
  const worn = build(true);
  const whole = build(false);
  const parts: Part[] = worn.parts.map((p, i) => {
    const glow = new Map<Kind, string>();
    if (p.lit) for (const s of whole.parts[i].strokes) glow.set(s.kind, (glow.get(s.kind) ?? '') + s.d);
    return { ...p, glow: [...glow].map(([kind, d]) => ({ kind, d })) };
  });

  // ---- the shading ----
  const shades: Shade[] = [];
  const starDisc: Disc = { c: star, r: GLORY + 1 };
  const pipDiscs: Disc[] = pips.map((c) => ({ c, r: 2.8 }));
  const sealDiscs: Disc[] = ZONES.map((_, k) => ({ c: sealC(k), r: R + 1.3 }));
  const toneOf = (k: number) => (k < reached ? { tone: 'zone' as const, color: ZONES[k].color } : { tone: 'dull' as const });
  for (let k = 0; k < 10; k++) {
    const [y0, y1] = [TOP + k * band, TOP + (k + 1) * band];
    // The rock beside the pit, shaded on the right only, the side in shadow (the left is lit).
    const [p0, p1] = [side(y0, 1), side(y1, 1)];
    let d = hatchPoly([p0, [p0[0] + ROCK, p0[1]], [p1[0] + ROCK, p1[1]], p1], -45, 1.2, [starDisc, ...pipDiscs]);
    // The terrace's face under its front, shaded on the right of the seal: arcs under the front, each shorter than the last.
    for (let j = 1; j <= 4; j++) {
      const pts = front(y0, j * 0.8, 0.52 + 0.04 * j, 0.99 - 0.07 * j);
      for (let i = 1; i < pts.length; i++) d += line(pts[i - 1], pts[i], { holes: [starDisc, ...sealDiscs] });
    }
    shades.push({ d, ...toneOf(k), delay: sweep(y0) + 0.1, t: 0.35 });
  }
  // The serpent's scales and plates.
  shades.push({ d: snake.scales.map((q) => 'M' + q.map((v) => `${f(v[0])} ${f(v[1])}`).join('L')).join(''), tone: past ? 'gold' : 'dim', delay: OURO_AT + OURO_T * 0.8, t: 0.5 });
  // Sol's pointed rays, each hatched down one side.
  shades.push({ d: worn.rays, tone: 'gold', delay: 0.6, t: 0.3 });
  // The ground under the surface, in short slanting strokes.
  shades.push({
    d: hatchPoly(
      [
        [off + 4, surfaceY],
        [side(TOP, -1)[0] - ROCK - 1.2, surfaceY],
        [side(TOP, -1)[0] - ROCK - 1.2, surfaceY + 2.4],
        [off + 4, surfaceY + 2.4],
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

  // ---- seals, names, and the script where names are still unknown ----
  const seals: Seal[] = ZONES.map((z, k) => {
    const known = k < reached;
    const c = sealC(k);
    return { k, c, r: R, known, delay: sweep(c[1] - R), ...(known ? { name: z.name, color: z.color, sigil: z.sigil } : { hollow: hollow(c, R - 1.9, 0.85) }) };
  });
  const names = seals.filter((s) => s.known).map((s) => ({ x: nameX(s.c[1]), y: s.c[1], text: s.name!, color: s.color!, delay: s.delay + 0.3 }));

  // ---- "uncharted": the zones not reached yet, bracketed together under one quiet word, the bracket's lines stopping short of it ----
  let uncharted: Uncharted | null = null;
  if (reached < ZONES.length) {
    let y0 = TOP + reached * band + 1.5;
    // Clear of a find's leader running out along the same line, and of the star when it stands at the mouth.
    for (const c of callouts) if (Math.abs(c.y - y0) < 3) y0 = c.y + 3.5;
    if (!best) y0 = Math.max(y0, star[1] + GLORY + 2.5);
    const y1 = BOTTOM - 1.5;
    const free = (y: number) => callouts.every((c) => Math.abs(c.y - y) > 8.5);
    const mid0 = (y0 + y1) / 2;
    const mid = [0, 0.5, -0.5, 1, -1, 1.5, -1.5].map((k) => mid0 + k * band).find((m) => m > y0 + 4 && m < y1 - 4 && free(m)) ?? mid0;
    const x = rockAt(mid) - 3 - 21;
    let d = '';
    if (y1 - y0 > 26) {
      const tick = (yy: number) => line([x, yy], [rockAt(yy) - 2, yy]);
      const holes: Hole[] = [{ box: [x - 22, mid - 6.5, x + 22, mid + 6.5] }, ...callouts.map((c): Hole => ({ box: [x - 1, c.y - 2.4, x + 1, c.y + 2.4] }))];
      d = tick(y0) + tick(y1) + pen([[x, y0], [x, y1]], 'hair', 0, 1, { holes }).map((s) => s.d).join('');
    }
    uncharted = { d, x, y: mid, delay: sweep(y0) + 0.35 };
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
    scale,
    parts,
    shades,
    seals,
    sol: { c: sol, r: SOL_R },
    names,
    uncharted,
    callouts,
    star: { c: star, r: STAR_R, gloryR: GLORY, outline: st.outline, ridges: st.ridges, hatch: st.hatch, glory, delay: STAR_AT },
    ouro: {
      lit: past,
      eye: { ...snake.eye, angle: snake.eyeAngle },
      sheen: snake.sheen.map((q) => ({ d: 'M' + q.pts.map((v) => `${f(v[0])} ${f(v[1])}`).join('L'), from: q.from })),
      sheenLen: snake.sheenLen,
      sheenW: SW * 2.9,
      lines: [...snake.lines.map((l) => l.pts), ...snake.scales].map((q) => 'M' + q.map((v) => `${f(v[0])} ${f(v[1])}`).join('L')).join(''),
      loop: loopR,
      inner: snake.inner,
      delay: OURO_AT,
      done: OURO_AT + OURO_T,
    },
    notes,
    noteX,
    bestX: Math.max(noteX, star[0] + GLORY + 2.5),
    pips,
  };
}
