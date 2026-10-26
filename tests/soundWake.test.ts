// How lib/sound.ts wakes its audio context (wake): only once a frame begun
// after the last press has been drawn, so the screen a tap brings in comes
// first, and on timers, which carry a tap's gesture on, as iOS asks of a
// context's first start. Against a fake AudioContext, clock and frames, and
// gestures as WebKit counts them for media, on an iPhone with no
// navigator.userActivation (iOS 15 to 16.3), where sound may play from the
// first touch.
import './asVite.ts';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.timers.enable({ apis: ['setTimeout', 'Date'] });
const g = globalThis as Record<string, unknown>;
Object.defineProperty(globalThis, 'performance', { value: { now: () => Date.now() }, configurable: true });
g.localStorage = { getItem: () => null, setItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const listeners: Record<string, ((e: unknown) => void)[]> = {};
g.addEventListener = (type: string, f: (e: unknown) => void) => (listeners[type] ??= []).push(f);
const doc = { hidden: false, visibilityState: 'visible', baseURI: 'https://poe2.quest/', documentElement: { hasAttribute: () => false }, location: { pathname: '/' }, addEventListener() {} };
g.document = doc;
// Nothing loads: only the context's waking is listened for here.
g.fetch = () => new Promise(() => {});

/**
 * When the gesture what runs now runs in was (ms), or null outside one. A
 * touch's pointerdown is none; its touchend, pointerup and click are, and so
 * is a key press.
 */
let gesture: number | null = null;
const timer = globalThis.setTimeout;
// A timer carries the gesture it was set in on, for a second from it, as WebKit's do.
g.setTimeout = (f: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  const carried = gesture;
  return timer(() => {
    const was = gesture;
    gesture = carried !== null && Date.now() - carried <= 1000 ? carried : null;
    try {
      f(...args);
    } finally {
      gesture = was;
    }
  }, ms);
};

/** When each frame the page drew began (ms). */
const frames: number[] = [];
/** Whether the page draws frames (out of sight it draws none). */
let drawing = true;
let asked: ((t: number) => void)[] = [];
g.requestAnimationFrame = (f: (t: number) => void) => asked.push(f);
// The display's beat, a frame every 16 ms, which calls back what was asked for before it, in no gesture.
(function beat() {
  timer(() => {
    if (drawing) {
      frames.push(Date.now());
      const due = asked;
      asked = [];
      for (const f of due) f(Date.now());
    }
    beat();
  }, 16);
})();

const param = (value: number) => ({ value, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ connect: (m: unknown) => m, disconnect() {} });
/** Every resume() asked of the context: when (ms), and whether in a gesture. */
const resumes: { at: number; gesture: boolean }[] = [];
let ac: { state: string; needsGesture: boolean } | undefined;
g.AudioContext = class {
  state = 'suspended';
  /** Whether it starts only in a gesture, as iOS asks of a context's first start. */
  needsGesture = true;
  sampleRate = 8000;
  currentTime = 0;
  destination = node();
  constructor() {
    ac = this;
  }
  resume() {
    resumes.push({ at: Date.now(), gesture: gesture !== null });
    // Refused, it does nothing: its promise waits for a start that may never come.
    if (gesture === null && this.needsGesture) return new Promise(() => {});
    this.state = 'running';
    this.needsGesture = false;
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  createGain = () => ({ ...node(), gain: param(1) });
  createBiquadFilter = () => ({ ...node(), frequency: param(350), Q: param(1), gain: param(0) });
  createDynamicsCompressor = () => ({ ...node(), threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) });
  createConvolver = () => node();
  createOscillator = () => ({ ...node(), frequency: param(440), start() {}, stop() {} });
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / sampleRate, length, sampleRate, getChannelData: (c: number) => data[c] };
  }
  createBufferSource = () => ({ ...node(), buffer: null, loop: false, playbackRate: param(1), detune: param(0), start() {}, stop() {} });
  decodeAudioData = async () => ({ duration: 0.2 });
};

const { installUiSounds, WAKE_WAIT } = await import('../src/lib/sound.ts');
installUiSounds();

/**
 * Lets the clock run on to `ms`, a millisecond at a time: the mock fires
 * everything due within one tick at its end, a frame and the timers after it
 * all at once.
 */
const at = (ms: number) => {
  while (Date.now() < ms) mock.timers.tick(1);
};
/** When each press was (ms): every event the wakes take the last press from. */
const presses: number[] = [];
const button = { disabled: false, closest: () => null };
/** Hands the page a `type` event, in a gesture or not. */
function press(type: 'pointerdown' | 'pointerup' | 'touchend' | 'click' | 'keydown', inGesture: boolean) {
  presses.push(Date.now());
  const was = gesture;
  gesture = inGesture ? Date.now() : null;
  try {
    for (const f of listeners[type] ?? []) f({ type, pointerType: 'touch', target: { closest: () => button } });
  } finally {
    gesture = was;
  }
}
/** Each resume() asked from `since` (ms) on came once a frame begun after the last press before it was drawn. */
function eachAfterItsFrame(since: number) {
  for (const r of resumes.filter((r) => r.at >= since)) {
    const last = Math.max(...presses.filter((p) => p <= r.at));
    assert.ok(
      frames.some((f) => f > last && f <= r.at),
      `resumed at ${r.at} ms, before any frame begun after the press at ${last} ms`,
    );
  }
}

test("the first tap's touchend or click starts the context, though the idle moment's wake, in no gesture, waits already", () => {
  at(3);
  press('pointerdown', false);
  // Safari has no requestIdleCallback: the context is made, and a wake asked
  // for, 50 ms on, in a timer set in the pointerdown, so in no gesture.
  at(56);
  assert.ok(ac, 'made in the idle moment');
  assert.equal(resumes.length, 0, 'that wake waits for its frame');
  press('touchend', true);
  press('pointerup', true);
  at(60);
  press('click', true);
  // The first frame begun after the click is the one at 64 ms.
  at(63);
  assert.equal(resumes.length, 0);
  at(80);
  assert.equal(ac.state, 'running', 'started, by a wake that carried the gesture');
  assert.ok(resumes.some((r) => r.gesture));
  eachAfterItsFrame(0);
});

test('a wake waits for a frame begun after the last press, one between a frame and its next look too', () => {
  at(1000);
  // As iOS leaves it after a call; started before, it needs no gesture to start again.
  ac!.state = 'interrupted';
  ac!.needsGesture = false;
  at(1010);
  // The bus is up: this pointerdown asks for a wake itself, whose frame is the one at 1024 ms.
  press('pointerdown', false);
  // That frame is drawn before the wake looks again (at 1027 ms); this comes in between.
  at(1025);
  press('touchend', true);
  at(1039);
  assert.equal(resumes.filter((r) => r.at >= 1000).length, 0, 'none before the frame at 1040 ms');
  at(1060);
  assert.equal(ac!.state, 'running');
  eachAfterItsFrame(1000);
});

test('a page out of sight draws no frame: a wake waits WAKE_WAIT for one, no longer', () => {
  at(2000);
  drawing = false;
  doc.hidden = true;
  // Put to sleep meanwhile (see rest).
  ac!.state = 'suspended';
  const before = resumes.length;
  press('keydown', true);
  at(2000 + WAKE_WAIT - 1);
  assert.equal(resumes.length, before);
  at(2000 + WAKE_WAIT + 8);
  assert.equal(resumes.length, before + 1);
  assert.ok(resumes[before].at >= 2000 + WAKE_WAIT);
  assert.equal(ac!.state, 'running');
});
