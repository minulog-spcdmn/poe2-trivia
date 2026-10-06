// The zone banners' engraver (src/components/zonebanner): lines in px on the
// head of the stage, drawn as the alchemist's circle draws its own
// (docs/arcane-style.md). A line is a polyline that the pen sweeps once,
// fast at first and slowing at the end; it is broken where it meets a hole
// (a circle or a box round the name or a sign) and, if worn, at its nicks,
// and each piece starts when the pen reaches it, so a broken line still
// draws as one stroke rather than as scattered dashes.

import { seeded } from '../../lib/arcane.ts';

export type Pt = [number, number];
/** main: an outline; thin: a second line; hair: the finest; hatch: shading. */
export type Kind = 'main' | 'thin' | 'hair' | 'hatch';
/** A piece of a line, when the pen reaches it and how long it takes over it (s). */
export type Stroke = { d: string; kind: Kind; delay: number; t: number };
/** What lines stop short of: a circle, or a box (x0, y0, x1, y1). */
export type Hole = { c: Pt; r: number } | { box: [number, number, number, number] };

const f = (v: number) => v.toFixed(2);
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);

const inHole = (p: Pt, h: Hole) =>
  'c' in h ? dist(p, h.c) < h.r : p[0] > h.box[0] && p[0] < h.box[2] && p[1] > h.box[1] && p[1] < h.box[3];

/** The polyline through `pts`, cut into points about `step` apart. */
function dense(pts: Pt[], step = 0.4): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [p, q] = [pts[i - 1], pts[i]];
    const n = Math.max(1, Math.ceil(dist(p, q) / step));
    for (let k = 1; k <= n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return out;
}

/** Path data through `pts`, leaving out points on a straight run. */
export function poly(pts: Pt[], close = false) {
  const keep = pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const [a, b] = [pts[i - 1], pts[i + 1]];
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 0.01;
  });
  return 'M' + keep.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + (close ? 'Z' : '');
}

/** Points round the circle about `c`, from `a0` to `a1` degrees (0 to the right, clockwise on screen). */
export function arcPts(c: Pt, r: number, a0: number, a1: number): Pt[] {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * Math.PI * r) / 180 / 0.6));
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as Pt;
  });
}

/** The plate's wear: nicks (0.5 to 0.9 px) every 110 px or so, from a fixed seed, as cuts in [0, 1]. */
export const wearOf = (seed: number) => {
  const rnd = seeded(seed);
  return (len: number): [number, number][] =>
    Array.from({ length: Math.round((len / 110) * (0.4 + rnd() * 1.2)) }, () => {
      const t = 0.12 + rnd() * 0.76;
      const w = (0.5 + rnd() * 0.4) / len;
      return [t - w / 2, t + w / 2];
    });
};
export type Wear = ReturnType<typeof wearOf> | null;

export type PenOpts = { holes?: Hole[]; wear?: Wear; ease?: boolean };

/**
 * A line through `pts` drawn by the pen in `t` seconds after `delay`, as its
 * pieces (see the top). `ease`: the pen slows toward the end (the circle's
 * stroke()); otherwise it keeps one pace.
 */
export function pen(pts: Pt[], kind: Kind, delay: number, t: number, { holes = [], wear = null, ease = true }: PenOpts = {}): Stroke[] {
  const ds = dense(pts);
  const run = [0];
  for (let i = 1; i < ds.length; i++) run.push(run[i - 1] + dist(ds[i - 1], ds[i]));
  const len = run.at(-1)! || 1;
  const cuts = wear ? wear(len) : [];
  const gone = ds.map((p, i) => holes.some((h) => inHole(p, h)) || cuts.some(([a, b]) => run[i] / len > a && run[i] / len < b));
  const when = (y: number) => (ease ? 1 - Math.sqrt(1 - Math.min(1, Math.max(0, y))) : y);
  const out: Stroke[] = [];
  let i = 0;
  while (i < ds.length) {
    if (gone[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < ds.length && !gone[j + 1]) j++;
    if (j > i) {
      const [a, b] = [run[i] / len, run[j] / len];
      out.push({ d: poly(ds.slice(i, j + 1)), kind, delay: delay + when(a) * t, t: Math.max(0.03 * t, (when(b) - when(a)) * t) });
    }
    i = j + 1;
  }
  return out;
}

/**
 * Engraver's shading across the triangle `o`, `l`, `t`: lines parallel to
 * its side from `o` to `t`, stepping toward `l`, `gap` apart (as lib/arcane's
 * hatch), each one stroke drawn at `delay`.
 */
export function hatch(o: Pt, l: Pt, t: Pt, gap: number, delay: number, dur: number, holes: Hole[] = []): Stroke[] {
  const n = Math.floor(dist(o, l) / gap);
  const lerp = (p: Pt, q: Pt, s: number): Pt => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
  return Array.from({ length: n }, (_, i) => {
    const s = (i + 1) / (n + 1);
    return pen([lerp(o, l, s), lerp(t, l, s)], 'hatch', delay + (i / Math.max(1, n)) * dur, dur * 0.5, { holes, ease: false });
  }).flat();
}

/** The same strokes without their timing, merged by kind: the glow under the lines. */
export function glowOf(strokes: Stroke[]): { d: string; kind: Kind }[] {
  const by = new Map<Kind, string>();
  for (const s of strokes) if (s.kind !== 'hatch') by.set(s.kind, (by.get(s.kind) ?? '') + s.d);
  return [...by].map(([kind, d]) => ({ kind, d }));
}
