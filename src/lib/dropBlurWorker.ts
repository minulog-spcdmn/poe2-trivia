// Blurs drop-shadow masks (dropBlur.ts) away from the page's main thread: a
// banner's took 20 to 30 ms, and it's made anew each turn, as the turn comes in.

import { blurMask } from './dropBlur';

export type BlurJob = { id: number; alpha: Float32Array; bw: number; bh: number; sigmas: number[] };
export type BlurAnswer = { id: number; blur: Uint8Array };

self.onmessage = ({ data: job }: MessageEvent<BlurJob>) => {
  const blur = blurMask(job.alpha, job.bw, job.bh, job.sigmas);
  self.postMessage({ id: job.id, blur } satisfies BlurAnswer, { transfer: [blur.buffer] });
};
