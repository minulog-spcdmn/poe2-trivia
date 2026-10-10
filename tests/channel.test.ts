import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelOf, roomPrefix } from '../src/lib/channel.ts';

test('the channel: as named, else local on the dev server and live in a build', () => {
  assert.equal(channelOf(undefined), 'live');
  assert.equal(channelOf({}), 'live');
  assert.equal(channelOf({ DEV: true }), 'local');
  assert.equal(channelOf({ DEV: true, VITE_CHANNEL: '' }), 'local');
  assert.equal(channelOf({ DEV: true, VITE_CHANNEL: 'live' }), 'live');
  assert.equal(channelOf({ VITE_CHANNEL: 'beta' }), 'beta');
  assert.equal(channelOf({ VITE_CHANNEL: 'local' }), 'local');
});

test('a channel named wrongly is an error, never quietly the live game', () => {
  for (const named of ['Local', 'locl', 'dev', 'LIVE']) assert.throws(() => channelOf({ DEV: true, VITE_CHANNEL: named }), new RegExp(named));
});

test("each channel's rooms are named apart, the local ones by machine", () => {
  assert.equal(roomPrefix('live'), 'poe2-trivia-');
  assert.equal(roomPrefix('beta'), 'poe2-trivia-beta-');
  assert.equal(roomPrefix('local', 'ab12cd34'), 'poe2-trivia-local-ab12cd34-');
  assert.notEqual(roomPrefix('local', 'ab12cd34'), roomPrefix('local', 'ef56ab78'));
  // The live and beta names never change with the machine.
  assert.equal(roomPrefix('live', 'ab12cd34'), 'poe2-trivia-');
  assert.equal(roomPrefix('beta', 'ab12cd34'), 'poe2-trivia-beta-');
});
