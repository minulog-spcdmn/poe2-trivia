// The descent as an engraved spiral (components/descent/Spiral.svelte), in
// the arcane style (docs/arcane-style.md): a track winding inward from Sol at
// the mouth, ten stretches of equal length for the ten zones with a gate
// between each, to an ouroboros at its heart, a sideways eight, for the
// strata past 100 that have no end. Pure geometry and the rules for what may
// be shown (no zone is named or coloured before it is reached); the
// component lays it out for its box and draws it.
//
// Everything is exact geometry in px (the drawing is never scaled): the
// track is an Archimedean spiral walked by its length, its edges offset from
// it, the serpent's body a lemniscate of Bernoulli walked the same way.
// Angles run clockwise from the top (lib/arcane's `at`).

import { at, seeded, type Pt } from './arcane.ts';
import { shownDepth } from './delve.ts';
import { STRATA } from './descent.ts';

export const ZONE_COUNT = 10;
export const ZONE_DEPTHS = 10;
/** The last depth of the last zone: past it the strata are generated, for ever. */
export const ZONES_END = ZONE_COUNT * ZONE_DEPTHS;

const rgb = (c: readonly number[]) => `rgb(${c.join(' ')})`;
/** The ten zones as lib/descent names and colours them, each with its first depth. */
export const SPIRAL_ZONES = STRATA.slice(0, ZONE_COUNT).map((z, k) => ({
  name: z.name,
  color: rgb(z.look.accent),
  from: k * ZONE_DEPTHS + 1,
}));

/** The deepest as a whole depth from 1, or null before a first run. */
export const bestDepth = (d: number | null | undefined): number | null => (d != null && Number.isFinite(d) && d >= 1 ? Math.floor(d) : null);

/** How many zones the deepest has reached: none before a run, the Mines from depth 1, the second zone from 11, all ten from 91. */
export function zonesReached(d: number | null | undefined): number {
  const b = bestDepth(d);
  return b === null ? 0 : Math.min(ZONE_COUNT, Math.floor((b - 1) / ZONE_DEPTHS) + 1);
}

/** The zone (0 to 9) a depth is in; 10 past the last zone; null before a run. */
export function zoneIndex(d: number | null | undefined): number | null {
  const b = bestDepth(d);
  return b === null ? null : Math.min(ZONE_COUNT, Math.floor((b - 1) / ZONE_DEPTHS));
}

export type KeyRow = {
  /** The zone's first depth (internal, from 1). */
  from: number;
  /** That depth as the key prints it (shownDepth): 0, 10, 20 ... 90. */
  shown: number;
  reached: boolean;
  name?: string;
  color?: string;
};
/** The key's rows, one a zone with its first depth: named and coloured once reached, otherwise neither (uncharted). */
export const keyRows = (d: number | null | undefined): KeyRow[] => {
  const n = zonesReached(d);
  return SPIRAL_ZONES.map((z, k) => {
    const row = { from: z.from, shown: shownDepth(z.from) };
    return k < n ? { ...row, reached: true, name: z.name, color: z.color } : { ...row, reached: false };
  });
};
/** The key's last row, the strata past the zones, by their first depth as a player reads it (100). */
export const ENDLESS_FROM = shownDepth(ZONES_END + 1);
/** The number beside the star: the deepest as a player reads it (shownDepth, so 0 at the first depth), or null before a first run. */
export const bestLabel = (d: number | null | undefined): string | null => {
  const b = bestDepth(d);
  return b === null ? null : String(shownDepth(b));
};

/**
 * Where the star stands, as a station along the descent: 0 at the mouth
 * (before a run), within (0, 1) on the track, 1 + BEYOND in the serpent (past
 * 100). Depth 10k + 1 to 10k + 10 are spread evenly over zone k's stretch,
 * `margin` (a fraction of a stretch) clear of the gates at either end, so the
 * star never sits on a gate: depth 10 stands just before the Mines' last
 * gate, 11 just past it.
 */
export const BEYOND = 0.2;
export function station(d: number | null | undefined, margin: number): number {
  const b = bestDepth(d);
  if (b === null) return 0;
  if (b > ZONES_END) return 1 + BEYOND;
  const k = Math.floor((b - 1) / ZONE_DEPTHS);
  const i = (b - 1) % ZONE_DEPTHS;
  const m = Math.min(0.45, Math.max(0, margin));
  return (k + m + (i / (ZONE_DEPTHS - 1)) * (1 - 2 * m)) / ZONE_COUNT;
}

/** How much of the serpent is lit, 0 to 1: none to 100, then by the depth's order of magnitude, all of it at 1000. */
export function serpentLit(d: number | null | undefined): number {
  const b = bestDepth(d);
  if (b === null || b <= ZONES_END) return 0;
  return Math.min(1, Math.max(0.02, Math.log10(b / ZONES_END)));
}

// ---- walking a curve by its length -------------------------------------

export type Walk = {
  pts: Pt[];
  /** Length walked to each point. */
  s: number[];
  len: number;
  /** The point, the unit tangent (the way it runs) and the unit normal to its left of it, at length `l`. */
  at: (l: number) => { p: Pt; t: Pt; n: Pt };
};

/** A curve through `pts` (closely spaced), walked by its length. */
export function walk(pts: Pt[]): Walk {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = s.at(-1)!;
  const find = (l: number) => {
    let lo = 0;
    let hi = s.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid] <= l) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  return {
    pts,
    s,
    len,
    at(l) {
      const x = Math.min(len, Math.max(0, l));
      const i = Math.min(pts.length - 2, find(x));
      const u = (x - s[i]) / (s[i + 1] - s[i] || 1);
      const [a, b] = [pts[i], pts[i + 1]];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t: Pt = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
      return {
        p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u],
        t,
        n: [t[1], -t[0]],
      };
    },
  };
}

/**
 * The track: an Archimedean spiral about `c` from radius `r0` at `a0`
 * degrees, winding clockwise inward `turns` times to `r1`. Its first
 * quarter turn sweeps in from `flare` further out (the mouth stands clear
 * of the turn inside it).
 */
export function spiral(c: Pt, r0: number, r1: number, turns: number, a0: number, flare = 0): Walk {
  const sweep = turns * 360;
  const n = Math.ceil(sweep * 2);
  const pts = Array.from({ length: n + 1 }, (_, k) => {
    const th = (sweep * k) / n;
    const lead = Math.max(0, 1 - th / 90) ** 2;
    return at(c, a0 + th, r0 - ((r0 - r1) * th) / sweep + flare * lead);
  });
  return walk(pts);
}

/** A sideways figure eight about `c`, `a` either side of it (a lemniscate of Bernoulli), from its right end round its upper right first. */
export function lemniscate(c: Pt, a: number): Walk {
  const n = 1440;
  const pts = Array.from({ length: n + 1 }, (_, k): Pt => {
    const t = (2 * Math.PI * k) / n;
    const q = 1 + Math.sin(t) ** 2;
    return [c[0] + (a * Math.cos(t)) / q, c[1] - (a * Math.sin(t) * Math.cos(t)) / q];
  });
  return walk(pts);
}

// ---- the engraver's pen ---------------------------------------------------

/** A stretch to leave out of a line, as lengths along it. */
export type Gap = [number, number];

/** What's left of [lo, hi] once the gaps are taken out (pieces shorter than `min` dropped). */
export function keep(lo: number, hi: number, gaps: Gap[], min = 0.3): Gap[] {
  let parts: Gap[] = [[lo, hi]];
  for (const [g0, g1] of gaps)
    parts = parts.flatMap(([a, b]): Gap[] =>
      g1 <= a || g0 >= b
        ? [[a, b]]
        : (
            [
              [a, g0],
              [g1, b],
            ] as Gap[]
          ).filter(([p, q]) => q - p > 1e-6),
    );
  return parts.filter(([a, b]) => b - a >= min);
}

/** Nicks of wear along a line `len` long: one every 30 px or so, 0.4 to 1 px each, from a fixed seed. */
export function nicks(seed: number, from: number, len: number): Gap[] {
  const rnd = seeded(seed);
  const n = Math.round((len / 30) * (0.5 + rnd()));
  return Array.from({ length: n }, () => {
    const t = from + (0.06 + rnd() * 0.88) * len;
    const w = 0.4 + rnd() * 0.6;
    return [t - w / 2, t + w / 2];
  });
}

export const f = (v: number) => v.toFixed(2);

/** Path data for the curve `point(l)` from `l0` to `l1`, a point every `step` px. */
export function trace(point: (l: number) => Pt, l0: number, l1: number, step = 1.5): string {
  const n = Math.max(1, Math.ceil((l1 - l0) / step));
  let d = '';
  for (let k = 0; k <= n; k++) {
    const p = point(l0 + ((l1 - l0) * k) / n);
    d += `${k ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`;
  }
  return d;
}

// ---- the plate --------------------------------------------------------------

/** A piece of a line as the pen draws it: when it reaches it and how long it takes over it (s). */
export type Stroke = { d: string; delay: number; dur: number };

/** The pen's pace along a line: quick at first, slowing to the end (as the circle's). */
const ease = (u: number) => 1 - Math.sqrt(1 - Math.min(1, Math.max(0, u)));

/**
 * A line `point(l)` for l in [l0, l1], less the gaps, as pieces the pen
 * draws in turn: it reaches length l at `t0 + ease(l / total) * T`.
 */
function pen(point: (l: number) => Pt, l0: number, l1: number, gaps: Gap[], t0: number, T: number, total: number, step = 1.5): Stroke[] {
  return keep(l0, l1, gaps).map(([a, b]) => {
    const [ta, tb] = [t0 + ease(a / total) * T, t0 + ease(b / total) * T];
    return {
      d: trace(point, a, b, step),
      delay: ta,
      dur: Math.max(0.04, tb - ta),
    };
  });
}

export type ZoneArt = {
  k: number;
  /** The track's two edges (outer, inner), worn, broken at the gates. */
  edges: Stroke[];
  /** The same, whole, for the glow under them. */
  glow: string;
  /** A fine line in the track's bed by its inner edge, shading the cut (shown once reached). */
  bed: string;
  /** The gate where the zone begins (none for the first: Sol stands there). */
  gate: string;
  /** When the pen reaches the zone (s). */
  at: number;
};

export type Layout = {
  w: number;
  h: number;
  /** Beside the notes (a band across a wide card), or over them. */
  band: boolean;
  /** The spiral's square, from the left. */
  size: number;
  c: Pt;
  hw: number;
  pitch: number;
  track: Walk;
  zones: ZoneArt[];
  sol: { c: Pt; r: number; rays: string };
  end: string;
  serpent: Serpent;
  key: { x: number; y: number; pitch: number; w: number };
  /** The star's radius, its glory's, and the hole lines stop short at. */
  star: { r: number; glory: number; hole: number };
  /** Fraction of a zone's stretch the star keeps clear of its gates. */
  margin: number;
  /** When the pen reaches the end of the track (s). */
  trackDone: number;
};

/** The key's column and its rows' pitch. */
export const KEY_W = 115;
export const KEY_PITCH = 12.5;
const GAP = 8;
/** The track's turns, and its innermost radius as a share of the square (room for the serpent). */
const TURNS = 2;
const HEART = 0.285;
/** The key's height: ten rows, then the line for past 100. */
export const KEY_H = KEY_PITCH * (ZONE_COUNT + 1) + 4;

/** The drawing for a box `w` wide: the spiral in a square at the left, the key beside it. */
export function layout(w: number): Layout {
  const band = w >= 400;
  const size = Math.round(band ? 176 : Math.max(150, Math.min(176, w - KEY_W - GAP)));
  const sw = band ? size + GAP + KEY_W + 6 : w;
  const h = Math.max(size, KEY_H + 8);
  const c: Pt = [size / 2, h / 2];
  const hw = 1.6;
  const turns = TURNS;
  // The star's size; the outer turn keeps its glory inside the plate.
  const star = { r: Math.min(5.2, size * 0.028), glory: 0, hole: 0 };
  star.glory = star.r * 1.85;
  star.hole = star.glory + 1.2;
  // The mouth's flare is still a quarter of itself at the top (45 degrees on), so the outer turn makes room for that too.
  const flare = Math.min(10, size * 0.065);
  const r0 = size / 2 - Math.max(8.5, star.glory + 1.5) - flare * 0.25;
  const r1 = size * HEART;
  const pitch = (r0 - r1) / turns;
  // The mouth at the upper left corner, where the plate has room for Sol beyond the outer turn.
  const a0 = 315;
  const track = spiral(c, r0, r1, turns, a0, flare);
  const L = track.len;
  const Z = L / ZONE_COUNT;
  const T0 = 0.12;
  const T = 1.35;
  const point =
    (off: number) =>
    (l: number): Pt => {
      const { p, n } = track.at(l);
      return [p[0] + n[0] * off, p[1] + n[1] * off];
    };
  // Sol at the mouth: a ring, a point and eight rays, long and short in turn; the track begins clear of them.
  const solR = 2.6;
  const sol = {
    c: track.pts[0],
    r: solR,
    rays: Array.from({ length: 8 }, (_, k) => {
      const [p, q] = [at(track.pts[0], k * 45, solR + 1.3), at(track.pts[0], k * 45, k % 2 ? solR + 3 : solR + 4.4)];
      return `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`;
    }).join(''),
  };
  const START = solR + 5.6;
  // Gates: two bars across the track, the edges stopping short of them.
  const BAR = 0.75;
  const gateAt = (l: number) =>
    [-BAR, BAR]
      .map((dl) => {
        const { p, n, t } = track.at(l);
        const o: Pt = [p[0] + t[0] * dl, p[1] + t[1] * dl];
        const e = hw + 1.7;
        return `M${f(o[0] + n[0] * e)} ${f(o[1] + n[1] * e)}L${f(o[0] - n[0] * e)} ${f(o[1] - n[1] * e)}`;
      })
      .join('');
  const gaps: Gap[] = [[-1, START]];
  for (let k = 1; k <= ZONE_COUNT; k++) gaps.push([k * Z - BAR - 1.1, k * Z + BAR + 1.1]);
  const zones: ZoneArt[] = SPIRAL_ZONES.map((_, k) => {
    const [l0, l1] = [k * Z, (k + 1) * Z];
    const edges = [
      ...pen(point(hw), l0, l1, [...gaps, ...nicks(101 + k, l0, Z)], T0, T, L),
      ...pen(point(-hw), l0, l1, [...gaps, ...nicks(211 + k, l0, Z)], T0 + 0.03, T, L),
    ];
    const glow = [hw, -hw]
      .map((o) =>
        keep(l0, l1, gaps)
          .map(([a, b]) => trace(point(o), a, b, 2))
          .join(''),
      )
      .join('');
    // The bed: one fine line along the track just inside its inner edge (the side the ramp falls away from the
    // light), shading the cut like an engraver's channel; lines along it, never across it, so it can't read as a scale.
    const bed = keep(l0, l1, gaps)
      .map(([a, b]) => trace(point(-hw + 0.72), a + 0.6, b - 0.6, 1.5))
      .join('');
    return {
      k,
      edges,
      glow,
      bed,
      gate: k ? gateAt(l0) : '',
      at: T0 + ease(l0 / L) * T,
    };
  });
  const end = gateAt(L);
  const trackDone = T0 + T;

  // The heart: the widest sideways eight that keeps clear of the innermost turn.
  const inner = track.pts.filter((_, i) => i % 3 === 0 && i > track.pts.length * 0.25);
  const clear = (a: number) => {
    const body = a * 0.088;
    const eight = lemniscate(c, a);
    return eight.pts.every((p, i) => i % 6 !== 0 || inner.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > hw + body * 1.3 + 3.2));
  };
  let a8 = r1;
  while (a8 > 10 && !clear(a8)) a8 -= 0.5;
  const serpent = ouroboros(c, a8, a8 * 0.088, trackDone + 0.05);

  const keyX = size + (band ? GAP : Math.max(GAP, (sw - size - KEY_W) / 2));
  return {
    w: sw,
    h,
    band,
    size,
    c,
    hw,
    pitch,
    track,
    zones,
    sol,
    end,
    serpent,
    key: { x: keyX, y: (h - KEY_H) / 2, pitch: KEY_PITCH, w: KEY_W },
    star,
    margin: (star.hole + 2.6) / Z,
    trackDone,
  };
}

// ---- the ouroboros ------------------------------------------------------------

export type Serpent = {
  c: Pt;
  a: number;
  /** The body's edges (head included), worn, the strand beneath broken at the crossing. */
  edges: Stroke[];
  glow: string;
  /** Scales in two rows down the body; the row on the side away from the light hatched. */
  scales: string;
  /** The head's details: lips, jaw, brow, eye. */
  head: string;
  /** The eye's pupil. */
  pupil: Pt;
  /** The body's middle from the head back to the tail, for lighting it from the head. */
  spine: string;
  /** The holes in the eight's two loops, where a star may stand. */
  loops: [Pt, Pt];
  /** How far the loops' holes reach (above and below their middles). */
  loopR: number;
  /** The eight's half height, body included. */
  half: number;
};

/** The light falls from the upper left, as on the cards. */
const LIGHT: Pt = [-Math.SQRT1_2, -Math.SQRT1_2];

/**
 * An ouroboros on a sideways eight about `c`, `a` either side, its body up
 * to `wmax` either side of its middle, swelling from the tail. It bites its
 * tail at the top of the right loop, heading for the crossing; where the
 * body crosses itself, the tail's stretch passes beneath.
 */
export function ouroboros(c: Pt, a: number, wmax: number, delay: number): Serpent {
  const W8 = lemniscate(c, a);
  const L8 = W8.len;
  const X = 0.105 * L8;
  const IN = Math.max(3, wmax * 1.5);
  const HEAD = wmax * 4.2;
  const T0 = X - IN;
  const END = L8 + IN;
  const NECK = END - HEAD;
  const loopAt = (s: number) => (((T0 + s) % L8) + L8) % L8;
  const at8 = (s: number) => W8.at(loopAt(s));
  const tailW = (s: number) => 0.4 + (wmax - 0.4) * Math.sin((Math.min(1, s / (0.6 * L8)) * Math.PI) / 2);
  /** The body's half width: swelling from the tail, a little narrower at the neck (the head is drawn on its own). */
  const hw = (s: number) => {
    if (s < NECK - 10) return tailW(s);
    return tailW(Math.min(s, NECK)) * (1 - 0.16 * Math.sin(((Math.min(10, s - (NECK - 10)) / 10) * Math.PI) / 2));
  };
  const edge =
    (side: number) =>
    (s: number): Pt => {
      const { p, n } = at8(s);
      const w = hw(s);
      return [p[0] + n[0] * side * w, p[1] + n[1] * side * w];
    };
  // The crossing: the loop passes the centre at a quarter and three quarters round.
  const sigmaOf = (loop: number) => (((loop - T0) % L8) + L8) % L8;
  const [sA, sB] = [sigmaOf(0.25 * L8), sigmaOf(0.75 * L8)].sort((x, y) => x - y);
  // The tail's stretch (the lesser) goes beneath.
  const sUnder = sA;
  const sOver = sB;
  const overPts = Array.from({ length: 41 }, (_, i) => at8(sOver - 16 + (32 * i) / 40).p);
  const beneath = (p: Pt) => overPts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < hw(sOver) + 1);
  /** Gaps in a line `point(s)` near the crossing, where it runs beneath. */
  const underGaps = (point: (s: number) => Pt): Gap[] => {
    const out: Gap[] = [];
    let open: number | null = null;
    for (let s = sUnder - 16; s <= sUnder + 16; s += 0.2) {
      const b = beneath(point(s));
      if (b && open === null) open = s;
      if (!b && open !== null) {
        out.push([open, s]);
        open = null;
      }
    }
    if (open !== null) out.push([open, sUnder + 16]);
    return out;
  };
  const T = 0.8;
  const edges: Stroke[] = [];
  let glow = '';
  for (const side of [1, -1]) {
    const pt = edge(side);
    const g = underGaps(pt);
    edges.push(...pen(pt, IN + 0.6, NECK, [...g, ...nicks(side > 0 ? 419 : 523, IN, L8)], delay, T, END, 0.8));
    glow += keep(IN + 0.6, NECK, g)
      .map(([x, y]) => trace(pt, x, y, 1.2))
      .join('');
  }
  // Scales: two rows down the body, in brick bond, each an arc bulging toward the head; the row away from the light carries a hatch stroke.
  let scales = '';
  const STEP = Math.max(1.9, wmax * 0.68);
  for (const row of [1, -1]) {
    for (let s = IN + 14 + (row > 0 ? 0 : STEP / 2); s < NECK - 1.5; s += STEP) {
      const w = hw(s);
      if (w < 1.25) continue;
      const { p, t, n } = at8(s);
      const off = row * w * 0.48;
      const r = w * 0.4;
      const o: Pt = [p[0] + n[0] * off, p[1] + n[1] * off];
      if (Math.abs(s - sUnder) < 12 && beneath(o)) continue;
      const arcPts: Pt[] = Array.from({ length: 7 }, (_, i) => {
        const th = -Math.PI / 2 + (Math.PI * i) / 6;
        return [
          o[0] - t[0] * r * 0.55 + (t[0] * Math.cos(th) + n[0] * Math.sin(th)) * r,
          o[1] - t[1] * r * 0.55 + (t[1] * Math.cos(th) + n[1] * Math.sin(th)) * r,
        ];
      });
      if (arcPts.some((q) => Math.abs(s - sUnder) < 14 && beneath(q))) continue;
      scales += 'M' + arcPts.map((q) => `${f(q[0])} ${f(q[1])}`).join('L');
      const shade = n[0] * row * LIGHT[0] + n[1] * row * LIGHT[1] < -0.15;
      if (shade) {
        const [h0, h1]: Pt[] = [
          [o[0] + n[0] * row * r * 0.35 - t[0] * r * 0.5, o[1] + n[1] * row * r * 0.35 - t[1] * r * 0.5],
          [o[0] + n[0] * row * r * 0.35 + t[0] * r * 0.25, o[1] + n[1] * row * r * 0.35 + t[1] * r * 0.25],
        ];
        scales += `M${f(h0[0])} ${f(h0[1])}L${f(h1[0])} ${f(h1[1])}`;
      }
    }
  }
  // The head, seen from the side (its upper side is the one facing up the page), from the neck to a blunt snout:
  // the crown rising over the eye, the jaw beneath, the snout's front closing on the tail in its mouth.
  const up = at8(NECK + HEAD * 0.45).n[1] < 0 ? 1 : -1;
  const hp = (u: number, v: number): Pt => {
    const { p, n } = at8(NECK + u);
    return [p[0] + n[0] * up * v, p[1] + n[1] * up * v];
  };
  const nw = tailW(NECK) * 0.84;
  const ease3 = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
  const profile = (side: number) => (u: number) => {
    const [top, at, front] = side > 0 ? [1.28, 0.42, 1.0] : [1.12, 0.32, 0.78];
    const x = u / HEAD;
    return wmax * (x < at ? nw / wmax + (top - nw / wmax) * ease3(x / at) : top + (front - top) * ease3((x - at) / (0.82 - at)));
  };
  const lipV = tailW(IN) + 0.4;
  const FRONT = HEAD * 0.82;
  const outline = (side: number): Pt[] => {
    const pr = profile(side);
    const pts: Pt[] = [];
    for (let u = 0; u <= FRONT; u += 0.5) pts.push(hp(u, side * pr(u)));
    const [rx, ry] = [HEAD - FRONT, pr(FRONT) - lipV];
    for (let k = 1; k <= 10; k++) {
      const ph = (Math.PI / 2) * (1 - k / 10);
      pts.push(hp(FRONT + rx * Math.cos(ph), side * (lipV + ry * Math.sin(ph))));
    }
    return pts;
  };
  const poly = (pts: Pt[]) => 'M' + pts.map((q) => `${f(q[0])} ${f(q[1])}`).join('L');
  const tHead = delay + T * ease(NECK / END);
  for (const side of [1, -1]) edges.push({ d: poly(outline(side)), delay: tHead, dur: 0.22 });
  glow += poly(outline(1)) + poly(outline(-1));
  // The lips, from the snout back to the corner of the mouth (behind the tail's tip), and the jaw line on from it.
  const corner = HEAD - IN - 1.1;
  const lipPts = (side: number) =>
    Array.from({ length: 9 }, (_, k) => {
      const x = k / 8;
      return hp(HEAD - (HEAD - corner) * x, side * lipV * (1 - x) - 0.1 * wmax * x);
    });
  let head = poly(lipPts(1)) + poly(lipPts(-1));
  head += poly(
    Array.from({ length: 9 }, (_, k) => {
      const x = k / 8;
      return hp(corner - HEAD * 0.3 * x, -wmax * (0.1 + 0.42 * Math.sin((x * Math.PI) / 2)));
    }),
  );
  // The eye: a small almond high on the head, a brow arched over it.
  const EU = HEAD * 0.5;
  const EV = wmax * 0.48;
  const EL = Math.max(1.2, HEAD * 0.11);
  const lid = (sgn: number) =>
    poly(
      Array.from({ length: 9 }, (_, i) => {
        const x = -1 + (2 * i) / 8;
        return hp(EU + x * EL, EV + sgn * EL * 0.45 * (1 - x * x));
      }),
    );
  head += lid(1) + lid(-1);
  head += poly(
    Array.from({ length: 11 }, (_, i) => {
      const x = -1.25 + (2.4 * i) / 10;
      return hp(EU + x * EL, EV + EL * 0.75 + EL * 0.3 * Math.cos((x * Math.PI) / 2.6));
    }),
  );
  // Shade along the jaw, the side away from the light: strokes in from the lower outline.
  const low = profile(-1);
  for (let u = HEAD * 0.08; u < corner - HEAD * 0.12; u += 0.85) head += poly([hp(u, -low(u) + 0.45), hp(u, -low(u) * 0.55)]);
  const eyeC = hp(EU, EV);
  // The spine, from the snout back to the tail, for the light that runs down it.
  const spine = trace((s) => at8(END - s).p, 0, END - IN, 1.5);
  // The loops' holes: halfway between the crossing and each end, on the axis.
  const loops: [Pt, Pt] = [
    [c[0] - a * 0.56, c[1]],
    [c[0] + a * 0.56, c[1]],
  ];
  return {
    c,
    a,
    edges,
    glow,
    scales,
    head,
    pupil: eyeC,
    spine,
    loops,
    loopR: a * 0.354 - wmax - 0.8,
    half: a * 0.354 + wmax * 1.4,
  };
}

// ---- the star ---------------------------------------------------------------

/** Where the star stands at station `q` (see `station`): on the track, or past its end in the serpent's nearer loop. */
export function starPoint(L: Layout, q: number): Pt {
  if (q <= 1) return L.track.at(q * L.track.len).p;
  const end = L.track.at(L.track.len).p;
  const loop = loopFor(L);
  const u = Math.min(1, (q - 1) / BEYOND);
  const e = u * u * (3 - 2 * u);
  return [end[0] + (loop[0] - end[0]) * e, end[1] + (loop[1] - end[1]) * e];
}

/** The serpent's loop the track ends nearer to: the star's place past 100. */
export const loopFor = (L: Layout): Pt => {
  const end = L.track.at(L.track.len).p;
  const [l, r] = L.serpent.loops;
  return Math.hypot(end[0] - l[0], end[1] - l[1]) < Math.hypot(end[0] - r[0], end[1] - r[1]) ? l : r;
};

/** A box: left, top, width, height. */
export type Box = [number, number, number, number];

/**
 * Where the star's depth goes, a `w` by `h` box beside the star at `p`:
 * of the places round its glory (16 directions, a few distances), the one
 * that cuts least of the track (lines stop short of it) while staying close,
 * never over a gate, Sol, the serpent, the key or the edge, and always nearer
 * the star than Sol (so it can't be read as Sol's). `prev` (the last
 * direction) is kept unless another is clearly better, so the number doesn't
 * flit about as the star walks.
 */
export function labelSpot(L: Layout, p: Pt, w: number, h: number, prev: number | null): { box: Box; i: number } {
  const inBox = (b: Box, q: Pt, pad: number) => q[0] > b[0] - pad && q[0] < b[0] + b[2] + pad && q[1] > b[1] - pad && q[1] < b[1] + b[3] + pad;
  const track = L.track.pts.filter((_, i) => i % 3 === 0);
  const Z = L.track.len / ZONE_COUNT;
  const gates = Array.from({ length: ZONE_COUNT }, (_, k) => L.track.at((k + 1) * Z).p);
  const s = L.serpent;
  const N = 16;
  let best: { box: Box; i: number; cost: number } | null = null;
  for (const extra of [0, 2, 4, 7, 11, 16]) {
    for (let i = 0; i < N; i++) {
      const a = (i * 2 * Math.PI) / N;
      const d: Pt = [Math.cos(a), Math.sin(a)];
      // Out along d until the box's nearest point is clear of the glory (and `extra` beyond).
      const clear = L.star.glory + 2 + extra;
      let reach = 0;
      while (Math.hypot(Math.max(0, Math.abs(d[0] * reach) - w / 2), Math.max(0, Math.abs(d[1] * reach) - h / 2)) < clear) reach += 0.25;
      const cx = p[0] + d[0] * reach;
      const cy = p[1] + d[1] * reach;
      const box: Box = [cx - w / 2, cy - h / 2, w, h];
      if (box[0] < 1 || box[1] < 1 || box[0] + w > L.key.x - 6 || box[1] + h > L.h - 1) continue;
      if (gates.some((g) => inBox(box, g, L.hw + 2.5))) continue;
      if (inBox(box, L.sol.c, L.sol.r + 6)) continue;
      if (Math.hypot(cx - L.sol.c[0], cy - L.sol.c[1]) < Math.hypot(cx - p[0], cy - p[1]) + 6) continue;
      if (Math.abs(cx - s.c[0]) < s.a + w / 2 + 2 && Math.abs(cy - s.c[1]) < s.half + h / 2 + 2) continue;
      let cost = track.filter((q) => inBox(box, q, L.hw + 1)).length * 0.6;
      // Level with the star reads best; then the diagonals; straight above or below last.
      const level = Math.abs(d[0]);
      cost += (1 - level) * 1.6;
      cost += extra * 0.45;
      if (prev !== null && i !== prev) cost += 2.5;
      if (!best || cost < best.cost) best = { box, i, cost };
    }
  }
  return best ?? { box: [p[0] + L.star.glory + 2, p[1] - h / 2, w, h], i: 0 };
}
