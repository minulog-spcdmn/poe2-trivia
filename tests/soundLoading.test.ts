// How lib/sound.ts loads its files and lets go of them, against a fake
// AudioContext, fetch and clock: Delve's beds are let go of once they fall
// silent and fetched again when wanted, a file that fails to load is tried
// again only after a wait that grows, and a moment's layer that failed is
// tried again when the moment plays.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Vite fills in import.meta.env; here the site is served from the root.
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
Object.defineProperty(globalThis, 'navigator', { value: { userActivation: { hasBeenActive: true } }, configurable: true });
const listeners: Record<string, ((e: unknown) => void)[]> = {};
g.addEventListener = (type: string, f: (e: unknown) => void) => (listeners[type] ??= []).push(f);
g.document = { hidden: false, visibilityState: 'visible', baseURI: 'https://poe2.quest/', documentElement: { hasAttribute: () => false }, location: { pathname: '/' }, addEventListener() {} };

/** What the fake network does with each file: how long it takes, and whether it fails or answers 404. */
const net = { delay: 300, down: new Set<string>(), missing: new Set<string>(), fetched: [] as string[] };
g.fetch = (u: URL) => {
  const file = String(u).replace(/^.*\/sfx\//, '').replace('.mp3', '');
  net.fetched.push(file);
  const [down, missing] = [net.down.has(file), net.missing.has(file)];
  return new Promise((resolve, reject) =>
    setTimeout(() => (down ? reject(new TypeError('Failed to fetch')) : resolve({ ok: !missing, status: missing ? 404 : 200, arrayBuffer: async () => ({ file }) })), net.delay),
  );
};
const fetches = (file: string) => net.fetched.filter((f) => f === file).length;

type Param = { value: number; events: unknown[][] };
const param = (value: number) => {
  const p: Param & Record<string, (...a: number[]) => unknown> = {
    value,
    events: [],
    setValueAtTime: (v, t) => p.events.push(['set', v, t]),
    setTargetAtTime: (v, t, tc) => p.events.push(['target', v, t, tc]),
    linearRampToValueAtTime: (v, t) => p.events.push(['ramp', v, t]),
    cancelScheduledValues: (t) => (p.events = p.events.filter((e) => (e[2] as number) < t)),
  };
  return p;
};
type FakeSource = { buffer: { file?: string } | null; loop: boolean; started: boolean; stopped: boolean; outs: unknown[] };
const sources: FakeSource[] = [];
const node = () => {
  const n = { outs: [] as unknown[], connect: (m: unknown) => (n.outs.push(m), m), disconnect: () => (n.outs = []) };
  return n;
};
let clock = 0;
g.AudioContext = class {
  state = 'suspended';
  sampleRate = 8000;
  destination = node();
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
  createDynamicsCompressor = () => ({ ...node(), threshold: param(0), knee: param(0), ratio: param(0) });
  createConvolver = () => node();
  createOscillator = () => ({ ...node(), frequency: param(440), start() {}, stop() {} });
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / sampleRate, length, sampleRate, getChannelData: (c: number) => data[c] };
  }
  createBufferSource() {
    const s = { ...node(), buffer: null, loop: false, started: false, stopped: false, playbackRate: param(1) } as FakeSource & Record<string, unknown>;
    s.start = () => (s.started = true);
    s.stop = () => (s.stopped = true);
    sources.push(s);
    return s;
  }
  decodeAudioData = async (data: { file: string }) => ({ duration: 30, file: data.file });
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
/** The beds' layers sounding now. */
const beds = () => sources.filter((s) => s.loop && s.started && !s.stopped && s.buffer?.file?.startsWith('amb-') && s.buffer.file !== 'amb-game-4' && s.buffer.file !== 'amb-fire');

const S = await import('../src/lib/sound.ts');
const { ZONE_AMBIENCE, MOMENTS } = await import('../src/lib/soundDesign.ts');
const mines = ZONE_AMBIENCE[0].layers[0].file;
const magma = ZONE_AMBIENCE[1].layers[0].file;
const frozen = ZONE_AMBIENCE[2].layers[0].file;
const click = MOMENTS.click.layers[0].file;

S.installUiSounds();

test('a moment layer that failed to load as sound started is tried again once its wait is over', async () => {
  net.down.add(click);
  press();
  await wait(2);
  assert.equal(fetches(click), 1);
  net.down.delete(click);
  // Within its wait, a click doesn't fetch it again; after it, one does, and the next click plays it.
  S.sfx('click');
  await wait(1);
  assert.equal(fetches(click), 1);
  await wait(10);
  S.sfx('click');
  await wait(1);
  assert.equal(fetches(click), 2);
  const before = sources.length;
  S.sfx('click');
  assert.ok(sources.slice(before).some((s) => s.buffer?.file === click));
});

test("a bed that fails to load is tried again after 10 s, then 20 s, not at every key press", async () => {
  net.down.add(mines);
  net.missing.add(magma);
  S.depthAmbience(1);
  // A minute of a held key: 10 presses a second.
  for (let i = 0; i < 600; i++) {
    press();
    await wait(0.1);
  }
  // Tried at once, after 10 s and after 20 more; the next try is due 40 s after that.
  assert.equal(fetches(mines), 3);
  // A 404 counts as a failure too (the Magma Fissure's bed is fetched ahead, from the first depth).
  assert.equal(fetches(magma), 3);
  assert.equal(beds().length, 0);
  net.down.clear();
  net.missing.clear();
  await wait(40);
  press();
  await wait(1);
  assert.deepEqual(beds().map((s) => s.buffer?.file), [mines]);
});

test('a bed is let go of once it falls silent, and fetched again when wanted', async () => {
  for (let d = 2; d <= 25; d++) {
    S.depthAmbience(d);
    await wait(4);
  }
  assert.deepEqual(beds().map((s) => s.buffer?.file), [frozen]);
  const [m, f] = [fetches(mines), fetches(frozen)];
  // Back to the Mines in a new run: its bed was let go of, so it is fetched again, and plays.
  S.depthAmbience(0);
  await wait(15);
  assert.equal(beds().length, 0);
  S.depthAmbience(1);
  await wait(2);
  assert.equal(fetches(mines), m + 1);
  assert.deepEqual(beds().map((s) => s.buffer?.file), [mines]);
  // Frozen Hollow's was let go of too: down there again, it is fetched again.
  S.depthAmbience(25);
  await wait(12);
  assert.equal(fetches(frozen), f + 1);
  assert.deepEqual(beds().map((s) => s.buffer?.file), [frozen]);
});

test('muted, a slow fade out goes as quickly as the ambience, before the context sleeps', async () => {
  S.depthAmbience(0);
  S.fireAmbience(true);
  await wait(10);
  const fire = sources.find((s) => s.loop && s.started && !s.stopped && s.buffer?.file === 'amb-fire')!;
  assert.ok(fire);
  S.setMuted(true);
  // The fire's level: its gain node, the one sending both to the mix and to the reverb.
  let n = fire as unknown as { outs: { outs: unknown[] }[]; gain?: Param };
  while (n.outs.length !== 2) n = n.outs[0] as typeof n;
  const last = n.gain!.events.at(-1)!;
  assert.deepEqual([last[0], last[1], last[3]], ['target', 0, 0.2]);
  S.setMuted(false);
  S.fireAmbience(false);
});
