// What each place builds (a scene's first state, a state with a key of its
// own): a print of it, the room and all a seat's device holds, for This
// change (change.ts). A change to the desk's own scenes lights only the
// places it builds differently from the scene map's prints (its `builds`),
// and a place the map hasn't got is new. Built in node
// (scripts/place-builds.ts), the clock and chance held still, so the same
// code prints the same anywhere, any day.

import { seatsIn, type Scene } from './scene.ts';
import { buildScene } from './tweaks.ts';
import type { Values } from './bench.ts';

/** The moment every place is built at. */
const AT = Date.UTC(2026, 10, 1, 12);

/** Each place of `scenes` by its key, with the controls it's built with. */
export function placesOf(scenes: Scene[]): { key: string; scene: Scene; values: Values }[] {
  return scenes.flatMap((scene) =>
    (scene.states ?? [{ values: {} }]).flatMap((st, n) => {
      const key = 'key' in st && st.key ? st.key : n === 0 ? scene.key : null;
      return key ? [{ key, scene, values: st.values }] : [];
    }),
  );
}

/** Each place's print, by its key (`failed` where it doesn't build). */
export function placeBuilds(scenes: Scene[]): Record<string, string> {
  const Real = globalThis.Date;
  const random = Math.random;
  const Still = class extends Real {
    constructor(...a: unknown[]) {
      if (a.length) super(...(a as [number]));
      else super(AT);
    }
    static now() {
      return AT;
    }
  } as DateConstructor;
  const out: Record<string, string> = {};
  globalThis.Date = Still;
  try {
    for (const { key, scene, values } of placesOf(scenes)) {
      let seed = 1;
      Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      try {
        const built = buildScene(scene, values).built;
        const seats = seatsIn(scene, built).map((s) => `${s.mode}:${s.me}`);
        out[key] = hash(JSON.stringify({ built, seats }, (_, x) => (typeof x === 'function' ? String(x) : x)));
      } catch {
        out[key] = 'failed';
      }
    }
  } finally {
    globalThis.Date = Real;
    Math.random = random;
  }
  return out;
}

/** A short print of `text` (cyrb53). */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
