// The name a join from the start page is made under (lib/joinName.ts, as the
// session holds it): saved only once the room takes it. One turned down
// (someone there is already called that) used to be saved on the way in, and
// the next visit greeted the player by it with its field put away.
import './asVite.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);
const { JoinName } = await import('../src/lib/joinName.ts');
const { NAME_STORED } = await import('../src/lib/names.ts');
const { onStoredHere, readStored, writeStored } = await import('../src/lib/storage.ts');

/** The names written here, as the sync hears them (lib/sync/chosen.ts sends them to the player's other devices). */
const heard: string[] = [];
onStoredHere((name) => heard.push(name));
beforeEach(() => {
  store.clear();
  heard.length = 0;
});

test('a name the room turns down is never saved, nor sent to the other devices', () => {
  const join = new JoinName();
  join.start('Pixel');
  join.dropped();
  assert.equal(readStored(NAME_STORED), null, 'a first visit still has no name');
  assert.deepEqual(heard, []);
  // Nor by a state that came too late to count: the join is over.
  join.taken();
  assert.equal(readStored(NAME_STORED), null);
});

test("turned down, the player's own earlier name stays theirs", () => {
  writeStored(NAME_STORED, 'Alva');
  heard.length = 0;
  const join = new JoinName();
  join.start('Pixel');
  join.dropped();
  assert.equal(readStored(NAME_STORED), 'Alva');
  assert.deepEqual(heard, []);
});

test('a name the room takes is saved once it is in', () => {
  writeStored(NAME_STORED, 'Alva');
  heard.length = 0;
  const join = new JoinName();
  join.start('Pixel');
  assert.equal(readStored(NAME_STORED), 'Alva', 'not while the room is still asked');
  join.taken();
  assert.equal(readStored(NAME_STORED), 'Pixel');
  assert.deepEqual(heard, [NAME_STORED], 'and the other devices hear of it');
  // Once: a later join turned down leaves it so.
  join.start('Doryani');
  join.dropped();
  assert.equal(readStored(NAME_STORED), 'Pixel');
});

test('a reload getting back in saves nothing: its name is saved already', () => {
  writeStored(NAME_STORED, 'Alva');
  heard.length = 0;
  const join = new JoinName();
  join.start(null);
  join.taken();
  assert.equal(readStored(NAME_STORED), 'Alva');
  assert.deepEqual(heard, []);
});
