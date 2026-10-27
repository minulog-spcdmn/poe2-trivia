// The tip to play fullscreen (lib/fullscreenTip.ts): in Safari an iPhone's
// says only how to put the game on the home screen; in the home-screen app,
// which starts fresh, it is a reminder to pair it with Safari in Settings,
// until it is paired. Android's reads as before (a desktop's names its keys,
// which takes a window).
import './asVite.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);
beforeEach(() => store.clear());

const { toasts } = await import('../src/lib/toasts.svelte.ts');
const { appUnpaired, showTip, tipText } = await import('../src/lib/fullscreenTip.ts');

test('in Safari the iPhone tip says only how to install; in the app it points to Settings’ pairing', () => {
  assert.equal(tipText('ios'), 'Tap Share, then Add to Home Screen, to play in fullscreen.');
  assert.match(tipText('app'), /Safari/);
  assert.match(tipText('app'), /Settings/);
  assert.doesNotMatch(tipText('app'), /Home Screen/);
});

test('the app’s reminder is due until it is paired with a device it has met', () => {
  assert.equal(appUnpaired(true, null), true);
  assert.equal(appUnpaired(true, { code: 'ABCDEFGHJKMNPQRS', met: false }), true, 'a code offered, nobody met yet');
  assert.equal(appUnpaired(true, { code: 'ABCDEFGHJKMNPQRS', met: true }), false);
  assert.equal(appUnpaired(false, null), false, 'not the home-screen app');
});

test('the tip shown says what tipText does', () => {
  for (const tipFor of ['android', 'ios', 'app'] as const) {
    const id = showTip(tipFor);
    assert.equal(toasts.list.find((t) => t.id === id)?.message, tipText(tipFor));
    toasts.dismiss(id);
  }
});
