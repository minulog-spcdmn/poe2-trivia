// What the QA desk and its frames tell each other (by postMessage: same
// origin, but for a frame of the code before this change, served by a
// server of its own on the dev server's machine; see deskOrigin).

import type { GameState } from '../lib/game.ts';
import type { CursorAt } from '../lib/cursors.ts';
import type { Problem } from './frame/checks.ts';
import type { Values } from './bench.ts';

export type FrameMessage =
  /** The scene shows (its slot: which frame of the stop). */
  | { qa: 'ready'; slot: string }
  /** It couldn't start, and why (on the code before this change: something only the change has). */
  | { qa: 'failed'; slot: string; error: string }
  /** The scene came to rest (or didn't, `settled` false) and was checked: what's wrong with it, if anything. */
  | { qa: 'checked'; slot: string; settled: boolean; problems: Problem[] }
  /** One of the desk's keys, pressed (or let go: `up`) while the frame had the focus. */
  | { qa: 'key'; key: string; shift: boolean; repeat: boolean; up?: boolean }
  /** A piece moved its own controls, as an action played out (the panel follows). */
  | { qa: 'set'; values: Values }
  /** One of the states side by side was clicked: show it alone. */
  | { qa: 'pick'; index: number }
  /** The pointers bench (benches/pointers.ts): where the mouse is over its moving player's screen, for the other side of before and after to move the same. */
  | HandMessage;

export type DeskMessage =
  /** Outline the elements at fault, or don't. */
  | { qa: 'outlines'; on: boolean }
  /** Hold every animation still, or let them go on. */
  | { qa: 'freeze'; on: boolean }
  /** A piece's controls as set now. */
  | { qa: 'values'; values: Values }
  /** One of a piece's actions, pressed. */
  | { qa: 'action'; key: string }
  /** Draw it in again, as it first came. */
  | { qa: 'replay' }
  /** The UI's shadows and fills left to CSS, or drawn by the backdrop (S). */
  | { qa: 'css'; on: boolean }
  /** Where the mouse is over the moving player's screen on the other side of before and after (the pointers bench). */
  | HandMessage;

/** A hand at a spot on the moving player's screen (its own CSS px), or gone from it. */
export type HandMessage = { qa: 'hand'; x: number; y: number } | { qa: 'hand'; gone: true };

/**
 * Between the pointers bench and the two seats it shows (frame/pointerRelay.ts):
 * the moving player's pointer as their game sends it (`ms`: its stamp), and
 * the mouse really over their screen; to the other seat, that pointer as the
 * room passes it on (`key`: whose); and to the moving one, a hand to move by.
 */
export type RelayMessage =
  | { qa: 'pointer'; at: CursorAt | null; ms: number }
  | { qa: 'mouse'; x: number; y: number }
  | { qa: 'mouse'; gone: true }
  | { qa: 'pointer-in'; key: string; at: CursorAt | null; ms: number }
  | HandMessage;

/** How a live seat stands, as it tells the desk every second. */
export interface SeatLook {
  mode: 'host' | 'client' | 'local' | null;
  status: string;
  me: string | null;
  phase: string | null;
  players: { id: string; name: string; connected: boolean }[];
  gaveUp: boolean;
  link: { holding: boolean; partition: boolean; lag: number };
  bot: boolean;
}

/** What a live seat tells the desk. */
export type SeatMessage = { qa: 'seat'; look: SeatLook } | { qa: 'saved'; state: GameState; at: number };

/** What the desk asks of a live seat (src/qa/live/seat.ts). */
export type SeatOp = {
  qa: 'seat-op';
  op: 'hold' | 'release' | 'cut' | 'lag' | 'reload' | 'kick' | 'bot' | 'save';
  ms?: number;
  id?: string;
  on?: boolean;
};

/**
 * The desk a frame answers to: its own origin, or (a frame of the code
 * before this change, on another port: qa.html?desk=<origin>) the desk's,
 * as long as both are this machine's own.
 */
export function deskOrigin(asked: URLSearchParams): string {
  const desk = asked.get('desk');
  const local = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  return desk && local(desk) && local(location.origin) ? desk : location.origin;
}

const isQa = (m: unknown): m is { qa: string } => typeof m === 'object' && m !== null && 'qa' in m && typeof (m as { qa: unknown }).qa === 'string';
export const isFrameMessage = (m: unknown): m is FrameMessage => isQa(m) && ['ready', 'failed', 'checked', 'key', 'set', 'pick', 'hand'].includes(m.qa);
export const isDeskMessage = (m: unknown): m is DeskMessage => isQa(m) && ['outlines', 'freeze', 'values', 'action', 'replay', 'css', 'hand'].includes(m.qa);
export const isRelayMessage = (m: unknown): m is RelayMessage => isQa(m) && ['pointer', 'mouse', 'pointer-in', 'hand'].includes(m.qa);
