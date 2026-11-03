// A browser that has Web Audio but refuses a context (`new AudioContext()`
// throws: no audio device to be had, too many contexts, audio switched off
// for the site) leaves the game silent: its presses and the moments' sounds
// go on without a sound and without an error, and it isn't asked again.
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
const activation = { hasBeenActive: false };
Object.defineProperty(globalThis, 'navigator', { value: { userActivation: activation }, configurable: true });
const listeners: Record<string, ((e: unknown) => void)[]> = {};
g.addEventListener = (type: string, f: (e: unknown) => void) => (listeners[type] ??= []).push(f);
g.document = { hidden: false, visibilityState: 'visible', baseURI: 'https://poe2.quest/', documentElement: { hasAttribute: () => false }, location: { pathname: '/' }, addEventListener() {} };
g.fetch = () => new Promise(() => {});

let asked = 0;
g.AudioContext = class {
  constructor() {
    asked++;
    throw new DOMException('The operation is not supported.', 'NotSupportedError');
  }
};

async function wait(ms: number) {
  for (let t = 0; t < ms; t += 10) {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    mock.timers.tick(10);
  }
}

const fire = (type: string, e: object = {}) => listeners[type]?.forEach((f) => f({ type, ...e }));
const button = { disabled: false, closest: () => null };

test('a context refused leaves the game silent: no error at a press or a sound, and it is asked for once', async () => {
  const S = await import('../src/lib/sound.ts');
  S.installUiSounds();
  // The first press: the bus is made in the next idle moment (a timer here, as on Safari).
  fire('pointerdown', { pointerType: 'touch', button: 0 });
  await wait(300);
  assert.equal(asked, 1);
  activation.hasBeenActive = true;
  fire('pointerup', { pointerType: 'touch' });
  fire('click', { target: { closest: () => button } });
  await wait(300);
  // A moment's sound, and more presses: nothing plays, nothing throws, nothing asks again.
  assert.doesNotThrow(() => S.sfx('click'));
  fire('pointerdown', { pointerType: 'touch', button: 0 });
  fire('click', { target: { closest: () => button } });
  await wait(1000);
  assert.equal(asked, 1);
});
