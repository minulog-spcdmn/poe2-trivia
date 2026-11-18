// A second set of zone sigils, each a scene of its zone rather than a sign:
// the same contract as lib/zoneSigils.ts (lines, fine, shade; inside a
// circle of radius 10 about the origin, y down, light from the upper left,
// hatching upright on the side turned from it). Its own path writers, not
// lib/arcane.ts's: they write -0 as 0, which the set's first drawings were
// cut with. The four drawn again for the owner's blind rating (the hollow's
// mouth, the stand of stone trees, the geyser, the fallen capital) were cut
// with the shared writers instead, imported here as arcaneLine, arcaneRing
// and kitPath.

import { at, line as arcaneLine, ring as arcaneRing, type Pt } from './arcane.ts';
import type { Sigil } from './zoneSigils.ts';
import { arc3, bough, circ, icicles, kept, path as kitPath, placed, ridges, rot, solids, upright, uprightSegs } from './sigilKit.ts';

const f = (v: number) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);
const rad = (a: number) => (a * Math.PI) / 180;
const line = (p: Pt, q: Pt) => `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`;
const path = (pts: Pt[]) => 'M' + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L');
const poly = (pts: Pt[], close = false) => path(close ? [...pts, pts[0]] : pts);
const arc = (c: Pt, r: number, a0: number, a1: number) => {
  const p = at(c, a0, r);
  const q = at(c, a1, r);
  return `M${f(p[0])} ${f(p[1])}A${f(r)} ${f(r)} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${f(q[0])} ${f(q[1])}`;
};
const ring = (c: Pt, r: number) => arc(c, r, 0, 180) + arc(c, r, 180, 360).replace(/^M[^A]+/, '') + 'Z';
/** `n + 1` points round the circle about `c`, from `a0` to `a1` degrees. */
const pts = (c: Pt, r: number, a0: number, a1: number, n: number): Pt[] => Array.from({ length: n + 1 }, (_, k) => at(c, a0 + ((a1 - a0) * k) / n, r));

/** Upright hatching inside any simple polygon `ps`, from `x0` to `x1`, `gap` apart, kept `pad` short of the outline. */
function hatch(ps: Pt[], x0: number, x1: number, gap = 1.1, pad = 0.55): string {
  let out = '';
  for (let x = x0; x <= x1 + 1e-6; x += gap) {
    const ys: number[] = [];
    ps.forEach((a, i) => {
      const b = ps[(i + 1) % ps.length];
      if (a[0] <= x !== b[0] <= x) ys.push(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
    });
    ys.sort((m, n) => m - n);
    for (let i = 0; i + 1 < ys.length; i += 2) {
      const lo = ys[i] + pad;
      const hi = ys[i + 1] - pad;
      if (hi - lo > 0.6) out += line([x, lo], [x, hi]);
    }
  }
  return out;
}

/** A curve drawn by a turning pen: from `p` heading `h` (degrees clockwise from up), its turn growing steadily (`k0 + k1 t` degrees a unit), for `len` units. */
function curl(p: Pt, h: number, len: number, k0: number, k1: number, step = 0.2): Pt[] {
  const out: Pt[] = [p];
  let [x, y] = p;
  let a = h;
  for (let t = 0; t < len; t += step) {
    a += (k0 + k1 * t) * step;
    x += step * Math.sin(rad(a));
    y -= step * Math.cos(rad(a));
    out.push([x, y]);
  }
  return out;
}

/** The Mines: the Crawler, the cart the delvers follow, on its two wheels over the ground, its lamp held up on a post and throwing its light. */
function crawler(): Sigil {
  const body: Pt[] = [
    [-7.4, -1.6],
    [-5.6, 4],
    [5.6, 4],
    [7.4, -1.6],
  ];
  const lamp: Pt = [0, -6.6];
  const edge = (y: number, s: number) => s * (7.4 - (1.8 * (y + 1.6)) / 5.6);
  let rays = '';
  for (const a of [-90, -45, 0, 45, 90, -135, 135]) rays += line(at(lamp, a, 2.2), at(lamp, a, a % 90 === 0 ? 3.3 : 2.9));
  return {
    lines: line([-8.6, -1.6], [8.6, -1.6]) + poly(body) + ring([-3.4, 5.6], 1.5) + ring([3.4, 5.6], 1.5) + line([-7.4, 7.5], [7.4, 7.5]) + line([0, -1.6], [0, -5.2]) + ring(lamp, 1.4),
    fine: rays + [0.4, 2.3].map((y) => line([edge(y, -1) + 0.5, y], [edge(y, 1) - 0.5, y])).join('') + ring(lamp, 0.45),
    shade: hatch(body, 2.6, 6.2, 1.1, 0.5),
  };
}

/** Magma Fissure: the ground split along a fault, its rock's beds no longer meeting across the crack, a curtain of fire rising out of it and an ember over it. */
function fissure(): Sigil {
  const L: Pt[] = [
    [-2.6, 0.6],
    [-0.6, 2.8],
    [-2.0, 4.8],
    [-0.2, 8.8],
  ];
  const R: Pt[] = [
    [2.4, 0.6],
    [0.9, 2.4],
    [1.6, 4.4],
    [0.4, 6.6],
    [-0.1, 8.8],
  ];
  const flame = (x: number, w: number, h: number) =>
    path([
      [x - w, -0.4],
      [x, -0.4 - h],
      [x + w, -0.4],
    ]);
  return {
    lines: line([-9.6, 0.6], [-2.6, 0.6]) + line([2.4, 0.6], [9.6, 0.6]) + path(L) + path(R) + flame(-2.4, 1.1, 4.6) + flame(0, 1.2, 8.6) + flame(2.5, 1.0, 3.4),
    fine: line([-6.8, 3.4], [-3.0, 3.4]) + line([3.0, 4.8], [6.6, 4.8]) + ring([4.6, -5.6], 0.5),
    shade: hatch(
      [
        [2.6, 0.6],
        [9.6, 0.6],
        ...pts([0, 0], 9.6, 95, 160, 8),
      ],
      3.4,
      8.6,
      1.1,
      0.6,
    ),
  };
}

/** Fungal Caverns: a cluster of cave mushrooms on the ground, a tall one over two small, shedding spores. */
function shrooms(): Sigil {
  const caps: [Pt, number, number][] = [
    [[1.4, -3.6], 5.2, 7.2],
    [[-4.8, 1.4], 3.2, 7.2],
    [[5.8, 3.4], 2.1, 7.2],
  ];
  let lines = '';
  let shade = '';
  let fine = '';
  for (const [c, r, foot] of caps) {
    const [l, rr] = [at(c, -76, r), at(c, 76, r)];
    lines += arc(c, r, -76, 76) + line(l, rr) + line([c[0], l[1]], [c[0], foot]);
    shade += hatch([...pts(c, r, 0, 76, 8)], c[0] + 0.9, rr[0] - 0.4, 1.0, 0.45);
    if (r > 3) fine += line([c[0] - r * 0.28, l[1] + 1.4], [c[0] + r * 0.28, l[1] + 1.4]);
  }
  lines += line([-7, 7.2], [7, 7.2]);
  fine += (
    [
      [-1.8, -0.4],
      [3.8, 0.2],
      [-2.3, -3.1],
      [4.6, -1.6],
      [-0.4, 2.3],
    ] as Pt[]
  )
    .map((p, i) => ring(p, i % 2 ? 0.35 : 0.45))
    .join('');
  return { lines, fine, shade };
}

/** Vaal Outpost: the stepped fret the Vaal carve on their temples, a stair climbing into a squared spiral, over a line of ground. */
function fret(): Sigil {
  const k = 0.9;
  const P = (
    [
      [-8.4, 6],
      [-8.4, 3.6],
      [-5.6, 3.6],
      [-5.6, 1.2],
      [-2.8, 1.2],
      [-2.8, -7.6],
      [6.8, -7.6],
      [6.8, 5.2],
      [0.4, 5.2],
      [0.4, -4.4],
      [3.6, -4.4],
      [3.6, 2],
    ] as Pt[]
  ).map(([x, y]): Pt => [x * k, y * k]);
  const under = (
    [
      [-7.5, 6.3],
      [-7.5, 4.5],
      [-4.7, 4.5],
      [-4.7, 2.1],
      [-1.9, 2.1],
    ] as Pt[]
  ).map(([x, y]): Pt => [x * k, y * k]);
  return {
    lines: path(P),
    fine: path(under) + line([-8.4 * k, 6.3 * k + 0.6], [7.4 * k, 6.3 * k + 0.6]),
    shade: hatch(
      [
        [3.6 * k, -7.6 * k],
        [6.8 * k, -7.6 * k],
        [6.8 * k, 5.2 * k],
        [3.6 * k, 5.2 * k],
      ],
      4.6 * k,
      6.4 * k,
      1.0,
      0.6,
    ),
  };
}

/** Abyssal Depths: a pit with no floor, and something in it climbing out: two tentacles reaching up over its lip to grip the ground. */
function tendrils(): Sigil {
  const top = 3.2;
  /** A pen's line through `segs` (each a length and the degrees it turns along it), from `p` heading `h`. */
  const pen = (p: Pt, h: number, segs: [number, number][]) => {
    let c: Pt[] = [p];
    let a = h;
    for (const [len, deg] of segs) {
      const k = deg / len;
      const part = curl(c[c.length - 1], a, len, k, 0, 0.15);
      c = c.concat(part.slice(1));
      a += deg;
    }
    return c;
  };
  /** A tentacle along the line `c`, `w` thick at its root and tapering to its tip, as one outline. */
  const T = (c: Pt[], w: number) => {
    const n = c.length - 1;
    const side = (s: number) =>
      c.map((q, i): Pt => {
        const a = c[Math.min(n, i + 1)];
        const b = c[Math.max(0, i - 1)];
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const l = Math.hypot(dx, dy);
        const ww = (w * (1 - (i / n) ** 1.4)) / 2 + 0.05;
        return [q[0] - (s * dy * ww) / l, q[1] + (s * dx * ww) / l];
      });
    return path([...side(1), ...side(-1).reverse()]);
  };
  const t =
    T(
      pen([-0.6, 9.8], -6, [
        [11.2, 0],
        [8.6, -190],
        [2.5, 0],
        [1.6, -150],
      ]),
      2.0,
    ) +
    T(
      pen([0.9, 9.8], 8, [
        [8.2, 0],
        [6.6, 196],
        [1.95, 0],
        [1.2, 140],
      ]),
      1.6,
    );
  const wall = (s: number) => line([s * 2.6, top], [s * 2.0, 6.4]) + line([s * 1.9, 7.2], [s * 1.7, 8.4]);
  return {
    lines: line([-7.4, top], [-2.6, top]) + line([2.6, top], [7.4, top]) + wall(-1) + wall(1) + t,
    fine: line([-7.0, top + 1.8], [-3.8, top + 1.8]) + line([4.0, top + 2.6], [7.0, top + 2.6]),
    shade: '',
  };
}

/** Abyssal City: the Lich's tomb, a black dome on a drum, its finial an orb on a spike, its door a pointed arch, cold lights in its windows. */
function tomb(): Sigil {
  const c: Pt = [0, 0.6];
  let lines =
    arc(c, 5.6, -90, 90) +
    poly([
      [-6.6, 0.6],
      [-6.6, 7],
      [6.6, 7],
      [6.6, 0.6],
    ]) +
    line([-7.4, 0.6], [7.4, 0.6]) +
    line([-7.4, 7], [7.4, 7]);
  lines += line([0, -5], [0, -6.4]) + ring([0, -7.2], 0.8) + line([0, -8], [0, -9.6]);
  lines += path([
    [-1.4, 7],
    [-1.4, 4.4],
    [0, 2.6],
    [1.4, 4.4],
    [1.4, 7],
  ]);
  const fine = ring([-4, 3.8], 0.55) + ring([4, 3.8], 0.55) + arc(c, 3.6, -90, 90);
  return {
    lines,
    fine,
    shade:
      hatch([...pts(c, 5.6, 0, 90, 10)], 1.4, 5.0, 1.0, 0.5) +
      hatch(
        [
          [2.2, 1.2],
          [6.6, 1.2],
          [6.6, 7],
          [2.2, 7],
        ],
        3.0,
        6.2,
        1.1,
        0.55,
      ),
  };
}

/** The polyline `pts` as a function of the fraction `f` of its length: the point there, and its unit normal turned down. */
function along(pts: Pt[]) {
  const lens = pts.slice(1).map((b, i) => Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]));
  const total = lens.reduce((s, l) => s + l, 0);
  return (f: number): { p: Pt; n: Pt } => {
    let d = Math.max(0, Math.min(1, f)) * total;
    let i = 0;
    while (i + 1 < lens.length && d > lens[i]) d -= lens[i++];
    const [a, b] = [pts[i], pts[i + 1]];
    const [ux, uy] = [(b[0] - a[0]) / lens[i], (b[1] - a[1]) / lens[i]];
    return { p: [a[0] + ux * d, a[1] + uy * d], n: [-uy, ux] };
  };
}

/**
 * Frozen Hollow: the hollow's mouth (the game files the biome as its ice
 * caves, Delve_IceCaves), the cold shown by what it adds: a low cave opening
 * in a rock that slopes away to the right, a heavy bank of snow lying along
 * its brow, deepest over the middle and thinning down both ends, icicles
 * hanging from the opening's lip, a drift across its floor. A crack runs
 * down the rock's face; its flank is hatched, and the dark inside is
 * hatched on its left, the inner wall turned from the light, as the Mines
 * drift is. The snow, lit, is left bare.
 */
function mouth(): Sigil {
  // A rock rising steep on the left and sloping away to the right.
  const rock: Pt[] = [[-8.4, 6.4], [-8.0, 1.6], [-6.6, -2.8], [-4.2, -5.4], [-1.8, -5.8], [1.4, -4.0], [4.6, -1.8], [7.4, 0.8], [8.6, 3.4], [8.8, 6.4]];
  const brow = along(rock.slice(1, 9));
  // The snow's top: deepest over the middle, thinning to nothing at the brow's
  // ends, in shallow lumps.
  const crests = [0, 0.2, 0.42, 0.62, 0.8, 1];
  const depth = (f: number) => {
    let k = 0;
    while (k + 2 < crests.length && f > crests[k + 1]) k++;
    const u = (f - crests[k]) / (crests[k + 1] - crests[k]);
    return 2.9 * Math.sin(Math.PI * f) ** 0.55 * (0.82 + 0.18 * Math.sin(Math.PI * u));
  };
  const top: Pt[] = Array.from({ length: 97 }, (_, i) => {
    const { p, n } = brow(i / 96);
    return [p[0] - n[0] * depth(i / 96), p[1] - n[1] * depth(i / 96)];
  });
  // The mouth, low and to the right under the slope.
  const lip: Pt[] = [[-3.6, 6.4], [-3.5, 2.8], [-2.0, 0.2], [0.6, -0.8], [3.4, -0.2], [5.2, 1.8], [6.0, 4.2], [6.0, 6.4]];
  // The lip's height above `x`, across its brow.
  const lipY = (x: number) => {
    for (let i = 0; i + 1 < lip.length; i++) {
      const [a, b] = [lip[i], lip[i + 1]];
      if (a[0] <= x && x <= b[0] && a[1] < 3.5 && b[1] < 3.5) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
    return 0;
  };
  const spec: [number, number, number][] = [[-1.6, 0.46, 2.9], [-0.1, 0.34, 1.6], [1.3, 0.5, 4.2], [3.0, 0.36, 1.9], [4.3, 0.44, 2.7]];
  // Snow drifted out of the mouth and over its sill.
  const drift = arc3([-4.2, 6.4], [1.2, 4.4], [6.6, 6.4], 16);
  const driftAt = (x: number) => {
    let best = drift[0];
    for (const q of drift) if (Math.abs(q[0] - x) < Math.abs(best[0] - x)) best = q;
    return best[1];
  };
  // The dark inside, close hatched all through, the icicles left bright against it.
  const iceClear = (p: Pt) => spec.every(([x, hw, len]) => !(Math.abs(p[0] - x) < hw * (1 - (p[1] - lipY(x)) / (len + 0.4)) + 0.32 && p[1] < lipY(x) + len + 0.4));
  const dark = uprightSegs(lip, -3.1, 5.6, 0.75, 0.35).map((sg) => kept(sg, (p) => iceClear(p) && p[1] < driftAt(p[0]) - 0.4)).join('');
  // The rock's flank, where it turns from the light, hatched.
  const flankArea: Pt[] = [[5.6, -1.0], [7.4, 0.8], [8.6, 3.4], [8.8, 6.4], [6.6, 6.4], [6.6, 3.6], [6.3, 1.4]];
  const flank = upright(flankArea, 7.1, 8.4, 0.9, 0.5);
  // A soft fold along the snow bank, half its depth down, where its round turns from the light.
  const fold: Pt[] = Array.from({ length: 41 }, (_, i) => {
    const f = 0.46 + (0.38 * i) / 40;
    const { p, n } = brow(f);
    return [p[0] - n[0] * depth(f) * 0.42, p[1] - n[1] * depth(f) * 0.42];
  });
  return {
    lines:
      kitPath(rock) + kitPath(top) + kitPath(lip) + icicles(spec, lipY) + kitPath(drift) +
      arcaneLine([-8.9, 6.4], [-4.2, 6.4]) + arcaneLine([6.6, 6.4], [9.1, 6.4]),
    // The icicles' ridges, a crack down the rock's face, the fold in the snow.
    fine: ridges(spec, lipY) + kitPath([[-5.8, -1.6], [-5.0, 0.6], [-5.8, 2.6], [-5.4, 4.8]]) + kitPath(fold),
    shade: dark + flank,
  };
}

/**
 * Petrified Forest: a stand of dead trees turned to stone, near and far
 * (the near one, a taller one behind it to the right, a short one behind to
 * the left), each broken off at its top in flat stepped planes as stone
 * breaks, their boughs snapped short.
 */
function stoneStand(): Sigil {
  const G = 6.4;
  /**
   * A trunk at `x`, flaring from its foot into a near-straight shaft `w`
   * either side, leaning `lean` by its top, broken off along `top` (from
   * left to right, x as offsets from `x`).
   */
  const trunk = (x: number, w: number, top: Pt[], lean = 0): Pt[] => [
    ...arc3([x - 2.3 * w, G], [x - 1.3 * w, G - 1.0], [x - w, G - 2.6], 8),
    ...top.map(([dx, y]) => [x + dx + lean, y] as Pt),
    ...arc3([x + w, G - 2.6], [x + 1.3 * w, G - 1.0], [x + 2.3 * w, G], 8),
  ];
  const trunks = [
    trunk(-1.3, 1.25, [[-1.25, -4.0], [-0.2, -4.55], [0.15, -5.65], [1.25, -6.1]]),
    trunk(3.8, 0.9, [[-0.9, -7.1], [0.15, -7.6], [0.3, -8.5], [0.9, -8.3]], 0.25),
    trunk(-5.7, 0.85, [[-0.85, -0.5], [0.05, -0.15], [0.2, 0.45], [0.85, 0.7]], -0.1),
  ];
  const boughs = [
    [bough([-2.0, -0.7], [-3.9, -2.9], [-5.7, -5.5], 0.85, 0.58)],
    [bough([4.0, -3.0], [5.4, -4.4], [6.75, -6.3], 0.66, 0.46), bough([3.55, -5.0], [2.85, -5.8], [2.3, -6.8], 0.52, 0.4)],
  ];
  const groups = [[trunks[0], ...boughs[0]], [trunks[1], ...boughs[1]], [trunks[2]]];
  const { lines, on } = solids(groups, G);
  let fine = '';
  let shade = '';
  // The grain up each shaft, and the side turned from the light.
  const xs = [-1.3, 3.8, -5.7];
  const ws = [1.25, 0.9, 0.85];
  const tops = [-4.0, -7.1, -0.5];
  xs.forEach((x, i) => {
    const w = ws[i];
    for (const dx of [-0.35 * w]) fine += kept([[x + dx, tops[i] + 0.5], [x + dx * 1.3, G - 0.4]], (p) => on(p, i));
    shade += uprightSegs(groups[i][0], x + 0.6 * w, x + 2.3 * w, 0.95, 0.3).map(([p, q]) => kept([p, q], (s) => on(s, i, 0.3))).join('');
  });
  shade += uprightSegs(boughs[1][0], 4.6, 7.0, 0.95, 0.2).map(([p, q]) => kept([p, q], (s) => on(s, 1, 0.2))).join('');
  return { lines: lines + arcaneLine([-8.2, G], [7.8, G]), fine, shade };
}

/** The ground line. */
const G = 6;

/** Primeval Ruins: an Ionic capital fallen from its column, the top of its shaft still on it, lying tilted on the shaft's broken end, which is sunk in the ground. */
function capital(): Sigil {
  const tilt = -24;
  const T = (ps: Pt[]) => ps.map((p) => rot(p, tilt, [0, 0]).map((v, i) => v + (i ? 1.9 : 0.6)) as Pt);
  const spiral = (c: Pt, r0: number, turns: number, dir: 1 | -1, shrink = 0.82) => {
    const pts: Pt[] = [];
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = (dir * 360 * turns * t * Math.PI) / 180;
      const r = r0 * (1 - shrink * t);
      pts.push([c[0] + r * Math.sin(a), c[1] - r * Math.cos(a)]);
    }
    return pts;
  };
  const [cx, cy, r0] = [4.8, -1.8, 2.4];
  const top = cy - r0;
  const abacus: Pt[] = [[-7.2, top - 1.0], [7.2, top - 1.0], [7.2, top], [-7.2, top]];
  const above = (p: Pt) => p[1] < G - 0.3;
  // Lines other than the volutes stop short of them.
  const vc = T([[-cx, cy], [cx, cy]]);
  const clear = (p: Pt) => above(p) && vc.every((c) => Math.hypot(p[0] - c[0], p[1] - c[1]) > r0 + 0.35);
  let lines = '';
  const draw = (ps: Pt[], keep = above) => (lines += kept(T(ps), keep));
  draw([...abacus, abacus[0]]);
  for (const k of [-1, 1] as const) draw(spiral([k * cx, cy], r0, 1.75, k === 1 ? 1 : -1));
  draw([[-cx, top + 0.9], [cx, top + 0.9]], clear);
  // The shaft's top, broken off below the capital.
  const sw = 3.0;
  const eb = cy + 1.2;
  draw([[-sw, eb], [sw, eb]], clear);
  draw([[-sw, eb], [-sw, 4.2], [-1.6, 5.0], [-0.4, 4.6], [1.0, 5.3], [2.0, 4.6], [sw, 5.2], [sw, eb]], clear);
  let fine = '';
  for (const k of [-1, 1] as const) fine += kept(T(spiral([k * cx, cy], r0 - 0.9, 1.5, k === 1 ? 1 : -1, 0.8)), above);
  for (const k of [-1, 1]) fine += arcaneRing(T([[k * cx, cy]])[0], 0.35);
  // The echinus between the volutes: its eggs, each hanging from the channel.
  const ey = top + 1.2;
  for (const x of [-1.5, 0, 1.5]) fine += kept(T([[x - 0.5, ey], ...arc3([x - 0.5, eb - 0.9], [x, eb - 0.4], [x + 0.5, eb - 0.9], 8), [x + 0.5, ey]]), clear);
  for (const x of [-1.8, -0.6, 0.6]) fine += kept(T([[x, eb + 0.5], [x, 4.0]]), clear);
  lines += arcaneLine([-6.4, G], [6.4, G]);
  // The shaft's side turned from the light.
  const shaft = T([[1.2, eb], [sw, eb], [sw, 5.2], [2.0, 4.6], [1.2, 4.9]]);
  const shade = uprightSegs(shaft, -10, 10, 0.75, 0.35)
    .filter(([a, b]) => clear(a) && clear(b))
    .map(([a, b]) => arcaneLine(a, b))
    .join('');
  return { lines, fine, shade };
}

/**
 * Sulphur Vents (the zone's localised names call it sulphur geysers and
 * fumaroles): a geyser erupting from its mound of sinter. The
 * mound is cut in three planes, lit on the left, in shadow on the right,
 * with a step of crust across them; the jet rises out of the crater's lip
 * as a solid column, widening as it climbs, hatched down its right side,
 * and breaks at its head into a fan of spray.
 */
function geyser(): Sigil {
  const g = 6.3;
  const lipY = 2.4;
  const mound: Pt[] = [[-6.3, g], [-6.0, 5.2], [-4.8, 4.7], [-3.7, 4.5], [-3.0, 3.7], [-2.1, 3.1], [-1.7, lipY], [1.7, lipY], [2.2, 3.2], [3.1, 3.8], [3.8, 4.5], [5.0, 4.8], [6.1, 5.3], [6.3, g]];
  const ridgeL: Pt[] = [[-1.7, lipY], [-1.9, 4.5], [-2.6, g]];
  const ridgeR: Pt[] = [[1.7, lipY], [1.92, 4.5], [2.7, g]];
  const stepL = kitPath([[-3.7, 4.5], [-2.7, 4.85], [-1.92, 4.5]]);
  const stepR = kitPath([[1.92, 4.5], [2.9, 4.9], [3.8, 4.5]]);
  const right: Pt[] = [[1.7, lipY], [2.2, 3.2], [3.1, 3.8], [3.8, 4.5], [5.0, 4.8], [6.1, 5.3], [6.3, g], [2.7, g], [1.92, 4.5]];
  const lip = kitPath(circ([0, lipY], 1.7, 0, Math.PI, 24).map(([x, y]): Pt => [x, lipY + (y - lipY) * 0.32]));
  // The jet: a column widening as it climbs, two strands of water inside it.
  const head = -5.9;
  const jetL = arc3([-1.35, lipY + 0.25], [-1.55, -2.0], [-2.55, head], 16);
  const jetR = arc3([1.35, lipY + 0.25], [1.55, -2.0], [2.55, head], 16);
  const column: Pt[] = [...jetL, ...jetR.slice().reverse()];
  const strands = kitPath(arc3([-0.5, lipY - 0.1], [-0.6, -2.0], [-1.0, head + 0.5], 12)) + kitPath(arc3([0.3, lipY - 0.1], [0.35, -2.0], [0.55, head + 0.8], 12));
  // The spray: five strokes from the column's rim, fanned at even angles, the middle three longest.
  const rays = ([[-2.3, -36, 2.0], [-1.2, -18, 2.8], [0, 0, 3.0], [1.2, 18, 2.8], [2.3, 36, 2.0]] as [number, number, number][]).map(([x, a, l]) => {
    const r = (a * Math.PI) / 180;
    const o: Pt = [x, head - 0.3];
    return arcaneLine(o, [o[0] + l * Math.sin(r), o[1] - l * Math.cos(r)]);
  });
  return {
    lines: kitPath(mound) + arcaneLine([-6.6, g], [6.6, g]) + kitPath(jetL) + kitPath(jetR) + lip + rays[1] + rays[2] + rays[3],
    fine: rays[0] + rays[4] + strands + kitPath(ridgeL) + kitPath(ridgeR) + stepL + stepR,
    shade:
      uprightSegs(right, 2.0, 6.1, 0.55, 0.22)
        .map(([p, q]) => kept([p, q], (r) => Math.abs(r[1] - (r[0] < 2.9 ? 4.5 + (r[0] - 1.92) * 0.41 : 4.9 - (r[0] - 2.9) * 0.44)) > 0.15))
        .join('') +
      uprightSegs(column, 0.45, 2.5, 0.32, 0.2)
        .map(([p, q]) => arcaneLine(p, q))
        .join(''),
  };
}

/** The scenes set, by zone (the names of lib/zoneSigils.ts SIGIL_NAMES). */
export const SCENE_SIGILS: Record<string, () => Sigil> = {
  'The Mines': () => placed(crawler(), 0.87, 0, 0.203),
  'Magma Fissure': () => placed(fissure(), 0.95, 0, -0.25),
  'Frozen Hollow': () => placed(mouth(), 0.87, -0.1, -0.1),
  'Fungal Caverns': () => placed(shrooms(), 0.96, -0.2, -0.41),
  'Vaal Outpost': () => placed(fret(), 1.045, -0.168, 0.221),
  'Abyssal Depths': () => placed(tendrils(), 1.15, 0.3, -3.36),
  'Petrified Forest': () => placed(stoneStand(), 0.92, 0.18, 0.2),
  'Sulphur Vents': () => placed(geyser(), 1.0, 0, 0.45),
  'Abyssal City': () => placed(tomb(), 0.95, 0, -0.35),
  'Primeval Ruins': () => placed(capital(), 1.102, 0, -0.36),
};
