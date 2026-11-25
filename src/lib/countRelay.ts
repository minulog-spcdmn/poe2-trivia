// The visitor counts' way round a blocker (count.ts): a page that finds
// GoatCounter's address blocked (an ad or tracking blocker keeps it from the
// page) sends its counts to the matchmaking server instead, which passes them
// on to GoatCounter with the player's address and browser string, keeping
// nothing (signal/worker.js, "visitor counts passed on"). Each count as the
// page would have sent it to GoatCounter itself (its own parameters), held and
// sent in batches: GATHER_MS after the first that waits, once MAX_RELAYED
// wait, and at once as the page is hidden or left. A batch turned down by the
// network or a busy server goes again with the next send, as it was, twice
// more at most (RETRIES); a server without the path (an older one, or one
// without GoatCounter's key: 404) is let go of, and nothing more goes there
// from this page. Asked again as each batch goes: nothing goes once the
// privacy page has been used to opt out.

import { OWN_SIGNAL_HOST } from './signalHost.ts';

/** Where the counts go round a blocker: the matchmaking server's own host (vite.config.ts lets the page reach it). */
export const COUNTS_URL = OWN_SIGNAL_HOST ? `https://${OWN_SIGNAL_HOST}/counts` : '';
/** The most counts one batch carries (and the Worker takes: MAX_COUNTED). */
export const MAX_RELAYED = 40;
/** How long a count waits for others to go with it (ms): a game's start sends several within a second or two. */
export const GATHER_MS = 5_000;
/** How many times more a batch turned down goes. */
export const RETRIES = 2;

/** A count as it goes: GoatCounter's own parameters (count.ts send), `p` its path and the rest. */
export type Hit = Record<string, string>;

/** A count's parameters, from the address it would have gone to GoatCounter at, without its cache-buster. */
export function hitOf(url: string): Hit {
  const q = new URL(url).searchParams;
  q.delete('rnd');
  return Object.fromEntries(q);
}

/** A batch as the Worker takes it. */
export const relayBody = (h: Hit[]) => JSON.stringify({ h });

/** What sending a batch came to: its status, or null when the network failed it. */
export type Posted = number | null;

/** Whether a batch so turned down goes again: the network failed it, the server was busy (429) or GoatCounter was (5xx). */
const again = (status: Posted) => status === null || status === 429 || status >= 500;

/** Timers as the relay uses them (the tests' own clock in place of the page's). */
export interface Clock {
  set(f: () => void, ms: number): unknown;
  clear(t: unknown): void;
}
const pageClock: Clock = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) };

/** Counts held until they go round the blocker: `allowed` asked again as each batch goes, `post` sending one. */
export class Relay {
  private held: Hit[] = [];
  private turnedDown: { body: string; tries: number }[] = [];
  private timer: unknown = null;
  /** The server hasn't the path (404): nothing more goes. */
  private off = false;
  private allowed: () => boolean;
  private post: (body: string) => Promise<Posted>;
  private clock: Clock;
  constructor(allowed: () => boolean, post: (body: string) => Promise<Posted>, clock: Clock = pageClock) {
    this.allowed = allowed;
    this.post = post;
    this.clock = clock;
  }

  /** A count: held, sent with those that come within GATHER_MS, or at once once MAX_RELAYED wait. */
  add(hit: Hit) {
    if (this.off || !this.allowed()) return this.drop();
    this.held.push(hit);
    if (this.held.length >= MAX_RELAYED) this.send();
    else this.timer ??= this.clock.set(() => this.send(), GATHER_MS);
  }

  /** Sends the batches turned down before, each as it was, then what is held; nothing once the player has opted out meanwhile. */
  send() {
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
    const fresh = this.held;
    const old = this.turnedDown;
    this.held = [];
    this.turnedDown = [];
    if (this.off || !this.allowed()) return;
    for (const b of old) this.go(b);
    for (let i = 0; i < fresh.length; i += MAX_RELAYED) this.go({ body: relayBody(fresh.slice(i, i + MAX_RELAYED)), tries: 0 });
  }

  private go(b: { body: string; tries: number }) {
    void this.post(b.body).then((status) => {
      if (status === 404) {
        this.off = true;
        return this.drop();
      }
      // Kept to go with the next send, unchanged (never by itself: a busy server isn't asked again at once).
      if (again(status) && b.tries < RETRIES && !this.off && this.allowed()) this.turnedDown.push({ ...b, tries: b.tries + 1 });
    });
  }

  private drop() {
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
    this.held = [];
    this.turnedDown = [];
  }

  /** How many counts are held and batches turned down (the tests). */
  get size() {
    return { held: this.held.length, turnedDown: this.turnedDown.length };
  }
}

/** One batch, as text (no preflight), outliving the page if it is closing: what it came to. */
export async function postCounts(body: string): Promise<Posted> {
  try {
    const r = await fetch(COUNTS_URL, { method: 'POST', body, keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'text/plain' } });
    return r.status;
  } catch {
    // (The network failed it, or a browser refused it: tried again with the next.)
    return null;
  }
}

/**
 * Whether this page reaches GoatCounter's address, asked with a request
 * shaped like the count at `url` but that counts nothing: HEAD, which
 * GoatCounter's /count isn't routed for (only GET and POST are, in its
 * handlers/backend.go). Its answer is opaque
 * (no-cors); any answer at all is reaching it. A blocker turning it away
 * fails it, as it would the count, which a beacon never says.
 */
export function reaches(url: string): Promise<boolean> {
  return fetch(url, { method: 'HEAD', mode: 'no-cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }).then(
    () => true,
    () => false,
  );
}
