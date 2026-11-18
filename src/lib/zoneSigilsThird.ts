// A third set of zone sigils, cut to the contract of lib/zoneSigils.ts
// (lines, fine, shade; inside a circle of radius 10 about the origin, y
// down, light from the upper left, hatching upright on the side turned from
// it). Where the first set gives each zone a sign and the second a small
// scene, this one draws each zone's own thing up close, filling its seal:
// the miners' crossed hammer and pick, fire off a pool of magma, a
// warband's pennant frozen stiff, a tuft of bonnet mushrooms, a Vaal
// Sacrifice fragment, the Abyss's light welling out of its pit, a dead tree
// turned to stone and sheared through, fumes billowing out of a crack, the
// Lich's throne, an arch that lost its keystone.

import { arc, at, line, ring, type Pt } from './arcane.ts';
import type { Sigil } from './zoneSigils.ts';
import { across, arc3, bough, circ, closed, edgeDist, ember, icicles, inside, kept, path, placed, ragged, ridges, rot, segs, upright, uprightSegs } from './sigilKit.ts';

/**
 * The Mines: the miners' arms, hammer and pick crossed with their heads up,
 * as mining towns cut them over their doors; the hammer's handle over the
 * pick's, the pick's cut short where it passes under.
 */
function arms(): Sigil {
  const lean = 40;
  const hw = 0.55;
  const [ham, pick] = [-lean, lean];
  const T = (pts: Pt[], a: number) => pts.map((p) => rot(p, a));
  // The hammer: a square-faced head on its handle.
  const head: Pt[] = [
    [-2.9, -7.9],
    [2.9, -7.9],
    [2.9, -4.5],
    [-2.9, -4.5],
  ];
  const hHead = T(head, ham);
  const hHandle = [T([[-hw, -4.5], [-hw, 8.6]], ham), T([[hw, -4.5], [hw, 8.6]], ham)];
  // The pick: a curved head with a point at either end.
  const outer = arc3([-5.2, -5.4], [0, -7.3], [5.2, -5.4]);
  const inner = arc3([5.2, -5.4], [0, -6.25], [-5.2, -5.4]);
  const pHead = T([...outer, ...inner.slice(1, -1)], pick);
  const pHandle = [T([[-hw, -6.28], [-hw, 8.6]], pick), T([[hw, -6.28], [hw, 8.6]], pick)];
  // Where the pick's handle passes under the hammer's.
  const u = rot([0, -1], ham);
  const clear = (p: Pt) => across(p, [0, 0], u).off > hw + 0.5;
  const lines =
    closed(hHead) +
    hHandle.map((l) => path(l)).join('') +
    path(T([[-hw, 8.6], [hw, 8.6]], ham)) +
    closed(pHead) +
    pHandle.map((l) => kept(l, clear)).join('') +
    path(T([[-hw, 8.6], [hw, 8.6]], pick));
  const fine =
    path(T([[-2.1, -7.9], [-2.1, -4.5]], ham)) +
    path(T([[2.1, -7.9], [2.1, -4.5]], ham)) +
    path(T(arc3([-3.4, -5.7], [0, -7.1], [3.4, -5.7], 16), pick));
  const xs = (ps: Pt[]) => ps.map((p) => p[0]);
  const hx = xs(hHead);
  const px = xs(pHead);
  return {
    lines,
    fine,
    shade:
      upright(hHead, (Math.min(...hx) + Math.max(...hx)) / 2 + 0.2, Math.max(...hx), 0.9, 0.5) +
      upright(pHead, (Math.min(...px) + Math.max(...px)) / 2 + 0.8, Math.max(...px), 0.9, 0.45),
  };
}

/**
 * Petrified Forest: a dead tree turned to stone, standing on its roots, its
 * boughs forking bare and broken to points; its trunk sheared through high
 * up and the top block slid along the break, as only stone slips, the
 * rings of the wood in its flat cut top, a second crack across it lower down.
 */
function stoneTree(): Sigil {
  const foot = 7.0;
  // The trunk, flaring to its roots, sheared through high up and its top
  // slid along the break; its top cut flat, the cut's near rim the outline's top.
  const [tx, ty, tr] = [2.15, -7.0, 0.8];
  const [yc, slip] = [-4.5, 0.75];
  const face = (k: number, a0: number, a1: number, n = 24): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      return [slip + k * tx * Math.cos(t), ty + k * tr * Math.sin(t)];
    });
  const trunkL: Pt[] = [...arc3([-6.3, foot], [-3.2, 5.4], [-2.55, 2.8], 12), ...arc3([-2.55, 2.8], [-2.3, -2.0], [-tx, ty], 16).slice(1)];
  /** The trunk's half width at height `y`, before the slip. */
  const half = (y: number) => {
    for (let i = 0; i + 1 < trunkL.length; i++) {
      const [a, b] = [trunkL[i], trunkL[i + 1]];
      if ((a[1] - y) * (b[1] - y) <= 0) return -(a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1] || 1));
    }
    return tx;
  };
  /** One side of the trunk from its foot to its top, `k` -1 for the left, the part above the shear slid. */
  const flank = (k: 1 | -1): Pt[] => {
    const ps = trunkL.map(([x, y]) => [-k * x, y] as Pt);
    const h = half(yc);
    return [...ps.filter((p) => p[1] > yc), [k * h, yc], [k * h + slip, yc], ...ps.filter((p) => p[1] < yc).map(([x, y]) => [x + slip, y] as Pt)];
  };
  const trunk: Pt[] = [...flank(-1), ...face(1, 180, 0).slice(1, -1), ...flank(1).reverse()];
  const boughs: Pt[][] = [
    bough([-0.8, 0.6], [-4.2, -1.4], [-8.1, -3.7], 1.25, 0.2, 16),
    bough([-3.9, -1.0], [-4.9, -3.6], [-5.5, -7.0], 0.65, 0.15, 16),
    bough([0.8, 1.8], [4.4, 0.5], [8.1, -2.3], 1.2, 0.2, 16),
    bough([4.6, 0.1], [5.8, -2.6], [6.3, -6.2], 0.65, 0.15, 16),
  ];
  const pieces = [trunk, ...boughs];
  const bare = (p: Pt, but = -1) => pieces.every((o, j) => j === but || !inside(o, p));
  const lines =
    pieces.map((ps, i) => kept([...ps, ps[0]], (p) => bare(p, i))).join('') + path(face(1, 180, 360)) + line([-6.8, foot], [6.8, foot]);
  // The cracks across the trunk, each a ring round it seen from a little
  // above; at the shear, the slid block's foot showing past the break.
  const crackAt = (y: number, dx = 0) => arc3([dx - half(y) + 0.05, y], [dx, y + 0.42], [dx + half(y) - 0.05, y], 16);
  const cracks = [crackAt(4.3), crackAt(yc), crackAt(yc, slip).filter((p) => p[0] > half(yc) - 0.1)];
  const clear = (p: Pt) => cracks.every((c) => c.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.45));
  let fine = path(cracks[0]);
  const lines2 = path(cracks[1]) + path(cracks[2]);
  // The rings in the cut, and the checks that split them.
  for (const k of [0.62, 0.3]) fine += closed(face(k, 0, 360).slice(0, -1));
  for (const a of [35, 200, 290]) {
    const t = (a * Math.PI) / 180;
    fine += line([slip + 0.38 * tx * Math.cos(t), ty + 0.38 * tr * Math.sin(t)], [slip + 0.9 * tx * Math.cos(t), ty + 0.9 * tr * Math.sin(t)]);
  }
  // The grain along the trunk, stopping short of the cracks and the boughs' roots.
  const inTrunk = (p: Pt) => inside(trunk, p) && edgeDist(trunk, p) > 0.4 && clear(p) && bare(p, 0);
  for (const [x, y0, y1] of [
    [-1.15, -6.4, 3.6],
    [-0.2, -3.6, 1.0],
    [0.95, -6.2, 3.8],
    [-0.6, 4.9, 6.3],
  ] as const) {
    if (y0 < yc) fine += kept([[x + slip, y0], [x + slip, yc]], inTrunk);
    fine += kept([[x, Math.max(y0, yc)], [x, y1]], inTrunk);
  }
  // The roots, running out into the ground.
  const roots = [arc3([-1.5, 4.9], [-2.3, 6.0], [-3.6, foot - 0.15], 8), arc3([1.4, 5.0], [1.9, 6.0], [2.8, foot - 0.15], 8)];
  for (const r of roots) fine += kept(r, (p) => clear(p));
  const offRoots = (p: Pt) => roots.every((r) => r.every((q, i) => i === 0 || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.4));
  // The side turned from the light: the trunk's right and the right boughs.
  const shadeSegs = [
    ...uprightSegs(trunk, 0.45, 2.6, 0.5, 0.3),
    ...uprightSegs(trunk, 2.9, 5.6, 0.55, 0.3).filter(([p]) => p[1] > 3),
    ...uprightSegs(boughs[2], 1.6, 8.0, 0.55, 0.25),
    ...uprightSegs(boughs[3], 4.8, 6.6, 0.5, 0.2),
  ];
  const shade = shadeSegs.map(([p, q]) => kept([p, q], (s) => clear(s) && offRoots(s) && (inside(trunk, s) ? bare(s, 0) : true))).join('');
  return { lines: lines + lines2, fine, shade };
}

/**
 * Primeval Ruins: an arch older than any other in the descent, its keystone
 * fallen: the two halves of its stones still reaching for each other over
 * the gap, the keystone lying between the piers below.
 */
function arch(): Sigil {
  const c: Pt = [0, 0.4];
  const [ri, ro] = [4.0, 6.6];
  const ground = 7.0;
  const gap = 9;
  let lines = arc(c, ri, -90, -gap) + arc(c, ro, -90, -gap - 2) + arc(c, ri, gap, 90) + arc(c, ro, gap + 2, 90);
  // The broken faces either side of the gap.
  for (const k of [-1, 1]) lines += path([at(c, k * gap, ri), at(c, k * (gap - 2.5), ri + 0.9), at(c, k * (gap + 1.5), ri + 1.7), at(c, k * (gap + 2), ro)]);
  let fine = '';
  // The joints between the stones.
  for (const a of [-70, -50, -30, 30, 50, 70]) fine += line(at(c, a, ri), at(c, a, ro));
  // The piers, coursed.
  lines += path([[-ro, c[1]], [-ro, ground]]) + path([[-ri, c[1]], [-ri, ground]]) + path([[ri, c[1]], [ri, ground]]) + path([[ro, c[1]], [ro, ground]]);
  for (const y of [2.6, 4.8]) fine += line([-ro, y], [-ri, y]) + line([ri, y], [ro, y]);
  lines += line([-6.9, ground], [6.9, ground]);
  // The keystone, fallen on its side between the piers.
  const ks: Pt = [0.6, ground - 1.1];
  lines += closed([rot([-1.5, -0.9], 78, [0, 0]), rot([1.5, -1.4], 78, [0, 0]), rot([1.1, 1.3], 78, [0, 0]), rot([-1.1, 1.3], 78, [0, 0])].map(([x, y]) => [x + ks[0], y + ks[1]] as Pt));
  const band = [...Array.from({ length: 11 }, (_, k) => at(c, gap + 2 + (k * (88 - gap)) / 10, ro)), ...Array.from({ length: 11 }, (_, k) => at(c, 88 - (k * (88 - gap)) / 10, ri))];
  return {
    lines,
    fine,
    shade:
      upright(band, 1.6, 6.2, 0.8, 0.45) +
      upright(
        [
          [-5.3, c[1]],
          [-ri, c[1]],
          [-ri, ground],
          [-5.3, ground],
        ],
        -5.0,
        -4.3,
        0.45,
        0.4,
      ) +
      upright(
        [
          [5.4, c[1]],
          [ro, c[1]],
          [ro, ground],
          [5.4, ground],
        ],
        5.6,
        6.3,
        0.45,
        0.4,
      ),
  };
}

// The great flame's outline, from the left end of its root up and over every tongue to the
// right end; each tongue bends once.
const FLAME: Pt[] = [
  [-4.6, 2.6],
  [-5.7, -0.2],
  [-6.3, -3.6], // left low tongue
  [-3.9, -1.0],
  [-4.0, -3.9],
  [-2.7, -6.6], // left tongue
  [-1.4, -3.4],
  [-0.9, -6.0],
  [0.7, -9.3], // the tall middle tongue
  [1.5, -5.9],
  [1.9, -3.0],
  [3.1, -4.9],
  [4.0, -7.0], // right tongue
  [3.7, -2.0],
  [5.3, -3.1],
  [6.2, -4.7], // right low tongue
  [5.8, -0.8],
  [4.6, 2.6],
];
// Its heart: the same cut, smaller, from the left end of its root to the right.
const HEART: Pt[] = [
  [-2.1, 3.4],
  [-2.6, 1.0],
  [-2.5, -1.6],
  [-1.0, -0.2],
  [-0.5, -2.8],
  [0.6, -5.4],
  [1.2, -2.6],
  [2.3, 0.4],
  [2.1, 3.4],
];

/** Points round an ellipse about `c`, broken into `n` straight facets, each corner nudged by `nudge(i)`. */
const facets = (c: Pt, rx: number, ry: number, n: number, nudge: (i: number) => number, a0 = 0, a1 = 360): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    const m = 1 + nudge(i);
    return [c[0] + rx * m * Math.cos(a), c[1] + ry * m * Math.sin(a)] as Pt;
  });

/**
 * Magma Fissure: fire off a pool of magma, the great flame's own cut set
 * lower and wider on the melt, the pool's edge faceted, its crust broken
 * into plates by straight cracks.
 */
function burning(): Sigil {
  const pc: Pt = [0, 3.9];
  const [rx, ry] = [7.6, 2.8];
  const nudge = (i: number) => [0, 0.05, -0.03, 0.06, -0.02, 0.04, -0.05, 0.03, 0.06, -0.04, 0.02, -0.03, 0.05, -0.02, 0.04, -0.05, 0][i % 17];
  const edge = facets(pc, rx, ry, 16, nudge);
  // The fire: the great flame's own cut, lower and wider, rooted flat on the melt across the pool's back half.
  const y = pc[1] - 0.2;
  const onPool = ([x, v]: Pt): Pt => [x * 1.02, y + (v - 2.6) * 0.95];
  const fire: Pt[] = FLAME.map(onPool);
  // Its heart, cut the same way, open where it meets the melt.
  const heart: Pt[] = HEART.map(([x, v]) => onPool([x, v - 0.8]));
  const fireShape: Pt[] = [...fire, [fire[fire.length - 1][0], y + 0.01], [fire[0][0], y + 0.01]];
  const clearFire = (p: Pt) => !inside(fireShape, p) && edgeDist(fire, p) > 0.45;
  // Cracks breaking the crust in front of the fire into plates: straight runs, each bending once.
  const cracks: Pt[][] = [
    [[-4.2, y + 0.4], [-4.9, 4.9], [-5.6, 6.2]],
    [[-1.4, y + 0.4], [-1.9, 5.2], [-1.3, 6.6]],
    [[1.9, y + 0.4], [2.2, 5.0], [1.6, 6.6]],
    [[4.6, y + 0.4], [5.1, 4.7], [6.2, 5.8]],
    [[-4.9, 4.9], [-1.9, 5.2]],
    [[2.2, 5.0], [5.1, 4.7]],
  ];
  const inPool = (p: Pt) => inside(edge, p) && edgeDist(edge, p) > 0.4;
  // The bank of the pool turned from the light: hatched below its front right edge.
  const bank: Pt[] = [...facets(pc, rx, ry, 16, nudge, 0, 90), ...facets(pc, rx + 1.2, ry + 1.2, 16, nudge, 90, 0)];
  return {
    lines: path(fire) + kept(edge, (p) => p[1] > y || clearFire(p)),
    fine: path(heart) + cracks.map((c) => kept(c, inPool)).join('') + ember([-3.6, -6.6], 0.65) + ember([3.0, -7.6], 0.75),
    shade: segs(uprightSegs(bank, 2.4, 7.6, 0.9, 0.12)),
  };
}

/**
 * Frozen Hollow: a warband's pennant (the Mutewind, the cold warband, keep
 * a camp found only in the Frozen Hollow; the pennant is drawn generic),
 * left frozen stiff mid-flutter on its spear: the cloth stands out sideways
 * in one rippling wave, cut in a swallowtail at its fly, while four icicles
 * hang straight down from its lower edge; a drift of snow round the spear's
 * foot. On the lit part of the cloth, the cold warband's mark as the game's
 * map shows their camp, a ring under a crescent of upturned horns; a sleeve
 * where the cloth wraps the spear, a ridge down each long icicle. The cloth
 * from the dip of its wave to its rise is hatched, turned from the light.
 */
function pennant(): Sigil {
  const pole = -5.4;
  const fly = 7.2;
  const head = closed([[pole, -9.0], [pole + 0.75, -7.0], [pole, -6.1], [pole - 0.75, -7.0]]);
  // The cloth's frozen ripple: its top and bottom edges one wave, the cloth narrowing to the fly.
  const wave = (x: number) => 0.75 * Math.sin(((x - pole) / (fly - pole)) * 2 * Math.PI * 0.9);
  const top = (x: number) => -5.6 + wave(x);
  const bot = (x: number) => -0.7 - 0.12 * (x - pole) + wave(x);
  const xs = Array.from({ length: 49 }, (_, i) => pole + ((fly - pole) * i) / 48);
  // The fly cut in a swallowtail.
  const notch: Pt = [fly - 1.7, (top(fly) + bot(fly)) / 2];
  const cloth: Pt[] = [...xs.map((x): Pt => [x, top(x)]), notch, ...xs.slice().reverse().map((x): Pt => [x, bot(x)])];
  // Icicles hanging straight down from the cloth's lower edge, as the cold left them.
  const spec: [number, number, number][] = [[-3.0, 0.72, 3.6], [-0.4, 0.82, 5.0], [2.4, 0.7, 3.0], [4.9, 0.62, 2.3]];
  // The dip and the rise of the wave; a fold down each.
  const dip = pole + (fly - pole) * (0.25 / 0.9);
  const rise = pole + (fly - pole) * (0.75 / 0.9);
  const fold = (x: number) => line([x, top(x) + 0.5], [x, bot(x) - 0.5]);
  // The cloth turned from the light: from the dip to the rise.
  const span = xs.filter((x) => x >= dip && x <= rise);
  const facing: Pt[] = [...span.map((x): Pt => [x, top(x)]), ...span.slice().reverse().map((x): Pt => [x, bot(x)])];
  // The cold warband's mark on the lit part of the cloth, as the game's map
  // shows their camp: a ring under a crescent of upturned horns.
  const c: Pt = [pole + 2.05, -1.75];
  const mark =
    ring(c, 0.85) +
    path([...arc3([c[0] - 1.1, c[1] - 2.3], [c[0], c[1] - 1.1], [c[0] + 1.1, c[1] - 2.3], 12), ...arc3([c[0] + 1.1, c[1] - 2.3], [c[0], c[1] - 1.6], [c[0] - 1.1, c[1] - 2.3], 12).slice(1)]);
  // The sleeve where the cloth wraps the spear.
  const sleeve = line([pole + 0.75, top(pole + 0.75) + 0.3], [pole + 0.75, bot(pole + 0.75) - 0.3]);
  // Snow drifted round the spear's foot, in two mounds.
  const drift = [...arc3([pole - 2.5, 6.9], [pole - 0.3, 5.6], [pole + 1.6, 6.3], 12), ...arc3([pole + 1.6, 6.3], [pole + 2.4, 6.0], [pole + 3.1, 6.9], 8).slice(1)];
  return {
    lines: line([pole, 5.75], [pole, -6.1]) + head + closed(cloth) + icicles(spec, bot) + path(drift),
    fine: fold(dip) + fold(rise) + sleeve + mark + ridges(spec, bot) + line([pole - 2.8, 6.9], [pole + 3.4, 6.9]),
    shade: upright(facing, dip + 0.7, rise - 0.3, 1.0, 0.5),
  };
}

/**
 * Fungal Caverns: a tuft of bonnet mushrooms springing from one spot on the
 * ground, their slender stems bowing outward, each bell cap ribbed from rim
 * to tip.
 */
function tuft(): Sigil {
  const G: Pt = [0, 6.2];
  // Each stem: its lean from upright (degrees), its length, how far it bows, its cap's half width.
  const stems: [number, number, number, number][] = [
    [-46, 7.4, 0.9, 1.6],
    [-19, 9.4, 0.7, 2.0],
    [3, 10.6, 0.3, 2.2],
    [26, 8.7, 0.8, 1.9],
    [50, 6.6, 0.9, 1.5],
  ];
  // Front to back: the middle cap over its neighbours, the tall ones over the short.
  const order = [2, 1, 3, 0, 4];
  const capOf: Pt[][] = [];
  const stemOf: Pt[][] = [];
  const ribOf: Pt[][][] = [];
  for (const [lean, len, bow, wc] of stems) {
    const B = G;
    const a = (lean * Math.PI) / 180;
    const T: Pt = [B[0] + len * Math.sin(a), B[1] - len * Math.cos(a)];
    const M: Pt = [(B[0] + T[0]) / 2 + Math.sign(lean || 1) * bow * Math.cos(a), (B[1] + T[1]) / 2 + Math.abs(bow * Math.sin(a))];
    const st = arc3(B, M, T, 16);
    // The cap leans the way the stem runs at its top.
    const [p, q] = [st.at(-2)!, T];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const u: Pt = [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
    const v: Pt = [-u[1], u[0]];
    const hc = wc * 1.35;
    const at = (x: number, y: number): Pt => [T[0] + x * v[0] + y * u[0], T[1] + x * v[1] + y * u[1]];
    // A bonnet: a bell, rounder at the tip than a cone, steeper at the rim than a dome.
    const half = (y: number) => wc * Math.sqrt(Math.max(0, 1 - Math.pow(y / hc, 1.5)));
    const n = 14;
    const cap: Pt[] = [
      ...Array.from({ length: n + 1 }, (_, k): Pt => at(-half((hc * k) / n), (hc * k) / n)),
      ...Array.from({ length: n }, (_, k): Pt => at(half((hc * (n - 1 - k)) / n), (hc * (n - 1 - k)) / n)),
    ];
    capOf.push(cap);
    stemOf.push(st);
    // The ribs, from the rim most of the way to the tip.
    ribOf.push(
      [-0.45, 0.45].map((f) =>
        Array.from({ length: 9 }, (_, k): Pt => {
          const y = 0.25 + ((hc * 0.62 - 0.25) * k) / 8;
          return at(f * half(y), y);
        }),
      ),
    );
  }
  const front = (i: number) => order.slice(0, order.indexOf(i));
  let lines = '';
  let fine = '';
  let shade = '';
  for (let i = 0; i < stems.length; i++) {
    const clear = (p: Pt) => !front(i).some((j) => inside(capOf[j], p));
    lines += kept([...capOf[i], capOf[i][0]], clear);
    lines += kept(stemOf[i].slice(0, -1), (p) => clear(p) && !inside(capOf[i], p));
    fine += ribOf[i].map((r) => kept(r, clear)).join('');
    const xs = capOf[i].map((p) => p[0]);
    const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
    shade += segs(uprightSegs(capOf[i], lo + (hi - lo) * 0.78, hi - 0.25, 0.95, 0.35).filter(([p, q]) => clear(p) && clear(q)));
  }
  lines += line([-5.4, G[1]], [5.4, G[1]]);
  return { lines, fine, shade };
}

type Ray = [a: number, hw: number, len: number];

/**
 * Vaal Outpost: one of the four Vaal Sacrifice fragments that together open
 * the Apex of Sacrifice, a quarter broken from a carved disc: a curved slab
 * of its rim, its rays standing from the arc, long and short in turn, a band
 * of carved day signs, the breaks straight and the slab's thickness shown
 * along its underside.
 */
function fragment(): Sigil {
  const C: Pt = [-5.5, 5.5];
  const R = 11;
  const r = 4.4;
  const a0 = 0;
  const a1 = 90;
  const rays: Ray[] = [
    [9, 5, 2.8],
    [27, 4, 1.5],
    [45, 5, 2.8],
    [63, 4, 1.5],
    [81, 5, 2.8],
  ];
  const outer: Pt[] = [];
  let a = a0;
  for (const [m, hw, len] of rays) {
    for (; a < m - hw; a += 2) outer.push(at(C, a, R));
    outer.push(at(C, m - hw, R), at(C, m, R + len), at(C, m + hw, R));
    a = m + hw;
  }
  for (; a < a1; a += 2) outer.push(at(C, a, R));
  outer.push(at(C, a1, R));
  const inner: Pt[] = [];
  for (let b = a1; b > a0; b -= 2) inner.push(at(C, b, r));
  inner.push(at(C, a0, r));
  const slab = [...outer, ...inner];
  // The band dividing the rim of day signs from the inner ring.
  const band = 8.2;
  const gap = 0.55;
  const deg = (len: number, rr: number) => (len / rr) * (180 / Math.PI);
  let lines = closed(slab) + arc(C, band, a0 + deg(gap, band), a1 - deg(gap, band));
  // Day signs: a square in each cell of the rim band.
  let fine = '';
  const mid = (R + band) / 2;
  const cells = 6;
  const half = 0.65;
  for (let i = 0; i < cells; i++) {
    const m = a0 + ((a1 - a0) * (i + 0.5)) / cells;
    const sq: Pt[] = [
      at(at(C, m, mid - half), m - 90, half),
      at(at(C, m, mid + half), m - 90, half),
      at(at(C, m, mid + half), m + 90, half),
      at(at(C, m, mid - half), m + 90, half),
    ];
    fine += closed(sq);
  }
  // The inner ring's own line, set in from the band.
  fine += arc(C, 6.3, a0 + deg(gap, 6.3), a1 - deg(gap, 6.3));
  // The slab's underside: the lower break seen edge on, hatched.
  const t: Pt = [0, 1.3];
  const p = at(C, a1, r);
  const q = at(C, a1, R);
  const side: Pt[] = [p, q, [q[0] + t[0], q[1] + t[1]], [p[0] + t[0], p[1] + t[1]]];
  fine += path(side.slice(1)) + line(side[3], side[0]);
  const shade = upright(side, p[0] + 0.6, q[0] - 0.4, 0.9, 0.3);
  return { lines, fine, shade };
}

/** Abyssal Depths: the pit as the game marks it on the map, a rim of broken ground about its mouth, the Abyss's light welling up out of it in rays. */
function welling(): Sigil {
  const c: Pt = [0, 4.6];
  const J = [0.05, -0.08, 0.1, -0.04, 0.08, -0.1, 0.06, -0.06, 0.09, -0.05, 0.07, -0.09, 0.04, -0.07];
  const rim = ragged(c, 7.3, 2.9, J);
  const mouth = ragged([0, 4.4], 4.3, 1.4, J.map((j) => j * 0.6));
  // Rays from deep in the mouth, fanning up, the middle tallest: [x at the mouth, how high].
  const rays: [number, number][] = [
    [-2.6, 5.8],
    [-1.3, 9.0],
    [0, 11.0],
    [1.3, 8.6],
    [2.6, 5.4],
  ];
  const shafts = rays.map(([x, h]): [Pt, Pt] => [
    [x, 4.6],
    [x * 1.6, 4.6 - h],
  ]);
  const nearShaft = (p: Pt) =>
    shafts.some(([a, b]) => {
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < 0.55;
    });
  // The rim whole, but cut where the light rises past its far edge; of the mouth, only its near lip, under the light.
  let lines = kept([...rim, rim[0]], (p) => p[1] > c[1] || !nearShaft(p));
  lines += kept([...mouth, mouth[0]], (p) => p[1] > 4.75);
  lines += shafts.map(([a, b]) => line(a, b)).join('');
  // The rim's broken stones: joints across its near side, from the mouth's lip out to the rim's edge.
  const leaves = (ps: Pt[], a: number): Pt => {
    // Where the ray from the mouth's centre at `a` degrees leaves the polygon `ps`.
    let best: Pt = ps[0];
    let bd = Infinity;
    for (let r = 0.5; r < 9; r += 0.02) {
      const p = at([0, 4.4], a, r);
      const s: Pt = [p[0], 4.4 + (p[1] - 4.4) * 0.4];
      if (!inside(ps, s)) {
        best = s;
        bd = r;
        break;
      }
    }
    return bd < Infinity ? best : ps[0];
  };
  const joints = [118, 148, 196, 228, 254]
    .map((a) => {
      const [p, q] = [leaves(mouth, a), leaves(rim, a)];
      const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
      return line([p[0] + dx * 0.18, p[1] + dy * 0.18], [p[0] + dx * 0.82, p[1] + dy * 0.82]);
    })
    .join('');
  // Shade: the rim's outer slope on the right, turned from the light.
  const shade = uprightSegs(rim, 4.4, 7.0, 0.8, 0.4)
    .map(([p, q]) => kept([[p[0], Math.max(p[1], 4.9)], q], (r) => !inside(mouth, r) && edgeDist(mouth, r) > 0.4))
    .join('');
  return { lines, fine: joints, shade };
}

/**
 * Sulphur Vents: fumes billowing up out of a crack in the cave
 * floor, as the zone's backdrop shows them: a column of billows swelling as
 * it climbs and drifting to the right. Only the column's outer edge is drawn
 * whole; inside it, each billow shows the short upper left rim where it
 * rolls over the one behind, and its lower right is hatched, the side turned
 * from the light. The crack's right wall is hatched.
 */
function fumeColumn(): Sigil {
  const g = 6.3;
  const axis = arc3([0, 5.85], [0.1, -0.5], [1.4, -6.3], 40);
  const spec: [number, number, number][] = [
    // [place along the axis 0..1, offset across, radius]
    [0.0, 0.0, 0.55],
    [0.06, -0.25, 0.75],
    [0.13, 0.35, 0.9],
    [0.22, -0.55, 1.15],
    [0.31, 0.6, 1.3],
    [0.42, -1.0, 1.55],
    [0.5, 0.9, 1.6],
    [0.62, -1.7, 1.75],
    [0.66, 0.5, 1.95],
    [0.76, 2.3, 1.6],
    [0.84, -2.3, 1.7],
    [0.9, 0.2, 2.15],
    [0.94, 2.6, 1.7],
    [1.0, -1.3, 1.55],
  ];
  const billows: [Pt, number][] = spec.map(([t, off, r]) => {
    const i = Math.min(39, Math.round(t * 40));
    const p = axis[i];
    const q = axis[i + 1];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const n: Pt = [(q[1] - p[1]) / d, -(q[0] - p[0]) / d];
    return [[p[0] + n[0] * off, p[1] + n[1] * off] as Pt, r];
  });
  const inB = (p: Pt, [c, r]: [Pt, number], pad = 0.06) => Math.hypot(p[0] - c[0], p[1] - c[1]) < r + pad;
  const above = (p: Pt) => p[1] < g - 0.05;
  const long = (d: string, min: number) =>
    d
      .split('M')
      .filter((s) => {
        if (!s) return false;
        const n = s.split('L').map((q) => q.trim().split(/\s+/).map(Number));
        let len = 0;
        for (let k = 1; k < n.length; k++) len += Math.hypot(n[k][0] - n[k - 1][0], n[k][1] - n[k - 1][1]);
        return len > min;
      })
      .map((s) => 'M' + s)
      .join('');
  // The outer edge: each billow's circle where no other billow covers it.
  const edge = long(
    billows.map((b, i) => kept(circ(b[0], b[1], 0, 2 * Math.PI, 56), (p) => above(p) && !billows.some((f, j) => j !== i && inB(p, f, 0.02)))).join(''),
    0.4,
  );
  // Inside the mass: each billow's upper left rim, where it rolls over a farther one and no nearer one hides it.
  const rims = long(
    billows
      .map((b, i) =>
        i < 2
          ? ''
          : kept(circ(b[0], b[1], 1.02 * Math.PI, 1.62 * Math.PI, 20), (p) => !billows.slice(0, i).some((f) => inB(p, f, 0.08)) && billows.slice(i + 1).some((f) => inB(p, f, -0.08))),
      )
      .join(''),
    0.6,
  );
  // Hatching on each billow's lower right, where no nearer billow covers it.
  const shade = billows
    .map(([c, r], i) => {
      const strokes: string[] = [];
      for (let x = c[0] + r * 0.1; x < c[0] + r - 0.18; x += 0.36) {
        const h = Math.sqrt(r * r - (x - c[0]) ** 2);
        const y0 = c[1] - h * 0.3;
        const y1 = Math.min(c[1] + h - 0.2, g - 0.3);
        if (y1 - y0 > 0.3) strokes.push(kept([[x, y0], [x, y1]], (p) => !billows.slice(0, i).some((f) => inB(p, f, 0.2))));
      }
      return strokes.join('');
    })
    .join('');
  // The floor, broken where the crack the fumes leave by opens in it.
  const crackL: Pt[] = [[-5.0, g], [-0.75, g], [-0.4, g + 0.7]];
  const crackR: Pt[] = [[5.0, g], [0.8, g], [0.5, g + 0.55]];
  return {
    lines: edge + path(crackL) + path(crackR),
    fine: rims,
    shade: long(shade, 0.5),
  };
}

/** An eye of the Abyss about `c`: an almond `w` wide and `h` tall, with a slit pupil, all as main strokes so it holds at 18 px. */
function eye(c: Pt, w: number, h: number): string {
  const [l, r]: Pt[] = [
    [c[0] - w / 2, c[1]],
    [c[0] + w / 2, c[1]],
  ];
  const [t, b]: Pt[] = [
    [c[0], c[1] - h * 0.4],
    [c[0], c[1] + h * 0.4],
  ];
  const pw = w * 0.08;
  return (
    path(arc3(l, [c[0], c[1] - h / 2], r, 16)) +
    path(arc3(l, [c[0], c[1] + h / 2], r, 16)) +
    path([...arc3(t, [c[0] - pw, c[1]], b, 10), ...arc3(b, [c[0] + pw, c[1]], t, 10).slice(1)])
  );
}

/** Abyssal City: the Lich's throne, front on: a tall back under a lancet arch like the scenes set's tomb door, the eye in it, broad arms on posts, the seat on two legs, a plinth. */
function throne(): Sigil {
  const seat = 0.6;
  const base = 5.6;
  const bw = 3.2;
  const spring = -4.6;
  // The lancet: two arcs of radius 4.2, each struck from a point 1 inside the far post.
  const r = 4.2;
  const apex: Pt = [0, spring - Math.sqrt(r * r - (r - bw) ** 2)];
  // The middle of the arc from the post on side `s` to the apex, its centre on the other side.
  const mid = (s: number): Pt => {
    const c: Pt = [-s * (r - bw), spring];
    const [ux, uy] = [s * bw - c[0] + apex[0] - c[0], spring - c[1] + apex[1] - c[1]];
    const n = Math.hypot(ux, uy);
    return [c[0] + (r * ux) / n, c[1] + (r * uy) / n];
  };
  let lines = line([-bw, seat], [-bw, spring]) + line([bw, seat], [bw, spring]);
  lines += path(arc3([-bw, spring], mid(-1), apex, 16)) + path(arc3(apex, mid(1), [bw, spring], 16));
  lines += eye([0, -2.7], 4.4, 2.6);
  // The seat.
  lines += closed([
    [-4.9, seat],
    [4.9, seat],
    [4.9, seat + 1.0],
    [-4.9, seat + 1.0],
  ]);
  // The arms, broad blocks on posts.
  for (const s of [-1, 1]) {
    lines += path([
      [s * bw, -2.0],
      [s * 5.3, -2.0],
      [s * 5.3, -1.0],
      [s * bw, -1.0],
    ]);
    lines += line([s * 3.9, -1.0], [s * 3.9, seat]) + line([s * 4.7, -1.0], [s * 4.7, seat]);
  }
  // Two legs, the dark between them, and the plinth.
  for (const s of [-1, 1]) lines += line([s * 3.2, seat + 1.0], [s * 3.2, base]) + line([s * 4.3, seat + 1.0], [s * 4.3, base]);
  lines += closed([
    [-5.6, base],
    [5.6, base],
    [5.6, base + 0.9],
    [-5.6, base + 0.9],
  ]);
  // Shade: the back right of its middle and below the eye, and the right leg.
  const shade =
    upright(
      [
        [2.5, spring + 0.2],
        [bw, spring + 0.2],
        [bw, seat],
        [0.6, seat],
        [0.6, -1.0],
        [2.5, -1.0],
      ],
      1.0,
      2.8,
      0.9,
      0.3,
    ) +
    upright(
      [
        [3.2, seat + 1.0],
        [4.3, seat + 1.0],
        [4.3, base],
        [3.2, base],
      ],
      3.75,
      3.75,
      0.9,
      0.4,
    );
  return { lines, fine: '', shade };
}

export const THIRD_SIGILS: Record<string, () => Sigil> = {
  'The Mines': () => placed(arms(), 1.008, 0.155, 0.829),
  'Magma Fissure': () => placed(burning(), 1.0, 0, 0),
  'Frozen Hollow': () => placed(pennant(), 0.9, 0.4, 0.4),
  'Fungal Caverns': () => placed(tuft(), 1.162, 0, -0.585),
  'Vaal Outpost': () => placed(fragment(), 1.02, 0.2, 0.3),
  'Abyssal Depths': () => placed(welling(), 0.98, 0, -0.9),
  'Petrified Forest': () => placed(stoneTree(), 0.963, -0.111, -0.042),
  'Sulphur Vents': () => placed(fumeColumn(), 1.1, -0.25, 0.3),
  'Abyssal City': () => placed(throne(), 1.047, 0, 0.04),
  'Primeval Ruins': () => placed(arch(), 1.104, 0, -1.332),
};
