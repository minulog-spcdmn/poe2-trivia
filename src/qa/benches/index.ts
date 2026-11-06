// Every bench the QA desk lists, in its order: the pieces, then a bench for
// each of the game's screens (as a game goes), its states every scene's.
// Call useItems (../build/engine.ts), and useCaptured (../scenes/captured.ts),
// before benches().

import type { Bench, SceneBench, SceneState } from '../bench.ts';
import { SCREENS, type Scene } from '../scene.ts';
import { catalog } from '../scenes/index.ts';
import { PIECES } from './pieces.ts';

/** A scene's states: its named ones, listed or not, or (none named) the scene itself as it comes. */
export const statesOf = (scene: Scene): SceneState[] =>
  (scene.states ?? [{ label: scene.label, values: {} }]).map((s) => ({ scene, label: s.label, group: s.group ?? scene.group, values: s.values, ...(s.key ? { key: s.key } : {}) }));

/** Those of a scene's states its panel lists: all but those `listed: false` (never its first, the scene's own row). */
export const listedOf = (scene: Scene): SceneState[] => statesOf(scene).filter((_, i) => i === 0 || scene.states?.[i]?.listed !== false);

let built: Bench[] | null = null;

/** Every bench, built once. */
export function benches(): Bench[] {
  if (built) return built;
  const screens: SceneBench[] = [];
  for (const { key, label } of SCREENS) {
    const scenes = catalog().filter((s) => s.screen === key);
    if (!scenes.length) continue;
    // A heading's states together, the headings in the order they first come.
    const states = scenes.flatMap(listedOf);
    const order = [...new Set(states.map((s) => s.group))];
    states.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    screens.push({ kind: 'scenes', key, label, scenes, states });
  }
  built = [...PIECES, ...screens];
  return built;
}

/** A bench by its key; an older address's `screen/group` is its screen's. */
export const benchByKey = (key: string | null) => (key ? (benches().find((b) => b.key === key) ?? benches().find((b) => b.kind === 'scenes' && b.key === key.split('/')[0])) : undefined);

/** The screen a scene is a state of. */
export const benchOfScene = (scene: Scene) => benches().find((b): b is SceneBench => b.kind === 'scenes' && b.scenes.includes(scene));

/** Where the desk lists a bench: the pieces together, the screens together. */
export const shelfOf = (b: Bench) => (b.kind === 'piece' ? 'Pieces' : 'Screens');
