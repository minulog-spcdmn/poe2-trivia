// Where the descent's plate (descentPlate.ts) is drawn: in a worker
// (descentWorker.ts), so the lobby's first frame isn't held up by it; on the
// page itself where no worker can run, or where one fails. The worker is
// started in an idle moment once the page is up, so it is there by the time
// a lobby asks.

import { descentPlate, type Plate } from './descentPlate';
import type { DescentAnswer, DescentJob } from './descentWorker';
import { whenIdle } from './idle';

/** What descentPlate is asked, as plain data (no Svelte state: it goes to the worker as it is). */
export type DescentArgs = Parameters<typeof descentPlate>;

let worker: Worker | null | undefined;
let jobs = 0;
/** Plates the worker hasn't answered yet, by job. */
const waiting = new Map<number, { args: DescentArgs; done: (plate: Plate) => void }>();

const onPage = (args: DescentArgs) => descentPlate(...args);

/** The plate for `args`: from the worker, or drawn here where it can't. */
export function drawDescent(args: DescentArgs): Promise<Plate> {
  const w = descentWorker();
  if (!w) return Promise.resolve().then(() => onPage(args));
  const id = ++jobs;
  return new Promise((done) => {
    waiting.set(id, { args, done });
    w.postMessage({ id, args } satisfies DescentJob);
  });
}

/** The drawing worker, started on first use; null where it can't run. */
function descentWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (typeof Worker === 'undefined') return (worker = null);
  try {
    worker = new Worker(new URL('./descentWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return (worker = null);
  }
  worker.onmessage = ({ data }: MessageEvent<DescentAnswer>) => {
    const job = waiting.get(data.id);
    waiting.delete(data.id);
    job?.done(data.plate ?? onPage(job.args));
  };
  /** What the worker had, drawn on the page (an answer coming after all finds no job, and is dropped). */
  const onPageAll = () => {
    for (const job of waiting.values()) job.done(onPage(job.args));
    waiting.clear();
  };
  // A worker that won't start (or dies): what it had, and all that comes after, is drawn on the page.
  worker.onerror = () => {
    worker = null;
    onPageAll();
  };
  // An answer that couldn't be read says nothing of which job it was: all waiting are drawn on the page.
  worker.onmessageerror = onPageAll;
  return worker;
}

if (typeof window !== 'undefined') whenIdle(() => void descentWorker(), { timeout: 5000, fallback: 1000 });
