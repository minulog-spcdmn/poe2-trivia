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
/**
 * For a count to the second (`exact`), a device clock this close is left as
 * it is: the reply's whole seconds can't say better. And set by this much
 * since the server answered (by hand, by the system mending it, or the device
 * slept), it's asked again before such a count (`refresh`).
 */
export const WITHIN_A_SECOND_MS = 1000;
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
  const off = offsetOf(server, sentAt, gotAt);
  return Math.abs(off) < CLOSE_ENOUGH_MS ? 0 : off;
}

/** The device clock's error however small, as near as the reply can say (half a second or so): `errorOf` before it's let be. */
export function offsetOf(server: number, sentAt: number, gotAt: number): number {
  return Math.round(server + 500 - (sentAt + gotAt) / 2);
}

export interface Clock {
  /** The time now, as the server has it (the device's own until it has said). */
  now(): number;
  /**
   * The time now to the second, as the server has it (the device's own until
   * it has said), a device clock under a minute out mended too, to within a
   * second: for a count down to the second (LaunchCountdown), where `now`
   * would be that far out.
   */
  exact(): number;
  /** Asks the server (once at a time); settles when it has answered, couldn't, or gave up. */
  sync(): Promise<void>;
  /**
   * Asks again when it is worth it: never asked yet or the last ask had no
   * reply (a minute on), or the device's clock has been set by `within` or
   * more since the server answered (by hand, by the system, or the device
   * slept): a minute for the day (`now`), WITHIN_A_SECOND_MS for a count to
   * the second (`exact`). Undefined when not.
   */
  refresh(within?: number): Promise<void> | undefined;
  /** Whether an ask has settled, answered or not. */
  known(): boolean;
  /** Whether the server has answered: the day is its day. */
  trusted(): boolean;
  /** Whether the server's time holds now: it has answered, and the device's clock hasn't jumped since (else it is asked again first, refresh). */
  sure(): boolean;
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
  /** The error to the second (offsetOf, left at 0 within one), for `exact`. */
  let fine = 0;
  /** When the server last answered, by both clocks (null before it has). */
  let answered: { wall: number; steady: number } | null = null;
  let triedAt = -Infinity;
  /** Whether the last ask had an answer. */
  let replied = false;
  let asking: Promise<void> | null = null;
  let first: Promise<void> | null = null;
  let known = false;
  /** How far the device's clock has been set since the server answered. */
  const moved = () => (answered ? Math.abs(device() - answered.wall - (steady() - answered.steady)) : 0);
  const jumped = () => moved() >= CLOSE_ENOUGH_MS;
  const sync = () => {
    if (asking) return asking;
    triedAt = steady();
    replied = false;
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
        const off = offsetOf(server, sentAt, gotAt);
        error = Math.abs(off) < CLOSE_ENOUGH_MS ? 0 : off;
        fine =Math.abs(off) < WITHIN_A_SECOND_MS ? 0 : off;
        answered = { wall: gotAt, steady: steady() };
        replied = true;
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
    exact: () => device() + fine,
    sync,
    refresh: (within = CLOSE_ENOUGH_MS) => {
      if (asking) return asking;
      if (replied ? moved() >= within : steady() - triedAt >= RETRY_MS) return sync();
      return undefined;
    },
    known: () => known,
    trusted: () => !!answered,
    sure: () => !!answered && !jumped(),
    ready: (ms) => Promise.race([first ?? sync(), new Promise<void>((done) => setTimeout(done, ms))]),
  };
}

/** The site's clock: asks the page's own address, for its headers alone. */
export const clock = makeClock((signal) => fetch(new URL(import.meta.env.BASE_URL, document.baseURI), { method: 'HEAD', cache: 'no-store', signal }));
