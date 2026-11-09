// In a game Enter and Space are Next's (lib/keys.ts), heard at the window
// wherever the focus is. Not on a control the player tabbed to, nor on an
// item's window's own buttons, whose key it is then (lib/keybinds.svelte.ts
// ownKey): a keyboard player opens an item's details, and gives a life, with
// the key every button takes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './asVite.ts';
import { memoryStorage } from './helpers.ts';

/** The page's listeners, by event: its Tab and its presses are played to them. */
const heard = new Map<string, ((e: unknown) => void)[]>();
const g = globalThis as { localStorage?: unknown; addEventListener?: unknown };
g.localStorage = memoryStorage(new Map());
g.addEventListener = (type: string, f: (e: unknown) => void) => void heard.set(type, [...(heard.get(type) ?? []), f]);
const page = (type: string, e: object = {}) => heard.get(type)?.forEach((f) => f(e));

const { ownKey } = await import('../src/lib/keybinds.svelte.ts');

/** What has the focus: a control or not, in an item's window or not; closest() as the page's elements answer it. */
const on = (control: boolean, inWindow = false, disabled = false) => {
  const el = { disabled, closest: (sel: string) => ((sel === '[data-item-window]' ? inWindow : control) ? el : null) };
  return el;
};
const key = (k: string, target: object) => ({ key: k, target }) as unknown as KeyboardEvent;

test('a control pressed with the mouse keeps the focus, not the keys: Enter and Space are still the game’s', () => {
  page('pointerdown');
  assert.equal(ownKey(key('Enter', on(true))), false);
  assert.equal(ownKey(key(' ', on(true))), false);
});

test('a control the player tabbed to takes its own Enter and Space, until the next press of the mouse', () => {
  page('keydown', { key: 'Tab' });
  assert.equal(ownKey(key('Enter', on(true))), true);
  assert.equal(ownKey(key(' ', on(true))), true);
  // Other keys are the game's wherever the focus is: an answer's, Detonate's.
  assert.equal(ownKey(key('1', on(true))), false);
  assert.equal(ownKey(key('d', on(true))), false);
  // One that can't be pressed (an answer, once given) takes none; nor does the page itself.
  assert.equal(ownKey(key('Enter', on(true, false, true))), false);
  assert.equal(ownKey(key('Enter', on(false))), false);
  page('keydown', { key: 'a' });
  assert.equal(ownKey(key('Enter', on(true))), true, 'another key leaves the focus where Tab put it');
  page('pointerdown');
  assert.equal(ownKey(key('Enter', on(true))), false);
});

test('an item’s window’s buttons take Enter and Space however the focus came; the rest of it takes no key from the game', () => {
  page('pointerdown');
  assert.equal(ownKey(key('Enter', on(true, true))), true);
  assert.equal(ownKey(key(' ', on(true, true))), true);
  // The focus on the window itself (a press on its tooltip): Space is Next, a digit an answer.
  assert.equal(ownKey(key(' ', on(false, true))), false);
  assert.equal(ownKey(key('1', on(true, true))), false);
});
