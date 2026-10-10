// The tip to play fullscreen: shown on desktop to whoever isn't, a few
// seconds into a calm moment (the start page, the lobby, the end screen;
// never while a question runs, as going fullscreen moves everything about).
// Once a session at most, and a few times in all. Someone fullscreen already
// isn't due it; that's checked each time rather than remembered, since a
// window that only looks fullscreen (lib/fullscreen.ts) mustn't silence it
// for good.

import { browserEnv, fullscreenKeys, isDesktop, isFullscreen } from './fullscreen.ts';
import { readStored, writeStored } from './storage.ts';
import { toasts } from './toasts.svelte';

/** How long a calm moment lasts before the tip shows: long enough to have looked around first. */
const DELAY_MS = 4000;
/** Shown this many times in all, then it's taken as read. */
const MAX_SHOWN = 3;

const SHOWN = 'fullscreenTip.shown';
const THIS_SESSION = 'fullscreenTip.session';

const TITLE = 'Pro tip';

/** Puts the tip up (the lab shows it this way too, leaving the counts alone). */
export const showTip = () => toasts.show(`Press ${fullscreenKeys(browserEnv())} to play in fullscreen.`, 'info', { title: TITLE });

/** Times shown so far; anything unreadable counts as none. */
const shownCount = () => Number.parseInt(readStored(SHOWN) ?? '', 10) || 0;

let timer: ReturnType<typeof setTimeout> | null = null;
let shownId: number | null = null;

function due(): boolean {
  if (readStored(THIS_SESSION, 'session')) return false;
  if (shownCount() >= MAX_SHOWN) return false;
  const env = browserEnv();
  return isDesktop(env) && !isFullscreen(env);
}

function show() {
  timer = null;
  if (!due()) return;
  writeStored(THIS_SESSION, '1', 'session');
  writeStored(SHOWN, String(shownCount() + 1));
  shownId = showTip();
}

/** Takes the tip down if it's still up. */
function hide() {
  if (shownId !== null) toasts.dismiss(shownId);
  shownId = null;
}

/** Gone fullscreen: a tip pending or up has done its job. */
function onResize() {
  if (timer === null && shownId === null) return;
  if (!isFullscreen(browserEnv())) return;
  cancel();
  hide();
}

function cancel() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/**
 * Follows the screens (App.svelte): `calm` while nothing runs that going
 * fullscreen would disturb. Returns the cleanup.
 */
export function watchFullscreenTip(): { calm: (on: boolean) => void; stop: () => void } {
  window.addEventListener('resize', onResize);
  return {
    calm(on) {
      // A question is starting: no tip pending, and none left up over it.
      if (!on) {
        cancel();
        hide();
        return;
      }
      if (!timer && due()) timer = setTimeout(show, DELAY_MS);
    },
    stop() {
      cancel();
      window.removeEventListener('resize', onResize);
    },
  };
}
