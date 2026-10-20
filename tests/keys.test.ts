// The game's keys (src/lib/keys.ts): read by where a key sits, rebound one
// key to one action, and stored bindings checked as they're read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, DEFAULT_BINDINGS, actionFor, bindable, capFor, keyName, optionIndex, optionKeysText, parseBindings, rebind, unbind } from '../src/lib/keys.ts';

const press = (code: string, key = '') => ({ code, key });

test('the number row answers by where it sits, whatever it types', () => {
  const b = DEFAULT_BINDINGS;
  // AZERTY: the first key types & unshifted, 1 with Shift; both are option 1.
  assert.equal(actionFor(b, press('Digit1', '&')), 'option1');
  assert.equal(actionFor(b, press('Digit1', '1')), 'option1');
  assert.equal(actionFor(b, press('Digit0', 'à')), 'option10');
  assert.equal(actionFor(b, press('Numpad3', '3')), 'option3');
  assert.equal(optionIndex(actionFor(b, press('Digit0'))), 9);
  assert.equal(actionFor(b, press('Space', ' ')), 'next');
  assert.equal(actionFor(b, press('NumpadEnter', 'Enter')), 'next');
  assert.equal(actionFor(b, press('KeyD', 'd')), 'detonate');
  assert.equal(actionFor(b, press('KeyQ', 'q')), null);
  // An on-screen keyboard that gives no code is read by what it types.
  assert.equal(actionFor(b, press('', '4')), 'option4');
  assert.equal(actionFor(b, press('', 'Enter')), 'next');
});

test('a key does one thing: binding it takes it off whatever had it', () => {
  let b = rebind(DEFAULT_BINDINGS, 'option1', 0, 'KeyQ');
  assert.deepEqual(b.option1, ['KeyQ', 'Numpad1']);
  assert.equal(actionFor(b, press('Digit1')), null);
  b = rebind(b, 'next', 1, 'KeyQ');
  assert.deepEqual(b.option1, ['Numpad1']);
  assert.deepEqual(b.next, ['Enter', 'KeyQ']);
  // The keypad's Enter is Enter.
  b = rebind(b, 'detonate', 0, 'NumpadEnter');
  assert.deepEqual(b.next, ['KeyQ']);
  assert.equal(actionFor(b, press('Enter')), 'detonate');
});

test("an action's own other key changes places with the slot it's put in", () => {
  const b = rebind(DEFAULT_BINDINGS, 'next', 0, 'Space');
  assert.deepEqual(b.next, ['Space', 'Enter']);
  // Put after an empty slot, a key moves up into it.
  const one = rebind(unbind(DEFAULT_BINDINGS, 'detonate', 0), 'detonate', 1, 'KeyB');
  assert.deepEqual(one.detonate, ['KeyB']);
  assert.deepEqual(unbind(DEFAULT_BINDINGS, 'next', 0).next, ['Space']);
});

test('Tab, Backspace and the modifiers stay out of reach; Escape opens the settings, and can be moved', () => {
  for (const code of ['Tab', 'Backspace', 'ShiftLeft', 'ControlRight', 'AltLeft', 'MetaLeft', 'F5', '']) assert.equal(bindable(code), false, code);
  for (const code of ['Escape', 'KeyA', 'Digit1', 'Space', 'Enter', 'ArrowUp', 'F2']) assert.equal(bindable(code), true, code);
  assert.equal(actionFor(DEFAULT_BINDINGS, press('Escape', 'Escape')), 'settings');
  assert.equal(actionFor(DEFAULT_BINDINGS, press('KeyM', 'm')), 'mute');
  assert.equal(keyName('Escape'), 'Esc');
});

test('stored keys are checked: a broken action takes its default, a key bound twice its first action', () => {
  assert.deepEqual(parseBindings(null), DEFAULT_BINDINGS);
  assert.deepEqual(parseBindings('not json'), DEFAULT_BINDINGS);
  const b = parseBindings(JSON.stringify({ option1: ['KeyQ'], option2: 'KeyW', next: ['Tab'], detonate: ['KeyQ'] }));
  assert.deepEqual(b.option1, ['KeyQ']);
  assert.deepEqual(b.option2, DEFAULT_BINDINGS.option2);
  assert.deepEqual(b.next, DEFAULT_BINDINGS.next);
  assert.deepEqual(b.detonate, []);
  // Kept from before the mute and settings keys came: they take their defaults, unless a key of theirs was bound already.
  const old = parseBindings(JSON.stringify({ detonate: ['KeyM'] }));
  assert.deepEqual(old.mute, []);
  assert.deepEqual(old.settings, ['Escape']);
  for (const a of ACTIONS) assert.ok(Array.isArray(b[a]));
});

test('keys are named as their caps read', () => {
  assert.equal(keyName('Digit7'), '7');
  assert.equal(keyName('Numpad7'), 'Num 7');
  assert.equal(keyName('KeyQ'), 'Q');
  assert.equal(keyName('Space'), 'Space');
  assert.equal(keyName('ArrowLeft'), '←');
  // A layout map names letters as this keyboard prints them; the digits stay digits.
  const azerty = new Map([
    ['KeyQ', 'a'],
    ['Digit1', '&'],
  ]);
  assert.equal(keyName('KeyQ', azerty), 'A');
  assert.equal(keyName('Digit1', azerty), '1');
});

test("the answers' seals and hints show the keys as bound", () => {
  assert.equal(capFor(DEFAULT_BINDINGS, 'option10'), '0');
  assert.equal(capFor(DEFAULT_BINDINGS, 'next'), 'Enter');
  assert.equal(optionKeysText(DEFAULT_BINDINGS, 4), '1–4');
  assert.equal(optionKeysText(DEFAULT_BINDINGS, 10), '1–9 and 0');
  let b = DEFAULT_BINDINGS;
  for (const [i, code] of ['KeyQ', 'KeyW', 'KeyE', 'KeyR'].entries()) b = rebind(b, `option${i + 1}` as 'option1', 0, code);
  assert.equal(capFor(b, 'option1'), 'Q');
  assert.equal(optionKeysText(b, 4), 'Q, W, E or R');
  // Only the keypad left: its name goes on the seal.
  assert.equal(capFor(unbind(DEFAULT_BINDINGS, 'option1', 0), 'option1'), 'Num 1');
  assert.equal(capFor(unbind(unbind(DEFAULT_BINDINGS, 'option1', 0), 'option1', 0), 'option1'), null);
});
