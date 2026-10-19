// What the Wraeclast run's screens say about its rules (rules.ts): the
// zones, the supplies and wares, the loot, corruption, where an item stands.

import {
  BOSS_ITEMS,
  CORRUPTION_CARDS,
  DECOY_SWEEP,
  FLASK_ITEMS,
  FLASK_STEP,
  MIN_NAMES,
  TWISTED_NAMES,
  WARE_NAMES,
  ZONE_ITEMS,
  ZONE_NAMES,
  ZONES,
  sectionOf,
  zoneOf,
  type Corruption,
  type LootCard,
  type Run,
  type Supply,
  type Ware,
  type ZoneType,
} from './rules.ts';

/** "1 word", "3 words". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : /(s|x|z|ch|sh)$/.test(word) ? 'es' : 's'}`;

/** What each ware does when used, at the vendor (a Flare's burn-in as tuned). */
export function does(run: Run, ware: Ware): string {
  const b = run.state.tuning.burnIn.flare;
  switch (ware) {
    case 'flare':
      return `Burns in ${plural(b, 'patch')} of the art, at a random spot.`;
    case 'wisdom':
      return 'Shows one common mod line, name words masked.';
    case 'strike':
      return `Strikes a wrong name, never below ${MIN_NAMES} names.`;
    case 'lengths':
      return 'Shows how many words the name has, and the syllables in each.';
    case 'first':
      return "Places the name's first syllable on the line, locked.";
    case 'decoy':
      return `Greys out ${DECOY_SWEEP} syllables only wrong names use.`;
    case 'vaal':
      return 'Corrupts the item: no more supplies on it, for a gamble on its loot.';
  }
}

/** A zone type's free clue, as a line. */
export const FREE_CLUE: Record<ZoneType, string> = {
  plain: 'One common mod line',
  incursion: 'The flavour text, name words masked',
  ritual: "The name's word lengths",
  blight: 'A small burn-in (2 patches)',
};

/** A zone type's rule, as a line. */
export const ZONE_RULE: Record<ZoneType, string> = {
  plain: 'No rule',
  incursion: 'Flares burn in half as much',
  ritual: "Scrolls of Wisdom don't work",
  blight: '2 more names on the board',
};

/** A zone's free clue (or none, as tuned) and its rule, as two lines. */
export function zoneLines(run: Run, zone: ZoneType) {
  const t = run.state.tuning;
  const free = !t.freeClue[zone] ? 'No free clue' : zone === 'blight' ? `A small burn-in (${plural(t.burnIn.blight, 'patch')})` : FREE_CLUE[zone];
  return { free, rule: ZONE_RULE[zone] };
}

export const BOSS_RULE = 'Silent: only Flares work';

/** What each of the boss's three items starts with. */
export function bossStep(run: Run, k: number) {
  const b = run.state.tuning.burnIn.boss;
  return [`It starts with a burn-in (${plural(b, 'patch')}).`, 'It starts with nothing.', 'It starts with nothing, and Flares burn in half as much.'][k];
}

/** Where item n (0 to 14) stands: its zone (or the boss) and its place there. */
export function whereOf(run: Run, n: number) {
  const zoneNo = zoneOf(n);
  if (sectionOf(n) === 'boss') return { zone: 'The boss', k: n - ZONES * ZONE_ITEMS + 1, of: BOSS_ITEMS };
  return { zone: `Zone ${zoneNo} • ${ZONE_NAMES[run.zoneType(zoneNo)!]}`, k: (n % ZONE_ITEMS) + 1, of: ZONE_ITEMS };
}

/** Why a supply does nothing on the open item now, or null when it can be used. */
export function why(run: Run, supply: Supply): string | null {
  switch (run.idle(supply)) {
    case null:
      return null;
    case 'closed':
      return 'The item is opening';
    case 'silent':
      return 'Silent: only Flares work';
    case 'corrupted':
      return 'Corrupted: no supplies work';
    case 'ritual':
      return "Ritual: Scrolls don't work here";
    case 'done':
      switch (supply) {
        case 'flare':
          return 'The art is all burned in';
        case 'wisdom':
          return 'No common line left to show';
        case 'strike':
          return `Never below ${MIN_NAMES} names`;
        case 'lengths':
          return 'Shown already';
        case 'first':
          return 'Placed already';
        case 'decoy':
          return 'No decoy syllable left';
      }
  }
}

/** What a supply does on the open item (a Flare's burn-in as the zone has it). */
export function onItem(run: Run, supply: Supply) {
  if (supply === 'flare') return `Burns in ${plural(run.flareBurn(), 'patch')} at a random spot.`;
  return does(run, supply);
}

/** The flask, said in full. */
export const FLASK_LINE = `A drink heals ${FLASK_STEP} at once, and ${FLASK_STEP} as each of the next ${FLASK_ITEMS} items ends. Drink during an item.`;

/** Each outcome's effect on the item. */
export const CORRUPTION_DOES: Record<Corruption, string> = {
  gilded: `+${CORRUPTION_CARDS.gilded} cards on its loot.`,
  unveiled: `A large burn-in at once, +${CORRUPTION_CARDS.unveiled} card on its loot.`,
  twisted: `${TWISTED_NAMES} more names on the board, +${CORRUPTION_CARDS.twisted} cards on its loot.`,
  bricked: 'A right answer drops nothing.',
};

/** A loot card's name and what it gives. */
export function lootLine(card: LootCard): { name: string; gives: string } {
  switch (card.kind) {
    case 'gold':
      return { name: 'Gold', gives: `+${card.gold} gold` };
    case 'jackpot':
      return { name: 'Jackpot', gives: `+${card.gold} gold` };
    case 'flask':
      return { name: 'Flask charge', gives: 'Refills an empty charge' };
    case 'vaal':
      return { name: WARE_NAMES.vaal, gives: 'Into the pack' };
    case 'supply':
      return { name: WARE_NAMES[card.supply!], gives: 'Into the pack' };
  }
}
