// Small helpers the room bot's modules share.

import type { GameState } from '../lib/game';

/** A line in the runner's log (it picks out the lines that start so). */
export const log = (...args: unknown[]) => console.log('[bot]', ...args);

/** A whole number from `lo` to `hi`, at random. */
export const between = (lo: number, hi: number) => Math.round(lo + Math.random() * (hi - lo));

/** A time of day as HH:MM. */
export const time = (at: number) => new Date(at).toTimeString().slice(0, 5);

/** The players and their scores, for a status line (those away marked so). */
export const playersLine = (s: GameState | null) => s?.players.map((p) => `${p.name}${p.connected ? '' : ' (away)'}: ${p.score}`) ?? [];
