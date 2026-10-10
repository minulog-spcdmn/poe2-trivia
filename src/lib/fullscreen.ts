// Whether the window is fullscreen, and whether this screen could be. Kept
// apart from the tip that uses it (lib/fullscreenTip.ts) so the tests can read
// it without Svelte.
//
// Fullscreen by F11 (or the Mac's green button) isn't the Fullscreen API:
// document.fullscreenElement stays null. What gives it away is the window
// filling the whole screen; a maximized one stops short of it by the taskbar
// or the menu bar and dock. A maximized window with the taskbar hidden passes
// for fullscreen too, and is only left without the tip.

/** The bits of window, screen and navigator the checks read. */
export interface Env {
  outerWidth: number;
  outerHeight: number;
  screen: { width: number; height: number };
  /** For the media queries (pointer, hover, display mode). */
  matches: (query: string) => boolean;
  fullscreenElement: unknown;
  userAgent: string;
  maxTouchPoints: number;
}

/** Slack for a pixel or two of rounding on scaled screens. */
const SLACK = 2;

export function isFullscreen(e: Env): boolean {
  if (e.fullscreenElement) return true;
  if (e.matches('(display-mode: fullscreen)')) return true;
  return e.outerWidth >= e.screen.width - SLACK && e.outerHeight >= e.screen.height - SLACK;
}

const isApple = (e: Env) => /Macintosh|Mac OS X/.test(e.userAgent);

/** An iPad asking for the desktop site says it's a Mac; its touch points give it away. */
const isIpad = (e: Env) => isApple(e) && e.maxTouchPoints > 1;

/** A desktop browser with a keyboard to press the keys on: a mouse, not a touch screen, and not an installed app. Not a Chromebook either, which has no F11. */
export function isDesktop(e: Env): boolean {
  if (isIpad(e)) return false;
  if (/CrOS/.test(e.userAgent)) return false;
  if (/Android|iPhone|iPad|iPod|Mobile/.test(e.userAgent)) return false;
  if (!e.matches('(hover: hover) and (pointer: fine)')) return false;
  return !e.matches('(display-mode: standalone)');
}

/** The keys that make the browser fullscreen: F11 everywhere but the Mac, where F11 shows the desktop. */
export const fullscreenKeys = (e: Env) => (isApple(e) ? '⌃⌘F' : 'F11');

export function browserEnv(): Env {
  return {
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    screen: window.screen,
    matches: (q) => window.matchMedia(q).matches,
    fullscreenElement: document.fullscreenElement,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
}

/**
 * Marks <html data-fullscreen> while the window is fullscreen, so app.css can
 * drop the scrollbar there (the wheel and keys still scroll). Phones are left
 * alone: their scrollbars overlay the page anyway.
 */
export function markFullscreen() {
  const update = () => {
    const env = browserEnv();
    document.documentElement.toggleAttribute('data-fullscreen', isDesktop(env) && isFullscreen(env));
  };
  update();
  window.addEventListener('resize', update);
}
