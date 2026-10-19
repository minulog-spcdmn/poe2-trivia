import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH } from '../src/wraeclast/map.ts';
import {
  Run,
  CLUES,
  DEFAULT_TUNING,
  ITEMS,
  MAX_TILES,
  MIN_DECOYS,
  SYLLABLES,
  TILE_SPREAD,
  gridAdjacency,
  letters,
  markLine,
  sectionOf,
  wisdomOrder,
  type BossMod,
  type Hidden,
  type ItemPlay,
  type Section,
  type Tuning,
  type ZoneType,
} from '../src/wraeclast/rules.ts';
import { arrive, nodeAt } from '../src/qa/benches/wraeclastSetup.ts';

// A Wraeclast item (src/wraeclast/rules.ts) held to its handoff,
// docs/handoff/wraeclast/v3.md ("An item", "Zones"): the pool of tiles (the
// answer's among decoys), building the name, the Wordle marks a miss leaves,
// the check, and each zone type's free clue. Every run is seeded and its
// clock fake, so each plays the same every time. The handoff's numbers are
// written out again here, so rules.ts can't move both.

const T0 = Date.UTC(2026, 9, 19, 12);
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

const tuned = (change: (t: Tuning) => void) => {
  const t = structuredClone(DEFAULT_TUNING);
  change(t);
  return t;
};

/** The step each section's items are played at here. */
const STEP: Record<Exclude<Section, 'boss'>, number> = { early: 2, mid: 7, late: 13 };

interface At {
  type?: ZoneType;
  step?: number;
  hidden?: Hidden | null;
  boss?: boolean;
  mods?: BossMod[];
  tuning?: Tuning;
}

/** A run brought to a zone (or the boss) and its first item laid out, not yet open. */
function laidOut(seed: number, { type = 'plain', step = 2, hidden = null, boss = false, mods = [], tuning = DEFAULT_TUNING }: At = {}) {
  const clock = { t: T0 };
  const run = new Run({ seed, tuning, now: () => clock.t });
  if (boss) arrive(run, GRAPH.boss.id, { mods });
  else arrive(run, nodeAt(step), { place: { kind: 'zone', type }, hidden });
  assert.ok(run.enter());
  return { run, clock, it: run.state.item! };
}

/** The same, the item open on a 9 by 9 Veil. */
function opened(seed: number, at: At = {}) {
  const got = laidOut(seed, at);
  assert.ok(got.run.open(gridAdjacency(9)));
  return got;
}

/** A seed whose first item's answer has at least `min` tiles, none twice, so a test can mark each tile on its own. */
function plainAnswer(min = 3, at: At = {}) {
  for (let seed = 1; ; seed++) {
    const got = opened(seed, at);
    const a = got.it.answer;
    if (a.length >= min && new Set(a).size === a.length) return got;
  }
}

/** Places tiles on a fresh line (the locked start kept). */
function build(run: Run, tiles: string[]) {
  run.clear();
  for (const t of tiles) assert.ok(run.place(t), `placing ${t}`);
}

/** The Pearson correlation of two lists. */
function pearson(xs: number[], ys: number[]) {
  const m = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = m(xs);
  const my = m(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  });
  return sxy / Math.sqrt(sxx * syy);
}

// ---- The pool ----

test("the pool's numbers are the handoff's: 14, 20, 26 and 32 tiles by section, each item within 3, at least 8 decoys, at most MAX_TILES tiles", () => {
  assert.deepEqual(DEFAULT_TUNING.tiles, { early: 14, mid: 20, late: 26, boss: 32 });
  assert.deepEqual([TILE_SPREAD, MIN_DECOYS, MAX_TILES], [3, 8, 36]);
  assert.deepEqual(
    [0, 1, 5, 6, 10, 11, 15].map((s) => sectionOf(s, false)),
    ['early', 'early', 'early', 'mid', 'mid', 'late', 'late'],
  );
  assert.equal(sectionOf(16, true), 'boss');
});

test("the tiles are the answer's distinct tiles and the decoys, each once, lower case, no answer tile among the decoys", () => {
  for (let seed = 1; seed <= 15; seed++)
    for (const at of [{ step: 2 }, { step: 7, type: 'blight' as const }, { step: 13, hidden: 'swarming' as const }, { boss: true, mods: ['teeming' as const] }]) {
      const { it } = laidOut(seed, at);
      const own = new Set(it.answer);
      assert.deepEqual(it.answer, SYLLABLES[it.itemId].flat());
      assert.deepEqual(it.words, SYLLABLES[it.itemId]);
      assert.deepEqual(new Set(it.tiles), new Set([...own, ...it.decoys]));
      assert.equal(new Set(it.tiles).size, it.tiles.length, 'each tile once');
      assert.equal(it.tiles.length, own.size + it.decoys.length);
      assert.ok(it.decoys.every((d) => !own.has(d)), `seed ${seed}: an answer tile among the decoys`);
      assert.ok(it.tiles.every((t) => t.length > 0 && t === t.toLowerCase()));
      assert.ok(it.tiles.length <= MAX_TILES, `${it.tiles.length} tiles`);
    }
});

test("the pool's total is rolled for each item within its section's, 3 either way, and at least 8 are decoys", () => {
  for (const sec of ['early', 'mid', 'late', 'boss'] as const) {
    const T = DEFAULT_TUNING.tiles[sec];
    const totals = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) {
      const { it } = laidOut(seed, sec === 'boss' ? { boss: true } : { step: STEP[sec] });
      const own = new Set(it.answer).size;
      assert.ok(it.decoys.length >= MIN_DECOYS, `${sec}: ${it.decoys.length} decoys`);
      // More decoys than the fewest: the rolled total stands. The fewest: the answer's tiles and 8 reach the roll at least.
      if (it.decoys.length > MIN_DECOYS) assert.ok(Math.abs(it.tiles.length - T) <= TILE_SPREAD, `${sec}: ${it.tiles.length} tiles`);
      else assert.ok(own + MIN_DECOYS >= T - TILE_SPREAD);
      if (it.decoys.length > MIN_DECOYS) totals.add(it.tiles.length);
    }
    // Rolled, not fixed: most of the 7 totals come up (the lowest is rare early, where 8 decoys often reach past it).
    assert.ok(totals.size >= 5, `${sec}: totals ${[...totals]}`);
  }
});

test("the pool's total is the tuning's", () => {
  const t = tuned((x) => (x.tiles.early = 24));
  for (let seed = 1; seed <= 20; seed++) {
    const { it } = laidOut(seed, { tuning: t });
    assert.ok(it.tiles.length >= 21 && it.tiles.length <= Math.max(27, new Set(it.answer).size + 8), `${it.tiles.length}`);
  }
});

test(`Blight adds 6 decoys, Swarming 8 and Teeming 8, on top of the rolled total, never past ${MAX_TILES} tiles`, () => {
  const cases: [string, At, At, number][] = [
    ['Blight', { step: 2, type: 'blight' }, { step: 2, type: 'plain' }, 6],
    ['Swarming', { step: 7, hidden: 'swarming' }, { step: 7 }, 8],
    ['Blight and Swarming', { step: 13, type: 'blight', hidden: 'swarming' }, { step: 13 }, 14],
    ['Teeming', { boss: true, mods: ['teeming'] }, { boss: true }, 8],
  ];
  let capped = 0;
  for (const [name, more, base, add] of cases)
    for (let seed = 1; seed <= 12; seed++) {
      const a = laidOut(seed, base).it;
      const b = laidOut(seed, more).it;
      // The same seed draws the same item and rolls the same total.
      assert.equal(a.itemId, b.itemId);
      const own = new Set(a.answer).size;
      const want = Math.min(a.decoys.length + add, MAX_TILES - own);
      assert.equal(b.decoys.length, want, `${name} on seed ${seed}`);
      assert.ok(b.tiles.length <= MAX_TILES);
      if (want < a.decoys.length + add) capped++;
    }
  assert.ok(capped > 0, 'the cap is met');
});

test("the pool's size says next to nothing of the answer's tile count", () => {
  const short: number[] = [];
  const long: number[] = [];
  for (const sec of ['early', 'mid', 'late', 'boss'] as const) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const { it } = laidOut(seed, sec === 'boss' ? { boss: true } : { step: STEP[sec] });
      const own = new Set(it.answer).size;
      xs.push(own);
      ys.push(it.tiles.length);
      if (sec === 'early' && own <= 3) short.push(it.tiles.length);
      if (sec === 'early' && own >= 5) long.push(it.tiles.length);
    }
    const r = pearson(xs, ys);
    assert.ok(Math.abs(r) < 0.5, `${sec}: r = ${r.toFixed(2)}`);
  }
  // Where it tells most (the early pools, smallest): answers of up to 3 tiles and of 5 or more.
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(short.length >= 5 && long.length >= 5);
  assert.ok(Math.abs(mean(long) - mean(short)) < 2, `${mean(short).toFixed(1)} vs ${mean(long).toFixed(1)}`);
});

test("about half the decoys come from names of the answer's own category", () => {
  let mine = 0;
  let all = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { it } = laidOut(seed, { step: 7 });
    const own = new Set(ITEMS.filter((x) => x.category === it.category && x.id !== it.itemId).flatMap((x) => SYLLABLES[x.id].flat()));
    const n = it.decoys.filter((d) => own.has(d)).length;
    assert.ok(n >= Math.ceil(it.decoys.length / 2), `seed ${seed}: ${n} of ${it.decoys.length}`);
    mine += n;
    all += it.decoys.length;
  }
  assert.ok(mine < all, 'not all of them');
});

test('the tiles are shuffled, not the answer first', () => {
  let inOrder = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { it } = laidOut(seed);
    const own = [...new Set(it.answer)];
    if (own.every((t, i) => it.tiles[i] === t)) inOrder++;
  }
  assert.ok(inOrder <= 1, `${inOrder} pools start with the answer`);
});

test('no item comes up twice, and its category is never the last item\'s', () => {
  const run = new Run({ seed: 3 });
  const s = run.state;
  const seen = new Set<string>();
  let last = '';
  for (let k = 0; k < 40; k++) {
    arrive(run, nodeAt(2 + (k % 10)), { place: { kind: 'zone', type: 'plain' } });
    run.enter();
    const it = s.item!;
    assert.ok(!seen.has(it.itemId), it.itemId);
    assert.notEqual(it.category, last);
    assert.equal(it.category, BY_ID.get(it.itemId)!.category);
    seen.add(it.itemId);
    last = it.category;
    // Logged as done, so the next draw sees it.
    s.log.items.push(it.log);
  }
});

// ---- Building the name ----

test('a tile is placed, placed again, taken back by its place on the line, and Clear empties the line', () => {
  const { run, it } = opened(1);
  const [a, b] = [it.tiles[0], it.tiles[1]];
  assert.ok(run.place(a));
  assert.ok(run.place(b));
  assert.ok(run.place(a));
  assert.deepEqual(it.build, [a, b, a]);
  assert.ok(run.unplace(1));
  assert.deepEqual(it.build, [a, a]);
  assert.equal(run.unplace(2), false);
  assert.equal(run.place('not a tile of this pool'), false);
  assert.ok(run.clear());
  assert.deepEqual(it.build, []);
  assert.equal(run.clear(), false);
});

test('nothing is placed on an item laid out but not open, or once it is named', () => {
  const { run, it } = laidOut(2);
  assert.equal(run.place(it.tiles[0]), false);
  assert.equal(run.canSubmit(), false);
  run.open(gridAdjacency(9));
  build(run, it.answer);
  assert.equal(run.submit(), true);
  assert.equal(run.state.phase, 'solved');
  assert.equal(run.place(it.tiles[0]), false);
  assert.equal(run.submit(), null);
});

// ---- The check ----

test("a build is right when its letters, joined, are the answer's, lower case, without spaces and punctuation", () => {
  assert.equal(letters("The Brine King's Reef"), 'thebrinekingsreef');
  assert.equal(letters('Kaom-s  Heart, 2'), 'kaomsheart2');
  for (let seed = 1; seed <= 10; seed++) {
    const { run, it } = opened(seed);
    build(run, it.answer);
    assert.equal(run.submit(), true, `seed ${seed}`);
  }
});

test("a build split differently from the tiles' own split still counts", () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { run, it } = opened(seed);
    // Pieces of 5 letters, longer than any tile, set on the line as the page would show a build of other tiles with the same letters.
    const flat = letters(it.log.name);
    it.build = flat.match(/.{1,5}/g)!;
    assert.notDeepEqual(it.build, it.answer);
    assert.equal(run.submit(), true, `seed ${seed}`);
  }
  const { run, it } = opened(11);
  it.build = [it.log.name.toUpperCase()];
  assert.equal(run.submit(), true, 'the whole name, spaced and in capitals');
});

test("a build a letter short, or with a tile too many, is wrong", () => {
  const { run, it } = opened(12);
  build(run, it.answer.slice(0, -1));
  assert.equal(run.submit(), false);
  build(run, [...it.answer, it.decoys[0]]);
  assert.equal(run.submit(), false);
});

// ---- The marks ----

test('markLine marks as Wordle does: gold in the right place, silver elsewhere in the answer as often as it holds it, else struck', () => {
  assert.deepEqual(markLine(['a', 'b', 'c'], ['a', 'b', 'c']), ['gold', 'gold', 'gold']);
  assert.deepEqual(markLine(['a', 'c', 'b'], ['a', 'b', 'c']), ['gold', 'silver', 'silver']);
  assert.deepEqual(markLine(['x', 'y'], ['a', 'b', 'c']), ['struck', 'struck']);
  // Counts: the answer holds "a" once, so only one "a" elsewhere is silver.
  assert.deepEqual(markLine(['x', 'a', 'a'], ['a', 'y', 'z']), ['struck', 'silver', 'struck']);
  // A gold "a" uses the answer's one "a" up: the other is struck.
  assert.deepEqual(markLine(['a', 'a'], ['a', 'b']), ['gold', 'struck']);
  // Twice in the answer: both silver.
  assert.deepEqual(markLine(['b', 'a', 'a'], ['a', 'b', 'a']), ['silver', 'silver', 'gold']);
  // A line longer or shorter than the answer.
  assert.deepEqual(markLine(['a', 'b', 'c', 'a'], ['a', 'b']), ['gold', 'gold', 'struck', 'struck']);
  assert.deepEqual(markLine(['b'], ['a', 'b']), ['silver']);
  assert.deepEqual(markLine([], ['a']), []);
});

test("a miss marks the line, and the board's tiles keep each its best mark", () => {
  const { run, it } = plainAnswer(3);
  const [a0, a1, a2] = it.answer;
  const [d0, d1] = it.decoys;
  build(run, [a1, a0, d0]);
  assert.equal(run.submit(), false);
  assert.deepEqual(it.lineMarks, ['silver', 'silver', 'struck']);
  assert.deepEqual(it.log.submits[0].marks, ['silver', 'silver', 'struck']);
  assert.deepEqual(it.marks, { [a1]: 'silver', [a0]: 'silver', [d0]: 'struck' });
  build(run, [a0, d1]);
  assert.equal(run.submit(), false);
  assert.deepEqual(it.marks, { [a1]: 'silver', [a0]: 'gold', [d0]: 'struck', [d1]: 'struck' });
  // a0 again, out of place and then struck as one too many: the board keeps its gold.
  build(run, [d0, a0, a0, a2]);
  assert.equal(run.submit(), false);
  assert.deepEqual(it.log.submits[2].marks, markLine([d0, a0, a0, a2], it.answer));
  assert.equal(it.marks[a0], 'gold');
  assert.equal(it.marks[a2], it.answer[3] === a2 ? 'gold' : 'silver');
  // Struck tiles stay on the board, where they lie.
  assert.ok(it.tiles.includes(d0) && it.tiles.includes(d1));
  assert.ok(run.place(d0));
});

test("with gold-only marks, a miss marks gold alone: the rest 'none', and the board keeps only gold", () => {
  const { run, it } = plainAnswer(3, { tuning: tuned((t) => (t.marks = 'gold')) });
  const [a0, a1, a2] = it.answer;
  const d = it.decoys[0];
  build(run, [a0, a2, a1, d]);
  assert.equal(run.submit(), false);
  const want = markLine([a0, a2, a1, d], it.answer).map((m) => (m === 'gold' ? 'gold' : 'none'));
  assert.deepEqual(it.log.submits[0].marks, want);
  assert.deepEqual(it.lineMarks, want);
  assert.equal(it.marks[a0], 'gold');
  for (const t of [a1, a2, d]) if (want[[a0, a2, a1, d].indexOf(t)] === 'none') assert.equal(it.marks[t], undefined, t);
});

test('a marked line stands until the next place or take-back starts a fresh one', () => {
  const { run, it } = plainAnswer(3);
  const [a0, a1] = it.answer;
  const d = it.decoys[0];
  build(run, [a1, a0, d]);
  run.submit();
  // It stands, and can't be sent again as it is.
  assert.deepEqual(it.build, [a1, a0, d]);
  assert.ok(it.lineMarks);
  assert.equal(run.canSubmit(), false);
  assert.equal(run.submit(), null);
  // A place starts a fresh line.
  assert.ok(run.place(a0));
  assert.deepEqual([it.build, it.lineMarks], [[a0], null]);
  run.place(d);
  run.submit();
  // So does a take-back, of any tile on it.
  assert.ok(run.unplace(1));
  assert.deepEqual([it.build, it.lineMarks], [[], null]);
});

test('a fresh line after a miss keeps the locked first tile', () => {
  const { run, it } = plainAnswer(3);
  run.state.pack.push({ supply: 'first', n: 1 });
  assert.ok(run.use('first'));
  const d = it.decoys[0];
  run.place(d);
  run.submit();
  assert.deepEqual(it.build, [it.answer[0], d]);
  assert.ok(run.place(it.answer[1]));
  assert.deepEqual(it.build, [it.answer[0], it.answer[1]]);
  assert.equal(run.unplace(0), false, 'the locked tile stays');
});

test("a line sent before can't be sent again: blocked() says 'tried', and it costs nothing", () => {
  const { run, it } = plainAnswer(3);
  const line = [it.answer[1], it.answer[0], it.decoys[0]];
  build(run, line);
  assert.equal(run.blocked(), null);
  run.submit();
  const life = run.state.life;
  build(run, line);
  assert.equal(run.blocked(), 'tried');
  assert.equal(run.canSubmit(), false);
  assert.equal(run.submit(), null);
  assert.deepEqual([run.state.life, it.misses, it.log.submits.length], [life, 1, 1]);
  // Any other line can go.
  run.place(it.decoys[1]);
  assert.equal(run.blocked(), null);
  assert.equal(run.canSubmit(), true);
});

test('every submit counts: each miss costs life and is logged, and the right answer after misses names the item', () => {
  const { run, it } = plainAnswer(3, { tuning: tuned((t) => (t.missCost.early = [5, 5])) });
  build(run, [it.answer[1], it.answer[0]]);
  run.submit();
  build(run, [it.decoys[0]]);
  run.submit();
  assert.deepEqual([run.state.life, it.misses, run.state.log.misses], [90, 2, 2]);
  build(run, it.answer);
  assert.equal(run.submit(), true);
  assert.deepEqual(
    it.log.submits.map((s) => [s.right, s.lost]),
    [
      [false, 5],
      [false, 5],
      [true, 0],
    ],
  );
  assert.deepEqual(it.log.submits[2].marks, []);
});

// ---- Free clues ----

test("a Plain and an Expedition zone show the item's most common mod line", () => {
  for (const type of ['plain', 'expedition'] as const)
    for (let seed = 1; seed <= 10; seed++) {
      const { it } = laidOut(seed, { type });
      const order = wisdomOrder(CLUES[it.itemId]);
      if (!order.length) continue;
      assert.deepEqual([it.freeClue, it.shown.mods, it.log.freeClue], ['mod', [order[0]], 'mod']);
      const shared = CLUES[it.itemId].mods.map((m) => m[2]);
      assert.equal(shared[order[0]], Math.max(...shared));
    }
});

test('an Incursion zone shows the flavour text, an Essence zone the base type, a Ritual zone the word lengths', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const inc = laidOut(seed, { type: 'incursion' }).it;
    assert.deepEqual([inc.freeClue, inc.shown.flavor], ['flavor', true]);
    const ess = laidOut(seed, { type: 'essence' }).it;
    assert.deepEqual([ess.freeClue, ess.shown.base], ['base', true]);
    const rit = laidOut(seed, { type: 'ritual' }).it;
    assert.deepEqual([rit.freeClue, rit.shown.lengths], ['lengths', true]);
    for (const it of [inc, ess, rit]) assert.equal(it.shown.mods.length, 0);
  }
});

test('a Blight zone burns in 4 neighbouring patches as the item opens, the tuning\'s size when changed', () => {
  for (const [t, n] of [
    [DEFAULT_TUNING, 4],
    [tuned((x) => (x.burnIn.blight = 7)), 7],
  ] as const) {
    const { run, it, clock } = laidOut(3, { type: 'blight', tuning: t });
    assert.deepEqual([it.freeClue, it.burned], ['burn', []]);
    clock.t += 1000;
    run.open(gridAdjacency(9));
    assert.equal(it.burned.length, n);
    assert.deepEqual(it.log.burnIns, [{ by: 'zone', patches: n, ms: 0 }]);
  }
});

test('a free clue the item lacks falls back to the word lengths: a Plain item with no mod lines, an Incursion one with no flavour text', () => {
  const kept = Object.fromEntries(Object.entries(CLUES).map(([id, c]) => [id, { mods: c.mods, flavor: c.flavor }]));
  try {
    for (const c of Object.values(CLUES)) {
      c.mods = [];
      c.flavor = null;
    }
    for (const type of ['plain', 'expedition', 'incursion'] as const) {
      const { it } = laidOut(4, { type });
      assert.deepEqual([it.freeClue, it.shown.lengths, it.shown.mods, it.shown.flavor], ['lengths', true, [], false], type);
    }
  } finally {
    for (const [id, c] of Object.entries(kept)) Object.assign(CLUES[id], c);
  }
});

test('a Dark Blight zone burns nothing in: its free clue is the word lengths', () => {
  const { run, it } = laidOut(5, { type: 'blight', hidden: 'dark' });
  run.open(gridAdjacency(9));
  assert.deepEqual([it.freeClue, it.shown.lengths, it.burned, it.log.burnIns], ['lengths', true, [], []]);
});

test("the boss's items get no free clue", () => {
  for (let seed = 1; seed <= 4; seed++) {
    const { it } = opened(seed, { boss: true });
    assert.deepEqual([it.freeClue, it.burned, it.shown], ['none', [], { mods: [], flavor: false, lengths: false, category: false, base: false }]);
  }
});

test("a zone type's free clue turned off gives its items none, and leaves the other zone types' as they were", () => {
  const t = tuned((x) => (x.freeClue.plain = false));
  const off = laidOut(6, { type: 'plain', tuning: t }).it;
  assert.deepEqual([off.freeClue, off.shown.mods], ['none', []]);
  const on = laidOut(6, { type: 'ritual', tuning: t }).it;
  assert.equal(on.freeClue, 'lengths');
});
