// The Wraeclast run's map (wraeclast.html, src/wraeclast): the nodes as the
// owner placed them (src/data/wraeclast.json, hand-placed, so not generated),
// the paths between them (built here when the page loads, never stored), and
// what each node is in a run (every open node a zone). Pure, so a test builds
// a map the same as the page does.
//
// The file can change under the code (the owner is re-stepping it to 10
// steps): a step holds 2 to 4 places (1 where a town stands alone), a step with none is skipped, a town
// can sit at any step, and the boss's step is the last, whatever it is.

import mapData from '../data/wraeclast.json' with { type: 'json' };

export type NodeKind = 'camp' | 'town' | 'boss' | 'open';

export interface MapNode {
  id: string;
  name: string;
  /** 0 (the camp) to the boss's (the last). */
  step: number;
  /** Where it sits on the illustrated map, as fractions of its width and height. */
  x: number;
  y: number;
  kind: NodeKind;
}

export const MAP_NODES: MapNode[] = (mapData as { nodes: MapNode[] }).nodes;

/** The map's nodes and paths: each node's links forward (to the next non-empty step) and back. */
export interface MapGraph {
  nodes: MapNode[];
  byId: Map<string, MapNode>;
  /** The steps that hold nodes, in order. */
  steps: number[];
  /** Each step's nodes. */
  atStep: Map<number, MapNode[]>;
  next: Record<string, string[]>;
  prev: Record<string, string[]>;
  camp: MapNode;
  boss: MapNode;
}

const dist = (a: MapNode, b: MapNode) => Math.hypot(a.x - b.x, a.y - b.y);
const nearest = (from: MapNode, among: MapNode[]) => [...among].sort((a, b) => dist(from, a) - dist(from, b) || a.id.localeCompare(b.id));

/**
 * The paths: each node links to its 2 nearest nodes on the next non-empty
 * step (all of them when there are only 1 or 2), and each node there that no
 * link reached gets one from its nearest node on the step before. Links only
 * go forward.
 */
export function buildGraph(nodes: MapNode[] = MAP_NODES): MapGraph {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const steps = [...new Set(nodes.map((n) => n.step))].sort((a, b) => a - b);
  const atStep = new Map(steps.map((s) => [s, nodes.filter((n) => n.step === s)]));
  const next: Record<string, string[]> = Object.fromEntries(nodes.map((n) => [n.id, []]));
  const prev: Record<string, string[]> = Object.fromEntries(nodes.map((n) => [n.id, []]));
  const link = (a: MapNode, b: MapNode) => {
    if (next[a.id].includes(b.id)) return;
    next[a.id].push(b.id);
    prev[b.id].push(a.id);
  };
  for (let k = 0; k + 1 < steps.length; k++) {
    const here = atStep.get(steps[k])!;
    const ahead = atStep.get(steps[k + 1])!;
    for (const a of here) for (const b of ahead.length <= 2 ? ahead : nearest(a, ahead).slice(0, 2)) link(a, b);
    for (const b of ahead) if (!prev[b.id].length) link(nearest(b, here)[0], b);
  }
  // Left to right on the map, so lists read as the map does.
  for (const id of Object.keys(next)) next[id].sort((a, b) => byId.get(a)!.x - byId.get(b)!.x);
  const camp = nodes.find((n) => n.kind === 'camp') ?? atStep.get(steps[0])![0];
  const boss = nodes.find((n) => n.kind === 'boss') ?? atStep.get(steps.at(-1)!)![0];
  return { nodes, byId, steps, atStep, next, prev, camp, boss };
}

export const GRAPH = buildGraph();

// ---- What a run plays ----

/** What a node is in this run. */
export type Place = { kind: 'camp' } | { kind: 'town' } | { kind: 'boss' } | { kind: 'zone' };

/** What each node is this run: every open node a zone, the rest as the map marks them. */
export function rollPlaces(g: MapGraph): Record<string, Place> {
  return Object.fromEntries(g.nodes.map((n) => [n.id, { kind: n.kind === 'open' ? 'zone' : n.kind } as Place]));
}
