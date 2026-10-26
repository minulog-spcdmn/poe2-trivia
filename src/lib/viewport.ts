import { installedApp } from './installedApp.ts';

/**
 * The page held to the screen, as a game is: no pinch or double-tap zoom
 * (index.html's viewport, app.css's touch-action, and on touch screens iOS's
 * own gesture events, which Safari would let through otherwise), no rubber
 * band past the top or bottom (app.css's overscroll-behavior).
 *
 * An iPhone's home-screen app gets two things more. Coming back to it from
 * another app, WebKit can hand the page back zoomed a little, or with a
 * viewport shorter than the screen: the backdrop stopped short of the
 * bottom, the bars fixed to the bottom floated over a gap, and the game
 * scrolled. Setting the viewport again as the app comes back makes WebKit lay
 * it out afresh, as turning the phone does. And the heights the layers that
 * fill the screen are sized by (--screen-h, --view-h, --app-h in app.css)
 * are measured rather than read from vh units, which such an app can get
 * wrong: there are no toolbars to slide, so the screen is the tallest the
 * page has been at its width (--screen-h, the backdrop and the effects), and
 * what is laid out for is the page's height now (--view-h, --app-h).
 */
export function holdViewport() {
  // (The game's page only: app.css holds html.held still, the dev pages zoom as pages do.)
  document.documentElement.classList.add('held');
  // (macOS Safari sends these for a trackpad's pinch too: a desktop keeps its zoom.)
  if (navigator.maxTouchPoints > 0) for (const type of ['gesturestart', 'gesturechange']) addEventListener(type, (e) => e.preventDefault());
  if (!heldToScreen()) return;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  // (As index.html has it: what each return sets back, however soon the next comes.)
  const viewport = meta?.content ?? '';
  const tallest = new Map<number, number>();
  const root = document.documentElement.style;
  const measure = () => {
    // Not while away (iOS resizes the page for the app switcher's picture).
    if (document.hidden) return;
    // The layout viewport, what the bars fixed to the bottom go by: not
    // innerHeight, which a zoom or the keyboard makes the part left showing.
    const { clientWidth: w, clientHeight: h } = document.documentElement;
    if (!h) return;
    root.setProperty('--screen-h', `${screenHeight(tallest, w, h, screen.width, screen.height)}px`);
    root.setProperty('--view-h', `${h}px`);
    root.setProperty('--app-h', `${h}px`);
  };
  /** Measured now, after the next frame and once more as WebKit settles (it can report the old size at first). */
  let late = 0;
  const settle = () => {
    measure();
    requestAnimationFrame(measure);
    clearTimeout(late);
    late = window.setTimeout(measure, 400);
  };
  let restore = 0;
  const back = () => {
    if (document.visibilityState !== 'visible') return;
    if (!meta) return settle();
    // Set back once a frame has been drawn with it changed, so WebKit sees the change.
    meta.content = `${viewport}, shrink-to-fit=no`;
    cancelAnimationFrame(restore);
    restore = requestAnimationFrame(() => {
      restore = requestAnimationFrame(() => {
        meta.content = viewport;
        settle();
      });
    });
  };
  measure();
  // (A turn of the phone resizes the page too; orientationchange comes before the sizes are new.)
  addEventListener('resize', settle);
  addEventListener('pageshow', (e) => e.persisted && back());
  document.addEventListener('visibilitychange', back);
}

/**
 * Whether the page gets the home-screen app's fixes above. navigator.standalone
 * alone doesn't say so (installedApp.ts): Chrome's tab on an iPhone has it true
 * as well, and it answers (display-mode: fullscreen) as the app does, so the
 * manifest's display mode can't tell them apart either. Taken for the app,
 * Chrome's tab had its screen's height measured, so the backdrop ended at the
 * viewport's bottom edge, where a scroll the page drove itself (the iPhone
 * bench's) had WebKit repaint the row of codex tiles across it every frame
 * (49 fps against 60), and short of the bottom once Chrome's toolbars slid
 * away. What a tab has and the app hasn't is those toolbars: a tab's large
 * viewport, toolbars gone, is taller than its small one (in Chrome's on the
 * owner's phone the backdrop is 768 px tall at 100lvh, the page 663 with the
 * toolbars up), and the app's two are the same, the screen. A tab whose
 * toolbars never slide (an iPad's, say) is taken for the app, which does it
 * no harm: its viewport doesn't change either, so the heights measured are
 * what its vh units say.
 */
export const heldToScreen = (
  nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator,
  slides: () => boolean = toolbarsSlide,
): boolean => installedApp(nav) && !slides();

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

/**
 * The screen's height at width `w`: the tallest seen at it, `h` now among them
 * (kept in `tallest`), and never more than the screen's side that way up (a
 * reading half old and half new as the phone turns says the page is as tall
 * as it is wide). `screenW` by `screenH` is the screen, either way round.
 */
export function screenHeight(tallest: Map<number, number>, w: number, h: number, screenW: number, screenH: number): number {
  const side = w < h ? Math.max(screenW, screenH) : Math.min(screenW, screenH);
  const most = Math.max(tallest.get(w) ?? 0, Math.min(h, side));
  tallest.set(w, most);
  return most;
}
