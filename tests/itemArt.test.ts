import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Item } from '../src/lib/game.ts';
import { ART_SCALE } from '../src/lib/ui-paths.ts';

const ROOT = join(import.meta.dirname, '..');
const items: Item[] = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'items.json'), 'utf8'));

/** A WebP file's width and height, from its header. */
function webpSize(file: string): [number, number] {
  const b = readFileSync(file);
  assert.equal(b.toString('latin1', 0, 4), 'RIFF', file);
  assert.equal(b.toString('latin1', 8, 12), 'WEBP', file);
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1];
  }
  throw new Error(`${file}: unknown WebP kind ${kind}`);
}

test('every item has its original art and an upscaled copy ART_SCALE times its size, and nothing else', () => {
  const ids = items.map((it) => `${it.id}.webp`).sort();
  assert.deepEqual(readdirSync(join(ROOT, 'art-source', 'items')).sort(), ids);
  assert.deepEqual(readdirSync(join(ROOT, 'public', 'items')).sort(), ids);
  for (const it of items) {
    const [w, h] = webpSize(join(ROOT, 'art-source', 'items', `${it.id}.webp`));
    const [W, H] = webpSize(join(ROOT, 'public', 'items', `${it.id}.webp`));
    assert.deepEqual([W, H], [w * ART_SCALE, h * ART_SCALE], `${it.name}: run scripts/upscale-art.py`);
  }
});
