import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTE } from '../src/lib/palette.ts';
import { Engine, ActionError, AUTO_NEXT_MS, autoNextLeft, createGame, KNOB_STEPS, PRESETS, cleanKnobs, knobsOf, isDifficulty, isFake, rulesFor, RARE_GROUPS, nameSimilarity, publicView, questionTopic, singular, renameCategories, MAX_PLAYERS, type Difficulty, type Preset, type GameState, type Item, type Question } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function setup(names: string[], target = 3, difficulty: Difficulty = 'cruel') {
  const engine = new Engine(items, { rng: seeded(42) });
  let s: GameState = createGame('p0', { targetScore: target, timer: 0, difficulty });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  return { engine, s };
}

test('offers three categories and locks out picks for two turns', () => {
  const { engine } = setup(['A']);
  let { s } = setup(['A']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const history: string[] = [];
  for (let turn = 0; turn < 30; turn++) {
    assert.equal(s.phase, 'choosing');
    assert.equal(s.offered.length, 3);
    assert.equal(new Set(s.offered).size, 3);
    for (const recent of history.slice(-2)) assert.ok(!s.offered.includes(recent), `offered ${recent} too soon`);
    const cat = s.offered[0];
    history.push(cat);
    s = engine.apply(s, { type: 'pick', category: cat }, 'p0');
    const q = s.question!;
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.options.includes(q.itemId));
    assert.equal(engine.byId.get(q.itemId)!.category, cat);
    s = engine.apply(s, { type: 'answer', index: wrongIdx(q) }, 'p0');
    assert.equal(s.reveal!.correct, false);
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
  assert.equal(new Set(s.used).size, s.used.length, 'no repeated items');
});

for (const difficulty of ['merciless', 'eternal'] as Difficulty[]) test(`${difficulty} locks out picks for longer`, () => {
  const lockout = PRESETS[difficulty].lockout;
  let { engine, s } = setup(['A'], 99, difficulty);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const history: string[] = [];
  for (let turn = 0; turn < 30; turn++) {
    assert.equal(s.offered.length, 3);
    for (const recent of history.slice(-lockout)) assert.ok(!s.offered.includes(recent), `offered ${recent} too soon`);
    const cat = s.offered[0];
    history.push(cat);
    s = engine.apply(s, { type: 'pick', category: cat }, 'p0');
    s = engine.apply(s, { type: 'answer', index: wrongIdx(s.question!) }, 'p0');
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
});

test('only the active player may act and scores are counted', () => {
  let { engine, s } = setup(['A', 'B']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const active = s.players[s.turn].id;
  const other = s.players.find((p) => p.id !== active)!.id;
  assert.throws(() => engine.apply(s, { type: 'pick', category: s.offered[0] }, other));
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, active);
  s = engine.apply(s, { type: 'answer', index: right(s.question!) }, active);
  assert.equal(s.players.find((p) => p.id === active)!.score, 1);
  assert.throws(() => engine.apply(s, { type: 'start' }, other));
});

test('game ends at the end of the round once the target is reached by a single leader', () => {
  let { engine, s } = setup(['A', 'B'], 2);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const winner = s.players[0].id;
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 50) {
    const me = s.players[s.turn].id;
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, me);
    const q = s.question!;
    const pick = me === winner ? right(q) : wrongIdx(q);
    s = engine.apply(s, { type: 'answer', index: pick }, me);
    s = engine.apply(s, { type: 'next' }, me);
  }
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [winner]);
  assert.equal(s.round, 2, 'both players had equal turns');
});

test('disconnected players are skipped', () => {
  let { engine, s } = setup(['A', 'B', 'C']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const second = s.players[1].id;
  s = engine.apply(s, { type: 'connection', playerId: second, connected: false }, null);
  const first = s.players[0].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, first);
  s = engine.apply(s, { type: 'answer', index: null }, first);
  assert.equal(s.reveal!.timedOut, true);
  s = engine.apply(s, { type: 'next' }, first);
  assert.equal(s.turn, 2);
});

test('play again drops players who left, and the first turn goes to someone present', () => {
  let { engine, s } = setup(['A', 'B', 'C']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'connection', playerId: 'p1', connected: false }, null);
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.deepEqual(s.players.map((p) => p.id).sort(), ['p0', 'p2']);
  // A player who drops out in the lobby before the start never gets the first turn.
  for (let seed = 1; seed <= 20; seed++) {
    const e = new Engine(items, { rng: seeded(seed) });
    let t = setup(['A', 'B', 'C']).s;
    t = e.apply(t, { type: 'connection', playerId: 'p2', connected: false }, null);
    t = e.apply(t, { type: 'start' }, 'p0');
    assert.equal(t.players[t.turn].connected, true);
  }
});

test('joining a running game makes you a spectator who is seated at the restart', () => {
  let { engine, s } = setup(['A', 'B']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'late', name: 'Late' }, 'late');
  assert.equal(s.players.length, 2);
  assert.deepEqual(s.spectators, [{ id: 'late', name: 'Late' }]);
  assert.equal(s.phase, 'choosing', 'the game carries on');
  // Spectators can't play.
  assert.throws(() => engine.apply(s, { type: 'pick', category: s.offered[0] }, 'late'));
  // Their name is taken for this room, and joining again doesn't add them twice.
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'other', name: 'late' }, 'other'));
  s = engine.apply(s, { type: 'join', playerId: 'late', name: 'Late' }, 'late');
  assert.equal(s.spectators!.length, 1);

  const back = engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(back.phase, 'lobby');
  assert.deepEqual(back.spectators, []);
  const late = back.players.find((p) => p.id === 'late')!;
  assert.equal(late.score, 0);
  assert.equal(new Set(back.players.map((p) => p.hue)).size, 3, 'everyone has their own colour');

  const again = engine.apply(s, { type: 'restart', play: true }, 'p0');
  assert.equal(again.phase, 'choosing', 'play again starts right away');
  assert.equal(again.players.length, 3);
  assert.equal(again.version, s.version + 1);
  assert.throws(() => engine.apply(s, { type: 'restart', play: true }, 'p1'), 'only the host restarts');
});

test('spectators leave cleanly, respect the lock and the seat limit', () => {
  let { engine, s } = setup(['A']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'x', name: 'X' }, 'x');
  s = engine.apply(s, { type: 'remove', playerId: 'x' }, null);
  assert.deepEqual(s.spectators, []);
  assert.equal(s.phase, 'choosing');

  const locked = engine.apply(s, { type: 'settings', settings: { locked: true } }, 'p0');
  assert.throws(() => engine.apply(locked, { type: 'join', playerId: 'y', name: 'Y' }, 'y'));

  // A full table: spectators beyond the free seats keep watching.
  const names = ['Alba', 'Brom', 'Cyra', 'Dusk', 'Ember', 'Fenwick', 'Galt', 'Hollis', 'Iona', 'Jorik', 'Kestrel', 'Lumen'];
  let full = setup(names);
  s = full.engine.apply(full.s, { type: 'start' }, 'p0');
  s = full.engine.apply(s, { type: 'join', playerId: 'w', name: 'W' }, 'w');
  s = full.engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(s.players.length, 12);
  assert.deepEqual(s.spectators, [{ id: 'w', name: 'W' }]);
});

test('spectators waiting in a full lobby get the first free seat', () => {
  const names = ['Alba', 'Brom', 'Cyra', 'Dusk', 'Ember', 'Fenwick', 'Galt', 'Hollis', 'Iona', 'Jorik', 'Kestrel', 'Lumen'];
  let { engine, s } = setup(names);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w1', name: 'Wren' }, 'w1');
  s = engine.apply(s, { type: 'join', playerId: 'w2', name: 'Yara' }, 'w2');
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.deepEqual(s.spectators!.map((o) => o.id), ['w1', 'w2']);
  // A player leaves the lobby: the longest-waiting spectator takes the seat.
  s = engine.apply(s, { type: 'remove', playerId: 'p5' }, 'p0');
  assert.ok(s.players.some((p) => p.id === 'w1'));
  assert.deepEqual(s.spectators!.map((o) => o.id), ['w2']);
  // No one new can sit down in a full lobby, even under a spectator's name.
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'n', name: 'Nox' }, 'n'), /full/);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'n', name: 'Yara' }, 'n'));
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.equal(s.players.length, 12);
  assert.deepEqual(s.spectators!.map((o) => o.id), ['w2'], 'still waiting, the table is full');
});

test('a spectator reconnecting to a locked room keeps their spot', () => {
  let { engine, s } = setup(['A', 'B']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren' }, 'w');
  s = engine.apply(s, { type: 'settings', settings: { locked: true } }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren' }, 'w');
  assert.deepEqual(s.spectators, [{ id: 'w', name: 'Wren' }]);
  // Locking doesn't cost them their seat in the next game either.
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.ok(s.players.some((p) => p.id === 'w'));
});

test('guests see who is watching; the answer stays hidden', () => {
  let { engine, s } = setup(['A']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren' }, 'w');
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  const v = publicView(s);
  assert.deepEqual(v.spectators, [{ id: 'w', name: 'Wren' }]);
  assert.equal(v.question!.itemId, '');
  assert.deepEqual(v.question!.options, []);
});

test('difficulties scale options, decoy kind and question types', () => {
  for (const difficulty of ['cruel', 'merciless', 'eternal'] as Difficulty[]) {
    const rules = PRESETS[difficulty];
    let { s } = setup(['A'], 3, difficulty);
    const engine = new Engine(items, { rng: seeded(42), fakes });
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
      const sameGroupLeft = unused.filter((it) => it.group === answer.group && it.id !== answer.id).length;
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
    const engine = new Engine(items, { rng: seeded(11), fakes });
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

test('the topic counts a made-up name under the item it copies', () => {
  const engine = new Engine(items, { rng: seeded(7), fakes });
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
  const engine = new Engine(items);
  assert.ok(engine.categories.includes('Lineage Gems'));
  assert.ok(engine.byCategory.get('Lineage Gems')!.length >= 20);
});

test('talismans are two-handed weapons', () => {
  const talismans = items.filter((it) => it.group === 'Talismans');
  assert.ok(talismans.length > 0);
  for (const it of talismans) assert.equal(it.category, 'Two-Handed Weapons', it.name);
});

test('games saved before the category rename resume with the new names', () => {
  const { engine, s } = setup(['A', 'B']);
  const old = 'Flasks, Jewels & Relics';
  const saved: GameState = {
    ...s,
    phase: 'choosing',
    offered: [old, 'Rings', 'Helmets'],
    players: s.players.map((p) => ({ ...p, recent: [old] })),
    recentCategories: [old],
  };
  const now = renameCategories(saved);
  for (const cat of [...now.offered, ...now.recentCategories, ...now.players.flatMap((p) => p.recent)]) {
    assert.ok(engine.categories.includes(cat), cat);
  }
  assert.equal(renameCategories({ ...saved, question: engine.makeQuestion(saved, 'Rings') }).question!.category, 'Rings');
});

test('race mode: first correct answer scores, wrong answers cost a point and lock out', () => {
  let { engine, s } = setup(['A', 'B', 'C'], 2);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.equal(s.phase, 'question');
  let q = s.question!;
  assert.ok(q.deadline, 'race always has a timer');
  const wrong = wrongIdx(q);

  s = engine.apply(s, { type: 'answer', index: wrong, askedAt: q.askedAt }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')!.score, -1);
  assert.equal(s.phase, 'question');
  assert.throws(() => engine.apply(s, { type: 'answer', index: right(q) }, 'p1'), /already answered/);

  s = engine.apply(s, { type: 'answer', index: right(q), askedAt: q.askedAt }, 'p2');
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal!.winnerId, 'p2');
  // Guests learn the answer and the missed pick, nothing else.
  const shown = publicView(s).question!.options;
  q.options.forEach((id, i) => assert.equal(shown[i], i === right(q) || i === wrong ? id : ''));
  assert.equal(s.players.find((p) => p.id === 'p2')!.score, 1);
  // A slower correct answer arriving after the reveal is ignored.
  assert.throws(() => engine.apply(s, { type: 'answer', index: right(q), askedAt: q.askedAt }, 'p0'), (e: any) => e.silent);

  s = engine.apply(s, { type: 'next' }, 'p0');
  q = s.question!;
  // Everyone wrong: question ends with no winner.
  for (const id of ['p0', 'p1', 'p2']) s = engine.apply(s, { type: 'answer', index: wrongIdx(q) }, id);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal!.winnerId, null);

  // A stale answer for an old question is ignored.
  s = engine.apply(s, { type: 'next' }, 'p0');
  assert.throws(() => engine.apply(s, { type: 'answer', index: right(s.question!), askedAt: q.askedAt }, 'p0'), (e: any) => e.silent);

  // Reaching the target ends the game right after the reveal.
  assert.equal(s.players.find((p) => p.id === 'p2')!.score, 0, 'everyone lost a point');
  s = engine.apply(s, { type: 'answer', index: right(s.question!) }, 'p2');
  s = engine.apply(s, { type: 'next' }, 'p0');
  assert.equal(s.phase, 'question');
  s = engine.apply(s, { type: 'answer', index: right(s.question!) }, 'p2');
  assert.equal(s.players.find((p) => p.id === 'p2')!.score, 2);
  s = engine.apply(s, { type: 'next' }, 'p0');
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, ['p2']);
});

test('guests never see the answer before the reveal', () => {
  let { engine, s } = setup(['A', 'B']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, s.players[s.turn].id);
  const q = s.question!;
  const view = publicView(s);
  const text = JSON.stringify(view);
  assert.equal(view.question!.itemId, '');
  assert.deepEqual(view.question!.options, []);
  assert.deepEqual(view.used, []);
  assert.ok(!text.includes(q.itemId), 'answer id not anywhere in the guest copy');
  for (const id of q.options) assert.ok(!text.includes(id), 'no option item ids either');
  assert.equal(view.question!.labels.length, q.options.length);
  // After the reveal: the answer is shown, untouched decoys stay anonymous.
  const wrong = wrongIdx(q);
  s = engine.apply(s, { type: 'answer', index: wrong }, s.players[s.turn].id);
  const revealed = publicView(s).question!;
  assert.equal(revealed.itemId, q.itemId);
  q.options.forEach((id, i) => {
    const shouldShow = i === right(q) || i === wrong;
    assert.equal(revealed.options[i], shouldShow ? id : '', `option ${i}`);
  });
});

test('eternal mirrors some pictures, each on its own roll', () => {
  const engine = new Engine(items, { rng: seeded(9) });
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
  for (let i = 0; i < 4000; i++) {
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

test('guests only learn which pictures were mirrored at the reveal', () => {
  let { engine, s } = setup(['A'], 3, 'eternal');
  s = engine.apply(s, { type: 'start' }, 'p0');
  // Keep asking until a question has a mirrored picture.
  while (true) {
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
    if (s.question!.mirrored!.some(Boolean)) break;
    s = engine.apply(s, { type: 'answer', index: wrongIdx(s.question!) }, 'p0');
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
  const q = s.question!;
  assert.deepEqual(publicView(s).question!.mirrored, []);
  s = engine.apply(s, { type: 'answer', index: wrongIdx(q) }, 'p0');
  assert.deepEqual(publicView(s).question!.mirrored, q.mirrored);
});

test('guests cannot act for others, join locked rooms, or impersonate', () => {
  let { engine, s } = setup(['Alva', 'Zana']);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p0', name: 'X' }, 'p1'), /Not allowed/);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p9', name: 'Host' }, 'p9'), /reserved/);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p9', name: 'Zаna' }, 'p9'), /looks too much like/); // Cyrillic а
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p9', name: 'A1va' }, 'p9'), /looks too much like/);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p9', name: '\u200b\u202e ' }, 'p9'), /at least one letter/);
  s = engine.apply(s, { type: 'join', playerId: 'p9', name: 'Dori\u202eevil\u200b' }, 'p9');
  assert.equal(s.players.find((p) => p.id === 'p9')!.name, 'Dorievil');
  s = engine.apply(s, { type: 'settings', settings: { locked: true } }, 'p0');
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p8', name: 'Late' }, 'p8'), /locked/);
  // Rejoining an existing seat is still fine, and keeps the original name.
  s = engine.apply(s, { type: 'join', playerId: 'p1', name: 'Renamed' }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')!.name, 'Zana');
  // Someone the lobby dropped (a refresh) is let back in when the host knows them.
  s = engine.apply(s, { type: 'remove', playerId: 'p1' }, null);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p1', name: 'Zana' }, 'p1'), /locked/);
  s = engine.apply(s, { type: 'join', playerId: 'p1', name: 'Zana', returning: true }, 'p1');
  assert.ok(s.players.some((p) => p.id === 'p1'));
  assert.throws(() => engine.apply(s, { type: 'settings', settings: { locked: false } }, 'p1'), /host/);
});

test('tablets are rarer answers and only fill in as decoys', () => {
  const engine = new Engine(items, { rng: seeded(7) });
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

/** Plays one turn for whoever is active: pick the first offer, answer right or wrong. */
function playTurn(engine: Engine, s: GameState, correct: (id: string) => boolean): GameState {
  const me = s.players[s.turn].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, me);
  const q = s.question!;
  s = engine.apply(s, { type: 'answer', index: correct(me) ? right(q) : wrongIdx(q) }, me);
  return engine.apply(s, { type: 'next' }, me);
}

test('a tie over the target starts a deathmatch between the tied players only', () => {
  let { engine, s } = setup(['A', 'B', 'C'], 1);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const [x, y, z] = s.players.map((p) => p.id);
  // Round 1: x and y score, z misses -> x and y tied at the target.
  for (let i = 0; i < 3; i++) s = playTurn(engine, s, (id) => id !== z);
  assert.equal(s.phase, 'choosing');
  assert.deepEqual(s.deathmatch!.alive, [x, y]);
  assert.equal(s.offered.length, 1, 'deathmatch offers a single random category');
  assert.equal(s.players[s.turn].id, x);
  // One tier harder: cruel -> merciless (6 options).
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, x);
  assert.equal(s.question!.options.length, PRESETS.merciless.options);
  s = engine.apply(s, { type: 'answer', index: right(s.question!) }, x);
  s = engine.apply(s, { type: 'next' }, x);
  // z never gets a deathmatch turn.
  assert.equal(s.players[s.turn].id, y);
  // Both right -> another round, nobody out.
  s = playTurn(engine, s, () => true);
  assert.equal(s.deathmatch!.round, 2);
  assert.deepEqual(s.deathmatch!.alive, [x, y]);
  // Round 2: x wrong, y right -> y wins.
  s = playTurn(engine, s, (id) => id === y);
  s = playTurn(engine, s, (id) => id === y);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [y]);
  assert.deepEqual(s.deathmatch!.eliminated, [x]);
});

test('deathmatch: everyone wrong keeps everyone in; three-way ties shrink', () => {
  let { engine, s } = setup(['A', 'B', 'C'], 1);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const ids = s.players.map((p) => p.id);
  for (let i = 0; i < 3; i++) s = playTurn(engine, s, () => true);
  assert.deepEqual(s.deathmatch!.alive, ids);
  for (let i = 0; i < 3; i++) s = playTurn(engine, s, () => false);
  assert.equal(s.deathmatch!.round, 2);
  assert.deepEqual(s.deathmatch!.alive, ids, 'all wrong: nobody out');
  // Round 2: first two right, last wrong -> last out.
  for (let i = 0; i < 3; i++) s = playTurn(engine, s, (id) => id !== ids[2]);
  assert.deepEqual(s.deathmatch!.alive, [ids[0], ids[1]]);
  assert.deepEqual(s.deathmatch!.eliminated, [ids[2]]);
  // Round 3: second right -> wins.
  for (let i = 0; i < 2; i++) s = playTurn(engine, s, (id) => id === ids[1]);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [ids[1]]);
});

test('deathmatch: a disconnected duelist forfeits', () => {
  let { engine, s } = setup(['A', 'B'], 1);
  s = engine.apply(s, { type: 'start' }, 'p0');
  for (let i = 0; i < 2; i++) s = playTurn(engine, s, () => true);
  const [x, y] = s.deathmatch!.alive;
  s = engine.apply(s, { type: 'connection', playerId: y, connected: false }, null);
  s = playTurn(engine, s, () => false);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [x]);
});

test('the answer is not the name that fits the other options best', () => {
  // Pick the option whose name is most (or least) like the others: neither may beat a blind guess by much.
  const engine = new Engine(items, { rng: seeded(11) });
  for (const difficulty of ['merciless', 'eternal'] as Difficulty[]) {
    const N = 3000;
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
  const engine = new Engine(items, { rng: seeded(5) });
  let s: GameState = createGame(null, { targetScore: 99, timer: 0, difficulty: 'eternal', mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'A' }, 'p0');
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
  const engine = new Engine(items, { rng: seeded(3) });
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
  const engine = new Engine(items, { rng: seeded(11) });
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

test('question ids keep increasing even if the clock goes back', () => {
  let clock = 1_000_000;
  const engine = new Engine(items, { rng: seeded(9), now: () => clock });
  let s: GameState = createGame(null, { targetScore: 99, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'A' }, 'p0');
  s = engine.apply(s, { type: 'start' }, null);
  let last = 0;
  for (let t = 0; t < 5; t++) {
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, null);
    assert.ok(s.question!.askedAt > last);
    last = s.question!.askedAt;
    s = engine.apply(s, { type: 'answer', index: 0 }, null);
    s = engine.apply(s, { type: 'next' }, null);
    clock -= 60_000;
  }
});

test('removing the last seat on their turn still ends the round (and the game)', () => {
  const engine = new Engine(items, { rng: seeded(42) });
  let s: GameState = createGame(null, { targetScore: 1, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  ['A', 'B', 'C'].forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  s = engine.apply(s, { type: 'start' }, null);
  const [x, , z] = s.players.map((p) => p.id);
  s = playTurn(engine, s, (id) => id === x);
  s = playTurn(engine, s, (id) => id === x);
  assert.equal(s.players[s.turn].id, z);
  s = engine.apply(s, { type: 'remove', playerId: z }, null);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [x]);
});

test('removing a player seated before the active duelist keeps their question', () => {
  const engine = new Engine(items, { rng: seeded(42) });
  let s: GameState = createGame(null, { targetScore: 1, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  ['A', 'B', 'C', 'D'].forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  s = engine.apply(s, { type: 'start' }, null);
  for (let i = 0; i < 4; i++) s = playTurn(engine, s, () => true);
  assert.equal(s.deathmatch!.alive.length, 4);
  s = playTurn(engine, s, () => true);
  assert.ok(s.turn > 0);
  const active = s.players[s.turn].id;
  const before = s.players[s.turn - 1].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, active);
  const asked = s.question!.askedAt;
  s = engine.apply(s, { type: 'remove', playerId: before }, null);
  assert.equal(s.players[s.turn].id, active);
  assert.equal(s.phase, 'question');
  assert.equal(s.question!.askedAt, asked);
  assert.deepEqual(s.deathmatch!.alive, s.players.map((p) => p.id));
});

test('a duelist who drops out and is left behind counts as eliminated', () => {
  let { engine, s } = setup(['A', 'B'], 1);
  s = engine.apply(s, { type: 'start' }, 'p0');
  for (let i = 0; i < 2; i++) s = playTurn(engine, s, () => true);
  const [x, y] = s.deathmatch!.alive;
  s = engine.apply(s, { type: 'connection', playerId: y, connected: false }, null);
  s = playTurn(engine, s, () => false);
  assert.deepEqual(s.winners, [x]);
  assert.deepEqual(s.deathmatch!.eliminated, [y]);
});

test('the host can swap a question for another in the same category, without using up the turn', () => {
  let { engine, s } = setup(['A', 'B']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const me = s.players[s.turn].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, me);
  const before = s.question!;
  assert.throws(() => engine.apply(s, { type: 'reask' }, 'p1'), /host/);
  s = engine.apply(s, { type: 'reask' }, 'p0');
  const after = s.question!;
  assert.equal(s.phase, 'question');
  assert.equal(s.players[s.turn].id, me);
  assert.equal(after.category, before.category);
  assert.notEqual(after.itemId, before.itemId);
  assert.ok(after.askedAt > before.askedAt);
  assert.ok(s.used.includes(before.itemId) && s.used.includes(after.itemId));
  // Late answers to the old question are dropped.
  assert.throws(() => engine.apply(s, { type: 'answer', index: 0, askedAt: before.askedAt }, me), /Too late/);
});

test('only real difficulties are accepted, not names inherited from Object', () => {
  let { engine, s } = setup(['A']);
  for (const bogus of ['toString', 'constructor', '__proto__']) {
    s = engine.apply(s, { type: 'settings', settings: { difficulty: bogus as Difficulty } }, 'p0');
    assert.equal(s.settings.difficulty, 'cruel');
    assert.deepEqual(rulesFor({ difficulty: bogus as Difficulty }), rulesFor({ difficulty: 'merciless' }), 'unknown falls back to the default');
    assert.equal(isDifficulty(bogus), false);
  }
  assert.equal(isDifficulty('eternal'), true);
});

test('a second Next for the same reveal is dropped quietly', () => {
  let { engine, s } = setup(['A', 'B']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const me = s.players[s.turn].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, me);
  s = engine.apply(s, { type: 'answer', index: 0 }, me);
  s = engine.apply(s, { type: 'next' }, null);
  assert.throws(
    () => engine.apply(s, { type: 'next' }, me),
    (err: unknown) => err instanceof ActionError && err.silent,
  );
});

test('reveals are stamped with the host clock; only the host or (turns) whoever answered moves on', () => {
  for (const mode of ['turns', 'race'] as const) {
    let clock = 5_000_000;
    const engine = new Engine(items, { rng: seeded(3), now: () => clock });
    let s: GameState = createGame('p0', { targetScore: 9, timer: 0, difficulty: 'cruel', mode, public: false, locked: false });
    for (const [i, name] of ['A', 'B', 'C'].entries()) s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`);
    s = engine.apply(s, { type: 'start' }, 'p0');
    // Race: anyone answers; turns: whoever's turn it is. Never the host here.
    if (mode === 'turns') while (s.players[s.turn].id === 'p0') s = engine.apply(s, { type: 'skip' }, 'p0');
    const answerer = mode === 'turns' ? s.players[s.turn].id : 'p1';
    if (mode === 'turns') s = engine.apply(s, { type: 'pick', category: s.offered[0] }, answerer);
    clock += 1234;
    const q = s.question!;
    s = engine.apply(s, { type: 'answer', index: right(q), askedAt: q.askedAt }, answerer);
    assert.equal(s.phase, 'reveal');
    assert.equal(s.reveal!.at, clock, `${mode}: the reveal is stamped`);
    clock += 999;
    const after = engine.apply(s, { type: 'join', playerId: 'late', name: 'Late' }, 'late');
    assert.equal(after.reveal!.at, s.reveal!.at, `${mode}: later updates keep the stamp`);
    const bystander = s.players.find((p) => p.id !== 'p0' && p.id !== answerer)!.id;
    assert.throws(() => engine.apply(s, { type: 'next' }, bystander), ActionError, `${mode}: a bystander can't move on`);
    if (mode === 'race') assert.throws(() => engine.apply(s, { type: 'next' }, answerer), /host moves the race on/);
    else assert.equal(engine.apply(s, { type: 'next' }, answerer).phase, 'choosing', 'turns: whoever answered moves on');
    assert.notEqual(engine.apply(s, { type: 'next' }, 'p0').phase, 'reveal', `${mode}: the host moves on`);
  }
});

test('the automatic move on counts down from the reveal stamp', () => {
  assert.equal(autoNextLeft(1000, 1000), AUTO_NEXT_MS, 'just revealed');
  assert.equal(autoNextLeft(1000, 1000 + 1500), AUTO_NEXT_MS - 1500);
  assert.equal(autoNextLeft(1000, 1000 + AUTO_NEXT_MS + 5000), 0, 'long overdue');
  assert.equal(autoNextLeft(1000, 0), AUTO_NEXT_MS, 'a clock behind the stamp never adds time');
  assert.equal(autoNextLeft(undefined, 123), AUTO_NEXT_MS, 'no stamp: the full delay');
});

test('race: asking another question refunds blind guesses and leaves out all the old pictures', () => {
  let { engine, s } = setup(['A', 'B', 'C'], 5);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  const q = s.question!;
  s = engine.apply(s, { type: 'answer', index: wrongIdx(q), askedAt: q.askedAt }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')!.score, -1);
  s = engine.apply(s, { type: 'reask' }, 'p0');
  assert.equal(s.players.find((p) => p.id === 'p1')!.score, 0, 'the voided miss is refunded');
  const next = s.question!;
  assert.deepEqual(next.misses, []);
  for (const id of next.options) assert.ok(!q.options.includes(id), 'no picture from the voided question comes back');
  // The refunded player can answer the new question.
  s = engine.apply(s, { type: 'answer', index: right(next), askedAt: next.askedAt }, 'p1');
  assert.equal(s.reveal!.winnerId, 'p1');
});

test('seats kept for players who never came back are let go when the game starts', () => {
  let { engine, s } = setup(['A', 'B', 'C']);
  // The host refreshed: everyone else is offline until they reconnect.
  for (const id of ['p1', 'p2']) s = engine.apply(s, { type: 'connection', playerId: id, connected: false }, null);
  s = engine.apply(s, { type: 'join', playerId: 'p1', name: 'B' }, 'p1'); // p1 came back
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.deepEqual(s.players.map((p) => p.id).sort(), ['p0', 'p1']);
});

test('a returning guest waits for a seat in a full lobby, and gets one freed at the start', () => {
  const names = ['Alva', 'Zana', 'Doryani', 'Tujen', 'Rog', 'Gwennen', 'Dannig', 'Oyra', 'Kirac', 'Niko', 'Jun', 'Einhar'];
  let { engine, s } = setup(names);
  assert.equal(s.players.length, 12);
  // The host refreshed: p11 hasn't come back, and a former spectator reconnects.
  s = engine.apply(s, { type: 'connection', playerId: 'p11', connected: false }, null);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'new', name: 'Stranger' }, 'new'), /lobby is full/);
  s = engine.apply(s, { type: 'join', playerId: 'w1', name: 'Watcher', returning: true }, 'w1');
  assert.deepEqual(s.spectators!.map((o) => o.id), ['w1']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.ok(s.players.some((p) => p.id === 'w1'), 'the waiting guest takes the empty seat');
  assert.ok(!s.players.some((p) => p.id === 'p11'));
  assert.deepEqual(s.spectators, []);
});

test('eternal swaps two decoys on name questions for made-up names', () => {
  const engine = new Engine(items, { rng: seeded(21), fakes });
  const byId = new Map(items.map((it) => [it.id, it]));
  for (const difficulty of ['cruel', 'merciless'] as Difficulty[]) {
    const s = createGame(null, { targetScore: 5, timer: 0, difficulty, mode: 'turns', public: false, locked: false });
    for (let i = 0; i < 200; i++) {
      const q = engine.makeQuestion(s, engine.categories[i % engine.categories.length]);
      assert.ok(!q.options.some(isFake), `${difficulty} has no fakes`);
    }
  }
  const s = createGame(null, { targetScore: 5, timer: 0, difficulty: 'eternal', mode: 'turns', public: false, locked: false });
  let pairs = 0;
  let answerPairs = 0;
  let shownReal = 0;
  for (let i = 0; i < 4000; i++) {
    const q = engine.makeQuestion(s, engine.categories[i % engine.categories.length]);
    assert.equal(q.options.length, PRESETS.eternal.options);
    const fakeIdx = q.options.flatMap((id, i) => (isFake(id) ? [i] : []));
    if (q.mode === 'art') {
      assert.deepEqual(fakeIdx, [], 'art questions only show real pictures');
      continue;
    }
    assert.equal(fakeIdx.length, PRESETS.eternal.fakes);
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
  const actual = answerPairs / (shownReal / (PRESETS.eternal.options - PRESETS.eternal.fakes));
  assert.ok(Math.abs(actual - expected) < 0.04, `answer twinned ${actual.toFixed(3)} vs ${expected.toFixed(3)}`);
});

test('made-up names stay hidden until the reveal, and never count as used items', () => {
  const engine = new Engine(items, { rng: seeded(4), fakes });
  let s: GameState = createGame('p0', { targetScore: 3, timer: 0, difficulty: 'eternal', mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'A' }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  while (!s.question!.options.some(isFake)) s = engine.apply(s, { type: 'reask' }, 'p0');
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
    const engine = new Engine(items, { rng: seeded(8), fakes });
    let s: GameState = createGame('p0', { targetScore: 999, timer: 0, difficulty: 'eternal', mode, public: false, locked: false });
    s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'A' }, 'p0');
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
  let { engine, s } = setup(['A', 'B'], 5);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const play = () => {
    const asked: string[] = [];
    while (s.phase !== 'over') {
      const id = s.players[s.turn].id;
      s = engine.apply(s, { type: 'pick', category: s.offered[0] }, id);
      asked.push(s.question!.itemId);
      // Only A answers right, so nobody ties into a deathmatch.
      const q = s.question!;
      s = engine.apply(s, { type: 'answer', index: id === 'p0' ? right(q) : wrongIdx(q) }, id);
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

test('zoe_arcana always gets the last avatar colour', () => {
  const names = ['Ash', 'Bram', 'Cyra', 'Dusk', 'Ember', 'Fenn', 'Gale', 'Hollis', 'Iris', 'Jarek', 'Kestrel'];
  // Others fill the colours in order and leave the reserved one for last.
  let { engine, s } = setup(names);
  assert.deepEqual(s.players.map((p) => p.hue), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  s = engine.apply(s, { type: 'join', playerId: 'z', name: 'Zoe_Arcana' }, 'z');
  assert.equal(s.players.find((p) => p.id === 'z')!.hue, 11);

  // Whoever had it moves to a free colour when she joins.
  ({ engine, s } = setup(['A', 'B', 'C']));
  s.players[1].hue = 11;
  s = engine.apply(s, { type: 'join', playerId: 'z', name: 'zoe_arcana' }, 'z');
  assert.equal(s.players.find((p) => p.id === 'z')!.hue, 11);
  assert.equal(s.players[1].hue, 1);
  assert.equal(new Set(s.players.map((p) => p.hue)).size, 4);

  // Renaming to it claims it too.
  ({ engine, s } = setup(['A', 'B']));
  s = engine.apply(s, { type: 'rename', playerId: 'p0', name: 'zoe_arcana' }, 'p0');
  assert.equal(s.players[0].hue, 11);
  s = engine.apply(s, { type: 'join', playerId: 'c', name: 'C' }, 'c');
  assert.equal(s.players.find((p) => p.id === 'c')!.hue, 0, 'her old colour is free again');

  // Any spelling the name check treats as the same name counts.
  ({ engine, s } = setup(['A']));
  s = engine.apply(s, { type: 'join', playerId: 'z', name: 'Zoe Arcana' }, 'z');
  assert.equal(s.players.find((p) => p.id === 'z')!.hue, 11);
  assert.equal(PALETTE.length, MAX_PLAYERS, 'one colour per seat, ruby last');

  // Renaming away from it gives it up.
  ({ engine, s } = setup(['A', 'B']));
  s = engine.apply(s, { type: 'rename', playerId: 'p0', name: 'zoe_arcana' }, 'p0');
  s = engine.apply(s, { type: 'rename', playerId: 'p0', name: 'Ash' }, 'p0');
  assert.equal(s.players[0].hue, 0);

  // Mid-game renames don't recolour anyone until the next game.
  ({ engine, s } = setup(['A', 'B']));
  s.players[1].hue = 11;
  s = engine.apply(s, { type: 'start' }, 'p0');
  const hue = (id: string) => s.players.find((p) => p.id === id)!.hue;
  s = engine.apply(s, { type: 'rename', playerId: 'p0', name: 'zoe_arcana' }, 'p0');
  assert.deepEqual([hue('p0'), hue('p1')], [0, 11]);
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.deepEqual([hue('p0'), hue('p1')], [11, 0]);
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
      const engine = new Engine(items, { rng: seeded(5), fakes });
      let s: GameState = createGame('p0', { targetScore: 99, timer: 20, difficulty, custom, mode, public: false, locked: false });
      s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'A' }, 'p0');
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
        s = engine.apply(s, { type: 'answer', index: wrongIdx(q) }, 'p0');
        s = engine.apply(s, { type: 'next' }, 'p0');
      }
      assert.ok(named > 0);
    }
  }
});

test('the host can tune a custom difficulty, one knob at a time, within the allowed steps', () => {
  let { engine, s } = setup(['A', 'B']);
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
  const engine = new Engine(items, { rng: seeded(9), fakes });
  let s: GameState = createGame('p0', { targetScore: 99, timer: 0, difficulty: 'custom', custom, mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'A' }, 'p0');
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
    s = engine.apply(s, { type: 'answer', index: wrongIdx(q) }, 'p0');
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
});

test('a lockout of 0 locks nothing', () => {
  const engine = new Engine(items, { rng: seeded(4) });
  let s: GameState = createGame('p0', { targetScore: 99, timer: 0, difficulty: 'custom', custom: { ...PRESETS.cruel, lockout: 0 }, mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'A' }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  let repeats = 0;
  let last = '';
  for (let i = 0; i < 40; i++) {
    if (s.offered.includes(last)) repeats++;
    last = s.offered[0];
    s = engine.apply(s, { type: 'pick', category: last }, 'p0');
    assert.deepEqual(s.players[0].recent, []);
    s = engine.apply(s, { type: 'answer', index: wrongIdx(s.question!) }, 'p0');
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
  const engine = new Engine(items, { rng: seeded(21), fakes });
  let s: GameState = createGame('p0', { targetScore: 99, timer: 0, difficulty: 'custom', custom, mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'A' }, 'p0');
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

test('made-up names are capped at half the options, since each copies a real name on screen', () => {
  assert.equal(cleanKnobs({ ...PRESETS.eternal, options: 4, fakes: 3 }).fakes, 2);
  assert.equal(cleanKnobs({ ...PRESETS.eternal, options: 6, fakes: 3 }).fakes, 3);
  let { engine, s } = setup(['A']);
  s = engine.apply(s, { type: 'settings', settings: { difficulty: 'custom', custom: { options: 8, fakes: 3 } } }, 'p0');
  s = engine.apply(s, { type: 'settings', settings: { custom: { options: 4 } } }, 'p0');
  assert.deepEqual([s.settings.custom!.options, s.settings.custom!.fakes], [4, 2]);
});

test('switching to race and Custom at once copies the preset as it plays in race', () => {
  let { engine, s } = setup(['A'], 3, 'eternal');
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race', difficulty: 'custom' } }, 'p0');
  assert.equal(s.settings.custom!.veil, 'slow');
});

function longestRun(xs: string[]) {
  let best = 0;
  for (let i = 0, run = 0; i < xs.length; i++) best = Math.max(best, (run = i && xs[i] === xs[i - 1] ? run + 1 : 1));
  return best;
}

for (const difficulty of ['cruel', 'eternal'] as Difficulty[]) test(`${difficulty} keeps its share of art questions without long runs`, () => {
  let { engine, s } = setup(['A'], 99, difficulty);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const modes = Array.from({ length: 1000 }, () => engine.makeQuestion(s, engine.categories[0]).mode);
  const share = modes.filter((m) => m === 'art').length / modes.length;
  assert.ok(Math.abs(share - PRESETS[difficulty as Preset].artChance) < 0.01, `art share ${share}`);
  assert.ok(longestRun(modes) <= 7, `run of ${longestRun(modes)}`);
});

test('art questions lean toward whoever has had too few, one tally per player', () => {
  // A roll that always says "name" until the lean outweighs it.
  const engine = new Engine(items, { rng: () => 0.99 });
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
  let { engine, s } = setup(['A']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  for (let i = 0; i < 10; i++) {
    s = engine.apply(s, { type: 'reask' }, 'p0');
    const art = s.question!.mode === 'art' ? 1 : 0;
    assert.ok(Math.abs(s.artLean!.p0 - (PRESETS.cruel.artChance - art)) < 1e-9, 'only the latest question counts');
  }
});

test('the held name is refused until the device is unlocked', async () => {
  const { nameHeld, unlockHeldName } = await import('../src/lib/names.ts');
  assert.equal(nameHeld('Doryani'), false);
  assert.equal(nameHeld('Zoe_Arcana'), true);
  assert.equal(await unlockHeldName('nope'), false);
  assert.equal(await unlockHeldName('minu'), true);
  assert.equal(nameHeld('zoe_arcana'), true);
});
