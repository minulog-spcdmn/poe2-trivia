// Delve: a flare burns as the clock runs out, for FLARE_MS more on the same
// question. The effects overlay's part of it: the fire and light. The page's
// own part (lib/flareBurn.ts), which calls these, carries the moment by
// itself: the flare flaring in the player's entry, the streak to the clock,
// the clock burning while the added seconds run, the flare's light in the
// middle of the screen with the dark seeping back in round it.
//
// Everything here is placed at points the page measured (never an element,
// which the overlay would measure again every frame), in a road flare's
// red: the Flare Cache's crimson and its pink-white heart.

import { after, type Handle, type Point, type Vec3 } from './core';
import { C, emitter, flash, rand, ring, sparks } from './effects';
import { FIND_COLORS } from './moments';
import { light, pulseMood } from '../lights';

const RED = FIND_COLORS.flare.main;
const PALE = FIND_COLORS.flare.pale;
/** The light it throws on the scene behind the UI (lib/lights.ts, unit colour). */
const GLOW: Vec3 = [1, 0.3, 0.4];

/** A circle on screen: the clock's ring, its centre and radius (viewport px). */
export type Ring = { x: number; y: number; r: number };

const square = (c: Ring) => new DOMRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);

/**
 * The strike: the flare (`icon`) catches with a hot flash and a burst of
 * sparks; sparks drop off the streak's `path` (points along it, with the
 * second each is passed); at `ignite` seconds it reaches the clock (`clock`)
 * and sets it alight: a flash, a ring of fire running out, sparks off its
 * edge, a red light on the scene.
 */
export function flareStruck(icon: Point | null, path: { at: Point; t: number }[], clock: Ring | null, ignite: number) {
  if (icon) {
    flash(icon, { radius: 26, color: PALE, intensity: 0.45, life: 0.45 });
    sparks(icon, { count: 16, colors: [RED, PALE, C.whiteHot], speed: [90, 300], gravity: 260, drag: 2.4, life: [0.25, 0.6] });
    light(icon, { color: GLOW, radius: 140, intensity: 0.22, hold: 0.05, decay: 0.6 });
  }
  for (const p of path) after(p.t, () => sparks(p.at, { count: 2, colors: [RED, PALE], speed: [20, 90], gravity: 320, drag: 2, life: [0.2, 0.45], size: [0.6, 1.1] }));
  if (!clock) return;
  after(ignite, () => {
    const r = clock.r;
    flash(clock, { radius: r * 2.6, color: PALE, intensity: 0.5, life: 0.6 });
    ring(clock, { radius: r * 3, from: r * 0.9, thickness: 6, life: 0.7, color: RED, breakup: 0.5, fill: 0, intensity: 0.85 });
    ring(clock, { radius: r * 2, from: r * 0.9, thickness: 3, life: 0.45, color: C.whiteHot, breakup: 0.3, fill: 0, intensity: 0.5, delay: 0.06 });
    sparks(square(clock), { count: 24, area: 'edge', colors: [RED, PALE, C.whiteHot], speed: [120, 400], gravity: 200, drag: 2, life: [0.3, 0.7] });
    light(clock, { color: GLOW, radius: 260, intensity: 0.45, hold: 0.12, decay: 1 });
    pulseMood(0.12, GLOW);
  });
}

/**
 * The burning: while the added seconds run, the clock's burning tip (where
 * `now` says it is, with how much of the flare is left, 0 to 1) sputters
 * sparks, and the flare's light flickers on the scene about the clock,
 * both dying down with what is left. Stop the handle when it goes out.
 */
export function flareBurning(now: () => { clock: Ring; tip: Point; out: Point; level: number }): Handle {
  const spit = emitter(16, () => {
    const s = now();
    if (Math.random() > 0.25 + 0.75 * s.level) return;
    // Out from the ring at the tip, and round it.
    const a = Math.atan2(s.out.y, s.out.x);
    sparks(s.tip, { count: 1, angle: a, spread: 1.6, colors: [RED, PALE, C.whiteHot], speed: [40, 150], gravity: 220, drag: 2.2, life: [0.2, 0.5], size: [0.6, 1.2] });
  });
  const flicker = emitter(7, () => {
    const s = now();
    light(s.clock, { color: GLOW, radius: 150 + s.clock.r * 2, intensity: rand(0.1, 0.26) * (0.3 + 0.7 * s.level), attack: 0.03, hold: 0.02, decay: 0.3 });
  });
  // A soft hot spot on the tip, renewed as it moves on.
  const tip = emitter(4.5, () => {
    const s = now();
    flash(s.tip, { radius: 10 + s.clock.r * 0.25, color: PALE, intensity: 0.18 * (0.4 + 0.6 * s.level), life: 0.3 });
  });
  return {
    stop() {
      spit.stop();
      flicker.stop();
      tip.stop();
    },
  };
}
