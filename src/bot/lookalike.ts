// How alike each option of a question looks to the right one, for the wrong
// answer a bot falls for (brain.ts wrongPick): people mix up items whose art
// looks alike, not just names that do. The host knows every option's item
// and goes by the look-alike table the game picks its decoys by (looks.ts);
// a guest knows only the names on screen (name questions) or what its eyes
// made of the pictures (art questions, sight.ts).

import { allArt, drawnAs, type Item, type Question } from '../lib/game';
import { loadLooks, type Looks } from '../lib/looks';
import { engine } from '../lib/session.svelte';
import { lastReading } from './sight';

let looks: Looks | null = null;
void loadLooks().then(
  (l) => (looks = l),
  () => {},
);

/** The look-alike table's scores run from about 0.6 (among an item's closest) to 0.9: from not alike at all to very. */
const lookLike = (score: number) => Math.min(1, Math.max(0, (score - 0.5) / 0.4));

/** How alike two items' art looks: the likest of their pictures (`a` as shown, when known). */
function alike(a: readonly string[], b: Item): number | null {
  if (!looks || !a.length) return null;
  return lookLike(Math.max(...a.flatMap((x) => allArt(b).map((y) => looks!.lookScore(x, y.art)))));
}

let byName: Map<string, Item> | null = null;
const named = (name: string | null) => {
  byName ??= new Map(engine.items.map((it) => [it.name, it]));
  return (name && byName.get(name)) || null;
};

/**
 * How alike each option looks to the one it takes for right (`right`), 0
 * to 1, null where it can't tell (made-up names have no art); undefined
 * when it has nothing to go on.
 */
export function looksOf(q: Question, right: number): (number | null)[] | undefined {
  if (q.itemId && q.options.length) {
    // The host: every option's item, and which of its pictures shows.
    const items = q.options.map((id) => engine.byId.get(id) ?? null);
    const target = items[right];
    if (!target) return undefined;
    const shownArt = q.mode === 'art' ? [drawnAs(target, q.variant?.[right]).art] : [drawnAs(target, q.variant?.[0]).art];
    return items.map((it, i) => (i === right || !it ? null : alike(shownArt, it)));
  }
  if (q.mode === 'name') {
    // A guest on a name question: the names on screen, and the art they stand for.
    const target = named(q.labels[right]);
    if (!target) return undefined;
    const arts = allArt(target).map((a) => a.art);
    return q.labels.map((l, i) => {
      const it = i === right ? null : named(l);
      return it ? alike(arts, it) : null;
    });
  }
  // A guest on an art question: how alike its eyes found each picture to the item asked for.
  const r = lastReading;
  if (!r || r.qid !== q.askedAt) return undefined;
  return r.scores.map((v, i) => (i === right || v <= -1 ? null : Math.min(1, Math.max(0, (v - 0.3) / 0.6))));
}
