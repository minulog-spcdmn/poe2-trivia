import { test } from 'node:test';
import assert from 'node:assert/strict';
import { losslessWebp } from '../src/lib/webp.ts';

/** A chunk: its tag, its size (little-endian) and its data, padded to even. */
function chunk(tag: string, size: number, data = new Uint8Array(size)): number[] {
  const out = [...tag].map((c) => c.charCodeAt(0));
  out.push(size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, (size >>> 24) & 0xff, ...data);
  if (data.length & 1) out.push(0);
  return out;
}

/** A WebP file of these chunks. */
function webp(...chunks: number[][]): Uint8Array {
  const body = [...'WEBP'].map((c) => c.charCodeAt(0)).concat(...chunks);
  return new Uint8Array(chunk('RIFF', body.length, new Uint8Array(body)));
}

test('a simple lossless file is lossless, a simple lossy one is not', () => {
  assert.equal(losslessWebp(webp(chunk('VP8L', 10))), true);
  assert.equal(losslessWebp(webp(chunk('VP8 ', 10))), false);
});

test('the image chunk is found past an extended header and colour profile', () => {
  // As Chromium writes it: VP8X, ICCP, then the image.
  assert.equal(losslessWebp(webp(chunk('VP8X', 10), chunk('ICCP', 456), chunk('VP8L', 30))), true);
  // A lossy picture with alpha keeps it in an ALPH chunk before VP8.
  assert.equal(losslessWebp(webp(chunk('VP8X', 10), chunk('ALPH', 21), chunk('VP8 ', 30))), false);
});

test('odd-sized chunks are padded to even before the next one', () => {
  assert.equal(losslessWebp(webp(chunk('VP8X', 10), chunk('ICCP', 7), chunk('VP8L', 30))), true);
});

test('anything else is not taken as lossless', () => {
  assert.equal(losslessWebp(new Uint8Array(0)), false);
  // A PNG (what a browser that can't encode WebP gives back).
  assert.equal(losslessWebp(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Uint8Array(24)])), false);
  // No image chunk, or one cut off by a size running past the end (high bit set).
  assert.equal(losslessWebp(webp(chunk('VP8X', 10))), false);
  const huge = webp(chunk('ICCP', 4), chunk('VP8L', 4));
  huge[12 + 7] = 0xff;
  assert.equal(losslessWebp(huge), false);
});
