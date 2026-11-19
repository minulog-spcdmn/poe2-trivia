// The Chronomancer aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).

import { at, lerp, line, pt, ring, type Pt } from '../arcane.ts';
import { poly, disc, LIGHT, blocked, cutLine, ringCuts, bow, planet, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

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


/** Saturn, who is Father Time: a cross over a sickle. */
const saturnSign: Sign = (p, c, r) => p.add(planet(6, [c[0] - r * 0.08, c[1]], r), 'sign');

export const seals: AuraSeal = { seal: chronomancer, sign: saturnSign };
