// The Breach aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).
//
// The seal is the hand in the circle: the breach's own hand from Path of
// Exile (the map icon the owner chose), traced off the icon, not drawn by
// eye, its fingers then drawn longer than the icon's (the owner: "fingers
// too short"). One open demon's hand held up, palm out, its four long fingers spread,
// its thumb reaching out low on the right, its wrist torn off ragged; one
// outline round it all, and the side turned from the light hatched, as the
// plate's other forms are.
//
// The sign is the Breach Ring, Breach's own ring in Path of Exile 2 (the
// owner's pick), traced off the game's icon: a ring of flesh whose band ends
// in a clawed hand gripping it, a wisp of the breach's light beside it. The
// Breachstone (read as a hand with an eye, or a torch), Scorpio (read as
// plain astrology), claw gashes (a stock game icon) and a flame (Chayula's
// seal is made of flames) were tried before it.

import { line, type Pt } from '../arcane.ts';
import { disc, LIGHT, poly, sealRing, type AuraSeal, type Seal, type Sign } from './kit.ts';

/**
 * The hand's outline, traced off the icon (64 px, read at 8x: 512 across):
 * its edge where the red meets the glow, smoothed and thinned to the points
 * that hold its shape. From the wrist's right side up and round the thumb,
 * the fingers and down the left to the wrist's left side.
 */
const HAND: Pt[] = [
  [299, 473], [301, 432], [306, 412], [316, 398], [346, 373], [370, 337], [379, 318], [390, 285],
  [410, 252], [421, 211], [420, 200], [416, 195], [409, 194], [398, 198], [377, 219], [355, 255],
  [346, 260], [341, 258], [336, 244], [338, 199], [344, 183], [362, 149], [367, 119], [368, 92],
  [364, 66], [358, 56], [353, 51], [343, 50], [337, 55], [333, 66], [332, 106], [328, 123],
  [321, 138], [310, 152], [301, 159], [295, 160], [289, 153], [286, 137], [286, 55], [280, 40],
  [271, 34], [261, 37], [253, 50], [245, 116], [244, 147], [241, 159], [236, 164], [230, 166],
  [220, 161], [210, 144], [208, 126], [214, 61], [210, 50], [202, 45], [196, 46], [191, 51],
  [175, 86], [169, 134], [175, 177], [172, 190], [167, 193], [161, 191], [151, 178], [144, 158],
  [138, 124], [132, 114], [122, 111], [113, 117], [109, 128], [106, 145], [107, 162], [117, 195],
  [142, 235], [148, 251], [149, 268], [145, 317], [146, 339], [151, 369], [163, 401], [172, 474],
  [176, 481],
];
/** The torn end, from the wrist's left side back to its right: the icon's frame cuts it off, so it is drawn here, ragged and uneven as torn flesh is. */
const TORN: Pt[] = [[188, 492], [197, 479], [209, 499], [218, 486], [236, 505], [246, 480], [254, 491], [267, 476], [281, 502], [291, 487]];
/**
 * Each finger in `HAND`: the point at its tip, the webs at its root (the
 * index finger's outer side runs down to the thumb, the little finger's to
 * the wrist, so each has one), and the run of points it spans.
 */
const FINGERS = [
  { tip: 26, webs: [35], from: 17, to: 35 },
  { tip: 40, webs: [35, 47], from: 35, to: 47 },
  { tip: 54, webs: [47, 59], from: 47, to: 59 },
  { tip: 67, webs: [59], from: 59, to: HAND.length },
];
/** How much longer than the icon's each finger is drawn, from its root. */
const LONGER = 1.4;
/** Where the hand's middle lies on the icon, and how far from it its furthest point lies (with its fingers drawn longer). */
const MIDDLE_AT: Pt = [264, 244];
const EXTENT = 262;
/** How much of the ring's radius the hand fills, clear of its inner ring. */
const FILL = 0.88;
/** The shading on the side turned from the light, in the ring's radii: its depth into the hand, the gap between its strokes, and how far they stop short of the outline. */
const SHADE = 0.14;
const GAP = 0.046;
const PAD = 0.03;

/** The traced hand with each finger drawn longer: every point past the finger's root moved out along it, so the finger keeps its width. */
function lengthened(): Pt[] {
  const out = HAND.map((q): Pt => [q[0], q[1]]);
  for (const f of FINGERS) {
    const base: Pt = [f.webs.reduce((x, w) => x + HAND[w][0], 0) / f.webs.length, f.webs.reduce((y, w) => y + HAND[w][1], 0) / f.webs.length];
    const [dx, dy] = [HAND[f.tip][0] - base[0], HAND[f.tip][1] - base[1]];
    const u: Pt = [dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy)];
    for (let i = f.from + 1; i < f.to; i++) {
      const along = (HAND[i][0] - base[0]) * u[0] + (HAND[i][1] - base[1]) * u[1];
      if (along > 0) out[i] = [HAND[i][0] + u[0] * along * (LONGER - 1), HAND[i][1] + u[1] * along * (LONGER - 1)];
    }
  }
  return out;
}
const LONG_HAND = lengthened();

/** A smooth run through the points `ps` (a Catmull-Rom curve), `m` steps between each two. */
function smooth(ps: Pt[], m = 4): Pt[] {
  const out: Pt[] = [ps[0]];
  for (let i = 0; i + 1 < ps.length; i++) {
    const [a, b, c, d] = [ps[Math.max(0, i - 1)], ps[i], ps[i + 1], ps[Math.min(ps.length - 1, i + 2)]];
    for (let j = 1; j <= m; j++) {
      const t = j / m;
      const [t2, t3] = [t * t, t * t * t];
      const f = (k: 0 | 1) => 0.5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  return out;
}

/** Where the line `o` across `n`, running along `u`, lies inside the outline `ps` (or the outlines, holes and all): its spans, as distances along `u`. */
function spans(shape: Pt[] | Pt[][], n: Pt, u: Pt, o: number): [number, number][] {
  const ts: number[] = [];
  const outlines = typeof shape[0][0] === 'number' ? [shape as Pt[]] : (shape as Pt[][]);
  for (const ps of outlines) ps.forEach((a, i) => {
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
 * The side of a shape (an outline, or outlines with holes) turned from the
 * light, shaded: strokes running with the light, `gap` apart, as deep into it
 * as `depth`, stopping `pad` short of its edges.
 */
function shading(shape: Pt[] | Pt[][], depth: number, gap: number, pad: number) {
  const out = typeof shape[0][0] === 'number' ? [shape as Pt[]] : (shape as Pt[][]);
  const lit = out.map((ps) => ps.map(([x, y]): Pt => [x + LIGHT[0] * depth, y + LIGHT[1] * depth]));
  const u: Pt = [-LIGHT[0], -LIGHT[1]];
  const n: Pt = [-u[1], u[0]];
  const across = out.flat().map((q) => q[0] * n[0] + q[1] * n[1]);
  const [lo, hi] = [Math.min(...across), Math.max(...across)];
  let d = '';
  for (let o = lo + gap / 2; o < hi; o += gap) {
    const at = (t: number): Pt => [n[0] * o + u[0] * t, n[1] * o + u[1] * t];
    for (const [t0, t1] of without(spans(out, n, u, o), spans(lit, n, u, o))) {
      if (t1 - t0 < pad * 3) continue;
      d += line(at(t0 + pad), at(t1 - pad));
    }
  }
  return d;
}

/**
 * The Breach's seal: the hand in the circle. The breach's double ring; in
 * it the hand's outline, and along its side turned from the light a band of
 * strokes running with the light, ending where the lit hand begins and
 * stopping short of the outline.
 */
const breach: Seal = (p, c, R) => {
  const k = (R * FILL) / EXTENT;
  const S = ([x, y]: Pt): Pt => [c[0] + (x - MIDDLE_AT[0]) * k, c[1] + (y - MIDDLE_AT[1]) * k];
  const out = [...smooth(LONG_HAND), ...TORN].map(S);
  p.add(poly(out), 'thin');
  // The shade: what of the hand would leave it a little way down and right, away from the light.
  p.add(shading(out, R * SHADE, R * GAP, R * PAD), 'hatch');
  sealRing(p, c, R);
  p.knockout += disc(c, R + 1.4);
};

// The Breach Ring, traced off the game's icon (108 px, read at 5x: 540
// across): a ring of flesh, its band an arm that ends in a clawed hand whose
// fingers reach back over it, a wisp of the breach's light beside it. Its
// outline, the hole it rings (one finger hanging into it), the gaps between
// its claws, and the wisp; then where its middle lies and how far from it its
// furthest point lies.
/** The ring's outline. */
const RING_OUTLINE: Pt[] = [
  [228, 15], [197, 18], [190, 23], [188, 29], [203, 48], [239, 67], [247, 78], [246, 84],
  [216, 100], [188, 130], [181, 131], [182, 120], [178, 119], [154, 135], [136, 155], [105, 204],
  [40, 248], [32, 261], [29, 277], [48, 353], [53, 413], [67, 441], [83, 454], [166, 500],
  [206, 514], [232, 518], [279, 508], [313, 496], [349, 474], [393, 437], [424, 400], [441, 373],
  [461, 319], [473, 257], [502, 226], [510, 208], [500, 147], [464, 85], [461, 84], [461, 102],
  [450, 109], [444, 90], [416, 55], [407, 53], [403, 85], [414, 112], [412, 120], [407, 121],
  [348, 80], [306, 62], [247, 19],
];
/** The hole it rings, and the gaps between its claws. */
const RING_HOLES: Pt[][] = [
  [[309, 140], [310, 147], [287, 174], [279, 194], [288, 282], [295, 291], [303, 294], [323, 279], [331, 263], [333, 235], [351, 247], [381, 254], [394, 262], [400, 275], [399, 297], [393, 324], [352, 389], [292, 439], [270, 448], [239, 452], [206, 446], [161, 420], [140, 383], [119, 361], [110, 335], [111, 295], [147, 258], [166, 224], [178, 216], [197, 212], [213, 201], [256, 147]],
  [[362, 166], [379, 195], [383, 209], [361, 210], [347, 225], [337, 227], [334, 223], [335, 197]],
  [[450, 147], [465, 162], [460, 187], [466, 198], [454, 206], [446, 196], [444, 159]],
];
/** The wisp of the breach's light. */
const WISP: Pt[] = [[98, 34], [89, 43], [54, 106], [58, 142], [53, 186], [58, 202], [56, 210], [47, 219], [52, 224], [69, 220], [87, 203], [92, 193], [110, 181], [139, 131], [140, 92], [121, 70], [113, 67], [113, 52], [104, 48]];
const RING_AT: Pt = [254, 251];
/** How far past the sign's reach the ring's furthest point goes. */
const RING_FIT = 1.15;
const RING_R = 268;
/** The band's shading on the side turned from the light, in the sign's reach: its depth, the gap between its strokes, and how far they stop short of the edges. */
const RING_SHADE = 0.16;
const RING_GAP = 0.1;
const RING_PAD = 0.05;

/** The Breach Ring: its edges, its band shaded on the side from the light, the wisp solid. */
const breachRing: Sign = (p, c, r) => {
  const k = (r * RING_FIT) / RING_R;
  const S = ([x, y]: Pt): Pt => [c[0] + (x - RING_AT[0]) * k, c[1] + (y - RING_AT[1]) * k];
  const shape = [RING_OUTLINE, ...RING_HOLES].map((ps) => ps.map(S));
  p.add(shape.map(poly).join(''), 'sign');
  p.add(shading(shape, r * RING_SHADE, r * RING_GAP, r * RING_PAD), 'hatch');
  p.add(poly(WISP.map(S)), 'fill');
};

export const seals: AuraSeal = { seal: breach, sign: breachRing };
