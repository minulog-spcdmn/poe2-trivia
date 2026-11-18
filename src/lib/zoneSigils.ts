// A small engraved emblem for each of Delve's biomes, the zones (lib/descent
// names them), drawn as the alchemist's circle is drawn (docs/arcane-style.md):
// fine lines of exact geometry, no fill, no text. Each fits a circle of
// radius 10 about the origin (y down), so a seal of any size can hold it at
// `r / 10`; they are made to read at 14 to 24 px across, so they keep to a
// handful of strokes. Lines come back as SVG path data: `lines` the main
// strokes, `fine` the finer ones (a ridge, a stair, the gills), drawn
// thinner, and `shade`, hatching down the side of each solid turned from
// the light (it falls from the upper left, as on the cards).
//
// Each zone has three drawings, one in each of three sets: this file's
// (`current`), lib/zoneSigilsScenes.ts's and lib/zoneSigilsThird.ts's, some
// of them drawn again in later rounds of the owner's blind rating in place
// of the ones they replaced. RANKED puts each zone's three in the
// rating's order: a zone shows its best, and past depth 100 the places that
// bear its emblem show its second and third in turn.

import { at, lerp, line, type Pt } from './arcane.ts';
import { emblemOf, turnOfName } from './backdrops.ts';
import { stratumName } from './descent.ts';
import { arc3, closed, edgeDist, ember, inside, kept, mirror, path, placed, ragged, rot, segs, solids, upright, uprightSegs } from './sigilKit.ts';
import { SCENE_SIGILS } from './zoneSigilsScenes.ts';
import { THIRD_SIGILS } from './zoneSigilsThird.ts';

export type Sigil = { lines: string; fine: string; shade?: string };

const O: Pt = [0, 0];
const poly = (pts: Pt[], close = false) => pts.map((p, i) => line(p, pts[(i + 1) % pts.length])).slice(0, close ? pts.length : pts.length - 1).join('');

/** Frozen Hollow: a crystal of six arms about a small hexagon, each arm branching once. */
function crystal(): Sigil {
  let lines = '';
  let fine = '';
  const hex = Array.from({ length: 6 }, (_, k) => at(O, k * 60, 2.2));
  lines += poly(hex, true);
  for (let k = 0; k < 6; k++) {
    const a = k * 60;
    lines += line(at(O, a, 2.2), at(O, a, 9.4));
    const fork = at(O, a, 5.6);
    for (const s of [-1, 1]) fine += line(fork, at(fork, a + s * 42, 2.8));
  }
  return { lines, fine };
}

/** Vaal Outpost: a stepped pyramid with a stair up its middle and a shrine on top. */
function pyramid(): Sigil {
  const steps = 4;
  const half = (i: number) => 7.2 - i * 1.65;
  const y = (i: number) => 6.4 - i * 3;
  const right: Pt[] = [];
  for (let i = 0; i < steps; i++) right.push([half(i), y(i)], [half(i), y(i + 1)]);
  right.push([1.4, y(steps)]);
  const outline = [...mirror(right).reverse(), ...right];
  return {
    lines: poly(outline) + line([-half(0), y(0)], [half(0), y(0)]) + line([-1.4, y(steps)], [0, y(steps) - 2]) + line([0, y(steps) - 2], [1.4, y(steps)]),
    fine: line([-0.8, y(0)], [-0.8, y(steps)]) + line([0.8, y(0)], [0.8, y(steps)]),
    // The right half of each tier.
    shade: Array.from({ length: steps }, (_, i) =>
      upright(
        [
          [1.4, y(i + 1)],
          [half(i), y(i + 1)],
          [half(i), y(i)],
          [1.4, y(i)],
        ],
        2.2,
        half(i) - 0.5,
        1.1,
        0.55,
      ),
    ).join(''),
  };
}

/** Sulphur Vents: the alchemist's sign of sulphur, a triangle over a cross. */
function sulphur(): Sigil {
  const apex: Pt = [0, -9];
  const [l, r]: Pt[] = [
    [-5, -1],
    [5, -1],
  ];
  return { lines: poly([apex, r, l], true) + line([0, -1], [0, 9]) + line([-4.2, 4], [4.2, 4]), fine: '', shade: upright([apex, r, l], 1, 4, 1, 0.6) };
}

/**
 * The Mines: looking into a drift, its timber sets (two legs leaning in under
 * a cap, each set smaller than the last) running away into the dark, and the
 * rails running out of it towards us, their sleepers spaced wider as they
 * come near.
 */
function drift(): Sigil {
  const floor = 3.0;
  const V: Pt = [0, -1.4];
  const toV = (p: Pt, t: number): Pt => lerp(V, p, t);
  // The front set: legs leaning in, a cap laid across them.
  const legL: Pt[] = [
    [-5.3, floor],
    [-4.1, floor],
    [-3.3, -5.3],
    [-4.5, -5.3],
  ];
  const legR = legL.map(([x, y]): Pt => [-x, y]);
  const cap: Pt[] = [
    [-5.3, -6.7],
    [5.3, -6.7],
    [5.3, -5.3],
    [-5.3, -5.3],
  ];
  let lines = closed(legL) + closed(legR) + closed(cap);
  let fine = '';
  // The sets behind, each nearer the vanishing point, drawn as the inner
  // edge of their legs and cap.
  const inner: Pt[] = [
    [-4.1, floor],
    [-3.3, -5.3],
    [3.3, -5.3],
    [4.1, floor],
  ];
  const sets = [0.62, 0.36];
  for (const t of sets) fine += path(inner.map((p) => toV(p, t)));
  // The rails, from the last set out past the front.
  const gauge = 2.1; // half the gauge at the front set's floor
  const rail = (k: number) => {
    const at0: Pt = [k * gauge, floor];
    return line(toV(at0, sets[1]), toV(at0, 2.05));
  };
  lines += rail(-1) + rail(1);
  // The ground the drift opens on.
  lines += line([-7.4, floor], [-5.3, floor]) + line([5.3, floor], [7.4, floor]);
  // Sleepers, nearer and wider apart towards us, cut where the rails lie
  // over them.
  for (const t of [0.5, 0.75, 1.07, 1.45, 1.92]) {
    const [a, b] = [toV([-gauge - 0.9, floor], t), toV([gauge + 0.9, floor], t)];
    const r = toV([gauge, floor], t)[0];
    const c = 0.35;
    fine += line(a, [-r - c, a[1]]) + line([-r + c, a[1]], [r - c, a[1]]) + line([r + c, a[1]], b);
  }
  // The dark: the left wall of the drift, out of the light, between the
  // front set and the last.
  const s1 = (p: Pt) => toV(p, sets[1]);
  const wall: Pt[] = [inner[1], s1(inner[1]), s1(inner[0]), inner[0]];
  // And the far end, where the light gives out.
  const far = inner.map((p) => toV(p, sets[1]));
  const shade =
    upright(wall, -3.3, -1.3, 0.5, 0.3) +
    upright(far, -0.9, 1.1, 0.5, 0.3) +
    upright(cap, 1.4, 5.0, 0.9, 0.4) +
    upright(legR, 3.9, 4.9, 0.5, 0.3);
  return { lines, fine, shade };
}

/**
 * Magma Fissure: a totem of the Redblade warband, the Karui who hold this
 * fissure (its Vakali and Inua totems), cut in straight lines like the
 * scenes set's fire curtain: a pole of two carved faces under a bowl of melt
 * burning on its head, the melt dripping over its lip, the stone cracked
 * with heat, its side from the light hatched.
 */
function totem(): Sigil {
  const bowl = arc3([-4.6, -5.6], [0, -2.9], [4.6, -5.6], 30);
  const fire: Pt[] = [[-3.4, -5.6], [-3.6, -7.0], [-2.2, -6.2], [-1.4, -8.0], [-0.4, -9.4], [0.4, -7.6], [1.2, -6.4], [2.4, -7.8], [2.6, -6.6], [3.4, -5.6]];
  const pole: Pt[] = [[-2.4, -3.5], [-2.4, -1.6], [-3.8, -1.6], [-3.8, 0.8], [-2.4, 0.8], [-2.4, 6.0], [-3.6, 6.0], [-3.6, 7.4], [3.6, 7.4], [3.6, 6.0], [2.4, 6.0], [2.4, 0.8], [3.8, 0.8], [3.8, -1.6], [2.4, -1.6], [2.4, -3.5]];
  // A carved face: brows, eyes, a mouth with a tooth line; `y` its brow.
  const face = (y: number): string =>
    line([-1.7, y], [-0.5, y - 0.4]) +
    line([0.5, y - 0.4], [1.7, y]) +
    closed([[-1.4, y + 0.7], [-0.9, y + 0.4], [-0.4, y + 0.7], [-0.9, y + 1.0]]) +
    closed([[0.4, y + 0.7], [0.9, y + 0.4], [1.4, y + 0.7], [0.9, y + 1.0]]) +
    closed([[-1.3, y + 2.0], [1.3, y + 2.0], [0.9, y + 2.9], [-0.9, y + 2.9]]) +
    line([0, y + 2.0], [0, y + 2.9]);
  // Melt run over the bowl's lip, each run ending in a hanging drop.
  const drips = line([-4.4, -5.0], [-4.6, -3.4]) + ember([-4.6, -2.6], 0.55) + line([4.3, -4.8], [4.4, -3.9]) + ember([4.4, -3.2], 0.45);
  // Heat cracks in the lower block, straight runs bending once.
  const cracks = line([-2.4, 4.2], [-1.4, 4.8]) + line([-1.4, 4.8], [-1.6, 5.6]);
  const clearFaces = (p: Pt) => !(Math.abs(p[0]) < 2.0 && ((p[1] > -3.0 && p[1] < 0.8) || (p[1] > 1.4 && p[1] < 4.8)));
  return {
    lines: path(bowl) + line([-5.0, -5.6], [5.0, -5.6]) + path(fire) + path(pole) + line([-2.4, 3.2], [2.4, 3.2]),
    fine: face(-2.4) + face(1.6) + line([-3.6, 6.0], [3.6, 6.0]) + drips + cracks,
    shade: uprightSegs(pole, 1.0, 3.8, 0.9, 0.3)
      .map(([p, q]) => kept([p, q], clearFaces))
      .join(''),
  };
}

/** One chanterelle standing at `B`, `s` times full size, leaning `lean` degrees, its ridges leaving the lip at `ridges` (radians round the rim). */
function chanterelle(B: Pt, s: number, lean: number, ridges: number[]) {
  const a = (lean * Math.PI) / 180;
  const T = ([x, y]: Pt): Pt => [B[0] + s * (x * Math.cos(a) - y * Math.sin(a)), B[1] + s * (x * Math.sin(a) + y * Math.cos(a))];
  const rimC: Pt = [0.2, -11.2];
  const [rx, ry] = [6.2, 2.1];
  const tilt = (-6 * Math.PI) / 180;
  // The rim, waved, as a chanterelle's is, and tipped a little towards us.
  const rimAt = (t: number, k = 1): Pt => {
    const w = k * (1 + 0.06 * Math.sin(4 * t + 0.9) + 0.025 * Math.sin(7 * t));
    const [x, y] = [rx * w * Math.cos(t), ry * w * Math.sin(t)];
    return T([rimC[0] + x * Math.cos(tilt) - y * Math.sin(tilt), rimC[1] + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  };
  const rim: Pt[] = Array.from({ length: 97 }, (_, k) => rimAt((2 * Math.PI * k) / 96));
  // The flesh runs from the rim down into a stout stem, with no break between them.
  const L = arc3(rimAt(Math.PI), T([-1.9, -7.4]), T([-1.4, 0]), 28);
  const R = arc3(rimAt(0), T([2.2, -7.6]), T([1.2, 0]), 28);
  const front = Array.from({ length: 49 }, (_, k) => rimAt((Math.PI * k) / 48));
  // The whole shape, and the outside of the funnel alone (the front lip and the flanks).
  const outline: Pt[] = [...R.slice().reverse(), ...rim.slice(48), ...L];
  const outside: Pt[] = [...front, ...L.slice(1), ...R.slice().reverse().slice(1, -1)];
  // A point `d` below the rim at `t`, on the outside of the funnel.
  const below = (t: number, d: number): Pt => {
    const p = rimAt(t);
    return [p[0] - s * d * Math.sin(a), p[1] + s * d * Math.cos(a)];
  };
  // The margin rolled under along the front lip, and the ridges from under it down into the stem, forking near the rim.
  const fine: Pt[][] = [Array.from({ length: 41 }, (_, k) => below(0.35 + ((Math.PI - 0.7) * k) / 40, 0.5))];
  for (const t of ridges) {
    const f = Math.cos(t) * 0.95;
    const mid = T([f * 2.3 + 0.1, -6.8]);
    fine.push([mid, T([f * 1.1, -4.6]), T([f * 0.55, -2.4])]);
    fine.push([below(t - 0.1, 0.95), mid, below(t + 0.1, 0.95)]);
  }
  // The right flank, turned from the light.
  const x0 = T([1.3, -7.0])[0];
  const x1 = rimAt(0)[0] - 0.4;
  const shade = uprightSegs(outside, x0, x1, 0.95, 0.3);
  // The fine lines stay on the outside of the funnel, clear of its edges.
  const within = (p: Pt) => inside(outside, p) && edgeDist(outside, p) > 0.25 * s;
  return { outline, lines: [rim, L, R], fine, shade, within };
}

/**
 * Fungal Caverns: a pair of chanterelles on the ground, the larger leaning
 * over the smaller, each a waved funnel whose flesh runs down into its stem
 * without a break, its forked ridges running from the lip into the stem.
 */
function chanterelles(): Sigil {
  const ground = 6.4;
  const big = chanterelle([-1.2, ground], 1, -7, [1.25, 1.6, 1.95, 2.3]);
  const small = chanterelle([3.4, ground], 0.58, 13, [1.45, 2.05]);
  const clear = (p: Pt) => !inside(big.outline, p);
  const lines =
    big.lines.map(path).join('') + small.lines.map((l) => kept(l, clear)).join('') + line([-6.4, ground], [6.4, ground]);
  const fine = big.fine.map((l) => kept(l, big.within)).join('') + small.fine.map((l) => kept(l, (p) => small.within(p) && clear(p))).join('');
  const shade = segs(big.shade) + segs(small.shade.filter(([p, q]) => clear(p) && clear(q)));
  return { lines, fine, shade };
}

/**
 * Abyssal Depths: the Abyss as the game shows it, "a pit which leads deep
 * underground with multiple fissures branching from it", opening: a pit
 * seen from above, broken lip and hatched wall, its
 * fissures branching from it all round. Each opens as a notch in the lip, runs
 * straight, kinks once the same way as the rest (the ground drawn round, as if
 * pulled down in), forks, and runs out as a hairline.
 */
function opening(): Sigil {
  const c: Pt = [0, 0];
  const R = 4.1;
  // The pit's lip, broken stone: straight facets between nine corners.
  const lipJ = [0.06, -0.05, 0.08, -0.07, 0.04, -0.08, 0.07, -0.04, 0.05];
  const hole = ragged(c, R, R, lipJ);
  // How far down its walls the light reaches: below this, only the dark.
  const depth = ragged([0.4, 0.4], R * 0.55, R * 0.55, lipJ);
  // Fissures: [where it leaves the pit (degrees), first run, second run, kink, fork's run, its hairline].
  const spec: [number, number, number, number, number, number][] = [
    [18, 2.3, 2.1, 30, 1.5, 0.9],
    [80, 1.8, 1.1, 26, 0, 0.8],
    [140, 2.2, 1.9, 32, 1.4, 0.9],
    [200, 1.7, 1.0, 24, 0, 0.8],
    [258, 2.2, 1.8, 30, 1.5, 0.9],
    [318, 1.8, 1.2, 26, 0, 0.8],
  ];
  const notches: Pt[][] = [];
  let lines = '';
  let fine = closed(depth);
  for (const [a, l1, l2, kink, lf, lh] of spec) {
    const p0 = at(c, a, R * 0.92);
    const p1 = at(p0, a + 6, l1);
    const p2 = at(p1, a + 6 + kink, l2);
    // The notch: the lip broken open where the fissure leaves it, closing to the crack.
    const w = l2 ? 1.5 : 1.1;
    const n0 = at(p0, a + 6 - 90, w / 2);
    const n1 = at(p0, a + 6 + 90, w / 2);
    const tip = at(p0, a + 6, l1 * 0.62);
    notches.push([n0, tip, n1]);
    // The three that fork are cut deep; the three between, finer, as the lesser cracks they are.
    const cut = line(n0, tip) + line(tip, n1) + line(tip, p1) + line(p1, p2);
    if (lf) lines += cut;
    else fine += cut;
    // The hairline it runs out as, kinked back a little.
    fine += line(p2, at(p2, a + 6 + kink - 14, lh));
    // A fork from the kink, back against it.
    if (lf) {
      const f = at(p1, a + 6 - 34, lf);
      lines += line(p1, f);
      fine += line(f, at(f, a + 6 - 20, 0.8));
    }
  }
  // The lip, broken where each notch opens it.
  const inNotch = (p: Pt) => notches.some((n) => inside(n, p) || edgeDist(n, p) < 0.05);
  lines = kept([...hole, hole[0]], (p) => !inNotch(p)) + lines;
  // Shade: the pit's wall on the side the light comes from, turned from it, down to the dark.
  const shade = uprightSegs(hole, -R, 0.8, 0.75, 0.3)
    .map(([p, q]) => kept([p, q], (r) => r[0] + r[1] < 0.6 && !inside(depth, r) && edgeDist(depth, r) > 0.28 && !inNotch(r)))
    .join('');
  return { lines, fine, shade };
}

/**
 * A limb along the kinked line `ps` (stone breaks at angles, so its bends
 * are corners), `w0` either side at its root narrowing to `w1`, snapped
 * across at its end in one clean slant. Its axis comes back too.
 */
function limb(ps: Pt[], w0: number, w1: number) {
  const len = ps.slice(1).map((p, i) => Math.hypot(p[0] - ps[i][0], p[1] - ps[i][1]));
  const total = len.reduce((a, b) => a + b, 0);
  const s = ps.map((_, i) => len.slice(0, i).reduce((a, b) => a + b, 0));
  const unit = ([x, y]: Pt): Pt => {
    const d = Math.hypot(x, y);
    return [x / d, y / d];
  };
  /** The mitred normal at corner `i`, to the right of the way the limb runs. */
  const nrm = (i: number): Pt => {
    const u = [i > 0 ? unit([ps[i][0] - ps[i - 1][0], ps[i][1] - ps[i - 1][1]]) : null, i < ps.length - 1 ? unit([ps[i + 1][0] - ps[i][0], ps[i + 1][1] - ps[i][1]]) : null].filter(
      (v): v is Pt => !!v,
    );
    const [x, y] = unit([u.reduce((a, v) => a + v[0], 0), u.reduce((a, v) => a + v[1], 0)]);
    const m = u.length === 2 ? 1 / Math.sqrt((1 + u[0][0] * u[1][0] + u[0][1] * u[1][1]) / 2) : 1;
    return [-y * m, x * m];
  };
  const w = (i: number) => w0 + ((w1 - w0) * s[i]) / total;
  const n = ps.length - 1;
  const right = ps.map((p, i): Pt => [p[0] + nrm(i)[0] * w(i), p[1] + nrm(i)[1] * w(i)]);
  const left = ps.map((p, i): Pt => [p[0] - nrm(i)[0] * w(i), p[1] - nrm(i)[1] * w(i)]);
  const t = unit([ps[n][0] - ps[n - 1][0], ps[n][1] - ps[n - 1][1]]);
  const [nx, ny] = nrm(n);
  const P = (along: number, off: number): Pt => [ps[n][0] + t[0] * along + nx * off * w1, ps[n][1] + t[1] * along + ny * off * w1];
  const poly: Pt[] = [...right.slice(0, n), P(0.28, 1), P(-0.28, -1), ...left.slice(0, n).reverse()];
  return { poly, axis: ps };
}

/**
 * Petrified Forest: an old tree of the forest, gone to stone: a thick trunk
 * on its flaring roots and an uneven crown of gnarled boughs, each snapped
 * short in one clean slant, and one great bough lopped off near the trunk,
 * the rings showing in its broken face.
 */
function stoneOak(): Sigil {
  const G = 6.4;
  const trunk: Pt[] = [
    ...arc3([-4.0, G], [-2.3, 5.0], [-1.65, 2.6], 10),
    [-1.55, 1.0],
    [-2.0, -0.3],
    [1.9, -0.5],
    [1.6, 0.9],
    ...arc3([1.75, 2.6], [2.4, 5.0], [4.0, G], 10),
  ];
  const boughs = [
    limb([[-1.0, 0.7], [-2.7, -0.4], [-4.8, -0.7], [-6.9, 0.3]], 0.85, 0.4),
    limb([[-0.7, 0.0], [-1.8, -2.4], [-3.9, -3.9], [-4.5, -6.4]], 0.8, 0.4),
    limb([[0.1, -0.2], [0.6, -3.2], [-0.3, -5.4], [0.3, -7.9]], 0.85, 0.42),
    limb([[1.0, 0.6], [2.9, -0.2], [5.0, -1.1], [6.9, -0.4]], 0.82, 0.4),
    limb([[-3.6, -3.6], [-5.5, -4.0], [-6.5, -5.1]], 0.38, 0.28),
  ];
  const tree = { poly: trunk, axis: [[0, G] as Pt, [0, 1.0] as Pt, [0, -0.3] as Pt] };
  // A great bough broken off near the trunk: its stub, and the broken face at its end, seen a little from the side.
  const [s0, s1]: Pt[] = [[0.6, -0.1], [3.1, -3.3]];
  const su: Pt = [(s1[0] - s0[0]) / Math.hypot(s1[0] - s0[0], s1[1] - s0[1]), (s1[1] - s0[1]) / Math.hypot(s1[0] - s0[0], s1[1] - s0[1])];
  const sw = 0.85;
  const faceAt = (k: number, scale = 1): Pt => {
    const a = (2 * Math.PI * k) / 32;
    return [s1[0] + scale * (-su[1] * sw * Math.cos(a) + su[0] * 0.38 * Math.sin(a)), s1[1] + scale * (su[0] * sw * Math.cos(a) + su[1] * 0.38 * Math.sin(a))];
  };
  const face = Array.from({ length: 32 }, (_, k) => faceAt(k));
  const stub = { poly: [[s0[0] - su[1] * 0.95, s0[1] + su[0] * 0.95], [s1[0] - su[1] * sw, s1[1] + su[0] * sw], [s1[0] + su[1] * sw, s1[1] - su[0] * sw], [s0[0] + su[1] * 0.95, s0[1] - su[0] * 0.95]] as Pt[], axis: [s0, s1] };
  const parts = [tree, stub, ...boughs];
  const groups = [[face], parts.map((p) => p.poly)];
  const { lines, on } = solids(groups, G);
  // The side turned from the light: upright strokes on the lower right of each part's axis.
  const offAxis = (p: Pt, axis: Pt[]) => {
    let best = Infinity;
    let off = 0;
    let nx = 0;
    let ny = 0;
    for (let i = 1; i < axis.length; i++) {
      const [a, b] = [axis[i - 1], axis[i]];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const L = Math.hypot(dx, dy);
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L)));
      const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
      if (d < best) [best, off, nx, ny] = [d, ((p[0] - a[0]) * -dy + (p[1] - a[1]) * dx) / L, -dy / L, dx / L];
    }
    // Measured toward the lower right, whichever way the part runs.
    return nx + ny >= 0 ? off : -off;
  };
  // The grain up the trunk, bending into the boughs above.
  let fine = '';
  for (const [x0, x1] of [[-1.3, -0.95], [-0.45, -0.25], [0.3, 0.45]] as [number, number][])
    fine += kept(arc3([x0 * 1.5, G - 0.5], [x0, 2.6], [x1, -0.2], 12), (p) => on(p, 1, 0.25));
  let shade = '';
  const hatch = (part: { poly: Pt[]; axis: Pt[] }, g: number, from: number) => {
    const xs = part.poly.map((p) => p[0]);
    return uprightSegs(part.poly, Math.min(...xs) + 0.15, Math.max(...xs), 0.6, 0.2)
      .map(([p, q]) => kept([p, q], (s) => on(s, g, 0.22) && offAxis(s, part.axis) > from && parts.every((o) => o === part || !inside(o.poly, s))))
      .join('');
  };
  shade += hatch(tree, 1, 0.25);
  shade += hatch(stub, 1, 0.1);
  // Only the boughs that climb steeply: under a flat one the strokes would be ticks.
  boughs
    .filter((b) => {
      const [p, q] = [b.axis[0], b.axis[b.axis.length - 1]];
      return Math.abs(q[1] - p[1]) > 1.2 * Math.abs(q[0] - p[0]);
    })
    .forEach((b) => (shade += hatch(b, 1, 0.12)));
  // The rings in the broken face.
  fine += closed(Array.from({ length: 32 }, (_, k) => faceAt(k, 0.5)));
  return { lines: lines + line([-4.4, G], [4.2, G]), fine, shade };
}

/**
 * Abyssal City, the Lich Lords' city, as the Delve map marks it: a squat
 * temple block under a heavy cornice with a row of dentils, its walls flaring
 * out at the foot, a low door, the Abyss's roots gripping its foot, and
 * tendrils peeling off its corners to curl out.
 */
function temple(): Sigil {
  const g = 6.0;
  const [cw, cTop, cBot] = [5.2, -5.6, -4.5];
  const [ww, wTop] = [4.4, -3.7];
  const bw = 6.3;
  // A wall's line on side `s` at fraction `u` across the face (0 the middle, 1 the edge): top, a point low on it, its foot.
  const wall = (s: number, u: number): [Pt, Pt, Pt] => {
    const top: Pt = [s * ww * u, wTop];
    const foot: Pt = [s * bw * u, g];
    const low: Pt = [s * (ww + (bw - ww) * 0.18) * u, 1.8];
    return [top, low, foot];
  };
  let lines = '';
  // The cornice: a slab standing out over the walls, the dentils under it.
  lines += closed([
    [-cw, cTop],
    [cw, cTop],
    [cw, cBot],
    [-cw, cBot],
  ]);
  const n = 7;
  const dw = (2 * ww) / (2 * n - 1);
  const dent: Pt[] = [[-ww, cBot]];
  for (let i = 0; i < 2 * n - 1; i++) {
    const x = -ww + i * dw;
    const y = i % 2 === 0 ? wTop : cBot + 0.3;
    dent.push([x, y], [x + dw, y]);
  }
  dent.push([ww, cBot]);
  lines += path(dent);
  // The walls, flaring to the foot.
  for (const s of [-1, 1]) lines += path(arc3(...wall(s, 1)));
  lines += line([-bw - 0.5, g], [bw + 0.5, g]);
  // The doorway, low at the foot: an opening narrowing to its lintel, as the old tombs' doors do.
  const [dTop, dwT, dwB] = [2.3, 0.85, 1.05];
  const door: Pt[] = [
    [-dwB, g],
    [-dwT, dTop],
    [dwT, dTop],
    [dwB, g],
  ];
  lines += path(door);
  lines += path([[-dwT - 0.45, dTop], [-dwT - 0.45, dTop - 0.6], [dwT + 0.45, dTop - 0.6], [dwT + 0.45, dTop]]);
  // Roots of the Abyss gripping the wall's foot: tapered bands climbing out of the ground, each bowed outward.
  const root = (s: number, tip: Pt, b0: number, b1: number, bow: number): Pt[] => {
    const [p, q]: Pt[] = [
      [s * b0, g],
      [s * b1, g],
    ];
    const t: Pt = [s * tip[0], tip[1]];
    const m = (a: Pt, k: number): Pt => [(a[0] + t[0]) / 2 + s * k, (a[1] + t[1]) / 2];
    return [...arc3(p, m(p, bow), t, 14), ...arc3(t, m(q, bow + 0.15), q, 14).slice(1)];
  };
  const roots = (s: number) => [root(s, [3.0, -1.2], 2.9, 4.3, 0.6)];
  for (const s of [-1, 1]) for (const r of roots(s)) lines += path(r);
  // The corner tendrils, peeling off the cornice's corners and curling out past the foot.
  for (const s of [-1, 1]) {
    const a: Pt = [s * cw, cBot];
    const curl = arc3(a, [s * (cw - 0.1), 1.0], [s * (bw + 0.9), 4.3], 20);
    const tip = arc3([s * (bw + 0.9), 4.3], [s * (bw + 1.7), 3.3], [s * (bw + 1.2), 2.4], 8).slice(1);
    lines += path([...curl, ...tip]);
  }
  let fine = '';
  // Stone courses across the walls, stopping short of the roots and the door.
  const all = [-1, 1].flatMap(roots);
  const clear = (p: Pt) => {
    if (Math.abs(p[0]) < dwT + 0.8 && p[1] > dTop - 1.0) return false;
    return all.every((r) => !inside(r, p) && edgeDist(r, p) > 0.35);
  };
  for (const y of [-1.9, 0.4, 2.7, 4.8]) {
    const half = ww + ((bw - ww) * (y - wTop)) / (g - wTop) - 0.3;
    fine += kept([[-half, y], [half, y]], clear);
  }
  // Shade: the outer root on the right, and the doorway's dark.
  const shade = upright(roots(1)[0], 3.4, 4.3, 0.8, 0.3) + upright(door, 0.15, 0.95, 0.8, 0.3);
  return { lines, fine, shade };
}

/** The ground line. */
const G = 6;

/**
 * Primeval Ruins: a colossal stone head in profile, facing left,
 * heavy-browed and long-eared, sunk in the earth to its chest and leaning
 * back, a piece of its crown broken away and a crack running down from the
 * break.
 */
function head(): Sigil {
  const lean = 7;
  const L = (ps: Pt[]) => ps.map((p) => rot(p, lean, [0, G]));
  const out = L([
    [-3.4, G + 1],
    [-3.0, 3.7],
    [-4.3, 3.1],
    [-4.5, 2.2],
    [-4.0, 1.6],
    [-4.7, 0.9],
    [-4.4, 0.2],
    [-5.7, -0.2],
    [-4.2, -3.6],
    [-4.9, -4.0],
    [-4.3, -5.0],
    [-3.8, -8.3],
    [-0.2, -8.55],
    [0.6, -7.4],
    [1.4, -7.0],
    [1.9, -5.8],
    [2.9, -5.4],
    [3.4, -4.2],
    [3.5, -2],
    [3.1, 1.0],
    [3.9, G + 1],
  ]);
  const above = (p: Pt) => p[1] < G - 0.3;
  // The ground, broken where the body goes down into it.
  const into = (a: Pt, b: Pt) => a[0] + ((b[0] - a[0]) * (G - a[1])) / (b[1] - a[1]);
  const [xl, xr] = [into(out[0], out[1]), into(out[out.length - 1], out[out.length - 2])];
  const lines = kept(out, (p) => p[1] < G) + line([-7.2, G], [xl, G]) + line([xr, G], [7.2, G]);
  let fine = '';
  // The long ear.
  const ear = L([[0.3, -3.6], ...arc3([0.3, -3.6], [0.95, -4.25], [1.6, -3.6], 8).slice(1), [1.6, 0.5], [0.7, 1.0]]);
  fine += path(ear);
  // The brow's underside and the mouth.
  fine += path(L([[-4.2, -3.6], [-3.0, -3.4]])) + path(L([[-4.0, 1.6], [-3.1, 1.6]]));
  // The jaw, from under the chin back to the ear.
  fine += path(L([[-2.9, 3.3], [0.4, 1.2]]));
  // The crack, down from the break.
  fine += path(L([[0.6, -7.4], [-0.3, -6.0], [0.1, -5.2], [-0.4, -4.0]]));
  // The back of the head, clear of the outline and the ear; the eye deep under the brow.
  const back = uprightSegs(out, 2.9, 5, 0.8, 0.45)
    .map(([p, q]) => kept([p, q], (x) => above(x) && edgeDist(out, x) > 0.5 && edgeDist(ear, x) > 0.5))
    .join('');
  const eye = L([[-3.9, -3.3], [-3.0, -3.2], [-3.0, -2.0], [-3.9, -2.2]]);
  const ex = Math.min(...eye.map((p) => p[0]));
  const shade = back + upright(eye, ex + 0.35, ex + 1.0, 0.6, 0.1);
  return { lines, fine, shade };
}

const BY_NAME: Record<string, () => Sigil> = {
  'The Mines': () => placed(drift(), 1.039, 0, -0.301),
  'Magma Fissure': () => placed(totem(), 1.04, 0, 0.9),
  'Frozen Hollow': () => placed(crystal(), 0.997, 0, -0.15),
  'Fungal Caverns': () => placed(chanterelles(), 0.998, -0.021, -0.259),
  'Vaal Outpost': () => placed(pyramid(), 0.97, 0, -0.17),
  'Abyssal Depths': () => placed(opening(), 1.04, 0.2, 0.1),
  'Petrified Forest': () => placed(stoneOak(), 1.02, 0.45, 0.2),
  'Sulphur Vents': () => placed(sulphur(), 0.993, 0, 0.514),
  'Abyssal City': () => placed(temple(), 1.0, 0, 0),
  'Primeval Ruins': () => placed(head(), 0.996, 0, 0.28),
};

/** The three sets a zone's drawings come from. */
export type SigilSet = 'current' | 'scenes' | 'third';
const SETS: Record<SigilSet, Record<string, () => Sigil>> = { current: BY_NAME, scenes: SCENE_SIGILS, third: THIRD_SIGILS };

/**
 * Each zone's three drawings, best first, as the owner ranked them blind on
 * the QA desk (src/qa/benches/zonesigils.ts, its last round, 18 Nov 2026):
 * by score; a tie on score to the winner of the pair's own trials, and a
 * tie there too in the sets' order (current, scenes, third), as the bench
 * lists it.
 */
export const RANKED: Record<string, readonly [SigilSet, SigilSet, SigilSet]> = {
  'The Mines': ['current', 'third', 'scenes'],
  'Magma Fissure': ['scenes', 'current', 'third'],
  'Frozen Hollow': ['current', 'scenes', 'third'],
  'Fungal Caverns': ['third', 'current', 'scenes'],
  'Vaal Outpost': ['current', 'third', 'scenes'],
  'Abyssal Depths': ['scenes', 'current', 'third'],
  'Petrified Forest': ['third', 'current', 'scenes'],
  'Sulphur Vents': ['current', 'third', 'scenes'],
  'Abyssal City': ['current', 'third', 'scenes'],
  'Primeval Ruins': ['scenes', 'third', 'current'],
};

const made = new Map<string, Sigil>();
/** Set `set`'s drawing of `zone`, made once. */
export function drawingOf(set: SigilSet, zone: string): Sigil {
  const key = `${set}|${zone}`;
  let s = made.get(key);
  if (!s) made.set(key, (s = SETS[set][zone]()));
  return s;
}

/**
 * The emblem of the biome called `name` (a stratum's name, lib/descent.ts):
 * a zone's best drawing for the zone itself; for a stratum past the zones,
 * its archetype's zone's (lib/backdrops.ts, emblemOf) second best the first
 * time the archetype comes round, its third the next, and so on in turn;
 * the Mines' best for any other name.
 */
export function sigilOf(name: string): Sigil {
  const zone = emblemOf(name);
  if (!zone || !RANKED[zone]) return drawingOf(RANKED['The Mines'][0], 'The Mines');
  const turn = zone === name ? undefined : turnOfName(name);
  return drawingOf(RANKED[zone][turn === undefined ? 0 : 1 + (turn % 2)], zone);
}

/** The zone a depth is in: the Mines for depths 1 to 10, Magma Fissure for 11 to 20, and so on (past 100, the generated stratum's own name). */
export const zoneAt = (depth: number) => stratumName(Math.max(0, Math.floor((depth - 1) / 10)));

/**
 * A sigil's lines as separate strokes, so it can draw itself (each piece of
 * the path data is a stroke of its own: the browser restarts a dash at every
 * one): `lines` and `fine` each nearest the centre first, `shade` whole (it
 * fades in after).
 */
export function sigilStrokes(name: string): { lines: string[]; fine: string[]; shade: string } {
  return strokesOf(sigilOf(name));
}

/** A given sigil's lines as separate strokes, as sigilStrokes splits a place's own. */
export function strokesOf(s: Sigil): { lines: string[]; fine: string[]; shade: string } {
  const from = (d: string) => {
    const [x, y] = (d.match(/-?[\d.]+/g) ?? ['0', '0']).slice(0, 2).map(Number);
    return Math.hypot(x, y);
  };
  const split = (d: string) =>
    d
      .split(/(?=M)/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p, i) => ({ p, i, r: from(p) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.p);
  return { lines: split(s.lines), fine: split(s.fine), shade: s.shade ?? '' };
}

/** The biomes that have an emblem of their own. */
export const SIGIL_NAMES = Object.keys(BY_NAME);
