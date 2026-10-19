// What the Wraeclast run's screens say about its rules (rules.ts, map.ts):
// the zones and their free clues, the supplies, the loot, corruption, the
// boss's modifiers. Counts the rules keep hidden (decoys, mod lines, words,
// patches left) are never said.

import {
  BLIGHT_DECOYS,
  BLOODIED,
  BLOOD_TOLL,
  DECOY_SWEEP,
  FLASK_ITEMS,
  FLASK_STEP,
  SUPPLY_NAMES,
  SWARMING_DECOYS,
  TEEMING_DECOYS,
  ZONE_NAMES,
  type BossMod,
  type Hidden,
  type LootCard,
  type Place,
  type Run,
  type Supply,
  type ZoneType,
} from './rules.ts';

/** "1 card", "3 cards", "2 patches". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : /(s|x|z|ch|sh)$/.test(word) ? 'es' : 's'}`;

/** What each supply does when used (a Flare's burn-in as tuned). */
export function does(run: Run, supply: Supply): string {
  switch (supply) {
    case 'flare':
      return 'Burns in a cluster of the art at a random spot.';
    case 'wisdom':
      return 'The next mod line, from the most common to the rarest.';
    case 'lore':
      return 'The flavour text, name words masked.';
    case 'category':
      return "The item's category.";
    case 'base':
      return 'The base type (a gem: its support text).';
    case 'decoy':
      return `Strikes ${DECOY_SWEEP} decoy tiles.`;
    case 'lengths':
      return 'How many words the name has, and the tiles in each.';
    case 'first':
      return "Places the name's first tile on the line, locked.";
  }
}

/** A short name for a pack slot. */
export const SHORT: Record<Supply, string> = {
  flare: 'Flare',
  wisdom: 'Wisdom',
  lore: 'Lore',
  category: 'Category',
  base: 'Base',
  decoy: 'Sweep',
  lengths: 'Lengths',
  first: 'First',
};

/** A zone type's free clue, as a line. */
export const FREE_CLUE: Record<ZoneType, string> = {
  plain: "The item's most common mod line",
  incursion: 'The flavour text, name words masked',
  essence: 'The base type (a gem: its support text)',
  ritual: "The name's word lengths",
  expedition: "The item's most common mod line",
  blight: 'A small burn-in',
};

/** A zone type's rule, as a line. */
export const ZONE_RULE: Record<ZoneType, string> = {
  plain: 'No rule',
  incursion: 'Flares burn in half as much',
  essence: 'No rule',
  ritual: "Scrolls of Wisdom don't work",
  expedition: 'The vendor deals after the zone',
  blight: `${BLIGHT_DECOYS} more decoys`,
};

/** A zone's free clue (or none, as tuned) and its rule, as two lines. */
export function zoneLines(run: Run, zone: ZoneType) {
  return { free: run.state.tuning.freeClue[zone] ? FREE_CLUE[zone] : 'No free clue', rule: ZONE_RULE[zone] };
}

/** The label above a free clue on the item: what gave it. */
export const FREE_LABEL = 'Zone';

export const BOSS_RULE = 'Silent: only Flares work';

/** A corrupted zone's hidden modifier: what it does there. */
export const HIDDEN_DOES: Record<Hidden, string> = {
  blood: `Each item takes ${BLOOD_TOLL} life as it opens.`,
  sealed: "Supplies don't work here; the flask still does.",
  swarming: `${SWARMING_DECOYS} more decoys.`,
  dark: "The art can't be revealed.",
  bounty: 'No catch.',
};

/** A boss modifier: what it does. */
export const BOSS_MOD_DOES: Record<BossMod, string> = {
  lingering: 'A fourth item.',
  bloodied: `Misses cost ${BLOODIED} more life.`,
  murky: 'Flares burn in half as much.',
  teeming: `${TEEMING_DECOYS} more decoys.`,
};

/** A node's kind as a word: its zone type, or Camp, Town, Well, the boss. */
export function placeName(p: Place): string {
  switch (p.kind) {
    case 'zone':
      return ZONE_NAMES[p.type];
    case 'camp':
      return 'Camp';
    case 'town':
      return 'Town';
    case 'well':
      return 'Well';
    case 'boss':
      return 'Boss';
  }
}

/** What a node does when the player arrives, in a line. */
export function placeDoes(run: Run, p: Place): string {
  switch (p.kind) {
    case 'zone':
      return `${plural(Math.max(1, Math.min(3, run.state.tuning.itemsPerZone)), 'item')}. ${zoneLines(run, p.type).free}.`;
    case 'camp':
      return 'The start.';
    case 'town':
      return 'Heals 20 life; the vendor deals every ware.';
    case 'well':
      return 'Refills every flask charge. Heals no life.';
    case 'boss':
      return `${BOSS_RULE}. No loot.`;
  }
}

/** Why a supply does nothing on the open item now, or null when it can be used. No counts: "nothing left" says it all. */
export function why(run: Run, supply: Supply): string | null {
  switch (run.idle(supply)) {
    case null:
      return null;
    case 'closed':
      return 'The item is opening';
    case 'silent':
      return 'Silent: only Flares work';
    case 'sealed':
      return 'Sealed: no supplies work here';
    case 'dark':
      return "Dark: the art can't be revealed";
    case 'ritual':
      return "Ritual: Scrolls don't work here";
    case 'done':
      switch (supply) {
        case 'flare':
          return 'The art is all burned in';
        case 'wisdom':
          return 'Nothing left to read';
        case 'lore':
          return 'Nothing to show';
        case 'decoy':
          return 'Nothing left to strike';
        case 'first':
          return 'Placed already';
        default:
          return 'Shown already';
      }
  }
}

/** The flask, said in full. */
export const FLASK_LINE = `A drink heals ${FLASK_STEP} at once, and ${FLASK_STEP} as each of the next ${FLASK_ITEMS} items ends. Drink during an item.`;

/** A vendor card's line: how many come for the price. */
export const stackLine = (run: Run, s: Supply) => `${run.state.tuning.stack[s]} for ${run.state.tuning.price[s]} gold`;

/** A loot card's name and what it gives. */
export function lootLine(card: LootCard): { name: string; gives: string } {
  switch (card.kind) {
    case 'gold':
      return { name: 'Gold', gives: `+${card.gold} gold` };
    case 'jackpot':
      return { name: 'Jackpot', gives: `+${card.gold} gold` };
    case 'flask':
      return { name: 'Flask charge', gives: 'Refills an empty charge' };
    case 'supply':
      return { name: SUPPLY_NAMES[card.supply!], gives: `${card.n} into the pack` };
  }
}
