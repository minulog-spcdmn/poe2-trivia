// Beta and dev only (?fps, lib/switchedOff.ts): a small readout of how
// quickly frames come, to find what makes a moment slow on a given machine.
// It keeps every frame's time and shows, over the last two seconds, the
// frame rate, the slowest frame and how many frames took over 50 ms, and
// holds the worst moment seen since the last tap on it (a reveal's hitch
// stays up to be read).

/** Starts the meter: a fixed readout in the bottom left corner. */
export function installFpsMeter() {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;left:6px;bottom:6px;z-index:99999;padding:3px 7px;border-radius:4px;background:rgba(0,0,0,.75);color:#cfc;font:11px/1.35 ui-monospace,monospace;white-space:pre;pointer-events:auto;cursor:default';
  el.title = 'Tap to reset the worst moment';
  document.body.append(el);
  const frames: [number, number][] = [];
  let last = performance.now();
  let worst = { ms: 0, slow: 0 };
  el.addEventListener('click', () => (worst = { ms: 0, slow: 0 }));
  let shownAt = 0;
  const tick = (now: number) => {
    frames.push([now, now - last]);
    last = now;
    while (frames.length && frames[0][0] < now - 2000) frames.shift();
    const max = Math.max(...frames.map(([, d]) => d));
    const slow = frames.filter(([, d]) => d > 50).length;
    if (max > worst.ms) worst = { ms: max, slow: Math.max(worst.slow, slow) };
    else worst.slow = Math.max(worst.slow, slow);
    if (now - shownAt > 250) {
      shownAt = now;
      const fps = frames.length / Math.min(2, Math.max(0.001, (now - frames[0][0]) / 1000));
      el.textContent = `${fps.toFixed(0)} fps  worst ${max.toFixed(0)} ms  >50ms ${slow}\nworst since tap ${worst.ms.toFixed(0)} ms (${worst.slow} slow)`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
