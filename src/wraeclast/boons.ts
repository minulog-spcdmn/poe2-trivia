// The Wraeclast run's boons (rules.ts): the 11 singles and the 3 Duos, the
// supplies each names, and which three cards a town's draft deals. What
// each one does is in Run (rules.ts), its wording in words.ts.
//
// "Only the X": X was used on the item and no other supply. "No supply":
// none was used. A Duo qualifies once the boons held name both its supplies.

import type { Supply } from './rules.ts';

export type Boon =
  | 'dagger'
  | 'balbala'
  | 'challenger'
  | 'raincaller'
  | 'vial'
  | 'hare'
  | 'fright'
  | 'mirror'
  | 'assassin'
  | 'upward'
  | 'silver'
  | 'peace'
  | 'honour'
  | 'cloak';

/** The single boons, and the supply each names (none: an empty list). */
export const SINGLES: readonly Boon[] = ['dagger', 'balbala', 'challenger', 'raincaller', 'vial', 'hare', 'fright', 'mirror', 'assassin', 'upward', 'silver'];
/** The Duos (real Trial of the Sekhemas boons), each naming two supplies. */
export const DUOS: readonly Boon[] = ['peace', 'honour', 'cloak'];
export const BOONS: readonly Boon[] = [...SINGLES, ...DUOS];

/** The supplies a boon names. */
export const NAMES: Record<Boon, readonly Supply[]> = {
  dagger: ['flare'],
  balbala: ['flare'],
  challenger: ['lore'],
  raincaller: ['lore'],
  vial: ['category'],
  hare: ['category'],
  fright: ['wisdom'],
  mirror: ['wisdom'],
  assassin: [],
  upward: [],
  silver: [],
  peace: ['flare', 'lore'],
  honour: ['lore', 'wisdom'],
  cloak: ['flare', 'category'],
};

/** The most boons held (no swap: three towns can't reach it). */
export const HOLD = 4;
/** Cards a draft deals. */
export const DRAFT_CARDS = 3;

/** The supplies the boons held name. */
export const namedBy = (held: readonly Boon[]) => new Set(held.flatMap((b) => NAMES[b]));

/** Whether a Duo qualifies: the boons held name both its supplies. */
export const qualifies = (duo: Boon, held: readonly Boon[]) => {
  const named = namedBy(held);
  return NAMES[duo].every((x) => named.has(x));
};

/**
 * A draft's cards, never a boon held and never one twice. The camp (`first`):
 * three singles at random. A later town: a single that names a supply a held
 * boon names (one naming none, when a no-supply boon is held), a qualifying
 * Duo if there is one (else a single at random), and a single at random.
 */
export function dealDraft(held: readonly Boon[], first: boolean, rng: () => number): Boon[] {
  const out: Boon[] = [];
  const pick = (from: readonly Boon[]) => {
    const can = from.filter((b) => !held.includes(b) && !out.includes(b));
    if (!can.length) return false;
    out.push(can[Math.floor(rng() * can.length)]);
    return true;
  };
  if (first) {
    while (out.length < DRAFT_CARDS && pick(SINGLES));
    return out;
  }
  const named = namedBy(held);
  const bare = held.some((b) => !NAMES[b].length);
  if (!pick(SINGLES.filter((b) => (NAMES[b].length ? NAMES[b].some((x) => named.has(x)) : bare)))) pick(SINGLES);
  if (!pick(DUOS.filter((d) => qualifies(d, held)))) pick(SINGLES);
  while (out.length < DRAFT_CARDS && pick(SINGLES));
  return out;
}
