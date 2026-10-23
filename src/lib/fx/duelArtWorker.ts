// Builds the deathmatch's plate (lib/plates/duel.ts) away from the page's
// main thread and paints it (duelPaint.ts) on an OffscreenCanvas, answering
// with its pixels; where it can't paint, with the plate, for the page to.

import { build, type DuelPlate } from '../plates/duel.ts';
import { paintDuel } from './duelPaint.ts';

export type DuelJob = { size: number };
export type DuelAnswer = { pixels?: Uint8Array; plate?: DuelPlate; error?: string };

self.onmessage = ({ data: { size } }: MessageEvent<DuelJob>) => {
  try {
    const plate = build();
    let pixels: Uint8Array | undefined;
    try {
      // (Painted to be read back: in memory, not on the GPU.)
      const ctx = new OffscreenCanvas(size, size).getContext('2d', { willReadFrequently: true });
      if (ctx) {
        paintDuel(ctx, size, plate);
        pixels = new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer);
      }
    } catch {
      pixels = undefined;
    }
    if (pixels) self.postMessage({ pixels } satisfies DuelAnswer, { transfer: [pixels.buffer] });
    else self.postMessage({ plate } satisfies DuelAnswer);
  } catch (e) {
    self.postMessage({ error: String(e) } satisfies DuelAnswer);
  }
};
