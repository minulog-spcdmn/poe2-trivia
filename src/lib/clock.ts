// The time by the site's own server where it can say, so a device whose
// clock is wrong (set by hand, or to the wrong zone) still meets the day
// everyone else does in Today's unique. Every reply from the site carries
// the server's time (its Date header): one request without a body, never
// from the browser's cache, gives the device clock's error, and the time is
// the device's own clock plus it. Without a reply (offline, blocked, a
// login page in the way) the device's clock stands, so this mends a wrong
// clock but doesn't stop a player set on moving theirs.
// (A service worker added one day must let this request through.)

/** A device clock this close to the server's is left as it is: the reply's whole seconds and the way there and back are noise. */
export const CLOSE_ENOUGH_MS = 60_000;
/** A request with no reply by then counts as none. */
export const GIVE_UP_MS = 5000;
/** After no reply, asked again no sooner than this. */
export const RETRY_MS = 60_000;

/** The server's time a reply says: only a plain one from the site itself (not a redirect to a login page, not an error). */
export function serverTimeOf(res: Response): number | null {
  if (!res.ok || res.redirected) return null;
  const t = Date.parse(res.headers.get('date') ?? '');
  return Number.isFinite(t) ? t : null;
}

/**
 * The device clock's error, from the server's time and when the request
 * went and came back by the device: the server's moment taken halfway, and
 * the middle of its whole second. 0 when the clocks are close enough.
 */
export function errorOf(server: number, sentAt: number, gotAt: number): number {
  const off = server + 500 - (sentAt + gotAt) / 2;
  return Math.abs(off) < CLOSE_ENOUGH_MS ? 0 : Math.round(off);
}

export interface Clock {
  /** The time now, as the server has it (the device's own until it has said). */
  now(): number;
  /** Asks the server (once at a time); settles when it has answered, couldn't, or gave up. */
  sync(): Promise<void>;
  /**
   * Asks again when it is worth it: never asked yet, the last ask had no
   * reply (a minute on), or the device's clock has jumped since the server
   * answered (set by hand, or the device slept). Undefined when not.
   */
  refresh(): Promise<void> | undefined;
  /** Whether an ask has settled, answered or not. */
  known(): boolean;
  /** Whether the server has answered: the day is its day. */
  trusted(): boolean;
  /** Settles once the first ask has, or after `ms` at most. */
  ready(ms: number): Promise<void>;
}

/**
 * A clock asking `ask` for the server's time. `device` is the device's
 * clock, which may be set; `steady` a clock that only runs on (the page's
 * own, performance.now): the two drifting apart says the device's was set,
 * or the device slept.
 */
export function makeClock(
  ask: (signal: AbortSignal) => Promise<Response>,
  device: () => number = Date.now,
  steady: () => number = () => performance.now(),
): Clock {
  let error = 0;
  /** When the server last answered, by both clocks (null before it has). */
  let answered: { wall: number; steady: number } | null = null;
  let triedAt = -Infinity;
  let asking: Promise<void> | null = null;
  let first: Promise<void> | null = null;
  let known = false;
  const jumped = () => !!answered && Math.abs(device() - answered.wall - (steady() - answered.steady)) >= CLOSE_ENOUGH_MS;
  const sync = () => {
    if (asking) return asking;
    triedAt = steady();
    const sentAt = device();
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), GIVE_UP_MS);
    // (Asked from a promise, so a request that can't even be made counts as no answer.)
    asking = Promise.resolve()
      .then(() => ask(stop.signal))
      .then((res) => {
        const server = serverTimeOf(res);
        if (server === null) return;
        const gotAt = device();
        error = errorOf(server, sentAt, gotAt);
        answered = { wall: gotAt, steady: steady() };
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        asking = null;
        known = true;
      });
    first ??= asking;
    return asking;
  };
  return {
    now: () => device() + error,
    sync,
    refresh: () => {
      if (asking) return asking;
      if (answered ? jumped() : steady() - triedAt >= RETRY_MS) return sync();
      return undefined;
    },
    known: () => known,
    trusted: () => !!answered,
    ready: (ms) => Promise.race([first ?? sync(), new Promise<void>((done) => setTimeout(done, ms))]),
  };
}

/** The site's clock: asks the page's own address, for its headers alone. */
export const clock = makeClock((signal) => fetch(new URL(import.meta.env.BASE_URL, document.baseURI), { method: 'HEAD', cache: 'no-store', signal }));
