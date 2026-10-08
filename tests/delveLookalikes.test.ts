import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKALIKES_FROM, LOOKALIKES_TO, delveLookalikes } from '../src/lib/delve.ts';
import { Engine, createGame, isFake, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import { readLooks, type Looks } from '../src/lib/looks.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));
const looks = readLooks(JSON.parse(readFileSync(new URL('../src/data/looks.json', import.meta.url), 'utf8')));
const byId = new Map(items.map((it) => [it.id, it]));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** An engine with a fixed clock, so questions from two engines can be compared whole. */
const make = (seed: number, table: Looks | null = null) => new Engine(items, { rng: seeded(seed), now: () => 1_000_000, fakes, looks: table });

const DELVE: Settings = { targetScore: 10, timer: 0, difficulty: 'eternal', mode: 'delve', public: false, locked: false };

/** A solo run just started, for asking questions at any depth from a fresh pool. */
function fresh(engine: Engine): GameState {
  let s = createGame(null, DELVE);
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, null);
  return engine.apply(s, { type: 'start' }, null);
}

/** One question at `depth` in `category`, from a fresh pool (so questions don't depend on each other). */
function ask(engine: Engine, depth: number, category: string): Question {
  const s = structuredClone(fresh(engine));
  s.round = depth;
  return engine.makeQuestion(s, category);
}

/** The table, counting how many questions looked anything up in it. */
function spied(): { looks: Looks; asked: () => number } {
  let n = 0;
  return { looks: { ...looks, looksLike: (id) => (n++, looks.looksLike(id)) }, asked: () => n };
}

/** Categories whose groups hold well over a question's worth of items, so a fresh pool never mixes groups. */
const BIG = ['Body Armours', 'Helmets', 'Rings', 'Gloves & Boots', 'Amulets & Belts'].filter((c) => items.some((it) => it.category === c));

/**
 * Whether the options form one cluster of pictures: some item (the answer, or
 * one drawn like it) that every other option is drawn like, which is what
 * look-alikes by art pick, whichever role the answer plays in it. A made-up
 * name may have taken that item's place (`offScreen`: look for it in the
 * whole group), but never the answer's.
 */
function clustered(q: Question, offScreen = false): boolean {
  const real = q.options.filter((o) => !isFake(o));
  const group = byId.get(q.itemId)!.group;
  const anchors = offScreen ? items.filter((it) => it.group === group).map((it) => it.id) : real;
  return anchors.some(
    (anchor) =>
      (anchor === q.itemId || looks.lookScore(anchor, q.itemId) > 0) && real.every((o) => o === anchor || o === q.itemId || looks.lookScore(anchor, o) > 0),
  );
}

test('from depth 50 the roll comes up as often as the depth says, and every time from 120', () => {
  assert.ok(BIG.length >= 4);
  const share = (depth: number, n: number) => {
    const spy = spied();
    const engine = make(depth, spy.looks);
    let rolled = 0;
    for (let i = 0; i < n; i++) {
      const before = spy.asked();
      ask(engine, depth, engine.categories[i % engine.categories.length]);
      if (spy.asked() > before) rolled++;
    }
    return rolled / n;
  };
  assert.equal(share(LOOKALIKES_FROM - 1, 300), 0);
  const first = share(LOOKALIKES_FROM, 3000);
  assert.ok(Math.abs(first - delveLookalikes(LOOKALIKES_FROM)) < 0.01, `${first} at ${LOOKALIKES_FROM}`);
  const at85 = share(85, 3000);
  assert.ok(Math.abs(at85 - delveLookalikes(85)) < 0.04, `${at85} at 85`);
  assert.equal(share(LOOKALIKES_TO, 300), 1);
  assert.equal(share(250, 100), 1);
});

test('rolled, the wrong pictures and the wrong names are drawn like the answer, never the answer itself', () => {
  const engine = make(3, looks);
  const names = make(3);
  const modes = { art: 0, name: 0 };
  let art = 0;
  let artByName = 0;
  for (let i = 0; i < 400; i++) {
    const category = BIG[i % BIG.length];
    const q = ask(engine, 140, category);
    modes[q.mode]++;
    const shown = `${category}: ${byId.get(q.itemId)!.name} among ${q.options.map((o) => byId.get(o)?.name ?? o).join(', ')}`;
    assert.equal(q.options.filter((o) => o === q.itemId).length, 1, `the answer once: ${shown}`);
    assert.equal(new Set(q.options).size, q.options.length, `no option twice: ${shown}`);
    for (const o of q.options) if (!isFake(o)) assert.equal(byId.get(o)!.group, byId.get(q.itemId)!.group, `one group: ${shown}`);
    assert.ok(clustered(q, q.mode === 'name'), shown);
    const p = ask(names, 140, category);
    if (p.mode === 'art') (art++, clustered(p) && artByName++);
  }
  assert.ok(modes.art > 100 && modes.name > 100, JSON.stringify(modes));
  // By name, ten pictures seldom happen to form such a cluster.
  assert.ok(artByName / art < 0.5, `${artByName} of ${art} clustered by name`);
});

test('on average, the decoys look far more like the answer than look-alikes by name', () => {
  // The answer is only the cluster's anchor now and then, but always in it.
  const alike = (engine: Engine) => {
    let near = 0;
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const q = ask(engine, 140, BIG[i % BIG.length]);
      for (const o of q.options) if (o !== q.itemId && !isFake(o)) (n++, looks.lookScore(q.itemId, o) > 0 && near++);
    }
    return near / n;
  };
  const [art, name] = [alike(make(5, looks)), alike(make(5))];
  assert.ok(art > name + 0.15, `${art} vs ${name}`);
});

test('without the table, or for an item it lacks, look-alikes go by name and the question rolls the same', () => {
  const none = make(9);
  const empty = make(9, readLooks({ looks: {} }));
  const late = make(9);
  for (let i = 0; i < 120; i++) {
    const category = none.categories[i % none.categories.length];
    const q = ask(none, 140, category);
    assert.equal(q.options.filter((o) => o === q.itemId).length, 1);
    assert.deepEqual(ask(empty, 140, category), q);
    if (i === 60) late.setLooks(looks);
    // Once handed the table, the next questions change, but only their picks.
    const r = ask(late, 140, category);
    if (i < 60) assert.deepEqual(r, q);
    else assert.equal(r.options.length, q.options.length);
  }
});

test('the same seed and table ask the same questions; shallower than 50 the table changes nothing', () => {
  const run = (depth: number, table: Looks | null) => {
    const engine = make(21, table);
    let s = fresh(engine);
    s.round = depth;
    const out: Question[] = [];
    for (let i = 0; i < 60; i++) {
      const q = engine.makeQuestion(s, engine.categories[i % engine.categories.length]);
      s = { ...s, question: q, used: [...s.used, q.itemId] };
      out.push(q);
    }
    return out;
  };
  assert.deepEqual(run(140, looks), run(140, looks));
  assert.deepEqual(run(LOOKALIKES_FROM - 1, looks), run(LOOKALIKES_FROM - 1, null));
  assert.notDeepEqual(run(140, looks), run(140, null));
});

test('look-alikes by art keep to the rules of the pool: groups evened out, made-up names, the answer anywhere', () => {
  // A worn pool: few unseen sceptres left, so groups share the question (at 140, ten options: two groups of five or five pairs).
  const engine = make(13, looks);
  const sceptres = items.filter((it) => it.group === 'Sceptres');
  const counts = new Map<number, number>();
  for (let i = 0; i < 200; i++) {
    const s = structuredClone(fresh(engine));
    s.round = 140;
    s.used = sceptres.slice(0, 4).map((it) => it.id);
    const q = engine.makeQuestion(s, 'One-Handed Weapons');
    assert.equal(q.options.filter((o) => o === q.itemId).length, 1);
    const groups = new Map<string, number>();
    for (const o of q.options) {
      // A made-up name counts under the item it copies.
      const g = byId.get(isFake(o) ? o.slice('fake:'.length, o.lastIndexOf(':')) : o)!.group;
      groups.set(g, (groups.get(g) ?? 0) + 1);
    }
    // Every group on screen as often as the others.
    assert.equal(new Set(groups.values()).size, 1, [...groups].join(' '));
    const at = q.options.indexOf(q.itemId);
    counts.set(at, (counts.get(at) ?? 0) + 1);
  }
  assert.equal(counts.size, 10, 'the answer turns up in every place');
});
