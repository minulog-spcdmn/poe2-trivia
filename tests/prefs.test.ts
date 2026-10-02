import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PREFS,
  PREFS_KEY,
  PREFS_VERSION,
  loadPrefs,
  parsePrefs,
  prefsFrom,
  roomSettings,
  savePrefs,
  serializePrefs,
  type RoomPrefs,
} from '../src/lib/prefs.ts';
import type { Difficulty, Settings } from '../src/lib/game.ts';

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

test('first-time visitors get a hidden room code', () => {
  assert.equal(loadPrefs().hideCode, true);
  store.clear();
  const ls = globalThis.localStorage as { getItem: (k: string) => string | null };
  const getItem = ls.getItem;
  ls.getItem = () => {
    throw new Error('SecurityError');
  };
  try {
    assert.equal(loadPrefs().hideCode, true);
  } finally {
    ls.getItem = getItem;
  }
});

test('keeps a room code hidden under the old setting', () => {
  store.set('poe2trivia.hideCode', '1');
  assert.equal(loadPrefs().hideCode, true);
  assert.equal(store.has('poe2trivia.hideCode'), false);
  assert.equal(parsePrefs(store.get(PREFS_KEY) ?? null)?.hideCode, true);
});

test("keeps the old hidden-code setting when the new entry can't be written", () => {
  store.set('poe2trivia.hideCode', '1');
  const ls = globalThis.localStorage as { setItem: (k: string, v: string) => void };
  const setItem = ls.setItem;
  ls.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  try {
    assert.equal(loadPrefs().hideCode, true);
  } finally {
    ls.setItem = setItem;
  }
  assert.equal(store.get('poe2trivia.hideCode'), '1');
  assert.equal(store.has(PREFS_KEY), false);
});

test('settings from a room saved by an older build are made valid before saving', () => {
  const old = { targetScore: 7.6, timer: 999 } as unknown as Settings;
  const p = prefsFrom(old);
  assert.deepEqual(p, { targetScore: 8, timer: 120, difficulty: 'merciless', mode: 'turns', public: false });
  store.set(PREFS_KEY, serializePrefs(custom));
  savePrefs(p);
  assert.deepEqual(parsePrefs(store.get(PREFS_KEY) ?? null), { ...custom, ...p });
});

test('never stores an entry that would be thrown away on the next load', () => {
  savePrefs({ targetScore: 3, hideCode: true });
  const before = store.get(PREFS_KEY);
  savePrefs({ difficulty: undefined as unknown as Difficulty });
  assert.equal(store.get(PREFS_KEY), before);
  assert.equal(parsePrefs(store.get(PREFS_KEY) ?? null)?.hideCode, true);
});

test("saving keeps what another tab saved for the other fields", () => {
  store.set(PREFS_KEY, serializePrefs({ ...custom, hideCode: false }));
  savePrefs({ targetScore: 20 });
  // Another tab turns streamer mode on.
  store.set(PREFS_KEY, serializePrefs({ ...custom, targetScore: 20, hideCode: true }));
  savePrefs({ targetScore: 25 });
  assert.deepEqual(parsePrefs(store.get(PREFS_KEY) ?? null), { ...custom, targetScore: 25, hideCode: true });
});

test('a new room starts unlocked with the saved settings', () => {
  const s = roomSettings(custom);
  assert.deepEqual(s, { targetScore: 15, timer: 45, difficulty: 'eternal', mode: 'turns', public: true, locked: false, hideCode: true });
  assert.equal(roomSettings({ ...custom, hideCode: false }).hideCode, false);
});
