// The progress players keep with a passkey, as the matchmaking server keeps
// it (signal/worker.js Keep and its /keep/ paths): one entry per device in a
// bucket, the newest 64, deleted on Forget or after long enough unwritten.
// What the page seals and sends is tested in tests/backup.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { KEEP_MS, MAX_ENTRIES, MAX_ENTRY, Keep, answer } from '../signal/worker.js';

/** A bucket's entries out of the frames it is sent in (signal/worker.js pack): a device's name, 12 bytes, then its length and its bytes. */
function unpack(body: Uint8Array): { device: string; data: Uint8Array }[] {
  const out: { device: string; data: Uint8Array }[] = [];
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  for (let at = 0; at + 16 <= body.length; ) {
    const n = view.getUint32(at + 12);
    if (at + 16 + n > body.length) break;
    out.push({ device: new TextDecoder().decode(body.subarray(at, at + 12)), data: body.slice(at + 16, at + 16 + n) });
    at += 16 + n;
  }
  return out;
}

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
});
