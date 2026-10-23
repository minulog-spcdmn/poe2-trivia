// A drop-shadow mask's blur (lib/backdropDropShadow.ts): its shape's alpha
// blurred once per shadow, in floating point, and kept at 16-bit precision
// (two 8-bit channels) so the shadow's own gradient can't band. Pure, so the
// worker (dropBlurWorker.ts) and the page alike can run it.

/** Separable Gaussian blur of `src` (w x h), in floating point. */
export function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp((-i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) {
        const xx = x + i;
        if (xx >= 0 && xx < w) v += src[y * w + xx] * k[i + r];
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) {
        const yy = y + i;
        if (yy >= 0 && yy < h) v += tmp[yy * w + x] * k[i + r];
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** The mask's alpha (bw x bh) blurred by each of `sigmas` (in texels, two at most): RGBA, the first in R+G, the second in B+A. */
export function blurMask(alpha: Float32Array, bw: number, bh: number, sigmas: number[]): Uint8Array {
  const blur = new Uint8Array(bw * bh * 4);
  sigmas.forEach((sigma, k) => {
    const b = gaussianBlur(alpha, bw, bh, sigma);
    for (let i = 0; i < b.length; i++) {
      const v = Math.min(1, Math.max(0, b[i])) * 255;
      const hi = Math.floor(v);
      blur[i * 4 + k * 2] = hi;
      blur[i * 4 + k * 2 + 1] = Math.round((v - hi) * 255);
    }
  });
  return blur;
}
