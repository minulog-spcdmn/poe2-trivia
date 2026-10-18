// What the QA desk's frames tell the desk (by postMessage, same origin only).

export type FrameMessage =
  /** The scene shows (its slot: which frame of the stop). */
  | { qa: 'ready'; slot: string }
  /** One of the desk's keys, pressed (or let go: `up`) while the frame had the focus. */
  | { qa: 'key'; key: string; shift: boolean; repeat: boolean; up?: boolean };

export const isFrameMessage = (m: unknown): m is FrameMessage => typeof m === 'object' && m !== null && 'qa' in m && typeof (m as { qa: unknown }).qa === 'string';
