// Putting a Wraeclast run (src/wraeclast/rules.ts) where a bench asks for it:
// in a zone or at the lair, by way of the run's own moves (enter), so it
// arrives as a player does. And a wrong line for an item, for the benches'
// misses.

import { REGION } from '../../wraeclast/map.ts';
import { gridAdjacency, letters, type ItemPlay, type Pack, type Run } from '../../wraeclast/rules.ts';

/** A zone at about `ring` links from the lair (the nearest ring that holds one). */
export function nodeAt(ring: number): string {
  const zones = REGION.places.filter((p) => p.kind === 'zone');
  return [...zones].sort((a, b) => Math.abs(a.ring - ring) - Math.abs(b.ring - ring) || a.x - b.x)[0].id;
}

/** Brings the run into a place: onto the map, a place next to it cleared, then entered. */
export function arrive(run: Run, id: string) {
  const s = run.state;
  const place = REGION.byId.get(id)!;
  s.phase = 'map';
  s.vendor = null;
  s.item = null;
  const by = place.links[0];
  if (by && s.places[by]) s.places[by].cleared = true;
  run.enter(id);
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
 * Plays a run on until `stop` holds or it ends: out of each shop, into the
 * first zone open (the lair once `zones` are cleared or none is open), each
 * item opened on a plain grid and answered (wrong first now and then in a
 * zone, when `misses`).
 */
export function playOn(run: Run, stop: () => boolean, { misses = false, zones = 6 }: { misses?: boolean; zones?: number } = {}) {
  const s = run.state;
  for (let guard = 0; guard < 2000 && !stop() && s.phase !== 'end'; guard++) {
    if (s.phase === 'vendor') run.leave();
    else if (s.phase === 'map') {
      const open = REGION.places.filter((p) => p.kind === 'zone' && run.canEnter(p.id));
      run.enter(s.spread < zones && open.length ? open[0].id : REGION.lair.id);
    } else if (s.phase === 'item') {
      const it = s.item!;
      if (it.openedAt === null) {
        run.open(gridAdjacency(s.tuning.seeds));
        continue;
      }
      if (misses && !it.duel && it.n % 4 === 1 && !it.misses && s.life > run.missCost() + 10) {
        it.build = wrongLine(it, 0);
        run.submit();
        continue;
      }
      it.build = [...it.answer];
      it.lineMarks = null;
      run.submit();
    } else if (s.item?.duel) run.next();
    else run.leave();
  }
}
