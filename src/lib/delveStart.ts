// Delve: the line the depth banner shows at the start of a run, where it
// would otherwise read "Depth 0". Short and grim, in the exile's voice, each
// true to a run (the light shrinks as you go down, the clock punishes the
// slow, Azurite is a find) or to the alchemist's work the descent is drawn
// as. No zone names (nothing spoiled), no digits (they would set in Cinzel).
//
// Each device deals the lines like a shuffled deck: a line comes back only
// once all the others have been seen. So teammates in one run may each read
// a different line; a reload keeps the run's own.

import { readStored, writeStored } from './storage.ts';

/** The lines a run can start with. */
export const START_LINES: readonly string[] = [
  // Classics from Wraeclast.
  'Still sane, exile?',
  'Stay in the light',
  // The light and the dark.
  'Your light is borrowed',
  'The lamp hungers, exile',
  'The dark is patient',
  'Mind the flame, exile',
  'Slow feet feed the dark',
  'Light is the only map',
  'Every flame burns down',
  'Somewhere a lamp went out',
  'Keep the wick trimmed',
  'Hope is a lit lamp',
  'Your shadow walks ahead',
  'Darkness has a weight here',
  // The mine.
  'They left their lamps',
  'The digging stopped',
  'The deep keeps its dead',
  'The lift groans downward',
  'Azurite glints below',
  'The shaft breathes cold',
  'The cage rope frays',
  'Count the lamps you pass',
  'The miners never came up',
  'The tunnel swallows sound',
  'Cold air rises from below',
  'The pickaxes lie still',
  'Every step echoes twice',
  'The rock sweats here',
  'Something hums below',
  'The timbers creak',
  'Old bones, old lamps',
  'The deep remembers names',
  'Kalguur dug here first',
  // Wraeclast.
  'Wraeclast buries deep',
  'Wraeclast is hollow beneath',
  'Wraeclast dreams below',
  'Even gods fear the deep',
  "Orbs won't save you here",
  'Keep your flask full, exile',
  // The alchemist's work.
  'Solve et coagula',
  'As above, so below',
  'The Great Work begins',
  'First, the blackening',
  'The athanor is lit',
  'The crucible awaits',
  'Seal the vessel, exile',
  'Quicksilver runs downward',
  'Transmute fear into light',
  'Distil the dark into gold',
  'Ash before gold',
  'Seek the stone below',
  'Dissolve, then descend',
  'The vessel must not crack',
  'Light is the first element',
  'Gold sleeps in the dark',
  'Calcine your doubts',
];

/** What a device remembers: the deck's order, how far it is dealt, and the lines its recent runs drew. */
export interface Deck {
  order: number[];
  next: number;
  runs: [startedAt: number, line: number][];
}

/** How many recent runs keep their line (a reload or a resume of one of them shows it again). */
const KEEP = 4;

/** A fresh shuffle of the whole pool (Fisher-Yates), not starting with `avoid` so no line shows twice running. */
export function shuffle(n: number, random: () => number, avoid = -1): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (n > 1 && order[0] === avoid) [order[0], order[n - 1]] = [order[n - 1], order[0]];
  return order;
}

function valid(deck: unknown, n: number): deck is Deck {
  const d = deck as Deck;
  return (
    !!d &&
    Array.isArray(d.order) &&
    d.order.length === n &&
    new Set(d.order).size === n &&
    d.order.every((i) => Number.isInteger(i) && i >= 0 && i < n) &&
    Number.isInteger(d.next) &&
    Array.isArray(d.runs) &&
    d.runs.every((r) => Array.isArray(r) && Number.isInteger(r[1]) && r[1] >= 0 && r[1] < n)
  );
}

/**
 * The line (an index into the pool) for the run that began at `startedAt`, and
 * the deck after it: a run already dealt keeps its line; a new one takes the
 * next card, and a spent deck (or one for another pool) is shuffled anew.
 */
export function deal(deck: Deck | null, startedAt: number, n: number, random: () => number): { line: number; deck: Deck } {
  const ok = deck && valid(deck, n) ? deck : null;
  const kept = ok?.runs.find(([at]) => at === startedAt);
  if (ok && kept) return { line: kept[1], deck: ok };
  let order = ok?.order;
  let next = ok?.next ?? 0;
  if (!order || next >= n) {
    order = shuffle(n, random, ok?.runs[0]?.[1] ?? -1);
    next = 0;
  }
  const line = order[next];
  const runs: Deck['runs'] = [[startedAt, line] as [number, number], ...(ok?.runs ?? [])].slice(0, KEEP);
  return { line, deck: { order, next: next + 1, runs } };
}

const STORE_NAME = 'delveStartDeck';

/** The start line of the run that began at `startedAt` (the run's id, the same after a reload or resume). */
export function startLine(startedAt: number): string {
  let stored: Deck | null = null;
  try {
    stored = JSON.parse(readStored(STORE_NAME) ?? 'null');
  } catch {
    stored = null;
  }
  const { line, deck } = deal(stored, startedAt, START_LINES.length, Math.random);
  if (deck !== stored) writeStored(STORE_NAME, JSON.stringify(deck));
  return START_LINES[line];
}
