// The QR code a device shows the others (SyncDialog): its pairing link
// (lib/sync/code.ts codeLink), engraved rather than printed. Its modules are
// stippled dots of ink, its three finder eyes rounded squares, and its heart
// is cleared for a seal (the conjunction, SyncSeal), which the highest error
// correction reads through. The heart is only cleared where no fixed pattern
// of the code lies (from version 7 one stands at the centre), so a longer
// link loses its seal before it could be misread.

import { encode } from 'uqr';

export interface QrShape {
  /** Modules across, its border of four (the quiet zone scanners need) included. */
  size: number;
  /** The data modules, each a dot. */
  dots: string;
  /** The three finder eyes and the small alignment ones: each a rounded ring and its pupil. */
  eyes: string;
  /** The cleared heart, centre and radius in modules, or null where none could be cleared. */
  heart: { c: number; r: number } | null;
}

/** A dot's radius, in modules: dots apart, like a stipple, yet big enough for a scanner's sampling at their centres. */
export const DOT = 0.45;
/** The heart cleared for the seal, as a radius in modules (about 4% of the code's modules at version 6, well within H's 30%). */
const HEART = 4.6;

const n = (v: number) => +v.toFixed(2);

/** A rounded square, `s` across with corners of radius `r`, at (x, y); clockwise, or the other way round (to cut a hole, nonzero). */
function rounded(x: number, y: number, s: number, r: number, back = false): string {
  if (!back) return `M${n(x + r)} ${n(y)}h${n(s - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${n(s - 2 * r)}a${r} ${r} 0 0 1 -${r} ${r}h-${n(s - 2 * r)}a${r} ${r} 0 0 1 -${r} -${r}v-${n(s - 2 * r)}a${r} ${r} 0 0 1 ${r} -${r}z`;
  return `M${n(x + r)} ${n(y)}a${r} ${r} 0 0 0 -${r} ${r}v${n(s - 2 * r)}a${r} ${r} 0 0 0 ${r} ${r}h${n(s - 2 * r)}a${r} ${r} 0 0 0 ${r} -${r}v-${n(s - 2 * r)}a${r} ${r} 0 0 0 -${r} -${r}z`;
}

/** The code's marks, before they are drawn: the data modules' dots (their cells' top left corners), the eyes' corners, and the heart. */
export function qrMarks(text: string) {
  const { data, types, size } = encode(text, { ecc: 'H', border: 4 });
  const c = size / 2;
  /** Where the three finder eyes stand (their top left corners). */
  const eyes = [
    [4, 4],
    [size - 11, 4],
    [4, size - 11],
  ];
  const inEye = (x: number, y: number) => eyes.some(([ex, ey]) => x >= ex && x < ex + 7 && y >= ey && y < ey + 7);
  // The small alignment eyes (from version 2), their top left corners (QrCodeDataType: Alignment 4).
  const isAlign = (x: number, y: number) => types[y]?.[x] === 4;
  const aligns: [number, number][] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (isAlign(x, y) && !isAlign(x - 1, y) && !isAlign(x, y - 1)) aligns.push([x, y]);
  const inHeart = (x: number, y: number) => Math.hypot(x + 0.5 - c, y + 0.5 - c) < HEART;
  // The heart, if only data runs through it (QrCodeDataType: Data 0).
  let clear = true;
  for (let y = Math.floor(c - HEART); y <= c + HEART; y++)
    for (let x = Math.floor(c - HEART); x <= c + HEART; x++) if (inHeart(x, y) && types[y][x] !== 0) clear = false;
  const dots: [number, number][] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (data[y][x] && !inEye(x, y) && !isAlign(x, y) && !(clear && inHeart(x, y))) dots.push([x, y]);
  return { size, dots, eyes, aligns, heart: clear ? { c, r: HEART } : null };
}

/** An eye's ring and pupil, as rounded squares: [inset, across, corner radius] of the ring's outside, its inside and the pupil. */
export const EYE = { out: [0, 7, 2.2], in: [1, 5, 1.4], pupil: [2, 3, 0.9] } as const;
/** An alignment eye's, likewise: drawn whole like the finder eyes, as a reader that finds no run of the right lengths there (jsQR) can't read the code. */
export const ALIGN = { out: [0, 5, 1.5], in: [1, 3, 0.8], pupil: [2, 1, 0.35] } as const;
type Eye = typeof EYE | typeof ALIGN;

export function qrShape(text: string): QrShape {
  const { size, dots, eyes, aligns, heart } = qrMarks(text);
  const dot = (x: number, y: number) => `M${n(x + 0.5 - DOT)} ${y + 0.5}a${DOT} ${DOT} 0 1 0 ${2 * DOT} 0a${DOT} ${DOT} 0 1 0 -${2 * DOT} 0z`;
  const ring = (e: Eye) => ([x, y]: number[]) =>
    rounded(x + e.out[0], y + e.out[0], e.out[1], e.out[2]) + rounded(x + e.in[0], y + e.in[0], e.in[1], e.in[2], true) + rounded(x + e.pupil[0], y + e.pupil[0], e.pupil[1], e.pupil[2]);
  return { size, dots: dots.map(([x, y]) => dot(x, y)).join(''), eyes: eyes.map(ring(EYE)).join('') + aligns.map(ring(ALIGN)).join(''), heart };
}
