// The Abyss aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).
//
// The seal is the aura's Abyssal lich lord: its skull rising out of the dark
// in the seal's ring, its jaw lost in the dark as the token hides its teeth,
// its sockets deep, and out from behind its brow its crown of spines, up
// and out over the arch. The sign is the Abyss's own mark, traced from the
// game's (its Atlas node and the map's Abyss button): the Well, a ring round
// a dark hole, in eight bars hooked at one end, a stud beside each hook.

import { at, lerp, line, type Pt } from '../arcane.ts';
import { poly, disc, inPoly, LIGHT, cutLine, ringCuts, blade, piecesOf, sealRing, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/** The parts of the line from `p` to `q` inside the polygon `ps`, as pairs of ends. */
function spans(p: Pt, q: Pt, ps: Pt[]): [Pt, Pt][] {
  const ts = [0, 1];
  const d1: Pt = [q[0] - p[0], q[1] - p[1]];
  for (let i = 0; i < ps.length; i++) {
    const [a, b] = [ps[i], ps[(i + 1) % ps.length]];
    const d2: Pt = [b[0] - a[0], b[1] - a[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / den;
    const u = ((a[0] - p[0]) * d1[1] - (a[1] - p[1]) * d1[0]) / den;
    if (t > 0 && t < 1 && u >= 0 && u < 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    if (ts[i + 1] - ts[i] < 1e-3) continue;
    if (inPoly(lerp(p, q, (ts[i] + ts[i + 1]) / 2), ps)) out.push([lerp(p, q, ts[i]), lerp(p, q, ts[i + 1])]);
  }
  return out;
}
/** The parts of the line from `p` to `q` inside the polygon `ps`. */
const within = (p: Pt, q: Pt, ps: Pt[]) => spans(p, q, ps).map(([a, b]) => line(a, b)).join('');
/** Where along the line from `p` to `q` (0 to 1) it runs inside the circle about `c` of radius `r` and outside the one about `o` of radius `ro`. */
function crescent(p: Pt, q: Pt, c: Pt, r: number, o: Pt, ro: number): [number, number][] {
  const span = (k: Pt, rr: number): [number, number] | null => {
    const d: Pt = [q[0] - p[0], q[1] - p[1]];
    const f: Pt = [p[0] - k[0], p[1] - k[1]];
    const a = d[0] * d[0] + d[1] * d[1];
    const b = 2 * (f[0] * d[0] + f[1] * d[1]);
    const disc = b * b - 4 * a * (f[0] * f[0] + f[1] * f[1] - rr * rr);
    if (disc < 0) return null;
    return [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)];
  };
  const A = span(c, r);
  if (!A) return [];
  const [t0, t1] = [Math.max(0, A[0]), Math.min(1, A[1])];
  const B = span(o, ro);
  const parts: [number, number][] = B ? [[t0, Math.min(t1, B[0])], [Math.max(t0, B[1]), t1]] : [[t0, t1]];
  return parts.filter(([a, b]) => b - a > 0.02);
}
/**
 * The Abyss's seal: the lich lord's skull, seen from the front, filling the
 * ring and rising over its top, lost below its cheekbones in the dark it
 * rises from (level strokes, as the Abyss's pall). Its cranium is long, as
 * a lich's, turned from the light on the right; its sockets squared, deep,
 * empty and dark; its nose an empty notch. From behind its brow its crown
 * of spines rises up and out, three a side, uneven, straight as thorns,
 * each shaded down the side turned from the light.
 */
const abyss: Seal = (p, c, R, room) => {
  const X = (x: number, y: number): Pt => [c[0] + x * R, c[1] + y * R];
  const cc = X(0, -0.2);
  const cr = R * 0.78;
  // The skull's outline: the cranium, long as a lich's, from temple to temple over the top, the cheekbones, the upper jaw.
  const domeR = (h: number) => 1 / Math.hypot(Math.sin((h * Math.PI) / 180) / cr, Math.cos((h * Math.PI) / 180) / (R * 0.9));
  const dome = Array.from({ length: 29 }, (_, i) => at(cc, -122 + (244 * i) / 28, domeR(-122 + (244 * i) / 28)));
  const skull: Pt[] = [...dome, X(0.7, 0.42), X(0.44, 0.62), X(0.2, 0.74), X(-0.2, 0.74), X(-0.44, 0.62), X(-0.7, 0.42)];
  // The spines: from behind the temples, out and up.
  const spines = [
    { s: 1, a: 20, len: 1.74 },
    { s: 1, a: 40, len: 1.6 },
    { s: 1, a: 60, len: 1.42 },
    { s: -1, a: 340, len: 1.7 },
    { s: -1, a: 320, len: 1.62 },
    { s: -1, a: 300, len: 1.38 },
  ].map(({ s, a, len }) => {
    const root = at(cc, s * 45, cr * 0.6);
    const tip = at(c, a, Math.min(R * len, room(a) - 1));
    const spine = Array.from({ length: 13 }, (_, i) => lerp(root, tip, i / 12));
    return { tip, spine, b: blade(spine, R * 0.11, 1) };
  });
  const front: Clear = { polys: [skull, ...spines.flatMap((t) => piecesOf(t.b.left, t.b.right))], holes: [], pad: 0.8 };
  sealRing(p, c, R, ringCuts(c, R, front));
  // The dark it rises from, in level strokes below the skull.
  let pall = '';
  for (let y = 0.5; y < 0.98; y += 0.09) {
    const half = Math.sqrt(Math.max(0, (R - 1.9) ** 2 - (y * R) ** 2));
    if (half > 1) pall += cutLine([c[0] - half, c[1] + y * R], [c[0] + half, c[1] + y * R], { polys: [skull], holes: [], pad: 0.8 });
  }
  p.add(pall, 'hatch');
  // The spines, behind the skull.
  const behind: Clear = { polys: [skull], holes: [], pad: 0.7 };
  let edges = '';
  let shade = '';
  for (const { spine, b } of spines) {
    for (const side of [b.left, b.right]) for (let k = 0; k + 1 < side.length; k++) edges += cutLine(side[k], side[k + 1], behind);
    // The side turned from the light, one line along it, as a thorn's shade.
    const dark = (b.left[6][0] - spine[6][0]) * LIGHT[0] + (b.left[6][1] - spine[6][1]) * LIGHT[1] < 0 ? b.left : b.right;
    for (let k = 0; k + 1 < 10; k++) shade += cutLine(lerp(spine[k], dark[k], 0.5), lerp(spine[k + 1], dark[k + 1], 0.5), behind);
  }
  p.add(edges, 'thin');
  p.add(shade, 'hatch');
  // The skull.
  p.add(`M${skull.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L')}`, 'thin');
  // The cranium's right side, turned from the light: a crescent hatched across, as Luna is shaded.
  const o = at(cc, 315, R * 0.2);
  const wedge = [cc, at(cc, 12, R * 2), at(cc, 60, R * 2), at(cc, 108, R * 2)];
  let turn = '';
  const v = at([0, 0], 135, 1);
  for (let s = -cr; s < cr; s += 0.62) {
    const m: Pt = [cc[0] + v[0] * s, cc[1] + v[1] * s];
    const [a, b]: Pt[] = [at(m, 225, cr * 1.2), at(m, 45, cr * 1.2)];
    for (const [t0, t1] of crescent(a, b, cc, cr - 0.75, o, cr)) turn += within(lerp(a, b, t0), lerp(a, b, t1), wedge);
  }
  p.add(turn, 'hatch');
  // The sockets, deep, empty and dark: squared and rounded, as a skull's are, their outer corners falling a little.
  let sockets = '';
  for (const s of [-1, 1]) {
    const m = X(s * 0.32, 0.1);
    const pts = Array.from({ length: 32 }, (_, i) => {
      const th = (i / 32) * Math.PI * 2;
      const [cx, sy] = [Math.cos(th), Math.sin(th)];
      const x = R * 0.2 * Math.sign(cx) * Math.abs(cx) ** 0.55;
      const y = R * 0.2 * Math.sign(sy) * Math.abs(sy) ** 0.55;
      return at(m, (Math.atan2(x, -y) * 180) / Math.PI + s * 10, Math.hypot(x, y));
    });
    sockets += poly(pts);
  }
  // The nose: a notch, pointed above, empty as the sockets.
  const nose = [X(0, 0.3), X(0.1, 0.52), X(0.04, 0.58), X(0, 0.54), X(-0.04, 0.58), X(-0.1, 0.52)];
  sockets += poly(nose);
  p.add(sockets, 'thin');
  p.knockout += disc(c, R + 1.4) + poly(Array.from({ length: 48 }, (_, i) => at(cc, i * 7.5, domeR(i * 7.5) + 1.2))) + spines.map((t) => poly(t.b.outline)).join('');
};

/**
 * The Abyss's own mark, traced from the game's (its Atlas node and the
 * map's Abyss button): the Well, a heavy ring round a dark hole, held in
 * eight bars, one along each side of an octagon, each hooked outward at
 * its clockwise end, a square stud beside each hook. Each bar in
 * thousandths of the mark's reach, y down, the top one; the others are it
 * turned by eighths.
 */
const BAR = '310,-828 288,-867 262,-877 235,-867 178,-810 137,-787 5,-777 -213,-783 -240,-774 -252,-735 -240,-712 -211,-703 190,-710 258,-754 301,-801';
const STUD: [number, number, number] = [109, -942, 52];
const [WELL_IN, WELL_OUT] = [0.477, 0.599];
/** A closed Catmull-Rom curve through `ps`, each span in `n`. */
function smooth(ps: Pt[], n = 3): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ps.length; i++) {
    const [a, b, c, d] = [-1, 0, 1, 2].map((j) => ps[(i + j + ps.length) % ps.length]);
    for (let s = 0; s < n; s++) {
      const t = s / n;
      const [t2, t3] = [t * t, t * t * t];
      out.push([0, 1].map((e) => 0.5 * (2 * b[e] + (c[e] - a[e]) * t + (2 * a[e] - 5 * b[e] + 4 * c[e] - d[e]) * t2 + (3 * b[e] - a[e] - 3 * c[e] + d[e]) * t3)) as Pt);
    }
  }
  return out;
}

/**
 * Cut solid, bars, studs and the Well's ring alike, as the game raises
 * them bright; the hole is left dark.
 */
const wellSign: Sign = (p, c, r) => {
  const k = r * 1.16;
  // A point given in thousandths of the reach, turned `a` degrees clockwise about the middle.
  const P = (x: number, y: number, a: number): Pt => {
    const [s, q] = [Math.sin((a * Math.PI) / 180), Math.cos((a * Math.PI) / 180)];
    return [c[0] + ((x * q - y * s) / 1000) * k, c[1] + ((x * s + y * q) / 1000) * k];
  };
  const bar = BAR.split(' ').map((s) => s.split(',').map(Number));
  let solid = '';
  for (let i = 0; i < 8; i++) {
    solid += poly(smooth(bar.map(([x, y]) => P(x, y, i * 45))));
    solid += disc(P(STUD[0], STUD[1], i * 45), Math.max(0.45, (STUD[2] / 1000) * k));
  }
  // The Well's ring, a solid band: its rim one way round and its hole the other, so the hole stays open.
  const [i, o] = [k * WELL_IN, k * WELL_OUT];
  solid += disc(c, o) + `M${c[0] + i} ${c[1]}A${i} ${i} 0 1 0 ${c[0] - i} ${c[1]}A${i} ${i} 0 1 0 ${c[0] + i} ${c[1]}Z`;
  p.add(solid, 'fill');
};

export const seals: AuraSeal = { seal: abyss, sign: wellSign };
