import './asVite.ts';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Whether a stylesheet linked from now on comes. */
const network = { up: true };

/** A <link> as far as lib/chunkRetry.ts and Vite's preload use one. */
class FakeLink {
  rel = '';
  href = '';
  crossOrigin: string | null = null;
  sheet: object | null = null;
  on: Record<string, () => void> = {};
  addEventListener(type: string, f: () => void) {
    this.on[type] = f;
  }
  /** Linked in after this one: it loads, or fails, as the network is a moment later. */
  after(link: FakeLink) {
    links.splice(links.indexOf(this) + 1, 0, link);
    setTimeout(() => {
      if (network.up) link.sheet = {};
      link.on[network.up ? 'load' : 'error']?.();
    });
  }
  remove() {
    links.splice(links.indexOf(this), 1);
    this.sheet = null;
  }
}
const links: FakeLink[] = [];
(globalThis as Record<string, unknown>).document = { head: { querySelectorAll: () => [...links] }, createElement: () => new FakeLink() };

const { retried, attemptUrl, failedUrl } = await import('../src/lib/chunkRetry.ts');
const { RETRIED_PAGES, preloadedWith } = await import('../src/lib/retriedPages.ts');

// A built page's chunk and a chunk the page has already, which it imports as
// the build's chunks import each other: relatively. Each counts its runs.
const dir = mkdtempSync(join(tmpdir(), 'chunk-retry-'));
after(() => rmSync(dir, { recursive: true, force: true }));
writeFileSync(join(dir, 'shared.js'), 'globalThis.sharedRuns = (globalThis.sharedRuns ?? 0) + 1;\nexport const store = {};\n');
const page = (name: string) => {
  writeFileSync(join(dir, name), `import { store } from './shared.js';\nexport { store };\nexport const url = import.meta.url;\nexport default '${name}';\n`);
  return pathToFileURL(join(dir, name)).href;
};
const shared = pathToFileURL(join(dir, 'shared.js')).href;
type Page = { default: string; store: object; url: string };

/**
 * Vite's preload of `chunk` as the build has it (lib/retriedPages.ts): the
 * chunk linked ahead and its stylesheets, those in `came` loaded, then the
 * import, which fails where the network is down.
 */
function vitePreload(chunk: string, sheets: string[], came: string[] = []) {
  let calls = 0;
  const load = () => {
    calls++;
    for (const [rel, href] of [['modulepreload', chunk], ...sheets.map((s) => ['stylesheet', s])]) {
      const link = new FakeLink();
      Object.assign(link, { rel, href, crossOrigin: '', sheet: came.includes(href) ? {} : null });
      links.push(link);
    }
    return network.up ? (import(chunk) as Promise<Page>) : Promise.reject(new TypeError('Importing a module script failed.'));
  };
  return { load, calls: () => calls };
}

test('a page that failed is fetched again under an address of its own, and its imports are the page’s own', async () => {
  links.length = 0;
  const { store } = (await import(shared)) as { store: object };
  const url = page('codex.js');
  const fails: unknown[] = [];
  const vite = vitePreload(url, ['https://poe2.quest/assets/Codex.css', 'https://poe2.quest/assets/ownCursor.css'], ['https://poe2.quest/assets/ownCursor.css']);
  const get = retried(vite.load, (e) => fails.push(e));

  network.up = false;
  await assert.rejects(get(), /Importing a module script failed/);
  assert.equal(fails.length, 1, 'counted');

  network.up = true;
  const got = (await get()) as Page;
  assert.equal(got.default, 'codex.js');
  assert.equal(got.url, `${url}?attempt=1`);
  assert.equal(got.store, store, 'the module the page has, not a copy');
  assert.equal((globalThis as { sharedRuns?: number }).sharedRuns, 1);
  assert.equal(vite.calls(), 1, 'never the same failed import again');
  // The sheet that failed linked again in its place; the one that came left as it was.
  assert.deepEqual(
    links.map((l) => [l.rel, l.href]),
    [
      ['modulepreload', url],
      ['stylesheet', 'https://poe2.quest/assets/Codex.css?attempt=1'],
      ['stylesheet', 'https://poe2.quest/assets/ownCursor.css'],
    ],
  );
  assert.equal(await get(), got, 'kept once it has come');
  assert.equal(fails.length, 1);
});

test('a try that fails too leaves the page lost, and the next is under a fresh address again', async () => {
  links.length = 0;
  const url = pathToFileURL(join(dir, 'settings.js')).href;
  const fails: unknown[] = [];
  const vite = vitePreload(url, ['https://poe2.quest/assets/Settings.css']);
  const get = retried(vite.load, (e) => fails.push(e));

  network.up = false;
  await assert.rejects(get());
  // Still down: its sheet fails again, and nothing it tried is left linked.
  await assert.rejects(get(), /Unable to load CSS/);
  assert.deepEqual(
    links.map((l) => l.href),
    [url, 'https://poe2.quest/assets/Settings.css'],
  );

  // Its sheet comes, but the chunk itself doesn't (not there yet: as a fetch that failed).
  network.up = true;
  await assert.rejects(get(), /Cannot find module|ERR_MODULE_NOT_FOUND/);
  page('settings.js');
  const got = (await get()) as Page;
  assert.equal(got.url, `${url}?attempt=3`);
  assert.equal(fails.length, 3);
  assert.equal(vite.calls(), 1);
  assert.deepEqual(
    links.map((l) => l.href),
    [url, 'https://poe2.quest/assets/Settings.css?attempt=2'],
    'its sheet linked once, by the try it came for',
  );
});

test('where nothing was linked ahead (the dev server), the address the error names; with none, the same import again', async () => {
  links.length = 0;
  const url = page('dev.js');
  let calls = 0;
  const named = retried(() => (calls++, Promise.reject(new TypeError(`Failed to fetch dynamically imported module: ${url}`))));
  await assert.rejects(named());
  assert.equal(((await named()) as Page).url, `${url}?attempt=1`);
  assert.equal(calls, 1);

  let tries = 0;
  const unnamed = retried(() => (tries++, tries < 3 ? Promise.reject(new TypeError('Importing a module script failed.')) : Promise.resolve('came')));
  await assert.rejects(unnamed());
  await assert.rejects(unnamed());
  assert.equal(await unnamed(), 'came');
  assert.equal(tries, 3);
});

test('an attempt’s address, and the address a failed import’s message names', () => {
  assert.equal(attemptUrl('https://poe2.quest/beta/assets/Codex-Datai16G.js', 2), 'https://poe2.quest/beta/assets/Codex-Datai16G.js?attempt=2');
  assert.equal(attemptUrl('https://poe2.quest/assets/Codex.css?attempt=1', 2), 'https://poe2.quest/assets/Codex.css?attempt=2');
  assert.equal(failedUrl(new TypeError('Failed to fetch dynamically imported module: https://poe2.quest/assets/Codex-X.js')), 'https://poe2.quest/assets/Codex-X.js');
  assert.equal(failedUrl(new TypeError('error loading dynamically imported module: https://poe2.quest/assets/Codex-X.js')), 'https://poe2.quest/assets/Codex-X.js');
  assert.equal(failedUrl(new TypeError('Importing a module script failed.')), '');
  assert.equal(failedUrl(null), '');
});

test('the build links a retried page’s chunk ahead without its imports, and every other chunk with them', () => {
  const deps = (file: string) => [file, 'assets/CodexItem-CBBsC_dS.js', 'assets/link.svelte-DRdi1eiT.js'];
  assert.deepEqual(preloadedWith('assets/Codex-Datai16G.js', deps('assets/Codex-Datai16G.js')), ['assets/Codex-Datai16G.js']);
  assert.deepEqual(preloadedWith('assets/Settings-Dm-H5n_w.js', deps('assets/Settings-Dm-H5n_w.js')), ['assets/Settings-Dm-H5n_w.js']);
  for (const file of ['assets/Game-DaQAwEww.js', 'assets/CodexItem-CBBsC_dS.js', 'assets/codex-CqmmnLIv.js', 'assets/main-BR9ZxPfs.js']) {
    assert.deepEqual(preloadedWith(file, deps(file)), deps(file), file);
  }
});

test('App loads the retried pages through retried, and only so; the build links them as retriedPages says', () => {
  const app = readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8');
  const through = [...app.matchAll(/retried\(\(\) => import\('\.\/components\/(\w+)\.svelte'\)/g)].map((m) => m[1]);
  assert.deepEqual(through.toSorted(), RETRIED_PAGES.toSorted());
  for (const name of RETRIED_PAGES) {
    const imports = [...app.matchAll(new RegExp(`(?<!typeof |retried\\(\\(\\) => )import\\('\\./components/${name}\\.svelte'\\)`, 'g'))];
    assert.equal(imports.length, 0, `${name} imported past retried, which a failure would leave failed`);
  }
  assert.match(readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8'), /modulePreload: \{ resolveDependencies: preloadedWith \}/);
});
