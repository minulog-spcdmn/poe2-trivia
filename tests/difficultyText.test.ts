import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTY_NAMES, deathmatchText, describe, KNOB_TEXT, lockoutText } from '../src/lib/difficultyText.ts';
import { KNOB_STEPS, PRESETS, type Knobs } from '../src/lib/game.ts';

test('presets are described the same way in both modes, but their unveil only in race', () => {
  assert.equal(
    describe({ difficulty: 'cruel', mode: 'turns' }),
    'Four options of the same kind where the category allows (all rings, all bows…). Some questions ask you to find the art for a name.',
  );
  assert.equal(
    describe({ difficulty: 'merciless', mode: 'turns' }),
    'Six options, half of them with look-alike names and one made up. Some questions ask you to find the art for a name. In race, the art burns into view bit by bit.',
  );
  assert.equal(
    describe({ difficulty: 'eternal', mode: 'race' }),
    'Eight options, all with look-alike names and two made up. Half the questions ask you to find the art for a name. The art burns into view slowly. "Find the art" pictures are shown without colour. Some art is mirrored.',
  );
  assert.match(describe({ difficulty: 'eternal', mode: 'turns' }), /In race, the art burns into view slowly\./);
});

test('a custom unveil applies in both modes, and only what can happen is described', () => {
  const custom: Knobs = { ...PRESETS.cruel, veil: 'slowest', fakes: 1, mirror: 1, grayscale: 'all' };
  assert.equal(
    describe({ difficulty: 'custom', custom, mode: 'turns' }),
    'Four options of the same kind where the category allows (all rings, all bows…), one of them made up. Some questions ask you to find the art for a name. The art burns into view very slowly. All art is shown without colour. All art is mirrored.',
  );
  // No "name the art" questions, so nothing to unveil; no "find the art" ones, so no grayscale pictures to mention.
  assert.doesNotMatch(describe({ difficulty: 'custom', custom: { ...custom, artChance: 1 } }), /burns into view/);
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

test('questions without look-alikes, whatever their size, only promise one kind where the category allows it', () => {
  assert.match(describe({ difficulty: 'custom', custom: { ...PRESETS.cruel, options: 10 } }), /^Ten options of the same kind where the category allows \(/);
  assert.match(describe({ difficulty: 'cruel' }), /^Four options of the same kind where the category allows \(/);
});

test('deathmatch and lockout wording, and a name for every difficulty', () => {
  assert.equal(deathmatchText('cruel'), 'Questions are played on Merciless.');
  assert.equal(deathmatchText('eternal'), 'Questions go one step past Eternal.');
  assert.equal(deathmatchText('custom'), 'Each setting that makes questions harder goes one step up.');
  assert.equal(lockoutText(3), 'your next 3 turns');
  assert.deepEqual(Object.keys(DIFFICULTY_NAMES), ['cruel', 'merciless', 'eternal', 'custom']);
});

test('steps with no effect say why, briefly', () => {
  const off = (key: string, step: unknown, k: Knobs) =>
    (KNOB_TEXT.find((t) => t.key === key)!.off as (v: unknown, k: Knobs) => string | undefined)(step, k);
  for (const step of KNOB_STEPS.veil) assert.equal(off('veil', step, { ...PRESETS.eternal, artChance: 1 }), 'No name questions to cover');
  assert.equal(off('veil', 'slow', PRESETS.eternal), undefined);
  assert.equal(off('grayscale', 'art', { ...PRESETS.eternal, artChance: 0 }), 'No "find the art" questions');
  assert.equal(off('grayscale', 'all', { ...PRESETS.eternal, artChance: 0 }), undefined);
  assert.equal(off('fakes', 3, { ...PRESETS.eternal, options: 4 }), 'Needs 6 or more options');
});

test('every hint, and every reason that replaces one, fits on one line', () => {
  const texts = KNOB_TEXT.flatMap((t) => {
    const off = t.off as ((v: unknown, k: Knobs) => string | undefined) | undefined;
    const reasons = (KNOB_STEPS[t.key] as readonly unknown[]).flatMap((v) =>
      [{ ...PRESETS.eternal, artChance: 0, options: 4 }, { ...PRESETS.eternal, artChance: 1, options: 4 }].map((k) => off?.(v, k)),
    );
    return [t.hint, ...reasons.filter((r): r is string => !!r)];
  });
  for (const t of texts) assert.ok(t.length <= 38, `${t} (${t.length})`);
});

test('every depth that gets harder in Delve says how', async () => {
  const { delveChange, DELVE_LADDER, DELVE_STEP_TEXT } = await import('../src/lib/difficultyText.ts');
  const { DELVE_STEPS, MORE_FAKES_FROM, delveChangeAt, delveTimer } = await import('../src/lib/delve.ts');
  for (const step of DELVE_STEPS.slice(1)) assert.ok(DELVE_STEP_TEXT[step.from], `no line for the step at ${step.from}`);
  assert.ok(DELVE_STEP_TEXT[MORE_FAKES_FROM]);
  for (let d = 1; d <= 300; d++) assert.equal(delveChange(d) === null, delveChangeAt(d) === null, `depth ${d}`);
  assert.deepEqual([3, 5, 7, 9, 11, 13, 58, 81, 91, 101].map(delveChange), [
    'A look-alike name',
    'A made-up name',
    'More look-alikes',
    'Locked for 3 turns',
    'Six options',
    'Less time',
    'Seven seconds',
    'Always mirrored',
    'Locked for 7 turns',
    'Now and then, four made-up names',
  ]);
  assert.equal(delveTimer(DELVE_LADDER[0].depth), 16);
  for (const row of DELVE_LADDER.slice(1)) assert.notEqual(delveChange(row.depth), null, `nothing changes at ${row.depth}`);
  assert.deepEqual(DELVE_LADDER.map((r) => r.depth), [...DELVE_LADDER.map((r) => r.depth)].sort((a, b) => a - b));
  assert.equal(delveChange(DELVE_LADDER.find((r) => r.text === 'Seven seconds')!.depth), 'Seven seconds');
});

test('the notes under a find say what it asks, what a right answer earns and what a vein\'s cave-in costs, whatever the player carries', async () => {
  const { findNote, FIND_TEXT } = await import('../src/lib/difficultyText.ts');
  const none = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
  assert.equal(
    findNote('azurite', 20, none),
    'A question from depth 35, on 12 seconds. Right within 6 seconds mines an Azurite Ward, slower an azurite shard (two forge a ward). Wrong caves in: two lives.',
  );
  assert.match(findNote('azurite', 8, none), /^A question from depth 23, on 14 seconds\. Right within 7 seconds/);
  assert.match(findNote('azurite', 40, { ...none, shards: 1 }), /Right within 4 seconds .*\(it forges a ward with yours\)\. Wrong caves in: two lives\.$/);
  assert.match(findNote('azurite', 20, { ...none, wards: 3 }), /You can carry no more\. Wrong caves in: two lives\.$/);
  assert.equal(
    findNote('flare', 15, none),
    'A question from depth 35, on 12 seconds. Right earns a flare, which burns by itself as your clock runs out, for 5 seconds more.',
  );
  assert.match(findNote('flare', 20, { ...none, flares: 3 }), /^A question from depth 40, on 11 seconds\. You can carry no more\.$/);
  assert.match(findNote('azurite', 20, { ...none, wards: 2, shards: 1 }), /slower an azurite shard \(it forges a ward with yours\)\./);
  assert.match(findNote('dynamite', 12, none), /Right earns dynamite, which goes off by itself when half your clock has run out/);
  assert.match(findNote('dynamite', 12, { wards: 3, flares: 3, dynamite: 3, shards: 0 }), /You can carry no more\.$/);
  assert.match(FIND_TEXT.azurite.others, /fifteen depths deeper.*caves in for two lives/);
  assert.match(FIND_TEXT.flare.others, /twenty depths deeper/);
  assert.doesNotMatch(FIND_TEXT.flare.others, /caves in/);
});
