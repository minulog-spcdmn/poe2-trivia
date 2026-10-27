// The tip to play fullscreen (lib/fullscreenTip.ts): an iPhone's says only
// how to put the game on the home screen, and the tip the QA desk and the lab
// show is the one a player gets (a desktop's names its keys, which takes a
// window).
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';

(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(new Map());

const { toasts } = await import('../src/lib/toasts.svelte.ts');
const { showTip, tipText } = await import('../src/lib/fullscreenTip.ts');

test('the iPhone tip says only how to install', () => {
  assert.equal(tipText('ios'), 'Tap Share, then Add to Home Screen, to play in fullscreen.');
});

test('the tip shown says what tipText does', () => {
  for (const tipFor of ['android', 'ios'] as const) {
    const id = showTip(tipFor);
    assert.equal(toasts.list.find((t) => t.id === id)?.message, tipText(tipFor));
    toasts.dismiss(id);
  }
});
