// The descent as a shaft (components/descent/Shaft.svelte): a slim shaft
// sunk from the surface through the ten zones, a band of rock each, to an
// ouroboros knotted in a sideways figure eight, for no end past 100. Drawn
// in the arcane style (docs/arcane-style.md): fine exact lines that stop
// short of every word and of each other, one-sided hatching, a few nicks of
// wear, and a soft glow under the lines (the component draws that).
//
// Everything is in px, laid out for the box the drawing is given: the
// zones share what height is left once the surface and the ouroboros have
// theirs; names to the left of the shaft, notes to the right. Nothing here
// depends on the deepest depth except what says so (starAt, reachedOf,
// serpentLight), so a new deepest moves the star and nothing is drawn again.

import { at, seeded, type Cut, type Pt } from "./arcane.ts";
import { STRATA } from "./descent.ts";

export const f = (v: number) => v.toFixed(2);
const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const lerp = (p: Pt, q: Pt, t: number): Pt => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
];
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

const rgb = (c: readonly number[]) => `rgb(${c.join(" ")})`;
/** The ten zones, depths 1-10, 11-20 … 91-100, as lib/descent names and colours them. */
export const ZONES = STRATA.slice(0, 10).map((z, k) => ({
  name: z.name,
  color: rgb(z.look.accent),
  from: 10 * k + 1,
}));
export const LAST = ZONES.length * 10;

/** A best run as a whole depth from 1, or null (no run yet). */
export const bestOf = (deepest: number | null | undefined) =>
  deepest && Number.isFinite(deepest) && deepest >= 1
    ? Math.floor(deepest)
    : null;
/** How many zones a best run of `deepest` has reached (a zone is reached at its first depth). */
export const reachedOf = (deepest: number | null | undefined) => {
  const best = bestOf(deepest);
  return best === null
    ? 0
    : Math.min(ZONES.length, Math.floor((best - 1) / 10) + 1);
};
/** The zone (0-9) a depth is in, or ZONES.length past 100. */
export const zoneOf = (depth: number) =>
  Math.min(ZONES.length, Math.floor((depth - 1) / 10));
/** What the drawing may say of each zone: its name and colour once reached, nothing before (no spoilers). */
export const zoneLabels = (deepest: number | null | undefined) => {
  const reached = reachedOf(deepest);
  return ZONES.map((z, k) =>
    k < reached ? { name: z.name, color: z.color } : null,
  );
};

/**
 * How much of the ouroboros is lit: none until a run has gone past 100, then
 * a tenth, spreading from under the star round both loops as the depth
 * grows, nearly all of it by 1000 (so 134 and 999 differ).
 */
export const serpentLight = (deepest: number | null | undefined) => {
  const best = bestOf(deepest);
  return best === null || best <= LAST
    ? 0
    : 0.12 + 0.86 * (1 - Math.exp(-(best - LAST) / 320));
};

// ------------------------------------------------------------------ the engraver

/** A piece of a line and where it runs along the whole (0 to 1), for drawing it in one sweep of the pen. */
export type Piece = { d: string; from: number; to: number };
/** What lines stop short of: a circle, or a box (x0, y0, x1, y1). */
export type Hole =
  | { c: Pt; r: number }
  | { box: [number, number, number, number] };

/** Where the segment from `p` to `q` runs inside a hole, as a cut in [0, 1]. */
function inside(p: Pt, q: Pt, h: Hole): Cut | null {
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  if ("c" in h) {
    const [fx, fy] = [p[0] - h.c[0], p[1] - h.c[1]];
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const disc = b * b - 4 * a * (fx * fx + fy * fy - h.r * h.r);
    return disc > 0 && a > 0
      ? [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)]
      : null;
  }
  // Slab clipping against the box.
  let [t0, t1] = [-Infinity, Infinity];
  for (const [o, d, lo, hi] of [
    [p[0], dx, h.box[0], h.box[2]],
    [p[1], dy, h.box[1], h.box[3]],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (o <= lo || o >= hi) return null;
      continue;
    }
    const [a, b] = [(lo - o) / d, (hi - o) / d].sort((x, y) => x - y);
    [t0, t1] = [Math.max(t0, a), Math.min(t1, b)];
  }
  return t0 < t1 ? [t0, t1] : null;
}

/** What's left of [lo, hi] once the `cuts` are taken out. */
function subtract(lo: number, hi: number, cuts: Cut[]): Cut[] {
  let parts: Cut[] = [[lo, hi]];
  for (const [c0, c1] of cuts)
    parts = parts.flatMap(([a, b]): Cut[] =>
      c1 <= a || c0 >= b
        ? [[a, b]]
        : (
            [
              [a, c0],
              [c1, b],
            ] as Cut[]
          ).filter(([p, q]) => q - p > 1e-3),
    );
  return parts;
}

/**
 * The plate's wear: a nick of 0.5 to 1 px every 60 px or so, from a fixed
 * seed, as cuts in [0, 1] of a line `len` long. Null: whole (for the glow).
 */
type Wear = ((len: number) => Cut[]) | null;
const wearOf = (seed: number): Wear => {
  const rnd = seeded(seed);
  return (len) =>
    Array.from({ length: Math.round((len / 60) * (0.5 + rnd())) }, () => {
      const t = 0.08 + rnd() * 0.84;
      const w = (0.5 + rnd() * 0.5) / len;
      return [t - w / 2, t + w / 2];
    });
};

/** A polyline as pieces, broken where it meets a hole and where it is worn, each piece placed along the whole. */
function pieces(ps: Pt[], holes: Hole[] = [], wear: Wear = null): Piece[] {
  const lens = [0];
  for (let i = 1; i < ps.length; i++)
    lens.push(lens[i - 1] + dist(ps[i - 1], ps[i]));
  const L = lens.at(-1)!;
  if (L <= 0) return [];
  const cuts: Cut[] = wear ? wear(L) : [];
  for (let i = 1; i < ps.length; i++) {
    const seg = lens[i] - lens[i - 1];
    if (seg <= 0) continue;
    for (const h of holes) {
      const c = inside(ps[i - 1], ps[i], h);
      if (c && c[1] > 0 && c[0] < 1)
        cuts.push([
          (lens[i - 1] + Math.max(0, c[0]) * seg) / L,
          (lens[i - 1] + Math.min(1, c[1]) * seg) / L,
        ]);
    }
  }
  const pointAt = (u: number): Pt => {
    const s = u * L;
    let i = 1;
    while (i < ps.length - 1 && lens[i] < s) i++;
    const seg = lens[i] - lens[i - 1] || 1;
    return lerp(ps[i - 1], ps[i], clamp((s - lens[i - 1]) / seg, 0, 1));
  };
  return subtract(0, 1, cuts).map(([u0, u1]) => {
    const out: Pt[] = [pointAt(u0)];
    for (let i = 1; i < ps.length - 1; i++)
      if (lens[i] > u0 * L && lens[i] < u1 * L) out.push(ps[i]);
    out.push(pointAt(u1));
    return { d: "M" + out.map(pt).join("L"), from: u0, to: u1 };
  });
}
const joined = (ps: Piece[]) => ps.map((p) => p.d).join("");
/** A straight line, broken at holes. */
const seg = (p: Pt, q: Pt, holes: Hole[] = []) => joined(pieces([p, q], holes));

/** One-sided hatching across the box, falling to the left at 45°, `gap` apart, kept `pad` inside its edges. */
function hatchBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  gap: number,
  pad = 0.6,
): string {
  [x0, y0, x1, y1] = [x0 + pad, y0 + pad, x1 - pad, y1 - pad];
  if (x1 <= x0 || y1 <= y0) return "";
  const step = gap * Math.SQRT2;
  let d = "";
  for (let s = x0 + y0 + step / 2; s < x1 + y1; s += step) {
    // The line x + y = s, clipped to the box.
    const ax = Math.max(x0, s - y1);
    const bx = Math.min(x1, s - y0);
    if (bx - ax > 0.35) d += `M${f(ax)} ${f(s - ax)}L${f(bx)} ${f(s - bx)}`;
  }
  return d;
}

/** Is `p` inside the polygon `ps`? */
function inPoly(p: Pt, ps: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [a, b] = [ps[i], ps[j]];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      c = !c;
  }
  return c;
}
/** Runs of `ps` outside every hiding place, each a polyline. */
function visibleRuns(ps: Pt[], hidden: (p: Pt, i: number) => boolean): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  ps.forEach((p, i) => {
    if (hidden(p, i)) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    } else cur.push(p);
  });
  if (cur.length > 1) out.push(cur);
  return out;
}
const poly = (ps: Pt[]) => (ps.length > 1 ? "M" + ps.map(pt).join("L") : "");

// ------------------------------------------------------------------ the ouroboros

export type Serpent = {
  /** The body's two edges and the head's outline, as pieces along the body from the tail (for the pen). */
  outline: Piece[];
  /** Scales down the back, plates across the belly (its shaded side), the head's lesser lines. */
  scales: string;
  belly: string;
  head: string;
  eye: Pt;
  eyeR: number;
  /** The slit in the eye. */
  pupil: string;
  /** The spine from each crossing out round each loop, half a loop each, for the light to spread along. */
  light: string[];
  /** Its extent. */
  box: [number, number, number, number];
  /** Every edge point, for what must stand clear of the body. */
  edge: Pt[];
  /** Where the two passes cross. */
  crossing: Pt;
};

/**
 * The ouroboros knotted in a figure eight lying on its side: its spine a
 * lemniscate of Bernoulli about `c`, `a` from the crossing to each loop's
 * end, its loops `ky` times as tall as the curve's own. The body swells
 * from the tail's tip to `wmax` either side of the spine, narrowing a
 * little at the neck; its back (the outer side at the head) is set with
 * staggered scales, its belly with plates across it, which shade it down
 * that one side. The head lies along the top of the right loop, heading out
 * to its end, the tail's tip in its open jaws: brow, eye with a slit,
 * nostril, the lower jaw hatched. At the crossing the pass toward the head
 * goes over and the other under it, cut clear.
 */
export function ouroboros(
  c: Pt,
  a: number,
  ky: number,
  wmax: number,
  wear: Wear = null,
): Serpent {
  const T = (t: number): Pt => {
    const [s, co] = [Math.sin(t), Math.cos(t)];
    const d = 1 + s * s;
    return [c[0] + (a * co) / d, c[1] + (ky * a * s * co) / d];
  };
  const N = 2400;
  const ts = Array.from({ length: N + 1 }, (_, i) => (2 * Math.PI * i) / N);
  const pts = ts.map(T);
  const len = [0];
  for (let i = 1; i <= N; i++) len.push(len[i - 1] + dist(pts[i - 1], pts[i]));
  const S = len[N];
  const spine = (s: number): Pt => {
    s = ((s % S) + S) % S;
    let [lo, hi] = [0, N];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (len[m] <= s) lo = m;
      else hi = m;
    }
    return lerp(pts[lo], pts[hi], (s - len[lo]) / (len[hi] - len[lo] || 1));
  };
  const tangent = (s: number): Pt => {
    const [p, q] = [spine(s - 0.25), spine(s + 0.25)];
    const L = dist(p, q) || 1;
    return [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
  };
  /** The point `v` off the spine at curve position `s`: toward the back for v > 0. */
  const B = (s: number, v: number): Pt => {
    const [p, u] = [spine(s), tangent(s)];
    return [p[0] + u[1] * v, p[1] - u[0] * v];
  };
  const sOfT = (t: number) => len[Math.round((t / (2 * Math.PI)) * N)];

  // The head along the top of the right loop, the snout short of its end; the tail's tip inside the mouth.
  const Lh = wmax * 4.1;
  const snout = sOfT(2 * Math.PI * 0.935);
  const neck = snout - Lh;
  const tip = snout - Lh * 0.36;
  const bodyLen = neck - tip + S;
  const along = (s: number) => tip + s;
  /** Half width at `s` along the body from the tail's tip. */
  const hw = (s: number) => {
    const u = s / bodyLen;
    return (
      wmax *
      (0.2 + 0.8 * smooth(0, 0.62, u) ** 0.75) *
      (1 - 0.13 * smooth(0.88, 1, u))
    );
  };
  const wn = hw(bodyLen);
  const tw = hw(Lh * 0.5) / wn;

  // The passes over the crossing: the one nearer the head on top.
  const cross = [sOfT(Math.PI / 2), sOfT((3 * Math.PI) / 2)]
    .map((x) => (((x - tip) % S) + S) % S)
    .sort((p, q) => p - q);
  const [sUnder, sOver] = cross;
  const overPoly: Pt[] = [];
  const reach = wmax * 4.5;
  for (let s = sOver - reach; s <= sOver + reach; s += 0.4)
    overPoly.push(B(along(s), hw(s) + 0.85));
  for (let s = sOver + reach; s >= sOver - reach; s -= 0.4)
    overPoly.push(B(along(s), -hw(s) - 0.85));

  // The head in profile: x along the spine from the neck (0) to the snout (1), y off it in neck widths (+ the back).
  const H = (x: number, y: number) => B(neck + x * Lh, y * wn);
  const keys = (ks: [number, number][]) => (x: number) => {
    let i = 0;
    while (i < ks.length - 2 && x > ks[i + 1][0]) i++;
    const [[x0, y0], [x1, y1]] = [ks[i], ks[i + 1]];
    const u = clamp((x - x0) / (x1 - x0), 0, 1);
    return y0 + (y1 - y0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
  };
  // Broader than the neck: swelling behind the jaws, the crown highest over the eye, down to a blunt snout.
  const top = keys([
    [0, 1],
    [0.25, 1.5],
    [0.58, 1.42],
    [0.86, 1.0],
    [1, 0.66],
  ]);
  const bottom = keys([
    [0, -1],
    [0.3, -1.42],
    [0.66, -1.2],
    [0.92, -tw - 0.75],
  ]);
  const XC = 0.52; // the corner of the mouth
  const lipU = (x: number) => 0.06 + ((tw + 0.16 - 0.06) * (x - XC)) / (1 - XC);
  const lipL = (x: number) =>
    -0.06 - ((tw + 0.22 - 0.06) * (x - XC)) / (0.92 - XC);
  const xs = (x0: number, x1: number, n = 24) =>
    Array.from({ length: n + 1 }, (_, i) => x0 + ((x1 - x0) * i) / n);
  /** A blunt end rounded forward as a half ellipse, from `y0` to `y1` at `x`, `bulge` (in lengths) ahead. */
  const nose = (x: number, y0: number, y1: number, bulge: number) =>
    Array.from({ length: 11 }, (_, i) => {
      const q = (Math.PI * i) / 10;
      return [
        x + bulge * Math.sin(q),
        y0 + (y1 - y0) * (0.5 - 0.5 * Math.cos(q)),
      ] as [number, number];
    });
  const upper: [number, number][] = [
    ...xs(0, 1).map((x) => [x, top(x)] as [number, number]),
    ...nose(1, top(1), lipU(1), (0.4 * wn) / Lh).slice(1),
    ...xs(1, XC, 14).map((x) => [x, lipU(x)] as [number, number]),
  ];
  const lower: [number, number][] = [
    ...xs(XC, 0.92, 14).map((x) => [x, lipL(x)] as [number, number]),
    ...nose(0.92, lipL(0.92), bottom(0.92), (0.28 * wn) / Lh).slice(1),
    ...xs(0.92, 0).map((x) => [x, bottom(x)] as [number, number]),
  ];
  const jawU = upper.map(([x, y]) => H(x, y));
  const jawL = lower.map(([x, y]) => H(x, y));
  const headPoly = [...jawU, ...jawL];
  // Behind the corner of the mouth the head is solid: the tail stops at it.
  const throat = [
    H(0, 1.1),
    H(XC, 0.05),
    H(XC, -0.05),
    H(0, -1.1),
    H(-0.2, -1.1),
    H(-0.2, 1.1),
  ];
  const inHead = (p: Pt) => inPoly(p, headPoly) || inPoly(p, throat);

  /** Is a point of the body at `s` hidden: under the pass on top, or in the head? */
  const hidden = (s: number, p: Pt) =>
    (Math.abs(s - sUnder) < reach + wmax && inPoly(p, overPoly)) ||
    ((s < Lh || s > bodyLen - 1) && inHead(p));

  // The body's edges, each a run of points from the tail to the neck, cut where hidden.
  const outline: Piece[] = [];
  const edge: Pt[] = [];
  const STEP = 0.35;
  const sideRuns = [1, -1].map((sg) => {
    const ss = Array.from(
      { length: Math.floor(bodyLen / STEP) + 1 },
      (_, i) => i * STEP,
    );
    const ps = ss.map((s) => B(along(s), sg * hw(s)));
    edge.push(...ps);
    return visibleRuns(ps, (p, i) => hidden(ss[i], p)).map((run) => {
      const i0 = ps.indexOf(run[0]);
      return {
        run,
        from: ss[i0] / bodyLen,
        to: ss[i0 + run.length - 1] / bodyLen,
      };
    });
  });
  const pushRun = (run: Pt[], from: number, to: number) => {
    for (const p of pieces(run, [], wear))
      outline.push({
        d: p.d,
        from: from + (to - from) * p.from,
        to: from + (to - from) * p.to,
      });
  };
  for (const side of sideRuns)
    for (const r of side) pushRun(r.run, r.from, r.to);
  // The tail's tip: a short round end.
  const tipCap = Array.from({ length: 7 }, (_, i) => {
    const q = Math.PI / 2 + (Math.PI * i) / 6;
    return B(along(0) + Math.cos(q) * hw(0) * 0.9, Math.sin(q) * hw(0));
  });
  for (const r of visibleRuns(tipCap, (p) => inHead(p))) pushRun(r, 0, 0.01);
  // The head's outline, last.
  pushRun(jawU, 0.97, 1);
  pushRun(jawL, 0.97, 1);
  edge.push(...headPoly);

  // Scales down the back: staggered rows of arcs bulging toward the tail, the rows fewer where the body is thin.
  let scales = "";
  const ds = Math.max(2.1, wmax * 0.62);
  for (let s = ds * 1.5, row = 0; s < bodyLen - ds * 0.5; s += ds, row++) {
    const w = hw(s);
    const lanes = w > 3 ? [0.22, 0.66] : w > 1.7 ? [0.42] : [];
    lanes.forEach((v0, li) => {
      const ss = s + ((row + li) % 2 ? ds / 2 : 0);
      const rr = Math.min(ds * 0.5, w * (lanes.length > 1 ? 0.26 : 0.4));
      const arc = Array.from({ length: 9 }, (_, i) => {
        const q = ((-80 + (160 * i) / 8) * Math.PI) / 180;
        return B(
          along(ss - rr * Math.cos(q) * 0.85),
          (v0 * w + rr * Math.sin(q)) * Math.min(1, hw(ss) / w),
        );
      });
      if (arc.every((p) => !hidden(ss, p) && !inHead(p))) scales += poly(arc);
    });
  }
  // The belly: plates across it, from near the edge in to the spine, one side only: its shade.
  let belly = "";
  for (let s = 1.6; s < bodyLen - 0.6; s += 1.15) {
    const w = hw(s);
    if (w < 1.1) continue;
    const ps = [B(along(s), -w + 0.45), B(along(s), -w * 0.12)];
    if (!ps.some((p) => hidden(s, p)) && !hidden(s, lerp(ps[0], ps[1], 0.5)))
      belly += poly(ps);
  }

  // The head's lesser lines: the brow arched over the eye, the lip's seam, a nostril, plates on the crown, the lower jaw hatched.
  const EX = 0.6;
  const EY = 0.62;
  const eye = H(EX, EY);
  const eyeR = 0.34 * wn;
  let head = poly(
    xs(0.44, 0.8, 16).map((x) =>
      H(x, EY + 0.5 + 0.2 * Math.sin((Math.PI * (x - 0.44)) / 0.36)),
    ),
  );
  head += poly(xs(XC + 0.06, 0.95, 14).map((x) => H(x, lipU(x) + 0.26)));
  head += poly(
    Array.from({ length: 7 }, (_, i) =>
      H(
        0.9 + (0.07 * Math.cos((Math.PI * i) / 6) * wn) / Lh,
        0.5 + 0.1 * Math.sin((Math.PI * i) / 6),
      ),
    ),
  );
  for (const [x0, y0] of [
    [0.34, 1.02],
    [0.2, 0.9],
    [0.27, 0.42],
  ]) {
    const r = 0.13;
    head += poly(
      Array.from({ length: 9 }, (_, i) => {
        const q = ((-75 + (150 * i) / 8) * Math.PI) / 180;
        return H(
          x0 - r * Math.cos(q) * 0.75,
          y0 + ((r * Lh) / wn) * 0.5 * Math.sin(q),
        );
      }),
    );
  }
  // The lower jaw shaded: a few short strokes up from its edge, slanting back.
  for (let x = 0.2; x < 0.8; x += 0.11) {
    const y0 = bottom(x) + 0.3;
    head += poly([H(x, y0), H(x - 0.05, y0 + 0.38)]);
  }
  const pupil = poly([H(EX, EY - 0.26), H(EX, EY + 0.26)]);

  // The light's paths: from each crossing out along each loop, half a loop each, meeting at the loops' ends and at the head.
  const half = (s0: number, dir: number, n: number) =>
    poly(
      Array.from({ length: Math.ceil(n / 0.8) + 1 }, (_, i) =>
        spine(s0 + dir * Math.min(n, i * 0.8)),
      ),
    );
  const [cu, co] = [along(sUnder), along(sOver)];
  const leftLen = (co - cu + S) % S; // round the left loop, from the under pass to the over pass
  const rightLen = S - leftLen;
  const light = [
    half(cu, 1, leftLen / 2),
    half(co, -1, leftLen / 2),
    half(co, 1, rightLen / 2),
    half(cu, -1, rightLen / 2),
  ];

  const xsAll = edge.map((p) => p[0]);
  const ysAll = edge.map((p) => p[1]);
  return {
    outline,
    scales,
    belly,
    head,
    eye,
    eyeR,
    pupil,
    light,
    box: [
      Math.min(...xsAll),
      Math.min(...ysAll),
      Math.max(...xsAll),
      Math.max(...ysAll),
    ],
    edge,
    crossing: spine(along(sOver)),
  };
}

// ------------------------------------------------------------------ the shaft

/** The star: points to `STAR_R`, its glory of fine rays out to GLORY_R, its depth set above it. */
export const STAR_R = 4.7;
export const GLORY_R = 8.6;
/** From the star's middle up to its number's baseline. */
export const NUM_RISE = 10.8;
/** The shaft: its walls this far either side of its middle, a lining inside them, rock beyond them. */
export const WALL = 11;
const LINING = 9.8;
const ROCK = 7;
export const OUT = WALL + ROCK;
/** Room for a reached zone's sigil, wide. */
const SIGIL = 17;
/** The zones' names end this far left of the rock; the notes start this far right of it. */
const NAME_GAP = 4.5;
const NOTE_GAP = 5;
/** The widest zone name (Maragsâ at 10 px, a little spaced), the room kept for them. */
const NAME_W = 70;
/** Room above the surface (for the first note, and the number of a star at depth 1). */
const TOP = 15;
/** The notes' line height. */
export const NOTE_LINE = 13;

/** A note: a line or a few, each a run of words (italic) and figures (Cinzel), its first baseline at `y`. */
export type Run = { text: string; num?: boolean };
export type Note = {
  id: string;
  x: number;
  y: number;
  anchor: "start" | "end";
  lines: Run[][];
};
/** About how wide a line of a note is set (EB Garamond italic at 12 px, Cinzel figures at 10.5 px; measured, a few px either way): enough to centre the drawing by. */
export const textWidth = (line: Run[]) =>
  line.reduce((sum, r) => sum + r.text.length * (r.num ? 6.6 : 4.4), 0);
/** The cap height of the depth over the star (Cinzel at 11 px), for the room it needs. */
const NUM_CAP = 8;

export type Shaft = {
  w: number;
  h: number;
  /** The shaft's middle; the surface; each zone's height; the foot of the last zone. */
  X: number;
  S: number;
  band: number;
  foot: number;
  /** The names' right edge, the notes' left edge. */
  nameX: number;
  noteX: number;
  surface: Piece[];
  walls: Piece[];
  lining: string;
  /** The rock beside the shaft, a band per zone: its hatching and its seam below. */
  rock: { y0: number; y1: number; hatch: string }[];
  seams: string;
  edges: string;
  serpent: Serpent;
  /** Where the star rests before a first run, and where it lies past 100 (in the serpent's lap). */
  rest: Pt;
  lap: Pt;
  notes: Note[];
  /** Wide enough for the notes in full. */
  wide: boolean;
  /** Where a reached zone's sigil sits (wide only), between its name and the rock. */
  sigilX: number | null;
};

/** Where the star stands for a best run of `deepest`: in its zone's band (never on a seam), in the serpent's lap past 100, at the mouth before a run. */
export function starAt(
  s: Pick<Shaft, "X" | "S" | "band" | "rest" | "lap">,
  deepest: number | null | undefined,
): { p: Pt; at: "rest" | "zone" | "past"; zone: number } {
  const best = bestOf(deepest);
  if (best === null) return { p: s.rest, at: "rest", zone: -1 };
  if (best > LAST) return { p: s.lap, at: "past", zone: ZONES.length };
  const k = zoneOf(best);
  const i = (best - 1) % 10;
  // Kept clear of the seams above and below by the star's own reach.
  const m = Math.max(0.28, (STAR_R + 0.8) / s.band);
  return {
    p: [s.X, s.S + s.band * (k + m + ((1 - 2 * m) * i) / 9)],
    at: "zone",
    zone: k,
  };
}

/** The drawing for a box `w` × `h` px. */
export function shaftLayout(
  w: number,
  h: number,
  lives: string,
  findsFrom: number,
  fastFrom: number,
  startSecs: number,
  endSecs: number,
): Shaft {
  const wide = w >= 250;
  // The serpent: a little larger where there is room.
  const a = wide ? 46 : 40;
  const wmax = wide ? 3.9 : 3.5;
  const ky = 1.12;
  const S = TOP;
  // The serpent laid out about (0, 0) to find how far its lap sits above the crossing and how far it reaches below.
  const probe = ouroboros([0, 0], a, ky, wmax);
  const near = probe.edge.filter(
    (p) => Math.abs(p[0]) < GLORY_R + 4 && p[1] < 0,
  );
  const clear = (y: number) =>
    near.every((p) => dist(p, [0, y]) > GLORY_R + 1.3);
  let lapDy = -2;
  while (!clear(lapDy) && lapDy > -60) lapDy -= 0.1;
  const below = probe.box[3];
  // The zones share what's left. The shaft ends at the foot of the last of them; the serpent's lap lies far
  // enough below it that a star past 100 has its depth set under the shaft, clear of the rock and the names.
  const GAP_BELOW = 3.5 + NUM_CAP + NUM_RISE;
  const band = Math.max(
    12,
    (h - S - (GAP_BELOW - lapDy + below + 1.5)) / ZONES.length,
  );
  const foot = S + band * ZONES.length;
  const cy = foot + GAP_BELOW - lapDy;
  const yOf = (d: number) =>
    starAt({ X: 0, S, band, rest: [0, S], lap: [0, 0] }, d).p[1];

  // The notes, in the margin right of the shaft, each at the depth it speaks of; the lives on the surface, left of the mouth.
  const BASE = 3.8; // from a depth's middle to the baseline of words set on it
  const n = (text: string): Run => ({ text });
  const num = (text: string): Run => ({ text, num: true });
  const secs = (v: number, rest: string): Run[] => [
    num(String(v)),
    n(` s${rest}`),
  ];
  type Draft = {
    id: string;
    y: number;
    lines: Run[][];
    by?: "serpent" | "surface";
  };
  const drafts: Draft[] = wide
    ? [
        {
          id: "lives",
          y: S - 4,
          lines: [[n(`${lives} lives each`)]],
          by: "surface",
        },
        {
          id: "finds",
          y: yOf(findsFrom) + BASE,
          lines: [[n("finds from depth "), num(String(findsFrom))]],
        },
        {
          id: "zones",
          y: S + band * 2 + BASE - 1,
          lines: [[n("a new zone every "), num("10"), n(" depths")]],
        },
        {
          id: "clock",
          y: S + band * 6 + BASE - 1,
          lines: [
            [...secs(startSecs, " to answer at first,")],
            [...secs(endSecs, " from depth "), num(String(fastFrom)), n(";")],
            [n("trickier the deeper")],
          ],
        },
        {
          id: "endless",
          y: cy + BASE,
          lines: [[n("endless past "), num(String(LAST))]],
          by: "serpent",
        },
      ]
    : [
        {
          id: "lives",
          y: S - 4,
          lines: [[n(`${lives} lives each`)]],
          by: "surface",
        },
        {
          id: "finds",
          y: yOf(findsFrom) + BASE,
          lines: [[n("first finds at "), num(String(findsFrom))]],
        },
        {
          id: "zones",
          y: S + band * 2 + BASE - 1,
          lines: [[n("a new zone")], [n("every "), num("10")]],
        },
        {
          id: "clock",
          y: S + band * 6 + BASE - 1,
          lines: [
            [...secs(startSecs, " at first,")],
            [...secs(endSecs, " from "), num(String(fastFrom)), n(";")],
            [n("trickier deeper")],
          ],
        },
        {
          id: "endless",
          y: cy - NOTE_LINE / 2 + BASE,
          lines: [[n("endless")], [n("past "), num(String(LAST))]],
          by: "serpent",
        },
      ];

  // Where the shaft stands: right of the names (and, wide, the zones' sigils); wide, the whole is centred in the box.
  const sigil = wide ? SIGIL : 0;
  const X0 = NAME_W + NAME_GAP + sigil + OUT;
  const reach = Math.max(
    ...drafts
      .filter((d) => d.by !== "surface")
      .map(
        (d) =>
          (d.by ? a + wmax + 5 : OUT + NOTE_GAP) +
          Math.max(...d.lines.map(textWidth)),
      ),
  );
  const X =
    Math.round(X0 + (wide ? Math.max(0, (w - (X0 + reach)) / 2) : 0)) + 0.5;
  const nameX = X - OUT - NAME_GAP - sigil;
  const noteX = X + OUT + NOTE_GAP;

  const wearSeed = (n: number) => wearOf(n);
  const serpent = ouroboros([X, cy], a, ky, wmax, wearSeed(41));
  const notes: Note[] = drafts.map((d) =>
    d.by === "surface"
      ? { id: d.id, x: nameX, y: d.y, anchor: "end", lines: d.lines }
      : {
          id: d.id,
          x: d.by ? serpent.box[2] + 5 : noteX,
          y: d.y,
          anchor: "start",
          lines: d.lines,
        },
  );

  // The surface, broken at the mouth.
  const surface = [
    ...pieces(
      [
        [X - WALL - 1.4, S],
        [2, S],
      ],
      [],
      wearSeed(3),
    ).map((p) => ({ ...p, from: p.from / 2, to: p.to / 2 })),
    ...pieces(
      [
        [X + WALL + 1.4, S],
        [w - 2, S],
      ],
      [],
      wearSeed(5),
    ).map((p) => ({ ...p, from: p.from / 2, to: p.to / 2 })),
  ];

  // The walls from the collar down through the zones. Under the last of them they step out along the foot of the rock
  // into a wider chamber (room for a depth past 100 under the shaft) and run on down until they come to the serpent's
  // back, stopping short of it.
  const wallEnd = (x: number) => {
    const hits = serpent.edge.filter(
      (p) => Math.abs(p[0] - x) < 0.6 && p[1] < cy,
    );
    return hits.length ? Math.min(...hits.map((p) => p[1])) - 1.8 : cy - 4;
  };
  const COLLAR = S - 3.5;
  const walls = [-1, 1].flatMap((sg) => {
    const [x, xo] = [X + sg * WALL, X + sg * OUT];
    return pieces(
      [
        [x, COLLAR],
        [x, foot],
        [xo, foot],
        [xo, wallEnd(xo)],
      ],
      [],
      wearSeed(sg > 0 ? 11 : 13),
    );
  });
  const lining = [-1, 1]
    .map((sg) => seg([X + sg * LINING, S], [X + sg * LINING, foot]))
    .join("");

  // The rock beside the shaft, a band per zone, hatched one way and denser deeper down; its seams; its outer edges.
  const rock = ZONES.map((_, k) => {
    const [y0, y1] = [S + k * band, S + (k + 1) * band];
    const gap = 2.15 - 0.05 * k;
    return {
      y0,
      y1,
      hatch:
        hatchBox(X - OUT, y0, X - WALL, y1, gap) +
        hatchBox(X + WALL, y0, X + OUT, y1, gap),
    };
  });
  let seams = "";
  for (let k = 1; k < ZONES.length; k++) {
    const y = S + k * band;
    seams +=
      seg([X - OUT, y], [X - WALL - 0.7, y]) +
      seg([X + WALL + 0.7, y], [X + OUT, y]);
  }
  const edges =
    seg([X - OUT, S + 1.2], [X - OUT, foot]) +
    seg([X + OUT, S + 1.2], [X + OUT, foot]);

  return {
    w,
    h,
    X,
    S,
    band,
    foot,
    nameX,
    noteX,
    surface,
    walls,
    lining,
    rock,
    seams,
    edges,
    serpent,
    sigilX: wide ? X - OUT - NAME_GAP - SIGIL / 2 + 1 : null,
    rest: [X, S - 1.5],
    lap: [X, cy + lapDy],
    notes,
    wide,
  };
}

/** The star's glory: fine rays, long and short in turn. */
export const glory = (n = 16) =>
  Array.from(
    { length: n },
    (_, k) =>
      `M${pt(at([0, 0], (k * 360) / n, STAR_R + 1.3))}L${pt(at([0, 0], (k * 360) / n, k % 2 ? GLORY_R - 1.4 : GLORY_R))}`,
  ).join("");

/** The pen's timing for pieces of a whole drawn in `t` s after `delay`: fast at first, slowing at the end (the circle's stroke()). */
export function pen(ps: Piece[], delay: number, t: number) {
  const when = (u: number) => 1 - Math.sqrt(1 - clamp(u, 0, 1));
  return ps.map(({ d, from, to }) => ({
    d,
    delay: delay + when(from) * t,
    t: Math.max(0.03 * t, (when(to) - when(from)) * t),
  }));
}

export { hatchBox, inPoly };
