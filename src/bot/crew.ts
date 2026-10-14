// Which players in a room are the runner's own seats and which are people.
// Told apart by what the runner says its seats are on as now (their player
// ids and names), not by the cast's names: people go by names like alex or
// noob too. With one seat, only its own player is a bot; with several, until
// the runner first says, anyone by a name of the cast is taken for one.

import { session } from '../lib/session.svelte';
import { NAMES } from './identities';
import { VISITORS } from './visitors';

const CAST = new Set([...NAMES, ...VISITORS]);

/** A seat as the runner tells it: its player now, if it's on in a room. */
export interface Mate {
  id: string | null;
  name: string | null;
}

let crew: { ids: Set<string>; names: Set<string> } | null = null;

/** The runner: the other seats, as they are now (none: this one is alone). */
export function setCrew(mates: Mate[]) {
  crew = {
    ids: new Set(mates.map((m) => m.id).filter((id): id is string => !!id)),
    names: new Set(mates.map((m) => m.name).filter((n): n is string => !!n)),
  };
}

/** Whether `p` is one of the runner's own (this seat's player included). */
export function isBot(p: { id: string; name: string }): boolean {
  if (p.id === session.myPlayerId) return true;
  if (!crew) return CAST.has(p.name);
  return crew.ids.has(p.id) || crew.names.has(p.name);
}
