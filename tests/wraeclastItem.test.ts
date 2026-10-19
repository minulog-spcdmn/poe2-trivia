import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Run,
  CLUES,
  DEFAULT_TUNING,
  ITEMS,
  SYLLABLES,
  ZONE_TYPES,
  answerOf,
  buildText,
  commonLines,
  greyed,
  lengthsOf,
  remaining,
  startsWord,
  type BoardName,
  type ItemPlay,
  type Tuning,
  type ZoneType,
} from '../src/wraeclast/rules.ts';

// One item of the Wraeclast run (src/wraeclast/rules.ts) held to its handoff,
// docs/handoff/wraeclast/v2.md ("An item", "Board", "Auto spacing", "Zones"):
// the mixed board, the Inscription and its spacing, submits, and the free
// clues.

const T0 = Date.UTC(2026, 9, 19, 12);
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

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

/** A name as the board compares it: no spaces, lower case. */
const key = (text: string) => text.replace(/\s+/g, '').toLowerCase();

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

/** Whether patches are one connected cluster on the adjacency. */
function connected(patches: number[], adjacency: number[][]) {
  const all = new Set(patches);
  const seen = new Set([patches[0]]);
  const todo = [patches[0]];
  while (todo.length) for (const q of adjacency[todo.pop()!]) if (all.has(q) && !seen.has(q)) seen.add(q), todo.push(q);
  return seen.size === all.size;
}

/** On to the next item, laid out (opened too unless `open` is false): through the camp or town, the threshold, the solved screen and the loot. */
function toItem(run: Run, open = true): ItemPlay {
  const s = run.state;
  for (;;) {
    if (s.phase === 'camp' || s.phase === 'town') assert.ok(run.leave());
    else if (s.phase === 'travel') assert.ok(run.enter());
    else if (s.phase === 'solved') assert.ok(run.next());
    else if (s.phase === 'loot') {
      if (s.loot!.taken === null) assert.ok(run.take(0));
      if (s.loot!.pending !== null) assert.ok(run.keep(null));
      assert.ok(run.next());
    } else if (s.phase === 'item') {
      if (open && s.item!.openedAt === null) assert.ok(run.open(grid()));
      return s.item!;
    } else assert.fail(`no item to go to in phase ${s.phase}`);
  }
}

/** Puts a board name (or any syllables) on the answer line, after its locked start. */
function build(run: Run, what: BoardName | string[]) {
  const it = run.state.item!;
  const syl = Array.isArray(what) ? what : what.words.flat();
  run.clear();
  for (const s of syl.slice(it.locked)) assert.ok(run.place(s), `placing ${s}`);
}

function answer(run: Run) {
  build(run, answerOf(run.state.item!));
  assert.equal(run.submit(), true);
}

/** A build that is no name: the answer and its first syllable once more per miss so far. */
function nonsense(run: Run) {
  const it = run.state.item!;
  const syl = answerOf(it).words.flat();
  build(run, [...syl, ...Array<string>(it.misses + 1).fill(syl[0])]);
}

/** Plays every item right, at once, until item n is laid out (and opened unless `open` is false). */
function reach(run: Run, n: number, open = true): ItemPlay {
  for (;;) {
    const it = toItem(run, open);
    if (it.n === n) return it;
    if (it.openedAt === null) run.open(grid());
    answer(run);
  }
}

/** Every item of a run as it's laid out, then opened, then answered right; `each` gets it once opened. */
function playAll(run: Run, each: (it: ItemPlay) => void = () => {}) {
  for (let n = 0; n < 15 && run.state.phase !== 'end'; n++) {
    const it = reach(run, n);
    each(it);
    if (run.state.phase === 'item') answer(run);
  }
  // The boss's last: on to the end.
  if (run.state.phase === 'solved') assert.ok(run.next());
}

/** The first open item, over seeds from 1, that `fits`. */
function find(fits: (it: ItemPlay, run: Run) => boolean, tuning?: Tuning, seeds = 200) {
  for (let seed = 1; seed <= seeds; seed++) {
    const { run, clock } = start(seed, tuning);
    for (let n = 0; n < 15; n++) {
      const it = reach(run, n);
      if (fits(it, run)) return { run, clock, it };
      answer(run);
    }
  }
  assert.fail('no item fits');
}

/** The first `count` seeds from 1 whose zones fit. */
function seedsWhere(fits: (zones: ZoneType[]) => boolean, count: number) {
  const out: number[] = [];
  for (let seed = 1; out.length < count; seed++) if (fits(new Run({ seed, now: () => T0 }).state.zones)) out.push(seed);
  return out;
}

const wrong = (it: ItemPlay) => it.names.filter((nm) => nm.id !== it.itemId);

// ---- The board ----

test('boards hold 4 names in zones 1 and 2, 6 in 3 and 4, 10 at the boss, Blight 2 more', () => {
  assert.deepEqual(DEFAULT_TUNING.board, { early: 4, late: 6, boss: 10 });
  for (const seed of [...seedsWhere((z) => z.indexOf('blight') < 2, 3), ...seedsWhere((z) => z.indexOf('blight') >= 2, 3)]) {
    const { run } = start(seed);
    const sizes: number[] = [];
    playAll(run, (it) => sizes.push(it.names.length));
    const want = sizes.map((_, n) => {
      const blight = n < 12 && run.state.zones[Math.floor(n / 3)] === 'blight' ? 2 : 0;
      return (n < 6 ? 4 : n < 12 ? 6 : 10) + blight;
    });
    assert.deepEqual(sizes, want, `seed ${seed}, zones ${run.state.zones}`);
    assert.deepEqual(
      run.state.log.items.map((it) => it.names),
      want,
    );
  }
});

test("boards hold the tuning's names, and never more than 10 with Blight's", () => {
  const tuning = tuned((t) => (t.board = { early: 9, late: 3, boss: 7 }));
  for (const seed of seedsWhere((z) => z.indexOf('blight') < 2, 2)) {
    const { run } = start(seed, tuning);
    const sizes: number[] = [];
    playAll(run, (it) => sizes.push(it.names.length));
    const want = sizes.map((_, n) => {
      const blight = n < 12 && run.state.zones[Math.floor(n / 3)] === 'blight' ? 2 : 0;
      return Math.min(10, (n < 6 ? 9 : n < 12 ? 3 : 7) + blight);
    });
    assert.deepEqual(sizes, want);
    assert.ok(sizes.includes(10), 'Blight at 9 names stops at 10');
  }
});

test('half the wrong names, rounded down, are of the answer\'s own category, the rest of others', () => {
  const bad: string[] = [];
  for (let seed = 1; seed <= 10; seed++) {
    const { run } = start(seed);
    playAll(run, (it) => {
      const k = it.names.length - 1;
      const own = wrong(it).filter((nm) => BY_ID.get(nm.id)!.category === it.category).length;
      if (own !== Math.floor(k / 2)) bad.push(`seed ${seed}, item ${it.n}: ${own} of ${k} own`);
      if (BY_ID.get(it.itemId)!.category !== it.category) bad.push(`seed ${seed}, item ${it.n}: answer of another category`);
    });
  }
  assert.deepEqual(bad, []);
});

test("the share of wrong names from other categories is the tuning's: 0 and 100", () => {
  for (const otherNames of [0, 100]) {
    const { run } = start(3, tuned((t) => (t.otherNames = otherNames)));
    playAll(run, (it) => {
      const others = wrong(it).filter((nm) => BY_ID.get(nm.id)!.category !== it.category).length;
      assert.equal(others, otherNames ? it.names.length - 1 : 0, `${otherNames}%, item ${it.n}`);
    });
  }
});

test('no board holds a name twice, and the answer is on it once', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const { run } = start(seed);
    playAll(run, (it) => {
      assert.equal(new Set(it.names.map((nm) => nm.id)).size, it.names.length);
      assert.equal(new Set(it.names.map((nm) => key(nm.name))).size, it.names.length);
      assert.equal(it.names.filter((nm) => nm.id === it.itemId).length, 1);
      for (const nm of it.names) assert.deepEqual([nm.name, nm.words], [BY_ID.get(nm.id)!.name, SYLLABLES[nm.id]]);
    });
  }
});

test('the tiles are the distinct syllables of every name on the board, lower case, each once', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { run } = start(seed);
    playAll(run, (it) => {
      const want = new Set(it.names.flatMap((nm) => nm.words.flat()));
      assert.equal(it.tiles.length, want.size);
      assert.deepEqual(new Set(it.tiles), want);
      assert.ok(it.tiles.every((t) => t === t.toLowerCase() && t.length > 0));
    });
  }
});

test('the tiles are shuffled, not in the order the names read', () => {
  let inOrder = 0;
  let boards = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const { run } = start(seed);
    playAll(run, (it) => {
      boards++;
      if (it.tiles.join('|') === [...new Set(it.names.flatMap((nm) => nm.words.flat()))].join('|')) inOrder++;
    });
  }
  assert.ok(inOrder < boards / 4, `${inOrder} of ${boards}`);
});

test('wrong names look alike: they share more syllables with the answer than random names of the same side would', () => {
  const sharedWith = (a: string, b: string) => {
    const mine = new Set(SYLLABLES[a].flat());
    return new Set(SYLLABLES[b].flat().filter((s) => mine.has(s))).size;
  };
  let picked = 0;
  let pickedN = 0;
  let chance = 0;
  let chanceN = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const { run } = start(seed);
    playAll(run, (it) => {
      for (const nm of wrong(it)) {
        picked += sharedWith(it.itemId, nm.id);
        pickedN++;
        const same = BY_ID.get(nm.id)!.category === it.category;
        const pool = ITEMS.filter((o) => o.id !== it.itemId && (o.category === it.category) === same);
        chance += pool.reduce((t, o) => t + sharedWith(it.itemId, o.id), 0) / pool.length;
        chanceN++;
      }
    });
  }
  const mean = picked / pickedN;
  const random = chance / chanceN;
  assert.ok(mean > random * 2, `wrong names share ${mean.toFixed(2)} syllables on average, random ones ${random.toFixed(2)}`);
});

test('boards vary: the same answer gets other wrong names in other runs', () => {
  const boards = new Map<string, Set<string>>();
  for (let seed = 1; seed <= 120; seed++) {
    const { run } = start(seed);
    const it = reach(run, 0);
    const names = wrong(it).map((nm) => nm.id).sort().join(',');
    boards.set(it.itemId, (boards.get(it.itemId) ?? new Set()).add(names));
  }
  const repeated = [...boards.values()].filter((b) => b.size > 1);
  assert.ok(repeated.length > 0);
});

// ---- The Inscription ----

test('a syllable is placed, taken back by its place on the line, and Clear empties the line', () => {
  const { run } = start(1);
  const it = reach(run, 0);
  const [a, b, c] = it.tiles;
  assert.ok(run.place(a));
  assert.ok(run.place(b));
  assert.ok(run.place(c));
  assert.deepEqual(it.build, [a, b, c]);
  assert.ok(run.unplace(1));
  assert.deepEqual(it.build, [a, c]);
  assert.equal(run.unplace(2), false);
  assert.equal(run.unplace(-1), false);
  assert.ok(run.clear());
  assert.deepEqual(it.build, []);
  assert.equal(run.clear(), false);
  assert.equal(run.place('no such tile'), false);
  assert.equal(run.submit(), null, 'nothing built');
});

test('a syllable can be placed more than once', () => {
  const { run } = start(2);
  const it = reach(run, 0);
  for (let k = 0; k < 4; k++) assert.ok(run.place(it.tiles[0]));
  assert.deepEqual(it.build, Array(4).fill(it.tiles[0]));
});

test('nothing is placed on an item laid out but not open', () => {
  const { run } = start(3);
  const it = reach(run, 0, false);
  assert.equal(run.place(it.tiles[0]), false);
  assert.equal(run.clear(), false);
  assert.equal(run.unplace(0), false);
});

test("a miss on one of the board's names strikes it, and a syllable no remaining name uses is greyed out and can't be placed", () => {
  // A wrong name with a syllable no other name on the board uses.
  const lone = (it: ItemPlay) =>
    wrong(it)
      .map((nm) => ({ nm, syl: nm.words.flat().find((s) => it.names.every((o) => o.id === nm.id || !o.words.flat().includes(s))) }))
      .find((x) => x.syl);
  const { run, it } = find((it) => !!lone(it));
  const { nm, syl } = lone(it)!;
  const life = run.state.life;
  build(run, nm);
  assert.equal(run.submit(), false);
  assert.deepEqual([it.struck, it.misses, it.log.misses, run.state.log.misses], [[nm.id], 1, 1, 1]);
  assert.ok(run.state.life < life);
  assert.ok(!remaining(it).includes(nm));
  assert.ok(greyed(it, syl!));
  assert.ok(it.tiles.includes(syl!), 'a greyed tile stays on the board');
  run.clear();
  assert.equal(run.place(syl!), false);
  assert.ok(!greyed(it, answerOf(it).words[0][0]));
});

test('every submit counts: a build that is no name costs life and a miss, and strikes nothing', () => {
  const { run } = start(4);
  const it = reach(run, 0);
  nonsense(run);
  const life = run.state.life;
  assert.equal(run.submit(), false);
  assert.deepEqual([it.misses, it.struck], [1, []]);
  assert.ok(run.state.life < life);
  assert.deepEqual(it.log.submits.map((s) => s.right), [false]);
});

test("a struck name can't be sent again, and costs nothing more", () => {
  // A wrong name whose every syllable another name uses too, so it can still be built once struck.
  const shared = (it: ItemPlay) => wrong(it).find((nm) => nm.words.flat().every((s) => it.names.some((o) => o.id !== nm.id && o.words.flat().includes(s))));
  const { run, it } = find((it) => !!shared(it));
  const nm = shared(it)!;
  build(run, nm);
  assert.equal(run.submit(), false);
  const life = run.state.life;
  build(run, nm);
  assert.deepEqual([run.blocked(), run.canSubmit(), run.submit()], ['struck', false, null]);
  assert.deepEqual([run.state.life, it.misses, it.log.submits.length], [life, 1, 1]);
});

test("a build already sent can't be sent again, and costs nothing more", () => {
  const { run } = start(5);
  const it = reach(run, 0);
  nonsense(run);
  const sent = [...it.build];
  assert.equal(run.blocked(), null);
  assert.equal(run.submit(), false);
  const life = run.state.life;
  build(run, sent);
  assert.deepEqual([run.blocked(), run.canSubmit(), run.submit()], ['tried', false, null]);
  assert.deepEqual([run.state.life, it.misses, it.log.submits.length], [life, 1, 1]);
  // One more syllable makes it a new build.
  assert.ok(run.place(sent[0]));
  assert.equal(run.blocked(), null);
});

test('the right answer names the item, after misses too', () => {
  const { run, clock } = start(6);
  const it = reach(run, 0);
  clock.t += 1000;
  nonsense(run);
  assert.equal(run.submit(), false);
  clock.t += 2000;
  answer(run);
  assert.equal(run.state.phase, 'solved');
  assert.deepEqual(
    it.log.submits.map((s) => [s.right, s.ms]),
    [
      [false, 1000],
      [true, 3000],
    ],
  );
  assert.deepEqual([run.place(it.tiles[0]), run.submit()], [false, null]);
});

// ---- Auto spacing ----

test('auto spacing puts a space before a syllable that starts a word in any name on the board, never first', () => {
  const bad: string[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    const { run } = start(seed);
    playAll(run, (it) => {
      const starts = new Set(it.names.flatMap((nm) => nm.words.map((w) => w[0])));
      for (const t of it.tiles) if (startsWord(it, t) !== starts.has(t)) bad.push(`${t}: startsWord ${startsWord(it, t)}`);
      // Every tile once, in the board's order, then once more in reverse.
      it.build = [...it.tiles, ...[...it.tiles].reverse()];
      const want = it.build.map((s, i) => (i > 0 && starts.has(s) && !it.build[i - 1].endsWith('-') ? ' ' + s : s)).join('');
      if (buildText(it, true) !== want) bad.push(`seed ${seed}, item ${it.n}: ${buildText(it, true)}`);
      if (buildText(it, false) !== it.build.join('')) bad.push(`seed ${seed}, item ${it.n}: spacing off`);
      it.build = [];
    });
  }
  assert.deepEqual(bad, []);
});

test("auto spacing spaces the answer's words, and also a syllable inside its word that starts a word in another name", () => {
  // An answer with a syllable inside a word that starts a word in another name on the board.
  const inner = (it: ItemPlay) => answerOf(it).words.some((w) => w.slice(1).some((s) => startsWord(it, s)));
  const { run, it } = find(inner);
  const a = answerOf(it);
  build(run, a);
  const text = buildText(it, true);
  // Every word of the answer starts after a space (but the first).
  const pieces = text.split(' ');
  assert.ok(pieces.length > a.words.length, `${text} spaces more than ${a.name}`);
  assert.equal(key(text), key(a.name));
  for (const w of a.words.slice(1)) assert.ok(text.includes(' ' + w[0]), `${text}: no space before ${w[0]}`);
  assert.equal(run.submit(), true, 'the extra space never makes it wrong');
});

test('a right answer is right with spacing on and off, and the log keeps the text as the line showed it', () => {
  for (const spacing of [true, false]) {
    const { run } = start(7, tuned((t) => (t.spacing = spacing)));
    playAll(run);
    const log = run.state.log;
    assert.deepEqual([log.result, log.spacing, log.misses], ['win', spacing, 0]);
    for (const it of log.items) {
      const [sub] = it.submits;
      assert.equal(sub.right, true);
      assert.equal(key(sub.text), key(it.name));
      if (!spacing) assert.ok(!sub.text.includes(' '), sub.text);
    }
    if (spacing) assert.ok(log.items.filter((it) => it.submits[0].text.includes(' ')).length >= 8);
  }
});

test("a wrong name of the board's is built with the same spaces, so the spacing never confirms the answer", () => {
  const { run, it } = find((it) => wrong(it).some((nm) => nm.words.length > 1));
  const nm = wrong(it).find((n) => n.words.length > 1)!;
  build(run, nm);
  const text = buildText(it, true);
  for (const w of nm.words.slice(1)) assert.ok(text.includes(' ' + w[0]));
  assert.equal(run.submit(), false);
  assert.equal(it.log.submits[0].text, text);
});

// ---- Free clues ----

test('a Plain zone shows one common mod line, or the word lengths when the item has none', () => {
  const seen = { mod: 0, lengths: 0 };
  for (const seed of seedsWhere(() => true, 60)) {
    const { run } = start(seed);
    const z = run.state.zones.indexOf('plain');
    for (let n = z * 3; n < z * 3 + 3; n++) {
      const it = reach(run, n);
      const common = commonLines(CLUES[it.itemId]);
      if (common.length) {
        assert.deepEqual([it.freeClue, it.shown.mods.length, it.shown.flavor, it.shown.lengths], ['mod', 1, false, false]);
        assert.ok(common.includes(it.shown.mods[0]));
        assert.ok(CLUES[it.itemId].mods[it.shown.mods[0]][2] >= 3);
        seen.mod++;
      } else {
        assert.deepEqual([it.freeClue, it.shown.mods, it.shown.lengths], ['lengths', [], true]);
        seen.lengths++;
      }
      assert.deepEqual([it.burned, it.log.freeClue], [[], it.freeClue]);
      answer(run);
    }
  }
  assert.ok(seen.mod > 0 && seen.lengths > 0, JSON.stringify(seen));
});

test('an Incursion zone shows the flavour text', () => {
  for (const seed of seedsWhere(() => true, 10)) {
    const { run } = start(seed);
    const z = run.state.zones.indexOf('incursion');
    for (let n = z * 3; n < z * 3 + 3; n++) {
      const it = reach(run, n);
      assert.ok(CLUES[it.itemId].flavor);
      assert.deepEqual([it.freeClue, it.shown, it.burned], ['flavor', { mods: [], flavor: true, lengths: false }, []]);
      answer(run);
    }
  }
});

test("a Ritual zone shows the answer's word lengths", () => {
  for (const seed of seedsWhere(() => true, 10)) {
    const { run } = start(seed);
    const z = run.state.zones.indexOf('ritual');
    for (let n = z * 3; n < z * 3 + 3; n++) {
      const it = reach(run, n);
      assert.deepEqual([it.freeClue, it.shown, it.burned], ['lengths', { mods: [], flavor: false, lengths: true }, []]);
      assert.deepEqual(lengthsOf(it), SYLLABLES[it.itemId].map((w) => w.length));
      answer(run);
    }
  }
});

test('a Blight zone burns in 2 neighbouring patches as the item opens', () => {
  for (const seed of seedsWhere(() => true, 10)) {
    const { run, clock } = start(seed);
    const z = run.state.zones.indexOf('blight');
    for (let n = z * 3; n < z * 3 + 3; n++) {
      const it = reach(run, n, false);
      assert.deepEqual([it.freeClue, it.burned], ['burn', []]);
      clock.t += 700;
      assert.ok(run.open(grid()));
      assert.equal(it.burned.length, 2);
      assert.ok(connected(it.burned, grid()), `${it.burned}`);
      assert.deepEqual(it.log.burnIns, [{ by: 'zone', patches: 2, ms: 0 }]);
      assert.deepEqual(it.shown, { mods: [], flavor: false, lengths: false });
      answer(run);
    }
  }
});

test("the boss's first item opens with a burn-in of 4, its second and third with nothing", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { run } = start(seed);
    const first = reach(run, 12);
    assert.deepEqual([first.freeClue, first.burned.length, first.log.burnIns.map((b) => [b.by, b.patches])], ['burn', 4, [['boss', 4]]]);
    assert.ok(connected(first.burned, grid()));
    answer(run);
    for (const n of [13, 14]) {
      const it = reach(run, n);
      assert.deepEqual([it.freeClue, it.burned, it.shown, it.log.burnIns], ['none', [], { mods: [], flavor: false, lengths: false }, []]);
      answer(run);
    }
  }
});

test("a zone type's free clue turned off gives its items none, and leaves the other zones and the boss's as they were", () => {
  const bad: string[] = [];
  for (const off of ZONE_TYPES) {
    const freeClue = Object.fromEntries(ZONE_TYPES.map((z) => [z, z !== off])) as Tuning['freeClue'];
    const { run } = start(8, tuned((t) => (t.freeClue = freeClue)));
    const clues: string[] = [];
    playAll(run, (it) => {
      const zone = it.zoneType;
      if (zone === off) {
        const got = { clue: it.freeClue, shown: it.shown, burned: it.burned.length };
        if (JSON.stringify(got) !== JSON.stringify({ clue: 'none', shown: { mods: [], flavor: false, lengths: false }, burned: 0 })) bad.push(`${off} off, item ${it.n}: ${JSON.stringify(got)}`);
      }
      clues.push(it.freeClue);
    });
    const want = run.state.zones.flatMap((z) => Array(3).fill(z === off ? 'none' : z === 'plain' ? 'plain' : { incursion: 'flavor', ritual: 'lengths', blight: 'burn' }[z]));
    clues.slice(0, 12).forEach((c, n) => {
      const w = want[n];
      if (w === 'plain' ? c !== 'mod' && c !== 'lengths' : c !== w) bad.push(`${off} off, item ${n}: ${c}, not ${w}`);
    });
    if (clues.slice(12).join() !== 'burn,none,none') bad.push(`${off} off: the boss's ${clues.slice(12)}`);
  }
  assert.deepEqual(bad, []);
});

test('the item logs its free clue and board, the answer marked', () => {
  const { run } = start(9);
  playAll(run, (it) => {
    assert.equal(it.log.freeClue, it.freeClue);
    assert.deepEqual(
      it.log.board,
      it.names.map((nm) => (nm.id === it.itemId ? { name: nm.name, answer: true } : { name: nm.name })),
    );
  });
});
