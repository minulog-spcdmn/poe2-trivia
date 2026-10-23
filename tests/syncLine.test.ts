// How the settings and the pairing dialog say how sync stands
// (lib/sync/link.svelte.ts syncLine): syncing now, or when it last synced.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ago, sync, syncLine } = await import('../src/lib/sync/link.svelte.ts');
const { QUIET_MS, tellsLink } = await import('../src/lib/sync/notice.ts');

test('a link is told when it comes after a while away; not at a first pairing, nor back soon after it went', () => {
  const now = 1_000_000_000_000;
  assert.equal(tellsLink(0, now), false);
  assert.equal(tellsLink(now - 60_000, now), false);
  assert.equal(tellsLink(now - QUIET_MS, now), true);
  assert.equal(tellsLink(now - 3 * 3600_000, now), true);
});

test('how long ago, in words', () => {
  const now = 1_000_000_000_000;
  const min = 60_000;
  assert.equal(ago(now - 20_000, now), 'just now');
  assert.equal(ago(now - min, now), 'a minute ago');
  assert.equal(ago(now - 59 * min, now), '59 minutes ago');
  assert.equal(ago(now - 60 * min, now), 'an hour ago');
  assert.equal(ago(now - 23 * 60 * min, now), '23 hours ago');
  assert.equal(ago(now - 24 * 60 * min, now), 'yesterday');
  assert.equal(ago(now - 3 * 24 * 60 * min, now), '3 days ago');
});

test('paired: syncing now, or when it last did', () => {
  Object.assign(sync, { code: 'K7QXM2PA9FHE3TDW', met: true, status: 'linked', linked: 1 });
  assert.equal(syncLine(), 'Syncing now with your other device.');
  sync.linked = 3;
  assert.equal(syncLine(), 'Syncing now with 3 other devices.');
  Object.assign(sync, { status: 'waiting', linked: 0, lastAt: 0 });
  assert.equal(syncLine(), 'Syncs when your other device has the site open.');
  Object.assign(sync, { lastAt: 5_000_000, clock: 5_000_000 + 25 * 60_000 });
  assert.equal(syncLine(), 'Last synced 25 minutes ago. Syncs when your other device has the site open.');
  sync.met = false;
  assert.equal(syncLine(), 'Waiting for your other device.');
});
