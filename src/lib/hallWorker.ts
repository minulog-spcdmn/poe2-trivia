// Works out the hall's impulse (lib/hallNoise.ts) away from the page's main
// thread: on an iPhone its steps held the page over the second after the
// first tap, as that tap's screen (the codex, say) came in.

import { fillHall, hallLength } from './hallNoise.ts';

export type HallJob = { sampleRate: number };
export type HallAnswer = { left: Float32Array<ArrayBuffer>; right: Float32Array<ArrayBuffer> };

self.onmessage = ({ data: job }: MessageEvent<HallJob>) => {
  const [left, right] = [0, 1].map(() => new Float32Array(hallLength(job.sampleRate)));
  for (const d of [left, right]) fillHall(d, job.sampleRate, 0, d.length, 0);
  self.postMessage({ left, right } satisfies HallAnswer, { transfer: [left.buffer, right.buffer] });
};
