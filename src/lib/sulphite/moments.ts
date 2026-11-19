// The Sulphite card's moments (ChooseCategory), beside the finds' and the
// way out's: its light is the charged ore's, a sulphur yellow, its sparks
// the pale of a bolt. Each moment also tells the card's charge
// (SulphiteCharge.svelte) to strike, so the bolts engraved on its face light
// as the light swells: the charge first, then what it throws.

import { fxActive, type Handle, type Vec3 } from '../fx/core';
import { C, embers, emitter, flare, glints, outline, puffs, ring, sparks } from '../fx/effects';
import { light } from '../lights';

/** The ore's colours, in the effects' light (fx/effects C): its sulphur, and a bolt's pale heart. */
export const SULPHITE: { main: Vec3; pale: Vec3; lamp: Vec3 } = {
  main: [2.45, 2.45, 0.45],
  pale: [3, 3, 2],
  lamp: [0.92, 0.92, 0.28],
};

/** What the charge is told: the card dealt face up, or picked. */
export type Strike = 'deal' | 'pick';
/** Tells the charge on this face to strike (SulphiteCharge listens on its face). */
export const strike = (frame: Element, how: Strike) => frame.dispatchEvent(new CustomEvent<Strike>('sulphite', { detail: how }));

const dim = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

/** Dealt face up: the bolts strike off the ring one after another, its edge catches, a few sparks. */
export function sulphiteRevealed(frame: Element) {
  strike(frame, 'deal');
  if (!fxActive()) return;
  const { main, pale, lamp } = SULPHITE;
  outline(frame, { color: dim(main, 0.75), width: 10, intensity: 0.9, life: 1, fadeIn: 0.06 });
  glints(frame, { count: 6, area: 'edge', color: pale, size: [3, 7], delay: [0.05, 0.45] });
  sparks(frame, { count: 18, area: 'edge', speed: [140, 420], life: [0.15, 0.4], colors: [pale, main], gravity: 120, stretch: 0.03 });
  light(frame, { color: lamp, radius: 260, intensity: 0.32, decay: 0.8 });
}

/** The pointer on it: its edge holds a charge, crackling (the bolt toward the pointer is the charge's own). */
export function sulphiteHover(frame: Element, card: Element): Handle {
  if (!fxActive()) return { stop() {} };
  const { main, pale } = SULPHITE;
  const glow = outline(frame, { color: dim(main, 0.65), width: 12, flame: 0.45, pulse: 0.5, intensity: 0.55, fadeIn: 0.2, base: card });
  // Short, fast sparks off the edge now and then, as a charge leaks.
  const crackle = emitter(4, () => sparks(frame, { count: 3, area: 'edge', speed: [90, 260], life: [0.08, 0.22], colors: [pale], gravity: 0, stretch: 0.02, size: [0.6, 1.1] }));
  return {
    stop() {
      glow.stop(0.35);
      crackle.stop();
    },
  };
}

/** Picked (its face, the card it's on): every bolt strikes at once and the charge breaks out of the card; the other cards burn away. */
export function sulphitePicked(frame: Element, base: Element, others: Element[]) {
  strike(frame, 'pick');
  if (!fxActive()) return;
  const { main, pale, lamp } = SULPHITE;
  for (const o of others) {
    embers(o, { count: 24, area: 'fill', colors: [C.ember, C.emberDeep, C.ash], rise: [60, 200], life: [0.6, 1.6] });
    puffs(o, { count: 6, area: 'fill', color: [0.14, 0.09, 0.05] });
  }
  outline(frame, { color: main, width: 16, flame: 0.5, intensity: 1, life: 1.2, base });
  sparks(frame, { count: 46, area: 'edge', speed: [180, 640], life: [0.18, 0.55], colors: [pale, main], gravity: 160, stretch: 0.035 });
  ring(frame, { radius: 270, thickness: 8, life: 0.6, color: pale, breakup: 0.45 });
  flare(frame, { size: 40, streak: 380, life: 0.55, color: pale });
  light(frame, { color: lamp, radius: 380, intensity: 0.75, decay: 0.9 });
}
