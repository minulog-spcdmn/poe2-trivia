import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, createGame, type GameState, type Item } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/uniques.json', import.meta.url), 'utf8'));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function setup(names: string[], target = 3) {
  const engine = new Engine(items, { rng: seeded(42) });
  let s: GameState = createGame('p0', { targetScore: target, timer: 0 });
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
