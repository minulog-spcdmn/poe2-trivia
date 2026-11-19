// The Delirium aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).
//
// The seal is Raven's Reflection, the Delirium's raven feather made of
// mirror shards (the Raven Trickster speaks for the madness), traced from
// the game's icon, its shards shaded as the icon shades them, a few
// splinters glinting off it. The sign is the Delirium's own mark, traced
// from the game's: a horned mask with two flames rising inside it.

import { angleOf, at, lerp, line, type Pt } from '../arcane.ts';
import { poly, disc, dist, inPoly, ringCuts, sealRing, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/** The parts of the line from `p` to `q` inside the polygon `ps`. */
function within(p: Pt, q: Pt, ps: Pt[]) {
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
  let d = '';
  for (let i = 0; i + 1 < ts.length; i++) {
    if (ts[i + 1] - ts[i] < 1e-3) continue;
    if (inPoly(lerp(p, q, (ts[i] + ts[i + 1]) / 2), ps)) d += line(lerp(p, q, ts[i]), lerp(p, q, ts[i + 1]));
  }
  return d;
}
/** The polygon `ps` hatched in lines at heading `a`, `gap` apart. */
function hatchPoly(ps: Pt[], a: number, gap: number) {
  const m = ps.reduce<Pt>((s, q) => [s[0] + q[0] / ps.length, s[1] + q[1] / ps.length], [0, 0]);
  const span = Math.max(...ps.map((q) => dist(q, m))) + 1;
  const [u, v] = [at([0, 0], a, 1), at([0, 0], a + 90, 1)];
  let d = '';
  for (let s = -span + gap / 2; s < span; s += gap) {
    const o: Pt = [m[0] + v[0] * s, m[1] + v[1] * s];
    d += within([o[0] - u[0] * span, o[1] - u[1] * span], [o[0] + u[0] * span, o[1] + u[1] * span], ps);
  }
  return d;
}
/** `ps` drawn in toward its middle by `k` (px). */
function shrink(ps: Pt[], k: number): Pt[] {
  const m = ps.reduce<Pt>((s, q) => [s[0] + q[0] / ps.length, s[1] + q[1] / ps.length], [0, 0]);
  return ps.map((q) => {
    const d = dist(q, m) || 1;
    return lerp(q, m, Math.min(0.9, k / d));
  });
}

/**
 * Raven's Reflection, traced from the game's icon: a raven's feather made
 * of mirror shards. Its outline; its quill (a curve through three points);
 * the edges of its shards, swept back from each point and notch of the
 * outline along the creases the icon shows; the shards the icon draws dark
 * (hatched dense) or in half light (hatched sparse), each with its blade's
 * heading; and the splinters flying off it (x, y, size). In thousandths of
 * its reach about its middle, y down.
 */
const FEATHER =
  '543,-759 458,-601 266,-357 246,-379 -19,-116 56,-326 -85,-181 -189,20 -213,18 -197,-104 ' +
  '-311,39 -344,-26 -380,-16 -466,202 -464,459 -444,516 -605,655 -660,724 -651,759 -568,728 ' +
  '-409,573 -376,579 -329,542 -266,595 -203,589 -125,551 -113,520 -40,520 138,381 258,365 484,265 ' +
  '480,239 401,255 272,216 543,122 539,100 390,75 460,33 633,-169 617,-192 578,-184 547,-232 ' +
  '617,-283 660,-571 637,-591 607,-546 570,-569 572,-673';
const QUILL = '-692,785 0,285 594,-569';
const EDGES = '480,239 -250,420 -380,-16 -446,594 543,122 -187,360 -197,-104 -406,222 -85,-181 -153,327 56,-326 -114,37 460,33 -91,265 -189,20 -158,332 617,-192 421,50 246,-379 260,-127 547,-232 46,120';
const SHADE: [number, number, string][] = [
  [2, 41, '637,-591 607,-546 592,-555 358,-237 93,77 529,-230 552,-235 617,-283 660,-565'],
  [1, 34, '238,-371 -15,-120 30,-255 -107,35 -144,306 101,49 252,-131'],
  [2, 18, '-199,-86 -397,218 -437,575 -166,328 -197,20 -213,16'],
  [1, 6, '-392,12 -466,200 -464,461 -446,512'],
  [2, 71, '539,100 395,77 407,63 -76,265 -158,341 537,116'],
  [1, 68, '482,247 -244,424 -427,587 -641,756 -568,728 -409,573 -376,579 -329,542 -266,595 -201,589 ' +
    '-125,551 -111,520 -40,520 138,381 260,365 484,265'],
  [2, 48, '-446,518 -609,659 -660,724 -654,748 -454,589'],
];
const SPLINTERS = '173,652,38 440,523,32 -368,-115,31 -191,-475,29 534,416,28 326,725,27 -187,-182,26 -664,478,25';
const unit = (s: string) =>
  s.split(' ').map((q): Pt => {
    const [x, y] = q.split(',').map(Number);
    return [x / 1000, y / 1000];
  });

/**
 * The Delirium's seal: Raven's Reflection, the Delirium's raven feather
 * made of mirror shards, standing aslant across the seal as the icon has
 * it, quill low on the left, point high on the right, out over the ring. The
 * shards the light finds are left bright; the rest are hatched along
 * their blades, the darkest closest, as the icon shades them, and a few
 * splinters glint off it.
 */
const delirium: Seal = (p, c, R, room) => {
  const shape = unit(FEATHER);
  // Standing as the icon has it, lifted a little so its vane (not its long quill) sits in the seal's middle, as
  // large as the room lets its ends break out over the ring, slid right as far as it helps (its quill runs toward
  // the card's left edge).
  const fits = (k: number, o: Pt) =>
    shape.every((u) => {
      const q: Pt = [o[0] + u[0] * k, o[1] + u[1] * k];
      const d = Math.hypot(q[0], q[1]);
      return d <= 0.9 || d * R <= room(angleOf([0, 0], q)) - 1;
    });
  let [k, o]: [number, Pt] = [0.5, [0, 0]];
  for (const dx of [0, 0.08, 0.16, 0.24])
    for (const dy of [-0.14]) {
      let s = 1.3;
      while (s > k && !fits(s, [dx, dy])) s -= 0.02;
      if (s > k + 0.01) [k, o] = [s, [dx, dy]];
    }
  const P = ([x, y]: Pt): Pt => [c[0] + (o[0] + x * k) * R, c[1] + (o[1] + y * k) * R];
  const feather = shape.map(P);
  const body: Clear = { polys: [feather], holes: [], pad: 0.8 };
  sealRing(p, c, R, ringCuts(c, R, body));
  p.add(poly(feather), 'thin');
  const [q0, qc, q1] = unit(QUILL).map(P);
  const quill = Array.from({ length: 25 }, (_, i): Pt => {
    const t = i / 24;
    return [(1 - t) ** 2 * q0[0] + 2 * (1 - t) * t * qc[0] + t * t * q1[0], (1 - t) ** 2 * q0[1] + 2 * (1 - t) * t * qc[1] + t * t * q1[1]];
  });
  p.add(`M${quill.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L')}`, 'thin');
  const ends = unit(EDGES).map(P);
  let edges = '';
  for (let i = 0; i + 1 < ends.length; i += 2) edges += line(ends[i], ends[i + 1]);
  p.add(edges, 'hair');
  let shade = '';
  for (const [tone, heading, pts] of SHADE) shade += hatchPoly(shrink(unit(pts).map(P), 0.45), heading, tone === 2 ? 0.62 : 1.1);
  p.add(shade, 'hatch');
  let glints = '';
  const sp = SPLINTERS.split(' ').map((q) => q.split(',').map(Number));
  for (const [x, y, s] of sp) {
    const m = P(unit(`${x},${y}`)[0]);
    const h = Math.max(0.5, (s / 1000) * k * R * 1.6);
    glints += poly([[m[0], m[1] - h], [m[0] + h * 0.55, m[1]], [m[0], m[1] + h], [m[0] - h * 0.55, m[1]]]);
  }
  p.add(glints, 'fill');
  p.knockout += disc(c, R + 1.4) + poly(shrink(feather, -1.2));
};

/**
 * The Delirium's own mark, traced from the game's (its Atlas icon): a
 * horned mask in one dark band, its two horns curling up and apart, its
 * jaw drawn to a point below, two flames rising inside from its chin. In
 * thousandths of its reach about its middle, y down.
 */
const MARK =
  '-196,-835 -258,-737 -328,-668 -384,-664 -452,-709 -510,-703 -544,-674 -642,-530 -755,-475 ' +
  '-822,-473 -860,-435 -909,-416 -912,-398 -880,-281 -884,-359 -862,-374 -828,-349 -752,-6 -759,100 ' +
  '-743,152 -776,195 -755,244 -689,287 -622,276 -532,292 -422,257 -381,271 -324,347 -294,445 ' +
  '-303,476 -355,542 -413,590 -367,674 -321,726 -177,731 -43,829 24,835 168,734 322,725 409,615 ' +
  '412,589 361,550 294,454 319,355 383,270 424,257 534,292 624,276 691,286 756,242 776,194 744,161 ' +
  '759,98 752,-8 824,-341 853,-373 884,-357 880,-282 912,-409 859,-436 821,-473 754,-476 650,-524 ' +
  '589,-596 543,-676 508,-704 451,-708 371,-660 327,-670 265,-729 195,-835 192,-814 229,-730 ' +
  '328,-610 387,-576 448,-600 482,-597 598,-518 608,-499 605,-422 695,-330 706,-249 688,-132 629,5 ' +
  '642,67 629,96 588,114 485,128 443,110 340,31 306,25 275,36 227,126 232,358 202,392 160,407 ' +
  '128,382 115,263 161,145 189,7 163,-82 125,-108 146,-5 146,68 130,137 74,238 70,335 104,421 ' +
  '178,474 189,515 155,620 22,688 -23,687 -156,619 -190,513 -176,473 -103,419 -70,333 -72,247 ' +
  '-127,145 -146,66 -145,-7 -121,-103 -133,-109 -158,-90 -189,9 -160,147 -115,265 -129,384 -162,407 ' +
  '-204,391 -232,357 -227,124 -276,35 -342,31 -444,111 -487,128 -590,114 -631,95 -642,66 -627,14 ' +
  '-688,-134 -708,-263 -695,-332 -604,-424 -609,-490 -597,-520 -480,-598 -446,-600 -385,-576 ' +
  '-335,-604 -234,-721 -195,-805';
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

/** The mark cut solid, as the game draws it dark on its mist. */
const markSign: Sign = (p, c, r) => {
  const k = r * 1.15;
  const pts = MARK.split(' ').map((q): Pt => {
    const [x, y] = q.split(',').map(Number);
    return [c[0] + (x / 1000) * k, c[1] + (y / 1000) * k];
  });
  p.add(poly(smooth(pts)), 'fill');
};

export const seals: AuraSeal = { seal: delirium, sign: markSign };
