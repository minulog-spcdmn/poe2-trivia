// The best packing known of 17 unit squares in a square: John Bidwell's,
// found in 1997 or 1998 (Erich Friedman's survey, "Packing Unit Squares in
// Squares", from its second version), its side about 4.6755. The codex lays
// its 17 common fossils in it (codex/DelveFossils.svelte), a square each.
//
// Built here as David Ellsworth's drawing of it builds it (square-17.svg on
// his "Squares in Squares" page, kingbird.myphotos.cc/packing/, which carries
// on Friedman's), from its exact solution: the side `s`, the six squares'
// tilt `a` and the seventh's `b`, and the offsets between them, to the
// digits he gives. tests/squarePacking.test.ts checks that no two overlap
// and none leaves the square.

/** The square's side, in the small squares' sides. */
export const PACKED_SIDE = 4.67553009360455;

const A = (39.8049589797678 * Math.PI) / 180;
const B = (36.6237863834466 * Math.PI) / 180;
const X1 = 0.640176192429266;
const V0 = 0.0568386968702873;
const U1 = 0.276426766820380;
const U2 = 0.404478693276883;
const X3 = 1.84732482651029;
const Y4 = 3.11346013251256;
const R5 = 0.505927428006637;

type Pt = [number, number];
/** A square, by its corners, in the drawing's frame (y up, as the drawing's are). */
const unit = (x: number, y: number): Pt[] => [
  [x, y],
  [x + 1, y],
  [x + 1, y + 1],
  [x, y + 1],
];
const turn = (p: Pt, t: number): Pt => [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)];
const moved = (ps: Pt[], dx: number, dy: number, t = 0): Pt[] => ps.map((p) => turn(p, t)).map(([x, y]) => [x + dx, y + dy]);

/** The 17 squares by their corners, y up, as the drawing places them. */
function corners(): Pt[][] {
  const s = PACKED_SIDE;
  const all: Pt[][] = [];
  // Three in each lower corner and one in each upper, square to the sides (the right side the left's mirror).
  for (const [x, y] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [0, s - 1],
  ]) {
    all.push(unit(x, y), unit(x, y).map(([px, py]) => [s - px, py] as Pt));
  }
  // The six tilted together, two by two.
  for (const [x, y] of [
    [0, 0],
    [1, V0],
    [U1, -1],
    [U1 + 1, V0 - 1],
    [U2, -2],
    [U2 + 1, V0 - 2],
  ])
    all.push(moved(unit(x, y), X1, 2, A));
  // One square to the top, its neighbour tilted the other way, and one on the right side.
  all.push(unit(X3, s - 1));
  all.push(moved(unit(0, -R5), X3 + 1, s - 1, -B));
  all.push(unit(s - 1, Y4 - 1));
  return all;
}

/** A square of the packing: its middle, from the square's top left (y down) in the small squares' sides, and how far it's turned (degrees, clockwise as CSS turns). */
export type PackedSquare = { x: number; y: number; turn: number };

/** The squares' corners, y down from the top left: what the test checks. */
export function packedCorners(): Pt[][] {
  return corners().map((sq) => sq.map(([x, y]) => [x, PACKED_SIDE - y] as Pt));
}

/** The 17 squares, read as a page is: in rows from the top (each a band of the square's height), left to right in each. */
export const PACKED: readonly PackedSquare[] = packedCorners()
  .map((sq) => {
    const x = sq.reduce((t, p) => t + p[0], 0) / 4;
    const y = sq.reduce((t, p) => t + p[1], 0) / 4;
    // (Its first side's direction, y down, as CSS turns: a quarter turn either way is the same square.)
    let deg = (Math.atan2(sq[1][1] - sq[0][1], sq[1][0] - sq[0][0]) * 180) / Math.PI;
    deg = ((((deg + 45) % 90) + 90) % 90) - 45;
    return { x, y, turn: Math.abs(deg) < 1e-9 ? 0 : deg };
  })
  .sort((p, q) => Math.round(p.y / 0.6) - Math.round(q.y / 0.6) || p.x - q.x);
