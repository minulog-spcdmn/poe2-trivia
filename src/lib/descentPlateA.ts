// Plate A of the descent (components/descent/PlateA.svelte): Delve drawn as
// a mine surveyor's section, the way an old engraved plate draws a mine. A
// headframe and its winding wheel stand at the surface; the shaft drops past
// one level for each zone (the depth it starts at beside it, the clock there
// at its end), and below the tenth it runs on out of the plate. A level the
// player has reached is driven and named; one they haven't is only the
// surveyor's dashed line through the rock. The cage hangs on its rope at the
// player's deepest depth. The finds run down beside the levels as seams from
// the depth where each first turns up, keyed to a caption by their icons.
//
// Everything is laid out in CSS pixels for the card's width, so the text
// stays at its real size: one column on a phone, the caption beside the
// section once the card is wide.

import { at, f, line, pt, ring, type Pt } from './arcane.ts';
import { DELVE_MAX_BLASTS, DELVE_MAX_DYNAMITE, DELVE_MAX_FLARES, DELVE_MAX_WARDS, FIND_FADE_FROM, FINDS, FLARE_MS, SHARDS_PER_WARD, findLosses, shownDepth, type FindKind } from './delve.ts';
import { STRATA, accentAt, stratumName } from './descent.ts';

/** The zones, each ten depths: the levels drawn. */
export const LEVELS = STRATA.length;
/** The first depth (as shown) past the last zone, where the endless deep begins. */
export const ENDLESS_FROM = LEVELS * 10;

/** Width from which the caption stands beside the section. */
export const WIDE_FROM = 440;

export interface PlateLayout {
  /** The card's width, and whether the caption stands beside the section. */
  w: number;
  wide: boolean;
  /** The section's size. */
  dw: number;
  dh: number;
  /** The ground line, and the shaft's collar on it. */
  ground: number;
  /** Height of one level's band, the first band's top, and the top of the endless deep. */
  band: number;
  top0: number;
  deep: number;
  /** Where the level numbers end (right aligned). */
  numX: number;
  /** The shaft's walls, and its middle (the rope). */
  shaft: [number, number];
  sc: number;
  /** Where a level's name starts, and how far its chamber's face may reach. */
  nameX: number;
  faceMax: number;
  /** A chamber's width. */
  cw: number;
  /** The finds' seams, in the order they first turn up. */
  lanes: number[];
  /** The winding wheel: its centre and radius. */
  wheel: { c: Pt; r: number };
}

/** Room a level's name takes at most (the widest zone name at 10 px, with a little to spare). */
const NAME_ROOM = 94;

/** The layout for a card `w` px wide. */
export function layoutFor(w: number): PlateLayout {
  const width = Math.max(240, Math.round(w));
  const wide = width >= WIDE_FROM;
  const dw = wide ? Math.max(248, Math.round(width * 0.55)) : width;
  const [ground, band, endless] = wide ? [40, 21, 44] : [38, 18, 36];
  const top0 = ground + 4;
  const deep = top0 + LEVELS * band;
  const dh = deep + endless;
  const shaft: [number, number] = [30, 58];
  const sc = (shaft[0] + shaft[1]) / 2;
  const lane = 11;
  const lanes = [dw - 3 * lane - 1, dw - 2 * lane - 1, dw - lane - 1];
  const wr = 12;
  return {
    w: width,
    wide,
    dw,
    dh,
    ground,
    band,
    top0,
    deep,
    numX: shaft[0] - 6,
    shaft,
    sc,
    nameX: shaft[1] + 6,
    faceMax: lanes[0] - 10,
    cw: 20,
    lanes,
    wheel: { c: [sc + wr, wr + 3], r: wr },
  };
}

/** The top of level `k`'s band (LEVELS: the endless deep's). */
export const bandTop = (L: PlateLayout, k: number) => L.top0 + k * L.band;

export interface Drift {
  /** The band's top. */
  t: number;
  /** The tunnel's roof and floor. */
  roof: number;
  floor: number;
  /** The chamber at its face: its top, and its two sides. */
  top: number;
  x0: number;
  face: number;
  /** Baseline of the name over the tunnel. */
  base: number;
}

/** How far each level's drift reaches into the room it has, 0 to 1: unevenly, as real workings do. */
const REACH = [0.25, 0.6, 0.1, 0.85, 0.45, 1, 0.3, 0.7, 0.05, 0.55];

/**
 * Level `k`'s drift: a tunnel from the shaft, its name written over it,
 * and a chamber at its face, each level reaching its own way into the
 * rock; the endless deep's furthest.
 */
export function driftOf(L: PlateLayout, k: number): Drift {
  const t = bandTop(L, k);
  const floor = t + L.band - 2.5;
  const roof = floor - 5.5;
  const faceMin = Math.min(L.faceMax, L.nameX + NAME_ROOM + 6 + L.cw);
  const face = Math.round(k >= LEVELS ? L.faceMax : faceMin + (L.faceMax - faceMin) * REACH[k % REACH.length]);
  return { t, roof, floor, top: t + 2.5, x0: face - L.cw, face, base: roof - 2.5 };
}

/**
 * How far down the endless deep a depth `s` (as shown, from ENDLESS_FROM)
 * hangs, 0 to 1: a little less with every depth, so it never reaches the
 * bottom however deep.
 */
export const endlessT = (s: number) => 1 - 1 / (1 + Math.max(0, s - ENDLESS_FROM) / 60);

/** The cage's top limit and bottom limit in the endless deep (its middle). */
const endlessRange = (L: PlateLayout): [number, number] => [L.deep + L.band / 2, L.dh - 9];

/** Half the cage's height: inside a level it stays wholly within the level's band. */
export const CAGE_HALF = 5.5;

/**
 * Where the cage's middle hangs for a deepest depth `s` as shown (null: no
 * run yet, at the collar). Inside a level the ten depths share its drift's
 * height, so the first depth of a zone is already well inside its level.
 */
export function depthY(L: PlateLayout, s: number | null): number {
  if (s === null || !Number.isFinite(s)) return L.ground - CAGE_HALF - 2;
  const d = Math.max(0, Math.floor(s));
  if (d < ENDLESS_FROM) {
    const k = Math.floor(d / 10);
    const t = bandTop(L, k);
    return t + CAGE_HALF + 0.5 + ((d - 10 * k) / 9) * (L.band - 2 * CAGE_HALF - 1);
  }
  const [lo, hi] = endlessRange(L);
  return lo + (hi - lo) * endlessT(d);
}

/**
 * Where the known rock ends for a deepest `s` as shown: under the deepest
 * level reached, or in the endless deep just under the cage. Below it the
 * rock is cross-hatched, dark.
 */
export function frontierY(L: PlateLayout, s: number | null): number {
  if (s === null || !Number.isFinite(s)) return L.ground;
  const d = Math.max(0, Math.floor(s));
  if (d < ENDLESS_FROM) return bandTop(L, Math.floor(d / 10) + 1);
  return Math.min(L.dh, depthY(L, d) + 8);
}

/**
 * Whether the cage, at a deepest `s` past the levels, still hangs in the
 * endless deep's first row (which then carries its stratum's name), rather
 * than further down among the strata (where the name rides beside it).
 */
export const inEndlessRow = (L: PlateLayout, s: number) => depthY(L, s) + CAGE_HALF <= L.deep + L.band;

/** The level a shown depth is on (LEVELS for the endless deep), or null. */
export const levelOf = (s: number | null) => (s === null ? null : Math.min(LEVELS, Math.floor(Math.max(0, s) / 10)));

export interface Level {
  k: number;
  /** The depth (as shown) the level starts at. */
  from: number;
  reached: boolean;
  /** Only once reached: its name and its colour. */
  name: string | null;
  color: string | null;
}

/** The ten levels for a deepest depth `s` as shown (null: no run yet). */
export function levelsFor(s: number | null): Level[] {
  return Array.from({ length: LEVELS }, (_, k) => {
    const reached = s !== null && s >= 10 * k;
    return { k, from: 10 * k, reached, name: reached ? stratumName(k) : null, color: reached ? accentAt(10 * k + 1) : null };
  });
}

/** The endless deep for a deepest `s` as shown: once reached, the stratum the deepest lies in, named. */
export function endlessFor(s: number | null): Level {
  const reached = s !== null && s >= ENDLESS_FROM;
  const k = reached ? Math.floor(s / 10) : LEVELS;
  return { k, from: ENDLESS_FROM, reached, name: reached ? stratumName(k) : null, color: reached ? accentAt(s + 1) : null };
}

// ---- drawing ----------------------------------------------------------------

/** A closed polygon. */
const poly = (ps: Pt[]) => 'M' + ps.map(pt).join('L') + 'Z';

/**
 * The headframe over the shaft: two timber legs from either side of the
 * collar up to the wheel's axle, cross ties, a back stay, the wheel (a double
 * rim, a hub and eight spokes) and the rope off its far side down to the
 * winding drum in its house.
 */
export function headframe(L: PlateLayout) {
  const { c, r } = L.wheel;
  const g = L.ground;
  const [s0, s1] = L.shaft;
  // A tower of two posts either side of the collar, braced, its cap under the wheel's axle.
  const cap = c[1] + r * 0.55;
  const [p0, p1] = [s0 - 2, Math.max(s1 + 2, c[0] + 3)];
  const ties = [g - 9, cap + (g - 9 - cap) / 2];
  let timber = line([p0, g], [p0, cap]) + line([p1, g], [p1, cap]) + line([p0 - 2, cap], [p1 + 2, cap]);
  for (const y of ties) timber += line([p0, y], [p1, y]);
  // Braces crossing between the ties, and between the upper tie and the cap.
  timber += line([p0, ties[0]], [p1, ties[1]]) + line([p1, ties[0]], [p0, ties[1]]);
  timber += line([p0, ties[1]], [p1, cap]) + line([p1, ties[1]], [p0, cap]);
  // The axle's bearing on the cap, and a back stay to the ground.
  timber += line([c[0] - 2, cap], c) + line([c[0] + 2, cap], c);
  timber += line([p1, cap], [p1 + (g - cap) * 0.55, g]);
  // The winding house: a drum in a shed with a pitched roof.
  const hx = p1 + (g - cap) * 0.55 + 8;
  const house: Pt[] = [[hx, g], [hx, g - 12], [hx + 13, g - 19], [hx + 26, g - 12], [hx + 26, g]];
  const drum: Pt = [hx + 13, g - 7];
  const dr = 3.6;
  // The rope leaves the wheel's top and runs to the drum's top.
  const top = at(c, 0, r);
  let spokes = '';
  for (let i = 0; i < 8; i++) spokes += line(at(c, i * 45 + 22.5, 1.9), at(c, i * 45 + 22.5, r - 1.6));
  return {
    timber,
    wheel: ring(c, r) + ring(c, r - 1.4) + ring(c, 1.5) + spokes,
    rope: line(top, [drum[0], drum[1] - dr]),
    house: 'M' + house.map(pt).join('L') + line([hx - 1.5, g - 11.2], [hx + 13, g - 19.6]) + line([hx + 13, g - 19.6], [hx + 27.5, g - 11.2]),
    drum: ring(drum, dr) + ring(drum, 1),
    houseRight: hx + 26,
  };
}

/** The ground: a line across the plate, broken over the shaft's collar, and short strokes of turf along it. */
export function groundLine(L: PlateLayout) {
  const g = L.ground;
  const [s0, s1] = L.shaft;
  let turf = '';
  for (let x = 4; x < L.dw - 3; x += 7) {
    if (x > s0 - 3 && x < s1 + 3) continue;
    turf += line([x, g + 1.2], [x - 2.2, g + 3.6]);
  }
  return { line: line([0, g], [s0 - 1, g]) + line([s1 + 1, g], [L.dw, g]), turf };
}

/** The shaft: its walls from the collar down out of the plate, and a timber set across it at every level. */
export function shaftLines(L: PlateLayout) {
  const [s0, s1] = L.shaft;
  let sets = '';
  for (let k = 0; k <= LEVELS; k++) {
    const y = bandTop(L, k);
    sets += line([s0, y], [s1, y]);
  }
  return { walls: line([s0, L.ground], [s0, L.dh]) + line([s1, L.ground], [s1, L.dh]), sets };
}

/**
 * A level's drift: the tunnel's roof and floor from the shaft to its
 * chamber, the chamber round to the face, and (`timbered`, once driven) a
 * timber set across the tunnel every so often.
 */
export function driftPath(L: PlateLayout, k: number, timbered: boolean) {
  const { roof, floor, top, x0, face } = driftOf(L, k);
  const s1 = L.shaft[1];
  const outline = line([s1, roof], [x0, roof]) + 'M' + [[x0, roof], [x0, top], [face, top], [face, floor], [s1, floor]].map((p) => pt(p as Pt)).join('L');
  let sets = '';
  if (timbered) for (let x = s1 + 14; x < x0 - 6; x += 22) sets += line([x, roof], [x, floor]);
  return { outline, sets };
}

/** The endless deep: strata below the last level, closer and closer, every ten depths as far as they can be told apart. */
export function strataLines(L: PlateLayout) {
  const [lo, hi] = [L.deep + L.band, L.dh];
  const out: { y: number; d: string }[] = [];
  let last = -Infinity;
  for (let s = ENDLESS_FROM + 10; s < 100_000; s += 10) {
    const y = lo + (hi - lo) * endlessT(s);
    if (y > L.dh - 3) break;
    if (y - last < 3) continue;
    last = y;
    out.push({ y, d: line([L.shaft[1] + 4, y], [L.faceMax, y]) });
  }
  return out;
}

/**
 * The rock's hatching: strokes rising to the right across the section below
 * the ground, `gap` apart, or (`fall`) falling to the right, to cross them
 * where the rock is still dark (the plate's mask keeps them out of the
 * drifts, the shaft and the writing).
 */
export function rockHatch(L: PlateLayout, gap = 6, fall = false) {
  let d = '';
  const X = (x: number) => (fall ? L.dw - x : x);
  const top = L.ground + 1;
  const h = L.dh - top;
  for (let x = -h; x < L.dw; x += gap) {
    // From the bottom edge at x to the top edge at x + h, cut to the plate.
    let [ax, ay, bx, by] = [x, L.dh, x + h, top];
    if (ax < 0) [ax, ay] = [0, L.dh + ax];
    if (bx > L.dw) [bx, by] = [L.dw, top + (bx - L.dw)];
    if (ay - by > 1) d += `M${f(X(ax))} ${f(ay)}L${f(X(bx))} ${f(by)}`;
  }
  return d;
}

/** The plate mark: a frame round the section, open at the bottom where the shaft runs on. */
export function frame(L: PlateLayout) {
  const [s0, s1] = L.shaft;
  const [x0, y0, x1, y1] = [0.5, 0.5, L.dw - 0.5, L.dh - 0.5];
  return line([s0 - 3, y1], [x0, y1]) + line([x0, y1], [x0, y0]) + line([x0, y0], [x1, y0]) + line([x1, y0], [x1, y1]) + line([x1, y1], [s1 + 3, y1]);
}

/** The cage: a box hanging from a bale on the rope, its middle at 0, sized to the shaft. */
export function cage(L: PlateLayout) {
  const half = (L.shaft[1] - L.shaft[0]) / 2 - 1.5;
  const [t, b] = [-CAGE_HALF, CAGE_HALF];
  const bale: Pt = [0, t - 4];
  return {
    box: poly([[-half, t], [half, t], [half, b], [-half, b]]),
    // A deck under it.
    deck: line([-half - 1, b + 1.2], [half + 1, b + 1.2]),
    bale: line([-half + 2, t], bale) + line([half - 2, t], bale),
    ropeFrom: bale[1],
    half,
  };
}

// ---- the finds ----------------------------------------------------------------

export const FIND_GLYPH = { azurite: 'ward', flare: 'flare', dynamite: 'dynamite' } as const;

/** The finds that turn up, in the order they first do: their kind and the depth (as shown) they start at. */
export const SEAMS: { kind: FindKind; from: number }[] = FINDS.filter((f) => f.cap > 0)
  .map((f) => ({ kind: f.kind, from: shownDepth(f.from) }))
  .sort((a, b) => a.from - b.from);

/** The depth (as shown) past which the finds grow scarcer. */
export const SCARCER_FROM = shownDepth(FIND_FADE_FROM) + 1;

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (n: number) => WORDS[n] ?? String(n);
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${word(n)} times`);
const carry = [DELVE_MAX_WARDS, DELVE_MAX_FLARES, DELVE_MAX_DYNAMITE];

/** The caption: what a find is, then each find (its name, then what it gives and what it risks), then what holds for all of them. */
export const CAPTION = {
  lead: 'Some cards hold a find: a harder question that wins an item.',
  finds: {
    azurite: {
      name: 'Azurite Vein',
      text: `Answer in the first half for a ward, which takes a lost life for you; later, a shard (${word(SHARDS_PER_WARD)} make a ward). A miss costs ${word(findLosses('azurite'))} lives.`,
    },
    dynamite: {
      name: 'Dynamite Cache',
      text: `Dynamite blasts a question away for a new one, by hand or by itself when time runs out; ${times(DELVE_MAX_BLASTS)} a depth at most. A miss also blows up an item you carry.`,
    },
    flare: {
      name: 'Flare Cache',
      text: `A flare adds ${word(FLARE_MS / 1000)} seconds when your time runs out. Its own question gives you less time.`,
    },
  } satisfies Record<FindKind, { name: string; text: string }>,
  after: `Flares and dynamite don't work on a find. Carry ${carry.every((n) => n === carry[0]) ? word(carry[0]) : 'a few'} of each at most; from ${SCARCER_FROM} on, finds grow scarcer.`,
};

/**
 * A find's seam down its lane at `x`: a hairline from `y0` to `y1`, and a
 * small crystal of it on every level it turns up on (`marks`, their middles).
 */
export function seamMarks(x: number, marks: number[], w = 1.6, h = 3) {
  return marks.map((y) => poly([[x, y - h], [x + w, y], [x, y + h], [x - w, y]])).join('');
}
