// The plate of the deathmatch (a tie at the target, settled by sudden
// death), in the rune circles' craft (docs/arcane-style.md), for the
// effects layer to draw rather than the page: built away from the page (in
// lib/fx/duelArt's worker), painted one part to a channel (lib/fx/duelPaint)
// and drawn, burnt in and bloomed by the effects' sigil (ShapeType.Sigil).
//
// Its idea is the duel itself, two equals and one blade between them:
// • two great rings, each through the other's centre (the vesica piscis),
//   woven over and under where they cross, each a strap of two lines;
// • in the almond where they overlap, an upright sword, point down: pommel
//   and grip wrapped in hatching, a guard ending in rings, a ridged blade
//   worn along its edges and hatched lengthwise down one side, in a glory
//   of fine rays that keep clear of it;
// • in each ring beyond the other, a contender: Sol radiating in the
//   right, Luna in the left amid the rings of her tide;
// • above the pommel Mars (iron, war), below the point Saturn (lead,
//   death), each sealed, in a glory of rays out to the band;
// • the band: the four elements sealed on the diagonals, the script
//   between them.
// Lines stop short of every seal and of whatever passes over them, and the
// main ones carry the odd nick.

import { arc, at as atAbout, joined, lerp, lineParts, pt, ringParts, seeded, wear, type Cut, type Hole, type Pt, type Wear } from '../arcane.ts';
import { element, LUNA, LUNA_HATCH, PLANET_SIGNS, SOL_RAYS } from '../alchemy.ts';
import { circlePath, mapPath, turned } from '../engraver.ts';
import { inscribe } from '../tongue.ts';

/** A part of the plate: its lines' path data by their weight (the stage's classes: '' main, thin, hair, sign, hatch). */
export type Inked = Record<string, string>;
/** The plate in the three parts that draw in at their own times: the sword, the rings and what lies within the band, and the band. */
export type DuelPlate = { sword: Inked; rings: Inked; band: Inked };

const O: Pt = [0, 0];
/** The point at `a` degrees clockwise from the top, `r` from the centre. */
const at = (a: number, r: number) => atAbout(O, a, r);
const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** Collects path data by weight. */
const ink = () => {
  const out: Inked = {};
  return {
    add(cls: string, d: string) {
      if (d) out[cls] = (out[cls] ?? '') + d;
    },
    out,
  };
};

/** The straight runs along `p` to `q` whose points satisfy `ok`, each at least `min` long, nearest `p` first. */
const runs = (p: Pt, q: Pt, ok: (x: Pt) => boolean, min = 0.6, step = 0.2): [Pt, Pt][] => {
  const n = Math.max(1, Math.ceil(dist(p, q) / step));
  const out: [Pt, Pt][] = [];
  let from: Pt | null = null;
  let last: Pt | null = null;
  const close = () => {
    if (from && last && dist(from, last) >= min) out.push([from, last]);
    from = last = null;
  };
  for (let i = 0; i <= n; i++) {
    const x = lerp(p, q, i / n);
    if (ok(x)) {
      from ??= x;
      last = x;
    } else close();
  }
  close();
  return out;
};
const seg = ([p, q]: [Pt, Pt]) => `M${pt(p)}L${pt(q)}`;
const f2 = (v: number) => v.toFixed(2);

// ---- the band ------------------------------------------------------------------
const RIM = 97.5;
const BAND_OUT = 94;
const BAND_IN = 81;
const BAND = (BAND_IN + BAND_OUT) / 2;
const SEAL = 7.2;
// The elements on the diagonals: those that rise (fire, air) above, those
// that sink (water, earth) below, upright on the page.
const ELEMENT_SEALS = [
  { a: 45, el: element(true, false, 4.3) },
  { a: 135, el: element(false, true, 4.3) },
  { a: 225, el: element(false, false, 4.3) },
  { a: 315, el: element(true, true, 4.3) },
].map((s) => ({ ...s, c: at(s.a, BAND) }));
const bandHoles: Hole[] = ELEMENT_SEALS.map(({ c }) => ({ c, r: SEAL + 1.2 }));
// Between the seals, the script nobody can read (lib/tongue).
const SCRIPT = (() => {
  const rnd = seeded(23);
  return ELEMENT_SEALS.flatMap(({ a }) => inscribe(a + 7.5, a + 90 - 7.5, BAND, rnd, 1.2));
})();

// ---- the two great rings -----------------------------------------------------------
// Each about a centre D either side, through the other's centre; a strap
// W either side of its line, the one beneath cut GAP clear of the one on
// top. The left passes over at the top, the right at the bottom.
const D = 25;
const RHO = 2 * D;
const W = 0.8;
const GAP = 0.7;
const LEFT: Pt = [-D, 0];
const RIGHT: Pt = [D, 0];
/** How far the rings' lines, and the seals' rings, keep anything else clear of them. */
const CLEAR = W + GAP + 0.6;
/** The stretches (degrees round `c`) of the circle `r` about `c` that pass under the other ring's strap (about `o`), at its crossing above (`side` -1) or below (1). */
const underCuts = (c: Pt, r: number, o: Pt, side: number): Cut[] => {
  const cuts: Cut[] = [];
  let from: number | null = null;
  for (let i = 0; i <= 7200; i++) {
    const a = i / 20;
    const p = atAbout(c, a, r);
    const under = Math.abs(dist(p, o) - RHO) < W + GAP && Math.sign(p[1]) === side;
    if (under) from ??= a;
    else if (from !== null) {
      cuts.push([from, a]);
      from = null;
    }
  }
  if (from !== null) cuts.push([from, 360]);
  return cuts;
};
const greatRing = (c: Pt, o: Pt, side: number, w: Wear) => [RHO + W, RHO - W].map((r) => joined(ringParts(c, r, { cuts: underCuts(c, r, o, side), wear: w }))).join('');
const inRing = (p: Pt, c: Pt) => dist(p, c) < RHO - CLEAR;
const outRing = (p: Pt, c: Pt) => dist(p, c) > RHO + CLEAR;

// ---- the great seals -----------------------------------------------------------
// Sol and Luna in the two rings' own halves, Mars above the pommel and
// Saturn below the point.
const BIG = 13;
const SMALL = 11;
const SOL: Pt = [2 * D, 0];
const LUNA_AT: Pt = [-2 * D, 0];
const MARS: Pt = [0, -64];
const SATURN: Pt = [0, 64];
const sealHoles: Hole[] = [
  { c: SOL, r: BIG + 1.4 },
  { c: LUNA_AT, r: BIG + 1.4 },
  { c: MARS, r: SMALL + 1.4 },
  { c: SATURN, r: SMALL + 1.4 },
];
const inHole = (p: Pt, holes: Hole[]) => holes.some(({ c, r }) => dist(p, c) < r);

// ---- the sword ---------------------------------------------------------------------
const POMMEL: Pt = [0, -36.4];
const POMMEL_R = 2.4;
const GRIP = { top: POMMEL[1] + POMMEL_R, bottom: -23.2, half: 1.25 };
const GUARD = { top: -23.2, bottom: -20.8, half: 14, end: 1.3 };
const BLADE = { top: GUARD.bottom, half: 3.2, shoulder: 27, narrow: 2.5, tip: 37 };
/** How wide the blade is at `y`, either side (0 off it). */
const bladeHalf = (y: number) => {
  if (y < BLADE.top || y > BLADE.tip) return 0;
  if (y <= BLADE.shoulder) return BLADE.half + ((BLADE.narrow - BLADE.half) * (y - BLADE.top)) / (BLADE.shoulder - BLADE.top);
  return (BLADE.narrow * (BLADE.tip - y)) / (BLADE.tip - BLADE.shoulder);
};
/** Whether `p` lies within the sword, or `m` of it. */
const inSword = ([x, y]: Pt, m: number) =>
  Math.abs(x) <= bladeHalf(Math.min(Math.max(y, BLADE.top), BLADE.tip)) + m && y >= BLADE.top - m && y <= BLADE.tip + m ||
  (Math.abs(x) <= GUARD.half + 2 * GUARD.end + m && y >= GUARD.top - m && y <= GUARD.bottom + m) ||
  (Math.abs(x) <= GRIP.half + m && y >= GRIP.top - m && y <= GRIP.bottom) ||
  dist([x, y], POMMEL) <= POMMEL_R + m;

const sword = (w: Wear): Inked => {
  const e = ink();
  // The blade's edges, worn, narrowing to the shoulder and then to the point.
  const edge = (s: number) => {
    const [a, b, c]: Pt[] = [
      [s * BLADE.half, BLADE.top],
      [s * BLADE.narrow, BLADE.shoulder],
      [0, BLADE.tip],
    ];
    return joined(lineParts(a, b, { wear: w })) + joined(lineParts(b, c, { wear: w }));
  };
  e.add('', edge(-1) + edge(1));
  // Its ridge down the middle, and lengthwise hatching down its right side,
  // each line running parallel to the edge and in to the ridge at the point.
  e.add('thin', `M0 ${BLADE.top}L0 ${BLADE.tip}`);
  e.add(
    'hatch',
    [0.25, 0.5, 0.75]
      .map((s) => {
        const [a, b]: Pt[] = [
          [s * BLADE.half, BLADE.top + 0.6],
          [s * BLADE.narrow, BLADE.shoulder],
        ];
        return `M${pt(a)}L${pt(b)}L${pt(lerp(b, [0, BLADE.shoulder + (BLADE.tip - BLADE.shoulder) * s], 0.85))}`;
      })
      .join(''),
  );
  // The guard, a bar ridged along its middle and hatched below it, ending in rings.
  const { top, bottom, half, end } = GUARD;
  e.add('', `M${-half} ${top}H${half}M${-half} ${bottom}H${half}`);
  e.add('thin', [-1, 1].map((s) => mapPath(circlePath(end), ([x, y]) => [x + s * (half + end), y + (top + bottom) / 2])).join(''));
  e.add('hair', `M${-half + 1} ${(top + bottom) / 2}H${half - 1}`);
  e.add('hatch', `M${-half + 1.5} ${f2(bottom - 0.4)}H${half - 1.5}M${-half + 2} ${f2(bottom - 0.8)}H${half - 2}`);
  // The grip, wrapped in slanting turns, and the pommel's double ring.
  e.add('thin', `M${-GRIP.half} ${f2(GRIP.top)}V${GRIP.bottom}M${GRIP.half} ${f2(GRIP.top)}V${GRIP.bottom}`);
  let wrap = '';
  for (let y = GRIP.top + 0.9; y < GRIP.bottom - 0.2; y += 0.9) wrap += `M${-GRIP.half} ${f2(y + 0.7)}L${GRIP.half} ${f2(y)}`;
  e.add('hatch', wrap);
  e.add('', mapPath(circlePath(POMMEL_R), ([x, y]) => [x + POMMEL[0], y + POMMEL[1]]));
  e.add('hair', mapPath(circlePath(POMMEL_R - 0.9), ([x, y]) => [x + POMMEL[0], y + POMMEL[1]]));
  return e.out;
};

// ---- the rings and what lies within the band ---------------------------------------
const rings = (w: Wear): Inked => {
  const e = ink();
  e.add('thin', greatRing(LEFT, RIGHT, 1, w) + greatRing(RIGHT, LEFT, -1, w));
  // The great seals: a double ring each, and its sign.
  const seal = (c: Pt, r: number, inner: number, signs: [string, string, number][]) => {
    const place = ([x, y]: Pt): Pt => [c[0] + x, c[1] + y];
    e.add('', mapPath(circlePath(r), place));
    e.add('hair', mapPath(circlePath(r - inner), place));
    for (const [d, cls, k] of signs) e.add(cls, mapPath(d, ([x, y]) => place([x * k, y * k]), 0, k));
  };
  seal(SOL, BIG, 1.7, [
    [circlePath(5) + circlePath(1.1), 'sign', 1],
    [SOL_RAYS, 'sign', 1],
  ]);
  seal(LUNA_AT, BIG, 1.6, [
    [LUNA, 'sign', 1],
    [LUNA_HATCH, 'hatch', 1],
  ]);
  seal(MARS, SMALL, 1.4, [[PLANET_SIGNS[4], 'sign', 1.7]]);
  seal(SATURN, SMALL, 1.4, [[PLANET_SIGNS[6], 'sign', 1.7]]);

  // Sol's glory: rays from his seal out across his half of the right ring, long and short in turn.
  let glory = '';
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * 360;
    const [first] = runs(atAbout(SOL, a, BIG + 1.6), atAbout(SOL, a, 30), (x) => inRing(x, RIGHT) && outRing(x, LEFT));
    if (first) glory += seg(k % 2 ? [first[0], lerp(first[0], first[1], 0.6)] : first);
  }
  // Luna's tide: rings about her seal, broken where her half of the left ring ends.
  let tide = '';
  for (let r = BIG + 2.6; r < 25; r += 1.7) {
    let from: number | null = null;
    for (let i = 0; i <= 1440; i++) {
      const a = i / 4;
      const ok = i < 1440 && inRing(atAbout(LUNA_AT, a, r), LEFT) && outRing(atAbout(LUNA_AT, a, r), RIGHT);
      if (ok) from ??= a;
      else if (from !== null) {
        if (a - from > 4) tide += arc(LUNA_AT, r, from, a - 0.25);
        from = null;
      }
    }
  }
  e.add('hair', glory + tide);

  // In the almond, a glory about the blade: rays out from the centre to
  // the rings, long and short in turn, clear of the sword.
  const almond = (x: Pt) => inRing(x, LEFT) && inRing(x, RIGHT) && !inSword(x, 1.6);
  let rays = '';
  for (let k = 0; k < 96; k++) {
    const a = ((k + 0.5) / 96) * 360;
    const long = runs(O, at(a, 50), almond, 2).sort((p, q) => dist(...q) - dist(...p))[0];
    if (long) rays += seg(k % 2 ? [long[0], lerp(long[0], long[1], 0.62)] : long);
  }
  e.add('hair', rays);

  // Above and below, outside both rings: rays out toward the band, stopping
  // short of the seals, long and short in turn.
  let outer = '';
  for (let k = 0; k < 120; k++) {
    const a = ((k + 0.5) / 120) * 360;
    const end = k % 2 ? BAND_IN - 7 : BAND_IN - 2.4;
    const [first] = runs(at(a, 40), at(a, end), (x) => outRing(x, LEFT) && outRing(x, RIGHT) && !inHole(x, [...sealHoles, ...bandHoles]), 0.6);
    // (Only where they have room to run: beside the rings they'd be ticks.)
    if (first && dist(...first) > 7) outer += seg(first);
  }
  e.add('hair', outer);
  return e.out;
};

// ---- the band ------------------------------------------------------------------------
const band = (w: Wear): Inked => {
  const e = ink();
  e.add('thin', joined(ringParts(O, RIM, { wear: w })));
  e.add('', joined(ringParts(O, BAND_OUT, { holes: bandHoles, wear: w })) + joined(ringParts(O, BAND_IN, { holes: bandHoles, wear: w })));
  for (const { c, el } of ELEMENT_SEALS) {
    const place = ([x, y]: Pt): Pt => [c[0] + x, c[1] + y];
    e.add('', mapPath(circlePath(SEAL), place));
    e.add('hair', mapPath(circlePath(SEAL - 1.2), place));
    e.add('sign', mapPath(el.lines, place));
    e.add('hatch', mapPath(el.shade, place));
  }
  for (const m of SCRIPT) {
    const turn = turned(m.a);
    e.add('sign', mapPath(m.d, (q) => turn([q[0], q[1] - BAND]), m.a));
  }
  return e.out;
};

/** The plate, worn (one seeded run through its lines, so every copy is worn alike). */
export const build = (): DuelPlate => {
  const w = wear(9);
  return { sword: sword(w), rings: rings(w), band: band(w) };
};

/** Where its parts lie, for the effects' sigil to draw them in (plate units, of its 200 across). */
export const DUEL = { tip: BLADE.tip, pommel: POMMEL[1] - POMMEL_R, reach: RIM };
