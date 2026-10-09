// The start page's menu: its four entries, the keyboard cursor over them,
// and the lines that change with what this browser has played.

import { readStored, writeStored } from './storage.ts';

export type Entry = 'create' | 'join' | 'hotseat' | 'codex';
export const ENTRIES: readonly Entry[] = ['create', 'join', 'hotseat', 'codex'];

/** The cursor moved `step` entries along the menu, wrapping at either end. */
export const moveCursor = (at: number, step: number) => (((at + step) % ENTRIES.length) + ENTRIES.length) % ENTRIES.length;

/** The entry an arrow key moves to, or null for any other key. */
export function cursorKey(key: string, at: number): number | null {
  if (key === 'ArrowDown') return moveCursor(at, 1);
  if (key === 'ArrowUp') return moveCursor(at, -1);
  if (key === 'Home') return 0;
  if (key === 'End') return ENTRIES.length - 1;
  return null;
}

const LAST = 'startEntry';
/** The cursor starts on the entry chosen last time (Create a room the first time). */
export function lastEntry(): number {
  const i = ENTRIES.indexOf(readStored(LAST) as Entry);
  return i < 0 ? 0 : i;
}
export const rememberEntry = (e: Entry) => void writeStored(LAST, e);

/** The Codex entry's line: what has been met so far, or what it is for before anything has. */
export function codexLine(met: number | null, total: number, deepest: number): string {
  if (!met) return 'Every unique you meet in a game is kept here.';
  return `Every unique you have met: ${met} of ${total}.${deepest > 0 ? ` Deepest delve: ${deepest}.` : ''}`;
}
