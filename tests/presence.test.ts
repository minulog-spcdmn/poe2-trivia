import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AWAY_AFTER_MS, LATE_PONG_MS, SLOW_CLEAR_MS, SLOW_RTT_MS, missingNote, namesList, notReady, slowLink, standingOf } from '../src/lib/presence.ts';

test('a player gone from the screen shows as away only once a quick look elsewhere is over', () => {
  const since = 1000;
  assert.equal(standingOf({ presence: 'away', since }, false, since + AWAY_AFTER_MS - 1), null);
  assert.equal(standingOf({ presence: 'away', since }, false, since + AWAY_AFTER_MS), 'away');
  // Away (or idle) says more than a slow link: theirs may only be slow because the page is asleep.
  assert.equal(standingOf({ presence: 'away', since }, true, since + AWAY_AFTER_MS), 'away');
  assert.equal(standingOf({ presence: 'away', since }, true, since), 'slow');
  assert.equal(standingOf({ presence: 'idle', since }, true, since), 'idle');
  assert.equal(standingOf({ presence: 'here', since }, true, since), 'slow');
  assert.equal(standingOf({ presence: 'here', since }, false, since), null);
});

test("a slow link doesn't flicker: it turns slow above one round trip and clears below a shorter one", () => {
  assert.equal(slowLink(false, SLOW_RTT_MS, 0), false);
  assert.equal(slowLink(false, SLOW_RTT_MS + 1, 0), true);
  assert.equal(slowLink(true, SLOW_RTT_MS, 0), true);
  assert.equal(slowLink(true, SLOW_CLEAR_MS, 0), false);
  // No answer to two pings in a row is slow, however quick the last one was.
  assert.equal(slowLink(false, 50, LATE_PONG_MS + 1), true);
});

test('only away and idle keep a player from being ready', () => {
  assert.equal(notReady('away'), true);
  assert.equal(notReady('idle'), true);
  assert.equal(notReady('slow'), false);
  assert.equal(notReady(undefined), false);
});

test('who the game waits on reads as a sentence', () => {
  assert.equal(namesList(['Ana']), 'Ana');
  assert.equal(namesList(['Ana', 'Bo']), 'Ana and Bo');
  assert.equal(namesList(['Ana', 'Bo', 'Cy']), 'Ana, Bo and 1 more');
  assert.equal(namesList(['Ana', 'Bo', 'Cy', 'Di']), 'Ana, Bo and 2 more');
});

test('the note beside Begin says why, when everyone missing is missing for the same reason', () => {
  assert.equal(missingNote([{ name: 'Kai', why: 'away' }]), 'Kai is away');
  assert.equal(missingNote([{ name: 'Kai', why: 'idle' }, { name: 'Mira', why: 'idle' }]), 'Kai and Mira are idle');
  assert.equal(missingNote([{ name: 'Kai', why: 'offline' }]), 'Kai is offline');
  assert.equal(missingNote([{ name: 'Kai', why: 'away' }, { name: 'Mira', why: 'idle' }]), 'waiting on Kai and Mira');
});
