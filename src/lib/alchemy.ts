// The alchemist's signs, shared by the circle behind the item art
// (ArcaneCircle), the plate behind the item's name (NamePlate) and the
// achievements' seals (AchievementSeal).

type Pt = [number, number];
const f = (v: number) => v.toFixed(2);
const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
const rad = (a: number) => (a * Math.PI) / 180;
/** The point at `a` degrees clockwise from the top, `r` from the centre. */
const at = (a: number, r: number): Pt => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];

// Small alchemical marks on a grid of about ±2 (the four elements, salt,
// sulphur and the like), for a script nobody can read.
export const MARKS = [
  'M0 -2L1.7 1.5H-1.7Z', // fire
  'M0 2L1.7 -1.5H-1.7Z', // water
  'M0 -2L1.7 1.5H-1.7ZM-1.4 0.4H1.4', // air
  'M0 2L1.7 -1.5H-1.7ZM-1.4 -0.4H1.4', // earth
  'M0 -1.6A1.6 1.6 0 1 1 0 1.6A1.6 1.6 0 1 1 0 -1.6M-1.6 0H1.6', // salt
  'M0 -2.2L1.2 -0.2H-1.2ZM0 -0.2V2.2M-1 1H1', // sulphur
  'M0 -0.6A1.3 1.3 0 1 1 0 2A1.3 1.3 0 1 1 0 -0.6M0 -0.6V-2.4M-0.9 -1.6H0.9', // antimony
  'M-1.4 -2L0 2L1.4 -2M-0.9 -0.6H0.9', // arsenic
  'M-1.2 -2H1.2L-0.6 0C1.8 0 1.8 2.2 -1.2 2', // dram
  'M-1.5 1C-1.5 -2 1.5 -2 1.5 0S-0.4 2 -0.4 0', // a turn of the pen
  'M0 -2V2M-1.2 -0.8H1.2', // cross
  'M0.6 -2A2 2 0 1 0 0.6 2A1.5 1.5 0 1 1 0.6 -2', // crescent
  'M-1.4 2V-2L1.4 2V-2', // a zigzag
  'M-1.3 -1.6C0 -2.6 1.6 -1 0 0C-1.6 1 0 2.6 1.3 1.6', // an S
];

// The seven planets and their metals, drawn on a small grid (about ±4).
export const PLANETS = [
  'M0 -3.6A3.6 3.6 0 1 1 0 3.6A3.6 3.6 0 1 1 0 -3.6M0 -0.6A0.6 0.6 0 1 1 0 0.6A0.6 0.6 0 1 1 0 -0.6', // Sol • gold
  'M1 -4A4.2 4.2 0 1 0 1 4A3.3 3.3 0 1 1 1 -4Z', // Luna • silver
  'M-2.2 -4.6A2.2 2.2 0 0 0 2.2 -4.6M0 -3.2A1.9 1.9 0 1 1 0 0.6A1.9 1.9 0 1 1 0 -3.2M0 0.6V4.6M-1.6 2.8H1.6', // Mercury • quicksilver
  'M0 -4.4A2.4 2.4 0 1 1 0 0.4A2.4 2.4 0 1 1 0 -4.4M0 0.4V4.6M-1.8 2.6H1.8', // Venus • copper
  'M-1 -1.4A2.6 2.6 0 1 1 -1 3.8A2.6 2.6 0 1 1 -1 -1.4M0.9 -0.5L3.6 -3.2M1.2 -3.4H3.6V-1', // Mars • iron
  'M-3 -2.2C-3 -4.6 0.4 -4.6 0.2 -2.2C0 -0.4 -2 0.8 -3 1.4H3.2M1.6 -3.8V4.4', // Jupiter • tin
  'M-1 -4.4V2M-2.6 -2.8H0.6M-1 -0.4C0.2 -1.8 2.8 -1.6 2.6 0.6C2.4 2.4 0.4 2.6 1.2 4.4', // Saturn • lead
];

// The two great seals, drawn for a ring of radius 13 (about ±10 inside it).
// Sol: a disc (radius 5) with a point at its heart (1.1) and twelve rays,
// long and short in turn.
export const SOL_RAYS = Array.from({ length: 12 }, (_, k) => `M${pt(at(k * 30, 6.6))}L${pt(at(k * 30, k % 2 ? 8.4 : 10))}`).join('');
// Luna: a crescent shaded in hatching, its horns to the right.
export const LUNA = 'M4.67 -7.11A8.5 8.5 0 1 0 4.67 7.11A7.2 7.2 0 1 1 4.67 -7.11Z';
export const LUNA_HATCH = Array.from({ length: 13 }, (_, i) => {
  const y = -6 + i;
  const x0 = -Math.sqrt(8.5 ** 2 - y * y) + 0.7;
  const x1 = 3.5 - Math.sqrt(7.2 ** 2 - y * y) - 0.7;
  return x1 - x0 > 0.3 ? `M${f(x0)} ${y}H${f(x1)}` : '';
}).join('');
