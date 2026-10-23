// The workers that prepare the host's pictures (prepWorker.ts, for
// media.svelte.ts), and what becomes of a picture one of them never answers.
// A phone that keeps a page in the background a long while may stop its
// workers without a word (iOS): no error, no answer, so the picture handed to
// one never came back and every question after it waited for art that never
// came. A worker that answers nothing for PREP_STALL_MS while it has pictures
// in hand has stalled: it is let go, what it had is prepared on the page
// (`again`), and a fresh one takes its place. Back from that long in the
// background, they are all started afresh before anything waits on them.

import type { PrepJob, Prepped } from './prepArt';
import type { PrepAnswer, PrepRequest } from './prepWorker';

/** A worker with pictures in hand that answers none for this long has stalled (ms): a picture takes it well under a second, even on a phone. */
export const PREP_STALL_MS = 5000;
/** Back after this long in the background (ms), the workers are started afresh: the phone may have stopped them meanwhile. */
export const HIDDEN_RESTART_MS = 30_000;

/** A picture handed to a worker: what to do with its answer, or to prepare it on the page instead. */
interface Job {
  resolve: (p: Prepped) => void;
  again: () => Promise<void>;
}

/** A preparing worker, the pictures it hasn't answered yet, by job, and its stall watch while it has any. */
interface Preparer {
  worker: Worker;
  jobs: Map<number, Job>;
  stall?: ReturnType<typeof setTimeout>;
}

export class PrepPool {
  private all: Preparer[] = [];
  private jobs = 0;
  /** How many there should be: one that won't start (or dies with an error) is given no more, nor a replacement. */
  private size: number;
  private make: () => Worker | null;
  private stallMs: number;

  constructor(make: () => Worker | null, size: number, stallMs = PREP_STALL_MS) {
    this.make = make;
    this.size = size;
    this.stallMs = stallMs;
    for (let k = 0; k < size; k++) if (!this.add()) break;
  }

  /** How many are running. */
  get count() {
    return this.all.length;
  }

  /** Every worker readies itself for the first picture (prepWorker's 'warm'). */
  warm() {
    for (const p of this.all) p.worker.postMessage({ t: 'warm' } satisfies PrepRequest);
  }

  /**
   * Hands a picture's file to the worker with the fewest in hand; null if
   * none runs. `again` prepares it on the page instead, should the worker
   * turn it down or stall. `signal` drops it where it is.
   */
  prep(file: Blob, job: PrepJob, again: () => Promise<Prepped>, signal?: AbortSignal): Promise<Prepped> | null {
    const p = this.all.reduce<Preparer | null>((a, b) => (!a || b.jobs.size < a.jobs.size ? b : a), null);
    if (!p) return null;
    const id = ++this.jobs;
    return new Promise<Prepped>((resolve, reject) => {
      p.jobs.set(id, { resolve, again: () => again().then(resolve, reject) });
      this.watch(p);
      p.worker.postMessage({ t: 'prep', id, file, job } satisfies PrepRequest);
      signal?.addEventListener(
        'abort',
        () => {
          if (!p.jobs.delete(id)) return;
          if (!p.jobs.size) this.unwatch(p);
          p.worker.postMessage({ t: 'drop', id } satisfies PrepRequest);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }

  /** The page is back after `hiddenMs` in the background: after long enough, every worker is started afresh. */
  cameBack(hiddenMs: number) {
    if (hiddenMs < HIDDEN_RESTART_MS) return;
    for (const p of [...this.all]) this.retire(p, true);
  }

  private add(): Preparer | null {
    const worker = this.make();
    if (!worker) return null;
    const p: Preparer = { worker, jobs: new Map() };
    worker.onmessage = ({ data }: MessageEvent<PrepAnswer>) => {
      const job = p.jobs.get(data.id);
      p.jobs.delete(data.id);
      // It answers: the watch starts over for what it still has, if anything.
      this.unwatch(p);
      if (p.jobs.size) this.watch(p);
      if (data.prepped) job?.resolve(data.prepped);
      else void job?.again();
    };
    // A worker that won't start (or dies): what it had is prepared here, and it is given no more.
    worker.onerror = () => {
      this.size--;
      this.retire(p, false);
    };
    this.all.push(p);
    return p;
  }

  /** Lets a worker go, what it had prepared on the page; `replace`: a fresh one, warmed, takes its place. */
  private retire(p: Preparer, replace: boolean) {
    const at = this.all.indexOf(p);
    if (at < 0) return;
    this.all.splice(at, 1);
    this.unwatch(p);
    p.worker.onmessage = p.worker.onerror = null;
    p.worker.terminate();
    for (const job of p.jobs.values()) void job.again();
    p.jobs.clear();
    if (replace && this.all.length < this.size) this.add()?.worker.postMessage({ t: 'warm' } satisfies PrepRequest);
  }

  private watch(p: Preparer) {
    if (p.stall === undefined) p.stall = setTimeout(() => this.retire(p, true), this.stallMs);
  }

  private unwatch(p: Preparer) {
    clearTimeout(p.stall);
    delete p.stall;
  }
}
