// Slow motion for a frame (qa.html?frame=...&slow=4): its time runs that many
// times slower, so a quarter-second move takes a second, to be watched. Set
// before the game loads (../main.ts), so all of it runs slow together: its
// clocks (performance.now, Date.now, a frame's timestamp), its timers (a
// scene's steps among them), and every animation as it's made (CSS's, and
// Svelte's transitions and the app's own, made with Element.animate). Sound
// keeps its own pace.

export function slowDown(by: number) {
  if (!(by > 1)) return;
  const perfNow = performance.now.bind(performance);
  const dateNow = Date.now;
  const p0 = perfNow();
  const d0 = dateNow();
  const slowed = (t: number) => p0 + (t - p0) / by;
  performance.now = () => slowed(perfNow());
  Date.now = () => d0 + (dateNow() - d0) / by;

  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => cb(slowed(t)));
  const timeout = window.setTimeout.bind(window);
  window.setTimeout = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => timeout(fn, (ms ?? 0) * by, ...rest)) as typeof setTimeout;
  const interval = window.setInterval.bind(window);
  window.setInterval = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => interval(fn, (ms ?? 0) * by, ...rest)) as typeof setInterval;

  // Each animation slowed once, as it's made or as soon as it shows.
  const seen = new WeakSet<Animation>();
  const slow = (a: Animation) => {
    if (seen.has(a)) return;
    seen.add(a);
    a.playbackRate /= by;
  };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
    const a = animate.apply(this, args);
    slow(a);
    return a;
  };
  const sweep = () => document.getAnimations().forEach(slow);
  document.addEventListener('transitionrun', sweep, true);
  document.addEventListener('animationstart', sweep, true);
  const each = () => {
    sweep();
    raf(each);
  };
  raf(each);
}
