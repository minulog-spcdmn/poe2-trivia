// A name made for a browser that has none yet: two words in Wraeclast's
// manner ("Ashen Wanderer"), saved as its name at once, so a newcomer is
// never asked for one before playing (New game, a join and an invite go
// straight on, as for anyone named). The greeting's quill renames it.
//
// It is this device's alone: sync never sends a made name, and a name the
// player chose on a paired device always replaces it (lib/sync/chosen.ts).
// Every name the lists can make passes the name checks and is no unique's
// name (tests/madeName.test.ts). Sixty by sixty, 3600 names: a room of
// twelve newcomers has two with the same one about once in fifty-five
// (the room turns the second away, to rename at the quill).

import { NAME_STORED } from './names.ts';
import { readStored, removeStored, writeStored } from './storage.ts';

export const MADE_FIRST = [
  'Ashen', 'Amber', 'Ancient', 'Azure', 'Blighted', 'Bold', 'Brass', 'Burning', 'Copper', 'Crimson',
  'Dusky', 'Ebon', 'Ember', 'Errant', 'Faded', 'Fallen', 'Feral', 'Forsaken', 'Frozen', 'Gilded',
  'Gloom', 'Golden', 'Grim', 'Hallowed', 'Hollow', 'Iron', 'Ivory', 'Jade', 'Keen', 'Lone',
  'Lost', 'Moonlit', 'Mossy', 'Obsidian', 'Onyx', 'Pale', 'Quiet', 'Restless', 'Rusted', 'Sacred',
  'Scarlet', 'Shrouded', 'Silent', 'Silver', 'Starlit', 'Stoic', 'Storm', 'Sunken', 'Swift', 'Thorned',
  'Tireless', 'Twilight', 'Umber', 'Valiant', 'Veiled', 'Wary', 'Weary', 'Wild', 'Withered', 'Wry',
];
export const MADE_SECOND = [
  'Acolyte', 'Alchemist', 'Archer', 'Castaway', 'Courier', 'Delver', 'Drifter', 'Druid', 'Exorcist', 'Ferryman',
  'Gemcutter', 'Gravedigger', 'Hermit', 'Herald', 'Huntress', 'Invoker', 'Knight', 'Lamplighter', 'Lancer', 'Mapmaker',
  'Mercenary', 'Miner', 'Monk', 'Mystic', 'Nomad', 'Oracle', 'Outcast', 'Pathfinder', 'Penitent', 'Pilgrim',
  'Prospector', 'Raider', 'Ranger', 'Reaver', 'Runesmith', 'Sage', 'Scavenger', 'Scholar', 'Scout', 'Seeker',
  'Sentinel', 'Smith', 'Sorcerer', 'Squire', 'Stalker', 'Survivor', 'Templar', 'Tinker', 'Tracker', 'Trapper',
  'Vagrant', 'Vanguard', 'Warden', 'Warrior', 'Wayfarer', 'Witch', 'Woodcutter', 'Wanderer', 'Zealot', 'Stranger',
];

/** A name from the lists; `rand` in [0, 1), the browser's own randomness unless given. */
export function makeName(rand: () => number = randomUnit): string {
  const pick = (words: string[]) => words[Math.min(words.length - 1, Math.floor(rand() * words.length))];
  return `${pick(MADE_FIRST)} ${pick(MADE_SECOND)}`;
}

function randomUnit(): number {
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return u[0] / 2 ** 32;
}

/** Where the name made here is kept, beside the name itself: the name is a made one while the two agree. */
const MADE = 'name.made';

/** Whether `name` is the one made on this device (and not since chosen by the player, here or on a paired device). */
export const isMadeName = (name: string | null) => !!name && readStored(MADE) === name;

/**
 * A name for this browser if it has none: made and saved (the made one
 * first, so sync's stamping, which hears the name saved, never sends it
 * as chosen). Called as the app starts.
 */
export function ensureName() {
  if (readStored(NAME_STORED)) return;
  const name = makeName();
  if (writeStored(MADE, name) && !writeStored(NAME_STORED, name)) removeStored(MADE);
}
