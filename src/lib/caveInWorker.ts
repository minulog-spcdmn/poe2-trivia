// Works an Azurite Vein's cave-in out (lib/caveInNoise.ts) away from the
// page's main thread: on an iPhone each of its parts held the page 48 to 65
// ms, two of them a frame each in the second after a Delve's Begin.

import { caveInLength, caveInParts } from './caveInNoise.ts';

export type CaveInJob = { sampleRate: number };
export type CaveInAnswer = { left: Float32Array; right: Float32Array };

self.onmessage = ({ data: job }: MessageEvent<CaveInJob>) => {
  const len = caveInLength(job.sampleRate);
  const [left, right] = [new Float32Array(len), new Float32Array(len)];
  const parts = caveInParts(job.sampleRate, left, right);
  while (!parts.next().done);
  self.postMessage({ left, right } satisfies CaveInAnswer, { transfer: [left.buffer, right.buffer] });
};
