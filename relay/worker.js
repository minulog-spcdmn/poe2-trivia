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
// - A login lasts a few hours, so one taken stops working soon.
// - An address may take only so many a minute (PER_ADDRESS, wrangler.toml).
// - Every hour the month's relay traffic is read (ANALYTICS_TOKEN, a secret:
//   an API token with Account Analytics read); past CAP_BYTES, well inside
//   the free 1,000 GB, no more logins are given until the next month, and the
//   game plays on without the relay.

/** How long a login lasts (seconds). The page fetches a fresh one halfway, for the connections after (lib/relay.ts). */
const TTL = 4 * 3600;
/** The month's relay traffic past which no more logins are given: half the free allowance, leaving room for logins already out. */
const CAP_BYTES = 500e9;
const CAPPED = 'capped';
const LIVE = 'https://poe2.quest';
/** The dev server, on this machine or another on the network (a phone trying a build). */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    if (origin !== LIVE && !LOCAL.test(origin)) return new Response(null, { status: 403 });
    const headers = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' };
    if (request.method !== 'GET') return new Response(null, { status: 405, headers });
    const { success } = await env.PER_ADDRESS.limit({ key: request.headers.get('CF-Connecting-IP') ?? '' });
    if (!success) return new Response(null, { status: 429, headers });
    if (await env.RELAY_STATE.get(CAPPED)) return new Response(null, { status: 503, headers });
    let servers;
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL }),
      });
      const { iceServers } = r.ok ? await r.json() : {};
      if (!Array.isArray(iceServers)) throw new Error(`No ICE servers from Cloudflare (${r.status})`);
      // Browsers block port 53, so a URL on it only waits out its timeout.
      servers = iceServers.map((s) => ({ ...s, urls: [s.urls].flat().filter((u) => !/:53(\?|$)/.test(u)) })).filter((s) => s.urls.length);
    } catch (err) {
      // An answer the page can read (CORS), not Cloudflare's error page: it tries again later.
      console.error(err);
      return new Response(null, { status: 502, headers });
    }
    return Response.json({ iceServers: servers, ttl: TTL }, { headers });
  },

  /** Every hour: the month's relay traffic, and the cap once it's reached (lifted by itself as the next month begins). */
  async scheduled(event, env) {
    const now = new Date(event.scheduledTime);
    const used = await trafficThisMonth(env, now);
    console.log(`Relay traffic this month: ${(used / 1e9).toFixed(2)} GB`);
    if (used < CAP_BYTES) return;
    const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000;
    await env.RELAY_STATE.put(CAPPED, String(used), { expiration: nextMonth });
  },
};

/** Bytes the account's TURN relay sent to clients this month (UTC), from Cloudflare's analytics. */
async function trafficThisMonth(env, now) {
  const day = now.toISOString().slice(0, 10);
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
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
  return j.data.viewer.accounts[0]?.callsTurnUsageAdaptiveGroups[0]?.sum.egressBytes ?? 0;
}
