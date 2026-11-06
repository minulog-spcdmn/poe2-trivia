// A scene: one state of the game as the QA desk (qa.html) shows it, in the
// real app, from one or more seats (who this device is in it), at any size.
// Scenes are plain data built from the game's own types; they never load the
// session (src/lib/session.svelte.ts), so the tests can build every one.

import type { Action, GameState } from '../lib/game.ts';
import type { Answer } from '../lib/codex.ts';
import type { DelveRun } from '../lib/delveRecord.ts';
import type { RoomInfo } from '../lib/roomInfo.ts';
import type { PlateName } from '../lib/plates/index.ts';
import type { RetriedPage } from '../lib/retriedPages.ts';
import type { Standing } from '../lib/presence.ts';
import type { SizeKey } from './sizes.ts';
import type { ToastKind, ToastOptions } from '../lib/toasts.svelte.ts';
import type { Sfx } from '../lib/sound.ts';
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
  /** Clicks the first element `selector` finds; `ifThere`, only if a size has it (a list that folds only where it runs out of room, keys only where there's a keyboard), and none found is no fault. */
  | { click: string; ifThere?: true }
  /** Types `text` into the first field `fill` finds, as typing it would (its input event). */
  | { fill: string; text: string }
  /** Waits (ms). */
  | { wait: number }
  /** The room turns this device out, as the host's word for it would (session.labFail); `mine`, the owner's close went through. */
  | { fail: 'kicked' | 'closed' | 'replaced' | 'shut' | 'mine' }
  /** Joining the room gives up, as each way a join can fail says so (session.labJoinFail). */
  | { joinFail: 'missing' | 'blocked' | 'server' }
  /** The room turns this device's join down with this message, as the host's error for it would (session.labRefuse), once the join is under way. */
  | { refused: string }
  /** The app crashes, once or twice in a row (Root.svelte's recovery). */
  | { crash: 1 | 2 }
  /** A notice arrives (lib/toasts.svelte.ts), worded as the game words it (an achievement earned, say: lib/achievementToasts.ts); it stays up, its fuse held, until closed. */
  | { toast: string; kind?: ToastKind; opts?: ToastOptions }
  /** A moment's sound (lib/soundDesign.ts), from the first element `from` finds, as the game plays it with what the steps before showed (an achievement's notice's, say). */
  | { sound: Sfx; from?: string }
  /** The browser's back (Android's button, an iPhone's swipe), on the frame's history of its own (lib/backGuard.ts). */
  | { back: true }
  /** A guest's link to the host (the session's status and gaveUp): `lost`, reconnecting; `gaveUp`, given up on; `back`, there again. */
  | { link: 'lost' | 'gaveUp' | 'back' }
  /** Achievements judged a moment late (ids, lib/achievements.ts), earned in the game on show (the session's earned). */
  | { earn: string[] }
  /** Answers this device's codex takes in late (the game's last ones, written once the page is calm): their items met for the first time then. */
  | { logged: Answer[] }
  /**
   * The room moves on to `state` (the scene's game played on: dynamite going
   * off, an answer given), its clock standing still at `at` (host clock, ms),
   * as the host would send it: to see what happens as it does.
   */
  | { then: GameState; at?: number }
  /** The room's clock moves on to `clock` (host clock, ms), standing still there, the room as it is: a countdown ticking on. */
  | { clock: number }
  /** Scrolls the first element `selector` finds into the middle of the view, at once (nothing if none). */
  | { scroll: string }
  /** A key pressed, by where it sits (KeyboardEvent.code), on what has the focus (a key set on the settings page). */
  | { press: string }
  /** The start page's list finds these rooms from now on, and looks again at once, as its Refresh would (a room opening or closing). */
  | { rooms: RoomInfo[] }
  /** How this device's sync stands changes (the link coming up, going), over what it was (Built's sync). */
  | { sync: Partial<NonNullable<Built['sync']>> }
  /** What's copied is taken as copied, as a frame of the desk may not write to the clipboard (Share run's Copied). */
  | { clipboard: true };

/** Everything a seat's device holds for the scene, beyond the room's state. */
export interface Built {
  /** The room's state; null out of a game. */
  state: GameState | null;
  /** Who this device is, where the scene's controls decide it (host or guest, watching); missing: the scene's seats. */
  seat?: Seat;
  /**
   * A move by the room itself on a state of this game, through the engine
   * that played it (build/play.ts, Table.room), so what's set over it (who's
   * offline) goes the way the game would take it. Missing: a game built by
   * hand, set as it is.
   */
  act?: (s: GameState, a: Action) => GameState;
  /** Host: this device's own moves (a setting changed, the room locked) go through the room as `act` plays them and come back, as a host's do, instead of the frame only saying what it would send. */
  own?: boolean;
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
  /**
   * The last so many of the game's items taken as new with the newest release
   * (lib/releases.ts), as a refresh would stamp them (`added`), and how many of
   * them this device has met besides. Missing: none came with it, as today.
   */
  released?: { count: number; met: number };
  /** The name this device plays under ('': a first visit, never asked). Missing: Kalguur. */
  name?: string;
  /** Today's unique as this device has it: the days answered (lib/daily.ts DailyLog's characters), the last `daysAgo` days before today (the frame's real today). */
  daily?: { days: string; daysAgo: number };
  /** Host: the room never went online (the session's hereOnly), so it is on this device only. */
  hereOnly?: boolean;
  /** How the players who aren't simply there stand, as the host tells the room (the session's standing, lib/presence.ts): away or idle, by id. */
  standing?: Record<string, Standing>;
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
  /** A game this tab saved before it reloaded (the session's save, lib/session.svelte.ts' SAVE): the page picks it up as it loads, as a reload does. */
  saved?: { mode: 'local'; state: GameState };
  /** The circle behind the end screen, instead of the one the game falls to (components/gameCircles.svelte.ts). */
  circle?: PlateName | null;
  /** A page whose chunk never comes, as with the Wi-Fi gone as it's fetched (lib/chunkRetry.ts): what a player gets then. */
  lost?: RetriedPage;
  /** How this device's sync stands (lib/sync/link.svelte.ts: the frame never syncs, so this is all there is). Missing: not paired. */
  sync?: { code: string; met: boolean; status: 'connecting' | 'waiting' | 'linked' | 'offline'; linked?: number; lastAt?: number };
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
  /**
   * Its states worth seeing, by name: controls they set (its own, or those
   * every game has). Missing: one, the scene as it comes. One with a `key` is
   * a place of its own (an address, swept and watched like a scene); one
   * `listed: false` stays out of the panel's list, its controls saying it.
   */
  states?: State[];
  /** Built afresh for each seat that asks, with its controls as set (all of them: valuesOf). */
  build(v?: Values): Built;
}

/**
 * What `key` names among `scenes`: a scene, as it comes, or a state of one
 * with a key of its own (a place: a scene's before it was folded into
 * another's controls), the scene with that state's controls.
 */
export function placeIn(scenes: Scene[], key: string | null): { scene: Scene; values: Values } | undefined {
  if (!key) return undefined;
  for (const scene of scenes) {
    if (scene.key === key) return { scene, values: {} };
    const st = scene.states?.find((s) => s.key === key);
    if (st) return { scene, values: st.values };
  }
  return undefined;
}

/** The seats of `scene` whose player is in the room as built (all of them out of a room, or in hot-seat); the one it was built for, if one. */
export function seatsIn(scene: Scene, built: Built): Seat[] {
  if (built.seat) return [built.seat];
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
