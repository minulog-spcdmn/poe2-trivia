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
