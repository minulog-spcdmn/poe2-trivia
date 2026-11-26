// The game's visitor counts round a blocker: a Cloudflare Worker of its own
// (README, "Counts round a blocker"). The counts (src/lib/count.ts) go from
// the page to GoatCounter itself, unless a page's first count didn't get
// there (an ad or tracking blocker keeps GoatCounter's address from the
// page): then that load's counts come here, in batches (src/lib/countRelay.ts),
// and go on to GoatCounter's counting API (www.goatcounter.com/api, POST
// /api/v0/count) with the player's address and browser string, as GoatCounter
// has them from a page that reaches it: what it works out the country,
// browser and system from, and tells one visitor's counts by for eight hours.
// Nothing of them is kept here, and no request logs (wrangler.toml).
//
// Apart from the matchmaking server (signal/), on an address of its own: a
// blocker's list that names this one costs its players their counts, never
// their games.
//
// - POST /counts: `{"h":[{"p":"/","t":"PoE2.Quest","r":"https://www.reddit.com"},{"p":"play/race","t":"play/race","e":"true","ns":"true"}]}`
//   (as text/plain, so a page's request needs no preflight): each count in
//   GoatCounter's own parameters, as the page would have sent it there, and
//   only in the shapes the page gives them (`counted`): a count off in any
//   way is left out alone, a batch off in its own shape refused whole. An
//   event counted each time (`ns`) goes with a session of its own, the id
//   the page gave it (`i`; GoatCounter's API has no `ns`: a session never
//   seen before counts as a visitor's first, as `ns` does), the rest with
//   none, so GoatCounter tells their visitor by address and browser, as from
//   the page. Either way a count sent again (its batch's answer lost on the
//   way, or GoatCounter's) counts nothing twice: GoatCounter counts a path
//   once a session (memstore.go session, cron/hit_count.go: first visits
//   only).
//
// Only from the live game's page (the only one that counts), within a limit
// an address (COUNT_WRITES, wrangler.toml). GoatCounter takes them under the
// Worker's secret GOATCOUNTER_KEY, an API key allowed only to record counts;
// without it the path answers 404, and a page sends its counts straight
// again. Busy or failing, GoatCounter's answer becomes a 503, and the page
// sends the batch again with its next (twice more at most).

import { V4, V4_CODES, V6, V6_CODES } from './botRanges.js';

/**
 * @typedef {{
 *   COUNT_WRITES: { limit(o: { key: string }): Promise<{ success: boolean }> },
 *   GOATCOUNTER_KEY?: string,
 * }} Env
 */

/** The live game's page: the only one whose counts go on. */
const LIVE = 'https://poe2.quest';
/** A page on this computer or the home network (the dev server): answered, so it hears there's nothing for it here. */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
/**
 * The header GoatCounter takes a request's address from (zgo.at/zhttp
 * mware.RealIP, first of those it reads). Cloudflare leaves it to the Worker
 * on a request to a server outside Cloudflare, as GoatCounter's is (its
 * docs, "CF-Connecting-IP in Worker subrequests"). Set to the visitor's, so
 * the API's limit an address (60 requests in two minutes) counts each
 * visitor, not every Worker that shares Cloudflare's addresses out. Whether
 * the hosted GoatCounter goes by it isn't known: if not, nothing changes.
 */
export const ASKER = 'CF-Connecting-IP';

/** Where the counts go on: GoatCounter's counting API for the site (src/lib/counter.ts COUNTER_ORIGIN, held equal by tests/countsWorker.test.ts). */
export const COUNTER_API = 'https://poe2quest.goatcounter.com/api/v0/count';
/** The longest batch (bytes) and the most counts in it: a page sends forty at most (src/lib/countRelay.ts MAX_RELAYED). */
export const MAX_COUNTS = 16 * 1024;
export const MAX_COUNTED = 40;
/** A count's path: the start page ("/"), or an event's name ("play/race", "cohort/2026-W43", "error/script/lib/codex.ts:loadCodex", "error/script/node_modules/@scope/pkg": src/lib/errorWhere.ts LABEL). */
const COUNT_PATH = /^(?:\/|[\w-]+(?:\/[\w@$.:-]+)*)$/;
/** A referrer as the page sends it (count.ts referrerOf): a site's or an app's origin alone. */
const COUNT_REF = /^[a-z][a-z0-9+.-]*:\/\/[^\s/?#]+$/i;
/** A tagged link's campaign, as the page sends it (count.ts campaignOf). */
const COUNT_CAMPAIGN = /^\?utm_campaign=[\w-]{1,40}$/;
/** Text with no control characters in it. */
const PLAIN = /^[^\u0000-\u001f\u007f]*$/;
/** @type {Record<string, (v: string) => boolean>} Each of a count's parameters, and what it may be. */
const COUNT_SHAPES = {
  p: (v) => v.length <= 200 && COUNT_PATH.test(v),
  t: (v) => v.length <= 200 && PLAIN.test(v),
  r: (v) => v.length <= 300 && COUNT_REF.test(v),
  q: (v) => COUNT_CAMPAIGN.test(v),
  e: (v) => v === 'true',
  ns: (v) => v === 'true',
  i: (v) => /^[0-9a-f]{32}$/.test(v),
};

/**
 * One count, in GoatCounter's own parameters (its /count's): `p` its path, `t` its title, `r` the referrer, `q` the campaign, `e` an event, `ns` counted each time; and `i`, not GoatCounter's, an event's own id (src/lib/countRelay.ts countId), kept however often its batch is sent.
 * @typedef {{ p: string, t?: string, r?: string, q?: string, e?: 'true', ns?: 'true', i?: string }} Counted
 */

/**
 * A batch of counts as sent, or null when the batch's own shape is off; a
 * count off in any way left out alone (an event named past what's foreseen
 * here costs only itself).
 * @param {Uint8Array} body @returns {Counted[] | null}
 */
export function counted(body) {
  /** @type {unknown} */
  let m;
  try {
    m = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null || Array.isArray(m) || Object.keys(m).length !== 1) return null;
  const { h } = /** @type {{ h?: unknown }} */ (m);
  if (!Array.isArray(h) || h.length < 1 || h.length > MAX_COUNTED) return null;
  /** @param {unknown} x */
  const ok = (x) =>
    typeof x === 'object' &&
    x !== null &&
    !Array.isArray(x) &&
    typeof (/** @type {{ p?: unknown }} */ (x).p) === 'string' &&
    // (The shapes' own keys only: `constructor` or `__proto__`, every object's from its prototype, are none of a count's.)
    Object.entries(x).every(([k, v]) => Object.hasOwn(COUNT_SHAPES, k) && typeof v === 'string' && COUNT_SHAPES[k](v));
  return /** @type {Counted[]} */ (h.filter(ok));
}

/** A base64 string's bytes. */
const bytes = (/** @type {string} */ b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
/** The cloud and hosting providers' ranges (botRanges.js), read once as the Worker starts: each range's first and last address in words, and its provider's code. */
const v4 = new Uint32Array(bytes(V4).buffer);
const v4Codes = bytes(V4_CODES);
const v6 = new Uint32Array(bytes(V6).buffer);
const v6Codes = bytes(V6_CODES);

/** An address as 32-bit words (one for IPv4, four for IPv6, highest first), or null when it isn't one. @param {string} ip @returns {number[] | null} */
export function words(ip) {
  const four = (/** @type {string} */ a) => {
    const p = a.split('.');
    if (p.length !== 4 || !p.every((x) => /^\d{1,3}$/.test(x) && Number(x) < 256)) return null;
    return p.map(Number);
  };
  if (!ip.includes(':')) {
    const p = four(ip);
    return p && [((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0];
  }
  let groups = ip.toLowerCase().split('::');
  if (groups.length > 2) return null;
  const side = (/** @type {string} */ g) => (g ? g.split(':') : []);
  let left = side(groups[0]);
  let right = side(groups[1] ?? '');
  // (An IPv4 address at its end, as in ::ffff:1.2.3.4: two groups.)
  const tail = (right.length ? right : left).at(-1);
  if (tail?.includes('.')) {
    const p = four(tail);
    if (!p) return null;
    const g = [((p[0] << 8) | p[1]).toString(16), ((p[2] << 8) | p[3]).toString(16)];
    if (right.length) right = [...right.slice(0, -1), ...g];
    else left = [...left.slice(0, -1), ...g];
  }
  const all = groups.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  const n = all.map((g) => parseInt(g, 16));
  return [0, 2, 4, 6].map((i) => ((n[i] << 16) | n[i + 1]) >>> 0);
}

/**
 * The bot GoatCounter's /count would call a count from this address (isbot's
 * IPRange: a cloud or hosting provider's, botRanges.js), its code, or 0. Its
 * API, which the counts go to from here, checks a count's browser string
 * only; told this, it keeps the count as the bot it is, as /count does.
 * @param {string} ip
 */
export function botOf(ip) {
  const w = words(ip);
  if (!w) return 0;
  const [ranges, codes] = w.length === 1 ? [v4, v4Codes] : [v6, v6Codes];
  const k = w.length;
  /** How range i's bound (0 its first, 1 its last) compares with the address. */
  const cmp = (/** @type {number} */ i, /** @type {number} */ end) => {
    const at = (2 * i + end) * k;
    for (let j = 0; j < k; j++) if (ranges[at + j] !== w[j]) return ranges[at + j] < w[j] ? -1 : 1;
    return 0;
  };
  // The last range that starts at the address or before it.
  let lo = 0;
  let hi = codes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cmp(mid, 0) <= 0) (found = mid), (lo = mid + 1);
    else hi = mid - 1;
  }
  return found >= 0 && cmp(found, 1) >= 0 ? codes[found] : 0;
}

/**
 * A count as GoatCounter's API takes it, with the address and browser string it came from, and the bot that address is, if it is one (botOf).
 * @param {Counted} c @param {string} ip @param {string} userAgent @param {number} [bot]
 */
export function goatHit(c, ip, userAgent, bot = 0) {
  return {
    path: c.p,
    title: c.t ?? '',
    event: c.e === 'true',
    ...(c.r ? { ref: c.r } : {}),
    ...(c.q ? { query: c.q } : {}),
    ip,
    user_agent: userAgent,
    // (A session of its own, the event's id: counted each time, as `ns` is from the page, yet once however often its batch comes, as GoatCounter counts a path once a session.)
    ...(c.ns === 'true' ? { session: c.i ?? crypto.randomUUID() } : {}),
    ...(bot ? { bot } : {}),
  };
}

/**
 * A batch of counts passed on to GoatCounter; null for any other path.
 * @param {Request} request @param {URL} url @param {Env} env @param {Record<string, string>} headers
 */
async function counts(request, url, env, headers) {
  if (url.pathname !== '/counts') return null;
  // (Without the key, or from anywhere but the live game's page, as if it weren't here: the page sends its counts straight again.)
  if (!env.GOATCOUNTER_KEY || request.method !== 'POST' || request.headers.get('Origin') !== LIVE) return new Response(null, { status: 404, headers });
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_COUNTS) return new Response(null, { status: 413, headers });
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const key = addressKey(ip);
  if (!(await env.COUNT_WRITES.limit({ key })).success) return new Response(null, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  const body = await upTo(request.body, MAX_COUNTS);
  if (!body) return new Response(null, { status: 413, headers });
  const batch = counted(body);
  if (!batch) return new Response(null, { status: 400, headers });
  // Nothing left once the counts off in shape are left out: taken, GoatCounter not asked.
  if (!batch.length) return new Response(null, { status: 204, headers });
  const userAgent = request.headers.get('User-Agent') ?? '';
  const bot = botOf(ip);
  /** @type {Response | null} */
  const r = await fetch(COUNTER_API, {
    method: 'POST',
    // (The visitor's address as the one asking too, so GoatCounter's limit on its API counts them, not every Worker it hears from: ASKER.)
    headers: { Authorization: `Bearer ${env.GOATCOUNTER_KEY}`, 'Content-Type': 'application/json', ...(ip ? { [ASKER]: ip } : {}) },
    body: JSON.stringify({ hits: batch.map((c) => goatHit(c, ip, userAgent, bot)) }),
  }).catch(() => null);
  // Taken (202, or any 2xx), or some turned down as they are (400, its errors by index; the rest taken): sending them again would count those twice.
  if (r && (r.ok || r.status === 400)) return new Response(null, { status: 204, headers });
  // A key GoatCounter refuses (401, 403) is as none.
  if (r && (r.status === 401 || r.status === 403)) return new Response(null, { status: 404, headers });
  // Busy, failing, or out of reach: the page sends the batch again with its next.
  return new Response(null, { status: 503, headers });
}

/**
 * Whom the rate limit counts as one, as the matchmaking server's does
 * (signal/worker.js): an IPv4 address, or an IPv6 one's /56 (what a home or a phone is often given whole,
 * so a /64 each would let one count as 256).
 * @param {string} ip
 */
export function addressKey(ip) {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  const groups = full.slice(0, 4).map((g) => parseInt(g, 16) || 0);
  groups[3] &= 0xff00;
  return groups.map((g) => g.toString(16)).join(':') + '::/56';
}

/**
 * A body read as it comes, or null once it's more than `max` bytes (one sent
 * without a length is counted, not read whole first).
 * @param {ReadableStream<Uint8Array> | null} body @param {number} max
 */
export async function upTo(body, max) {
  /** @type {Uint8Array[]} */
  const parts = [];
  let n = 0;
  if (body)
    for (const reader = body.getReader(); ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > max) {
        await reader.cancel();
        return null;
      }
      parts.push(value);
    }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** @param {Request} request @param {Env} env */
export async function answer(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  if (origin !== LIVE && !LOCAL.test(origin)) return new Response(null, { status: 403 });
  const headers = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' };
  const url = new URL(request.url);
  return (await counts(request, url, env, headers)) ?? new Response(null, { status: 404, headers });
}

export default {
  /** @param {Request} request @param {Env} env */
  fetch: (request, env) => answer(request, env),
};
