// zoe_arcana made PoE2.Quest, and when she walks into an online room
// everyone else gets a notice saying so (session.svelte.ts, Toasts.svelte).
// This decides when a state change is that arrival. She is recognised by
// name (isHeldName), which only a device unlocked with the owner key can
// take; the host can't verify a guest's claim, so this is a deterrent like
// the hold itself.

import type { GameState } from './game.ts';
import { isHeldName } from './names.ts';

/** The creator coming into a room. */
export interface Arrival {
  id: string;
  name: string;
  /** Her avatar colour; none while she only watches. */
  hue?: number;
  /** She joined a game under way, as a spectator. */
  watching: boolean;
}

/**
 * The creator's arrival in this state change, if it is one: she takes a seat
 * or a spectator's place under an id this device hasn't seen in the room
 * before. Every id in `next` goes into `seen`, which the caller keeps for as
 * long as it stays in the room. A player who comes back after a refresh or a
 * dropped connection keeps their id (a lobby lets go of the seat meanwhile,
 * so it isn't enough that she was missing from `prev`), and anyone already
 * there when this device first gets the room (`prev` is null) has arrived
 * before it did.
 */
export function creatorArrival(prev: GameState | null, next: GameState, seen: Set<string>): Arrival | null {
  let found: Arrival | null = null;
  for (const p of next.players) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (prev && isHeldName(p.name)) found = { id: p.id, name: p.name, hue: p.hue, watching: false };
  }
  for (const o of next.spectators ?? []) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    if (prev && isHeldName(o.name)) found = { id: o.id, name: o.name, watching: true };
  }
  return found;
}
