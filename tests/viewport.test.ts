import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenHeight, stackShift } from '../src/lib/viewport.ts';

// An iPhone 14's screen, as screen.width and screen.height give it.
const [SW, SH] = [390, 844];

test('a viewport handed back shorter keeps the screen’s height', () => {
  const tallest = new Map<number, number>();
  assert.equal(screenHeight(tallest, 390, 844, SW, SH), 844);
  // Back from another app, 47px short: the layers still fill the screen.
  assert.equal(screenHeight(tallest, 390, 797, SW, SH), 844);
});

test('each way up has its own height', () => {
  const tallest = new Map<number, number>();
  screenHeight(tallest, 390, 844, SW, SH);
  assert.equal(screenHeight(tallest, 844, 390, SW, SH), 390);
  assert.equal(screenHeight(tallest, 390, 844, SW, SH), 844);
});

test('a reading half old and half new as the phone turns is held to the screen', () => {
  const tallest = new Map<number, number>();
  // The new width with the old height: no taller than the screen on its side.
  assert.equal(screenHeight(tallest, 844, 844, SW, SH), 390);
  assert.equal(screenHeight(tallest, 844, 390, SW, SH), 390);
  // And upright, never past the screen's length.
  assert.equal(screenHeight(tallest, 390, 900, SW, SH), 844);
});

test('with no header the toast stack follows the top of what shows', () => {
  assert.equal(stackShift(0, 0), 0);
  assert.equal(stackShift(37, 0), 37);
  assert.equal(stackShift(172, 0), 172);
  // An installed app's safe area: still that far below the top of what shows.
  assert.equal(stackShift(172, 0, 47), 172);
});

test('under a header the toast stack moves only once the header has scrolled away', () => {
  // 13px of the header still showing: the stack stays 6px under it.
  assert.equal(stackShift(37, 50), 0);
  // The header gone: 10px below the top of what shows (172 + 10 - 56).
  assert.equal(stackShift(172, 50), 126);
  assert.equal(stackShift(46, 50), 0);
  assert.equal(stackShift(56, 50), 10);
});

test('an overscroll reading leaves the toast stack where it is', () => {
  assert.equal(stackShift(-30, 0), 0);
  assert.equal(stackShift(-30, 50), 0);
});
