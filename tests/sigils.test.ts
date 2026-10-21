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
  achievementsForSigil,
  achievementsToNext,
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

test('the first achievement unlocks a sigil, then every third another, up to every class', () => {
  const none = emptySigils();
  assert.deepEqual([0, 1, 2, 3, 4, 6, 7, 10].map((n) => sigilsToUnlock(none, n)), [0, 1, 1, 1, 2, 2, 3, 4]);
  assert.equal(sigilsToUnlock(none, ACHIEVEMENTS.length), CLASSES.length);
  assert.equal(sigilsToUnlock({ unlocked: ['witch', 'monk'], worn: null }, 4), 0);
  assert.equal(sigilsToUnlock({ unlocked: ['witch', 'monk'], worn: null }, 7), 1);
  assert.ok(ACHIEVEMENTS.length >= achievementsForSigil(CLASSES.length), 'every class can be unlocked');
});

test('how many more achievements the next sigil takes', () => {
  const none = emptySigils();
  assert.equal(achievementsToNext(none, 0), 1);
  assert.equal(achievementsToNext(none, 1), 0, 'one to unlock now');
  const one = { unlocked: ['witch' as const], worn: null };
  assert.equal(achievementsToNext(one, 1), 3);
  assert.equal(achievementsToNext(one, 3), 1);
  // After the codex is erased: the next is the one past those unlocked.
  assert.equal(achievementsToNext({ unlocked: ['witch', 'monk', 'ranger'], worn: null }, 0), achievementsForSigil(4));
  assert.equal(achievementsToNext({ unlocked: [...CLASSES], worn: null }, 0), null);
});

test('unlocking wears it; one unlocked already, or none left, changes nothing', () => {
  const one = unlock(emptySigils(), 'mercenary', 1);
  assert.deepEqual(one, { unlocked: ['mercenary'], worn: 'mercenary' });
  assert.equal(unlock(one, 'monk', 1), one);
  assert.equal(unlock(one, 'mercenary', 5), one);
  assert.deepEqual(unlock(one, 'assassin', 4), { unlocked: ['mercenary', 'assassin'], worn: 'assassin' });
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
  earned(4);
  unlockSigil('ranger');
  unlockSigil('gladiator');
  unlockSigil('witch');
  const { wornAt, ...stored } = loadSigils();
  assert.deepEqual(stored, { unlocked: ['ranger', 'gladiator'], worn: 'gladiator' });
  // When it was put on, for the player's other devices to wear the latest (lib/sync).
  assert.ok(typeof wornAt === 'number' && wornAt > 0);
  wearSigil('ranger');
  assert.equal(loadSigils().worn, 'ranger');
  wearSigil('witch');
  assert.equal(loadSigils().worn, 'ranger');
});

test('kept when the achievements are erased; unlocks more once there are more again', () => {
  earned(4);
  unlockSigil('ranger');
  unlockSigil('monk');
  earned(0);
  assert.equal(loadSigils().unlocked.length, 2);
  earned(4);
  unlockSigil('witch');
  assert.equal(loadSigils().unlocked.length, 2);
  earned(7);
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

test("a guest's hello carries the sigil it wears; one this build doesn't know is left out", async () => {
  const { parseClientMsg } = await import('../src/lib/protocol.ts');
  const hello = { t: 'hello', secret: 'a'.repeat(24), name: 'Wren', v: 1 };
  assert.equal((parseClientMsg({ ...hello, sigil: 'witch' }) as { sigil?: string }).sigil, 'witch');
  const unknown = parseClientMsg({ ...hello, sigil: 'duelist' });
  assert.ok(unknown && !('sigil' in unknown));
});

test("a guest's sigil action is only ever its own, and one this build doesn't know is none", async () => {
  const { parseClientMsg } = await import('../src/lib/protocol.ts');
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'sigil', sigil: 'monk', playerId: 'someone' } }), { t: 'action', action: { type: 'sigil', sigil: 'monk' } });
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'sigil', sigil: 'duelist' } }), { t: 'action', action: { type: 'sigil' } });
});

test("the colour a guest asks for is only ever its own, and ruby or one out of range is none", async () => {
  const { parseClientMsg } = await import('../src/lib/protocol.ts');
  const hello = { t: 'hello', secret: 'a'.repeat(24), name: 'Wren', v: 1 };
  assert.equal((parseClientMsg({ ...hello, colour: 3 }) as { colour?: number }).colour, 3);
  for (const colour of [11, -1, 2.5, '3']) {
    const m = parseClientMsg({ ...hello, colour });
    assert.ok(m && !('colour' in m), String(colour));
  }
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'colour', colour: 4, playerId: 'someone' } }), { t: 'action', action: { type: 'colour', colour: 4 } });
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'colour', colour: 11 } }), { t: 'action', action: { type: 'colour' } });
});
