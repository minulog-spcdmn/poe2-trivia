// lib/sound.ts makes its bus (its audio context, which holds the page up 25
// to 65 ms) as a finger lands on the visit's first control, while it's still
// down, before the click, so none of it lands in the screen the click brings
// in (the codex, say); the finger's lift wakes it, once that screen's first
// frame is drawn (wake, tests/soundWake.test.ts). Nor sooner:
// nothing is made before a press, as a context made without a gesture is one
// Chrome warns of. And the hall's reverb that press starts working out comes
// even on a page that never idles. Safari's way (no requestIdleCallback, so
// the idle moment is a timer) but where said, against a fake AudioContext,
// fetch and clock.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.split('?')[0].endsWith('/src/lib/sound.ts')) return loaded;
    return { ...loaded, source: String(loaded.source).replaceAll('import.meta.env.BASE_URL', '"/"') };
  },
});

mock.timers.enable({ apis: ['setTimeout', 'Date'] });
const g = globalThis as Record<string, unknown>;
Object.defineProperty(globalThis, 'performance', { value: { now: () => Date.now() }, configurable: true });
g.localStorage = { getItem: () => null, setItem() {} };
// A touch's pointerdown isn't a gesture; its pointerup and touchend are.
const activation = { hasBeenActive: false };
Object.defineProperty(globalThis, 'navigator', { value: { userActivation: activation }, configurable: true });
const listeners: Record<string, ((e: unknown) => void)[]> = {};
g.addEventListener = (type: string, f: (e: unknown) => void) => (listeners[type] ??= []).push(f);
g.document = { hidden: false, visibilityState: 'visible', baseURI: 'https://poe2.quest/', documentElement: { hasAttribute: () => false }, location: { pathname: '/' }, addEventListener() {} };

const fetched: string[] = [];
g.fetch = (u: URL) => {
  const file = String(u).replace(/^.*\/sfx\//, '').replace('.mp3', '');
  fetched.push(file);
  return new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200, arrayBuffer: async () => ({ file }) }), 100));
};

const param = (value: number) => ({ value, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ connect: (m: unknown) => m, disconnect() {} });
const contexts: { state: string }[] = [];
const convolvers: { buffer?: unknown }[] = [];
g.AudioContext = class {
  state = 'suspended';
  sampleRate = 8000;
  currentTime = 0;
  destination = node();
  constructor() {
    contexts.push(this);
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
  createGain = () => ({ ...node(), gain: param(1) });
  createBiquadFilter = () => ({ ...node(), frequency: param(350), Q: param(1), gain: param(0) });
  createDynamicsCompressor = () => ({ ...node(), threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) });
  createConvolver = () => {
    const c: { buffer?: unknown } & ReturnType<typeof node> = node();
    convolvers.push(c);
    return c;
  };
  createOscillator = () => ({ ...node(), frequency: param(440), start() {}, stop() {} });
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / sampleRate, length, sampleRate, numberOfChannels: channels, getChannelData: (c: number) => data[c] };
  }
  createBufferSource() {
    return { ...node(), buffer: null, loop: false, playbackRate: param(1), detune: param(0), start() {}, stop() {} };
  }
  decodeAudioData = async (data: { file: string }) => ({ duration: 0.2, file: data.file });
};

async function wait(ms: number) {
  for (let t = 0; t < ms; t += 10) {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    mock.timers.tick(10);
  }
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** A page of its own: sound.ts loaded afresh, nothing pressed yet. */
async function freshPage(name: string) {
  for (const type of Object.keys(listeners)) delete listeners[type];
  contexts.length = 0;
  convolvers.length = 0;
  fetched.length = 0;
  activation.hasBeenActive = false;
  const S = await import(`../src/lib/sound.ts?${name}`);
  S.installUiSounds();
}

const fire = (type: string, e: object = {}) => listeners[type]?.forEach((f) => f({ type, ...e }));
const button = { disabled: false, closest: () => null };
const land = () => {
  fire('pointerover', { pointerType: 'touch' });
  fire('pointerdown', { pointerType: 'touch', button: 0 });
};
const lift = () => {
  activation.hasBeenActive = true;
  fire('pointerup', { pointerType: 'touch' });
  fire('touchend');
  fire('click', { target: { closest: () => button } });
};

test('nothing is made before a press, however long the page waits', async () => {
  await freshPage('waits');
  await wait(5000);
  assert.equal(contexts.length, 0);
  assert.equal(fetched.length, 0);
});

test('a finger held a moment: the bus is made while it is down, woken as it lifts, and the click makes nothing', async () => {
  await freshPage('held');
  land();
  assert.equal(contexts.length, 0, 'not in the pointerdown');
  await wait(80);
  assert.equal(contexts.length, 1, 'made while the finger is down');
  assert.equal(contexts[0].state, 'suspended', 'not woken by a press that is no gesture yet');
  assert.equal(fetched.length, 0, 'nothing loads before sound may play');
  lift();
  assert.equal(contexts.length, 1, 'the same context');
  // Woken from the lift's own wake, once the frame in hand is drawn (here no frames: on its first timer), not in the tap.
  assert.equal(contexts[0].state, 'suspended', 'not woken in the tap itself');
  await wait(10);
  assert.equal(contexts[0].state, 'running', 'woken by the lift');
  // The screen the click brings in: nothing more is made there.
  await wait(2000);
  assert.equal(contexts.length, 1);
  assert.ok(fetched.length > 0, 'its sounds load');
});

test('a quick tap, lifted before the press has its moment: made in the lift, still before the click, and woken from it', async () => {
  await freshPage('quick');
  land();
  await wait(20);
  assert.equal(contexts.length, 0);
  // (The click only ever asks for it in a moment: made by now, it was made in the lift.)
  lift();
  assert.equal(contexts.length, 1, 'made in the lift');
  await wait(10);
  assert.equal(contexts[0].state, 'running', 'and woken once the frame in hand is drawn');
  await wait(2000);
  assert.equal(contexts.length, 1, 'the press, when its moment comes, finds it made');
});

test('on a page that never idles, the hall still comes: the reverb takes its impulse all the same', async () => {
  // (Chrome's way, every idle moment taken: only a wait's timeout ever comes.)
  g.requestIdleCallback = (f: () => void, o?: { timeout: number }) => (o ? setTimeout(f, o.timeout) : 0);
  try {
    await freshPage('busy');
    land();
    lift();
    assert.equal(convolvers.length, 1);
    // Its steps, here with no worker, half a second each at most; then half a second more to take it in.
    await wait(300 + 9 * 500 + 500);
    assert.ok(convolvers[0].buffer, 'the reverb has its impulse');
  } finally {
    delete g.requestIdleCallback;
  }
});
