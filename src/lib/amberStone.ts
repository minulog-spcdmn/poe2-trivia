// A piece of amber, as the fossils' cards hold it (lib/fossilEngraving,
// AmberStone): a lump of resin tumbled smooth in the earth, as PoE's fossils
// are in their icons (public/fossils/), a rounded triangle standing on its
// broad foot, or on a row's narrow card a low dome. Computed, never placed
// (docs/arcane-style.md): its outline a few corners at fixed places, each
// worn round by its own amount; and what it holds, as real amber does:
// flakes of fracture, flat shards that catch the light, each lit along its
// edge turned to it; the folds the resin set in as it flowed, layer on
// layer, following its foot. The paint (lib/fossilAmber's paintAmber) and
// the engraving (AmberStone) both read it.
//
// Shared by whatever shows a fossil's amber: the card on the offer now, the
// reveal, the codex and the end screen to come.

import { type Pt } from './arcane.ts';

/** A flake of fracture in the resin: its corners in order round it, its edge turned to the light (the corners `edge` and the next), and how much light it catches (0 to 1). */
export type Flake = { pts: Pt[]; edge: number; lit: number };
export type Stone = {
  /** Its middle, and how far it reaches across and down from it. */
  c: Pt;
  rx: number;
  ry: number;
  /** Its outline, clockwise from the top: convex, smooth enough to draw as straight steps. */
  outline: Pt[];
  flakes: Flake[];
  /** The crests of the folds the resin set in, each a run of points. */
  folds: Pt[][];
  /** Where the light behind it shows through brightest, at rest. */
  lamp: Pt;
};
export type StoneShape = 'tall' | 'low';

/**
 * The corners of each shape (x across, y down, in its reaches from the
 * middle, clockwise from the top), and how far each is worn round: the
 * share of its two sides it takes.
 */
const CORNERS: Record<StoneShape, [number, number, number][]> = {
  // Its peak a little right of the middle, as the icons' often is; its foot broad and a little bowed.
  tall: [
    [0.08, -1, 0.3],
    [0.62, -0.38, 0.5],
    [0.95, 0.78, 0.3],
    [0.02, 1, 0.5],
    [-0.92, 0.82, 0.34],
    [-0.78, -0.2, 0.5],
  ],
  // A low dome, its crown a little left of the middle, on a flat foot.
  low: [
    [-0.12, -1, 0.45],
    [0.66, -0.66, 0.45],
    [1, 0.32, 0.36],
    [0.72, 1, 0.3],
    [-0.74, 1, 0.3],
    [-1, 0.3, 0.36],
    [-0.72, -0.64, 0.45],
  ],
};

/**
 * The flakes, by eye, kept off the middle where the item lies: where (across
 * and down, in reaches), how large (a share of the greater reach), turned how
 * far (degrees), and how much light each catches. A rare's amber holds more
 * of them, the sun spangles heat leaves in it.
 */
const FLAKES: [number, number, number, number, number][] = [
  [-0.5, -0.38, 0.26, 24, 0.85],
  [0.42, -0.5, 0.2, -38, 0.6],
  [0.6, 0.22, 0.22, 72, 0.5],
  [-0.62, 0.36, 0.2, -16, 0.55],
  [0.14, 0.66, 0.17, 8, 0.45],
  [-0.08, -0.74, 0.15, 52, 0.7],
];
const RARE_FLAKES: [number, number, number, number, number][] = [
  [0.3, -0.12, 0.13, -62, 0.5],
  [-0.3, 0.1, 0.12, 38, 0.45],
  [0.66, -0.12, 0.12, 14, 0.75],
  [-0.4, 0.66, 0.14, 64, 0.6],
  [0.36, 0.5, 0.11, -28, 0.7],
];
/** A shard's corners: at these turns round its middle (degrees) and these shares of its size, long and thin. */
const SHARD: [number, number][] = [
  [0, 1],
  [80, 0.34],
  [172, 0.82],
  [268, 0.3],
];
/** The plate's light, from the upper left. */
const TO_LIGHT: Pt = [-0.6, -0.8];

const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const centroid = (ps: Pt[]): Pt => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];

/** A closed polygon's corners cut, `n` times over (Chaikin's): a smooth curve, still convex if it was. */
function chaikin(ps: Pt[], n: number): Pt[] {
  let out = ps;
  for (let k = 0; k < n; k++) out = out.flatMap((a, i) => [lerp(a, out[(i + 1) % out.length], 0.25), lerp(a, out[(i + 1) % out.length], 0.75)]);
  return out;
}

/** A piece of amber about `c`, `rx` across and `ry` down from its middle, of `shape`; a rare's holds more flakes. */
export function pebble(c: Pt, rx: number, ry: number, shape: StoneShape = 'tall', rare = false): Stone {
  const corners = CORNERS[shape];
  // Each side from a little after one corner to a little before the next, by how far each is worn.
  const sides: Pt[] = [];
  corners.forEach(([x, y, k], i) => {
    const [nx, ny, nk] = corners[(i + 1) % corners.length];
    sides.push(lerp([x, y], [nx, ny], k * 0.5), lerp([x, y], [nx, ny], 1 - nk * 0.5));
  });
  const unit = chaikin(sides, 4);
  // Filling its box exactly.
  const xs = unit.map((p) => p[0]);
  const ys = unit.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const place = ([x, y]: Pt): Pt => [c[0] - rx + ((x - x0) / (x1 - x0)) * 2 * rx, c[1] - ry + ((y - y0) / (y1 - y0)) * 2 * ry];
  const outline = unit.map(place);
  const top = outline.reduce((m, p, i) => (p[1] < outline[m][1] ? i : m), 0);
  const ordered = [...outline.slice(top), ...outline.slice(0, top)];
  const R = Math.max(rx, ry);
  const flakes = [...FLAKES, ...(rare ? RARE_FLAKES : [])].map(([u, v, size, turn, lit]) => {
    const m: Pt = [c[0] + u * rx, c[1] + v * ry];
    const pts = SHARD.map(([a, k]) => {
      const t = ((a + turn) * Math.PI) / 180;
      return [m[0] + Math.cos(t) * size * R * k, m[1] + Math.sin(t) * size * R * k] as Pt;
    });
    // Its edge turned most to the light.
    let edge = 0;
    let best = -Infinity;
    pts.forEach((a, i) => {
      const e = lerp(a, pts[(i + 1) % pts.length], 0.5);
      const [dx, dy] = [e[0] - m[0], e[1] - m[1]];
      const f = (dx * TO_LIGHT[0] + dy * TO_LIGHT[1]) / (Math.hypot(dx, dy) || 1);
      if (f > best) [best, edge] = [f, i];
    });
    return { pts, edge, lit: rare ? Math.min(1, lit * 1.15) : lit };
  });
  // The folds: the foot's curve again, drawn in toward a point high in the stone, three times
  // over, each broken where the flow's layer ran thin.
  const anchor: Pt = [c[0] + rx * 0.05, c[1] - ry * 0.55];
  const n = ordered.length;
  // Each point's outward normal's downward share (clockwise on the page, a side's (-dy, dx) points out).
  const footward = ordered.map((_, i) => {
    const [a, b] = [ordered[(i + n - 1) % n], ordered[(i + 1) % n]];
    return (b[0] - a[0]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
  });
  const folds: Pt[][] = [];
  for (const [k, from, to] of [
    [0.9, 0.12, 0.88],
    [0.78, 0.04, 0.58],
    [0.67, 0.5, 0.94],
  ] as const) {
    // (In order along the foot: the outline starts at the top, so its foot runs on unbroken.)
    const run = ordered.filter((_, i) => footward[i] < -0.42).map((p) => lerp(anchor, p, k));
    if (run.length < 4) continue;
    folds.push(run.slice(Math.floor(run.length * from), Math.ceil(run.length * to)));
  }
  return { c, rx, ry, outline: ordered, flakes, folds, lamp: [c[0] - rx * 0.08, c[1] + ry * 0.04] };
}

/** A closed polygon as path data. */
export const polyPath = (ps: Pt[]) => `${runPath(ps)}Z`;
/** An open run of points as path data. */
export const runPath = (ps: Pt[]) => `M${ps.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L')}`;

/** A convex polygon `ps` (clockwise on the page) moved in by `d` (out, if negative): each side moved, the corners where they meet. */
export function inset(ps: Pt[], d: number): Pt[] {
  const c = centroid(ps);
  const sides = ps.map((a, i) => {
    const b = ps[(i + 1) % ps.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let nx = -(b[1] - a[1]) / len;
    let ny = (b[0] - a[0]) / len;
    // Toward the middle.
    if (nx * (c[0] - a[0]) + ny * (c[1] - a[1]) < 0) [nx, ny] = [-nx, -ny];
    return { a: [a[0] + nx * d, a[1] + ny * d] as Pt, u: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] as Pt };
  });
  return sides.map((s, i) => {
    const prev = sides[(i + sides.length - 1) % sides.length];
    const den = prev.u[0] * s.u[1] - prev.u[1] * s.u[0];
    if (Math.abs(den) < 1e-9) return s.a;
    const t = ((s.a[0] - prev.a[0]) * s.u[1] - (s.a[1] - prev.a[1]) * s.u[0]) / den;
    return [prev.a[0] + prev.u[0] * t, prev.a[1] + prev.u[1] * t];
  });
}

/** How far a line out of `c` at `deg` (clockwise from the top) runs before it leaves the convex polygon `ps` (c inside it). */
export function reachIn(ps: Pt[], c: Pt, deg: number): number {
  const u: Pt = [Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)];
  let best = Infinity;
  for (let i = 0; i < ps.length; i++) {
    const [a, b] = [ps[i], ps[(i + 1) % ps.length]];
    const e: Pt = [b[0] - a[0], b[1] - a[1]];
    const den = u[0] * e[1] - u[1] * e[0];
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - c[0]) * e[1] - (a[1] - c[1]) * e[0]) / den;
    const s = ((a[0] - c[0]) * u[1] - (a[1] - c[1]) * u[0]) / den;
    if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t);
  }
  return best;
}

// ---- the surface ----------------------------------------------------------------

const seg = (p: Pt, q: Pt) => `M${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}`;
/** A point in the stone at `deg` (clockwise from the top) and `k` of its reach that way. */
const within = (st: Stone, deg: number, k: number): Pt => [st.c[0] + Math.sin((deg * Math.PI) / 180) * st.rx * k, st.c[1] - Math.cos((deg * Math.PI) / 180) * st.ry * k];
/** A point's heading from the stone's middle, clockwise from the top (degrees, 0 to 360). */
const headingOf = (st: Stone, p: Pt) => ((((Math.atan2(p[0] - st.c[0], -(p[1] - st.c[1])) * 180) / Math.PI) % 360) + 360) % 360;
/** How far heading `h` lies from `about` round the circle (degrees, 0 to 180). */
const apart = (h: number, about: number) => Math.abs(((((h - about) % 360) + 540) % 360) - 180);

/**
 * Bubbles in the resin, as real amber holds them: where (a heading and a
 * share of the reach) and how large (a share of it), by eye, none on the
 * middle where the item lies.
 */
const BUBBLES: [number, number, number][] = [
  [-42, 0.7, 0.024],
  [-31, 0.76, 0.012],
  [116, 0.66, 0.017],
  [204, 0.74, 0.022],
  [258, 0.64, 0.013],
];
/** A rare's sun spangles catching the light in turn, a flash along a flake's lit edge: which flakes, and when each catches it (s into its round). */
const SPANGLES: [number, number][] = [
  [0, 0],
  [6, 2.6],
  [2, 1.3],
  [8, 3.9],
  [1, 5.1],
  [9, 0.7],
  [3, 4.5],
];

/**
 * What the stone's surface shows over what it holds (AmberStone): the side
 * away from the light shaded in lines that follow its round, each shorter
 * than the one outside it; the polish's gloss along the side turned to the
 * light, and a sharp catch of it high on the shoulder; each flake's lit edge
 * (which the glint runs over); bubbles; a rare's spangles.
 */
export function surfaceOf(st: Stone) {
  const R = Math.min(st.rx, st.ry);
  const heads = st.outline.map((p) => headingOf(st, p));
  // The shading: lines inside the outline, a step apart, about the lower right, each spanning less.
  let shade = '';
  for (let k = 1; k <= 4; k++) {
    const ring = inset(st.outline, k * 1.15);
    const span = 80 - k * 15;
    let run: Pt[] = [];
    const flush = () => {
      if (run.length > 1) shade += runPath(run);
      run = [];
    };
    // (Started where the outline is far from the lower right, so no run is cut at the start.)
    const start = heads.reduce((m, h, i) => (apart(h, 318) < apart(heads[m], 318) ? i : m), 0);
    for (let j = 0; j < ring.length; j++) {
      const i = (start + j) % ring.length;
      if (apart(heads[i], 138) < span) run.push(ring[i]);
      else flush();
    }
    flush();
  }
  // The gloss: a sliver along the upper left, widest about 312°, from the outline in.
  const near = inset(st.outline, 1.1);
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  const start = heads.reduce((m, h, i) => (apart(h, 132) < apart(heads[m], 132) ? i : m), 0);
  for (let j = 0; j < near.length; j++) {
    const i = (start + j) % near.length;
    const off = apart(heads[i], 312);
    if (off > 62) continue;
    const w = R * 0.09 * Math.cos(((off / 62) * Math.PI) / 2) ** 1.4;
    const q = near[i];
    const [dx, dy] = [st.c[0] - q[0], st.c[1] - q[1]];
    const len = Math.hypot(dx, dy) || 1;
    outer.push(q);
    inner.push([q[0] + (dx / len) * w, q[1] + (dy / len) * w]);
  }
  const gloss = outer.length > 2 ? polyPath([...outer, ...inner.reverse()]) : '';
  const at = within(st, 318, 0.76);
  const along: Pt = [0.8, -0.6];
  const catchLight = seg([at[0] - along[0] * R * 0.08, at[1] - along[1] * R * 0.08], [at[0] + along[0] * R * 0.08, at[1] + along[1] * R * 0.08]);
  const edges = st.flakes.map(({ pts, edge }) => seg(pts[edge], pts[(edge + 1) % pts.length])).join('');
  const bubbles = BUBBLES.map(([deg, k, r]) => ({ c: within(st, deg, k), r: r * R * 2 }));
  // (Each along its flake's lit edge: its middle, its length and its turn.)
  const spangles = SPANGLES.filter(([i]) => i < st.flakes.length).map(([i, t]) => {
    const { pts, edge } = st.flakes[i];
    const [p, q] = [pts[edge], pts[(edge + 1) % pts.length]];
    return { c: lerp(p, q, 0.5), len: Math.hypot(q[0] - p[0], q[1] - p[1]), turn: (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI, t };
  });
  return { shade, gloss, catchLight, edges, bubbles, spangles };
}
