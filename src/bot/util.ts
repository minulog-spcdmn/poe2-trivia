// Small helpers the room bot's modules share.

import type { GameState } from '../lib/game';

/** A line in the runner's log (it picks out the lines that start so). */
export const log = (...args: unknown[]) => console.log('[bot]', ...args);

/** A whole number from `lo` to `hi`, at random. */
export const between = (lo: number, hi: number) => Math.round(lo + Math.random() * (hi - lo));

/** A random source fixed by a string (mulberry32 seeded with its FNV-1a hash). */
export function seededBy(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** A time of day as HH:MM. */
export const time = (at: number) => new Date(at).toTimeString().slice(0, 5);

/** The players and their scores, for a status line (those away marked so). */
export const playersLine = (s: GameState | null) => s?.players.map((p) => `${p.name}${p.connected ? '' : ' (away)'}: ${p.score}`) ?? [];
