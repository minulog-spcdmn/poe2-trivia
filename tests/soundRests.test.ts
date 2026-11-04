// How lib/sound.ts lets its audio context rest after one-shot sounds, against
// a fake AudioContext, fetch and clock: with the ambience at 0 the context is
// suspended 1.5 s after the last sound's layers have ended, a sound started
// meanwhile keeps it running, and with the ambience on it never rests; the
// battery saver (html[data-saver]) silences it all, as muting does.
import './asVite.ts';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.timers.enable({ apis: ['setTimeout', 'Date'] });
const g = globalThis as Record<string, unknown>;
Object.defineProperty(globalThis, 'performance', { value: { now: () => Date.now() }, configurable: true });
g.requestIdleCallback = (f: () => void) => setTimeout(f, 50);
// The ambience is stored at 0 (as storage.ts names it: the channel's start, then 'ambience').
g.localStorage = { getItem: (k: string) => (k.endsWith('.ambience') ? '0' : null), setItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { userActivation: { hasBeenActive: true } }, configurable: true });
const listeners: Record<string, ((e: unknown) => void)[]> = {};
g.addEventListener = (type: string, f: (e: unknown) => void) => (listeners[type] ??= []).push(f);
/** Whether the page is marked html[data-saver], and who watches the mark (sound.ts's MutationObserver). */
let saving = false;
const watchers: (() => void)[] = [];
g.MutationObserver = class {
  constructor(f: () => void) {
    watchers.push(f);
  }
  observe() {}
};
const setSaving = (on: boolean) => {
  saving = on;
  watchers.forEach((f) => f());
};
g.document = { hidden: false, visibilityState: 'visible', baseURI: 'https://poe2.quest/', documentElement: { hasAttribute: (a: string) => a === 'data-saver' && saving }, location: { pathname: '/' }, addEventListener() {} };
g.fetch = (u: URL) => {
  const file = String(u).replace(/^.*\/sfx\//, '').replace('.mp3', '');
  return new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200, arrayBuffer: async () => ({ file }) }), 300));
};

const param = (value: number) => ({ value, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setValueCurveAtTime() {} });
const node = () => ({ connect: (m: unknown) => m, disconnect() {} });
/** A buffer source as sound.ts sees it; `onended` is a plain property this test calls itself. */
type FakeSource = { buffer: { file?: string } | null; loop: boolean; started: boolean; ended: boolean; onended: (() => void) | null };
const sources: FakeSource[] = [];
let ac: { state: string } | undefined;
let clock = 0;
g.AudioContext = class {
  state = 'suspended';
  sampleRate = 8000;
  destination = node();
  constructor() {
    ac = this;
  }
  get currentTime() {
    return clock;
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
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
  createBufferSource() {
    const s = { ...node(), buffer: null, loop: false, started: false, ended: false, onended: null, playbackRate: param(1), detune: param(0) } as FakeSource & Record<string, unknown>;
    s.start = () => (s.started = true);
    s.stop = () => {};
    sources.push(s);
    return s;
  }
  decodeAudioData = async (data: { file: string }) => ({ duration: 0.5, file: data.file });
};

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
/** Lets `seconds` go by, in steps of 50 ms. */
async function wait(seconds: number) {
  for (let t = 0; t < seconds * 1000; t += 50) {
    await flush();
    mock.timers.tick(50);
    clock += 0.05;
  }
  await flush();
}
const press = () => listeners.keydown.forEach((f) => f({}));
/** Ends every sound's layer started and not yet ended, as the context would once each has played. */
function endAll() {
  for (const s of sources)
    if (s.started && !s.ended && typeof s.onended === 'function') {
      s.ended = true;
      s.onended();
    }
}
/** Plays a click and lets the context wake for it; asserts some layer of it started. */
async function click() {
  const before = sources.length;
  assert.ok(S.sfx('click'), 'the click played');
  assert.ok(sources.slice(before).some((s) => s.started && typeof s.onended === 'function'));
  await wait(0.1);
  assert.equal(ac!.state, 'running');
}

const S = await import('../src/lib/sound.ts');
S.installUiSounds();

test('ambience 0: once the last layer has ended, the context is suspended 1.5 s later, not before', async () => {
  assert.equal(S.getAmbience(), 0);
  // The first press builds the bus and loads the click.
  press();
  await wait(3);
  await click();
  endAll();
  await wait(1.4);
  assert.equal(ac!.state, 'running');
  await wait(0.2);
  assert.equal(ac!.state, 'suspended');
});

test('ambience 0: a sound started within the 1.5 s keeps the context running until 1.5 s after its own layers end', async () => {
  await click();
  endAll();
  await wait(1);
  await click();
  // Past when the first sound's rest would have come.
  await wait(1);
  assert.equal(ac!.state, 'running');
  endAll();
  await wait(1.4);
  assert.equal(ac!.state, 'running');
  await wait(0.2);
  assert.equal(ac!.state, 'suspended');
});

test('ambience on: a sound’s layers ending never suspends the context', async () => {
  S.setAmbience(1);
  await wait(2);
  await click();
  endAll();
  await wait(5);
  assert.equal(ac!.state, 'running');
});

test('the battery saver silences the game as muting does, the sound’s own settings left as they are', async () => {
  // (The ambience on, from the case before: its loops keep the context running.)
  setSaving(true);
  assert.equal(S.isMuted(), false);
  const before = sources.length;
  assert.equal(S.sfx('click'), undefined);
  assert.ok(!sources.slice(before).some((s) => s.started), 'nothing played');
  await wait(3);
  assert.equal(ac!.state, 'suspended');
  setSaving(false);
  await wait(0.5);
  await click();
});
