import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, createGame, DIFFICULTIES, nameSimilarity, type Difficulty, type GameState, type Item } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function setup(names: string[], target = 3, difficulty: Difficulty = 'cruel') {
  const engine = new Engine(items, { rng: seeded(42) });
  let s: GameState = createGame('p0', { targetScore: target, timer: 0, difficulty });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  return { engine, s };
}

test('offers three categories and locks out picks for two turns', () => {
  const { engine } = setup(['A']);
  let { s } = setup(['A']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const history: string[] = [];
  for (let turn = 0; turn < 30; turn++) {
    assert.equal(s.phase, 'choosing');
    assert.equal(s.offered.length, 3);
    assert.equal(new Set(s.offered).size, 3);
    for (const recent of history.slice(-2)) assert.ok(!s.offered.includes(recent), `offered ${recent} too soon`);
    const cat = s.offered[0];
    history.push(cat);
    s = engine.apply(s, { type: 'pick', category: cat }, 'p0');
    const q = s.question!;
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.options.includes(q.itemId));
    assert.equal(engine.byId.get(q.itemId)!.category, cat);
    s = engine.apply(s, { type: 'answer', optionId: q.options.find((o) => o !== q.itemId)! }, 'p0');
    assert.equal(s.reveal!.correct, false);
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
  assert.equal(new Set(s.used).size, s.used.length, 'no repeated items');
});

test('only the active player may act and scores are counted', () => {
  let { engine, s } = setup(['A', 'B']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const active = s.players[s.turn].id;
  const other = s.players.find((p) => p.id !== active)!.id;
  assert.throws(() => engine.apply(s, { type: 'pick', category: s.offered[0] }, other));
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, active);
  s = engine.apply(s, { type: 'answer', optionId: s.question!.itemId }, active);
  assert.equal(s.players.find((p) => p.id === active)!.score, 1);
  assert.throws(() => engine.apply(s, { type: 'start' }, other));
});

test('game ends at the end of the round once the target is reached by a single leader', () => {
  let { engine, s } = setup(['A', 'B'], 2);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const winner = s.players[0].id;
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 50) {
    const me = s.players[s.turn].id;
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, me);
    const q = s.question!;
    const pick = me === winner ? q.itemId : q.options.find((o) => o !== q.itemId)!;
    s = engine.apply(s, { type: 'answer', optionId: pick }, me);
    s = engine.apply(s, { type: 'next' }, me);
  }
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [winner]);
  assert.equal(s.round, 2, 'both players had equal turns');
});

test('disconnected players are skipped', () => {
  let { engine, s } = setup(['A', 'B', 'C']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const second = s.players[1].id;
  s = engine.apply(s, { type: 'connection', playerId: second, connected: false }, null);
  const first = s.players[0].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, first);
  s = engine.apply(s, { type: 'answer', optionId: null }, first);
  assert.equal(s.reveal!.timedOut, true);
  s = engine.apply(s, { type: 'next' }, first);
  assert.equal(s.turn, 2);
});

test('difficulties scale options, decoy kind and question types', () => {
  for (const difficulty of ['cruel', 'merciless', 'eternal'] as Difficulty[]) {
    const rules = DIFFICULTIES[difficulty];
    let { engine, s } = setup(['A'], 3, difficulty);
    s = engine.apply(s, { type: 'start' }, 'p0');
    const modes = new Set<string>();
    for (let turn = 0; turn < 40; turn++) {
      s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
      const q = s.question!;
      modes.add(q.mode);
      assert.equal(q.options.length, rules.options);
      assert.equal(new Set(q.options).size, rules.options);
      const answer = engine.byId.get(q.itemId)!;
      for (const id of q.options) assert.equal(engine.byId.get(id)!.category, answer.category, 'decoys share the category');
      const groupSize = engine.items.filter((it) => it.group === answer.group).length;
      if (rules.groupFirst && groupSize >= rules.options) {
        for (const id of q.options) assert.equal(engine.byId.get(id)!.group, answer.group, 'decoys share the group');
      }
      assert.equal(!!q.veil, !!rules.veil && q.mode === 'name');
      s = engine.apply(s, { type: 'answer', optionId: q.itemId }, 'p0');
      s = engine.apply(s, { type: 'next' }, 'p0');
      if (s.phase === 'over') s = engine.apply(engine.apply(s, { type: 'restart' }, 'p0'), { type: 'start' }, 'p0');
    }
    assert.ok(modes.has('art') && modes.has('name'));
  }
});

test('similar-looking names rank above unrelated ones', () => {
  assert.ok(nameSimilarity("Berek's Grip", "Berek's Pass") > nameSimilarity("Berek's Grip", 'Quill Rain'));
  assert.ok(
    nameSimilarity('Whisper of the Brotherhood', 'Call of the Brotherhood') >
      nameSimilarity('Whisper of the Brotherhood', 'Blackheart'),
  );
});

test('lineage gems are a category', () => {
  const engine = new Engine(items);
  assert.ok(engine.categories.includes('Lineage Gems'));
  assert.ok(engine.byCategory.get('Lineage Gems')!.length >= 20);
});

test('race mode: first correct answer scores, wrong answers cost a point and lock out', () => {
  let { engine, s } = setup(['A', 'B', 'C'], 2);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.equal(s.phase, 'question');
  let q = s.question!;
  assert.ok(q.deadline, 'race always has a timer');
  const wrong = q.options.find((o) => o !== q.itemId)!;

  s = engine.apply(s, { type: 'answer', optionId: wrong, askedAt: q.askedAt }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')!.score, -1);
  assert.equal(s.phase, 'question');
  assert.throws(() => engine.apply(s, { type: 'answer', optionId: q.itemId }, 'p1'), /already answered/);

  s = engine.apply(s, { type: 'answer', optionId: q.itemId, askedAt: q.askedAt }, 'p2');
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal!.winnerId, 'p2');
  assert.equal(s.players.find((p) => p.id === 'p2')!.score, 1);
  // A slower correct answer arriving after the reveal is ignored.
  assert.throws(() => engine.apply(s, { type: 'answer', optionId: q.itemId, askedAt: q.askedAt }, 'p0'), (e: any) => e.silent);

  s = engine.apply(s, { type: 'next' }, 'p0');
  q = s.question!;
  // Everyone wrong: question ends with no winner.
  for (const id of ['p0', 'p1', 'p2']) s = engine.apply(s, { type: 'answer', optionId: q.options.find((o) => o !== q.itemId)! }, id);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal!.winnerId, null);

  // A stale answer for an old question is ignored.
  s = engine.apply(s, { type: 'next' }, 'p0');
  assert.throws(() => engine.apply(s, { type: 'answer', optionId: s.question!.itemId, askedAt: q.askedAt }, 'p0'), (e: any) => e.silent);

  // Reaching the target ends the game right after the reveal.
  assert.equal(s.players.find((p) => p.id === 'p2')!.score, 0, 'everyone lost a point');
  s = engine.apply(s, { type: 'answer', optionId: s.question!.itemId }, 'p2');
  s = engine.apply(s, { type: 'next' }, 'p0');
  assert.equal(s.phase, 'question');
  s = engine.apply(s, { type: 'answer', optionId: s.question!.itemId }, 'p2');
  assert.equal(s.players.find((p) => p.id === 'p2')!.score, 2);
  s = engine.apply(s, { type: 'next' }, 'p0');
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, ['p2']);
});
