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
