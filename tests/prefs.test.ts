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
import { PRESETS, type Difficulty, type Settings } from '../src/lib/game.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
beforeEach(() => store.clear());

const knobs = { ...PRESETS.cruel, options: 10, veil: 'slowest' as const, grayscale: 'all' as const, lockout: 0 };
const custom: RoomPrefs = { targetScore: 15, timer: 32, difficulty: 'eternal', custom: knobs, mode: 'turns', public: true, hideCode: true };

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
  assert.deepEqual(p, { targetScore: 8, timer: 64, difficulty: 'merciless', mode: 'turns', public: false });
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
  assert.deepEqual(s, { targetScore: 15, timer: 32, difficulty: 'eternal', custom: knobs, mode: 'turns', public: true, locked: false });
});

test('custom knobs are remembered; entries from before them, or with odd knobs, keep the rest', () => {
  const mine = { ...custom, difficulty: 'custom' as const };
  assert.deepEqual(parsePrefs(serializePrefs(mine)), mine);
  const { custom: _, ...older } = custom;
  assert.deepEqual(parsePrefs(JSON.stringify({ v: PREFS_VERSION, ...older })), older);
  // A room that never used Custom keeps the saved knobs.
  store.set(PREFS_KEY, serializePrefs(custom));
  savePrefs(prefsFrom({ ...roomSettings(older), difficulty: 'cruel' }));
  assert.deepEqual(parsePrefs(store.get(PREFS_KEY) ?? null), { ...custom, difficulty: 'cruel' });
  const odd = { ...knobs, options: 5, veil: 'sideways', grayscale: true };
  assert.deepEqual(parsePrefs(JSON.stringify({ v: PREFS_VERSION, ...custom, custom: odd }))?.custom, {
    ...knobs,
    options: PRESETS.merciless.options,
    veil: PRESETS.merciless.veil,
    grayscale: PRESETS.merciless.grayscale,
  });
});

test('a custom room is stored so a build from before Custom still reads the entry', () => {
  const mine = { ...custom, difficulty: 'custom' as const };
  const raw = serializePrefs(mine);
  const stored = JSON.parse(raw);
  assert.ok(['cruel', 'merciless', 'eternal'].includes(stored.difficulty), 'an older build sees a preset');
  assert.deepEqual(parsePrefs(raw), mine);
  // Without knobs to go with it, the flag falls back to the preset.
  assert.equal(parsePrefs(JSON.stringify({ ...stored, custom: undefined }))?.difficulty, stored.difficulty);
});

test('a timer saved by an older build snaps to the nearest step', () => {
  for (const [old, now] of [[10, 8], [15, 16], [20, 16], [30, 32], [45, 32], [120, 64], [0, 0]])
    assert.equal(parsePrefs(serializePrefs({ ...custom, timer: old }))?.timer, now, String(old));
});

test('a Delve room is stored as turns with a flag, so older tabs still read it', () => {
  const delve: RoomPrefs = { ...custom, mode: 'delve' };
  const raw = JSON.parse(serializePrefs(delve));
  assert.equal(raw.mode, 'turns');
  assert.equal(raw.delveOn, true);
  assert.deepEqual(parsePrefs(serializePrefs(delve)), delve);
  // A build from before Delve: same checks, no flag.
  assert.equal(parsePrefs(JSON.stringify({ ...raw, delveOn: undefined }))?.mode, 'turns');
  const kept = prefsFrom({ targetScore: 15, timer: 32, difficulty: 'eternal', mode: 'delve', public: false, locked: false } as Settings);
  assert.deepEqual([kept.mode, kept.targetScore, kept.timer, kept.difficulty], ['delve', 15, 32, 'eternal']);
});
