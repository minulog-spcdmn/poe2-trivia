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

test('the notes under a find say what its item does and what a miss costs, briefly; never a depth, nor that it is harder (its card says so)', async () => {
  const { findNote, FIND_TEXT, caveInLabel } = await import('../src/lib/difficultyText.ts');
  const none = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
  assert.equal(FIND_TEXT.azurite.tag, 'Answer fast for an Azurite Ward');
  assert.equal(
    findNote('azurite', none),
    'A ward takes a lost life for you. Slower, a shard; two make a ward. A miss costs two lives.',
  );
  assert.match(findNote('azurite', { ...none, shards: 1 }), /a shard; it makes a ward with yours\./);
  assert.equal(findNote('azurite', { ...none, wards: 3 }), 'You can carry no more. A miss costs two lives.');
  assert.equal(FIND_TEXT.flare.tag, 'Answer right for a flare');
  assert.equal(findNote('flare', none), 'It burns when your time runs out: five more seconds.');
  assert.equal(findNote('flare', { ...none, flares: 3 }), 'You can carry no more. Your flares stay unused on it.');
  assert.equal(FIND_TEXT.dynamite.tag, 'Answer right for dynamite');
  assert.equal(
    findNote('dynamite', none),
    'At half time, it clears the picture and half the answers, all of them wrong.',
  );
  // What the player carries won't go off on a find's question, and the note says so.
  assert.match(findNote('dynamite', { ...none, flares: 1 }), / Your flare stays unused on it\.$/);
  assert.match(findNote('flare', { ...none, dynamite: 2 }), / Your dynamite stays unused on it\.$/);
  assert.match(findNote('azurite', { ...none, flares: 2, dynamite: 1 }), / Your flares and dynamite stay unused on it\.$/);
  assert.match(findNote('dynamite', { wards: 3, flares: 3, dynamite: 3, shards: 0 }), /^You can carry no more\./);
  assert.equal(
    FIND_TEXT.azurite.others,
    'An Azurite Vein: a ward if answered fast, a shard if slower. A miss costs two lives.',
  );
  assert.equal(FIND_TEXT.flare.others, 'A Flare Cache: a flare, for five more seconds when the time runs out.');
  assert.equal(FIND_TEXT.dynamite.others, 'A Dynamite Cache: dynamite, to clear the picture and half the answers at half time.');
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

test("the lobby's descent says where it starts, then only that every depth is a little harder", async () => {
  const { DELVE_LADDER } = await import('../src/lib/difficultyText.ts');
  const { delveLockout, delveRules, delveTimer } = await import('../src/lib/delve.ts');
  assert.deepEqual(DELVE_LADDER[0], { depth: 1, text: 'Four options, 16 seconds' });
  assert.equal(delveRules(1).options, 4);
  assert.equal(delveTimer(1), 16);
  // What changes where is left for the player to feel: no other depth is named.
  assert.deepEqual(DELVE_LADDER.slice(1).map((r) => r.depth), [null]);
  assert.match(DELVE_LADDER[1].text, /every depth/);
  // More options, less time, trickier names and pictures, as it says.
  assert.ok(delveRules(31).options > delveRules(1).options && delveTimer(100) < delveTimer(1));
  assert.ok(delveRules(100).similarNames > delveRules(1).similarNames && delveRules(100).mirror > delveRules(1).mirror);
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
    dynamite: 'Dynamite: at half time, it clears the picture and half the answers, all of them wrong.',
  });
});
