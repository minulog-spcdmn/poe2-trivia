// Lets a test import the app's modules as Vite serves them. Imported first, it
// - finds a module named without its extension ('./toasts.svelte', './game');
// - fills in import.meta.env: a build of the live game, or the channel named
//   in this process's VITE_CHANNEL (a test runs another channel's build in a
//   process of its own);
// - takes the types out of the app's TypeScript, constructor parameter
//   fields too (which Node's own stripping refuses), and compiles the rune
//   modules (*.svelte.ts) with Svelte's compiler;
// - hands a module named in `fakes` (as `fakeModule` sets it) the test's own
//   in its place, as for PeerJS.
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { compileModule } from 'svelte/compiler';
import { fileURLToPath } from 'node:url';

const env = JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/', ...(process.env.VITE_CHANNEL ? { VITE_CHANNEL: process.env.VITE_CHANNEL } : {}) });
const fakes = new Map<string, string>();

/** From now on `specifier` (a package, as the app imports it) loads the module at `url` instead. */
export const fakeModule = (specifier: string, url: URL) => void fakes.set(specifier, url.href);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fake = fakes.get(specifier);
    if (fake) return { url: fake, shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (!specifier.startsWith('.') || (err as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw err;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.includes('/src/') || !/\.(svelte\.)?ts$/.test(url)) return loaded;
    // channel.ts reads it typed, as `(import.meta as …).env`.
    const source = String(loaded.source).replace(/\(import\.meta as [^)]*\)\.env|import\.meta\.env/g, `(${env})`);
    // Transformed, not only stripped: some classes declare fields in their constructor's parameters.
    const js = stripTypeScriptTypes(source, { mode: 'transform' });
    if (!url.endsWith('.svelte.ts')) return { format: 'module', source: js, shortCircuit: true };
    const { code } = compileModule(js, { filename: fileURLToPath(url), generate: 'client' }).js;
    return { format: 'module', source: code, shortCircuit: true };
  },
});
