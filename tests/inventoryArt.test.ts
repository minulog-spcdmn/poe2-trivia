import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BARRIER, CASINGS, GLYPHS, WARD_BREAK, WARD_CRACK, WARD_NEXT, inventoryWords, momentOf, vesselLabel } from '../src/lib/inventoryArt.ts';
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
  // A third ward mined outright drops the shard held: no forge when the reveal says none was.
  assert.equal(momentOf([{ item: 'wards', change: 'gained' }, u('shards')], false), 'ward');
  assert.equal(momentOf([{ item: 'wards', change: 'gained' }, u('shards')], true), 'forge');
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

test('a ward encases one chamber each, from the base, and breaks into two pieces', () => {
  assert.equal(CASINGS.length, 3);
  const finite = (d: string | undefined) => assert.doesNotMatch(d ?? '', /NaN|Infinity|undefined/);
  CASINGS.forEach(({ whole, shard, pieces }, k) => {
    for (const c of [whole, shard, ...pieces]) {
      for (const d of [c.rim, c.edges, c.hatch, c.catch, c.hollow, c.front, c.clip, c.crack, ...c.faces.map((f) => f.d)]) finite(d);
      assert.match(c.rim, /^M.*Z$/, `chamber ${k}`);
      assert.ok(c.hatch.length > 0, `chamber ${k} is hatched below`);
    }
    // Each casing spans its own chamber, in order along the phial, and two never overlap.
    assert.ok(whole.from < whole.to);
    if (k) assert.ok(CASINGS[k - 1].whole.to < whole.from, `casings ${k - 1} and ${k} overlap`);
    // A shard is cut away past its middle; a breaking ward's two pieces share one crack.
    assert.match(shard.clip ?? '', /^M.*Z$/);
    assert.ok(shard.crack);
    assert.notEqual(pieces[0].clip, pieces[1].clip);
    assert.equal(pieces[0].crack, pieces[1].crack);
    assert.equal(whole.clip, undefined);
  });
  // The pointed ends reach past the frame (0 to 64) by the casing's standoff, no further.
  assert.ok(CASINGS[0].whole.from < 0 && CASINGS[0].whole.from > -4);
  assert.ok(CASINGS[2].whole.to > 64 && CASINGS[2].whole.to < 68);
});

test("a ward's barrier encloses the phial and its casings, and breaks into facets thrown outward", () => {
  const [x, y, w, h] = BARRIER.box;
  // Round the whole phial (64 x 12) and its casings, which stand 2.2 off the frame.
  assert.ok(x < -2 && x + w > 66 && y < -2 && y + h > 14);
  const all = [BARRIER.glaze, BARRIER.seams, ...BARRIER.pieces.flatMap((p) => [p.d, p.lines, p.hatch])].join(' ');
  assert.doesNotMatch(all, /NaN|Infinity|undefined/);
  // Eight facets on each arc, and a lozenge at each apex.
  assert.equal(BARRIER.pieces.length, 18);
  for (const p of BARRIER.pieces) {
    assert.match(p.d, /^M.*Z$/);
    assert.ok(Number.isFinite(p.dx) && Number.isFinite(p.dy) && Number.isFinite(p.turn));
    assert.ok(Math.hypot(p.dx, p.dy) > 5, 'each facet flies clear');
  }
  // The dark facets are hatched down one side; the lit ones are not.
  assert.ok(BARRIER.pieces.some((p) => p.tone === 'dark' && p.hatch.length > 0));
  assert.ok(BARRIER.pieces.filter((p) => p.tone === 'lit').length > 2);
  // It breaks before a cave-in's second blow lands.
  assert.ok(WARD_BREAK > 0 && WARD_BREAK < WARD_NEXT);
});
