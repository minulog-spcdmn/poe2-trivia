// lib/sound.ts makes its audio context, which holds the page up for 25 to
// 65 ms, in an idle moment: never in the hover (or the sound) that first
// wants it, which couldn't play anything yet anyway (nothing has loaded
// without the context). Against a fake AudioContext, fetch and clock.
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
g.requestIdleCallback = (f: () => void) => setTimeout(f, 50);
g.localStorage = { getItem: () => null, setItem() {} };
// Sound may play (the page has been clicked before), but nothing has been pressed here yet.
Object.defineProperty(globalThis, 'navigator', { value: { userActivation: { hasBeenActive: true } }, configurable: true });
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
const started: string[] = [];
let made = 0;
g.AudioContext = class {
  state = 'suspended';
  sampleRate = 8000;
  currentTime = 0;
  destination = node();
  constructor() {
    made++;
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
    return { duration: length / sampleRate, length, sampleRate, getChannelData: (c: number) => data[c] };
  }
  createBufferSource() {
    const s = { ...node(), buffer: null as { file: string } | null, loop: false, playbackRate: param(1), detune: param(0), start: () => s.buffer && started.push(s.buffer.file), stop() {} };
    return s;
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
const { MOMENTS } = await import('../src/lib/soundDesign.ts');
S.installUiSounds();

const button = {};
const hover = (x: number) =>
  listeners.pointerover.forEach((f) => f({ pointerType: 'mouse', target: { closest: () => button }, clientX: x, clientY: 10, timeStamp: Date.now() }));
const leave = () => listeners.pointerover.forEach((f) => f({ pointerType: 'mouse', target: { closest: () => null }, clientX: 0, clientY: 0, timeStamp: Date.now() }));

test('the first hover makes no audio context in its handler; the next idle moment does, and loads the sounds', async () => {
  hover(10);
  assert.equal(made, 0);
  assert.equal(fetched.length, 0);
  await wait(50);
  assert.equal(made, 1);
  assert.ok(fetched.includes(MOMENTS.hover.layers[0].file));
  // Once loaded, a hover plays.
  await wait(200);
  leave();
  hover(20);
  assert.ok(started.includes(MOMENTS.hover.layers[0].file));
  assert.equal(made, 1);
});
