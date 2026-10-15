// Spatial sound's plans, worked out apart from the audio so they can be
// tested (lib/spatial.svelte.ts plays them): where across the screen a
// sound sits and how it travels, and which places' rooms are wanted.

import { bedsAt, nextPlaceAt } from './sound.ts';
import { ROOMS } from './acoustics.ts';

/** The part of a box (an element's, or the screen's) that placing reads. */
type Box = { left: number; width: number; height: number };

/**
 * A place across the screen, -1 (its left edge) to 1 (its right): an
 * element's middle (its box), a point (`x`, px), or half way between the
 * two (a control hovered: a wide one sounds a little to the side it is
 * hovered on). A box with no size counts as none. Null for neither.
 */
export function screenX(box: Box | null, x: number | undefined, screen: Pick<Box, 'left' | 'width'>): number | null {
  let cx = x;
  if (box && (box.width || box.height)) {
    const mid = box.left + box.width / 2;
    cx = x === undefined ? mid : (mid + x) / 2;
  }
  if (cx === undefined) return null;
  return Math.max(-1, Math.min(1, ((cx - screen.left) / screen.width) * 2 - 1));
}

const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/**
 * Where a sound is across the screen `t` s from its start: from `from` to
 * `to` over `seconds`, eased, when sounds move; otherwise where it lands
 * (`to`), or with `edge` (a blast bursting in) where it starts. One of the
 * two places is enough; with neither, the middle.
 */
export function travel(from: number | null, to: number | null, seconds: number, moving: boolean, edge = false): (t: number) => number {
  const a = from ?? to ?? 0;
  const b = to ?? a;
  const along = (t: number) => (seconds > 0 && moving ? ease(Math.min(1, t / seconds)) : to !== null && !edge ? 1 : 0);
  return (t) => a + (b - a) * along(t);
}

/** A pointer's hovers this close together (s) are a sweep across controls. */
export const HOVER_SWEEP = 0.5;
/** How much quieter (dB) each hover in a sweep comes than the one before, and how many steps down it goes at most. */
export const HOVER_STEP = 2;
export const HOVER_STEPS = 4;

/**
 * A pointer's hover at `now` (s), after the one before (`prev`): in a sweep
 * across controls each comes a step quieter than the last, down to a floor;
 * after a pause it is back to full. Its step, and how much quieter (dB).
 */
export function hoverStep(prev: { at: number; step: number } | null, now: number): { at: number; step: number; db: number } {
  const step = prev && now - prev.at < HOVER_SWEEP ? Math.min(prev.step + 1, HOVER_STEPS) : 0;
  return { at: now, step, db: step ? -HOVER_STEP * step : 0 };
}

/**
 * The rooms at a Delve depth (with rooms `on`): the places sounding, each
 * with its share (as the beds have them), the next place down (its room
 * worked out ahead, as its bed is fetched), and the places whose rooms are
 * worth keeping (the two together). Outside Delve or with rooms off, none.
 */
export function roomPlan(depth: number, on: boolean): { wanted: { place: string; weight: number }[]; next: string | null; kept: Set<string> } {
  if (!on || !(depth >= 1)) return { wanted: [], next: null, kept: new Set() };
  const wanted = bedsAt(depth)
    .beds.filter((b) => ROOMS[b.place])
    .map(({ place, weight }) => ({ place, weight }));
  const n = nextPlaceAt(depth);
  const next = ROOMS[n] ? n : null;
  const kept = new Set(wanted.map((w) => w.place));
  if (next) kept.add(next);
  return { wanted, next, kept };
}
