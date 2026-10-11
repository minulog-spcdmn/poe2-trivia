// Telling a lossless WebP file from a lossy one by its chunks (media.svelte.ts
// encodes veiled patches losslessly). Kept free of the DOM so it can be
// tested on its own.

/**
 * Whether a WebP file holds a lossless image: a VP8L chunk. A lossy one has
 * a VP8 chunk instead; either may follow a VP8X header and ICCP or ALPH
 * chunks, which are skipped.
 */
export function losslessWebp(b: Uint8Array): boolean {
  const tag = (at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
  if (b.length < 20 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return false;
  // Chunks: a tag, a 32-bit little-endian size, the data padded to even.
  for (let at = 12; at + 8 <= b.length; ) {
    const t = tag(at);
    if (t === 'VP8L') return true;
    if (t === 'VP8 ') return false;
    const size = (b[at + 4] | (b[at + 5] << 8) | (b[at + 6] << 16) | (b[at + 7] << 24)) >>> 0;
    at += 8 + size + (size & 1);
  }
  return false;
}
