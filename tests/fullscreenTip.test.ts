// The tip to play fullscreen (lib/fullscreenTip.ts): an iPhone's tip says
// the home-screen app starts fresh, and points to Settings' pairing, only to
// a player with something there to lose (a name saved, or anything in the
// codex); Android's reads the same either way (a desktop's names its keys,
// which takes a window).
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { emptyCodex } = await import('../src/lib/codex.ts');
const { hasProgress, tipText } = await import('../src/lib/fullscreenTip.ts');

test('a first visit has no progress; a saved name or anything in the codex is some', () => {
  assert.equal(hasProgress('', emptyCodex()), false);
  assert.equal(hasProgress('Kalguur', emptyCodex()), true);
  const met = emptyCodex();
  met.items['0123456789ab'] = { seen: 1, first: 1, last: 1, name: { n: 1, ok: 1 }, art: { n: 0, ok: 0 }, mixed: {} };
  assert.equal(hasProgress('', met), true);
  const answered = emptyCodex();
  answered.log.push({ id: '0123456789ab', t: 1, ok: true } as never);
  assert.equal(hasProgress('', answered), true);
});

test('only the iPhone tip changes with progress, and then points to Settings', () => {
  assert.equal(tipText('ios', false), 'Tap Share, then Add to Home Screen, to play in fullscreen.');
  assert.match(tipText('ios', true), /Add to Home Screen/);
  assert.match(tipText('ios', true), /starts fresh/);
  assert.match(tipText('ios', true), /Settings/);
  assert.equal(tipText('android', true), tipText('android', false));
});
