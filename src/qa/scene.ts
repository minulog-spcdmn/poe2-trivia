// A scene: one state of the game as the QA desk (qa.html) shows it, in the
// real app, from one or more seats (who this device is in it), at any size.
// Scenes are plain data built from the game's own types; they never load the
// session (src/lib/session.svelte.ts), so the tests can build every one.

import type { Action, GameState } from '../lib/game.ts';
import type { Answer } from '../lib/codex.ts';
import type { DelveRun } from '../lib/delveRecord.ts';
import type { DailyRecord } from '../lib/daily.ts';
import type { RoomInfo } from '../lib/roomInfo.ts';
import type { PlateName } from '../lib/plates/index.ts';
import type { SizeKey } from './sizes.ts';
import type { Control, State, Values } from './bench.ts';

/** Where in the game a scene is: the desk groups and orders them by it. */
export type Screen = 'home' | 'lobby' | 'game' | 'over' | 'codex' | 'settings' | 'overlay';
export const SCREENS: { key: Screen; label: string }[] = [
  { key: 'home', label: 'Start page' },
  { key: 'lobby', label: 'Lobby' },
  { key: 'game', label: 'In a game' },
  { key: 'over', label: 'End screen' },
  { key: 'codex', label: 'Codex' },
  { key: 'settings', label: 'Settings' },
  { key: 'overlay', label: 'Over the game' },
];

/**
 * Who this device is: the room's role ('local': no room, alone or hot-seat;
 * 'none': in no game at all, on the start page or in the codex) and its
 * player (a spectator's own id; none in hot-seat or out of a game).
 */
export interface Seat {
  mode: 'host' | 'client' | 'local' | 'none';
  me: string | null;
}

/** What a frame does once the scene shows, in order. */
export type Step =
  /** Clicks the first element `selector` finds. */
  | { click: string }
  /** Waits (ms). */
  | { wait: number }
  /** The room turns this device out, as the host's word for it would (session.labFail). */
  | { fail: 'kicked' | 'closed' | 'replaced' }
  /** The app crashes, once or twice in a row (Root.svelte's recovery). */
  | { crash: 1 | 2 };

/** Everything a seat's device holds for the scene, beyond the room's state. */
export interface Built {
  /** The room's state; null out of a game. */
  state: GameState | null;
  /**
   * A move by the room itself on a state of this game, through the engine
   * that played it (build/play.ts, Table.room), so what's set over it (who's
   * offline) goes the way the game would take it. Missing: a game built by
   * hand, set as it is.
   */
  act?: (s: GameState, a: Action) => GameState;
  /** The moment the scene is at (host clock, ms): its clocks stand still there. Missing: the state's own start. */
  at?: number;
  /** How the run measured up against this device's records (the session's delveResult). */
  delveResult?: { id: number; depth: number; previousBest: number | null; best: boolean } | null;
  /** Delve: this device's deepest before the run (the session's bestAtStart). */
  bestAtStart?: number | null;
  /** Achievements this device earned in the game (ids, lib/achievements.ts). */
  earned?: string[];
  /** This device's codex log (its own answers), and its Delve runs, oldest first. */
  log?: Answer[];
  runs?: DelveRun[];
  /** Items this device has met besides those in its log: by name, or the first so many of the game's; missing: a few. */
  met?: string[] | number;
  /** The name this device plays under ('': a first visit, never asked). Missing: Kalguur. */
  name?: string;
  /** Today's unique as this device has it: its record, last answered `daysAgo` days before today (the frame's real today). */
  daily?: Omit<DailyRecord, 'day'> & { daysAgo: number };
  /** Host: the room never went online (the session's hereOnly), so it is on this device only. */
  hereOnly?: boolean;
  /** The session's status ('connecting': joining a room). */
  status?: 'idle' | 'connecting' | 'ready' | 'lost';
  /** What follows the page's address: a query to add ('room=KXR4QT&first') and a hash ('#codex'). */
  query?: string;
  hash?: string;
  /** The rooms the start page's list finds, and what an invite's room answers (undefined: never answers). */
  rooms?: RoomInfo[];
  invite?: RoomInfo | 'gone' | null;
  /** Done once the scene shows. */
  steps?: Step[];
  /** The sound as this device has it set (the settings page); missing: as it comes. */
  sound?: { muted?: boolean; volume?: number; ambience?: number };
  /** Other things this device keeps, by their storage names ('keys': the player's keys, lib/keybinds.svelte.ts). */
  stored?: Record<string, string>;
  /** The circle behind the end screen, instead of the one the game falls to (components/gameCircles.svelte.ts). */
  circle?: PlateName | null;
  /** How this device's sync stands (lib/sync/link.svelte.ts: the frame never syncs, so this is all there is). Missing: not paired. */
  sync?: { code: string; met: boolean; status: 'connecting' | 'waiting' | 'linked' | 'offline'; linked?: number };
}

export interface Scene {
  /** `screen/slug`, stable: links and saved results name scenes by it. */
  key: string;
  screen: Screen;
  /** The heading it's listed under within its screen ("Edge cases: Delve"). */
  group: string;
  label: string;
  /** Who it can be seen as. One whose player isn't in the room as built (a smaller room) isn't offered (seatsIn). */
  seats: Seat[];
  /** Sizes it is walked at besides the desk's own (sizes.ts' WALK_SIZES). */
  sizes?: SizeKey[];
  /** The design's boards for it (docs/handoff/end-screen/screens/<board>.webp), by the size each was drawn at: at its controls' defaults. */
  boards?: Partial<Record<SizeKey, string>>;
  /** What can be set in it, a slider, a menu or a switch each, as a piece's (../bench.ts). Every game has more besides (./tweaks.ts). */
  controls?: Control[];
  /** Its states worth seeing, by name: controls they set (its own, or those every game has). Missing: one, the scene as it comes. */
  states?: State[];
  /** Built afresh for each seat that asks, with its controls as set (all of them: valuesOf). */
  build(v?: Values): Built;
}

/** The seats of `scene` whose player is in the room as built (all of them out of a room, or in hot-seat). */
export function seatsIn(scene: Scene, built: Built): Seat[] {
  const s = built.state;
  if (!s) return scene.seats;
  const here = new Set([...s.players, ...(s.spectators ?? [])].map((p) => p.id));
  const seats = scene.seats.filter((seat) => seat.mode === 'local' || seat.mode === 'none' || here.has(seat.me!));
  return seats.length ? seats : scene.seats.slice(0, 1);
}

/** A seat in words: whose eyes, and in what part ("Kalguur (host)", "Hot-seat"). */
export function seatLabel(seat: Seat, state: GameState | null): string {
  if (seat.mode === 'none' || !state) return 'This device';
  if (seat.mode === 'local') return state.players.length > 1 ? 'Hot-seat' : 'Alone';
  const name = state.players.find((p) => p.id === seat.me)?.name;
  if (name) return `${name} (${seat.mode === 'host' ? 'host' : 'guest'})`;
  const watching = state.spectators?.find((o) => o.id === seat.me)?.name;
  return watching ? `${watching} (watching)` : seat.mode === 'host' ? 'Host' : 'Guest';
}
