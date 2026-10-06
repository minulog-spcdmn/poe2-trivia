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
  const { DELVE_STEPS, LOOKALIKES_FROM, MORE_FAKES_FROM, delveChangeAt, delveTimer } = await import('../src/lib/delve.ts');
  for (const step of DELVE_STEPS.slice(1)) assert.ok(DELVE_STEP_TEXT[step.from], `no line for the step at ${step.from}`);
  assert.ok(DELVE_STEP_TEXT[LOOKALIKES_FROM]);
  assert.ok(DELVE_STEP_TEXT[MORE_FAKES_FROM]);
  for (let d = 1; d <= 300; d++) assert.equal(delveChange(d) === null, delveChangeAt(d) === null, `depth ${d}`);
  assert.deepEqual([3, 5, 7, 9, 11, 13, 58, 81, 85, 91, 101].map(delveChange), [
    'A look-alike name',
    'A made-up name',
    'More look-alikes',
    'Locked for 3 turns',
    'Six options',
    'Less time',
    'Seven seconds',
    'Always mirrored',
    'Look-alike pictures',
    'Locked for 7 turns',
    'Now and then, four made-up names',
  ]);
  assert.equal(delveTimer(DELVE_LADDER[0].depth), 16);
  for (const row of DELVE_LADDER.slice(1)) assert.notEqual(delveChange(row.depth), null, `nothing changes at ${row.depth}`);
  assert.deepEqual(DELVE_LADDER.map((r) => r.depth), [...DELVE_LADDER.map((r) => r.depth)].sort((a, b) => a - b));
  assert.equal(delveChange(DELVE_LADDER.find((r) => r.text === 'Seven seconds')!.depth), 'Seven seconds');
});

test('the notes under a find say what its item does, that the question is harder and what a miss costs; never a depth', async () => {
  const { findNote, FIND_TEXT, caveInLabel } = await import('../src/lib/difficultyText.ts');
  const none = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
  assert.equal(FIND_TEXT.azurite.tag, 'Answer fast for an Azurite Ward');
  assert.equal(
    findNote('azurite', none),
    'A ward takes your next lost life instead. Right in the second half of the time, you get a shard; two make a ward. The question is a bit harder, and a wrong answer loses two lives.',
  );
  assert.match(findNote('azurite', { ...none, shards: 1 }), /you get a shard; it makes a ward with yours\./);
  assert.equal(findNote('azurite', { ...none, wards: 3 }), 'You can carry no more. The question is a bit harder, and a wrong answer loses two lives.');
  assert.equal(FIND_TEXT.flare.tag, 'Answer right for a flare');
  assert.equal(findNote('flare', none), 'When your time runs out, it burns and gives you five more seconds. The question is a bit harder.');
  assert.equal(findNote('flare', { ...none, flares: 3 }), 'You can carry no more. The question is a bit harder. Your flares stay unused on it.');
  assert.equal(FIND_TEXT.dynamite.tag, 'Answer right for dynamite');
  assert.equal(
    findNote('dynamite', none),
    'Halfway through your time, it clears the picture and blows away half the wrong answers. The question is a bit harder.',
  );
  // What the player carries won't go off on a find's question, and the note says so.
  assert.match(findNote('dynamite', { ...none, flares: 1 }), / Your flare stays unused on it\.$/);
  assert.match(findNote('flare', { ...none, dynamite: 2 }), / Your dynamite stays unused on it\.$/);
  assert.match(findNote('azurite', { ...none, flares: 2, dynamite: 1 }), / Your flares and dynamite stay unused on it\.$/);
  assert.match(findNote('dynamite', { wards: 3, flares: 3, dynamite: 3, shards: 0 }), /^You can carry no more\./);
  assert.equal(
    FIND_TEXT.azurite.others,
    'An Azurite Vein: a harder question, for an Azurite Ward if answered fast or a shard if slower; a wrong answer loses two lives.',
  );
  assert.equal(FIND_TEXT.flare.others, 'A Flare Cache: a harder question, for a flare that gives five more seconds when the time runs out.');
  assert.equal(
    FIND_TEXT.dynamite.others,
    'A Dynamite Cache: a harder question, for dynamite that clears the picture and blows away half the wrong answers at half time.',
  );
  assert.equal(caveInLabel('azurite'), 'A wrong answer loses two lives');
  // Plain words: no depths, no clocks in seconds (only the flare's five), no bullets in these body-font sentences.
  const all = [
    ...Object.values(FIND_TEXT).flatMap((t) => [t.tag, t.others]),
    ...(['azurite', 'flare', 'dynamite'] as const).flatMap((k) =>
      [none, { ...none, shards: 1 }, { wards: 3, flares: 3, dynamite: 3, shards: 0 }, { ...none, flares: 2, dynamite: 1 }].map((inv) => findNote(k, inv)),
    ),
  ];
  for (const t of all) {
    assert.doesNotMatch(t, /depth|\d/i, t);
    assert.ok(!t.includes('•') && !t.includes(String.fromCharCode(0x2014)), t);
  }
});

test("the lobby's descent says what the curve does at each of its depths", async () => {
  const { DELVE_LADDER } = await import('../src/lib/difficultyText.ts');
  const { DELVE_MIN_TIMER, delveLockout, delveRules, delveTimer } = await import('../src/lib/delve.ts');
  const text = (depth: number) => DELVE_LADDER.find((r) => r.depth === depth)?.text;
  // Four options and 16 s to start; look-alikes (from 3) and a made-up name come before six options.
  assert.ok(delveRules(3).similarNames > 0 && !delveRules(2).similarNames);
  assert.equal(text(1), 'Four options, 16 seconds');
  assert.equal(delveRules(1).options, 4);
  assert.equal(delveTimer(1), 16);
  assert.equal(delveRules(10).options, 4);
  assert.ok(delveRules(10).similarNames > 0 && delveRules(10).fakes > 0);
  assert.equal(text(11), 'Six options, eight from 31');
  assert.deepEqual([delveRules(11).options, delveRules(30).options, delveRules(31).options], [6, 6, 8]);
  assert.equal(text(15), 'Mirrored pictures');
  assert.deepEqual([delveRules(14).mirror, delveRules(15).mirror > 0], [0, true]);
  assert.equal(text(25), 'The art burns into view');
  assert.deepEqual([delveRules(24).veil, !!delveRules(25).veil], [null, true]);
  assert.equal(text(41), 'Grayscale pictures, all from 61');
  assert.deepEqual([40, 41, 60, 61].map((d) => delveRules(d).grayscale), ['off', 'art', 'art', 'all']);
  assert.equal(text(58), 'Seven seconds');
  assert.deepEqual([delveTimer(57), delveTimer(58)], [DELVE_MIN_TIMER + 1, DELVE_MIN_TIMER]);
  // The lobby's rules say a picked category stays locked for this many turns at the start.
  assert.equal(lockoutText(delveLockout(1)), 'your next 2 turns');
});

test("the lobby's finds: where they start and what each gives, in a line", async () => {
  const { FINDS_LABEL, FIND_GIVES } = await import('../src/lib/difficultyText.ts');
  const { FINDS_FROM } = await import('../src/lib/delve.ts');
  assert.equal(FINDS_LABEL, `Finds • from depth ${FINDS_FROM}`);
  assert.deepEqual(FIND_GIVES, {
    azurite: 'Answer fast for a ward: it saves a life. A miss costs two lives.',
    flare: 'A flare: five more seconds when your time runs out.',
    dynamite: 'Dynamite: at half time, it clears the picture and half the wrong answers.',
  });
});
