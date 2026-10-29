import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALL_FOSSILS,
  FOSSILS,
  FOSSIL_COUNT,
  FOSSIL_DEAL,
  FOSSIL_IDS,
  dealFossil,
  fossilChance,
  fossilMask,
  aFossil,
  fossilsIn,
  heldFor,
  holds,
  isFossilMask,
  lackedBy,
  type FossilId,
  type FossilTaker,
} from '../src/lib/fossils.ts';
import { FOSSILS_KEY, FOSSILS_VERSION, emptyFossils, foundToday, heldMask, heldOf, keepFossils, lastFoundDay, keepRunFossils, loadFossils, mergeFossils, parseFossils, resetFossils, serializeFossils, type FossilStore } from '../src/lib/fossilStore.ts';
import { DELVE_RULESET, findOn, fossilOffer, fossilOn, fossilsOf, isWayOut, itemsWorkOn, livesOf, runFossils, shownDepth } from '../src/lib/delve.ts';
import type { DelveRun } from '../src/lib/delveRecord.ts';
import type { GameState } from '../src/lib/game.ts';
import { fossilEvents } from '../src/lib/count.ts';
import { runFacts, usualLifted } from '../src/lib/recap.ts';
import { FOSSIL_FLIGHT } from '../src/lib/fossilFlight.ts';
import { parseClientMsg } from '../src/lib/protocol.ts';
import { takeIn, takenNow } from '../src/lib/sync/shared.ts';
import { NONE, memoryStorage, right, room, seeded, wrong } from './helpers.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);

const COMMONS = FOSSILS.filter((f) => !f.rare).map((f) => f.id);
const RARES = FOSSILS.filter((f) => f.rare).map((f) => f.id);
const rareOf = (id: FossilId) => RARES.includes(id);
const fresh: FossilTaker = { held: 0, run: 0, today: false };
/** A taker past the hook (one common held, found on an earlier day), nothing given this run. */
const started: FossilTaker = { held: fossilMask(['scorched']), run: 0, today: false };

// ---- the set ----------------------------------------------------------------------

test('the set: 25 fossils, 17 common then 8 rare, each named, no crafting effects', () => {
  assert.equal(FOSSIL_COUNT, 25);
  assert.equal(COMMONS.length, 17);
  assert.equal(RARES.length, 8);
  assert.deepEqual(FOSSIL_IDS, [...COMMONS, ...RARES]);
  for (const f of FOSSILS) {
    assert.match(f.name, /^[A-Z][a-z]+ Fossil$/);
    assert.deepEqual(Object.keys(f).sort(), ['id', 'name', 'rare']);
  }
  assert.equal(new Set(FOSSIL_IDS).size, 25);
  assert.equal(aFossil('aberrant'), 'an Aberrant Fossil');
  assert.equal(aFossil('jagged'), 'a Jagged Fossil');
});

test('masks: one bit a fossil, every mask this build can read and no other', () => {
  assert.equal(fossilMask(FOSSIL_IDS), ALL_FOSSILS);
  assert.deepEqual(fossilsIn(fossilMask(['gilded', 'jagged'])), ['jagged', 'gilded']);
  assert.ok(holds(fossilMask(['dense']), 'dense'));
  assert.ok(!holds(fossilMask(['dense']), 'pristine'));
  for (const ok of [0, 1, ALL_FOSSILS]) assert.ok(isFossilMask(ok));
  for (const bad of [-1, ALL_FOSSILS + 1, 1.5, '3', null, undefined, NaN]) assert.ok(!isFossilMask(bad));
});

// ---- the chances ------------------------------------------------------------------

test('commons: none above shown 5, then 1%, 0.2% more a depth, 6% from shown 30; 30% beside a find', () => {
  const at = (shown: number, withFind = false) => fossilChance(false, shown + 1, withFind);
  assert.equal(at(4), 0);
  assert.equal(at(4, true), 0);
  assert.equal(at(5), 0.01);
  assert.equal(at(15), 0.03);
  assert.equal(at(30), 0.06);
  assert.equal(at(80), 0.06);
  assert.equal(at(10, true), 0.3);
  assert.equal(at(60, true), 0.3);
  assert.equal(shownDepth(FOSSIL_DEAL.common.from), 5);
  assert.equal(shownDepth(FOSSIL_DEAL.hookFrom), 5);
  // Never falling with depth.
  for (let d = 1; d < 200; d++) assert.ok(fossilChance(false, d + 1, false) >= fossilChance(false, d, false));
});

test('rares: none above shown 25, then 1%, 0.1% more a depth, 4% from shown 55; three times that beside a find', () => {
  const at = (shown: number, withFind = false) => fossilChance(true, shown + 1, withFind);
  for (const d of [0, 5, 10, 24]) {
    assert.equal(at(d), 0, `rare at ${d}`);
    assert.equal(at(d, true), 0, `rare beside a find at ${d}`);
  }
  assert.equal(at(25), 0.01);
  assert.equal(at(35), 0.02);
  assert.equal(at(55), 0.04);
  assert.equal(at(90), 0.04);
  assert.equal(at(25, true), 0.03);
  assert.equal(at(55, true), 0.12);
  for (let d = 1; d < 200; d++) assert.ok(fossilChance(true, d + 1, true) >= fossilChance(true, d, true));
});

test('the deal goes by the chances: a roll under the rares’ slice a rare, under the commons’ after it a common, else none', () => {
  const d = 46; // shown 45: rares 3%, commons 6% (a plain offer)
  const r = fossilChance(true, d, false);
  const c = fossilChance(false, d, false);
  const tier = (roll: number) => {
    const rolls = [roll, 0];
    const id = dealFossil(d, [started], { fresh: true, withFind: false }, () => rolls.shift() ?? 0);
    return id === null ? null : rareOf(id) ? 'rare' : 'common';
  };
  assert.equal(tier(0), 'rare');
  assert.equal(tier(r - 0.0001), 'rare');
  assert.equal(tier(r), 'common');
  assert.equal(tier(r + c - 0.0001), 'common');
  assert.equal(tier(r + c), null);
  assert.equal(tier(0.99), null);
  // Above the commons' first depth nothing, and no roll spent on it.
  let rolled = 0;
  assert.equal(dealFossil(5, [started], { fresh: true, withFind: true }, () => (rolled++, 0)), null);
  assert.equal(rolled, 0);
});

test('a slice its takers can’t take from finds nothing, and never feeds the other', () => {
  const d = 46;
  const r = fossilChance(true, d, true);
  // Every common held: a roll in the commons' slice finds nothing (not a rare).
  const allCommons: FossilTaker = { held: fossilMask(COMMONS), run: 0, today: false };
  assert.equal(dealFossil(d, [allCommons], { fresh: true, withFind: true }, () => r + 0.001), null);
  assert.ok(dealFossil(d, [allCommons], { fresh: true, withFind: true }, () => 0));
  // Every rare held: a roll in the rares' slice finds nothing (not a common).
  const allRares: FossilTaker = { held: fossilMask(['scorched', ...RARES]), run: 0, today: false };
  assert.equal(dealFossil(d, [allRares], { fresh: true, withFind: true }, () => 0), null);
  assert.ok(dealFossil(d, [allRares], { fresh: true, withFind: true }, () => r + 0.001));
});

test('one a day and one a run: once found today, or given this run, nothing more for that player, and no roll spent', () => {
  assert.equal(FOSSIL_DEAL.perRun, 1);
  assert.deepEqual(lackedBy({ ...started, today: true }, false), []);
  assert.deepEqual(lackedBy({ ...started, today: true }, true), []);
  assert.deepEqual(lackedBy({ ...started, run: 1 }, false), []);
  assert.deepEqual(lackedBy({ ...started, run: 1 }, true), []);
  assert.equal(lackedBy(started, false).length, 16);
  assert.equal(lackedBy(started, true).length, 8);
  let rolled = 0;
  assert.equal(dealFossil(60, [{ ...started, today: true }], { fresh: true, withFind: true }, () => (rolled++, 0)), null);
  assert.equal(dealFossil(60, [{ ...started, run: 1 }], { fresh: true, withFind: true }, () => (rolled++, 0)), null);
  assert.equal(rolled, 0);
  // Not even the hook: a first fossil is the day's.
  assert.equal(dealFossil(20, [{ ...fresh, run: 1 }], { fresh: true, withFind: false }, () => 0), null);
});

test('never a fossil its taker holds: drawn only from those lacked', () => {
  const rng = seeded(5);
  const held = fossilMask([...COMMONS.slice(0, 15), ...RARES.slice(0, 6)]);
  const t: FossilTaker = { held, run: 0, today: false };
  const seen = new Set<FossilId>();
  for (let i = 0; i < 6000; i++) {
    const id = dealFossil(80, [t], { fresh: false, withFind: true }, rng);
    if (id) seen.add(id);
  }
  assert.deepEqual([...seen].sort(), [...COMMONS.slice(15), ...RARES.slice(6)].sort());
});

test('together: a fossil is dealt if any taker could be given it, drawn from what those lack', () => {
  const allCommons: FossilTaker = { held: fossilMask(COMMONS), run: 0, today: false };
  const lacksOne: FossilTaker = { held: fossilMask(COMMONS.filter((id) => id !== 'deft')), run: 0, today: false };
  const doneToday: FossilTaker = { held: fossilMask(['scorched']), run: 0, today: true };
  const r = fossilChance(true, 46, false);
  assert.equal(dealFossil(46, [allCommons, doneToday], { fresh: false, withFind: false }, () => r + 0.001), null);
  assert.equal(dealFossil(46, [allCommons, doneToday, lacksOne], { fresh: false, withFind: false }, () => r + 0.001), 'deft');
});

test('the hook: until a taker holds a fossil, a fresh depth’s first offer from shown 5 holds a common, certain', () => {
  const rng = seeded(9);
  for (let d = 1; d < 6; d++) assert.equal(dealFossil(d, [fresh], { fresh: true, withFind: false }, rng), null, `before 5 (internal ${d})`);
  for (let d = 6; d < 60; d++) {
    const id = dealFossil(d, [fresh], { fresh: true, withFind: false }, () => 0.9999);
    assert.ok(id && !rareOf(id), `hook at ${d}`);
  }
  // Not on an offer after a miss at the depth: that one rolls as any.
  assert.equal(dealFossil(20, [fresh], { fresh: false, withFind: false }, () => 0.9999), null);
  // Past it (one held), a fresh depth rolls too.
  assert.equal(dealFossil(20, [started], { fresh: true, withFind: false }, () => 0.9999), null);
  // Together, while anyone standing holds none: a common they lack.
  const id = dealFossil(20, [started, fresh], { fresh: true, withFind: false }, () => 0);
  assert.ok(id && COMMONS.includes(id));
});

// ---- in the game ------------------------------------------------------------------

/** A run alone at `depth` (internal); `held`: the mask the device says it holds, `day` the UTC day of its latest find (the room's clock starts on day 0). */
function run(depth: number, o: { seed?: number; held?: number; day?: number | null; players?: string[] } = {}) {
  const h = room({ players: o.players ?? ['Ash'], seed: o.seed ?? 3 });
  h.engine.setFossilsHeld((ids) => ids.map(() => ({ held: o.held ?? 0, day: o.day ?? null })));
  h.edit((c) => (c.round = depth));
  const x = Object.assign(h, {
    /** Puts `id` on an ordinary card on offer, as a lucky roll would; its category. */
    plant(id: FossilId) {
      let cat = '';
      h.edit((c) => {
        const finds = (c.delve!.finds ?? []).map((f) => f.category);
        cat = c.offered.find((k) => !finds.includes(k) && !isWayOut(k))!;
        c.delve!.fossil = { category: cat, id };
      });
      return cat;
    },
    pick(category: string) {
      h.act({ type: 'pick', category });
      h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
    },
    answer(ok: boolean, from: string | null = null) {
      const q = h.s.question!;
      return h.act({ type: 'answer', index: ok ? right(q) : wrong(q), askedAt: q.askedAt }, from);
    },
  });
  return x;
}

test('a fossil’s card asks the depth’s own question; a right answer keeps the fossil', () => {
  const h = run(12, { held: fossilMask(['scorched']) });
  const cat = h.plant('jagged');
  assert.equal(fossilOn(h.s, cat), 'jagged');
  h.pick(cat);
  const q = h.s.question!;
  assert.equal(q.fossil, 'jagged');
  assert.equal(q.find, undefined);
  assert.ok(itemsWorkOn(q), 'a flare, a ward and dynamite all work on it');
  h.answer(true);
  assert.deepEqual(h.s.reveal!.fossil, { id: 'jagged', to: ['p0'] });
  assert.deepEqual(h.s.delve!.fossils?.map((f) => [f.id, f.depth, f.to]), [['jagged', 12, ['p0']]]);
});

test('a miss on a fossil’s card costs a life as any miss, and the fossil is gone', () => {
  const h = run(12, { held: fossilMask(['scorched']) });
  const cat = h.plant('jagged');
  const lives = livesOf(h.s, 'p0');
  h.pick(cat);
  h.answer(false);
  assert.equal(livesOf(h.s, 'p0'), lives - 1);
  assert.equal(h.s.reveal!.fossil, undefined);
  assert.equal(h.s.delve!.fossils, undefined);
  h.act({ type: 'next' });
  assert.notEqual(fossilOffer(h.s)?.id, 'jagged');
});

test('one already held, a second this run, or one more the same day gives nothing', () => {
  const held = run(12, { held: fossilMask(['scorched', 'jagged']) });
  held.pick(held.plant('jagged'));
  held.answer(true);
  assert.equal(held.s.reveal!.fossil, undefined);

  // One a run: after the first, not a common, not a rare.
  const twice = run(40, { held: fossilMask(['scorched']) });
  twice.pick(twice.plant('jagged'));
  twice.answer(true);
  assert.equal(twice.s.reveal!.fossil?.id, 'jagged');
  twice.act({ type: 'next' });
  twice.pick(twice.plant('gilded'));
  twice.answer(true);
  assert.equal(twice.s.reveal!.fossil, undefined, 'a second in the run');
  twice.act({ type: 'next' });
  assert.equal(fossilOffer(twice.s), null, 'and none dealt for them');

  // One a day: found today (the device's latest find, UTC) and nothing; found yesterday, and it comes.
  const day = 86_400_000;
  for (const [last, gives] of [[4, false], [3, true]] as const) {
    const h = run(40, { held: fossilMask(['scorched']), day: last });
    h.clock.now = 4 * day + 3_600_000;
    h.pick(h.plant('jagged'));
    h.answer(true);
    assert.equal(h.s.reveal!.fossil?.id, gives ? 'jagged' : undefined, `latest find on day ${last}, now day 4`);
  }
});

test('dynamite never fishes: a blast loses the fossil, and the new question is never one', () => {
  const h = run(20, { held: fossilMask(['scorched']) });
  h.give('p0', { dynamite: 1 });
  h.pick(h.plant('jagged'));
  h.act({ type: 'blast', askedAt: h.s.question!.askedAt });
  assert.equal(h.s.question!.fossil, undefined);
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  h.answer(true);
  assert.equal(h.s.reveal!.fossil, undefined);
  assert.equal(h.s.delve!.fossils, undefined);
});

test('a flare works on a fossil’s question, and the fossil stays on it', () => {
  const h = run(20, { held: fossilMask(['scorched']) });
  h.give('p0', { ...NONE, flares: 1 });
  h.pick(h.plant('jagged'));
  h.act({ type: 'flare', askedAt: h.s.question!.askedAt });
  assert.equal(h.s.question!.fossil, 'jagged');
  h.answer(true);
  assert.equal(h.s.reveal!.fossil?.id, 'jagged');
});

test('dealt in play: never on a find’s card or the way out, at most one an offer, and the hook on each fresh depth', () => {
  let offers = 0;
  let withFossil = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const h = run(5, { seed });
    for (let turn = 0; turn < 30 && h.s.phase !== 'over'; turn++) {
      if (h.s.phase !== 'choosing') break;
      offers++;
      const f = h.s.delve!.fossil;
      if (f) {
        withFossil++;
        assert.ok(h.s.offered.includes(f.category));
        assert.ok(!isWayOut(f.category));
        assert.ok(!findOn(h.s, f.category), 'on a find’s card');
      }
      // Nobody holds any (the device says none): every fresh depth from 5 holds the hook's common.
      if (h.s.round >= 6 && !h.s.delve!.missedHere) assert.ok(f && !rareOf(f.id), `the hook at ${h.s.round}, seed ${seed}`);
      // Pass the fossil's card (never taking it), so the hook goes on.
      const cat = h.s.offered.find((c) => c !== f?.category && !findOn(h.s, c) && !isWayOut(c));
      if (!cat) break;
      h.pick(cat);
      h.answer(true);
      h.act({ type: 'next' });
    }
  }
  assert.ok(offers > 500 && withFossil > 400);
});

test('together: only the one whose right answer it was keeps the fossil', () => {
  const h = run(20, { players: ['Ash', 'Brea'], held: fossilMask(['scorched']) });
  const cat = h.plant('dense');
  h.act({ type: 'vote', category: cat }, 'p0');
  h.act({ type: 'vote', category: cat }, 'p1');
  if (h.s.phase === 'choosing') h.act({ type: 'expire' }, null);
  assert.equal(h.s.question!.fossil, 'dense');
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  h.answer(true, 'p1');
  assert.deepEqual(h.s.reveal!.fossil, { id: 'dense', to: ['p1'] });
});

test('together: a winner who holds it, or is at the cap, gets nothing, and nobody else does', () => {
  const h = run(20, { players: ['Ash', 'Brea'] });
  h.engine.setFossilsHeld((ids) => ids.map((id) => ({ held: id === 'p1' ? fossilMask(['scorched', 'dense']) : fossilMask(['scorched']), day: null })));
  const cat = h.plant('dense');
  for (const p of ['p0', 'p1']) h.act({ type: 'vote', category: cat }, p);
  if (h.s.phase === 'choosing') h.act({ type: 'expire' }, null);
  h.act({ type: 'clock', askedAt: h.s.question!.askedAt });
  h.answer(true, 'p1');
  assert.equal(h.s.reveal!.fossil, undefined);
});

// ---- counts -----------------------------------------------------------------------

test('counts: a fossil taken by tier, and a fossil card passed up for a find', () => {
  const h = run(30, { held: fossilMask(['scorched']) });
  const cat = h.plant('gilded');
  const offered = h.s;
  h.pick(cat);
  const asked = h.s;
  assert.deepEqual(fossilEvents(offered, asked), []);
  h.answer(true);
  assert.deepEqual(fossilEvents(asked, h.s), ['fossil/rare']);
  assert.deepEqual(fossilEvents(h.s, h.s), [], 'once');

  const p = run(30, { held: fossilMask(['scorched']) });
  p.edit((c) => (c.delve!.finds = [{ category: c.offered[0], kind: 'azurite' }]));
  p.plant('jagged');
  const before = p.s;
  p.pick(p.s.offered[0]);
  assert.deepEqual(fossilEvents(before, p.s), ['fossil/passed']);
  p.answer(true);
  assert.deepEqual(fossilEvents(p.s, p.s), []);
});

// ---- storage and sync ---------------------------------------------------------------

test('stored: read back as written, fossils this build doesn’t know left out, another version not read', () => {
  const s: FossilStore = { found: { jagged: { at: 1_700_000_000_000, depth: 9 }, gilded: { at: 1_700_000_100_000, depth: 40, together: true } } };
  assert.deepEqual(parseFossils(serializeFossils(s)), s);
  const newer = JSON.stringify({ v: FOSSILS_VERSION, found: { jagged: { at: 5, depth: 9 }, amber: { at: 5, depth: 9 }, dense: { at: -1, depth: 3 } } });
  assert.deepEqual(parseFossils(newer), { found: { jagged: { at: 5, depth: 9 } } });
  assert.equal(parseFossils(JSON.stringify({ v: FOSSILS_VERSION + 1, found: {} })), null);
  for (const bad of [null, '', '{', '[]', '{"v":1}']) assert.equal(parseFossils(bad), null);
  assert.equal(heldMask(s), fossilMask(['jagged', 'gilded']));
});

test('merged: every fossil either device has, the earlier find of one both have', () => {
  const mine: FossilStore = { found: { jagged: { at: 200, depth: 9 }, dense: { at: 100, depth: 7 } } };
  const theirs: FossilStore = { found: { jagged: { at: 150, depth: 12, together: true }, dense: { at: 300, depth: 30 }, gilded: { at: 400, depth: 41 } } };
  assert.deepEqual(mergeFossils(mine, theirs), {
    found: { jagged: { at: 150, depth: 12, together: true }, dense: { at: 100, depth: 7 }, gilded: { at: 400, depth: 41 } },
  });
  assert.equal(mergeFossils(mine, mine), mine);
  assert.equal(mergeFossils(mine, emptyFossils()), mine);
});

test('kept on this device, synced as taken-in data, and never written over a newer build’s entry', () => {
  store.clear();
  assert.deepEqual(keepFossils(['jagged', 'jagged'], 9, false, 1000), ['jagged']);
  assert.deepEqual(keepFossils(['jagged', 'gilded'], 30, true, 2000), ['gilded']);
  assert.deepEqual(loadFossils(), { found: { jagged: { at: 1000, depth: 9 }, gilded: { at: 2000, depth: 30, together: true } } });
  // Passed on whole, and taken in by the other device.
  const sent = takenNow().fossils;
  assert.ok(sent);
  store.clear();
  keepFossils(['dense'], 6, false, 3000);
  assert.deepEqual(takeIn({ fossils: sent }), ['fossils']);
  assert.deepEqual(Object.keys(loadFossils().found).sort(), ['dense', 'gilded', 'jagged']);
  assert.deepEqual(takeIn({ fossils: sent }), [], 'nothing new');
  // What an older build does with it: a key it doesn't know is skipped.
  assert.deepEqual(takeIn({ somethingNewer: '{"v":1}' }), []);
  // A newer build's entry stays as it is.
  const newer = JSON.stringify({ v: FOSSILS_VERSION + 1, found: { jagged: { at: 1, depth: 2, shiny: true } } });
  store.set(FOSSILS_KEY, newer);
  assert.deepEqual(keepFossils(['deft'], 8, false), []);
  assert.equal(takeIn({ fossils: sent }).length, 0);
  assert.equal(store.get(FOSSILS_KEY), newer);
  store.clear();
});

test('the day of a device’s latest find: what the one a day goes by, from the found dates, which paired devices share', () => {
  const day = 86_400_000;
  const s: FossilStore = { found: { jagged: { at: 3 * day + 10, depth: 9 }, dense: { at: 5 * day + 99, depth: 7 } } };
  assert.equal(lastFoundDay(s), 5);
  assert.equal(lastFoundDay(emptyFossils()), null);
  assert.deepEqual(heldOf(s), { held: fossilMask(['jagged', 'dense']), day: 5 });
  assert.ok(foundToday(s, 5 * day + 80_000_000));
  assert.ok(!foundToday(s, 6 * day + 1));
});

test('the hello carries the fossils a guest holds as a mask, and the day of its latest find; what isn’t is left out', () => {
  const hello = { t: 'hello', secret: 'a'.repeat(24), name: 'Ash', v: 35 };
  assert.equal((parseClientMsg({ ...hello, fossilDay: 20_400 }) as { fossilDay?: number }).fossilDay, 20_400);
  for (const bad of [-1, 1.5, '20400', 2_000_000]) {
    const m = parseClientMsg({ ...hello, fossilDay: bad });
    assert.ok(m && !('fossilDay' in m), `fossilDay ${bad}`);
  }
  assert.equal((parseClientMsg({ ...hello, fossils: fossilMask(['dense', 'gilded']) }) as { fossils?: number }).fossils, fossilMask(['dense', 'gilded']));
  for (const bad of [-1, ALL_FOSSILS + 1, 'x', 2.5]) {
    const m = parseClientMsg({ ...hello, fossils: bad });
    assert.ok(m && !('fossils' in m), `fossils ${bad}`);
  }
});

// ---- the end screen ----------------------------------------------------------------

test('the usual: named when a run lifts the runs chart’s usual depth, never when it keeps or drops it', () => {
  const runs = (depths: number[]): DelveRun[] => depths.map((depth, i) => ({ id: 100 + i, at: 100 + i, depth, players: 1, ruleset: DELVE_RULESET, mixed: false }));
  // Shown 9, 10, 12, 13 before (usual 11), then a run to 29: usual 12.
  const lifted = runs([10, 11, 13, 14, 30]);
  const last = lifted.at(-1)!.id;
  assert.equal(usualLifted(lifted, last, false, null), 12);
  const kept = runs([10, 12, 13, 14, 12]);
  assert.equal(usualLifted(kept, kept.at(-1)!.id, false, null), null);
  const dropped = runs([20, 22, 24, 26, 5]);
  assert.equal(usualLifted(dropped, dropped.at(-1)!.id, false, null), null);
  // Too few runs for a chart's usual before: nothing.
  const two = runs([10, 30]);
  assert.equal(usualLifted(two, two.at(-1)!.id, false, null), null);
});

test('the end screen names the run’s fossil, and that another can turn up tomorrow for the one it went to', () => {
  const h = run(12, { held: fossilMask(['scorched']) });
  h.pick(h.plant('aberrant'));
  h.answer(true);
  const text = (me: string | null) => runFacts(h.s, me).map((l) => l.parts.map((p) => (typeof p === 'string' ? p : 'n' in p ? String(p.n) : '')).join(''));
  assert.ok(text('p0').includes('You found an Aberrant Fossil at depth 11. Another can turn up tomorrow.'), text('p0').join(' | '));
});

test('the flight: the tally is in its place before the piece sets off for it, the piece lands, then the tally goes', () => {
  const f = FOSSIL_FLIGHT;
  assert.ok(f.TALLY_IN < f.RISE + f.HANG, 'the slot is there before the flight');
  assert.ok(f.RISE + f.HANG < f.LANDS);
  assert.equal(f.LANDS, f.RISE + f.HANG + f.FLIGHT);
  assert.ok(f.LANDS + 1500 < f.TALLY_FOR, 'the count is read a while after it lands');
});

test('a run’s fossils are read sanely from its state, and by whom', () => {
  const s = { delve: { fossils: [{ id: 'jagged', depth: 9, at: 1, to: ['p0'] }, { id: 'nope', depth: 9, at: 1, to: ['p0'] }, null, { id: 'dense', depth: 12, at: 2, to: ['p1'] }] } } as unknown as GameState;
  assert.deepEqual(runFossils(s).map((f) => f.id), ['jagged', 'dense']);
  assert.deepEqual(fossilsOf(s, 'p1'), ['dense']);
  assert.deepEqual(runFossils({} as GameState), []);
});

// ---- the code review's fixes ------------------------------------------------------------

test('a run’s fossils are kept from its state: a guest that missed the reveal (a dropped link, a reload) still keeps theirs, once', () => {
  store.clear();
  const given = [
    { id: 'jagged' as const, depth: 9, at: 1000, to: ['p1'] },
    { id: 'dense' as const, depth: 12, at: 2000, to: ['p0'] },
  ];
  assert.deepEqual(keepRunFossils(given, 'p1', false, true), ['jagged']);
  assert.deepEqual(keepRunFossils(given, 'p1', false, true), [], 'the next state keeps nothing twice');
  assert.deepEqual(loadFossils(), { found: { jagged: { at: 1000, depth: 9, together: true } } });
  assert.deepEqual(keepRunFossils(given, null, false, true), [], 'a device with no player in the run');
  store.clear();
  assert.deepEqual(keepRunFossils(given, null, true, false), ['jagged', 'dense'], 'on one device, whoever played');
  store.clear();
});

test('the deal reads an away guest’s own fossils and day, not the host’s; the host’s only for its own players', () => {
  const theirs = { held: fossilMask(['dense']), day: 12 };
  const mine = { held: fossilMask(['jagged', 'gilded']), day: 14 };
  const known = new Map([['p1', theirs]]);
  let reads = 0;
  const here = () => (reads++, mine);
  const own = (id: string) => id === 'p0' || id === 'p3';
  // p1 away (their link dropped, still standing): their last; p2 never heard from: none; p0 and p3 at the host's screen.
  assert.deepEqual(heldFor(['p0', 'p1', 'p2', 'p3'], known, own, here), [mine, theirs, { held: 0, day: null }, mine]);
  assert.equal(reads, 1, 'this device’s store read once');
});

test('erasing the codex erases the fossils, what was kept aside of them, and the Delve page shows it at once', () => {
  store.clear();
  // A damaged entry, kept aside as the next write comes.
  store.set(FOSSILS_KEY, '{"v":1,"found":');
  keepFossils(['jagged'], 9, false, 1000);
  assert.ok([...store.keys()].some((k) => k.startsWith(`${FOSSILS_KEY}.`)), 'kept aside');
  resetFossils();
  assert.deepEqual([...store.keys()].filter((k) => k.startsWith(FOSSILS_KEY)), []);
  assert.deepEqual(loadFossils(), emptyFossils());
  // The page's grid reads the codex's own store, loaded again as it erases (Codex.svelte reset), not only on another tab's change.
  const codex = readFileSync(new URL('../src/components/Codex.svelte', import.meta.url), 'utf8');
  const reset = codex.slice(codex.indexOf('function reset()'), codex.indexOf('confirmReset = false;'));
  assert.match(reset, /resetFossils\(\);[\s\S]*fossils = loadFossils\(\);/);
  assert.match(codex, /<CodexDelve [^>]*\{fossils\}/);
  store.clear();
});
