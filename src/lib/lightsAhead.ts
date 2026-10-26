// Delve's light table (lib/descent.ts, lightAt) worked out in a worker
// (lib/lightWorker.ts) from the moment a Delve is on its way, so it is
// there before the run starts: on an iPhone each of its stretches held the
// page 52 to 56 ms, two or three of them in the frames just after Begin
// (each an idle step, but a stretch can't be split, whatever the moment
// has left). The worker hands each stretch over as it is done, and the
// strata past the zones it read, generated there, then stops once it has
// the whole table; meanwhile the page works out only what a frame can't do
// without, and should the worker fail, the rest in idle moments as before.
// The backdrop tool's drafts (setBackdrops) are worked out on the page: the
// worker only has the file's backdrops.

import { backdropsVersion, onBackdrops } from './backdrops';
import { adoptLights, LIGHT_TABLE, lightsHere, workLightsAway } from './descent';
import type { LightAnswer } from './lightWorker';

/** The worker: undefined until it's wanted, null where it can't help (no worker, it failed, the backdrops are a draft). */
let worker: Worker | null | undefined;
/** Whether it has handed the whole table over. */
let done = false;

/** Starts the light table being worked out in the worker, if it isn't yet; whether it is (or has been). */
function start(): boolean {
  if (worker !== undefined) return worker !== null;
  if (typeof Worker === 'undefined' || backdropsVersion > 0) return !!(worker = null);
  let w: Worker;
  try {
    w = new Worker(new URL('./lightWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return !!(worker = null);
  }
  w.onmessage = ({ data }: MessageEvent<LightAnswer>) => {
    if (worker !== w || done) return;
    adoptLights(data.table);
    if (data.table.settled >= LIGHT_TABLE) {
      done = true;
      w.terminate();
    }
  };
  // (Failed to load, say: the page works it out after all.)
  const fail = () => {
    if (worker !== w || done) return;
    w.terminate();
    worker = null;
    lightsHere();
  };
  w.onerror = fail;
  w.onmessageerror = fail;
  w.postMessage(null);
  worker = w;
  return true;
}

workLightsAway(start);

// The backdrop tool's draft in place of the file's: the table is worked out again, on the page.
onBackdrops(() => {
  worker?.terminate();
  worker = null;
});

/** A Delve on its way (chosen in the lobby, a Delve room joined, a run picked up): its light is worked out now, away from the page. */
export const wantDelveLights = () => void start();
