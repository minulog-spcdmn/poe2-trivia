// Keeping progress with a passkey (lib/backup/, signal/worker.js Keep): what
// the secret makes, apart for each channel; a device's progress sealed so it
// opens only as that device's; the server's buckets (every device's entry,
// the oldest going past the most, an empty one taken out, a bucket forgotten
// or let go after long enough); whom it answers; and what's brought back,
// a save from an older build too, and the copies a device held of others',
// taken in as sync takes another device's: never counted twice, and passed
// on with the secret, the newer winning.
import './asVite.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { memoryStorage, items } from './helpers.ts';
import { fromSecret, newSecret, secretIn, seal, unseal, userId } from '../src/lib/backup/seal.ts';
import { KEEP_MS, MAX_ENTRIES, MAX_ENTRY, Keep, answer, pack } from '../signal/worker.js';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);

const { base64url } = await import('../src/lib/base64url.ts');
const { MAX_ENTRY: PAGE_MAX_ENTRY, entryNow, readEntry, sealEntry, takeEntries, unpack } = await import('../src/lib/backup/backup.svelte.ts');
const { absorbKept, forgetKept, loadKept, loadSent, nextAt, ownKeptRaw, saveKept, saveSent } = await import('../src/lib/backup/kept.ts');
const { clearCopies, deviceId, keepCopy, readCopies } = await import('../src/lib/sync/store.ts');
const { takeIn, takenNow } = await import('../src/lib/sync/shared.ts');
const { emptyCodex, loadCodex, serializeCodex } = await import('../src/lib/codex.ts');
const { storeKey } = await import('../src/lib/storage.ts');

beforeEach(() => {
  clearCopies();
  store.clear();
});

// ---- the seal -------------------------------------------------------------------

test('a secret makes one bucket and key a channel, and a seal opens only as the device it was made for', async () => {
  const secret = newSecret();
  const live = await fromSecret(secret, 'live');
  const again = await fromSecret(secret, 'live');
  const beta = await fromSecret(secret, 'beta');
  assert.match(live.bucket, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(again.bucket, live.bucket);
  assert.notEqual(beta.bucket, live.bucket, 'the beta never writes into the live game’s');
  const text = JSON.stringify({ v: 1, copies: [], taken: { started: '1' } });
  const sealed = await seal(text, live.key, live.bucket, 'phone0000001');
  assert.equal(await unseal(sealed, again.key, live.bucket, 'phone0000001', 1000), text);
  assert.equal(await unseal(sealed, live.key, live.bucket, 'tablet000001', 1000), null, 'another device’s');
  assert.equal(await unseal(sealed, beta.key, live.bucket, 'phone0000001', 1000), null, 'another key');
  assert.equal(await unseal(sealed, live.key, live.bucket, 'phone0000001', 10), null, 'longer than it may be');
  const broken = sealed.slice();
  broken[20] ^= 1;
  assert.equal(await unseal(broken, live.key, live.bucket, 'phone0000001', 1000), null, 'damaged');
});

test('a passkey names its channel: one of another channel’s is turned away, not taken for an empty bucket', () => {
  const secret = newSecret();
  const id = userId(secret, 'live');
  assert.equal(id.length, 33);
  assert.deepEqual(secretIn(id, 'live'), secret);
  assert.deepEqual(secretIn(userId(secret, 'beta'), 'live'), { elsewhere: 'beta' });
  assert.equal(secretIn(secret, 'live'), null, 'no channel: not one the game made');
  assert.equal(secretIn(new Uint8Array([9, ...secret]), 'live'), null);
});

// ---- the server -----------------------------------------------------------------

/** A Durable Object's SQL storage, on Node's own SQLite. */
function fakeState() {
  let db = new DatabaseSync(':memory:');
  const state = {
    alarm: null as number | null,
    storage: {
      sql: {
        exec(query: string, ...bindings: unknown[]) {
          const s = db.prepare(query);
          const rows = /^\s*SELECT/i.test(query) ? (s.all(...(bindings as never[])) as Record<string, unknown>[]) : (s.run(...(bindings as never[])), []);
          return { toArray: () => rows };
        },
      },
      setAlarm: (at: number) => void (state.alarm = at),
      deleteAlarm: () => void (state.alarm = null),
      deleteAll: () => void (db = new DatabaseSync(':memory:')),
    },
  };
  return state;
}

const BUCKET = 'A'.repeat(43);
const bytes = (...b: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(b);
const post = (k: Keep, device: string, body: Uint8Array<ArrayBuffer>) => k.fetch(new Request(`https://x/keep/${BUCKET}/${device}`, { method: 'POST', body }));
const read = async (k: Keep) => unpack(new Uint8Array(await (await k.fetch(new Request(`https://x/keep/${BUCKET}`))).arrayBuffer()));

test('a bucket keeps each device’s entry in place of what it had, an empty one taken out', async () => {
  const state = fakeState();
  const k = new Keep(state);
  assert.deepEqual(await read(k), []);
  await post(k, 'phone0000001', bytes(1, 2, 3));
  await post(k, 'tablet000001', bytes(9));
  await post(k, 'phone0000001', bytes(4, 5));
  const got = await read(k);
  assert.deepEqual(
    got.map((e) => [e.device, [...e.data]]).sort(),
    [
      ['phone0000001', [4, 5]],
      ['tablet000001', [9]],
    ],
  );
  assert.ok(state.alarm && state.alarm > Date.now() + KEEP_MS - 60_000, 'let go of only after long enough without a write');
  await post(k, 'tablet000001', bytes());
  assert.deepEqual((await read(k)).map((e) => e.device), ['phone0000001']);
  // Too long: refused, the one kept left as it was.
  assert.equal((await post(k, 'phone0000001', new Uint8Array(MAX_ENTRY + 1))).status, 413);
  assert.deepEqual([...(await read(k))[0].data], [4, 5]);
});

test('past the most entries the one written longest ago goes; forgotten or let go, the bucket is empty', async () => {
  const state = fakeState();
  const k = new Keep(state);
  for (let i = 0; i <= MAX_ENTRIES; i++) await k.write(`dev${String(i).padStart(9, '0')}`, bytes(i), 1000 + i);
  const kept = await read(k);
  assert.equal(kept.length, MAX_ENTRIES);
  assert.ok(!kept.some((e) => e.device === 'dev000000000'));
  await k.fetch(new Request(`https://x/keep/${BUCKET}/forget`, { method: 'POST' }));
  assert.deepEqual(await read(k), []);
  assert.equal(state.alarm, null);
  await post(k, 'phone0000001', bytes(1));
  await k.alarm();
  assert.deepEqual(await read(k), []);
});

test('the frames a bucket is sent in read back as they were', () => {
  const entries = [
    { device: 'phone0000001', data: bytes(1, 2) },
    { device: 'tablet000001', data: bytes() },
    { device: 'laptop000001', data: new Uint8Array(70_000).fill(7) },
  ];
  const back = unpack(pack(entries) as Uint8Array<ArrayBuffer>);
  assert.deepEqual(
    back.map((e) => [e.device, e.data.length]),
    entries.map((e) => [e.device, e.data.length]),
  );
  // A body cut short: what's whole of it.
  assert.equal(unpack(pack(entries).slice(0, 40) as Uint8Array<ArrayBuffer>).length, 2);
});

/** The Worker's bindings: every bucket its own Keep, the rate limits as given. */
function env(limited = false, writesLimited = false) {
  const objects = new Map<string, Keep>();
  return {
    PER_ADDRESS: { limit: async () => ({ success: !limited }) },
    KEEP_WRITES: { limit: async () => ({ success: !writesLimited }) },
    SIGNAL: { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response(null, { status: 500 }) }) },
    KEEP: {
      idFromName: (n: string) => n,
      get: (id: string) => {
        if (!objects.has(id)) objects.set(id, new Keep(fakeState()));
        return objects.get(id)!;
      },
    },
  };
}

test('the Worker keeps for the game’s own pages only, at paths it knows, within the rate limit', async () => {
  const e = env();
  const at = (path: string, init: RequestInit = {}, origin = 'https://poe2.quest') => answer(new Request(`https://x${path}`, { ...init, headers: { Origin: origin, ...(init.headers ?? {}) } }), e as never);
  const r = await at(`/keep/${BUCKET}/phone0000001`, { method: 'POST', body: bytes(1, 2), headers: { 'Content-Type': 'text/plain' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://poe2.quest');
  const got = await at(`/keep/${BUCKET}`);
  assert.equal(got.status, 200);
  assert.deepEqual(unpack(new Uint8Array(await got.arrayBuffer())).map((x) => x.device), ['phone0000001']);
  assert.equal((await at(`/keep/${BUCKET}`, {}, 'https://elsewhere.example')).status, 403);
  for (const path of [`/keep/short`, `/keep/${BUCKET}/NOT-A-DEVICE`, `/keep/${BUCKET}/phone0000001/more`])
    assert.equal((await at(path, { method: 'POST', body: bytes(1) })).status, 404, path);
  assert.equal((await at(`/keep/${BUCKET}/phone0000001`)).status, 404, 'one device’s isn’t read alone');
  assert.equal((await at(`/keep/${BUCKET}/phone0000001`, { method: 'POST', body: new Uint8Array(MAX_ENTRY + 1) })).status, 413);
  assert.equal((await answer(new Request(`https://x/keep/${BUCKET}`, { headers: { Origin: 'https://poe2.quest' } }), env(true) as never)).status, 429);
  // Writes are held to fewer: past them, a bucket is still read.
  const few = env(false, true);
  const asked = (init: RequestInit) => answer(new Request(`https://x/keep/${BUCKET}${init.method === 'POST' ? '/phone0000001' : ''}`, { ...init, headers: { Origin: 'https://poe2.quest' } }), few as never);
  assert.equal((await asked({ method: 'POST', body: bytes(1) })).status, 429);
  assert.equal((await asked({})).status, 200);
  // A body sent without its length is counted as it comes.
  const endless = new ReadableStream<Uint8Array>({ pull: (c) => c.enqueue(new Uint8Array(64 * 1024)) });
  const unsized = new Request(`https://x/keep/${BUCKET}/phone0000001`, { method: 'POST', body: endless, duplex: 'half' } as RequestInit);
  assert.equal(unsized.headers.get('Content-Length'), null);
  assert.equal((await new Keep(fakeState()).fetch(unsized)).status, 413);
  assert.equal(PAGE_MAX_ENTRY, MAX_ENTRY, 'the page fits what the server keeps');
});

// ---- bringing it back -----------------------------------------------------------

const [A, B] = items;
const entryOf = (id: string, seen: number, at: number) => ({ seen, first: at, last: at, name: { n: seen, ok: seen }, art: { n: 0, ok: 0 }, mixed: {} });
const codexWith = (seen: Record<string, number>) => serializeCodex({ ...emptyCodex(), items: Object.fromEntries(Object.entries(seen).map(([id, n]) => [id, entryOf(id, n, 1000)])) });

test('a browser brought back takes every device’s, a save from an older build too, and counts nothing twice', async () => {
  // The phone as an older build left it: the codex under its old name only, before the Delve fields moved it.
  store.set(storeKey('codex'), codexWith({ [A.id]: 3 }));
  store.set(storeKey('achievements'), JSON.stringify({ v: 1, earned: {} }));
  const phone = deviceId();
  // And the copy it holds of a laptop whose browser was cleared before the backup was made: it lives on only here.
  keepCopy('codex', 'laptop000001', { at: 4000, raw: codexWith({ [B.id]: 4 }) });
  const kept = entryNow();
  assert.ok(kept, 'an older save is kept like any');
  const phoneEntry = readEntry(JSON.stringify({ v: 1, ...kept.entry }))!;
  assert.deepEqual(
    phoneEntry.copies.map((c) => [c.device, c.kind]),
    [
      [phone, 'codex'],
      ['laptop000001', 'codex'],
    ],
  );
  // The tablet's, from the same bucket: it held an older copy of the laptop's, which the newer one wins over.
  const tabletEntry = readEntry(
    JSON.stringify({
      v: 1,
      copies: [
        { device: 'tablet000001', kind: 'codex', at: 5000, raw: codexWith({ [A.id]: 2, [B.id]: 1 }) },
        { device: 'laptop000001', kind: 'codex', at: 3000, raw: codexWith({ [B.id]: 2 }) },
      ],
      taken: {},
    }),
  )!;

  // Safari let it all go: the phone comes back as a new device, and takes both in.
  clearCopies();
  store.clear();
  const me = deviceId();
  assert.notEqual(me, phone);
  const changed = takeEntries(
    [
      { device: phone, entry: phoneEntry },
      { device: 'tablet000001', entry: tabletEntry },
    ],
    me,
  );
  assert.ok(changed.includes('codex2'));
  const codex = loadCodex();
  assert.deepEqual([codex.items[A.id].seen, codex.items[B.id].seen], [5, 5]);
  // Brought back again (another tab, a second press): the same, not twice.
  takeEntries([{ device: phone, entry: phoneEntry }], me);
  assert.equal(loadCodex().items[A.id].seen, 5);
  // This device's own entry, brought back where it still is, is its own already.
  assert.deepEqual(takeEntries([{ device: me, entry: tabletEntry }], me), []);
  assert.deepEqual(Object.keys(readCopies('codex')).sort(), [phone, 'tablet000001', 'laptop000001'].sort());
});

test('an entry past what the server keeps lets the oldest copies it holds go, never its own', async () => {
  const { bucket, key } = await fromSecret(newSecret(), 'live');
  const me = 'phone0000001';
  // Progress gzip can't shrink, two fifths of the most each: two fit.
  const noise = () => base64url(randomBytes(Math.floor(MAX_ENTRY * 0.4)));
  const copy = (device: string, at: number) => ({ device, kind: 'codex' as const, at, raw: noise() });
  const entry = { copies: [copy(me, 9000), copy('tablet000001', 8000), copy('laptop000001', 7000), copy('old000000001', 6000)], taken: {} };
  const data = (await sealEntry(entry, key, bucket, me))!;
  assert.ok(data.length <= MAX_ENTRY);
  const back = readEntry((await unseal(data, key, bucket, me, 10 * MAX_ENTRY))!)!;
  assert.deepEqual(
    back.copies.map((c) => c.device),
    [me, 'tablet000001'],
  );
  // Its own alone more than that: none is sent.
  assert.equal(await sealEntry({ copies: [{ ...copy(me, 1), raw: noise() + noise() + noise() }], taken: {} }, key, bucket, me), null);
});

test('an entry this build can’t read is passed over', () => {
  for (const text of ['garbage', '{"v":2,"copies":[],"taken":{}}', '{"v":1,"copies":{},"taken":{}}']) assert.equal(readEntry(text), null, text);
  const d = 'phone0000001';
  const copies = [
    { device: d, kind: 'codex', at: 1, raw: 'x' },
    { device: d, kind: 'nonsense', at: 1, raw: 'x' },
    { device: d, kind: 'delve', at: -1, raw: 'x' },
    { device: 'NOT A DEVICE', kind: 'codex', at: 1, raw: 'x' },
    { kind: 'codex', at: 1, raw: 'x' },
  ];
  const e = readEntry(JSON.stringify({ v: 1, copies, taken: { started: '1', n: 5 } }))!;
  assert.deepEqual([e.copies.length, Object.keys(e.taken)], [1, ['started']]);
});

// ---- the secret, through sync ----------------------------------------------------

test('sync passes the secret on, the newer winning: set on one device, on on all; forgotten on one, forgotten on all', () => {
  const one = base64url(newSecret());
  const two = base64url(newSecret());
  assert.equal(ownKeptRaw(), null, 'nothing sent where it was never set');
  assert.equal('backup' in takenNow(), false);
  saveKept({ secret: one, at: 100 });
  const sent = takenNow().backup;
  assert.ok(sent);
  store.clear();
  // Another device takes it in.
  assert.deepEqual(takeIn({ backup: sent }), ['backup']);
  assert.equal(loadKept()?.secret, one);
  // An older one never takes its place; a newer one does, a forgotten one too.
  assert.equal(absorbKept(JSON.stringify({ v: 1, secret: two, at: 50 })), false);
  assert.equal(absorbKept(JSON.stringify({ v: 1, secret: two, at: 200 })), true);
  assert.equal(loadKept()?.secret, two);
  assert.equal(absorbKept(JSON.stringify({ v: 1, secret: null, at: 300 })), true);
  assert.equal(loadKept()?.secret, null);
  // What isn't a secret is never taken.
  for (const raw of ['garbage', JSON.stringify({ v: 1, secret: 'short', at: 400 }), JSON.stringify({ v: 1, secret: one })]) assert.equal(absorbKept(raw), false, raw);
});

test('a Forget is never undone by a clock that runs ahead, and what was sent goes with it', () => {
  const one = base64url(newSecret());
  // Set on a device two days ahead, and taken in here.
  const ahead = Date.now() + 2 * 86_400_000;
  absorbKept(JSON.stringify({ v: 1, secret: one, at: ahead }));
  saveSent({ at: Date.now(), print: '1:1', bucket: 'B'.repeat(43) });
  // Forgotten here: later than it, whatever this clock says, so the other device takes the Forget.
  const at = nextAt();
  assert.ok(at > ahead);
  saveKept({ secret: null, at });
  assert.equal(absorbKept(JSON.stringify({ v: 1, secret: one, at: ahead })), false);
  // Forgotten on another device: what this one sent is forgotten too, so it all goes again if it's brought back.
  store.clear();
  saveKept({ secret: one, at: 100 });
  saveSent({ at: Date.now(), print: '1:1', bucket: 'B'.repeat(43) });
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: null, at: 200 })));
  assert.equal(loadSent(), null);
});

test('the codex erased stops keeping here without a Forget: paired again, the others’ is taken in', () => {
  const one = base64url(newSecret());
  saveKept({ secret: one, at: Date.now() + 86_400_000 });
  forgetKept();
  assert.equal(ownKeptRaw(), null, 'nothing to pass on that would stop the others’');
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: one, at: 100 })));
  assert.equal(loadKept()?.secret, one);
});
