// The desk's walk: every stop it shows, in order. A stop is one scene at one
// size: on a touch screen with all its seats side by side (a phone's is
// narrow enough for two or three at 1:1), on a larger one a seat at a time.

import { SCREENS, type Scene } from '../scene.ts';
import { SIZES, WALK_SIZES, sizeOf, type SizeKey } from '../sizes.ts';

export interface Stop {
  /** `scene|size|seat` ('all': every seat side by side). */
  id: string;
  scene: Scene;
  size: SizeKey;
  /** The seats shown, by their index in the scene. */
  seats: number[];
}

const ORDER = new Map<string, number>(SIZES.map((s, i) => [s.key, i]));

/** The sizes a scene is walked at: the desk's own, its own, those its boards were drawn at and any `more` (where a sweep found something), smallest first. */
export function sizesFor(scene: Scene, more: SizeKey[] = []): SizeKey[] {
  const all = new Set<SizeKey>([...WALK_SIZES, ...(scene.sizes ?? []), ...(Object.keys(scene.boards ?? {}) as SizeKey[]), ...more]);
  return [...all].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}

export const stopId = (key: string, size: SizeKey, seat: number | 'all') => `${key}|${size}|${seat}`;
/** The stop a seat of a scene is shown in at a size. */
export const stopOf = (key: string, seats: number, size: SizeKey, seat: number) => stopId(key, size, seats === 1 ? 0 : sizeOf(size).touch ? 'all' : seat);

/** Every stop, in order; `more`: sizes to walk some scenes at besides their own, by scene key. */
export function walk(scenes: Scene[], more: Map<string, SizeKey[]> = new Map()): Stop[] {
  const stops: Stop[] = [];
  for (const scene of scenes)
    for (const size of sizesFor(scene, more.get(scene.key))) {
      const seats = scene.seats.map((_, i) => i);
      if (sizeOf(size).touch || seats.length === 1) stops.push({ id: stopId(scene.key, size, seats.length === 1 ? 0 : 'all'), scene, size, seats });
      else for (const i of seats) stops.push({ id: stopId(scene.key, size, i), scene, size, seats: [i] });
    }
  return stops;
}

const SCREEN_LABEL = new Map<string, string>(SCREENS.map((s) => [s.key, s.label]));

/** Whether a scene answers a search: every word in its label, key, group or screen. */
export function matches(scene: Scene, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = `${scene.label} ${scene.key} ${scene.group} ${SCREEN_LABEL.get(scene.screen) ?? ''}`.toLowerCase();
  return words.every((w) => text.includes(w));
}
