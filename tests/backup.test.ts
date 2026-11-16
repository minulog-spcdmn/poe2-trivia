// Keeping progress with a passkey (lib/backup/, signal/worker.js Keep): what
// the secret makes, apart for each channel; a device's progress sealed so it
// opens only as that device's; the server's buckets (every device's entry,
// the oldest going past the most, an empty one taken out, a bucket forgotten
// or let go after long enough); whom it answers; and what's brought back,
// a save from an older build too, and the copies a device held of others',
// taken in as sync takes another device's: never counted twice, and passed
// on with the secret, the newer winning; and what a device leaves under a
// secret it moved on from, a note of where it went once it's saved under the
// new one, which Bring it back follows: so each device brings everything back
// with the only passkey it holds. Saves go through the page's own send, on a
// server the test holds a request on where the timing matters: a Forget or an
// erase waits for a save on its way, and nothing is sent after a Forget; a
// bucket forgotten on a device never paired stops every device keeping, and
// brings nothing back; records of the same moment stand in one order on every
// device; and a browser that can't seal never sends.
import './asVite.ts';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { memoryStorage, items } from './helpers.ts';
import { fromSecret, newSecret, secretIn, seal, unseal, userId } from '../src/lib/backup/seal.ts';
import { MAX_ENTRY, Keep, answer, pack } from '../signal/worker.js';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);
// (What Bring it back tells the rest of the tab it took in: nobody listens here.)
const g = globalThis as Record<string, unknown>;
g.StorageEvent ??= class extends Event {
  key: string | null;
  constructor(type: string, init?: { key?: string }) {
    super(type);
    this.key = init?.key ?? null;
  }
};
g.dispatchEvent ??= () => true;

const { base64url } = await import('../src/lib/base64url.ts');
const { MAX_ENTRY: PAGE_MAX_ENTRY, MAX_WALK, backup, bringBack, clearLeft, entryNow, eraseBackup, forgetBackup, keepSafe, passkeyName, readEntry, readNote, sealEntry, send, settled, takeEntries, unpack, walk } = await import('../src/lib/backup/backup.svelte.ts');
const { MAX_LEFT, absorbKept, forgetKept, leave, loadKept, loadLeft, loadSent, nextAt, ownKeptRaw, saveKept, saveSent } = await import('../src/lib/backup/kept.ts');
const { clearCopies, deviceId, forgetDevice, keepCopy, readCopies } = await import('../src/lib/sync/store.ts');
const { CHANNEL } = await import('../src/lib/channel.ts');
const { fromBase64url } = await import('../src/lib/base64url.ts');
const { takeIn, takenNow } = await import('../src/lib/sync/shared.ts');
const { emptyCodex, loadCodex, serializeCodex } = await import('../src/lib/codex.ts');
const { QA, storeKey } = await import('../src/lib/storage.ts');
const { toasts } = await import('../src/lib/toasts.svelte.ts');

/** Where the page's requests go: nowhere, unless a test puts a server there. */
const nowhere = async (): Promise<Response> => {
  throw new TypeError('no server in a test');
};
let server: (r: Request) => Promise<Response> = nowhere;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => server(new Request(url, init))) as typeof fetch;

beforeEach(async () => {
  // (What the last test left on its way lands first, on the server it had.)
  await settled();
  await clearLeft();
  clearCopies();
  store.clear();
  server = nowhere;
  // (How a page with nothing kept starts.)
  Object.assign(backup, { on: false, savedAt: 0, failing: false, busy: null });
  toasts.list = [];
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

const bytes = (...b: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(b);

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

test('the page fits what the server keeps (signal/worker.js, its own tests in tests/keep.test.ts)', () => {
  assert.equal(PAGE_MAX_ENTRY, MAX_ENTRY);
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

/** Every order `n` records may meet in. */
const orders = (n: number): number[][] => (n ? orders(n - 1).flatMap((o) => Array.from({ length: n }, (_, i) => [...o.slice(0, i), n - 1, ...o.slice(i)])) : [[]]);
/** Where a device ends that meets `records` in each of those orders, one device an order. */
function endsOf(records: object[]) {
  return orders(records.length).map((order) => {
    store.clear();
    for (const i of order) absorbKept(JSON.stringify(records[i]));
    return loadKept();
  });
}

test('the newer always wins, so devices end on the same one in whatever order they meet; a Forget names its backup', () => {
  const one = base64url(newSecret());
  const two = base64url(newSecret());
  const A = 'A'.repeat(43);
  const B = 'B'.repeat(43);
  // Kept with one passkey on a device, with another on a second, the first kept with again on a third at the
  // very moment it's forgotten on a fourth.
  const records = [
    { v: 1, secret: two, at: 5, bucket: B },
    { v: 1, secret: one, at: 7, bucket: A },
    { v: 1, secret: one, at: 10, bucket: A },
    { v: 1, secret: null, at: 10, bucket: A },
  ];
  const ends = endsOf(records);
  assert.equal(ends.length, 24);
  for (const end of ends) assert.deepEqual(end, { secret: null, at: 10, bucket: A }, 'the Forget, of two of the same moment');
  // Kept with two passkeys at the same moment on two devices: every device ends on the same one of them.
  const same = endsOf([
    { v: 1, secret: one, at: 20, bucket: A },
    { v: 1, secret: two, at: 20, bucket: B },
    { v: 1, secret: two, at: 5, bucket: B },
  ]);
  assert.equal(new Set(same.map((k) => JSON.stringify(k))).size, 1, 'one end for every order');
  assert.equal(same[0]?.at, 20);
  // And a Forget of the other backup at that moment stands over both.
  for (const end of endsOf([
    { v: 1, secret: one, at: 20, bucket: A },
    { v: 1, secret: two, at: 20, bucket: B },
    { v: 1, secret: null, at: 20, bucket: B },
  ]))
    assert.deepEqual(end, { secret: null, at: 20, bucket: B });
  // Where it doesn't say (an older build saved it), it reads as before; a bucket that isn't one is let go.
  store.clear();
  assert.equal(absorbKept(JSON.stringify({ v: 1, secret: null, at: 200, bucket: 'short' })), true);
  assert.deepEqual(loadKept(), { secret: null, at: 200 });
});

// ---- leaving a secret behind -------------------------------------------------------

/** The Worker as the page reaches it, with a bucket for every secret. */
function serve() {
  const e = env();
  server = (r) => answer(new Request(r, { headers: { ...Object.fromEntries(r.headers), Origin: 'https://poe2.quest' } }), e as never);
}
const made = (secret: string) => fromSecret(fromBase64url(secret)!, CHANNEL);
const bucketOf = async (secret: string) => (await made(secret)).bucket;
const KEEP_URL = 'https://poe2-signal.poe2quest.workers.dev/keep/';
/** The devices with an entry under `secret`. */
const devicesIn = async (secret: string) => unpack(new Uint8Array(await (await fetch(KEEP_URL + (await bucketOf(secret)))).arrayBuffer())).map((e) => e.device);
/** `device`'s entry, sealed as the page seals it, put under `secret`. */
async function putEntry(secret: string, device: string) {
  const { bucket, key } = await made(secret);
  const data = await seal(JSON.stringify({ v: 1, copies: [], taken: {} }), key, bucket, device);
  assert.ok((await fetch(KEEP_URL + `${bucket}/${device}`, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' } })).ok);
}
/** This browser's progress: its codex, seen as given. */
const play = (seen: Record<string, number> = { [A.id]: 1 }) => store.set(storeKey('codex'), codexWith(seen));
/** A save of this device's progress under `secret`, the one it keeps with, as the page makes it (send), and what it left going after it. */
async function saved(secret: string) {
  assert.equal(loadKept()?.secret, secret, 'saved under the one it keeps with');
  await send();
  await clearLeft();
  assert.equal(loadSent()?.bucket, await bucketOf(secret), 'saved');
}
const fresh = () => base64url(newSecret());
/** What's under `secret`, opened: each device's entry ('entry'), or the secret its note says it moved to. */
async function opened(secret: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [device, text] of Object.entries(await textsIn(secret))) out[device] = text === null ? 'unreadable' : readEntry(text) ? 'entry' : (readNote(text)?.next ?? 'unreadable');
  return out;
}
/** Each device's note under `secret`, whole (null for an entry). */
async function notesIn(secret: string): Promise<Record<string, { next: string; at: number } | null>> {
  const out: Record<string, { next: string; at: number } | null> = {};
  for (const [device, text] of Object.entries(await textsIn(secret))) out[device] = text === null ? null : readNote(text);
  return out;
}
async function textsIn(secret: string): Promise<Record<string, string | null>> {
  const { bucket, key } = await made(secret);
  const out: Record<string, string | null> = {};
  for (const { device, data } of unpack(new Uint8Array(await (await fetch(KEEP_URL + bucket)).arrayBuffer()))) out[device] = await unseal(data, key, bucket, device, 10 * MAX_ENTRY);
  return out;
}
/** A Forget of `secret`'s backup, from a device this one never hears it from. */
async function forgetOn(secret: string) {
  assert.ok((await fetch(KEEP_URL + `${await bucketOf(secret)}/forget`, { method: 'POST', headers: { 'Content-Type': 'text/plain' } })).ok);
}
const pause = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('moving to a newer secret through sync leaves the old entry until a save under the new one, then only a note of where it went', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  play();
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  await saved(one);
  assert.deepEqual(await devicesIn(one), [me]);
  // A paired device kept with another passkey since: taken in here.
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: two, at: 200 })));
  assert.deepEqual(loadLeft(), [{ secret: one, device: me, after: two, at: 200 }]);
  // Not saved under the new one yet (the last save was the old one's): the old entry stays, the only one there is.
  await clearLeft();
  assert.deepEqual(await devicesIn(one), [me]);
  assert.equal(loadLeft().length, 1);
  await saved(two);
  assert.deepEqual(await opened(one), { [me]: two }, 'the passkey left behind holds nothing of this device’s progress, only where it went');
  assert.deepEqual(await notesIn(one), { [me]: { next: two, at: 200 } }, 'as of the record it moved to');
  assert.deepEqual(await opened(two), { [me]: 'entry' });
  assert.deepEqual(loadLeft(), []);
});

test('Bring it back while kept with another passkey leaves a note in place of the old one’s entry; one with nothing kept isn’t taken on', async () => {
  serve();
  const [one, two, empty] = [fresh(), fresh(), fresh()];
  play({ [A.id]: 3 });
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  await saved(one);
  // Nothing kept with it: this browser stays kept with the one it has, and leaves nothing.
  pick(empty);
  await bringBack();
  assert.equal(loadKept()?.secret, one);
  assert.deepEqual(loadLeft(), []);
  // Another device's progress kept with the second: brought back, and this device's under the first left to go
  // once its own is saved under the second (the save Bring it back starts).
  await putEntry(two, 'tablet000001');
  pick(two);
  await bringBack();
  const k = loadKept()!;
  assert.equal(k.secret, two);
  assert.deepEqual(loadLeft(), [{ secret: one, device: me, after: two, at: k.at }]);
  for (let i = 0; i < 200 && loadLeft().length; i++) await pause(10);
  assert.equal(loadSent()?.bucket, await bucketOf(two));
  assert.deepEqual(loadLeft(), []);
  assert.deepEqual(await notesIn(one), { [me]: { next: two, at: k.at } });
  assert.deepEqual(await opened(two), { [me]: 'entry', tablet000001: 'entry' });
  // Not kept at all, a passkey with nothing kept with it is taken on.
  store.clear();
  pick(empty);
  await bringBack();
  assert.equal(loadKept()?.secret, empty);
  assert.deepEqual(loadLeft(), []);
});

test('a Forget leaves nothing to take out, and what waited for a save under the forgotten one waits no more', async () => {
  serve();
  const [zero, one] = [fresh(), fresh()];
  saveKept({ secret: one, at: 100 });
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: null, at: 200, bucket: await bucketOf(one) })));
  assert.deepEqual(loadLeft(), []);
  // Moved from a first to a second, never saved under the second, which is then forgotten: the first's entry goes at once.
  store.clear();
  play();
  saveKept({ secret: zero, at: 100 });
  const me = deviceId();
  await saved(zero);
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: one, at: 200 })));
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: null, at: 300, bucket: await bucketOf(one) })));
  assert.deepEqual(loadLeft(), [{ secret: zero, device: me, after: null }]);
  await clearLeft();
  assert.deepEqual(await devicesIn(zero), []);
  assert.deepEqual(loadLeft(), []);
});

test('moving back to a secret drops what was left under it, the next save taking its place; a longer way leaves notes to its end', async () => {
  serve();
  const [one, two, three] = [fresh(), fresh(), fresh()];
  play();
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  await saved(one);
  absorbKept(JSON.stringify({ v: 1, secret: two, at: 200 }));
  absorbKept(JSON.stringify({ v: 1, secret: one, at: 300 }));
  assert.deepEqual(
    loadLeft().map((l) => l.secret),
    [one, two],
  );
  // Back on the first before any save under the second: what was left under the first is dropped unsent, its entry
  // there kept; the second's waits for a save under the first, where it points.
  await clearLeft();
  assert.deepEqual(
    loadLeft().map((l) => [l.secret, l.after]),
    [[two, one]],
  );
  assert.deepEqual(await devicesIn(one), [me]);
  await saved(one);
  assert.deepEqual(loadLeft(), []);
  assert.deepEqual(await opened(one), { [me]: 'entry' });
  // From the first to the second to the third, saved only under the third: neither of the two left holds anything of it.
  absorbKept(JSON.stringify({ v: 1, secret: two, at: 400 }));
  await saved(two);
  absorbKept(JSON.stringify({ v: 1, secret: three, at: 500 }));
  absorbKept(JSON.stringify({ v: 1, secret: one, at: 600 }));
  absorbKept(JSON.stringify({ v: 1, secret: three, at: 700 }));
  await saved(three);
  assert.deepEqual([await opened(one), await opened(two), await opened(three)], [{ [me]: three }, { [me]: three }, { [me]: 'entry' }]);
  assert.deepEqual(loadLeft(), []);
});

/** What the browser's passkeys do here: made (`create`) and picked (`get`). */
function credentials(value: Partial<CredentialsContainer>) {
  Object.defineProperty(globalThis.navigator, 'credentials', { configurable: true, value });
}
/** The passkey the player picks at Bring it back, as the browser hands it over. */
function pick(secret: string) {
  credentials({ get: async () => ({ response: { userHandle: userId(fromBase64url(secret)!, CHANNEL).buffer } }) as unknown as Credential });
}
/** `device`'s progress (its codex, seen as given) put under `secret`, as the page seals an entry. */
async function putProgress(secret: string, device: string, seen: Record<string, number>, at = 5000) {
  const { bucket, key } = await made(secret);
  const data = (await sealEntry({ copies: [{ device, kind: 'codex', at, raw: codexWith(seen) }], taken: {} }, key, bucket, device))!;
  assert.ok((await fetch(KEEP_URL + `${bucket}/${device}`, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' } })).ok);
}
/** Until the save Bring it back starts is in (or a while has gone). */
async function savedUnder(secret: string) {
  const bucket = await bucketOf(secret);
  for (let i = 0; i < 200 && loadSent()?.bucket !== bucket; i++) await pause(10);
  assert.equal(loadSent()?.bucket, bucket);
}

test('after devices with different passkeys sync, each brings everything back with the only passkey it holds', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  // The second computer, kept with its own passkey (newer), its progress saved under it.
  play({ [B.id]: 4 });
  saveKept({ secret: two, at: 200 });
  await saved(two);
  const second = new Map(store);
  // The first, kept with its own, saved under it.
  store.clear();
  play({ [A.id]: 3 });
  saveKept({ secret: one, at: 100 });
  await saved(one);
  // Paired: the second’s passkey is newer and wins, and the first saves under it.
  assert.ok(absorbKept(second.get(storeKey('backup'))!));
  await saved(two);
  // Both browsers cleared, the second’s first: each comes back as a new device with the only passkey it held.
  for (const secret of [two, one]) {
    clearCopies();
    store.clear();
    pick(secret);
    await bringBack();
    const codex = loadCodex();
    assert.deepEqual([codex.items[A.id]?.seen, codex.items[B.id]?.seen], [3, 4], 'both computers’ progress back');
    assert.equal(loadKept()?.secret, two, 'kept with the newer passkey, where the others are');
    await savedUnder(two);
  }
});

/** `device`'s note under `secret`, as clearLeft seals one: it moved on to `next`, at `at`. */
async function putNote(secret: string, device: string, next: string, at: number) {
  const { bucket, key } = await made(secret);
  const data = await seal(JSON.stringify({ v: 1, next, at }), key, bucket, device);
  assert.ok((await fetch(KEEP_URL + `${bucket}/${device}`, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' } })).ok);
}

test('notes are followed to the end of a chain, every bucket on the way taken in, and kept with where it ends', async () => {
  serve();
  const [one, two, three] = [fresh(), fresh(), fresh()];
  // This device moves from the first to the second to the third, saving under each; a tablet's progress under the second.
  play({ [A.id]: 3 });
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  await saved(one);
  absorbKept(JSON.stringify({ v: 1, secret: two, at: 200 }));
  await saved(two);
  await putProgress(two, 'tablet000001', { [B.id]: 2 });
  absorbKept(JSON.stringify({ v: 1, secret: three, at: 300 }));
  await saved(three);
  assert.deepEqual([await opened(one), await opened(two), await opened(three)], [{ [me]: two }, { [me]: three, tablet000001: 'entry' }, { [me]: 'entry' }]);
  // A fresh browser with the first passkey only.
  clearCopies();
  store.clear();
  pick(one);
  await bringBack();
  const codex = loadCodex();
  assert.deepEqual([codex.items[A.id]?.seen, codex.items[B.id]?.seen], [3, 2]);
  assert.equal(loadKept()?.secret, three);
  await savedUnder(three);
});

test('notes that lead in a loop are each opened once, and no more than MAX_WALK buckets are, kept with one of those opened', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  // A laptop moved from the first to the second, a phone from the second back to the first, later.
  await putNote(one, 'laptop000001', two, 1000);
  await putNote(two, 'phone0000001', one, 2000);
  await putProgress(one, 'phone0000001', { [A.id]: 3 });
  await putProgress(two, 'laptop000001', { [B.id]: 2 });
  const gets: string[] = [];
  const served = server;
  server = (r) => (r.method === 'GET' && gets.push(new URL(r.url).pathname.split('/')[2]), served(r));
  pick(two);
  await bringBack();
  assert.equal(gets.length, 2, 'each bucket once');
  const codex = loadCodex();
  assert.deepEqual([codex.items[A.id]?.seen, codex.items[B.id]?.seen], [3, 2]);
  assert.equal(loadKept()?.secret, one, 'where the newest note leads');
  await savedUnder(one);
  // A chain longer than the most: no more than that many are opened, and the newest note among them that leads to one
  // opened says where to keep, never one past the end (it could be forgotten).
  clearCopies();
  store.clear();
  const chain = Array.from({ length: MAX_WALK + 3 }, fresh);
  for (let i = 0; i + 1 < chain.length; i++) await putNote(chain[i], 'laptop000001', chain[i + 1], 1000 + i);
  gets.length = 0;
  pick(chain[0]);
  await bringBack();
  assert.equal(gets.length, MAX_WALK);
  const kept = loadKept()?.secret;
  assert.ok(kept && gets.includes(await bucketOf(kept)), 'kept with a bucket it opened');
  assert.equal(kept, chain[MAX_WALK - 1]);
});
test('a note alone is nothing kept, and a build before notes passes it over', async () => {
  serve();
  const [one, two, mine] = [fresh(), fresh(), fresh()];
  await putNote(one, 'laptop000001', two, 1000);
  // As a build before notes reads it: an entry it can't read.
  assert.equal(readEntry(JSON.stringify({ v: 1, next: two, at: 1000 })), null);
  assert.deepEqual(readNote(JSON.stringify({ v: 1, next: two, at: 1000 })), { next: two, at: 1000 });
  for (const text of ['{"v":1,"copies":[],"taken":{}}', JSON.stringify({ v: 1, next: 'short', at: 1 }), JSON.stringify({ v: 2, next: two, at: 1 })]) assert.equal(readNote(text), null, text);
  // Kept with another: it stays with it, and leaves nothing.
  saveKept({ secret: mine, at: 100 });
  pick(one);
  await bringBack();
  assert.equal(loadKept()?.secret, mine);
  assert.deepEqual(loadLeft(), []);
  // Not kept: taken on, where the note leads, and said to be nothing.
  store.clear();
  await bringBack();
  assert.equal(loadKept()?.secret, two);
  assert.equal(toasts.list.at(-1)?.message, 'If you made another passkey, bring that one back. Until then, your progress here is kept with this one.');
});

test('moving back to a secret it left replaces its note there with its progress', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  play({ [A.id]: 3 });
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  await saved(one);
  absorbKept(JSON.stringify({ v: 1, secret: two, at: 200 }));
  await saved(two);
  assert.deepEqual(await opened(one), { [me]: two });
  absorbKept(JSON.stringify({ v: 1, secret: one, at: 300 }));
  await saved(one);
  assert.deepEqual([await opened(one), await opened(two)], [{ [me]: 'entry' }, { [me]: one }]);
  assert.deepEqual(loadLeft(), []);
});

test('of several notes, the newest says where to keep', async () => {
  serve();
  const [one, two, three] = [fresh(), fresh(), fresh()];
  await putNote(one, 'laptop000001', three, 3000);
  await putNote(one, 'phone0000001', two, 1000);
  await putProgress(two, 'phone0000001', { [A.id]: 1 });
  await putProgress(three, 'laptop000001', { [B.id]: 2 });
  pick(one);
  await bringBack();
  const codex = loadCodex();
  assert.deepEqual([codex.items[A.id]?.seen, codex.items[B.id]?.seen], [1, 2]);
  assert.equal(loadKept()?.secret, three);
  await savedUnder(three);
});

test('the codex erased takes this device’s entry out under the name it had, tried again until it goes', async () => {
  const one = fresh();
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  // Out of reach as it's erased; sync's erase gives this browser a new name.
  await eraseBackup();
  forgetDevice();
  assert.notEqual(deviceId(), me);
  assert.equal(loadKept(), null);
  assert.deepEqual(loadLeft(), [{ secret: one, device: me, after: null }]);
  // Reached, as the page next starts.
  serve();
  await putEntry(one, me);
  await putEntry(one, 'tablet000001');
  await clearLeft();
  assert.deepEqual(await devicesIn(one), ['tablet000001']);
  assert.deepEqual(loadLeft(), []);
});

test('a save from before the list reads as none, and it keeps the newest few', () => {
  assert.deepEqual(loadLeft(), []);
  for (const raw of ['nonsense', '{}', JSON.stringify([{ secret: 'short', device: 'phone0000001', after: null }])]) {
    store.set(storeKey('backup.left'), raw);
    assert.deepEqual(loadLeft(), [], raw);
  }
  const secrets = Array.from({ length: MAX_LEFT + 2 }, fresh);
  for (const s of secrets) leave(s, 'phone0000001', null);
  assert.deepEqual(
    loadLeft().map((l) => l.secret),
    secrets.slice(2),
  );
});

test('Bring it back says when everything kept with the passkey is here already', async () => {
  serve();
  const one = fresh();
  await putProgress(one, 'tablet000001', { [A.id]: 3 });
  pick(one);
  await bringBack();
  assert.equal(toasts.list.at(-1)?.title, 'Brought back');
  await savedUnder(one);
  await bringBack();
  assert.deepEqual([toasts.list.at(-1)?.title, toasts.list.at(-1)?.message], ['Already here', 'Everything kept with that passkey is here already.']);
  assert.equal(loadCodex().items[A.id]?.seen, 3);
  await savedUnder(one);
});

// ---- a bucket forgotten -------------------------------------------------------------

test('a save refused as forgotten (on a device this one never heard it from) stops keeping here, just after the record it replaces', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  const bucket = await bucketOf(one);
  play();
  saveKept({ secret: one, at: 100, bucket });
  // (As the page read it as it started.)
  backup.on = true;
  await forgetOn(one);
  await send();
  assert.deepEqual(loadKept(), { secret: null, at: 101, bucket });
  assert.equal(backup.on, false);
  assert.equal(loadSent(), null);
  assert.equal(toasts.list.at(-1)?.title, 'No longer kept');
  // Nothing more sent with it.
  let asked = 0;
  const served = server;
  server = (r) => (asked++, served(r));
  play({ [A.id]: 2 });
  await send();
  assert.equal(asked, 0);
  // The record it replaced never stands over it again; one set since on another device does, though this clock is later.
  assert.equal(absorbKept(JSON.stringify({ v: 1, secret: one, at: 100, bucket })), false);
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: two, at: 200, bucket: await bucketOf(two) })));
  assert.equal(loadKept()?.secret, two);
});

test('what was left under a bucket forgotten since is let go, a note and an entry to take out alike', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  await forgetOn(one);
  saveKept({ secret: two, at: 300 });
  leave(one, 'laptop000001', null);
  leave(one, deviceId(), two, 300);
  saveSent({ at: Date.now(), print: '1:1', bucket: await bucketOf(two) });
  assert.equal(loadLeft().length, 2);
  await clearLeft();
  assert.deepEqual(loadLeft(), []);
});

test('a forgotten passkey brings nothing back and isn’t kept with; one whose notes lead to one forgotten since stays with its own', async () => {
  serve();
  const [one, two, mine] = [fresh(), fresh(), fresh()];
  await putProgress(one, 'tablet000001', { [A.id]: 3 });
  await forgetOn(one);
  assert.deepEqual(await walk(one), { entries: [], next: null });
  const forgotten = 'What was kept with that passkey was deleted with Forget, so it brings nothing back.';
  pick(one);
  await bringBack();
  assert.equal(loadKept(), null);
  assert.equal(loadCodex().items[A.id], undefined);
  assert.deepEqual([toasts.list.at(-1)?.title, toasts.list.at(-1)?.message], ['Nothing kept with it', forgotten]);
  // Kept with another: it stays with it, and leaves nothing.
  saveKept({ secret: mine, at: 100 });
  await bringBack();
  assert.equal(loadKept()?.secret, mine);
  assert.deepEqual(loadLeft(), []);
  // A phone's progress under the first, and a laptop's note there of where it went, the second, forgotten since.
  store.clear();
  const [three, four] = [fresh(), fresh()];
  await putProgress(three, 'phone0000001', { [A.id]: 3 });
  await putNote(three, 'laptop000001', four, 1000);
  await putProgress(four, 'laptop000001', { [B.id]: 2 });
  await forgetOn(four);
  const walked = await walk(three);
  assert.deepEqual([walked?.next, walked?.entries.map((e) => e.device)], [three, ['phone0000001']]);
  pick(three);
  await bringBack();
  assert.equal(loadKept()?.secret, three, 'kept with the one still there');
  const codex = loadCodex();
  assert.deepEqual([codex.items[A.id]?.seen, codex.items[B.id]?.seen], [3, undefined]);
  assert.equal(toasts.list.at(-1)?.title, 'Brought back');
  await savedUnder(three);
});

// ---- at the player's word, with a save on its way ----------------------------------

interface Gate {
  /** Once a request it holds has come. */
  arrived: Promise<void>;
  /** Lets what it holds through (and whatever comes after). */
  release: () => void;
}
/**
 * The server, with what each of `picks` picks out held until the test lets
 * it through, and a log of what came in order: each request as it came (an
 * entry with nothing in it marked so), and again as it was answered.
 */
function gated(...picks: ((method: string, path: string) => boolean)[]) {
  const served = server;
  const log: string[] = [];
  const gates = picks.map((pick) => {
    let release!: () => void;
    let arrive!: () => void;
    const open = new Promise<void>((r) => (release = r));
    const arrived = new Promise<void>((r) => (arrive = r));
    return { pick, open, arrived, arrive, release };
  });
  server = async (r) => {
    const path = new URL(r.url).pathname.slice('/keep/'.length);
    const empty = r.method === 'POST' && !path.endsWith('/forget') && !(await r.clone().arrayBuffer()).byteLength;
    const said = `${r.method} ${path}${empty ? ' (empty)' : ''}`;
    log.push(said);
    const gate = gates.find((g) => g.pick(r.method, path));
    if (gate) {
      gate.arrive();
      await gate.open;
    }
    const answered = await served(r);
    log.push(`${said}: ${answered.status}`);
    return answered;
  };
  const held: Gate[] = gates.map(({ arrived, release }) => ({ arrived, release }));
  return { log, held, releaseAll: () => gates.forEach((g) => g.release()) };
}

test('Forget waits for a save on its way, and nothing is sent while it goes or after', async () => {
  // (The game's own page, not the desk's acted-out buttons.)
  assert.equal(QA, false);
  serve();
  const [one, two] = [fresh(), fresh()];
  const bucket = await bucketOf(one);
  play();
  saveKept({ secret: one, at: 100, bucket });
  const entry = `${bucket}/${deviceId()}`;
  const { log, held, releaseAll } = gated(
    (m, p) => m === 'POST' && p === entry,
    (m, p) => p === `${bucket}/forget`,
  );
  const [save, forget] = held;
  try {
    const saving = send();
    await save.arrived;
    const forgetting = forgetBackup();
    await pause();
    assert.deepEqual(log, [`POST ${entry}`], 'no Forget while a save is on its way');
    save.release();
    await forget.arrived;
    // Played on while the Forget goes: nothing of it is sent.
    play({ [A.id]: 2 });
    const later = send();
    await pause();
    forget.release();
    await Promise.all([saving, forgetting, later]);
  } finally {
    releaseAll();
  }
  assert.deepEqual(log, [`POST ${entry}`, `POST ${entry}: 204`, `POST ${bucket}/forget`, `POST ${bucket}/forget: 204`]);
  assert.equal((await fetch(KEEP_URL + bucket)).status, 410);
  const k = loadKept()!;
  assert.deepEqual([k.secret, k.bucket], [null, bucket], 'a Forget, naming the backup it forgot');
  assert.ok(k.at > 100);
  assert.equal(backup.busy, null);
  // Sends go on after it: kept with another, saved under it.
  saveKept({ secret: two, at: nextAt() });
  await saved(two);
});

test('a secret taken while a Forget goes stands, and the one forgotten is gone from the server all the same', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  const bucket = await bucketOf(one);
  play();
  saveKept({ secret: one, at: 100, bucket });
  const me = deviceId();
  const {
    held: [forget],
    releaseAll,
  } = gated((m, p) => p === `${bucket}/forget`);
  try {
    const forgetting = forgetBackup();
    await forget.arrived;
    // Kept with another passkey on a paired device meanwhile, and taken in here.
    assert.ok(absorbKept(JSON.stringify({ v: 1, secret: two, at: 200, bucket: await bucketOf(two) })));
    forget.release();
    await forgetting;
  } finally {
    releaseAll();
  }
  assert.deepEqual(loadKept(), { secret: two, at: 200, bucket: await bucketOf(two) });
  assert.equal(backup.busy, null);
  assert.equal((await fetch(KEEP_URL + bucket)).status, 410);
  // Kept with from now on; the note it would leave under the forgotten one is let go.
  await saved(two);
  assert.deepEqual(await devicesIn(two), [me]);
  assert.deepEqual(loadLeft(), []);
});

test('the codex erased while a save is on its way takes the entry out only once the save is in', async () => {
  serve();
  const one = fresh();
  const bucket = await bucketOf(one);
  play();
  saveKept({ secret: one, at: 100, bucket });
  const entry = `${bucket}/${deviceId()}`;
  await putEntry(one, 'tablet000001');
  const {
    log,
    held: [save],
    releaseAll,
  } = gated((m, p) => m === 'POST' && p === entry);
  try {
    const saving = send();
    await save.arrived;
    const erasing = eraseBackup();
    await pause();
    assert.deepEqual(log, [`POST ${entry}`], 'nothing taken out while the save is on its way');
    save.release();
    await Promise.all([saving, erasing]);
  } finally {
    releaseAll();
  }
  assert.deepEqual(log, [`POST ${entry}`, `POST ${entry}: 204`, `POST ${entry} (empty)`, `POST ${entry} (empty): 204`]);
  assert.deepEqual(await devicesIn(one), ['tablet000001']);
  assert.deepEqual([loadKept(), loadSent(), loadLeft()], [null, null, []]);
});

test('a save still being sealed as a Forget or an erase starts is never sent', async () => {
  serve();
  const one = fresh();
  const bucket = await bucketOf(one);
  play();
  saveKept({ secret: one, at: 100, bucket });
  let { log } = gated();
  await Promise.all([send(), forgetBackup()]);
  assert.deepEqual(log, [`POST ${bucket}/forget`, `POST ${bucket}/forget: 204`], 'only the Forget');
  // The codex erased: only its entry taken out.
  store.clear();
  serve();
  play();
  saveKept({ secret: one, at: 100, bucket });
  const entry = `${bucket}/${deviceId()}`;
  ({ log } = gated());
  await Promise.all([send(), eraseBackup()]);
  assert.deepEqual(log, [`POST ${entry} (empty)`, `POST ${entry} (empty): 204`], 'only the entry taken out');
});

test('Keep it safe names the passkey with the day it was made; a secret taken while its sheet was up is left with a note, and only a save under the new one counts', async () => {
  serve();
  play({ [A.id]: 3 });
  const other = fresh();
  let asked: CredentialCreationOptions | undefined;
  let made!: () => void;
  credentials({ create: (o) => ((asked = o), new Promise((r) => (made = () => r({} as Credential)))) });
  const keeping = keepSafe();
  const user = asked!.publicKey!.user;
  assert.equal(user.name, passkeyName(new Date()));
  assert.match(user.name, /^PoE2\.Quest progress, \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  const kept = base64url(secretIn(new Uint8Array(user.id as Uint8Array), CHANNEL) as Uint8Array);
  const me = deviceId();
  const entry = `${await bucketOf(kept)}/${me}`;
  const {
    held: [save],
    releaseAll,
  } = gated((m, p) => m === 'POST' && p === entry);
  try {
    // A paired device kept with another passkey while the sheet was up, taken in here.
    assert.ok(absorbKept(JSON.stringify({ v: 1, secret: other, at: 500 })));
    // And what was saved before, under another bucket.
    saveSent({ at: 1234, print: '1:1', bucket: 'C'.repeat(43) });
    made();
    await save.arrived;
    const k = loadKept()!;
    assert.equal(k.secret, kept);
    assert.deepEqual(loadLeft(), [{ secret: other, device: me, after: kept, at: k.at }]);
    assert.deepEqual([backup.on, backup.savedAt], [true, 0], 'a save under another bucket isn’t one under this');
    save.release();
    await keeping;
    assert.deepEqual([backup.savedAt, toasts.list.at(-1)?.title], [loadSent()!.at, 'Kept safe']);
    await clearLeft();
    assert.deepEqual(await notesIn(other), { [me]: { next: kept, at: k.at } });
    assert.deepEqual(loadLeft(), []);
  } finally {
    releaseAll();
  }
});

test('what an older build left to take out, without the time it moved, still goes, its note stamped as it’s sent', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  const me = deviceId();
  store.set(storeKey('backup.left'), JSON.stringify([{ secret: one, device: me, after: two }]));
  assert.deepEqual(loadLeft(), [{ secret: one, device: me, after: two }]);
  play();
  saveKept({ secret: two, at: 100 });
  const before = Date.now();
  await saved(two);
  const note = (await notesIn(one))[me];
  assert.equal(note?.next, two);
  assert.ok(note && note.at >= before && note.at <= Date.now(), 'as of when it was sent');
  assert.deepEqual(loadLeft(), []);
});

test('a save that fails along the way is tried again in a while, never left unhandled', async () => {
  serve();
  const one = fresh();
  play();
  saveKept({ secret: one, at: 100 });
  let asked = 0;
  const served = server;
  server = (r) => (asked++, served(r));
  // Sealing throws, once.
  Object.defineProperty(crypto.subtle, 'encrypt', {
    configurable: true,
    value: async () => {
      throw new Error('can’t seal');
    },
  });
  try {
    await assert.doesNotReject(send());
    assert.deepEqual([backup.failing, asked], [true, 0]);
  } finally {
    delete (crypto.subtle as Partial<SubtleCrypto>).encrypt;
    // (The try again in a while let go, as an erase does: the test stops here.)
    await eraseBackup();
  }
});

test('a browser that can’t seal (Safari before 16.4) never watches or sends; one that can does', async () => {
  const listened: string[] = [];
  const listen = (type: string) => void listened.push(type);
  const was = { document: g.document, addEventListener: g.addEventListener, isSecureContext: g.isSecureContext };
  const compression = Object.getOwnPropertyDescriptor(globalThis, 'CompressionStream')!;
  // A page of the game (SYNC_HERE), in a secure context.
  g.document = { documentElement: { hasAttribute: () => false, getAttribute: () => null }, addEventListener: listen, visibilityState: 'visible' };
  g.addEventListener = listen;
  g.isSecureContext = true;
  serve();
  let asked = 0;
  const served = server;
  server = (r) => (asked++, served(r));
  try {
    const name = 'boot';
    const page = (await import(`../src/lib/backup/backup.svelte.ts?page=${name}`)) as typeof import('../src/lib/backup/backup.svelte.ts');
    // (What the page's other modules listen for as they load isn't the backup's.)
    listened.length = 0;
    // Kept with, and an entry left to take out: a page that keeps here would send both.
    play();
    saveKept({ secret: fresh(), at: 100 });
    leave(fresh(), 'laptop000001', null);
    delete (globalThis as Partial<typeof globalThis>).CompressionStream;
    await page.bootBackup();
    await pause();
    assert.deepEqual([listened, asked], [[], 0]);
    // Where it can: watched (nothing kept, so nothing sent).
    Object.defineProperty(globalThis, 'CompressionStream', compression);
    store.clear();
    await page.bootBackup();
    assert.deepEqual([...listened].sort(), ['storage', 'visibilitychange']);
  } finally {
    Object.defineProperty(globalThis, 'CompressionStream', compression);
    for (const [k, v] of Object.entries(was)) {
      if (v === undefined) delete g[k];
      else g[k] = v;
    }
  }
});
