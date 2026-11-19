// The Lich aura's seal and sign (lib/auraEngraving: the seal in Sol's place
// on the face and at the back's heart, the sign in Luna's place).
//
// The game gives the Lich no emblem of her own: her ascendancy's skill icons
// are painted scenes, and her Crystalline Phylactery has no picture. So both
// come from her ascendancy's illustration: what she carries, and who she is.
//
// The seal is her lantern (the owner's pick), hanging from her hand in the
// art, leaning as she holds it out: its cap with its roof and thorned brim,
// its cage, its base with its thorned brim, knop and long spike, its lengths
// and widths and its lean measured off the art. Its light, the brightest
// thing in the art, shines between the bars of its cage, each a sliver of
// bright ink. Its brims fill the ring; its crown and loop break out above,
// its spike below, and its chain, as far as there is room, runs on toward
// her hand. It is drawn apart from the Twilight Order's lantern (an upright
// golden orb with lancet windows): hers leans, is barred and thorned, and
// hangs on a chain. Her figure, tried first, read at the seal's size only
// as a filled bowl.
//
// The sign is her hood, and her eyes glowing in its shadow, as the game's
// own portrait of the Lich (the ascendancy's icon) shows her: the hood
// placed off her head in the illustration, its opening turned up as she
// looks up, her eyes where hers are. Not a skull, which is the Abyss's.
// Her bone staff (read as a dog's bone at the sign's size), her brooch (a
// star in a ring, as the common sign is) and her clawed hand (a third hand,
// after the Breach's and the Keepers') were tried or weighed before it.

import { angleOf, at, f, lerp, line, pt, ring, type Pt } from '../arcane.ts';
import { disc, dist, LIGHT, poly, ringCuts, type AuraSeal, type Clear, type Seal, type Sign } from './kit.ts';

// ---- shading (as the Breach's: strokes running with the light on the side turned from it) ----

/** Where the line `o` across `n`, running along `u`, lies inside the outline `ps`: its spans, as distances along `u`. */
function spans(outlines: Pt[][], n: Pt, u: Pt, o: number): [number, number][] {
  const ts: number[] = [];
  for (const ps of outlines)
    ps.forEach((a, i) => {
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
/** The side of an outline turned from the light, shaded: strokes running with the light, `gap` apart, as deep into it as `depth`, stopping `pad` short of its edges and of its `holes`. */
function shading(ps: Pt[], depth: number, gap: number, pad: number, holes: Pt[][] = []) {
  const lit = ps.map(([x, y]): Pt => [x + LIGHT[0] * depth, y + LIGHT[1] * depth]);
  const u: Pt = [-LIGHT[0], -LIGHT[1]];
  const n: Pt = [-u[1], u[0]];
  const across = ps.map((q) => q[0] * n[0] + q[1] * n[1]);
  const [lo, hi] = [Math.min(...across), Math.max(...across)];
  let d = '';
  for (let o = lo + gap / 2; o < hi; o += gap) {
    const on = (t: number): Pt => [n[0] * o + u[0] * t, n[1] * o + u[1] * t];
    for (const [t0, t1] of without(spans([ps, ...holes], n, u, o), spans([lit], n, u, o))) {
      if (t1 - t0 < pad * 3) continue;
      d += line(on(t0 + pad), on(t1 - pad));
    }
  }
  return d;
}

/** A right half's points mirrored to the left. */
const mirror = (half: Pt[]) => half.map(([x, y]): Pt => [-x, y]);

// ---- the lantern ----------------------------------------------------------------

// Measured off the art (the illustration at 4x, so a unit is a quarter of
// its pixel), in the lantern's own frame: across it and up along it, from
// the middle of its cage. Its lengths and widths are the art's: the cap's
// brim, the cage, the base's brim, its knop and spike. The art's brims bristle
// with thorns; here each keeps one a side, as far out as the art's reach, so
// it reads clean at the seal's size.
/** The cap: its crown's thorn, its roof, its brim and thorn, its collar; the right half, from the top round to the cage. */
const CAP: Pt[] = [
  [0, 210], [12, 208], [16, 194], [40, 202], [20, 180], [26, 160],
  [62, 78], [94, 78], [128, 60], [98, 62], [64, 62], [64, 34],
];
/** The base: its brim and thorn, its knop and its spike; the right half, from the cage round to the spike's point. */
const BASE: Pt[] = [
  [78, -74], [78, -82], [96, -82], [128, -104], [98, -98], [62, -98],
  [28, -140], [36, -156], [32, -176], [14, -190], [0, -262],
];
/**
 * Its cones, each shaded down its side turned from the light by lines
 * running with its length, as an engraver models a turned form: the roof,
 * the base under its brim, and the spike. Each from its wide end to its
 * narrow one: where along it, and its half-width there.
 */
const CONES: [[number, number], [number, number]][] = [
  [[78, 62], [160, 26]],
  [[-98, 62], [-140, 28]],
  [[-190, 14], [-262, 0]],
];
/** Where across each cone's half its lines run: its ridge, then its shading. */
const RIDGE = 0;
const SHADE = [0.45, 0.75];
/** The cage, between the cap and the base: its half-width at its top and foot, and the bands round them. */
const CAGE = { top: 34, foot: -74, hwTop: 84, hwFoot: 78, band: 8 };
/** Its four inner bars, across the cage (its sides at 1 and -1), and each bar's half-width. */
const BARS = [-0.6, -0.2, 0.2, 0.6];
const BAR_HW = 0.04;
/** How far it leans from upright, clockwise (the art's), degrees. */
const LEAN = 23;
/** Where the chain leaves the cap, and the heading it runs off on toward her hand (the art's), degrees. */
const HANG: Pt = [0, 236];
/** The loop on the cap's top that the chain hangs from: its middle and radius. */
const LOOP = { c: [0, 223] as Pt, r: 13 };
const CHAIN_HEADING = 58;
/** The chain's links: their length and width, in lantern units, and how far apart they follow each other. */
const LINK = { long: 30, wide: 17, pitch: 21 };
/** The middle of its cage, set on the ring's middle; how far from it its brims' thorns reach (inside the ring), its loop's top and its spike's point (out of it). */
const MIDDLE: Pt = [0, -20];
const BRIMS = 152;
const TOP = LOOP.c[1] + LOOP.r - MIDDLE[1];
const FOOT = MIDDLE[1] + 262;

/**
 * The Lich's seal: her lantern. Its outline; the bands and bars of its cage,
 * the light between them left open; its cap and base shaded on the side
 * turned from the light; and its chain, leaving the ring.
 */
const lantern: Seal = (p, c, R, room) => {
  // As large as its brims fit inside the ring, its crown and spike breaking out
  // of it, above and below, as far as there is room.
  const k = Math.min((R - 2) / BRIMS, (room(LEAN) - 0.8) / TOP, (room(LEAN + 180) - 0.8) / FOOT);
  const right = at([0, 0], LEAN + 90, 1);
  const up = at([0, 0], LEAN, 1);
  const S = ([x, y]: Pt): Pt => [c[0] + ((x - MIDDLE[0]) * right[0] + (y - MIDDLE[1]) * up[0]) * k, c[1] + ((x - MIDDLE[0]) * right[1] + (y - MIDDLE[1]) * up[1]) * k];
  // The cap from the cage's left round over its top to the cage's right; the base from the cage's right round under its spike to the cage's left.
  const cap = [...mirror(CAP).reverse(), ...CAP.slice(1)].map(S);
  const base = [...BASE, ...mirror(BASE).reverse().slice(1)].map(S);
  const hw = (y: number) => CAGE.hwFoot + ((y - CAGE.foot) / (CAGE.top - CAGE.foot)) * (CAGE.hwTop - CAGE.hwFoot);

  // The cap's and the base's outlines, open where they meet the cage.
  const open = (ps: Pt[]) => `M${ps.map(pt).join('L')}`;
  p.add(open(cap), 'thin');
  p.add(open(base), 'thin');
  p.add(ring(S(LOOP.c), LOOP.r * k), 'hair');
  // The cage: its sides, its top and foot, the inner edges of its bands, its bars.
  const [tl, tr, fr, fl] = [S([-CAGE.hwTop, CAGE.top]), S([CAGE.hwTop, CAGE.top]), S([CAGE.hwFoot, CAGE.foot]), S([-CAGE.hwFoot, CAGE.foot])];
  p.add(line(tl, tr) + line(tr, fr) + line(fr, fl) + line(fl, tl), 'thin');
  const [bt, bf] = [CAGE.top - CAGE.band, CAGE.foot + CAGE.band];
  p.add(line(S([-hw(bt), bt]), S([hw(bt), bt])) + line(S([-hw(bf), bf]), S([hw(bf), bf])), 'hair');
  // Its light, between the bars: each a sliver of bright ink, as the art's
  // are the brightest thing in it, stopping short of the bars and the bands.
  const edges = [-1 + BAR_HW, ...BARS.flatMap((x) => [x - BAR_HW, x + BAR_HW]), 1 - BAR_HW];
  const gap = 0.28 / k;
  let light = '';
  for (let i = 0; i < edges.length; i += 2) {
    const [y0, y1] = [bt - gap, bf + gap];
    const g = (y: number) => gap / hw(y);
    light += poly([S([(edges[i] + g(y0)) * hw(y0), y0]), S([(edges[i + 1] - g(y0)) * hw(y0), y0]), S([(edges[i + 1] - g(y1)) * hw(y1), y1]), S([(edges[i] + g(y1)) * hw(y1), y1])]);
  }
  p.add(light, 'fill');
  // Iron in shadow: each cone's ridge, and its side turned from the light hatched along its length.
  let ridges = '';
  let shade = '';
  for (const [[y0, w0], [y1, w1]] of CONES) {
    const inset = 6;
    const [a, b] = [y0 + Math.sign(y1 - y0) * inset, y1 - Math.sign(y1 - y0) * inset];
    const along = (t: number, y: number) => S([t * (w0 + ((y - y0) / (y1 - y0)) * (w1 - w0)), y]);
    ridges += line(along(RIDGE, a), along(RIDGE, b));
    for (const t of SHADE) shade += line(along(t, a), along(t, b));
  }
  p.add(ridges, 'hair');
  p.add(shade, 'hatch');

  // The chain: from the cap's top along its heading, out of the ring as far as there is room.
  const u = at([0, 0], CHAIN_HEADING, 1);
  const s0 = S(HANG);
  const step = LINK.pitch * k;
  const [long, wide] = [(LINK.long * k) / 2, (LINK.wide * k) / 2];
  let links = '';
  let flat = '';
  let end = s0;
  for (let i = 0; i < 40; i++) {
    const m: Pt = [s0[0] + u[0] * (step * i + long), s0[1] + u[1] * (step * i + long)];
    const tip: Pt = [m[0] + u[0] * long, m[1] + u[1] * long];
    if (dist(c, tip) > room(angleOf(c, tip)) - 0.6) break;
    end = tip;
    if (i % 2 === 0) {
      // Face on: an open link, its long axis along the chain.
      const [a, b]: Pt[] = [[m[0] - u[0] * long, m[1] - u[1] * long], tip];
      const rot = f(CHAIN_HEADING - 90);
      links += `M${pt(a)}A${f(long)} ${f(wide)} ${rot} 1 1 ${pt(b)}A${f(long)} ${f(wide)} ${rot} 1 1 ${pt(a)}Z`;
    } else {
      // Edge on: a bar through the links either side of it.
      flat += line([m[0] - u[0] * long * 0.9, m[1] - u[1] * long * 0.9], [m[0] + u[0] * long * 0.9, m[1] + u[1] * long * 0.9]);
    }
  }
  p.add(links, 'hair');
  p.add(flat, 'thin');

  // The ring, broken where the cap, the loop, the spike and the chain pass over it.
  const n: Pt = [-u[1], u[0]];
  const w = wide + 0.5;
  const strap: Pt[] = [
    [s0[0] + n[0] * w, s0[1] + n[1] * w],
    [end[0] + n[0] * w, end[1] + n[1] * w],
    [end[0] - n[0] * w, end[1] - n[1] * w],
    [s0[0] - n[0] * w, s0[1] - n[1] * w],
  ];
  const loop = { c: S(LOOP.c), r: LOOP.r * k + 0.5 };
  const clear: Clear = { polys: end === s0 ? [cap, base] : [cap, base, strap], holes: [loop], pad: 0.6 };
  p.add(ring(c, R, { cuts: ringCuts(c, R, clear) }), 'thin');
  p.add(ring(c, R - 1.3, { cuts: ringCuts(c, R - 1.3, clear) }), 'hair');
  // What the plate stops short of: the ring and all that breaks out of it.
  const clearOf = (ps: Pt[]) => poly(ps.map((q) => lerp(c, q, 1 + 1 / Math.max(1, dist(c, q)))));
  p.knockout += disc(c, R + 1.4) + clearOf(cap) + clearOf(base) + disc(loop.c, loop.r + 0.8) + (end === s0 ? '' : poly(strap));
};

// ---- the hood -------------------------------------------------------------------

// Her hood, placed off her head in the art (the illustration at 4x, its
// crop from 650, 440): its outline from the left shoulder up over its peak
// and down over her right shoulder, cut straight across below them; the
// opening where her face is, turned up as she looks up; the cloak's two
// front edges falling from it; and her eyes, which glow.
const HOOD: Pt[] = [
  [170, 425], [196, 380], [240, 336], [258, 250], [268, 170], [285, 95], [310, 40], [356, 12], [428, -4],
  [494, 10], [535, 35], [568, 85], [595, 150], [615, 220], [645, 290], [700, 350], [745, 386], [762, 425],
];
const FRONT: [Pt, Pt][] = [
  [[350, 292], [334, 424]],
  [[446, 286], [496, 412]],
];
const OPENING: Pt[] = [
  [390, 312], [334, 280], [300, 210], [290, 140], [302, 76], [336, 40], [400, 24], [460, 30],
  [494, 68], [500, 130], [490, 200], [458, 264], [424, 300],
];
const EYES: Pt[] = [[335, 115], [450, 95]];
/** Where its middle lies on the art, and how far from it its furthest point lies. */
const HOOD_AT: Pt = [460, 215];
const HOOD_EXTENT = 368;
/** How far past the sign's reach its furthest point goes, and each eye's radius, in the sign's reach. */
const HOOD_FIT = 1.12;
const EYE_R = 0.06;

/** The cloth's strokes' gap, in the sign's reach. */
const CLOTH_GAP = 0.085;

/**
 * The Lich's sign: her hood, and in its shadow her eyes. Its outline, its
 * opening and the cloak's front edges; the cloth hatched close, and closer
 * on the side turned from the light; the opening left dark, the darkest
 * thing in it, and her two eyes glowing out of it, bright.
 */
const hood: Sign = (p, c, r) => {
  const k = (r * HOOD_FIT) / HOOD_EXTENT;
  const S = ([x, y]: Pt): Pt => [c[0] + (x - HOOD_AT[0]) * k, c[1] + (y - HOOD_AT[1]) * k];
  const out = HOOD.map(S);
  const opening = OPENING.map(S);
  p.add(poly(out) + poly(opening) + FRONT.map(([a, b]) => line(S(a), S(b))).join(''), 'sign');
  // The cloth: strokes running with the light across all of it but the opening.
  const u: Pt = [-LIGHT[0], -LIGHT[1]];
  const n: Pt = [-u[1], u[0]];
  const across = out.map((q) => q[0] * n[0] + q[1] * n[1]);
  const pad = r * 0.04;
  let cloth = '';
  for (let o = Math.min(...across) + (r * CLOTH_GAP) / 2; o < Math.max(...across); o += r * CLOTH_GAP)
    for (const [t0, t1] of spans([out, opening], n, u, o)) {
      if (t1 - t0 < pad * 3) continue;
      const on = (t: number): Pt => [n[0] * o + u[0] * t, n[1] * o + u[1] * t];
      cloth += line(on(t0 + pad), on(t1 - pad));
    }
  p.add(cloth + shading(out, r * 0.18, r * CLOTH_GAP, pad, [opening]), 'hatch');
  p.add(EYES.map((e) => disc(S(e), r * EYE_R)).join(''), 'fill');
};

export const seals: AuraSeal = { seal: lantern, sign: hood };
