// The Shadow aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).

import { at, lerp, line, type Pt } from '../arcane.ts';
import { poly, disc, dist, LIGHT, sealRing, type Seal, type Sign, type AuraSeal } from './kit.ts';

/**
 * The Shadow's seal: his Eclipse. The moon's disc, dark, in a double ring;
 * round it the corona, its streamers long out to either side and short
 * above and below (as a corona is, and as his ink is thrown, parting at an
 * upright axis), each side rising; the longest pointed, hatched down one
 * side, fine ones between.
 */
const shadow: Seal = (p, c, R, room) => {
  sealRing(p, c, R);
  // The corona: its streamers' reach by heading, long to the sides, short above and below, uneven as streamers are.
  const jitter = [0.92, 1.0, 0.78, 1.08, 0.86, 0.97, 0.74, 1.04, 0.9, 0.82, 1.1, 0.88, 0.95, 0.8, 1.02, 0.85];
  const n0 = 64;
  let fine = '';
  let edges = '';
  let shade = '';
  for (let k = 0; k < n0; k++) {
    const a = (k + 0.5) * (360 / n0);
    const sin = Math.sin((a * Math.PI) / 180);
    // Each side rising: on the right turned up (back toward the top), on the left too.
    const lean = sin > 0 ? -9 : 9;
    const len = Math.min(R * (1.22 + 1.05 * Math.abs(sin) ** 2.4) * jitter[k % jitter.length], room(a + lean) - 1);
    const pointed = (k % 8 === 3 || k % 8 === 4) && Math.abs(sin) > 0.55;
    if (!pointed) {
      const from = at(c, a, R + 1.5);
      if (len - R > 3.5) fine += line(from, at(from, a + lean, len - R - 1.5));
      p.knockout += poly([at(c, a - 2.5, R), at(at(c, a, R), a + lean, len - R + 1.2), at(c, a + 2.5, R)]);
      continue;
    }
    const r0 = R + 1.2;
    const half = R * 0.13;
    const base = at(c, a, r0);
    const tip = at(base, a + lean, len - r0);
    const [l, r] = [at(c, a - (half / r0) * 57.3, r0), at(c, a + (half / r0) * 57.3, r0)];
    edges += line(l, tip) + line(r, tip);
    shade += line(lerp(base, tip, 0.04), lerp(base, tip, 0.96));
    const dark = (l[0] - base[0]) * LIGHT[0] + (l[1] - base[1]) * LIGHT[1] < 0 ? l : r;
    const steps = Math.floor(dist(base, tip) / 0.7);
    for (let i = 1; i < steps; i++) shade += line(lerp(base, tip, i / steps), lerp(dark, tip, i / steps));
    p.knockout += poly([at(c, a - (half / r0) * 57.3 * 1.4, R), at(tip, a + lean, 1.4), at(c, a + (half / r0) * 57.3 * 1.4, R)]);
  }
  p.add(fine, 'hair');
  p.add(edges, 'hair');
  p.add(shade, 'hatch');
  p.knockout += disc(c, R + 1.4);
};

// The Shadow's dagger, traced off the game's dagger icon (67 px; the owner's
// pick for the sign, as the Shadow fights with daggers and the aura's cut
// is his blade's): its outline from the icon's light, joined across the
// dark lines that part its blade, guard and grip; and the dark it holds,
// the fuller down the blade, the slot in the guard and the gaps in the
// grip's wrapping. In the icon's own pose, point down and left. In the
// icon's pixels, y down.
const DAGGER_OUTLINE = '61,6.4 59.5,6 56.2,6.2 54.5,6.9 53.5,8.4 53.6,10.9 53.2,11.7 50.8,12.5 42,21.4 40.3,23.9 39,23.7 33,18 31.4,18 31,21.4 33.8,24 34.8,26.3 34.6,27.2 34,27.8 32.3,27.7 31.2,28.3 16.4,44 6.3,60.8 6.3,61.8 22.4,52.8 38.7,37.6 39.1,36.8 38.8,36.3 35.1,35.6 34.1,35 33.7,31.9 34.2,30.9 35.3,30.7 38.5,32.4 43.9,33.9 46.4,36.8 49.8,36.5 50.1,35.8 49.7,34.6 45.2,30.2 43.7,28 42.5,27.4 42.2,26 42.8,25.4 43.9,25.2 45.2,26.8 46.5,26.6 49.3,23.3 52.5,20.7 53.7,18.5 56.3,16.8 56.5,15.6 54.3,15.6 53.6,14.4 54.1,13.4 55.8,12.6 56,10.5 56.5,9.8 58.6,9.2 60,9.6 60.3,11 59.2,13.6 60,14 60.8,13.7 61.7,11.4 61.4,7.5';
const DAGGER_DARK = ['34.4,36.1 33.5,35.2 16.1,52.2 14.5,54.2 14.4,55.2 20.5,52.8 21.8,51.8 30.3,43.1', '54.3,16.3 53.2,16.2 50,17.9 49.6,19.7 47.3,22 46.1,22.2 44.4,21.6 44.3,22 45.5,23.4 44.9,24.7 45.3,25.3 45.7,25.4 47.3,24 48.5,23.5 50.3,20.7 53.2,18.3', '38.5,27.2 38.4,29.1 39.1,30.6 42.9,31.2 42.6,30.2 39.6,27.2', '30.6,30.9 29.3,31.7 24.1,37.7 24.9,37.6 28.4,35.5', '35,28.1 33.4,28.6 33.6,30.5 35.6,30.2', '41.6,23.8 40.1,24.8 41.6,26.2 42.4,24.9', '53.9,12.3 52.3,12.8 52.4,13.6 52.8,14.1 54.3,12.8'];
/** Where the dagger's middle lies in its icon, and how far from it its furthest point lies. */
const DAGGER_AT: Pt = [33.6, 34.1];
const DAGGER_R = 38.9;
/** How far past the sign's reach its furthest point goes. */
const DAGGER_FIT = 1.12;
/** The shading on the side turned from the light, in the sign's reach: its depth, the gap between its strokes, and how far they stop short of the edges. */
const DAGGER_SHADE = 0.12;
const DAGGER_GAP = 0.09;
const DAGGER_PAD = 0.04;

const points = (s: string) => s.split(' ').map((q) => q.split(',').map(Number) as Pt);
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
 * stopping `pad` short of its edges.
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

/** The Shadow's dagger: its outline, the dark it holds cut solid, its side from the light shaded. */
const daggerSign: Sign = (p, c, r) => {
  const k = (r * DAGGER_FIT) / DAGGER_R;
  const S = ([x, y]: Pt): Pt => [c[0] + (x - DAGGER_AT[0]) * k, c[1] + (y - DAGGER_AT[1]) * k];
  const outline = points(DAGGER_OUTLINE).map(S);
  const dark = DAGGER_DARK.map((s) => points(s).map(S));
  p.add(poly(outline), 'sign');
  p.add(shading([outline, ...dark], r * DAGGER_SHADE, r * DAGGER_GAP, r * DAGGER_PAD), 'hatch');
  p.add(dark.map(poly).join(''), 'fill');
};

export const seals: AuraSeal = { seal: shadow, sign: daggerSign };
