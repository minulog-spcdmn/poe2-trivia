// Delve's light table (lib/descent.ts, lightAt) worked out in a worker
// (lib/lightWorker.ts) from the moment a Delve is on its way, so it is
// there before the run starts: on an iPhone each of its stretches held the
// page 52 to 56 ms, two or three of them in the frames just after Begin
// (each an idle step, but a stretch can't be split, whatever the moment
// has left). The worker hands each stretch over as it is done, and the
// strata past the zones it read, generated there, then stops once it has
// the whole table; meanwhile the page works out only what a frame can't do
// without, and should the worker fail, the rest in idle moments as before.
// It fails, too, if it falls silent before the table is all here: a phone
// that keeps a page in the background a long while may stop its workers
// without a word (lib/prepPool.ts), and a jump deep down would wait on it
// for ever (descent.ts, waiting). It hands a stretch over every few dozen
// ms on a phone; PREP_STALL_MS with none, it has stopped (START_MS before
// its first: its script may be on its way over a slow link), and PING_MS
// after a long while in the background. One only frozen with the page a
// while isn't let go as it thaws (stallWatch in lib/prepPool.ts).
// The backdrop tool's drafts (setBackdrops) are worked out on the page: the
// worker only has the file's backdrops.

import { backdropsVersion, onBackdrops } from './backdrops';
import { adoptLights, LIGHT_TABLE, lightsHere, workLightsAway } from './descent';
import type { LightAnswer } from './lightWorker';
import { HIDDEN_CHECK_MS, onShownAgain, PING_MS, PREP_STALL_MS, stallWatch, START_MS } from './prepPool';

/** The worker: undefined until it's wanted, null where it can't help (no worker, it failed, the backdrops are a draft). */
let worker: Worker | null | undefined;
/** Whether it has handed the whole table over. */
let done = false;
/** Whether it has handed any of it over yet. */
let heard = false;
/** The wait for its next stretch, while the table isn't all here (see expect): what cancels it. */
let quiet: (() => void) | undefined;

/** `w` has stopped short (failed to load, say, or fallen silent): the page works the rest out after all. */
function fail(w: Worker) {
  if (worker !== w || done) return;
  quiet?.();
  w.terminate();
  worker = null;
  lightsHere();
}

/** Waits `ms` for `w`'s next stretch; with none, it has stopped. */
function expect(w: Worker, ms: number) {
  quiet?.();
  quiet = stallWatch(ms, () => fail(w));
}

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
    heard = true;
    adoptLights(data.table);
    if (data.table.settled >= LIGHT_TABLE) {
      done = true;
      quiet?.();
      w.terminate();
    } else expect(w, PREP_STALL_MS);
  };
  w.onerror = () => fail(w);
  w.onmessageerror = () => fail(w);
  w.postMessage(null);
  worker = w;
  expect(w, START_MS);
  return true;
}

workLightsAway(start);

// The backdrop tool's draft in place of the file's: the table is worked out again, on the page.
onBackdrops(() => {
  quiet?.();
  worker?.terminate();
  worker = null;
});

// Back after a long while in the background, a worker still at it hands its next stretch over at once; one stopped meanwhile is let go.
if (typeof document !== 'undefined') {
  onShownAgain(document, (hiddenMs) => {
    if (hiddenMs >= HIDDEN_CHECK_MS && worker && heard && !done) expect(worker, PING_MS);
  });
}

/** A Delve on its way (chosen in the lobby, a Delve room joined, a run picked up): its light is worked out now, away from the page. */
export const wantDelveLights = () => void start();
