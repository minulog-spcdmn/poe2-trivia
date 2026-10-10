// The pointer every player is shown as (their own: lib/ownCursor.ts; the
// others': PeerCursors.svelte), engraved in the style of the alchemist's
// circle (docs/arcane-style.md): one point of its compass star made into a
// dart, leaning as a pointer does, with a ridge down its middle and one side
// hatched along it, as the star's points are (lib/arcane.ts pointedRay).
// Its other states are drawn alike, each telling itself by its shape as well
// as its light: over something that can be clicked, a demon's clawed hand
// pointing (the system's pointer, engraved); pressed, the dart or the hand
// sinks a little (the dart's hatched side struck solid, the hand's finger pushed into the page);
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

/**
 * Pressed, the dart sinks to this much of its size about its tip (its
 * hatched side struck solid, lit a little: ownCursor.ts). The hand's finger
 * is foreshortened by this much (units).
 */
export const PRESS_SINK = 0.93;
const PRESS_SHORTEN = 1.4;

/** Where a disabled pointer's saltire sits beside the tip, clear of the dart. */
export const BADGE: Pt = [11.2, 3.2];

/** Points along the quadratic curve from `a` (left out) by way of `c` to `b`, `n` of them. */
const quad = (a: Pt, c: Pt, b: Pt, n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i + 1) / n;
    return [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  });

/**
 * A demon's hand pointing, as the system's pointer is, seen a little from
 * the side (three-quarter: narrowed across, leaning a little): a slim finger
 * ending in a talon, rounded knuckles each with a small claw hooked forward,
 * a clawed thumb. The talon's tip at the origin, at `k` times its size. Its
 * outline; the creases between the curled fingers and the talon's base; the
 * talon's shading; the talon whole (struck solid) and the pointing finger
 * whole (struck solid when pressed).
 */
function hand(k = 1, pressing = false) {
  const TURN = (-12 * Math.PI) / 180;
  const ACROSS = 0.8;
  // Pressing, the finger pushes into the page: foreshortened, the talon a little and the finger
  // below it a lot, the hand coming up behind it, while the talon's tip stays on the spot.
  const TALON = 4.2;
  const press = ([x, y]: Pt): Pt => (!pressing ? [x, y] : y <= TALON ? [x, y * 0.92] : [x, y - TALON * 0.08 - PRESS_SHORTEN]);
  // Drawn upright with the talon's tip at (6, 0), then moved onto the origin, narrowed and turned.
  const at = (p: Pt): Pt => {
    const [x, y] = press(p);
    const [u, v] = [(x - 6) * k * ACROSS, y * k];
    return [u * Math.cos(TURN) - v * Math.sin(TURN), u * Math.sin(TURN) + v * Math.cos(TURN)];
  };
  const poly = (pts: Pt[]) => `M${pts.map((p) => pt(at(p))).join('L')}Z`;
  const knuckle = (from: Pt, top: Pt, to: Pt, claw: Pt[]): Pt[] => [
    ...quad(from, [from[0], top[1] - 0.3], top, 3),
    ...claw,
    ...quad(top, [to[0], top[1] - 0.2], to, 3),
  ];
  const talonRight = quad([6, 0], [7.15, 1.2], [7.2, 4.2], 4);
  const talonLeft = quad([4.9, 4.2], [4.85, 1.3], [6, 0], 4).slice(0, -1);
  const outline = poly([
    [6, 0],
    ...talonRight,
    [7.2, 9.2],
    ...knuckle([7.2, 9.2], [8.8, 8.1], [10.3, 9.5], [[8.4, 8.2], [8.1, 6.9], [9.2, 8.0]]),
    ...knuckle([10.3, 9.5], [11.8, 8.8], [13.1, 10.2], [[11.4, 8.9], [11.3, 7.6], [12.2, 8.9]]),
    ...knuckle([13.1, 10.2], [14.3, 10.0], [15.3, 11.6], [[14.0, 10.0], [14.2, 8.9], [14.8, 10.3]]),
    [15.3, 16],
    ...quad([15.3, 16], [15.3, 18.6], [13.6, 19.5], 4),
    [13.6, 21.6],
    [5.6, 21.6],
    [5.6, 19.5],
    [2.6, 15.8],
    [0.7, 13.4],
    [2.7, 13.2],
    [4.9, 14.2],
    [4.9, 4.2],
    ...talonLeft,
  ]);
  const ln = (a: Pt, b: Pt) => line(at(a), at(b));
  const creases = ln([4.9, 4.2], [7.2, 4.2]) + ln([8.3, 10.2], [8.3, 13]) + ln([11, 10.6], [11, 13.3]) + ln([13.6, 11.4], [13.6, 13.6]);
  const talon = poly([[6, 0], ...talonRight, [4.9, 4.2], ...talonLeft]);
  const finger = poly([[6, 0], ...talonRight, [7.2, 9.2], [4.9, 9.2], [4.9, 4.2], ...talonLeft]);
  return { outline, creases, shade: hatch(at([6, 4.2]), at([4.9, 4.2]), at([6, 0.4]), 0.6 * k), talon, finger };
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
  /** Fine lines with nothing round them: a thinner rim, no glow, no wash of colour, the inner lines unrimmed. */
  plain?: boolean;
}

const dartLines = (d: { outline: string; ridge: string; hatch: string }, k = 1): Art['lines'] => [
  { d: d.outline, w: WEIGHT.outline },
  { d: d.ridge, w: WEIGHT.ridge * k },
  { d: d.hatch, w: WEIGHT.hatch, fine: true },
];

const pressed = dart(LEAN, PRESS_SINK);
export const HAND = hand();
/** The hand pressing: its finger foreshortened, pushing into the page. */
export const HAND_PRESSED = hand(1, true);
const pressedHand = HAND_PRESSED;
/** The hand's lines: finer than the dart's, so its small claws stay clear at its size (and drawn `plain`, see Art). */
const handLines = (h: ReturnType<typeof hand>): Art['lines'] => [
  { d: h.talon, w: 0, solid: true },
  { d: h.outline, w: 0.8 },
  { d: h.creases, w: 0.6 },
  { d: h.shade, w: 0.45, fine: true },
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
  hover: { size: SIZE, hot: [PAD_X, PAD_Y], ground: HAND.outline, lines: handLines(HAND), plain: true },
  // Pressed on it: the finger pushing into the page, foreshortened, struck solid.
  press: {
    size: SIZE,
    hot: [PAD_X, PAD_Y],
    ground: pressedHand.outline,
    lines: [{ d: pressedHand.finger, w: 0, solid: true }, ...handLines(pressedHand)],
    plain: true,
  },
  // Pressed on nothing that can be clicked: the dart sunk a little, its hatched side struck solid (drawn `sunk`, ownCursor.ts).
  sink: {
    size: SIZE,
    hot: [PAD_X, PAD_Y],
    ground: pressed.outline,
    lines: [
      { d: pressed.side, w: 0, solid: true },
      { d: pressed.outline, w: WEIGHT.outline },
      { d: pressed.ridge, w: WEIGHT.ridge },
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
