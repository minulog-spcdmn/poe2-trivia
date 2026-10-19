import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Run,
  CLUES,
  DEFAULT_TUNING,
  PATCHES,
  SUPPLIES,
  SYLLABLES,
  covered,
  greyed,
  remaining,
  type BoardName,
  type ItemPlay,
  type Tuning,
  type ZoneType,
} from '../src/wraeclast/rules.ts';

// One item of the Wraeclast run (src/wraeclast/rules.ts) held to its handoff,
// docs/handoff/wraeclast/README.md ("An item", "Zones", "A run"): the
// Inscription, submits, the free clues, the boss's three and the veil.

const T0 = Date.UTC(2026, 9, 19, 12);

/** A run on a clock that moves only when the test moves it. */
function start(seed: number, tuning: Tuning = DEFAULT_TUNING) {
  const clock = { now: T0 };
  const run = new Run({ seed, tuning, now: () => clock.now });
  return { run, clock };
}

const tuned = (change: (t: Tuning) => void) => {
  const t = structuredClone(DEFAULT_TUNING);
  change(t);
  return t;
};

const answerOf = (it: ItemPlay) => it.names.find((nm) => nm.id === it.itemId)!;
const wrongNames = (it: ItemPlay) => it.names.filter((nm) => nm.id !== it.itemId);
const lifted = (it: ItemPlay) => it.lifted.flatMap((up, i) => (up ? [i] : []));

/** Puts a board name on the answer line, syllable by syllable. */
function build(run: Run, name: BoardName) {
  run.clear();
  for (const syl of name.words.flat()) assert.ok(run.place(syl), `${syl} of ${name.name} can't be placed`);
}

/** A build that is no name: one syllable twice (no name in the game repeats one). */
function nonsense(run: Run, it: ItemPlay) {
  run.clear();
  const syl = answerOf(it).words[0][0];
  assert.ok(!it.names.some((nm) => nm.words.flat().join('') === syl + syl));
  assert.ok(run.place(syl) && run.place(syl));
}

/** Plays on to item n (0 to 14), every item before it answered right at once, and lays it out (not opened yet). */
function reach(run: Run, n: number): ItemPlay {
  const s = run.state;
  for (;;) {
    if (s.phase === 'item' && s.done === n) return s.item!;
    if (s.phase === 'camp' || s.phase === 'town') assert.ok(run.leave());
    else if (s.phase === 'between') assert.ok(run.next());
    else if (s.phase === 'deal') assert.ok(run.pick(0));
    else if (s.phase === 'item') {
      run.open();
      build(run, answerOf(s.item!));
      assert.equal(run.submit(), true);
    } else assert.fail(`the run ended before item ${n}`);
  }
}

/** Plays a whole run: `each` gets every item as it's laid out, and whatever it leaves open is answered right. */
function playAll(run: Run, each: (it: ItemPlay) => void) {
  for (let n = 0; n < 15 && run.state.phase !== 'end'; n++) each(reach(run, n));
}

/** The first `count` seeds whose zone 1 is of a type. */
function zoneOneSeeds(type: ZoneType, count: number) {
  const seeds: number[] = [];
  for (let seed = 1; seeds.length < count && seed < 500; seed++) if (start(seed).run.state.zones[0] === type) seeds.push(seed);
  assert.equal(seeds.length, count);
  return seeds;
}

const zoneOne = (type: ZoneType) => zoneOneSeeds(type, 1)[0];

test('the Inscription holds the distinct syllables of every name on the board, and nothing else', () => {
  const bad: string[] = [];
  let boards = 0;
  let inOrder = 0;
  for (let seed = 1; seed <= 5; seed++)
    playAll(start(seed).run, (it) => {
      boards++;
      const where = `seed ${seed}, item ${it.n}`;
      for (const nm of it.names) if (JSON.stringify(nm.words) !== JSON.stringify(SYLLABLES[nm.id])) bad.push(`${where}: ${nm.name} not split as syllables.json`);
      if (!it.names.some((nm) => nm.id === it.itemId)) bad.push(`${where}: the answer is not on the board`);
      const all = [...new Set(it.names.flatMap((nm) => nm.words.flat()))];
      if (new Set(it.tiles).size !== it.tiles.length) bad.push(`${where}: a syllable twice`);
      if (JSON.stringify([...it.tiles].sort()) !== JSON.stringify([...all].sort())) bad.push(`${where}: ${it.tiles.join(' ')}`);
      if (it.tiles.join('|') === all.join('|')) inOrder++;
    });
  assert.deepEqual(bad, []);
  assert.ok(inOrder < boards / 2, `${inOrder} of ${boards} boards unshuffled`);
});

test('a tile of the other case ("the" for "The") builds the name all the same, and keeps it from greying', () => {
  let found = 0;
  for (let seed = 1; seed <= 300 && found < 3; seed++) {
    const { run } = start(seed);
    playAll(run, (it) => {
      if (found >= 3) return;
      run.open();
      const answer = answerOf(it).words.flat();
      const twin = (syl: string) => it.tiles.find((t) => t !== syl && t.toLowerCase() === syl.toLowerCase());
      const at = answer.findIndex((syl) => twin(syl) !== undefined);
      if (at < 0) return;
      found++;
      assert.equal(greyed(it, twin(answer[at])!), false);
      run.clear();
      answer.forEach((syl, i) => assert.ok(run.place(i === at ? twin(syl)! : syl)));
      assert.equal(run.submit(), true, `${answerOf(it).name} built with ${twin(answer[at])}`);
    });
  }
  assert.equal(found, 3, 'no board with a syllable in both cases');
});

test('placing a syllable never uses it up, so one can go on the line twice', () => {
  const { run } = start(1);
  const it = reach(run, 0);
  run.open();
  const tiles = [...it.tiles];
  assert.ok(run.place(tiles[0]));
  assert.ok(run.place(tiles[0]));
  assert.deepEqual(it.build, [tiles[0], tiles[0]]);
  assert.deepEqual(it.tiles, tiles);
});

test('a placed syllable comes back off the line by its place, and Clear empties the line', () => {
  const { run } = start(1);
  const it = reach(run, 0);
  run.open();
  const [a, b, c] = it.tiles;
  for (const syl of [a, b, c]) run.place(syl);
  assert.ok(run.unplace(1));
  assert.deepEqual(it.build, [a, c]);
  assert.equal(run.unplace(2), false);
  assert.deepEqual(it.build, [a, c]);
  assert.ok(run.unplace(0));
  assert.deepEqual(it.build, [c]);
  run.place(a);
  run.place(b);
  run.clear();
  assert.deepEqual(it.build, []);
  assert.ok(run.place(b));
});

test('only the board\'s own syllables can be placed', () => {
  const { run } = start(1);
  const it = reach(run, 0);
  run.open();
  const elsewhere = Object.values(SYLLABLES)
    .flatMap((words) => words.flat())
    .find((syl) => !it.tiles.includes(syl))!;
  assert.equal(run.place(elsewhere), false);
  assert.equal(run.place('Wraeclast'), false);
  assert.deepEqual(it.build, []);
});

test('a right build pays 5 (zones 1 and 2) or 7 (zones 3 and 4) times the multiplier, halved per miss and rounded down; the boss pays nothing', () => {
  const bad: string[] = [];
  const multipliers = new Set<number>();
  const base = (n: number) => (n < 6 ? 5 : n < 12 ? 7 : 0);
  const cost = (n: number) => (n < 6 ? 25 : n < 12 ? 35 : 60);
  for (let seed = 1; seed <= 8; seed++) {
    const { run } = start(seed, tuned((t) => (t.life = 100_000)));
    const s = run.state;
    playAll(run, (it) => {
      const misses = (it.n + seed) % 4;
      run.open();
      const [life, gold] = [s.life, s.gold];
      for (let k = 0; k < misses; k++) {
        nonsense(run, it);
        assert.equal(run.submit(), false);
      }
      build(run, answerOf(it));
      assert.equal(run.submit(), true);
      multipliers.add(it.multiplier);
      const pay = Math.floor((base(it.n) * it.multiplier) / 2 ** misses);
      if (s.gold - gold !== pay || it.log.gold !== pay) bad.push(`seed ${seed}, item ${it.n} (x${it.multiplier}, ${misses} misses): paid ${s.gold - gold}, logged ${it.log.gold}, not ${pay}`);
      if (life - s.life !== misses * cost(it.n)) bad.push(`seed ${seed}, item ${it.n}: ${misses} misses cost ${life - s.life}`);
      if (it.log.submits.length !== misses + 1) bad.push(`seed ${seed}, item ${it.n}: ${it.log.submits.length} submits logged`);
    });
  }
  assert.deepEqual(bad, []);
  assert.deepEqual([...multipliers].sort(), [1, 1.25, 1.5, 2]);
});

test('every submit counts, a build that is no name at all too, timed from when the item opened', () => {
  const { run, clock } = start(1);
  const s = run.state;
  const it = reach(run, 0);
  clock.now += 700;
  run.open();
  clock.now += 1500;
  nonsense(run, it);
  assert.equal(run.submit(), false);
  assert.equal(s.life, 75);
  assert.equal(it.misses, 1);
  assert.deepEqual(it.struck, []);
  clock.now += 2500;
  build(run, answerOf(it));
  assert.equal(run.submit(), true);
  assert.deepEqual(
    it.log.submits.map(({ right, ms }) => [right, ms]),
    [
      [false, 1500],
      [true, 4000],
    ],
  );
  assert.equal(it.log.submits[1].text, answerOf(it).name);
  assert.equal(it.log.gold, Math.floor((5 * it.multiplier) / 2));
});

test('a miss costs 25 life in zones 1 and 2, 35 in zones 3 and 4 and 60 at the boss', () => {
  const lost: number[] = [];
  for (let n = 0; n < 15; n++) {
    const { run } = start(3);
    const it = reach(run, n);
    run.open();
    const life = run.state.life;
    nonsense(run, it);
    assert.equal(run.submit(), false);
    lost.push(life - run.state.life);
  }
  assert.deepEqual(lost, [25, 25, 25, 25, 25, 25, 35, 35, 35, 35, 35, 35, 60, 60, 60]);
});

test('a wrong build that is a board name strikes it, and the syllables no name left uses grey out and can\'t be placed', () => {
  const bad: string[] = [];
  let greys = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { run } = start(seed);
    const it = reach(run, 0);
    run.open();
    // A name's syllables no other name has, in either case (the board compares them so).
    const lower = (nm: BoardName) => nm.words.flat().map((syl) => syl.toLowerCase());
    const own = (nm: BoardName) => lower(nm).filter((syl) => !it.names.some((other) => other !== nm && lower(other).includes(syl)));
    const wrong = wrongNames(it).find((nm) => own(nm).length) ?? wrongNames(it)[0];
    build(run, wrong);
    assert.equal(run.submit(), false);
    if (JSON.stringify(it.struck) !== JSON.stringify([wrong.id])) bad.push(`seed ${seed}: struck ${it.struck.join(', ')}, not ${wrong.id}`);
    const left = remaining(it);
    for (const tile of it.tiles) {
      const grey = !left.some((nm) => lower(nm).includes(tile.toLowerCase()));
      greys += +grey;
      if (grey !== own(wrong).includes(tile.toLowerCase())) bad.push(`seed ${seed}: ${tile} grey ${grey}`);
      if (greyed(it, tile) !== grey) bad.push(`seed ${seed}: greyed(${tile}) says ${!grey}`);
      run.clear();
      if (run.place(tile) === grey) bad.push(`seed ${seed}: ${tile} ${grey ? 'placed though greyed' : 'not placed'}`);
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(greys > 0);
});

test('every wrong board name built is struck, down to the answer alone', () => {
  const { run } = start(zoneOne('plain'));
  const s = run.state;
  const it = reach(run, 0);
  run.open();
  assert.equal(it.names.length, 4);
  for (const nm of wrongNames(it)) {
    build(run, nm);
    assert.equal(run.submit(), false);
  }
  assert.deepEqual([...it.struck].sort(), wrongNames(it).map((nm) => nm.id).sort());
  assert.deepEqual(remaining(it).map((nm) => nm.id), [it.itemId]);
  assert.equal(s.life, 25);
  assert.deepEqual(
    [...new Set(it.tiles.filter((tile) => !greyed(it, tile)).map((tile) => tile.toLowerCase()))].sort(),
    [...new Set(answerOf(it).words.flat().map((syl) => syl.toLowerCase()))].sort(),
  );
  build(run, answerOf(it));
  assert.equal(run.submit(), true);
  assert.equal(it.log.gold, Math.floor((5 * it.multiplier) / 8));
});

/** What an item of each zone type opens with when its free clue is on. */
function freeClueOf(type: ZoneType, it: ItemPlay) {
  const clues = CLUES[it.itemId];
  const none = { freeClue: 'none', patches: 0, shown: { req: false, mods: 0, flavor: false } };
  if (type === 'plain') return { ...none, freeClue: 'patch', patches: 1 };
  if (type === 'blight') return { ...none, freeClue: 'patches', patches: 2 };
  if (type === 'incursion') return clues.flavor === null ? null : { ...none, freeClue: 'flavor', shown: { ...none.shown, flavor: true } };
  return clues.mods.length ? { ...none, freeClue: 'mod', shown: { ...none.shown, mods: 1 } } : null;
}

const opened = (it: ItemPlay) => ({ freeClue: it.freeClue, patches: lifted(it).length, shown: { ...it.shown } });

test('each zone gives its free clue as an item opens: Plain one patch, Blight two, Incursion the flavour text, Ritual the first mod line', () => {
  const bad: string[] = [];
  const seen = new Map<ZoneType, number>();
  const plainPatches = new Set<number>();
  for (let seed = 1; seed <= 6; seed++) {
    const { run } = start(seed);
    playAll(run, (it) => {
      const type = run.zoneType(it.zoneNo);
      if (!type) return;
      run.open();
      const want = freeClueOf(type, it);
      if (!want) return;
      seen.set(type, (seen.get(type) ?? 0) + 1);
      if (type === 'plain') plainPatches.add(lifted(it)[0]);
      if (JSON.stringify(opened(it)) !== JSON.stringify(want)) bad.push(`seed ${seed}, item ${it.n} (${type}): ${JSON.stringify(opened(it))}`);
      if (it.log.freeClue !== want.freeClue || it.log.patches !== want.patches) bad.push(`seed ${seed}, item ${it.n} (${type}): logged ${it.log.freeClue}, ${it.log.patches} patches`);
    });
  }
  assert.deepEqual(bad, []);
  assert.deepEqual([...seen.keys()].sort(), ['blight', 'incursion', 'plain', 'ritual']);
  assert.ok(plainPatches.size > 3, 'the free patch is always in the same few places');
});

test('turning a zone type\'s free clue off in the tuning leaves its items with none, and the other types theirs', () => {
  const bad: string[] = [];
  const none = { freeClue: 'none', patches: 0, shown: { req: false, mods: 0, flavor: false } };
  for (const off of ['plain', 'incursion', 'ritual', 'blight'] as const) {
    const { run } = start(2, tuned((t) => (t.freeClue[off] = false)));
    playAll(run, (it) => {
      const type = run.zoneType(it.zoneNo);
      if (!type) return;
      run.open();
      const want = type === off ? none : freeClueOf(type, it);
      if (want && JSON.stringify(opened(it)) !== JSON.stringify(want)) bad.push(`${off} off, item ${it.n} (${type}): ${JSON.stringify(opened(it))}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('the boss\'s first item opens with one patch lifted, its second and third with nothing', () => {
  const got: unknown[] = [];
  for (const seed of [1, 2, 3]) {
    const { run } = start(seed);
    playAll(run, (it) => {
      if (it.boss === null) return;
      assert.equal(it.n, 12 + it.boss);
      run.open();
      got.push([seed, it.boss, opened(it)]);
    });
  }
  const none = { req: false, mods: 0, flavor: false };
  assert.deepEqual(
    got,
    [1, 2, 3].flatMap((seed) => [
      [seed, 0, { freeClue: 'patch', patches: 1, shown: none }],
      [seed, 1, { freeClue: 'none', patches: 0, shown: none }],
      [seed, 2, { freeClue: 'none', patches: 0, shown: none }],
    ]),
  );
});

test('the boss is Silent: only Flares work, and on its third item a Flare lifts one patch', () => {
  const { run } = start(4, tuned((t) => (t.gold = 100)));
  const s = run.state;
  for (const supply of [...SUPPLIES, 'flare', 'flare'] as const) assert.ok(run.buy(supply));
  const usable = () => SUPPLIES.filter((supply) => run.canUse(supply));
  const flares: number[] = [];
  for (const n of [12, 13, 14]) {
    const it = reach(run, n);
    run.open();
    assert.deepEqual(usable(), ['flare'], `boss item ${n - 11}`);
    assert.deepEqual(SUPPLIES.filter((supply) => run.works(supply)), ['flare']);
    assert.ok(run.use('flare'));
    flares.push(it.flare);
    const before = covered(it);
    while (it.flare > 0) assert.ok(run.lift(it.lifted.indexOf(false)));
    assert.equal(run.lift(it.lifted.indexOf(false)), false);
    assert.equal(before - covered(it), flares.at(-1));
  }
  assert.deepEqual(flares, [2, 2, 1]);
  assert.deepEqual(s.pack, ['requirement', 'wisdom', 'strike', 'lore']);
});

test('open lifts the free patches among those the art covers, and anywhere when it covers too few', () => {
  const art = (cells: number[]) => Array.from({ length: PATCHES }, (_, i) => (cells.includes(i) ? 0.6 : 0));
  const bad: string[] = [];
  for (const seed of zoneOneSeeds('blight', 4)) {
    const { run } = start(seed);
    const it = reach(run, 0);
    run.open(art([5, 10]));
    if (lifted(it).join() !== '5,10') bad.push(`blight, seed ${seed}: ${lifted(it).join()}`);
  }
  for (const cell of [0, 7, 15]) {
    const { run } = start(zoneOne('plain'));
    const it = reach(run, 0);
    run.open(art([cell]));
    if (lifted(it).join() !== String(cell)) bad.push(`plain on ${cell}: ${lifted(it).join()}`);
  }
  {
    const { run } = start(zoneOne('blight'));
    const it = reach(run, 0);
    run.open(art([3]));
    if (!it.lifted[3] || lifted(it).length !== 2) bad.push(`blight on 3 alone: ${lifted(it).join()}`);
  }
  {
    const { run } = start(zoneOne('blight'));
    const it = reach(run, 0);
    run.open(art([]));
    if (lifted(it).length !== 2) bad.push(`blight on no art: ${lifted(it).join()}`);
  }
  {
    const { run } = start(5);
    const it = reach(run, 12);
    run.open(art([9]));
    if (lifted(it).join() !== '9') bad.push(`boss item 1 on 9: ${lifted(it).join()}`);
  }
  assert.deepEqual(bad, []);
});

test('the veil is a 4 x 4 grid: 16 patches, every one down until the item opens', () => {
  assert.equal(PATCHES, 16);
  const { run } = start(zoneOne('plain'));
  const it = reach(run, 0);
  assert.equal(it.lifted.length, 16);
  assert.equal(covered(it), 16);
  run.open();
  assert.equal(covered(it), 15);
});
