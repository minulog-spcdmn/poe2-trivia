import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, createGame, DIFFICULTIES, RARE_GROUPS, nameSimilarity, publicView, type Difficulty, type GameState, type Item, type Question } from '../src/lib/game.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));

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
  const lockout = DIFFICULTIES[difficulty].lockout;
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

test('difficulties scale options, decoy kind and question types', () => {
  for (const difficulty of ['cruel', 'merciless', 'eternal'] as Difficulty[]) {
    const rules = DIFFICULTIES[difficulty];
    let { engine, s } = setup(['A'], 3, difficulty);
    s = engine.apply(s, { type: 'start' }, 'p0');
    const modes = new Set<string>();
    for (let turn = 0; turn < 40; turn++) {
      s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
      const q = s.question!;
      modes.add(q.mode);
      assert.equal(q.options.length, rules.options);
      assert.equal(new Set(q.options).size, rules.options);
      const answer = engine.byId.get(q.itemId)!;
      for (const id of q.options) assert.equal(engine.byId.get(id)!.category, answer.category, 'decoys share the category');
      const groupSize = engine.items.filter((it) => it.group === answer.group).length;
      if (rules.groupFirst && groupSize >= rules.options) {
        for (const id of q.options) assert.equal(engine.byId.get(id)!.group, answer.group, 'decoys share the group');
      }
      assert.equal(!!q.veil, !!rules.veil && q.mode === 'name');
      s = engine.apply(s, { type: 'answer', index: right(q) }, 'p0');
      s = engine.apply(s, { type: 'next' }, 'p0');
      if (s.phase === 'over') s = engine.apply(engine.apply(s, { type: 'restart' }, 'p0'), { type: 'start' }, 'p0');
    }
    assert.ok(modes.has('art') && modes.has('name'));
  }
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
  assert.throws(() => engine.apply(s, { type: 'settings', settings: { locked: false } }, 'p1'), /host/);
});

test('tablets are rarer answers and only fill in as decoys', () => {
  const engine = new Engine(items, { rng: seeded(7) });
  const cat = 'Flasks, Jewels & Relics';
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
  assert.equal(s.question!.options.length, DIFFICULTIES.merciless.options);
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
  assert.ok(new Set(answers).size > size - DIFFICULTIES.eternal.options, 'goes through most of the category first');
});

test('a tablet answer gets tablet decoys, so a tablet among the options gives nothing away', () => {
  const engine = new Engine(items, { rng: seeded(3) });
  const cat = 'Flasks, Jewels & Relics';
  for (const difficulty of ['cruel', 'merciless', 'eternal'] as Difficulty[]) {
    for (let i = 0; i < 1500; i++) {
      const s = createGame(null, { targetScore: 5, timer: 0, difficulty, mode: 'turns', public: false, locked: false });
      const q = engine.makeQuestion(s, cat);
      const tablets = q.options.filter((id) => engine.byId.get(id)!.group === 'Tablets').length;
      assert.ok(tablets === 0 || tablets === q.options.length, `${difficulty}: ${tablets} tablets among ${q.options.length}`);
    }
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
