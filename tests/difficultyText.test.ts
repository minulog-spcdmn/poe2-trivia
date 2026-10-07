import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTY_NAMES, deathmatchText, describe, KNOB_TEXT, lockoutText } from '../src/lib/difficultyText.ts';
import { KNOB_STEPS, PRESETS, type Knobs } from '../src/lib/game.ts';

test('presets are described the same way in both modes, but their unveil only in race', () => {
  assert.equal(
    describe({ difficulty: 'cruel', mode: 'turns' }),
    'Four options, of one kind where possible (all rings, all bows…). Some questions show a name; you pick its art.',
  );
  assert.equal(
    describe({ difficulty: 'merciless', mode: 'turns' }),
    'Six options, half with look-alike names, one made up. Some questions show a name; you pick its art. In race, the art to name burns in bit by bit.',
  );
  assert.equal(
    describe({ difficulty: 'eternal', mode: 'race' }),
    'Eight options, all with look-alike names, two made up. Half the questions show a name; you pick its art, in grayscale. The art to name burns in slowly. Some art is mirrored.',
  );
  assert.match(describe({ difficulty: 'eternal', mode: 'turns' }), /In race, the art to name burns in slowly\./);
});

test('a custom unveil applies in both modes, and only what can happen is described', () => {
  const custom: Knobs = { ...PRESETS.cruel, veil: 'slowest', fakes: 1, mirror: 1, grayscale: 'all' };
  assert.equal(
    describe({ difficulty: 'custom', custom, mode: 'turns' }),
    'Four options, of one kind where possible (all rings, all bows…), one made up. Some questions show a name; you pick its art. The art to name burns in very slowly. All art is in grayscale. All art is mirrored.',
  );
  // No "name the art" questions, so nothing to unveil; no "find the art" ones, so no grayscale pictures to mention.
  assert.doesNotMatch(describe({ difficulty: 'custom', custom: { ...custom, artChance: 1 } }), /burns in/);
  assert.doesNotMatch(describe({ difficulty: 'custom', custom: { ...PRESETS.eternal, artChance: 0 } }), /grayscale/);
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
  assert.match(describe({ difficulty: 'custom', custom: { ...PRESETS.cruel, options: 10 } }), /^Ten options, of one kind where possible \(/);
  assert.match(describe({ difficulty: 'cruel' }), /^Four options, of one kind where possible \(/);
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

test('the notes under a find: its tagline, then one short line of what its item does and what a miss costs; never a depth, nor that it is harder', async () => {
  const { findNote, teamFindNote, FIND_TEXT, caveInLabel } = await import('../src/lib/difficultyText.ts');
  const none = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
  const line = (k: 'azurite' | 'flare' | 'dynamite', inv = none) => `${FIND_TEXT[k].tag}. ${findNote(k, inv)}`;
  assert.equal(line('azurite'), 'Answer fast for a ward. It saves a life; a miss costs two lives.');
  assert.equal(line('flare'), 'Answer right for a flare. Five more seconds when time runs out.');
  assert.equal(line('dynamite'), 'Answer right for dynamite. At half time, it blows away half the answers, all wrong.');
  assert.equal(findNote('azurite', { ...none, wards: 3 }), 'You can carry no more; a miss costs two lives.');
  assert.equal(findNote('flare', { ...none, flares: 3 }), 'You can carry no more. Your flares stay unused on it.');
  // What the player carries won't go off on a find's question, and the note says so.
  assert.match(findNote('dynamite', { ...none, flares: 1 }), / Your flare stays unused on it\.$/);
  assert.match(findNote('flare', { ...none, dynamite: 2 }), / Your dynamite stays unused on it\.$/);
  assert.match(findNote('azurite', { ...none, flares: 2, dynamite: 1 }), / Your flares and dynamite stay unused on it\.$/);
  assert.match(findNote('dynamite', { wards: 3, flares: 3, dynamite: 3, shards: 0 }), /^You can carry no more\./);
  assert.equal(teamFindNote('flare', false), 'Five more seconds for all when time runs out.');
  assert.equal(FIND_TEXT.azurite.others, 'A fast answer wins a ward. It saves a life; a miss costs two lives.');
  assert.equal(FIND_TEXT.flare.others, 'A right answer wins a flare. Five more seconds when time runs out.');
  assert.equal(caveInLabel('azurite'), 'A wrong answer loses two lives');
  // Plain words, read in a second: no depths, no digits, no bullets in these body-font lines, and short.
  const kinds = ['azurite', 'flare', 'dynamite'] as const;
  const all = [
    ...Object.values(FIND_TEXT).map((t) => t.others),
    ...kinds.flatMap((k) => [none, { wards: 3, flares: 3, dynamite: 3, shards: 0 }].map((inv) => line(k, inv))),
    ...kinds.map((k) => `${FIND_TEXT[k].tag}. ${teamFindNote(k, false)}`),
  ];
  for (const t of all) {
    assert.doesNotMatch(t, /depth|\d/i, t);
    assert.ok(!t.includes('•') && !t.includes(String.fromCharCode(0x2014)), t);
  }
  // The usual note (nothing held that stays unused) is one short line.
  for (const t of [...kinds.map((k) => line(k)), ...Object.values(FIND_TEXT).map((t) => t.others)]) assert.ok(t.length <= 90, `${t} (${t.length})`);
});

test("a find's miss is said from one table, so a new drawback is one edit", async () => {
  const { FIND_MISS, FIND_RULES, findNote, teamFindNote, FIND_TEXT } = await import('../src/lib/difficultyText.ts');
  const { cavesIn } = await import('../src/lib/delve.ts');
  const none = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
  for (const k of ['azurite', 'flare', 'dynamite'] as const) {
    assert.equal(FIND_MISS[k] !== null, cavesIn(k), k);
    const miss = FIND_MISS[k];
    // Every text that names a miss names this one.
    for (const t of [findNote(k, none), teamFindNote(k, false), FIND_TEXT[k].others, FIND_RULES[k].miss.toLowerCase()])
      assert.equal(t.includes(miss ?? 'a miss costs two'), miss !== null, `${k}: ${t}`);
  }
  assert.equal(FIND_MISS.azurite, 'a miss costs two lives');
});

test("the lobby's finds: where they start, and for each what it gives, how its item works and what a miss costs", async () => {
  const { FINDS_LABEL, FINDS_INTRO, FIND_RULES } = await import('../src/lib/difficultyText.ts');
  const { FINDS_FROM, delveLockout } = await import('../src/lib/delve.ts');
  assert.equal(FINDS_LABEL, `Finds • from depth ${FINDS_FROM}`);
  assert.equal(FINDS_INTRO, 'A harder question that pays an item. You carry up to three of each.');
  const said = (k: keyof typeof FIND_RULES) => Object.values(FIND_RULES[k]).join(' ');
  assert.equal(said('azurite'), 'Fast: a ward; slower: half of one. A ward takes a lost life for you. A miss costs two lives.');
  assert.equal(said('flare'), 'A flare: five more seconds when your time runs out. A miss costs a life.');
  assert.equal(said('dynamite'), 'Dynamite: at half time, it blows away half the answers, all wrong, and clears the art. A miss costs a life.');
  // The lobby's rules say a picked category stays locked for this many turns at the start.
  assert.equal(delveLockout(1), 2);
});
