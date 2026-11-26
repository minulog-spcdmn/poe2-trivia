// The visitor counts' way round a blocker (count.ts): a page whose first count
// didn't reach GoatCounter (an ad or tracking blocker keeps its address from
// the page) sends its counts to a server of the game's own instead, which
// passes them on to GoatCounter with the player's address and browser string,
// keeping nothing (counts/worker.js). Each count as the page would have sent
// it to GoatCounter itself (its own parameters), held and sent in batches:
// GATHER_MS after the first that waits, once MAX_RELAYED wait, and at once as
// the page is hidden or left. A batch turned down by the network or a busy
// server goes again with the next send, as it was, twice more at most
// (RETRIES). The relay gives up on a server without the path (an older one,
// one without GoatCounter's key, 404) or a batch turned down that often, and
// hands back what never left (`gone`): the page sends it straight again.
// Asked again as each batch goes: nothing goes once the privacy page has been
// used to opt out.

import { COUNTS_ORIGIN } from './counter.ts';

/** Where the counts go round a blocker (vite.config.ts lets the page reach it). */
export const COUNTS_URL = COUNTS_ORIGIN ? `${COUNTS_ORIGIN}/counts` : '';
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

/** A batch on its way: its counts, and how many times it went. */
type Batch = { hits: Hit[]; tries: number };

/**
 * Counts held until they go round the blocker: `allowed` asked again as each
 * batch goes, `post` sending one, `gone` told when the relay gives up, with
 * the counts that never left (the page sends those straight), and again for
 * a batch on its way then that never got past the server.
 */
export class Relay {
  private held: Hit[] = [];
  private turnedDown: Batch[] = [];
  private timer: unknown = null;
  /** Given up: nothing more goes. */
  private off = false;
  private allowed: () => boolean;
  private post: (body: string) => Promise<Posted>;
  private clock: Clock;
  private gone: (back: Hit[]) => void;
  constructor(allowed: () => boolean, post: (body: string) => Promise<Posted>, clock: Clock = pageClock, gone: (back: Hit[]) => void = () => {}) {
    this.allowed = allowed;
    this.post = post;
    this.clock = clock;
    this.gone = gone;
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
    for (let i = 0; i < fresh.length; i += MAX_RELAYED) this.go({ hits: fresh.slice(i, i + MAX_RELAYED), tries: 0 });
  }

  private go(b: Batch) {
    void this.post(relayBody(b.hits)).then((status) => {
      if (this.off) {
        // (Another batch on its way as the relay gave up: one the server hadn't the path for never got past it either.)
        if (status === 404 && this.allowed()) this.gone(b.hits);
        return;
      }
      // No such path: this batch never got past the server, nor did what waits.
      if (status === 404) return this.giveUp([...b.hits, ...this.held]);
      // Taken, or turned down as it is (400, 413): going again changes nothing.
      if (!again(status)) return;
      // Kept to go with the next send, unchanged (never by itself: a busy server isn't asked again at once).
      if (b.tries < RETRIES) {
        if (this.allowed()) this.turnedDown.push({ ...b, tries: b.tries + 1 });
        return;
      }
      // Turned down too often: let go of it (it may have got there, its answer lost), and of the way round.
      this.giveUp([...this.held]);
    });
  }

  private giveUp(back: Hit[]) {
    this.off = true;
    this.drop();
    this.gone(this.allowed() ? back : []);
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
 * Sends a count to GoatCounter as a request that says whether it got there:
 * false when it never left (a blocker turning GoatCounter's address away, or
 * the network failing it), true on any answer at all. Its answer is opaque
 * (no-cors), and a GET has no body, so it outlives a page closing without
 * using up the browser's room for those (keepalive). A beacon never says.
 */
export function arrives(url: string): Promise<boolean> {
  return fetch(url, { mode: 'no-cors', keepalive: true, credentials: 'omit', cache: 'no-store' }).then(
    () => true,
    () => false,
  );
}
