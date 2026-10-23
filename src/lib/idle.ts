// Running work in an idle moment: requestIdleCallback where the browser has
// it, a timer where it doesn't (Safari). Each caller picks how long the work
// may wait for one, and the timer's delay, to suit what it runs.

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
