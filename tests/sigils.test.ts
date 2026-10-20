import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, ACHIEVEMENTS_KEY, emptyStore, serializeStore } from '../src/lib/achievements.ts';
import { CLASSES } from '../src/lib/classSigils.ts';
import {
  SIGILS_KEY,
  SIGILS_VERSION,
  achievementsIn,
  emptySigils,
  loadSigils,
  parseSigils,
  serializeSigils,
  sigilsToUnlock,
  unlock,
  unlockSigil,
  wear,
  wearSigil,
} from '../src/lib/sigils.ts';
import { memoryStorage } from './helpers.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);
beforeEach(() => store.clear());

/** Stores `n` of the achievements as earned. */
function earned(n: number) {
  const s = emptyStore();
  for (const a of ACHIEVEMENTS.slice(0, n)) s.earned[a.id] = 1;
  store.set(ACHIEVEMENTS_KEY, serializeStore(s));
}

test('each achievement unlocks one sigil, up to every class', () => {
  const none = emptySigils();
  assert.equal(sigilsToUnlock(none, 0), 0);
  assert.equal(sigilsToUnlock(none, 1), 1);
  assert.equal(sigilsToUnlock(none, ACHIEVEMENTS.length), CLASSES.length);
  assert.equal(sigilsToUnlock({ unlocked: ['witch', 'monk'], worn: null }, 1), 0);
  assert.ok(ACHIEVEMENTS.length >= CLASSES.length, 'every class can be unlocked');
});

test('unlocking wears it; one unlocked already, or none left, changes nothing', () => {
  const one = unlock(emptySigils(), 'mercenary', 1);
  assert.deepEqual(one, { unlocked: ['mercenary'], worn: 'mercenary' });
  assert.equal(unlock(one, 'monk', 1), one);
  assert.equal(unlock(one, 'mercenary', 5), one);
  assert.deepEqual(unlock(one, 'assassin', 2), { unlocked: ['mercenary', 'assassin'], worn: 'assassin' });
});

test('only an unlocked sigil can be worn, and none can', () => {
  const s = { unlocked: ['witch' as const], worn: null };
  assert.equal(wear(s, 'templar'), s);
  assert.equal(wear(s, 'witch').worn, 'witch');
  assert.equal(wear(wear(s, 'witch'), null).worn, null);
});

test('counts only achievements this build knows', () => {
  const s = emptyStore();
  s.earned[ACHIEVEMENTS[0].id] = 1;
  s.earned['from-a-newer-build'] = 1;
  assert.equal(achievementsIn(s), 1);
});

test('round-trips, and cleans up what it reads', () => {
  const s = { unlocked: ['druid' as const, 'witch' as const], worn: 'witch' as const };
  assert.deepEqual(parseSigils(serializeSigils(s)), s);
  assert.deepEqual(parseSigils(JSON.stringify({ v: SIGILS_VERSION, unlocked: ['druid', 'duelist', 'druid', 3], worn: 'monk' })), { unlocked: ['druid'], worn: null });
  assert.equal(parseSigils(JSON.stringify({ v: SIGILS_VERSION + 1, unlocked: [], worn: null })), null);
  assert.equal(parseSigils('nope'), null);
});

test('unlocks and wears in storage, with the achievements stored', () => {
  assert.deepEqual(unlockSigil('ranger'), emptySigils());
  earned(2);
  unlockSigil('ranger');
  unlockSigil('gladiator');
  unlockSigil('witch');
  assert.deepEqual(loadSigils(), { unlocked: ['ranger', 'gladiator'], worn: 'gladiator' });
  wearSigil('ranger');
  assert.equal(loadSigils().worn, 'ranger');
  wearSigil('witch');
  assert.equal(loadSigils().worn, 'ranger');
});

test('kept when the achievements are erased; unlocks more once there are more again', () => {
  earned(2);
  unlockSigil('ranger');
  unlockSigil('monk');
  earned(0);
  assert.equal(loadSigils().unlocked.length, 2);
  earned(2);
  unlockSigil('witch');
  assert.equal(loadSigils().unlocked.length, 2);
  earned(3);
  unlockSigil('witch');
  assert.deepEqual(loadSigils().unlocked, ['ranger', 'monk', 'witch']);
});

test("never writes over a newer build's", () => {
  earned(3);
  const newer = JSON.stringify({ v: SIGILS_VERSION + 1, unlocked: ['monk'], worn: 'monk', more: true });
  store.set(SIGILS_KEY, newer);
  assert.equal(unlockSigil('witch'), null);
  assert.equal(store.get(SIGILS_KEY), newer);
});
