// What the aura seals share (lib/auraEngraving, one file here for each aura):
// geometry for lines that stop short of what stands in front of them, a
// seal's ring, the four-pointed star, and the planets' grid for a sign.

import { at, f, hatch, lerp, line, pt, ring, transform, type Cut, type Hole, type Pt } from '../arcane.ts';
import { PLANET_SIGNS } from '../alchemy.ts';
import type { Plate } from '../cardEngraving.ts';

export const poly = (ps: Pt[]) => `M${ps.map(pt).join('L')}Z`;
export const disc = (c: Pt, r: number) => `M${pt([c[0] + r, c[1]])}A${f(r)} ${f(r)} 0 1 1 ${pt([c[0] - r, c[1]])}A${f(r)} ${f(r)} 0 1 1 ${pt([c[0] + r, c[1]])}Z`;
export const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
/** Where the light falls from: the upper left, as on the rest of the plate. */
export const LIGHT: Pt = [-0.6, -0.8];

/** Whether `q` lies inside the polygon `ps` (any shape). */
export function inPoly(q: Pt, ps: Pt[]) {
  let inside = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [a, b] = [ps[i], ps[j]];
    if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** How far `q` lies from the outline of `ps`. */
export function fromOutline(q: Pt, ps: Pt[]) {
  let best = Infinity;
  for (let i = 0; i < ps.length; i++) {
    const [a, b] = [ps[i], ps[(i + 1) % ps.length]];
    const d: Pt = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1] || 1)));
    best = Math.min(best, dist(q, [a[0] + d[0] * t, a[1] + d[1] * t]));
  }
  return best;
}
/** What a seal's own lines stop short of: shapes standing in front (any outline, kept `pad` clear of) and discs. */
export type Clear = { polys: Pt[][]; holes: Hole[]; pad: number };
export type Box = [number, number, number, number];
export const boxes = new WeakMap<Pt[], Box>();
/** The box round `ps` (kept, as each outline is tested many times). */
export function boxOf(ps: Pt[]): Box {
  let b = boxes.get(ps);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of ps) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    boxes.set(ps, b);
  }
  return b;
}
export const meets = (a: Box, b: Box, pad: number) => a[0] - pad <= b[2] && b[0] - pad <= a[2] && a[1] - pad <= b[3] && b[1] - pad <= a[3];
/** Only what in `s` comes near the box `b`: a line far from every shape is then drawn whole, untested. */
export function near(s: Clear, b: Box): Clear {
  return {
    polys: s.polys.filter((ps) => meets(boxOf(ps), b, s.pad)),
    holes: s.holes.filter((h) => meets([h.c[0] - h.r, h.c[1] - h.r, h.c[0] + h.r, h.c[1] + h.r], b, 0)),
    pad: s.pad,
  };
}
export const blocked = (q: Pt, s: Clear) =>
  s.holes.some((h) => dist(q, h.c) < h.r) ||
  s.polys.some((ps) => meets(boxOf(ps), [q[0], q[1], q[0], q[1]], s.pad) && (inPoly(q, ps) || fromOutline(q, ps) < s.pad));

/** A straight line from `p` to `q`, broken where it passes behind what `s` holds (found by walking it in small steps). */
export function cutLine(p: Pt, q: Pt, s: Clear) {
  s = near(s, [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]);
  if (!s.polys.length && !s.holes.length) return line(p, q);
  const n = Math.max(2, Math.ceil(dist(p, q) / 0.2));
  let d = '';
  let from: number | null = null;
  for (let i = 0; i <= n; i++) {
    const open = !blocked(lerp(p, q, i / n), s);
    if (open && from === null) from = i;
    if ((!open || i === n) && from !== null) {
      const to = open ? i : i - 1;
      if (to - from >= 2) d += line(lerp(p, q, from / n), lerp(p, q, to / n));
      from = null;
    }
  }
  return d;
}
/** Where a ring about `c` of radius `r` passes behind what `s` holds, as cuts in degrees (ring's `cuts`). */
export function ringCuts(c: Pt, r: number, s: Clear): Cut[] {
  s = near(s, [c[0] - r, c[1] - r, c[0] + r, c[1] + r]);
  if (!s.polys.length && !s.holes.length) return [];
  const cuts: Cut[] = [];
  let from: number | null = null;
  for (let a = 0; a <= 360; a += 0.5) {
    const hid = blocked(at(c, a, r), s);
    if (hid && from === null) from = a - 0.25;
    if ((!hid || a === 360) && from !== null) {
      cuts.push([from, a + 0.25]);
      from = null;
    }
  }
  return cuts;
}

/** Points from `p` to `q` along a circular arc bowed `s` to the left of the way from `p` to `q` (on screen; to the right if `s` < 0). */
export function bow(p: Pt, q: Pt, s: number, n: number): Pt[] {
  if (Math.abs(s) < 1e-6) return Array.from({ length: n + 1 }, (_, i) => lerp(p, q, i / n));
  const L = dist(p, q);
  const m = lerp(p, q, 0.5);
  const nrm: Pt = [(q[1] - p[1]) / L, -(q[0] - p[0]) / L];
  const rho = (L * L) / 4 / (2 * Math.abs(s)) + Math.abs(s) / 2;
  const o: Pt = [m[0] - nrm[0] * Math.sign(s) * (rho - Math.abs(s)), m[1] - nrm[1] * Math.sign(s) * (rho - Math.abs(s))];
  const a0 = Math.atan2(p[1] - o[1], p[0] - o[0]);
  let d = Math.atan2(q[1] - o[1], q[0] - o[0]) - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Array.from({ length: n + 1 }, (_, i) => [o[0] + rho * Math.cos(a0 + (d * i) / n), o[1] + rho * Math.sin(a0 + (d * i) / n)] as Pt);
}

/** A pointed blade along `spine` (its root first), `hw` either side at the root, tapering to its point: its outline, and its two edges. */
export function blade(spine: Pt[], hw: number, taper = 0.85) {
  const n = spine.length - 1;
  const [left, right]: Pt[][] = [[], []];
  spine.forEach((m, i) => {
    const [a, b] = [spine[Math.max(0, i - 1)], spine[Math.min(n, i + 1)]];
    const L = dist(a, b) || 1;
    const nrm: Pt = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    const w = hw * (1 - i / n) ** taper;
    left.push([m[0] + nrm[0] * w, m[1] + nrm[1] * w]);
    right.push([m[0] - nrm[0] * w, m[1] - nrm[1] * w]);
  });
  return { outline: [...left, ...right.slice(0, -1).reverse()], left, right };
}
/** A strip between two edges, as short pieces: what stops short of it tests one piece at a time, each with a small box, where the whole strip's box can span the seal. */
export const piecesOf = (left: Pt[], right: Pt[]) => left.slice(1).map((_, i) => [left[i], left[i + 1], right[i + 1], right[i]]);
/** A seal's double ring, broken at `cuts` (degrees). */
export function sealRing(p: Plate, c: Pt, r: number, cuts: Cut[] = [], inner = 1.3) {
  p.add(ring(c, r, { cuts }), 'thin');
  p.add(ring(c, r - inner, { cuts }), 'hair');
}

/**
 * A seal: drawn about `c`, its ring `R` across, what breaks out of it
 * reaching no further at a heading (degrees clockwise from the top) than
 * `room` gives. It adds to the plate's knockout what the plate stops short of.
 */
export type Seal = (p: Plate, c: Pt, R: number, room: (a: number) => number) => void;
/** A sign, `r` from its middle to its ends. */
export type Sign = (p: Plate, c: Pt, r: number) => void;
/** An aura's seal and its sign. */
export type AuraSeal = { seal: Seal; sign: Sign };

/** A four-pointed star at `c`, its long points `len` (up, right, down, left; `long` gives each its own) and four short ones between, `hw` across at their roots. */
export function fourStar(c: Pt, len: (a: number) => number, short: number, hw: number) {
  return [
    ...[0, 90, 180, 270].map((a) => [at(c, a - 90, hw), at(c, a, len(a)), at(c, a + 90, hw)] as Pt[]),
    ...[45, 135, 225, 315].map((a) => [at(c, a - 90, hw * 0.6), at(c, a, short), at(c, a + 90, hw * 0.6)] as Pt[]),
  ];
}
/** A star's points engraved: edges, and the larger ones a ridge and hatching down one side. */
export function engraveStar(p: Plate, points: Pt[][], hatched: boolean) {
  let edges = '';
  let shade = '';
  for (const [l, tip, r] of points) {
    edges += line(l, tip) + line(tip, r);
    if (!hatched) continue;
    const base = lerp(l, r, 0.5);
    shade += line(base, tip);
    const dark = (l[0] - base[0]) * LIGHT[0] + (l[1] - base[1]) * LIGHT[1] < 0 ? l : r;
    shade += hatch(base, dark, tip, 0.6);
  }
  p.add(edges, 'hair');
  p.add(shade, 'hatch');
}

/** The planets' grid (lib/alchemy) to a sign `r` from its middle to its ends. */
export const planet = (i: number, c: Pt, r: number) => transform(PLANET_SIGNS[i], c, r / 4.8);
