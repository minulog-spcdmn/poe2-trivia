// Scenes saved from a live room ("Save as scene" on the QA desk): a room's
// state at a moment, kept as src/qa/captured/<name>.json, with the seats it
// was looked at from. A save is the game's state as it was: once the game's
// protocol has moved on (PROTOCOL_VERSION) it can't be trusted to show, and
// says so loudly rather than showing something wrong; play the scene it came
// from again and save it anew. Handed in by useCaptured (the desk and the
// frames from Vite, the tests from the folder).

import type { GameState } from '../../lib/game.ts';
import { PROTOCOL_VERSION } from '../../lib/protocol.ts';
import type { Scene, Screen, Seat } from '../scene.ts';

export interface Captured {
  protocol: number;
  label: string;
  /** When it was saved, and the moment the room was at (host clock). */
  takenAt: string;
  at: number;
  seats: Seat[];
  state: GameState;
}

let files: Record<string, Captured> = {};

/** The saved scenes, by file path (any folders before the name are dropped). */
export function useCaptured(given: Record<string, unknown>) {
  files = given as Record<string, Captured>;
}

const screenOf = (s: GameState): Screen => (s.phase === 'lobby' ? 'lobby' : s.phase === 'over' ? 'over' : 'game');

export function capturedScenes(): Scene[] {
  return Object.entries(files).map(([file, c]) => {
    const slug = file.split('/').pop()!.replace(/\.json$/, '');
    const screen = screenOf(c.state);
    return {
      key: `${screen}/saved-${slug}`,
      screen,
      group: 'Saved from a live room',
      label: c.label,
      seats: c.seats,
      build: () => {
        if (c.protocol !== PROTOCOL_VERSION) throw new Error(`${file} was saved at protocol ${c.protocol}, the game is at ${PROTOCOL_VERSION}: play its scene again and save it anew.`);
        return { state: c.state, at: c.at };
      },
    };
  });
}
