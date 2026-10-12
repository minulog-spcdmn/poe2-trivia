// A WebP file's width and height, from its header, for scripts/fetch-data.mjs
// and tests/itemArt.test.ts. Throws on anything that is not a whole WebP file
// (an error page saved in its place, a download cut short).

/** @param {Buffer} b the file's bytes; @param {string} name for the error */
export function webpSize(b, name = 'file') {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') throw new Error(`${name} is not a WebP file`);
  if (b.readUInt32LE(4) + 8 !== b.length) throw new Error(`${name} is cut short`);
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  throw new Error(`${name}: unknown WebP kind ${kind}`);
}
