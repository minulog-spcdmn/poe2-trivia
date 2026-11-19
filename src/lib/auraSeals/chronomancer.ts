// The Chronomancer aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).

import { at, lerp, line, pt, ring, type Pt } from '../arcane.ts';
import { poly, disc, LIGHT, blocked, cutLine, ringCuts, bow, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/** An hourglass about `c`, `h` from its middle to its plates' outer faces: its plates, posts and glass, as outlines. */
function hourglass(c: Pt, h: number) {
  const [t, pw, gw, neck] = [h * 0.18, h * 0.6, h * 0.48, h * 0.075];
  const X = (x: number, y: number): Pt => [c[0] + x, c[1] + y];
  const plate = (s: 1 | -1): Pt[] => [X(-pw, s * h), X(pw, s * h), X(pw, s * (h - t)), X(-pw, s * (h - t))];
  // Each side of each bulb bows out, away from the middle.
  const glass = (s: 1 | -1, side: 1 | -1) => bow(X(side * gw, s * (h - t)), X(side * neck, 0), -side * s * h * 0.11, 16);
  const glassPoly = [...glass(-1, 1), ...glass(1, 1).slice().reverse(), ...glass(1, -1), ...glass(-1, -1).slice().reverse()];
  const posts = [-1, 1].map((s) => [X(s * (pw - h * 0.09), -(h - t)), X(s * (pw - h * 0.09), h - t)] as [Pt, Pt]);
  return { t, pw, gw, neck, X, plate, glass, glassPoly, posts };
}

/**
 * The Chronomancer's seal: the aura's clock, its dial a band of two double
 * rings with a lozenge at each quarter, an hourglass standing in it, its
 * sand running from the upper glass into a heap in the lower; the clock's
 * hand, a lance from behind the glass out across the dial and over the arch,
 * and behind it its after-images as it ticks round, each fainter and
 * shorter, as the aura's hand smears and its token steps out of itself.
 */
const chronomancer: Seal = (p, c, R, room) => {
  const Ri = R * 0.72;
  const g = hourglass(c, Ri * 0.88);
  const { X, plate, glass, glassPoly, posts } = g;
  const glassAll: Clear = {
    polys: [plate(1), plate(-1), glassPoly, ...posts.map(([a, b]) => [[a[0] - 0.8, a[1]], [a[0] + 0.8, a[1]], [b[0] + 0.8, b[1]], [b[0] - 0.8, b[1]]] as Pt[])],
    holes: [],
    pad: 0.6,
  };
  // The hand and its after-images, each a long point out of the middle, behind the glass, in front of the dial.
  const hand = 150;
  const hands = [0, 1, 2, 3].map((i) => {
    const a = hand - i * 10;
    const len = Math.min(room(a) - 1, R * 2.1) * (1 - i * 0.09);
    return { i, a, outline: [at(c, a - 90, R * (i ? 0.07 : 0.1)), at(c, a, len), at(c, a + 90, R * (i ? 0.07 : 0.1))] as Pt[], len };
  });
  const handsClear: Clear = { polys: hands.map((h) => h.outline), holes: [], pad: 0.7 };
  // The dial: an outer double ring and an inner one, broken where the hands cross; lozenges at the quarters.
  const mid = (R + Ri) / 2;
  const loz = [0, 90, 180, 270].map((a) => {
    const [l, w] = [R * 0.17, (R - Ri) * 0.36];
    return [at(c, a, mid + w), at(c, a + (l / mid) * 57.3, mid), at(c, a, mid - w), at(c, a - (l / mid) * 57.3, mid)] as Pt[];
  });
  const dialClear: Clear = { polys: [...hands.map((h) => h.outline), ...loz], holes: [], pad: 0.7 };
  for (const [r, cls] of [
    [R, 'thin'],
    [R - 1.1, 'hair'],
    [Ri, 'thin'],
    [Ri + 1, 'hair'],
  ] as const)
    p.add(ring(c, r, { cuts: ringCuts(c, r, dialClear) }), cls);
  for (const l of loz) {
    if (blocked(l[0], handsClear) || blocked(l[2], handsClear)) continue;
    p.add(poly(l), 'thin');
    p.add(line(lerp(l[1], l[3], 0.25), lerp(l[1], l[3], 0.75)), 'hatch');
  }
  // The hands: the first engraved (edges, a ridge, hatched down one side), its after-images as outlines, fainter.
  for (const { i, outline, len } of hands) {
    const behind: Clear = { polys: [...glassAll.polys, ...hands.filter((h) => h.i < i).map((h) => h.outline)], holes: [], pad: i ? 0.9 : 0.6 };
    const [l, tip, r] = outline;
    const cls = i === 0 ? 'thin' : i === 1 ? 'hair' : 'ray';
    p.add(cutLine(l, tip, behind) + cutLine(r, tip, behind), cls);
    if (i) continue;
    p.add(cutLine(lerp(c, tip, 0.02), lerp(c, tip, 0.97), behind), 'hatch');
    const dark = (l[0] - c[0]) * LIGHT[0] + (l[1] - c[1]) * LIGHT[1] < 0 ? l : r;
    let h = '';
    const m = Math.floor(len / 0.65);
    for (let k = 1; k < m; k++) h += cutLine(lerp(c, tip, k / m), lerp(dark, tip, k / m), behind);
    p.add(h, 'hatch');
  }
  // The hourglass, over all of it.
  let under = '';
  for (const s of [-1, 1] as const) {
    p.add(poly(plate(s)), 'thin');
    // Each plate's lower half, turned from the light, hatched upright.
    const [top, foot] = s > 0 ? [Ri * 0.88 - g.t, Ri * 0.88] : [-Ri * 0.88, -(Ri * 0.88 - g.t)];
    for (let x = -g.pw + 1.1; x < g.pw - 0.5; x += 1.05) under += line(X(x, (top + foot) / 2), X(x, foot - 0.35));
    for (const side of [-1, 1] as const) p.add(`M${glass(s, side).map(pt).join('L')}`, 'thin');
  }
  p.add(under, 'hatch');
  for (const [a, b] of posts) p.add(line(a, b), 'hair');
  // The sand: level in the upper glass, a stream through the neck, a heap in the lower, each hatched on its right.
  const h = Ri * 0.88;
  const halfAt = (y: number) => {
    const side = glass(y < 0 ? -1 : 1, 1);
    let best = side[0];
    for (const q of side) if (Math.abs(q[1] - (c[1] + y)) < Math.abs(best[1] - (c[1] + y))) best = q;
    return best[0] - c[0];
  };
  const level = -h * 0.42;
  p.add(line(X(-halfAt(level) + 0.4, level), X(halfAt(level) - 0.4, level)), 'hair');
  let sand = '';
  for (let y = level + 0.85; y < -g.neck * 2.5; y += 0.8) sand += line(X(0.2, y), X(halfAt(y) - 0.55, y));
  const peak = h * 0.4;
  const foot = h - g.t - 0.5;
  const heapHalf = halfAt(foot - 0.3) - 0.5;
  p.add(`M${pt(X(-heapHalf, foot))}L${pt(X(0, peak))}L${pt(X(heapHalf, foot))}` + line(X(0, g.neck * 1.5), X(0, peak - 0.5)), 'hair');
  for (let x = 0.8; x < heapHalf - 0.3; x += 0.8) sand += line(X(x, peak + ((foot - peak) * x) / heapHalf + 0.5), X(x, foot - 0.3));
  p.add(sand, 'hatch');
  p.knockout += disc(c, R + 1.4) + hands.map((h) => poly([at(c, h.a - 90, R * 0.2), at(c, h.a, h.len + 1.6), at(c, h.a + 90, R * 0.2)])).join('');
};


/**
 * The Chronomancer's sign: the sign of Temporal Chains, the game's curse that
 * slows time (the owner's pick: her own marks all hold the hourglass her
 * seal already shows). Traced off the curse's icon (88 px): the middles of
 * its painted strokes, joined where a stroke runs on through a crossing,
 * and the small loop carried on to the stem it curls into; then each
 * stroke drawn as one smooth curve through those middles, as the brush
 * drew it, without the skeleton's wobble or the curl of its tapered tips.
 * A figure with its arms flung up, a loop at its head, and a long stroke
 * trailing off to the right below its waist. In the icon's own pose; in its
 * pixels, y down.
 */
const CHAINS = [
  '44.15,44.93 52.4,38.84 54.42,37.19 55.92,35.8 57.42,34.15 58.66,32.41 59.49,30.79 60.02,29.07 60.24,27.06 60.05,24.74 59.49,22.38 58.6,20.01 57.31,17.47 55.65,14.81 53.64,12.16 51.56,9.84',
  '78.12,55.95 72.54,55.11 67.49,54.11 63.07,52.97 58.94,51.61 55.42,50.16 52.11,48.45 49.27,46.58 46.74,44.44 45.61,43.26 44.58,42 43.68,40.64 43.04,39.38 41.19,34.41 38.73,29.05 37.83,26.87 36.97,24.38 35.11,18.31 34.2,15.75 33.1,13.23 31.86,11.03',
  '41.36,31.59 40.39,32.05 39.46,32.33 38.57,32.45 37.74,32.42 36.97,32.26 36.04,31.87 35.44,31.46 34.77,30.79 34.38,30.21 34.02,29.38 33.84,28.49 33.84,27.59 34,26.71 34.4,25.67 34.88,24.95 35.47,24.34 36.17,23.89 37.17,23.58 38.26,23.55 39.39,23.76 40.48,24.2 41.49,24.84 42.35,25.65 42.9,26.4 43.28,27.24 43.47,28.14 43.44,29.1 43.25,29.85 42.91,30.61 42.4,31.39 41.71,32.18 40.82,32.97',
  '24.03,75.69 26.05,74.52 27.95,73.23 29.74,71.84 31.42,70.34 32.98,68.75 34.42,67.07 35.75,65.3 37.08,63.25 38.14,61.32 39.18,59.1 39.98,57.04 40.72,54.68 41.3,52.27 41.69,50.05 41.93,47.79 42.05,45.51',
  '57.5,74.86 55.61,71.62 53.84,67.8 52.42,64.09 49.4,55.42 47.83,51.53 46.21,48.21 44.54,45.46',
  '17.69,23.99 16.86,26.31 16.34,28.81 16.23,31.19 16.54,33.67 17.27,35.96 18.37,38.05 19.8,39.92 21.71,41.71 23.91,43.2 26.34,44.37 28.95,45.22 31.93,45.82 34.98,46.08 38.26,45.98 41.43,45.51 44.17,44.77',
];
/**
 * Where the sign's middle lies in its icon: the icon's own middle, which is
 * where its strokes cross (the middle of its bounding box sat off to the
 * right, pulled by the long trailing stroke, and the figure looked off
 * centre); and how far from it its furthest point lies.
 */
const CHAINS_AT: Pt = [44, 44];
const CHAINS_R = 37.46;
/** How far past the sign's reach its furthest point goes. */
const CHAINS_FIT = 1.15;

/** Temporal Chains, engraved along its strokes' middles. */
const chainsSign: Sign = (p, c, r) => {
  const k = (r * CHAINS_FIT) / CHAINS_R;
  const S = ([x, y]: Pt): Pt => [c[0] + (x - CHAINS_AT[0]) * k, c[1] + (y - CHAINS_AT[1]) * k];
  const run = (s: string) => s.split(' ').map((q, i) => (i ? 'L' : 'M') + pt(S(q.split(',').map(Number) as Pt))).join('');
  p.add(CHAINS.map(run).join(''), 'sign');
};

export const seals: AuraSeal = { seal: chronomancer, sign: chainsSign };
