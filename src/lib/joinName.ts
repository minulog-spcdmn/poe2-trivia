// The name a join from the start page is made under becomes the one this
// browser plays under only once the room takes it. A room can turn a name
// down (lib/names.ts nameProblem: someone there is already called that, or
// near enough), and a name saved on the way in stayed saved all the same: the
// next visit greeted the player by the name the room had refused, the field
// put away, and nothing said what to change. Saved once in, it also goes to
// the player's other devices only then (lib/sync/chosen.ts).
//
// Only a new name is held, and it is written only if no other name was chosen
// while the join was under way. Writing back the saved name on every join sent
// the other devices a push for nothing, and worse, could undo a rename: the
// sync can pull the name chosen on another device (or another tab can set one)
// while the room is still being asked, and writing the old name over it then
// stamped the old one as newest and sent it everywhere.

import { NAME_STORED } from './names.ts';
import { readStored, writeStored } from './storage.ts';

/** The name of the join under way, held until the room says yes or no to it (session.svelte.ts). */
export class JoinName {
  private name: string | null = null;
  /** The name saved as the join set off, to tell whether another was chosen meanwhile. */
  private was: string | null = null;

  /** A join sets off under `name`, saved if the room takes it; null: one whose name is saved already (a reload getting back in) or isn't the player's (the bot's guests). The name saved already is held as no name too. */
  start(name: string | null) {
    this.was = readStored(NAME_STORED);
    this.name = name !== null && name !== this.was ? name : null;
  }

  /** The room took the join: its name is this browser's from now on, greeted and asked no more, unless another was chosen while it was asked (synced from another device, or set in another tab), which stands. */
  taken() {
    if (this.name !== null && readStored(NAME_STORED) === this.was) writeStored(NAME_STORED, this.name);
    this.name = null;
  }

  /** The join came to nothing (turned down, no answer, given up): the name saved before stays, or none does. */
  dropped() {
    this.name = null;
  }
}
