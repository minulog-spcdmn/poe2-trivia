// Beta and dev only (?fps, lib/switchedOff.ts): a small readout of how
// quickly frames come, to find what makes a moment slow on a given machine.
// It keeps every frame's time and shows, over the last two seconds, the
// frame rate, the slowest frame and how many frames took over 50 ms, and
// holds the worst moment seen since the last tap on it (a reveal's hitch
// stays up to be read), with what the page's main thread did meanwhile
// (Chrome's long animation frames): the scripts that ran longest, by file
// and function, and the style and layout. A slow frame with the main
// thread mostly free was held up by the GPU instead (the WebGL canvases
// being drawn). Each slow frame is also written to the console, and so is
// any of the heavier steps the effects and the backdrop take (frameEvent),
// which the readout names when they fall in the worst frame.

/** The heavier steps taken lately (time, what), while the meter runs. */
const events: [number, string][] = [];
let on = false;

/** Notes a heavier step (a GPU upload, targets made anew), for the meter to name in a slow frame. Nothing unless ?fps. */
export function frameEvent(what: string) {
  if (!on) return;
  const now = performance.now();
  events.push([now, what]);
  while (events.length > 100) events.shift();
  // A step of the game's own ends the one before: how smoothly that went.
  if (what.startsWith('game: ')) {
    if (phase) console.info(`[fps] ${phase.name} ${summary(phase.frames, now - phase.at)}`);
    phase = { name: what.slice(6), at: now, frames: [] };
  }
  console.info(`[fps] ${now.toFixed(0)} ${what}`);
}

/**
 * Main-thread work timed in each frame (the effects' and the backdrop's own
 * frames), summed per frame while the meter runs. The page's styles and
 * layout aren't timed here: forcing them to be worked out would change the
 * very frames being timed. Chrome's long animation frames tell them instead.
 */
const work: Record<string, number> = {};

/** Runs `fn(arg)`, adding its time to this frame's `name` while the meter runs. (Its argument passed, not closed over: nothing made each frame with the meter off.) */
export function timed<A, T>(name: string, fn: (arg: A) => T, arg: A): T {
  if (!on) return fn(arg);
  const t = performance.now();
  try {
    return fn(arg);
  } finally {
    work[name] = (work[name] ?? 0) + performance.now() - t;
  }
}

type FrameWork = { ms: number; work: Record<string, number> };

/** The game's step under way (the reveal, a question) and its frames. */
let phase: { name: string; at: number; frames: FrameWork[] } | null = null;

/** How smoothly a stretch of frames went: their rate, the slowest, and how many took over 25 and 50 ms. */
function summary(all: FrameWork[], ms: number): string {
  const frames = all.map((f) => f.ms);
  const sorted = [...frames].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] ?? 0;
  const span = Math.min(ms, 2000);
  return `${(ms / 1000).toFixed(1)}s, its first ${(span / 1000).toFixed(1)}s: ${((frames.length * 1000) / Math.max(1, span)).toFixed(0)} fps, median ${median.toFixed(0)}ms, worst ${(sorted.at(-1) ?? 0).toFixed(0)}ms, ${frames.filter((d) => d > 25).length} over 25ms, ${frames.filter((d) => d > 50).length} over 50ms${slowWork(all)}`;
}

/** In the frames over 25ms: what the main thread spent on average, by part, and what's left (styles and layout, the GPU, the compositor, the browser's own). */
function slowWork(all: FrameWork[]): string {
  const slow = all.filter((f) => f.ms > 25);
  if (!slow.length) return '';
  const names = [...new Set(slow.flatMap((f) => Object.keys(f.work)))];
  const avg = (get: (f: FrameWork) => number) => slow.reduce((n, f) => n + get(f), 0) / slow.length;
  const parts = names.map((n) => `${n} ${avg((f) => f.work[n] ?? 0).toFixed(1)}`);
  const rest = avg((f) => f.ms - Object.values(f.work).reduce((a, b) => a + b, 0));
  return `; in those, on average ms: ${avg((f) => f.ms).toFixed(0)} a frame, ${parts.join(', ')}, the rest ${rest.toFixed(0)}`;
}

type Script = { duration: number; sourceURL: string; sourceFunctionName: string; invoker: string; forcedStyleAndLayoutDuration: number };
type LoAF = PerformanceEntry & { renderStart: number; styleAndLayoutStart: number; blockingDuration: number; scripts: Script[] };

/** A long animation frame, told in one line: its main-thread work, longest first. */
function describe(f: LoAF): string {
  const end = f.startTime + f.duration;
  const layout = f.styleAndLayoutStart ? end - f.styleAndLayoutStart : 0;
  const forced = f.scripts.reduce((n, s) => n + s.forcedStyleAndLayoutDuration, 0);
  const scripts = [...f.scripts]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 3)
    .map((s) => `${(s.sourceURL.split('/').pop() ?? '').split('?')[0] || s.invoker} ${s.sourceFunctionName || '(anon)'} ${s.duration.toFixed(0)}`);
  const js = f.scripts.reduce((n, s) => n + s.duration, 0);
  return `main ${(js + layout).toFixed(0)}ms: js ${js.toFixed(0)} (${scripts.join(', ') || 'none'}), layout ${layout.toFixed(0)}, forced ${forced.toFixed(0)}`;
}

/** Starts the meter: a fixed readout in the bottom left corner. */
export function installFpsMeter() {
  on = true;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;left:6px;bottom:6px;z-index:99999;max-width:calc(100vw - 12px);padding:3px 7px;border-radius:4px;background:rgba(0,0,0,.75);color:#cfc;font:11px/1.35 ui-monospace,monospace;white-space:pre-wrap;pointer-events:auto;cursor:default';
  el.title = 'Tap to reset the worst moment';
  document.body.append(el);
  const frames: [number, number][] = [];
  let last = performance.now();
  let worst = { ms: 0, slow: 0, at: 0, why: '' };
  el.addEventListener('click', () => (worst = { ms: 0, slow: 0, at: 0, why: '' }));
  // Long animation frames (Chrome 123 on): kept a few seconds, to be matched to the slow frames seen.
  const long: LoAF[] = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as LoAF[]) {
        long.push(e);
        console.info(`[fps] ${e.startTime.toFixed(0)} slow frame ${e.duration.toFixed(0)}ms, ${describe(e)}`);
      }
      while (long.length > 50) long.shift();
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    /* not in this browser: only the frame times show */
  }
  /** What the main thread did in the frame that ended at `end` after `ms`. */
  const why = (end: number, ms: number) => {
    const f = long.find((e) => e.startTime < end && e.startTime + e.duration > end - ms);
    // The steps taken in it, or in the frame before (whose work it may have waited on).
    const seen = [...new Set(events.filter(([t]) => t > end - ms - 40 && t <= end).map(([, w]) => w))];
    return (f ? describe(f) : 'main thread free: held up by the GPU or the compositor') + (seen.length ? `\nduring it: ${seen.join(', ')}` : '');
  };
  let shownAt = 0;
  const tick = (now: number) => {
    const ms = now - last;
    frames.push([now, ms]);
    // (The first two seconds of a step: a question or reveal's own moments, not the wait after them.)
    if (phase && now - phase.at < 2000) phase.frames.push({ ms, work: { ...work } });
    for (const k in work) delete work[k];
    last = now;
    while (frames.length && frames[0][0] < now - 2000) frames.shift();
    const max = Math.max(...frames.map(([, d]) => d));
    const slow = frames.filter(([, d]) => d > 50).length;
    if (ms > worst.ms && ms < 5000) worst = { ms, slow: Math.max(worst.slow, slow), at: now, why: '' };
    else worst.slow = Math.max(worst.slow, slow);
    // (Its long frame is reported a little after it ends.)
    if (worst.at && !worst.why && now - worst.at > 300) worst.why = why(worst.at, worst.ms);
    if (now - shownAt > 250) {
      shownAt = now;
      const fps = frames.length / Math.min(2, Math.max(0.001, (now - frames[0][0]) / 1000));
      el.textContent =
        `${fps.toFixed(0)} fps  worst ${max.toFixed(0)} ms  >50ms ${slow}\n` +
        `worst since tap ${worst.ms.toFixed(0)} ms (${worst.slow} slow)` +
        (worst.why ? `\n${worst.why}` : '');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
