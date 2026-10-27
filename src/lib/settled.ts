// Work fetched and run ahead of need, once the page has settled: the game's
// screens (App.svelte), the faces other screens use (lib/fontsAhead.ts), the
// codex. Each piece costs a frame or two of evaluating or laying out, which
// is nothing on a calm page and a long frame on top of an entrance, and on a
// phone's first visit the start page is all entrance: its rows come in, and
// today's circle puts its layers on the page and draws itself in for two
// seconds more.
//
// whenIdle (lib/idle.ts) can't tell: Safari has no requestIdleCallback, and
// its timer ran the game's screens 0.7 s into the load, on the frame the
// circle's layers went on the page (a 45 to 67 ms frame on the iPhone), and
// the faces at 1.2 s, mid draw-in (50 to 62 ms). Settled means two things
// here. Nothing holds it off: what is making an entrance holds the page
// until it's over (holdSettled: a rune circle until it has drawn itself in,
// the start page's circle from before it has loaded). And the page is idle:
// requestIdleCallback where there is one, and where there isn't, a few frames
// in a row that came on time with time to spare, measured after each the way
// a polyfill would (the task right after a frame's callbacks runs once the
// browser has drawn it, so how long that took is how much of the frame it
// used).
//
// One piece at a time, and the next only once the last has done (its promise
// settled) and the page has settled again, so no two pile up on one frame.
// None waits for ever: a piece defers to holds for a few seconds at most,
// and a page that never looks idle (a slow phone, always busy) gets it after
// a few seconds more of trying.

/** What the settling runs on: the page's clock, frames, tasks, timers and its idle callback (left out where there's none). */
export type Env = {
  now(): number;
  frame(f: (t: number) => void): number;
  cancelFrame(id: number): void;
  /** Runs `f` in a task of its own, as soon as the page gets to it. */
  task(f: () => void): void;
  later(f: () => void, ms: number): () => void;
  idle?: (f: () => void, timeout: number) => void;
  hidden(): boolean;
};

/** Frames in a row on time, with time to spare, that count as idle. */
export const CALM_FRAMES = 4;
/**
 * How long a piece defers to holds at most (ms), from when it's next: an
 * entrance that never says it's over, or one after another (a game's
 * circles, question after question), doesn't keep it waiting for good.
 */
export const HOLD_WAIT_MS = 8000;
/** How long, once it no longer defers to holds, a piece waits for an idle moment at most (ms). */
export const PATIENCE_MS = 3000;
/** How long to wait for a frame before asking whether the page is hidden (no frames come then) (ms). */
const FRAME_WAIT_MS = 500;

/**
 * Whether a frame was idle: it came on time (within half a frame again of
 * the shortest gap seen, `best`) and drawing it took at most half of one.
 */
export const calmFrame = (gap: number, cost: number, best: number) => gap <= best * 1.5 && cost <= best / 2;

export type Settler = {
  /** Runs `f` once the page has settled (one piece at a time, in the order asked); returns a function that takes it back if it hasn't run. */
  when(f: () => unknown): () => void;
  /** Holds the page unsettled until the returned function is called. */
  hold(): () => void;
};

export function settler(env: Env): Settler {
  const jobs: (() => unknown)[] = [];
  const holds = new Set<object>();
  /** A piece running (until its promise settles), or the page being watched for the next. */
  let busy = false;
  /** When the next piece began to wait (NaN while none is). */
  let since = NaN;
  /** Stops the timer that ends its deference to holds. */
  let unarm = () => {};
  /** Whether the next piece still defers to holds. */
  const defers = () => holds.size > 0 && env.now() - since < HOLD_WAIT_MS;

  const run = () => {
    unarm();
    since = NaN;
    const job = jobs.shift();
    if (!job) return;
    busy = true;
    const done = () => {
      busy = false;
      next();
    };
    let out: unknown;
    try {
      out = job();
    } catch (e) {
      // (Thrown: the next piece still comes, and the error is seen.)
      env.later(() => {
        throw e;
      }, 0);
    }
    if (out instanceof Promise) out.then(done, done);
    else done();
  };

  /** Waits for the page to settle, then runs the next piece. */
  const next = () => {
    if (busy || !jobs.length) return;
    if (Number.isNaN(since)) since = env.now();
    if (defers()) {
      // (Until a release, or the end of its deference.)
      unarm();
      unarm = env.later(next, HOLD_WAIT_MS - (env.now() - since));
      return;
    }
    busy = true;
    if (env.idle) {
      env.idle(() => {
        busy = false;
        // (Held meanwhile: it waits for that too.)
        if (defers()) next();
        else run();
      }, PATIENCE_MS);
      return;
    }
    const from = env.now();
    let calm = 0;
    let best = Infinity;
    let last = NaN;
    let id = 0;
    let wait = () => {};
    const look = () => {
      // No frame for a while: the page is hidden (no frames come then), and
      // nothing it does can get in an entrance's way; or a frame is stuck,
      // and it's looked for again (as long as the patience lasts).
      wait = env.later(() => {
        env.cancelFrame(id);
        if (env.hidden() || env.now() - from >= PATIENCE_MS) {
          busy = false;
          run();
        } else look();
      }, FRAME_WAIT_MS);
      id = env.frame((t) => {
        wait();
        const gap = t - last;
        last = t;
        env.task(() => {
          const cost = env.now() - t;
          if (gap > 0) best = Math.min(best, gap);
          calm = calmFrame(gap, cost, best) ? calm + 1 : 0;
          if (defers() || calm >= CALM_FRAMES || env.now() - from >= PATIENCE_MS) {
            busy = false;
            // (Held meanwhile: it waits for that too.)
            if (defers()) next();
            else run();
          } else look();
        });
      });
    };
    look();
  };

  return {
    when(f) {
      jobs.push(f);
      next();
      return () => {
        const i = jobs.indexOf(f);
        if (i >= 0) jobs.splice(i, 1);
      };
    },
    hold() {
      const h = {};
      // (A piece being watched for waits for this hold too: it's let go at its next look.)
      holds.add(h);
      return () => {
        if (holds.delete(h) && !holds.size && !busy) next();
      };
    },
  };
}

const g = globalThis as {
  requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number;
  MessageChannel?: typeof MessageChannel;
};

/** A task right away: a message to the page's own port (a timer's would wait for a clamp). */
function taskQueue(): (f: () => void) => void {
  if (typeof g.MessageChannel !== 'function') return (f) => void setTimeout(f);
  const queue: (() => void)[] = [];
  // (Opened when first wanted: where there's requestIdleCallback, it never is.)
  let port: MessagePort | null = null;
  return (f) => {
    if (!port) {
      const { port1, port2 } = new g.MessageChannel!();
      port1.onmessage = () => queue.shift()?.();
      port = port2;
    }
    queue.push(f);
    port.postMessage(0);
  };
}

let page: Settler | null = null;
/** The page's own settler, made the first time it's wanted. */
function pageSettler(): Settler {
  return (page ??= settler({
    now: () => performance.now(),
    frame: (f) => requestAnimationFrame(f),
    cancelFrame: (id) => cancelAnimationFrame(id),
    task: taskQueue(),
    later: (f, ms) => {
      const id = setTimeout(f, ms);
      return () => clearTimeout(id);
    },
    idle:
      typeof g.requestIdleCallback === 'function'
        ? (f, timeout) => void g.requestIdleCallback!(f, { timeout })
        : undefined,
    hidden: () => document.visibilityState === 'hidden',
  }));
}

/** Runs `f` once the page has settled (see above); returns a function that takes it back if it hasn't run yet. */
export const whenSettled = (f: () => unknown) => pageSettler().when(f);

/** Holds the page unsettled while an entrance plays; call what it returns once it's over. */
export const holdSettled = () => pageSettler().hold();
