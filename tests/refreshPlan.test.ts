import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedItems, reconcile, refreshArgs, summaryLines, withoutTooltip } from '../scripts/refresh-plan.mjs';

// A refresh (npm run fetch-data) on made-up lists, before and after: what it
// calls added, renamed, dropped and changed, and when it stops.

type Item = { id: string; name: string; base: string; group: string; category: string; kind: string; w: number; h: number; variants?: { id: string; base: string; w: number; h: number }[] };
const item = (id: string, name: string, more: Partial<Item> = {}): Item => ({
  id,
  name,
  base: 'Ring',
  group: 'Rings',
  category: 'Rings',
  kind: 'unique',
  w: 1,
  h: 1,
  ...more,
});
const before = () => [item('aaa', 'Ventor’s Gamble'), item('bbb', 'Andvarius'), item('ccc', 'Blackheart')];

test('the options: --rename takes "Old=>New", --drop a name, either as the next word or after =', () => {
  assert.deepEqual(refreshArgs(['--rename', 'Old One=>New One', '--drop=Gone', '--shrink', '--rename=A => B', '--drop', 'Also Gone']), {
    shrink: true,
    renames: [
      ['Old One', 'New One'],
      ['A', 'B'],
    ],
    drops: ['Gone', 'Also Gone'],
  });
  assert.throws(() => refreshArgs(['--rename', 'No arrow']), /Old=>New/);
  assert.throws(() => refreshArgs(['--drop']), /needs a name/);
  assert.throws(() => refreshArgs(['--srhink']), /Unknown option/);
});

test('nothing gone: the new items are added, the rest kept', () => {
  const after = [...before(), item('ddd', 'Kalandra’s Touch')];
  assert.deepEqual(reconcile(before(), after), { added: ['Kalandra’s Touch'], renamed: [], dropped: [] });
});

test('an item gone with nothing to explain it stops the run, and says how to rerun', () => {
  const after = [item('aaa', 'Ventor’s Gamble'), item('bbb', 'Andvarius'), item('ddd', 'Black Heart')];
  assert.throws(
    () => reconcile(before(), after),
    (err: Error) =>
      (err as Error & { stop?: boolean }).stop === true &&
      err.message.includes('Gone from poe2db, unexplained: Blackheart') &&
      err.message.includes('New on poe2db: Black Heart') &&
      err.message.includes('Nothing was written') &&
      err.message.includes('npm run fetch-data -- --rename "Blackheart=>Black Heart"'),
  );
  // With nothing new to be renamed to, the example drops it.
  assert.throws(() => reconcile(before(), before().slice(0, 2)), /npm run fetch-data -- --drop "Blackheart"/);
});

test('a renamed item keeps its old id and takes the new name', () => {
  const after = [item('aaa', 'Ventor’s Gamble'), item('bbb', 'Andvarius'), item('ddd', 'Black Heart')];
  const plan = reconcile(before(), after, { renames: [['Blackheart', 'Black Heart']] });
  assert.deepEqual(plan, { added: [], renamed: [{ from: 'Blackheart', to: 'Black Heart', id: 'ccc' }], dropped: [] });
  assert.equal(after[2].id, 'ccc');
  assert.equal(after[2].name, 'Black Heart');
});

test('a dropped item goes', () => {
  assert.deepEqual(reconcile(before(), before().slice(0, 2), { drops: ['Blackheart'] }), { added: [], renamed: [], dropped: ['Blackheart'] });
});

test('a --rename or --drop that does not fit the lists stops the run', () => {
  const after = [item('aaa', 'Ventor’s Gamble'), item('bbb', 'Andvarius'), item('ddd', 'Black Heart')];
  const stops = (opts: { renames?: [string, string][]; drops?: string[] }, why: RegExp) => assert.throws(() => reconcile(before(), after, opts), why);
  stops({ renames: [['Nothing', 'Black Heart']], drops: ['Blackheart'] }, /there was no Nothing/);
  stops({ renames: [['Andvarius', 'Black Heart']], drops: ['Blackheart'] }, /Andvarius is still on poe2db/);
  stops({ renames: [['Blackheart', 'Nothing']] }, /poe2db has no Nothing/);
  stops({ drops: ['Andvarius', 'Blackheart'] }, /--drop "Andvarius": Andvarius is still on poe2db/);
  stops({ renames: [['Blackheart', 'Black Heart']], drops: ['Blackheart'] }, /renamed too/);
  // Renamed onto a name that was already there: that one is not new.
  stops({ renames: [['Blackheart', 'Andvarius']] }, /Andvarius is still on poe2db|already was/);
});

test('changed: by id, so a renamed item is held to what it was; its name aside', () => {
  const was = [item('aaa', 'Ventor’s Gamble'), item('ccc', 'Blackheart', { variants: [{ id: 'v1', base: 'Ruby', w: 1, h: 1 }] })];
  const now = [
    item('aaa', 'Ventor’s Gamble', { base: 'Gold Ring', w: 2 }),
    item('ccc', 'Black Heart', { variants: [{ id: 'v2', base: 'Ruby', w: 1, h: 1 }] }),
    item('ddd', 'Kalandra’s Touch'),
  ];
  assert.deepEqual(changedItems(was, now), [
    { name: 'Ventor’s Gamble', fields: ['base Ring => Gold Ring', 'w 1 => 2'] },
    { name: 'Black Heart', fields: ['variants'] },
  ]);
  assert.deepEqual(changedItems(was, was), []);
});

test('a new item or variant with no tooltip is left out; one that was there before is not', () => {
  const was = [item('aaa', 'Ventor’s Gamble', { variants: [{ id: 'v1', base: 'Ruby', w: 1, h: 1 }] })];
  const now = [
    item('aaa', 'Ventor’s Gamble', {
      variants: [
        { id: 'v1', base: 'Ruby', w: 1, h: 1 },
        { id: 'v2', base: 'Emerald', w: 1, h: 1 },
      ],
    }),
    item('ddd', 'Kalandra’s Touch'),
    item('eee', 'Death Rush'),
  ];
  assert.deepEqual(withoutTooltip(was, now, ['Kalandra’s Touch', 'Death Rush'], ['aaa', 'v1', 'v2', 'ddd']), { items: ['Kalandra’s Touch'], variants: ['v2'] });
});

test('the summary names what came, went, was renamed, changed and was left out', () => {
  assert.deepEqual(
    summaryLines({
      added: ['Kalandra’s Touch'],
      renamed: [{ from: 'Blackheart', to: 'Black Heart', id: 'ccc' }],
      dropped: ['Andvarius'],
      changed: [{ name: 'Ventor’s Gamble', fields: ['base Ring => Gold Ring'] }],
      leftOut: ['Death Rush'],
      newArt: ['Black Heart'],
    }),
    [
      'Summary:',
      '  Added (1): Kalandra’s Touch',
      '  Renamed (1): Blackheart => Black Heart',
      '  Dropped (1): Andvarius',
      '  Changed (1): Ventor’s Gamble (base Ring => Gold Ring)',
      '  New art for an item kept (1): Black Heart',
      '  Left out, no tooltip (1): Death Rush',
    ],
  );
  assert.deepEqual(summaryLines({}).slice(1), ['  Added (0)', '  Renamed (0)', '  Dropped (0)', '  Changed (0)', '  New art for an item kept (0)', '  Left out, no tooltip (0)']);
});
