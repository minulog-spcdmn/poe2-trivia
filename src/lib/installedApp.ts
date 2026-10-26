/**
 * Running as an iPhone's or iPad's home-screen app. Its storage is apart from
 * Safari's, and a link to a tab of its own leaves the app for a Safari sheet.
 * An installed app elsewhere (Android's, a desktop's) shares its browser's
 * storage, so it needs nothing of this.
 *
 * navigator.standalone alone doesn't say so: Chrome's tab on an iPhone (a
 * WKWebView, as every browser's there is) has it true as well, and it answers
 * (display-mode: fullscreen) as the app does, so the manifest's display mode
 * can't tell them apart either. Taken for the home-screen app, Chrome's tab
 * had its screen's height measured (viewport.ts), so the backdrop ended at
 * the viewport's bottom edge, where a scroll the page drove itself (the
 * iPhone bench's) had WebKit repaint the row of codex tiles across it every
 * frame (49 fps against 60), and short of the bottom once Chrome's toolbars
 * slid away. What a tab has and the app hasn't is those toolbars: a tab's
 * large viewport, toolbars gone, is taller than its small one (768 px
 * against 663 in Chrome's on the owner's phone), and the app's two are the
 * same, the screen. A tab whose toolbars never slide (an iPad's, say) is
 * taken for the app, which does it no harm: its viewport doesn't change
 * either, so the heights measured are what its vh units say.
 */
export const installedApp = (
  nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator,
  slides: () => boolean = toolbarsSlide,
): boolean => (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true && !slides();

/**
 * Whether the browser's toolbars slide away as the page scrolls: 100lvh
 * taller than 100svh. Only asked where navigator.standalone is true, so it
 * lays out nothing anywhere else. A WebKit too old for those units (before
 * iOS 15.4) says no, and its tabs are taken for the app as they always were.
 */
function toolbarsSlide(): boolean {
  if (typeof document === 'undefined' || typeof CSS === 'undefined' || !CSS.supports('height: 100lvh')) return false;
  const probe = document.createElement('div');
  probe.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 100lvh; visibility: hidden; pointer-events: none';
  document.documentElement.append(probe);
  const large = probe.getBoundingClientRect().height;
  probe.style.height = '100svh';
  const small = probe.getBoundingClientRect().height;
  probe.remove();
  return large - small > 1;
}
