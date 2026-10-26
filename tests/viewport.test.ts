import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenHeight } from '../src/lib/viewport.ts';

// An iPhone 14's screen, as screen.width and screen.height give it.
const [SW, SH] = [390, 844];

test('a viewport handed back shorter keeps the screen’s height', () => {
  const tallest = new Map<number, number>();
  assert.equal(screenHeight(tallest, 390, 844, SW, SH), 844);
  // Back from another app, 47px short: the layers still fill the screen.
  assert.equal(screenHeight(tallest, 390, 797, SW, SH), 844);
});

test('a large viewport taller than the page is taken, held to the screen', () => {
  // Chrome's tab: the page 663px high with its toolbars up, 768px at 100lvh.
  assert.equal(screenHeight(new Map(), 390, 663, SW, SH, 768), 768);
  // Never past the screen's side, upright or on its side.
  assert.equal(screenHeight(new Map(), 390, 663, SW, SH, 900), 844);
  assert.equal(screenHeight(new Map(), 844, 340, SW, SH, 500), 390);
  // Shorter than the page, or than what was seen, it changes nothing.
  assert.equal(screenHeight(new Map(), 390, 663, SW, SH, 600), 663);
  const tallest = new Map<number, number>();
  screenHeight(tallest, 390, 844, SW, SH);
  assert.equal(screenHeight(tallest, 390, 797, SW, SH, 797), 844);
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
