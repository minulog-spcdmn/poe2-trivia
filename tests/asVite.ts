// Lets a test import the app's modules as Vite serves them. Imported first, it
// - finds a module named without its extension ('./toasts.svelte', './game');
// - fills in import.meta.env: a build of the live game, or the channel named
//   in this process's VITE_CHANNEL (a test runs another channel's build in a
//   process of its own);
// - takes the types out of the app's TypeScript, constructor parameter
//   fields too (which Node's own stripping refuses), and compiles the rune
//   modules (*.svelte.ts) with Svelte's compiler;
// - reads the app's JSON imported as Vite takes it, without `with { type: 'json' }`;
// - loads a page afresh: a module of the app's imported with `?page=<name>`
//   gets every module of the app's it imports as that page's own, so a test
//   can play two pages (a tab killed and the one brought back) one after the
//   other, each with nothing of the other's in memory;
// - hands a module named in `fakes` (as `fakeModule` sets it) the test's own
//   in its place, as for PeerJS.
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { compileModule } from 'svelte/compiler';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const env = JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/', ...(process.env.VITE_CHANNEL ? { VITE_CHANNEL: process.env.VITE_CHANNEL } : {}) });
const fakes = new Map<string, string>();

/** From now on `specifier` (a package, as the app imports it) loads the module at `url` instead. */
export const fakeModule = (specifier: string, url: URL) => void fakes.set(specifier, url.href);

/** Where the app's own modules are (a package's own src/ is not one of them). */
const APP = new URL('../src/', import.meta.url).href;
/** The page a module of the app's was loaded for (its `?page=<name>`), or ''. */
const pageOf = (url: string | undefined) => (url?.startsWith(APP) && url.match(/\?page=[^&#]*/)?.[0]) || '';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fake = fakes.get(specifier);
    if (fake) return { url: fake, shortCircuit: true };
    let resolved;
    try {
      resolved = nextResolve(specifier, context);
    } catch (err) {
      if (!specifier.startsWith('.') || (err as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw err;
      resolved = nextResolve(`${specifier}.ts`, context);
    }
    const page = pageOf(context.parentURL);
    if (!page || !resolved.url.startsWith(APP) || resolved.url.includes('?')) return resolved;
    return { ...resolved, url: resolved.url + page };
  },
  load(url, context, nextLoad) {
    const path = url.replace(/[?#].*$/, '');
    if (path.startsWith(APP) && path.endsWith('.json') && !context.importAttributes?.type)
      return { format: 'module', source: `export default ${readFileSync(fileURLToPath(path), 'utf8')}`, shortCircuit: true };
    const loaded = nextLoad(url, context);
    if (!path.includes('/src/') || !/\.(svelte\.)?ts$/.test(path)) return loaded;
    // channel.ts reads it typed, as `(import.meta as …).env`.
    const source = String(loaded.source).replace(/\(import\.meta as [^)]*\)\.env|import\.meta\.env/g, `(${env})`);
    // Transformed, not only stripped: some classes declare fields in their constructor's parameters.
    const js = stripTypeScriptTypes(source, { mode: 'transform' });
    if (!path.endsWith('.svelte.ts')) return { format: 'module', source: js, shortCircuit: true };
    const { code } = compileModule(js, { filename: fileURLToPath(path), generate: 'client' }).js;
    return { format: 'module', source: code, shortCircuit: true };
  },
});
