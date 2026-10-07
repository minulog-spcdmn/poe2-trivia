// The ouroboros at the foot of the descent plate (lib/descentPlate): a
// serpent lying in a figure eight on its side, the sign for no end, biting
// its own tail. In the arcane style (docs/arcane-style.md): every line is
// computed from one curve, the eight's middle line, so the body is a true
// band of tapering width round it.
//
// The middle line is exact geometry: two circles, the loops, joined by
// their inner tangents, which cross between them steeply enough to show
// which strand passes over. The body swells from a fine tail to its
// broadest past the middle, narrows at the neck and widens again into the
// head (a broad crown, a brow ridge over a ringed eye with a slit pupil,
// the jaws closed on the tail's tip, the mouth's line turning down at the
// hinge). Down one side runs the belly, a band of plates across it; the
// back carries a chain of diamonds, as an adder's. Where the body crosses
// itself, the strand beneath (the thin one near the tail) stops short of
// the one on top. A line runs along the back for a sheen to run down.

import type { Pt } from './arcane.ts';

/** main: an outline; thin: a second line; hair: the finest. */
export type SerpentKind = 'main' | 'thin' | 'hair';
/** A line, and when the pen reaches it as a share of the drawing (0 the tail, 1 the head). */
export type SerpentLine = { pts: Pt[]; kind: SerpentKind; at: number; span: number };
export type Serpent = {
  /** Outlines and the head's lines, in the order the pen draws them. */
  lines: SerpentLine[];
  /** The belly's plates and the back's scales (fine). */
  scales: Pt[][];
  /** The line down the back, in pieces (broken where it passes beneath), each with where it starts along the whole. */
  sheen: { pts: Pt[]; from: number }[];
  /** The back line's length, tail to neck. */
  sheenLen: number;
  /** The eye, and the way the head points there (degrees, clockwise from the right). */
  eye: { c: Pt; r: number; glint: Pt };
  eyeAngle: number;
  /** The loops' middles, and the radius of a circle that fits in each clear of the body. */
  loops: [Pt, Pt];
  inner: number;
};

const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The angle the strands cross at, either side of the level (degrees): steep enough to show which passes over. */
const CROSS = 33;
/** The head is this much broader than the body at its broadest. */
const HEAD_W = 1.6;

/**
 * The figure eight's size for a serpent `halfH` either side of its middle
 * (its head at the top included) with a body `wmax` either side of its
 * middle line: the loops' radius and how far their centres are from the
 * crossing, and how far its body reaches either side of the crossing.
 */
export function serpentSize(halfH: number, wmax: number) {
  const r = halfH - wmax * HEAD_W;
  const d = r / Math.sin((CROSS * Math.PI) / 180);
  return { r, d, halfW: d + r + wmax };
}

/**
 * The serpent with its crossing at `c`, its loops `r` round about centres
 * `d` either side of it, its body `wmax` either side of its middle line at
 * the broadest (see serpentSize).
 */
export function serpent(c: Pt, r: number, d: number, wmax: number): Serpent {
  const θ = (CROSS * Math.PI) / 180;
  const hl = wmax * 3.8;
  // The middle line: from the crossing down to the right loop, round it
  // (under, out, over), back through the crossing and round the left loop
  // the other way (under, out, over) to the crossing again; the loops are
  // circles and the strands between them their inner tangents.
  const [R, Lc]: Pt[] = [
    [c[0] + d, c[1]],
    [c[0] - d, c[1]],
  ];
  const ring = (o: Pt, φ: number): Pt => [o[0] + r * Math.cos(φ), o[1] + r * Math.sin(φ)];
  const T1 = ring(R, Math.PI / 2 + θ);
  const T2 = ring(R, -Math.PI / 2 - θ);
  const T3 = ring(Lc, Math.PI / 2 - θ);
  const T4 = ring(Lc, (3 * Math.PI) / 2 + θ);
  const STEP = 0.1;
  const raw: Pt[] = [];
  const straight = (p: Pt, q: Pt) => {
    const n = Math.ceil(dist(p, q) / STEP);
    for (let i = 0; i < n; i++) raw.push([p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n]);
  };
  const round = (o: Pt, φ0: number, φ1: number) => {
    const n = Math.ceil((Math.abs(φ1 - φ0) * r) / STEP);
    for (let i = 0; i < n; i++) raw.push(ring(o, φ0 + ((φ1 - φ0) * i) / n));
  };
  const leg = d * Math.cos(θ);
  const sweep = r * (Math.PI + 2 * θ);
  straight(c, T1);
  round(R, Math.PI / 2 + θ, -Math.PI / 2 - θ);
  straight(T2, c);
  straight(c, T3);
  round(Lc, Math.PI / 2 - θ, (3 * Math.PI) / 2 + θ);
  straight(T4, c);
  raw.push(c);
  const N = raw.length - 1;
  const cum = [0];
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + dist(raw[i - 1], raw[i]));
  const P = cum[N];
  /** The point at length `s` along the curve (wrapping round). */
  const C = (s: number): Pt => {
    s = ((s % P) + P) % P;
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= s) lo = m;
      else hi = m;
    }
    const k = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return [raw[lo][0] + (raw[hi][0] - raw[lo][0]) * k, raw[lo][1] + (raw[hi][1] - raw[lo][1]) * k];
  };
  /** The normal at `s`, to the left of the way the serpent goes (up, where it goes right). */
  const Nrm = (s: number): Pt => {
    const [p, q] = [C(s - 0.15), C(s + 0.15)];
    const l = dist(p, q);
    return [(q[1] - p[1]) / l, -(q[0] - p[0]) / l];
  };
  /** Where along the curve the left loop's top is, and the second pass through the crossing. */
  const LEFT_TOP = 3 * leg + sweep + r * (Math.PI + θ);
  const SECOND = 2 * leg + sweep;

  // Along the serpent: σ from the tail's tip (0) to the snout (L). The
  // head lies along the top of the left loop going right (t = 7π/4 is that
  // loop's top), the snout past the tail's tip, which is in its mouth.
  const snout = LEFT_TOP + hl * 0.5;
  const overlap = hl * 0.36;
  const tail = snout - overlap;
  const L = P + overlap;
  const pos = (σ: number) => tail + σ;
  const at = (σ: number, v: number): Pt => {
    const p = C(pos(σ));
    const n = Nrm(pos(σ));
    return [p[0] + n[0] * v, p[1] + n[1] * v];
  };
  const NECK = L - hl;
  const neckW = wmax * 0.8;
  /** The body's half-width: a fine tail swelling to the broadest past the middle, narrowing into the neck. */
  const w = (σ: number) => {
    const u = σ / L;
    const grow = 0.3 + (wmax - 0.3) * Math.sin((Math.min(1, u / 0.45) * Math.PI) / 2) ** 0.75;
    return grow - (wmax - neckW) * smooth(NECK - hl * 1.6, NECK, σ);
  };

  // ---- the crossing: the strand going through the middle the second time (t = π) passes over ----
  const overAt = (((SECOND - tail) % P) + P) % P;
  const underAt = P - tail;
  const GAP = Math.max(0.55, wmax * 0.16);
  /** Whether a point lies under the strand on top (within its body and a gap). */
  const beneath = (p: Pt) => {
    if (dist(p, c) > wmax * 6) return false;
    for (let σ = overAt - wmax * 6; σ <= overAt + wmax * 6; σ += 0.25) if (dist(p, C(pos(σ))) < w(σ) + GAP) return true;
    return false;
  };
  /** A line along the body near the under-strand's crossing, broken where it passes beneath. */
  const cutUnder = (pts: Pt[], σs: number[]): { pts: Pt[]; from: number }[] => {
    const out: { pts: Pt[]; from: number }[] = [];
    let cur: Pt[] = [];
    let from = 0;
    pts.forEach((p, i) => {
      const hidden = Math.abs(σs[i] - underAt) < wmax * 5 && beneath(p);
      if (hidden) {
        if (cur.length > 1) out.push({ pts: cur, from });
        cur = [];
      } else {
        if (!cur.length) from = σs[i];
        cur.push(p);
      }
    });
    if (cur.length > 1) out.push({ pts: cur, from });
    return out;
  };
  /** Points along σ0..σ1 at offset v(σ), every `step`. */
  const along = (σ0: number, σ1: number, v: (σ: number) => number, step = 0.4) => {
    const n = Math.max(2, Math.ceil(Math.abs(σ1 - σ0) / step));
    const σs = Array.from({ length: n + 1 }, (_, i) => σ0 + ((σ1 - σ0) * i) / n);
    return { pts: σs.map((σ) => at(σ, v(σ))), σs };
  };

  const lines: SerpentLine[] = [];
  const share = (σ: number) => Math.min(1, Math.max(0, σ / L));
  // The body's two edges, from the tail's tip (inside the mouth, between the jaws) to the neck: the back's firm, the belly's a second line.
  for (const side of [1, -1]) {
    const e = along(0.2, NECK, (σ) => side * w(σ));
    for (const piece of cutUnder(e.pts, e.σs))
      lines.push({ pts: piece.pts, kind: side > 0 ? 'main' : 'thin', at: share(piece.from), span: share(piece.from + dist(piece.pts[0], piece.pts.at(-1)!) + 1) - share(piece.from) });
  }
  // The tail's tip, rounded.
  lines.push({ pts: [at(0.2, w(0.2)), at(0, w(0) * 0.5), at(-0.08, 0), at(0, -w(0) * 0.5), at(0.2, -w(0.2))], kind: 'thin', at: 0, span: 0.02 });

  // ---- the head: x from the neck (0) to the snout (1) along the curve, v up from the middle line in wmax ----
  /** A smooth line through control points (x, v), as a Catmull-Rom spline. */
  const spline = (cps: Pt[], per = 8): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i < cps.length - 1; i++) {
      const [p0, p1, p2, p3] = [cps[Math.max(0, i - 1)], cps[i], cps[i + 1], cps[Math.min(cps.length - 1, i + 2)]];
      for (let k = 0; k < per; k++) {
        const t = k / per;
        const [t2, t3] = [t * t, t * t * t];
        const q = (j: 0 | 1) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        out.push([q(0), q(1)]);
      }
    }
    out.push(cps.at(-1)!);
    return out;
  };
  const H = ([x, v]: Pt) => at(NECK + x * hl, v * wmax);
  const head = (cps: Pt[]) => spline(cps).map(H);
  const nw = neckW / wmax;
  const HEAD_AT = share(NECK);
  // The upper jaw: up from the neck to a broad crown, the brow over the eye, down the snout to a blunt nose, and back along the lip to the mouth's corner.
  const CORNER: Pt = [0.36, 0.0];
  const upper = head([
    [0, nw],
    [0.16, 1.1],
    [0.36, 1.38],
    [0.56, 1.42],
    [0.72, 1.28],
    [0.86, 1.02],
    [0.96, 0.72],
    [1, 0.46],
    [0.97, 0.3],
    [0.84, 0.26],
    [0.62, 0.16],
    CORNER,
  ]);
  // The lower jaw, closed on the tail: from the corner along the lip to the chin, and back under it to the throat.
  const lower = head([CORNER, [0.56, -0.2], [0.76, -0.3], [0.84, -0.36], [0.83, -0.58], [0.7, -0.86], [0.46, -1.04], [0.22, -1.0], [0, -nw]]);
  lines.push({ pts: upper, kind: 'main', at: HEAD_AT, span: 1 - HEAD_AT }, { pts: lower, kind: 'thin', at: HEAD_AT, span: 1 - HEAD_AT });
  // The mouth running on back from the corner, turning down at the hinge.
  lines.push({ pts: head([CORNER, [0.24, -0.12], [0.13, -0.36]]), kind: 'hair', at: 0.97, span: 0.03 });
  // The eye under its brow: a ridge drawn down toward the snout.
  const eyeAt: Pt = [0.6, 0.7];
  const eyeR = Math.max(0.5, wmax * 0.24);
  lines.push({ pts: head([[0.4, 1.02], [0.56, 1.1], [0.76, 0.96]]), kind: 'hair', at: 0.98, span: 0.02 });
  // The crown's plate behind it, and a nostril.
  lines.push({ pts: head([[0.12, 0.72], [0.28, 0.9], [0.42, 0.98]]), kind: 'hair', at: 0.98, span: 0.02 });
  lines.push({ pts: head([[0.88, 0.62], [0.93, 0.5]]), kind: 'hair', at: 0.99, span: 0.01 });

  // ---- the belly's plates and the back's scales ----
  const scales: Pt[][] = [];
  const BELLY = 0.34;
  /** The belly's line: a band down the right-hand side of the body. */
  const bellyV = (σ: number) => -w(σ) + Math.max(0.45, w(σ) * BELLY * 2);
  const TAIL_SHOWS = overlap + Math.max(0.6, wmax * 0.2);
  const band = along(TAIL_SHOWS + wmax * 2, NECK, bellyV);
  for (const piece of cutUnder(band.pts, band.σs)) scales.push(piece.pts);
  const PLATE = Math.max(1.6, wmax * 0.5);
  const hidden = (σ: number, ps: Pt[]) => Math.abs(σ - underAt) < wmax * 5 && ps.some(beneath);
  for (let σ = TAIL_SHOWS + wmax * 2.2; σ < NECK - 0.3; σ += PLATE * (0.7 + 0.3 * (w(σ) / wmax))) {
    const p = [at(σ, -w(σ) + 0.3), at(σ, bellyV(σ) - 0.25)];
    if (!hidden(σ, p)) scales.push(p);
  }
  // Down the back, a chain of diamonds, as an adder's, between the belly's line and the back's edge.
  const LONG = Math.max(4.2, wmax * 2.1);
  for (let σ = TAIL_SHOWS + wmax * 3.5; σ < NECK - LONG * 0.6; σ += LONG * (0.75 + 0.25 * (w(σ) / wmax))) {
    const lo = bellyV(σ) + 0.45;
    const hi = w(σ) - 0.45;
    if (hi - lo < 1) continue;
    const mid = (lo + hi) / 2;
    const half = LONG * (0.75 + 0.25 * (w(σ) / wmax)) * 0.42;
    const dia = [at(σ - half, mid), at(σ, hi), at(σ + half, mid), at(σ, lo), at(σ - half, mid)];
    if (!hidden(σ, dia)) scales.push(dia);
  }

  // ---- the line down the back, for the sheen ----
  const ridge = along(TAIL_SHOWS + wmax, NECK + hl * 0.35, (σ) => (σ > NECK ? wmax * (nw + (1.15 - nw) * smooth(NECK, NECK + hl * 0.35, σ)) : w(σ)) * 0.6);
  const sheen = cutUnder(ridge.pts, ridge.σs).map((p) => ({ pts: p.pts, from: p.from - ridge.σs[0] }));

  // ---- the loops' middles, and what fits in them ----
  const loops: [Pt, Pt] = [Lc, R];
  const inner = r - wmax - 1;

  return {
    lines,
    scales,
    sheen,
    sheenLen: ridge.σs.at(-1)! - ridge.σs[0],
    eye: { c: H(eyeAt), r: eyeR, glint: H([eyeAt[0] - 0.04, eyeAt[1] + 0.1]) },
    eyeAngle: (() => {
      const [p, q] = [H([eyeAt[0] - 0.05, 0]), H([eyeAt[0] + 0.05, 0])];
      return (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
    })(),
    loops,
    inner,
  };
}
