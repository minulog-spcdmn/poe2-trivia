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
  const { DELVE_STEPS, delveChangeAt, delveTimer } = await import('../src/lib/delve.ts');
  for (const step of DELVE_STEPS.slice(1)) assert.ok(DELVE_STEP_TEXT[step.from], `no line for the step at ${step.from}`);
  for (let d = 1; d <= 120; d++) assert.equal(delveChange(d) === null, delveChangeAt(d) === null, `depth ${d}`);
  assert.equal(delveChange(55), 'Seven seconds');
  assert.equal(delveTimer(DELVE_LADDER[0].depth), 16);
  assert.equal(delveTimer(DELVE_LADDER.at(-1)!.depth), 7);
});

test('the notes under a find say what it asks and what a right answer earns, whatever the player carries', async () => {
  const { findNote, FIND_TEXT, BLAST_TEXT } = await import('../src/lib/difficultyText.ts');
  const { findTimer, findDepth, veinWindow, BLAST_TIMER, BLAST_OPTIONS } = await import('../src/lib/delve.ts');
  const none = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
  assert.equal(
    findNote('azurite', 8, none),
    `A question from depth ${findDepth(8)}, on ${findTimer(8)} seconds. Right within ${veinWindow(findTimer(8)) / 1000} seconds mines an Azurite Ward, which takes your next loss; slower, an azurite shard (two forge a ward).`,
  );
  assert.match(findNote('azurite', 40, { ...none, shards: 1 }), /Right within 4 seconds .*\(it forges a ward with yours\)\.$/);
  assert.match(findNote('azurite', 20, { ...none, wards: 3 }), /Right earns a flare, as you carry all the wards you can\.$/);
  assert.match(findNote('azurite', 20, none, true), new RegExp(`^Blasted open: a safe question, on ${BLAST_TIMER} seconds\\. Right within 8 seconds`));
  assert.match(findNote('flare', 5, none), /^A question from depth 20, on 13 seconds\. Right earns a flare, which burns by itself/);
  assert.match(findNote('flare', 20, { ...none, flares: 3 }), /Right earns dynamite, as you carry all the flares you can\.$/);
  assert.match(findNote('dynamite', 12, none), /Right earns dynamite, which blasts open a safe card while you choose\.$/);
  assert.match(findNote('dynamite', 12, { wards: 3, flares: 3, dynamite: 3, shards: 0 }), /You can carry no more\.$/);
  for (const t of Object.values(FIND_TEXT)) assert.match(t.others, /fifteen depths deeper/);
  assert.match(BLAST_TEXT.note, new RegExp(`${['four'][BLAST_OPTIONS - 4]} options.*${BLAST_TIMER} seconds`));
});
