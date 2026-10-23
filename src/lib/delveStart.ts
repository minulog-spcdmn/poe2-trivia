// Delve: the line the depth banner shows at the start of a run, where it
// would otherwise read "Depth 0". Short and grim, in the exile's voice, each
// true to a run (the light shrinks as you go down, the clock punishes the
// slow, Azurite is a find) or to the alchemist's work the descent is drawn
// as. No zone names (nothing spoiled), no digits (they would set in Cinzel).
//
// The host picks a run's line as it starts (game.ts) and every screen shows
// that one (Delve.line). It weighs the lines each player's device has shown,
// most recent first (delveStartSeen.ts, sent in a guest's hello): a line none
// of them has seen if there is one, else one the group saw longest ago.

import { seededRandom } from './patches.ts';

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
  "Orbs won’t save you here",
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

/** How many lines a list of seen lines keeps: more than the pool, so a newer build's longer pool fits in a hello. */
export const MAX_SEEN = 96;

/** A list of seen lines as it arrives (from storage, in a hello): lines of this pool, each once, at most MAX_SEEN; anything else dropped. */
export function cleanSeen(v: unknown, n = START_LINES.length): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const i of v.slice(0, MAX_SEEN)) if (Number.isInteger(i) && i >= 0 && i < n && !out.includes(i)) out.push(i);
  return out;
}

/** A list of seen lines after `line` is shown: it moves to the front. */
export const sawLine = (seen: readonly number[], line: number): number[] => [line, ...seen.filter((i) => i !== line)].slice(0, MAX_SEEN);

/**
 * The line (an index into the pool) for the run that began at `startedAt`,
 * given what each player's device has shown, most recent first. A line counts
 * as fresh as it is for whoever saw it last. One nobody has seen comes first;
 * once there is none, it is one of the stalest half, so a line never comes
 * back within half the pool's runs and the order differs each time round.
 * A player with nothing seen (new, or a bot) weighs nothing.
 */
export function pickLine(seen: readonly (readonly number[])[], startedAt: number, n = START_LINES.length): number {
  const ago = Array.from({ length: n }, () => Infinity);
  for (const list of seen) list.forEach((line, at) => line < n && at < ago[line] && (ago[line] = at));
  const unseen = ago.flatMap((a, i) => (a === Infinity ? [i] : []));
  let band = unseen;
  if (!band.length) {
    const floor = [...ago].sort((a, b) => b - a)[Math.ceil(n / 2) - 1];
    band = ago.flatMap((a, i) => (a >= floor ? [i] : []));
  }
  // Seeded by the run's id: the same pick on every call, and nothing drawn from the engine's random.
  return band[Math.floor(seededRandom(startedAt)() * band.length)];
}

/** The start line a run shows: the host's pick, or (a save from before it picked) one from the run's id alone. */
export const lineOf = (run: { line?: string; startedAt: number }) => run.line ?? START_LINES[pickLine([], run.startedAt)];
