// Which players in a room are the runner's own seats and which are people.
// Told apart by player id: the runner tells each seat the ids the others are
// on as (every few seconds), and a seat keeps every id it's been told, so a
// seat's player who left a game (still in it, gone) or a seat the runner
// couldn't reach this time is still known for one of its own. Not by name:
// people go by names like alex or noob too, a seat's included. With one seat,
// only its own player is a bot; with several, until the runner first says,
// anyone by a name of the cast is taken for one.

import { session } from '../lib/session.svelte';
import { CAST } from './visitors';

/** Ids the seats have been on as, the others' and this one's (the most recent last). */
const ids = new Set<string>();
const KEPT = 500;
let told = false;

/** The runner: the ids the other seats are on as now (none: this one is alone). */
export function setCrew(now: (string | null)[]) {
  told = true;
  for (const id of now) {
    if (!id) continue;
    ids.delete(id);
    ids.add(id);
  }
  for (const id of ids) {
    if (ids.size <= KEPT) break;
    ids.delete(id);
  }
}

/** Whether `p` is one of the runner's own (this seat's player included, and those it was on as before). */
export function isBot(p: { id: string; name: string }): boolean {
  const me = session.myPlayerId;
  if (me && !ids.has(me)) ids.add(me);
  if (p.id === me) return true;
  return told ? ids.has(p.id) : CAST.has(p.name);
}
