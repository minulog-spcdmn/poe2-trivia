// Putting a Wraeclast run (src/wraeclast/rules.ts) where a bench asks for it:
// at a node of the map (a zone, the boss), by way of the run's own travel
// (choose), so it arrives as a player does. And a wrong line for an item, for
// the benches' misses.

import { GRAPH } from '../../wraeclast/map.ts';
import { gridAdjacency, letters, type ItemPlay, type Pack, type Run } from '../../wraeclast/rules.ts';

/** A node at a step, or at the nearest step that holds an open one (the map may change under the benches). */
export function nodeAt(step: number): string {
  const open = GRAPH.nodes.filter((n) => n.kind === 'open');
  return [...open].sort((a, b) => Math.abs(a.step - step) - Math.abs(b.step - step) || a.x - b.x)[0].id;
}

/** Brings the run to a node, arriving from a vendor on a node before it. */
export function arrive(run: Run, id: string) {
  const s = run.state;
  const node = GRAPH.byId.get(id)!;
  s.at = GRAPH.prev[id][0] ?? GRAPH.camp.id;
  s.phase = 'vendor';
  s.visit = null;
  s.vendor = { at: 'town', heal: 0 };
  s.steps = Math.max(0, node.step - 1);
  run.choose(id);
}

/** A full pack, as the benches show it. */
export const FULL_PACK: Pack = { flare: 5, wisdom: 3, lore: 2, category: 2 };

/**
 * A wrong line for the item, the `k`th of its misses: the answer's tiles with
 * two swapped and one a decoy (so its marks show gold, silver and struck).
 * Never the answer, never a line sent before.
 */
export function wrongLine(it: ItemPlay, k: number): string[] {
  const sent = new Set(it.log.submits.map((sub) => sub.tiles.join('\u0001')));
  for (let t = 0; t < 12; t++) {
    const line = [...it.answer];
    const j = (k + t) % Math.max(1, line.length);
    if (line.length > 1) [line[j], line[(j + 1) % line.length]] = [line[(j + 1) % line.length], line[j]];
    const d = it.decoys[(k + t) % Math.max(1, it.decoys.length)];
    if (d) line[(j + 2) % line.length] = d;
    if (letters(line.join('')) !== letters(it.log.name) && !sent.has(line.join('\u0001'))) return line;
  }
  return it.decoys.slice(0, 2);
}

/**
 * Plays a run on until `stop` holds or it ends: the leftmost node picked at
 * each vendor and from each zone's reveal, each item opened on a plain grid
 * and answered (wrong first now and then, when `misses`).
 */
export function playOn(run: Run, stop: () => boolean, { misses = false }: { misses?: boolean } = {}) {
  const s = run.state;
  for (let guard = 0; guard < 2000 && !stop() && s.phase !== 'end'; guard++) {
    if (s.phase === 'vendor' || (s.phase === 'solved' && run.leaving())) run.choose(run.options()[0]);
    else if (s.phase === 'item') {
      const it = s.item!;
      if (it.openedAt === null) {
        run.open(gridAdjacency(s.tuning.seeds));
        continue;
      }
      if (misses && it.n % 4 === 1 && !it.misses && s.life > run.missRange()[1] + 10) {
        it.build = wrongLine(it, 0);
        run.submit();
        continue;
      }
      it.build = [...it.answer];
      it.lineMarks = null;
      run.submit();
    } else run.next();
  }
}
