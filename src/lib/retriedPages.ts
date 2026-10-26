// The build's side of lib/chunkRetry.ts, apart from it so vite.config.ts can
// read it without the page's DOM.

/** The pages App loads through `retried` (lib/chunkRetry.ts), as their components, and so the build's chunks, are named. */
export const RETRIED_PAGES = ['Codex', 'Settings'] as const;
export type RetriedPage = (typeof RETRIED_PAGES)[number];

const RETRIED = new RegExp(`^assets/(?:${RETRIED_PAGES.join('|')})-[\\w-]+\\.js$`);

/**
 * What Vite's preload links ahead of a chunk as it imports it: of `deps`, the
 * chunk and the JavaScript it imports (build.modulePreload.resolveDependencies
 * in vite.config.ts; its CSS is linked all the same). For a retried page only
 * the chunk itself, which `retried` finds its address by, and none of its
 * imports: a link that fails leaves its module failed for good, and the
 * chunk with it (lib/chunkRetry.ts, which says why other chunks' links of
 * the same imports are left as they are).
 */
export const preloadedWith = (file: string, deps: string[]) => (RETRIED.test(file) ? deps.filter((d) => d === file) : deps);
