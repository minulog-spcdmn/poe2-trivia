// Running work in an idle moment: requestIdleCallback where the browser has
// it, a timer where it doesn't (Safari). Each caller picks how long the work
// may wait for one, and the timer's delay, to suit what it runs. And in a
// calm one, clear of what a tap sets off (whenCalm).

/** What requestIdleCallback hands the work: how long the moment has left. */
export type Deadline = { timeRemaining(): number };

type Ric = (f: (deadline: Deadline) => void, o?: { timeout: number }) => number;

/**
 * Runs `f` when the page is idle, given the moment's deadline (none when it
 * runs on the timer). `timeout` bounds the wait (unbounded if left out);
 * `fallback` is the timer's delay where there's no requestIdleCallback.
 * Returns a function that cancels it.
 */
export function whenIdle(f: (deadline?: Deadline) => void, { timeout, fallback = 50 }: { timeout?: number; fallback?: number } = {}): () => void {
  const g = globalThis as { requestIdleCallback?: Ric; cancelIdleCallback?: (id: number) => void };
  if (typeof g.requestIdleCallback === 'function') {
    const id = g.requestIdleCallback(f, timeout === undefined ? undefined : { timeout });
    return () => g.cancelIdleCallback?.(id);
  }
  const id = setTimeout(f, fallback);
  return () => clearTimeout(id);
}

/**
 * How long after a tap, a click or a key the page counts as calm again
 * (ms). What one sets off plays out over about this long (a screen coming in,
 * its effects, the next screen's styles worked out): on an iPhone a task of
 * a dozen ms landing in it held one of its frames, where none would show a
 * moment later.
 */
export const CALM_MS = 800;
/** The longest work waits for calm, however often the page is tapped meanwhile (ms). */
export const CALM_AT_MOST = 10_000;

/** Work waiting for calm, each with when it was asked for (Date.now()). */
const forCalm: { f: () => void; at: number }[] = [];
/** When the page was last tapped or typed at (Date.now()). */
let lastInput = -Infinity;
let calmTimer: ReturnType<typeof setTimeout> | null = null;
let listening = false;
/** The work running in a calm moment, now: what it asks for in turn follows on in the moment it found. */
let running: { at: number } | null = null;

type Target = { addEventListener(type: string, f: () => void, o?: { capture?: boolean; passive?: boolean }): void };

/** Runs what waits, all of it, now: the page is going away, and may not get another chance. */
function runCalmNow() {
  if (calmTimer) clearTimeout(calmTimer);
  calmTimer = null;
  // (What they ask for in turn too.)
  while (forCalm.length) runOne(forCalm.shift()!.f);
}

function runOne(f: () => void) {
  try {
    f();
  } catch (err) {
    console.warn(err);
  }
}

/** Starts telling a tap or a key, and the page going away, once there is work waiting for calm. */
function listen() {
  if (listening) return;
  listening = true;
  const g = globalThis as Partial<Target> & { document?: Target & { visibilityState?: string } };
  const input = () => void (lastInput = Date.now());
  for (const type of ['pointerdown', 'keydown']) g.addEventListener?.(type, input, { capture: true, passive: true });
  g.addEventListener?.('pagehide', runCalmNow);
  g.document?.addEventListener('visibilitychange', () => g.document?.visibilityState === 'hidden' && runCalmNow());
}

/** When the first that waits may run (Date.now()): calm, or waiting as long as it may. */
const calmDue = (w: { at: number }) => Math.min(Math.max(lastInput, w.at) + CALM_MS, w.at + CALM_AT_MOST);

/** Waits for the next calm moment, then runs the first that waits for it; the next in a task of its own. */
function armCalm() {
  if (calmTimer || !forCalm.length) return;
  calmTimer = setTimeout(
    () => {
      calmTimer = null;
      // Tapped again meanwhile: calm comes later.
      if (forCalm.length && Date.now() < calmDue(forCalm[0])) return armCalm();
      const w = forCalm.shift();
      if (w) {
        running = w;
        runOne(w.f);
        running = null;
      }
      // (Two together would make one task as long as both.)
      armCalm();
    },
    Math.max(0, calmDue(forCalm[0]) - Date.now()),
  );
}

/**
 * Runs `f` once the page is calm: CALM_MS on from the last tap or key, or
 * from now if that's later (asked for as the game moves on, a reveal coming
 * in, it has its own frames to play out), and CALM_AT_MOST from now at the
 * longest. So the bookkeeping a tap or a reveal brings about (an answer
 * written to the codex, the achievements checked) never lands among the
 * frames of what they set off. Each runs in a task of its own, in the order
 * asked for; what one asks for as it runs follows it in the same calm, and
 * the page going away runs them all at once.
 */
export function whenCalm(f: () => void) {
  listen();
  forCalm.push({ f, at: running?.at ?? Date.now() });
  armCalm();
}

/** Work done a step at a time (stepwise). */
export type Stepwise<T, S> = {
  /** What it makes: what's left of it done at once, if it isn't made yet. */
  now(): T;
  /** Its steps, a few ms each, for idle moments: each goes on from where the last one, here or in `now`, left it. */
  steps(): Generator<S>;
};

/**
 * Work that can be done a step at a time in idle moments, or all at once by
 * whatever needs it first, the same work either way: `make`'s generator,
 * made once. Should it throw, or what it made turn out `stale` (its WebGL
 * context lost, say), it's started over when next wanted.
 */
export function stepwise<T, S = void>(make: () => Generator<S, T>, stale?: (made: T) => boolean): Stepwise<T, S> {
  let made: { value: T } | null = null;
  let making: Generator<S, T> | null = null;
  const step = (): IteratorResult<S, T> => {
    if (made && stale?.(made.value)) made = null;
    making ??= make();
    try {
      const r = making.next();
      if (r.done) {
        made = { value: r.value };
        making = null;
      }
      return r;
    } catch (e) {
      making = null;
      throw e;
    }
  };
  const fresh = () => !!made && !stale?.(made.value);
  return {
    now() {
      if (fresh()) return made!.value;
      for (;;) {
        const r = step();
        if (r.done) return r.value;
      }
    },
    *steps() {
      while (!fresh()) {
        const r = step();
        if (r.done) return;
        yield r.value;
      }
    },
  };
}
