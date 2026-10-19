// The Wraeclast run's map (wraeclast.html, src/wraeclast): the nodes as the
// owner placed them (src/data/wraeclast.json, hand-placed, so not generated),
// the paths between them (built here when the page loads, never stored), and
// what each run rolls on them: which open nodes are zones and which Wells,
// each zone's type, and where the corruption fronts start and how they creep.
// Pure, so a test rolls and creeps a map the same as the page does.
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

// ---- What a run rolls ----

export type ZoneType = 'plain' | 'incursion' | 'essence' | 'ritual' | 'expedition' | 'blight';
export const ZONE_TYPES: readonly ZoneType[] = ['plain', 'incursion', 'essence', 'ritual', 'expedition', 'blight'];
export const ZONE_NAMES: Record<ZoneType, string> = {
  plain: 'Plain',
  incursion: 'Incursion',
  essence: 'Essence',
  ritual: 'Ritual',
  expedition: 'Expedition',
  blight: 'Blight',
};

/** A corrupted zone's modifier: every one has the same, Blood toll, shown on the map. */
export type Hidden = 'blood';
export const HIDDEN: readonly Hidden[] = ['blood'];
export const HIDDEN_NAMES: Record<Hidden, string> = { blood: 'Blood toll' };

/** What each live front adds to the boss, rolled, at most BOSS_MODS. */
export type BossMod = 'lingering' | 'bloodied' | 'murky' | 'teeming';
export const BOSS_MODS: readonly BossMod[] = ['lingering', 'bloodied', 'murky', 'teeming'];
export const BOSS_MOD_NAMES: Record<BossMod, string> = { lingering: 'Lingering', bloodied: 'Bloodied', murky: 'Murky', teeming: 'Teeming' };
/** The most rules the corruption can add at the boss: one per corruption, each its own. */
export const MAX_BOSS_MODS = 4;

/** What a node is in this run. */
export type Place = { kind: 'camp' } | { kind: 'town' } | { kind: 'boss' } | { kind: 'well' } | { kind: 'zone'; type: ZoneType };

/**
 * A corruption front: a zone, the only one it corrupts. Creeping on, it
 * leaves the zone it stood on a normal zone again. Stopped (its zone cleared),
 * it stays where it was, and that zone is normal too.
 */
export interface Front {
  /** Its number, from 0, in the order seeded. */
  id: number;
  at: string;
  alive: boolean;
  /** The node it was stopped at (cleared there), or null. */
  stoppedAt: string | null;
  /** The rule it adds at the boss if it's still alive there, dealt as it's seeded (no two alike). */
  rule: BossMod;
}

/** Whether a node is corrupted: a live front stands on it. */
export const corruptedAt = (fronts: readonly Front[], id: string) => fronts.some((f) => f.alive && f.at === id);

/** The steps corruption seeds at, both ends in: the route's first half, from step 2 (2 to 5 on a 10-step route). */
export const seedSteps = (g: MapGraph): [number, number] => [2, Math.max(2, Math.floor(g.boss.step / 2))];
/** How far apart seeds sit across the map (a fraction of its width) where the map allows: "on different branches". */
export const SEED_GAP = 0.15;

/** A draw by weight, or null when every weight is 0. */
export function weighted<K extends string>(weights: Record<K, number>, keys: readonly K[], rng: () => number): K | null {
  const total = keys.reduce((t, k) => t + Math.max(0, weights[k]), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const k of keys) if ((r -= Math.max(0, weights[k])) < 0) return k;
  return keys[keys.length - 1];
}

function shuffled<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * What each node is this run. Open nodes are zones about `zoneShare` percent
 * of the time, else Wells, but the first step after the camp and the last
 * before the boss are always zones. Each zone rolls a type; the zones of one
 * step draw theirs from a shuffle, so a step's branches differ where it can.
 */
export function rollPlaces(g: MapGraph, zoneShare: number, rng: () => number): Record<string, Place> {
  const out: Record<string, Place> = {};
  const first = g.steps[1];
  const last = g.steps.at(-2);
  for (const step of g.steps) {
    let types: ZoneType[] = [];
    for (const n of g.atStep.get(step)!) {
      if (n.kind !== 'open') {
        out[n.id] = { kind: n.kind };
        continue;
      }
      const zone = step === first || step === last || rng() * 100 < zoneShare;
      if (!zone) {
        out[n.id] = { kind: 'well' };
        continue;
      }
      if (!types.length) types = shuffled(ZONE_TYPES, rng);
      out[n.id] = { kind: 'zone', type: types.pop()! };
    }
  }
  return out;
}

/**
 * Where corruption starts: `count` zones in the route's first half
 * (seedSteps), on different branches where possible (at least SEED_GAP apart
 * across the map), each with its own boss rule (so at most one per rule).
 */
export function seedFronts(g: MapGraph, places: Record<string, Place>, count: number, rng: () => number): Front[] {
  const [lo, hi] = seedSteps(g);
  count = Math.min(count, BOSS_MODS.length);
  const zones = shuffled(
    g.nodes.filter((n) => n.step >= lo && n.step <= hi && places[n.id].kind === 'zone'),
    rng,
  );
  // The first set (in the shuffle's order) whose seeds all sit SEED_GAP apart, searched in full so an early
  // pick in the middle never spoils a spread the map allows; else as many apart as it can, the rest filling in.
  const apart = (set: MapNode[], n: MapNode) => set.every((p) => Math.abs(p.x - n.x) >= SEED_GAP);
  let best: MapNode[] = [];
  const search = (from: number, set: MapNode[]): boolean => {
    if (set.length > best.length) best = [...set];
    if (set.length >= count) return true;
    for (let i = from; i < zones.length; i++) if (apart(set, zones[i]) && search(i + 1, [...set, zones[i]])) return true;
    return false;
  };
  search(0, []);
  const picked: MapNode[] = best.slice(0, count);
  // Where the map can't keep them apart, the nearest ones fill in.
  for (const n of zones) if (picked.length < count && !picked.includes(n)) picked.push(n);
  const rules = shuffled(BOSS_MODS, rng);
  return picked.map((n, id) => ({ id, at: n.id, alive: true, stoppedAt: null, rule: rules[id] }));
}

/** A front's move as it creeps. */
export interface Move {
  front: number;
  from: string;
  to: string;
}

/**
 * Each live front creeps one step: onto a zone on the next step it links to,
 * at random, one no other live front stands on where it can; the zone it
 * left is normal again. Facing only towns, Wells or the boss, it jumps to a
 * zone the step after, through them. With nowhere to go, it waits. A zone at
 * or behind the player's step is never crept onto. Returns the moves.
 */
export function creep(g: MapGraph, places: Record<string, Place>, fronts: Front[], playerStep: number, rng: () => number): Move[] {
  const isZone = (id: string) => places[id].kind === 'zone' && g.byId.get(id)!.step > playerStep;
  const moves: Move[] = [];
  for (const f of fronts) {
    if (!f.alive) continue;
    let ahead = g.next[f.at].filter(isZone);
    // Only a front facing no zone at all (towns, Wells, the boss) jumps; one held up by zones the player has reached waits.
    if (!ahead.length && !g.next[f.at].some((id) => places[id].kind === 'zone'))
      ahead = [...new Set(g.next[f.at].flatMap((id) => g.next[id]))].filter(isZone);
    const free = ahead.filter((id) => !fronts.some((o) => o !== f && o.alive && o.at === id));
    const pick = free.length ? free : ahead;
    if (!pick.length) continue;
    const to = pick[Math.floor(rng() * pick.length)];
    moves.push({ front: f.id, from: f.at, to });
    f.at = to;
  }
  return moves;
}

/** The boss's rules the corruption adds: each live front's own (a waiting one too), in the order seeded. */
export const bossRulesOf = (fronts: readonly Front[]): BossMod[] => fronts.filter((f) => f.alive).map((f) => f.rule);
