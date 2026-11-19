// The Divinity aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).

import { angleOf, at, lerp, line, pt, ring, type Pt } from '../arcane.ts';
import { disc, dist, fourStar, poly, ringCuts, sealRing, type AuraSeal, type Seal, type Sign } from './kit.ts';

/** The outline of a channel of lightning through `ps`, `w` either side, its corners mitred sharp, narrowing to `tip` either side at its end. */
function channel(ps: Pt[], w: number, tip = 0): Pt[] {
  const n = ps.length - 1;
  const ns = ps.slice(1).map((b, j): Pt => {
    const a = ps[j];
    const L = dist(a, b) || 1;
    return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  });
  const [left, right]: Pt[][] = [[], []];
  ps.forEach((q, i) => {
    const [n0, n1] = [ns[Math.max(0, i - 1)], ns[Math.min(n - 1, i)]];
    const m: Pt = [n0[0] + n1[0], n0[1] + n1[1]];
    const L = Math.hypot(m[0], m[1]) || 1;
    const k = (i === n ? tip : w) / Math.max(0.3, (m[0] * n1[0] + m[1] * n1[1]) / L);
    left.push([q[0] + (m[0] / L) * k, q[1] + (m[1] / L) * k]);
    right.push([q[0] - (m[0] / L) * k, q[1] - (m[1] / L) * k]);
  });
  return [...left, ...right.reverse()];
}

/** A zigzag from `s` to `e`: at each of `kinks` (how far along, how far aside to the left, both as parts of its length) a sharp turn. */
function zigzag(s: Pt, e: Pt, kinks: [number, number][]): Pt[] {
  const L = dist(s, e) || 1;
  const nrm: Pt = [(e[1] - s[1]) / L, -(e[0] - s[0]) / L];
  return [s, ...kinks.map(([t, o]): Pt => [s[0] + (e[0] - s[0]) * t + nrm[0] * o * L, s[1] + (e[1] - s[1]) * t + nrm[1] * o * L]), e];
}

/**
 * The Divinity seal: the Origin Core, as the aura holds it, and the
 * Arbiter's lightning striking it. In the seal's ring the Origin Cradle, a
 * Precursor seed and egg made one, upright, its edge doubled, its side away
 * from the light hatched along its curve; in it the Origin Spark, a small
 * star of bright ink with its glow in fine rays. The lightning in straight
 * strokes turning sharp, as the aura's does, forking toward where it goes:
 * a bolt comes down from above, through the ring, onto the Cradle, as the
 * aura's strikes come down into the Core, and the charge breaks out of the
 * ring below, to either side, as it breaks out of the Core.
 */
const divine: Seal = (p, c, R, room) => {
  const bw = R * 0.042;
  // Each bolt: its channel, and a fork off one of its kinks.
  const bolts: { ps: Pt[]; w: number; fork: Pt[] }[] = [];
  const bolt = (s: Pt, e: Pt, kinks: [number, number][], w: number, at0: number, turn: number, len: number) => {
    const ps = zigzag(s, e, kinks);
    const from = ps[at0];
    const h = angleOf(from, ps[at0 + 1]) + turn;
    const fork = zigzag(from, at(from, h, dist(s, e) * len), [[0.5, turn > 0 ? -0.16 : 0.16]]);
    bolts.push({ ps, w, fork });
  };
  // The strike: from as high as there is room, through the ring, down to the Cradle's top, forking toward the ring.
  bolt(at(c, 26, Math.min(room(26) - 1.4, R * 1.75)), at(c, 3, R * 0.67), [[0.3, 0.17], [0.52, -0.11], [0.76, 0.1]], bw, 1, -38, 0.36);
  // The charge breaking out below the ring, down to the right as far as the room goes, and a shorter bolt to the left.
  bolt(at(c, 118, R + 0.3), at(c, 134, Math.min(room(134) - 1.4, R * 1.9)), [[0.26, -0.18], [0.5, 0.13], [0.76, -0.1]], bw, 2, 40, 0.34);
  bolt(at(c, 244, R + 0.3), at(c, 234, Math.min(room(234) - 1.4, R * 1.7)), [[0.36, 0.2], [0.66, -0.14]], bw * 0.85, 1, -40, 0.4);
  const shapes = (grow: number) => bolts.flatMap((b) => [channel(b.ps, b.w + grow, grow), channel(b.fork, b.w * 0.5 + grow, grow)]);
  // The ring, broken where the strike crosses it.
  sealRing(p, c, R, ringCuts(c, R - 0.65, { polys: shapes(0.7), holes: [], pad: 0 }));
  p.add(shapes(0).map((o) => poly(o)).join(''), 'fill');
  p.knockout += shapes(1.1).map((o) => poly(o)).join('');
  // The Cradle: an egg, broader below, standing in the ring, its edge doubled inside.
  const [w, h] = [R * 0.48, R * 0.66];
  const o: Pt = [c[0], c[1] + R * 0.03];
  const eggAbout = (e: Pt, k: number, n: number): Pt[] =>
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * 2 * Math.PI;
      return [e[0] + w * k * Math.cos(t) * (1 + 0.15 * Math.sin(t)), e[1] + h * k * Math.sin(t)];
    });
  p.add(poly(eggAbout(o, 1, 56)), 'thin');
  p.add(poly(eggAbout(o, 1 - 1 / w, 56)), 'hair');
  // The Spark in it, a little below its middle: a small star, and its glow in fine rays between its points.
  const sc: Pt = [o[0], o[1] + h * 0.1];
  const sr = w * 0.62;
  const spark = fourStar(sc, (a) => (a === 0 || a === 180 ? sr : sr * 0.72), sr * 0.3, sr * 0.16);
  p.add(spark.map((t) => poly(t)).join(''), 'fill');
  let glow = '';
  for (const a of [45, 135, 225, 315]) glow += line(at(sc, a, sr * 0.36), at(sc, a, sr * 0.62));
  p.add(glow, 'hair');
  // The egg's side away from the light, in lines following its curve: the egg ever smaller, its middle drawn toward a lit point as it shrinks so the lines crowd on the dark side, kept in the egg's dark part, clear of the Spark.
  const inEgg = (x: Pt, e: Pt, k: number) => {
    const v = (x[1] - e[1]) / (h * k);
    return Math.abs(v) < 1 && Math.abs(x[0] - e[0]) < w * k * Math.sqrt(1 - v * v) * (1 + 0.15 * v);
  };
  const litO: Pt = [o[0] - w * 0.34, o[1] - h * 0.28];
  let shade = '';
  for (let k = 0.86; k > 0.4; k -= 0.85 / w) {
    const contour = eggAbout(lerp(litO, o, k), k, 72);
    let run: Pt[] = [];
    const flush = () => {
      for (let i = 0; i + 1 < run.length; i++) shade += line(run[i], run[i + 1]);
      run = [];
    };
    for (const q of [...contour, contour[0]]) {
      if (inEgg(q, o, 1 - 1.6 / w) && !inEgg(q, litO, 0.78) && dist(q, sc) > sr * 0.8) run.push(q);
      else flush();
    }
    flush();
  }
  p.add(shade, 'hatch');
  p.knockout += disc(c, R + 1.4);
};

/**
 * The Origin Spark, as the game's icon shows it: a glowing core held in a
 * cage of struts (an icosahedron, tilted), fine thorns bristling out from
 * the cage's corners. The core in solid ink, its glow in fine rays to the
 * cage; the struts in front in line, those behind in hairline; each strut
 * on the side away from the light doubled, as an engraver shades a rod.
 */
const originSparkSign: Sign = (p, c, r) => {
  const g = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g],
    [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1],
  ];
  // Tilted, as on the icon, and scaled so its corners reach a little over half the sign.
  const [ax, ay, az] = [0.42, 0.55, 0.18];
  const k = (r * 0.74) / Math.hypot(1, g);
  const V = raw.map(([x, y, z]) => {
    [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
    [x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)];
    [x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)];
    return { q: [c[0] + x * k, c[1] + y * k] as Pt, z };
  });
  const core = r * 0.27;
  let [front, back, rods] = ['', '', ''];
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      const [a, b] = [raw[i], raw[j]];
      if (Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - 2) > 0.01) continue;
      const [u, v] = [V[i], V[j]];
      if (u.z + v.z > -0.4) {
        front += line(u.q, v.q);
        // The strut's shaded side, if it lies on the side of the cage away from the light.
        const m = lerp(u.q, v.q, 0.5);
        if ((m[0] - c[0]) * 0.6 + (m[1] - c[1]) * 0.8 > r * 0.08) {
          const L = dist(u.q, v.q) || 1;
          let n: Pt = [-(v.q[1] - u.q[1]) / L, (v.q[0] - u.q[0]) / L];
          if (n[0] * 0.6 + n[1] * 0.8 < 0) n = [-n[0], -n[1]];
          rods += line([lerp(u.q, v.q, 0.12)[0] + n[0] * 0.55, lerp(u.q, v.q, 0.12)[1] + n[1] * 0.55], [lerp(u.q, v.q, 0.88)[0] + n[0] * 0.55, lerp(u.q, v.q, 0.88)[1] + n[1] * 0.55]);
        }
      } else {
        // Behind: only where the core's glow does not hide it.
        const n = Math.ceil(dist(u.q, v.q) / 0.2);
        let run: Pt[] = [];
        for (let s = 0; s <= n; s++) {
          const q = lerp(u.q, v.q, s / n);
          if (dist(q, c) > core + 1.2) run.push(q);
          else {
            if (run.length > 2) back += line(run[0], run[run.length - 1]);
            run = [];
          }
        }
        if (run.length > 2) back += line(run[0], run[run.length - 1]);
      }
    }
  }
  p.add(front, 'thin');
  p.add(back + rods, 'hair');
  // The core: a faceted stone of light.
  p.add(poly(Array.from({ length: 6 }, (_, i) => at(c, i * 60 + 12 + (i % 2) * 9, core * (i % 2 ? 0.86 : 1)))), 'fill');
  let glow = '';
  for (let i = 0; i < 12; i++) glow += line(at(c, i * 30 + 6, core + 1), at(c, i * 30 + 6, core + (i % 2 ? r * 0.1 : r * 0.17)));
  p.add(glow, 'hair');
  // The thorns: from each corner on the cage's outside a fan of them, splaying out, uneven, tapering to a point.
  let thorns = '';
  V.forEach(({ q }, i) => {
    const d = dist(c, q);
    if (d < r * 0.45) return;
    const a = angleOf(c, q);
    // Three from each: the middle one longest, straight out; the others shorter, splayed.
    for (const [o, k2] of [
      [-17, 0.8],
      [0, 1],
      [17, 0.8],
    ]) {
      const len = (r * 1.12 - d) * k2 * (1 - (i % 3) * 0.08);
      if (len < r * 0.12) continue;
      const h = a + o;
      thorns += poly([at(q, h - 90, 0.38), at(q, h, len), at(q, h + 90, 0.38)]);
    }
  });
  p.add(thorns, 'fill');
};

export const seals: AuraSeal = { seal: divine, sign: originSparkSign };
