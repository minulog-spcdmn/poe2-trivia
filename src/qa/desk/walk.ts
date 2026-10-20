// The scenes' walk sizes (the sizes a scene is checked at by the sweep,
// scripts/qa.mjs) and the shelf's search.

import { SCREENS, type Scene } from '../scene.ts';
import { SIZES, WALK_SIZES, type SizeKey } from '../sizes.ts';

const ORDER = new Map<string, number>(SIZES.map((s, i) => [s.key, i]));

/** The sizes a scene is walked at: the desk's own, its own, those its boards were drawn at and any `more` (where a sweep found something), smallest first. */
export function sizesFor(scene: Scene, more: SizeKey[] = []): SizeKey[] {
  const all = new Set<SizeKey>([...WALK_SIZES, ...(scene.sizes ?? []), ...(Object.keys(scene.boards ?? {}) as SizeKey[]), ...more]);
  return [...all].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}

const SCREEN_LABEL = new Map<string, string>(SCREENS.map((s) => [s.key, s.label]));

/** Whether a scene (or one of its states, `more` its words) answers a search: every word in its label, key, group or screen. */
export function matches(scene: Scene, query: string, more = ''): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = `${more} ${scene.label} ${scene.key} ${scene.group} ${SCREEN_LABEL.get(scene.screen) ?? ''}`.toLowerCase();
  return words.every((w) => text.includes(w));
}
