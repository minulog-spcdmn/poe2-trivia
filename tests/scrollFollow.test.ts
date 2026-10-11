import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrollFollow } from '../src/lib/scrollFollow.ts';

test('an element is with the page when it moves up the screen as far as the page scrolls down, on the screen when it stays put', () => {
  assert.equal(scrollFollow(-120, 120), 'page');
  assert.equal(scrollFollow(40.4, -40), 'page');
  assert.equal(scrollFollow(0, 120), 'screen');
  assert.equal(scrollFollow(0.5, -30), 'screen');
});

test('without scrolling, or moving some other way as well, it can not be told', () => {
  assert.equal(scrollFollow(-50, 0), null);
  assert.equal(scrollFollow(0, 0.5), null);
  assert.equal(scrollFollow(-80, 120), null);
});
