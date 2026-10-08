// Delve's zone gate (Threshold.svelte): a waystone gate built over the depth
// banner. Two columns stand close beside the heading, a lintel spans them
// just above it (in the room the head keeps there) with the zone's name lit
// along its face, and a keystone set in the lintel's crown bears the zone's
// sigil; a sill runs
// under the heading, so "Depth N" stands in the doorway. Engraved in the
// alchemist's circle's manner (docs/arcane-style.md): exact geometry (the
// lintel's joints and the keystone's flanks all radiate from one centre
// below, as in a flat arch), lines stopping short of the name and the
// keystone, one-sided hatching (the columns' right sides, the lintel's lower
// fascia, the keystone's right bevel), a little wear. Pure geometry, px in
// the head's box (./head).

import type { Head } from './head.ts';
import { glowOf, pen, poly, wearOf, type Hole, type Pt, type Stroke } from './pen.ts';

const f = (v: number) => v.toFixed(2);

export type Part = { strokes: Stroke[]; glow: ReturnType<typeof glowOf> };
export type ThresholdArt = {
  cx: number;
  /** The lintel's top and bottom, its ends, and the band either side of the name. */
  yt: number;
  yb: number;
  x0: number;
  x1: number;
  /** Where the name's middle goes. */
  name: Pt;
  pillars: Part;
  lintel: Part;
  keystone: Part;
  sill: Part;
  /** The keystone's sign: centre and size (px across). */
  sign: { c: Pt; s: number };
  /** The dark stone under the lines, by part. */
  ground: { lintel: string; key: string; pillars: string };
  /** The doorway between the columns, under the lintel: the zone's light shows through it. */
  door: { x0: number; x1: number; y0: number; y1: number };
  /** The top of the keystone: the gate's highest point. */
  top: number;
};

/** When the gate starts building (s after its depth's cards are dealt: once the stage has faded in), and when it is told to leave. */
export const DELAY = 0.35;
export const HOLD = 4.1;
/** How long it takes to leave (s): it is removed after this. With reduced motion or the effects off it only fades, in STILL_FADE. */
export const EXIT = 1.05;
export const STILL_FADE = 0.6;

export function thresholdArt(head: Head, nameW: number, em: number): ThresholdArt {
  const n = head.narrow;
  const cx = (head.rl0 + head.rr1) / 2;
  const band = n ? 2.3 : 3.1;
  // Room round the name on the lintel's face: it never touches the lines.
  const H = em * 1.22 + 2 * band;
  // The lintel sits just clear of the heading's capitals; the head keeps the
  // room above it for the lintel and keystone (Game.svelte's .kicker line).
  const yb = head.capTop - (n ? 4 : 7);
  const yt = yb - H;
  const pw = n ? 9 : 15;
  const cap = n ? 1.8 : 2.6;
  // The doorway is the heading's own width (and a little): the columns stand close beside it.
  const gx = head.size * (n ? 0.42 : 0.46);
  const pcs = [head.hx0 - gx - pw / 2, head.hx1 + gx + pw / 2];
  const over = n ? 4 : 7;
  const half = Math.min(head.w / 2 - 5, Math.max(nameW / 2 + (n ? 22 : 38), (pcs[1] - pcs[0]) / 2 + pw / 2 + cap + over));
  const [x0, x1] = [cx - half, cx + half];
  // The cornice on top runs out past the lintel's ends.
  const co = n ? 2.5 : 4;
  const ybase = Math.min(head.h - 1.5, Math.max(head.base + head.size * 0.24 + 3, head.hy1 - (n ? 2 : 4)));

  // Every joint radiates from O, below the lintel's middle (a flat arch).
  const O: Pt = [cx, yb + 3.4 * half];
  const along = (p: Pt, y: number): Pt => {
    const k = (O[1] - y) / (O[1] - p[1]);
    return [O[0] + (p[0] - O[0]) * k, y];
  };
  const kh = n ? 12 : 18;
  const kb = n ? 7 : 12;
  const kBot: Pt[] = [
    [cx - kb, yt + band],
    [cx + kb, yt + band],
  ];
  const kTop = kBot.map((p) => along(p, yt - kh));
  const nameBox: Hole = { box: [cx - nameW / 2 - 8, yt + band + 0.4, cx + nameW / 2 + 8, yb - band - 0.4] };
  const keyHole: Hole = { box: [kTop[0][0] - 0.8, yt - kh - 2, kTop[1][0] + 0.8, yt + band + 0.3] };

  const build = (worn: boolean) => {
    const wear = worn ? wearOf(53) : null;
    const pillars: Stroke[] = [];
    const lintel: Stroke[] = [];
    const keystone: Stroke[] = [];
    const sill: Stroke[] = [];

    // ---- the columns: plinth, fluted shaft shaded down its right side, echinus and abacus ----
    const a = n ? 1.8 : 2.6;
    const e = n ? 2.2 : 3.4;
    const bh = n ? 2.2 : 3.2;
    for (const px of pcs) {
      const [l, r] = [px - pw / 2, px + pw / 2];
      const [ye, ys] = [yb + a + e, ybase - bh];
      // The plinth.
      pillars.push(...pen([[l - cap, ys], [l - cap, ybase]], 'main', 0, 0.06));
      pillars.push(...pen([[r + cap, ys], [r + cap, ybase]], 'main', 0, 0.06));
      pillars.push(...pen([[l - cap, ys], [r + cap, ys]], 'main', 0.04, 0.1));
      // The shaft, drawn up from the plinth.
      pillars.push(...pen([[l, ys], [l, ye]], 'main', 0.06, 0.34, { wear }));
      pillars.push(...pen([[r, ys], [r, ye]], 'main', 0.08, 0.34, { wear }));
      const flutes = n ? [0] : [-pw / 6, pw / 6];
      for (const fx of flutes) pillars.push(...pen([[px + fx, ys - 0.8], [px + fx, ye + 0.8]], 'hair', 0.14, 0.32));
      if (worn) {
        const from = px + (n ? 1.2 : pw / 6 + 1);
        for (let x = from; x < r - 0.6; x += n ? 1.05 : 1.1) pillars.push(...pen([[x, ys - 0.6], [x, ye + 0.6]], 'hatch', 0.38, 0.22));
      }
      // The echinus swelling to the abacus, its right half shaded.
      const ew = pw / 2 + cap * 0.75;
      pillars.push(...pen([[l, ye], [px - ew, yb + a]], 'thin', 0.36, 0.08));
      pillars.push(...pen([[r, ye], [px + ew, yb + a]], 'thin', 0.36, 0.08));
      pillars.push(...pen([[l - cap, yb + a], [r + cap, yb + a]], 'main', 0.4, 0.1));
      pillars.push(...pen([[l - cap, yb], [l - cap, yb + a]], 'main', 0.44, 0.05));
      pillars.push(...pen([[r + cap, yb], [r + cap, yb + a]], 'main', 0.44, 0.05));
      if (worn)
        for (let k = 1; k * 0.9 < e; k++) {
          const y = ye - k * 0.9;
          const w = pw / 2 + ((ew - pw / 2) * (ye - y)) / e;
          pillars.push(...pen([[px + 0.6, y], [px + w - 0.5, y]], 'hatch', 0.48, 0.1));
        }
    }

    // ---- the lintel: cornice and fascia lines from the middle out, its ends, its joints ----
    const edges: [number, number, 'main' | 'thin' | 'hair', number, number][] = [
      [yt, 0.22, 'main', 0.4, co],
      [yt + band, 0.26, 'main', 0.4, co],
      [yt + band + (n ? 1.3 : 1.7), 0.3, 'hair', 0.38, 0],
      [yb - band, 0.28, 'thin', 0.38, 0],
      [yb, 0.22, 'main', 0.4, 0],
    ];
    for (const [y, d, kind, t, out] of edges)
      for (const s of [-1, 1]) lintel.push(...pen([[cx, y], [cx + s * (half + out), y]], kind, d, t, { holes: [keyHole], wear: kind === 'main' ? wear : null }));
    for (const s of [-1, 1]) {
      lintel.push(...pen([[cx + s * (half + co), yt], [cx + s * (half + co), yt + band]], 'main', 0.58, 0.05));
      lintel.push(...pen([[cx + s * half, yt + band], [cx + s * half, yb]], 'main', 0.6, 0.08));
    }
    // Joints between the stones, out from the name, each radiating from O.
    const sw = H * 1.55;
    for (const s of [-1, 1])
      for (let k = 0, d = nameW / 2 + (n ? 12 : 18); d < half - sw * 0.45; k++, d += sw) {
        const pb: Pt = [cx + s * d, yb - band];
        lintel.push(...pen([pb, along(pb, yt + band + (n ? 1.3 : 1.7))], 'thin', 0.5 + k * 0.05, 0.1));
      }
    // The lower fascia shaded: short slanting strokes all along it.
    if (worn) {
      const g = n ? 1.5 : 1.7;
      for (let x = x0 + 1; x < x1 - 1 - band; x += g) {
        const p: Pt = [x, yb - 0.5];
        const q: Pt = [x + band - 1, yb - band + 0.5];
        lintel.push({ d: poly([p, q]), kind: 'hatch', delay: 0.6 + (Math.abs(x - cx) / half) * 0.25, t: 0.12 });
      }
    }

    // ---- the keystone, set into the crown: double flanks, top, its right bevel shaded ----
    const inset = n ? 1.1 : 1.5;
    const [kl, kr] = [kBot[0], kBot[1]];
    const [tl, tr] = kTop;
    keystone.push(...pen([kl, tl], 'main', 0, 0.16), ...pen([kr, tr], 'main', 0, 0.16), ...pen([tl, tr], 'main', 0.14, 0.12));
    const il: Pt[] = [
      [kl[0] + inset, kl[1]],
      [tl[0] + inset, tl[1] + inset],
    ];
    const ir: Pt[] = [
      [kr[0] - inset, kr[1]],
      [tr[0] - inset, tr[1] + inset],
    ];
    keystone.push(...pen([il[0], il[1], ir[1], ir[0]], 'hair', 0.08, 0.3));
    if (worn)
      for (let y = tr[1] + inset + 0.8; y < kr[1] - 0.4; y += n ? 0.95 : 1.05) {
        const t = (y - tr[1]) / (kr[1] - tr[1]);
        const xo = tr[0] + (kr[0] - tr[0]) * t;
        keystone.push({ d: poly([[xo - inset + 0.35, y], [xo - 0.35, y]]), kind: 'hatch', delay: 0.3, t: 0.1 });
      }

    // ---- the sill, under the heading, from the middle out ----
    const [sl, sr] = [pcs[0] - pw / 2 - cap, pcs[1] + pw / 2 + cap];
    for (const x of [sl, sr]) {
      sill.push(...pen([[cx, ybase], [x, ybase]], 'main', 0.1, 0.42, { wear }));
      sill.push(...pen([[cx, ybase + 1.6], [x + (x < cx ? 2 : -2), ybase + 1.6]], 'hair', 0.16, 0.4));
    }

    return { pillars, lintel, keystone, sill };
  };
  const worn = build(true);
  const clean = build(false);
  const part = (k: keyof typeof worn): Part => ({ strokes: worn[k], glow: glowOf(clean[k]) });

  const rect = (ax: number, ay: number, bx: number, by: number) => `M${f(ax)} ${f(ay)}H${f(bx)}V${f(by)}H${f(ax)}Z`;
  const ground = {
    lintel: rect(x0 - co, yt, x1 + co, yt + band) + rect(x0, yt + band, x1, yb),
    key: poly([kBot[0], kTop[0], kTop[1], kBot[1]], true),
    pillars: pcs.map((px) => rect(px - pw / 2, yb, px + pw / 2, ybase) + rect(px - pw / 2 - cap, yb, px + pw / 2 + cap, yb + 2.6)).join(''),
  };

  return {
    cx,
    yt,
    yb,
    x0,
    x1,
    name: [cx, (yt + yb) / 2],
    ...{ pillars: part('pillars'), lintel: part('lintel'), keystone: part('keystone'), sill: part('sill') },
    sign: { c: [cx, (yt - kh + yt + band) / 2 + 0.3], s: (kh + band) * 0.74 },
    ground,
    door: { x0: pcs[0] + pw / 2, x1: pcs[1] - pw / 2, y0: yb, y1: ybase },
    top: yt - kh,
  };
}
