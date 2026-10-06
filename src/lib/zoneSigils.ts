// A small engraved emblem for each of Delve's biomes, the zones (lib/descent
// names them), drawn as the alchemist's circle is drawn (docs/arcane-style.md):
// fine lines of exact geometry, no fill, no text. Each fits a circle of
// radius 10 about the origin (y down), so a seal of any size can hold it at
// `r / 10`; they are made to read at 14 to 24 px across, so they keep to a
// handful of strokes. Lines come back as SVG path data: `lines` the main
// strokes, `fine` the finer ones (a ridge, a stair, the gills), drawn
// thinner, and `shade`, hatching down the side of each solid turned from
// the light (it falls from the upper left, as on the cards).

import { arc, at, line, ring, type Pt } from './arcane.ts';
import { emblemOf } from './backdrops.ts';
import { stratumName } from './descent.ts';

export type Sigil = { lines: string; fine: string; shade?: string };

/**
 * Upright hatching inside the convex polygon `ps`, from `x0` to `x1`, `gap`
 * apart, each stroke kept `pad` short of the outline.
 */
function upright(ps: Pt[], x0: number, x1: number, gap = 1.1, pad = 0.6): string {
  let out = '';
  for (let x = x0; x <= x1 + 1e-6; x += gap) {
    const ys: number[] = [];
    ps.forEach((a, i) => {
      const b = ps[(i + 1) % ps.length];
      if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) ys.push(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
    });
    if (ys.length < 2) continue;
    const [lo, hi] = [Math.min(...ys) + pad, Math.max(...ys) - pad];
    if (hi - lo > 0.6) out += line([x, lo], [x, hi]);
  }
  return out;
}

const O: Pt = [0, 0];
const poly = (pts: Pt[], close = false) => pts.map((p, i) => line(p, pts[(i + 1) % pts.length])).slice(0, close ? pts.length : pts.length - 1).join('');
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [-x, y]);

/** The Mines: a miner's lamp, its glass narrowing to a cap and a ring, a flame inside, on a foot. */
function lantern(): Sigil {
  return {
    lines: poly([[-3.2, -4.4], [-4, 4.4], [4, 4.4], [3.2, -4.4]], true) + poly([[-3.2, -4.4], [0, -6.6], [3.2, -4.4]]) + ring([0, -7.9], 1.3) + line([-5.2, 6.4], [5.2, 6.4]),
    fine: poly([[0, -2.6], [1.3, 0.4], [0, 2.6], [-1.3, 0.4]], true) + line([-4, 4.4], [-5.2, 6.4]) + line([4, 4.4], [5.2, 6.4]),
    // The glass's right side, clear of the flame.
    shade: upright([[-3.2, -4.4], [3.2, -4.4], [4, 4.4], [-4, 4.4]], 2, 3.8),
  };
}

/**
 * Magma Fissure: the sign of fire, cracked through from its apex to its base
 * by a fissure that zigzags at fixed angles; the triangle's base is broken
 * where it comes out.
 */
function fissure(): Sigil {
  const apex: Pt = [0, -8.6];
  const [l, r]: Pt[] = [
    [-8, 5.6],
    [8, 5.6],
  ];
  const crack: Pt[] = [
    apex,
    [0.9, -4.6],
    [-1.7, -0.9],
    [1.3, 1.6],
    [-0.9, 4.2],
    [0.2, 7.4],
  ];
  return {
    lines: line(apex, l) + line(apex, r) + line(l, [-1.6, 5.6]) + line([1.2, 5.6], r),
    fine: poly(crack),
    shade: upright([apex, r, l], 2.6, 7, 1.1, 0.7),
  };
}

/** Frozen Hollow: a crystal of six arms about a small hexagon, each arm branching once. */
function crystal(): Sigil {
  let lines = '';
  let fine = '';
  const hex = Array.from({ length: 6 }, (_, k) => at(O, k * 60, 2.2));
  lines += poly(hex, true);
  for (let k = 0; k < 6; k++) {
    const a = k * 60;
    lines += line(at(O, a, 2.2), at(O, a, 9.4));
    const fork = at(O, a, 5.6);
    for (const s of [-1, 1]) fine += line(fork, at(fork, a + s * 42, 2.8));
  }
  return { lines, fine };
}

/**
 * Fungal Caverns: a mushroom, its cap a circular dome, its gills fanning
 * from the top of the stalk to the cap's rim, the stalk flaring at its foot.
 */
function spore(): Sigil {
  const c: Pt = [0, 1.2];
  const R = 8.6;
  const rim = (s: number): Pt => [s * R, 1.2];
  const top: Pt = [0, 3.2];
  let fine = '';
  for (let k = 1; k <= 5; k++) {
    const x = -R + (2 * R * k) / 6;
    fine += line(top, [x, 1.2]);
  }
  return {
    lines: arc(c, R, -90, 90) + line(rim(-1), rim(1)) + line([-1.5, 3.2], [-1.5, 7.4]) + line([1.5, 3.2], [1.5, 7.4]) + line([-3.6, 8.6], [3.6, 8.6]),
    fine: fine + line([-1.5, 7.4], [-3.6, 8.6]) + line([1.5, 7.4], [3.6, 8.6]),
    // The dome's right side.
    shade: upright(
      Array.from({ length: 19 }, (_, k) => at(c, -90 + k * 10, R)),
      2.4,
      7.8,
    ),
  };
}

/** Vaal Outpost: a stepped pyramid with a stair up its middle and a shrine on top. */
function pyramid(): Sigil {
  const steps = 4;
  const half = (i: number) => 7.2 - i * 1.65;
  const y = (i: number) => 6.4 - i * 3;
  const right: Pt[] = [];
  for (let i = 0; i < steps; i++) right.push([half(i), y(i)], [half(i), y(i + 1)]);
  right.push([1.4, y(steps)]);
  const outline = [...mirror(right).reverse(), ...right];
  return {
    lines: poly(outline) + line([-half(0), y(0)], [half(0), y(0)]) + line([-1.4, y(steps)], [0, y(steps) - 2]) + line([0, y(steps) - 2], [1.4, y(steps)]),
    fine: line([-0.8, y(0)], [-0.8, y(steps)]) + line([0.8, y(0)], [0.8, y(steps)]),
    // The right half of each tier.
    shade: Array.from({ length: steps }, (_, i) =>
      upright(
        [
          [1.4, y(i + 1)],
          [half(i), y(i + 1)],
          [half(i), y(i)],
          [1.4, y(i)],
        ],
        2.2,
        half(i) - 0.5,
        1.1,
        0.55,
      ),
    ).join(''),
  };
}

/** Abyssal Depths: a spiral winding in two and a half turns to the dark at its heart. */
function spiral(): Sigil {
  const turns = 2.5;
  const n = 90;
  const pts: Pt[] = Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n;
    return at(O, t * turns * 360, 9.2 - t * 7.6);
  });
  return { lines: 'M' + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L'), fine: ring(O, 0.8) };
}

/** Petrified Forest: a bare tree, its boughs forking from the trunk at fixed angles, on a line of ground. */
function tree(): Sigil {
  const trunk: [Pt, Pt] = [
    [0, 7.6],
    [0, -9],
  ];
  let lines = line(...trunk) + line([-6.4, 7.6], [6.4, 7.6]);
  let fine = '';
  for (const [y, len, a] of [
    [3, 6.6, 52],
    [-1.4, 5.2, 44],
    [-5, 3.4, 36],
  ] as const)
    for (const s of [-1, 1]) {
      const end = at([0, y], s * a, len);
      lines += line([0, y], end);
      fine += line(at([0, y], s * a, len * 0.55), at(at([0, y], s * a, len * 0.55), s * (a - 40), len * 0.32));
    }
  return { lines, fine };
}

/** Sulphur Vents: the alchemist's sign of sulphur, a triangle over a cross. */
function sulphur(): Sigil {
  const apex: Pt = [0, -9];
  const [l, r]: Pt[] = [
    [-5, -1],
    [5, -1],
  ];
  return { lines: poly([apex, r, l], true) + line([0, -1], [0, 9]) + line([-4.2, 4], [4.2, 4]), fine: '', shade: upright([apex, r, l], 1, 4, 1, 0.6) };
}

/** Abyssal City: three pointed spires, the middle one tallest, over a line of ground. */
function spires(): Sigil {
  const tower = (cx: number, w: number, base: number, eave: number, tip: number) =>
    poly([
      [cx - w, base],
      [cx - w, eave],
      [cx, tip],
      [cx + w, eave],
      [cx + w, base],
    ]);
  return {
    lines: tower(0, 1.8, 7, -3, -9.2) + tower(-4.8, 1.5, 7, 1, -3.8) + tower(4.8, 1.5, 7, 1, -3.8) + line([-6.9, 7], [6.9, 7]),
    fine: line([0, 7], [0, 2.6]) + line([-4.8, 7], [-4.8, 4.2]) + line([4.8, 7], [4.8, 4.2]),
    // The right half of each spire.
    shade: [
      [0, 1.8, -3, -9.2],
      [-4.8, 1.5, 1, -3.8],
      [4.8, 1.5, 1, -3.8],
    ]
      .map(([x, w, eave, tip]) =>
        upright(
          [
            [x, tip],
            [x + w, eave],
            [x + w, 7],
            [x, 7],
          ],
          x + 0.8,
          x + w - 0.3,
          0.9,
          0.6,
        ),
      )
      .join(''),
  };
}

/** Primeval Ruins: a broken column on its plinth, sheared off at a slant, one flute down its shaft. */
function column(): Sigil {
  return {
    lines: line([-2.6, 6], [-2.6, -3.2]) + line([2.6, 6], [2.6, -6.2]) + line([-2.6, -3.2], [-0.6, -4.4]) + line([-0.6, -4.4], [0.6, -3.9]) + line([0.6, -3.9], [2.6, -6.2]) + poly([[-5, 6], [5, 6], [5, 8.4], [-5, 8.4]], true),
    fine: line([0, 6], [0, -3.4]) + line([-3.6, 6], [3.6, 6]),
    // The shaft's right side, under its broken top.
    shade: upright(
      [
        [0.6, -3.9],
        [2.6, -6.2],
        [2.6, 6],
        [0.6, 6],
      ],
      1.3,
      2.2,
      0.9,
      0.6,
    ),
  };
}

const BY_NAME: Record<string, () => Sigil> = {
  'The Mines': lantern,
  'Magma Fissure': fissure,
  'Frozen Hollow': crystal,
  'Fungal Caverns': spore,
  'Vaal Outpost': pyramid,
  'Abyssal Depths': spiral,
  'Petrified Forest': tree,
  'Sulphur Vents': sulphur,
  'Abyssal City': spires,
  'Primeval Ruins': column,
};

const made = new Map<string, Sigil>();

/** The emblem of the biome called `name` (a stratum's name, lib/descent.ts): a zone's own, a stratum past the zones its archetype's (lib/backdrops.ts, emblemOf); the Mines' for any other. */
export function sigilOf(name: string): Sigil {
  let s = made.get(name);
  if (!s) made.set(name, (s = (BY_NAME[name] ?? BY_NAME[emblemOf(name) ?? ''] ?? lantern)()));
  return s;
}

/** The zone a depth is in: the Mines for depths 1 to 10, Magma Fissure for 11 to 20, and so on (past 100, the generated stratum's own name). */
export const zoneAt = (depth: number) => stratumName(Math.max(0, Math.floor((depth - 1) / 10)));

/** The biomes that have an emblem of their own. */
export const SIGIL_NAMES = Object.keys(BY_NAME);
