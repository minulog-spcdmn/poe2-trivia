/**
 * Running as an iPhone's or iPad's home-screen app. Its storage is apart from
 * Safari's, and a link to a tab of its own leaves the app for a Safari sheet.
 * An installed app elsewhere (Android's, a desktop's) shares its browser's
 * storage, so it needs nothing of this.
 *
 * navigator.standalone alone doesn't say so: every WKWebView has it true, and
 * on iOS that is every other browser's tab (Chrome's among them) and every
 * app's view of a page. Taken for the home-screen app, Chrome's tab had its
 * screen's height measured (viewport.ts), so the backdrop ended at the
 * viewport's bottom edge, where a scroll the page drove itself (the iPhone
 * bench's) had WebKit repaint the row of codex tiles across it every frame
 * (49 fps against 60), and short of the bottom once Chrome's toolbars slid
 * away. What only the home-screen app has as well
 * is a display mode of its own, from the manifest (a tab's is browser).
 */
export const installedApp = (
  nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator,
  matches: (query: string) => boolean = (q) => typeof matchMedia !== 'undefined' && matchMedia(q).matches,
): boolean =>
  (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true &&
  ['fullscreen', 'standalone', 'minimal-ui'].some((m) => matches(`(display-mode: ${m})`));
