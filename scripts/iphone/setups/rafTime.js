// SETUP for codex.mjs and game.mjs: every animation-frame callback and timer
// the page runs, timed by its source and phase, in window.__rafStats: the
// script's own time, and the styles and layout it left for the frame (read
// at once, so this measure adds a layout of its own after each). It finds
// which loop eats the frame.
(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const stats = (window.__rafStats = {});
  const key = (cb) => String(cb).replace(/\s+/g, ' ').slice(0, 70);
  const root = document.documentElement;
  const add = (phase, k, js, dirty) => {
    const s = ((stats[phase] ??= {})[k] ??= [0, 0, 0]);
    s[0]++;
    s[1] += js;
    s[2] += dirty;
  };
  const timed = (label, fn, args) => {
    const phase = window.__marks?.at(-1)?.[0] ?? 'pre';
    const t0 = performance.now();
    try {
      return fn(...args);
    } finally {
      const t1 = performance.now();
      void root.offsetTop;
      add(phase, label + key(fn), t1 - t0, performance.now() - t1);
    }
  };
  window.requestAnimationFrame = (cb) => raf((t) => timed('', cb, [t]));
  const st = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...a) => (typeof fn !== 'function' ? st(fn, ms, ...a) : st(() => timed('timeout ', fn, a), ms));
  return 'timing frame callbacks and timers';
})()
