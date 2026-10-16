import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countEvent, countVisit, delveEndEvent, playEvent } from '../src/lib/count.ts';
import { DEFAULT_SETTINGS, createGame, type GameState } from '../src/lib/game.ts';

const withEntrants = (s: GameState, n: number): GameState => ({ ...s, delve: { ...(s.delve ?? {}), entrants: Array.from({ length: n }, (_, i) => `p${i}`) } as GameState['delve'] });

test('a game counts under its mode, Delve alone or together, and where it is played', () => {
  assert.equal(playEvent(createGame('p0', { ...DEFAULT_SETTINGS, mode: 'race' }), false), 'play/race-online');
  assert.equal(playEvent(createGame(null, { ...DEFAULT_SETTINGS, mode: 'turns' }), true), 'play/turns-hotseat');
  const delve = createGame('p0', { ...DEFAULT_SETTINGS, mode: 'delve' });
  assert.equal(playEvent(withEntrants(delve, 1), false), 'play/delve-alone-online');
  assert.equal(playEvent(withEntrants(delve, 3), false), 'play/delve-together-online');
});

test('a Delve run counts by the ten depths it ended in, as players see them', () => {
  assert.equal(delveEndEvent(0), 'delve/depth-0-9');
  assert.equal(delveEndEvent(9), 'delve/depth-0-9');
  assert.equal(delveEndEvent(10), 'delve/depth-10-19');
  assert.equal(delveEndEvent(57), 'delve/depth-50-59');
  assert.equal(delveEndEvent(-1), 'delve/depth-0-9');
});

test('nothing is sent away from the live page at poe2.quest', () => {
  // (No location here, as in the tests of every other page: counting is off, and says nothing.)
  assert.doesNotThrow(() => {
    countVisit();
    countEvent('play/race-online');
  });
});
