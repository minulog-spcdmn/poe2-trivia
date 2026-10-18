// Every scene the QA desk walks, in the order it walks them: by screen, as
// a game goes (SCREENS in ../scene.ts), then as each file lists them.
// Call useEngine (../build/engine.ts) before catalog().

import { SCREENS, type Scene } from '../scene.ts';
import type { SizeKey } from '../sizes.ts';
import { endScenes, type EndView } from './over.ts';

/** The end screen page's windows, as the desk's sizes. */
const END_SIZE: Record<EndView, SizeKey> = {
  desktop: 'desktop',
  air13: 'laptop',
  tablet: 'tablet',
  phone: 'phone390',
  phone375: 'phone',
  narrow: 'narrow',
  big: 'uhd150',
  landscape: 'landscape',
};

function overScenes(): Scene[] {
  return endScenes().map((e) => {
    const { key, group, label, boards, view, mode, me, ...built } = e;
    return {
      key: `over/${key}`,
      screen: 'over',
      group,
      label,
      seats: [{ mode, me }],
      sizes: [END_SIZE[view]],
      boards: boards && Object.fromEntries(Object.entries(boards).map(([v, board]) => [END_SIZE[v as EndView], board])),
      build: () => built,
    };
  });
}

let built: Scene[] | null = null;

/** Every scene, built once. */
export function catalog(): Scene[] {
  if (built) return built;
  const all = [...overScenes()];
  const order = new Map(SCREENS.map((s, i) => [s.key, i]));
  built = all.map((s, i) => [s, i] as const).sort(([a, i], [b, j]) => order.get(a.screen)! - order.get(b.screen)! || i - j).map(([s]) => s);
  return built;
}

export const sceneByKey = (key: string | null) => (key ? catalog().find((s) => s.key === key) : undefined);
