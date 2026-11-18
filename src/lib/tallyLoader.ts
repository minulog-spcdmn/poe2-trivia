// The item tally (itemTally.ts), loaded and started once for the whole page,
// wherever it's first wanted: a game begun (session.svelte.ts) or an answer
// on the start page (DailyUnique.svelte). A module of its own, so neither
// takes the tally into its first download; nothing loaded where visits
// aren't counted (count.ts counting).

import { counting } from './count.ts';

type ItemTally = typeof import('./itemTally.ts');

let loading: Promise<ItemTally | null> | null = null;

/** The item tally, loaded and started (once, whoever asks first); null where visits aren't counted, or should its chunk fail to load (its answers go uncounted then). */
export function loadTally(): Promise<ItemTally | null> {
  return (loading ??= counting
    ? import('./itemTally.ts').then(
        (t) => (t.startTally(), t),
        () => null,
      )
    : Promise.resolve(null));
}

/** The item tally if something has asked for it already, else null (nothing loaded for it). */
export const tallyAsked = (): Promise<ItemTally | null> | null => loading;
