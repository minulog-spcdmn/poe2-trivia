import { readFileSync } from 'node:fs';
import { minify, transformWithOxc, type Plugin } from 'vite';

/**
 * The built-ins an older browser lacks (src/lib/polyfills.ts), compiled and
 * minified into one inline script, once a run (a change to it needs the dev
 * server restarted). An import would come too late: a page's entry runs the
 * shared chunks it imports before its own code. Wrapped, so it leaves no
 * names behind. tests/polyfills.test.ts runs what this makes.
 */
let compiled: Promise<string> | undefined;
export const polyfillsScript = () =>
  (compiled ??= transformWithOxc(readFileSync(new URL('./src/lib/polyfills.ts', import.meta.url), 'utf8'), 'polyfills.ts', { lang: 'ts' })
    .then(({ code }) => minify('polyfills.js', `(() => {${code}})();`, { compress: true, mangle: true }))
    .then(({ code }) => code.trim()));

/**
 * Puts that script first on every page that runs the game's code (vite.config.ts;
 * its CSP lets it run by its hash). Run as the page is read, it's in place
 * before any module, which runs only once the page has been read.
 */
export function polyfillsFirst(): Plugin {
  return {
    name: 'polyfills-first',
    transformIndexHtml: async (html) => (html.includes('type="module"') ? [{ tag: 'script', children: await polyfillsScript(), injectTo: 'head' }] : undefined),
  };
}
