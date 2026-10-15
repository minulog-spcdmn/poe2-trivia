// The runs a device has made of one kind, alone or together, engraved as a
// cross-section of the rock (RunsChart.svelte, on the end of a Delve run):
// the ground across the top under a small Sol, and a shaft sunk from it for
// each run, oldest first, as deep as that run went. Deeper runs reach
// further down, as the descent itself does (lib/descentPlate: the pit in the
// lobby). The zones lie across it as strata, each boundary a hairline in the
// colour of the zone below it, and a zone's seal with its sigil
// (lib/zoneSigils) stands in the margin where there is room. A gold star
// marks the floor of your best run and a red one this run's (the lobby's
// stars: your deepest and your last); this run's walls are lit. A dotted
// level runs at the median of the runs shown, "usual" beside it.
//
// In the arcane style (docs/arcane-style.md): exact geometry in px, lines
// that stop short of every star and seal, the shafts shaded in one-sided
// hatching down their left wall (the light falls from the upper left, as on
// the cards), the earth under the ground hatched too, and a few nicks of
// wear on the main lines. Depths are as players count them (shownDepth).

import { at, line, ring, star8, wear, type Hole, type Pt } from './arcane.ts';
import { chartLayout, median } from './recap.ts';

export interface PlateRun {
  /** The depth the run reached, as shown. */
  depth: number;
  /** Its zone's accent (lib/descent accentAt). */
  accent: string;
}

export interface Shaft {
  x: number;
  /** Where its floor lies. */
  y: number;
  accent: string;
  /** This run: lit, drawn last. */
  now: boolean;
  /** The walls and the floor (worn), and the same unworn (for the glow). */
  lines: string;
  whole: string;
  shade: string;
}

export interface Star {
  c: Pt;
  r: number;
  kind: 'gold' | 'red';
  outline: string;
  ridges: string;
  hatch: string;
  glory: string;
  /** Its depth, written under it. */
  num: { x: number; y: number; text: string };
}

export interface Seal {
  c: Pt;
  r: number;
  accent: string;
  zone: number;
  ring: string;
}

export interface Plate {
  w: number;
  h: number;
  /** The plot's left edge and the ground's level. */
  x0: number;
  y0: number;
  ground: { main: string; hair: string; shade: string };
  sol: { c: Pt; r: number };
  strata: { d: string; accent: string }[];
  seals: Seal[];
  shafts: Shaft[];
  stars: Star[];
  usual: { d: string; label: Pt; depth: number };
}

/** The margin left of the plot (the zones' seals, Sol), and the room right of it for "usual". */
export const MARGIN = 24;
export const SIDE = 54;
/** Room over the ground for Sol (the ground's level from the drawing's top: what stands beside it lines up with it), and under the deepest floor for its depth. */
export const GROUND_Y = 16;
const TOP = GROUND_Y;
const FOOT = 26;
const STAR_R = 6.2;
/** The widest a shaft is. */
const SHAFT_MAX = 18;
const GLORY = 10;
/** A zone's seal in the margin, when its band is tall enough to hold one. */
const SEAL_R = 7.5;

/**
 * The plate for `runs` (oldest first, this run last), `height` tall in all
 * (labels included), the shafts across `width`, `best` the index of the
 * deepest run (this one, if it is). `zoneAccent(k)` is zone k's colour
 * (k from 0, the Mines).
 */
export function runsPlate(runs: PlateRun[], best: number, width: number, height: number, zoneAccent: (k: number) => string): Plate {
  const n = runs.length;
  // Narrow shafts, however few the runs (wide ones read as buckets), spread over the width.
  const lay = chartLayout(n, width);
  const col = Math.min(lay.col, SHAFT_MAX);
  const gap = n > 1 ? Math.min(30, (width - n * col) / (n - 1)) : 0;
  const x0 = MARGIN;
  const y0 = TOP;
  const deepest = Math.max(1, ...runs.map((r) => r.depth));
  const bottom = height - FOOT;
  /** The level of a depth: the ground at 0, the deepest run's floor at the foot. */
  const y = (d: number) => y0 + (d / deepest) * (bottom - y0);
  const worn = wear(17);
  const now = n - 1;

  // The stars: on the floor of your best run (gold) and of this one (red; one gold star when this one is the best).
  const stars: Star[] = [];
  const starAt = (i: number, kind: Star['kind']): Star => {
    const c: Pt = [x0 + i * (col + gap) + col / 2, y(runs[i].depth)];
    const s = star8(c, STAR_R);
    const glory = Array.from({ length: 16 }, (_, k) => {
      const a = k * 22.5 + 11.25;
      return line(at(c, a, STAR_R * 0.62 + 1.4), at(c, a, k % 2 ? GLORY - 2 : GLORY));
    }).join('');
    return { c, r: STAR_R, kind, ...s, glory, num: { x: c[0], y: c[1] + GLORY + 11, text: String(runs[i].depth) } };
  };
  if (best !== now) stars.push(starAt(best, 'gold'));
  stars.push(starAt(now, best === now ? 'gold' : 'red'));
  const holes: Hole[] = stars.map((s) => ({ c: s.c, r: GLORY + 1 }));

  // The shafts: two walls down from the ground and a floor, the left wall's side hatched.
  const shafts: Shaft[] = runs.map((r, i) => {
    const x = x0 + i * (col + gap);
    const yd = y(r.depth);
    const left: [Pt, Pt] = [
      [x, y0],
      [x, yd],
    ];
    const right: [Pt, Pt] = [
      [x + col, y0],
      [x + col, yd],
    ];
    const floor: [Pt, Pt] = [
      [x, yd],
      [x + col, yd],
    ];
    // Worn on a long wall only: a short one would be all nicks.
    const lines = [left, right, floor].map(([p, q]) => line(p, q, { holes, wear: Math.abs(q[1] - p[1]) > 90 ? worn : null })).join('');
    const whole = [left, right, floor].map(([p, q]) => line(p, q, { holes })).join('');
    // Shading down the left wall: strokes at 45°, a strip a third of the shaft wide (at most 6 px).
    const s = Math.min(6, col * 0.38);
    let shade = '';
    for (let yy = y0 + s + 2; yy < yd - 1; yy += 2.6) shade += line([x + 1, yy], [x + 1 + s, yy - s], { holes });
    return { x, y: yd, accent: r.accent, now: i === now, lines, whole, shade };
  });

  // The ground: a line broken at each shaft's mouth, a hairline over it, the earth under it hatched between the shafts.
  const mouths = shafts.map((s) => [s.x, s.x + col] as [number, number]);
  const span = (a: number, b: number, yy: number) => {
    const cuts = mouths.map(([u, v]): [number, number] => [(u - a) / (b - a), (v - a) / (b - a)]);
    return line([a, yy], [b, yy], { cuts, wear: worn });
  };
  const right = x0 + width;
  const groundMain = span(x0 - 6, right + 4, y0);
  const groundHair = line([x0 - 6, y0 - 2.2], [right + 4, y0 - 2.2]);
  let groundShade = '';
  for (let x = x0 - 3; x <= right + 4; x += 2.4) {
    if (mouths.some(([u, v]) => x > u - 0.5 && x - 4 < v + 0.5)) continue;
    groundShade += line([x, y0 + 1.2], [x - 4, y0 + 5.2]);
  }

  // The zones: a hairline at each boundary within reach, in the colour of the zone below it, broken at the shafts.
  const strata: Plate['strata'] = [];
  const seals: Seal[] = [];
  for (let k = 0; k * 10 <= deepest; k++) {
    if (k > 0) {
      const yy = y(k * 10);
      const cuts = mouths.map(([u, v]): [number, number] => [(u - 1 - (x0 - 2)) / (right - x0 + 2), (v + 1 - (x0 - 2)) / (right - x0 + 2)]);
      strata.push({ d: line([x0 - 2, yy], [right, yy], { cuts, holes }), accent: zoneAccent(k) });
    }
    // Its seal in the margin, in the middle of its band, where the band holds one.
    const top = y(k * 10);
    const foot = Math.min(bottom, y((k + 1) * 10));
    if (foot - top >= 2 * SEAL_R + 4) {
      const c: Pt = [MARGIN / 2 - 1, (top + foot) / 2];
      seals.push({ c, r: SEAL_R, accent: zoneAccent(k), zone: k, ring: ring(c, SEAL_R) + ring(c, SEAL_R - 1.2) });
    }
  }

  // The usual depth: a dotted level across the shafts, its word beside them.
  const usual = median(runs.map((r) => r.depth));
  const uy = y(usual);

  return {
    w: x0 + width + SIDE,
    h: height,
    x0,
    y0,
    ground: { main: groundMain, hair: groundHair, shade: groundShade },
    sol: { c: [MARGIN / 2 - 1, y0 - 8], r: 4.2 },
    strata,
    seals,
    shafts,
    stars,
    usual: { d: line([x0 - 2, uy], [right + 2, uy], { holes }), label: [right + 7, uy + 4], depth: usual },
  };
}
