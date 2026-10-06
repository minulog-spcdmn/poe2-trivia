import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CAVE_IN, MOMENTS, RUMBLE } from '../src/lib/soundDesign.ts';
import { delveLink, shareText } from '../src/lib/delveShare.ts';

const sfx = join(import.meta.dirname, '..', 'public', 'sfx');

test('every sound layer plays a file that exists (or one worked out in lib/sound.ts)', () => {
  const made = new Set([RUMBLE.file, CAVE_IN.file]);
  for (const [name, m] of Object.entries(MOMENTS))
    for (const l of m.layers) assert.ok(made.has(l.file) || existsSync(join(sfx, `${l.file}.mp3`)), `${name}: ${l.file}`);
});

test('a fallen run sounds low and slow, from files other moments already load', () => {
  const { fallen, victory, ...rest } = MOMENTS;
  const others = new Set([victory, ...Object.values(rest)].flatMap((m) => m.layers.map((l) => l.file)));
  for (const l of fallen.layers) {
    assert.ok(others.has(l.file), `${l.file} adds a download`);
    assert.ok(l.rate < 1, `${l.file} is slowed down`);
  }
  assert.ok(!fallen.layers.some((l) => victory.layers.some((v) => v.file === l.file && v.rate === l.rate)), 'no part of the victory fanfare');
});

test('the shared depth is a dare, with the site', () => {
  assert.equal(shareText(23), 'I reached depth 23 in Delve, can you beat me? poe2.quest/?delve');
  assert.equal(shareText(40, true), 'We reached depth 40 in Delve together, can you beat us? poe2.quest/?delve');
  // From the beta, the beta's link: the dare plays the same build.
  assert.equal(shareText(23, false, 'https://poe2.quest/beta/'), 'I reached depth 23 in Delve, can you beat me? poe2.quest/beta/?delve');
  assert.equal(delveLink('https://poe2.quest/beta/'), 'poe2.quest/beta/?delve');
});
