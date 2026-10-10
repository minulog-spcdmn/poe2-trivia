// The tip to play fullscreen: shown on desktop to whoever isn't, a few
// seconds into a calm moment (the start page, the lobby, the end screen;
// never while a question runs, as going fullscreen moves everything about).
// Once a session at most, and a few times in all. Someone fullscreen already
// isn't due it; that's checked each time rather than remembered, since a
// window that only looks fullscreen (lib/fullscreen.ts) mustn't silence it
// for good.

import { browserEnv, fullscreenKeys, fullscreenNow, onFullscreenChange } from './fullscreen.ts';
import { readStored, writeStored } from './storage.ts';
import { toasts } from './toasts.svelte';

/** How long a calm moment lasts before the tip shows: long enough to have looked around first. */
const DELAY_MS = 4000;
/** How long the tip has to stay up to count as seen: one taken down as a game starts doesn't. */
const SEEN_MS = 1500;
/** Seen this many times in all, then it's taken as read. */
const MAX_SHOWN = 3;

const SHOWN = 'fullscreenTip.shown';
const THIS_SESSION = 'fullscreenTip.session';

const TITLE = 'Pro tip';

/** Puts the tip up (the lab shows it this way too, leaving the counts alone). */
export const showTip = () => toasts.show(`Press ${fullscreenKeys(browserEnv())} to play in fullscreen.`, 'info', { title: TITLE });

/** Times seen so far; anything unreadable counts as none. */
const shownCount = () => Number.parseInt(readStored(SHOWN) ?? '', 10) || 0;

let calm = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let seenTimer: ReturnType<typeof setTimeout> | null = null;
let shownId: number | null = null;

/** The tip is on screen (it may have closed itself, or been closed, since). */
const up = () => shownId !== null && toasts.list.some((t) => t.id === shownId);

function due(): boolean {
  if (readStored(THIS_SESSION, 'session')) return false;
  if (shownCount() >= MAX_SHOWN) return false;
  const s = fullscreenNow();
  return s.desktop && !s.fullscreen;
}

/** Starts the wait for the tip, if it's due and nothing's waiting or showing yet. */
function arm() {
  if (calm && !timer && !up() && due()) timer = setTimeout(show, DELAY_MS);
}

function show() {
  timer = null;
  if (!due()) return;
  shownId = showTip();
  seenTimer = setTimeout(seen, SEEN_MS);
}

function seen() {
  seenTimer = null;
  writeStored(THIS_SESSION, '1', 'session');
  writeStored(SHOWN, String(shownCount() + 1));
}

/** Takes the tip down if it's still up; not yet seen long enough, it doesn't count. */
function hide() {
  if (seenTimer) clearTimeout(seenTimer);
  seenTimer = null;
  if (up()) toasts.dismiss(shownId!);
  shownId = null;
}

function cancel() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/**
 * Follows the screens (App.svelte): `calm` while nothing runs that going
 * fullscreen would disturb. Going fullscreen takes the tip away; leaving it
 * on a calm screen starts the wait for it.
 */
export function watchFullscreenTip(): { calm: (on: boolean) => void; stop: () => void } {
  const off = onFullscreenChange((s) => {
    if (s.fullscreen) {
      cancel();
      hide();
    } else arm();
  });
  return {
    calm(on) {
      calm = on;
      if (on) return arm();
      // A question is starting: no tip pending, and none left up over it.
      cancel();
      hide();
    },
    stop() {
      calm = false;
      cancel();
      hide();
      off();
    },
  };
}
