import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUMBLE } from '../src/lib/soundDesign.ts';
import { rumbleLength } from '../src/lib/rumbleNoise.ts';

/** Just enough of a worker's `self` to catch what it posts back. */
const posted: { message: { left: Float32Array; right: Float32Array }; transfer: ArrayBuffer[] }[] = [];
const self = {
  onmessage: null as null | ((e: { data: unknown }) => void),
  postMessage(message: never, options: { transfer: ArrayBuffer[] }) {
    posted.push({ message, transfer: options.transfer });
  },
};
(globalThis as { self?: unknown }).self = self;
await import('../src/lib/rumbleWorker.ts');

test("the rumble's worker answers with both channels, the loop's length, right half a turn on, transferred not copied", () => {
  assert.ok(self.onmessage, 'the worker listens');
  self.onmessage!({ data: { sampleRate: 48000, lp: RUMBLE.lp } });
  assert.equal(posted.length, 1);
  const { message: { left, right }, transfer } = posted[0];
  const len = rumbleLength(48000);
  assert.equal(left.length, len);
  assert.equal(right.length, len);
  const half = len >> 1;
  for (let i = 0; i < len; i++) {
    if (right[i] !== left[(i + half) % len]) assert.fail(`right[${i}] isn't left half a turn on`);
  }
  assert.ok(transfer.includes(left.buffer as ArrayBuffer), "left's buffer transferred");
  assert.ok(transfer.includes(right.buffer as ArrayBuffer), "right's buffer transferred");
});

test('a rumble worker that never answers is let go, and the page works it out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  await import('./asVite.ts');
  const { rumbleThere, WORKER_WAIT_MS } = await import('../src/lib/sound.ts');
  let ended = false;
  /** A worker that loads and is asked, and says nothing. */
  (globalThis as { Worker?: unknown }).Worker = class {
    onmessage = null;
    onerror = null;
    onmessageerror = null;
    postMessage() {}
    terminate() {
      ended = true;
    }
  };
  const channels: Float32Array[] = [];
  const ac = { sampleRate: 8000, createBuffer: (n: number, len: number) => ({ getChannelData: (i: number) => (channels[i] ??= new Float32Array(len)), length: len, numberOfChannels: n }) };
  let buf: unknown = null;
  void rumbleThere(ac as never).then((b) => (buf = b));
  t.mock.timers.tick(WORKER_WAIT_MS - 1);
  await Promise.resolve();
  assert.equal(buf, null, 'still waiting');
  t.mock.timers.tick(1);
  await new Promise((r) => setImmediate(r));
  assert.ok(buf, 'worked out on the page');
  assert.equal(ended, true, 'the worker let go');
  delete (globalThis as { Worker?: unknown }).Worker;
});
