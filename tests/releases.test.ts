import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELEASES, newestItems, releaseNote } from '../src/lib/releases.ts';
import itemData from '../src/data/items.json' with { type: 'json' };

// Which items came with the newest release: those a refresh first listed on its day or after (scripts/refresh-plan.mjs firstSeen).

const ONE = [{ name: '1.0', from: '2026-12-11' }];
const items = [{ id: 'old' }, { id: 'nov', added: '2026-11-05' }, { id: 'a', added: '2026-12-11' }, { id: 'b', added: '2026-12-12' }, { id: 'c', added: '2026-12-20' }];

test('the newest release’s items are those first listed on its day or after', () => {
  assert.deepEqual(
    newestItems(items, ONE).map((it) => it.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(newestItems(items, []), []);
});

test('the note counts every item that came with it, while any is still to meet', () => {
  assert.deepEqual(releaseNote(items, {}, ONE), { name: '1.0', count: 3 });
  assert.deepEqual(releaseNote(items, { a: {}, b: {} }, ONE), { name: '1.0', count: 3 });
  assert.equal(releaseNote(items, { a: {}, b: {}, c: {} }, ONE), null);
  assert.equal(releaseNote([{ id: 'old' }, { id: 'nov', added: '2026-11-05' }], {}, ONE), null);
});

test('the next league’s row takes the items first listed from its day on', () => {
  const next = [...ONE, { name: 'Next', from: '2027-03-06' }];
  const more = [...items, { id: 'd', added: '2027-03-06' }];
  assert.deepEqual(releaseNote(more, {}, next), { name: 'Next', count: 1 });
  assert.equal(releaseNote(more, { d: {} }, next), null);
});

test('the releases are days, oldest first', () => {
  for (const r of RELEASES) assert.match(r.from, /^\d{4}-\d{2}-\d{2}$/);
  for (let i = 1; i < RELEASES.length; i++) assert.ok(RELEASES[i - 1].from < RELEASES[i].from);
});

test('every stamp in items.json is a day, so it compares as one', () => {
  for (const it of itemData as { name: string; added?: string }[]) if (it.added !== undefined) assert.match(it.added, /^\d{4}-\d{2}-\d{2}$/, it.name);
});
