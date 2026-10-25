// The arithmetic of lib/fineMask.ts, apart from the page so its worker
// (lib/fineMaskWorker.ts) can run it: an image's alpha, and copies of it
// shrunk, each pixel the average of the patch of the image it covers.

/** Steps between sizes, per octave. */
export const STEPS = 4;

/** The alpha of each of an image's RGBA pixels. */
export function alphaOf(rgba: Uint8ClampedArray): Uint8Array {
  const alpha = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]!;
  return alpha;
}

/** For each of `n` pixels across a line of `m`, the pixels it covers and by how much of each: an area average. */
function spans(m: number, n: number) {
  const k = m / n;
  return Array.from({ length: n }, (_, j) => {
    const [a, b] = [j * k, (j + 1) * k];
    const out: [number, number][] = [];
    for (let i = Math.floor(a); i < Math.min(m, Math.ceil(b)); i++) out.push([i, (Math.min(b, i + 1) - Math.max(a, i)) / k]);
    return out;
  });
}

/** The mask of a `w` x `h` image's `alpha`, `q` steps smaller (STEPS to an octave): white, as opaque as the image averaged over each pixel's patch. */
export function shrunk(alpha: Uint8Array, w: number, h: number, q: number): ImageData {
  const f = 2 ** (q / STEPS);
  const [W, H] = [Math.max(1, Math.round(w / f)), Math.max(1, Math.round(h / f))];
  // Across, then down.
  const across = new Float32Array(W * h);
  const xs = spans(w, W);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (const [i, wt] of xs[x]!) v += alpha[y * w + i]! * wt;
      across[y * W + x] = v;
    }
  const out = new ImageData(W, H);
  const ys = spans(h, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (const [i, wt] of ys[y]!) v += across[i * W + x]! * wt;
      const o = (y * W + x) * 4;
      out.data.fill(255, o, o + 3);
      out.data[o + 3] = Math.round(Math.min(255, v));
    }
  return out;
}
