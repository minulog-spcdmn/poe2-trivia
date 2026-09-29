import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, PREFS_KEY, PREFS_VERSION, loadPrefs, parsePrefs, roomSettings, serializePrefs, type RoomPrefs } from '../src/lib/prefs.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
beforeEach(() => store.clear());

const custom: RoomPrefs = { targetScore: 15, timer: 45, difficulty: 'eternal', mode: 'turns', public: true, hideCode: true };

test('round-trips saved settings', () => {
  assert.deepEqual(parsePrefs(serializePrefs(custom)), custom);
  store.set(PREFS_KEY, serializePrefs(custom));
  assert.deepEqual(loadPrefs(), custom);
});

test('rejects malformed or outdated entries', () => {
  const base = { v: PREFS_VERSION, ...custom };
  for (const bad of [
    null,
    '',
    'not json',
    '[]',
    'null',
    '42',
    JSON.stringify({ ...base, v: PREFS_VERSION - 1 }),
    JSON.stringify({ ...custom }),
    JSON.stringify({ ...base, targetScore: 0 }),
    JSON.stringify({ ...base, targetScore: 2.5 }),
    JSON.stringify({ ...base, timer: 500 }),
    JSON.stringify({ ...base, timer: '20' }),
    JSON.stringify({ ...base, difficulty: 'toString' }),
    JSON.stringify({ ...base, mode: 'chaos' }),
    JSON.stringify({ ...base, public: 'yes' }),
    JSON.stringify({ ...base, hideCode: undefined }),
  ])
    assert.equal(parsePrefs(bad), null, String(bad));
});

test('missing or bad entries fall back to the defaults and are rewritten', () => {
  assert.deepEqual(loadPrefs(), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs(store.get(PREFS_KEY) ?? null), DEFAULT_PREFS);

  store.set(PREFS_KEY, JSON.stringify({ v: 0, targetScore: 99 }));
  assert.deepEqual(loadPrefs(), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs(store.get(PREFS_KEY) ?? null), DEFAULT_PREFS);
});

test('keeps a room code hidden under the old setting', () => {
  store.set('poe2trivia.hideCode', '1');
  assert.equal(loadPrefs().hideCode, true);
  assert.equal(store.has('poe2trivia.hideCode'), false);
  assert.equal(parsePrefs(store.get(PREFS_KEY) ?? null)?.hideCode, true);
});

test('a new room starts unlocked with the saved settings', () => {
  const s = roomSettings(custom);
  assert.deepEqual(s, { targetScore: 15, timer: 45, difficulty: 'eternal', mode: 'turns', public: true, locked: false });
});
