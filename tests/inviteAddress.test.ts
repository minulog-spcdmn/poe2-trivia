import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutInvite } from '../src/lib/inviteAddress.ts';

test('an invite’s room, its older host and the first look come out of the address; the rest stays', () => {
  assert.equal(withoutInvite('https://poe2.quest/?room=ABCD'), '/');
  assert.equal(withoutInvite('https://poe2.quest/beta/?room=ABCD&by=Kalguur&first&lang=de#x'), '/beta/?lang=de#x');
  assert.equal(withoutInvite('https://poe2.quest/?delve#settings'), '/?delve#settings');
});
