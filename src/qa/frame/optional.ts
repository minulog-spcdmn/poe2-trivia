// The game's modules a frame can do without. The desk's before and after
// runs this harness against the code before a change too (qaBefore.ts),
// which may not have them yet: found by a glob rather than imported, one that
// tree lacks is simply not there, and the frame starts without it.

const optional = import.meta.glob(['../../lib/backGuard.ts', '../../lib/noMenu.ts', '../../lib/chunkRetry.ts']);

/** Each of them by its path, the glob's key (so a path mistyped in a frame is a type error, not a module quietly left out). */
interface Optional {
  '../../lib/backGuard.ts': typeof import('../../lib/backGuard.ts');
  '../../lib/noMenu.ts': typeof import('../../lib/noMenu.ts');
  '../../lib/chunkRetry.ts': typeof import('../../lib/chunkRetry.ts');
}

/** One of those modules, or undefined where this tree has no such file. */
export const maybe = <P extends keyof Optional>(path: P): Promise<Optional[P] | undefined> =>
  (optional[path]?.() as Promise<Optional[P]> | undefined) ?? Promise.resolve(undefined);
