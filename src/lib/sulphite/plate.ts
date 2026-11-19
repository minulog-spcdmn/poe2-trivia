// The Sulphite card's plate (the Sulphite rush, a prototype: delve.ts
// rushOf): the category card that carries sulphite, engraved by the same
// hand as the finds' (lib/findEngraving), a Variant of its own as the way
// out's is (lib/wayOut). Voltaxic Sulphite is the charged ore Niko mines to
// run his crawler, whose light holds back the dark: here an ore that throws
// lightning.
//
// • The emblem floats over its pedestal in a ring of bolts struck off it
//   all round, as the flare's rays ring its emblem: out through the arch or
//   striking it, the arch's lines stopping short of them as the band's
//   rings stop at a seal; the lowest two reach down beside the pedestal,
//   short of the floor (the owner, 18 Nov: "maybe also lightning from the
//   image circle extending a bit down so there is not so much empty
//   space"). What stood there before, the ore heaped in chunks, then one
//   bolt off the seal to the floor, never read: "maybe a version without
//   the chunks", then "the whole strike idea is bad".
// • A bolt is lightning as a hand draws it: a few straight strokes, each
//   turn thrown to the other side by a different amount, so it zigzags
//   without repeating, as wide most of the way and then running out to a
//   point; one short spur at most, carrying on where the bolt turned.
//   Engraved as the finds' rays are: two edges, a hatched half. At rest it
//   is only engraved; the charge over the face (SulphiteCharge.svelte)
//   lights it.
// • In Sol's place its seal: a crystal of the ore in a ring, six darts struck
//   off it, long and short in turn; in Luna's, the Leviathan cross,
//   alchemy's other sign for sulphur (the flare's is the fire on a cross).
// • The back holds the seal in a glory. Laid in a row, the ring and its
//   bolts round the emblem, the rest bare, as the flare's row is.
//
// Every bolt is computed, never drawn by hand: from a seed, so
// every card is cut alike. The charge lights the same bolts, read from
// boltsAt.

import { arc, at, lerp, line, pt, rad, type Hole, type Pt } from '../arcane.ts';
import type { BackLayout, Plate, RowLayout, TallLayout, Variant } from '../cardEngraving.ts';
import { grow, poly, seg, NONE, type Shields } from '../findEngraving.ts';

// ---- geometry -------------------------------------------------------------------

const sub = (p: Pt, q: Pt): Pt => [p[0] - q[0], p[1] - q[1]];
const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]];
const mul = (p: Pt, k: number): Pt => [p[0] * k, p[1] * k];
const dot = (p: Pt, q: Pt) => p[0] * q[0] + p[1] * q[1];
const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const unit = (p: Pt): Pt => {
  const l = Math.hypot(p[0], p[1]) || 1;
  return [p[0] / l, p[1] / l];
};
/** The direction `a` degrees clockwise from the top. */
const dir = (a: number): Pt => [Math.sin(rad(a)), -Math.cos(rad(a))];
/** The heading of `d`, in degrees clockwise from the top. */
const heading = (d: Pt) => (Math.atan2(d[0], -d[1]) * 180) / Math.PI;
/** A disc, as path data. */
const disc = (c: Pt, r: number) => `M${pt([c[0] + r, c[1]])}A${r} ${r} 0 1 1 ${pt([c[0] - r, c[1]])}A${r} ${r} 0 1 1 ${pt([c[0] + r, c[1]])}Z`;
/** A disc as a polygon, for what stops short of it. */
const round = (c: Pt, r: number, n = 48): Pt[] => Array.from({ length: n }, (_, i) => at(c, (i * 360) / n, r));
/** An open polyline through `ps`, broken where it passes behind a shield. */
const path = (ps: Pt[], s: Shields = NONE) => ps.slice(1).reduce((d, q, i) => d + seg(ps[i], q, s), '');
/** Where the light falls from: the upper left, as on the rest of the plate. */
const LIGHT: Pt = unit([-0.6, -0.8]);

/** A fixed run of numbers in [0, 1) from `seed` (mulberry32): the same card every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the bolts ------------------------------------------------------------------

/** A bolt laid out: its centreline from root to tip, its half width at each point, its heading (where it leaves the ring: the charge strikes them from its foot up), and its spurs. */
export type Bolt = { pts: Pt[]; hw: number[]; heading: number; forks: Bolt[] };

/** Half widths down a path: `w` most of the way, running out to a point at its tip, never finer than a hair before it. */
function taper(ps: Pt[], w: number) {
  const run = ps.map((_, i) => ps.slice(1, i + 1).reduce((s, q, j) => s + dist(ps[j], q), 0));
  const all = run.at(-1) || 1;
  return run.map((l, i) => (i === ps.length - 1 ? 0 : Math.max(0.2, w * (1 - (l / all) ** 1.8))));
}

/**
 * A bolt as lightning is drawn: `n` straight strokes from `root` to `tip`,
 * each turn thrown to the other side of its line, by a different amount and
 * at a different place along it, so it zigzags without repeating; `w`
 * across its root's half.
 */
function bolt(root: Pt, tip: Pt, w: number, seed: number, n = 5): Bolt {
  const r = rng(seed);
  const d = sub(tip, root);
  const L = Math.hypot(d[0], d[1]);
  const side = unit([-d[1], d[0]]);
  let s = r() < 0.5 ? -1 : 1;
  const turns = Array.from({ length: n - 1 }, (_, i) => {
    s = -s;
    const t = (i + 0.65 + r() * 0.7) / n;
    return add(lerp(root, tip, t), mul(side, s * (0.05 + r() * 0.08) * L));
  });
  const pts = [root, ...turns, tip];
  return { pts, hw: taper(pts, w), heading: heading(d), forks: [] };
}

/**
 * Its spur: at one of its turns, carrying straight on (as lightning
 * branches, the bolt turning away from it), a third to a half of what's
 * left of the bolt long; dropped where it would leave `room`.
 */
function spur(b: Bolt, seed: number, room?: (q: Pt) => boolean) {
  const r = rng(seed * 7 + 3);
  const i = 1 + Math.floor(r() * (b.pts.length - 3));
  const left = b.pts.slice(i + 1).reduce((s, q, k) => s + dist(b.pts[i + k], q), 0);
  const a = heading(sub(b.pts[i], b.pts[i - 1])) + (r() * 2 - 1) * 8;
  const f = bolt(b.pts[i], at(b.pts[i], a, left * (0.34 + r() * 0.16)), Math.max(0.35, b.hw[i] * 0.6), seed * 13, 3);
  if (!room || f.pts.every(room)) b.forks.push(f);
}

/** Its two edges (`grow` out), each ending at its tip: at each point the half width out along the mitre, the tip the point itself. */
function edges(b: Bolt, grow = 0) {
  const n = b.pts.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const norm = (i: number): Pt => {
    const d = unit(sub(b.pts[i + 1], b.pts[i]));
    return [-d[1], d[0]];
  };
  for (let i = 0; i < n - 1; i++) {
    const m = unit(add(i > 0 ? norm(i - 1) : norm(i), norm(i)));
    const w = (b.hw[i] + grow) * Math.min(2.2, 1 / Math.max(0.3, dot(m, norm(i))));
    left.push(add(b.pts[i], mul(m, w)));
    right.push(sub(b.pts[i], mul(m, w)));
  }
  // The tip, carried on a little when grown, so what stops short of it stops short of its point too.
  const tip = add(b.pts[n - 1], mul(unit(sub(b.pts[n - 1], b.pts[n - 2])), grow * 1.6));
  return { left: [...left, tip], right: [...right, tip] };
}

/** Its outline (`grow` out from its edges), as one closed shape. */
function outline(b: Bolt, grow = 0): Pt[] {
  const { left, right } = edges(b, grow);
  return [...left, ...right.slice(0, -1).reverse()];
}

/** Its strokes as convex shapes, `grow` out: what a spur leaving it stops short of. */
const strokes = (b: Bolt, grow: number) => {
  const { left, right } = edges(b, grow);
  return b.pts.slice(1).map((_, i) => [left[i], left[i + 1], right[i + 1], right[i]]);
};

/**
 * A bolt engraved, with its spur: its two edges closing at its tip, a hair
 * down its middle, and the half turned from the light hatched across, as
 * the find cards' rays are. The spur stops short of the bolt it leaves; the
 * plate stops short of both.
 */
function cut(p: Plate, b: Bolt, gap = 0.7) {
  for (const x of [b, ...b.forks]) {
    const s: Shields = x === b ? NONE : { polys: strokes(b, 0.3), holes: [] };
    const { left, right } = edges(x);
    p.add(path(left, s) + path(right, s), 'thin');
    p.add(path(x.pts.slice(0, -1), s), 'hair');
    let shade = '';
    for (let i = 0; i + 1 < x.pts.length; i++) {
      const [c0, c1] = [x.pts[i], x.pts[i + 1]];
      const d = unit(sub(c1, c0));
      // The half whose face looks away from the light.
      const [e0, e1] = dot([-d[1], d[0]], LIGHT) < 0 ? [left[i], left[i + 1]] : [right[i], right[i + 1]];
      const steps = Math.floor(dist(c0, c1) / gap);
      for (let j = 1; j < steps; j++) {
        const t = j / steps;
        const [c, e] = [lerp(c0, c1, t), lerp(e0, e1, t)];
        if (dist(c, e) > 0.6) shade += seg(lerp(c, e, 0.25), lerp(c, e, 0.9), s);
      }
    }
    p.add(shade, 'hatch');
    p.knockout += poly(outline(x, 1.1));
  }
}

/** A dart cut: one swelling line, filled (at a seal's size, the hatched bolt would close up). */
function cutSmall(p: Plate, b: Bolt) {
  p.add(poly(outline(b)), 'fill');
  p.knockout += poly(outline(b, 1.1));
}

/**
 * Bolts struck off a ring about `c`, `r0` across: each at its heading `a`,
 * out to `end` from `c`, `w` at its root, zigzagging by its `seed`, a spur
 * if `spurs`, kept in `room`. Returns them.
 */
function strike(p: Plate, c: Pt, r0: number, heads: { a: number; end: number; w: number; spurs: boolean; seed: number; n?: number }[], k: number, room?: (q: Pt) => boolean) {
  const out: Bolt[] = [];
  for (const { a, end, w, spurs, seed, n = 5 } of heads) {
    if (end - r0 < 6 * k) continue;
    const b = bolt(at(c, a, r0 + 0.2), at(c, a, end), w, seed, n);
    b.heading = a;
    if (spurs) spur(b, seed, room);
    cut(p, b);
    out.push(b);
  }
  return out;
}

/** A dart of the seal: a bolt as heraldry draws it, broken once each way, `r0` to `r1` out from `c` at `a`. */
function dart(c: Pt, a: number, r0: number, r1: number, w: number): Bolt {
  const len = r1 - r0;
  const n = dir(a + 90);
  const P = (t: number, o: number) => add(at(c, a, r0 + 0.2 + t * len), mul(n, o * len));
  const pts = [P(0, 0), P(0.46, 0.08), P(0.53, -0.05), P(1, 0)];
  return { pts, hw: taper(pts, w), heading: a, forks: [] };
}

// ---- the ring and the seal ------------------------------------------------------

/** The ring the bolts strike off, drawn double, shaded inside on the right, away from the light. */
function charged(p: Plate, c: Pt, r: number) {
  p.add(arc(c, r - 0.4, 0, 360), 'thin');
  p.add(arc(c, r - 2, 0, 360), 'hair');
  let h = '';
  for (let a = 20; a <= 160; a += 4) h += line(at(c, a, r - 2.6), at(c, a, r - 2.6 - 2.2 * Math.sin(rad(a))));
  p.add(h, 'hatch');
}

/** Lines across the triangle `o`, `l`, `t` parallel to its side `o` to `t`. */
function hatchTri(o: Pt, l: Pt, t: Pt, gap: number) {
  const n = Math.floor(dist(l, o) / gap);
  let out = '';
  for (let i = 1; i <= n; i++) {
    const k = i / (n + 1);
    out += seg(lerp(o, l, k), lerp(t, l, k));
  }
  return out;
}

/**
 * The seal's crystal of the ore: two pyramids base to base, pointed at both
 * ends, about `c`, `len` from tip to tip along `a`, `hw` across its waist;
 * its outline, the ridge tip to tip down its front and its waist, the two
 * faces turned from the light hatched along it.
 */
function crystal(p: Plate, c: Pt, a: number, len: number, hw: number, gap: number) {
  const [u, n] = [dir(a), dir(a + 90)];
  const [top, foot] = [add(c, mul(u, len / 2)), sub(c, mul(u, len / 2))];
  const [l, r] = [add(c, mul(n, -hw)), add(c, mul(n, hw))];
  const ridge = add(c, mul(n, hw * -0.22));
  const side = dot(n, LIGHT) < 0 ? r : l;
  p.add(path([top, r, foot, l, top]), 'thin');
  p.add(path([top, ridge, foot]) + seg(l, ridge) + seg(ridge, r), 'hair');
  p.add(hatchTri(ridge, side, top, gap) + hatchTri(ridge, side, foot, gap), 'hatch');
}

// ---- the faces ------------------------------------------------------------------

/** How far a line out of `c` at `a` runs before it meets a hole, or null. */
const throughHole = (c: Pt, a: number, h: Hole) => {
  const u = dir(a);
  const [fx, fy] = [c[0] - h.c[0], c[1] - h.c[1]];
  const b = fx * u[0] + fy * u[1];
  const d = b * b - (fx * fx + fy * fy - h.r * h.r);
  return d > 0 && -b - Math.sqrt(d) > 0 ? -b - Math.sqrt(d) : null;
};

/** How far a line out of `c` at `a` runs before it meets the arch's outer line, on a tall face. */
const toArch = (c: Pt, a: number, g: TallLayout) => {
  const u = dir(a);
  const { A, ro } = g.arch;
  const [fx, fy] = [c[0] - A[0], c[1] - A[1]];
  const b = fx * u[0] + fy * u[1];
  const t = -b + Math.sqrt(b * b - (fx * fx + fy * fy - ro * ro));
  if (c[1] + u[1] * t > A[1]) return (u[0] > 0 ? A[0] + ro - c[0] : A[0] - ro - c[0]) / u[0];
  return t;
};

/** What the charge lights on a plate: its bolts and the ring they strike off. */
export type Laid = { bolts: Bolt[]; ring: { c: Pt; r: number } };
const laid = new Map<string, Laid>();
const KEEP = 12;
const remember = (key: string, v: Laid) => {
  if (laid.size >= KEEP && !laid.has(key)) laid.delete(laid.keys().next().value!);
  laid.set(key, v);
};

/**
 * The bolts the face (or back) of a card `w` by `h` was engraved with and
 * the ring they strike off, in the plate's pixels; null if it hasn't been
 * engraved on this page.
 */
export const boltsAt = (side: 'face' | 'back', w: number, h: number) => laid.get(`${side} ${w} ${h}`) ?? null;

/** The tall face: bolts struck off the ring all round, out through the arch or striking it. */
function tall(p: Plate, g: TallLayout) {
  const k = g.w / 218;
  const C = g.emblem;
  const r0 = 64 * k;
  charged(p, C, r0);
  // Short of the seals in the spandrels and the plaque over the keystone.
  const holes: Hole[] = [
    { c: g.sol.c, r: SEAL * k * 0.86 + 3 },
    { c: g.luna.c, r: g.luna.r + 3 },
  ];
  const plaque = { x: 54 * k, y: 30 };
  const room = (q: Pt) =>
    q[0] > g.inner[0] + 2 && q[0] < g.inner[2] - 2 && q[1] > g.inner[1] + 2 && !(q[1] < plaque.y + 2 && Math.abs(q[0] - C[0]) < plaque.x + 2) && holes.every((h) => dist(q, h.c) > h.r);
  // Each heading's run: out to just short of the panel's inner line (breaking through the arch), or
  // ending on the arch; short of the seals and the plaque.
  const reach = (a: number, through: boolean) => {
    const u = dir(a);
    const xs = u[0] > 0 ? (g.inner[2] - 3 - C[0]) / u[0] : (g.inner[0] + 3 - C[0]) / u[0];
    const ys = u[1] < 0 ? (g.inner[1] + 3 - C[1]) / u[1] : Infinity;
    let end = through ? Math.min(xs, ys) : toArch(C, a, g) - 1.2 * k;
    for (const h of holes) {
      const t = throughHole(C, a, h);
      if (t !== null) end = Math.min(end, t - 2);
    }
    const tp = (C[1] - plaque.y) / -u[1];
    if (u[1] < 0 && Math.abs(u[0] * tp) < plaque.x) end = Math.min(end, tp - 3);
    return end;
  };
  // All round it, as the finds' rays ring theirs, but uneven, as lightning is: some out through the arch,
  // some striking it, two short, the lowest two reaching down beside the pedestal (so the floor either
  // side isn't bare), each its own zigzag; a spur on four.
  type Run = 'through' | 'arch' | 'short' | 'down';
  // Down beside the pedestal: as far as it goes before it would come near the floor or the pedestal.
  const { capTop, capR, baseR } = g.pedestal;
  const down = (a: number) => {
    const u = dir(a);
    const stop = reach(a, true);
    for (let t = r0 + 4; t < stop; t += 0.5) {
      const [x, y] = add(C, mul(u, t));
      const off = Math.abs(x - C[0]);
      if (y > g.floor - 7 * k || (y > capTop - 6 * k && off < capR + 7 * k) || (y > g.floor - 12 * k && off < baseR + 7 * k)) return t - 1;
    }
    return stop;
  };
  const heads = (
    [
      [-137, 'down', 1.8, false, 89, 4],
      [-114, 'short', 1.7, false, 3, 3],
      [-82, 'through', 2.1, true, 7, 5],
      [-50, 'arch', 1.9, false, 19, 4],
      [-18, 'arch', 1.7, false, 27, 4],
      [16, 'arch', 1.8, true, 31, 4],
      [47, 'through', 2.1, false, 44, 5],
      [80, 'through', 2, true, 52, 5],
      [112, 'short', 1.7, false, 61, 3],
      [140, 'down', 1.8, true, 97, 4],
    ] as [number, Run, number, boolean, number, number][]
  ).map(([a, run, w, spurs, seed, n]) => ({ a, end: run === 'down' ? down(a) : run === 'short' ? Math.min(reach(a, true), r0 + 21 * k) : reach(a, run === 'through'), w: w * k, spurs, seed, n }));
  const bolts = strike(p, C, r0, heads, k, room);
  remember(`face ${g.w} ${g.h}`, { bolts, ring: { c: C, r: r0 } });
}

/** In a row: the ring round the emblem, bolts struck off it out to the row's edges and the divider. */
function row(p: Plate, g: RowLayout) {
  const k = 0.82 * (g.h / 110);
  const C = g.emblem;
  const r0 = 30;
  charged(p, C, r0);
  const box = [10, 8, g.divider - 7, g.h - 8];
  const reach = (h: number) => {
    const u = dir(h);
    const xs = u[0] > 1e-9 ? (box[2] - C[0]) / u[0] : u[0] < -1e-9 ? (box[0] - C[0]) / u[0] : Infinity;
    const ys = u[1] > 1e-9 ? (box[3] - C[1]) / u[1] : u[1] < -1e-9 ? (box[1] - C[1]) / u[1] : Infinity;
    return Math.min(xs, ys) - 1;
  };
  const room = (q: Pt) => q[0] > box[0] && q[0] < box[2] && q[1] > box[1] && q[1] < box[3];
  const heads = [
    { a: -150, w: 1.3, spurs: false, seed: 3, n: 3 },
    { a: -98, w: 1.6, spurs: true, seed: 7, n: 4 },
    { a: -46, w: 1.5, spurs: false, seed: 19, n: 4 },
    { a: 12, w: 1.5, spurs: false, seed: 31, n: 4 },
    { a: 64, w: 1.6, spurs: true, seed: 44, n: 4 },
    { a: 118, w: 1.4, spurs: false, seed: 61, n: 4 },
  ].map((h) => ({ ...h, end: reach(h.a) }));
  const bolts = strike(p, C, r0, heads, 0.62, room);
  remember(`face ${g.w} ${g.h}`, { bolts, ring: { c: C, r: r0 } });
}

// ---- the seal, the sign, the back ----------------------------------------------

/** How far the seal's darts reach in Sol's place, on a card 218 wide. */
const SEAL = 30;

/**
 * The seal: a crystal of the ore in a double ring, `r` to its darts' ends, six
 * darts struck off the ring, long and short in turn, all alike, as a herald
 * draws the thunderbolt; the plate stops short of the ring and each dart.
 * Returns the darts.
 */
function seal(p: Plate, c: Pt, r: number) {
  const r0 = r * 0.42;
  const k = r / SEAL;
  charged(p, c, r0);
  crystal(p, c, 14, r0 * 1.42, r0 * 0.38, 0.6 * Math.max(0.8, k));
  const w = 1.05 * Math.sqrt(Math.max(0.8, k));
  const bolts = Array.from({ length: 6 }, (_, i) => dart(c, 30 + i * 60, r0, i % 2 ? r * 0.74 : r, i % 2 ? w * 0.85 : w));
  for (const b of bolts) cutSmall(p, b);
  p.knockout += disc(c, r0 + 1.2);
  return { bolts, r0 };
}

/**
 * The Leviathan cross, alchemy's other sign for sulphur, `r` from its
 * centre to its ends: a cross with two bars standing on the sign of the
 * infinite; its right loop hatched, away from the light.
 */
function leviathan(p: Plate, c: Pt, r: number) {
  const [x, y] = c;
  const cy = y + r * 0.62;
  const a = r * 0.56;
  const loop = (t: number): Pt => {
    const [s, co] = [Math.sin(t), Math.cos(t)];
    const d = 1 + s * s;
    return [x + (a * co) / d, cy + (a * 1.3 * s * co) / d];
  };
  const N = 64;
  const inf = `M${pt(loop(0))}${Array.from({ length: N }, (_, i) => `L${pt(loop(((i + 1) / N) * Math.PI * 2))}`).join('')}Z`;
  p.add(inf + line([x, y - r], [x, cy]) + line([x - r * 0.28, y - r * 0.6], [x + r * 0.28, y - r * 0.6]) + line([x - r * 0.44, y - r * 0.2], [x + r * 0.44, y - r * 0.2]), 'sign');
  // The right loop, as an ellipse about its middle: lines across its right half, short of its edge.
  const [ex, rx, ry] = [x + a * 0.6, a * 0.3, a * 0.26];
  let h = '';
  for (let dy = -ry + 0.7; dy < ry - 0.5; dy += 0.8) {
    const xx = rx * Math.sqrt(1 - (dy / ry) ** 2) - 0.5;
    if (xx > 0.7) h += line([ex + xx * 0.2, cy + dy], [ex + xx, cy + dy]);
  }
  p.add(h, 'hatch');
}

/** The back: the seal at the mandorla's heart, in a glory of fine rays. */
function back(p: Plate, g: BackLayout) {
  const r = Math.min(g.room(0), g.row ? 26 : 44);
  const { bolts, r0 } = seal(p, g.c, r);
  // The glory sits back with the plate, not the motif.
  p.motif = false;
  const n = g.row ? 60 : 72;
  let rays = '';
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * 360;
    const r1 = g.room(a) - 1;
    const end = i % 2 ? r0 + 3 + (r1 - r0 - 3) * 0.6 : r1;
    if (end - r0 > 6) rays += line(at(g.c, a, r0 + 3), at(g.c, a, end));
  }
  p.add(rays, 'ray');
  p.motif = true;
  remember(`back ${g.w} ${g.h}`, { bolts, ring: { c: g.c, r: r0 } });
}

/** The spandrels of the tall face: the seal in Sol's place, the Leviathan cross in Luna's. */
function spandrels(p: Plate, sol: Hole, luna: Hole, w: number) {
  const k = w / 218;
  seal(p, sol.c, Math.min(SEAL * k, (SEAL / 13) * sol.r));
  leviathan(p, luna.c, luna.r * 0.82);
}

// ---- the variant ----------------------------------------------------------------

/** The Sulphite card's plate: one object, so its engraved plates are kept (cardEngraving's engrave). */
export const SULPHITE_PLATE: Variant = {
  spandrels: spandrels,
  face: (p, g) => (g.row ? row(p, g) : tall(p, g)),
  back,
};
