// The hall's impulse (the reverb every sound plays into) is worked out in a
// worker (lib/hallWorker.ts), and a step per idle moment on the page where
// there's none (hallSteps in lib/sound.ts): from the same noise, the two give
// the same samples, so the reverb sounds the same whichever made it.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Just enough of a worker's `self` to catch what it posts back. */
const posted: { message: { channels: Float32Array[] }; transfer: ArrayBuffer[] }[] = [];
const self = {
  onmessage: null as null | ((e: { data: unknown }) => void),
  postMessage(message: never, options: { transfer: ArrayBuffer[] }) {
    posted.push({ message, transfer: options.transfer });
  },
};
(globalThis as { self?: unknown }).self = self;
(globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem() {} };
await import('../src/lib/hallWorker.ts');
const { hallLength } = await import('../src/lib/hallNoise.ts');
const { hallSteps } = await import('../src/lib/sound.ts');

/** Math.random's noise, the same run every time from `seed` (mulberry32). */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = Math.random;
const withNoise = <T>(seed: number, f: () => T): T => {
  Math.random = seeded(seed);
  try {
    return f();
  } finally {
    Math.random = random;
  }
};

test("the hall's worker answers with the page's own samples, both channels, transferred not copied", () => {
  const sampleRate = 8000;
  assert.ok(self.onmessage, 'the worker listens');
  withNoise(7, () => self.onmessage!({ data: { sampleRate } }));
  assert.equal(posted.length, 1);
  const { message: { channels }, transfer } = posted[0];
  // The page's way, against just enough of an AudioContext.
  const page = withNoise(7, () => {
    const data = [0, 1].map(() => new Float32Array(hallLength(sampleRate)));
    const ac = { sampleRate, createBuffer: () => ({ numberOfChannels: 2, getChannelData: (c: number) => data[c] }) as unknown as AudioBuffer };
    const steps = hallSteps(ac);
    for (let r = steps.next(); !r.done; r = steps.next());
    return data;
  });
  assert.equal(channels.length, 2);
  for (let c = 0; c < 2; c++) {
    assert.equal(channels[c].length, hallLength(sampleRate));
    assert.ok(channels[c].some((v) => v !== 0), 'it rings');
    assert.deepEqual(channels[c], page[c], `channel ${c} as the page works it out`);
    assert.ok(transfer.includes(channels[c].buffer as ArrayBuffer), `channel ${c}'s buffer transferred`);
  }
});
