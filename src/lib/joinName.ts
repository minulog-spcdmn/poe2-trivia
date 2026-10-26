// The name a join from the start page is made under becomes the one this
// browser plays under only once the room takes it. A room can turn a name
// down (lib/names.ts nameProblem: someone there is already called that, or
// near enough), and a name saved on the way in stayed saved all the same: the
// next visit greeted the player by the name the room had refused, the field
// put away, and nothing said what to change. Saved once in, it also goes to
// the player's other devices only then (lib/sync/chosen.ts).

import { NAME_STORED } from './names.ts';
import { writeStored } from './storage.ts';

/** The name of the join under way, held until the room says yes or no to it (session.svelte.ts). */
export class JoinName {
  private name: string | null = null;

  /** A join sets off under `name`, saved if the room takes it; null: one whose name is saved already (a reload getting back in) or isn't the player's (the bot's guests). */
  start(name: string | null) {
    this.name = name;
  }

  /** The room took the join: its name is this browser's from now on, greeted and asked no more. */
  taken() {
    if (this.name !== null) writeStored(NAME_STORED, this.name);
    this.name = null;
  }

  /** The join came to nothing (turned down, no answer, given up): the name saved before stays, or none does. */
  dropped() {
    this.name = null;
  }
}
