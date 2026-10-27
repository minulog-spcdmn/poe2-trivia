// The game's modules a frame can do without. The desk's before and after
// runs this harness against the code before a change too (qaBefore.ts),
// which may not have them yet: found by a glob rather than imported, one that
// tree lacks is simply not there, and the frame starts without it.

const optional = import.meta.glob(['../../lib/backGuard.ts', '../../lib/noMenu.ts', '../../lib/chunkRetry.ts']);

/** One of those modules, or undefined where this tree has no such file. */
export const maybe = <T>(path: string): Promise<T | undefined> => (optional[path]?.() as Promise<T> | undefined) ?? Promise.resolve(undefined);
