// Where the name plate's weave (lib/weave.ts) comes from: worked out in a
// worker of its own (weaveWorker.ts), asked for ahead of the first plate (a
// game's first question, the codex's first item), which then stops; here,
// in an idle moment, where no worker can run or one fails. A plate that
// shows before it's in works it out on the spot. The same tile every way.

import { whenIdle } from './idle.ts';
import { weaveImage, weavePath } from './weave.ts';
import type { WeaveAnswer } from './weaveWorker.ts';

let tile: string | undefined;
/** Asked for already (of the worker, or of an idle moment here). */
let asked = false;

/** The weave's tile, as a CSS background: the one worked out ahead, or worked out now. */
export function weaveTile(): string {
  return (tile ??= weaveImage(weavePath()));
}

/** Works the weave out here, in the page's next idle moment. */
const onThePage = () => void whenIdle(() => void weaveTile(), { timeout: 2000 });

/**
 * Has the weave worked out ahead of the first plate, away from the page: on
 * an iPhone it held the tap that opened the codex's first item window some
 * 60 ms. Once is enough; later calls do nothing.
 */
export function warmWeave() {
  if (asked || tile) return;
  asked = true;
  if (typeof Worker === 'undefined') return onThePage();
  let w: Worker;
  try {
    w = new Worker(new URL('./weaveWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return onThePage();
  }
  w.onmessage = ({ data }: MessageEvent<WeaveAnswer>) => {
    w.terminate();
    if (data.d !== undefined) tile ??= weaveImage(data.d);
    else onThePage();
  };
  // (Failed to load, say: worked out here instead.)
  const instead = () => {
    w.terminate();
    onThePage();
  };
  w.onerror = instead;
  w.onmessageerror = instead;
  w.postMessage(null);
}
