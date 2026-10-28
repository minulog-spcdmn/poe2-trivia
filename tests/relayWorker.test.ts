// The relay's Worker (relay/worker.js), on Node with Cloudflare's parts faked:
// whom it answers, its limits, and the check that ends every login once the
// month's relay traffic reaches the cap.
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { addressKey, answer, check } from '../relay/worker.js';

const LOGIN = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turn:turn.cloudflare.com:80?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp'],
      username: 'u',
      credential: 'c',
    },
  ],
};
const NOW = Date.UTC(2026, 9, 28, 12);
const FRESH = JSON.stringify({ checkedAt: NOW - 5 * 60_000, used: 1e9 });

/** The Worker's bindings: a rate limit that allows `allowed` requests (keys asked kept), and a KV store kept in a Map. */
function env(state: string | null = FRESH, allowed = Infinity) {
  const kv = new Map<string, string>(state ? [['state', state]] : []);
  const keys: string[] = [];
  return {
    kv,
    keys,
    TURN_KEY_ID: 'key',
    TURN_KEY_API_TOKEN: 'token',
    ANALYTICS_TOKEN: 'analytics',
    ACCOUNT_ID: 'account',
    PER_ADDRESS: { limit: async ({ key }: { key: string }) => ({ success: keys.push(key) <= allowed }) },
    RELAY_STATE: { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) },
  };
}

/** Cloudflare's APIs, answered from `answers` by a part of the method and URL (a status for a bare one), the first that fits. */
function cloudflare(t: TestContext, answers: Record<string, unknown>) {
  const asked: { url: string; method: string; body: string }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit = {}) => {
    asked.push({ url, method: init.method ?? 'GET', body: String(init.body) });
    const key = Object.keys(answers).find((k) => `${init.method ?? 'GET'} ${url}`.includes(k));
    if (key === undefined) return new Response(null, { status: 404 });
    const a = answers[key];
    return typeof a === 'number' ? new Response(null, { status: a }) : Response.json(a);
  });
  return asked;
}

const ask = (origin?: string, method = 'GET', ip = '203.0.113.7') => new Request('https://relay.test/', { method, headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': ip } });
const usage = (bytes: number) => ({ data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: bytes } }] }] } } });

test("a login for the game's own pages, lasting half a day, with only the servers worth trying", async (t) => {
  const asked = cloudflare(t, { 'generate-ice-servers': LOGIN });
  const r = await answer(ask('https://poe2.quest'), env(), NOW);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://poe2.quest');
  const body = await r.json();
  assert.equal(body.ttl, 12 * 3600);
  assert.deepEqual(body.iceServers, [{ urls: ['stun:stun.cloudflare.com:3478'] }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }]);
  assert.match(asked[0].url, /\/turn\/keys\/key\//);
  assert.deepEqual(JSON.parse(asked[0].body), { ttl: 12 * 3600 });
  for (const local of ['http://localhost:5173', 'http://192.168.1.20:5173']) assert.equal((await answer(ask(local), env(), NOW)).status, 200, local);
});

test('anyone else is turned away, and nothing is minted for them', async (t) => {
  const asked = cloudflare(t, { 'generate-ice-servers': LOGIN });
  for (const origin of [undefined, 'https://evil.example', 'https://poe2.quest.evil.example', 'http://poe2.quest']) assert.equal((await answer(ask(origin), env(), NOW)).status, 403, origin);
  assert.equal((await answer(ask('https://poe2.quest', 'POST'), env(), NOW)).status, 405);
  assert.equal(asked.length, 0);
});

/** A refusal the page can read (CORS), and when it says to ask again. */
async function refused(r: Response, status: number) {
  assert.equal(r.status, status);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://poe2.quest');
  assert.equal(r.headers.get('Access-Control-Expose-Headers'), 'Retry-After');
  return Number(r.headers.get('Retry-After'));
}

test('past its limit an address waits a minute, counted by its IPv6 /64', async (t) => {
  const asked = cloudflare(t, { 'generate-ice-servers': LOGIN });
  const e = env(FRESH, 1);
  assert.equal((await answer(ask('https://poe2.quest', 'GET', '2001:db8:0:1:a::1'), e, NOW)).status, 200);
  assert.equal(await refused(await answer(ask('https://poe2.quest', 'GET', '2001:db8::1:b:0:0:2'), e, NOW), 429), 60);
  assert.deepEqual(e.keys, ['2001:db8:0:1::/64', '2001:db8:0:1::/64']);
  assert.equal(asked.length, 1);
});

test('the address a limit counts', () => {
  assert.equal(addressKey('203.0.113.7'), '203.0.113.7');
  assert.equal(addressKey('2001:DB8:0000:0001:aaaa:bbbb:cccc:dddd'), '2001:db8:0:1::/64');
  assert.equal(addressKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(addressKey('::1'), '0:0:0:0::/64');
  assert.equal(addressKey('fe80::'), 'fe80:0:0:0::/64');
});

test('capped, no logins until the next month; with no recent check, none for now', async (t) => {
  const asked = cloudflare(t, { 'generate-ice-servers': LOGIN });
  const capped = await refused(await answer(ask('https://poe2.quest'), env(JSON.stringify({ checkedAt: NOW, used: 6e11, capped: true })), NOW), 503);
  assert.equal(capped, (Date.UTC(2026, 10, 1) - NOW) / 1000);
  assert.equal(await refused(await answer(ask('https://poe2.quest'), env(null), NOW), 503), 600);
  assert.equal(await refused(await answer(ask('https://poe2.quest'), env(JSON.stringify({ checkedAt: NOW - 61 * 60_000, used: 0 })), NOW), 503), 600);
  assert.equal(asked.length, 0);
});

test("Cloudflare's trouble, or no TURN server left in its answer, comes back as a 502 the page can read", async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const reply of [{ nothing: true }, { iceServers: [LOGIN.iceServers[0]] }]) {
    cloudflare(t, { 'generate-ice-servers': reply });
    assert.equal(await refused(await answer(ask('https://poe2.quest'), env(), NOW), 502), 60);
    t.mock.restoreAll();
    t.mock.method(console, 'error', () => {});
  }
});

test('the state is read once a half minute, however many ask', async (t) => {
  cloudflare(t, { 'generate-ice-servers': LOGIN });
  const e = env();
  let reads = 0;
  const get = e.RELAY_STATE.get;
  e.RELAY_STATE.get = async (k: string) => (reads++, get(k));
  for (const at of [NOW, NOW + 29_000, NOW + 31_000]) assert.equal((await answer(ask('https://poe2.quest'), e, at)).status, 200);
  assert.equal(reads, 2);
});

const KEYS = 'https://api.cloudflare.com/client/v4/accounts/account/calls/turn_keys';
/** The account's TURN keys: the Worker's ('key') and one made by hand ('old'); `status` answers each change and delete. */
const turnKeys = (status = 200) => ({
  [`GET ${KEYS}/key`]: { result: { name: 'poe2' } },
  [`PUT ${KEYS}/key`]: status === 200 ? { result: { name: 'poe2' } } : status,
  [`DELETE ${KEYS}/`]: status === 200 ? { result: {} } : status,
  [`GET ${KEYS}`]: { result: [{ uid: 'key' }, { uid: 'old' }] },
});
const keyCalls = (asked: { url: string; method: string }[]) => asked.filter((a) => a.url.startsWith(KEYS)).map((a) => `${a.method} ${a.url.slice(KEYS.length)}`);

test("the check notes the month's traffic, and at the cap deletes every key, ending every login out", async (t) => {
  const at = Date.UTC(2026, 11, 31, 23, 50);
  for (const [used, capped] of [[499e9, false], [500e9, true]] as const) {
    t.mock.method(console, 'log', () => {});
    const asked = cloudflare(t, { graphql: usage(used), ...turnKeys() });
    const e = env(null);
    await check({ scheduledTime: at }, e);
    assert.deepEqual(JSON.parse(asked[0].body).variables, { account: 'account', from: '2026-12-01', to: '2026-12-31' });
    assert.deepEqual(JSON.parse(e.kv.get('state')!), { checkedAt: at, used, ...(capped ? { capped: true, key: 'key', deleted: true } : {}) });
    // Below the cap the key's name is written back as it is (the token may change it); at the cap every key is deleted.
    assert.deepEqual(keyCalls(asked), capped ? ['GET ', 'DELETE /key', 'DELETE /old'] : ['GET /key', 'PUT /key']);
    if (!capped) assert.deepEqual(JSON.parse(asked.find((a) => a.method === 'PUT')!.body), { name: 'poe2' });
    t.mock.restoreAll();
  }
});

test('keys that cannot be deleted at the cap are tried again each time, logins stopped meanwhile', async (t) => {
  cloudflare(t, { graphql: usage(6e11), ...turnKeys(503) });
  const e = env(null);
  await assert.rejects(check({ scheduledTime: NOW }, e), /couldn't all be deleted: key 503, old 503/);
  const state = JSON.parse(e.kv.get('state')!);
  assert.equal(state.capped, true);
  assert.equal(state.deleted, undefined);
  t.mock.restoreAll();
  const asked = cloudflare(t, turnKeys());
  await check({ scheduledTime: NOW + 600_000 }, e);
  assert.equal(JSON.parse(e.kv.get('state')!).deleted, true);
  assert.deepEqual(keyCalls(asked), ['GET ', 'DELETE /key', 'DELETE /old']);
});

test('at the cap the keys are deleted even when the state cannot be written', async (t) => {
  const asked = cloudflare(t, { graphql: usage(6e11), ...turnKeys() });
  const e = env(null);
  e.RELAY_STATE.put = async () => {
    throw new Error('KV down');
  };
  await assert.rejects(check({ scheduledTime: NOW }, e), /KV down/);
  assert.deepEqual(keyCalls(asked), ['GET ', 'DELETE /key', 'DELETE /old']);
});

test('once capped, the relay stays off until a new key in a new month', async (t) => {
  const state = JSON.stringify({ checkedAt: NOW, used: 6e11, capped: true, key: 'key', deleted: true });
  const nextMonth = Date.UTC(2026, 10, 1, 0, 10);
  for (const [key, at, resumes] of [['key', NOW + 60_000, false], ['new', NOW + 60_000, false], ['key', nextMonth, false], ['new', nextMonth, true]] as const) {
    const asked = cloudflare(t, { graphql: usage(0), [`GET ${KEYS}/new`]: { result: { name: 'poe2' } }, [`PUT ${KEYS}/new`]: { result: {} } });
    const e = { ...env(state), TURN_KEY_ID: key };
    await check({ scheduledTime: at }, e);
    assert.deepEqual(JSON.parse(e.kv.get('state')!), resumes ? { checkedAt: at, used: 0 } : JSON.parse(state), `${key} ${at}`);
    assert.equal(asked.length, resumes ? 3 : 0);
    t.mock.restoreAll();
  }
});

test("a token that can't change the key fails the check, and the last state goes stale", async (t) => {
  for (const answers of [{ [`GET ${KEYS}/key`]: 403 }, { [`GET ${KEYS}/key`]: { result: { name: 'poe2' } }, [`PUT ${KEYS}/key`]: 403 }]) {
    cloudflare(t, { graphql: usage(1e9), ...answers });
    const e = env(FRESH);
    await assert.rejects(check({ scheduledTime: NOW }, e), /can't change the TURN key/);
    assert.equal(e.kv.get('state'), FRESH);
    t.mock.restoreAll();
  }
});

test("a check that can't read this account's numbers fails loudly and leaves the last state to go stale", async (t) => {
  for (const reply of [{ errors: [{ message: 'Authentication failed' }] }, { data: { viewer: { accounts: [] } } }]) {
    cloudflare(t, { graphql: reply });
    const e = env(FRESH);
    await assert.rejects(check({ scheduledTime: NOW }, e), /Analytics/);
    assert.equal(e.kv.get('state'), FRESH);
    t.mock.restoreAll();
  }
});
