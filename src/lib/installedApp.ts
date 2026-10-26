/**
 * Running as an iPhone's or iPad's home-screen app (iOS says so with
 * navigator.standalone). Its storage is apart from Safari's, and a link to a
 * tab of its own leaves the app for a Safari sheet. An installed app elsewhere
 * (Android's, a desktop's) shares its browser's storage, so it needs nothing
 * of this. Chrome's tab on an iPhone (a WKWebView) says navigator.standalone
 * too, and takes the app's path harmlessly: the privacy page opens over the
 * game (legalSheet.svelte.ts), and viewport.ts sizes the screen's height to
 * at least its large viewport, toolbars gone.
 */
export const installedApp = (nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean =>
  (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
