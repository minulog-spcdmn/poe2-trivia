import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { delveRules, findRules } from '../src/lib/delve.ts';
import { Engine, PRESETS, TWINS, createGame, isFake, type Difficulty, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import { readLooks } from '../src/lib/looks.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));
const looks = readLooks(JSON.parse(readFileSync(new URL('../src/data/looks.json', import.meta.url), 'utf8')));
const byName = new Map(items.map((it) => [it.name, it]));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** The real items behind a question's options (a made-up name counts as none). */
const real = (q: Question) => q.options.filter((id) => !isFake(id));

/** The twin sets with more than one of their members on screen. */
const met = (q: Question) => TWINS.filter((t) => t.names.filter((n) => real(q).includes(byName.get(n)!.id)).length > 1);

/** Ring questions played one after another, each answer used up, as in a game. */
function ringQuestions(settings: Partial<Settings>, seed: number, n = 1500): Question[] {
  const engine = new Engine(items, { rng: seeded(seed), fakes });
  const s = createGame(null, { targetScore: 5, timer: 0, mode: 'turns', public: false, locked: false, ...settings });
  return Array.from({ length: n }, () => {
    const q = engine.makeQuestion(s, 'Rings');
    s.used.push(q.itemId);
    return q;
  });
}

test('every twin is a real item, each set from one group', () => {
  for (const { names } of TWINS) {
    const set = names.map((n) => byName.get(n));
    assert.ok(set.every(Boolean), `${names} are items`);
    assert.equal(new Set(set.map((it) => it!.group)).size, 1, `${names} share a group`);
  }
});

for (const difficulty of ['cruel', 'merciless'] as Difficulty[]) {
  test(`on ${difficulty}, twins never meet, yet each comes up as the answer and as a wrong option`, () => {
    const qs = ringQuestions({ difficulty }, 3);
    for (const q of qs) assert.deepEqual(met(q), [], `${met(q).map((t) => t.names)} met`);
    for (const { names } of TWINS) {
      for (const name of names) {
        const id = byName.get(name)!.id;
        assert.ok(qs.some((q) => q.itemId === id), `${name} is asked`);
        // Shown beside someone else's answer, so seeing one says nothing.
        assert.ok(qs.some((q) => q.itemId !== id && real(q).includes(id)), `${name} is a wrong option`);
      }
    }
  });
}

test('custom keeps twins apart until every wrong answer is a look-alike', () => {
  const half = ringQuestions({ difficulty: 'custom', custom: { ...PRESETS.eternal, similarNames: 0.5 } }, 4);
  assert.ok(half.every((q) => !met(q).length), 'half look-alikes: apart');
  const all = ringQuestions({ difficulty: 'custom', custom: { ...PRESETS.merciless, similarNames: 1 } }, 4);
  assert.ok(all.some((q) => met(q).length), 'all look-alikes: they meet');
});

test('on Eternal, every set of twins meets', () => {
  const qs = ringQuestions({ difficulty: 'eternal' }, 5);
  for (const { names } of TWINS) {
    assert.ok(qs.some((q) => met(q).some((t) => t.names === names)), `${names} meet`);
  }
});

test('in Delve, twins meet from their depth on (a find from its deeper one)', () => {
  const engine = new Engine(items, { rng: seeded(6), fakes, looks });
  let base = createGame(null, { targetScore: 10, timer: 0, difficulty: 'eternal', mode: 'delve', public: false, locked: false });
  base = engine.apply(base, { type: 'join', playerId: 'p0', name: 'Ash' }, null);
  base = engine.apply(base, { type: 'start' }, null);
  /** Which sets met at `depth`, over a fresh pool each question. */
  const meetsAt = (depth: number, find?: 'flare') => {
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const s: GameState = structuredClone(base);
      s.round = depth;
      for (const t of met(engine.makeQuestion(s, 'Rings', find ? { find } : {}))) seen.add(t.names[0]);
    }
    return seen;
  };
  for (const { names, depth } of TWINS) {
    assert.ok(!meetsAt(depth - 1).has(names[0]), `${names} apart above ${depth}`);
    assert.ok(meetsAt(depth).has(names[0]), `${names} meet at ${depth}`);
  }
  assert.equal(delveRules(30).twins, 30);
  assert.ok(findRules('flare', 30).twins! > 30, 'a find plays a deeper depth');
});
