// Every bench the QA desk lists, in its order: the pieces, then the scenes
// a screen at a time (as a game goes), a bench for each of their groups.
// Call useItems (../build/engine.ts), and useCaptured (../scenes/captured.ts),
// before benches().

import type { Bench, SceneBench } from '../bench.ts';
import { SCREENS, type Scene } from '../scene.ts';
import { catalog } from '../scenes/index.ts';
import { PIECES } from './pieces.ts';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

let built: Bench[] | null = null;

/** Every bench, built once. */
export function benches(): Bench[] {
  if (built) return built;
  const groups = new Map<string, SceneBench>();
  const label = new Map<string, string>(SCREENS.map((s) => [s.key, s.label]));
  for (const scene of catalog()) {
    const key = `${scene.screen}/${slug(scene.group)}`;
    const bench = groups.get(key) ?? { kind: 'scenes', key, label: scene.group, screen: label.get(scene.screen)!, scenes: [] };
    bench.scenes.push(scene);
    groups.set(key, bench);
  }
  built = [...PIECES, ...groups.values()];
  return built;
}

export const benchByKey = (key: string | null) => (key ? benches().find((b) => b.key === key) : undefined);

/** The bench a scene is a state of. */
export const benchOfScene = (scene: Scene) => benches().find((b): b is SceneBench => b.kind === 'scenes' && b.scenes.includes(scene));

/** Where the desk lists a bench: the pieces together, the scenes by their screen. */
export const shelfOf = (b: Bench) => (b.kind === 'piece' ? 'Pieces' : b.screen);
