// A fossil's question (Delve): the item's stage set in the amber of the card
// it was picked from (lib/amber.ts paints it, as the card's), the item and
// its circle laid over it. The lamp behind it is turned low while the
// question is up: the resin dark at the stage's edges, warm behind the item,
// the fossil somewhere in it, unseen. A right answer brings the lamp up and
// the fossil shows in it (lib/fossilFlight.ts); a wrong one lets it go out.
// Asked by pictures, each picture has a slab of its own.
//
// The slab is the card's at full light, its reach set by the stage's size;
// how low the lamp stands is a shade laid over it (StageAmber.svelte), so the
// amber's flows, flakes and specks stay put whatever the light does: only
// how much of it comes through changes, as with a real lamp behind a pane.

import type { AmberSlab, Pt } from './amber';
import type { FossilTier } from './fossils';

/** How the lamp behind the stage stands: turned low while the question is up; out, the fossil lost. */
export type StageLamp = 'low' | 'out';

/**
 * The stage's slab, `w` x `h` (its layout px): the lamp behind its middle
 * (the item's), its light carried across a wide stage and a little further
 * on a rare's, its drop the clear round the circle stands on (none round a
 * picture's, which has no circle). `seed`, the question's own.
 */
export function stageSlab(w: number, h: number, tier: FossilTier, seed: number, circle = true): AmberSlab {
  const rare = tier === 'rare';
  const c: Pt = [w / 2, h / 2];
  const m = Math.min(w, h);
  const k = rare ? 1.12 : 1;
  const rx = Math.max(m * 0.6, w * 0.34) * k;
  const ry = m * 0.56 * k;
  // (A wide stage's ends lit dimly too, as a card's row is, so they're amber and not black.)
  const fill = w > h * 1.4 ? { c, rx: w * 0.6, ry: h, a: 0.16 } : undefined;
  // The circle's band starts at 81 of its 100 (docs/arcane-style.md), the circle 92% of the stage's height at most (ArcaneStage).
  const r = Math.min(w * 0.92, h * 0.92, 420) * 0.5 * 0.81;
  return { w, h, lamp: c, rx, ry, ...(fill ? { fill } : {}), drop: circle ? { c, r, tipY: c[1] - r } : null, rare, seed };
}

/** A question's own seed for its amber, from when it was asked; a picture's, its place among them besides. */
export const stageSeed = (askedAt: number, i = 0) => (Math.floor(askedAt / 997) % 9973) + 1 + i * 101;

/**
 * The shade over the slab, as a CSS background for a box the slab's size,
 * multiplied over it: what of the lamp's light still comes through, each
 * colour by itself, most at the lamp's heart and less out to the edges. Not
 * a grey: with less light behind it amber reads deeper, not olive, so the
 * green and blue go first, as if through more of it (the honey heart going
 * orange, its middle cognac, its edges a dark red-brown). `low`: the
 * question's lamp; `out`: one gone out, an ember left at its heart. The
 * dither over it stirs it (CLAUDE.md, "No banding": a gradient carried by
 * colour takes the dither first).
 */
export function stageShade(slab: AmberSlab, lamp: StageLamp, rare: boolean): string {
  const [x, y] = slab.lamp;
  const at = [0, 0.16, 0.34, 0.54, 0.76, 1];
  // What comes through (red, green, blue, of 1) at each stop, out from the heart; a rare's redder still.
  const low: [number, number, number][] = rare
    ? [[0.86, 0.56, 0.34], [0.8, 0.5, 0.32], [0.7, 0.42, 0.3], [0.58, 0.35, 0.28], [0.5, 0.31, 0.27], [0.44, 0.29, 0.27]]
    : [[0.84, 0.6, 0.36], [0.78, 0.54, 0.34], [0.68, 0.46, 0.31], [0.57, 0.39, 0.29], [0.49, 0.34, 0.28], [0.43, 0.31, 0.28]];
  // (Out lies over low: what's left of that.)
  const out: [number, number, number][] = [[0.32, 0.26, 0.36], [0.3, 0.25, 0.35], [0.3, 0.27, 0.35], [0.31, 0.3, 0.34], [0.34, 0.33, 0.34], [0.36, 0.36, 0.36]];
  const r = `${(slab.rx * 1.3).toFixed(1)}px ${(slab.ry * 1.3).toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px`;
  const g = (lamp === 'low' ? low : out).map(([cr, cg, cb], i) => `rgb(${Math.round(cr * 255)} ${Math.round(cg * 255)} ${Math.round(cb * 255)}) ${(at[i] * 100).toFixed(0)}%`).join(', ');
  return `radial-gradient(${r}, ${g})`;
}
