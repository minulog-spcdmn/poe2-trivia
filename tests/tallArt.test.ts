import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, TALL_ART_GROUPS, createGame, publicView, type GameState, type Item, type Question } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const byId = new Map(items.map((it) => [it.id, it]));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** Plays `turns` turns alone, picking whichever offered category `pick` likes, and returns every question asked. */
function questions(turns: number, pick: (offered: string[]) => string) {
  const engine = new Engine(items, { rng: seeded(7) });
  let s: GameState = createGame('p0', { targetScore: 999, timer: 0, difficulty: 'cruel' });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  const asked: Question[] = [];
  for (let i = 0; i < turns; i++) {
    s = engine.apply(s, { type: 'pick', category: pick(s.offered) }, 'p0');
    asked.push(s.question!);
    s = engine.apply(s, { type: 'answer', index: 0 }, 'p0');
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
  return { asked, s };
}

const weapons = (offered: string[]) => offered.find((c) => /Two-Handed|Flasks/.test(c)) ?? offered[0];

test('an art question is tall exactly when every picture is of a tall group', () => {
  const { asked } = questions(300, weapons);
  const art = asked.filter((q) => q.mode === 'art');
  assert.ok(art.some((q) => q.tall), 'some art question was tall');
  assert.ok(art.some((q) => !q.tall), 'some art question was not');
  for (const q of art) {
    const allTall = q.options.every((id) => TALL_ART_GROUPS.has(byId.get(id)!.group));
    assert.equal(!!q.tall, allTall, `${q.options.map((id) => byId.get(id)!.group).join(', ')}`);
  }
});

test('a name question is never tall', () => {
  const { asked } = questions(300, weapons);
  for (const q of asked.filter((q) => q.mode === 'name')) assert.equal(q.tall, undefined);
});

test("Delve's copy before the clock runs keeps tall (the pictures' layout), not the groups", () => {
  const { asked, s } = questions(300, weapons);
  const q = asked.find((x) => x.mode === 'art' && x.tall)!;
  const waiting = { ...s, phase: 'question', delve: s.delve ?? ({} as GameState['delve']), question: { ...q, deadline: null } } as GameState;
  const seen = publicView(waiting).question!;
  assert.equal(seen.tall, true);
  assert.deepEqual(seen.groups, []);
  assert.deepEqual(seen.options, []);
});
