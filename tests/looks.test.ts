import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Item } from '../src/lib/game.ts';
import { loadLooks, readLooks } from '../src/lib/looks.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const raw = JSON.parse(readFileSync(new URL('../src/data/looks.json', import.meta.url), 'utf8'));
const { looksLike, lookScore, lookalikePool } = readLooks(raw);
const byName = new Map(items.map((it) => [it.name, it]));
const byId = new Map(items.map((it) => [it.id, it]));
const id = (name: string) => byName.get(name)!.id;
const names = (looks: readonly { id: string }[]) => looks.map((l) => byId.get(l.id)!.name);

/** Kept per item by scripts/looks.mjs. */
const KEEP = 12;

test('every item has its closest look-alikes from its own group, and nothing else', () => {
  assert.equal(raw.v, 1);
  assert.deepEqual(Object.keys(raw.looks).sort(), items.map((it) => it.id).sort());
  for (const it of items) {
    const looks = looksLike(it.id);
    const group = items.filter((o) => o.group === it.group).length;
    assert.equal(looks.length, Math.min(KEEP, group - 1), it.name);
    assert.equal(new Set(looks.map((l) => l.id)).size, looks.length, `${it.name}: no repeats`);
    for (const l of looks) {
      assert.notEqual(l.id, it.id);
      assert.equal(byId.get(l.id)?.group, it.group, `${it.name}: ${l.id} is in its group`);
    }
  }
});

test('scores are in [0, 1], best first, and the same either way round', () => {
  for (const it of items) {
    const looks = looksLike(it.id);
    looks.forEach((l, i) => {
      assert.ok(l.score >= 0 && l.score <= 1, `${it.name}: ${l.score}`);
      if (i) assert.ok(looks[i - 1].score >= l.score, `${it.name} is sorted`);
      const back = looksLike(l.id).find((b) => b.id === it.id);
      if (back) assert.equal(back.score, l.score);
      assert.equal(lookScore(it.id, l.id), l.score);
      assert.equal(lookScore(l.id, it.id), l.score);
    });
  }
});

test('the families drawn alike rank each other first', () => {
  const palms = ['Guiding Palm of the Eye', 'Guiding Palm of the Heart', 'Guiding Palm of the Mind'];
  for (const p of palms) assert.deepEqual(names(looksLike(id(p)).slice(0, 2)).sort(), palms.filter((o) => o !== p).sort(), p);
  assert.equal(names(looksLike(id('Whisper of the Brotherhood')))[0], 'Call of the Brotherhood');
  assert.equal(names(looksLike(id('Call of the Brotherhood')))[0], 'Whisper of the Brotherhood');
  // Re-coloured copies of the same drawing score well above an ordinary neighbour.
  assert.ok(lookScore(id('Guiding Palm of the Eye'), id('Guiding Palm of the Heart')) > 0.85);
  assert.ok(lookScore(id('Whisper of the Brotherhood'), id('Call of the Brotherhood')) > 0.85);
});

test('looks across groups, or of an unknown item, are empty', () => {
  assert.deepEqual(looksLike('no-such-item'), []);
  assert.equal(lookScore('no-such-item', id("Kaom's Heart")), 0);
  assert.equal(lookScore(id("Kaom's Heart"), id('Tabula Rasa') + 'x'), 0);
  assert.equal(lookScore(id('Whisper of the Brotherhood'), id("Kaom's Heart")), 0);
});

test('lookalikePool puts the look-alikes first, keeps the rest in order, never returns the answer', () => {
  const answer = byName.get('Guiding Palm of the Mind')!;
  const sceptres = items.filter((it) => it.group === 'Sceptres');
  const pool = lookalikePool(answer.id, sceptres, 3);
  assert.deepEqual(names(pool.slice(0, 2)).sort(), ['Guiding Palm of the Eye', 'Guiding Palm of the Heart']);
  assert.equal(pool.length, 3);
  assert.ok(!pool.includes(answer));

  // Unranked candidates (another group) come after, in the order given.
  const rings = items.filter((it) => it.group === 'Rings').slice(0, 4);
  const mixed = lookalikePool(answer.id, [...rings, ...sceptres], 20);
  assert.deepEqual(mixed.slice(-rings.length), rings);
  assert.equal(mixed.length, rings.length + sceptres.length - 1);

  // A new item, missing from the data, keeps the caller's order.
  assert.deepEqual(lookalikePool('no-such-item', rings, 3), rings.slice(0, 3));
  assert.deepEqual(lookalikePool(answer.id, sceptres, 0), []);
});

test('the same input gives the same pool', () => {
  for (const it of items.slice(0, 60)) {
    const group = items.filter((o) => o.group === it.group);
    assert.deepEqual(lookalikePool(it.id, group, 7), lookalikePool(it.id, group, 7));
    assert.deepEqual(
      lookalikePool(it.id, group, 7).map((o) => o.id).slice(0, Math.min(7, looksLike(it.id).length)),
      looksLike(it.id).slice(0, 7).map((l) => l.id),
      it.name,
    );
  }
});

test('loadLooks fetches the same table, once', async () => {
  const [a, b] = await Promise.all([loadLooks(), loadLooks()]);
  assert.equal(a, b);
  for (const it of items.slice(0, 40)) assert.deepEqual(a.looksLike(it.id), looksLike(it.id));
  const palm = id('Guiding Palm of the Eye');
  assert.equal(a.lookScore(palm, id('Guiding Palm of the Heart')), lookScore(palm, id('Guiding Palm of the Heart')));
});
