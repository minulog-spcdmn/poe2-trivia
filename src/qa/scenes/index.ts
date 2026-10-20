// Every scene the QA desk walks, in the order it walks them: by screen, as
// a game goes (SCREENS in ../scene.ts), then as each file lists them.
// Call useItems (../build/engine.ts), and useCaptured (./captured.ts) for the
// scenes saved from live rooms, before catalog().

import { SCREENS, type Scene } from '../scene.ts';
import { overScenes } from './over.ts';
import { homeScenes } from './home.ts';
import { lobbyScenes } from './lobby.ts';
import { gameScenes } from './game.ts';
import { codexScenes } from './codex.ts';
import { overlayScenes } from './overlays.ts';
import { capturedScenes } from './captured.ts';

let built: Scene[] | null = null;

/** Every scene, built once. */
export function catalog(): Scene[] {
  if (built) return built;
  const all = [...homeScenes(), ...lobbyScenes(), ...gameScenes(), ...overScenes(), ...codexScenes(), ...overlayScenes(), ...capturedScenes()];
  const order = new Map(SCREENS.map((s, i) => [s.key, i]));
  built = all.map((s, i) => [s, i] as const).sort(([a, i], [b, j]) => order.get(a.screen)! - order.get(b.screen)! || i - j).map(([s]) => s);
  return built;
}

export const sceneByKey = (key: string | null) => (key ? catalog().find((s) => s.key === key) : undefined);
