// The tip to play fullscreen (lib/fullscreenTip.ts): an iPhone's tip says
// the home-screen app starts fresh, and points to Settings' pairing, only to
// a player with something there to lose (a name saved, or anything in the
// codex); Android's reads the same either way (a desktop's names its keys,
// which takes a window).
import './asVite.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';
import type { Answer } from '../src/lib/codex.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);
beforeEach(() => store.clear());

const { emptyCodex, serializeCodex } = await import('../src/lib/codex.ts');
const { NAME_STORED } = await import('../src/lib/names.ts');
const { writeStored } = await import('../src/lib/storage.ts');
const { toasts } = await import('../src/lib/toasts.svelte.ts');
const { hasProgress, progressHere, showTip, tipText } = await import('../src/lib/fullscreenTip.ts');

test('a first visit has no progress; a saved name or anything in the codex is some', () => {
  assert.equal(hasProgress('', emptyCodex()), false);
  assert.equal(hasProgress('Kalguur', emptyCodex()), true);
  const met = emptyCodex();
  met.items['0123456789ab'] = { seen: 1, first: 1, last: 1, name: { n: 1, ok: 1 }, art: { n: 0, ok: 0 }, mixed: {} };
  assert.equal(hasProgress('', met), true);
  const answered = emptyCodex();
  const answer: Answer = { t: 1, id: '0123456789ab', mode: 'name', ok: true, difficulty: 'merciless', race: false };
  answered.log.push(answer);
  assert.equal(hasProgress('', answered), true);
});

test('only the iPhone tip changes with progress, and then points to Settings', () => {
  assert.equal(tipText('ios', false), 'Tap Share, then Add to Home Screen, to play in fullscreen.');
  assert.match(tipText('ios', true), /Add to Home Screen/);
  assert.match(tipText('ios', true), /starts fresh/);
  assert.match(tipText('ios', true), /pair it with this tab in Settings/);
  assert.equal(tipText('android', true), tipText('android', false));
});

test('the iPhone tip reads the saved name and the codex as stored', () => {
  const said = () => {
    const id = showTip('ios');
    const message = toasts.list.find((t) => t.id === id)?.message;
    toasts.dismiss(id);
    return message;
  };
  assert.equal(progressHere(), false);
  assert.equal(said(), tipText('ios', false));
  writeStored(NAME_STORED, 'Kalguur');
  assert.equal(progressHere(), true);
  assert.equal(said(), tipText('ios', true));
  store.clear();
  const met = emptyCodex();
  met.items['0123456789ab'] = { seen: 1, first: 1, last: 1, name: { n: 1, ok: 1 }, art: { n: 0, ok: 0 }, mixed: {} };
  writeStored('codex2', serializeCodex(met));
  assert.equal(progressHere(), true);
  assert.equal(said(), tipText('ios', true));
});
