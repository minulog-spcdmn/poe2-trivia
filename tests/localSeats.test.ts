// Players at the host's screen (src/lib/game.ts Player.local): the host adds them in a Turns
// lobby, they play their turns there, and the other modes set them aside without losing them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PLAYERS, createGame } from '../src/lib/game.ts';
import { versusGame } from '../src/lib/versus.ts';
import { lobby, loudly, playTurn } from './helpers.ts';

/** Guests' names unlike each other (the name check turns down look-alikes). */
const GUESTS = ['Doryani', 'Una', 'Rog', 'Alva', 'Dannig', 'Zelina', 'Oswin', 'Finn', 'Asala', 'Renly', 'Kalguur'];

const addHere = (id: string, name: string) => ({ type: 'join' as const, playerId: id, name, local: true as const });

test('the host adds a player at its screen, who plays their own turns there', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  s = engine.apply(s, addHere('here', 'Cora'), 'p0');
  const cora = s.players.find((p) => p.id === 'here')!;
  assert.equal(cora.local, true);
  assert.equal(cora.connected, true);
  assert.notEqual(cora.hue, s.players.find((p) => p.id === 'p0')!.hue);
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.equal(s.players.length, 3);
  // Played round the table, Cora's turns come and go like anyone's.
  for (let i = 0; i < 3; i++) s = playTurn(engine, s, () => false);
  assert.equal(s.round, 2);
});

test('only the host adds players at its screen, between games, in Turns', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  // A guest can't seat someone on the host's screen, nor under their own id.
  loudly(() => engine.apply(s, addHere('x', 'Cora'), 'p1'), /Not allowed/);
  loudly(() => engine.apply(s, addHere('p1', 'Cora'), 'p0'), /Not allowed/);
  // Nor on one device, where everyone already is.
  loudly(() => engine.apply(createGame(null), addHere('x', 'Cora'), null), /Not allowed/);
  // A name already in the room is turned down as any join's is.
  loudly(() => engine.apply(s, addHere('x', 'bram'), 'p0'));
  const race = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  loudly(() => engine.apply(race, addHere('x', 'Cora'), 'p0'), /Turns/);
  const running = engine.apply(s, { type: 'start' }, 'p0');
  loudly(() => engine.apply(running, addHere('x', 'Cora'), 'p0'), /between games/);
});

test('Race and Delve set them aside, and Turns brings them back', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  s = engine.apply(s, addHere('here', 'Cora'), 'p0');
  const hue = s.players.find((p) => p.id === 'here')!.hue;
  for (const mode of ['race', 'delve'] as const) {
    s = engine.apply(s, { type: 'settings', settings: { mode } }, 'p0');
    assert.deepEqual(s.players.map((p) => p.id), ['p0', 'p1'], mode);
    assert.deepEqual(s.aside?.map((p) => p.id), ['here']);
  }
  // Their name stays theirs while they're aside.
  loudly(() => engine.apply(s, { type: 'join', playerId: 'new', name: 'Cora' }, 'new'));
  s = engine.apply(s, { type: 'settings', settings: { mode: 'turns' } }, 'p0');
  assert.deepEqual(s.players.map((p) => p.id), ['p0', 'p1', 'here']);
  assert.equal(s.players[2].hue, hue);
  assert.equal(s.aside, undefined);
});

test('a race played without them leaves them aside for the next game of Turns', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  s = engine.apply(s, addHere('here', 'Cora'), 'p0');
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.ok(!s.players.some((p) => p.id === 'here'));
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.deepEqual(s.aside?.map((p) => p.id), ['here']);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'turns' } }, 'p0');
  assert.ok(s.players.some((p) => p.id === 'here' && p.local));
  // Removed by the host, they're gone from wherever they were.
  s = engine.apply(s, { type: 'settings', settings: { mode: 'delve' } }, 'p0');
  s = engine.apply(s, { type: 'remove', playerId: 'here' }, 'p0');
  assert.equal(s.aside, undefined);
});

test('back in Turns, they take the seats left, and wait aside for one in a full room', () => {
  let { engine, s } = lobby(['Ash']);
  s = engine.apply(s, addHere('h1', 'Cora'), 'p0');
  s = engine.apply(s, addHere('h2', 'Dara'), 'p0');
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  for (let i = 1; i < MAX_PLAYERS - 1; i++) s = engine.apply(s, { type: 'join', playerId: `g${i}`, name: `Guest ${'ABCDEFGHIJKL'[i]}` }, `g${i}`);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'turns' } }, 'p0');
  assert.equal(s.players.length, MAX_PLAYERS);
  assert.ok(s.players.some((p) => p.id === 'h1'));
  assert.deepEqual(s.aside?.map((p) => p.id), ['h2']);
});

test('a seat freed in a full Turns lobby goes to one waiting aside', () => {
  let { engine, s } = lobby(['Ash']);
  s = engine.apply(s, addHere('h1', 'Cora'), 'p0');
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  for (let i = 1; i < MAX_PLAYERS; i++) s = engine.apply(s, { type: 'join', playerId: `g${i}`, name: GUESTS[i - 1] }, `g${i}`);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'turns' } }, 'p0');
  assert.deepEqual(s.aside?.map((p) => p.id), ['h1']);
  s = engine.apply(s, { type: 'remove', playerId: 'g1' }, 'g1');
  assert.ok(s.players.some((p) => p.id === 'h1'));
  assert.equal(s.aside, undefined);
});

test('a game against players at your own screen only is no game against others', () => {
  let { engine, s } = lobby(['Ash']);
  s = engine.apply(s, addHere('here', 'Cora'), 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.equal(versusGame(s, 'p0', false), false);
  let t = lobby(['Ash', 'Bram']);
  t.s = t.engine.apply(t.s, addHere('here', 'Cora'), 'p0');
  t.s = t.engine.apply(t.s, { type: 'start' }, 'p0');
  assert.equal(versusGame(t.s, 'p0', false), true);
});
