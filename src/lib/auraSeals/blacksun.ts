// The Delve aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).
// The aura's kind is `blacksun`, the black sun at the heart of Delve's own
// circle (lib/plates/blackSun.ts); players know it as Delve, the mine of
// Path of Exile's Delve league that the game mode is named after.
//
// The seal is the thing that turns the mine's finds into crafting, a
// Chaotic Resonator, traced from the Primitive one's icon (the fossils sit
// in it): a three-cornered bronze plate turned as the game shows it, a
// knob on each corner and a round hole through its middle, ringed where it
// was cast. The hole stands near the ring's heart, as the ring's own eye,
// and the left knob breaks out over the ring. The sign is Delve's own mark,
// traced from the game's minimap icon: the vein of Voltaxic Sulphite, the
// heap of glowing ore that fuels the Crawler's light down in the dark; its
// lumps of ore cut in fine strokes, the clefts between them left dark.
// (The fossil itself is the mode's own card, and the Prime Resonator, a
// dodecahedron, would echo the Precursor Engine's sign.)

import { at, lerp, line, ring, type Hole, type Pt } from '../arcane.ts';
import { hull, grow } from '../findEngraving.ts';
import { poly, disc, inPoly, cutLine, ringCuts, sealRing, LIGHT, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/** The vein's outline, traced from the game's minimap icon: thousandths of its half-size about the middle of its box, y down. */
const VEIN =
  '29,-945 -67,-940 -129,-860 -186,-660 -290,-564 -333,-345 -395,-231 -448,-202 -533,-212 -595,-145 -600,598 ' +
  '-695,631 -757,693 -990,731 -995,774 -957,821 -700,836 -590,798 -452,798 -105,850 105,817 248,836 314,926 ' +
  '376,945 510,907 605,821 710,836 814,721 919,698 986,588 976,469 776,393 695,326 567,-31 419,-93 381,-160 ' +
  '343,-383 181,-540 119,-669 110,-821';
/** Where the icon catches the light (its brightest 40%): the lumps of ore: the tall spire with the lumps at its foot, the pillar on the left, the foot, and a sliver on the right. */
const LUMPS = [
  '-867,769 -724,798 -567,760 -405,760 -452,698 -671,688 -805,769',
  '514,445 614,579 643,736 686,788 910,631 952,560 948,512 848,455 800,460 795,550 686,450 586,426',
  '524,7 571,298 643,336 586,64',
  '-519,-179 -562,-140 -576,-50 -510,150 -533,269 -448,336 -476,407 -457,521 -348,583 -333,512 -395,321 ' +
    '-338,31 -410,-140',
  '-38,-926 -86,-864 -76,-812 -24,-779 -38,-736 -129,-702 -148,-640 -257,-560 -267,-512 -219,-498 -181,-569 ' +
    '-119,-517 -67,-579 -14,-545 -100,-460 -76,-298 29,-269 57,-164 186,17 57,140 -14,155 -43,236 86,240 ' +
    '119,269 167,240 200,269 200,426 243,464 238,536 357,693 381,874 462,888 571,812 590,655 433,474 476,407 ' +
    '452,350 381,317 376,402 310,440 252,383 314,155 405,174 348,93 400,31 343,-17 252,55 224,40 229,-12 ' +
    '357,-98 310,-355 267,-426 133,-517 62,-855 14,-921',
];
/**
 * The Primitive Chaotic Resonator's outline, traced from its icon, knobs and all: thousandths of its
 * half-size about the middle of its box. One change from the trace: the lower edge between the left
 * knob and the right one runs straight, where the icon's pixels left a notch, a wobble and a tick.
 */
const RESONATOR =
  '885,-775 855,-821 776,-870 648,-887 569,-850 500,-788 503,-742 474,-712 474,-571 408,-515 174,-426 -39,-298 ' +
  '-59,-265 -385,-107 -559,15 -602,18 -671,-35 -812,-54 -878,-28 -947,54 -974,58 -997,133 -1000,288 -911,354 ' +
  '-734,410 -671,377 -615,311 -559,308 -388,334 -253,377 -132,416 197,541 283,564 530,623 543,669 513,706 526,768 589,827 635,817 671,834 691,880 ' +
  '734,883 701,847 730,808 812,824 829,857 849,857 852,821 944,742 951,689 993,673 990,544 941,469 891,442 ' +
  '888,416 845,390 776,393 740,327 757,285 717,179 734,44 707,-104 734,-140 734,-222 711,-304 717,-426 773,-436 ' +
  '872,-521 868,-567 901,-637';
/** Its knobs (x, y, radius), each the largest disc that fits the icon's knob. */
const KNOBS: [number, number, number][] = [
  [-766, 166, 210],
  [747, 600, 214],
  [681, -636, 204],
];
/** Its hole: the middle, the half-widths across and down, as measured from the icon. */
const HOLE = { x: 233, y: -40, rx: 229, ry: 165 };

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
/** Parallel strokes `gap` apart at heading `a` (degrees clockwise from the top) across `ps`, less the `holes`; `o` and `span` bound the sweep. */
function hatchIn(ps: Pt[], o: Pt, span: number, a: number, gap: number, ...holes: Pt[][]) {
  const u = at([0, 0], a, 1);
  const n: Pt = [-u[1], u[0]];
  let d = '';
  for (let s = -span; s <= span; s += gap) {
    const m: Pt = [o[0] + n[0] * s, o[1] + n[1] * s];
    d += within([m[0] - u[0] * span, m[1] - u[1] * span], [m[0] + u[0] * span, m[1] + u[1] * span], ps, ...holes);
  }
  return d;
}
/** An ellipse about `c`, `rx` across and `ry` down, as points. */
const ellipse = (c: Pt, rx: number, ry: number, n = 48): Pt[] =>
  Array.from({ length: n }, (_, i) => [c[0] + rx * Math.cos((i / n) * 2 * Math.PI), c[1] + ry * Math.sin((i / n) * 2 * Math.PI)] as Pt);

/** The resonator with its hole at `hc`, `k` to its half-size: its lines, and its plate and knobs for what stops short of it. */
function resonatorAt(hc: Pt, k: number, hatchGap: number) {
  const c: Pt = [hc[0] - (HOLE.x / 1000) * k, hc[1] - (HOLE.y / 1000) * k];
  const P = (x: number, y: number): Pt => [c[0] + (x / 1000) * k, c[1] + (y / 1000) * k];
  const knobs: Hole[] = KNOBS.map(([x, y, kr]) => ({ c: P(x, y), r: (kr / 1000) * k }));
  const body = smooth(points(RESONATOR, c, k), 2);
  const [hx, hy] = [(HOLE.rx / 1000) * k, (HOLE.ry / 1000) * k];
  const behind: Clear = { polys: [], holes: knobs.map((h) => ({ c: h.c, r: h.r + 0.35 })), pad: 0 };
  let edge = '';
  // The plate's edge as one line, broken only where a knob stands in front (the traced bumps of the knobs go with them).
  const hidden = (q: Pt) => knobs.some((h) => Math.hypot(q[0] - h.c[0], q[1] - h.c[1]) < h.r * 1.32);
  let run: Pt[] = [];
  const start = body.findIndex((q) => hidden(q));
  for (let j = 0; j <= body.length; j++) {
    const q = body[(start + j) % body.length];
    if (hidden(q)) {
      if (run.length > 1) edge += `M${run.map((v) => `${v[0].toFixed(2)} ${v[1].toFixed(2)}`).join('L')}`;
      run = [];
    } else run.push(q);
  }
  edge += knobs.map((h) => ring(h.c, h.r)).join('');
  edge += poly(ellipse(hc, hx, hy));
  // The cast rings round the hole, inside the plate and behind the knobs.
  let rings = '';
  for (const s of [1.55, 2.15]) {
    const e = ellipse(hc, hx * s, hy * s, 64);
    for (let i = 0; i < e.length; i++) {
      const [a, b] = [e[i], e[(i + 1) % e.length]];
      if (inPoly(lerp(a, b, 0.5), body)) rings += cutLine(a, b, behind);
    }
  }
  // The hole left open, its rim and cast rings round it; each knob shaded away from the light.
  let shade = '';
  const toLight = (Math.atan2(LIGHT[0], -LIGHT[1]) * 180) / Math.PI;
  for (const h of knobs) shade += hatchIn(ellipse(h.c, h.r, h.r, 32), h.c, h.r, 45, hatchGap, ellipse(at(h.c, toLight, h.r * 0.5), h.r * 0.95, h.r * 0.95, 32));
  return { edge, rings, shade, body, coarse: points(RESONATOR, c, k), knobs };
}

/**
 * Delve's seal: the Primitive Chaotic Resonator, in the pose its icon
 * shows, its hole near the heart of the ring, as the ring's own eye; its
 * left knob breaks out through the ring, which is cut where the plate
 * stands in front of it.
 */
const resonatorSeal: Seal = (p, c, R, room) => {
  let k = R * 0.92;
  let hc: Pt = c;
  // Its hole a little left of the ring's heart, so only the left knob breaks out; kept within the room, the ball and all.
  for (let i = 0; i < 12; i++) {
    hc = [c[0] - R * 0.16, c[1] + R * 0.02];
    const far = KNOBS.map(([x, y, kr]) => {
      const q: Pt = [hc[0] + ((x - HOLE.x) / 1000) * k, hc[1] + ((y - HOLE.y) / 1000) * k];
      const d = Math.hypot(q[0] - c[0], q[1] - c[1]) + (kr / 1000) * k;
      return d / Math.max(1, room((Math.atan2(q[0] - c[0], c[1] - q[1]) * 180) / Math.PI) - 1);
    });
    if (Math.max(...far) <= 1) break;
    k *= 0.96;
  }
  const r = resonatorAt(hc, k, 0.5);
  const front: Clear = { polys: [hull(r.coarse)], holes: r.knobs.map((h) => ({ c: h.c, r: h.r + 0.8 })), pad: 0.8 };
  sealRing(p, c, R, ringCuts(c, R, front));
  p.add(r.edge, 'thin');
  p.add(r.rings, 'hair');
  p.add(r.shade, 'hatch');
  p.knockout += disc(c, R + 1.4) + poly(grow(hull(r.body), 1.2)) + r.knobs.map((h) => disc(h.c, h.r + 1.2)).join('');
};

/**
 * Delve's sign: its own mark, the vein of sulphite as the minimap shows
 * it, in its pose; its lumps of glowing ore cut in fine strokes along its
 * height, the clefts between them left dark.
 */
const veinSign: Sign = (p, c, r) => {
  const k = r * 1.08;
  const out = smooth(points(VEIN, c, k));
  const lumps = LUMPS.map((z) => smooth(points(z, c, k), 2));
  p.add(poly(out), 'sign');
  let shade = '';
  for (const z of lumps) shade += hatchIn(z, c, k, 172, 0.55);
  p.add(shade, 'hatch');
};

export const seals: AuraSeal = { seal: resonatorSeal, sign: veinSign };
