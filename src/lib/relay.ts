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
/** After a login that couldn't be had, how long until the next try. */
const RETRY_MS = 30000;
/**
 * A login with less left than this (or past half of a shorter one) is
 * fetched anew before the next peer is made. A peer reads the servers again
 * for each connection it makes (peer.ts), so this only keeps a fresh login
 * ready ahead of need.
 */
const MARGIN_MS = 12 * 3_600_000;

const iceUrl = (u: unknown) => typeof u === 'string' && /^(stun|turns?):/.test(u);

/** The Worker's answer, checked: only STUN and TURN servers with a login of strings. */
export function parseRelay(raw: unknown): { iceServers: RTCIceServer[]; ttl: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { iceServers, ttl } = raw as { iceServers?: unknown; ttl?: unknown };
  if (!Array.isArray(iceServers) || typeof ttl !== 'number' || !(ttl > 0)) return null;
  const out: RTCIceServer[] = [];
  for (const s of iceServers) {
    if (!s || typeof s !== 'object') return null;
    const { urls, username, credential } = s as Record<string, unknown>;
    const list = Array.isArray(urls) ? urls : [urls];
    if (!list.length || !list.every(iceUrl)) return null;
    if ((username !== undefined && typeof username !== 'string') || (credential !== undefined && typeof credential !== 'string')) return null;
    out.push({ urls: list as string[], ...(username !== undefined ? { username } : {}), ...(credential !== undefined ? { credential } : {}) });
  }
  return { iceServers: out, ttl };
}

/** The logins of the Worker at a URL (none when it's empty). */
export class Relay {
  private readonly url: string;
  private readonly get: typeof fetch;
  private servers: RTCIceServer[] = [];
  private until = 0;
  /** When the login held is fetched anew: half a day before it runs out, or halfway through a shorter one. */
  private refreshAt = 0;
  private retryAt = 0;
  private fetching: Promise<void> | null = null;
  /** Until when a peer waits for the fetch on the way (WAIT_MS from its start, whoever asks). */
  private waitUntil = 0;

  constructor(url: string, get: typeof fetch = (...a) => fetch(...a)) {
    this.url = url;
    this.get = get;
  }

  /** Whether a login should be fetched before the next peer is made: none held or it's running low, none on the way, and the last try not just failed. */
  due(): boolean {
    return !!this.url && !this.fetching && Date.now() >= Math.max(this.retryAt, this.refreshAt);
  }

  /** Whether the next peer should wait: a login is due, or one is on the way, nothing usable is held, and its wait isn't over. */
  wanted(): boolean {
    return this.due() || (!!this.fetching && !this.iceServers().length && Date.now() < this.waitUntil);
  }

  /**
   * Fetches a login when one is due, and waits for the one on the way. Never
   * fails, and never waits past WAIT_MS from the fetch's start: a slow answer
   * leaves the peer to be made without the relay, and is kept for the next
   * when it comes.
   */
  load(): Promise<void> {
    if (this.due()) {
      const abort = new AbortController();
      const giveUp = setTimeout(() => abort.abort(), GIVE_UP_MS);
      this.waitUntil = Date.now() + WAIT_MS;
      this.fetching = this.get(this.url, { cache: 'no-store', signal: abort.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((raw) => {
          const got = parseRelay(raw);
          if (!got) throw new Error('No relay login');
          const now = Date.now();
          this.servers = got.iceServers;
          this.until = now + got.ttl * 1000;
          this.refreshAt = this.until - Math.min(MARGIN_MS, (got.ttl * 1000) / 2);
        })
        .catch(() => void (this.retryAt = Date.now() + RETRY_MS))
        .finally(() => {
          clearTimeout(giveUp);
          this.fetching = null;
        });
    }
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
