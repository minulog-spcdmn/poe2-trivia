// The relay's Worker (relay/worker.js), on Node with Cloudflare's parts faked:
// whom it answers, its limits, and the hourly check that stops logins once
// the month's relay traffic reaches the cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../relay/worker.js';

const LOGIN = { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }, { urls: ['turn:turn.cloudflare.com:53?transport=udp'], username: 'u', credential: 'c' }, { urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }] };

/** The Worker's bindings, with a rate limit that allows `allowed` requests and a KV store kept in a Map. */
function env(allowed = Infinity) {
  const kv = new Map<string, { value: string; expiration?: number }>();
  let asked = 0;
  return {
    kv,
    TURN_KEY_ID: 'key',
    TURN_KEY_API_TOKEN: 'token',
    ANALYTICS_TOKEN: 'analytics',
    ACCOUNT_ID: 'account',
    PER_ADDRESS: { limit: async () => ({ success: ++asked <= allowed }) },
    RELAY_STATE: {
      get: async (k: string) => kv.get(k)?.value ?? null,
      put: async (k: string, value: string, o?: { expiration?: number }) => void kv.set(k, { value, expiration: o?.expiration }),
    },
  };
}

/** Cloudflare's APIs, answered from `answers` by URL. */
function cloudflare(t: { mock: { method: typeof import('node:test').mock.method } }, answers: Record<string, unknown>) {
  const asked: { url: string; body: string }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    asked.push({ url, body: String(init.body) });
    const key = Object.keys(answers).find((k) => url.includes(k));
    return key ? Response.json(answers[key]) : new Response(null, { status: 404 });
  });
  return asked;
}

const ask = (origin?: string, method = 'GET') => new Request('https://relay.test/', { method, headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': '203.0.113.7' } });

test("a login for the game's own pages, without the servers browsers can't reach", async (t) => {
  const asked = cloudflare(t, { 'generate-ice-servers': LOGIN });
  const r = await worker.fetch(ask('https://poe2.quest'), env());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://poe2.quest');
  const body = await r.json();
  assert.equal(body.ttl, 4 * 3600);
  assert.deepEqual(body.iceServers, [{ urls: ['stun:stun.cloudflare.com:3478'] }, LOGIN.iceServers[2]]);
  assert.match(asked[0].url, /\/turn\/keys\/key\//);
  assert.deepEqual(JSON.parse(asked[0].body), { ttl: 4 * 3600 });
  for (const local of ['http://localhost:5173', 'http://192.168.1.20:5173']) assert.equal((await worker.fetch(ask(local), env())).status, 200, local);
});

test('anyone else is turned away, and nothing is minted for them', async (t) => {
  const asked = cloudflare(t, { 'generate-ice-servers': LOGIN });
  for (const origin of [undefined, 'https://evil.example', 'https://poe2.quest.evil.example', 'http://poe2.quest']) assert.equal((await worker.fetch(ask(origin), env())).status, 403, origin);
  assert.equal((await worker.fetch(ask('https://poe2.quest', 'POST'), env())).status, 405);
  assert.equal(asked.length, 0);
});

test('an address past its limit, or a month past the cap, gets no login, in a way the page can read', async (t) => {
  const asked = cloudflare(t, { 'generate-ice-servers': LOGIN });
  const e = env(1);
  assert.equal((await worker.fetch(ask('https://poe2.quest'), e)).status, 200);
  const limited = await worker.fetch(ask('https://poe2.quest'), e);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Access-Control-Allow-Origin'), 'https://poe2.quest');
  const capped = env();
  capped.kv.set('capped', { value: '1' });
  assert.equal((await worker.fetch(ask('https://poe2.quest'), capped)).status, 503);
  assert.equal(asked.length, 1);
});

test("Cloudflare's trouble comes back as a 502 the page can read", async (t) => {
  cloudflare(t, { 'generate-ice-servers': { nothing: true } });
  t.mock.method(console, 'error', () => {});
  const r = await worker.fetch(ask('https://poe2.quest'), env());
  assert.equal(r.status, 502);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://poe2.quest');
});

test('the hourly check stops logins once the month reaches the cap, until the next month begins', async (t) => {
  t.mock.method(console, 'log', () => {});
  for (const [used, capped] of [[499e9, false], [500e9, true]] as const) {
    const asked = cloudflare(t, { graphql: { data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: used } }] }] } } } });
    const e = env();
    await worker.scheduled({ scheduledTime: Date.UTC(2026, 11, 31, 23, 17) }, e);
    assert.deepEqual(JSON.parse(asked.at(-1)!.body).variables, { account: 'account', from: '2026-12-01', to: '2026-12-31' });
    assert.equal(e.kv.has('capped'), capped, String(used));
    if (capped) assert.equal(e.kv.get('capped')!.expiration, Date.UTC(2027, 0, 1) / 1000);
  }
});

test("a usage check that can't read the numbers fails loudly, and caps nothing", async (t) => {
  cloudflare(t, { graphql: { errors: [{ message: 'Authentication failed' }] } });
  const e = env();
  await assert.rejects(worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 28) }, e), /Authentication failed/);
  assert.equal(e.kv.size, 0);
});
