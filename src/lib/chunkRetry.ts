// A page's chunk (the codex's, the settings') that can be fetched again after
// it failed, without a reload: a venue's Wi-Fi drops, the player opens the
// page again once it's back, and it comes.
//
// The same import() again would fail again at once: the browser keeps a
// module that failed to fetch in its module map, failed, for as long as the
// document lives (WebKit and Chromium both, measured on an iPhone and on
// Android), and the HTML spec has it so. So it's fetched again under an
// address of its own: the chunk's own, with "?attempt=n" on it. The chunk's
// imports are relative ("./storage-….js"), and resolve against that address
// without its query: to the very modules the page has already, so nothing it
// shares with the rest of the page (the session, the stores) comes twice.
// Only the chunk itself is new, and it never ran under its first address.
//
// That holds only while its imports never failed themselves, as a failed one
// stays failed under its own address, which the chunk can't be made to
// change. So the build doesn't link these chunks' imports ahead of them
// (lib/retriedPages.ts; Vite's preload would, all at once, and with the Wi-Fi
// gone every one of them would fail with the chunk): they're fetched only
// once the chunk itself has come, by the browser. One that fails then, the
// Wi-Fi going in that moment, still needs a reload, which the page offers.
// Other chunks' preloads aren't trimmed, though, and link some of the same
// imports: the game screens' (fetched ahead once the start page has settled,
// always ahead of the codex's own fetch in the background: App.svelte) link the
// codex's ItemDetails and its circles, and the sync dialog's links the
// circles too. An outage that failed those leaves the codex to the reload,
// as it leaves the game. Trimming every other chunk's list of whatever a
// retried page imports isn't worth it: that takes in the start page's circle
// (ArcaneStage, the engraver), which would then come a round trip later.

import type { RetriedPage } from './retriedPages.ts';

/** `url` with the attempt it's fetched for: an address of its own, as the module map and the cache see it. */
export function attemptUrl(url: string, attempt: number) {
  const u = new URL(url);
  u.searchParams.set('attempt', String(attempt));
  return u.href;
}

/** The address in a failed import's message, where the browser names it (Chromium, Firefox; not WebKit). */
export const failedUrl = (e: unknown) => /dynamically imported module: (\S+)/.exec((e as Error | null)?.message ?? '')?.[1] ?? '';

/** Pages a QA desk's frame has lost on purpose (its scene's `lost`). */
const lostOnCue = new Set<RetriedPage>();
/** The QA desk's frames only: every fetch of `page` fails from now on, as with the Wi-Fi gone, so its scene shows what a player gets then. */
export const loseOnCue = (page: RetriedPage) => void lostOnCue.add(page);

/** `old`, a stylesheet that failed to load, linked again for `attempt` in its place (so in its order among the page's sheets). */
function relink(old: HTMLLinkElement, attempt: number) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.crossOrigin = old.crossOrigin;
  link.href = attemptUrl(old.href, attempt);
  return new Promise<HTMLLinkElement>((resolve, reject) => {
    link.addEventListener('load', () => {
      old.remove();
      resolve(link);
    });
    link.addEventListener('error', () => {
      link.remove();
      reject(new Error(`Unable to load CSS ${link.href}`));
    });
    old.after(link);
  });
}

/**
 * A page's chunk, loaded by `load` (its `import()`, which Vite's preload wraps
 * in the build) the first time it's asked for, and kept once it has come.
 * One that failed (`failed` hears each time) is fetched again the next time
 * it's asked for, under an address of its own (above), its stylesheets that
 * failed with it too. `page` is its name, as RETRIED_PAGES has it.
 *
 * Its address is the one Vite's preload links ahead of it (lib/retriedPages.ts),
 * as `load` adds it to the page; or, where nothing was linked (the dev
 * server), the one the browser's error names. With neither, `load` is all
 * there is to try again.
 */
export function retried<T>(load: () => Promise<T>, failed: (e: unknown) => void = () => {}, page?: RetriedPage): () => Promise<T> {
  let loading: Promise<T> | null = null;
  let tries = 0;
  let url = '';
  const sheets: HTMLLinkElement[] = [];
  // The sheets that failed, as their own error events tell: not by their
  // `sheet`, which a failed one has all the same (Chromium and WebKit give
  // it an empty one).
  const lost = new WeakSet<HTMLLinkElement>();
  const first = () => {
    // Vite's preload links the chunk and its stylesheets as it's called, before it waits for anything.
    const before = new Set(document.head.querySelectorAll('link'));
    const loaded = load();
    const added = [...document.head.querySelectorAll('link')].filter((l) => !before.has(l));
    // (Called again, it links nothing: Vite's preload remembers what it linked.)
    url ||= added.find((l) => l.rel === 'modulepreload')?.href ?? '';
    // (In time to hear one fail: a link's load and error come as tasks of their own, after this.)
    for (const l of added) {
      if (l.rel !== 'stylesheet') continue;
      sheets.push(l);
      l.addEventListener('error', () => lost.add(l), { once: true });
    }
    return loaded;
  };
  const again = async (attempt: number) => {
    // Its styles first, as Vite's preload has them, so the page never shows
    // without them; a sheet that came is kept, whether or not the rest do.
    // (One linked again that fails is left out of the page, its old one kept
    // there, still lost; one that comes takes the old one's place.)
    await Promise.all(
      sheets.map(async (s, i) => {
        if (lost.has(s)) sheets[i] = await relink(s, attempt);
      }),
    );
    return (await import(/* @vite-ignore */ attemptUrl(url, attempt))) as T;
  };
  const fetched = () => {
    // (Lost on cue: it fails as WebKit's import says it, naming no address, and nothing is fetched.)
    if (page && lostOnCue.has(page)) return Promise.reject(new TypeError('Importing a module script failed.'));
    return tries++ === 0 || !url ? first() : again(tries - 1);
  };
  return () =>
    (loading ??= fetched().catch((e) => {
      url ||= failedUrl(e);
      loading = null;
      failed(e);
      throw e;
    }));
}
