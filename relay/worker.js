// The game's relay logins: a Cloudflare Worker that hands each page a
// short-lived login for Cloudflare's TURN relay (src/lib/relay.ts), so two
// devices that can't reach each other directly still meet. The relay's key
// never leaves the Worker: TURN_KEY_ID and TURN_KEY_API_TOKEN are its secrets
// (wrangler secret put), from the TURN key made in Cloudflare's dashboard
// (Realtime, TURN Server). Deploying and setting them up: README, "Relay".
//
// Only the game's own pages are answered. That keeps a browser elsewhere from
// using it, not a script that sends the same Origin; the relay's free
// allowance (1,000 GB a month) is far beyond what rooms use.

/** How long a login lasts (seconds): longer than any game, so a room never loses its relay midway. */
const TTL = 86400;
const LIVE = 'https://poe2.quest';
/** The dev server, on this machine or another on the network (a phone trying a build). */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';
    if (origin !== LIVE && !LOCAL.test(origin)) return new Response(null, { status: 403 });
    const headers = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' };
    if (request.method !== 'GET') return new Response(null, { status: 405, headers });
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
};
