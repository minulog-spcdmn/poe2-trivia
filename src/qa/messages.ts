// What the QA desk and its frames tell each other (by postMessage, same origin only).

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

const isQa = (m: unknown): m is { qa: string } => typeof m === 'object' && m !== null && 'qa' in m && typeof (m as { qa: unknown }).qa === 'string';
export const isFrameMessage = (m: unknown): m is FrameMessage => isQa(m) && ['ready', 'checked', 'key'].includes(m.qa);
export const isDeskMessage = (m: unknown): m is DeskMessage => isQa(m) && m.qa === 'outlines';
