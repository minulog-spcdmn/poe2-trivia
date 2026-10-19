// What the Wraeclast run's screens say about its rules (rules.ts, map.ts):
// the zones and their free clues, the supplies, the loot, corruption, the
// boss's rules. The wording is the design's v4 table
// (docs/wraeclast/design-v4-wording.md, on the orchestrator's branch): plain,
// for someone who has never played. Counts the rules keep hidden (tiles not
// in the name, mod lines, words, patches left) are never said.

import {
  BLOODIED,
  BLOOD_TOLL,
  DECOY_SWEEP,
  FLASK_STEP,
  PACK_STACKS,
  STACK_MAX,
  SUPPLY_NAMES,
  TOWN_HEAL,
  ZONE_NAMES,
  type BossMod,
  type DeckClue,
  type LootCard,
  type Mark,
  type Place,
  type Run,
  type Supply,
  type ZoneType,
} from './rules.ts';

/** "1 card", "3 cards", "2 patches". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : /(s|x|z|ch|sh)$/.test(word) ? 'es' : 's'}`;

/** What each supply does when used. */
export const DOES: Record<Supply, string> = {
  flare: 'Reveals a patch of the art.',
  wisdom: 'Shows a mod line. Each one is rarer than the last.',
  lore: 'Shows the flavor text, with the name hidden.',
  category: 'Names another item of the same kind as this one.',
  base: 'Shows the base type (on a gem: its support text).',
  decoy: `Strikes out ${DECOY_SWEEP} tiles that aren't in the name.`,
  lengths: 'Shows how many words, and the tiles in each.',
  first: 'Puts the first tile on the answer line for you.',
  deck: "Shows one clue you don't have yet, at random.",
};

/** What a supply does when used. */
export const does = (_run: Run, supply: Supply) => DOES[supply];

/** A short name for a pack slot. */
export const SHORT: Record<Supply, string> = {
  flare: 'Torch',
  wisdom: 'Scroll',
  lore: 'Page',
  category: 'Orb',
  base: 'Base',
  decoy: 'Fossil',
  lengths: 'Lengths',
  first: 'First',
  deck: 'Deck',
};

/** A zone type's free clue, short ("Free clue: a mod line"). */
export const FREE_CLUE: Record<ZoneType, string> = {
  plain: 'a mod line',
  incursion: 'flavor text',
  essence: 'base type (a gem: support text)',
  ritual: 'word lengths',
  expedition: 'a mod line',
  blight: 'a patch of the art',
};

/** A zone type's rule, short, or null when it has none. */
export const ZONE_RULE: Record<ZoneType, string | null> = {
  plain: null,
  incursion: 'Torches reveal half as much',
  essence: null,
  ritual: "Scrolls of Wisdom don't work",
  expedition: 'A vendor after the zone',
  blight: "More tiles that aren't in the name",
};

/** A zone's free clue line (or none, as tuned) and its rule (or null). */
export function zoneLines(run: Run, zone: ZoneType) {
  return { free: run.state.tuning.freeClue[zone] ? `Free clue: ${FREE_CLUE[zone]}` : 'No free clue', rule: ZONE_RULE[zone] };
}

/** The label above a free clue on the item: what gave it. */
export const FREE_LABEL = 'Free';

export const BOSS_RULE = 'Silent: only Torches work';
export const BOSS_RULE_SHORT = 'only Torches work';

/** Blood toll, the corruption's one modifier: what it does. */
export const BLOOD_DOES = `Each item here costs ${BLOOD_TOLL} life when you start it. Never your last life.`;
/** Blood toll on a place's row: its cost and its pay. */
export const bloodLine = (run: Run) => {
  const m = run.state.tuning.corruption.multiplier;
  return `−${BLOOD_TOLL} life per item • ${m === 2 ? 'double loot' : `${m}× loot`}`;
};

/** A boss rule the corruption adds: what it does. */
export const BOSS_MOD_DOES: Record<BossMod, string> = {
  lingering: 'One more item to name',
  bloodied: `Misses cost ${BLOODIED} more life`,
  murky: 'Torches reveal half as much',
  teeming: "More tiles that aren't in the name",
};

/** A node's kind as a word: its zone type, or Camp, Town, Well, Boss. */
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

/** A place's kind on its Where next row: "Ritual zone", "Town". */
export const placeKind = (p: Place) => (p.kind === 'zone' ? `${ZONE_NAMES[p.type]} zone` : placeName(p));

/** What a place does when the player arrives, in a line (a zone's free clue; its rule and Blood toll get their own). */
export function placeDoes(run: Run, p: Place): string {
  switch (p.kind) {
    case 'zone':
      return zoneLines(run, p.type).free;
    case 'camp':
      return 'The start';
    case 'town':
      return `Heals ${TOWN_HEAL} life • buy supplies`;
    case 'well':
      return 'Refills your flask';
    case 'boss':
      return `The last fight • ${BOSS_RULE_SHORT}`;
  }
}

/** The boss's row: how many rules the corruption left adds there. */
export function bossAdds(run: Run): string {
  const n = run.state.fronts.filter((f) => f.alive).length;
  return n ? `Each corruption left adds a rule here: ${Math.min(3, n)}` : 'No corruption left: no extra rules';
}

/** Why a supply does nothing on the open item now, or null when it can be used. No counts. */
export function why(run: Run, supply: Supply): string | null {
  switch (run.idle(supply)) {
    case null:
      return null;
    case 'closed':
      return 'Opening the item';
    case 'silent':
      return 'Boss rule: only Torches work';
    case 'ritual':
      return "Ritual zone: Scrolls of Wisdom don't work";
    case 'done':
      return 'Nothing more to show';
  }
}

/** A mark, said. */
export const MARK_SAYS: Record<Mark, string> = { gold: 'right here', silver: 'in the name, elsewhere', struck: 'not in the name' };
export const MARKS_LEGEND = 'Gold: right, in its place • Silver: in the name, elsewhere • Struck: not in the name';

/** The flask, said in full (its tooltip), and on the drink key. */
export const FLASK_LINE = `Heals ${FLASK_STEP} now, and again when this item ends and when the next one ends. Each drink uses one charge. Wells refill it.`;
export const DRINK_LINE = `Heals ${FLASK_STEP} now, and again when this item ends and when the next one ends.`;
export const DRINKING = `+${FLASK_STEP} now • more as this and the next item end`;
/** The flask's heal still due, for a screen reader. */
export const flaskDue = (recovering: number) =>
  `Your flask heals ${FLASK_STEP} more when this item ends${recovering > 1 ? ' and when the next one ends' : ''}`;

/** A vendor card's line: how many come for the price (the coin says gold). */
export const stackLine = (run: Run, s: Supply) => `${run.state.tuning.stack[s]} for ${run.state.tuning.price[s]}`;

/** What a vendor says under the header: the camp's and an Expedition's line, a town's rest. */
export const CAMP_SAYS = 'Buy supplies for the road. More vendors wait in towns and after Expeditions.';
export const EXPEDITION_SAYS = 'A vendor, after the zone. Buy, or go on.';
/** A town's rest: "You rest: +{heal} life" (the words around the number, set in Cinzel), or at full life. */
export const REST = { before: 'You rest: ', after: ' life', full: 'You rest: life is full' };
/** Under every vendor's wares, with the Torch's sign. */
export const VENDOR_BOSS_LINE = 'At the boss, only Torches work';
/** A ware bought into a full pack: a space to pick, or the ware handed back (its gold too). */
export const BOUGHT_FULL = 'Pack full. Tap a space to replace it';
export const handBack = (n: number) => (n === 1 ? 'Hand it back' : 'Hand them back');
export const handBackLabel = (n: number, name: string, price: number) => `Hand back ${n} ${name}, for your ${price} gold`;

/** The pack, said. */
export const PACK_NOTE = `${PACK_STACKS} spaces, up to ${STACK_MAX} of one supply in each.`;

/** A loot card's name (one line: the count is in it). */
export function lootLine(card: LootCard): { name: string; gives: string | null } {
  switch (card.kind) {
    case 'gold':
      return { name: `${card.gold} Gold`, gives: null };
    case 'flask':
      return { name: 'Flask charge', gives: '+1 charge' };
    case 'supply':
      return { name: `${card.n} ${SUPPLY_NAMES[card.supply!]}`, gives: null };
  }
}

/** What a Stacked Deck drew, as its clue's label says it. */
export const DECK_DREW: Record<DeckClue, string> = {
  mod: 'Mod line',
  flavor: 'Flavor text',
  category: 'Ancient Orb',
  base: 'Base type',
  lengths: 'Word lengths',
  burn: 'A patch',
};

/** "2 words: 3 and 2 tiles". */
export function lengthsSaid(lengths: number[]): string {
  const ns = lengths.map(String);
  const list = ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}` : ns[0];
  return `${plural(lengths.length, 'word')}: ${list} tiles`;
}
