// What the Wraeclast run's screens say about its rules (rules.ts): the
// zones, the supplies, where an item stands in the run.

import { BOSS_ITEMS, CLUES, ZONE_ITEMS, ZONE_NAMES, ZONES, remaining, sectionOf, zoneOf, type Run, type Supply, type ZoneType } from './rules.ts';

/** What each supply shows when used. */
export const REVEALS: Record<Supply, string> = {
  flare: 'Lifts 2 patches of the veil, the ones you tap.',
  requirement: 'Shows the level and attribute requirements.',
  wisdom: 'Shows one more mod line, in tooltip order.',
  strike: 'Strikes a wrong name off the board.',
  lore: 'Shows the flavour text.',
};

/** A zone type's free clue, as a line. */
export const FREE_CLUE: Record<ZoneType, string> = {
  plain: 'One patch lifted',
  incursion: 'The flavour text shown',
  ritual: 'One mod line shown',
  blight: 'Two patches lifted',
};

/** A zone type's rule, as a line. */
export const ZONE_RULE: Record<ZoneType, string> = {
  plain: 'No rule',
  incursion: 'Flares lift 1 patch',
  ritual: "Lore reveals don't work",
  blight: '2 more names on the board',
};

/** A zone, said in full: its type, free clue (or none, as tuned) and rule. */
export function zoneLine(run: Run, zone: ZoneType) {
  const free = run.state.tuning.freeClue[zone] ? FREE_CLUE[zone] : 'No free clue';
  return `${free}. ${ZONE_RULE[zone]}.`;
}

export const BOSS_RULE = 'Silent: only Flares work';

/** Where item n (0 to 14) stands: its zone (or the boss) and its place there. */
export function whereOf(run: Run, n: number) {
  const zoneNo = zoneOf(n);
  if (sectionOf(n) === 'boss') return { zone: 'The boss', of: `${n - ZONES * ZONE_ITEMS + 1} of ${BOSS_ITEMS}` };
  const type = run.zoneType(zoneNo)!;
  return { zone: `Zone ${zoneNo} • ${ZONE_NAMES[type]}`, of: `${(n % ZONE_ITEMS) + 1} of ${ZONE_ITEMS}` };
}

/** "1 word", "3 words". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What each of the boss's three items starts with. */
export const BOSS_STEPS = ['It starts with one patch lifted.', 'It starts with nothing lifted.', 'It starts with nothing lifted, and Flares lift 1 patch.'];

/** Why a supply can't be used on the open item, or null when it can (or the pack holds none, which the pack says). */
export function why(run: Run, supply: Supply): string | null {
  const it = run.state.item;
  if (!it || run.works(supply)) return null;
  if (it.openedAt === null) return 'The item is opening';
  if (it.boss !== null && supply !== 'flare') return 'Silent: it does nothing here';
  const clues = CLUES[it.itemId];
  switch (supply) {
    case 'flare':
      return it.flare ? 'Tap the patches first' : 'Nothing left to lift';
    case 'requirement':
      return it.shown.req ? 'Shown already' : 'This item has none';
    case 'wisdom':
      return clues.mods.length ? 'Every line is shown' : 'This item has no mod lines';
    case 'strike':
      return `Only ${plural(remaining(it).length, 'name')} left`;
    case 'lore':
      if (run.zoneType(it.zoneNo) === 'ritual') return "Lore reveals don't work in Ritual";
      return it.shown.flavor ? 'Shown already' : 'This item has none';
  }
}

/** What a supply shows when used, on the open item (a Flare lifts fewer in places). */
export function reveals(run: Run, supply: Supply) {
  if (supply !== 'flare') return REVEALS[supply];
  const k = run.flareLifts();
  return `Lifts ${k} ${k === 1 ? 'patch' : 'patches'} of the veil, the ${k === 1 ? 'one' : 'ones'} you tap.`;
}
