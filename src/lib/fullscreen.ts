// Whether the window is fullscreen, and whether this screen could be. Kept
// apart from the tip that uses it (lib/fullscreenTip.ts) so the tests can read
// it without Svelte.
//
// Fullscreen by F11 (or the Mac's green button) isn't the Fullscreen API:
// document.fullscreenElement stays null. What gives it away is the window
// filling the whole screen; a maximized one stops short of it by the taskbar
// or the menu bar and dock. Some maximized windows fill it too (the taskbar
// hidden, a second monitor without one), so that alone is only a guess: good
// enough to spare someone the tip, not to take their scrollbar away. For that
// the browser's own toolbars have to be gone as well (surelyFullscreen).

/** The bits of window, screen and navigator the checks read. */
export interface Env {
  outerWidth: number;
  outerHeight: number;
  innerHeight: number;
  screen: { width: number; height: number };
  /** For the media queries (pointer, hover, display mode). */
  matches: (query: string) => boolean;
  fullscreenElement: unknown;
  userAgent: string;
  maxTouchPoints: number;
}

/** Slack for a pixel or two of rounding on scaled screens. */
const SLACK = 2;
/**
 * On a Mac with a notch, a fullscreen window stops below it, short of the
 * screen's height by the notch. A zoomed window with the dock hidden comes
 * this close too, and is only left without the tip.
 */
const NOTCH = 40;

const isApple = (e: Env) => /Macintosh|Mac OS X/.test(e.userAgent);

/** Fullscreen by the page, or as the browser says through its display mode. */
const declared = (e: Env) => !!e.fullscreenElement || e.matches('(display-mode: fullscreen)');

/** The window covers the whole screen (on a Mac, all but the notch). */
const fillsScreen = (e: Env) =>
  e.outerWidth >= e.screen.width - SLACK && e.outerHeight >= e.screen.height - (isApple(e) ? NOTCH : SLACK);

/** Fullscreen as far as the tip goes: a maximized window that fills the screen passes too, and only misses the tip. */
export const isFullscreen = (e: Env) => declared(e) || fillsScreen(e);

/**
 * Fullscreen beyond doubt, for hiding the scrollbar: filling the screen with
 * no toolbars above the page. A zoomed page (its inner height scaled) or a
 * browser keeping its toolbar in fullscreen fails this and keeps its
 * scrollbar, which is the harmless side.
 */
export const surelyFullscreen = (e: Env) => declared(e) || (fillsScreen(e) && e.innerHeight >= e.outerHeight - SLACK);

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
    innerHeight: window.innerHeight,
    screen: window.screen,
    matches: (q) => window.matchMedia(q).matches,
    fullscreenElement: document.fullscreenElement,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
}

/** What the window is now, as the tip and the scrollbar see it. */
export interface FullscreenState {
  desktop: boolean;
  /** Fullscreen, or maximized so it looks it (isFullscreen). */
  fullscreen: boolean;
  /** Fullscreen beyond doubt (surelyFullscreen). */
  sure: boolean;
}

export function fullscreenStateOf(e: Env): FullscreenState {
  return { desktop: isDesktop(e), fullscreen: isFullscreen(e), sure: surelyFullscreen(e) };
}

let current: FullscreenState | null = null;
const listeners = new Set<(s: FullscreenState) => void>();
let frame = 0;

/** The window as last seen (worked out now if nothing's watching it yet). */
export const fullscreenNow = () => (current ??= fullscreenStateOf(browserEnv()));

/** Calls back whenever the window goes in or out of fullscreen (watchFullscreen must be on). */
export function onFullscreenChange(cb: (s: FullscreenState) => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

function update() {
  frame = 0;
  const next = fullscreenStateOf(browserEnv());
  const was = current;
  current = next;
  document.documentElement.toggleAttribute('data-fullscreen', next.desktop && next.sure);
  if (was && was.desktop === next.desktop && was.fullscreen === next.fullscreen && was.sure === next.sure) return;
  for (const cb of listeners) cb(next);
}

/** Once a frame at most, however many resize events a drag sends. */
const soon = () => {
  frame ||= requestAnimationFrame(update);
};

/**
 * Keeps track of fullscreen for the whole app, and marks <html data-fullscreen>
 * while it's sure, so app.css can drop the scrollbar there (the wheel and keys
 * still scroll). Phones are left alone: their scrollbars overlay the page anyway.
 */
export function watchFullscreen() {
  update();
  window.addEventListener('resize', soon);
  document.addEventListener('fullscreenchange', soon);
  window.matchMedia('(display-mode: fullscreen)').addEventListener('change', soon);
}
