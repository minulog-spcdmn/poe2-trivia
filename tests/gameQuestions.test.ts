// The game's questions (src/lib/game.ts): options, decoys and made-up names, pictures, tablets, the difficulties and their knobs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, createGame, KNOB_STEPS, PRESETS, cleanKnobs, knobsOf, isDifficulty, isFake, rulesFor, RARE_GROUPS, RARE_MAX_OPTIONS, TWINS, allArt, drawnAs, picturesOf, maxFakes, nameSimilarity, publicView, questionTopic, singular, type Difficulty, type Preset, type GameState, type Item, type Question } from '../src/lib/game.ts';
import { fakes, items, lobby, right, seeded, wrong } from './helpers.ts';

test('difficulties scale options, decoy kind and question types', () => {
  for (const difficulty of ['cruel', 'merciless', 'eternal'] as Difficulty[]) {
    const rules = PRESETS[difficulty];
    let { s } = lobby(['Ash'], 3, difficulty);
    const engine = new Engine(items, { autoClock: true, rng: seeded(42), fakes });
    s = engine.apply(s, { type: 'start' }, 'p0');
    const modes = new Set<string>();
    for (let turn = 0; turn < 40; turn++) {
      const category = s.offered[0];
      // What the engine draws decoys from: unseen items, or the whole category
      // (but its latest answer) once too few are left.
      const inCat = engine.byCategory.get(category)!;
      let unused = inCat.filter((it) => !s.used.includes(it.id));
      if (unused.length < rules.options) {
        const latest = s.used.findLast((id) => inCat.some((it) => it.id === id));
        unused = inCat.filter((it) => it.id !== latest);
      }
      s = engine.apply(s, { type: 'pick', category }, 'p0');
      const q = s.question!;
      modes.add(q.mode);
      assert.equal(q.options.length, rules.options);
      assert.equal(new Set(q.options).size, rules.options);
      const answer = engine.byId.get(q.itemId)!;
      const real = q.options.filter((id) => !isFake(id)).map((id) => engine.byId.get(id)!);
      const looks = q.options.map((id) => engine.byId.get(isFake(id) ? id.split(':')[1] : id)!.group);
      for (const it of real) assert.equal(it.category, answer.category, 'decoys share the category');
      // Twins (TWINS) may sit out, all but one of a set, so a set counts once (none with the answer in it).
      const twinSet = (it: Item) => TWINS.find((t) => t.names.includes(it.name));
      const sameGroup = unused.filter((it) => it.group === answer.group && it.id !== answer.id);
      const sameGroupLeft = sameGroup.filter((it) => !twinSet(it)).length + new Set(sameGroup.flatMap((it) => (twinSet(it) && twinSet(it) !== twinSet(answer) ? [twinSet(it)] : []))).size;
      if (sameGroupLeft >= rules.options - 1) {
        for (const it of real) assert.equal(it.group, answer.group, 'decoys share the group');
      }
      // The topic lists exactly the groups on screen, and never one with a single option.
      const shown = q.groups ?? [];
      if (answer.kind === 'gem') assert.deepEqual(shown, []);
      for (const g of shown) assert.ok(looks.filter((l) => l === g).length >= 2, `${g} has two options`);
      if (shown.length) for (const l of looks) assert.ok(shown.includes(l), `${l} is listed`);
      assert.equal(q.veil, null, 'a preset only unveils the art in race');
      s = engine.apply(s, { type: 'answer', index: right(q) }, 'p0');
      s = engine.apply(s, { type: 'next' }, 'p0');
      if (s.phase === 'over') s = engine.apply(engine.apply(s, { type: 'restart' }, 'p0'), { type: 'start' }, 'p0');
    }
    assert.ok(modes.has('art') && modes.has('name'));
  }
});

test('a question that mixes groups shows each as often as the others', () => {
  for (const difficulty of ['cruel', 'merciless', 'eternal'] as Difficulty[]) {
    const engine = new Engine(items, { autoClock: true, rng: seeded(11), fakes });
    let mixed = 0;
    for (const category of engine.categories) {
      const s = createGame(null, { targetScore: 5, timer: 0, difficulty, mode: 'turns', public: false, locked: false });
      // Play through the category a few times, so its groups run low.
      for (let i = 0; i < engine.byCategory.get(category)!.length * 3; i++) {
        const q = engine.makeQuestion(s, category);
        s.used.push(q.itemId);
        // Made-up names count under the item they copy, the group they look like.
        const counts = new Map<string, number>();
        for (const id of q.options) {
          const group = engine.byId.get(isFake(id) ? id.split(':')[1] : id)!.group;
          counts.set(group, (counts.get(group) ?? 0) + 1);
        }
        if (counts.size < 2) continue;
        mixed++;
        assert.equal(new Set(counts.values()).size, 1, `${difficulty} ${category}: ${[...counts.values()]}`);
      }
    }
    assert.ok(mixed > 0, `${difficulty} mixes groups`);
  }
});

test('ten options: a small group shares the question as five beside five of another, made-up names in both', () => {
  const custom = { ...PRESETS.eternal, options: 10, fakes: 3, artChance: 0 };
  const engine = new Engine(items, { autoClock: true, rng: seeded(5), fakes });
  const s = createGame(null, { targetScore: 5, timer: 0, difficulty: 'custom', custom, mode: 'turns', public: false, locked: false });
  const answered = new Set<string>();
  let fives = 0;
  for (let i = 0; i < 400; i++) {
    const q = engine.makeQuestion(s, 'One-Handed Weapons');
    const counts = new Map<string, number>();
    for (const id of q.options) {
      const group = engine.byId.get(isFake(id) ? id.split(':')[1] : id)!.group;
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    assert.equal(new Set(counts.values()).size, 1, `${[...counts]}`);
    answered.add(engine.byId.get(q.itemId)!.group);
    if (counts.size === 2) {
      fives++;
      // Two groups of five hold four made-up names: all three fit.
      assert.equal(q.options.filter(isFake).length, 3);
      assert.deepEqual(q.groups, [...counts.keys()].sort());
    }
  }
  // Wands and sceptres (eight each) are too few to fill ten alone, and four groups too few for five pairs.
  assert.deepEqual([...answered].sort(), ['One-Handed Maces', 'Sceptres', 'Spears', 'Wands']);
  assert.ok(fives > 50, `${fives} questions of two groups of five`);
});

test('ten options: a tablet, too few to fill ten and never mixed, is asked with eight', () => {
  const custom = { ...PRESETS.eternal, options: 10, fakes: 3, artChance: 0.5 };
  const engine = new Engine(items, { autoClock: true, rng: seeded(11), fakes });
  const s = createGame(null, { targetScore: 5, timer: 0, difficulty: 'custom', custom, mode: 'turns', public: false, locked: false });
  let tablets = 0;
  for (let i = 0; i < 600; i++) {
    const q = engine.makeQuestion(s, 'Flasks, Charms, Jewels, Relics & Tablets');
    const groupOf = (id: string) => engine.byId.get(isFake(id) ? id.split(':')[1] : id)!.group;
    if (groupOf(q.itemId) === 'Tablets') {
      tablets++;
      assert.equal(q.options.length, RARE_MAX_OPTIONS);
      assert.ok(q.options.every((id) => groupOf(id) === 'Tablets'), 'tablets never mix');
      assert.ok(q.options.filter(isFake).length <= maxFakes(RARE_MAX_OPTIONS));
    } else {
      assert.equal(q.options.length, 10);
      assert.ok(!q.options.some((id) => groupOf(id) === 'Tablets'), 'no tablet among other groups');
    }
  }
  assert.ok(tablets > 10, `${tablets} tablet questions`);
});

test('the topic counts a made-up name under the item it copies', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(7), fakes });
  const s = createGame(null, { targetScore: 5, timer: 0, difficulty: 'eternal', mode: 'turns', public: false, locked: false });
  const category = 'Flasks, Charms, Jewels, Relics & Tablets';
  let mixed = 0;
  let twins = 0;
  for (let i = 0; i < 3000; i++) {
    const q = engine.makeQuestion(s, category);
    const looks = q.options.map((id) => engine.byId.get(isFake(id) ? id.split(':')[1] : id)!.group);
    const counts = new Map<string, number>();
    for (const g of looks) counts.set(g, (counts.get(g) ?? 0) + 1);
    const expected = [...counts.values()].some((n) => n === 1) ? [] : [...counts.keys()].sort();
    assert.deepEqual(q.groups, expected, 'the groups as they look on screen');
    if (q.groups!.length > 1) mixed++;
    // A group with one real name and its made-up twin is listed.
    const realIn = (g: string) => q.options.filter((id) => !isFake(id) && engine.byId.get(id)!.group === g).length;
    if (q.groups!.some((g) => realIn(g) === 1)) twins++;
  }
  assert.ok(mixed > 0, 'some questions mix groups');
  assert.ok(twins > 0, 'some groups are listed for a real name and its twin');
});

test('the topic is the groups in play when that is shorter than the category', () => {
  const q = (category: string, groups?: string[]) => ({ category, groups }) as Question;
  assert.equal(questionTopic(q('Gloves & Boots', ['Boots'])), 'Boots');
  assert.equal(questionTopic(q('Gloves & Boots', ['Boots', 'Gloves'])), 'Gloves & Boots');
  assert.equal(questionTopic(q('Flasks, Charms, Jewels, Relics & Tablets', ['Flasks', 'Relics'])), 'Flasks • Relics');
  assert.equal(questionTopic(q('One-Handed Weapons', ['One-Handed Maces', 'Spears'])), 'One-Handed Weapons');
  assert.equal(questionTopic(q('Helmets', ['Helmets'])), 'Helmets');
  assert.equal(questionTopic(q('Lineage Gems', [])), 'Lineage Gems');
  assert.equal(questionTopic(q('Rings')), 'Rings');
});

test('the unidentified item names its topic as a single item', () => {
  const q = (category: string, groups?: string[]) => ({ category, groups }) as Question;
  assert.equal(questionTopic(q('Gloves & Boots', ['Boots']), true), 'Boots');
  assert.equal(questionTopic(q('Gloves & Boots', ['Boots', 'Gloves']), true), 'Gloves or Boots');
  assert.equal(questionTopic(q('Flasks, Charms, Jewels, Relics & Tablets', ['Flasks', 'Relics']), true), 'Flask or Relic');
  assert.equal(questionTopic(q('Flasks, Charms, Jewels, Relics & Tablets', ['Charms', 'Flasks', 'Jewels']), true), 'Charm, Flask or Jewel');
  assert.equal(questionTopic(q('Two-Handed Weapons', ['Bows', 'Crossbows']), true), 'Bow or Crossbow');
  assert.equal(questionTopic(q('Helmets', ['Helmets']), true), 'Helmet');
  assert.equal(questionTopic(q('Lineage Gems', []), true), 'Lineage Gem');
  assert.equal(questionTopic(q('Rings'), true), 'Ring');
});

test('similar-looking names rank above unrelated ones', () => {
  assert.ok(nameSimilarity("Berek's Grip", "Berek's Pass") > nameSimilarity("Berek's Grip", 'Quill Rain'));
  assert.ok(
    nameSimilarity('Whisper of the Brotherhood', 'Call of the Brotherhood') >
      nameSimilarity('Whisper of the Brotherhood', 'Blackheart'),
  );
});

test('lineage gems are a category', () => {
  const engine = new Engine(items, { autoClock: true, autoClock: true });
  assert.ok(engine.categories.includes('Lineage Gems'));
  assert.ok(engine.byCategory.get('Lineage Gems')!.length >= 20);
});

test('talismans are two-handed weapons', () => {
  const talismans = items.filter((it) => it.group === 'Talismans');
  assert.ok(talismans.length > 0);
  for (const it of talismans) assert.equal(it.category, 'Two-Handed Weapons', it.name);
});

test('eternal mirrors some pictures, each on its own roll', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(9) });
  for (const difficulty of ['cruel', 'merciless'] as Difficulty[]) {
    const s = createGame(null, { targetScore: 5, timer: 0, difficulty, mode: 'turns', public: false, locked: false });
    for (let i = 0; i < 200; i++) {
      const q = engine.makeQuestion(s, engine.categories[i % engine.categories.length]);
      assert.ok(!q.mirrored!.some(Boolean), `${difficulty} never mirrors`);
    }
  }
  const s = createGame(null, { targetScore: 5, timer: 0, difficulty: 'eternal', mode: 'turns', public: false, locked: false });
  let pictures = 0;
  let flipped = 0;
  let answers = 0;
  let answersFlipped = 0;
  for (let i = 0; i < 2000; i++) {
    const q = engine.makeQuestion(s, engine.categories[i % engine.categories.length]);
    const flags = q.mirrored!;
    assert.equal(flags.length, q.mode === 'art' ? q.options.length : 1, 'one flag per picture');
    pictures += flags.length;
    flipped += flags.filter(Boolean).length;
    if (q.mode === 'art') {
      answers++;
      if (flags[right(q)]) answersFlipped++;
    }
  }
  const rate = flipped / pictures;
  assert.ok(Math.abs(rate - PRESETS.eternal.mirror) < 0.03, `mirrored ${rate.toFixed(3)} of pictures`);
  // A mirrored option is no more (or less) likely to be the answer.
  assert.ok(Math.abs(answersFlipped / answers - rate) < 0.04, `answer mirrored ${(answersFlipped / answers).toFixed(3)}`);
});

test('an item drawn more than one way shows each of its art about as often', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(7), fakes });
  const s = createGame(null, { targetScore: 5, timer: 0, difficulty: 'merciless', mode: 'turns', public: false, locked: false });
  const drawn = new Map<string, number[]>();
  for (let i = 0; i < 8000; i++) {
    const q = engine.makeQuestion(s, i % 2 ? 'Rings' : 'Flasks, Charms, Jewels, Relics & Tablets');
    const pictured = picturesOf(q);
    // Missing where every picture shows its item's own art.
    if (q.variant) assert.equal(q.variant.length, pictured.length, 'one per picture');
    if (q.variant) assert.ok(q.variant.some(Boolean), 'only listed when some picture shows a variant');
    const variant = q.variant ?? pictured.map(() => 0);
    pictured.forEach((id, k) => {
      const it = engine.byId.get(id);
      if (!it?.variants) return assert.equal(variant[k], 0, `${id} is drawn one way`);
      const counts = drawn.get(it.name) ?? drawn.set(it.name, Array(it.variants.length + 1).fill(0)).get(it.name)!;
      counts[variant[k]]++;
    });
  }
  assert.deepEqual([...drawn.keys()].sort(), ['Grand Spectrum', 'Grip of Kulemak']);
  for (const [name, counts] of drawn) {
    const even = counts.reduce((a, b) => a + b) / counts.length;
    assert.ok(even > 40, `${name} came up enough to tell: ${counts.join(', ')}`);
    for (const n of counts) assert.ok(n > even * 0.5 && n < even * 1.5, `${name}: ${counts.join(', ')}`);
  }
});

test('a drawn item is its variant\'s picture, base and size under the item\'s name and id', () => {
  const gs = items.find((it) => it.name === 'Grand Spectrum')!;
  assert.deepEqual(allArt(gs).map((a) => a.base), ['Ruby', 'Emerald', 'Sapphire']);
  assert.equal(drawnAs(gs).art, gs.id);
  assert.equal(drawnAs(gs, 0), drawnAs(gs), 'the same picture, the same object');
  const emerald = drawnAs(gs, 1);
  assert.deepEqual([emerald.art, emerald.base, emerald.name, emerald.group], [gs.variants![0].id, 'Emerald', 'Grand Spectrum', gs.group]);
  assert.equal(emerald.id, gs.id, 'its id stays the item\'s');
  assert.equal(drawnAs(gs, 9), drawnAs(gs), 'a variant it lacks: its own art');
  const ids = items.flatMap((it) => allArt(it).map((a) => a.art));
  assert.equal(new Set(ids).size, ids.length, 'every art its own id');
});

test('tablets are rarer answers and only fill in as decoys', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(7) });
  const cat = 'Flasks, Charms, Jewels, Relics & Tablets';
  const inCat = engine.byCategory.get(cat)!;
  const tablets = inCat.filter((it) => it.group === 'Tablets').length;
  const evenShare = tablets / inCat.length;
  let asAnswer = 0;
  let asDecoy = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const s = createGame(null, { targetScore: 5, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
    const q = engine.makeQuestion(s, cat);
    const answer = engine.byId.get(q.itemId)!;
    if (answer.group === 'Tablets') asAnswer++;
    else asDecoy += q.options.filter((id) => engine.byId.get(id)!.group === 'Tablets').length;
  }
  const share = asAnswer / N;
  const expected = (tablets * RARE_GROUPS.Tablets) / (inCat.length - tablets + tablets * RARE_GROUPS.Tablets);
  assert.ok(Math.abs(share - expected) < 0.02, `tablet share ${share.toFixed(3)} vs expected ${expected.toFixed(3)}`);
  assert.ok(share < evenShare / 2);
  assert.equal(asDecoy, 0, 'no tablet decoys for non-tablet answers on Cruel');
});

test('the answer is not the name that fits the other options best', () => {
  // Pick the option whose name is most (or least) like the others: neither may beat a blind guess by much.
  const engine = new Engine(items, { autoClock: true, rng: seeded(11) });
  for (const difficulty of ['merciless', 'eternal'] as Difficulty[]) {
    const N = 1500;
    let most = 0;
    let least = 0;
    let k = 0;
    for (let i = 0; i < N; i++) {
      const s = createGame(null, { targetScore: 5, timer: 0, difficulty, mode: 'turns', public: false, locked: false });
      const q = engine.makeQuestion(s, engine.categories[i % engine.categories.length]);
      const names = q.options.map((id) => engine.byId.get(id)!.name);
      k = names.length;
      const fit = names.map((a, x) => names.reduce((sum, b, y) => (x === y ? sum : sum + nameSimilarity(a, b)), 0));
      if (fit.indexOf(Math.max(...fit)) === right(q)) most++;
      if (fit.indexOf(Math.min(...fit)) === right(q)) least++;
    }
    const limit = 1 / k + 0.045;
    assert.ok(most / N < limit, `${difficulty}: most-alike name is the answer ${(most / N).toFixed(3)}`);
    assert.ok(least / N < limit, `${difficulty}: least-alike name is the answer ${(least / N).toFixed(3)}`);
  }
});

test('earlier answers never come back as decoys, until the category starts over', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(5) });
  let s: GameState = createGame(null, { targetScore: 99, timer: 0, difficulty: 'eternal', mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  s = engine.apply(s, { type: 'start' }, null);
  const cat = 'Rings';
  const size = engine.byCategory.get(cat)!.length;
  const answers: string[] = [];
  for (let t = 0; t < size * 2; t++) {
    const q = engine.makeQuestion(s, cat);
    const seen = new Set(s.used);
    // Everything shown is unseen, apart from the answer after a restart of the category.
    for (const id of q.options) if (id !== q.itemId) assert.ok(!seen.has(id), 'an earlier answer came back as a decoy');
    assert.ok(!seen.has(q.itemId), 'an earlier answer came back as the answer');
    assert.notEqual(q.itemId, answers.at(-1), 'same answer twice in a row');
    answers.push(q.itemId);
    s.used.push(q.itemId);
    s.question = q;
  }
  assert.ok(new Set(answers).size > size - PRESETS.eternal.options, 'goes through most of the category first');
});

test('a tablet answer gets tablet decoys, so a tablet among the options gives nothing away', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(3) });
  const cat = 'Flasks, Charms, Jewels, Relics & Tablets';
  for (const difficulty of ['cruel', 'merciless', 'eternal'] as Difficulty[]) {
    for (let i = 0; i < 1500; i++) {
      const s = createGame(null, { targetScore: 5, timer: 0, difficulty, mode: 'turns', public: false, locked: false });
      const q = engine.makeQuestion(s, cat);
      const tablets = q.options.filter((id) => engine.byId.get(id)!.group === 'Tablets').length;
      assert.ok(tablets === 0 || tablets === q.options.length, `${difficulty}: ${tablets} tablets among ${q.options.length}`);
    }
  }
});

test('a tablet answer still gets only tablet decoys once earlier tablets have been used', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(11) });
  const cat = 'Flasks, Charms, Jewels, Relics & Tablets';
  for (const difficulty of ['merciless', 'eternal'] as Difficulty[]) {
    let tabletQuestions = 0;
    for (let game = 0; game < 300; game++) {
      const s = createGame(null, { targetScore: 5, timer: 0, difficulty, mode: 'turns', public: false, locked: false });
      // A long game in one category, so its tablets run low before it starts over.
      for (let turn = 0; turn < 30; turn++) {
        const q = engine.makeQuestion(s, cat);
        s.used.push(q.itemId);
        if (engine.byId.get(q.itemId)!.group !== 'Tablets') continue;
        tabletQuestions++;
        const tablets = q.options.filter((id) => engine.byId.get(id)!.group === 'Tablets').length;
        assert.equal(tablets, q.options.length, `${difficulty}: only ${tablets} tablets among ${q.options.length}`);
      }
    }
    assert.ok(tabletQuestions > 50, `${difficulty}: tablets still come up (${tabletQuestions})`);
  }
});

test('only real difficulties are accepted, not names inherited from Object', () => {
  let { engine, s } = lobby(['Ash']);
  for (const bogus of ['toString', 'constructor', '__proto__']) {
    s = engine.apply(s, { type: 'settings', settings: { difficulty: bogus as Difficulty } }, 'p0');
    assert.equal(s.settings.difficulty, 'cruel');
    assert.deepEqual(rulesFor({ difficulty: bogus as Difficulty }), rulesFor({ difficulty: 'merciless' }), 'unknown falls back to the default');
    assert.equal(isDifficulty(bogus), false);
  }
  assert.equal(isDifficulty('eternal'), true);
});

test('merciless and eternal swap decoys on name questions for made-up names', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(21), fakes });
  const byId = new Map(items.map((it) => [it.id, it]));
  const cruel = createGame(null, { targetScore: 5, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  for (let i = 0; i < 200; i++) {
    const q = engine.makeQuestion(cruel, engine.categories[i % engine.categories.length]);
    assert.ok(!q.options.some(isFake), 'cruel has no fakes');
  }
  for (const difficulty of ['merciless', 'eternal'] as const) {
    const { options, fakes: count } = PRESETS[difficulty];
    const s = createGame(null, { targetScore: 5, timer: 0, difficulty, mode: 'turns', public: false, locked: false });
    let pairs = 0;
    let answerPairs = 0;
    let shownReal = 0;
    for (let i = 0; i < 2000; i++) {
      const q = engine.makeQuestion(s, engine.categories[i % engine.categories.length]);
      assert.equal(q.options.length, options);
      const fakeIdx = q.options.flatMap((id, i) => (isFake(id) ? [i] : []));
      if (q.mode === 'art') {
        assert.deepEqual(fakeIdx, [], 'art questions only show real pictures');
        continue;
      }
      assert.equal(fakeIdx.length, count, difficulty);
      assert.equal(new Set(q.labels).size, q.labels.length, 'no name twice');
      assert.ok(!isFake(q.itemId));
      shownReal += q.options.length - fakeIdx.length;
      for (const i of fakeIdx) {
        // The fake's real twin is on screen, and the label is one of its fakes.
        const source = q.options[i].split(':')[1];
        assert.ok(q.options.includes(source), 'twin on screen');
        assert.ok(fakes[byId.get(source)!.name].includes(q.labels[i]!));
        pairs++;
        if (source === q.itemId) answerPairs++;
      }
    }
    // The answer has a fake twin as often as any other real name on screen.
    const expected = pairs / shownReal;
    const actual = answerPairs / (shownReal / (options - count));
    assert.ok(Math.abs(actual - expected) < 0.04, `${difficulty}: answer twinned ${actual.toFixed(3)} vs ${expected.toFixed(3)}`);
  }
});

test('made-up names stay hidden until the reveal, and never count as used items', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(4), fakes });
  let s: GameState = createGame('p0', { targetScore: 3, timer: 0, difficulty: 'eternal', mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  for (let i = 0; !s.question!.options.some(isFake); i++) {
    assert.ok(i < 500, 'no made-up name in 500 questions');
    s = engine.apply(s, { type: 'reask' }, 'p0');
  }
  assert.ok(!s.used.some(isFake), 'replaced questions leave no fakes in the used list');
  const q = s.question!;
  assert.deepEqual(publicView(s).question!.options, []);
  const pick = q.options.findIndex(isFake);
  s = engine.apply(s, { type: 'answer', index: pick }, 'p0');
  assert.equal(s.reveal!.correct, false);
  assert.equal(s.players[0].score, 0);
  // Only the picked fake is shown as one; the other fake stays anonymous like any untouched decoy.
  const shown = publicView(s).question!.options;
  q.options.forEach((id, i) => assert.equal(shown[i], i === pick || i === right(q) ? id : ''));
  assert.ok(s.used.includes(q.options[pick]), 'a fake someone fell for is remembered');
});

test('a made-up name someone fell for is not used again in that room', () => {
  for (const mode of ['turns', 'race'] as const) {
    const engine = new Engine(items, { autoClock: true, rng: seeded(8), fakes });
    let s: GameState = createGame('p0', { targetScore: 999, timer: 0, difficulty: 'eternal', mode, public: false, locked: false });
    s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
    s = engine.apply(s, { type: 'start' }, 'p0');
    const fallenFor = new Set<string>();
    for (let turn = 0; turn < 300; turn++) {
      if (s.phase === 'choosing') s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
      const q = s.question!;
      for (const id of q.options) assert.ok(!fallenFor.has(id), `${mode}: ${id} came back`);
      const pick = q.options.findIndex(isFake);
      s = engine.apply(s, { type: 'answer', index: pick >= 0 ? pick : right(q) }, 'p0');
      if (pick >= 0) fallenFor.add(q.options[pick]);
      if (s.phase === 'question') s = engine.apply(s, { type: 'answer', index: right(q) }, 'p0');
      s = engine.apply(s, { type: 'next' }, 'p0');
    }
    assert.ok(fallenFor.size > 50, `${mode}: fell for ${fallenFor.size}`);
    // The next game in the room remembers them too.
    s = engine.apply(s, { type: 'restart', play: true }, 'p0');
    for (const id of fallenFor) assert.ok(s.used.includes(id), `${mode}: ${id} forgotten`);
  }
});

test('the next game in a room asks about other items than the last one', () => {
  let { engine, s } = lobby(['Ash', 'Bram'], 5);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const play = () => {
    const asked: string[] = [];
    while (s.phase !== 'over') {
      const id = s.players[s.turn].id;
      s = engine.apply(s, { type: 'pick', category: s.offered[0] }, id);
      asked.push(s.question!.itemId);
      // Only A answers right, so nobody ties into a deathmatch.
      const q = s.question!;
      s = engine.apply(s, { type: 'answer', index: id === 'p0' ? right(q) : wrong(q) }, id);
      s = engine.apply(s, { type: 'next' }, id);
    }
    return asked;
  };
  const first = play();
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.deepEqual(s.used, first, 'the lobby keeps what was asked');
  s = engine.apply(s, { type: 'start' }, 'p0');
  const second = play();
  for (const id of second) assert.ok(!first.includes(id), `${id} asked again`);
  // A new room starts with a clean slate.
  assert.deepEqual(createGame('p0').used, []);
});

test('every category and item group has a singular name for the unidentified item', () => {
  const names = new Set(items.flatMap((it) => (it.kind === 'gem' ? [it.category] : [it.category, it.group])));
  // A single pair of gloves or boots keeps its plural name.
  for (const name of names) assert.ok(singular(name) !== name || ['Boots', 'Gloves'].includes(name), name);
});

test('a preset unveils the art only in race; a custom unveil works in both modes', () => {
  for (const mode of ['turns', 'race'] as const) {
    for (const difficulty of ['merciless', 'eternal', 'custom'] as Difficulty[]) {
      const custom = { ...PRESETS.cruel, artChance: 0, veil: 'fast' as const };
      const engine = new Engine(items, { autoClock: true, rng: seeded(5), fakes });
      let s: GameState = createGame('p0', { targetScore: 99, timer: 20, difficulty, custom, mode, public: false, locked: false });
      s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
      s = engine.apply(s, { type: 'start' }, 'p0');
      let named = 0;
      for (let i = 0; i < 20; i++) {
        if (s.phase === 'choosing') s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
        const q = s.question!;
        if (q.mode === 'name') {
          named++;
          const veiled = mode === 'race' || difficulty === 'custom';
          assert.equal(!!q.veil, veiled, `${mode} ${difficulty}`);
          if (difficulty === 'custom') assert.deepEqual([q.veil!.size, q.veil!.seconds], [5, 20 * 0.55]);
        }
        s = engine.apply(s, { type: 'answer', index: wrong(q) }, 'p0');
        s = engine.apply(s, { type: 'next' }, 'p0');
      }
      assert.ok(named > 0);
    }
  }
});

test('the host can tune a custom difficulty, one knob at a time, within the allowed steps', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  // The first time, Custom starts out as the difficulty that was picked.
  s = engine.apply(s, { type: 'settings', settings: { difficulty: 'eternal', mode: 'race' } }, 'p0');
  assert.equal(s.settings.custom, undefined);
  s = engine.apply(s, { type: 'settings', settings: { difficulty: 'custom' } }, 'p0');
  assert.deepEqual(s.settings.custom, PRESETS.eternal);
  s = engine.apply(s, { type: 'settings', settings: { difficulty: 'cruel', mode: 'turns' } }, 'p0');
  s = engine.apply(s, { type: 'settings', settings: { difficulty: 'custom' } }, 'p0');
  assert.deepEqual(s.settings.custom, PRESETS.eternal, 'and keeps its knobs after that');
  s = engine.apply(s, { type: 'settings', settings: { custom: { options: 4 } } }, 'p0');
  assert.deepEqual(s.settings.custom, { ...PRESETS.eternal, options: 4 });
  // Off the steps (or not a knob at all): ignored, the rest still applies.
  s = engine.apply(s, { type: 'settings', settings: { custom: { options: 5, fakes: 1, lockout: -1, toString: 1 } as never } }, 'p0');
  assert.deepEqual(s.settings.custom, { ...PRESETS.eternal, options: 4, fakes: 1 });
  assert.throws(() => engine.apply(s, { type: 'settings', settings: { custom: { options: 8 } } }, 'p1'), /Only the host/);
  // Switching to a preset keeps the knobs for later.
  s = engine.apply(s, { type: 'settings', settings: { difficulty: 'cruel' } }, 'p0');
  assert.deepEqual(s.settings.custom, { ...PRESETS.eternal, options: 4, fakes: 1 });
  for (const [k, steps] of Object.entries(KNOB_STEPS)) assert.ok(steps.includes(PRESETS.merciless[k as keyof typeof PRESETS.merciless] as never), k);
  assert.deepEqual(cleanKnobs(null), PRESETS.merciless);
});

test('custom questions follow the knobs', () => {
  const custom = { options: 10, similarNames: 0, fakes: 1, artChance: 1, veil: 'off', grayscale: 'all', mirror: 0.3, lockout: 2 } as const;
  const engine = new Engine(items, { autoClock: true, rng: seeded(9), fakes });
  let s: GameState = createGame('p0', { targetScore: 99, timer: 0, difficulty: 'custom', custom, mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  const history: string[] = [];
  for (let i = 0; i < 30; i++) {
    for (const recent of history.slice(-2)) assert.ok(!s.offered.includes(recent), 'locked for two turns');
    history.push(s.offered[0]);
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
    const q = s.question!;
    assert.equal(q.mode, 'art');
    assert.equal(q.options.length, 10);
    assert.equal(new Set(q.options).size, 10);
    assert.equal(q.veil, null);
    s = engine.apply(s, { type: 'answer', index: wrong(q) }, 'p0');
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
});

test('a lockout of 0 locks nothing', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(4) });
  let s: GameState = createGame('p0', { targetScore: 99, timer: 0, difficulty: 'custom', custom: { ...PRESETS.cruel, lockout: 0 }, mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  let repeats = 0;
  let last = '';
  for (let i = 0; i < 40; i++) {
    if (s.offered.includes(last)) repeats++;
    last = s.offered[0];
    s = engine.apply(s, { type: 'pick', category: last }, 'p0');
    assert.deepEqual(s.players[0].recent, []);
    s = engine.apply(s, { type: 'answer', index: wrong(s.question!) }, 'p0');
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
  assert.ok(repeats > 0, 'the last pick comes back');
});

test('deathmatch on a custom difficulty turns each knob one step harder, but never adds an unveil', () => {
  const base = { options: 4, similarNames: 0.5, fakes: 3, artChance: 0.4, veil: 'off', grayscale: 'off', mirror: 0, lockout: 2 } as const;
  const hard = rulesFor({ difficulty: 'custom', custom: base, mode: 'turns' }, true);
  assert.deepEqual(hard, { ...base, options: 6, similarNames: 1, fakes: 3, grayscale: 'art', mirror: 0.3, veil: null });
  assert.deepEqual(rulesFor({ difficulty: 'custom', custom: { ...base, veil: 'slow' }, mode: 'turns' }, true).veil, { size: 9, share: 0.8 });
  const top = Object.fromEntries(Object.entries(KNOB_STEPS).map(([k, steps]) => [k, steps.at(-1)]));
  assert.deepEqual(rulesFor({ difficulty: 'custom', custom: top as never }, true), rulesFor({ difficulty: 'custom', custom: top as never }), 'the top steps stay');
  // Presets go one tier up, still without an unveil outside race.
  assert.deepEqual(rulesFor({ difficulty: 'merciless', mode: 'turns' }, true), { ...PRESETS.eternal, veil: null });
  // Eternal goes on past itself.
  assert.deepEqual(rulesFor({ difficulty: 'eternal', mode: 'turns' }, true), {
    ...PRESETS.eternal,
    options: 10,
    fakes: 3,
    grayscale: 'all',
    mirror: 0.5,
    veil: null,
  });
});

test("a preset's knobs show its unveil only in race, so a custom copy plays the same", () => {
  assert.equal(knobsOf({ difficulty: 'eternal', mode: 'turns' }).veil, 'off');
  assert.equal(knobsOf({ difficulty: 'eternal', mode: 'race' }).veil, 'slow');
  assert.deepEqual(knobsOf({ difficulty: 'custom', custom: { ...PRESETS.cruel, veil: 'fast' }, mode: 'turns' }).veil, 'fast');
});

test('the levels past Eternal: ten options, three made-up names', () => {
  const custom = { ...PRESETS.eternal, options: 10, fakes: 3, artChance: 0 };
  const engine = new Engine(items, { autoClock: true, rng: seeded(21), fakes });
  let s: GameState = createGame('p0', { targetScore: 99, timer: 0, difficulty: 'custom', custom, mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  let three = 0;
  for (let i = 0; i < 40; i++) {
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
    const q = s.question!;
    assert.equal(q.options.length, 10);
    assert.ok(q.options.includes(q.itemId));
    const made = q.options.filter(isFake).length;
    assert.ok(made <= 3);
    if (made === 3) three++;
    s = engine.apply(s, { type: 'answer', index: right(q) }, 'p0');
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
  assert.ok(three > 20, `three made-up names in ${three} of 40`);
});

test('six options with three made-up names show all three, even when groups mix', () => {
  // Two groups of three only hold two made-up names; three pairs hold all three.
  // A category down to answers that only fit two groups of three asks a picture
  // question instead, unless picture questions are off.
  const play = (artChance: number, seed: number, check: (q: Question, mixed: boolean) => void) => {
    const custom = { ...PRESETS.eternal, options: 6, fakes: 3, artChance };
    const engine = new Engine(items, { autoClock: true, rng: seeded(seed), fakes });
    let s: GameState = createGame('p0', { targetScore: 999, timer: 0, difficulty: 'custom', custom, mode: 'turns', public: false, locked: false });
    s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
    s = engine.apply(s, { type: 'start' }, 'p0');
    let mixed = 0;
    for (let i = 0; i < 300; i++) {
      s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
      const q = s.question!;
      const real = q.options.map((id) => (isFake(id) ? id.slice('fake:'.length, id.lastIndexOf(':')) : id));
      const mixes = new Set(real.map((id) => engine.byId.get(id)!.group)).size > 1;
      if (mixes) mixed++;
      check(q, mixes);
      s = engine.apply(s, { type: 'answer', index: right(q) }, 'p0');
      s = engine.apply(s, { type: 'next' }, 'p0');
    }
    assert.ok(mixed > 20, `${mixed} questions mix groups`);
  };
  for (const seed of [3, 6, 10, 12]) play(0.4, seed, (q) => assert.equal(q.options.filter(isFake).length, q.mode === 'name' ? 3 : 0));
  // No picture questions: a name question shows the made-up names that fit.
  play(0, 3, (q, mixed) => {
    assert.equal(q.mode, 'name');
    assert.ok(q.options.filter(isFake).length >= (mixed ? 2 : 3));
  });
});

test('made-up names are capped at half the options, since each copies a real name on screen', () => {
  assert.equal(cleanKnobs({ ...PRESETS.eternal, options: 4, fakes: 3 }).fakes, 2);
  assert.equal(cleanKnobs({ ...PRESETS.eternal, options: 6, fakes: 3 }).fakes, 3);
  let { engine, s } = lobby(['Ash']);
  s = engine.apply(s, { type: 'settings', settings: { difficulty: 'custom', custom: { options: 8, fakes: 3 } } }, 'p0');
  s = engine.apply(s, { type: 'settings', settings: { custom: { options: 4 } } }, 'p0');
  assert.deepEqual([s.settings.custom!.options, s.settings.custom!.fakes], [4, 2]);
});

test('switching to race and Custom at once copies the preset as it plays in race', () => {
  let { engine, s } = lobby(['Ash'], 3, 'eternal');
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race', difficulty: 'custom' } }, 'p0');
  assert.equal(s.settings.custom!.veil, 'slow');
});

function longestRun(xs: string[]) {
  let best = 0;
  for (let i = 0, run = 0; i < xs.length; i++) best = Math.max(best, (run = i && xs[i] === xs[i - 1] ? run + 1 : 1));
  return best;
}

for (const difficulty of ['cruel', 'eternal'] as Difficulty[]) test(`${difficulty} keeps its share of art questions without long runs`, () => {
  let { engine, s } = lobby(['Ash'], 99, difficulty);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const modes = Array.from({ length: 1000 }, () => engine.makeQuestion(s, engine.categories[0]).mode);
  const share = modes.filter((m) => m === 'art').length / modes.length;
  assert.ok(Math.abs(share - PRESETS[difficulty as Preset].artChance) < 0.01, `art share ${share}`);
  assert.ok(longestRun(modes) <= 7, `run of ${longestRun(modes)}`);
});

test('art questions lean toward whoever has had too few, one tally per player', () => {
  // A roll that always says "name" until the lean outweighs it.
  const engine = new Engine(items, { autoClock: true, rng: () => 0.99 });
  let s: GameState = createGame('p0', { ...createGame(null).settings, timer: 0, difficulty: 'cruel' });
  for (const id of ['p0', 'p1']) s = engine.apply(s, { type: 'join', playerId: id, name: id }, id);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const ask = (id: string) => {
    s.turn = s.players.findIndex((p) => p.id === id);
    return engine.makeQuestion(s, engine.categories[0]).mode;
  };
  // 40% art: five name questions in a row put art 0.4 × 5 behind, enough to win the roll.
  assert.deepEqual(['p0', 'p0', 'p0', 'p0', 'p0'].map(ask), ['name', 'name', 'name', 'name', 'name']);
  assert.equal(ask('p1'), 'name', "p0's run doesn't touch p1's tally");
  assert.equal(ask('p0'), 'art');

  // Race mode keeps one tally for the room (its first question comes with the start).
  s = engine.apply(engine.apply(s, { type: 'restart' }, 'p0'), { type: 'settings', settings: { mode: 'race' } }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.equal(s.question!.mode, 'name');
  assert.deepEqual(['p0', 'p1', 'p0', 'p1'].map(ask), ['name', 'name', 'name', 'name']);
  assert.equal(ask('p1'), 'art');
});

test('a question thrown out for failed art does not count toward the art lean', () => {
  let { engine, s } = lobby(['Ash']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  for (let i = 0; i < 10; i++) {
    s = engine.apply(s, { type: 'reask' }, 'p0');
    const art = s.question!.mode === 'art' ? 1 : 0;
    assert.ok(Math.abs(s.artLean!.p0 - (PRESETS.cruel.artChance - art)) < 1e-9, 'only the latest question counts');
  }
});
