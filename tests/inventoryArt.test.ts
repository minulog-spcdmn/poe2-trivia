import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, WARD_CRACK, inventoryWords, momentOf, vesselLabel } from '../src/lib/inventoryArt.ts';
import type { Inventory } from '../src/lib/delve.ts';

const inv = (o: Partial<Inventory> = {}): Inventory => ({ wards: 0, flares: 0, dynamite: 0, shards: 0, ...o });

test('a phial says its lives, and what it carries when it carries anything', () => {
  assert.equal(vesselLabel(3, null), '3 lives left');
  assert.equal(vesselLabel(1, inv()), '1 life left');
  assert.equal(vesselLabel(2, inv({ wards: 1, flares: 2 })), '2 lives, 1 Azurite Ward, 2 flares');
  assert.equal(vesselLabel(1, inv({ wards: 2, shards: 1, dynamite: 1 })), '1 life, 2 Azurite Wards, 1 azurite shard, 1 stick of dynamite');
  assert.equal(inventoryWords(inv({ flares: 1, dynamite: 3 })), '1 flare, 3 sticks of dynamite');
});

test('changes make one moment: a shatter first, a forge over a plain ward, finds, then things used', () => {
  const g = (item: keyof Inventory) => ({ item, change: 'gained' as const });
  const u = (item: keyof Inventory) => ({ item, change: 'used' as const });
  assert.equal(momentOf([]), null);
  assert.equal(momentOf([u('wards')]), 'shatter');
  assert.equal(momentOf([g('wards'), u('shards')]), 'forge');
  assert.equal(momentOf([g('wards')]), 'ward');
  assert.equal(momentOf([g('shards')]), 'shard');
  assert.equal(momentOf([g('flares')]), 'flare');
  assert.equal(momentOf([g('dynamite')]), 'dynamite');
  assert.equal(momentOf([u('flares')]), 'burn');
  assert.equal(momentOf([u('dynamite')]), 'blast');
});

test('the glyphs are drawn from finite numbers only', () => {
  for (const [kind, g] of Object.entries(GLYPHS)) {
    const all = [g.rim, g.edges, g.hatch, g.catch, ...g.faces.map((f) => f.d)].join(' ');
    assert.doesNotMatch(all, /NaN|Infinity|undefined/, kind);
    assert.ok(g.rim.length && g.edges.length && g.faces.length, kind);
    assert.ok(g.aspect > 0 && g.aspect < 2, kind);
  }
  // Every glyph but the flare's rod is hatched down one side.
  for (const kind of ['ward', 'shard', 'dynamite'] as const) assert.ok(GLYPHS[kind].hatch.length > 0, kind);
  assert.match(WARD_CRACK.left, /^M.*Z$/);
  assert.match(WARD_CRACK.right, /^M.*Z$/);
});
