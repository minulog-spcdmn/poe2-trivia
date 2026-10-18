// Freeze, in a frame of the QA desk (F): every animation held where it is,
// the CSS and web animations paused and the canvases' frames (the effects,
// the backdrop) held back until it lets go. Its clocks run on meanwhile, so
// what's timed by them (a question's clock) moves on when it lets go.
// Installed before the app loads, so the app's requestAnimationFrame is this one.

let frozen = false;
const held = new Map<number, FrameRequestCallback>();
let nextHeld = -1;
/** The animations this paused, to set going again (and not those that had already stopped). */
const paused = new Set<Animation>();

export function installFreeze() {
  const raf = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    if (!frozen) return raf(cb);
    held.set(nextHeld, cb);
    return nextHeld--;
  };
  window.cancelAnimationFrame = (id) => (id < 0 ? void held.delete(id) : cancel(id));
  // Those that start while it's frozen (a class added by a click) are held as they start.
  const hold = () => frozen && holdAll();
  for (const type of ['animationstart', 'transitionrun']) addEventListener(type, hold, true);
  freezeTo = (on) => {
    if (on === frozen) return;
    frozen = on;
    if (on) return holdAll();
    for (const a of paused) if (a.playState === 'paused') a.play();
    paused.clear();
    const due = [...held.values()];
    held.clear();
    for (const cb of due) raf(cb);
  };
}

function holdAll() {
  for (const a of document.getAnimations())
    if (a.playState === 'running') {
      a.pause();
      paused.add(a);
    }
}

let freezeTo: (on: boolean) => void = () => {};
export const freeze = (on: boolean) => freezeTo(on);
