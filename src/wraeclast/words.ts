// What the Wraeclast run's screens say about its rules (rules.ts, map.ts):
// the places, the supplies, the marks. The wording is the design's v4 table
// (docs/wraeclast/design-v4-wording.md, on the orchestrator's branch): plain,
// for someone who has never played. Counts the rules keep hidden (tiles not
// in the name, mod lines, words, patches left) are never said.

import { SUPPLY_NAMES, type Depth, type Mark, type Mod, type PlaceKind, type Run, type Supply } from './rules.ts';

/** "1 card", "3 cards", "2 patches". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : /(s|x|z|ch|sh)$/.test(word) ? 'es' : 's'}`;

/** A supply's name for more than one ("3 Torches", "2 Scrolls of Wisdom"). */
const SUPPLY_PLURALS: Record<Supply, string> = {
  flare: 'Torches',
  wisdom: 'Scrolls of Wisdom',
  lore: 'Golden Pages',
  category: 'Ancient Orbs',
};
/** A count of a supply, its name plural past one: "1 Torch", "3 Torches". */
export const supplies = (n: number, supply: Supply) => `${n} ${n === 1 ? SUPPLY_NAMES[supply] : SUPPLY_PLURALS[supply]}`;

/** What each supply does when used. */
export const DOES: Record<Supply, string> = {
  flare: 'Reveals a patch of the art.',
  wisdom: 'Shows a mod line, rarer each time.',
  lore: 'Shows the flavor text, with the name hidden.',
  category: 'Names another item of the same kind as this one.',
};

/** What a supply does when used. */
export const does = (_run: Run, supply: Supply) => DOES[supply];

/** A short name for a pack slot. */
export const SHORT: Record<Supply, string> = {
  flare: 'Torch',
  wisdom: 'Scroll',
  lore: 'Page',
  category: 'Orb',
};

/** A depth as the player reads it. */
export const DEPTH_NAME: Record<Depth, string> = { known: 'Known', obscure: 'Obscure', forgotten: 'Forgotten' };

/** A mod as a waystone says it. */
export const MOD_NAME: Record<Mod, string> = {
  damage: 'Monsters deal extra damage',
  recovery: 'Players have less recovery',
  monsters: 'Area is inhabited by more monsters',
  armoured: 'Monsters are armoured',
};

/** A place's kind as a word: Camp, Town, Zone, the lair. */
export function placeName(kind: PlaceKind): string {
  switch (kind) {
    case 'zone':
      return 'Zone';
    case 'camp':
      return 'Camp';
    case 'town':
      return 'Town';
    case 'lair':
      return 'The lair';
  }
}

/** The Seed's duel line: "The Seed • 70 life • hits 8". */
export const seedLine = (run: Run) => `The Seed • ${run.state.foe.life} life • hits ${run.state.foe.hit}`;
/** Your duel line: "You • 82 life • a bare answer hits 20". */
export const youLine = (run: Run) => `You • ${run.state.life} life • a bare answer hits ${run.duelHit(0)}`;

/** A place's one line on the map, as a tap shows it. */
export function placeLine(run: Run, id: string): string {
  const s = run.state;
  const p = s.places[id];
  switch (p.kind) {
    case 'zone': {
      if (p.cleared) return 'Cleared';
      const mod = run.modAt(id);
      return [DEPTH_NAME[run.depthAt(id)], mod ? MOD_NAME[mod] : null, `${run.goldAt(id)} gold`].filter(Boolean).join(' • ');
    }
    case 'camp':
    case 'town':
      if (!run.healsAt(id)) return 'Town • the shop';
      return s.noHeal ? 'Town • no heal (less recovery) • the shop' : `Town • heals ${s.tuning.townHeal} • the shop`;
    case 'lair':
      return seedLine(run);
  }
}

/** Why a supply does nothing on the open item now, or null when it can be used. No counts. */
export function why(run: Run, supply: Supply): string | null {
  switch (run.idle(supply)) {
    case null:
      return null;
    case 'closed':
      return 'Opening the item';
    case 'armoured':
      return 'Armoured: no supply until your first try';
    case 'done':
      return 'Nothing more to show';
  }
}

/** A mark, said. */
export const MARK_SAYS: Record<Mark, string> = { gold: 'right spot', silver: 'in the name, wrong spot', struck: 'not in the name' };
export const MARKS_LEGEND = 'Gold: right spot • Silver: wrong spot • Struck: not in the name';
/** The marks' key under the answer line, each mark's name and what it means (MARKS_LEGEND, in parts). */
export const MARK_KEY: readonly { mark: Mark; name: string; says: string }[] = [
  { mark: 'gold', name: 'Gold', says: 'right spot' },
  { mark: 'silver', name: 'Silver', says: 'wrong spot' },
  { mark: 'struck', name: 'Struck', says: 'not in the name' },
];
/** How many items with marks the key shows on before it goes. */
export const MARK_KEY_ITEMS = 3;

/** What a shop says under the header: the camp's line, a town's rest. */
export const CAMP_SAYS = 'Buy supplies, one at a time. Towns sell them too.';
/** A town's rest: "You rest: +{heal} life" (the words around the number, set in Cinzel), at full life, or taken by less recovery. */
export const REST = { before: 'You rest: ', after: ' life', full: 'You rest: life is full', none: 'No rest: you have less recovery', shop: 'The shop' };
/** Each clue's label on the item. */
export const CLUE_LABEL = { mod: 'Mod line', flavor: 'Flavor text', category: 'Ancient Orb' } as const;
/** The clues said in words on the item, where nothing of the tooltip shows them. */
export const SAME_KIND = 'the same kind of item';
export const NO_CLUES = 'No clues yet. Use a supply from your pack';
/** No clues and nothing in the pack to get one. */
export const NO_CLUES_EMPTY = 'No clues yet.';
