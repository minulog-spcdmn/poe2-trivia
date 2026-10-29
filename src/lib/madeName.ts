// A name made for a browser that has none yet: two words in Wraeclast's
// manner ("Ashen Wanderer"), saved as its name at once, so a newcomer is
// never asked for one before playing (New game, a join by code and an open
// room go straight on; an invite offers it in its field). The greeting says
// a name of one's own can be chosen, at its quill.
//
// It is this device's alone: sync never sends a made name, and a name the
// player chose on a paired device always replaces it (lib/sync/chosen.ts).
// Every name the lists can make passes the name checks and is no unique's
// name, and no word is a class a player's sigil can show or an ascendancy,
// which a name would seem to claim (tests/madeName.test.ts). Sixty by
// sixty, 3600 names: a room of twelve newcomers has two with the same one
// about once in fifty-five (1 - 3599/3600 x ... x 3589/3600, 66 pairs). The
// room turns the second away, and that join tries again at once under
// another (remakeName).

import { NAME_STORED, nameSkeleton } from './names.ts';
import { readStored, removeStored, writeStored } from './storage.ts';

export const MADE_FIRST = [
  'Amber', 'Ancient', 'Ashen', 'Azure', 'Bleak', 'Blighted', 'Bold', 'Brass', 'Burning', 'Copper',
  'Crimson', 'Dusky', 'Ebon', 'Ember', 'Errant', 'Faded', 'Fallen', 'Feral', 'Forsaken', 'Frozen',
  'Gilded', 'Gloom', 'Golden', 'Grim', 'Hallowed', 'Hollow', 'Iron', 'Ivory', 'Jade', 'Keen',
  'Lost', 'Moonlit', 'Mossy', 'Obsidian', 'Onyx', 'Pale', 'Quiet', 'Restless', 'Rusted', 'Sacred',
  'Scarlet', 'Shrouded', 'Silent', 'Silver', 'Starlit', 'Stoic', 'Sullen', 'Sunken', 'Swift', 'Thorned',
  'Tireless', 'Twilight', 'Umber', 'Valiant', 'Veiled', 'Wary', 'Weary', 'Wild', 'Withered', 'Wry',
];
export const MADE_SECOND = [
  'Alchemist', 'Archer', 'Boatman', 'Brewer', 'Castaway', 'Chandler', 'Cobbler', 'Courier', 'Delver', 'Drifter',
  'Exorcist', 'Ferryman', 'Fisher', 'Fletcher', 'Forager', 'Gemcutter', 'Gravedigger', 'Herald', 'Heretic', 'Hermit',
  'Jeweller', 'Knight', 'Lamplighter', 'Lancer', 'Lookout', 'Mapmaker', 'Mason', 'Miner', 'Minstrel', 'Mystic',
  'Nomad', 'Outcast', 'Peddler', 'Penitent', 'Pilgrim', 'Prospector', 'Reaver', 'Runesmith', 'Sage', 'Scavenger',
  'Scholar', 'Scout', 'Seeker', 'Sentinel', 'Shepherd', 'Squire', 'Stalker', 'Stranger', 'Survivor', 'Tanner',
  'Thatcher', 'Tinker', 'Tracker', 'Trapper', 'Vagrant', 'Vanguard', 'Wanderer', 'Wayfarer', 'Woodcutter', 'Zealot',
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

/**
 * Another made name in place of `was`, one a room found taken, saved as this
 * browser's name; null when `was` isn't the made name saved (chosen since,
 * here or on a paired device), which stays.
 */
export function remakeName(was: string, rand: () => number = randomUnit): string | null {
  if (!isMadeName(was) || readStored(NAME_STORED) !== was) return null;
  let name = makeName(rand);
  for (let i = 0; i < 20 && nameSkeleton(name) === nameSkeleton(was); i++) name = makeName(rand);
  if (nameSkeleton(name) === nameSkeleton(was)) return null;
  if (!writeStored(MADE, name)) return null;
  if (!writeStored(NAME_STORED, name)) {
    writeStored(MADE, was);
    return null;
  }
  return name;
}
