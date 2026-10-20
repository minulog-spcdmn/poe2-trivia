// The notice that the browser draws without the GPU (lib/gpuCheck.ts), and
// how to switch hardware acceleration back on. Asked once, of a worker
// (lib/gpuWorker.ts), in an idle moment a little after the start; shown on
// the calm screens (the start page, the lobby, the end screen) until it's
// closed, which is kept for good. A question starting takes it down without
// counting that as closed.
//
// Not in the QA desk's frames or the room bot, and not where WebGL has been
// hidden (headless runs do that, lib/fx stays off there): they draw in
// software on purpose.

import { accelerationFix } from './gpuCheck.ts';
import { whenIdle } from './idle.ts';
import { BOT, QA, readStored, writeStored } from './storage.ts';
import { toasts } from './toasts.svelte';

/** How long after the start the check waits: the first frames, the shaders' builds and the fonts come first. */
const AFTER_MS = 2500;

const CLOSED = 'gpuNotice.closed';
const TITLE = 'Graphics acceleration is off';

/** Puts the notice up (closing it is kept: CLOSED). */
export const showGpuNotice = () =>
  toasts.show(`For smooth play, ${accelerationFix(navigator.userAgent)}`, 'warn', {
    title: TITLE,
    sticky: true,
    onClose: () => writeStored(CLOSED, '1'),
  });

/** Whether this page should ask at all. */
const asks = () => !QA && !BOT && typeof WebGL2RenderingContext !== 'undefined' && !readStored(CLOSED);

/**
 * Follows the screens (App.svelte), as the fullscreen tip does: `calm`
 * while no question runs.
 */
export function watchGpuNotice(): { calm: (on: boolean) => void; stop: () => void } {
  let calm = false;
  let software = false;
  let shownId: number | null = null;
  let stops: (() => void)[] = [];

  const up = () => shownId !== null && toasts.list.some((t) => t.id === shownId);
  const show = () => {
    if (calm && software && !up() && !readStored(CLOSED)) shownId = showGpuNotice();
  };
  const hide = () => {
    if (up()) toasts.dismiss(shownId!);
    shownId = null;
  };

  if (asks()) {
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
        software = data === true;
        show();
      };
      worker.onerror = done;
    };
    const timer = setTimeout(() => stops.push(whenIdle(ask, { timeout: 2000 })), AFTER_MS);
    stops.push(() => clearTimeout(timer), done);
  }

  return {
    calm(on) {
      calm = on;
      if (on) show();
      else hide();
    },
    stop() {
      calm = false;
      for (const f of stops) f();
      stops = [];
      hide();
    },
  };
}
