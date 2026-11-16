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
// with the only passkey it holds.
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
const { MAX_ENTRY: PAGE_MAX_ENTRY, MAX_WALK, bringBack, clearLeft, entryNow, eraseBackup, readEntry, readNote, sealEntry, takeEntries, unpack } = await import('../src/lib/backup/backup.svelte.ts');
const { MAX_LEFT, absorbKept, forgetKept, forgetToSend, leave, loadKept, loadLeft, loadSent, markForgotten, nextAt, ownKeptRaw, saveKept, saveSent } = await import('../src/lib/backup/kept.ts');
const { clearCopies, deviceId, forgetDevice, keepCopy, readCopies } = await import('../src/lib/sync/store.ts');
const { CHANNEL } = await import('../src/lib/channel.ts');
const { fromBase64url } = await import('../src/lib/base64url.ts');
const { takeIn, takenNow } = await import('../src/lib/sync/shared.ts');
const { emptyCodex, loadCodex, serializeCodex } = await import('../src/lib/codex.ts');
const { storeKey } = await import('../src/lib/storage.ts');
const { toasts } = await import('../src/lib/toasts.svelte.ts');

/** Where the page's requests go: nowhere, unless a test puts a server there. */
const nowhere = async (): Promise<Response> => {
  throw new TypeError('no server in a test');
};
let server: (r: Request) => Promise<Response> = nowhere;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => server(new Request(url, init))) as typeof fetch;

beforeEach(() => {
  clearCopies();
  store.clear();
  server = nowhere;
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

test('the newer always wins, so devices end on the same one in whatever order they meet; a Forget names its backup', () => {
  const one = base64url(newSecret());
  const two = base64url(newSecret());
  const A = 'A'.repeat(43);
  const B = 'B'.repeat(43);
  // Kept with one passkey on a device, with another on a second, and the second's forgotten on a third, last.
  const records = [
    { v: 1, secret: two, at: 5, bucket: B },
    { v: 1, secret: one, at: 7, bucket: A },
    { v: 1, secret: null, at: 10, bucket: A },
  ];
  const orders = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  for (const order of orders) {
    store.clear();
    for (const i of order) absorbKept(JSON.stringify(records[i]));
    assert.deepEqual(loadKept(), { secret: null, at: 10, bucket: A }, `met in the order ${order}`);
  }
  // Where it doesn't say (an older build saved it), it reads as before; a bucket that isn't one is let go.
  store.clear();
  assert.equal(absorbKept(JSON.stringify({ v: 1, secret: null, at: 200, bucket: 'short' })), true);
  assert.deepEqual(loadKept(), { secret: null, at: 200 });
});

test('a device that hears of a Forget deletes that backup again, once: what it sent before it heard goes too', () => {
  const one = base64url(newSecret());
  const A = 'A'.repeat(43);
  saveKept({ secret: one, at: 100, bucket: A });
  assert.equal(forgetToSend(), null, 'nothing to delete while it keeps');
  // Forgotten on another device: heard here, to be deleted from here too.
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: null, at: 200, bucket: A })));
  const k = forgetToSend();
  assert.deepEqual(k, { secret: null, at: 200, bucket: A });
  markForgotten(k!);
  assert.equal(forgetToSend(), null, 'once');
  // Brought back and forgotten again: deleted again.
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: one, at: 300, bucket: A })));
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: null, at: 400, bucket: A })));
  assert.equal(forgetToSend()?.at, 400);
  // A Forget that doesn't name its backup (an older build's) can't be.
  store.clear();
  saveKept({ secret: null, at: 500 });
  assert.equal(forgetToSend(), null);
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
/** A save of this device's under `secret`, as the page makes one: its entry in, the bucket stamped, then what it left goes. */
async function saveUnder(secret: string) {
  await putEntry(secret, deviceId());
  saveSent({ at: Date.now(), print: '1:1', bucket: await bucketOf(secret) });
  await clearLeft();
}
const fresh = () => base64url(newSecret());
/** What's under `secret`, opened: each device's entry ('entry'), or the secret its note says it moved to. */
async function opened(secret: string): Promise<Record<string, string>> {
  const { bucket, key } = await made(secret);
  const out: Record<string, string> = {};
  for (const { device, data } of unpack(new Uint8Array(await (await fetch(KEEP_URL + bucket)).arrayBuffer()))) {
    const text = await unseal(data, key, bucket, device, 10 * MAX_ENTRY);
    out[device] = text === null ? 'unreadable' : readEntry(text) ? 'entry' : (readNote(text)?.next ?? 'unreadable');
  }
  return out;
}

test('moving to a newer secret through sync leaves the old entry until a save under the new one, then only a note of where it went', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  await saveUnder(one);
  assert.deepEqual(await devicesIn(one), [me]);
  // A paired device kept with another passkey since: taken in here.
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: two, at: 200 })));
  assert.deepEqual(loadLeft(), [{ secret: one, device: me, after: two }]);
  // Not saved under the new one yet (the last save was the old one's): the old entry stays, the only one there is.
  await clearLeft();
  assert.deepEqual(await devicesIn(one), [me]);
  assert.equal(loadLeft().length, 1);
  await saveUnder(two);
  assert.deepEqual(await opened(one), { [me]: two }, 'the passkey left behind holds nothing of this device’s progress, only where it went');
  assert.deepEqual(await opened(two), { [me]: 'entry' });
  assert.deepEqual(loadLeft(), []);
});

test('Bring it back while kept with another passkey leaves a note in place of the old one’s entry; one with nothing kept isn’t taken on', async () => {
  serve();
  const [one, two, empty] = [fresh(), fresh(), fresh()];
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  await saveUnder(one);
  // The passkey the player picks, as the browser hands it over.
  let picked = two;
  Object.defineProperty(globalThis.navigator, 'credentials', {
    configurable: true,
    value: { get: async () => ({ response: { userHandle: userId(fromBase64url(picked)!, CHANNEL).buffer } }) },
  });
  // Nothing kept with it: this browser stays kept with the one it has, and leaves nothing.
  picked = empty;
  await bringBack();
  assert.equal(loadKept()?.secret, one);
  assert.deepEqual(loadLeft(), []);
  // Another device's progress kept with the second: brought back, and this device's under the first left to go
  // once its own is saved under the second (the save Bring it back starts, with progress to keep).
  store.set(storeKey('codex'), codexWith({ [A.id]: 3 }));
  await putEntry(two, 'tablet000001');
  picked = two;
  await bringBack();
  assert.equal(loadKept()?.secret, two);
  assert.deepEqual(loadLeft(), [{ secret: one, device: me, after: two }]);
  for (let i = 0; i < 200 && loadLeft().length; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(loadSent()?.bucket, await bucketOf(two));
  assert.deepEqual(loadLeft(), []);
  assert.deepEqual(await opened(one), { [me]: two });
  assert.deepEqual(await opened(two), { [me]: 'entry', tablet000001: 'entry' });
  // Not kept at all, a passkey with nothing kept with it is taken on.
  store.clear();
  picked = empty;
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
  saveKept({ secret: zero, at: 100 });
  const me = deviceId();
  await saveUnder(zero);
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
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  await saveUnder(one);
  absorbKept(JSON.stringify({ v: 1, secret: two, at: 200 }));
  absorbKept(JSON.stringify({ v: 1, secret: one, at: 300 }));
  assert.deepEqual(
    loadLeft().map((l) => l.secret),
    [one, two],
  );
  // Back on the first before any save under the second: what was left under the first is dropped unsent, its entry there kept.
  await clearLeft();
  assert.deepEqual(loadLeft(), []);
  assert.deepEqual(await devicesIn(one), [me]);
  // From the first to the second to the third, saved only under the third: neither of the two left holds anything of it.
  absorbKept(JSON.stringify({ v: 1, secret: two, at: 400 }));
  await saveUnder(two);
  absorbKept(JSON.stringify({ v: 1, secret: three, at: 500 }));
  absorbKept(JSON.stringify({ v: 1, secret: one, at: 600 }));
  absorbKept(JSON.stringify({ v: 1, secret: three, at: 700 }));
  await saveUnder(three);
  assert.deepEqual([await opened(one), await opened(two), await opened(three)], [{ [me]: three }, { [me]: three }, { [me]: 'entry' }]);
  assert.deepEqual(loadLeft(), []);
});

/** The passkey the player picks at Bring it back, as the browser hands it over. */
function pick(secret: string) {
  Object.defineProperty(globalThis.navigator, 'credentials', {
    configurable: true,
    value: { get: async () => ({ response: { userHandle: userId(fromBase64url(secret)!, CHANNEL).buffer } }) },
  });
}
/** `device`'s progress (its codex, seen as given) put under `secret`, as the page seals an entry. */
async function putProgress(secret: string, device: string, seen: Record<string, number>, at = 5000) {
  const { bucket, key } = await made(secret);
  const data = (await sealEntry({ copies: [{ device, kind: 'codex', at, raw: codexWith(seen) }], taken: {} }, key, bucket, device))!;
  assert.ok((await fetch(KEEP_URL + `${bucket}/${device}`, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' } })).ok);
}
/** A save of this device’s own progress under `secret`, as the page makes one: its entry in, the bucket stamped, then what it left goes. */
async function saveProgressUnder(secret: string) {
  const now = entryNow()!;
  const { bucket, key } = await made(secret);
  const data = (await sealEntry(now.entry, key, bucket, deviceId()))!;
  assert.ok((await fetch(KEEP_URL + `${bucket}/${deviceId()}`, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' } })).ok);
  saveSent({ at: Date.now(), print: now.print, bucket });
  await clearLeft();
}
/** Until the save Bring it back starts is in (or a while has gone). */
async function savedUnder(secret: string) {
  const bucket = await bucketOf(secret);
  for (let i = 0; i < 200 && loadSent()?.bucket !== bucket; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(loadSent()?.bucket, bucket);
}

test('after devices with different passkeys sync, each brings everything back with the only passkey it holds', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  // The second computer, kept with its own passkey (newer), its progress under it.
  await putProgress(two, 'pc2000000001', { [B.id]: 4 });
  // The first, kept with its own, saved under it.
  store.set(storeKey('codex'), codexWith({ [A.id]: 3 }));
  saveKept({ secret: one, at: 100 });
  await saveProgressUnder(one);
  // Paired: the second’s passkey is newer and wins, and the first saves under it.
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: two, at: 200 })));
  await saveProgressUnder(two);
  // The second computer is lost, and the first’s browser cleared: it holds only its own passkey.
  clearCopies();
  store.clear();
  pick(one);
  await bringBack();
  const codex = loadCodex();
  assert.deepEqual([codex.items[A.id]?.seen, codex.items[B.id]?.seen], [3, 4], 'both computers’ progress back');
  assert.equal(loadKept()?.secret, two, 'kept with the newer passkey, where the others are');
  await savedUnder(two);
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
  store.set(storeKey('codex'), codexWith({ [A.id]: 3 }));
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  await saveProgressUnder(one);
  absorbKept(JSON.stringify({ v: 1, secret: two, at: 200 }));
  await saveProgressUnder(two);
  await putProgress(two, 'tablet000001', { [B.id]: 2 });
  absorbKept(JSON.stringify({ v: 1, secret: three, at: 300 }));
  await saveProgressUnder(three);
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

test('notes that lead in a loop are each opened once, and no more than MAX_WALK buckets are', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  // A laptop moved from the first to the second, a phone from the second back to the first, later.
  await putNote(one, 'laptop000001', two, 1000);
  await putNote(two, 'phone0000001', one, 2000);
  await putProgress(one, 'phone0000001', { [A.id]: 3 });
  await putProgress(two, 'laptop000001', { [B.id]: 2 });
  let opens = 0;
  const served = server;
  server = (r) => (r.method === 'GET' && opens++, served(r));
  pick(two);
  await bringBack();
  assert.equal(opens, 2, 'each bucket once');
  const codex = loadCodex();
  assert.deepEqual([codex.items[A.id]?.seen, codex.items[B.id]?.seen], [3, 2]);
  assert.equal(loadKept()?.secret, one, 'where the newest note leads');
  await savedUnder(one);
  // A chain longer than the most: no more than that many are opened.
  clearCopies();
  store.clear();
  const chain = Array.from({ length: MAX_WALK + 3 }, fresh);
  for (let i = 0; i + 1 < chain.length; i++) await putNote(chain[i], 'laptop000001', chain[i + 1], 1000 + i);
  opens = 0;
  pick(chain[0]);
  await bringBack();
  assert.equal(opens, MAX_WALK);
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
  assert.equal(toasts.list.at(-1)?.title, 'Nothing kept with it');
});

test('moving back to a secret it left replaces its note there with its progress', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  store.set(storeKey('codex'), codexWith({ [A.id]: 3 }));
  saveKept({ secret: one, at: 100 });
  const me = deviceId();
  await saveProgressUnder(one);
  absorbKept(JSON.stringify({ v: 1, secret: two, at: 200 }));
  await saveProgressUnder(two);
  assert.deepEqual(await opened(one), { [me]: two });
  absorbKept(JSON.stringify({ v: 1, secret: one, at: 300 }));
  await saveProgressUnder(one);
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
