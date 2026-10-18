// What the QA desk and its frames tell each other (by postMessage, same origin only).

import type { GameState } from '../lib/game.ts';
import type { Problem } from './frame/checks.ts';

export type FrameMessage =
  /** The scene shows (its slot: which frame of the stop). */
  | { qa: 'ready'; slot: string }
  /** The scene came to rest (or didn't, `settled` false) and was checked: what's wrong with it, if anything. */
  | { qa: 'checked'; slot: string; settled: boolean; problems: Problem[] }
  /** One of the desk's keys, pressed (or let go: `up`) while the frame had the focus. */
  | { qa: 'key'; key: string; shift: boolean; repeat: boolean; up?: boolean };

export type DeskMessage =
  /** Outline the elements at fault, or don't. */
  { qa: 'outlines'; on: boolean };

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

const isQa =(m: unknown): m is { qa: string } => typeof m === 'object' && m !== null && 'qa' in m && typeof (m as { qa: unknown }).qa === 'string';
export const isFrameMessage = (m: unknown): m is FrameMessage => isQa(m) && ['ready', 'checked', 'key'].includes(m.qa);
export const isDeskMessage = (m: unknown): m is DeskMessage => isQa(m) && m.qa === 'outlines';
