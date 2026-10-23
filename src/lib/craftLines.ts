// The items' mod lines, for Craft: loaded from the tooltips (itemStats.json,
// the same file the item window reads) the first time a room picks Craft.

import { modLinesOf, type ModLines } from './craft.ts';

type Stats = Record<string, [string, string][][]>;

let loading: Promise<ModLines> | undefined;

/** The mod lines of an art, by its id, each art's worked out once. */
export function linesFrom(all: Stats): ModLines {
  const cache = new Map<string, string[]>();
  return (art) => {
    let lines = cache.get(art);
    if (!lines) cache.set(art, (lines = modLinesOf(all[art])));
    return lines;
  };
}

export const loadCraftLines = () => (loading ??= import('../data/itemStats.json').then((m) => linesFrom(m.default as unknown as Stats)));
