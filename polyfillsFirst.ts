import { readFileSync } from 'node:fs';
import { minify, transformWithOxc, type Plugin } from 'vite';

/**
 * The errors from before any module runs, kept to be counted
 * (src/lib/errorsFirst.ts), and the built-ins an older browser lacks
 * (src/lib/polyfills.ts), compiled and minified into one inline script, once
 * a run (a change to them needs the dev server restarted). An import would
 * come too late: a page's entry runs the shared chunks it imports before its
 * own code. Each wrapped, so it leaves no names behind (but the one the
 * errors are taken by). tests/polyfills.test.ts and tests/errorsFirst.test.ts
 * run what this makes.
 */
let compiled: Promise<string> | undefined;
const compile = (name: string) =>
  transformWithOxc(readFileSync(new URL(`./src/lib/${name}`, import.meta.url), 'utf8'), name, { lang: 'ts' }).then(({ code }) => `(() => {${code}})();`);
export const polyfillsScript = () =>
  (compiled ??= Promise.all([compile('errorsFirst.ts'), compile('polyfills.ts')])
    .then((parts) => minify('first.js', parts.join('\n'), { compress: true, mangle: true }))
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
