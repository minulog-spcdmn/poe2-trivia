// How the item tally's items are ranked (lib/itemTallyRank.ts), as the stats
// page's Items view and scripts/item-tally.mjs list them: each item's misses
// against those its contexts' rates expect, with a 90% interval, the items
// surely missed most first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TALLY_ROWS, TALLY_VERSION, interval, rank, scoreOf, sortRanked, type Asked, type TallyRow } from '../src/lib/itemTallyRank.ts';

const row = (item: string, ctx: string, r: number, w: number, more: Partial<TallyRow> = {}): TallyRow => ({ v: 1, item, form: 'n', ctx, first: 0, r, w, ...more });
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

/** Wilson's interval for a share with its continuity correction, at 90%: the closed form the one-context interval must match. */
function wilson(w: number, n: number): [number, number] {
  const z = 1.645;
  const f = w / n;
  const low = w === 0 ? 0 : (2 * w + z * z - 1 - z * Math.sqrt(z * z - 2 - 1 / n + 4 * w * (1 - f) + 4 * f)) / (2 * (n + z * z));
  const high = w === n ? 1 : (2 * w + z * z + 1 + z * Math.sqrt(z * z + 2 - 1 / n + 4 * w * (1 - f) - 4 * f)) / (2 * (n + z * z));
  return [low, high];
}

test('interval: under one set of rules, Wilson’s interval for the miss share over the rate', () => {
  for (const [w, n, p] of [
    [3, 3, 0.5],
    [7, 20, 0.4],
    [15, 30, 0.54],
    [0, 12, 0.3],
    [40, 50, 0.6],
    [1, 1, 0.5],
  ]) {
    const [low, high] = interval([{ n, p }], w);
    const [l, h] = wilson(w, n);
    close(low, l / p, 1e-6);
    close(high, h / p, 1e-6);
  }
});

test('interval: no misses has nothing below, every answer missed reaches the most any score can', () => {
  assert.equal(interval([{ n: 10, p: 0.5 }], 0)[0], 0);
  // Missed every time: up to the score that misses every answer, 1 over the lowest rate, and no further.
  const asked = [
    { n: 4, p: 0.5 },
    { n: 6, p: 0.25 },
  ];
  assert.equal(interval(asked, 10)[1], 4);
  // A context nobody missed in moves nothing; with none other, nothing can be said.
  assert.deepEqual(interval([{ n: 7, p: 0 }, ...asked], 3), interval(asked, 3));
  assert.deepEqual(interval([{ n: 7, p: 0 }], 0), [0, Infinity]);
});

test('interval: three misses of three where half miss is not yet clearly above 1, and a half-missed item is surer than a Poisson interval said', () => {
  assert.ok(interval([{ n: 3, p: 0.5 }], 3)[0] < 1);
  // 150 of 200 missed where half are: Byar's Poisson interval put it at 1.30 to 1.72.
  const [low, high] = interval([{ n: 200, p: 0.5 }], 150);
  assert.ok(low > 1.38 && high < 1.6, `${low} to ${high}`);
});

test('interval: over several contexts, the ends a fine scan of every score finds', () => {
  // (A seeded mix of contexts and misses; the scan checks every score a hundredth apart.)
  let seed = 7;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let t = 0; t < 200; t++) {
    const asked: Asked[] = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({ n: 1 + Math.floor(rnd() * 40), p: 0.05 + rnd() * 0.9 }));
    const n = asked.reduce((a, x) => a + x.n, 0);
    const w = Math.floor(rnd() * (n + 1));
    const top = 1 / Math.min(...asked.map((a) => a.p));
    const fits = (s: number) => {
      let m = 0;
      let v = 0;
      for (const a of asked) {
        const q = Math.min(1, s * a.p);
        m += a.n * q;
        v += a.n * q * (1 - q);
      }
      return m + 1.645 * Math.sqrt(v) >= w - 0.5 && m - 1.645 * Math.sqrt(v) <= w + 0.5;
    };
    const fit: number[] = [];
    for (let s = 0; s <= top; s += 0.01) if (fits(s)) fit.push(s);
    const [low, high] = interval(asked, w);
    close(low, fit[0], 0.011);
    close(high, Math.min(top, fit.at(-1)! + 0.01), 0.011);
  }
});

test('scoreOf: misses over expected, unless some answers would be missed more often than every time', () => {
  // No context past all its answers: the plain ratio, to the last digit.
  const plain = [
    { n: 10, p: 0.1 },
    { n: 10, p: 0.5 },
  ];
  assert.equal(scoreOf(plain, 6), 6 / (10 * 0.1 + 10 * 0.5));
  // 38 of 40 missed, half where a fifth miss and half where seven in ten do: misses over expected, 2.11,
  // would miss the second half 1.48 times over. At 4.5 those are all missed and the first half's 18 make up the rest.
  const capped = [
    { n: 20, p: 0.2 },
    { n: 20, p: 0.7 },
  ];
  close(scoreOf(capped, 38)!, 4.5, 1e-9);
  // Every answer missed: the score that misses them all.
  close(scoreOf(capped, 40)!, 5, 1e-9);
  // Nothing expected: no score.
  assert.equal(scoreOf([{ n: 5, p: 0 }], 0), null);
});

test('scoreOf: always within its interval', () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let t = 0; t < 500; t++) {
    const asked: Asked[] = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({ n: 1 + Math.floor(rnd() * 40), p: 0.02 + rnd() * 0.96 }));
    const n = asked.reduce((a, x) => a + x.n, 0);
    // Misses leaning high, where answers pass their cap.
    const w = Math.min(n, Math.floor(rnd() ** 0.3 * (n + 1)));
    const s = scoreOf(asked, w)!;
    const [low, high] = interval(asked, w);
    assert.ok(low <= s + 1e-9 && s <= high + 1e-9, `${JSON.stringify(asked)} ${w}: ${s} outside ${low} to ${high}`);
  }
});

test('rank: an item is held to its own contexts, its expected misses summed over them', () => {
  const rows = [
    // d1: 20 answers, 2 missed (rate 0.1); d5: 20 answers, 10 missed (rate 0.5).
    row('a', 'd1', 9, 1),
    row('b', 'd1', 9, 1),
    row('a', 'd5', 5, 5),
    row('c', 'd5', 5, 5),
  ];
  const { v, list } = rank(rows);
  assert.equal(v, 1);
  const a = list.find((s) => s.item === 'a')!;
  assert.equal(a.n, 20);
  assert.equal(a.miss, 6);
  close(a.expected, 10 * 0.1 + 10 * 0.5);
  close(a.score!, 1);
  const [low, high] = interval(
    [
      { n: 10, p: 0.1 },
      { n: 10, p: 0.5 },
    ],
    6,
  );
  close(a.low, low);
  close(a.high, high);
  assert.ok(a.low < 1 && a.high > 1);
  // Deep or shallow, each item missed exactly as its context's rate: all score 1.
  for (const s of list) close(s.score!, 1);
});

test('rank: most surely missed first, by the interval low end', () => {
  const rows = [
    // A big context where most know the item.
    ...Array.from({ length: 20 }, (_, i) => row(`k${i}`, 'd2', 95, 5)),
    // Missed half the time over many answers: surely missed more.
    row('hard', 'd2', 50, 50),
    // Missed every time, but only twice: as high a share, far less sure.
    row('few', 'd2', 0, 2),
  ];
  const { list } = rank(rows);
  assert.equal(list[0].item, 'hard');
  const few = list.find((s) => s.item === 'few')!;
  assert.ok(few.score! > list[0].score!, 'the share alone would put it first');
  assert.ok(few.low < list[0].low);
});

test('rank: easiest first, the items surely missed least first, by the interval high end', () => {
  const rows = [
    // A big context where a fifth of the answers miss.
    ...Array.from({ length: 20 }, (_, i) => row(`k${i}`, 'd2', 80, 20)),
    // Never missed over many answers: surely missed less.
    row('easy', 'd2', 100, 0),
    // Never missed, but only twice: as low a share, far less sure.
    row('few', 'd2', 2, 0),
    // Nothing expected: no score, last either way.
    row('sure', 'practice', 10, 0),
  ];
  const { list } = rank(rows, { order: 'easiest' });
  assert.equal(list[0].item, 'easy');
  assert.ok(list[0].high < 1, 'clear below 1');
  const few = list.find((s) => s.item === 'few')!;
  assert.equal(few.score, 0);
  assert.ok(few.high > list[1].high, 'the share alone would put it beside the first');
  assert.equal(list.at(-1)!.item, 'sure');
  // The same items and figures as hardest first, the default, in another order.
  const hardest = rank(rows).list;
  assert.equal(hardest.at(-1)!.item, 'sure');
  assert.notEqual(hardest[0].item, 'easy');
  assert.deepEqual(
    [...hardest].sort((a, b) => a.item.localeCompare(b.item)),
    [...list].sort((a, b) => a.item.localeCompare(b.item)),
  );
  assert.deepEqual(rank(rows, { order: 'hardest' }).list, hardest);
  // The Items view ranks once and re-sorts for its order: the same list either way.
  assert.deepEqual(sortRanked([...hardest], 'easiest'), list);
  assert.deepEqual(sortRanked([...list]), hardest);
});

test('rank: the filters apply before the rates', () => {
  const rows = [
    // First meetings are missed far more: 50% against 10% for the rest.
    row('a', 'd1', 5, 5, { first: 1 }),
    row('b', 'd1', 5, 5, { first: 1 }),
    row('a', 'd1', 45, 5),
    row('b', 'd1', 45, 5),
  ];
  // Among first meetings alone, a is as missed as the rest.
  const a = rank(rows, { first: true }).list.find((s) => s.item === 'a')!;
  assert.equal(a.n, 10);
  close(a.expected, 5);
  close(a.score!, 1);
  // The form and the mode narrow it the same way.
  const art = [row('x', 'd1', 0, 10, { form: 'a' }), row('y', 'd1', 10, 0, { form: 'a' }), row('x', 'practice', 10, 0)];
  assert.deepEqual(
    rank(art, { form: 'a' }).list.map((s) => [s.item, s.n]),
    [
      ['x', 10],
      ['y', 10],
    ],
  );
  assert.deepEqual(
    rank(art, { mode: 'practice' }).list.map((s) => s.item),
    ['x'],
  );
  assert.deepEqual(
    rank([row('g', 'g3', 1, 1), row('t', 't-cruel', 1, 1), row('r', 'r-eternal', 1, 1), row('d', 'daily', 1, 1)], { mode: 'together' }).list.map((s) => s.item),
    ['g'],
  );
});

test('rank: this build’s version by default (not a newer one sent made up), another when asked', () => {
  const rows = [row('now', 'd1', 1, 1, { v: TALLY_VERSION }), row('made-up', 'd1', 1, 1, { v: 1000 })];
  assert.deepEqual(
    rank(rows).list.map((s) => s.item),
    ['now'],
  );
  assert.equal(rank(rows).v, TALLY_VERSION);
  assert.deepEqual(
    rank(rows, { v: 1000 }).list.map((s) => s.item),
    ['made-up'],
  );
  assert.deepEqual(rank([]), { v: TALLY_VERSION, list: [] });
});

test('rank: the fewest answers is counted over every context, after the rates', () => {
  const rows = [row('a', 'd1', 3, 2), row('a', 'd2', 3, 2), row('b', 'd1', 5, 0), row('b', 'd2', 0, 0)];
  // a has 10 answers in all, though 5 in each context.
  assert.deepEqual(
    rank(rows, { min: 10 }).list.map((s) => s.item),
    ['a'],
  );
  // Leaving b out doesn't change a's rates: d1 is still 2 of 10 (b's 5 right in it), d2 2 of 5.
  close(rank(rows, { min: 10 }).list[0].expected, 5 * 0.2 + 5 * 0.4);
});

test('rank: with nothing expected there is no score, and it goes last', () => {
  const rows = [row('sure', 'practice', 10, 0), row('a', 'd1', 5, 5), row('b', 'd1', 8, 2)];
  const { list } = rank(rows);
  const sure = list.at(-1)!;
  assert.equal(sure.item, 'sure');
  assert.equal(sure.score, null);
  assert.equal(sure.low, 0);
  assert.equal(sure.high, Infinity);
  // Below an item never missed where others were (its low end 0 too), however many more answers it has.
  const tied = rank([row('sure', 'practice', 50, 0), row('a', 'd1', 5, 0), row('b', 'd1', 8, 2)]).list;
  assert.deepEqual(
    tied.map((s) => s.item),
    ['b', 'a', 'sure'],
  );
});

test('the stats page takes the Worker’s rows only in the shape it knows', async () => {
  const { tallyRowsOf } = await import('../src/statsPage/tally.ts');
  const ok = [{ v: 1, item: '4f588a87bc12', form: 'n', ctx: 'd3', first: 0, r: 4, w: 1 }];
  assert.deepEqual(tallyRowsOf(ok), ok);
  assert.deepEqual(tallyRowsOf([]), []);
  for (const bad of [null, {}, [{ ...ok[0], form: 'x' }], [{ ...ok[0], r: -1 }], [{ ...ok[0], first: 2 }], [{ item: 'a' }]]) assert.throws(() => tallyRowsOf(bad));
});

test('the demo’s made-up tally: most items, deeper bands missed more, a few obscure, ids no item has', async () => {
  const { demoTally } = await import('../src/statsPage/demo.ts');
  const { default: items } = await import('../src/data/items.json', { with: { type: 'json' } });
  const ids = items.map((i: { id: string }) => i.id);
  const rows = demoTally(ids);
  assert.deepEqual(demoTally(ids), rows, 'the same rows every time');
  const known = new Set(ids);
  const tallied = new Set(rows.map((x) => x.item));
  assert.ok([...tallied].filter((id) => known.has(id)).length > 0.9 * ids.length);
  assert.ok([...tallied].some((id) => !known.has(id)));
  for (const x of rows) assert.match(x.item, /^[0-9a-f]{12}$/);
  const missed = (ctx: string) => {
    const s = rows.filter((x) => x.ctx === ctx).reduce((a, x) => ({ n: a.n + x.r + x.w, w: a.w + x.w }), { n: 0, w: 0 });
    return s.w / s.n;
  };
  assert.ok(missed('d1') < missed('d5') && missed('d5') < missed('d10'));
  const { list } = rank(rows, { min: 10 });
  assert.ok(list.filter((s) => s.low > 2).length >= 3, 'a handful clearly obscure');
  // Each score within its own interval, those missed past their contexts' rates too.
  for (const s of rank(rows).list) if (s.score !== null) assert.ok(s.low <= s.score + 1e-9 && s.score <= s.high + 1e-9, `${s.item}: ${s.score} outside ${s.low} to ${s.high}`);
});

test('rank: a tally at its cap of rows ranks as any other', () => {
  const rows = Array.from({ length: TALLY_ROWS }, (_, i) => row((i % 600).toString(16).padStart(12, '0'), `d${1 + (i % 20)}`, 3, 1, { form: i % 2 ? 'n' : 'a', first: i % 3 ? 0 : 1 }));
  const { v, list } = rank(rows);
  assert.equal(v, 1);
  assert.equal(list.length, 600);
});
