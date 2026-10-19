import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Run,
  CLUES,
  CORRUPTIONS,
  DEFAULT_TUNING,
  SUPPLIES,
  answerOf,
  commonLines,
  decoys,
  greyed,
  lengthsOf,
  remaining,
  type Corruption,
  type ItemPlay,
  type Tuning,
  type Ware,
  type ZoneType,
} from '../src/wraeclast/rules.ts';
import { labelPatches, patchShapes } from '../src/lib/patches.ts';

// The Wraeclast run's supplies, burn-ins and corruption (src/wraeclast/rules.ts)
// held to the handoff, docs/handoff/wraeclast/v2.md ("Supplies", "The Veil",
// "Corruption"). Every run is seeded and its clock fake. Supplies are put in
// the pack directly, as many as a test needs: the vendor deals each ware once
// a visit (wraeclastFlow.test.ts has the buying).

const T0 = Date.UTC(2026, 9, 19, 12);

function start(seed: number, tuning: Tuning = DEFAULT_TUNING) {
  const clock = { t: T0 };
  const run = new Run({ seed, tuning, now: () => clock.t });
  return { run, clock };
}

const tuned = (change: (t: Tuning) => void) => {
  const t = structuredClone(DEFAULT_TUNING);
  change(t);
  return t;
};

/** Corruption weights with every outcome but `outcome` at 0. */
const always = (outcome: Corruption) => tuned((t) => (t.corruption = Object.fromEntries(CORRUPTIONS.map((c) => [c, c === outcome ? 1 : 0])) as Tuning['corruption']));

/** The Veil the page would cut: a side x side grid, each patch touching its 4 neighbours. */
function grid(side = 9): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const nb: number[] = [];
      if (x > 0) nb.push(y * side + x - 1);
      if (x < side - 1) nb.push(y * side + x + 1);
      if (y > 0) nb.push((y - 1) * side + x);
      if (y < side - 1) nb.push((y + 1) * side + x);
      out.push(nb);
    }
  return out;
}

/** The patches reachable from `from` through `within` on the adjacency. */
function reachable(from: number, within: Set<number>, adjacency: number[][]) {
  const seen = new Set([from]);
  const todo = [from];
  while (todo.length) for (const q of adjacency[todo.pop()!]) if (within.has(q) && !seen.has(q)) seen.add(q), todo.push(q);
  return seen;
}

/** Whether patches are one connected cluster on the adjacency. */
const connected = (patches: number[], adjacency: number[][]) => reachable(patches[0], new Set(patches), adjacency).size === new Set(patches).size;

/** On to the next item, laid out and opened on `adjacency`: through the camp or town, the threshold, the solved screen and the loot. */
function toItem(run: Run, adjacency = grid()): ItemPlay {
  const s = run.state;
  for (;;) {
    if (s.phase === 'camp' || s.phase === 'town') assert.ok(run.leave());
    else if (s.phase === 'travel') assert.ok(run.enter());
    else if (s.phase === 'solved') assert.ok(run.next());
    else if (s.phase === 'loot') {
      // A card that leaves the pack as it was, so a test's pack holds only what it put there.
      const cards = s.loot!.cards;
      const card = cards.findIndex((c) => c.kind === 'gold' || c.kind === 'jackpot' || c.kind === 'flask');
      const pack = s.pack.length;
      assert.ok(run.take(Math.max(0, card)));
      if (s.loot!.pending !== null) assert.ok(run.keep(null));
      else if (s.pack.length > pack) s.pack.pop();
      assert.ok(run.next());
    } else if (s.phase === 'item') {
      if (s.item!.openedAt === null) assert.ok(run.open(adjacency));
      return s.item!;
    } else assert.fail(`no item to go to in phase ${s.phase}`);
  }
}

function build(run: Run, syllables: string[]) {
  const it = run.state.item!;
  run.clear();
  for (const syl of syllables.slice(it.locked)) assert.ok(run.place(syl), `placing ${syl}`);
}

function answer(run: Run) {
  build(run, answerOf(run.state.item!).words.flat());
  assert.equal(run.submit(), true);
}

/** Plays every item right, at once, until item n is open. */
function reach(run: Run, n: number, adjacency = grid()): ItemPlay {
  for (;;) {
    const it = toItem(run, adjacency);
    if (it.n === n) return it;
    answer(run);
  }
}

/** Puts wares in the pack. */
const give = (run: Run, ...wares: Ware[]) => run.state.pack.push(...wares);

/** The first open item, over seeds from 1, that `fits` (items 0 to 11 only, unless `boss`). */
function find(fits: (it: ItemPlay, run: Run) => boolean, tuning?: Tuning, last = 11) {
  for (let seed = 1; seed <= 300; seed++) {
    const { run, clock } = start(seed, tuning);
    for (let n = 0; n <= last; n++) {
      const it = reach(run, n);
      if (fits(it, run)) return { run, clock, it };
      answer(run);
    }
  }
  assert.fail('no item fits');
}

/** An open item of the first seed (from 1) whose zone `z` is of this type, its first item in that zone. */
function inZone(type: ZoneType, zone = 1, tuning?: Tuning) {
  for (let seed = 1; ; seed++) {
    const { run, clock } = start(seed, tuning);
    if (run.state.zones[zone - 1] !== type) continue;
    return { run, clock, it: reach(run, (zone - 1) * 3) };
  }
}

const OFF_RITUAL = (it: ItemPlay) => it.zoneType !== 'ritual';

// ---- Every supply ----

test("the supplies' prices are the handoff's", () => {
  assert.deepEqual(DEFAULT_TUNING.price, { flare: 5, wisdom: 5, strike: 6, lengths: 4, first: 8, decoy: 6, vaal: 4 });
});

test('a supply is used up when used, and logged with its type, order and time on the item', () => {
  const { run, clock, it } = inZone('plain');
  give(run, 'flare', 'lengths', 'flare', 'decoy');
  clock.t += 1200;
  assert.ok(run.use('flare'));
  clock.t += 800;
  assert.ok(run.use('lengths'));
  clock.t += 500;
  assert.ok(run.use('decoy'));
  assert.deepEqual(run.state.pack, ['flare']);
  assert.deepEqual(it.log.supplies, [
    { type: 'flare', order: 1, ms: 1200 },
    { type: 'lengths', order: 2, ms: 2000 },
    { type: 'decoy', order: 3, ms: 2500 },
  ]);
  assert.deepEqual(run.state.log.used, { flare: 1, wisdom: 0, strike: 0, lengths: 1, first: 0, decoy: 1 });
});

test("a supply not in the pack can't be used, though it would work", () => {
  const { run } = inZone('plain');
  for (const sup of SUPPLIES) {
    assert.equal(run.canUse(sup), false);
    assert.equal(run.use(sup), false, sup);
  }
  assert.equal(run.works('flare'), true);
  assert.deepEqual(run.state.log.used, { flare: 0, wisdom: 0, strike: 0, lengths: 0, first: 0, decoy: 0 });
});

test("no supply is used away from an open item: idle says 'closed'", () => {
  const { run } = start(1);
  give(run, ...SUPPLIES);
  for (const sup of SUPPLIES) assert.deepEqual([run.idle(sup), run.use(sup)], ['closed', false]);
  run.leave();
  run.enter();
  for (const sup of SUPPLIES) assert.deepEqual([run.idle(sup), run.use(sup)], ['closed', false], 'laid out, not open');
  run.open(grid());
  answer(run);
  for (const sup of SUPPLIES) assert.equal(run.idle(sup), 'closed', 'solved');
  assert.equal(run.state.pack.length, 6);
});

test("the Silent boss: every supply but the Flare is idle with 'silent'", () => {
  const { run } = start(2);
  for (const n of [12, 13, 14]) {
    reach(run, n);
    give(run, ...SUPPLIES);
    for (const sup of SUPPLIES) assert.equal(run.idle(sup), sup === 'flare' ? null : 'silent', `${sup} on boss item ${n - 12}`);
    for (const sup of SUPPLIES) assert.equal(run.use(sup), sup === 'flare');
    run.state.pack = [];
    answer(run);
  }
});

test("a corrupted item: every supply is idle with 'corrupted'", () => {
  const { run } = inZone('plain', 1, always('gilded'));
  give(run, 'vaal', ...SUPPLIES);
  for (const sup of SUPPLIES) assert.equal(run.idle(sup), null, sup);
  assert.ok(run.corrupt());
  for (const sup of SUPPLIES) assert.deepEqual([run.idle(sup), run.use(sup)], ['corrupted', false], sup);
  assert.equal(run.state.pack.length, 6);
});

// ---- Flare ----

test('a Flare burns in 4 neighbouring patches around a random spot', () => {
  const spots = new Set<number>();
  for (const type of ['plain', 'ritual', 'blight'] as const) {
    const { run, clock, it } = inZone(type);
    assert.equal(run.flareBurn(), 4);
    give(run, 'flare');
    const before = [...it.burned];
    clock.t += 900;
    assert.ok(run.use('flare'));
    const fresh = it.burned.slice(before.length);
    assert.equal(fresh.length, 4);
    assert.ok(fresh.every((p) => !before.includes(p)));
    assert.ok(connected(fresh, grid()), `${fresh}`);
    assert.deepEqual(it.log.burnIns.at(-1), { by: 'flare', patches: 4, ms: 900 });
    spots.add(fresh[0]);
  }
  for (let seed = 1; seed <= 20; seed++) {
    const { run } = start(seed);
    const it = reach(run, 0);
    give(run, 'flare');
    const before = it.burned.length;
    run.use('flare');
    spots.add(it.burned[before]);
  }
  assert.ok(spots.size > 10, `the spot is random: ${spots.size} spots`);
});

test("a Flare burns in half as much under Incursion and on the boss's third item, 4 on its first two", () => {
  const { run, it } = inZone('incursion');
  assert.equal(run.flareBurn(), 2);
  give(run, 'flare');
  run.use('flare');
  assert.equal(it.burned.length, 2);
  assert.ok(connected(it.burned, grid()));
  const boss = start(3).run;
  for (const [n, size] of [[12, 4], [13, 4], [14, 2]] as const) {
    const b = reach(boss, n);
    const before = b.burned.length;
    give(boss, 'flare');
    assert.equal(boss.flareBurn(), size);
    assert.ok(boss.use('flare'));
    assert.equal(b.burned.length - before, size, `boss item ${n - 12}`);
    answer(boss);
  }
});

test("a Flare's size is the tuning's, halved the same way", () => {
  const t = tuned((t) => (t.burnIn.flare = 6));
  const { run, it } = inZone('plain', 1, t);
  give(run, 'flare');
  run.use('flare');
  assert.equal(it.burned.length, 6);
  assert.equal(inZone('incursion', 1, t).run.flareBurn(), 3);
});

test('Flares never burn a patch twice, each burn touching what burned before, and stop when all are burned', () => {
  const adjacency = grid();
  const { run, it } = inZone('plain');
  give(run, ...Array<Ware>(30).fill('flare'));
  let flares = 0;
  while (run.idle('flare') === null) {
    const before = new Set(it.burned);
    assert.ok(run.use('flare'));
    flares++;
    const fresh = it.burned.slice(before.size);
    assert.equal(fresh.length, Math.min(4, 81 - before.size));
    // The new patches reach one another through themselves and what burned before.
    const within = new Set([...before, ...fresh]);
    const from = reachable(fresh[0], within, adjacency);
    assert.ok(fresh.every((p) => from.has(p)), `flare ${flares}: ${fresh}`);
  }
  assert.equal(flares, 21);
  assert.deepEqual([...it.burned].sort((a, b) => a - b), [...Array(81).keys()]);
  assert.deepEqual([run.idle('flare'), run.use('flare'), run.state.pack.length], ['done', false, 9]);
  assert.deepEqual(it.log.burnIns.at(-1), { by: 'flare', patches: 1, ms: 0 });
});

test('the first Flare on an untouched Veil is one connected cluster', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { run } = start(seed);
    const it = reach(run, 0);
    if (it.burned.length) continue;
    give(run, 'flare');
    run.use('flare');
    assert.ok(connected(it.burned, grid()), `seed ${seed}: ${it.burned}`);
  }
});

test("on the Veil as the page cuts it (labelPatches), Flares burn neighbouring patches and every patch once", () => {
  // An ellipse of art on a 120 x 90 picture, cut about 9 seeds a side, as veilCut does.
  const W = 120;
  const H = 90;
  const lit = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - 60) / 55) ** 2 + ((y - 45) / 40) ** 2 <= 1) lit[y * W + x] = 1;
  for (const cutSeed of [7, 77]) {
    const shapes = patchShapes(labelPatches(W, H, 9, cutSeed, lit), W, H);
    const adjacency = shapes.map((sh) => {
      const nb = new Set<number>();
      for (let i = 2; i < sh.edges.length; i += 3) nb.add(sh.edges[i]);
      return [...nb];
    });
    assert.ok(adjacency.length > 30, `${adjacency.length} patches`);
    // The cut's adjacency goes both ways.
    adjacency.forEach((nb, k) => nb.forEach((j) => assert.ok(adjacency[j].includes(k))));
    const { run } = start(cutSeed);
    run.leave();
    run.enter();
    const it = reach(run, 0, adjacency);
    assert.equal(it.patches, adjacency.length);
    give(run, ...Array<Ware>(40).fill('flare'));
    while (run.use('flare')) {
      const before = new Set(it.burned.slice(0, -it.log.burnIns.at(-1)!.patches));
      const fresh = it.burned.slice(before.size);
      const from = reachable(fresh[0], new Set([...before, ...fresh]), adjacency);
      assert.ok(fresh.every((p) => from.has(p)));
    }
    assert.equal(new Set(it.burned).size, it.burned.length);
    assert.equal(it.burned.length, adjacency.length);
    // A cluster on an untouched cut is connected on the cut's own edges.
    assert.ok(connected(it.burned.slice(0, it.log.burnIns[0].patches), adjacency));
  }
});

test('a Flare on a Veil in islands starts again elsewhere once its island is burned', () => {
  // Two islands of 3 patches each: a cluster of 4 needs both.
  const islands = [[1, 2], [0, 2], [0, 1], [4, 5], [3, 5], [3, 4]];
  let seed = 1;
  while (new Run({ seed, now: () => T0 }).state.zones[0] !== 'plain') seed++;
  const { run } = start(seed);
  const it = reach(run, 0, islands);
  assert.equal(run.flareBurn(), 4);
  const before = it.burned.length;
  give(run, 'flare', 'flare', 'flare');
  run.use('flare');
  assert.equal(it.burned.length - before, Math.min(4, 6 - before));
  while (run.use('flare'));
  assert.deepEqual([...it.burned].sort(), [0, 1, 2, 3, 4, 5]);
  assert.equal(run.idle('flare'), 'done');
});

// ---- Scroll of Wisdom ----

test('a Scroll of Wisdom shows a common mod line not shown yet, until none is left', () => {
  const { run, it } = find((it) => OFF_RITUAL(it) && commonLines(CLUES[it.itemId]).length >= 3 && it.zoneType === 'plain');
  const common = commonLines(CLUES[it.itemId]);
  assert.equal(it.shown.mods.length, 1, "the Plain zone's line");
  give(run, ...Array<Ware>(10).fill('wisdom'));
  while (run.idle('wisdom') === null) {
    const before = [...it.shown.mods];
    assert.ok(run.use('wisdom'));
    const shown = it.shown.mods.at(-1)!;
    assert.ok(!before.includes(shown));
    assert.ok(CLUES[it.itemId].mods[shown][2] >= 3, 'a common line, shared by 3 items or more');
  }
  assert.deepEqual([...it.shown.mods].sort(), [...common].sort());
  assert.deepEqual([run.idle('wisdom'), run.use('wisdom')], ['done', false]);
  assert.equal(it.log.supplies.length, common.length - 1);
});

test('a Scroll of Wisdom never shows a line fewer than 3 items share', () => {
  const { run, it } = find((it) => it.zoneType !== 'ritual' && it.zoneType !== 'plain' && CLUES[it.itemId].mods.some((m) => m[2] < 3) && commonLines(CLUES[it.itemId]).length > 0);
  give(run, ...Array<Ware>(10).fill('wisdom'));
  while (run.use('wisdom'));
  assert.ok(it.shown.mods.every((i) => CLUES[it.itemId].mods[i][2] >= 3));
  assert.equal(it.shown.mods.length, commonLines(CLUES[it.itemId]).length);
});

test("a Scroll of Wisdom on an item with no common line has nothing to do: 'done'", () => {
  const { run } = find((it) => OFF_RITUAL(it) && commonLines(CLUES[it.itemId]).length === 0);
  give(run, 'wisdom');
  assert.deepEqual([run.idle('wisdom'), run.use('wisdom'), run.state.pack], ['done', false, ['wisdom']]);
});

test("Scrolls of Wisdom don't work in a Ritual zone: 'ritual'", () => {
  const { run } = find((it) => it.zoneType === 'ritual' && commonLines(CLUES[it.itemId]).length > 0);
  give(run, 'wisdom');
  assert.deepEqual([run.idle('wisdom'), run.use('wisdom')], ['ritual', false]);
});

// ---- Name strike ----

test('a Name strike strikes 1 wrong name, never the answer, and never leaves fewer than 3', () => {
  const { run, it } = find((it) => it.names.length === 8);
  give(run, ...Array<Ware>(9).fill('strike'));
  let strikes = 0;
  while (run.idle('strike') === null) {
    const left = remaining(it).length;
    assert.ok(run.use('strike'));
    strikes++;
    assert.equal(remaining(it).length, left - 1);
    assert.ok(!it.struck.includes(it.itemId));
  }
  assert.deepEqual([strikes, remaining(it).length, run.idle('strike'), run.use('strike')], [5, 3, 'done', false]);
  answer(run);
});

test("a Name strike on a board of 4: one strike, then 'done'", () => {
  const { run, it } = find((it) => it.names.length === 4);
  give(run, 'strike', 'strike');
  assert.ok(run.use('strike'));
  assert.deepEqual([remaining(it).length, run.idle('strike'), run.state.pack], [3, 'done', ['strike']]);
});

test("a Name strike's struck name greys out the syllables no remaining name uses", () => {
  const { run, it } = find((it) => it.names.length >= 6);
  give(run, ...Array<Ware>(5).fill('strike'));
  while (run.use('strike'));
  const left = new Set(remaining(it).flatMap((nm) => nm.words.flat()));
  for (const t of it.tiles) assert.equal(greyed(it, t), !left.has(t), t);
  for (const t of it.tiles.filter((t) => !left.has(t))) assert.equal(run.place(t), false);
});

// ---- Word lengths ----

test("Word lengths shows the answer's words and the syllables in each, once", () => {
  const { run, it } = inZone('plain');
  if (it.shown.lengths) return assert.fail('the free clue showed them');
  give(run, 'lengths', 'lengths');
  assert.ok(run.use('lengths'));
  assert.equal(it.shown.lengths, true);
  assert.deepEqual(lengthsOf(it), answerOf(it).words.map((w) => w.length));
  assert.deepEqual([run.idle('lengths'), run.use('lengths'), run.state.pack], ['done', false, ['lengths']]);
});

test("Word lengths has nothing to do in a Ritual zone, which shows them already: 'done'", () => {
  const { run, it } = inZone('ritual');
  assert.equal(it.shown.lengths, true);
  assert.equal(run.idle('lengths'), 'done');
});

// ---- First syllable ----

test("First syllable places the answer's first syllable, locked: unplace and Clear keep it", () => {
  const { run, it } = inZone('plain');
  const first = answerOf(it).words[0][0];
  const other = it.tiles.find((t) => t !== first)!;
  run.place(other);
  give(run, 'first', 'first');
  assert.ok(run.use('first'));
  assert.deepEqual([it.build, it.locked], [[first, other], 1]);
  assert.equal(run.unplace(0), false);
  assert.ok(run.unplace(1));
  assert.deepEqual(it.build, [first]);
  assert.equal(run.clear(), false, 'nothing but the locked start');
  run.place(other);
  assert.ok(run.clear());
  assert.deepEqual(it.build, [first]);
  assert.deepEqual([run.idle('first'), run.use('first'), run.state.pack], ['done', false, ['first']]);
  answer(run);
});

test('First syllable on a line that starts with it already locks it without placing it again', () => {
  const { run, it } = inZone('plain');
  const first = answerOf(it).words[0][0];
  run.place(first);
  give(run, 'first');
  assert.ok(run.use('first'));
  assert.deepEqual([it.build, it.locked], [[first], 1]);
});

// ---- Decoy sweep ----

test("a Decoy sweep greys out 3 syllables only wrong names use, never the answer's", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { run } = start(seed);
    const it = reach(run, 0);
    const mine = new Set(answerOf(it).words.flat());
    const could = decoys(it);
    if (could.length < 3) continue;
    give(run, 'decoy');
    assert.ok(run.use('decoy'));
    assert.equal(it.swept.length, 3);
    for (const s of it.swept) {
      assert.ok(could.includes(s) && !mine.has(s), s);
      assert.ok(greyed(it, s));
      assert.equal(run.place(s), false);
    }
    for (const s of mine) assert.ok(!greyed(it, s));
    answer(run);
  }
});

test("Decoy sweeps grey out every syllable only wrong names use, then have nothing to do: 'done'", () => {
  const { run, it } = find((it) => decoys(it).length >= 7);
  const mine = new Set(answerOf(it).words.flat());
  give(run, ...Array<Ware>(30).fill('decoy'));
  while (run.idle('decoy') === null) {
    const could = decoys(it).length;
    const before = it.swept.length;
    assert.ok(run.use('decoy'));
    assert.equal(it.swept.length - before, Math.min(3, could));
  }
  assert.equal(new Set(it.swept).size, it.swept.length);
  assert.deepEqual(
    it.tiles.filter((t) => !greyed(it, t)).sort(),
    [...mine].sort(),
  );
  assert.deepEqual([run.idle('decoy'), run.use('decoy')], ['done', false]);
  answer(run);
});

test("a Decoy sweep leaves names whole: it greys syllables, it strikes nothing", () => {
  const { run, it } = find((it) => decoys(it).length >= 3);
  give(run, 'decoy');
  run.use('decoy');
  assert.deepEqual(it.struck, []);
});

// ---- Corruption ----

test('a Vaal Orb needs one in the pack and an open item not of the boss and not corrupted', () => {
  const { run } = start(5, always('gilded'));
  const s = run.state;
  give(run, 'vaal', 'vaal');
  assert.deepEqual([run.canCorrupt(), run.corrupt()], [false, null], 'at the camp');
  run.leave();
  run.enter();
  assert.equal(run.corrupt(), null, 'laid out, not open');
  run.open(grid());
  assert.equal(run.corrupt(), 'gilded');
  assert.deepEqual([run.canCorrupt(), run.corrupt(), s.pack], [false, null, ['vaal']], 'corrupted already');
  answer(run);
  assert.equal(run.corrupt(), null, 'solved');
  s.pack = [];
  reach(run, 1);
  assert.deepEqual([run.canCorrupt(), run.corrupt()], [false, null], 'none in the pack');
  reach(run, 12);
  give(run, 'vaal');
  assert.deepEqual([run.canCorrupt(), run.corrupt(), s.pack], [false, null, ['vaal']], 'the boss');
});

test('the outcome is drawn by the tuning\'s weights', () => {
  assert.deepEqual(DEFAULT_TUNING.corruption, { gilded: 2, unveiled: 2, twisted: 2, bricked: 1 });
  for (const outcome of CORRUPTIONS) {
    for (let seed = 1; seed <= 5; seed++) {
      const { run } = start(seed, always(outcome));
      const it = reach(run, seed % 3);
      give(run, 'vaal');
      assert.equal(run.corrupt(), outcome);
      assert.deepEqual([it.corruption, it.log.corruption], [outcome, outcome]);
    }
  }
  const counts = Object.fromEntries(CORRUPTIONS.map((c) => [c, 0])) as Record<Corruption, number>;
  for (let seed = 1; seed <= 700; seed++) {
    const { run } = start(seed);
    run.leave();
    run.enter();
    run.open(grid());
    give(run, 'vaal');
    counts[run.corrupt()!]++;
  }
  // 2 : 2 : 2 : 1 of 700: 200, 200, 200, 100.
  for (const c of CORRUPTIONS) assert.ok(Math.abs(counts[c] - (c === 'bricked' ? 100 : 200)) < 45, JSON.stringify(counts));
});

test('a Vaal Orb is used up and logged: its outcome, the supplies used before it, when', () => {
  const { run, clock, it } = inZone('plain', 1, always('gilded'));
  give(run, 'flare', 'vaal', 'lengths');
  clock.t += 500;
  run.use('flare');
  run.use('lengths');
  clock.t += 1500;
  assert.equal(run.corrupt(), 'gilded');
  assert.deepEqual(run.state.pack, []);
  assert.deepEqual(it.log.vaal, { outcome: 'gilded', suppliesBefore: 2, ms: 2000 });
  assert.equal(run.state.log.vaalUsed, 1);
  assert.deepEqual(run.state.log.outcomes, { gilded: 1, unveiled: 0, twisted: 0, bricked: 0 });
});

test('the outcome holds through all the item\'s submits', () => {
  const { run, it } = inZone('plain', 1, always('twisted'));
  give(run, 'vaal');
  run.corrupt();
  const names = it.names.length;
  build(run, [...answerOf(it).words.flat(), answerOf(it).words[0][0]]);
  assert.equal(run.submit(), false);
  assert.deepEqual([it.corruption, it.names.length], ['twisted', names]);
  answer(run);
  assert.equal(it.log.corruption, 'twisted');
});

test('Unveiled burns in 12 patches at once', () => {
  const { run, clock, it } = inZone('plain', 1, always('unveiled'));
  give(run, 'vaal');
  clock.t += 300;
  assert.equal(run.corrupt(), 'unveiled');
  assert.equal(it.burned.length, 12);
  assert.equal(new Set(it.burned).size, 12);
  assert.ok(connected(it.burned, grid()));
  assert.deepEqual(it.log.burnIns, [{ by: 'vaal', patches: 12, ms: 300 }]);
});

test('Twisted adds 3 names and their syllables to the tiles, the tiles already there kept in their order', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { run } = start(seed, always('twisted'));
    const it = reach(run, 0);
    const names = it.names.map((nm) => nm.id);
    const tiles = [...it.tiles];
    give(run, 'vaal');
    assert.equal(run.corrupt(), 'twisted');
    assert.equal(it.names.length, names.length + 3);
    const added = it.names.filter((nm) => !names.includes(nm.id));
    assert.equal(added.length, 3);
    assert.ok(added.every((nm) => nm.id !== it.itemId));
    assert.equal(new Set(it.names.map((nm) => nm.name.toLowerCase())).size, it.names.length, 'no name twice');
    assert.deepEqual(new Set(it.tiles), new Set(it.names.flatMap((nm) => nm.words.flat())));
    assert.equal(new Set(it.tiles).size, it.tiles.length);
    assert.deepEqual(
      it.tiles.filter((t) => tiles.includes(t)),
      tiles,
    );
    assert.deepEqual([it.log.names, it.log.board.length, it.log.board.filter((b) => b.answer).length], [it.names.length, it.names.length, 1]);
    for (const nm of added) for (const s of nm.words.flat()) assert.ok(run.place(s), s);
  }
});

test('Twisted never takes a board above 10 names', () => {
  for (const [early, size] of [[7, 7], [9, 9], [8, 10]] as const) {
    const t = tuned((t) => ((t.corruption = { gilded: 0, unveiled: 0, twisted: 1, bricked: 0 }), (t.board.early = early)));
    const { run, it } = find((it) => it.names.length === size, t, 5);
    give(run, 'vaal');
    assert.equal(run.corrupt(), 'twisted');
    assert.equal(it.names.length, 10, `a board of ${size}`);
    assert.equal(new Set(it.names.map((nm) => nm.id)).size, 10);
  }
});

test("Gilded changes nothing on the item but its deal", () => {
  const { run, it } = inZone('plain', 1, always('gilded'));
  const before = structuredClone({ names: it.names, tiles: it.tiles, burned: it.burned, shown: it.shown });
  give(run, 'vaal');
  run.corrupt();
  assert.deepEqual({ names: it.names, tiles: it.tiles, burned: it.burned, shown: it.shown }, before);
});
