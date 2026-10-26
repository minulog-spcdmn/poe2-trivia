// The errors thrown or rejected before any of the game's modules has run,
// kept for count.ts countScriptErrors to count ("error/script"). A module's
// imports run before its own code, so the startup script's shared chunks
// (the session, the effects, the sounds) run before main.ts's first line,
// lib/countErrors.ts with it: a throw at the top of one of them (Session's
// constructor, an API an older WebKit lacks) leaves the page blank, and
// would go uncounted. Built into the inline script at the top of every page
// with the game's code, with the built-ins (polyfillsFirst.ts), so it
// imports and exports nothing. It keeps a few at most: a page that never
// takes them (the stats page, a dev page) holds no more than that.

if (typeof addEventListener === 'function') {
  const kept: Event[] = [];
  const keep = (e: Event) => void (kept.length < 10 && kept.push(e));
  addEventListener('error', keep);
  addEventListener('unhandledrejection', keep);
  /** Stops keeping them, and gives those kept so far. */
  (globalThis as { __errorsFirst?: () => Event[] }).__errorsFirst = () => {
    removeEventListener('error', keep);
    removeEventListener('unhandledrejection', keep);
    return kept;
  };
}
