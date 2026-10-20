// One scene by its key, for a frame: only its screen's file is loaded. On the
// code before this change (the desk's before and after, qaBefore.ts) a
// screen whose scenes use something only this change has then fails on its
// own, and every other screen still compares. A key starts with its screen.
// Call useItems (../build/engine.ts) and useCaptured (./captured.ts) first,
// as for catalog().

import type { Scene } from '../scene.ts';
import { capturedScenes } from './captured.ts';

export const SCREEN_FILES: Record<string, () => Promise<Scene[]>> = {
  home: () => import('./home.ts').then((m) => m.homeScenes()),
  lobby: () => import('./lobby.ts').then((m) => m.lobbyScenes()),
  game: () => import('./game.ts').then((m) => m.gameScenes()),
  over: () => import('./over.ts').then((m) => m.overScenes()),
  codex: () => import('./codex.ts').then((m) => m.codexScenes()),
  overlay: () => import('./overlays.ts').then((m) => m.overlayScenes()),
};

export async function sceneOf(key: string | null): Promise<Scene | undefined> {
  if (!key) return undefined;
  // (Scenes saved from a live room are under their screen's name too, from a file of their own.)
  const scenes = key.includes('/saved-') ? capturedScenes() : await SCREEN_FILES[key.split('/')[0]]?.();
  return scenes?.find((s) => s.key === key);
}
