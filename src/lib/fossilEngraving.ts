// The engraved plate of a card that holds a fossil (ChooseCategory): the
// category's plate (lib/cardEngraving), cut by the same hand as the finds'
// (lib/findEngraving; docs/arcane-style.md), and in it, round the emblem,
// a piece of amber (lib/amberStone) held up to the light, the item inside
// it as what the resin swallowed. Never which fossil: the card says
// only that it holds one, and whether a rare.
//
// • The seal, in Sol's place: an ammonite, the fossil of fossils, coiled in
//   its logarithmic spiral, ribbed and shaded in a double ring. A rare's
//   stands in a sun of pointed rays so large it breaks the arch.
// • The sign, in Luna's: earth, where a fossil lies (a fossil is life gone
//   to stone); a rare's is electrum, the alchemists' name for amber and for
//   their gold that holds silver: Sol in Luna's horns.
// • Round the emblem: the stone, its outline doubled, the plate's lines
//   stopping short of it, the glory pouring out from behind it as from a
//   lamp; a rare's sends pointed rays out of it, long and short in turn,
//   to the arch. Its amber is painted (lib/fossilAmber), its shading and
//   gloss engraved over the item (AmberStone).
// • The back: the stone at the mandorla's heart, the ammonite inside it, in
//   its glory (a rare's with its rays).
//
// Laid in a row (phones) the spandrels are gone: the stone, a low one,
// holds the emblem, and the seal stands at the row's far end.

import { arc, at, f, line, pointedRay, pt, type Hole, type Pt } from './arcane.ts';
import { LUNA, LUNA_HATCH, element } from './alchemy.ts';
import { inset, pebble, polyPath, reachIn, type Stone } from './amberStone.ts';
import { Plate, transform, type BackLayout, type RowLayout, type Stroke, type TallLayout, type Variant } from './cardEngraving.ts';
import { disc, poly } from './findEngraving.ts';
import type { AmberTier } from './fossilAmber.ts';

// ---- the ammonite -------------------------------------------------------------------

/** How much wider each whorl is than the one inside it. */
const WHORL = 2.25;

/**
 * An ammonite seen from the side, coiled about `c`: a logarithmic spiral,
 * each whorl WHORL times the one inside it, `r` to the rim of the last at
 * its mouth (heading `end`, degrees clockwise from the top). A keel runs
 * inside the rim of the outer whorls; ribs cross them, long and short in
 * turn, leaning forward; and the flank turned from the light (from the upper
 * left) is hatched between them: the inner flank on the upper left, where it
 * dips into the coil, the outer on the lower right.
 */
export function ammonite(p: Plate, c: Pt, r: number, end = 34) {
  const turns = 2.7;
  const rho = (a: number) => r * WHORL ** ((a - end) / 360);
  const inner = (a: number) => rho(a - 360);
  const keel = (a: number) => rho(a) - (rho(a) - inner(a)) * 0.15;
  const spiral = (from: number, to: number, k: (a: number) => number) => {
    const n = Math.max(2, Math.ceil((to - from) / 3));
    return `M${Array.from({ length: n + 1 }, (_, i) => pt(at(c, from + ((to - from) * i) / n, k(from + ((to - from) * i) / n)))).join('L')}`;
  };
  // The rim of each whorl, from the heart of the coil out to the mouth.
  p.add(spiral(end - 360 * turns, end, rho), 'thin');
  // The keel, inside the rim of the last whorl and a half.
  p.add(spiral(end - 540, end - 3, keel), 'hair');
  // The mouth across the last whorl, and its lip a little behind it.
  p.add(line(at(c, end, rho(end)), at(c, end, inner(end))), 'thin');
  const lip = end - (1.5 / r) * (180 / Math.PI);
  p.add(line(at(c, lip, keel(lip) - 0.2), at(c, lip, inner(lip) + 0.5)), 'hair');
  // The ribs, whorl by whorl, fewer the further in; and the hatching between them.
  let ribs = '';
  let shade = '';
  const shaded = (a: number) => {
    const h = ((a % 360) + 360) % 360;
    // Upper left: the inner flank; lower right: the outer.
    return h >= 225 || h < 45 ? 'inner' : 'outer';
  };
  for (const [w, n] of [
    [0, 30],
    [1, 22],
  ] as const) {
    const step = 360 / n;
    for (let k = 0; k < n; k++) {
      const a = end - 360 * (w + 1) + (k + 0.5) * step;
      if (a > end - 4) continue;
      const out = (w === 0 || a > end - 540 ? keel(a) : rho(a)) - 0.35;
      const inn = inner(a) + 0.4;
      const width = out - inn;
      if (width < 1.4) continue;
      // Leaning forward a quarter of the whorl's width.
      const lean = ((width * 0.28) / out) * (180 / Math.PI);
      const from = k % 2 ? inn + width * 0.42 : inn;
      ribs += line(at(c, a + (lean * (from - inn)) / width, from), at(c, a + lean, out));
      // Two strokes in the gap after it, on the flank away from the light.
      for (const t of [1 / 3, 2 / 3]) {
        const b = a + step * t;
        if (b > end - 3) continue;
        const [o2, i2] = [(w === 0 || b > end - 540 ? keel(b) : rho(b)) - 0.35, inner(b) + 0.4];
        const wd = o2 - i2;
        const ln = ((wd * 0.28) / o2) * (180 / Math.PI);
        const [r0, r1] = shaded(b) === 'inner' ? [i2 + 0.3, i2 + wd * 0.42] : [o2 - wd * 0.42, o2 - 0.3];
        shade += line(at(c, b + (ln * (r0 - i2)) / wd, r0), at(c, b + (ln * (r1 - i2)) / wd, r1));
      }
    }
  }
  p.add(ribs, 'hair');
  p.add(shade, 'hatch');
}

/** The fossil's seal: an ammonite in a double ring, `r` to the ring's outer line. */
function ammoniteSeal(p: Plate, c: Pt, r: number) {
  p.add(arc(c, r - 1.3, 0, 360), 'thin');
  p.add(arc(c, r, 0, 360), 'hair');
  ammonite(p, c, r - 3.4);
  p.knockout += disc(c, r + 1.4);
}

/**
 * A rare's seal: the ammonite in a sun, its ring `r0` across, sixteen
 * pointed rays out of it, long (to `r`) and short in turn, hatched down one
 * side, and fine rays between; the plate stops short of the ring and each
 * pointed ray.
 */
function sunSeal(p: Plate, c: Pt, r0: number, r: number) {
  p.add(arc(c, r0, 0, 360), 'thin');
  p.add(arc(c, r0 - 1.3, 0, 360), 'hair');
  ammonite(p, c, r0 - 3.6);
  let fine = '';
  for (let k = 0; k < 16; k++) {
    const a = k * 22.5 + 11.25;
    const len = k % 2 ? r * 0.72 : r;
    const half = (Math.asin(Math.min(1, (k % 2 ? 1.7 : 2.3) / (r0 + 1.4))) * 180) / Math.PI;
    const ray = pointedRay(c, a, r0 + 1.4, len, half, 0.7);
    p.add(ray.lines, 'hair');
    p.add(ray.hatch, 'hatch');
    p.knockout += poly([at(c, a - half * 1.3, r0), at(c, a, len + 1.6), at(c, a + half * 1.3, r0)]);
    fine += line(at(c, a + 11.25, r0 + 2.2), at(c, a + 11.25, r0 + (r * 0.72 - r0) * 0.66));
  }
  p.add(fine, 'hair');
  p.knockout += disc(c, r0 + 1.3);
}

// ---- the signs ----------------------------------------------------------------------

/** Earth, where a fossil lies, `r` from its middle to its points: a triangle point down, barred, a ridge down it and one side hatched. */
function earthSign(p: Plate, c: Pt, r: number) {
  const e = element(false, true, r);
  p.add(transform(e.lines, c), 'sign');
  p.add(transform(e.shade, c), 'hatch');
}

/** Electrum, amber's old name and the alchemists' gold that holds silver, `r` from its middle to its ends: Sol, a ring with a dot, in Luna's horns, the moon hatched. */
function electrumSign(p: Plate, c: Pt, r: number) {
  const k = r / 9.2;
  const moon: Pt = [c[0], c[1] + 0.8 * k];
  p.luna(moon, k, -90);
  const sun: Pt = [c[0], c[1] - 4.9 * k];
  p.add(arc(sun, 3.6 * k, 0, 360), 'sign');
  p.add(`M${pt([sun[0] + 0.75 * k, sun[1]])}A${f(0.75 * k)} ${f(0.75 * k)} 0 1 1 ${pt([sun[0] - 0.75 * k, sun[1]])}A${f(0.75 * k)} ${f(0.75 * k)} 0 1 1 ${pt([sun[0] + 0.75 * k, sun[1]])}Z`, 'fill');
}

// ---- the stone ----------------------------------------------------------------------

/** The stone round the emblem of a tall face, a row's, and a back's. */
const tallStone = (C: Pt, tier: AmberTier) => pebble([C[0], C[1] - 2], 54, 62, 'tall', tier === 'rare');
const rowStone = (C: Pt, ry: number, tier: AmberTier) => pebble(C, ry * 1.18, ry, 'low', tier === 'rare');
const backStone = (c: Pt, row: boolean, tier: AmberTier) => (row ? pebble(c, 24, 20, 'low', tier === 'rare') : pebble(c, 30, 35, 'tall', tier === 'rare'));

/** The stone engraved on the plate: its outline doubled, the plate's own lines stopping short of it. */
function setStone(p: Plate, st: Stone) {
  p.add(polyPath(st.outline), 'thin');
  p.add(polyPath(inset(st.outline, -1.7)), 'hair');
  p.knockout += polyPath(inset(st.outline, -3.2));
}

/** The glory as light pouring out from behind the stone: fine rays from its outline, long and short in turn, out to `reach`. */
function lampGlory(p: Plate, st: Stone, c: Pt, reach: (deg: number) => number, n: number, short = 0.55, holes: Hole[] = []) {
  const out = inset(st.outline, -3.6);
  let rays = '';
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * 360;
    const r0 = reachIn(out, c, a);
    const r1 = reach(a) - 2;
    const end = k % 2 ? r0 + (r1 - r0) * short : r1;
    if (end - r0 > 4) rays += line(at(c, a, r0), at(c, a, end), { holes });
  }
  p.add(rays, 'ray');
}

/**
 * A rare's stone sends pointed rays out of it, `n` round it, long and short
 * in turn, each to `end(a, long)` from its middle (each its heading), none
 * down onto what it stands on; hatched down one side, the plate stopping
 * short of each.
 */
function stoneRays(p: Plate, st: Stone, n: number, end: (a: number, long: boolean) => number) {
  for (let k = 0; k < n; k++) {
    const a = (k * 360) / n;
    if (Math.abs(a - 180) < 50) continue;
    const r0 = reachIn(st.outline, st.c, a) + 2.6;
    const long = k % 2 === 0;
    const r1 = end(a, long);
    if (r1 - r0 < 6) continue;
    const half = (Math.asin(Math.min(1, (long ? 3 : 2.3) / r0)) * 180) / Math.PI;
    const ray = pointedRay(st.c, a, r0, r1, half, 0.75);
    p.add(ray.lines, 'thin');
    p.add(ray.hatch, 'hatch');
    p.knockout += poly([at(st.c, a - half * 1.3, r0 - 1), at(st.c, a, r1 + 1.6), at(st.c, a + half * 1.3, r0 - 1)]);
  }
}

/** The ammonite inside a back's stone, as what the amber holds (AmberStone draws it there, dark). */
function inclusion(c: Pt, r: number): Stroke[] {
  const sub = new Plate();
  ammonite(sub, c, r, 210);
  return sub.out;
}

// ---- the faces ----------------------------------------------------------------------

/** How far a line out of `c` at `a` runs before it meets the arch's outer line, on a tall face. */
const toArch = (c: Pt, a: number, g: TallLayout) => {
  const u = at([0, 0], a, 1);
  const { A, ro } = g.arch;
  const [fx, fy] = [c[0] - A[0], c[1] - A[1]];
  const b = fx * u[0] + fy * u[1];
  const t = -b + Math.sqrt(b * b - (fx * fx + fy * fy - ro * ro));
  if (c[1] + u[1] * t > A[1]) return (u[0] > 0 ? A[0] + ro - c[0] : A[0] - ro - c[0]) / u[0];
  return t;
};
/** How far a line out of `c` at `a` runs before it meets a hole, or Infinity. */
const toHole = (c: Pt, a: number, h: Hole) => {
  const u = at([0, 0], a, 1);
  const [fx, fy] = [c[0] - h.c[0], c[1] - h.c[1]];
  const b = fx * u[0] + fy * u[1];
  const d = b * b - (fx * fx + fy * fy - h.r * h.r);
  return d > 0 && -b - Math.sqrt(d) > 0 ? -b - Math.sqrt(d) : Infinity;
};

/** How far the seal in Sol's place reaches: the common's ring, and the rare's sun. */
const SEAL = 19;
const SUN = { ring: 15, rays: 30 };

function faceTall(p: Plate, g: TallLayout, tier: AmberTier) {
  const st = tallStone(g.emblem, tier);
  setStone(p, st);
  if (tier === 'rare') {
    const holes = [
      { c: g.sol.c, r: SUN.rays * 0.8 + 3 },
      { c: g.luna.c, r: g.luna.r + 3.5 },
    ];
    // The long ones to the arch's inner line, the short ones half as far; none past the pedestal's top.
    stoneRays(p, st, 16, (a, long) => {
      const u = at([0, 0], a, 1);
      const arch = toArch(st.c, a, g) - (g.arch.ro - g.arch.ri) - 2.5;
      const r0 = reachIn(st.outline, st.c, a);
      let end = long ? arch : r0 + (arch - r0) * 0.5;
      if (u[1] > 1e-9) end = Math.min(end, (g.pedestal.capTop - 6 - st.c[1]) / u[1]);
      for (const h of holes) end = Math.min(end, toHole(st.c, a, h) - 2);
      return end;
    });
  }
  p.stone = { ...st, caustic: { c: [g.arch.A[0], g.pedestal.capTop], rx: g.pedestal.capR - 8, ry: (g.pedestal.capR - 8) * 0.085 } };
  // The glory brightest at the stone, fading toward the arch.
  p.fade = { c: g.emblem, from: 0, r: 150 };
}

function faceRow(p: Plate, g: RowLayout, tier: AmberTier) {
  const C = g.emblem;
  const st = rowStone(C, g.h / 2 - 17, tier);
  setStone(p, st);
  if (tier === 'rare') {
    stoneRays(p, st, 12, (a, long) => {
      const u = at([0, 0], a, 1);
      const ends = [u[0] > 1e-9 ? (g.divider - 7 - st.c[0]) / u[0] : u[0] < -1e-9 ? (9 - st.c[0]) / u[0] : Infinity, u[1] > 1e-9 ? (g.h - 6 - st.c[1]) / u[1] : u[1] < -1e-9 ? (6 - st.c[1]) / u[1] : Infinity];
      const r0 = reachIn(st.outline, st.c, a);
      return long ? Math.min(...ends) : Math.min(...ends, r0 + 9);
    });
  }
  p.stone = { ...st };
  // The seal at the row's far end.
  const r = Math.min(g.h * 0.3, 30);
  const c: Pt = [g.w - r - 14, g.h / 2];
  if (tier === 'rare') sunSeal(p, c, r * 0.58, r);
  else ammoniteSeal(p, c, r * 0.72);
}

function back(p: Plate, g: BackLayout, tier: AmberTier) {
  const st = backStone(g.c, g.row, tier);
  setStone(p, st);
  if (tier === 'rare') {
    stoneRays(p, st, 12, (a, long) => {
      const r0 = reachIn(st.outline, st.c, a);
      let end = Math.min(g.room(a), r0 + (long ? (g.row ? 14 : 30) : g.row ? 7 : 14));
      for (const h of g.holes) end = Math.min(end, toHole(st.c, a, h) - 2);
      return end;
    });
  }
  // The glory sits back with the plate, not the motif.
  p.motif = false;
  lampGlory(p, st, g.c, (deg) => g.room(deg) + 1, g.row ? 60 : 84, 0.62, g.holes);
  p.motif = true;
  p.stone = { ...st, inclusion: inclusion(st.c, Math.min(st.rx, st.ry) * 0.62) };
}

// ---- the variants ---------------------------------------------------------------------

const variants = new Map<AmberTier, Variant>();

/** The plate of a card holding a fossil of `tier`: one object per tier, so its engraved plates are kept (cardEngraving's engrave). */
export function fossilVariant(tier: AmberTier): Variant {
  let v = variants.get(tier);
  if (!v) variants.set(tier, (v = variantOf(tier)));
  return v;
}

function variantOf(tier: AmberTier): Variant {
  return {
    spandrels(p, sol, luna) {
      if (tier === 'rare') {
        sunSeal(p, sol.c, SUN.ring, SUN.rays);
        electrumSign(p, luna.c, luna.r * 0.86);
      } else {
        ammoniteSeal(p, sol.c, SEAL);
        earthSign(p, luna.c, luna.r * 0.8);
      }
    },
    glory(p, c, reach, row) {
      const st = row ? rowStone(c, Math.min(reach(0), reach(180)) - 8, tier) : tallStone(c, tier);
      lampGlory(p, st, c, reach, row ? 56 : 80, row ? 0.6 : 0.55);
    },
    face(p, g) {
      if (g.row) faceRow(p, g, tier);
      else faceTall(p, g, tier);
    },
    back(p, g) {
      back(p, g, tier);
    },
  };
}
