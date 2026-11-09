import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DELVE_FULL_DAYS, NEW_FADE_DAYS, NEW_HALF_DAYS, NEW_MAX_BOOST, RELEASES, dayNumber, delveLean, newBoost, newShare, newStrength, newestCame, newestLean, newestItems, newestRelease, releaseNote } from '../src/lib/releases.ts';
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

test('the games lean hardest to a release’s items its first week, then less each day, and not at all after the three weeks after', () => {
  for (let age = -2; age < NEW_HALF_DAYS; age++) assert.equal(newStrength(age), 1, `day ${age}`);
  assert.equal(newStrength(NEW_HALF_DAYS + NEW_FADE_DAYS / 2), 0.5);
  assert.equal(newStrength(NEW_HALF_DAYS + NEW_FADE_DAYS), 0);
  assert.equal(newStrength(400), 0);
  for (let age = NEW_HALF_DAYS; age < NEW_HALF_DAYS + NEW_FADE_DAYS + 3; age++) assert.ok(newStrength(age + 1) <= newStrength(age));
});

test('at its strongest, every new item is likelier by as much as makes half the weight theirs; at none, not at all', () => {
  assert.equal(newBoost(5, 45, 0), 1);
  assert.equal(newBoost(0, 45, 1), 1);
  assert.equal(newBoost(5, 0, 1), 1);
  assert.equal(newBoost(30, 20, 1), 1, 'already more than half theirs');
  // 45 among 501: half theirs takes 501 / 45 times an old item's weight.
  assert.ok(Math.abs(newBoost(45, 501, 1) - 501 / 45) < 1e-9);
  const share = (fresh: number, other: number, strength: number) => {
    const b = newBoost(fresh, other, strength);
    return (fresh * b) / (fresh * b + other);
  };
  assert.ok(Math.abs(share(45, 501, 0.5) - (45 / 546 + (0.5 - 45 / 546) / 2)) < 1e-9, 'halfway: halfway to half');
  // A release of a few: never more than NEW_MAX_BOOST times, however few.
  assert.equal(newBoost(3, 540, 1), NEW_MAX_BOOST);
});

test('Today’s unique past its week leans to twice their share, up to half, back to their own as the lean fades', () => {
  assert.equal(newShare(0.1, 1, true), 0.2);
  assert.ok(Math.abs(newShare(0.1, 0.5, true) - 0.15) < 1e-9);
  assert.equal(newShare(0.1, 0, true), 0.1);
  assert.equal(newShare(0.3, 1, true), 0.5, 'never past half');
  // Its boost makes that share theirs: 45 among 501, twice theirs.
  const b = newBoost(45, 501, 1, true);
  assert.ok(Math.abs((45 * b) / (45 * b + 501) - (2 * 45) / 546) < 1e-9);
});

test('the games lean to the newest release’s items by the day they came and the clock', () => {
  const at = (d: string) => Date.parse(`${d}T12:00:00Z`);
  assert.equal(newestLean([{ id: 'old' }]), undefined, 'none without its items');
  assert.deepEqual(newestCame(items, ONE), { ids: new Set(['a', 'b', 'c']), first: dayNumber('2026-12-11') });
  // Two of 41: the lean at its strongest, halfway, then none.
  const some = [...items.filter((it) => it.id === 'a' || it.id === 'b'), ...Array.from({ length: 39 }, (_, i) => ({ id: `old${i}` }))];
  let now = at('2026-12-11');
  const lean = newestLean(some, () => now)!;
  assert.ok(lean.isNew({ id: 'a' }) && !lean.isNew({ id: 'old0' }));
  assert.equal(lean.strength(), 1);
  now = at('2026-12-11') + (NEW_HALF_DAYS + 7) * 86_400_000;
  assert.ok(Math.abs(lean.strength() - 2 / 3) < 1e-9);
  now = at('2026-12-11') + (NEW_HALF_DAYS + NEW_FADE_DAYS) * 86_400_000;
  assert.equal(lean.strength(), 0);
  assert.equal(dayNumber('1970-01-02'), 1);
});

test('Delve leans in full for each player’s own first days whenever they come, then to twice their share, and stops with the games', () => {
  const over = NEW_HALF_DAYS + NEW_FADE_DAYS;
  // Their first days, from the release's first (or a clock behind) to its last.
  for (const age of [-1, 0, 10, over - 1]) for (const own of [-1, 0, DELVE_FULL_DAYS - 1]) assert.deepEqual(delveLean(age, own), { strength: 1, twice: false }, `${age}, ${own}`);
  // After them, twice their share as the games' eases.
  assert.deepEqual(delveLean(DELVE_FULL_DAYS, DELVE_FULL_DAYS), { strength: 1, twice: true });
  assert.deepEqual(delveLean(NEW_HALF_DAYS + 7, 9), { strength: newStrength(NEW_HALF_DAYS + 7), twice: true });
  // Over for everyone once the games' is, those just come too.
  for (const own of [0, 30]) assert.deepEqual(delveLean(over, own), { strength: 0, twice: false });
});

test('Delve’s lean counts from this player’s first run since the items came, by UTC days, never from before them', () => {
  const day = (n: number, hour = 12) => Date.parse('2026-12-11T00:00:00Z') + n * 86_400_000 + hour * 3_600_000;
  const some = [...items.filter((it) => it.id === 'a'), { id: 'old' }];
  let now = day(9);
  let first: number | null = null;
  const asked: string[] = [];
  const lean = newestLean(some, () => now, (release) => (asked.push(release), first))!;
  // None yet: this run is their first, nine days after the items came.
  assert.deepEqual(lean.delve!(), { strength: 1, twice: false });
  assert.deepEqual(asked, ['1.0']);
  first = day(7, 23);
  assert.deepEqual(lean.delve!(), { strength: 1, twice: false }, 'two UTC days on');
  first = day(6, 1);
  assert.deepEqual(lean.delve!(), { strength: newStrength(9), twice: true }, 'three');
  // One noted before the items came (a clock behind) counts from their first day.
  [first, now] = [day(-10), day(2)];
  assert.deepEqual(lean.delve!(), { strength: 1, twice: false });
  now = day(3);
  assert.deepEqual(lean.delve!(), { strength: 1, twice: true });
  // Without a way to ask, Delve leans as the games do; and what a run is noted under.
  assert.equal(newestLean(some, () => now)!.delve, undefined);
  assert.equal(newestRelease(some), '1.0');
  assert.equal(newestRelease([{ id: 'old' }]), null);
});
