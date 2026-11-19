// The Lich aura's seal and sign (lib/auraEngraving: the seal in Sol's place
// on the face and at the back's heart, the sign in Luna's place).
//
// poe2db shows no emblem for the Lich: her ascendancy's skill icons are
// painted scenes, and her Crystalline Phylactery has no picture of its own.
// So both come from her ascendancy's illustration: the seal from what she
// carries, the sign from what she wears.
//
// The seal is her lantern (the owner's pick), hanging from her hand in the
// art, leaning as she holds it out: its cap with its roof and thorned brim,
// its cage, its base with its thorned brim, knop and long spike. It is
// rebuilt, not traced: its lengths, its widths along its length and its
// lean are measured off the art, and where the art's brims bristle with
// thorns, each here keeps one a side, as far out as theirs. Its light, the
// brightest thing in the art, shines between the bars of its cage, each a
// sliver of bright ink. Its brims fill the ring; its crown and loop break
// out above, its spike below, and its chain, as far as there is room, runs
// on toward her hand. It is drawn apart from the Twilight Order's lantern
// (an upright golden orb with lancet windows): hers leans, is barred and
// thorned, and hangs on a chain. Her figure, tried first, read at the
// seal's size only as a filled bowl.
//
// The sign is her brooch (the owner's pick), the thorned star on her robe in
// the art: eight thorns of uneven length round a small boss,
// a ring through them and a web strung between them. Its thorns tie it to
// the lantern's, and its uneven points keep it apart from Divine's sign, a
// web star as even as a pentagram. Tried before it: her bone staff (read as
// a dog's bone at the sign's size), her hood with glowing eyes (read as a
// ghost, a bell or an egg), her Crystalline Phylactery (the owner passed on
// it), her clawed hand from the Lich passive's icon (too spindly at the
// sign's size, and a third hand after the Breach's and the Keepers') and the
// aura's braided cord (a squiggle).

import { angleOf, at, f, lerp, line, pt, ring, type Pt } from '../arcane.ts';
import { disc, dist, poly, ringCuts, type AuraSeal, type Clear, type Seal, type Sign } from './kit.ts';

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

/**
 * The Lich's sign: her brooch, from her robe in the art. A thorned star,
 * its eight thorns of uneven length set round a small boss, a ring through
 * them, and a web strung between them inside the ring.
 */
/** How far past the sign's radius its longest thorn reaches: its short thorns leave it light, so it is drawn larger. */
const BROOCH = 1.25;
const brooch: Sign = (p, c, r0) => {
  const r = r0 * BROOCH;
  const lens = [1, 0.62, 0.88, 0.55, 0.95, 0.6, 0.8, 0.66];
  let d = ring(c, r * 0.52) + ring(c, r * 0.2);
  lens.forEach((L, i) => {
    const a = i * 45 + 8;
    // Each thorn grows from the boss's edge, the long ones broader at the root.
    const root = at(c, a, r * 0.2);
    const hw = r * (i % 2 ? 0.05 : 0.08);
    d += `M${pt(at(root, a - 90, hw))}L${pt(at(c, a, r * L))}L${pt(at(root, a + 90, hw))}`;
    // The web: a strand sagging toward the boss to the next thorn.
    d += `M${pt(at(c, a, r * 0.36))}Q${pt(at(c, a + 22.5, r * 0.3))} ${pt(at(c, a + 45, r * 0.36))}`;
  });
  p.add(d, 'sign');
};

export const seals: AuraSeal = { seal: lantern, sign: brooch };
