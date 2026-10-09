import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Item } from '../src/lib/game.ts';
import { ART_SCALE } from '../src/lib/ui-paths.ts';

const ROOT = join(import.meta.dirname, '..');
const items: Item[] = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'items.json'), 'utf8'));
const SITE = join(ROOT, 'public', 'items');
/** The smaller copies' longest sides (THUMBS in scripts/upscale-art.py, itemThumb). */
const THUMBS = [256, 128];

/** A WebP file's width and height, from its header (the originals in art-source/). */
function webpSize(file: string): [number, number] {
  const b = readFileSync(file);
  assert.equal(b.toString('latin1', 0, 4), 'RIFF', file);
  assert.equal(b.toString('latin1', 8, 12), 'WEBP', file);
  assert.equal(b.readUInt32LE(4) + 8, b.length, `${file} is cut short`);
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  throw new Error(`${file}: unknown WebP kind ${kind}`);
}

/** An AVIF file's width and height (its first 'ispe' box), and the file is whole: its top-level boxes add up to its length. */
function avifSize(file: string): [number, number] {
  const b = readFileSync(file);
  assert.equal(b.toString('latin1', 4, 8), 'ftyp', file);
  let at = 0;
  while (at < b.length) {
    const size = b.readUInt32BE(at);
    assert.ok(size >= 8, `${file}: a box of ${size} bytes`);
    at += size;
  }
  assert.equal(at, b.length, `${file} is cut short`);
  const ispe = b.indexOf('ispe', 0, 'latin1');
  assert.ok(ispe > 0, `${file}: no size`);
  return [b.readUInt32BE(ispe + 8), b.readUInt32BE(ispe + 12)];
}

const files = (dir: string) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((f) => f.isFile())
    .map((f) => f.name)
    .sort();

test('every item has its original art, an upscaled copy ART_SCALE times its size and its smaller copies, and nothing else', () => {
  const ids = items.map((it) => it.id).sort();
  assert.deepEqual(files(join(ROOT, 'art-source', 'items')), ids.map((id) => `${id}.webp`));
  assert.deepEqual(files(SITE), ids.map((id) => `${id}.avif`));
  for (const t of THUMBS) assert.deepEqual(files(join(SITE, String(t))), ids.map((id) => `${id}.avif`), `public/items/${t}/`);
  for (const it of items) {
    const [w, h] = webpSize(join(ROOT, 'art-source', 'items', `${it.id}.webp`));
    const [W, H] = avifSize(join(SITE, `${it.id}.avif`));
    assert.deepEqual([W, H], [w * ART_SCALE, h * ART_SCALE], `${it.name}: run scripts/upscale-art.py`);
    for (const t of THUMBS) {
      const [tw, th] = avifSize(join(SITE, String(t), `${it.id}.avif`));
      assert.equal(Math.max(tw, th), Math.min(t, Math.max(W, H)), `${it.name}: ${t} px copy`);
      assert.ok(Math.abs(tw / th - W / H) < 0.05, `${it.name}: ${t} px copy keeps its shape`);
    }
  }
});
