import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countEvent, countVisit, delveEndEvent, failureEvent, gameKey } from '../src/lib/count.ts';
import { DEFAULT_SETTINGS, createGame, type GameState } from '../src/lib/game.ts';

const seated = (s: GameState, n: number): GameState => ({ ...s, players: Array.from({ length: n }, (_, i) => ({ ...s.players[0], id: `p${i}` })) });
const withEntrants = (s: GameState, n: number): GameState => ({ ...s, delve: { ...(s.delve ?? {}), entrants: Array.from({ length: n }, (_, i) => `p${i}`) } as GameState['delve'] });

test('a game counts under its mode, where it is played and roughly how many play', () => {
  const race = createGame('p0', { ...DEFAULT_SETTINGS, mode: 'race' });
  assert.equal(gameKey(seated(race, 1), false), 'race-online-1p');
  assert.equal(gameKey(seated(race, 2), false), 'race-online-2p');
  assert.equal(gameKey(seated(race, 4), false), 'race-online-3-4p');
  assert.equal(gameKey(seated(race, 5), false), 'race-online-5-8p');
  assert.equal(gameKey(seated(race, 12), false), 'race-online-9-12p');
  assert.equal(gameKey(seated(createGame(null, { ...DEFAULT_SETTINGS, mode: 'turns' }), 3), true), 'turns-hotseat-3-4p');
  // Delve by its entrants, not the seats (someone seated may sit a run out).
  const delve = seated(createGame('p0', { ...DEFAULT_SETTINGS, mode: 'delve' }), 3);
  assert.equal(gameKey(withEntrants(delve, 1), false), 'delve-online-1p');
  assert.equal(gameKey(withEntrants(delve, 2), false), 'delve-online-2p');
});

test('only a room that could not be reached or opened counts as a failure', () => {
  assert.equal(failureEvent('No answer'), 'error/no-answer');
  assert.equal(failureEvent("Couldn't join"), 'error/turned-away');
  for (const title of ['Removed', 'Room closed', 'Moved to another tab', 'Invalid code', undefined]) assert.equal(failureEvent(title), null);
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
