// A name made for a browser that has none yet, in Wraeclast's manner,
// saved as its name at once, so a newcomer is never asked for one before
// playing (New game, a join by code and an open room go straight on; an
// invite offers it in its field). The greeting says a name of one's own can
// be chosen, at its quill.
//
// Eleven names in twelve are a quality and a calling ("Runed Emissary",
// "Ashen Wanderer"): what someone wears or carries, the light or the place
// they come from, a colour or a quiet manner, then a craft, duty or learning
// to be proud of. One in twelve is a single word, a place and a deed run
// together ("Cairnkeeper"). Never a fault, a verdict or a trade as a joke,
// never a given name or a word for someone's skin, build or age; no class a
// player's sigil can show and no ascendancy, which a name would seem to
// claim; none a unique's name. Every one passes the name checks, and no two
// look alike (tests/madeName.test.ts).
//
// It is this device's alone: sync never sends a made name, and a name the
// player chose on a paired device always replaces it (lib/sync/chosen.ts).
// 54 qualities by 67 callings and 20 places by 8 deeds, 3778 names: drawn
// eleven to one, as likely to meet their like as 3628 names drawn evenly,
// so a room of twelve newcomers has two with the same one about once in
// fifty-five and a half (66 pairs). The room turns the second away, and that
// join tries again at once under another (remakeName).

import { NAME_STORED, nameSkeleton } from './names.ts';
import { readStored, removeStored, writeStored } from './storage.ts';

/** The first word: what someone wears or carries, the light or place they come from, a colour, a manner. */
export const MADE_FIRST = [
  'Anointed', 'Arcane', 'Ashen', 'Azure', 'Brass', 'Canny', 'Cerulean', 'Cloaked', 'Cobalt', 'Crimson',
  'Dawnlit', 'Emberlit', 'Emerald', 'Fogbound', 'Gilded', 'Gleaming', 'Gloaming', 'Hallowed', 'Hushed', 'Iron',
  'Keen', 'Mantled', 'Masked', 'Midnight', 'Moonlit', 'Plumed', 'Questing', 'Quiet', 'Roving', 'Runed',
  'Sacred', 'Saltborn', 'Sealed', 'Shrouded', 'Silent', 'Silver', 'Slate', 'Solemn', 'Starlit', 'Steady',
  'Stoic', 'Swift', 'Sworn', 'Tempered', 'Thorned', 'Tideworn', 'Twilight', 'Unseen', 'Veiled', 'Verdant',
  'Wakeful', 'Warded', 'Watchful', 'Wry',
];
/** The second word: a calling. */
export const MADE_SECOND = [
  'Alchemist', 'Apothecary', 'Archer', 'Archivist', 'Armourer', 'Artificer', 'Astrologer', 'Augur', 'Bowyer', 'Chaplain',
  'Chronicler', 'Conjurer', 'Courier', 'Diviner', 'Dowser', 'Emissary', 'Envoy', 'Exorcist', 'Falconer', 'Fletcher',
  'Forager', 'Gemcutter', 'Herald', 'Jeweller', 'Knight', 'Lamplighter', 'Lancer', 'Lookout', 'Lorekeeper', 'Mapmaker',
  'Mariner', 'Marshal', 'Messenger', 'Minstrel', 'Mystic', 'Navigator', 'Nomad', 'Outlander', 'Outrider', 'Pilgrim',
  'Prospector', 'Runecaster', 'Sage', 'Salvager', 'Scholar', 'Scout', 'Scribe', 'Scrivener', 'Seafarer', 'Seeker',
  'Seer', 'Sentinel', 'Shepherd', 'Shipwright', 'Skirmisher', 'Squire', 'Stargazer', 'Steward', 'Storyteller', 'Surveyor',
  'Tracker', 'Trapper', 'Vanguard', 'Voyager', 'Wanderer', 'Wayfarer', 'Wayfinder',
];
/** A single-word name's start, a place or thing (no word of the first list, which would read as two: Iron + keeper)... */
export const MADE_PREFIX = [
  'Brine', 'Cairn', 'Crag', 'Dune', 'Fen', 'Flint', 'Gale', 'Gloam', 'Glyph', 'Marsh',
  'Mire', 'Ridge', 'Rime', 'Rune', 'Salt', 'Shard', 'Smoke', 'Thorn', 'Tide', 'Vale',
];
/** ...and its end, a deed: no letter doubled where they meet. */
export const MADE_SUFFIX = ['walker', 'keeper', 'caller', 'reader', 'carver', 'singer', 'bearer', 'binder'];
/** How often a made name is a single word. */
export const COMPOUND_SHARE = 1 / 12;

/** A name from the lists; `rand` in [0, 1), the browser's own randomness unless given. */
export function makeName(rand: () => number = randomUnit): string {
  const pick = (words: string[]) => words[Math.min(words.length - 1, Math.floor(rand() * words.length))];
  if (rand() < COMPOUND_SHARE) return pick(MADE_PREFIX) + pick(MADE_SUFFIX);
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
