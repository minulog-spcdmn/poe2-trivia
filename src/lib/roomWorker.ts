// Works Delve's rooms out (lib/acoustics.ts) away from the page's main
// thread: on an iPhone each of a room's steps held the page 40 to 140 ms
// there, a frame dropped for each, as the first cards of a run dealt in.

import { ROOMS, roomIR, roomSeed } from './acoustics';

/** A place's room, for a context at `sampleRate`, to the energy `like` (lib/spatial.svelte.ts). */
export type RoomJob = { id: number; place: string; sampleRate: number; like: number };
/** Its channels; none if it couldn't be worked out. */
export type RoomAnswer = { id: number; channels?: Float32Array<ArrayBuffer>[] };

self.onmessage = ({ data: job }: MessageEvent<RoomJob>) => {
  const channels: Float32Array<ArrayBuffer>[] = [];
  // Just enough of an AudioContext for a room to be made in (there's none in a worker).
  const ac = {
    sampleRate: job.sampleRate,
    createBuffer(n: number, length: number) {
      for (let c = 0; c < n; c++) channels.push(new Float32Array(length));
      return { getChannelData: (c: number) => channels[c]! } as unknown as AudioBuffer;
    },
  };
  try {
    roomIR(ac, ROOMS[job.place]!, job.like, roomSeed(job.place));
    self.postMessage({ id: job.id, channels } satisfies RoomAnswer, { transfer: channels.map((c) => c.buffer) });
  } catch {
    self.postMessage({ id: job.id } satisfies RoomAnswer);
  }
};
