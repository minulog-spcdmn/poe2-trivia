// The game's flow (src/lib/game.ts): turns, races and deathmatches, what guests see before the reveal, the clock, streaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, ActionError, AUTO_NEXT_MS, autoNextLeft, createGame, PRESETS, publicView, renameCategories, type GameState, type Preset } from '../src/lib/game.ts';
import { items, lobby, playTurn, right, seeded, wrong } from './helpers.ts';

test('offers three categories and locks out picks for two turns', () => {
  let { engine, s } = lobby(['Ash']);
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
    s = engine.apply(s, { type: 'answer', index: wrong(q) }, 'p0');
    assert.equal(s.reveal!.correct, false);
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
  assert.equal(new Set(s.used).size, s.used.length, 'no repeated items');
});

for (const difficulty of ['merciless', 'eternal'] as Preset[]) test(`${difficulty} locks out picks for longer`, () => {
  const lockout = PRESETS[difficulty].lockout;
  let { engine, s } = lobby(['Ash'], 99, difficulty);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const history: string[] = [];
  for (let turn = 0; turn < 30; turn++) {
    assert.equal(s.offered.length, 3);
    for (const recent of history.slice(-lockout)) assert.ok(!s.offered.includes(recent), `offered ${recent} too soon`);
    const cat = s.offered[0];
    history.push(cat);
    s = engine.apply(s, { type: 'pick', category: cat }, 'p0');
    s = engine.apply(s, { type: 'answer', index: wrong(s.question!) }, 'p0');
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
});

test('only the active player may act and scores are counted', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
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
  let { engine, s } = lobby(['Ash', 'Bram'], 2);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const winner = s.players[0].id;
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 50) {
    const me = s.players[s.turn].id;
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, me);
    const q = s.question!;
    const pick = me === winner ? right(q) : wrong(q);
    s = engine.apply(s, { type: 'answer', index: pick }, me);
    s = engine.apply(s, { type: 'next' }, me);
  }
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [winner]);
  assert.equal(s.round, 2, 'both players had equal turns');
});

test('disconnected players are skipped', () => {
  let { engine, s } = lobby(['Ash', 'Bram', 'Cora']);
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

test('games saved before the category rename resume with the new names', () => {
  const { engine, s } = lobby(['Ash', 'Bram']);
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
  let { engine, s } = lobby(['Ash', 'Bram', 'Cora'], 2);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.equal(s.phase, 'question');
  let q = s.question!;
  assert.ok(q.deadline, 'race always has a timer');
  const miss = wrong(q);

  s = engine.apply(s, { type: 'answer', index: miss, askedAt: q.askedAt }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')!.score, -1);
  assert.equal(s.phase, 'question');
  assert.throws(() => engine.apply(s, { type: 'answer', index: right(q) }, 'p1'), /already answered/);

  s = engine.apply(s, { type: 'answer', index: right(q), askedAt: q.askedAt }, 'p2');
  assert.equal(s.phase, 'reveal');
  assert.equal(s.reveal!.winnerId, 'p2');
  // Guests learn the answer and the missed pick, nothing else.
  const shown = publicView(s).question!.options;
  q.options.forEach((id, i) => assert.equal(shown[i], i === right(q) || i === miss ? id : ''));
  assert.equal(s.players.find((p) => p.id === 'p2')!.score, 1);
  // A slower correct answer arriving after the reveal is ignored.
  assert.throws(() => engine.apply(s, { type: 'answer', index: right(q), askedAt: q.askedAt }, 'p0'), (e: any) => e.silent);

  s = engine.apply(s, { type: 'next' }, 'p0');
  q = s.question!;
  // Everyone wrong: question ends with no winner.
  for (const id of ['p0', 'p1', 'p2']) s = engine.apply(s, { type: 'answer', index: wrong(q) }, id);
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
  let { engine, s } = lobby(['Ash', 'Bram']);
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
  const miss = wrong(q);
  s = engine.apply(s, { type: 'answer', index: miss }, s.players[s.turn].id);
  const revealed = publicView(s).question!;
  assert.equal(revealed.itemId, q.itemId);
  q.options.forEach((id, i) => {
    const shouldShow = i === right(q) || i === miss;
    assert.equal(revealed.options[i], shouldShow ? id : '', `option ${i}`);
  });
});

test('guests only learn which pictures were mirrored at the reveal', () => {
  let { engine, s } = lobby(['Ash'], 3, 'eternal');
  s = engine.apply(s, { type: 'start' }, 'p0');
  // Keep asking until a question has a mirrored picture.
  for (let i = 0; ; i++) {
    assert.ok(i < 500, 'no mirrored picture in 500 questions');
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
    if (s.question!.mirrored!.some(Boolean)) break;
    s = engine.apply(s, { type: 'answer', index: wrong(s.question!) }, 'p0');
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
  const q = s.question!;
  assert.deepEqual(publicView(s).question!.mirrored, []);
  s = engine.apply(s, { type: 'answer', index: wrong(q) }, 'p0');
  assert.deepEqual(publicView(s).question!.mirrored, q.mirrored);
});

test('guests only learn which art a picture showed at the reveal, and only for the pictures it names', () => {
  let { engine, s } = lobby(['Ash'], 99, 'merciless');
  s = engine.apply(s, { type: 'start' }, 'p0');
  let found = { name: false, art: false };
  for (let i = 0; i < 2000 && !(found.name && found.art); i++) {
    const category = s.offered.includes('Rings') ? 'Rings' : s.offered[0];
    s = engine.apply(s, { type: 'pick', category }, 'p0');
    const q = s.question!;
    assert.deepEqual(publicView(s).question!.variant, [], 'nothing before the reveal');
    s = engine.apply(s, { type: 'answer', index: wrong(q) }, 'p0');
    const seen = publicView(s).question!;
    if (q.variant) {
      found[q.mode] = true;
      if (q.mode === 'name') assert.deepEqual(seen.variant, q.variant, 'the art named is the answer\'s');
      else
        q.variant.forEach((v, k) => {
          const named = !!seen.options[k];
          assert.equal(seen.variant?.[k] ?? 0, named ? v : 0, `picture ${k}: ${named ? 'named' : 'anonymous'}`);
        });
    } else assert.equal(seen.variant, undefined);
    s = engine.apply(s, { type: 'next' }, 'p0');
  }
  assert.ok(found.name && found.art, 'both kinds of question came up');
});

test('a tie over the target starts a deathmatch between the tied players only', () => {
  let { engine, s } = lobby(['Ash', 'Bram', 'Cora'], 1);
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
  let { engine, s } = lobby(['Ash', 'Bram', 'Cora'], 1);
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
  let { engine, s } = lobby(['Ash', 'Bram'], 1);
  s = engine.apply(s, { type: 'start' }, 'p0');
  for (let i = 0; i < 2; i++) s = playTurn(engine, s, () => true);
  const [x, y] = s.deathmatch!.alive;
  s = engine.apply(s, { type: 'connection', playerId: y, connected: false }, null);
  s = playTurn(engine, s, () => false);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [x]);
});

test('question ids keep increasing even if the clock goes back', () => {
  let clock = 1_000_000;
  const engine = new Engine(items, { autoClock: true, rng: seeded(9), now: () => clock });
  let s: GameState = createGame(null, { targetScore: 99, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
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
  const engine = new Engine(items, { autoClock: true, rng: seeded(42) });
  let s: GameState = createGame(null, { targetScore: 1, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  ['Ash', 'Bram', 'Cora'].forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
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
  const engine = new Engine(items, { autoClock: true, rng: seeded(42) });
  let s: GameState = createGame(null, { targetScore: 1, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  ['Ash', 'Bram', 'Cora', 'Dax'].forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
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
  let { engine, s } = lobby(['Ash', 'Bram'], 1);
  s = engine.apply(s, { type: 'start' }, 'p0');
  for (let i = 0; i < 2; i++) s = playTurn(engine, s, () => true);
  const [x, y] = s.deathmatch!.alive;
  s = engine.apply(s, { type: 'connection', playerId: y, connected: false }, null);
  s = playTurn(engine, s, () => false);
  assert.deepEqual(s.winners, [x]);
  assert.deepEqual(s.deathmatch!.eliminated, [y]);
});

test('the host can swap a question for another in the same category, without using up the turn', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
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

test('a second Next for the same reveal is dropped quietly', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
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

test('turns: an answer landing just after time ran out is dropped quietly', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const me = s.players[s.turn].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, me);
  const q = s.question!;
  // The host's timer closes the question first.
  s = engine.apply(s, { type: 'answer', index: null }, null);
  assert.equal(s.phase, 'reveal');
  const silent = (err: unknown) => err instanceof ActionError && err.silent;
  assert.throws(() => engine.apply(s, { type: 'answer', index: 0, askedAt: q.askedAt }, me), silent);
  // Still quiet once play has moved on to the next pick.
  s = engine.apply(s, { type: 'next' }, null);
  assert.equal(s.phase, 'choosing');
  assert.throws(() => engine.apply(s, { type: 'answer', index: 0, askedAt: q.askedAt }, me), silent);
  // An answer for no question this game asked is still an error worth showing.
  assert.throws(
    () => engine.apply(s, { type: 'answer', index: 0, askedAt: q.askedAt - 1 }, me),
    (err: unknown) => err instanceof ActionError && !err.silent && /no open question/.test(err.message),
  );
});

test('reveals are stamped with the host clock; only the host or (turns) whoever answered moves on', () => {
  for (const mode of ['turns', 'race'] as const) {
    let clock = 5_000_000;
    const engine = new Engine(items, { autoClock: true, rng: seeded(3), now: () => clock });
    let s: GameState = createGame('p0', { targetScore: 9, timer: 0, difficulty: 'cruel', mode, public: false, locked: false });
    for (const [i, name] of ['Ash', 'Bram', 'Cora'].entries()) s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`);
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
  let { engine, s } = lobby(['Ash', 'Bram', 'Cora'], 5);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  const q = s.question!;
  s = engine.apply(s, { type: 'answer', index: wrong(q), askedAt: q.askedAt }, 'p1');
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

test('turns: a streak counts your own right answers in a row, and a miss breaks it', () => {
  let { engine, s } = lobby(['Ash', 'Bram'], 50);
  s = engine.apply(s, { type: 'start' }, 'p0');
  const streak = (id: string) => s.players.find((p) => p.id === id)!.streak;
  const first = s.players[s.turn].id;
  const second = s.players.find((p) => p.id !== first)!.id;
  // first: right, right, wrong, right; second: always wrong, which leaves first's streak alone.
  const plan: Record<string, boolean[]> = { [first]: [true, true, false, true], [second]: [false, false, false, false] };
  const want: Record<string, number[]> = { [first]: [1, 2, 0, 1], [second]: [0, 0, 0, 0] };
  for (let turn = 0; turn < 8; turn++) {
    const id = s.players[s.turn].id;
    const n = Math.floor(turn / 2);
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, id);
    const q = s.question!;
    s = engine.apply(s, { type: 'answer', index: plan[id][n] ? right(q) : wrong(q) }, id);
    assert.equal(streak(id), want[id][n], `${id}, turn ${turn}`);
    s = engine.apply(s, { type: 'next' }, id);
  }
  assert.equal(streak(first), 1, "the other player's misses don't touch it");
});

test('race: only the winner keeps a streak going; not being first breaks it too', () => {
  let { engine, s } = lobby(['Ash', 'Bram', 'Cora'], 50);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  const streak = (id: string) => s.players.find((p) => p.id === id)!.streak;
  const win = (id: string) => {
    s = engine.apply(s, { type: 'answer', index: right(s.question!), askedAt: s.question!.askedAt }, id);
    s = engine.apply(s, { type: 'next' }, 'p0');
  };
  win('p1');
  win('p1');
  assert.equal(streak('p1'), 2);
  // p2 wins while p1 never guessed: p1's streak is over all the same.
  win('p2');
  assert.deepEqual([streak('p0'), streak('p1'), streak('p2')], [0, 0, 1]);
  // Nobody gets it: everyone's breaks.
  for (const id of ['p0', 'p1', 'p2']) s = engine.apply(s, { type: 'answer', index: wrong(s.question!) }, id);
  assert.equal(streak('p2'), 0);
});

test('streaks start over with every game', () => {
  let { engine, s } = lobby(['Ash'], 2);
  s = engine.apply(s, { type: 'start' }, 'p0');
  while (s.phase !== 'over') {
    if (s.phase === 'choosing') s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
    else if (s.phase === 'question') s = engine.apply(s, { type: 'answer', index: right(s.question!) }, 'p0');
    else s = engine.apply(s, { type: 'next' }, 'p0');
  }
  assert.equal(s.players[0].streak, 2);
  s = engine.apply(s, { type: 'restart', play: true }, 'p0');
  assert.equal(s.players[0].streak, 0);
});
