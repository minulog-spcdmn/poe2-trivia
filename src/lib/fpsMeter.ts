// Beta and dev only (?fps, lib/switchedOff.ts): a small readout of how
// quickly frames come, to find what makes a moment slow on a given machine.
// It keeps every frame's time and shows, over the last two seconds, the
// frame rate, the slowest frame and how many frames took over 50 ms, and
// holds the worst moment seen since the last tap on it (a reveal's hitch
// stays up to be read), with what the page's main thread did meanwhile
// (Chrome's long animation frames): the scripts that ran longest, by file
// and function, and the style and layout. A slow frame with the main
// thread mostly free was held up by the GPU instead (the WebGL canvases
// being drawn). Each slow frame is also written to the console.

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
        console.info(`[fps] slow frame ${e.duration.toFixed(0)}ms, ${describe(e)}`, e);
      }
      while (long.length > 50) long.shift();
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch {
    /* not in this browser: only the frame times show */
  }
  /** What the main thread did in the frame that ended at `end` after `ms`. */
  const why = (end: number, ms: number) => {
    const f = long.find((e) => e.startTime < end && e.startTime + e.duration > end - ms);
    return f ? describe(f) : 'main thread free: held up by the GPU or the compositor';
  };
  let shownAt = 0;
  const tick = (now: number) => {
    const ms = now - last;
    frames.push([now, ms]);
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
