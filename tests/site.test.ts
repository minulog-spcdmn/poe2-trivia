import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_URL, inviteUrl } from '../src/lib/site.ts';

test('an invite link leads to the room by its code, and claims nothing else about it', () => {
  assert.equal(inviteUrl('KXR4QT'), `${PLAY_URL}?room=KXR4QT`);
  // Whose room it is, the room itself says when the invite screen asks it (lib/rooms.ts probeRoom).
  assert.deepEqual([...new URL(inviteUrl('KXR4QT')).searchParams.keys()], ['room']);
});
