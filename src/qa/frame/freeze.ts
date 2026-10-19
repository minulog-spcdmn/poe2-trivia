// Freeze, in a frame of the QA desk (F): every animation held where it is
// and the canvases' frames (the effects, the backdrop) held back until it
// lets go. Its clocks run on meanwhile, so what's timed by them (a
// question's clock) moves on when it lets go.
//
// CSS animations are held by a stylesheet (their play state paused), never
// by pausing them from script: once paused or played from script, a CSS
// animation no longer follows its own animation-play-state, and the app
// pauses some by it (a toast's fuse while it's hovered). Transitions and the
// app's own element.animate() are paused from script, those that start
// while frozen included.
// Installed before the app loads, so the app's requestAnimationFrame is this one.

let frozen = false;
const held = new Map<number, FrameRequestCallback>();
/** A held callback's id, once let go, to the id it was given then: the app may still cancel it by the old one. */
const released = new Map<number, number>();
let nextHeld = -1;
/** The animations this paused, to set going again (and not those that had already stopped). */
const paused = new Set<Animation>();
let sheet: HTMLStyleElement | null = null;
let raf: ((cb: FrameRequestCallback) => number) | null = null;

/** The browser's own requestAnimationFrame, which freezing never holds: for the frame's own machinery (its checks, its emulation). */
export const realFrame = (cb: FrameRequestCallback) => (raf ?? requestAnimationFrame)(cb);

export function installFreeze() {
  const real = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  raf = real;
  window.requestAnimationFrame = (cb) => {
    if (!frozen) return real(cb);
    held.set(nextHeld, cb);
    return nextHeld--;
  };
  window.cancelAnimationFrame = (id) => {
    if (id >= 0) return cancel(id);
    held.delete(id);
    const now = released.get(id);
    if (now !== undefined) cancel(now);
  };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
    const a = animate.apply(this, args);
    if (frozen) hold(a);
    return a;
  };
  // Transitions that start while it's frozen (a class added by a click) are held as they start.
  addEventListener('transitionrun', () => frozen && holdAll(), true);
  freezeTo = (on) => {
    if (on === frozen) return;
    frozen = on;
    if (on) {
      sheet = document.createElement('style');
      sheet.textContent = '*, *::before, *::after { animation-play-state: paused !important; }';
      document.head.append(sheet);
      return holdAll();
    }
    sheet?.remove();
    sheet = null;
    for (const a of paused) if (a.playState === 'paused') a.play();
    paused.clear();
    released.clear();
    const due = [...held];
    held.clear();
    for (const [id, cb] of due) released.set(id, real(cb));
  };
}

function hold(a: Animation) {
  if (a.playState === 'finished' || a.playState === 'idle') return;
  a.pause();
  paused.add(a);
}

/** Every running animation but the CSS ones, which the stylesheet holds. */
function holdAll() {
  for (const a of document.getAnimations()) if (!(a instanceof CSSAnimation) && a.playState === 'running') hold(a);
}

let freezeTo: (on: boolean) => void = () => {};
export const freeze = (on: boolean) => freezeTo(on);
