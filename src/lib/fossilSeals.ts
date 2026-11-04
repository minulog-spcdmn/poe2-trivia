// A fossil's question (Delve) in the name plate (NamePlate.svelte): the
// plate's two seals give way to the fossil card's own (lib/findEngraving.ts),
// each on a small pane of the card's amber, lit from behind. In Sol's place
// the ammonite; in Luna's, earth's sign, where fossils lie. A rare's are the
// ammonite in a sun of pointed rays, so large they break out over the
// plate's tracery (which stops short of them, as the card's arch does), and
// electrum, amber's old name. The geometry is the card's, drawn for a seal
// `r` to its ring, about its middle (0, 0); the amber's light is
// lib/amber.ts's, painted for the pane.

import { arc, at, hatch, lerp, line, pointedRay, pt, type Pt } from './arcane.ts';
import { ammonite } from './findEngraving.ts';
import { Plate, type Stroke } from './cardEngraving.ts';
import type { AmberJob, AmberSlab } from './amber.ts';
import type { FossilTier } from './fossils.ts';

export type FossilSign = 'ammonite' | 'sun' | 'earth' | 'electrum';

/** Which seal stands at each end of a fossil's plate. */
export const sealsOf = (tier: FossilTier): { start: FossilSign; end: FossilSign } =>
  tier === 'rare' ? { start: 'sun', end: 'electrum' } : { start: 'ammonite', end: 'earth' };

export type SealArt = {
  /** Cut into the amber, dark: the sign, its parts by the card's line classes. */
  sign: Stroke[];
  /** Out over the plate (a rare's sun): its pointed rays' lines and their hatching. */
  rays: { lines: string; hatch: string } | null;
  /** Where the plate's tracery stops short of the rays (polygons). */
  blocks: Pt[][];
};

/**
 * Where an ammonite's heart goes, and how large it's drawn, to sit balanced
 * in a circle `r` about `c` (as findEngraving's ammoniteIn: the shell's own
 * middle, between its outline's box's and its weight's, on `c`, its farthest
 * point at `r`).
 */
function ammoniteIn(c: Pt, r: number, mouth = 228, W = 2.45): { heart: Pt; R: number } {
  const b = Math.log(W) / 360;
  const edge: Pt[] = [];
  for (let a = mouth - 360; a <= mouth; a += 2.5) edge.push(at([0, 0], a, Math.exp(b * (a - mouth))));
  const xs = edge.map((q) => q[0]);
  const ys = edge.map((q) => q[1]);
  const box: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  let [A, wx, wy] = [0, 0, 0];
  for (let i = 0; i < edge.length; i++) {
    const [p0, p1] = [edge[i], edge[(i + 1) % edge.length]];
    const x = p0[0] * p1[1] - p1[0] * p0[1];
    [A, wx, wy] = [A + x, wx + (p0[0] + p1[0]) * x, wy + (p0[1] + p1[1]) * x];
  }
  const mid: Pt = [(box[0] + wx / (3 * A)) / 2, (box[1] + wy / (3 * A)) / 2];
  const R = r / Math.max(...edge.map((q) => Math.hypot(q[0] - mid[0], q[1] - mid[1])));
  return { heart: [c[0] - mid[0] * R, c[1] - mid[1] * R], R };
}

const disc = (c: Pt, r: number) => `M${pt([c[0] + r, c[1]])}A${r} ${r} 0 1 1 ${pt([c[0] - r, c[1]])}A${r} ${r} 0 1 1 ${pt([c[0] + r, c[1]])}Z`;
const poly = (ps: Pt[]) => `M${ps.map(pt).join('L')}Z`;

/**
 * The seal `kind` for a ring `r` (its pane inside `pane`): the card's sign at
 * the plate's size. A rare's sun throws its rays out to twice the ring, as
 * the card's (findEngraving's sunSeal: sixteen, long and short in turn,
 * hatched down one side; its fine rays between would be too short to show
 * here).
 */
export function fossilSeal(kind: FossilSign, r: number, pane: number): SealArt {
  const p = new Plate();
  const c: Pt = [0, 0];
  const blocks: Pt[][] = [];
  let rays: SealArt['rays'] = null;
  if (kind === 'ammonite' || kind === 'sun') {
    const { heart, R } = ammoniteIn(c, pane - 1.6);
    ammonite(p, heart, R);
    // (Its hatching, between the ribs and along the seams, too fine to hold at the plate's size: it reads as stray marks.)
    p.out = p.out.filter((s) => s.cls !== 'hatch');
  }
  if (kind === 'sun') {
    let [lines, hatching] = ['', ''];
    for (let k = 0; k < 16; k++) {
      const a = k * 22.5 + 11.25;
      const len = k % 2 ? r * 2 * 0.72 : r * 2;
      const half = (Math.asin(Math.min(1, (k % 2 ? 1.7 : 2.3) / (r + 1.4))) * 180) / Math.PI;
      const ray = pointedRay(c, a, r + 1.4, len, half, 0.7);
      lines += ray.lines;
      hatching += ray.hatch;
      blocks.push([at(c, a - half * 1.3, r), at(c, a, len + 1.6), at(c, a + half * 1.3, r)]);
    }
    rays = { lines, hatch: hatching };
  }
  if (kind === 'earth') {
    // (findEngraving's earthSign: a triangle point down, a bar across it, hatched down its right side.)
    const s = pane - 1.2;
    const [left, right, foot] = [at(c, -60, s), at(c, 60, s), at(c, 180, s)];
    const y = c[1] + s * 0.18;
    const across = (q: Pt) => lerp(q, foot, (y - q[1]) / (foot[1] - q[1]));
    p.add(poly([left, right, foot]) + line(across(left), across(right)), 'sign');
    p.add(hatch(lerp(left, right, 0.5), right, foot, Math.max(0.55, s * 0.13)), 'hatch');
  }
  if (kind === 'electrum') {
    // (findEngraving's electrumSign: Sol, a ring with a dot, in Luna's horns, the moon hatched.)
    const k = (pane - 0.8) / 9.2;
    p.luna([c[0], c[1] + 0.8 * k], k, -90);
    const sun: Pt = [c[0], c[1] - 4.9 * k];
    p.add(arc(sun, 3.6 * k, 0, 360), 'sign');
    p.add(disc(sun, 0.75 * k), 'fill');
  }
  return { sign: p.out, rays, blocks };
}

/**
 * The pane's amber, `d` across (its layout px), as the card's back is
 * painted (one still image, the lamp's light worked in): the lamp at its
 * middle, its light carried a little past the edge so the whole pane
 * glows, the deeper red-brown only at its rim; a rare's redder. `s`, device
 * px to one.
 */
export function paneJob(tier: FossilTier, d: number, s: number): AmberJob {
  const slab: AmberSlab = { w: d, h: d, lamp: [d / 2, d / 2], rx: d * 0.62, ry: d * 0.62, drop: null, rare: tier === 'rare', seed: tier === 'rare' ? 17 : 5 };
  const W = Math.round(d * s);
  return { layer: 'flat', slab, W, H: W, s, ox: 0, oy: 0 };
}
