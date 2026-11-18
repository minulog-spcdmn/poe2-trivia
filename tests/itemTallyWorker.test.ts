// The item tally as the matchmaking server keeps it (signal/worker.js Tally
// and its /tally path): batches checked whole, of versions it knows, their
// answers for items the game doesn't have dropped alone; each batch added
// once by its id, kept a day; then added up per version, item, form,
// context and first, each sum written once a batch, no more than TALLY_ROWS
// sums and TALLY_HOURLY rows written a UTC hour (the Worker dropping the
// rest of the hour's batches itself once told); read back as JSON, the rows
// read only for a read and kept in memory, full reads held to TALLY_READS
// rows a UTC day; for the game's own pages only, within the rate limits,
// the tally's own asked first. What the page sends is tested in
// tests/itemTally.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import items from '../src/data/items.json' with { type: 'json' };
import { itemIdsText } from '../scripts/refresh-plan.mjs';
import {
  MAX_TALLIED,
  MAX_TALLY,
  TALLY_BATCH_ROWS,
  TALLY_CONTEXTS,
  TALLY_HOURLY,
  TALLY_PRUNE,
  TALLY_READS,
  TALLY_ROWS,
  TALLY_SEEN_MS,
  TALLY_SPENT,
  TALLY_VERSION,
  Tally,
  answer,
  tallied,
} from '../signal/worker.js';

/** A cursor as the runtime's: its rows one at a time or all at once, with what it read and wrote. */
function cursor(rows: Record<string, unknown>[], counts: { rowsRead?: number; rowsWritten?: number }) {
  return { toArray: () => rows, [Symbol.iterator]: () => rows[Symbol.iterator](), ...counts };
}

/** A Durable Object's SQL storage, on Node's own SQLite, saying what it read and wrote as the runtime does; `whole` counts the Worker's full reads that took their rows all at once. */
function fakeState() {
  const db = new DatabaseSync(':memory:');
  const whole = { n: 0 };
  return {
    whole,
    storage: {
      sql: {
        exec(query: string, ...bindings: unknown[]) {
          const s = db.prepare(query);
          if (/^\s*SELECT/i.test(query)) {
            const rows = s.all(...(bindings as never[])) as Record<string, unknown>[];
            const c = cursor(rows, { rowsRead: rows.length });
            return /^SELECT v, item, form, ctx, first, r, w FROM tally/.test(query) ? { ...c, toArray: () => (whole.n++, rows) } : c;
          }
          if (/\bRETURNING\b/i.test(query)) {
            const rows = s.all(...(bindings as never[])) as Record<string, unknown>[];
            return cursor(rows, { rowsWritten: rows.length });
          }
          const { changes } = s.run(...(bindings as never[]));
          return cursor([], { rowsWritten: Number(changes) });
        },
      },
    },
  };
}

// Real items' ids (signal/itemIds.json), B before A before C as the table sorts them.
const A = '4f588a87bc12';
const B = '025ee84be9db';
const C = 'ffe9672e2cd3';
/** An id no item has. */
const GONE = '0123456789ab';
let made = 0;
/** A batch id, as a page makes one: a new one each time. */
const newId = () => (++made).toString(16).padStart(16, '0');
const body = (v: unknown, a: unknown, id: unknown = newId()) => JSON.stringify({ v, id, a });
/** The sums as stored, in the table's order. */
const sums = (t: Tally) => t.ctx.storage.sql.exec('SELECT * FROM tally ORDER BY v, item, form, ctx, first').toArray().map((r) => ({ ...r }));
const HOUR = 3_600_000;
const DAY = 86_400_000;
const get = (t: Tally) => t.fetch(new Request('https://x/tally'));
const post = (t: Tally, s: string) => t.fetch(new Request('https://x/tally', { method: 'POST', body: s }));


test('a batch is taken only as the page sends it: anything off refuses it whole', () => {
  const ok = (s: string) => tallied(new TextEncoder().encode(s));
  assert.deepEqual(ok(body(1, [[A, 'n', 'd3', 0, 'w']], '0123456789abcdef')), { v: 1, id: '0123456789abcdef', a: [[A, 'n', 'd3', 0, 'w']] });
  assert.ok(ok(body(TALLY_VERSION, Array(MAX_TALLIED).fill([A, 'a', 'r-merciless', 1, 'r']))));
  assert.equal(TALLY_CONTEXTS.size, 50);
  for (const c of ['d1', 'd20', 'g1', 'g20', 't-cruel', 't-merciless', 't-eternal', 't-custom', 'r-cruel', 'r-custom', 'practice', 'daily']) assert.ok(ok(body(1, [[A, 'n', c, 0, 'r']])), c);
  for (const [bad, why] of [
    ['not json', 'not JSON'],
    [JSON.stringify([1, []]), 'not an object'],
    [JSON.stringify({ v: 1, id: newId(), a: [[A, 'n', 'd1', 0, 'w']], x: 1 }), 'more'],
    [JSON.stringify({ v: 1, a: [[A, 'n', 'd1', 0, 'w']] }), 'no id'],
    [body(1, [[A, 'n', 'd1', 0, 'w']], 'ABCDEF0123456789'), 'id in capitals'],
    [body(1, [[A, 'n', 'd1', 0, 'w']], '0123456789abcde'), 'id too short'],
    [body(1, [[A, 'n', 'd1', 0, 'w']], '0123456789abcdef0'), 'id too long'],
    [body(1, [[A, 'n', 'd1', 0, 'w']], 123), 'id as a number'],
    [body(0, [[A, 'n', 'd1', 0, 'w']]), 'version 0'],
    [body(TALLY_VERSION + 1, [[A, 'n', 'd1', 0, 'w']]), 'a version past the Worker’s'],
    [body(1.5, [[A, 'n', 'd1', 0, 'w']]), 'version not whole'],
    [body('1', [[A, 'n', 'd1', 0, 'w']]), 'version as text'],
    [body(1, []), 'none'],
    [body(1, Array(MAX_TALLIED + 1).fill([A, 'n', 'd1', 0, 'w'])), 'too many'],
    [body(1, [[A.toUpperCase(), 'n', 'd1', 0, 'w']]), 'item'],
    [body(1, [[`${A}0`, 'n', 'd1', 0, 'w']]), 'item too long'],
    [body(1, [[A, 'x', 'd1', 0, 'w']]), 'form'],
    [body(1, [[A, 'n', 'd0', 0, 'w']]), 'band 0'],
    [body(1, [[A, 'n', 'd21', 0, 'w']]), 'band past 20'],
    [body(1, [[A, 'n', 'g01', 0, 'w']]), 'band written otherwise'],
    [body(1, [[A, 'n', 't-hard', 0, 'w']]), 'no such difficulty'],
    [body(1, [[A, 'n', 'race', 0, 'w']]), 'no such context'],
    [body(1, [[A, 'n', 1, 0, 'w']]), 'context as a number'],
    [body(1, [[A, 'n', 'toString', 0, 'w']]), 'context from the prototype'],
    [body(1, [[A, 'n', 'd1', 2, 'w']]), 'first'],
    [body(1, [[A, 'n', 'd1', 0, 'b']]), 'outcome: only right or wrong'],
    [body(1, [[A, 'n', 'd1', 0, ['r']]]), 'outcome not text'],
    [body(1, [[A, 'n', 'd1', 0]]), 'short'],
    [body(1, [[A, 'n', 'd1', 0, 'w', 1]]), 'long'],
  ])
    assert.equal(ok(bad), null, why);
  assert.equal(tallied(new Uint8Array([0xff, 0xfe])), null, 'not UTF-8');
});

test('an answer for an item the game doesn’t have is dropped alone, the rest of its batch kept', async () => {
  const ok = (s: string) => tallied(new TextEncoder().encode(s));
  assert.equal(new Set<string>(items.map((i) => i.id)).has(GONE), false);
  assert.deepEqual(ok(body(1, [[GONE, 'n', 'd1', 0, 'w'], [A, 'a', 'd2', 1, 'r'], [GONE, 'a', 'd1', 0, 'r']]))?.a, [[A, 'a', 'd2', 1, 'r']]);
  assert.deepEqual(ok(body(1, [[GONE, 'n', 'd1', 0, 'w']]))?.a, [], 'none left');
  // Its shape is still checked: one malformed answer refuses the batch whole.
  assert.equal(ok(body(1, [[GONE, 'n', 'd1', 0, 'w'], [A, 'x', 'd1', 0, 'w']])), null);
  const t = new Tally(fakeState());
  assert.equal((await post(t, body(1, [[GONE, 'n', 'd1', 0, 'w']]))).status, 204, 'a batch of none it knows: taken, nothing added');
  assert.equal((await post(t, body(1, [[GONE, 'n', 'd1', 0, 'w'], [B, 'n', 'd1', 0, 'w']]))).status, 204);
  assert.deepEqual(sums(t), [{ v: 1, item: B, form: 'n', ctx: 'd1', first: 0, r: 0, w: 1 }]);
});

test('signal/itemIds.json is every item’s id in items.json, sorted, as scripts/fetch-data.mjs writes it', () => {
  const text = readFileSync(new URL('../signal/itemIds.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(text, itemIdsText(items), 'out of date (scripts/refresh-plan.mjs itemIdsText writes it)');
  const ids = JSON.parse(text) as string[];
  assert.deepEqual(ids, items.map((i) => i.id).sort());
  for (const id of [A, B, C]) assert.ok(ids.includes(id), id);
});

test('answers are added to their sums, each sum written once a batch however often it comes', async () => {
  const t = new Tally(fakeState());
  assert.equal((await post(t, body(1, [[A, 'n', 'd1', 0, 'w'], [A, 'n', 'd1', 0, 'w'], [A, 'n', 'd1', 0, 'r'], [A, 'a', 't-cruel', 0, 'w']]))).status, 204);
  // (A later version, from a Worker that knows it.)
  t.add(2, [[A, 'n', 'd1', 0, 'r']]);
  assert.equal((await post(t, body(1, [[A, 'n', 'd1', 0, 'r']]))).status, 204);
  assert.equal((await post(t, body(1, [[A, 'n', 'nope', 0, 'r']]))).status, 400);
  assert.equal((await post(t, body(TALLY_VERSION + 1, [[A, 'n', 'd1', 0, 'r']]))).status, 400, 'a version past the Worker’s');
  assert.deepEqual(sums(t), [
    { v: 1, item: A, form: 'a', ctx: 't-cruel', first: 0, r: 0, w: 1 },
    { v: 1, item: A, form: 'n', ctx: 'd1', first: 0, r: 2, w: 2 },
    { v: 2, item: A, form: 'n', ctx: 'd1', first: 0, r: 1, w: 0 },
  ]);
  // Written: the first batch's two sums, its id and its own row; then a sum and its row; then a sum, an id and its row.
  assert.equal(t.kept().written, 4 + 2 + 3);
  assert.equal(t.kept().rows, 3);
  const got = await get(t);
  assert.equal(got.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(await got.json(), sums(t));
});

test('past TALLY_ROWS sums a new one is dropped, those kept still added to; sums started are told from those added to without reading them first', () => {
  const t = new Tally(fakeState());
  t.add(1, [[A, 'n', 'd1', 0, 'r']], 5 * DAY);
  t.ctx.storage.sql.exec('UPDATE kept SET rows = ?', TALLY_ROWS);
  assert.ok(t.read(5 * DAY), 'loaded into memory');
  assert.deepEqual(t.add(1, [[B, 'n', 'd1', 0, 'r'], [A, 'n', 'd1', 0, 'w'], [B, 'n', 'd1', 0, 'w']], 5 * DAY), { added: true, spent: false });
  assert.deepEqual(sums(t), [{ v: 1, item: A, form: 'n', ctx: 'd1', first: 0, r: 1, w: 1 }]);
  assert.deepEqual(JSON.parse(t.read(5 * DAY) ?? ''), sums(t), 'memory as stored: the dropped sum not in it');
  assert.equal(t.kept().rows, TALLY_ROWS);
  // Written: the first batch's sum and row, the scan's row, then the one sum added to and its row (none for the dropped).
  assert.equal(t.kept().written, 2 + 1 + 2);
  const counted = new Tally(fakeState());
  counted.add(1, [[A, 'n', 'd1', 0, 'r'], [B, 'n', 'd1', 0, 'r']], 5 * DAY);
  const again = new Tally(counted.ctx);
  again.add(1, [[A, 'n', 'd2', 0, 'r'], [A, 'n', 'd1', 0, 'w'], [B, 'n', 'd1', 0, 'r']], 5 * DAY);
  assert.deepEqual(again.kept(), { rows: 3, hour: 5 * 24, written: 3 + 4, day: 5, scanned: 0 }, 'one sum started, two added to');
});

test('past TALLY_HOURLY rows written in a UTC hour nothing more is, still answered as taken; the count outlives the Object; the next hour starts again', async (c) => {
  const at = 400_000 * HOUR;
  c.mock.timers.enable({ apis: ['Date'], now: at + 3000 });
  const t = new Tally(fakeState());
  assert.deepEqual(t.add(1, [[A, 'n', 'd1', 0, 'r']], at + 1000), { added: true, spent: false });
  // The last that fits: a full batch more still would.
  t.ctx.storage.sql.exec('UPDATE kept SET written = ?', TALLY_HOURLY - TALLY_BATCH_ROWS);
  assert.deepEqual(t.add(1, [[A, 'n', 'd1', 0, 'r'], [B, 'n', 'd1', 0, 'r']], at + 2000), { added: true, spent: true });
  assert.ok(t.kept().written <= TALLY_HOURLY);
  assert.deepEqual(t.add(1, [[A, 'n', 'd1', 0, 'r']], at + HOUR - 1), { added: false, spent: true }, 'the hour’s spent');
  const r = await post(t, body(1, [[B, 'n', 'd1', 0, 'r']]));
  assert.equal(r.status, 204, 'nothing for the page to send again');
  assert.equal(r.headers.get(TALLY_SPENT), String(at + HOUR), 'the Worker told when the hour ends');
  assert.deepEqual(new Tally(t.ctx).add(1, [[A, 'n', 'd1', 0, 'r']], at + 4000), { added: false, spent: true }, 'an Object started afresh knows');
  assert.deepEqual(
    sums(t).map((x) => [x.item, x.r]),
    [
      [B, 1],
      [A, 2],
    ],
  );
  assert.deepEqual(t.add(1, [[A, 'n', 'd1', 0, 'r']], at + HOUR), { added: true, spent: false }, 'a new UTC hour');
  assert.deepEqual(t.kept(), { rows: 2, hour: 400_001, written: 2, day: Math.floor((at + HOUR) / DAY), scanned: 0 });
  assert.equal(sums(t).find((x) => x.item === A)?.r, 3);
  // Full batches, each of forty sums and its id, until the hour turns them away: never past its share.
  const full = new Tally(fakeState());
  let n = 0;
  const batch = () => Array.from({ length: MAX_TALLIED }, (_, i) => [(n * MAX_TALLIED + i).toString(16).padStart(12, '0'), 'n', 'd1', 0, 'r'] as [string, 'n', string, 0, 'r']);
  while (full.add(1, batch(), at, newId()).added) n++;
  assert.ok(full.kept().written <= TALLY_HOURLY && full.kept().written > TALLY_HOURLY - 2 * TALLY_BATCH_ROWS, String(full.kept().written));
  assert.equal(sums(full).length, n * MAX_TALLIED);
});

test('the rows are read only for a read, then kept in memory and brought up to date by writes; full reads keep to TALLY_READS rows a UTC day', async (c) => {
  const day = 300;
  c.mock.timers.enable({ apis: ['Date'], now: day * DAY + 1000 });
  const state = fakeState();
  const t = new Tally(state);
  await post(t, body(1, [[A, 'n', 'd1', 0, 'r'], [B, 'n', 'd1', 0, 'w']]));
  assert.equal(t.sums, null, 'a write reads nothing in');
  assert.equal(t.kept().scanned, 0);
  const json = async (x: Tally) => {
    const r = await get(x);
    assert.equal(r.status, 200);
    return r.json();
  };
  assert.deepEqual(await json(t), sums(t));
  assert.deepEqual([t.kept().day, t.kept().scanned], [day, 2], 'a full read counted');
  assert.deepEqual(await json(t), sums(t));
  assert.equal(t.kept().scanned, 2, 'again from memory: nothing read');
  // (B's sum started sorts before those kept.)
  await post(t, body(1, [[A, 'n', 'd1', 0, 'r'], [B, 'a', 'daily', 1, 'r']]));
  assert.deepEqual(await json(t), sums(t), 'a write brought memory up to date, a sum started in its place');
  assert.equal(t.kept().scanned, 2, 'nothing read again');
  assert.deepEqual(await json(t), sums(t), 'in order still');
  // Evicted: an Object started afresh reads them again, counted on with the day's.
  const fresh = new Tally(t.ctx);
  assert.deepEqual(await json(fresh), sums(t));
  assert.equal(fresh.kept().scanned, 2 + 3);
  // One more full read would pass the day's: refused, while one answered from memory still is.
  fresh.ctx.storage.sql.exec('UPDATE kept SET scanned = ?', TALLY_READS - 3);
  assert.deepEqual(await json(new Tally(t.ctx)), sums(t), 'up to the day’s, read');
  fresh.ctx.storage.sql.exec('UPDATE kept SET scanned = ?', TALLY_READS - 2);
  assert.equal((await get(new Tally(t.ctx))).status, 503);
  assert.deepEqual(await json(t), sums(t), 'from memory');
  // The next UTC day.
  c.mock.timers.setTime((day + 1) * DAY);
  assert.deepEqual(await json(new Tally(t.ctx)), sums(t));
  assert.deepEqual([t.kept().day, t.kept().scanned], [day + 1, 3]);
  assert.equal(state.whole.n, 0, 'read through row by row, never taken all at once');
});

test('a batch sent again (its id seen in the last day) is added once, also by an Object started afresh; its id kept in the same write as its sums', async () => {
  const t = new Tally(fakeState());
  const once = body(1, [[A, 'n', 'd1', 0, 'r'], [B, 'a', 'd2', 1, 'w']]);
  assert.equal((await post(t, once)).status, 204);
  const written = t.kept().written;
  assert.equal((await post(t, once)).status, 204, 'nothing for the page to send again');
  assert.equal((await post(new Tally(t.ctx), once)).status, 204);
  assert.deepEqual(
    sums(t).map((x) => [x.item, x.r, x.w]),
    [
      [B, 0, 1],
      [A, 1, 0],
    ],
  );
  assert.equal(t.kept().written, written, 'a repeat writes nothing');
  // The same answers under another id are another batch.
  assert.equal((await post(t, body(1, [[A, 'n', 'd1', 0, 'r']]))).status, 204);
  assert.equal(sums(t).find((x) => x.item === A)?.r, 2);
  // A write that fails keeps neither the id nor the sums: the batch sent again is added then.
  const { exec } = fakeState().storage.sql;
  let fail = true;
  /** The storage failing as the counts' row is written, the batch's last. */
  const failing = (q: string, ...b: unknown[]) => {
    if (fail && /^INSERT INTO kept/.test(q)) throw new Error('storage');
    return exec(q, ...b);
  };
  // (The runtime's transactionSync, as a savepoint.)
  const atomic = {
    storage: {
      sql: { exec: failing },
      transactionSync<T>(f: () => T): T {
        exec('SAVEPOINT w');
        try {
          const r = f();
          exec('RELEASE w');
          return r;
        } catch (err) {
          exec('ROLLBACK TO w');
          exec('RELEASE w');
          throw err;
        }
      },
    },
  };
  const u = new Tally(atomic);
  const twice = body(1, [[C, 'n', 'd1', 0, 'w']]);
  await assert.rejects(post(u, twice));
  assert.equal(sums(u).length, 0);
  fail = false;
  assert.equal((await post(u, twice)).status, 204);
  assert.deepEqual(
    sums(u).map((x) => [x.item, x.w]),
    [[C, 1]],
  );
});

test('ids past a day are let go of as batches come, a few at a time, counted with the hour’s writes', () => {
  const t = new Tally(fakeState());
  const at = 500 * DAY;
  const seen = () => Number(t.ctx.storage.sql.exec('SELECT count(*) AS n FROM seen').toArray()[0].n);
  const ids = Array.from({ length: 5 }, newId);
  for (const id of ids) t.add(1, [[A, 'n', 'd1', 0, 'r']], at, id);
  assert.equal(seen(), 5);
  assert.deepEqual(t.add(1, [[A, 'n', 'd1', 0, 'r']], at + TALLY_SEEN_MS - 1, ids[0]), { added: false, spent: false }, 'still within the day: a repeat');
  assert.equal(seen(), 5, 'none old enough yet');
  t.add(1, [[A, 'n', 'd1', 0, 'r']], at + TALLY_SEEN_MS + 1, newId());
  assert.equal(seen(), 5 + 1 - TALLY_PRUNE, 'the oldest let go of, TALLY_PRUNE of them');
  // Written in that new hour: the sum, the counts' row, the id and the ids let go of.
  assert.equal(t.kept().written, 1 + 1 + 1 + TALLY_PRUNE);
  t.add(1, [[A, 'n', 'd1', 0, 'r']], at + TALLY_SEEN_MS + 2, newId());
  t.add(1, [[A, 'n', 'd1', 0, 'r']], at + TALLY_SEEN_MS + 3, newId());
  assert.equal(seen(), 3, 'every id past the day gone, the three new ones kept');
  assert.equal(sums(t)[0].r, 5 + 3);
});

/** The Worker's bindings: the one Tally (each waking counted), the rate limits as given, each asking noted. */
function env(limited = false, writesLimited = false) {
  const t = new Tally(fakeState());
  const never = { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response(null, { status: 500 }) }) };
  const names: string[] = [];
  const asked: string[] = [];
  const woke = { n: 0 };
  return {
    t,
    names,
    asked,
    woke,
    PER_ADDRESS: { limit: async () => (asked.push('PER_ADDRESS'), { success: !limited }) },
    KEEP_WRITES: { limit: async () => ({ success: true }) },
    TALLY_WRITES: { limit: async () => (asked.push('TALLY_WRITES'), { success: !writesLimited }) },
    SIGNAL: never,
    KEEP: never,
    TALLY: { idFromName: (n: string) => (names.push(n), n), get: () => ({ fetch: (r: Request) => (woke.n++, t.fetch(r)) }) },
  };
}
const at = (e: object, init: RequestInit = {}, origin = 'https://poe2.quest') =>
  answer(new Request('https://x/tally', { ...init, headers: { Origin: origin, ...(init.headers ?? {}) } }), e as never);

test('the Worker tallies for the game’s own pages only, checked whole, within the rate limits, the tally’s own asked first', async () => {
  const e = env();
  const one = body(1, [[A, 'n', 'd1', 1, 'w']]);
  const r = await at(e, { method: 'POST', body: one, headers: { 'Content-Type': 'text/plain' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://poe2.quest');
  assert.deepEqual(e.names, ['all'], 'one Object for all');
  assert.deepEqual(e.asked, ['TALLY_WRITES', 'PER_ADDRESS']);
  e.asked.length = 0;
  const got = await at(e);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(await got.json(), [{ v: 1, item: A, form: 'n', ctx: 'd1', first: 1, r: 0, w: 1 }]);
  assert.deepEqual(e.asked, ['PER_ADDRESS'], 'a read, the address’s alone');
  assert.equal((await at(e, { method: 'POST', body: one }, 'https://elsewhere.example')).status, 403);
  assert.equal((await at(e, { method: 'POST', body: 'x'.repeat(MAX_TALLY + 1) })).status, 413);
  assert.equal((await at(e, { method: 'POST', body: '{}', headers: { 'Content-Length': String(MAX_TALLY + 1) } })).status, 413, 'by its length, unread');
  assert.equal((await at(e, { method: 'POST', body: body(1, [[A, 'n', 'd99', 1, 'w']]) })).status, 400, 'a context it doesn’t know');
  assert.equal((await at(e, { method: 'POST', body: '{' })).status, 400);
  assert.equal((await at(e, { method: 'PUT', body: one })).status, 404);
  // A body sent without its length is counted as it comes.
  const endless = new ReadableStream<Uint8Array>({ pull: (c) => c.enqueue(new Uint8Array(1024)) });
  const unsized = new Request('https://x/tally', { method: 'POST', body: endless, duplex: 'half', headers: { Origin: 'https://poe2.quest' } } as RequestInit);
  assert.equal(unsized.headers.get('Content-Length'), null);
  assert.equal((await answer(unsized, e as never)).status, 413);
  assert.equal((await at(e, { method: 'POST', body: body(TALLY_VERSION + 1, [[A, 'n', 'd1', 1, 'w']]) })).status, 400, 'a version past the Worker’s');
  assert.equal(sums(e.t).length, 1, 'nothing refused was added');
  // A batch of items the game doesn't have: taken, the Object left asleep; one sent again: added once.
  const woke = e.woke.n;
  assert.equal((await at(e, { method: 'POST', body: body(1, [[GONE, 'n', 'd1', 1, 'w']]) })).status, 204);
  assert.equal(e.woke.n, woke, 'the Object left asleep');
  assert.equal((await at(e, { method: 'POST', body: one })).status, 204, 'sent again');
  assert.deepEqual(
    sums(e.t).map((x) => x.w),
    [1],
  );
  // Rate-limited: past the writes' limit a batch is refused, the address's allowance not asked, the sums still read; past the address's, both.
  const few = env(false, true);
  assert.equal((await at(few, { method: 'POST', body: one })).status, 429);
  assert.deepEqual(few.asked, ['TALLY_WRITES'], 'the address’s allowance left alone');
  assert.equal((await at(few)).status, 200);
  const none = env(true);
  assert.equal((await at(none, { method: 'POST', body: one })).status, 429);
  assert.equal((await at(none)).status, 429);
  assert.equal(sums(few.t).length + sums(none.t).length, 0);
  // Past the day's full reads: 503, as the Object answered.
  const read = env();
  read.t.add(1, [[A, 'n', 'd1', 0, 'r']]);
  read.t.ctx.storage.sql.exec('UPDATE kept SET scanned = ?', TALLY_READS);
  const used = await at(read);
  assert.equal(used.status, 503);
  assert.equal(used.headers.get('Content-Type'), null);
  assert.equal(used.headers.get('Access-Control-Allow-Origin'), 'https://poe2.quest');
});

test('once its Object says the hour’s writes are spent, the Worker drops the rest of that hour’s batches itself, nothing woken or limited', async (c) => {
  // (Long before any other test's clock: this isolate remembers it to the hour's end.)
  const hour = 100_000 * HOUR;
  c.mock.timers.enable({ apis: ['Date'], now: hour + 1000 });
  const e = env();
  e.t.add(1, [[A, 'n', 'd1', 0, 'r']], hour);
  e.t.ctx.storage.sql.exec('UPDATE kept SET written = ?', TALLY_HOURLY - TALLY_BATCH_ROWS);
  const one = body(1, [[B, 'n', 'd1', 0, 'r']]);
  const r = await at(e, { method: 'POST', body: one });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get(TALLY_SPENT), null, 'the page hears nothing of it');
  assert.deepEqual([e.woke.n, e.asked.length], [1, 2]);
  e.asked.length = 0;
  c.mock.timers.setTime(hour + HOUR - 1);
  assert.equal((await at(e, { method: 'POST', body: body(1, [[C, 'n', 'd1', 0, 'r']]) })).status, 204, 'taken, as far as the page knows');
  assert.deepEqual([e.woke.n, e.asked.length], [1, 0], 'the Object left asleep, no limit asked');
  assert.equal((await at(e)).status, 200, 'reads still go');
  assert.equal(e.woke.n, 2);
  e.asked.length = 0;
  c.mock.timers.setTime(hour + HOUR);
  assert.equal((await at(e, { method: 'POST', body: body(1, [[C, 'n', 'd1', 0, 'r']]) })).status, 204);
  assert.deepEqual([e.woke.n, e.asked], [3, ['TALLY_WRITES', 'PER_ADDRESS']], 'the next hour, to the Object again');
  assert.deepEqual(
    sums(e.t).map((x) => x.item),
    [B, A, C],
  );
});
