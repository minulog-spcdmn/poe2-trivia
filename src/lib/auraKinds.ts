// The auras players could earn (a try-out: lib/fx/playerAura.ts draws them,
// each from its own files in lib/fx/auras/), named apart from the effects so
// the QA desk's bench can list them without loading the effects. `slot` is
// the aura's number in the effects shader (lib/fx/auras/shaders.ts). Those a
// player owns and the one worn are kept in lib/auraStore.ts.

import type { PlayerClass } from './classSigils.ts';

export const AURAS = [
  'breach',
  'delirium',
  'ritual',
  'expedition',
  'abyss',
  'azmeri',
  'tower',
  'chronomancer',
  'chayula',
  'lich',
  'divine',
  'corrupted',
  'mirror',
  'ice',
  'blacksun',
  'runeseal',
  'twilight',
  'slayer',
  'shadow',
] as const;
export type AuraKind = (typeof AURAS)[number];

/** Set aside to be reworked later: still on the bench's own list, but no one wears them (the desk's rooms, its every-aura view). */
export const BENCHED: readonly AuraKind[] = ['lich', 'blacksun'];
/** The auras that can be worn now. */
export const WORN = AURAS.filter((a) => !BENCHED.includes(a));

/** Whether `v` is an aura this build knows. */
export const isAuraKind = (v: unknown): v is AuraKind => typeof v === 'string' && (AURAS as readonly string[]).includes(v);
/** Whether `v` is an aura this build knows and lets be worn (none benched). */
export const isWornAura = (v: unknown): v is AuraKind => isAuraKind(v) && !BENCHED.includes(v);

/** The class auras, each with the class sigil it goes with (lib/classSigils.ts): found only while that sigil is worn (findableWith). */
export const CLASS_AURAS: Partial<Record<AuraKind, PlayerClass>> = {
  chronomancer: 'sorceress',
  slayer: 'gladiator',
  shadow: 'assassin',
  chayula: 'monk',
};

/** Whether a player wearing the class sigil `sigil` (none: undefined or null) can find `aura`: any aura but a class one, and that only with its own sigil. */
export const findableWith = (aura: AuraKind, sigil: PlayerClass | null | undefined): boolean => {
  const cls = CLASS_AURAS[aura];
  return !cls || cls === sigil;
};

/**
 * The aura shown on a player who wears `aura` and the class sigil `sigil`:
 * none for one this build doesn't know (a newer one's) or has benched. A
 * class aura once owned shows with any sigil, or none, as every other does
 * (the owner's call; only finding one asks for its sigil, findableWith).
 * Everything sent and drawn goes through here (lib/session.svelte.ts, the
 * avatars), so a rule tying the two together would be one line here.
 */
export function shownAura(aura: unknown, _sigil: unknown): AuraKind | undefined {
  return isWornAura(aura) ? aura : undefined;
}

/**
 * How each aura that can be worn is found, in the player's words, shown on
 * one not found yet (components/AuraPicker.svelte): each a line that reads
 * alone. What decides a find is the game's, so a change there changes its
 * line here. A class aura's names its sigil (CLASS_AURAS).
 */
export const AURA_HINTS: Partial<Record<AuraKind, string>> = {
  azmeri: 'Found in a game with 3 or more players.',
  runeseal: 'Found by getting 3 right in a row.',
  tower: 'Found on a tablet question.',
  breach: 'Found by getting 2 right in a row, each within 2 seconds.',
  expedition: 'Found after Detonating in a Delve run.',
  ice: 'Found in the Frozen Hollow, depths 20 to 29.',
  delirium: 'Found in Delve from depth 14, or in Eternal.',
  chronomancer: 'Found on a right answer with under 1 second left, wearing the Sorceress sigil.',
  slayer: 'Found on the deciding answer, wearing the Gladiator sigil.',
  ritual: 'Found by clearing a Delve zone without a miss.',
  divine: 'Found by getting 10 right in a row.',
  corrupted: 'Found in the Vaal Outpost, depths 40 to 49.',
  twilight: 'Found deep in Delve, on your last life.',
  shadow: 'Found in Delve from depth 40, or in Eternal, wearing the Assassin sigil.',
  abyss: 'Found in the Abyssal Depths or the Abyssal City.',
  chayula: 'Found past depth 50, wearing the Monk sigil.',
  mirror: 'Found on any card, very rarely.',
};

/** Its number in the effects shader: 1 for the first. */
export const auraSlot = (k: AuraKind) => AURAS.indexOf(k) + 1;

/**
 * Each aura's own light for what's lit about it (an aura's card's edge as
 * it's hovered and chosen, ChooseCategory.svelte): its main colour and its
 * palest, in the effects' HDR (lib/fx/effects.ts's C).
 */
export const AURA_GLOW: Record<AuraKind, { main: [number, number, number]; pale: [number, number, number] }> = {
  breach: { main: [1.9, 0.5, 3.1], pale: [2.6, 1.8, 3.2] },
  delirium: { main: [1.6, 1.7, 1.9], pale: [2.6, 2.7, 3.0] },
  ritual: { main: [3.0, 0.35, 0.3], pale: [3.1, 1.3, 1.1] },
  expedition: { main: [0.5, 2.4, 2.6], pale: [1.6, 2.9, 3.0] },
  abyss: { main: [0.7, 2.8, 0.9], pale: [1.8, 3.0, 1.9] },
  azmeri: { main: [0.8, 2.6, 2.0], pale: [1.9, 3.0, 2.6] },
  tower: { main: [2.8, 1.6, 0.6], pale: [3.1, 2.4, 1.6] },
  chronomancer: { main: [0.9, 1.6, 3.1], pale: [2.0, 2.5, 3.2] },
  chayula: { main: [1.6, 0.6, 2.8], pale: [2.4, 1.7, 3.1] },
  lich: { main: [2.2, 0.6, 3.0], pale: [2.8, 1.8, 3.2] },
  divine: { main: [3.1, 2.6, 0.7], pale: [3.2, 3.0, 2.0] },
  corrupted: { main: [3.0, 0.3, 0.35], pale: [3.1, 1.2, 1.2] },
  mirror: { main: [2.4, 2.5, 2.8], pale: [3.1, 3.1, 3.2] },
  ice: { main: [1.4, 2.4, 3.1], pale: [2.4, 2.9, 3.2] },
  blacksun: { main: [3.0, 2.0, 0.8], pale: [3.2, 2.7, 1.8] },
  runeseal: { main: [2.9, 2.1, 1.0], pale: [3.1, 2.7, 1.9] },
  twilight: { main: [2.0, 0.9, 2.9], pale: [3.1, 2.4, 1.6] },
  slayer: { main: [3.0, 0.4, 0.35], pale: [3.1, 1.4, 1.2] },
  shadow: { main: [0.5, 2.8, 1.8], pale: [1.7, 3.1, 2.5] },
};

/** Each aura's name, and a line on what it is. */
export const AURA_NAMES: Record<AuraKind, { name: string; about: string }> = {
  breach: { name: 'Breach', about: 'An open breach under the token, and Xesht’s clawed hand rising out of it to hold them.' },
  delirium: { name: 'Delirium', about: 'The Delirium’s pale fog turning round the token, shards of its broken mirror riding it, each catching the light.' },
  ritual: { name: 'Ritual', about: 'The wearer stands as a Ritual altar in a pool of blood, candles lit one by one as tribute flows in, its locusts streaming out to point the way.' },
  expedition: { name: 'Expedition', about: 'A Remnant wakes: its spirit-light streams out all round and its runes are written in the air, one by one; a score writes the greatest and takes it in.' },
  abyss: { name: 'Abyss', about: 'An Abyssal lich lord stands behind the token, its skull peering over it, lit from below by the Abyss’s green; each right answer in a row grows its crown of spines.' },
  azmeri: { name: 'Azmeri Spirits', about: 'The wildwood’s wisps drift round the token, behind it and before it; when it scores one possesses it, and a stag’s spirit antlers rise.' },
  tower: { name: 'Precursor Engine', about: 'Three tiers of Precursor bronze turn round the token step by step, its light pouring through their gaps; a score lines them up and sends a tower’s reveal over the land.' },
  chronomancer: { name: 'Chronomancer', about: 'A tilted clock dial turning round the token, its after-images stepping out and rewinding into it.' },
  chayula: { name: 'Acolyte of Chayula', about: 'A well of darkness drinking the light round it, Chayula’s remnants burning round it as little flames.' },
  lich: { name: 'Lich', about: 'The Lich’s Unholy Might crackling out of the wearer in braided threads of violet, blue and magenta power that wrap round the token, behind it and across its face, and run out to the sides; a right answer surges through them, and a streak keeps more of them out.' },
  divine: { name: 'Divinity', about: 'An Origin Core’s Spark held in the token, its charge breaking out sideways as the Arbiter’s yellow divine lightning; a right answer calls a strike down from above.' },
  corrupted: { name: 'Corruption', about: 'Corruption itself: blood-filled tendrils wreathing the token, reaching over its face to grip it, as a Vaal Orb works into an item.' },
  mirror: { name: 'Mirror of Kalandra', about: 'The token’s face becomes the Mirror’s glass: its reflection passes in the sheen, and the light it catches is thrown off sideways through drifting glitter; a streak opens mirror within mirror.' },
  ice: { name: 'Herald of Ice', about: 'The herald’s cold builds in the wearer, frost creeping over the face, then breaks out as an Ice Nova of flung shards; a right answer freezes it through and shatters it in a chain of novae.' },
  blacksun: { name: 'Delve', about: 'The black sun at the heart of Delve’s circle: the token stands in its place, its corona engraved round it in fine gold strokes that bend out to the sides, one streamer rising in front of the face; a right answer breaks through as the diamond ring.' },
  runeseal: { name: 'Bound Djinn', about: 'Balbala’s Runic Seals bind a djinn’s sand round the token; each right answer breaks one, and with all three broken the djinn rises free.' },
  twilight: { name: 'Twilight Order', about: 'The Order’s lantern turning in incense, its stained glass casting violet and gold shafts into the dusk.' },
  slayer: { name: 'Slayer', about: 'The Duelist’s Slayer: a blade whirling in a rising wind of blood, every kill drawn in to feed its wearer.' },
  shadow: { name: 'Shadow', about: 'The Shadow’s living darkness: black smoke pouring off the wearer and round in front of them, thrown, drawn out and torn away, never the same twice; a right answer opens his Eclipse and one white cut of his blade, greater with each in a row.' },
};
