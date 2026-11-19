// The Acolyte of Chayula aura's seal and sign (lib/auraEngraving: the seal in
// Sol's place on the face and at the back's heart, the sign in Luna's place).

import { angleOf, at, lerp, line, pt, ring, type Pt } from '../arcane.ts';
import { poly, disc, dist, LIGHT, piecesOf, ringCuts, sealRing, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/**
 * A stream of light drawn into the well about `c`: from its tip, `r0` out at
 * heading `a0`, wound `sweep` degrees clockwise in to `end` from the middle,
 * swelling to `w` either side a third of the way along and thinning to
 * nothing where it falls in. Its spine and its two edges, from the tip.
 */
function drawnIn(c: Pt, end: number, a0: number, r0: number, sweep: number, w: number) {
  const n = 36;
  const spine: Pt[] = [];
  const [outer, inner]: Pt[][] = [[], []];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const a = a0 + sweep * s;
    const r = r0 + (end - r0) * s ** 0.8;
    // Pointed at its tip, its belly a third of the way in, drawn out thin as it falls.
    const hw = w * Math.sin(Math.min(1, s / 0.32) * (Math.PI / 2)) ** 0.8 * (s < 0.32 ? 1 : ((1 - s) / 0.68) ** 1.15);
    const m = at(c, a, r);
    spine.push(m);
    outer.push(at(c, a, r + hw));
    inner.push(at(c, a, r - hw));
  }
  return { spine, outer, inner, outline: [...outer, ...inner.slice(0, -1).reverse()] };
}

/**
 * The Acolyte's seal: the well of darkness he wraps himself in, drinking the
 * light round it. The ring is the well's horizon; over it the maelstrom,
 * three streams of the light it drinks (his three flames' violet, crimson
 * and azure), each from a pointed tip out past the horizon where the room
 * lets it, swelling as it falls in, wound round and drawn out thin into the
 * dark at the heart, which nothing reaches; each hatched down the side
 * turned from the light. The ring stops short of them.
 */
const chayula: Seal = (p, c, R, room) => {
  // Each stream: the heading of its tip, how far out it starts (past the horizon, where the room lets it), how broad.
  const wanted = [
    { a: 70, d: 1.42, w: 0.15 },
    { a: 190, d: 1.42, w: 0.15 },
    { a: 310, d: 1.42, w: 0.15 },
  ];
  const fits = (ps: Pt[]) => ps.every((q, i) => i % 3 || dist(c, q) < room(angleOf(c, q)) - 0.8);
  const heart = R * 0.17;
  const streams = wanted.flatMap(({ a, d, w }) => {
    // Started closer in where the room is short (inside the horizon at the least, so never left out).
    for (let k = 1; k > 0; k -= 0.05) {
      const r0 = R * 0.85 + R * (d - 0.85) * k;
      const fl = drawnIn(c, heart, a, r0, 235, R * w);
      if (fits(fl.outline) || k < 0.06) return [{ ...fl, halo: drawnIn(c, heart, a - 2, r0 + 0.9, 237, R * w + 0.9).outline }];
    }
    return [];
  });
  const front: Clear = { polys: streams.flatMap((fl) => piecesOf(fl.outer, fl.inner)), holes: [], pad: 0.75 };
  sealRing(p, c, R, ringCuts(c, R, front));
  // The streams: edges, a ridge along the middle, hatching down the side from the light.
  let edges = '';
  let shade = '';
  for (const fl of streams) {
    edges += `M${fl.outline.map(pt).join('L')}`;
    for (let k = 3; k + 6 < fl.spine.length; k++) shade += line(fl.spine[k], fl.spine[k + 1]);
    const m = Math.floor(fl.spine.length / 3);
    const dark = (fl.outer[m][0] - fl.spine[m][0]) * LIGHT[0] + (fl.outer[m][1] - fl.spine[m][1]) * LIGHT[1] < 0 ? fl.outer : fl.inner;
    let along = 0;
    for (let k = 1; k + 4 < fl.spine.length; k++) {
      along += dist(fl.spine[k - 1], fl.spine[k]);
      if (along < 0.6) continue;
      along = 0;
      if (dist(fl.spine[k], dark[k]) > 0.7) shade += line(lerp(fl.spine[k], dark[k], 0.2), lerp(fl.spine[k], dark[k], 0.85));
    }
  }
  p.add(edges, 'thin');
  p.add(shade, 'hatch');
  p.knockout += disc(c, R + 1.4) + streams.map((fl) => poly(fl.halo)).join('');
};

/** Where the level line at height `y` crosses the closed outline `ps`, left to right. */
function crossings(ps: Pt[], y: number): number[] {
  const xs: number[] = [];
  ps.forEach((q, i) => {
    const s = ps[(i + 1) % ps.length];
    if (q[1] <= y !== s[1] <= y) xs.push(q[0] + ((y - q[1]) / (s[1] - q[1])) * (s[0] - q[0]));
  });
  return xs.sort((a, b) => a - b);
}

/**
 * The hand of the Keepers of the Purple Flame, Chayula's own sign, traced
 * from the icon the game gives them: four fingers held up close, parted by
 * slits; the palm two petals, each curling up and out to a thumb's tip and
 * meeting the other at the heel; between the petals a four-pointed star, its
 * upper point opening into the slit between the middle fingers, its lower
 * drawn long down to the heel, where the petals meet. The star
 * dark, hatched close; the hand left clear.
 */
const handSign: Sign = (p, c, r) => {
  const X = (x: number, y: number): Pt => [c[0] + x * r, c[1] + y * r];
  const quad = (a: Pt, k: Pt, b: Pt, n = 10): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      return [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * k[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * k[1] + t * t * b[1]] as Pt;
    });
  const arc = (m: Pt, rr: number, a0: number, a1: number, n = 8): Pt[] => Array.from({ length: n + 1 }, (_, i) => at(m, a0 + ((a1 - a0) * i) / n, rr));
  const mirror = (q: Pt): Pt => [2 * c[0] - q[0], q[1]];
  // The outline's left half, from the middle of the heel round the left petal's foot and up its outer edge to the
  // thumb's tip, down its inner edge to the fingers, and over the two fingers to the slit between the middle two.
  const half: Pt[] = [
    X(0, 1.01),
    ...quad(X(-0.2, 1.01), X(-0.5, 1.01), X(-0.62, 0.6)),
    ...quad(X(-0.62, 0.6), X(-0.67, 0.2), X(-0.89, -0.1), 10).slice(1),
    ...quad(X(-0.89, -0.1), X(-0.89, -0.23), X(-0.79, -0.21), 4).slice(1),
    ...quad(X(-0.79, -0.21), X(-0.6, -0.06), X(-0.47, 0.3), 10).slice(1),
    X(-0.43, 0.3),
    ...arc(X(-0.325, -0.77), r * 0.105, 270, 450),
    ...arc(X(-0.11, -0.9), r * 0.11, 270, 450),
  ];
  const outline = [...half, ...half.slice(1, -1).reverse().map(mirror)];
  // The star, cut sharp: four straight-sided points, the upper and lower drawn long, the lower down to the heel.
  const g = 0.7;
  const [cy, k, kk] = [0.37, 0.13, 0.11];
  const tips = [X(0, -0.1), X(0.38, cy), [c[0], c[1] + 1.01 * r - g] as Pt, X(-0.38, cy)];
  const star: Pt[] = [tips[0], X(k, cy - kk), tips[1], X(k, cy + kk), tips[2], X(-k, cy + kk), tips[3], X(-k, cy - kk)];
  // The slits: between the middle fingers down to the star's point, and either side down into the palm, where the fingers fade into the petals.
  let d = poly(outline) + poly(star);
  d += line(X(0, -0.9 + 0.04), [c[0], tips[0][1] - g]);
  for (const s of [-1, 1]) d += line(X(s * 0.22, -0.77 + 0.04), X(s * 0.22, 0.17));
  p.add(d, 'sign');
  // The star dark, hatched close, short of its edges.
  let h = '';
  for (let y = tips[0][1] + 0.8; y < tips[2][1] - 0.5; y += 0.6) {
    const xs = crossings(star, y);
    if (xs.length === 2 && xs[1] - xs[0] > 1.3) h += line([xs[0] + 0.55, y], [xs[1] - 0.55, y]);
  }
  p.add(h, 'hatch');
};

export const seals: AuraSeal = { seal: chayula, sign: handSign };
