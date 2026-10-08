import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deal, shuffle, START_LINES, type Deck } from '../src/lib/delveStart.ts';
import { shownDepth } from '../src/lib/delve.ts';

test('start lines: three to five words, no digits or em dashes, no repeats', () => {
  assert.ok(START_LINES.length >= 50);
  assert.equal(new Set(START_LINES).size, START_LINES.length);
  for (const line of START_LINES) {
    assert.ok(!/[0-9]/.test(line) && !line.includes(String.fromCharCode(0x2014)), line);
    const words = line.split(/\s+/).length;
    assert.ok(words >= 3 && words <= 5, line);
    // Short enough for the banner at 375 px (the widest measured fit is 25 characters).
    assert.ok(line.length <= 27, line);
  }
});

// A seeded random, so the deck's tests are repeatable.
function seeded(seed: number) {
  let x = seed >>> 0 || 1;
  return () => ((x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 2 ** 32;
}

test('start lines: no zone names, nothing spoiled before it is reached', () => {
  for (const z of ['Mines', 'Magma', 'Frozen', 'Fungal', 'Vaal', 'Abyss', 'Petrified', 'Sulphur', 'Primeval', 'City'])
    assert.ok(START_LINES.every((l) => !l.includes(z)), z);
});

test('start line deck: every line once before any comes back, never the same twice running', () => {
  const n = START_LINES.length;
  const random = seeded(7);
  let deck: Deck | null = null;
  const seen: number[] = [];
  for (let run = 0; run < n * 3; run++) {
    const dealt = deal(deck, 1_760_000_000_000 + run, n, random);
    deck = dealt.deck;
    seen.push(dealt.line);
  }
  for (let round = 0; round < 3; round++) assert.equal(new Set(seen.slice(round * n, (round + 1) * n)).size, n);
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
});

test('start line deck: a run keeps its line through a reload, without dealing another', () => {
  const random = seeded(3);
  const first = deal(null, 100, START_LINES.length, random);
  const again = deal(first.deck, 100, START_LINES.length, random);
  assert.equal(again.line, first.line);
  assert.equal(again.deck, first.deck);
  const other = deal(first.deck, 200, START_LINES.length, random);
  assert.equal(other.deck.next, first.deck.next + 1);
  // The run before stays remembered too (a resume after another tab's run).
  assert.equal(deal(other.deck, 100, START_LINES.length, random).line, first.line);
});

test('start line deck: a broken or outdated deck is shuffled anew', () => {
  const n = START_LINES.length;
  for (const bad of [{}, { order: [0, 1], next: 0, runs: [] }, { order: [...Array(n).keys()].map(() => 0), next: 0, runs: [] }]) {
    const { line, deck } = deal(bad as Deck, 5, n, seeded(9));
    assert.ok(line >= 0 && line < n);
    assert.equal(new Set(deck.order).size, n);
  }
  assert.equal(shuffle(1, seeded(1), 0)[0], 0);
});

test('shown depth: a run starts at 0, a zone on a round number, the endless strata at 100', () => {
  assert.equal(shownDepth(1), 0);
  assert.equal(shownDepth(10), 9);
  assert.equal(shownDepth(11), 10);
  assert.equal(shownDepth(91), 90);
  assert.equal(shownDepth(101), 100);
});
