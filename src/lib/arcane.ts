// The engraver's hand behind the arcane pieces (see docs/arcane-style.md):
// the alchemical signs the alchemist's circle (ArcaneCircle) is cut with,
// and its routines for cutting lines, in a form any piece can use. Points
// are [x, y]; angles run clockwise from the top, in degrees.
//
// Lines come back as SVG path data, already broken wherever they meet a
// hole (a circle round a seal or a sign), pass under a strap, or are worn.

export type Pt = [number, number];
/** A stretch of a line to leave out, as a range of its length. */
export type Cut = [number, number];
/** A circle the lines stop short of. */
export type Hole = { c: Pt; r: number };
/** A straight band `w` either side of the line from `p` to `q`, which lines pass under. */
export type Strap = { p: Pt; q: Pt; w: number };

export const f = (v: number) => v.toFixed(2);
export const rad = (a: number) => (a * Math.PI) / 180;
export const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
export const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
/** The point at `a` degrees clockwise from the top, `r` from `c`. */
export const at = (c: Pt, a: number, r: number): Pt => [c[0] + r * Math.sin(rad(a)), c[1] - r * Math.cos(rad(a))];

// The seven planets and their metals, drawn on a small grid (about ±4.6).
export const PLANETS = {
  sol: 'M0 -3.6A3.6 3.6 0 1 1 0 3.6A3.6 3.6 0 1 1 0 -3.6M0 -0.6A0.6 0.6 0 1 1 0 0.6A0.6 0.6 0 1 1 0 -0.6', // gold
  luna: 'M1 -4A4.2 4.2 0 1 0 1 4A3.3 3.3 0 1 1 1 -4Z', // silver
  mercury: 'M-2.2 -4.6A2.2 2.2 0 0 0 2.2 -4.6M0 -3.2A1.9 1.9 0 1 1 0 0.6A1.9 1.9 0 1 1 0 -3.2M0 0.6V4.6M-1.6 2.8H1.6', // quicksilver
  venus: 'M0 -4.4A2.4 2.4 0 1 1 0 0.4A2.4 2.4 0 1 1 0 -4.4M0 0.4V4.6M-1.8 2.6H1.8', // copper
  mars: 'M-1 -1.4A2.6 2.6 0 1 1 -1 3.8A2.6 2.6 0 1 1 -1 -1.4M0.9 -0.5L3.6 -3.2M1.2 -3.4H3.6V-1', // iron
  jupiter: 'M-3 -2.2C-3 -4.6 0.4 -4.6 0.2 -2.2C0 -0.4 -2 0.8 -3 1.4H3.2M1.6 -3.8V4.4', // tin
  saturn: 'M-1 -4.4V2M-2.6 -2.8H0.6M-1 -0.4C0.2 -1.8 2.8 -1.6 2.6 0.6C2.4 2.4 0.4 2.6 1.2 4.4', // lead
};

// The marks of a script nobody can read (the four elements, salt, sulphur
// and the like), about ±2 tall.
export const MARKS = [
  'M0 -2L1.7 1.5H-1.7Z', // fire
  'M0 2L1.7 -1.5H-1.7Z', // water
  'M0 -2L1.7 1.5H-1.7ZM-1.4 0.4H1.4', // air
  'M0 2L1.7 -1.5H-1.7ZM-1.4 -0.4H1.4', // earth
  'M0 -1.6A1.6 1.6 0 1 1 0 1.6A1.6 1.6 0 1 1 0 -1.6M-1.6 0H1.6', // salt
  'M0 -2.2L1.2 -0.2H-1.2ZM0 -0.2V2.2M-1 1H1', // sulphur
  'M0 -0.6A1.3 1.3 0 1 1 0 2A1.3 1.3 0 1 1 0 -0.6M0 -0.6V-2.4M-0.9 -1.6H0.9', // antimony
  'M-1.4 -2L0 2L1.4 -2M-0.9 -0.6H0.9', // arsenic
  'M-1.2 -2H1.2L-0.6 0C1.8 0 1.8 2.2 -1.2 2', // dram
  'M-1.5 1C-1.5 -2 1.5 -2 1.5 0S-0.4 2 -0.4 0', // a turn of the pen
  'M0 -2V2M-1.2 -0.8H1.2', // cross
  'M0.6 -2A2 2 0 1 0 0.6 2A1.5 1.5 0 1 1 0.6 -2', // crescent
  'M-1.4 2V-2L1.4 2V-2', // a zigzag
  'M-1.3 -1.6C0 -2.6 1.6 -1 0 0C-1.6 1 0 2.6 1.3 1.6', // an S
];

// Luna, for a seal of radius 13: a crescent, horns to the right, shaded in hatching.
export const LUNA = 'M4.67 -7.11A8.5 8.5 0 1 0 4.67 7.11A7.2 7.2 0 1 1 4.67 -7.11Z';
export const LUNA_HATCH = Array.from({ length: 13 }, (_, i) => {
  const y = -6 + i;
  const x0 = -Math.sqrt(8.5 ** 2 - y * y) + 0.7;
  const x1 = 3.5 - Math.sqrt(7.2 ** 2 - y * y) - 0.7;
  return x1 - x0 > 0.3 ? `M${f(x0)} ${y}H${f(x1)}` : '';
}).join('');

/** A generator of numbers in [0, 1) from a fixed seed, so every copy of a piece comes out the same. */
export const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** What's left of [lo, hi] once the `cuts` are taken out. */
export const subtract = (lo: number, hi: number, cuts: Cut[]) => {
  let parts: Cut[] = [[lo, hi]];
  for (const [c0, c1] of cuts)
    parts = parts.flatMap(([a, b]): Cut[] =>
      c1 <= a || c0 >= b ? [[a, b]] : ([[a, c0], [c1, b]] as Cut[]).filter(([p, q]) => q - p > 1e-3),
    );
  return parts;
};

/**
 * The plate's wear: a nick every 30 units or so along a line `len` long,
 * as cuts in [0, `span`]. Null draws the line whole (for the glow under it,
 * and for signs and hatching, which never wear).
 */
export type Wear = ((len: number, span?: number) => Cut[]) | null;
export const wear = (seed: number): Wear => {
  const rnd = seeded(seed);
  return (len, span = 1) =>
    Array.from({ length: Math.round((len / 30) * (0.4 + rnd() * 1.2)) }, () => {
      const t = rnd() * span;
      const w = ((0.4 + rnd() * 0.8) / len) * span;
      return [t - w / 2, t + w / 2];
    });
};

/** Where a line from `p` to `q` runs inside a hole, as a cut in [0, 1]. */
const inside = (p: Pt, q: Pt, { c, r }: Hole): Cut | null => {
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  const [fx, fy] = [p[0] - c[0], p[1] - c[1]];
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * (fx * fx + fy * fy - r * r);
  return disc > 0 ? [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)] : null;
};

/** Where a line from `p` to `q` runs under a strap, as a cut in [0, 1]. */
const underStrap = (p: Pt, q: Pt, { p: a, q: b, w }: Strap): Cut[] => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const dist = (s: Pt) => (s[0] - a[0]) * -uy + (s[1] - a[1]) * ux;
  const along = (s: Pt) => (s[0] - a[0]) * ux + (s[1] - a[1]) * uy;
  const [d0, d1] = [dist(p), dist(q)];
  if (Math.abs(d1 - d0) < 1e-9) return [];
  const [t0, t1] = [(-w - d0) / (d1 - d0), (w - d0) / (d1 - d0)].sort((x, y) => x - y);
  const s = along(lerp(p, q, (t0 + t1) / 2));
  return s < 0 || s > len ? [] : [[t0, t1]];
};

export type LineOpts = { holes?: Hole[]; under?: Strap[]; cuts?: Cut[]; wear?: Wear };

/** A straight line from `p` to `q`, broken where it meets a hole, passes under a strap, or is worn. */
export const line = (p: Pt, q: Pt, { holes = [], under = [], cuts = [], wear = null }: LineOpts = {}) => {
  const all = [...cuts, ...under.flatMap((s) => underStrap(p, q, s))];
  for (const h of holes) {
    const c = inside(p, q, h);
    if (c) all.push(c);
  }
  if (wear) all.push(...wear(Math.hypot(q[0] - p[0], q[1] - p[1])));
  return subtract(0, 1, all)
    .map(([t0, t1]) => `M${pt(lerp(p, q, t0))}L${pt(lerp(p, q, t1))}`)
    .join('');
};

/** A circle about `c`, broken wherever it passes through a hole, and worn. */
export const ring = (c: Pt, r: number, { holes = [], wear = null }: Pick<LineOpts, 'holes' | 'wear'> = {}) => {
  const cuts: Cut[] = [];
  for (const h of holes) {
    const [hx, hy] = [h.c[0] - c[0], h.c[1] - c[1]];
    const d = Math.hypot(hx, hy);
    const cos = (r * r + d * d - h.r * h.r) / (2 * r * d);
    if (Math.abs(cos) >= 1) continue;
    const m = ((((Math.atan2(hx, -hy) * 180) / Math.PI) % 360) + 360) % 360;
    const half = (Math.acos(cos) * 180) / Math.PI;
    cuts.push([m - half, m + half], [m - half - 360, m + half - 360], [m - half + 360, m + half + 360]);
  }
  if (wear) cuts.push(...wear(2 * Math.PI * r, 360));
  const arcs = subtract(0, 360, cuts);
  // Join the arc that ends at the top to the one that starts there, so the ring has no seam.
  if (arcs.length > 1 && arcs[0][0] === 0 && arcs.at(-1)![1] === 360) arcs.push([arcs.pop()![0], arcs.shift()![1] + 360]);
  return arcs
    .map(([a0, a1]) => {
      const n = Math.ceil((a1 - a0) / 170);
      let d = `M${pt(at(c, a0, r))}`;
      for (let k = 1; k <= n; k++) d += `A${f(r)} ${f(r)} 0 0 1 ${pt(at(c, a0 + ((a1 - a0) * k) / n, r))}`;
      return a1 - a0 >= 360 ? d + 'Z' : d;
    })
    .join('');
};

/** Engraver's shading: lines across the triangle `o`, `l`, `t`, parallel to its side from `o` to `t`. */
export const hatch = (o: Pt, l: Pt, t: Pt, gap: number, opts: LineOpts = {}) => {
  const n = Math.floor(Math.hypot(l[0] - o[0], l[1] - o[1]) / gap);
  return Array.from({ length: n }, (_, i) => {
    const s = (i + 1) / (n + 1);
    return line(lerp(o, l, s), lerp(t, l, s), { ...opts, wear: null });
  }).join('');
};

/**
 * A pointed ray out of `c` at `a`, from a base `half` degrees either side
 * at `r0` to its tip at `r1`: its two edges, a ridge down its middle, and
 * hatching down one side.
 */
export const pointedRay = (c: Pt, a: number, r0: number, r1: number, half: number, gap: number, opts: LineOpts = {}) => {
  const [base, l, r, tip] = [at(c, a, r0), at(c, a - half, r0), at(c, a + half, r0), at(c, a, r1)];
  return {
    lines: line(l, tip, opts) + line(r, tip, opts) + line(base, tip, { ...opts, wear: null }),
    hatch: hatch(base, l, tip, gap, opts),
  };
};

/**
 * A woven star polygon {n/m} about `c`, its points at `R`: n straps, each a
 * pair of lines `w` either side of its centre line, mitred at the points,
 * going over and under in turn at each crossing as the star is walked, the
 * strap beneath cut `gap` clear of the one on top. `turn` turns the whole.
 * Returns the straps' edges, the straps (for other lines to pass under),
 * and the radius of the circle that fits inside the star, clear of them.
 */
export const wovenStar = (c: Pt, n: number, m: number, R: number, w: number, gap: number, turn: number, opts: LineOpts = {}) => {
  const tips = Array.from({ length: n }, (_, k) => at(c, ((k + 0.5) / n) * 360 + turn, R));
  const straps: Strap[] = Array.from({ length: n }, (_, i) => ({ p: tips[(i * m) % n], q: tips[(i * m + m) % n], w }));
  const cross = (a: Strap, b: Strap) => {
    const [r, s] = [
      [a.q[0] - a.p[0], a.q[1] - a.p[1]],
      [b.q[0] - b.p[0], b.q[1] - b.p[1]],
    ];
    const den = r[0] * s[1] - r[1] * s[0];
    const [ex, ey] = [b.p[0] - a.p[0], b.p[1] - a.p[1]];
    const t = (ex * s[1] - ey * s[0]) / den;
    const u = (ex * r[1] - ey * r[0]) / den;
    return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99 ? t : null;
  };
  let k = 0;
  const unders = straps.map((a, i) =>
    straps
      .map((b, j) => ({ j, t: i === j ? null : cross(a, b) }))
      .filter((x): x is { j: number; t: number } => x.t !== null)
      .sort((x, y) => x.t - y.t)
      .filter(() => k++ % 2 === 1)
      .map(({ j }) => ({ ...straps[j], w: w + gap })),
  );
  const normal = (s: Strap): Pt => {
    const len = Math.hypot(s.q[0] - s.p[0], s.q[1] - s.p[1]);
    return [-(s.q[1] - s.p[1]) / len, (s.q[0] - s.p[0]) / len];
  };
  /** One edge of strap `i`, `side` (±1) of its centre line, mitred to its neighbours at both tips. */
  const edge = (i: number, side: number): [Pt, Pt] => {
    const [nx, ny] = normal(straps[i]);
    const miter = (tip: Pt, other: Strap): Pt => {
      const [ox, oy] = normal(other);
      const [bx, by] = [nx + ox, ny + oy];
      const s = (side * w) / (nx * bx + ny * by);
      return [tip[0] + bx * s, tip[1] + by * s];
    };
    return [miter(straps[i].p, straps[(i + n - 1) % n]), miter(straps[i].q, straps[(i + 1) % n])];
  };
  const edges = straps.flatMap((_, i) => [1, -1].map((side) => line(...edge(i, side), { ...opts, under: [...(opts.under ?? []), ...unders[i]] })));
  return { edges: edges.join(''), straps, tips, inner: R * Math.cos((Math.PI * m) / n) - w - gap };
};

/** An eight-pointed star of radius `r`, its points long and short in turn, and its ridges. */
export const star8 = (c: Pt, r: number) => {
  const pts = Array.from({ length: 16 }, (_, k) => at(c, (k / 16) * 360, k % 4 === 0 ? r : k % 2 === 0 ? r * 0.55 : r * 0.2));
  return {
    outline: 'M' + pts.map(pt).join('L') + 'Z',
    ridges: Array.from({ length: 8 }, (_, k) => line(c, at(c, k * 45, k % 2 ? r * 0.55 : r))).join(''),
    /** Each point hatched down one side. */
    hatch: Array.from({ length: 8 }, (_, k) => hatch(c, pts[(k * 2 + 15) % 16], pts[k * 2], r * 0.09)).join(''),
  };
};

/**
 * An unreadable script written along the line from `p` to `q`: marks from
 * MARKS at `scale`, in words of two to four, picked by `rnd`, the line
 * centred between its ends. Each mark stands upright toward `up` degrees
 * (0 = the top of the page). Returns where each mark goes and what it is.
 */
export const script = (p: Pt, q: Pt, scale: number, up: number, rnd: () => number) => {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const step = 4.6 * scale;
  const ts: number[] = [];
  let s = step / 2;
  while (s <= len - step / 2) {
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n && s <= len - step / 2; i++, s += step) ts.push(s);
    s += step * 0.7;
  }
  const shift = (len - (ts.at(-1) ?? 0) - step / 2) / 2;
  return ts.map((t) => ({ at: lerp(p, q, (t + shift) / len), d: MARKS[Math.floor(rnd() * MARKS.length)], up }));
};
