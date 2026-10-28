// The game's relay logins: a Cloudflare Worker that hands each page a
// short-lived login for Cloudflare's TURN relay (src/lib/relay.ts), so two
// devices that can't reach each other directly still meet. The relay's key
// never leaves the Worker: TURN_KEY_ID and TURN_KEY_API_TOKEN are its secrets
// (wrangler secret put), from the TURN key made in Cloudflare's dashboard
// (Realtime, TURN Server). Deploying and setting them up: README, "Relay".
//
// Only the game's own pages are answered. That keeps a browser elsewhere from
// using it, not a script that sends the same Origin, so the relay can't cost
// anything whoever asks:
// - Every ten minutes the month's relay traffic is read (ANALYTICS_TOKEN, a
//   secret: an API token with Account Analytics read and Calls write). Past
//   CAP_BYTES, well inside the free 1,000 GB, every TURN key on the account is
//   deleted, which ends every login already out, and none are given until
//   the owner makes a new key (README).
// - Logins last half a day: Cloudflare doesn't say that deleting a key ends
//   the relaying already under way, and a login's end does.
// - Logins go out only while that check has run lately: one that fails (a
//   token gone wrong) stops them rather than leaving the cap unwatched.
// - An address may take only so many a minute (PER_ADDRESS, wrangler.toml),
//   which slows a script minting them; the cap is what bounds the cost.
// Without logins the game plays on, rooms meeting wherever a direct link gets
// through.

/**
 * How long a login lasts (seconds). A relayed connection ends when its login
 * does, so the page renews it halfway (lib/relay.ts) and every connection
 * starts with six hours at least; past the cap, whatever a deleted key may
 * still relay stops within it.
 */
const TTL = 12 * 3600;
/**
 * Cloudflare's servers handed on: STUN on its own port, TURN over UDP, and
 * TURN over TLS on 443, which gets out wherever the web does. Its others
 * repeat these (each costs every connection an allocation), or are on port
 * 53, which browsers block.
 */
const KEEP = [/^stun:[^?]+:3478$/, /^turn:[^?]+:3478\?transport=udp$/, /^turns:[^?]+:443\?transport=tcp$/];
/** How long an isolate keeps the state it read: each read is counted, and a flood of asks mustn't use the day's up. */
const STATE_CACHE_MS = 30_000;
/** The month's relay traffic at which the key is deleted: half the free allowance, leaving room for what the check is late by. */
const CAP_BYTES = 500e9;
/** How old the last usage check may be for logins to go out (it runs every ten minutes). */
const CHECK_FRESH_MS = 60 * 60_000;
const STATE = 'state';
const LIVE = 'https://poe2.quest';
/** The dev server, on this machine or another on the network (a phone trying a build). */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
const API = 'https://api.cloudflare.com/client/v4';
/** @type {WeakMap<object, { at: number, raw: string | null }>} */
const stateCache = new WeakMap();

/**
 * The Worker's bindings (wrangler.toml) and secrets.
 * @typedef {{
 *   TURN_KEY_ID: string, TURN_KEY_API_TOKEN: string, ANALYTICS_TOKEN: string, ACCOUNT_ID: string,
 *   PER_ADDRESS: { limit(o: { key: string }): Promise<{ success: boolean }> },
 *   RELAY_STATE: { get(key: string): Promise<string | null>, put(key: string, value: string): Promise<void> },
 * }} Env
 * What the usage check last found.
 * @typedef {{ checkedAt: number, used: number, capped?: boolean, key?: string, deleted?: boolean }} State
 */

/**
 * Whom the rate limit counts as one: an IPv4 address, or an IPv6 one's /64
 * (what a single home or phone is usually given).
 * @param {string} ip
 */
export function addressKey(ip) {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return full.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/** @param {Request} request @param {Env} env @param {number} [now] */
export async function answer(request, env, now = Date.now()) {
  const origin = request.headers.get('Origin') ?? '';
  if (origin !== LIVE && !LOCAL.test(origin)) return new Response(null, { status: 403 });
  const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'Retry-After', Vary: 'Origin', 'Cache-Control': 'no-store' };
  /** @param {number} status @param {number} seconds */
  const later = (status, seconds) => new Response(null, { status, headers: { ...headers, 'Retry-After': String(Math.ceil(seconds)) } });
  if (request.method !== 'GET') return new Response(null, { status: 405, headers });
  const { success } = await env.PER_ADDRESS.limit({ key: addressKey(request.headers.get('CF-Connecting-IP') ?? '') });
  if (!success) return later(429, 60);
  let read = stateCache.get(env);
  if (!read || now - read.at > STATE_CACHE_MS) stateCache.set(env, (read = { at: now, raw: await env.RELAY_STATE.get(STATE) }));
  /** @type {State | null} */
  const state = read.raw ? JSON.parse(read.raw) : null;
  if (state?.capped) return later(503, (nextMonth(new Date(now)) - now) / 1000);
  if (!state || now - state.checkedAt > CHECK_FRESH_MS) return later(503, 600);
  /** @type {{ urls: string[] }[]} */
  let servers;
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: TTL }),
    });
    const { iceServers } = r.ok ? await r.json() : {};
    if (!Array.isArray(iceServers)) throw new Error(`No ICE servers from Cloudflare (${r.status})`);
    servers = iceServers
      .map((/** @type {{ urls: string | string[] }} */ s) => ({ ...s, urls: [s.urls].flat().filter((/** @type {string} */ u) => KEEP.some((k) => k.test(u))) }))
      .filter((s) => s.urls.length);
    if (!servers.some((s) => s.urls.some((u) => u.startsWith('turn')))) throw new Error('No TURN server among Cloudflare\'s');
  } catch (err) {
    // An answer the page can read (CORS), not Cloudflare's error page: it tries again later.
    console.error(err);
    return later(502, 60);
  }
  return Response.json({ iceServers: servers, ttl: TTL }, { headers });
}

/**
 * Every ten minutes: the month's relay traffic, and that the token can still
 * change the TURN key (so it could delete it). At the cap every key is
 * deleted, ending every login out, tried again each time until they're gone,
 * and none go out until the owner makes a new key (README); a new key in a new
 * month starts the relay again by itself. A check that fails throws, and the
 * state it leaves goes stale, which stops logins within the hour.
 * @param {{ scheduledTime: number }} event @param {Env} env
 */
export async function check(event, env) {
  const now = new Date(event.scheduledTime);
  const raw = await env.RELAY_STATE.get(STATE);
  /** @type {State | null} */
  const prev = raw ? JSON.parse(raw) : null;
  if (prev?.capped) {
    if (!prev.deleted) {
      await endLogins(env);
      await env.RELAY_STATE.put(STATE, JSON.stringify({ ...prev, deleted: true }));
    }
    // Capped stays capped: in the same month (a new key would be capped again
    // at once) and with the deleted key (nothing to hand out).
    if (env.TURN_KEY_ID === prev.key || monthOf(now) === monthOf(new Date(prev.checkedAt))) return;
  }
  const used = await trafficThisMonth(env, now);
  /** @type {State} */
  const state = { checkedAt: now.getTime(), used };
  if (used < CAP_BYTES) {
    // The cap's way out, tried each time rather than first when it's needed.
    await canEndLogins(env);
    await env.RELAY_STATE.put(STATE, JSON.stringify(state));
    return;
  }
  const capped = { ...state, capped: true, key: env.TURN_KEY_ID };
  // Written first, so logins stop at once; the keys go even if it can't be.
  try {
    await env.RELAY_STATE.put(STATE, JSON.stringify(capped));
  } finally {
    await endLogins(env);
  }
  await env.RELAY_STATE.put(STATE, JSON.stringify({ ...capped, deleted: true }));
  console.log(`Relay capped at ${(used / 1e9).toFixed(1)} GB: its keys are deleted`);
}

/** @param {Env} env */
const keysUrl = (env) => `${API}/accounts/${env.ACCOUNT_ID}/calls/turn_keys`;
/** @param {Env} env */
const auth = (env) => ({ Authorization: `Bearer ${env.ANALYTICS_TOKEN}` });

/**
 * Deletes every TURN key on the account, not only the Worker's (a key made
 * again by hand, the old one kept, would relay on), which ends every login out.
 * @param {Env} env
 */
async function endLogins(env) {
  const ids = new Set([env.TURN_KEY_ID]);
  const list = await fetch(keysUrl(env), { headers: auth(env) });
  if (list.ok) for (const k of (await list.json()).result ?? []) ids.add(k.uid);
  const failed = list.ok ? [] : [`list ${list.status}`];
  for (const id of ids) {
    const r = await fetch(`${keysUrl(env)}/${id}`, { method: 'DELETE', headers: auth(env) });
    if (!r.ok && r.status !== 404) failed.push(`${id} ${r.status}`);
  }
  if (failed.length) throw new Error(`Relay capped, but its keys couldn't all be deleted: ${failed.join(', ')}`);
}

/**
 * Whether the token may change the TURN key, as deleting it needs: its name
 * written back as it is (reading it alone would pass a token that can't).
 * @param {Env} env
 */
async function canEndLogins(env) {
  const key = `${keysUrl(env)}/${env.TURN_KEY_ID}`;
  const r = await fetch(key, { headers: auth(env) });
  const name = r.ok ? (await r.json()).result?.name : undefined;
  const w = typeof name === 'string' ? await fetch(key, { method: 'PUT', headers: { ...auth(env), 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }) : r;
  if (!w.ok || typeof name !== 'string') throw new Error(`The token can't change the TURN key, so the cap couldn't delete it: ${w.status} ${await w.text()}`);
}

export default {
  /** @param {Request} request @param {Env} env */
  fetch: (request, env) => answer(request, env),
  /** @param {{ scheduledTime: number }} event @param {Env} env */
  scheduled: (event, env) => check(event, env),
};

/** @param {Date} now */
const nextMonth = (now) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
/** @param {Date} d */
const monthOf = (d) => d.toISOString().slice(0, 7);

/**
 * Bytes the account's TURN relay sent to clients this month (UTC), from Cloudflare's analytics.
 * @param {Env} env @param {Date} now @returns {Promise<number>}
 */
async function trafficThisMonth(env, now) {
  const day = now.toISOString().slice(0, 10);
  const r = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.ANALYTICS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query ($account: string!, $from: Date!, $to: Date!) {
        viewer { accounts(filter: { accountTag: $account }) {
          callsTurnUsageAdaptiveGroups(filter: { date_geq: $from, date_leq: $to }, limit: 1) { sum { egressBytes } }
        } }
      }`,
      variables: { account: env.ACCOUNT_ID, from: `${day.slice(0, 7)}-01`, to: day },
    }),
  });
  const j = await r.json();
  if (!r.ok || j.errors?.length) throw new Error(`Analytics: ${r.status} ${JSON.stringify(j.errors)}`);
  const account = j.data?.viewer?.accounts?.[0];
  // Not this account's numbers (a wrong ID, a token for another): unknown, not nothing.
  if (!account) throw new Error('Analytics: no such account for this token');
  return account.callsTurnUsageAdaptiveGroups[0]?.sum.egressBytes ?? 0;
}
