// A relay for when two devices can't reach each other directly (some home
// routers, phone carriers, venue Wi-Fi). Without one, such a guest sees a room
// in the list and never gets in. PeerJS's free relays (eu-0 and
// us-0.turn.peerjs.com) are gone, so the game has its own: Cloudflare's TURN,
// with a short-lived login from the game's Worker (relay/worker.js, README
// "Relay"). A login that can't be had leaves the peer without a relay: rooms
// still meet wherever a direct link gets through.

/** How long a page waits for a login before making its peer without one. */
const WAIT_MS = 3000;
/** A fetch that hasn't answered by then is given up, so another can go. */
const GIVE_UP_MS = 15000;
/** After a login that couldn't be had, how long until the next try (unless the Worker says how long: Retry-After). */
const RETRY_MS = 30000;
/** The longest a Worker's Retry-After is taken at: a page open for weeks still asks again now and then. */
const RETRY_MAX_MS = 24 * 3_600_000;
/**
 * A login with less left than this (or past half of a shorter one, as the
 * Worker's half-day logins are) is fetched anew. A relayed connection ends
 * when its login does, and a peer reads the servers again for each
 * connection it makes (peer.ts), so every connection starts with half the
 * login at least (six hours): longer than any game.
 */
const MARGIN_MS = 12 * 3_600_000;

/** The Worker turned the request down, saying when to ask again (Retry-After, seconds). */
class Later extends Error {
  readonly ms: number;
  constructor(seconds: string | null) {
    super('Relay login refused');
    const s = Number(seconds);
    this.ms = s > 0 ? Math.min(s * 1000, RETRY_MAX_MS) : RETRY_MS;
  }
}

/** The longest a login is taken to last, whatever the Worker says (Cloudflare's longest). */
const TTL_MAX_S = 48 * 3600;
/** A server's address as WebKit, the strictest, takes one; anything else makes the RTCPeerConnection throw. */
const STUN_URL = /^stuns?:[^/?#][^?#]*$/;
const TURN_URL = /^turns?:[^/?#][^?#]*(\?transport=(udp|tcp))?$/;
/** WebKit's limit for a TURN login (bytes). */
const LOGIN_MAX = 509;
const loginPart = (v: unknown) => typeof v === 'string' && v.length > 0 && new TextEncoder().encode(v).length <= LOGIN_MAX;

/**
 * The Worker's answer, checked as strictly as a browser checks it: STUN
 * servers, and TURN servers with their login. Anything else gives no relay
 * at all, as a server a browser turns down would make every connection fail.
 */
export function parseRelay(raw: unknown): { iceServers: RTCIceServer[]; ttl: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { iceServers, ttl } = raw as { iceServers?: unknown; ttl?: unknown };
  if (!Array.isArray(iceServers) || !iceServers.length || typeof ttl !== 'number' || !(ttl > 0)) return null;
  const out: RTCIceServer[] = [];
  for (const s of iceServers) {
    if (!s || typeof s !== 'object') return null;
    const { urls, username, credential } = s as Record<string, unknown>;
    const list = Array.isArray(urls) ? urls : [urls];
    if (!list.length || !list.every((u) => typeof u === 'string')) return null;
    if (list.every((u) => STUN_URL.test(u))) out.push({ urls: list });
    else if (list.every((u) => TURN_URL.test(u)) && loginPart(username) && loginPart(credential)) out.push({ urls: list, username: username as string, credential: credential as string });
    else return null;
  }
  return { iceServers: out, ttl: Math.min(ttl, TTL_MAX_S) };
}

/** The logins of the Worker at a URL (none when it's empty). */
export class Relay {
  private readonly url: string;
  private readonly get: typeof fetch;
  private servers: RTCIceServer[] = [];
  private until = 0;
  /** When the login held is fetched anew: MARGIN_MS before it runs out, or halfway through a shorter one. */
  private refreshAt = 0;
  private retryAt = 0;
  private fetching: Promise<void> | null = null;
  /** Until when a peer waits for the fetch on the way (WAIT_MS from its start, whoever asks). */
  private waitUntil = 0;

  constructor(url: string, get: typeof fetch = (...a) => fetch(...a)) {
    this.url = url;
    this.get = get;
  }

  /** Whether there's a Worker to ask at all. */
  get on(): boolean {
    return !!this.url;
  }

  /** Whether a login should be fetched before the next peer is made: none held or it's running low, none on the way, and the last try not just failed. */
  due(): boolean {
    return !!this.url && !this.fetching && Date.now() >= Math.max(this.retryAt, this.refreshAt);
  }

  /**
   * Whether the next peer should wait for a login: nothing usable is held,
   * and one is due or on the way with its wait not over. One running low
   * still serves meanwhile (its peers read the fresh one once it's in).
   */
  wanted(): boolean {
    return !this.iceServers().length && (this.due() || (!!this.fetching && Date.now() < this.waitUntil));
  }

  /** Fetches a login when one is due, without waiting for it. */
  start(): void {
    if (this.due()) {
      const abort = new AbortController();
      const giveUp = setTimeout(() => abort.abort(), GIVE_UP_MS);
      this.waitUntil = Date.now() + WAIT_MS;
      this.fetching = this.get(this.url, { cache: 'no-store', signal: abort.signal })
        .then((r) => {
          if (!r.ok) throw new Later(r.headers.get('Retry-After'));
          return r.json();
        })
        .then((raw) => {
          const got = parseRelay(raw);
          if (!got) throw new Error('No relay login');
          const now = Date.now();
          this.servers = got.iceServers;
          this.until = now + got.ttl * 1000;
          this.refreshAt = this.until - Math.min(MARGIN_MS, (got.ttl * 1000) / 2);
        })
        .catch((err) => void (this.retryAt = Date.now() + (err instanceof Later ? err.ms : RETRY_MS)))
        .finally(() => {
          clearTimeout(giveUp);
          this.fetching = null;
        });
    }
  }

  /**
   * Fetches a login when one is due, and waits for the one on the way. Never
   * fails, and never waits past WAIT_MS from the fetch's start: a slow answer
   * leaves the peer to be made without the relay, and is kept for the next
   * when it comes.
   */
  load(): Promise<void> {
    this.start();
    const on = this.fetching;
    const left = this.waitUntil - Date.now();
    if (!on || left <= 0) return Promise.resolve();
    return new Promise((done) => {
      const t = setTimeout(done, left);
      void on.then(() => {
        clearTimeout(t);
        done();
      });
    });
  }

  /** The relay's servers while their login holds (none once it has run out). */
  iceServers(): RTCIceServer[] {
    return Date.now() < this.until ? this.servers : [];
  }
}
