// lib/sound.ts makes its bus ahead, in an idle moment once the game's page
// has loaded (installUiSounds' `ahead`), rather than after the first press,
// where on an iPhone it landed in the middle of the screen that press brought
// in. Made then, it waits: nothing loads and the context stays suspended
// until a press may wake it. Against a fake AudioContext, fetch and clock.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.endsWith('/src/lib/sound.ts')) return loaded;
    return { ...loaded, source: String(loaded.source).replaceAll('import.meta.env.BASE_URL', '"/"') };
  },
});

mock.timers.enable({ apis: ['setTimeout', 'Date'] });
const g = globalThis as Record<string, unknown>;
Object.defineProperty(globalThis, 'performance', { value: { now: () => Date.now() }, configurable: true });
// (Safari's way: no requestIdleCallback, so the idle moment is a timer.)
g.localStorage = { getItem: () => null, setItem() {} };
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
  createConvolver = () => node();
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
  for (let t = 0; t < ms; t += 50) {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    mock.timers.tick(50);
  }
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const S = await import('../src/lib/sound.ts');
S.installUiSounds({ ahead: true });

test('the bus is made in an idle moment after load, before any press, and waits suspended with nothing loaded', async () => {
  await wait(2000);
  assert.equal(contexts.length, 0, 'not while the page is still settling');
  await wait(1000);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].state, 'suspended');
  assert.equal(fetched.length, 0);
});

test('the first press only wakes it: the same context, resumed, and its sounds start loading', async () => {
  activation.hasBeenActive = true;
  listeners.pointerup.forEach((f) => f({ type: 'pointerup' }));
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].state, 'running');
  await wait(100);
  assert.ok(fetched.length > 0);
});
