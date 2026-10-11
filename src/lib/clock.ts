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
/** Asked again after this long, as the device's clock may have been set meanwhile. */
export const ASK_AGAIN_MS = 30 * 60_000;

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
  /** Asks the server (once at a time); settles when it has answered or couldn't. */
  sync(): Promise<void>;
  /** Asks again if the last answer is old (settles as sync does; undefined when it isn't old). */
  syncIfOld(): Promise<void> | undefined;
  /** Whether the server has answered, or couldn't. */
  known(): boolean;
  /** Settles once the server has answered or couldn't, or after `ms` at most. */
  ready(ms: number): Promise<void>;
}

export function makeClock(ask: () => Promise<Response>, device: () => number = Date.now): Clock {
  let error = 0;
  let askedAt = -Infinity;
  let asking: Promise<void> | null = null;
  let first: Promise<void> | null = null;
  let known = false;
  const sync = () => {
    if (asking) return asking;
    const sentAt = device();
    askedAt = sentAt;
    // (Asked from a promise, so a request that can't even be made counts as no answer.)
    asking = Promise.resolve()
      .then(ask)
      .then((res) => {
        const server = serverTimeOf(res);
        if (server !== null) error = errorOf(server, sentAt, device());
      })
      .catch(() => {})
      .finally(() => {
        asking = null;
        known = true;
      });
    first ??= asking;
    return asking;
  };
  return {
    now: () => device() + error,
    sync,
    syncIfOld: () => (Math.abs(device() - askedAt) >= ASK_AGAIN_MS ? sync() : undefined),
    known: () => known,
    ready: (ms) => Promise.race([first ?? sync(), new Promise<void>((done) => setTimeout(done, ms))]),
  };
}

/** The site's clock: asks the page's own address, for its headers alone. */
export const clock = makeClock(() => fetch(new URL(import.meta.env.BASE_URL, document.baseURI), { method: 'HEAD', cache: 'no-store' }));
