// What a player of the room bot remembers of the items they saw revealed:
// the reveal sticks for the rest of the sitting, and fades over the weeks
// after, so a regular gets better at what they keep being asked. Kept by
// name in the seat's own storage (its browser profile, scripts/room-bot.mjs),
// so it outlasts a restart.

import { readStored, writeStored } from '../lib/storage';

const HOUR = 3600000;
const DAY = 24 * HOUR;
/** The items each player remembers at most (the most recent). */
const KEPT = 500;

/** How well a reveal `ago` ms back still sticks (0 to 1): fully for a few hours, then most of it, halving every two weeks. */
export const stuck = (ago: number) => (ago < 4 * HOUR ? 1 : 0.7 * 0.5 ** (ago / (14 * DAY)));

export class Recall {
  private readonly key: string;
  /** When each item was last seen revealed (Date.now()). */
  private seen: Record<string, number> = {};

  constructor(name: string) {
    this.key = `recall:${name}`;
    try {
      this.seen = JSON.parse(readStored(this.key) ?? '{}') ?? {};
    } catch {
      this.seen = {};
    }
  }

  /** How well `item` sticks now (0: never seen it revealed). */
  strength(item: string, now = Date.now()): number {
    const at = this.seen[item];
    return at === undefined ? 0 : stuck(now - at);
  }

  /** It saw `item` revealed. */
  saw(item: string, now = Date.now()) {
    delete this.seen[item];
    this.seen[item] = now;
    const ids = Object.keys(this.seen);
    if (ids.length > KEPT) for (const id of ids.slice(0, ids.length - KEPT)) delete this.seen[id];
    writeStored(this.key, JSON.stringify(this.seen));
  }
}
