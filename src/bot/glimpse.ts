// How much of a burning-in picture a bot has in view: what a person
// recognises an item by on a veiled question. Both the host and a guest
// show the patches as they come (media.svelte.ts shown), so a bot goes by
// what is actually on its screen, not by the answer it may hold. Each patch
// takes its burn to come into view (patches.ts burntShare), counted from
// when this page first had it.

import { burntShare } from '../lib/patches.ts';
import { shown } from '../lib/media.svelte.ts';
import type { Question } from '../lib/game.ts';
import { shareInView } from './brain.ts';

/** When each patch came to this page, by picture (-1: a name question's art) and patch, for the question `seenFor`. */
const came = new Map<number, Map<number, number>>();
let seenFor = 0;

/** Notes the patches on screen now (called every tick while a question is up, so their times are close). */
export function watchVeil(q: Question, now = Date.now()) {
  if (!q.veil || shown.qid !== q.askedAt) return;
  if (seenFor !== q.askedAt) {
    came.clear();
    seenFor = q.askedAt;
  }
  const note = (tile: number, patches: Record<number, unknown>) => {
    let m = came.get(tile);
    if (!m) came.set(tile, (m = new Map()));
    for (const i of Object.keys(patches)) if (!m.has(+i)) m.set(+i, now);
  };
  note(-1, shown.patches);
  for (const [tile, patches] of Object.entries(shown.tilePatches)) note(+tile, patches);
}

/**
 * How much of the question's art is in view (0 to 1): all of it without a
 * veil; on a "find the art" question with each picture veiled, of picture
 * `tile` (the one it's looking for), or of them all on average.
 */
export function inView(q: Question, tile: number | null = null, now = Date.now()): number {
  if (!q.veil) return 1;
  if (shown.qid !== q.askedAt) return 0;
  watchVeil(q, now);
  const one = (t: number) => {
    const veil = t < 0 ? shown.veil : shown.tileVeils[t];
    if (!veil) return 0;
    return shareInView([...(came.get(t)?.values() ?? [])], now, veil.burn, veil.count, burntShare);
  };
  const tiles = Object.keys(shown.tileVeils).map(Number);
  if (q.mode === 'name' || !tiles.length) return one(-1);
  if (tile !== null && shown.tileVeils[tile]) return one(tile);
  return tiles.reduce((a, t) => a + one(t), 0) / tiles.length;
}
