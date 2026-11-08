// The engraving of PoE2's 1.0 countdown (components/LaunchCountdown.svelte),
// in the plates' craft (docs/arcane-style.md): an hourglass on a plinth
// between the Gladiator and the Shadow, the light falling from Sol, high on
// the Gladiator's side, the hourglass's shadow cast along the plinth to where
// the Shadow stands under Luna. The sand is the time from GGG's announcement
// to the launch: what is left above, what has run below, and a stream between
// them till the last grain.
// • The frame: a slab at the top and at the foot, each on a moulding, seen
//   a little from above; two turned posts, collared at their ends and beaded
//   at the waist, each shaded down its right side, away from the light.
// • The glass: two bulbs from a rounded shoulder to a narrow waist, a line
//   of light down the left of each.
// • The sand: laid in solid, hatched over, the surface above dipping where
//   it drains, the heap below at the slope sand rests at, each shaded on its
//   right.
// • The two classes: their sigils' own silhouettes, each blade bevelled along
//   its middle as the game draws them, the faces turned from Sol hatched
//   (scripts/engrave-sigils.py). The Gladiator stands in the light; the
//   Shadow, in the hourglass's shadow, is only his outline till the day.
// • The plinth: its front edge and foot, square at the ends; on its top
//   the hourglass's shadow, cast long to the right.
// • Sol and Luna, each in a double ring, stamped in over the two, and
//   between them an arch over the hourglass, a band of the circles' script
//   (lib/tongue.ts) between two rules, broken at each seal: the plate's
//   frame.
// Everything is computed, in a box 200 wide and 120 high about the
// hourglass's middle, and each line comes with when the pen draws it in
// (lib/drawIn: `at` seconds in, for `t`), the hatching and the signs set
// down whole once their lines are drawn.

import { at, f, line, pt, ring, seeded, transform, wear, type Pt } from './arcane.ts';
import { LUNA, LUNA_HATCH } from './alchemy.ts';
import { inscribe } from './tongue.ts';
import engravings from '../data/sigilEngravings.json' with { type: 'json' };

/** The whole drawing's box, and the header's: the hourglass alone, slab to foot. */
export const BOX = { x: -100, y: -60, w: 200, h: 120 };
export const CLOSE = { x: -29.5, y: -50.5, w: 59, h: 101 };
export type Box = typeof BOX;

/** Where the hourglass and the two classes stand. */
export const FLOOR = 46;
/** The glass's waist, where the sand falls through. */
export const WAIST = 0;
/** Where the glass ends, under the top slab's moulding and over the foot's. */
const NECK = 38.5;
/** The slabs' and mouldings' half widths, and how flat their tops look from a little above. */
const SLAB = 27;
const MOULD = 24;
const FLAT = 0.13;
/** The posts' places. */
const POST = 21;
/** The plinth: its front edge, its foot, and its ends. */
const EDGE = 52.5;
const BASE = 56;
const END = 86;

/** The two classes: where each stands, its middle, and its sigil's height. */
const SIGILS = {
  gladiator: { x: -64, h: 52 },
  shadow: { x: 64, h: 52 },
} as const;
/** Sol over the Gladiator, Luna over the Shadow. */
const SOL: Pt = [-64, -38];
const LUNA_AT: Pt = [64, -38];
const SEAL_R = 8.4;

/** A line's weight, as the plates have them. */
export type Weight = 'main' | 'thin' | 'hair' | 'hatch' | 'sign';
/**
 * A line of the engraving and when the pen draws it in: `at` seconds in, for
 * `t` (drawn as a dash run out), or `ink`, set down whole at `at` (hatching,
 * signs). Its path may hold several strokes, all drawn at once.
 */
export type Line = { d: string; w: Weight; at: number; t?: number; ink?: true };

/** The glass's half width at `y` (0 at the waist, ±NECK at its ends). */
export function glass(y: number): number {
  const s = 1 - Math.min(1, Math.abs(y) / NECK);
  // From the end (s 0) a rounded shoulder out to the widest, then in to the waist (s 1).
  if (s < 0.25) return 11 + 6 * Math.sin((Math.PI / 2) * (s / 0.25));
  return 1.6 + 15.4 * Math.sin((Math.PI / 2) * ((1 - s) / 0.75)) ** 0.8;
}

const poly = (pts: Pt[]) => `M${pts.map(pt).join('L')}`;
const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

/** An ellipse about `c`, `rx` across and FLAT as deep, from `t0` to `t1` degrees (0 to the right, 90 to the front). */
const ell = (c: Pt, rx: number, t0: number, t1: number) => {
  const n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / 6));
  return poly(range(t0, t1, n).map((t) => [c[0] + rx * Math.cos((t * Math.PI) / 180), c[1] + rx * FLAT * Math.sin((t * Math.PI) / 180)]));
};

/** The hourglass, which never changes: the frame and the glass, the shading on them, in the order they're drawn. */
export const GLASS: Line[] = (() => {
  const out: Line[] = [];
  const top = -FLOOR;
  const foot = FLOOR - 7;
  const past = (Math.acos(MOULD / SLAB) * 180) / Math.PI;

  // The foot first, its slab and then the moulding on it, as it's built.
  out.push({ d: ell([0, FLOOR], SLAB, 0, 180) + line([-SLAB, foot], [-SLAB, FLOOR]) + line([SLAB, foot], [SLAB, FLOOR]), w: 'main', at: 0.15, t: 0.55 });
  out.push({ d: ell([0, foot], SLAB, 0, 180) + ell([0, foot], SLAB, 180, 180 + past) + ell([0, foot], SLAB, 360 - past, 360), w: 'thin', at: 0.25, t: 0.5 });
  out.push({
    d: ell([0, foot - 2], MOULD, 180, 360) + ell([0, foot - 2], MOULD, 0, 180) + line([-MOULD, foot - 2], [-MOULD, foot]) + line([MOULD, foot - 2], [MOULD, foot]),
    w: 'thin',
    at: 0.32,
    t: 0.5,
  });

  // The posts, turned: a collar at each end, a bead at the waist, shaded down their right sides.
  const radius = (y: number) => {
    const e = NECK + 0.5 - Math.abs(y);
    if (e < 2.6) return 2.5;
    if (e < 3.4) return 1.5 + (2.5 - 1.5) * ((3.4 - e) / 0.8);
    const m = Math.abs(y);
    if (m < 1.6) return 2.7;
    if (m < 3.2) return 1.25 + (2.7 - 1.25) * ((3.2 - m) / 1.6) ** 2;
    return 1.5 - 0.25 * Math.max(0, 1 - (m - 3.2) / 10);
  };
  // (Drawn up from the foot.)
  const ys = range(NECK + 0.5, -NECK - 0.5, 154);
  const shading: string[] = [];
  const edges: string[] = [];
  for (const cx of [-POST, POST]) {
    out.push({ d: poly(ys.map((y) => [cx - radius(y), y])) + poly(ys.map((y) => [cx + radius(y), y])), w: 'thin', at: 0.4, t: 0.7 });
    for (const k of [0.35, 0.7]) shading.push(poly(ys.filter((y) => Math.abs(y) < NECK - 2.4).map((y) => [cx + radius(y) * k, y])));
    // The collars' and the bead's edges across the post.
    for (const y of [-NECK + 2.1, NECK - 2.1, -1.6, 1.6]) edges.push(line([cx - radius(y), y], [cx + radius(y), y]));
  }

  // The glass, its two sides drawn up from the foot together.
  const gy = range(NECK, -NECK, 120);
  out.push({ d: poly(gy.map((y) => [-glass(y), y])) + poly(gy.map((y) => [glass(y), y])), w: 'thin', at: 0.5, t: 0.75 });

  // The top slab: the moulding under it, its front band, and its top seen whole.
  out.push({
    d: ell([0, top + 7], MOULD, 0, 180) + line([-MOULD, top + 5 + FLAT * MOULD], [-MOULD, top + 7]) + line([MOULD, top + 5 + FLAT * MOULD], [MOULD, top + 7]),
    w: 'thin',
    at: 0.78,
    t: 0.45,
  });
  out.push({ d: ell([0, top + 5], SLAB, 0, 180) + line([-SLAB, top], [-SLAB, top + 5]) + line([SLAB, top], [SLAB, top + 5]), w: 'main', at: 0.85, t: 0.5 });
  out.push({ d: ell([0, top], SLAB, 0, 360) + 'Z', w: 'thin', at: 0.92, t: 0.55 });
  out.push({ d: ell([0, top], SLAB - 3, 0, 360) + 'Z', w: 'hair', at: 1.05, t: 0.5 });

  // The slabs' fronts shaded as a cylinder is, away from the light: strokes crowding to the right.
  const shadeBand = (y0: number, y1: number, rx: number) => {
    for (const t of [-86, -80, ...range(24, 84, 10)]) {
      const x = rx * Math.sin((t * Math.PI) / 180);
      const front = rx * FLAT * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
      const [a, b] = [y0 + front + 0.7, y1 + front - 0.7];
      if (b - a > 0.5) shading.push(line([x, a], [x, b]));
    }
  };
  shadeBand(top, top + 5, SLAB);
  shadeBand(foot, FLOOR, SLAB);
  out.push({ d: edges.join(''), w: 'hair', at: 1.0, ink: true });
  out.push({ d: shading.join(''), w: 'hatch', at: 1.1, ink: true });

  // A line of light down the left of each bulb.
  const light: string[] = [];
  for (const sgn of [-1, 1]) {
    const run = range(9, 30, 24).map((m) => sgn * m);
    light.push(poly(run.map((y) => [-glass(y) + 2.4, y])));
    light.push(poly(range(15, 22, 8).map((m) => [-glass(sgn * m) + 4, sgn * m])));
  }
  out.push({ d: light.join(''), w: 'hair', at: 1.2, ink: true });
  return out;
})();

/** A class's sigil as an engraving (scripts/engrave-sigils.py), its glyph `h` high, centred on `x`, its foot on the floor. */
function engraved(e: { outline: number[][][]; hatch: number[][] }, x: number, h: number) {
  const pts = e.outline.flat();
  const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const k = h / (y1 - y0);
  const P = (px: number, py: number): Pt => [x + (px - (x0 + x1) / 2) * k, FLOOR + 0.6 - (y1 - py) * k];
  return {
    outline: e.outline.map((loop) => poly(loop.map(([px, py]) => P(px, py))) + 'Z').join(''),
    hatch: e.hatch.map(([ax, ay, bx, by]) => line(P(ax, ay), P(bx, by))).join(''),
  };
}
const GLADIATOR = engraved(engravings.gladiator, SIGILS.gladiator.x, SIGILS.gladiator.h);
// (The Shadow's own sigil isn't out yet: the Assassin's, his ascendancy in the first game, stands for him.)
const SHADOW = engraved(engravings.assassin, SIGILS.shadow.x, SIGILS.shadow.h);

/** The Gladiator, in the light. */
export const GLADIATOR_LINES: Line[] = [
  { d: GLADIATOR.outline, w: 'main', at: 0.6, t: 0.85 },
  { d: GLADIATOR.hatch, w: 'hatch', at: 1.15, ink: true },
];
/** The Shadow: his outline in the hourglass's shadow; his relief, which shows on the day. */
export const SHADOW_LINES: Line[] = [{ d: SHADOW.outline, w: 'thin', at: 0.75, t: 0.85 }];
export const SHADOW_RELIEF: Line[] = [{ d: SHADOW.hatch, w: 'hatch', at: 1.3, ink: true }];

/** The plinth they stand on, and the shadows cast on it. */
export const PLINTH: Line[] = (() => {
  // Its front edge drawn out from the middle, then its foot and its ends.
  const edge = line([0, EDGE], [-END, EDGE]) + line([0, EDGE], [END, EDGE]);
  const base = line([-END, BASE], [END, BASE]) + line([-END, EDGE], [-END, BASE]) + line([END, EDGE], [END, BASE]);
  // The hourglass's shadow on its top, laid in strokes along it from the
  // foot's front curve to the right, long, its far end the top slab's,
  // slanting as the light falls.
  const cover = (y: number) => SLAB * Math.sqrt(Math.max(0, 1 - ((y - FLOOR) / (SLAB * FLAT)) ** 2));
  const cast: string[] = [];
  for (let y = FLOOR + 0.8; y < EDGE - 0.6; y += 0.75) {
    const depth = (y - FLOOR) / (EDGE - FLOOR);
    cast.push(line([cover(y) + 0.8, y], [80 - 10 * depth, y]));
  }
  return [
    { d: edge, w: 'main', at: 0, t: 0.6 },
    { d: base, w: 'thin', at: 0.12, t: 0.55 },
    { d: cast.join(''), w: 'hatch', at: 1.25, ink: true },
  ];
})();

/** Sol and Luna, each in a double ring, stamped in at `at`: Sol's disc in a glory of twelve rays, Luna's crescent hatched. */
export const SEALS: { c: Pt; at: number; lines: Line[] }[] = (() => {
  const rings = (c: Pt, seed: number): Line[] => [
    { d: ring(c, SEAL_R, { wear: wear(seed) }), w: 'main', at: 0 },
    { d: ring(c, SEAL_R - 1.3), w: 'hair', at: 0 },
  ];
  const lk = 0.62;
  const moon: Pt = [LUNA_AT[0] - 1, LUNA_AT[1]];
  return [
    {
      c: SOL,
      at: 1.3,
      lines: [
        ...rings(SOL, 311),
        { d: ring(SOL, 2.3) + ring(SOL, 0.5), w: 'sign', at: 0 },
        { d: Array.from({ length: 12 }, (_, k) => line(at(SOL, k * 30, 3.4), at(SOL, k * 30, k % 2 ? 5.2 : 6.2))).join(''), w: 'hair', at: 0 },
      ],
    },
    {
      c: LUNA_AT,
      at: 1.45,
      lines: [...rings(LUNA_AT, 313), { d: transform(LUNA, moon, lk), w: 'sign', at: 0 }, { d: transform(LUNA_HATCH, moon, lk), w: 'hatch', at: 0 }],
    },
  ];
})();

/**
 * The arch from Sol over the hourglass to Luna: a circle through the two
 * seals' middles, its crown ARCH_TOP, as a band between two rules, broken
 * where it meets each seal, with a line of the script between them.
 */
const ARCH_TOP = -55.5;
const ARCH_BAND = 2.6;
const ARCH_R = (SOL[0] ** 2 + (SOL[1] - ARCH_TOP) ** 2) / (2 * (SOL[1] - ARCH_TOP));
const ARCH_C: Pt = [0, ARCH_TOP + ARCH_R];
/** How far round from the crown each seal sits, and the arch's ends, clear of them. */
const ARCH_SEAL = (Math.atan2(-SOL[0], ARCH_C[1] - SOL[1]) * 180) / Math.PI;
const ARCH_END = ARCH_SEAL - (((SEAL_R + 1.4) / ARCH_R) * 180) / Math.PI;

/** The arch's two rules, drawn out from the crown, and its script, each mark written in turn from Sol's end (`transform` putting it in its place round the arch). */
export const ARCH: { rules: Line[]; marks: { d: string; at: number; transform: string }[] } = (() => {
  const rule = (r: number, w: Weight, start: number): Line[] =>
    [-1, 1].map((dir) => {
      const [p, q] = [at(ARCH_C, 0, r), at(ARCH_C, dir * ARCH_END, r)];
      return { d: `M${f(p[0])} ${f(p[1])}A${f(r)} ${f(r)} 0 0 ${dir > 0 ? 1 : 0} ${f(q[0])} ${f(q[1])}`, w, at: start, t: 0.6 };
    });
  const script = inscribe(-ARCH_END + 1.2, ARCH_END - 1.2, ARCH_R, seeded(1211), 0.95);
  return {
    rules: [...rule(ARCH_R + ARCH_BAND, 'thin', 0.95), ...rule(ARCH_R - ARCH_BAND, 'hair', 1.05)],
    marks: script.map((m, k) => ({
      d: m.d,
      at: 1.35 + (k / script.length) * 0.6,
      transform: `translate(${f(ARCH_C[0])} ${f(ARCH_C[1])}) rotate(${f(m.a)}) translate(0 ${f(-ARCH_R)})`,
    })),
  };
})();

/** The sand's slope, as the heap below rests. */
const REPOSE = 0.62;
/** When the sand is poured in, once the glass is drawn. */
export const SAND_AT = 1.35;

/**
 * The sand with `left` of it still above (1 at the announcement, 0 at the
 * launch): the shapes it fills (`fill`), its lines by weight, and where the
 * stream runs (from the waist to the heap's top, null once none is left
 * above). The levels go as the volumes would, about: the bulbs narrow to
 * the waist, so the last of the sand above sits low and the heap below grows
 * slowly at the end.
 */
export function sand(left: number) {
  const r = Math.max(0, Math.min(1, left));
  const fill: string[] = [];
  const thin: string[] = [];
  const hatch: string[] = [];

  // Above: a level that dips in the middle, where it drains, the sand hatched under it to the waist.
  if (r > 0) {
    const level = -1 - 32 * r ** 0.62;
    const hw = glass(level) - 0.5;
    const dip = Math.min(2.6, 0.3 * -level);
    const surface = (x: number) => level + dip * (1 - Math.abs(x) / hw);
    const top = range(-hw, hw, 24).map((x): Pt => [x, surface(x)]);
    thin.push(poly(top));
    // Its body: the surface, then down the glass's right side to the waist and up its left.
    const down = range(level, WAIST - 0.4, 24).filter((y) => y > level);
    fill.push(poly([...top, ...down.map((y): Pt => [glass(y) - 0.5, y]), ...down.reverse().map((y): Pt => [-(glass(y) - 0.5), y])]) + 'Z');
    for (let y = level + 1.2; y < WAIST - 0.6; y += 1.2) {
      const w = glass(y) - 0.7;
      const gap = y < level + dip ? hw * (1 - (y - level) / dip) : 0;
      if (gap > 0.3) hatch.push(line([-w, y], [-Math.min(gap, w), y]), line([Math.min(gap, w), y], [w, y]));
      else hatch.push(line([-w, y], [w, y]));
      // Its right side in shade: strokes between, from a third of the way across.
      if (y + 0.6 < WAIST - 0.6) {
        const yy = y + 0.6;
        const ww = glass(yy) - 0.7;
        const from = Math.max(ww * 0.3, yy < level + dip ? hw * (1 - (yy - level) / dip) : 0);
        if (ww - from > 0.6) hatch.push(line([from, yy], [ww, yy]));
      }
    }
  }

  // Below: a heap at the sand's slope, hatched, its right side shaded.
  const p = 1 - r;
  const peak = NECK - 0.6 - 30 * p ** 0.62;
  if (p > 0) {
    const side = (dir: number) => {
      const pts: Pt[] = [];
      for (let x = 0; ; x += 0.25) {
        const y = peak + REPOSE * x;
        if (x >= glass(y) - 0.5 || y >= NECK - 0.6) {
          pts.push([dir * Math.min(x, glass(y) - 0.5), Math.min(y, NECK - 0.6)]);
          break;
        }
        pts.push([dir * x, y]);
      }
      return pts;
    };
    const heap = [...side(-1).reverse(), ...side(1).slice(1)];
    thin.push(poly(heap));
    // Its body: the heap, then down the glass's right side to the foot, across and up its left.
    const [, yr] = heap[heap.length - 1];
    const walls = range(yr, NECK - 0.6, 12).filter((y) => y > yr);
    fill.push(poly([...heap, ...walls.map((y): Pt => [glass(y) - 0.5, y]), ...walls.reverse().map((y): Pt => [-(glass(y) - 0.5), y])]) + 'Z');
    for (let y = peak + 1.2; y < NECK - 0.6; y += 1.2) {
      const w = glass(y) - 0.7;
      const reach = Math.min(w, (y - peak) / REPOSE);
      hatch.push(line([-reach, y], [reach, y]));
      const yy = y + 0.6;
      if (yy < NECK - 0.6) {
        const r2 = Math.min(glass(yy) - 0.7, (yy - peak) / REPOSE);
        if (r2 * 0.7 > 0.6) hatch.push(line([r2 * 0.3, yy], [r2, yy]));
      }
    }
  }

  return {
    fill: fill.join(''),
    thin: thin.join(''),
    hatch: hatch.join(''),
    stream: r > 0 && r < 1 ? { from: WAIST - 0.4, to: peak - 0.5 } : null,
  };
}
