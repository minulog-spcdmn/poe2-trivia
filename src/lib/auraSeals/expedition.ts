// The Expedition aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).
//
// The seal is a Remnant, as the aura makes the token one: a hewn standing
// stone dug out of the ground, its face carved with one of the
// Remnant's runes, the cold light it wakes with fanning up behind it. The
// rune is the game's own script, one of the eight the aura writes in the
// air (fx/auras/expedition.glsl.ts), copied here. The sign is the
// Expedition's own mark, traced from the game's: a triskelion of flames
// whirling round a bright orb, each flame ending in a rune stone.

import { angleOf, at, lerp, line, ring, type Pt } from '../arcane.ts';
import { poly, disc, inPoly, cutLine, ringCuts, sealRing, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/**
 * The Remnant's runes, as the aura's shader holds them: strokes on a
 * grid of about ±1, y up: a line (x0, y0, x1, y1), an arc (its centre, its
 * radius, from an angle through a sweep, in radians, counter-clockwise if
 * positive) or a dot (its centre, its radius).
 */
type Stroke = ['line', number, number, number, number] | ['arc', number, number, number, number, number] | ['dot', number, number, number];
/** The crossed arcs. */
const CROSSED: Stroke[] = [
  ['arc', -0.95, 0, 1.15, -0.8378, 1.6755],
  ['arc', 0.95, 0, 1.15, 2.3038, 1.6755],
  ['line', 0, -0.95, 0, 0.95],
  ['dot', -0.42, 0.62, 0.09],
  ['dot', 0.42, -0.62, 0.09],
  ['line', -0.3, -0.92, 0.3, -0.92],
];
/** A rune at `c`, `k` px to its grid's unit, `sx` times as broad, turned `turn` degrees clockwise, as path data. */
function rune(strokes: Stroke[], c: Pt, k: number, sx = 1, turn = 0) {
  const [cos, sin] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
  const P = (x: number, y: number): Pt => [c[0] + (x * sx * cos + y * sin) * k, c[1] + (x * sx * sin - y * cos) * k];
  let d = '';
  for (const s of strokes) {
    if (s[0] === 'line') d += line(P(s[1], s[2]), P(s[3], s[4]));
    else if (s[0] === 'dot') d += ring(P(s[1], s[2]), Math.max(0.35, s[3] * k));
    else {
      const [, x, y, r, a0, sw] = s;
      const n = Math.max(6, Math.ceil(Math.abs(sw) * 8));
      const pts = Array.from({ length: n + 1 }, (_, i) => P(x + r * Math.cos(a0 + (sw * i) / n), y + r * Math.sin(a0 + (sw * i) / n)));
      d += `M${pts.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L')}`;
    }
  }
  return d;
}
/** Where a ray from `o` at heading `a` leaves the circle about `c` of radius `r` (o inside it). */
function toRim(o: Pt, a: number, c: Pt, r: number): Pt {
  const u = at([0, 0], a, 1);
  const [fx, fy] = [o[0] - c[0], o[1] - c[1]];
  const b = fx * u[0] + fy * u[1];
  const t = -b + Math.sqrt(b * b - (fx * fx + fy * fy - r * r));
  return [o[0] + u[0] * t, o[1] + u[1] * t];
}
/** The parts of the line from `p` to `q` inside the polygon `ps`, less any of the `holes` in it. */
function within(p: Pt, q: Pt, ps: Pt[], ...holes: Pt[][]) {
  const ts = [0, 1];
  const d1: Pt = [q[0] - p[0], q[1] - p[1]];
  for (const rg of [ps, ...holes])
    for (let i = 0; i < rg.length; i++) {
      const [a, b] = [rg[i], rg[(i + 1) % rg.length]];
      const d2: Pt = [b[0] - a[0], b[1] - a[1]];
      const den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-12) continue;
      const t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / den;
      const u = ((a[0] - p[0]) * d1[1] - (a[1] - p[1]) * d1[0]) / den;
      if (t > 0 && t < 1 && u >= 0 && u < 1) ts.push(t);
    }
  ts.sort((x, y) => x - y);
  let d = '';
  for (let i = 0; i + 1 < ts.length; i++) {
    if (ts[i + 1] - ts[i] < 1e-3) continue;
    const m = lerp(p, q, (ts[i] + ts[i + 1]) / 2);
    if (inPoly(m, ps) && !holes.some((h) => inPoly(m, h))) d += line(lerp(p, q, ts[i]), lerp(p, q, ts[i + 1]));
  }
  return d;
}

/**
 * The Expedition's seal: a Remnant dug out. A standing stone, rough as it
 * was raised, chipped, broad at its foot and tapering to a blunt, broken
 * point, stands in the pit dug round it and rises out of the seal's ring;
 * the ground below is cut through and hatched on the slant, as an
 * engraver draws earth in section. Its face, toward the light, is
 * carved with the Remnant's rune of crossed arcs; its side, turned from the
 * light, is hatched along its height. Behind it the cold light it wakes
 * with fans up out of the dig.
 */
const expedition: Seal = (p, c, R, room) => {
  const lean = 4;
  // The ground's level, the pit's floor, and how far the pit runs either side.
  const [g0, g] = [0.34, 0.56];
  const [pl, pr] = [-0.66, 0.58];
  const foot: Pt = [c[0] - R * 0.1, c[1] + R * g];
  const top = Math.min(1.2, (room(0) - 1.5) / R);
  /** A point on the stone, (x, y) in the ring's radii from the middle, leant over a little about its foot. */
  const S = (x: number, y: number): Pt => {
    const q: Pt = [c[0] + x * R, c[1] + y * R];
    const [dx, dy, a] = [q[0] - foot[0], q[1] - foot[1], (lean * Math.PI) / 180];
    return [foot[0] + dx * Math.cos(a) - dy * Math.sin(a), foot[1] + dx * Math.sin(a) + dy * Math.cos(a)];
  };
  const X = (x: number, y: number): Pt => [c[0] + x * R, c[1] + y * R];
  // Its face and its side, rough-hewn and chipped, each edge at an angle of its own.
  const face = [S(-0.5, g + 0.02), S(0.16, g + 0.02), S(0.19, -0.28), S(0.11, -0.86), S(-0.06, -top), S(-0.24, -top + 0.16), S(-0.36, -0.6), S(-0.35, -0.42), S(-0.44, -0.34), S(-0.47, -0.12)];
  const side = [S(0.16, g + 0.02), S(0.4, g - 0.04), S(0.38, -0.22), S(0.27, -0.74), S(-0.06, -top), S(0.11, -0.86), S(0.19, -0.28)];
  const stone: Clear = { polys: [face, side], holes: [], pad: 0.8 };
  sealRing(p, c, R, ringCuts(c, R, stone));
  // The ground's line: from the ring to the pit, down it, across its floor, and up and on to the ring.
  const half = (y: number) => Math.sqrt(Math.max(0, (R - 1.9) ** 2 - (y * R) ** 2)) / R;
  const surface: Pt[] = [X(-half(g0), g0), X(pl, g0), X(pl + 0.1, g), X(pr - 0.1, g), X(pr, g0), X(half(g0), g0)];
  let ground = '';
  for (let i = 0; i + 1 < surface.length; i++) ground += cutLine(surface[i], surface[i + 1], stone);
  p.add(ground, 'thin');
  // The earth below, cut through as a section is drawn: hatched across on the slant, the pit's floor and walls kept clear.
  const a0 = angleOf(c, surface[surface.length - 1]);
  const a1 = a0 + ((((angleOf(c, surface[0]) - a0) % 360) + 360) % 360);
  const below: Pt[] = [...surface, ...Array.from({ length: 13 }, (_, i) => at(c, a0 + ((a1 - a0) * i) / 12, R - 1.9))];
  let earth = '';
  for (let s = -R; s < R; s += 0.85) earth += within([c[0] + s - R, c[1] + R], [c[0] + s + R, c[1] - R], below.map((q, i) => (i < surface.length ? [q[0], q[1] + 0.6] : q)));
  p.add(earth, 'hatch');
  // The light fanning up behind the stone, out to the ring.
  let rays = '';
  for (let a = -80; a <= 80; a += 12) {
    if (Math.abs(a - lean) < 22) continue;
    rays += cutLine(at(foot, a, R * 0.45), toRim(foot, a, c, R - 2.2), stone);
  }
  p.add(rays, 'ray');
  // The stone: its edges, its side hatched along its height, the rune on its face.
  p.add(poly(face) + poly(side), 'thin');
  let shade = '';
  for (let x = 0.2; x < 0.42; x += 0.06) shade += within(S(x, g + 0.1), S(x - 0.25, -top), side);
  p.add(shade, 'hatch');
  p.add(rune(CROSSED, S(-0.14, -0.22), R * 0.42, 1.15, lean), 'thin');
  p.knockout += disc(c, R + 1.4) + poly([S(-0.62, g), S(0.52, g), S(0.48, -0.2), S(-0.06, -top - 0.14), S(-0.5, -0.6)]);
};

/**
 * The Expedition's own mark, traced from the game's (its Atlas node): a
 * triskelion of three flames whirling round a bright orb, each flame
 * thrown out as a long blade that whips back at its point and carried
 * on round into a rune stone, three gaps of light where they cross.
 * In thousandths of its reach about the orb, y down.
 */
const TRISKELION =
  '118,-822 0,-804 -113,-738 -160,-700 -214,-620 -294,-436 -317,-343 -330,-175 -351,-146 -383,-131 ' +
  '-457,-130 -556,-171 -661,-292 -696,-354 -713,-411 -708,-431 -692,-438 -629,-408 -546,-412 ' +
  '-466,-463 -438,-503 -419,-571 -427,-644 -455,-697 -489,-732 -544,-753 -623,-752 -715,-699 ' +
  '-746,-661 -764,-618 -764,-546 -732,-321 -595,-20 -495,92 -421,157 -322,228 -224,269 -206,294 ' +
  '-222,336 -281,400 -345,432 -439,450 -501,451 -568,428 -641,389 -747,304 -771,300 -768,318 ' +
  '-717,386 -564,476 -456,494 -224,471 -144,448 17,372 71,390 115,461 130,544 116,627 51,766 -7,827 ' +
  '-32,820 -39,750 -76,689 -102,664 -155,638 -215,631 -273,644 -315,666 -357,709 -389,785 -373,868 ' +
  '-342,914 -272,958 -226,972 -178,977 -144,966 71,810 261,558 298,484 342,311 357,164 344,58 ' +
  '359,30 406,25 498,50 556,92 625,176 648,231 657,329 638,509 649,517 661,501 695,414 696,263 ' +
  '687,216 648,130 525,-36 463,-98 333,-184 309,-211 306,-269 351,-339 418,-392 509,-419 646,-427 ' +
  '715,-410 728,-385 664,-336 632,-273 628,-189 651,-134 710,-72 764,-50 826,-45 883,-61 937,-109 ' +
  '965,-172 966,-256 941,-323 920,-351 859,-387 639,-474 370,-504 282,-503 87,-448 -32,-395 ' +
  '-127,-325 -158,-330 -183,-369 -207,-461 -200,-522 -152,-643 -81,-709 -10,-753 111,-800 126,-813';
const GAPS = [
  '273,158 288,175 289,211 253,350 219,425 203,442 182,446 94,349 88,318 125,269 231,168 251,157',
  '-478,-65 -457,-75 -350,-92 -319,-82 -296,-29 -262,110 -260,134 -270,155 -290,163 -311,156 ' +
  '-428,45 -479,-24 -485,-45',
  '296,-375 254,-252 238,-238 178,-241 28,-285 2,-308 3,-329 29,-351 180,-395 265,-403 286,-394',
];
const points = (s: string, c: Pt, k: number) =>
  s.split(' ').map((q): Pt => {
    const [x, y] = q.split(',').map(Number);
    return [c[0] + (x / 1000) * k, c[1] + (y / 1000) * k];
  });
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
 * The triskelion, cut in outline and hatched across, so it stands dark on
 * the plate as the game's stands dark on its cloud; the orb in its heart,
 * the gaps where the flames cross and the rune stones' marks are left
 * bright.
 */
const triskelionSign: Sign = (p, c, r) => {
  const k = r * 1.22;
  const outer = smooth(points(TRISKELION, c, k));
  const gaps = GAPS.map((g) => smooth(points(g, c, k)));
  const orb = Array.from({ length: 36 }, (_, i) => at(c, i * 10, k * 0.15));
  const stones = [75, 194, 314].map((a) => at(c, a, k * 0.847));
  const marks = stones.map((s) => Array.from({ length: 16 }, (_, i) => at(s, i * 22.5, k * 0.055)));
  p.add([outer, ...gaps].map(poly).join('') + ring(c, k * 0.15), 'sign');
  let shade = '';
  const u = at([0, 0], 120, 1);
  for (let s = -k; s < k; s += 0.7) {
    const o: Pt = [c[0] + u[1] * -s, c[1] + u[0] * s];
    shade += within([o[0] - u[0] * k, o[1] - u[1] * k], [o[0] + u[0] * k, o[1] + u[1] * k], outer, ...gaps, orb, ...marks);
  }
  p.add(shade, 'hatch');
  p.add(stones.map((s) => ring(s, k * 0.055)).join(''), 'hair');
};

export const seals: AuraSeal = { seal: expedition, sign: triskelionSign };
