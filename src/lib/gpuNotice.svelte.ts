// The notice that the browser draws without the GPU (lib/gpuCheck.ts), and
// how to switch hardware acceleration back on: a dialog in the middle of the
// screen (components/GpuDialog.svelte) that waits for an answer. It was a
// notice in the corner first, among the room's news, and went unread: a
// streamer played at a few frames a second without learning why.
//
// The backdrop tells first, of its own context, as its first frame is drawn
// (lib/backdrop.ts whenBackdropInSoftware): in time for a player on their
// way into a game. A worker (lib/gpuWorker.ts) is asked too, once, in an
// idle moment a little after the start, for what the backdrop's context
// doesn't give away. Firefox gives nothing away through either: it is asked
// its own way then (lib/gpuCheck.ts firefoxInSoftware), which is how the
// streamer's browser is found out. The dialog comes up on the calm screens (the start page,
// the lobby, the end screen) until it's answered, which is kept for good. A
// question starting takes it down without counting that as an answer. Once
// answered it stays within reach: the settings keep a line for it for as
// long as the browser draws in software (Settings.svelte).
//
// Not in the QA desk's frames or the room bot, and not where WebGL has been
// hidden (headless runs do that, lib/fx stays off there): they draw in
// software on purpose.

import { whenBackdropInSoftware } from './backdrop.ts';
import { asksSoftware, noteSoftware } from './count.ts';
import { accelerationFix, browserSigns, firefoxInSoftware, firefoxOnWindows, GENERAL_FIX } from './gpuCheck.ts';
import { whenIdle } from './idle.ts';
import { BOT, QA, readStored, writeStored } from './storage.ts';

/** How long after the start the check waits: the first frames, the shaders' builds and the fonts come first. */
const AFTER_MS = 2500;

/**
 * The dialog answered. (The corner's notice kept its close as
 * gpuNotice.closed: closed unread too easily to count as an answer, so
 * whoever closed that one is asked once more, by the dialog.)
 */
const ANSWERED = 'gpuNotice.answered';

export const gpuNotice = $state({
  /** The game is drawn in software here, in a browser with a switch for it: the settings' line shows. */
  off: false,
  /** The dialog is up. */
  open: false,
  /** Answered on this page: kept here too, for a browser that keeps nothing (its storage blocked or full), where it would come back after every game. */
  answered: false,
});

/** The fix in this browser (none on phones and tablets: lib/gpuCheck.ts). */
export const gpuFix = () => accelerationFix(navigator.userAgent);
/** The fix as the dialog and the settings' line show it: this browser's, or the steps in general where it has none (shown there by the QA desk alone). */
export const shownFix = () => gpuFix() ?? GENERAL_FIX;

/** The dialog answered (its Play anyway, its Got it, Escape): down, and it doesn't come by itself again. */
export function answerGpuNotice() {
  gpuNotice.answered = true;
  writeStored(ANSWERED, '1');
  gpuNotice.open = false;
}
const answered = () => gpuNotice.answered || readStored(ANSWERED) === '1';

/** The dialog opened by hand, from the settings' line. */
export const openGpuNotice = () => void (gpuNotice.open = true);

/** What the watch goes by: the browser's, but a test's own. */
export interface GpuWatch {
  /**
   * Whether this page tells its player at all: not where it's driven by a
   * script (a headless check of the effects draws in software on purpose),
   * nor where there's no setting to point to.
   */
  tells: () => boolean;
  /**
   * Asks whether the browser draws in software, answered as it's found out
   * (once more should a later word change it: Firefox's comes after the
   * worker's); returns what calls the asking off.
   */
  ask: (answer: (software: boolean) => void) => () => void;
}

/** Runs `f` in an idle moment a little after the start; returns what calls it off. */
function afterStart(f: () => void): () => void {
  let offIdle = () => {};
  const timer = setTimeout(() => (offIdle = whenIdle(f, { timeout: 2000 })), AFTER_MS);
  return () => {
    clearTimeout(timer);
    offIdle();
  };
}

/** Asked of a worker, in an idle moment a little after the start (never where there's no WebGL2 to ask about). */
function askWorker(answer: (software: boolean) => void): () => void {
  if (typeof WebGL2RenderingContext === 'undefined') return () => {};
  let worker: Worker | null = null;
  const done = () => {
    worker?.terminate();
    worker = null;
  };
  const ask = () => {
    try {
      worker = new Worker(new URL('./gpuWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      return;
    }
    worker.onmessage = ({ data }: MessageEvent<boolean>) => {
      done();
      answer(data === true);
    };
    worker.onerror = done;
  };
  const offAsk = afterStart(ask);
  return () => {
    offAsk();
    done();
  };
}

/**
 * Firefox, asked its own way at the worker's moment (on Windows, where its
 * signs were measured: lib/gpuCheck.ts firefoxInSoftware): tells of software
 * or says nothing, as the backdrop does. On the page, where the signs hold;
 * they are promises, and the page waits on none of them.
 */
function whenFirefoxInSoftware(heard: () => void): () => void {
  if (!firefoxOnWindows(navigator.userAgent)) return () => {};
  let off = false;
  const offAsk = afterStart(
    () =>
      void firefoxInSoftware(browserSigns).then(
        (software) => {
          if (software && !off) heard();
        },
        () => {},
      ),
  );
  return () => {
    off = true;
    offAsk();
  };
}

/**
 * Asked of the backdrop too, which tells first: of its own context, as its
 * first frame is drawn (lib/backdrop.ts whenBackdropInSoftware), seconds
 * before the worker can. So a player who goes straight into a game is told
 * before it, not after. Told so, the worker isn't asked; it still answers
 * wherever the backdrop has nothing certain to say. Firefox tells the same
 * way, later: there the worker's answer is "a GPU" whatever the switch
 * says, and being told of software is the last word, before that answer or
 * after it. (`worker`, `backdrop` and `firefox`: the three it asks, a
 * test's own.)
 */
export function askBrowser(answer: (software: boolean) => void, worker = askWorker, backdrop = whenBackdropInSoftware, firefox = whenFirefoxInSoftware): () => void {
  const offWorker = worker(answer);
  const told = () => {
    offWorker();
    answer(true);
  };
  const offBackdrop = backdrop(told);
  const offFirefox = firefox(told);
  return () => {
    offBackdrop();
    offFirefox();
    offWorker();
  };
}

const BROWSER: GpuWatch = {
  tells: () => !QA && !BOT && !navigator.webdriver && !!gpuFix(),
  ask: askBrowser,
};

/**
 * Follows the screens (App.svelte), as the fullscreen tip does: `calm`
 * while no question runs. Asks also where nothing is told but a game's
 * frames are counted (count.ts asksSoftware): a game drawn in software is
 * counted apart. Whatever the backdrop is drawn with, for the notice and
 * the count alike: without the GPU the CSS one is slow too (11 frames a
 * second where WebGL gets 4.5, in Chrome 157 with acceleration off; 168
 * with it on).
 */
export function watchGpuNotice({ tells, ask }: GpuWatch = BROWSER): { calm: (on: boolean) => void; stop: () => void } {
  let calm = false;
  let software = false;
  const told = tells();

  // (Where nothing is told, nothing is set either: the QA desk's scene says how it stands there.)
  const show = () => {
    if (!told) return;
    gpuNotice.off = software;
    if (calm && software && !answered()) gpuNotice.open = true;
  };
  const hide = () => void (gpuNotice.open = false);

  const off =
    told || asksSoftware()
      ? ask((found) => {
          software = found;
          noteSoftware(() => software);
          show();
        })
      : () => {};

  return {
    calm(on) {
      calm = on;
      if (on) show();
      else hide();
    },
    stop() {
      calm = false;
      off();
      hide();
    },
  };
}
