// The workers that prepare the host's pictures (prepWorker.ts, for
// media.svelte.ts), and what becomes of a picture one of them never answers.
// A phone that keeps a page in the background a long while may stop its
// workers without a word (iOS): no error, no answer, so the picture handed to
// one never came back and every question after it waited for art that never
// came. A worker that answers nothing for PREP_STALL_MS while it has pictures
// in hand has stalled: it is let go, a fresh one takes its place, and what it
// had goes to another worker once (then to the page). One still starting (its
// script on its way, on a slow link) has START_MS. Back from a long while in
// the background, each is asked whether it is still there, and one that
// doesn't answer within PING_MS is replaced before anything waits on it.
// A page hidden a while (a phone switched to another app) has its workers
// frozen with it, not stopped, and a watch counts none of that time
// (stallWatch).

import type { PrepJob, Prepped } from './prepArt';
import type { PrepAnswer, PrepRequest } from './prepWorker';

/** A worker with pictures in hand that answers none for this long has stalled (ms): a picture takes it well under a second, even on a phone. */
export const PREP_STALL_MS = 5000;
/** The same for a worker that hasn't said a word yet (ms): its script may still be on its way over a slow link. */
export const START_MS = 20_000;
/** An idle worker asked whether it is still there (cameBack) answers within this (ms); one with pictures in hand, which answers only between their steps, has PREP_STALL_MS. */
export const PING_MS = 1500;
/** Back after this long in the background (ms), the workers are asked whether they are still there: the phone may have stopped them meanwhile. */
export const HIDDEN_CHECK_MS = 30_000;
/** Whether the page is hidden, and how many times that has changed: a stall watch that saw a change starts over (stallWatch). */
let hidden = false;
let flips = 0;
/**
 * Notes whether `doc` is hidden now, each change counted once however many
 * listeners note it: onShownAgain's do too, before theirs, so a watch one
 * starts as the page is shown again (a worker asked whether it's still
 * there) counts from after the change, whichever listener runs first.
 */
function note(doc: Pick<Document, 'hidden'>) {
  if (doc.hidden === hidden) return;
  hidden = doc.hidden;
  flips++;
}
let tracking = false;
function track() {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  note(document);
  document.addEventListener('visibilitychange', () => note(document));
}

/**
 * A worker's stall watch: calls `silent` once `ms` pass with the page shown
 * throughout, unless the function it returns cancels it first (an answer
 * came). One that saw the page hidden starts over: a phone that switched to
 * another app froze the worker with the page, however briefly, and as the
 * page thaws its overdue timers and its visibilitychange run in no set order.
 * Counted otherwise, a worker only frozen would be let go, its work done
 * again elsewhere (and one still loading given up on for good). A hidden
 * page's watch waits, then, till it's shown: nothing on it is seen meanwhile.
 */
export function stallWatch(ms: number, silent: () => void): () => void {
  track();
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    const seen = flips;
    timer = setTimeout(() => (hidden || flips !== seen ? arm() : silent()), ms);
  };
  arm();
  return () => clearTimeout(timer);
}

/** A picture handed to a worker: its file and job (to hand it on), how many workers have had it, and what to do with its answer, or to prepare it on the page instead. */
interface Job {
  id: number;
  file: Blob;
  job: PrepJob;
  tries: number;
  resolve: (p: Prepped) => void;
  again: () => void;
}

/** A preparing worker: whether it has said anything yet, the pictures it hasn't answered, by job, a question still out (ping), and its stall watch while it owes an answer. */
interface Preparer {
  worker: Worker;
  started: boolean;
  jobs: Map<number, Job>;
  pinged: boolean;
  stall?: () => void;
}

/** How many workers a picture is handed to before the page prepares it itself. */
const TRIES = 2;

export class PrepPool {
  private all: Preparer[] = [];
  private jobs = 0;
  /** How many there should be: one that won't start is given no more, nor a replacement. */
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

  /**
   * Hands a picture's file to the worker with the fewest in hand; null if
   * none runs. `again` prepares it on the page instead, should the worker
   * turn it down, or stall and no other take it. `signal` drops it where it is.
   */
  prep(file: Blob, job: PrepJob, again: () => Promise<Prepped>, signal?: AbortSignal): Promise<Prepped> | null {
    if (!this.all.length) return null;
    const id = ++this.jobs;
    return new Promise<Prepped>((resolve, reject) => {
      const j: Job = { id, file, job, tries: 0, resolve, again: () => void again().then(resolve, reject) };
      this.send(j);
      signal?.addEventListener(
        'abort',
        () => {
          const p = this.all.find((q) => q.jobs.has(id));
          if (!p) return;
          p.jobs.delete(id);
          this.rewatch(p);
          p.worker.postMessage({ t: 'drop', id } satisfies PrepRequest);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }

  /** The page is back after `hiddenMs` in the background: after long enough, a worker that doesn't say it's still there is replaced. */
  cameBack(hiddenMs: number) {
    if (hiddenMs < HIDDEN_CHECK_MS) return;
    for (const p of this.all) {
      if (!p.started || p.pinged) continue;
      p.pinged = true;
      this.rewatch(p);
      p.worker.postMessage({ t: 'ping' } satisfies PrepRequest);
    }
  }

  /** A picture to the worker with the fewest in hand, or to the page once it has been to TRIES of them (or none is left). */
  private send(j: Job) {
    const p = this.all.reduce<Preparer | null>((a, b) => (!a || b.jobs.size < a.jobs.size ? b : a), null);
    if (!p || j.tries >= TRIES) return j.again();
    j.tries++;
    p.jobs.set(j.id, j);
    this.rewatch(p);
    p.worker.postMessage({ t: 'prep', id: j.id, file: j.file, job: j.job } satisfies PrepRequest);
  }

  private add(): Preparer | null {
    const worker = this.make();
    if (!worker) return null;
    const p: Preparer = { worker, started: false, jobs: new Map(), pinged: false };
    worker.onmessage = ({ data }: MessageEvent<PrepAnswer>) => {
      // Any word from it: it runs, and the watch starts over for what it still owes.
      p.started = true;
      p.pinged = false;
      const job = data.t === 'prep' ? p.jobs.get(data.id) : undefined;
      if (job) p.jobs.delete(job.id);
      this.rewatch(p);
      if (!job) return;
      if (data.t === 'prep' && data.prepped) job.resolve(data.prepped);
      else job.again();
    };
    // A worker that won't start is given no more; one that ran and died is replaced. What it had goes on either way.
    worker.onerror = () => {
      if (!p.started) this.size--;
      this.retire(p, p.started);
    };
    this.all.push(p);
    // Ready before the first question needs it: its encoder started on a tiny picture (prepWorker's 'warm').
    worker.postMessage({ t: 'warm' } satisfies PrepRequest);
    return p;
  }

  /** Lets a worker go, `replace`d by a fresh one; what it had goes to another worker. */
  private retire(p: Preparer, replace: boolean) {
    const at = this.all.indexOf(p);
    if (at < 0) return;
    this.all.splice(at, 1);
    p.stall?.();
    p.worker.onmessage = p.worker.onerror = null;
    p.worker.terminate();
    if (replace && this.all.length < this.size) this.add();
    for (const j of p.jobs.values()) this.send(j);
    p.jobs.clear();
  }

  /** The stall watch, from now, while the worker owes an answer: longer while it hasn't said a word, shorter for a question an idle one should answer at once. */
  private rewatch(p: Preparer) {
    p.stall?.();
    delete p.stall;
    if (!p.jobs.size && !p.pinged) return;
    const ms = !p.started ? Math.max(START_MS, this.stallMs) : p.pinged && !p.jobs.size ? Math.min(PING_MS, this.stallMs) : this.stallMs;
    p.stall = stallWatch(ms, () => this.retire(p, true));
  }
}

/**
 * Calls `back` with how long the page was hidden (ms), each time it shows
 * again (`doc`: the page's document).
 */
export function onShownAgain(doc: Pick<Document, 'hidden' | 'addEventListener'>, back: (hiddenMs: number) => void, now = Date.now) {
  let hiddenAt: number | null = null;
  doc.addEventListener('visibilitychange', () => {
    note(doc);
    if (doc.hidden) hiddenAt = now();
    else if (hiddenAt !== null) {
      back(now() - hiddenAt);
      hiddenAt = null;
    }
  });
}
