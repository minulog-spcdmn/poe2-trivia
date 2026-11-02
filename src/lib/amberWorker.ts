// Paints the fossils' amber (lib/amber.ts) away from the page's main thread:
// a card's amber is up to a million pixels, each worked out from its
// thickness, its pours and planes and what lies in it, a few hundred ms of
// the CPU; and what a fossil's emblem is in it (its body and rim, from its mask).

import { paintAmber, paintInclusion, type AmberJob } from './amber';

/** An emblem caught in the amber: its mask's image, drawn W x H at `s` device px to a layout px. */
export type InclusionJob = { image: Blob; W: number; H: number; s: number; grain: number };
export type AmberAsk = { id: number; job: AmberJob } | { id: number; inclusion: InclusionJob };
export type AmberAnswer = { id: number; png?: Blob; rim?: Blob };

const png = (px: Uint8ClampedArray, W: number, H: number) => {
  const canvas = new OffscreenCanvas(W, H);
  canvas.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
};

self.onmessage = async ({ data }: MessageEvent<AmberAsk>) => {
  try {
    if ('job' in data) {
      const { W, H } = data.job;
      self.postMessage({ id: data.id, png: await png(paintAmber(data.job), W, H) } satisfies AmberAnswer);
      return;
    }
    const { image, W, H, s, grain } = data.inclusion;
    const bitmap = await createImageBitmap(image);
    const canvas = new OffscreenCanvas(W, H);
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bitmap, 0, 0, W, H);
    bitmap.close();
    const rgba = g.getImageData(0, 0, W, H).data;
    const alpha = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) alpha[p] = rgba[p * 4 + 3] / 255;
    const { body, rim } = paintInclusion(alpha, W, H, s, grain);
    const [b, r] = await Promise.all([png(body, W, H), png(rim, W, H)]);
    self.postMessage({ id: data.id, png: b, rim: r } satisfies AmberAnswer);
  } catch {
    self.postMessage({ id: data.id } satisfies AmberAnswer);
  }
};
