import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSeen, lineOf, MAX_SEEN, pickLine, sawLine, START_LINES } from '../src/lib/delveStart.ts';
import { fromOldDeck } from '../src/lib/delveStartSeen.ts';
import { room } from './helpers.ts';
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

test('start lines: no zone names, nothing spoiled before it is reached', () => {
  for (const z of ['Mines', 'Magma', 'Frozen', 'Fungal', 'Vaal', 'Abyss', 'Petrified', 'Sulphur', 'Primeval', 'City'])
    assert.ok(START_LINES.every((l) => !l.includes(z)), z);
});

/** A device's runs on its own: the lines it is shown, run after run. */
function solo(runs: number, from = 1_760_000_000_000) {
  let seen: number[] = [];
  const shown: number[] = [];
  for (let run = 0; run < runs; run++) {
    const line = pickLine([seen], from + run * 997);
    shown.push(line);
    seen = sawLine(seen, line);
  }
  return shown;
}

test('start line pick: on its own, every line once before any comes back, then none within half the pool', () => {
  const n = START_LINES.length;
  const shown = solo(n * 4);
  assert.equal(new Set(shown.slice(0, n)).size, n);
  for (let i = 0; i < shown.length; i++) {
    const back = shown.slice(0, i).lastIndexOf(shown[i]);
    if (back >= 0) assert.ok(i - back > Math.floor(n / 2), `line ${shown[i]} back after ${i - back} runs`);
  }
  // Each time round comes in another order, not the first one's again.
  assert.notDeepEqual(shown.slice(n, 2 * n), shown.slice(0, n));
});

test('start line pick: together, a line nobody has seen, else one the group saw longest ago', () => {
  const n = START_LINES.length;
  const all = [...Array(n).keys()];
  // Between them they have seen all but one line.
  const a = all.slice(0, 30);
  const b = all.slice(29, n - 1);
  for (let at = 0; at < 20; at++) assert.equal(pickLine([a, b], 1000 + at), n - 1);
  // Everyone has seen everything, in opposite orders: never what either saw lately.
  const back = [...all].reverse();
  for (let at = 0; at < 50; at++) {
    const line = pickLine([all, back], 5000 + at * 31);
    assert.ok(Math.min(line, n - 1 - line) >= Math.floor(n / 4), `line ${line}`);
  }
  // Someone with nothing seen (new, or a bot) changes nothing.
  for (let at = 0; at < 20; at++) assert.equal(pickLine([a, []], at), pickLine([a], at));
});

test('start line pick: the same run picks the same line, whoever asks', () => {
  const seen = [[3, 1, 4], [1, 5, 9, 2, 6]];
  assert.equal(pickLine(seen, 1_760_000_123_456), pickLine(seen, 1_760_000_123_456));
  // A run from before the host picked shows one from its id alone, the same everywhere.
  assert.equal(lineOf({ startedAt: 42 }), lineOf({ startedAt: 42 }));
  assert.equal(lineOf({ startedAt: 42, line: 'Stay in the light' }), 'Stay in the light');
});

test('start line lists: whatever arrives is cleaned, never refused', () => {
  const n = START_LINES.length;
  assert.deepEqual(cleanSeen([2, 2, -1, 1.5, '3', n, 7, null]), [2, 7]);
  assert.deepEqual(cleanSeen('nope'), []);
  assert.deepEqual(cleanSeen(null), []);
  assert.equal(cleanSeen([...Array(500).keys()].map((i) => i % n)).length, n);
  assert.ok(cleanSeen([...Array(500).keys()], 500).length <= MAX_SEEN);
  assert.deepEqual(sawLine([4, 2, 9], 9), [9, 4, 2]);
  assert.deepEqual(sawLine([4, 2], 7), [7, 4, 2]);
});

test('start line lists: an old deck is taken over, its last runs first', () => {
  // Just shuffled anew: its last run's line is from the time round before, and still the newest.
  assert.deepEqual(fromOldDeck({ order: [8, 3, 5], next: 1, runs: [[30, 8], [20, 6], [10, 9]] }), [8, 6, 9]);
  // Midway through: the last runs, then the rest dealt this time round, newest first.
  assert.deepEqual(fromOldDeck({ order: [1, 2, 3, 4, 5], next: 4, runs: [[40, 4], [30, 3]] }), [4, 3, 2, 1]);
  // Whatever is broken is left out, not taken over.
  assert.deepEqual(fromOldDeck({ order: 'x', next: 2, runs: [[1, 7], 'y', [2, -1]] }), [7]);
  assert.deepEqual(fromOldDeck(null), []);
});

test('start line: the host picks one for the run, from what the players have seen', () => {
  const n = START_LINES.length;
  const h = room({ players: 2, start: false });
  // Between them they've seen all but line 5.
  const asked: string[][] = [];
  h.engine.setStartLines((ids) => {
    asked.push(ids);
    return [[...Array(n).keys()].filter((i) => i !== 5 && i % 2 === 0), [...Array(n).keys()].filter((i) => i !== 5 && i % 2 === 1)];
  });
  h.act({ type: 'start' });
  assert.equal(h.s.delve!.line, START_LINES[5]);
  assert.deepEqual(asked, [h.s.delve!.entrants]);
  // "Play again" starts the next run the same way.
  h.act({ type: 'restart', play: true });
  assert.equal(asked.length, 2);
  assert.equal(h.s.delve!.line, START_LINES[5]);
  // Without anyone to ask (the bot, tools), a run still has its line.
  const plain = room({ players: 1 });
  assert.ok(START_LINES.includes(plain.s.delve!.line!));
});

test('shown depth: a run starts at 0, a zone on a round number, the endless strata at 100', () => {
  assert.equal(shownDepth(1), 0);
  assert.equal(shownDepth(10), 9);
  assert.equal(shownDepth(11), 10);
  assert.equal(shownDepth(91), 90);
  assert.equal(shownDepth(101), 100);
});
