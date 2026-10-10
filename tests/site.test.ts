import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_URL, inviteUrl } from '../src/lib/site.ts';
import { cleanName } from '../src/lib/names.ts';

/** What the start page reads off an invite link: its room, and whose it is (Home.svelte). */
const read = (link: string) => {
  const p = new URL(link).searchParams;
  return { room: p.get('room'), host: cleanName(p.get('by')) };
};

test('an invite link leads to the room, and says whose it is when the host is known', () => {
  assert.equal(inviteUrl('KXR4QT'), `${PLAY_URL}?room=KXR4QT`);
  assert.deepEqual(read(inviteUrl('KXR4QT', 'Kalguur')), { room: 'KXR4QT', host: 'Kalguur' });
});

test("the host's name survives the link whatever it holds", () => {
  for (const name of ['Una of the Vaal', 'Rog & Co', 'a=b?c#d', 'Sekhema Asala', 'Zoë', '50%']) {
    const link = inviteUrl('AB12CD', name);
    assert.equal(read(link).host, name, link);
    assert.equal(read(link).room, 'AB12CD', 'the name never spills into the room');
  }
});

test('a link without a host, or with nothing usable as one, names nobody', () => {
  assert.equal(read(inviteUrl('KXR4QT', '')).host, '');
  assert.equal(read(`${PLAY_URL}?room=KXR4QT&by=%E2%80%AE%E2%80%8B`).host, '', 'only invisible and bidi characters');
  assert.equal(read(`${PLAY_URL}?room=KXR4QT&by=${'x'.repeat(60)}`).host.length, 20, 'cut to a name’s length');
});
