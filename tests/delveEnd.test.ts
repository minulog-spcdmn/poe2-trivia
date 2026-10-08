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

test('a run that perished sounds low and slow, and is no victory', () => {
  const { fallen, victory } = MOMENTS;
  for (const l of fallen.layers) assert.ok(l.rate < 1, `${l.file} is slowed down`);
  assert.ok(!fallen.layers.some((l) => victory.layers.some((v) => v.file === l.file && v.rate === l.rate)), 'no part of the victory fanfare');
});

test('the shared depth is a dare, with the site', () => {
  assert.equal(shareText(24), 'I reached depth 23 in Delve. Can you beat me? poe2.quest/?delve');
  assert.equal(shareText(41, true), 'We reached depth 40 in Delve together. Can you beat us? poe2.quest/?delve');
  // From the beta, the beta's link: the dare plays the same build.
  assert.equal(shareText(24, false, 'https://poe2.quest/beta/'), 'I reached depth 23 in Delve. Can you beat me? poe2.quest/beta/?delve');
  // A zone's first depth reads round; the first endless depth reads 100; a run that fell at once, 0.
  assert.equal(shareText(11), 'I reached depth 10 in Delve. Can you beat me? poe2.quest/?delve');
  assert.equal(shareText(101, true), 'We reached depth 100 in Delve together. Can you beat us? poe2.quest/?delve');
  assert.equal(shareText(1), 'I reached depth 0 in Delve. Can you beat me? poe2.quest/?delve');
  assert.equal(delveLink('https://poe2.quest/beta/'), 'poe2.quest/beta/?delve');
});
