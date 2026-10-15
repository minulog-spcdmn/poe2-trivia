// Spatial sound's plans, worked out apart from the audio so they can be
// tested (lib/spatial.svelte.ts plays them): where across the screen a
// sound sits and how it travels, and which places' rooms are wanted.

import { bedsAt, nextPlaceAt } from './sound.ts';
import { ROOMS, seeded } from './acoustics.ts';
import type { LayerTweak } from './sound.ts';

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
 * A pointer's hover at `now` (s), after the last (`prev`), eased rather
 * than stepped: how busy hovering is (each hover adds one, the whole fading
 * by half every `recover` s), and how far (0 to 1) the hover is ducked for
 * the busyness it finds: none after a pause, a little while browsing
 * calmly, more the faster a sweep goes (`weight`: how quickly busyness
 * turns into ducking), and easing back as the pointer slows, with no steps
 * and no snap back.
 */
export function hoverEase(prev: { at: number; busy: number } | null, now: number, recover: number, weight: number): { at: number; busy: number; amount: number } {
  const before = prev ? prev.busy * Math.pow(0.5, Math.max(0, now - prev.at) / recover) : 0;
  return { at: now, busy: before + 1, amount: 1 - Math.exp(-before * weight) };
}

/**
 * How much (0 to 1) a hover is softened for the pointer's speed as it came
 * over its control (`speed`, screen widths a second): none at `slow` or
 * below, all at `fast` or above, eased between. A quick flick barely brushes
 * a control; a slow arrival sounds it in full.
 */
export function speedAmount(speed: number, slow: number, fast: number): number {
  const u = Math.max(0, Math.min(1, (speed - slow) / Math.max(1e-6, fast - slow)));
  return u * u * (3 - 2 * u);
}

/**
 * `count` takes of a sound of `layers` layers, made from its own recordings
 * as different takes of it would be: per layer a little louder or softer
 * (up to 3 dB), a hair later (up to 6 ms), a touch higher or lower (up to
 * 4%), started a few ms into its recording (up to 8 ms: a different attack),
 * and a gentle bump or dip in its tone (up to 3 dB, 600 Hz to 7 kHz), all of
 * it scaled by `variety` (0 to 1). The same seed gives the same takes; the
 * first is the sound as it is.
 */
export function takes(count: number, layers: number, variety: number, seed = 1): LayerTweak[][] {
  const rand = seeded(seed);
  const spread = (r: number) => (rand() * 2 - 1) * r * variety;
  return Array.from({ length: count }, (_, k) =>
    Array.from({ length: layers }, () => {
      const t = { gainDb: spread(3), delayMs: rand() * 6 * variety, rate: 1 + spread(0.04), offsetMs: rand() * 8 * variety, peakHz: 600 * Math.pow(7000 / 600, rand()), peakDb: spread(3) };
      return k === 0 ? { gainDb: 0, delayMs: 0, rate: 1, offsetMs: 0, peakHz: 1000, peakDb: 0 } : t;
    }),
  );
}

/** The take to play after `last` (-1 for none yet) of `count`: any but the last, so none comes twice running. */
export function nextTake(last: number, count: number, rand = Math.random): number {
  if (count <= 1) return 0;
  const k = Math.floor(rand() * (count - 1));
  return last >= 0 && k >= last ? k + 1 : k;
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
