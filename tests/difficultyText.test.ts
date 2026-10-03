import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTY_NAMES, deathmatchText, describe, KNOB_TEXT, lockoutText } from '../src/lib/difficultyText.ts';
import { KNOB_STEPS, PRESETS, type Knobs } from '../src/lib/game.ts';

test('presets are described the same way in both modes, but their tiles only in race', () => {
  assert.equal(
    describe({ difficulty: 'cruel', mode: 'turns' }),
    'Four options of the same kind (all rings, all bows…). Some questions ask you to find the art for a name.',
  );
  assert.equal(
    describe({ difficulty: 'merciless', mode: 'turns' }),
    'Six options, half of them with look-alike names. Some questions ask you to find the art for a name. In race, tiles hide the art and lift one by one.',
  );
  assert.equal(
    describe({ difficulty: 'eternal', mode: 'race' }),
    'Eight options, all with look-alike names and two made up. Half the questions ask you to find the art for a name. Tiles hide the art and lift slowly. "Find the art" pictures are shown without colour. Some art is mirrored.',
  );
  assert.match(describe({ difficulty: 'eternal', mode: 'turns' }), /In race, tiles hide the art and lift slowly\./);
});

test('custom tiles apply in both modes, and only what can happen is described', () => {
  const custom: Knobs = { ...PRESETS.cruel, veil: 'slowest', fakes: 1, mirror: 1, grayscale: 'all' };
  assert.equal(
    describe({ difficulty: 'custom', custom, mode: 'turns' }),
    'Four options of the same kind (all rings, all bows…), one of them made up. Some questions ask you to find the art for a name. Tiles hide the art and lift very slowly. All art is shown without colour. All art is mirrored.',
  );
  // No "name the art" questions, so no tiles; no "find the art" ones, so no grayscale pictures to mention.
  assert.doesNotMatch(describe({ difficulty: 'custom', custom: { ...custom, artChance: 1 } }), /Tiles/);
  assert.doesNotMatch(describe({ difficulty: 'custom', custom: { ...PRESETS.eternal, artChance: 0 } }), /colour/);
});

test('every step of every knob has a label, and none repeats within a knob', () => {
  assert.deepEqual(KNOB_TEXT.map((k) => k.key).sort(), Object.keys(KNOB_STEPS).sort());
  for (const knob of KNOB_TEXT) {
    const labels = (KNOB_STEPS[knob.key] as readonly unknown[]).map((v) => (knob.label as (v: unknown) => string)(v));
    assert.equal(new Set(labels).size, labels.length, knob.key);
    for (const l of labels) assert.match(l, /^([A-Z][a-z]*( [a-z]+)*|\d+)$/, `${knob.key}: ${l}`);
  }
});

test('big questions without look-alikes only promise one kind where the category allows it', () => {
  assert.match(describe({ difficulty: 'custom', custom: { ...PRESETS.cruel, options: 10 } }), /^Ten options of the same kind where the category allows \(/);
  assert.match(describe({ difficulty: 'cruel' }), /^Four options of the same kind \(/);
});

test('deathmatch and lockout wording, and a name for every difficulty', () => {
  assert.equal(deathmatchText('cruel'), 'Questions are played on Merciless.');
  assert.equal(deathmatchText('eternal'), 'Questions go one step past Eternal.');
  assert.equal(deathmatchText('custom'), 'Each setting that makes questions harder goes one step up.');
  assert.equal(lockoutText(3), 'your next 3 turns');
  assert.deepEqual(Object.keys(DIFFICULTY_NAMES), ['cruel', 'merciless', 'eternal', 'custom']);
});

test('Unveil is idle when every question is "find the art"', () => {
  const veil = KNOB_TEXT.find((k) => k.key === 'veil')!;
  assert.equal(veil.idle!({ ...PRESETS.eternal, artChance: 1 }), 'No name questions to cover');
  assert.equal(veil.idle!(PRESETS.eternal), undefined);
});
