// A scene: one state of the game as the QA desk (qa.html) shows it, in the
// real app, from one or more seats (who this device is in it), at any size.
// Scenes are plain data built from the game's own types; they never load the
// session (src/lib/session.svelte.ts), so the tests can build every one.

import type { GameState } from '../lib/game.ts';
import type { Answer } from '../lib/codex.ts';
import type { DelveRun } from '../lib/delveRecord.ts';
import type { SizeKey } from './sizes.ts';

/** Where in the game a scene is: the desk groups and orders them by it. */
export type Screen = 'home' | 'lobby' | 'game' | 'over' | 'codex' | 'overlay';
export const SCREENS: { key: Screen; label: string }[] = [
  { key: 'home', label: 'Start page' },
  { key: 'lobby', label: 'Lobby' },
  { key: 'game', label: 'In a game' },
  { key: 'over', label: 'End screen' },
  { key: 'codex', label: 'Codex' },
  { key: 'overlay', label: 'Over the game' },
];

/** Who this device is: the room's role ('local': no room, alone or hot-seat) and its player (a spectator's own id; none in hot-seat). */
export interface Seat {
  mode: 'host' | 'client' | 'local';
  me: string | null;
}

/** Everything a seat's device holds for the scene, beyond the room's state. */
export interface Built {
  state: GameState;
  /** How the run measured up against this device's records (the session's delveResult). */
  delveResult?: { id: number; depth: number; previousBest: number | null; best: boolean } | null;
  /** Achievements this device earned in the game (ids, lib/achievements.ts). */
  earned?: string[];
  /** This device's codex log (its own answers), and its Delve runs, oldest first. */
  log?: Answer[];
  runs?: DelveRun[];
}

export interface Scene {
  /** `screen/slug`, stable: links and saved results name scenes by it. */
  key: string;
  screen: Screen;
  /** A finer grouping within the screen, for search ("Edge cases: Delve"). */
  group: string;
  label: string;
  seats: Seat[];
  /** Sizes it is walked at besides the desk's own (sizes.ts' WALK_SIZES). */
  sizes?: SizeKey[];
  /** The design's boards for it (docs/handoff/end-screen/screens/<board>.webp), by the size each was drawn at. */
  boards?: Partial<Record<SizeKey, string>>;
  build(): Built;
}

/** A seat in words: whose eyes, and in what part ("Kalguur (host)", "Hot-seat"). */
export function seatLabel(seat: Seat, state: GameState): string {
  if (seat.mode === 'local') return state.players.length > 1 ? 'Hot-seat' : 'Alone';
  const name = state.players.find((p) => p.id === seat.me)?.name;
  if (name) return `${name} (${seat.mode === 'host' ? 'host' : 'guest'})`;
  const watching = state.spectators?.find((o) => o.id === seat.me)?.name;
  return watching ? `${watching} (watching)` : seat.mode === 'host' ? 'Host' : 'Guest';
}
