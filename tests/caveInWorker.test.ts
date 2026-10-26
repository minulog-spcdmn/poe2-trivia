import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { seeded } from './helpers.ts';

(globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem() {} };
const { caveIn, CAVE_IN_RATE } = await import('../src/lib/sound.ts');

/** Just enough of a worker's `self` to catch what it posts back. */
const posted: { message: { left: Float32Array; right: Float32Array }; transfer: ArrayBuffer[] }[] = [];
const self = {
  onmessage: null as null | ((e: { data: unknown }) => void),
  postMessage(message: never, options: { transfer: ArrayBuffer[] }) {
    posted.push({ message, transfer: options.transfer });
  },
};
(globalThis as { self?: unknown }).self = self;
await import('../src/lib/caveInWorker.ts');

/** Just enough of an AudioContext to build a buffer, at `sampleRate`. */
const context = (sampleRate: number) => ({
  sampleRate,
  createBuffer(channels: number, length: number, rate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate: rate, getChannelData: (c: number) => data[c] } as unknown as AudioBuffer;
  },
});

/** `f` run with Math.random rolling the same from the same seed. */
function rolling<T>(seed: number, f: () => T): T {
  const random = Math.random;
  Math.random = seeded(seed);
  try {
    return f();
  } finally {
    Math.random = random;
  }
}

test("the cave-in's worker works out the very cave-in the page does, both channels transferred", () => {
  const sr = Math.min(48000, CAVE_IN_RATE);
  const page = rolling(7, () => caveIn(context(48000)));
  rolling(7, () => self.onmessage!({ data: { sampleRate: sr } }));
  assert.equal(posted.length, 1);
  const { message, transfer } = posted[0];
  for (const [c, d] of [message.left, message.right].entries()) {
    const want = page.getChannelData(c);
    assert.equal(d.length, want.length);
    for (let i = 0; i < d.length; i++) if (d[i] !== want[i]) assert.fail(`channel ${c} differs at ${i}`);
    assert.ok(transfer.includes(d.buffer as ArrayBuffer), 'transferred, not copied');
  }
  assert.ok(page.getChannelData(0).some((v) => v !== 0), 'it sounds');
  // And the cave-in the page worked out before it moved here (07218dd7), from the same rolls.
  const hash = createHash('sha256').update(new Uint8Array(message.left.buffer)).update(new Uint8Array(message.right.buffer)).digest('hex');
  assert.equal(hash, 'ae6f1fdf4224e0c88cd7bc037c8e905985dc3f47e45dda9afa874bfe4310135c');
});
