import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/lib/patches.ts';
import {
  BOSS_MODS,
  GRAPH,
  HIDDEN,
  MAP_NODES,
  MAX_BOSS_MODS,
  SEED_GAP,
  SEED_STEPS,
  ZONE_TYPES,
  buildGraph,
  creep,
  rollBossMods,
  rollPlaces,
  seedFronts,
  weighted,
  type Corrupt,
  type Front,
  type Hidden,
  type MapGraph,
  type MapNode,
  type Place,
} from '../src/wraeclast/map.ts';
import { Run, DEFAULT_TUNING, MAX_TILES, gridAdjacency, type Tuning } from '../src/wraeclast/rules.ts';
import { arrive, nodeAt, playOn, wrongLine } from '../src/qa/benches/wraeclastSetup.ts';

// The Wraeclast run's map (src/wraeclast/map.ts) and its corruption in a run
// (src/wraeclast/rules.ts) held to the handoff, docs/handoff/wraeclast/v3.md
// ("The map", "Corruption"). The paths are worked out again here from the
// handoff's rule, on the owner's map and on made-up ones (the owner is still
// placing nodes, so the code must take any file); each run's rolls are
// seeded, so every test plays the same every time.

const tuned = (change: (t: Tuning) => void) => {
  const t = structuredClone(DEFAULT_TUNING);
  change(t);
  return t;
};

const node = (id: string, step: number, x: number, y: number, kind: MapNode['kind'] = 'open'): MapNode => ({ id, name: id, step, x, y, kind });

/** A made-up map: step 2 and 4 left empty, a town at the odd step 3 and another at 5. */
const MADE_UP: MapNode[] = [
  node('camp', 0, 0.5, 0, 'camp'),
  node('a1', 1, 0.2, 0.1),
  node('a2', 1, 0.8, 0.1),
  node('b1', 3, 0.1, 0.3),
  node('b2', 3, 0.4, 0.3, 'town'),
  node('b3', 3, 0.6, 0.3),
  node('b4', 3, 0.9, 0.3),
  node('c1', 5, 0.5, 0.5, 'town'),
  node('d1', 6, 0.3, 0.7),
  node('d2', 6, 0.7, 0.7),
  node('boss', 8, 0.5, 0.9, 'boss'),
];

/** The paths as the handoff builds them: each node to its 2 nearest on the next non-empty step (all when 1 or 2), and any node there left without a link gets one from its nearest on the step before. */
function handoffLinks(nodes: MapNode[]): Record<string, Set<string>> {
  const steps = [...new Set(nodes.map((n) => n.step))].sort((a, b) => a - b);
  const at = (s: number) => nodes.filter((n) => n.step === s);
  const d = (a: MapNode, b: MapNode) => Math.hypot(a.x - b.x, a.y - b.y);
  const near = (from: MapNode, among: MapNode[]) => [...among].sort((a, b) => d(from, a) - d(from, b) || a.id.localeCompare(b.id));
  const out: Record<string, Set<string>> = Object.fromEntries(nodes.map((n) => [n.id, new Set<string>()]));
  for (let k = 0; k + 1 < steps.length; k++) {
    const here = at(steps[k]);
    const ahead = at(steps[k + 1]);
    for (const a of here) for (const b of ahead.length <= 2 ? ahead : near(a, ahead).slice(0, 2)) out[a.id].add(b.id);
    for (const b of ahead) if (!here.some((a) => out[a.id].has(b.id))) out[near(b, here)[0].id].add(b.id);
  }
  return out;
}

/** The nodes reachable from `from` along the paths. */
function reach(g: MapGraph, from: string): Set<string> {
  const seen = new Set([from]);
  const todo = [from];
  while (todo.length) for (const id of g.next[todo.pop()!]) if (!seen.has(id)) seen.add(id), todo.push(id);
  return seen;
}

/** Every open node a zone of type plain, so the creep tests choose where Wells and towns stand. */
const allZones = (g: MapGraph): Record<string, Place> =>
  Object.fromEntries(g.nodes.map((n) => [n.id, n.kind === 'open' ? { kind: 'zone', type: 'plain' } : { kind: n.kind }])) as Record<string, Place>;

const front = (at: string, id = 0): Front => ({ id, at, alive: true, stoppedAt: null });
const W = DEFAULT_TUNING.corruption.weights;
const stepOf = (id: string) => GRAPH.byId.get(id)!.step;

// ---- The paths ----

test("the owner's map: a camp at step 0, a boss at step 16, 1 to 4 nodes a step", () => {
  assert.equal(GRAPH.nodes, MAP_NODES);
  assert.deepEqual([GRAPH.camp.kind, GRAPH.camp.step, GRAPH.boss.kind, GRAPH.boss.step], ['camp', 0, 'boss', 16]);
  for (const s of GRAPH.steps) {
    const n = GRAPH.atStep.get(s)!.length;
    assert.ok(n >= 1 && n <= 4, `step ${s}: ${n} nodes`);
  }
  assert.deepEqual(GRAPH.steps, [...GRAPH.steps].sort((a, b) => a - b));
  assert.equal(new Set(GRAPH.nodes.map((n) => n.id)).size, GRAPH.nodes.length);
});

test('each node links forward only, to the next non-empty step, and the links back mirror them', () => {
  for (const g of [GRAPH, buildGraph(MADE_UP)])
    g.steps.forEach((s, k) => {
      for (const n of g.atStep.get(s)!) {
        for (const id of g.next[n.id]) assert.equal(g.byId.get(id)!.step, g.steps[k + 1], `${n.id} to ${id}`);
        for (const id of g.prev[n.id]) assert.equal(g.byId.get(id)!.step, g.steps[k - 1], `${n.id} from ${id}`);
        for (const id of g.next[n.id]) assert.ok(g.prev[id].includes(n.id));
        assert.equal(new Set(g.next[n.id]).size, g.next[n.id].length, `${n.id} links once to each`);
      }
    });
});

test('each node links to its 2 nearest on the next step, or to all there when it holds 1 or 2, and to nothing else but what gives a node its one link', () => {
  for (const nodes of [MAP_NODES, MADE_UP]) {
    const g = buildGraph(nodes);
    const want = handoffLinks(nodes);
    for (const n of nodes) assert.deepEqual(new Set(g.next[n.id]), want[n.id], n.id);
  }
});

test('a node no nearest 2 reached gets its link from its nearest node on the step before', () => {
  const nodes = [node('camp', 0, 0.5, 0, 'camp'), node('one', 1, 0.5, 0.2), node('w', 2, 0.05, 0.4), node('m1', 2, 0.45, 0.4), node('m2', 2, 0.55, 0.4), node('e', 2, 0.95, 0.4), node('boss', 3, 0.5, 0.6, 'boss')];
  const g = buildGraph(nodes);
  // "one" links to its nearest 2 (m1, m2); w and e get theirs from it, as the only node before.
  assert.deepEqual(g.next.one, ['w', 'm1', 'm2', 'e']);
  for (const id of ['w', 'm1', 'm2', 'e']) assert.deepEqual(g.prev[id], ['one']);
});

test('the links read left to right, as the map does', () => {
  for (const id of Object.keys(GRAPH.next)) {
    const xs = GRAPH.next[id].map((n) => GRAPH.byId.get(n)!.x);
    assert.deepEqual(xs, [...xs].sort((a, b) => a - b), id);
  }
});

test('every node past the camp has a link in, and every node before the boss a link out', () => {
  for (const g of [GRAPH, buildGraph(MADE_UP)])
    for (const n of g.nodes) {
      if (n !== g.camp) assert.ok(g.prev[n.id].length > 0, `${n.id} has a way in`);
      if (n !== g.boss) assert.ok(g.next[n.id].length > 0, `${n.id} has a way on`);
    }
  assert.deepEqual([GRAPH.prev[GRAPH.camp.id], GRAPH.next[GRAPH.boss.id]], [[], []]);
});

test('the boss is reachable from the camp, and so is every node', () => {
  for (const g of [GRAPH, buildGraph(MADE_UP)]) {
    const seen = reach(g, g.camp.id);
    assert.ok(seen.has(g.boss.id));
    assert.equal(seen.size, g.nodes.length);
  }
});

test('a map with an empty step and towns at odd steps still builds, its empty steps skipped', () => {
  const g = buildGraph(MADE_UP);
  assert.deepEqual(g.steps, [0, 1, 3, 5, 6, 8]);
  assert.deepEqual([g.camp.id, g.boss.id], ['camp', 'boss']);
  assert.deepEqual(g.next, {
    camp: ['a1', 'a2'],
    a1: ['b1', 'b2'],
    a2: ['b3', 'b4'],
    b1: ['c1'],
    b2: ['c1'],
    b3: ['c1'],
    b4: ['c1'],
    c1: ['d1', 'd2'],
    d1: ['boss'],
    d2: ['boss'],
    boss: [],
  });
  const places = rollPlaces(g, 0, seededRandom(1));
  assert.deepEqual([places.b2, places.c1, places.camp, places.boss], [{ kind: 'town' }, { kind: 'town' }, { kind: 'camp' }, { kind: 'boss' }]);
});

test('a map without a node marked camp or boss takes its first and last steps', () => {
  const g = buildGraph(MADE_UP.map((n) => ({ ...n, kind: 'open' as const })));
  assert.deepEqual([g.camp.id, g.boss.id], ['camp', 'boss']);
});

// ---- What a run rolls ----

test('the first and last steps between the camp and the boss are always zones, even with no zones elsewhere', () => {
  for (const g of [GRAPH, buildGraph(MADE_UP)])
    for (let seed = 1; seed <= 50; seed++) {
      const places = rollPlaces(g, 0, seededRandom(seed));
      for (const n of g.nodes) {
        const p = places[n.id];
        if (n.kind !== 'open') assert.equal(p.kind, n.kind, n.id);
        else if (n.step === g.steps[1] || n.step === g.steps.at(-2)) assert.equal(p.kind, 'zone', `${n.id} on seed ${seed}`);
        else assert.equal(p.kind, 'well', `${n.id} on seed ${seed}`);
      }
    }
  assert.deepEqual([GRAPH.steps[1], GRAPH.steps.at(-2)], [1, 15]);
});

test('about 1 open node in 6 is a Well, over many seeds', () => {
  let wells = 0;
  let open = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const places = rollPlaces(GRAPH, DEFAULT_TUNING.zoneShare, seededRandom(seed));
    for (const n of GRAPH.nodes)
      if (n.kind === 'open' && n.step !== 1 && n.step !== 15) {
        open++;
        if (places[n.id].kind === 'well') wells++;
      }
  }
  const share = wells / open;
  assert.ok(share > 0.13 && share < 0.21, `${(share * 100).toFixed(1)}% Wells`);
});

test('no Wells at a zone share of 100', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const places = rollPlaces(GRAPH, 100, seededRandom(seed));
    assert.ok(Object.values(places).every((p) => p.kind !== 'well'), `seed ${seed}`);
  }
});

test("every zone gets a type, a step's zones differ where they can, and every type comes up", () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 100; seed++) {
    const places = rollPlaces(GRAPH, 100, seededRandom(seed));
    for (const s of GRAPH.steps) {
      const types = GRAPH.atStep.get(s)!.flatMap((n) => (places[n.id].kind === 'zone' ? [(places[n.id] as { type: string }).type] : []));
      assert.equal(new Set(types).size, types.length, `step ${s} on seed ${seed}: ${types}`);
      for (const t of types) seen.add(t);
    }
  }
  assert.deepEqual([...seen].sort(), [...ZONE_TYPES].sort());
});

// ---- Corruption seeds ----

test(`seeds sit on zones at steps ${SEED_STEPS[0]} to ${SEED_STEPS[1]}, as many as asked, each once, with a modifier`, () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rng = seededRandom(seed);
    const places = rollPlaces(GRAPH, DEFAULT_TUNING.zoneShare, rng);
    const zones = GRAPH.nodes.filter((n) => n.step >= 3 && n.step <= 7 && places[n.id].kind === 'zone');
    for (const count of [0, 1, 3, 5]) {
      const { corrupt, fronts } = seedFronts(GRAPH, places, count, W, rng);
      assert.equal(fronts.length, Math.min(count, zones.length));
      assert.deepEqual(Object.keys(corrupt).sort(), fronts.map((f) => f.at).sort());
      fronts.forEach((f, i) => {
        const n = GRAPH.byId.get(f.at)!;
        assert.ok(n.step >= 3 && n.step <= 7, `${f.at} at step ${n.step}`);
        assert.equal(places[f.at].kind, 'zone');
        assert.deepEqual(f, { id: i, at: f.at, alive: true, stoppedAt: null });
        assert.ok(HIDDEN.includes(corrupt[f.at].hidden));
        assert.equal(corrupt[f.at].cleansed, false);
      });
    }
  }
});

test("seeds' modifiers follow the weights", () => {
  const places = rollPlaces(GRAPH, 100, seededRandom(4));
  for (const h of HIDDEN) {
    const only = Object.fromEntries(HIDDEN.map((k) => [k, k === h ? 1 : 0])) as Record<Hidden, number>;
    const { corrupt } = seedFronts(GRAPH, places, 3, only, seededRandom(5));
    assert.ok(Object.values(corrupt).every((c) => c.hidden === h), h);
  }
  // Every weight 0: a Bounty, the modifier with no catch.
  const none = Object.fromEntries(HIDDEN.map((k) => [k, 0])) as Record<Hidden, number>;
  assert.ok(Object.values(seedFronts(GRAPH, places, 3, none, seededRandom(5)).corrupt).every((c) => c.hidden === 'bounty'));
});

test(`seeds sit at least ${SEED_GAP} apart across the map when the map keeps them apart, and fill in close when it can't`, () => {
  // Three groups far apart, two nodes each close together: any 3 picks one of each.
  const nodes = [
    node('camp', 0, 0.5, 0, 'camp'),
    node('s1', 1, 0.5, 0.1),
    node('s2', 2, 0.5, 0.2),
    node('l1', 3, 0.1, 0.3),
    node('l2', 4, 0.12, 0.4),
    node('m1', 5, 0.5, 0.5),
    node('m2', 6, 0.52, 0.6),
    node('r1', 7, 0.9, 0.7),
    node('r2', 7, 0.88, 0.75),
    node('end', 8, 0.5, 0.8),
    node('boss', 9, 0.5, 0.9, 'boss'),
  ];
  const g = buildGraph(nodes);
  const places = rollPlaces(g, 100, seededRandom(1));
  for (let seed = 1; seed <= 100; seed++) {
    const { fronts } = seedFronts(g, places, 3, W, seededRandom(seed));
    assert.deepEqual(fronts.map((f) => f.at[0]).sort(), ['l', 'm', 'r'], `seed ${seed}`);
  }
  // All in one column: no way to keep them apart, so 3 still seed.
  const column = nodes.map((n) => ({ ...n, x: 0.5 }));
  const cg = buildGraph(column);
  assert.equal(seedFronts(cg, rollPlaces(cg, 100, seededRandom(1)), 3, W, seededRandom(2)).fronts.length, 3);
});

test("on the owner's map, seeds sit apart whenever some 3 of its zones there could (\"on different branches where possible\")", () => {
  // seedFronts keeps the first zones of a shuffle that sit apart, so an early
  // pick in the middle can leave no third far enough from both, though another
  // choice of three would have been.
  let fails = 0;
  let possible = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rng = seededRandom(seed);
    const places = rollPlaces(GRAPH, DEFAULT_TUNING.zoneShare, rng);
    const { fronts } = seedFronts(GRAPH, places, 3, W, rng);
    const xs = GRAPH.nodes.filter((n) => n.step >= 3 && n.step <= 7 && places[n.id].kind === 'zone').map((n) => n.x);
    const apart = (p: number[]) => p.every((a, i) => p.every((b, j) => i === j || Math.abs(a - b) >= SEED_GAP));
    let can = false;
    for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) for (let c = b + 1; c < xs.length; c++) can ||= apart([xs[a], xs[b], xs[c]]);
    if (!can) continue;
    possible++;
    if (!apart(fronts.map((f) => GRAPH.byId.get(f.at)!.x))) fails++;
  }
  assert.ok(possible > 0);
  assert.equal(fails, 0, `${fails} of ${possible} seeds left seeds close that could have sat apart`);
});

// ---- Creep ----

test('creep never enters a step at or behind the player, and a front only ever moves forward', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const rng = seededRandom(seed);
    const places = rollPlaces(GRAPH, DEFAULT_TUNING.zoneShare, rng);
    const { corrupt, fronts } = seedFronts(GRAPH, places, 5, W, rng);
    for (let player = 0; player <= 16; player++) {
      const was = fronts.map((f) => f.at);
      const fresh = creep(GRAPH, places, corrupt, fronts, player, W, rng);
      for (const id of fresh) assert.ok(stepOf(id) > player, `${id} at step ${stepOf(id)}, the player at ${player}`);
      fronts.forEach((f, i) => {
        if (f.at === was[i]) return;
        assert.ok(stepOf(f.at) > player, `front ${i} into ${f.at}, the player at ${player}`);
        assert.ok(stepOf(f.at) > stepOf(was[i]));
        assert.equal(places[f.at].kind, 'zone');
      });
    }
  }
});

test("a front creeps one step, into one zone it links to, at random, and that zone rolls its modifier", () => {
  const places = allZones(GRAPH);
  const from = 'the-red-vale';
  const seen = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const corrupt: Record<string, Corrupt> = { [from]: { hidden: 'bounty', cleansed: false } };
    const fronts = [front(from)];
    const fresh = creep(GRAPH, places, corrupt, fronts, 0, W, seededRandom(seed));
    assert.ok(GRAPH.next[from].includes(fronts[0].at));
    assert.deepEqual(fresh, [fronts[0].at]);
    assert.ok(HIDDEN.includes(corrupt[fronts[0].at].hidden));
    // The node it left stays corrupted.
    assert.deepEqual(corrupt[from], { hidden: 'bounty', cleansed: false });
    seen.add(fronts[0].at);
  }
  assert.deepEqual([...seen].sort(), [...GRAPH.next[from]].sort());
});

test('a front facing only a town jumps through it to a zone the step after', () => {
  const places = allZones(GRAPH);
  // The Library (step 7) faces only the town at step 8.
  assert.deepEqual(GRAPH.next['the-library'], ['ziggurat-encampment']);
  const fronts = [front('the-library')];
  const fresh = creep(GRAPH, places, {}, fronts, 0, W, seededRandom(1));
  assert.ok(GRAPH.next['ziggurat-encampment'].includes(fronts[0].at), fronts[0].at);
  assert.equal(stepOf(fronts[0].at), 9);
  assert.deepEqual(fresh, [fronts[0].at]);
});

test('a front facing only Wells jumps through them to a zone the step after', () => {
  const places = allZones(GRAPH);
  places['buried-shrines'] = { kind: 'well' };
  const fronts = [front('kaom-s-stronghold')];
  creep(GRAPH, places, {}, fronts, 0, W, seededRandom(2));
  assert.ok(GRAPH.next['buried-shrines'].includes(fronts[0].at), fronts[0].at);
  assert.equal(places['buried-shrines'].kind, 'well');
});

test('a front with nowhere to go waits: facing only the boss, or Wells and towns with only the boss after', () => {
  const places = allZones(GRAPH);
  const last = GRAPH.prev[GRAPH.boss.id][0];
  const fronts = [front(last)];
  assert.deepEqual(creep(GRAPH, places, {}, fronts, 0, W, seededRandom(1)), []);
  assert.equal(fronts[0].at, last);
  for (const n of GRAPH.atStep.get(15)!) if (n.kind === 'open') places[n.id] = { kind: 'well' };
  const before = [front('tidal-island')];
  assert.deepEqual(creep(GRAPH, places, {}, before, 0, W, seededRandom(1)), []);
  assert.equal(before[0].at, 'tidal-island');
});

test("a front whose zones ahead the player stands on or has passed waits", () => {
  const places = allZones(GRAPH);
  const fronts = [front('the-red-vale')];
  // The player at step 2: every zone the front links to is at the player's step.
  assert.deepEqual(creep(GRAPH, places, {}, fronts, 3, W, seededRandom(1)), []);
  assert.equal(fronts[0].at, 'the-red-vale');
});

test("a front facing only zones at the player's step waits: it jumps only through towns, Wells or the boss", () => {
  // creep (map.ts) treats a zone at or behind the player like a town or a
  // Well and jumps through it, so a front just behind the player leaps past
  // the player's step. The handoff jumps only a front "facing only towns,
  // Wells or the boss"; any other front with nowhere to go waits.
  const places = allZones(GRAPH);
  assert.deepEqual(GRAPH.next['kaom-s-stronghold'], ['buried-shrines']);
  const fronts = [front('kaom-s-stronghold')];
  // The player on Buried Shrines (step 6), the only node the front faces.
  assert.deepEqual(creep(GRAPH, places, {}, fronts, 6, W, seededRandom(1)), []);
  assert.equal(fronts[0].at, 'kaom-s-stronghold');
});

test('a stopped front stays where it was stopped', () => {
  const places = allZones(GRAPH);
  const fronts: Front[] = [{ id: 0, at: 'the-red-vale', alive: false, stoppedAt: 'the-red-vale' }, front('freythorn', 1)];
  const fresh = creep(GRAPH, places, {}, fronts, 0, W, seededRandom(3));
  assert.deepEqual(fronts[0], { id: 0, at: 'the-red-vale', alive: false, stoppedAt: 'the-red-vale' });
  assert.deepEqual(fresh, [fronts[1].at]);
  assert.notEqual(fronts[1].at, 'freythorn');
});

test('a front into a zone corrupted already moves there, but rolls no new modifier', () => {
  const places = allZones(GRAPH);
  const corrupt: Record<string, Corrupt> = {};
  for (const id of GRAPH.next['the-red-vale']) corrupt[id] = { hidden: 'bounty', cleansed: true };
  const fronts = [front('the-red-vale')];
  const dark = Object.fromEntries(HIDDEN.map((k) => [k, k === 'dark' ? 1 : 0])) as Record<Hidden, number>;
  assert.deepEqual(creep(GRAPH, places, corrupt, fronts, 0, dark, seededRandom(1)), []);
  assert.ok(GRAPH.next['the-red-vale'].includes(fronts[0].at));
  assert.deepEqual(corrupt[fronts[0].at], { hidden: 'bounty', cleansed: true });
});

// ---- Corruption in a run ----

/** A run arrived at a zone at step `step`, corrupted with `hidden` and the head of front 0 (front 1 elsewhere). */
function atFront(seed: number, hidden: Hidden = 'bounty', step = 5) {
  const run = new Run({ seed, tuning: tuned((t) => (t.missCost.early = [1, 1])) });
  const id = nodeAt(step);
  arrive(run, id, { place: { kind: 'zone', type: 'plain' }, hidden });
  run.state.fronts = [front(id, 0), front('pondium', 1)];
  run.state.corrupt.pondium = { hidden: 'dark', cleansed: false };
  return { run, id };
}

test("a run seeds the tuning's fronts as it starts, and logs how many", () => {
  for (const seeds of [0, 1, 3, 5]) {
    const s = new Run({ seed: 2, tuning: tuned((t) => (t.corruption.seeds = seeds)) }).state;
    assert.equal(s.fronts.length, seeds);
    assert.equal(Object.keys(s.corrupt).length, seeds);
    assert.deepEqual(s.log.fronts, { seeded: seeds, stopped: 0, aliveAtBoss: null });
  }
});

test("cleansing a corrupted zone at a front's head (every item answered) stops that front for good", () => {
  const { run, id } = atFront(3);
  const s = run.state;
  assert.equal(run.hiddenHere(), 'bounty');
  playOn(run, () => s.phase === 'map');
  assert.equal(s.visit, null);
  assert.deepEqual(s.corrupt[id], { hidden: 'bounty', cleansed: true });
  assert.deepEqual(s.fronts[0], { id: 0, at: id, alive: false, stoppedAt: id });
  assert.deepEqual(s.fronts[1], front('pondium', 1));
  assert.equal(s.log.fronts.stopped, 1);
  assert.equal(run.hiddenHere(), null);
  // It creeps no more.
  creep(GRAPH, s.places, s.corrupt, s.fronts, 0, W, seededRandom(1));
  assert.equal(s.fronts[0].at, id);
});

test("cleansing a corrupted zone no front's head is on stops no front", () => {
  const { run, id } = atFront(4);
  const s = run.state;
  s.fronts[0].at = 'the-library';
  playOn(run, () => s.phase === 'map');
  assert.equal(s.corrupt[id].cleansed, true);
  assert.ok(s.fronts.every((f) => f.alive));
  assert.equal(s.log.fronts.stopped, 0);
});

test('a zone is not cleansed before its last item is answered, and a run lost in it leaves the front alive', () => {
  const { run, id } = atFront(5);
  const s = run.state;
  playOn(run, () => s.visit!.done === 2 && s.phase === 'item');
  assert.equal(s.corrupt[id].cleansed, false);
  assert.ok(s.fronts[0].alive);
  run.open(gridAdjacency(9));
  s.life = 1;
  s.item!.build = wrongLine(s.item!, 0);
  assert.equal(run.submit(), false);
  assert.equal(s.phase, 'end');
  assert.deepEqual([s.corrupt[id].cleansed, s.fronts[0].alive, s.log.fronts.stopped], [false, true, 0]);
});

/** A run brought to the boss with `alive` of 5 fronts still alive, by its own travel. */
function toBoss(seed: number, alive: number) {
  const run = new Run({ seed, tuning: tuned((t) => (t.corruption.seeds = 5)) });
  const s = run.state;
  s.fronts.forEach((f, i) => (f.alive = i < alive));
  s.at = GRAPH.prev[GRAPH.boss.id][0];
  s.phase = 'map';
  assert.ok(run.choose(GRAPH.boss.id));
  return run;
}

test(`the boss: one modifier for each front still alive, rolled without repeats, at most ${MAX_BOSS_MODS}`, () => {
  assert.equal(MAX_BOSS_MODS, 3);
  const seen = new Set<string>();
  for (let seed = 1; seed <= 40; seed++)
    for (let alive = 0; alive <= 5; alive++) {
      const s = toBoss(seed, alive).state;
      assert.equal(s.fronts.length, 5);
      assert.equal(s.bossMods.length, Math.min(3, alive), `${alive} alive`);
      assert.equal(new Set(s.bossMods).size, s.bossMods.length);
      assert.ok(s.bossMods.every((m) => BOSS_MODS.includes(m)));
      assert.deepEqual(s.log.bossMods, s.bossMods);
      assert.equal(s.log.fronts.aliveAtBoss, alive);
      assert.equal(s.visit!.items, s.bossMods.includes('lingering') ? 4 : 3);
      assert.equal(s.phase, 'zone');
      for (const m of s.bossMods) seen.add(m);
    }
  assert.deepEqual([...seen].sort(), [...BOSS_MODS].sort());
  for (let alive = 0; alive <= 6; alive++) assert.equal(rollBossMods(alive, seededRandom(alive)).length, Math.min(3, alive));
});

test('Lingering gives the boss a 4th item, played like the 3rd, and the run is won after it', () => {
  const run = new Run({ seed: 6 });
  const s = run.state;
  arrive(run, GRAPH.boss.id, { mods: ['lingering'] });
  assert.equal(s.visit!.items, 4);
  const ranges: number[][] = [];
  playOn(run, () => {
    if (s.phase === 'item' && s.item!.openedAt !== null && ranges.length === s.item!.boss) ranges.push(run.missRange());
    return false;
  });
  assert.equal(s.log.result, 'win');
  assert.deepEqual(
    s.log.items.map((it) => [it.boss, it.zoneType]),
    Array.from({ length: 4 }, () => [true, 'boss']),
  );
  assert.deepEqual(ranges, [[55, 65], [55, 65], [55, 65], [55, 65]]);
});

test('Bloodied makes a miss at the boss cost 10 more', () => {
  for (const [mods, range] of [[[], [55, 65]], [['bloodied'], [65, 75]]] as const) {
    const run = new Run({ seed: 7 });
    arrive(run, GRAPH.boss.id, { mods: [...mods] });
    run.enter();
    run.open(gridAdjacency(9));
    assert.deepEqual(run.missRange(), range);
    run.state.item!.build = wrongLine(run.state.item!, 0);
    run.submit();
    const lost = run.state.item!.log.submits[0].lost;
    assert.ok(lost >= range[0] && lost <= range[1], `${mods}: lost ${lost}`);
  }
});

test('Murky halves the Flares at the boss, and Teeming adds 8 decoys there, up to MAX_TILES tiles', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const plain = new Run({ seed });
    arrive(plain, GRAPH.boss.id);
    plain.enter();
    const teeming = new Run({ seed });
    arrive(teeming, GRAPH.boss.id, { mods: ['teeming', 'murky'] });
    teeming.enter();
    const a = plain.state.item!;
    const b = teeming.state.item!;
    assert.equal(a.itemId, b.itemId);
    const own = new Set(a.answer).size;
    assert.equal(b.decoys.length, Math.min(a.decoys.length + 8, MAX_TILES - own), `seed ${seed}`);
    assert.ok(b.tiles.length <= MAX_TILES);
    assert.deepEqual([plain.flareBurn(), teeming.flareBurn()], [12, 6]);
  }
});

test('a draw by weight takes only keys of weight above 0, and none when all are 0', () => {
  const keys = ['a', 'b', 'c'] as const;
  const rng = seededRandom(9);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(weighted({ a: 1, b: 0, c: 3 }, keys, rng)!);
  assert.deepEqual([...seen].sort(), ['a', 'c']);
  assert.equal(weighted({ a: 0, b: 0, c: -1 }, keys, rng), null);
});
