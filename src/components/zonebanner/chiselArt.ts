// The chiselled inscription (Chisel.svelte): a zone's name cut into the dark
// on the kicker's line, letter by letter, as a mason strikes it. Out from it
// each way runs a V-groove scored toward the name: two edges meeting in a
// point, the floor of the cut down its middle, its upper wall (turned from
// the light, which falls from above) hatched; a punched lozenge at its far
// end. Between groove and name, the zone's sigil struck as a mason's mark.
// Pure geometry, px in the head's box (lib/zonebanner/head).

import type { Head } from './head.ts';
import { glowOf, hatch, pen, poly, wearOf, type Pt, type Stroke } from './pen.ts';

export type ChiselArt = {
  /** The name's middle. */
  name: Pt;
  /** The mason's marks: centre and size (px across). */
  marks: { c: Pt; s: number; delay: number }[];
  strokes: Stroke[];
  glow: ReturnType<typeof glowOf>;
  /** The shadow pooled under it all, so it reads on any backdrop. */
  pool: { cx: number; cy: number; rx: number; ry: number };
  /** When the first letter is struck, and the beat between letters (s). */
  start: number;
  step: number;
};

/** When the chisel reaches the grooves' inner ends. */
const SCORE = 0.36;

export function chiselArt(head: Head, nameW: number, nameH: number, letters: number): ChiselArt {
  const cx = head.w / 2;
  const cy = head.ky + (head.narrow ? 0 : 1);
  const m = head.narrow ? 14 : 19;
  const gap = m * 0.5;
  // As far as it may reach each way: the whole width on a phone, out past
  // the banner's rules on a wide screen.
  const avail = head.narrow ? head.w / 2 - 3 : Math.min(head.w / 2 - 8, nameW / 2 + 250);
  let inner = nameW / 2 + gap + m + gap * 0.9;
  const withMarks = avail - inner >= 6;
  if (!withMarks) inner = nameW / 2 + gap;
  const L = Math.min(head.narrow ? 72 : 168, avail - inner - 7);
  const grooves = L >= 18;

  const step = Math.min(0.055, Math.max(0.028, 0.62 / Math.max(1, letters)));
  const start = SCORE + (withMarks ? 0.1 : 0);
  const end = start + step * letters;

  const marks = withMarks
    ? [-1, 1].map((s, i) => ({ c: [cx + s * (nameW / 2 + gap + m / 2), cy] as Pt, s: m, delay: i ? end + 0.02 : SCORE - 0.02 }))
    : [];

  const build = (worn: boolean) => {
    const wear = worn ? wearOf(29) : null;
    const out: Stroke[] = [];
    if (!grooves) return out;
    const hb = head.narrow ? 2.2 : 3.3;
    for (const s of [-1, 1]) {
      const x0 = cx + s * inner;
      const x1 = x0 + s * L;
      const [U, D, B, T]: Pt[] = [
        [x0, cy - hb],
        [x0, cy + hb],
        [x0, cy],
        [x1, cy],
      ];
      // Scored from the far point in toward the name.
      out.push(...pen([T, U], 'main', 0, SCORE, { wear }), ...pen([T, D], 'main', 0.02, SCORE, { wear }));
      out.push(...pen([T, B], 'hair', 0.05, SCORE - 0.04));
      out.push(...pen([U, D], 'thin', SCORE - 0.04, 0.08));
      // The upper wall in shade: fine lines along it, closing to the point.
      if (!worn) continue;
      out.push(...hatch(B, U, T, head.narrow ? 0.62 : 0.7, SCORE - 0.1, 0.12));
      // The punched lozenge beyond the point.
      const q: Pt = [x1 + s * 5.2, cy];
      const [a, b] = [2.6, 1.7];
      const lz: Pt[] = [
        [q[0] - s * a, q[1]],
        [q[0], q[1] - b],
        [q[0] + s * a, q[1]],
        [q[0], q[1] + b],
        [q[0] - s * a, q[1]],
      ];
      out.push(...pen(lz, 'thin', SCORE * 0.15, 0.22, { ease: false }));
      // Its upper half shaded too.
      out.push({ d: poly([lz[1], lz[3]]), kind: 'hatch', delay: SCORE * 0.15 + 0.2, t: 0.1 });
    }
    return out;
  };

  const reach = grooves ? inner + L + 8 : withMarks ? inner : nameW / 2 + 6;
  return {
    name: [cx, cy],
    marks,
    strokes: build(true),
    glow: glowOf(build(false)),
    pool: { cx, cy, rx: Math.min(head.w / 2, reach * 0.92 + 18), ry: nameH * 0.95 },
    start,
    step,
  };
}
