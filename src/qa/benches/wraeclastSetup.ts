// Putting a Wraeclast run (src/wraeclast/rules.ts) where a bench asks for it:
// at a node of the map as a given place (a zone type, a Well, the boss), with
// its corruption and the boss's modifiers as asked, by way of the run's own
// travel (choose), so it arrives as a player does. And a wrong line for an
// item, for the benches' misses.

import { BOSS_MODS, GRAPH, type BossMod, type Hidden, type Place } from '../../wraeclast/map.ts';
import { BOSS_ITEMS, gridAdjacency, letters, type ItemPlay, type Run, type Supply } from '../../wraeclast/rules.ts';

/** A node at a step, or at the nearest step that holds an open one (the map may change under the benches). */
export function nodeAt(step: number): string {
  const open = GRAPH.nodes.filter((n) => n.kind === 'open');
  return [...open].sort((a, b) => Math.abs(a.step - step) - Math.abs(b.step - step) || a.x - b.x)[0].id;
}

/** Brings the run to a node as `place` (the boss's own place for the boss), arriving from a node before it. */
export function arrive(run: Run, id: string, { place, hidden = null, mods = [] }: { place?: Place; hidden?: Hidden | null; mods?: BossMod[] } = {}) {
  const s = run.state;
  const node = GRAPH.byId.get(id)!;
  if (place) s.places[id] = place;
  // Corrupted as asked: a live front on the node (a zone), or none.
  s.fronts = s.fronts.filter((f) => f.at !== id);
  const rule = BOSS_MODS.find((r) => !s.fronts.some((f) => f.rule === r)) ?? BOSS_MODS[0];
  if (hidden && s.places[id].kind === 'zone') s.fronts.push({ id: s.fronts.length, at: id, alive: true, stoppedAt: null, rule });
  s.at = GRAPH.prev[id][0] ?? GRAPH.camp.id;
  s.phase = 'map';
  s.visit = null;
  s.vendor = null;
  s.stock = [];
  // No creep on the way in: the corruption stays as asked.
  s.steps = Math.max(0, node.step - 1);
  s.crept = s.steps + 1;
  run.choose(id);
  if (s.places[id].kind === 'boss') {
    s.bossMods = [...mods];
    s.log.bossMods = [...mods];
    s.visit!.items = BOSS_ITEMS + (mods.includes('lingering') ? 1 : 0);
  }
}

/** A full pack: its 8 stacks, a supply in each (all but the Base reveal; a bench that uses it swaps it in), as the benches show it. */
export const FULL_PACK: { supply: Supply; n: number }[] = [
  { supply: 'flare', n: 5 },
  { supply: 'wisdom', n: 3 },
  { supply: 'lore', n: 2 },
  { supply: 'category', n: 2 },
  { supply: 'deck', n: 2 },
  { supply: 'decoy', n: 3 },
  { supply: 'lengths', n: 3 },
  { supply: 'first', n: 2 },
];

/**
 * A wrong line for the item, the `k`th of its misses: the answer's tiles with
 * two swapped and one a decoy (so its marks show gold, silver and struck), the
 * locked tile kept. Never the answer, never a line sent before.
 */
export function wrongLine(it: ItemPlay, k: number): string[] {
  const head = it.answer.slice(0, it.locked);
  const rest = it.answer.slice(it.locked);
  const sent = new Set(it.log.submits.map((sub) => sub.tiles.join('\u0001')));
  for (let t = 0; t < 12; t++) {
    const line = [...rest];
    const j = (k + t) % Math.max(1, line.length);
    if (line.length > 1) [line[j], line[(j + 1) % line.length]] = [line[(j + 1) % line.length], line[j]];
    const d = it.decoys[(k + t) % Math.max(1, it.decoys.length)];
    if (d) line[(j + 2) % line.length] = d;
    const out = [...head, ...line];
    if (letters(out.join('')) !== letters(it.log.name) && !sent.has(out.join('\u0001'))) return out;
  }
  return [...head, ...it.decoys.slice(0, 2)];
}

export type Route = 'left' | 'corrupt' | 'clean';

/** The node a route takes among those offered: the leftmost, or the first corrupted one (or not), else the leftmost. */
export function pick(run: Run, route: Route): string {
  const s = run.state;
  const offered = run.options();
  const bad = (id: string) => run.corrupted(id);
  if (route === 'corrupt') return offered.find(bad) ?? offered[0];
  if (route === 'clean') return offered.find((id) => !bad(id)) ?? offered[0];
  return offered[0];
}

/**
 * Plays a run on until `stop` holds or it ends: the route's node picked at
 * each vendor, past each Well and from each zone's last reveal, the boss
 * faced, each item opened on a plain grid and answered (wrong first now and
 * then, a drink after, when `misses`), a supply that doesn't fit left behind.
 */
export function playOn(run: Run, stop: () => boolean, { route = 'left', misses = false }: { route?: Route; misses?: boolean } = {}) {
  const s = run.state;
  for (let guard = 0; guard < 2000 && !stop() && s.phase !== 'end'; guard++) {
    if (s.phase === 'vendor' || s.phase === 'map' || (s.phase === 'solved' && run.leaving())) run.choose(pick(run, route));
    else if (s.phase === 'boss') run.face();
    else if (s.phase === 'item') {
      const it = s.item!;
      if (it.openedAt === null) {
        run.open(gridAdjacency(s.tuning.seeds));
        continue;
      }
      if (misses && it.n % 4 === 1 && !it.misses && s.life > run.missRange()[1] + 10) {
        it.build = wrongLine(it, 0);
        run.submit();
        run.drink();
        continue;
      }
      it.build = [...it.answer];
      it.lineMarks = null;
      run.submit();
    } else if (s.phase === 'solved' && s.loot?.pending.length) run.keep(null);
    else run.next();
  }
}
