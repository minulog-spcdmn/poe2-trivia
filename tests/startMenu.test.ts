import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENTRIES, codexLine, cursorKey, moveCursor } from '../src/lib/startMenu.ts';

test('the menu has its four entries, Create first', () => {
  assert.deepEqual([...ENTRIES], ['create', 'join', 'hotseat', 'codex']);
});

test('the arrow keys move the cursor and wrap around at either end', () => {
  assert.equal(cursorKey('ArrowDown', 0), 1);
  assert.equal(cursorKey('ArrowDown', 3), 0);
  assert.equal(cursorKey('ArrowUp', 0), 3);
  assert.equal(cursorKey('ArrowUp', 2), 1);
  assert.equal(cursorKey('Home', 2), 0);
  assert.equal(cursorKey('End', 0), 3);
  assert.equal(cursorKey('Enter', 1), null);
  assert.equal(cursorKey('ArrowLeft', 1), null);
  assert.equal(moveCursor(1, -5), 0);
});

test("the Codex entry tells what has been met, and the deepest delve once there is one", () => {
  assert.equal(codexLine(212, 501, 14), 'Every unique you have met: 212 of 501. Deepest delve: 14.');
  assert.equal(codexLine(3, 501, 0), 'Every unique you have met: 3 of 501.');
  assert.equal(codexLine(0, 501, 0), 'Every unique you meet in a game is kept here.');
  assert.equal(codexLine(null, 501, 5), 'Every unique you meet in a game is kept here.');
});
