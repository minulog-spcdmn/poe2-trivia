// The pointer every player is shown as (their own: lib/ownCursor.ts; the
// others': PeerCursors.svelte), engraved in the style of the alchemist's
// circle (docs/arcane-style.md): one point of its compass star made into a
// dart, leaning as a pointer does, with a ridge down its middle and one side
// hatched along it, as the star's points are (lib/arcane.ts pointedRay).
// Its other states are drawn alike: pressed (a seal stamped at the tip), the
// text cursor (a stem with a lozenge, as on the category cards' divider), and
// middle-button scrolling (upright darts, and a seal where the scroll began).

import { hatch, line, pt, ring, type Pt } from './arcane.ts';

/** A dart with its tip at the origin, turned `turn` radians from upright (counter-clockwise when negative), at `k` times its size. */
function dart(turn: number, k = 1) {
  const rot = ([x, y]: Pt): Pt => [k * (x * Math.cos(turn) - y * Math.sin(turn)), k * (x * Math.sin(turn) + y * Math.cos(turn))];
  const tip: Pt = [0, 0];
  const [l, notch, r] = ([[-6.6, 19.5], [0, 14.6], [6.6, 19.5]] as Pt[]).map(rot);
  return {
    outline: `M${pt(tip)}L${pt(l)}L${pt(notch)}L${pt(r)}Z`,
    ridge: line(tip, notch),
    hatch: hatch(notch, l, tip, 1.25 * k),
  };
}

/** How far the pointer leans from upright. */
const LEAN = -0.42;

/** The pointer: its outline (closed), the ridge, and the hatching down its left side. */
export const POINTER = dart(LEAN);

/** Room round the dart for its dark rim and glow: the tip sits at (PAD_X, PAD_Y) in a box SIZE across (CSS px). */
export const PAD_X = 5;
export const PAD_Y = 4;
export const SIZE: Pt = [24, 30];

/** Line weights (CSS px): fine and even, as cut. */
export const WEIGHT = { outline: 1.05, ridge: 0.8, hatch: 0.55, fine: 0.7, rim: 3 };

/** Pressed, the dart sinks this much about its tip, and a seal of this radius is stamped round it. */
export const PRESS_SCALE = 0.86;
export const STAMP_R = 4.2;

/**
 * A cursor's picture: a box `size` across with the hot spot at `hot`, where
 * the shapes' origin is. `ground` is filled dark and rimmed dark under
 * everything, so it reads on gold as well as on black; `lines` are cut in the
 * player's colour (`fine` ones: hatching, with round ends, a little fainter).
 */
export interface Art {
  size: Pt;
  hot: Pt;
  ground: string;
  lines: { d: string; w: number; fine?: boolean }[];
}

const dartLines = (d: ReturnType<typeof dart>, k = 1): Art['lines'] => [
  { d: d.outline, w: WEIGHT.outline },
  { d: d.ridge, w: WEIGHT.ridge * k },
  { d: d.hatch, w: WEIGHT.hatch, fine: true },
];

const pressed = dart(LEAN, PRESS_SCALE);
/** A double ring, as the circle's seals are. */
const seal = (c: Pt, r: number) => ring(c, r) + ring(c, r * 0.78);

/** The text cursor: a stem between two serifed bars, a lozenge at its middle. */
function textArt(): Art {
  const H = 9;
  const bar = (y: number, dir: number) => line([-3.4, y], [3.4, y]) + line([-3.4, y], [-3.4, y + dir * 1.3]) + line([3.4, y], [3.4, y + dir * 1.3]);
  const diamond = 'M0 -2.1L1.3 0L0 2.1L-1.3 0Z';
  const stem = line([0, -H], [0, -2.1]) + line([0, 2.1], [0, H]);
  return {
    size: [14, 26],
    hot: [7, 13],
    ground: `M-3.4 ${-H}H3.4M-3.4 ${H}H3.4M0 ${-H}V${H}`,
    lines: [
      { d: bar(-H, 1) + bar(H, -1) + stem, w: WEIGHT.outline },
      { d: diamond, w: WEIGHT.fine },
    ],
  };
}

/** Path data moved down by `dy` (its points are all "x y" pairs, as arcane.ts writes them). */
const moved = (d: string, dy: number) => d.replace(/(-?\d+\.\d+) (-?\d+\.\d+)/g, (_, x, y) => `${x} ${(Number(y) + dy).toFixed(2)}`);
const movedDart = (d: ReturnType<typeof dart>, dy: number) => ({ outline: moved(d.outline, dy), ridge: moved(d.ridge, dy), hatch: moved(d.hatch, dy) });

/** A dart standing upright (or upside down) for middle-button scrolling, its middle on the hot spot. */
function scrollArt(down: boolean): Art {
  const d = movedDart(dart(down ? Math.PI : 0, 0.8), down ? 8 : -8);
  return { size: [20, 26], hot: [10, 13], ground: d.outline, lines: dartLines(d, 0.9) };
}

export const ART = {
  rest: { size: SIZE, hot: [PAD_X, PAD_Y], ground: POINTER.outline, lines: dartLines(POINTER) },
  // A seal stamped round the tip, the dart sunk into it.
  press: {
    size: [26, 32],
    hot: [7, 7],
    ground: pressed.outline,
    lines: [...dartLines(pressed, PRESS_SCALE), { d: seal([0, 0], STAMP_R), w: WEIGHT.fine }],
  },
  text: textArt(),
  up: scrollArt(false),
  down: scrollArt(true),
  // Still (close to where the scroll began): a small seal with a dot in it.
  still: {
    size: [18, 18],
    hot: [9, 9],
    ground: 'M-4.6 0A4.6 4.6 0 1 0 4.6 0A4.6 4.6 0 1 0 -4.6 0Z',
    lines: [{ d: seal([0, 0], 4.6), w: WEIGHT.ridge }, { d: 'M-0.9 0A0.9 0.9 0 1 0 0.9 0A0.9 0.9 0 1 0 -0.9 0Z', w: WEIGHT.ridge }],
  },
} satisfies Record<string, Art>;

export type ArtName = keyof typeof ART;

/**
 * The seal left where a middle-button scroll began (lib/autoscroll.ts): a
 * worn double ring with a dart pointing up and one pointing down inside it,
 * and a dot between them. Drawn about the origin, radius `SCROLL_SEAL_R`.
 */
export const SCROLL_SEAL_R = 15;
export const SCROLL_SEAL = (() => {
  return {
    rings: seal([0, 0], SCROLL_SEAL_R),
    up: movedDart(dart(0, 0.42), -10.5),
    down: movedDart(dart(Math.PI, 0.42), 10.5),
  };
})();
