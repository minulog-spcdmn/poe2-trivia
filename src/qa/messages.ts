// What the QA desk and its frames tell each other (by postMessage: same
// origin, but for a frame of the code before this change, served by a
// server of its own on the dev server's machine; see deskOrigin).

import type { GameState } from '../lib/game.ts';
import type { Problem } from './frame/checks.ts';
import type { Values } from './bench.ts';

export type FrameMessage =
  /** The scene shows (its slot: which frame of the stop). */
  | { qa: 'ready'; slot: string }
  /** The scene came to rest (or didn't, `settled` false) and was checked: what's wrong with it, if anything. */
  | { qa: 'checked'; slot: string; settled: boolean; problems: Problem[] }
  /** One of the desk's keys, pressed (or let go: `up`) while the frame had the focus. */
  | { qa: 'key'; key: string; shift: boolean; repeat: boolean; up?: boolean }
  /** A piece moved its own controls, as an action played out (the panel follows). */
  | { qa: 'set'; values: Values }
  /** One of the states side by side was clicked: show it alone. */
  | { qa: 'pick'; index: number };

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
  | { qa: 'replay' };

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
export const isFrameMessage = (m: unknown): m is FrameMessage => isQa(m) && ['ready', 'checked', 'key', 'set', 'pick'].includes(m.qa);
export const isDeskMessage = (m: unknown): m is DeskMessage => isQa(m) && ['outlines', 'freeze', 'values', 'action', 'replay'].includes(m.qa);
