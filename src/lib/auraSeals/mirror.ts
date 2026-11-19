// The Mirror of Kalandra aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).

import { at, lerp, line, ring, type Pt } from '../arcane.ts';
import { poly, disc, dist, cutLine, ringCuts, sealRing, fourStar, engraveStar, LIGHT, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/**
 * The Mirror's seal: the glass in its frame, engraved as an engraver draws
 * glass, in close parallel lines, left open in two streaks where the light
 * from the upper left lies on it, each streak a sliver of bright ink; the
 * frame's bevel shaded where it turns from the light; on the frame the
 * Mirror's four-pointed star, its long points out over the arch; and its
 * glitter drifting either side, each mote a small star of its own.
 */
const mirror: Seal = (p, c, R, room) => {
  const starA = 128;
  const sc = at(c, starA, R - 0.65);
  const reach = Math.min(R * 1.5, room(starA) - R - 1);
  const star = fourStar(sc, (a) => (a === 90 || a === 180 ? reach : R * 0.7), R * 0.3, R * 0.1);
  // The glitter: motes either side, as far as the room lets them, each smaller further out.
  const motes = [
    { a: 74, d: 1.62, s: 0.36 },
    { a: 168, d: 1.95, s: 0.32 },
    { a: 238, d: 1.42, s: 0.26 },
    { a: 106, d: 2.2, s: 0.26 },
    { a: 205, d: 1.72, s: 0.2 },
    { a: 140, d: 2.35, s: 0.2 },
    { a: 52, d: 2.05, s: 0.17 },
  ]
    .filter(({ a, d, s }) => R * (d + s) < room(a) - 1)
    .map(({ a, d, s }) => fourStar(at(c, a, R * d), () => R * s, R * s * 0.32, R * s * 0.16));
  const all = [...star, ...motes.flat()];
  const shine: Clear = { polys: star, holes: [{ c: sc, r: R * 0.13 }], pad: 0.8 };
  sealRing(p, c, R, ringCuts(c, R, shine));
  const Rg = R - 2.6;
  p.add(ring(c, Rg, { cuts: ringCuts(c, Rg, shine) }), 'thin');
  // The bevel between frame and glass, shaded on its lower right.
  let bevel = '';
  for (let a = 60; a <= 230; a += 4.5) {
    const len = 1.2 * Math.cos(((a - 145) * Math.PI) / 180);
    if (len >= 0.5) bevel += cutLine(at(c, a, R - 1.6), at(c, a, R - 1.6 - len), shine);
  }
  p.add(bevel, 'hatch');
  // The glass: lines rising to the right, across it, `n` the way from one to the next (down to the right).
  const along = at([0, 0], 45, 1);
  const n = at([0, 0], 135, 1);
  const chord = (s: number, inset: number): [Pt, Pt] => {
    const half = Math.sqrt(Math.max(0, Rg * Rg - s * s)) - inset;
    const m: Pt = [c[0] + n[0] * s, c[1] + n[1] * s];
    return [
      [m[0] - along[0] * half, m[1] - along[1] * half],
      [m[0] + along[0] * half, m[1] + along[1] * half],
    ];
  };
  // The streaks: where the light lies, up and to the left of the middle, the nearer one the broader.
  const streaks = [
    { s: -Rg * 0.28, w: Rg * 0.085 },
    { s: -Rg * 0.56, w: Rg * 0.05 },
  ];
  let glass = '';
  for (let s = -Rg + 0.9; s < Rg - 0.6; s += 1.05) {
    if (streaks.some((k) => Math.abs(s - k.s) < k.w + 0.9)) continue;
    const [a, b] = chord(s, 0.6);
    if (dist(a, b) > 1) glass += cutLine(a, b, shine);
  }
  p.add(glass, 'hatch');
  const slivers = streaks.map(({ s, w }) => {
    const [a, b] = chord(s, 1.4);
    const span = Array.from({ length: 21 }, (_, i) => i / 20);
    const edge = (side: number) => span.map((u) => [lerp(a, b, u)[0] + side * n[0] * w * Math.sin(Math.PI * u), lerp(a, b, u)[1] + side * n[1] * w * Math.sin(Math.PI * u)] as Pt);
    return [...edge(1), ...edge(-1).slice(1, -1).reverse()];
  });
  p.add(slivers.map((x) => poly(x)).join(''), 'fill');
  engraveStar(p, star, true);
  engraveStar(p, motes.flat(), false);
  p.add(disc(sc, R * 0.07) + motes.map((m) => disc(lerp(m[0][0], m[0][2], 0.5), R * 0.035)).join(''), 'fill');
  p.knockout += disc(c, R + 1.4) + all.map((o) => poly(o.map((q) => lerp(lerp(o[0], o[2], 0.5), q, 1.25)))).join('') + disc(sc, R * 0.2);
};

// The Mirror of Kalandra itself, traced off the game's icon (108 px; the
// owner's pick for the sign): its outline, frame, wings and the pendant
// under it from the icon's transparency; the glass, an oval fitted to where
// the gold rim begins along rays from its middle; the three stones on its
// rim (red, blue, green) and the two bosses on its wings, found by their
// round rims (x, y, radius). In the icon's pixels, y down.
const MIRROR_OUTLINE = '59.5,1.1 54.9,2.7 50.7,6.6 45.3,7.1 41.7,8.1 34.4,11.3 29,10 26.8,10.2 24.3,11.3 21.6,13.6 20.4,16 20,19.2 20.8,24.1 16.2,32 12.7,41.5 11.4,41.8 6.7,38.8 3.6,35.7 2.6,35.9 2.1,36.8 2.4,40.8 4.1,48.9 6.4,53.5 9.1,57.1 9.1,65 11.6,70 15,72.6 18.8,73.8 22.4,74 26.4,73.2 32.5,77.7 42.5,82.5 43.9,84.5 43.7,87.5 45.2,89.3 44.9,92.8 43.9,95.5 45.4,98.9 46.5,99.5 48,98.2 49.7,95 49.1,93.1 51.3,93 54.6,95.8 57.3,95.3 56.1,97.6 56.1,99.1 57.4,101.8 59.1,103.3 59.9,102.8 61.8,99.7 61.8,95.8 63.1,94.2 62.8,92.1 65,92.8 68.5,91.5 68.2,93.9 70,97 70.7,97.5 71.8,96.8 73.2,93.4 72.2,90.2 72.1,88 73.4,86.2 73.2,83.4 74.4,81.6 81.8,76.6 85.4,73.3 92.8,72.9 96.5,69.9 97.9,67.2 98.5,63.9 98.3,61.3 101.8,54.5 102.8,46.7 102.6,45.3 101.7,45 97.7,48.3 96,48.9 95.2,48.4 92.8,39.1 89.3,30.9 90,28.4 89.8,24.1 87.5,20.5 85.1,19 80.6,18.6 74.8,13.5 67.8,9.4 65.7,5.3 63.7,3';
const GLASS = '48.2,72 42,70.5 36.2,68 30.9,64.8 26.3,61 22.6,56.4 19.7,51.6 17.9,46.4 17.2,41 17.6,35.6 19,30.6 21.6,25.8 25,21.5 29.4,17.8 34.4,14.9 40.1,12.8 46.2,11.6 52.4,11.3 58.8,12 64.9,13.5 70.7,16 76,19.2 80.6,23 84.4,27.6 87.2,32.4 89,37.6 89.7,43 89.4,48.4 87.9,53.4 85.4,58.2 81.9,62.5 77.6,66.2 72.4,69.1 66.8,71.2 60.8,72.4 54.4,72.7';
const STONES: [number, number, number][] = [[31.3, 16.9, 7.4], [63.1, 9.1, 7.0], [83.4, 26.6, 7.4]];
const BOSSES: [number, number, number][] = [[22.4, 62.4, 8.5], [88.6, 63.3, 7.6]];
/** Where the Mirror's middle lies in its icon, and how far from it its furthest point lies. */
const MIRROR_AT: Pt = [51.5, 52.2];
const MIRROR_R = 51.7;
/** How far past the sign's reach its furthest point goes. */
const MIRROR_FIT = 1.12;
/** The frame's shading on the side turned from the light, in the sign's reach: its depth, the gap between its strokes, and how far they stop short of the edges. */
const FRAME_SHADE = 0.2;
const FRAME_GAP = 0.1;
const FRAME_PAD = 0.05;

const points = (s: string) => s.split(' ').map((q) => q.split(',').map(Number) as Pt);
const round = (c: Pt, r: number): Pt[] => Array.from({ length: 18 }, (_, i) => at(c, i * 20, r));

/** Where the line `o` across `n`, running along `u`, lies inside the outlines `shape` (holes and all): its spans, as distances along `u`. */
function spans(shape: Pt[][], n: Pt, u: Pt, o: number): [number, number][] {
  const ts: number[] = [];
  for (const ps of shape) ps.forEach((a, i) => {
    const b = ps[(i + 1) % ps.length];
    const [na, nb] = [a[0] * n[0] + a[1] * n[1], b[0] * n[0] + b[1] * n[1]];
    if (na <= o === nb <= o) return;
    const s = (o - na) / (nb - na);
    ts.push(a[0] * u[0] + a[1] * u[1] + s * (b[0] * u[0] + b[1] * u[1] - (a[0] * u[0] + a[1] * u[1])));
  });
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([ts[i], ts[i + 1]]);
  return out;
}

/** The spans of `a` left once `b`'s are taken out. */
function without(a: [number, number][], b: [number, number][]): [number, number][] {
  let out = a;
  for (const [b0, b1] of b) out = out.flatMap(([a0, a1]): [number, number][] => (b1 <= a0 || b0 >= a1 ? [[a0, a1]] : [...(b0 > a0 ? [[a0, b0] as [number, number]] : []), ...(b1 < a1 ? [[b1, a1] as [number, number]] : [])]));
  return out;
}

/**
 * The side of a shape (outlines with holes) turned from the light, shaded:
 * strokes running with the light, `gap` apart, as deep into it as `depth`,
 * stopping `pad` short of its edges (as the Breach Ring's band is shaded).
 */
function shading(shape: Pt[][], depth: number, gap: number, pad: number) {
  const lit = shape.map((ps) => ps.map(([x, y]): Pt => [x + LIGHT[0] * depth, y + LIGHT[1] * depth]));
  const u: Pt = [-LIGHT[0], -LIGHT[1]];
  const n: Pt = [-u[1], u[0]];
  const across = shape.flat().map((q) => q[0] * n[0] + q[1] * n[1]);
  const [lo, hi] = [Math.min(...across), Math.max(...across)];
  let d = '';
  for (let o = lo + gap / 2; o < hi; o += gap) {
    const at2 = (t: number): Pt => [n[0] * o + u[0] * t, n[1] * o + u[1] * t];
    for (const [t0, t1] of without(spans(shape, n, u, o), spans(lit, n, u, o))) {
      if (t1 - t0 < pad * 3) continue;
      d += line(at2(t0 + pad), at2(t1 - pad));
    }
  }
  return d;
}

/**
 * The Mirror of Kalandra: its outline; the glass left bright inside its oval;
 * the frame shaded on its side from the light, as far as the stones and
 * bosses, which stand clear of it; each stone a jewel in its setting, each
 * boss a ring round its knob.
 */
const mirrorSign: Sign = (p, c, r) => {
  const k = (r * MIRROR_FIT) / MIRROR_R;
  const S = ([x, y]: Pt): Pt => [c[0] + (x - MIRROR_AT[0]) * k, c[1] + (y - MIRROR_AT[1]) * k];
  const outline = points(MIRROR_OUTLINE).map(S);
  const glass = points(GLASS).map(S);
  const stones = STONES.map(([x, y, s]) => ({ c: S([x, y]), r: s * k }));
  const bosses = BOSSES.map(([x, y, s]) => ({ c: S([x, y]), r: s * k }));
  p.add(poly(outline) + poly(glass), 'sign');
  const studs = [...stones, ...bosses];
  p.add(shading([outline, glass, ...studs.map((o) => round(o.c, o.r + 0.25))], r * FRAME_SHADE, r * FRAME_GAP, r * FRAME_PAD), 'hatch');
  p.add(studs.map((o) => ring(o.c, o.r)).join(''), 'thin');
  p.add(stones.map((o) => disc(o.c, o.r * 0.5)).join('') + bosses.map((o) => disc(o.c, o.r * 0.28)).join(''), 'fill');
};

export const seals: AuraSeal = { seal: mirror, sign: mirrorSign };
