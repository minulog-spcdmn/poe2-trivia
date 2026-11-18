// The engraver's small tools for the zone sigils (lib/zoneSigils.ts and its
// sibling sets): polylines, arcs through three points, upright hatching, the
// cut where a line passes under another, and `placed`, which sets a whole
// sigil at a scale and an offset so every one sits alike in its seal.

import { line, pt, type Pt } from './arcane.ts';
import type { Sigil } from './zoneSigils.ts';

export const path = (pts: Pt[]) => 'M' + pts.map(pt).join('L');
export const closed = (pts: Pt[]) => path([...pts, pts[0]]);
/** `p` turned `a` degrees clockwise about `c`. */
export const rot = ([x, y]: Pt, a: number, c: Pt = [0, 0]): Pt => {
  const r = (a * Math.PI) / 180;
  const [dx, dy] = [x - c[0], y - c[1]];
  return [c[0] + dx * Math.cos(r) - dy * Math.sin(r), c[1] + dx * Math.sin(r) + dy * Math.cos(r)];
};
export const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [-x, y]);

/** Points along the circle through `p`, `m` and `q`, from `p` past `m` to `q`. */
export function arc3(p: Pt, m: Pt, q: Pt, n = 24): Pt[] {
  const [ax, ay] = p;
  const [bx, by] = m;
  const [cx, cy] = q;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const ang = ([x, y]: Pt) => Math.atan2(y - uy, x - ux);
  const a0 = ang(p);
  let a1 = ang(q);
  let am = ang(m);
  const norm = (a: number) => ((a - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  am = norm(am);
  a1 = norm(a1);
  const span = am < a1 ? a1 : a1 - 2 * Math.PI;
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = a0 + (span * k) / n;
    return [ux + r * Math.cos(a), uy + r * Math.sin(a)];
  });
}

/**
 * Upright hatching inside the simple polygon `ps`, from `x0` to `x1`, `gap`
 * apart, each stroke kept `pad` short of the outline.
 */
export function uprightSegs(ps: Pt[], x0: number, x1: number, gap = 1.1, pad = 0.6): Pt[][] {
  const out: Pt[][] = [];
  for (let x = x0; x <= x1 + 1e-6; x += gap) {
    const ys: number[] = [];
    ps.forEach((a, i) => {
      const b = ps[(i + 1) % ps.length];
      if (a[0] <= x !== b[0] <= x) ys.push(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
    });
    ys.sort((m, n) => m - n);
    for (let i = 0; i + 1 < ys.length; i += 2) {
      const [lo, hi] = [ys[i] + pad, ys[i + 1] - pad];
      if (hi - lo > 0.6) out.push([[x, lo], [x, hi]]);
    }
  }
  return out;
}
export const upright = (ps: Pt[], x0: number, x1: number, gap = 1.1, pad = 0.6) =>
  uprightSegs(ps, x0, x1, gap, pad)
    .map(([p, q]) => line(p, q))
    .join('');

/** Whether `p` lies inside the simple polygon `ps`. */
export function inside(ps: Pt[], [x, y]: Pt): boolean {
  let n = false;
  ps.forEach((a, i) => {
    const b = ps[(i + 1) % ps.length];
    if (a[1] > y !== b[1] > y && x < a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1])) n = !n;
  });
  return n;
}

/** How far `p` lies from the nearest edge of the polygon `ps`. */
export function edgeDist(ps: Pt[], p: Pt): number {
  let best = Infinity;
  ps.forEach((a, i) => {
    const b = ps[(i + 1) % ps.length];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  });
  return best;
}

/** The polyline `pts` kept only where `keep` holds: the engraver's cut where a line passes under another. */
export function kept(pts: Pt[], keep: (p: Pt) => boolean, step = 0.04): string {
  const runs: Pt[][] = [];
  let run: Pt[] | null = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const p: Pt = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      if (keep(p)) (run ??= (runs.push([]), runs[runs.length - 1])).push(p);
      else run = null;
    }
  }
  // Each run thinned to its turns, so the path stays short.
  return runs
    .filter((r) => r.length > 1)
    .map((r) => path(r.filter((p, i) => i === 0 || i === r.length - 1 || i % 8 === 0)))
    .join('');
}

/** How far `p` lies from the line through `o` along the unit vector `u`, and how far along it. */
export const across = (p: Pt, o: Pt, u: Pt) => {
  const [dx, dy] = [p[0] - o[0], p[1] - o[1]];
  return { off: Math.abs(dx * u[1] - dy * u[0]), along: dx * u[0] + dy * u[1] };
};

/** The segments `ss`, each a line of its own. */
export const segs = (ss: Pt[][]) => ss.map(([p, q]) => line(p, q)).join('');

/** An ember: a small diamond, `r` from its middle to each point, taller than wide. */
export const ember = ([x, y]: Pt, r: number): string =>
  closed([
    [x, y - r],
    [x + r * 0.55, y],
    [x, y + r],
    [x - r * 0.55, y],
  ]);

/** Corners about `c` on an oval rx by ry, from the top clockwise, each pushed out by `jit[i]` of its radius. */
export const ragged = (c: Pt, rx: number, ry: number, jit: number[]): Pt[] =>
  jit.map((j, i) => {
    const a = (i / jit.length) * 2 * Math.PI;
    return [c[0] + Math.sin(a) * rx * (1 + j), c[1] - Math.cos(a) * ry * (1 + j)];
  });

/** Points on the circle about `c` of radius `r`, from `a0` to `a1` radians (0 = right, y down, so positive turns downward). */
export const circ = (c: Pt, r: number, a0: number, a1: number, n = 24): Pt[] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / n;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  });

/** A bough as a polygon: along the curve from `a` through `m` to `b` (in `n` steps), `w0` across at its root narrowing to `w1`; its middle two points are the snapped end. */
export function bough(a: Pt, m: Pt, b: Pt, w0: number, w1: number, n = 10): Pt[] {
  const c = arc3(a, m, b, n);
  const off = (k: 1 | -1) =>
    c.map((p, i) => {
      const q = c[Math.min(i + 1, c.length - 1)];
      const o = c[Math.max(i - 1, 0)];
      const [dx, dy] = [q[0] - o[0], q[1] - o[1]];
      const d = Math.hypot(dx, dy);
      const hw = w0 + ((w1 - w0) * i) / (c.length - 1);
      return [p[0] - (k * dy * hw) / d, p[1] + (k * dx * hw) / d] as Pt;
    });
  return [...off(1), ...off(-1).reverse()];
}

/**
 * Solids made of polygons, nearest first: each solid's outline is the
 * union of its polygons, hidden where a nearer solid lies over it, and
 * left out where it runs along the floor at `floor`.
 */
export function solids(groups: Pt[][][], floor = Infinity, pad = 0.18) {
  const hidden = (p: Pt, g: number, d = pad) => groups.slice(0, g).some((ps) => ps.some((o) => inside(o, p) || edgeDist(o, p) < d));
  const inGroup = (p: Pt, g: number, but: Pt[]) => groups[g].some((o) => o !== but && inside(o, p));
  const lines = groups
    .map((ps, g) => ps.map((o) => kept([...o, o[0]], (p) => p[1] < floor - 0.05 && !hidden(p, g) && !inGroup(p, g, o))).join(''))
    .join('');
  /** Whether `p` lies on solid `g` and in sight, `d` clear of its outline. */
  const on = (p: Pt, g: number, d = 0.35) =>
    groups[g].some((o) => inside(o, p)) && groups[g].every((o) => inside(o, p) || edgeDist(o, p) > d) && !hidden(p, g, d);
  return { hidden, lines, on };
}

/** A row of icicles under the hem `y(x)`: each `[x, half width, length]`, a slim spike. */
export function icicles(spec: [number, number, number][], y: (x: number) => number): string {
  return spec.map(([x, hw, len]) => path([[x - hw, y(x - hw)], [x + 0.08, y(x) + len], [x + hw, y(x + hw)]])).join('');
}

/** Each icicle's ridge, a little left of its middle, where the light catches it. */
export function ridges(spec: [number, number, number][], y: (x: number) => number): string {
  return spec
    .filter(([, , len]) => len > 1.9)
    .map(([x, hw, len]) => line([x - hw * 0.25, y(x) + 0.35], [x + 0.02, y(x) + len * 0.68]))
    .join('');
}

/** A number as path data writes it: two decimals, no -0. */
const num = (v: number) => (Math.abs(v) < 0.005 ? '0' : v.toFixed(2).replace(/\.?0+$/, ''));

/** Path data `d` (absolute M, L, A and Z only) scaled by `k` about the origin, then moved by `dx`, `dy`. */
export function placedPath(d: string, k: number, dx: number, dy: number): string {
  if (!d) return d;
  const out: string[] = [];
  for (const [, cmd, args] of d.matchAll(/([MLAZ])([^MLAZ]*)/g)) {
    const n = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    if (cmd === 'Z') out.push('Z');
    else if (cmd === 'A') {
      const parts: string[] = [];
      for (let i = 0; i + 7 <= n.length; i += 7) {
        const [rx, ry, turn, large, sweep, x, y] = n.slice(i, i + 7);
        parts.push(`${num(rx * k)} ${num(ry * k)} ${num(turn)} ${large} ${sweep} ${num(x * k + dx)} ${num(y * k + dy)}`);
      }
      out.push('A' + parts.join(' '));
    } else {
      const parts: string[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) parts.push(`${num(n[i] * k + dx)} ${num(n[i + 1] * k + dy)}`);
      out.push(cmd + parts.join(cmd === 'M' ? 'L' : ' '));
    }
  }
  return out.join('');
}

/** A sigil scaled by `k` about the origin and moved by `dx`, `dy`: how a drawing is fitted to the set's circle without redrawing it. */
export const placed = (s: Sigil, k: number, dx = 0, dy = 0): Sigil => ({
  lines: placedPath(s.lines, k, dx, dy),
  fine: placedPath(s.fine, k, dx, dy),
  ...(s.shade ? { shade: placedPath(s.shade, k, dx, dy) } : {}),
});
