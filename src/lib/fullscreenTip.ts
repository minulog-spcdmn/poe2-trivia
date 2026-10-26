// The tip to play fullscreen: shown on desktop to whoever isn't (press F11),
// and on a phone or tablet to whoever hasn't the game on its home screen yet
// (add it there: it opens fullscreen from there), a few seconds into a calm
// moment (the start page, the lobby, the end screen; never while a question
// runs, as going fullscreen moves everything about). Once a session at most,
// and a few times in all. Someone fullscreen already isn't due it; that's
// checked each time rather than remembered, since a window that only looks
// fullscreen (lib/fullscreen.ts) mustn't silence it for good. A browser tab
// that has just put the game on the home screen stays a tab, so that's
// remembered instead: the tip is taken as read.
//
// An iPhone's or iPad's home-screen app keeps storage of its own, apart from
// Safari's (lib/installedApp.ts), so it opens as a first visit would. To
// whoever has nothing there to lose yet (no name saved, nothing in the codex)
// that's nothing to mention; to whoever has, the tip says so, and how to bring
// it over: pairing the two in Settings (lib/sync/), while this tab is still
// open. Android's and a desktop's installed apps share their browser's
// storage, so their tips need none of it.

import { browserEnv, fullscreenKeys, fullscreenNow, onFullscreenChange, type FullscreenState } from './fullscreen.ts';
import { loadCodex, type Codex } from './codex.ts';
import { NAME_STORED } from './names.ts';
import { readStored, writeStored } from './storage.ts';
import { toasts, type ToastOptions } from './toasts.svelte';

/** How long a calm moment lasts before the tip shows: long enough to have looked around first. */
const DELAY_MS = 4000;
/** How long the tip has to stay up to count as seen: one taken down as a game starts doesn't. */
const SEEN_MS = 1500;
/** Seen this many times in all, then it's taken as read. */
const MAX_SHOWN = 3;

const SHOWN = 'fullscreenTip.shown';
const THIS_SESSION = 'fullscreenTip.session';

const TITLE = 'Pro tip';

/** What the tip says: the keys on a desktop, the way to the home screen on a phone or tablet. */
export type TipFor = 'desktop' | 'android' | 'ios';

/** Whether the player has anything a fresh start would lose: a name saved, or anything in the codex. */
export const hasProgress = (name: string, codex: Codex) => name !== '' || Object.keys(codex.items).length > 0 || codex.log.length > 0;

/** Whether this browser's player has, as stored now. */
export const progressHere = () => hasProgress(readStored(NAME_STORED) ?? '', loadCodex());

const MESSAGE: Record<TipFor, (progress: boolean) => string> = {
  desktop: () => `Press ${fullscreenKeys(browserEnv())} to play in fullscreen.`,
  android: () => "Add PoE2.Quest to your home screen from the browser’s menu to play in fullscreen.",
  ios: (progress) =>
    progress
      ? 'Tap Share, then Add to Home Screen, for fullscreen. It starts fresh: pair it with this tab in Settings to keep your progress.'
      : 'Tap Share, then Add to Home Screen, to play in fullscreen.',
};

/** What the tip says, for the player's progress (only an iPhone's or iPad's tip minds it). */
export const tipText = (tipFor: TipFor, progress: boolean) => MESSAGE[tipFor](progress);

/** Puts the tip up (the lab and the QA desk show each this way too, leaving the counts alone). */
export const showTip = (tipFor: TipFor = fullscreenNow().install ?? 'desktop', progress = tipFor === 'ios' && progressHere(), opts: ToastOptions = {}) =>
  toasts.show(tipText(tipFor, progress), 'info', { title: TITLE, ...opts });

/** Whether this window is due a tip at all, counts aside: a desktop not fullscreen, or a phone or tablet that could add the game to its home screen. */
const wants = (s: FullscreenState) => (s.desktop ? !s.fullscreen : s.install !== null);

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
  return wants(fullscreenNow());
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
    if (wants(s)) return arm();
    cancel();
    hide();
  });
  // (A desktop's tab keeps its own tip, F11: that one still applies there.)
  const installed = () => {
    if (fullscreenNow().desktop) return;
    writeStored(SHOWN, String(MAX_SHOWN));
    cancel();
    hide();
  };
  window.addEventListener('appinstalled', installed);
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
      window.removeEventListener('appinstalled', installed);
    },
  };
}
