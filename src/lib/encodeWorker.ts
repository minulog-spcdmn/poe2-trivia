// Encodes the host's pictures for a question (media.svelte.ts: encode) away
// from the page's main thread: a canvas's toBlob there held the page up for
// a tenth of a second or more as a veiled picture's patches went out.

interface Job {
  id: number;
  w: number;
  h: number;
  /** RGBA, w × h. */
  pixels: ArrayBuffer;
  type: string;
  quality?: number;
}

self.onmessage = async ({ data: { id, w, h, pixels, type, quality } }: MessageEvent<Job>) => {
  try {
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), w, h), 0, 0);
    const data = await (await canvas.convertToBlob({ type, quality })).arrayBuffer();
    self.postMessage({ id, data }, { transfer: [data] });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
