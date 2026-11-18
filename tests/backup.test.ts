// Keeping progress with a passkey (lib/backup/, signal/worker.js Keep): what
// the secret makes, apart for each channel; a device's progress sealed so it
// opens only as that device's; the server's frames; and what's brought back,
// a save from an older build too, and the copies a device held of others',
// taken in as sync takes another device's, never counted twice. Through
// sync, a device keeping with none borrows a paired device's passkey, and
// one with a passkey never swaps it; an older build's records still load.
// Each device then brings everything back with the passkey it holds: the
// owner's lost phone through the computer that borrowed its passkey, and
// devices each with their own. Forget with its own passkey deletes the
// backup and stops every device keeping there; with a borrowed one it only
// stops this device. Erasing the codex leaves the backup alone, so Bring it
// back undoes it. Saves go through the page's own send, on a server the test
// holds a request on where the timing matters: a Forget waits for a save on
// its way, and nothing is sent while it goes; a save that doesn't go is
// tried again after RETRY_MS; a browser that can't seal never borrows or
// sends. And how big a bucket grows, a browser wiped and brought back ten
// times.
import './asVite.ts';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { memoryStorage, items } from './helpers.ts';
import { fromSecret, newSecret, secretIn, seal, unseal, userId } from '../src/lib/backup/seal.ts';
import { MAX_ENTRY, Keep, answer, pack } from '../signal/worker.js';
import type { Codex, Encounter } from '../src/lib/codex.ts';

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

const { base64url, fromBase64url } = await import('../src/lib/base64url.ts');
const { APART_MS, MAX_ENTRY: PAGE_MAX_ENTRY, RETRY_MS, backup, bringBack, entryNow, forgetBackup, keepSafe, passkeyName, readEntry, sealEntry, send, settled, takeEntries, unpack } = await import('../src/lib/backup/backup.svelte.ts');
const { absorbKept, loadKept, loadSent, ownKeptRaw, saveKept, saveSent } = await import('../src/lib/backup/kept.ts');
const { clearCopies, deviceId, keepCopy, readCopies } = await import('../src/lib/sync/store.ts');
const { CHANNEL } = await import('../src/lib/channel.ts');
const { forgetOwn, ownNow, takeIn, takenNow } = await import('../src/lib/sync/shared.ts');
const { CODEX_KEY, emptyCodex, loadCodex, parseCodex, record, resetCodex, serializeCodex } = await import('../src/lib/codex.ts');
const { QA, storeKey } = await import('../src/lib/storage.ts');
const { toasts } = await import('../src/lib/toasts.svelte.ts');
// (A page of the game's as a browser serves it, in a secure context: one that can seal, and so borrow.)
g.isSecureContext = true;

/** Where the page's requests go: nowhere, unless a test puts a server there. */
const nowhere = async (): Promise<Response> => {
  throw new TypeError('no server in a test');
};
let server: (r: Request) => Promise<Response> = nowhere;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => server(new Request(url, init))) as typeof fetch;

/** Each device's browser storage, apart, by name (`on` puts the page on one), and the one it's on. */
const browsers = new Map<string, Map<string, string>>();
let here = '';

beforeEach(async () => {
  // (What the last test left on its way lands first, on the server it had.)
  await settled();
  clearCopies();
  store.clear();
  browsers.clear();
  here = '';
  server = nowhere;
  // (How a page with nothing kept starts.)
  Object.assign(backup, { on: false, borrowed: false, savedAt: 0, failing: false, busy: null });
  toasts.list = [];
});
// (A send to try again in a while let go of, as a Forget of a borrowed passkey does, which asks nothing of the server: the run doesn't wait minutes for it.)
afterEach(async () => {
  await settled();
  saveKept({ secret: base64url(newSecret()), own: false, at: 1 });
  await forgetBackup();
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

// ---- the passkey, through sync --------------------------------------------------

/** The Worker as the page reaches it, with a bucket for every secret. */
function serve() {
  const e = env();
  server = (r) => answer(new Request(r, { headers: { ...Object.fromEntries(r.headers), Origin: 'https://poe2.quest' } }), e as never);
}
const made = (secret: string) => fromSecret(fromBase64url(secret)!, CHANNEL);
const bucketOf = async (secret: string) => (await made(secret)).bucket;
const KEEP_URL = 'https://poe2-signal.poe2quest.workers.dev/keep/';
/** The devices with an entry under `secret`, in order. */
const devicesIn = async (secret: string) =>
  unpack(new Uint8Array(await (await fetch(KEEP_URL + (await bucketOf(secret)))).arrayBuffer()))
    .map((e) => e.device)
    .sort();
const fresh = () => base64url(newSecret());
/** This browser's progress: its codex, seen as given. */
const play = (seen: Record<string, number> = { [A.id]: 1 }) => store.set(CODEX_KEY, codexWith(seen));
/** This device keeps with `secret`: its own, or borrowed. */
const keeps = async (secret: string, own = true) => saveKept({ secret, bucket: await bucketOf(secret), own, at: Date.now() });
/** What a device keeping with `secret` as its own offers through sync. */
const offerOf = async (secret: string) => JSON.stringify({ v: 2, secret, bucket: await bucketOf(secret), own: true, at: Date.now() });
/** How this device keeps: its secret and whose it is, or null and why it stopped; null for no record. */
function stands(): [string | null, string] | null {
  const k = loadKept();
  return k && [k.secret, k.secret === null ? k.stopped : k.own ? 'own' : 'borrowed'];
}
/** The record, whatever its time. */
const keptAsIs = () => ({ ...loadKept()!, at: 0 });
/** A Forget of `secret`'s backup, from a device this one never hears it from. */
async function forgetOn(secret: string) {
  assert.ok((await fetch(KEEP_URL + `${await bucketOf(secret)}/forget`, { method: 'POST', headers: { 'Content-Type': 'text/plain' } })).ok);
}
const pause = (ms = 30) => new Promise((r) => setTimeout(r, ms));
/** What the page asks of the server from now on, counted. */
function counted() {
  const c = { asked: 0 };
  const served = server;
  server = (r) => (c.asked++, served(r));
  return c;
}
/** The page on device `name` from now on, its browser's storage as it was left there (new, the first time). */
async function on(name: string) {
  await settled();
  if (here) browsers.set(here, new Map(store));
  // (Through the store, so what's read of the copies is read afresh.)
  clearCopies();
  store.clear();
  for (const [k, v] of browsers.get(name) ?? []) store.set(k, v);
  here = name;
}
/** Device `name`'s browser wiped (Safari's seven days, its data cleared, the phone lost): it comes back with nothing, a new device. */
function wipe(name: string) {
  browsers.delete(name);
  if (here !== name) return;
  clearCopies();
  store.clear();
}

/** What the browser's passkeys do here: made (`create`) and picked (`get`). */
function credentials(value: Partial<CredentialsContainer>) {
  Object.defineProperty(globalThis.navigator, 'credentials', { configurable: true, value });
}
/** The passkey the player picks at Bring it back, as the browser hands it over. */
function pick(secret: string) {
  credentials({ get: async () => ({ response: { userHandle: userId(fromBase64url(secret)!, CHANNEL).buffer } }) as unknown as Credential });
}
/** Keep it safe pressed, the passkey made at once: its secret (null where none was asked for). */
async function keepSafeNow(): Promise<string | null> {
  const asked: { user?: PublicKeyCredentialUserEntity } = {};
  credentials({ create: async (o) => ((asked.user = o?.publicKey?.user), {} as Credential) });
  await keepSafe();
  return asked.user ? base64url(secretIn(new Uint8Array(asked.user.id as Uint8Array), CHANNEL) as Uint8Array) : null;
}
/** Bring it back pressed with `secret`'s passkey, and the save it starts in. */
async function bringBackWith(secret: string) {
  pick(secret);
  await bringBack();
  await settled();
}
/** `device`'s progress (its codex, seen as given) put under `secret`, as the page seals an entry. */
async function putProgress(secret: string, device: string, seen: Record<string, number>, at = 5000) {
  const { bucket, key } = await made(secret);
  const data = (await sealEntry({ copies: [{ device, kind: 'codex', at, raw: codexWith(seen) }], taken: {} }, key, bucket, device))!;
  assert.ok((await fetch(KEEP_URL + `${bucket}/${device}`, { method: 'POST', body: data, headers: { 'Content-Type': 'text/plain' } })).ok);
}
const lastToast = () => [toasts.list.at(-1)?.title, toasts.list.at(-1)?.message];

test('a device keeping with none borrows a paired device’s passkey; one with a passkey, its own or borrowed, never swaps it', async () => {
  const [one, two, three] = [fresh(), fresh(), fresh()];
  assert.equal(ownKeptRaw(), null, 'nothing offered where nothing is kept');
  assert.equal('backup' in takenNow(), false);
  // The phone, with its own.
  await keeps(one);
  const offered = takenNow().backup;
  assert.equal(offered, ownKeptRaw());
  assert.deepEqual(JSON.parse(offered), { v: 2, secret: one, bucket: await bucketOf(one), own: true, at: loadKept()!.at });
  // The computer, keeping with none, borrows it, as of now.
  store.clear();
  const before = Date.now();
  assert.deepEqual(takeIn({ backup: offered }), ['backup']);
  assert.deepEqual(keptAsIs(), { secret: one, bucket: await bucketOf(one), own: false, at: 0 });
  assert.ok(loadKept()!.at >= before);
  // And offers it on: borrowed, it keeps all the same.
  assert.equal(JSON.parse(ownKeptRaw()!).secret, one);
  // Borrowing, it never swaps it for another offered; nor its own.
  assert.equal(absorbKept(await offerOf(two)), false);
  assert.deepEqual(stands(), [one, 'borrowed']);
  await keeps(three);
  assert.equal(absorbKept(await offerOf(one)), false);
  assert.deepEqual(stands(), [three, 'own']);
  // An offer that keeps nothing, or one this build can't read, is nothing to borrow.
  store.clear();
  for (const raw of [JSON.stringify({ v: 2, secret: null, bucket: await bucketOf(one), stopped: 'here', at: 5 }), JSON.stringify({ v: 3, secret: one, own: true, at: 5 }), 'nonsense'])
    assert.equal(absorbKept(raw), false, raw);
  assert.equal(loadKept(), null);
  // Stopped, it offers nothing.
  saveKept({ secret: null, bucket: await bucketOf(one), stopped: 'here', at: 5 });
  assert.equal(ownKeptRaw(), null);
});

test('stopped with a Forget here, it never borrows; stopped by one elsewhere, it borrows another, never the one forgotten', async () => {
  const [one, two] = [fresh(), fresh()];
  saveKept({ secret: null, bucket: await bucketOf(one), stopped: 'here', at: 100 });
  for (const s of [one, two]) assert.equal(absorbKept(await offerOf(s)), false);
  saveKept({ secret: null, bucket: await bucketOf(one), stopped: 'gone', at: 100 });
  assert.equal(absorbKept(await offerOf(one)), false, 'the one forgotten');
  // (An older build's offer without its bucket may be the one forgotten: not taken.)
  for (const s of [one, two]) assert.equal(absorbKept(JSON.stringify({ v: 1, secret: s, at: 100 })), false);
  assert.equal(absorbKept(await offerOf(two)), true);
  assert.deepEqual(stands(), [two, 'borrowed']);
});

test('a browser that can’t seal (Safari before 16.4) never borrows, so it never says it keeps', async () => {
  const offered = await offerOf(fresh());
  const compression = Object.getOwnPropertyDescriptor(globalThis, 'CompressionStream')!;
  try {
    g.isSecureContext = false;
    assert.equal(absorbKept(offered), false, 'not a secure context');
    g.isSecureContext = true;
    delete (globalThis as Partial<typeof globalThis>).CompressionStream;
    assert.equal(absorbKept(offered), false, 'no CompressionStream');
    Object.defineProperty(globalThis, 'CompressionStream', compression);
    Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: undefined });
    assert.equal(absorbKept(offered), false, 'no crypto.subtle');
  } finally {
    g.isSecureContext = true;
    Object.defineProperty(globalThis, 'CompressionStream', compression);
    Reflect.deleteProperty(globalThis.crypto, 'subtle');
  }
  assert.equal(loadKept(), null);
  assert.ok(absorbKept(offered), 'one that can');
});

test('an older build’s records still load, its own kept with, its Forget standing, and its offer borrowed', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  const bucket = await bucketOf(one);
  // Its own, as the beta saved it before this build: kept with, never swapped, and saved under as before.
  store.set(storeKey('backup'), JSON.stringify({ v: 1, secret: one, at: 100, bucket }));
  assert.deepEqual(loadKept(), { secret: one, bucket, own: true, at: 100 });
  assert.equal(absorbKept(await offerOf(two)), false);
  play();
  await send();
  assert.equal(loadSent()?.bucket, bucket);
  assert.deepEqual(await devicesIn(one), [deviceId()]);
  // One from before a record named its bucket: saved under the one its secret makes.
  store.set(storeKey('backup'), JSON.stringify({ v: 1, secret: two, at: 100 }));
  assert.deepEqual(loadKept(), { secret: two, own: true, at: 100 });
  await send();
  assert.equal(loadSent()?.bucket, await bucketOf(two));
  // Its Forget, here: stopped, offering nothing and borrowing nothing.
  store.set(storeKey('backup'), JSON.stringify({ v: 1, secret: null, at: 100, bucket }));
  assert.deepEqual(loadKept(), { secret: null, bucket, stopped: 'here', at: 100 });
  assert.equal(ownKeptRaw(), null);
  assert.equal(absorbKept(await offerOf(two)), false);
  // A device keeping with none borrows an older build's offer, with its bucket or without.
  store.clear();
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: one, at: 100, bucket })));
  assert.deepEqual(keptAsIs(), { secret: one, bucket, own: false, at: 0 });
  store.clear();
  assert.ok(absorbKept(JSON.stringify({ v: 1, secret: two, at: 100 })));
  assert.deepEqual(keptAsIs(), { secret: two, own: false, at: 0 });
  // (What an older build left beside it is no longer read, and harms nothing.)
  store.set(storeKey('backup.left'), JSON.stringify([{ secret: one, device: 'laptop000001', after: null }]));
  store.set(storeKey('backup.forgot'), 'x');
  play();
  await send();
  assert.equal(loadSent()?.bucket, await bucketOf(two));
});

// ---- each device bringing it all back ------------------------------------------------

test('the owner’s lost phone: the computer borrows its passkey and saves into it, and a new phone brings both back, keeping with it as its own', async () => {
  serve();
  // The phone makes the passkey, and saves.
  await on('phone');
  play({ [A.id]: 3 });
  const one = (await keepSafeNow())!;
  const phone = deviceId();
  assert.deepEqual(stands(), [one, 'own']);
  assert.equal(lastToast()[0], 'Kept safe');
  assert.deepEqual(await devicesIn(one), [phone]);
  const offered = ownKeptRaw()!;
  // The computer, paired, keeping with none: it borrows the phone's and saves its own progress into it.
  await on('pc');
  play({ [B.id]: 4 });
  assert.ok(absorbKept(offered));
  await send();
  const pc = deviceId();
  assert.deepEqual(await devicesIn(one), [phone, pc].sort());
  // The phone is lost; a new one brings its passkey back.
  wipe('phone');
  await on('new phone');
  await bringBackWith(one);
  const codex = loadCodex();
  assert.deepEqual([codex.items[A.id]?.seen, codex.items[B.id]?.seen], [3, 4], 'the old phone’s and the computer’s');
  assert.deepEqual(stands(), [one, 'own']);
  assert.equal(lastToast()[0], 'Brought back');
  assert.deepEqual(await devicesIn(one), [phone, pc, deviceId()].sort());
  // The computer borrows it still.
  await on('pc');
  assert.deepEqual(stands(), [one, 'borrowed']);
});

test('devices each with their own passkey, synced, each bring everything back with their own', async () => {
  serve();
  await on('phone');
  play({ [A.id]: 3 });
  const one = (await keepSafeNow())!;
  const phone = { device: deviceId(), codex: ownNow('codex')!, offer: ownKeptRaw()! };
  await on('pc');
  play({ [B.id]: 4 });
  const two = (await keepSafeNow())!;
  const pc = { device: deviceId(), codex: ownNow('codex')!, offer: ownKeptRaw()! };
  // Paired: each takes the other's progress in, keeps its own passkey, and saves.
  keepCopy('codex', phone.device, phone.codex);
  assert.equal(absorbKept(phone.offer), false);
  await send();
  await on('phone');
  keepCopy('codex', pc.device, pc.codex);
  assert.equal(absorbKept(pc.offer), false);
  await send();
  // Both wiped: each comes back a new browser, with only its own passkey.
  for (const [name, secret] of [
    ['phone', one],
    ['pc', two],
  ]) {
    wipe(name);
    await on(name);
    await bringBackWith(secret);
    const codex = loadCodex();
    assert.deepEqual([codex.items[A.id]?.seen, codex.items[B.id]?.seen], [3, 4], name);
    assert.deepEqual(stands(), [secret, 'own'], name);
  }
});

// ---- Forget -----------------------------------------------------------------------

test('Forget with its own passkey deletes what was kept, and a device borrowing it stops at its next save; a new one offered after is borrowed', async () => {
  serve();
  const one = fresh();
  const bucket = await bucketOf(one);
  await on('phone');
  play({ [A.id]: 3 });
  await keeps(one);
  await send();
  const offered = ownKeptRaw()!;
  await on('pc');
  play({ [B.id]: 4 });
  assert.ok(absorbKept(offered));
  await send();
  assert.equal((await devicesIn(one)).length, 2);
  await on('phone');
  await forgetBackup();
  assert.equal((await fetch(KEEP_URL + bucket)).status, 410);
  assert.deepEqual(keptAsIs(), { secret: null, bucket, stopped: 'here', at: 0 });
  assert.equal(loadSent(), null);
  // The computer, which never heard of it, plays on: its next save is refused, and it stops too.
  await on('pc');
  play({ [B.id]: 5 });
  await send();
  assert.deepEqual(keptAsIs(), { secret: null, bucket, stopped: 'gone', at: 0 });
  assert.deepEqual([loadSent(), backup.on, backup.borrowed], [null, false, false]);
  assert.deepEqual(lastToast(), ['No longer kept', 'What your passkey kept was deleted on another device, so this browser stops keeping it too.']);
  // Nothing more sent with it, nor is it borrowed again, from a device that hasn't heard yet.
  const c = counted();
  play({ [B.id]: 6 });
  await send();
  assert.equal(c.asked, 0);
  assert.equal(absorbKept(offered), false);
  // A new passkey made on the phone is borrowed, and saved into.
  await on('phone');
  const two = (await keepSafeNow())!;
  const newer = ownKeptRaw()!;
  await on('pc');
  assert.ok(absorbKept(newer));
  assert.deepEqual(stands(), [two, 'borrowed']);
  await send();
  assert.ok((await devicesIn(two)).includes(deviceId()));
});

test('Forget with a borrowed passkey asks nothing of the server: the other device’s backup stays, and this one stops for good', async () => {
  serve();
  const one = fresh();
  const bucket = await bucketOf(one);
  await on('phone');
  play({ [A.id]: 3 });
  await keeps(one);
  await send();
  const phone = deviceId();
  const offered = ownKeptRaw()!;
  await on('pc');
  play({ [B.id]: 4 });
  assert.ok(absorbKept(offered));
  await send();
  const pc = deviceId();
  const c = counted();
  await forgetBackup();
  assert.equal(c.asked, 0, 'no request');
  assert.deepEqual(keptAsIs(), { secret: null, bucket, stopped: 'here', at: 0 });
  assert.deepEqual([loadSent(), backup.busy], [null, null]);
  assert.deepEqual(await devicesIn(one), [phone, pc].sort(), 'the phone’s backup as it was');
  // Stopped here, it never borrows again, and sends nothing.
  assert.equal(absorbKept(offered), false);
  const d = counted();
  play({ [B.id]: 5 });
  await send();
  assert.equal(d.asked, 0);
  // The phone keeps with it as before.
  await on('phone');
  play({ [A.id]: 4 });
  await send();
  assert.deepEqual([stands(), loadSent()?.bucket], [[one, 'own'], bucket]);
});

// ---- Bring it back ----------------------------------------------------------------

test('Bring it back keeps with the passkey as its own where it had none of its own: none, stopped, or borrowed', async () => {
  serve();
  const [one, other] = [fresh(), fresh()];
  await putProgress(one, 'tablet000001', { [A.id]: 3 });
  const starts: [string, () => Promise<unknown>][] = [
    ['none', async () => {}],
    ['stopped here', async () => saveKept({ secret: null, bucket: await bucketOf(other), stopped: 'here', at: 100 })],
    ['stopped elsewhere', async () => saveKept({ secret: null, bucket: await bucketOf(other), stopped: 'gone', at: 100 })],
    ['borrowed', () => keeps(other, false)],
    ['borrowed, this one', () => keeps(one, false)],
  ];
  for (const [label, start] of starts) {
    clearCopies();
    store.clear();
    await start();
    // (Sent before under it, as far as this device knows: all of it is sent again.)
    saveSent({ at: 1234, print: '1:1', bucket: await bucketOf(one) });
    await bringBackWith(one);
    assert.deepEqual(stands(), [one, 'own'], label);
    assert.equal(loadCodex().items[A.id]?.seen, 3, label);
    assert.equal(lastToast()[0], 'Brought back', label);
    assert.deepEqual([loadSent()?.bucket, loadSent()?.print === '1:1'], [await bucketOf(one), false], label);
  }
});

test('Bring it back with a passkey of its own keeps it: another only brings its progress in; and it says what it keeps with where nothing was kept', async () => {
  serve();
  const [mine, one, empty] = [fresh(), fresh(), fresh()];
  await putProgress(one, 'tablet000001', { [A.id]: 3 });
  await keeps(mine);
  await bringBackWith(one);
  assert.deepEqual(stands(), [mine, 'own']);
  assert.equal(loadCodex().items[A.id]?.seen, 3);
  assert.equal(lastToast()[0], 'Brought back');
  // What it brought in is kept with its own from then on.
  assert.deepEqual([loadSent()?.bucket, await devicesIn(mine)], [await bucketOf(mine), [deviceId()]]);
  // Its own again: nothing changes.
  await bringBackWith(mine);
  assert.deepEqual(stands(), [mine, 'own']);
  assert.deepEqual(lastToast(), ['Already here', 'Everything kept with that passkey is here already.']);
  // One with nothing kept with it: it stays with its own.
  await bringBackWith(empty);
  assert.deepEqual(stands(), [mine, 'own']);
  assert.deepEqual(lastToast(), ['Nothing kept with it', 'Nothing was kept with that passkey. Your progress here stays kept with the one it has.']);
  // With none of its own, it keeps with that one from now on.
  clearCopies();
  store.clear();
  await bringBackWith(empty);
  assert.deepEqual(stands(), [empty, 'own']);
  assert.deepEqual(lastToast(), ['Nothing kept with it', 'Nothing was kept with that passkey yet. Your progress here is kept with it from now on.']);
});

test('a passkey whose backup was forgotten brings nothing back and changes nothing; nor where the server can’t be reached', async () => {
  serve();
  const [one, mine] = [fresh(), fresh()];
  await putProgress(one, 'tablet000001', { [A.id]: 3 });
  await forgetOn(one);
  for (const start of [null, 'borrowed', 'own']) {
    clearCopies();
    store.clear();
    if (start) await keeps(mine, start === 'own');
    const was = store.get(storeKey('backup'));
    await bringBackWith(one);
    assert.equal(store.get(storeKey('backup')), was, String(start));
    assert.equal(loadCodex().items[A.id], undefined);
    assert.deepEqual(lastToast(), ['Nothing kept with it', 'What was kept with that passkey was deleted with Forget, so it brings nothing back.']);
  }
  server = nowhere;
  await bringBackWith(mine);
  assert.deepEqual(stands(), [mine, 'own']);
  assert.deepEqual(lastToast(), ['Not brought back', 'The server can’t be reached just now. Try again in a while.']);
});

test('Bring it back says when everything kept with the passkey is here already', async () => {
  serve();
  const one = fresh();
  await putProgress(one, 'tablet000001', { [A.id]: 3 });
  await bringBackWith(one);
  assert.equal(lastToast()[0], 'Brought back');
  await bringBackWith(one);
  assert.deepEqual(lastToast(), ['Already here', 'Everything kept with that passkey is here already.']);
  assert.equal(loadCodex().items[A.id]?.seen, 3);
});

// ---- the codex erased ---------------------------------------------------------------

test('the codex erased leaves the backup alone: the next save is a new entry, and Bring it back brings the erased progress back', async () => {
  serve();
  const one = fresh();
  await keeps(one);
  play({ [A.id]: 3 });
  await send();
  const before = deviceId();
  // Erased as the codex's Erase does it: sync's (no copies, a new name) and then the progress.
  clearCopies();
  forgetOwn();
  resetCodex();
  assert.deepEqual(stands(), [one, 'own']);
  play({ [B.id]: 1 });
  await send();
  const after = deviceId();
  assert.notEqual(after, before);
  assert.deepEqual(await devicesIn(one), [before, after].sort(), 'the old entry stays, the new one beside it');
  // Undone.
  await bringBackWith(one);
  const codex = loadCodex();
  assert.deepEqual([codex.items[A.id]?.seen, codex.items[B.id]?.seen], [3, 1]);
  assert.equal(lastToast()[0], 'Brought back');
  assert.deepEqual(stands(), [one, 'own']);
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
 * it through, and a log of what came in order: each request as it came, and
 * again as it was answered.
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
    const said = `${r.method} ${path}`;
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
  await keeps(one);
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
  assert.deepEqual(keptAsIs(), { secret: null, bucket, stopped: 'here', at: 0 }, 'a Forget, naming the backup it forgot');
  assert.equal(backup.busy, null);
  // Sends go on after it: kept with another, saved under it.
  await keeps(two);
  await send();
  assert.equal(loadSent()?.bucket, await bucketOf(two));
});

test('a passkey taken while a Forget goes (Bring it back in another tab) stands, and the one forgotten is gone from the server all the same', async () => {
  serve();
  const [one, two] = [fresh(), fresh()];
  const bucket = await bucketOf(one);
  play();
  await keeps(one);
  const {
    held: [forget],
    releaseAll,
  } = gated((m, p) => p === `${bucket}/forget`);
  try {
    const forgetting = forgetBackup();
    await forget.arrived;
    await keeps(two);
    forget.release();
    await forgetting;
  } finally {
    releaseAll();
  }
  assert.deepEqual(stands(), [two, 'own']);
  assert.equal(backup.busy, null);
  assert.equal((await fetch(KEEP_URL + bucket)).status, 410);
  await send();
  assert.deepEqual(await devicesIn(two), [deviceId()]);
});

test('a save still being sealed as a Forget starts is never sent', async () => {
  serve();
  const one = fresh();
  const bucket = await bucketOf(one);
  play();
  await keeps(one);
  const { log } = gated();
  await Promise.all([send(), forgetBackup()]);
  assert.deepEqual(log, [`POST ${bucket}/forget`, `POST ${bucket}/forget: 204`], 'only the Forget');
});

test('Keep it safe while borrowing makes a passkey of its own, named with the day, and keeps with it; with its own already, it asks for none', async () => {
  serve();
  const one = fresh();
  play({ [A.id]: 3 });
  await keeps(one, false);
  await send();
  const me = deviceId();
  let asked: CredentialCreationOptions | undefined;
  credentials({ create: async (o) => ((asked = o), {} as Credential) });
  await keepSafe();
  const user = asked!.publicKey!.user;
  assert.equal(user.name, passkeyName(new Date()));
  assert.match(user.name, /^PoE2\.Quest progress, \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  const two = base64url(secretIn(new Uint8Array(user.id as Uint8Array), CHANNEL) as Uint8Array);
  assert.deepEqual(keptAsIs(), { secret: two, bucket: await bucketOf(two), own: true, at: 0 });
  assert.equal(lastToast()[0], 'Kept safe');
  assert.deepEqual([backup.on, backup.borrowed, backup.savedAt], [true, false, loadSent()!.at]);
  assert.deepEqual(await devicesIn(two), [me]);
  assert.deepEqual(await devicesIn(one), [me], 'its entry in the borrowed one’s stays: saves only add up');
  asked = undefined;
  await keepSafe();
  assert.equal(asked, undefined);
});

test('a save that doesn’t go is tried again after RETRY_MS, not APART_MS', async () => {
  assert.ok(RETRY_MS < APART_MS);
  serve();
  play();
  await keeps(fresh());
  // Saved just now: a change would wait APART_MS from it.
  await send();
  const served = server;
  server = async () => new Response(null, { status: 503 });
  const real = globalThis.setTimeout;
  const waits: number[] = [];
  let retry: { f: () => void; handle: ReturnType<typeof setTimeout> } | undefined;
  globalThis.setTimeout = ((f: () => void, ms = 0) => {
    waits.push(ms);
    const handle = real(f, ms);
    if (ms === RETRY_MS) retry = { f, handle };
    return handle;
  }) as typeof setTimeout;
  try {
    play({ [A.id]: 2 });
    await send();
  } finally {
    globalThis.setTimeout = real;
  }
  assert.equal(backup.failing, true);
  // (Besides the 30 s each send is given.)
  assert.deepEqual(
    waits.filter((ms) => ms !== 30_000),
    [RETRY_MS],
  );
  // Its time come, the save goes, once the page is calm.
  server = served;
  clearTimeout(retry!.handle);
  retry!.f();
  for (let i = 0; i < 100 && backup.failing; i++) await pause(20);
  await settled();
  assert.equal(backup.failing, false);
  assert.equal(loadSent()?.print, entryNow()!.print);
});

test('a save that fails along the way is tried again in a while, never left unhandled', async () => {
  serve();
  const c = counted();
  play();
  await keeps(fresh());
  // Sealing throws, once.
  Object.defineProperty(crypto.subtle, 'encrypt', {
    configurable: true,
    value: async () => {
      throw new Error('can’t seal');
    },
  });
  try {
    await assert.doesNotReject(send());
    assert.deepEqual([backup.failing, c.asked], [true, 0]);
  } finally {
    delete (crypto.subtle as Partial<SubtleCrypto>).encrypt;
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
  const c = counted();
  try {
    const name = 'boot';
    const page = (await import(`../src/lib/backup/backup.svelte.ts?page=${name}`)) as typeof import('../src/lib/backup/backup.svelte.ts');
    // (What the page's other modules listen for as they load isn't the backup's.)
    listened.length = 0;
    // Kept with: a page that keeps here would send it.
    play();
    await keeps(fresh());
    delete (globalThis as Partial<typeof globalThis>).CompressionStream;
    await page.bootBackup();
    await pause();
    assert.deepEqual([listened, c.asked], [[], 0]);
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

// ---- how big a bucket grows -----------------------------------------------------------

test('how big a bucket grows: a browser wiped and brought back ten times', async (t) => {
  serve();
  const one = fresh();
  const bucket = await bucketOf(one);
  await keeps(one);
  let asked = 0;
  /** `n` questions answered on this device, as the game records them, the codex's log and all. */
  const answerSome = (n: number) => {
    let c: Codex = loadOwn();
    for (let i = 0; i < n; i++, asked++) {
      const item = items[(asked * 7) % items.length];
      const right = asked % 3 !== 0;
      const e: Encounter = {
        at: 1_700_000_000_000 + asked * 9000,
        itemId: item.id,
        mode: asked % 2 ? 'name' : 'art',
        difficulty: 'merciless',
        race: false,
        answer: { ok: right, pickedId: right ? item.id : items[(asked * 11) % items.length].id, pickedLabel: null, ms: 2000 + (asked % 50) * 37 },
      };
      c = record(c, e);
    }
    store.set(CODEX_KEY, serializeCodex(c));
  };
  /** This device's own codex (not the others' copies). */
  const loadOwn = (): Codex => parseCodex(store.get(CODEX_KEY) ?? null) ?? emptyCodex();
  const sizes: string[] = [];
  for (let round = 1; round <= 10; round++) {
    answerSome(60);
    await send();
    // The browser wiped: it comes back a new device, with nothing, and brings it back.
    clearCopies();
    store.clear();
    await bringBackWith(one);
    answerSome(60);
    await send();
    const body = new Uint8Array(await (await fetch(KEEP_URL + bucket)).arrayBuffer());
    assert.equal(unpack(body).length, round + 1, 'one entry for each browser it was');
    sizes.push(`${round}: ${body.length}`);
  }
  t.diagnostic(`bucket bytes after each round: ${sizes.join(', ')}`);
});
