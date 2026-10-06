// The ornament each zone's mark (lib/zoneMark) carries off its two points,
// echoing what the backdrop shows of that zone (lib/descent's environments):
// the Mines' lamps, Magma Fissure's glowing cracks, Frozen Hollow's frost,
// Fungal Caverns' glowing caps, Vaal Outpost's gold shafts, the Abyssal
// Depths' eddies, the Petrified Forest's stone boughs in mist, the Sulphur
// Vents' vapour, the Abyssal City's far lights and the Primeval Ruins'
// white fire. Engraved as the alchemist's circle is (docs/arcane-style.md):
// exact geometry, fine lines, one-sided hatching, a few points of light
// with a soft glow under them, no text.
//
// Drawn for the left point at the origin, running out to the left (x < 0)
// for `L` px, within about `s` (half the mark's height) above and below; the
// right one is its mirror. Each stroke says how far out it starts (0 to 1),
// so the pen can run outward along the ornament.

import type { Pt } from './arcane.ts';

/** main: a gold line; hair: a fine one; hatch: shading; ember: a line that glows (a crack, a flame's ridge). */
export type OrnamentKind = 'main' | 'hair' | 'hatch' | 'ember';
export type Ornament = {
  strokes: { d: string; kind: OrnamentKind; at: number }[];
  /** Points of light: a lamp, a cap's glow, a far window. */
  lights: { c: Pt; r: number; at: number }[];
};

const f = (v: number) => v.toFixed(2);
const path = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
const rad = (a: number) => (a * Math.PI) / 180;

function build(L: number, s: number, draw: (o: Draw) => void): Ornament {
  const out: Ornament = { strokes: [], lights: [] };
  const at = (p: Pt) => Math.min(1, Math.max(0, -p[0] / L));
  const o: Draw = {
    L,
    s,
    line: (pts, kind = 'main') => out.strokes.push({ d: path(pts), kind, at: at(pts[0]) }),
    light: (c, r) => out.lights.push({ c, r, at: at(c) }),
  };
  draw(o);
  return out;
}
type Draw = {
  L: number;
  s: number;
  line: (pts: Pt[], kind?: OrnamentKind) => void;
  light: (c: Pt, r: number) => void;
};

/** Points along an arc about `c` of radius `r` from `a0` to `a1` degrees (0 to the right, clockwise on screen). */
const arcPts = (c: Pt, r: number, a0: number, a1: number, n = 24): Pt[] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = rad(a0 + ((a1 - a0) * k) / n);
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  });

/** Lines across the triangle `o`, `l`, `t`, parallel to its side `o`-`t`, about `gap` apart. */
function hatch(d: Draw, o: Pt, l: Pt, t: Pt, gap: number) {
  const n = Math.floor(Math.hypot(l[0] - o[0], l[1] - o[1]) / gap);
  for (let i = 1; i <= n; i++) {
    const k = i / (n + 1);
    d.line(
      [
        [o[0] + (l[0] - o[0]) * k, o[1] + (l[1] - o[1]) * k],
        [t[0] + (l[0] - t[0]) * k, t[1] + (l[1] - t[1]) * k],
      ],
      'hatch',
    );
  }
}

/** The Mines: a lamp on a rod, its glass a lozenge with a flame of light inside. */
const lamp = (d: Draw) => {
  const { L, s } = d;
  const [a, b, c] = [-L * 0.4, -L * 0.6, -L * 0.8];
  d.line([[-1.5, 0], [a, 0]]);
  d.line([[a, 0], [b, -s * 0.62], [c, 0], [b, s * 0.62], [a, 0]]);
  d.line([[a - 2, 0], [b, -s * 0.36], [c + 2, 0], [b, s * 0.36], [a - 2, 0]], 'hair');
  d.line([[c, 0], [-L * 0.94, 0]], 'hair');
  d.line(arcPts([-L * 0.94 - 1.3, 0], 1.3, 0, 360, 16), 'hair');
  d.light([b, 0], 1.3);
};

/** Magma Fissure: a crack running out from the point, its zigzag narrowing, one fork, glowing within. */
const cracks = (d: Draw) => {
  const { L, s } = d;
  const n = 7;
  const pts: Pt[] = Array.from({ length: n + 1 }, (_, k) => [-1.5 - (L - 1.5) * (k / n), k === 0 ? 0 : (k % 2 ? -1 : 1) * s * 0.5 * (1 - k / (n + 2))]);
  d.line(pts, 'ember');
  const fork = pts[3];
  d.line([fork, [fork[0] - L * 0.16, fork[1] - s * 0.45], [fork[0] - L * 0.28, fork[1] - s * 0.4]], 'ember');
  // The crack's lips, a hair either side of its first stretch.
  d.line(pts.slice(0, 4).map(([x, y]) => [x, y - 1.6] as Pt), 'hair');
};

/**
 * Frozen Hollow: an ice crystal growing out from the point: a spine with
 * three pairs of branches at 60°, each shorter than the last and the first
 * forking again, ending in a small hexagonal crystal.
 */
const frost = (d: Draw) => {
  const { L, s } = d;
  const hexR = Math.min(s * 0.42, L * 0.08);
  const end: Pt = [-L + hexR, 0];
  d.line([[-1.5, 0], [end[0] + hexR, 0]]);
  d.line([...Array.from({ length: 6 }, (_, k) => [end[0] + hexR * Math.cos(rad(k * 60)), hexR * Math.sin(rad(k * 60))] as Pt), [end[0] + hexR, 0]]);
  [0.3, 0.52, 0.7].forEach((t, i) => {
    const x = -L * t;
    const len = s * (0.95 - i * 0.25);
    for (const v of [-1, 1]) {
      const dir: Pt = [-Math.cos(rad(60)), v * Math.sin(rad(60))];
      const tip: Pt = [x + dir[0] * len, dir[1] * len];
      d.line([[x, 0], tip], i === 0 ? 'main' : 'hair');
      if (i === 0) {
        // A twig off the branch, parallel to the spine.
        const mid: Pt = [x + dir[0] * len * 0.5, dir[1] * len * 0.5];
        d.line([mid, [mid[0] - len * 0.38, mid[1]]], 'hair');
      }
    }
  });
};

/** Fungal Caverns: caps on a creeping stem, up and down in turn, each with its gills and a glow under it. */
const caps = (d: Draw) => {
  const { L, s } = d;
  d.line([[-1.5, 0], [-L * 0.92, 0]], 'hair');
  [
    [0.3, -1, 0.62],
    [0.55, 1, 0.5],
    [0.78, -1, 0.4],
  ].forEach(([t, v, k]) => {
    const x = -L * t;
    const r = s * k;
    const stalk = s * 0.22;
    const base: Pt = [x, v * stalk];
    d.line([[x, 0], base], 'hair');
    // The dome, turned away from the stem.
    d.line(arcPts(base, r, v < 0 ? 180 : 0, v < 0 ? 360 : 180), 'main');
    d.line([[x - r, v * stalk], [x + r, v * stalk]], 'main');
    for (const g of [-0.5, 0, 0.5]) d.line([[x + g * r, v * stalk], [x + g * r * 1.3, v * (stalk + r * 0.55)]], 'hatch');
    d.light([x, v * (stalk + r * 0.3)], 0.9);
  });
};

/**
 * Vaal Outpost: a stepped pyramid standing on the line, shafts of light
 * falling on it at a slant from above, hatched down their sun side.
 */
const shafts = (d: Draw) => {
  const { L, s } = d;
  d.line([[-1.5, 0], [-L, 0]], 'hair');
  // The pyramid: three steps, its foot from 0.3 to 0.78 of the way out, a stair up its middle.
  const [x0, x1] = [-L * 0.3, -L * 0.78];
  const w = x0 - x1;
  const side = (x: number, v: number): Pt[] => [0, 1, 2].flatMap((i) => [[x - v * w * 0.16 * i, -s * 0.28 * i] as Pt, [x - v * w * 0.16 * i, -s * 0.28 * (i + 1)] as Pt]);
  d.line([...side(x0, 1), ...side(x1, -1).reverse()]);
  const mid = (x0 + x1) / 2;
  for (const v of [-1, 1]) d.line([[mid + v, 0], [mid + v, -s * 0.84]], 'hatch');
  // The shafts: falling from above and outside toward the pyramid, beside it on the line.
  for (let k = 0; k < 4; k++) {
    const x = -L * (0.12 + k * 0.05);
    d.line([[x - s * 0.55, -s * 1.05], [x, -0.8]], 'hatch');
  }
  for (let k = 0; k < 2; k++) {
    const x = -L * (0.8 + k * 0.05);
    d.line([[x - s * 0.55, -s * 1.05], [x, -0.8]], 'hatch');
  }
  d.light([mid, -s * 1.05], 0.6);
};

/** Abyssal Depths: an eddy, the line running out and curling in on itself, a hair inside it for its first turn. */
const eddy = (d: Draw) => {
  const { L, s } = d;
  const R = Math.min(s * 0.95, L * 0.26);
  const c: Pt = [-L + R + 1, 0];
  d.line([[-1.5, 0], [c[0] + R, 0]]);
  const spiral = (r0: number, turns: number): Pt[] =>
    Array.from({ length: 80 }, (_, k) => {
      const t = k / 79;
      const a = rad(-turns * 360 * t);
      const r = r0 * (1 - 0.82 * t);
      return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
    });
  d.line(spiral(R, 1.7));
  d.line(spiral(R - 1.4, 0.8), 'hair');
  // A smaller eddy turning the other way, under the line.
  const c2: Pt = [-L * 0.36, s * 0.42];
  d.line(
    Array.from({ length: 40 }, (_, k) => {
      const t = k / 39;
      const a = rad(180 + 1.2 * 360 * t);
      const r = s * 0.4 * (1 - 0.75 * t);
      return [c2[0] + r * Math.cos(a), c2[1] + r * Math.sin(a)] as Pt;
    }),
    'hair',
  );
};

/** Petrified Forest: a stone bough, its twigs forking at fixed angles, with layers of mist drifting across. */
const boughs = (d: Draw) => {
  const { L, s } = d;
  d.line([[-1.5, 0], [-L * 0.95, 0]]);
  [
    [0.28, -1, 1],
    [0.5, 1, 0.85],
    [0.7, -1, 0.65],
  ].forEach(([t, v, k]) => {
    const p: Pt = [-L * t, 0];
    const len = s * k;
    const tip: Pt = [p[0] - len * Math.cos(rad(38)), v * len * Math.sin(rad(38)) * 1.35];
    d.line([p, tip]);
    const m: Pt = [(p[0] + tip[0]) / 2, (p[1] + tip[1]) / 2];
    d.line([m, [m[0] - len * 0.4, m[1] - v * len * 0.12]], 'hair');
  });
  d.line([[-L * 0.12, s * 0.82], [-L * 0.62, s * 0.82]], 'hair');
  d.line([[-L * 0.4, -s * 0.9], [-L * 0.98, -s * 0.9]], 'hair');
};

/** Sulphur Vents: wisps of vapour drifting out and up, each fainter and finer than the last. */
const vapour = (d: Draw) => {
  const { L, s } = d;
  [
    [0, s * 0.3, 'main'],
    [0.6, -s * 0.1, 'hair'],
    [1.3, s * 0.65, 'hair'],
  ].forEach(([phase, y0, kind]) => {
    const pts: Pt[] = Array.from({ length: 48 }, (_, k) => {
      const t = k / 47;
      const x = -1.5 - (L - 1.5) * t;
      return [x, (y0 as number) - s * 0.55 * t + s * 0.28 * (1 - t * 0.5) * Math.sin(2 * Math.PI * 1.5 * t + (phase as number))];
    });
    d.line(pts, kind as OrnamentKind);
  });
};

/** Abyssal City: a skyline of spires on a line of still water, their reflections below in hair, a few far lights. */
const skyline = (d: Draw) => {
  const { L, s } = d;
  d.line([[-1.5, 0], [-L, 0]], 'hair');
  [
    [0.16, 0.95, 0.07],
    [0.3, 0.7, 0.06],
    [0.46, 0.85, 0.065],
    [0.62, 0.55, 0.055],
    [0.78, 0.4, 0.05],
  ].forEach(([t, h, w], i) => {
    const x = -L * t;
    const half = L * w;
    const eave = -s * h * 0.55;
    d.line([[x + half, 0], [x + half, eave], [x, -s * h], [x - half, eave], [x - half, 0]], i < 3 ? 'main' : 'hair');
    d.line([[x + half, 0.8], [x, s * h * 0.55], [x - half, 0.8]], 'hatch');
    if (i % 2 === 0) d.light([x, eave * 0.55], 0.55);
  });
  d.light([-L * 0.9, -s * 0.6], 0.5);
  d.light([-L * 0.97, -s * 0.25], 0.4);
};

/** Primeval Ruins: white fire, three pointed tongues fanning out from the point, each with its ridge and hatched down one side. */
const fire = (d: Draw) => {
  const { L, s } = d;
  const o: Pt = [-1.5, 0];
  [
    [-20, 0.55],
    [0, 0.85],
    [20, 0.55],
  ].forEach(([a, k]) => {
    const dir = rad(180 + a);
    const len = (L - 1.5) * k;
    const half = s * 0.3;
    const n: Pt = [-Math.sin(dir), Math.cos(dir)];
    const tip: Pt = [o[0] + len * Math.cos(dir), o[1] + len * Math.sin(dir) * 0.9];
    const l: Pt = [o[0] + n[0] * half, o[1] + n[1] * half];
    const r: Pt = [o[0] - n[0] * half, o[1] - n[1] * half];
    d.line([l, tip, r]);
    d.line([o, tip], 'ember');
    hatch(d, o, l, tip, 1.5);
  });
};

const BY_NAME: Record<string, (d: Draw) => void> = {
  'The Mines': lamp,
  'Magma Fissure': cracks,
  'Frozen Hollow': frost,
  'Fungal Caverns': caps,
  'Vaal Outpost': shafts,
  'Abyssal Depths': eddy,
  'Petrified Forest': boughs,
  'Sulphur Vents': vapour,
  'Abyssal City': skyline,
  'Primeval Ruins': fire,
};

/** The ornament of the zone called `name` (a stratum's name, lib/descent), `L` px long, within ±`s`. */
export function ornamentOf(name: string, L: number, s: number): Ornament {
  return build(L, s, BY_NAME[name] ?? lamp);
}

export const ORNAMENT_NAMES = Object.keys(BY_NAME);
