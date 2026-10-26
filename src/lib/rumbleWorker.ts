// Works out Delve's rumble (lib/rumbleNoise.ts) away from the page's main
// thread: on an iPhone its 6 s of noise held the page for about 75 ms, a
// frame or two after Begin.

import { fillRumble, rumbleLength } from './rumbleNoise';

export type RumbleJob = { sampleRate: number; lp: number };
export type RumbleAnswer = { left: Float32Array; right: Float32Array };

self.onmessage = ({ data: job }: MessageEvent<RumbleJob>) => {
  const len = rumbleLength(job.sampleRate);
  const [left, right] = [new Float32Array(len), new Float32Array(len)];
  fillRumble(job.sampleRate, job.lp, left, right);
  self.postMessage({ left, right } satisfies RumbleAnswer, { transfer: [left.buffer, right.buffer] });
};
