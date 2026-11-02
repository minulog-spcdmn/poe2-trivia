// Paints the fossils' amber (lib/amber.ts) away from the page's main thread:
// a card's body is half a million pixels or more, each worked out from its
// thickness, its flows and what lies in it, a few hundred ms of the CPU.

import { paintAmber, type AmberJob } from './amber';

export type AmberAsk = { id: number; job: AmberJob };
export type AmberAnswer = { id: number; png?: Blob };

self.onmessage = async ({ data }: MessageEvent<AmberAsk>) => {
  try {
    const { W, H } = data.job;
    const canvas = new OffscreenCanvas(W, H);
    canvas.getContext('2d')!.putImageData(new ImageData(paintAmber(data.job) as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
    self.postMessage({ id: data.id, png: await canvas.convertToBlob({ type: 'image/png' }) } satisfies AmberAnswer);
  } catch {
    self.postMessage({ id: data.id } satisfies AmberAnswer);
  }
};
