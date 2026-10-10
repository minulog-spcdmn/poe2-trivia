// The pointer every player is shown as (their own: lib/ownCursor.ts; the
// others': PeerCursors.svelte), engraved in the style of the alchemist's
// circle (docs/arcane-style.md): one point of its compass star made into a
// dart, leaning as a pointer does, with a ridge down its middle and one side
// hatched along it, as the star's points are (lib/arcane.ts pointedRay).
// Its other states are drawn alike, each telling itself by its shape as well
// as its light: over something that can be clicked, a gauntlet's hand
// pointing (the system's pointer, engraved); pressed, the dart or the hand
// sinks, the dart's hatched side or the hand's finger struck solid;
// disabled, dull lead with a saltire beside the tip; the text cursor (a stem
// with a lozenge, as on the category cards' divider); and middle-button
// scrolling (upright darts, and a seal where the scroll began).

import { f, hatch, line, pt, ring, type Pt } from './arcane.ts';

/** A dart with its tip at the origin, turned `turn` radians from upright (counter-clockwise when negative), at `k` times its size. */
function dart(turn: number, k = 1) {
  const rot = ([x, y]: Pt): Pt => [k * (x * Math.cos(turn) - y * Math.sin(turn)), k * (x * Math.sin(turn) + y * Math.cos(turn))];
  const tip: Pt = [0, 0];
  const [l, notch, r] = ([[-6.6, 19.5], [0, 14.6], [6.6, 19.5]] as Pt[]).map(rot);
  return {
    outline: `M${pt(tip)}L${pt(l)}L${pt(notch)}L${pt(r)}Z`,
    ridge: line(tip, notch),
    hatch: hatch(notch, l, tip, 1.25 * k),
    /** The hatched side, whole: struck solid when pressed. */
    side: `M${pt(tip)}L${pt(l)}L${pt(notch)}Z`,
  };
}

/** How far the pointer leans from upright. */
const LEAN = -0.42;

/** The pointer: its outline (closed), the ridge, and the hatching down its left side. */
export const POINTER = dart(LEAN);

/** Room round the dart for its dark rim and glow: the tip sits at (PAD_X, PAD_Y) in a box SIZE across (CSS px). */
export const PAD_X = 8;
export const PAD_Y = 4;
export const SIZE: Pt = [28, 32];

/** Line weights (CSS px): fine and even, as cut. */
export const WEIGHT = { outline: 1.05, ridge: 0.8, hatch: 0.55, fine: 0.7, rim: 3 };

/** Pressed, the dart sinks this much about its tip. */
export const PRESS_SCALE = 0.86;

/** Where a disabled pointer's saltire sits beside the tip, clear of the dart. */
export const BADGE: Pt = [11.2, 3.2];

/**
 * A gauntlet's hand pointing up, as the system's pointer is: the tip of its
 * finger at the origin, at `k` times its size. Its outline; the lines
 * between the curled fingers and across the cuff; the cuff's hatching; and
 * the pointing finger whole (struck solid when pressed).
 */
function hand(k = 1) {
  // Drawn with the finger's tip at (6.5, 0), then moved onto the origin.
  const p = (x: number, y: number) => `${f((x - 6.5) * k)} ${f(y * k)}`;
  const q = (x: number, y: number): Pt => [(x - 6.5) * k, y * k];
  const arc = (r: number, x: number, y: number) => `A${f(r * k)} ${f(r * k)} 0 0 1 ${p(x, y)}`;
  const outline =
    `M${p(5, 1.5)}${arc(1.5, 8, 1.5)}` +
    `L${p(8, 8.6)}${arc(1.5, 11, 8.6)}` +
    `L${p(11, 9.4)}${arc(1.5, 14, 9.4)}` +
    `L${p(14, 10.4)}${arc(1.4, 16.8, 10.4)}` +
    `L${p(16.8, 16)}Q${p(16.8, 18.6)} ${p(14.4, 19.6)}` +
    `L${p(14.4, 22)}L${p(5.6, 22)}L${p(5.6, 19.6)}` +
    `L${p(1.8, 14.6)}${arc(1.2, 3.6, 13)}L${p(5, 14.6)}Z`;
  const creases = line(q(8, 9.4), q(8, 13.4)) + line(q(11, 10.2), q(11, 13.6)) + line(q(14, 11.2), q(14, 13.8)) + line(q(5.6, 19.6), q(14.4, 19.6));
  const cuff = Array.from({ length: 6 }, (_, i) => line(q(6.9 + i * 1.3, 20.2), q(6.9 + i * 1.3, 21.5))).join('');
  const finger = `M${p(5, 1.5)}${arc(1.5, 8, 1.5)}L${p(8, 13.4)}L${p(5, 13.4)}Z`;
  return { outline, creases, cuff, finger };
}

/** A saltire about `c`, `r` out along each arm. */
export const saltire = (c: Pt, r: number) => line([c[0] - r, c[1] - r], [c[0] + r, c[1] + r]) + line([c[0] - r, c[1] + r], [c[0] + r, c[1] - r]);

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
  /** What's cut, in order: `fine` lines are hatching (round ends, a little fainter); `solid` shapes are filled with the line's colour. */
  lines: { d: string; w: number; fine?: boolean; solid?: boolean }[];
}

const dartLines = (d: { outline: string; ridge: string; hatch: string }, k = 1): Art['lines'] => [
  { d: d.outline, w: WEIGHT.outline },
  { d: d.ridge, w: WEIGHT.ridge * k },
  { d: d.hatch, w: WEIGHT.hatch, fine: true },
];

const pressed = dart(LEAN, PRESS_SCALE);
export const HAND = hand();
const pressedHand = hand(PRESS_SCALE);
const handLines = (h: ReturnType<typeof hand>): Art['lines'] => [
  { d: h.outline, w: WEIGHT.outline },
  { d: h.creases, w: WEIGHT.fine },
  { d: h.cuff, w: WEIGHT.hatch, fine: true },
];
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
  // Over something that can be clicked: the hand, pointing.
  hover: { size: SIZE, hot: [PAD_X, PAD_Y], ground: HAND.outline, lines: handLines(HAND) },
  // Pressed on it: the hand sunk, its finger struck solid.
  press: {
    size: SIZE,
    hot: [PAD_X, PAD_Y],
    ground: pressedHand.outline,
    lines: [{ d: pressedHand.finger, w: 0, solid: true }, ...handLines(pressedHand)],
  },
  // Pressed on nothing that can be clicked: the dart sunk, its hatched side struck solid.
  sink: {
    size: SIZE,
    hot: [PAD_X, PAD_Y],
    ground: pressed.outline,
    lines: [
      { d: pressed.outline, w: WEIGHT.outline },
      { d: pressed.side, w: 0, solid: true },
    ],
  },
  // Disabled: a saltire beside the tip (drawn in lead, ownCursor.ts).
  disabled: {
    size: SIZE,
    hot: [PAD_X, PAD_Y],
    ground: POINTER.outline + saltire(BADGE, 2.8),
    lines: [{ d: POINTER.outline, w: WEIGHT.outline }, { d: POINTER.ridge, w: WEIGHT.ridge }, { d: saltire(BADGE, 2.8), w: 1 }],
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
