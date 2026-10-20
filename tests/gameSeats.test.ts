// The game's seats (src/lib/game.ts): who plays and who watches, joining, leaving and coming back, a full room, names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/lib/palette.ts';
import { Engine, createGame, publicView, MAX_PLAYERS, MAX_SPECTATORS, type GameState } from '../src/lib/game.ts';
import { items, lobby, right, seeded, wrong } from './helpers.ts';

test('play again drops players who left, and the first turn goes to someone present', () => {
  let { engine, s } = lobby(['Ash', 'Bram', 'Cora']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'connection', playerId: 'p1', connected: false }, null);
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.deepEqual(s.players.map((p) => p.id).sort(), ['p0', 'p2']);
  // A player who drops out in the lobby before the start never gets the first turn.
  for (let seed = 1; seed <= 20; seed++) {
    const e = new Engine(items, { autoClock: true, rng: seeded(seed) });
    let t = lobby(['Ash', 'Bram', 'Cora']).s;
    t = e.apply(t, { type: 'connection', playerId: 'p2', connected: false }, null);
    t = e.apply(t, { type: 'start' }, 'p0');
    assert.equal(t.players[t.turn].connected, true);
  }
});

test('joining a running game makes you a spectator who is seated at the restart', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
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
  let { engine, s } = lobby(['Ash']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'x', name: 'Xan' }, 'x');
  s = engine.apply(s, { type: 'remove', playerId: 'x' }, null);
  assert.deepEqual(s.spectators, []);
  assert.equal(s.phase, 'choosing');

  const locked = engine.apply(s, { type: 'settings', settings: { locked: true } }, 'p0');
  assert.throws(() => engine.apply(locked, { type: 'join', playerId: 'y', name: 'Yul' }, 'y'));

  // A full table: spectators beyond the free seats keep watching.
  const names = ['Alba', 'Brom', 'Cyra', 'Dusk', 'Ember', 'Fenwick', 'Galt', 'Hollis', 'Iona', 'Jorik', 'Kestrel', 'Lumen'];
  let full = lobby(names);
  s = full.engine.apply(full.s, { type: 'start' }, 'p0');
  s = full.engine.apply(s, { type: 'join', playerId: 'w', name: 'Wynn' }, 'w');
  s = full.engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(s.players.length, 12);
  assert.deepEqual(s.spectators, [{ id: 'w', name: 'Wynn' }]);
});

test('spectators waiting in a full lobby get the first free seat', () => {
  const names = ['Alba', 'Brom', 'Cyra', 'Dusk', 'Ember', 'Fenwick', 'Galt', 'Hollis', 'Iona', 'Jorik', 'Kestrel', 'Lumen'];
  let { engine, s } = lobby(names);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w1', name: 'Wren' }, 'w1');
  s = engine.apply(s, { type: 'join', playerId: 'w2', name: 'Yara' }, 'w2');
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.deepEqual(s.spectators!.map((o) => o.id), ['w1', 'w2']);
  // A player leaves the lobby: the longest-waiting spectator takes the seat.
  s = engine.apply(s, { type: 'remove', playerId: 'p5' }, 'p0');
  assert.ok(s.players.some((p) => p.id === 'w1'));
  assert.deepEqual(s.spectators!.map((o) => o.id), ['w2']);
  // No one new can sit down in a full lobby: they wait behind the others (and not under a spectator's name).
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'n', name: 'Yara' }, 'n'));
  s = engine.apply(s, { type: 'join', playerId: 'n', name: 'Nox' }, 'n');
  assert.equal(s.players.length, 12);
  assert.deepEqual(s.spectators!.map((o) => o.id), ['w2', 'n']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.equal(s.players.length, 12);
  assert.deepEqual(s.spectators!.map((o) => o.id), ['w2', 'n'], 'still waiting, the table is full');
});

test('a spectator reconnecting to a locked room keeps their spot', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren' }, 'w');
  s = engine.apply(s, { type: 'settings', settings: { locked: true } }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren' }, 'w');
  assert.deepEqual(s.spectators, [{ id: 'w', name: 'Wren' }]);
  // Locking doesn't cost them their seat in the next game either.
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.ok(s.players.some((p) => p.id === 'w'));
});

test('a spectator can keep watching instead of taking a seat in the next game', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren' }, 'w');
  s = engine.apply(s, { type: 'join', playerId: 'y', name: 'Yara' }, 'y');
  s = engine.apply(s, { type: 'watch', watch: true }, 'w');
  assert.deepEqual(s.spectators, [{ id: 'w', name: 'Wren', stay: true }, { id: 'y', name: 'Yara' }]);
  assert.equal(s.phase, 'choosing', 'the game carries on');
  // Play again: Yara takes a seat, Wren keeps watching.
  const again = engine.apply(s, { type: 'restart', play: true }, 'p0');
  assert.ok(again.players.some((p) => p.id === 'y'));
  assert.ok(!again.players.some((p) => p.id === 'w'));
  assert.deepEqual(again.spectators, [{ id: 'w', name: 'Wren', stay: true }]);
  // Changing her mind mid-game: she's seated at the restart after all.
  const changed = engine.apply(again, { type: 'watch', watch: false }, 'w');
  assert.deepEqual(changed.spectators, [{ id: 'w', name: 'Wren' }]);
  assert.ok(engine.apply(changed, { type: 'restart' }, 'p0').players.some((p) => p.id === 'w'));
  // In the lobby, taking a seat is immediate.
  let inLobby = engine.apply(again, { type: 'restart' }, 'p0');
  assert.deepEqual(inLobby.spectators, [{ id: 'w', name: 'Wren', stay: true }]);
  inLobby = engine.apply(inLobby, { type: 'watch', watch: false }, 'w');
  assert.ok(inLobby.players.some((p) => p.id === 'w'));
  assert.deepEqual(inLobby.spectators, []);
  // Nobody chooses for someone else, and the host always plays.
  assert.throws(() => engine.apply(s, { type: 'watch', watch: true }, 'p0'));
});

test('a player can give up their seat in the lobby to watch', () => {
  const names = ['Alba', 'Brom', 'Cyra', 'Dusk', 'Ember', 'Fenwick', 'Galt', 'Hollis', 'Iona', 'Jorik', 'Kestrel', 'Lumen'];
  let { engine, s } = lobby(names);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren' }, 'w');
  // Only in the lobby: a game under way keeps its seats.
  assert.throws(() => engine.apply(s, { type: 'watch', watch: true }, 'p3'), /lobby/);
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.deepEqual(s.spectators!.map((o) => o.id), ['w'], 'the table is full');
  s = engine.apply(s, { type: 'watch', watch: true }, 'p3');
  assert.ok(!s.players.some((p) => p.id === 'p3'));
  assert.ok(s.players.some((p) => p.id === 'w'), 'the seat goes to whoever was waiting');
  assert.deepEqual(s.spectators, [{ id: 'p3', name: 'Dusk', stay: true }]);
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.ok(!s.players.some((p) => p.id === 'p3'), 'still watching');
  // Asking to play while seated changes nothing.
  assert.equal(engine.apply(s, { type: 'watch', watch: false }, 'p1').players.length, 12);
});

test('stepping aside needs a place to watch, unless someone waiting takes the seat', () => {
  const names = ['Alba', 'Brom', 'Cyra', 'Dusk', 'Ember', 'Fenwick', 'Galt', 'Hollis', 'Iona', 'Jorik', 'Kestrel', 'Lumen'];
  let { engine, s } = lobby(names);
  s = engine.apply(s, { type: 'start' }, 'p0');
  for (let i = 0; i < 8; i++) s = engine.apply(s, { type: 'join', playerId: `w${i}`, name: `Watcher${'abcdefgh'[i]}` }, `w${i}`);
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(s.spectators!.length, 8, 'every place to watch is taken');
  // One of them waits for a seat: stepping aside swaps places with them.
  s = engine.apply(s, { type: 'watch', watch: true }, 'p3');
  assert.ok(s.players.some((p) => p.id === 'w0'));
  assert.deepEqual(s.spectators!.find((o) => o.id === 'p3'), { id: 'p3', name: 'Dusk', stay: true });
  // Once all eight just watch, nobody else can step aside.
  for (let i = 1; i < 8; i++) s = engine.apply(s, { type: 'watch', watch: true }, `w${i}`);
  assert.throws(() => engine.apply(s, { type: 'watch', watch: true }, 'p4'), /no room/);
});

test('a guest who would rather watch joins as one who stays watching', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  // In the lobby: no seat taken, not even for a moment.
  let inLobby = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren', watch: true }, 'w');
  assert.equal(inLobby.players.length, 2);
  assert.deepEqual(inLobby.spectators, [{ id: 'w', name: 'Wren', stay: true }]);
  // In a game: the restart doesn't seat them.
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren', returning: true, watch: true }, 'w');
  assert.deepEqual(s.spectators, [{ id: 'w', name: 'Wren', stay: true }]);
  assert.ok(!engine.apply(s, { type: 'restart', play: true }, 'p0').players.some((p) => p.id === 'w'));
  // With every place to watch taken, a lobby seats them after all.
  for (let i = 0; i < 8; i++) inLobby = engine.apply(inLobby, { type: 'join', playerId: `x${i}`, name: `Onlooker${'abcdefgh'[i]}`, watch: true }, `x${i}`);
  assert.equal(inLobby.spectators!.length, 8);
  assert.ok(inLobby.players.some((p) => p.id === 'x7'));
});

test('guests see who is watching; the answer stays hidden', () => {
  let { engine, s } = lobby(['Ash']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren' }, 'w');
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  const v = publicView(s);
  assert.deepEqual(v.spectators, [{ id: 'w', name: 'Wren' }]);
  assert.equal(v.question!.itemId, '');
  assert.deepEqual(v.question!.options, []);
});

test('guests cannot act for others, join locked rooms, or impersonate', () => {
  let { engine, s } = lobby(['Alva', 'Zana']);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p0', name: 'Xan' }, 'p1'), /Not allowed/);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p9', name: 'Host' }, 'p9'), /reserved/);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p9', name: 'Zаna' }, 'p9'), /looks too much like/); // Cyrillic а
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p9', name: 'A1va' }, 'p9'), /looks too much like/);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p9', name: 'HeilHitler' }, 'p9'), /name is not allowed/);
  assert.throws(() => engine.apply(s, { type: 'rename', playerId: 'p1', name: 'n1gg3r' }, 'p1'), /name is not allowed/);
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

test('seats kept for players who never came back are let go when the game starts', () => {
  let { engine, s } = lobby(['Ash', 'Bram', 'Cora']);
  // The host refreshed: everyone else is offline until they reconnect.
  for (const id of ['p1', 'p2']) s = engine.apply(s, { type: 'connection', playerId: id, connected: false }, null);
  s = engine.apply(s, { type: 'join', playerId: 'p1', name: 'Bram' }, 'p1'); // p1 came back
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.deepEqual(s.players.map((p) => p.id).sort(), ['p0', 'p1']);
});

test('a guest waits for a seat in a full lobby, and gets one freed at the start', () => {
  const names = ['Alva', 'Zana', 'Doryani', 'Tujen', 'Rog', 'Gwennen', 'Dannig', 'Oyra', 'Kirac', 'Niko', 'Jun', 'Einhar'];
  let { engine, s } = lobby(names);
  assert.equal(s.players.length, 12);
  // The host refreshed: p11 hasn't come back, and a former spectator reconnects.
  s = engine.apply(s, { type: 'connection', playerId: 'p11', connected: false }, null);
  s = engine.apply(s, { type: 'join', playerId: 'w1', name: 'Watcher', returning: true }, 'w1');
  // Someone new, from an invite or the room list, waits the same way.
  s = engine.apply(s, { type: 'join', playerId: 'new', name: 'Stranger' }, 'new');
  assert.deepEqual(s.spectators!.map((o) => o.id), ['w1', 'new']);
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.ok(s.players.some((p) => p.id === 'w1'), 'the waiting guest takes the empty seat');
  assert.ok(!s.players.some((p) => p.id === 'p11'));
  assert.deepEqual(s.spectators!.map((o) => o.id), ['new'], 'one seat freed, for the first to wait');
});

test('a full hot-seat lobby turns the thirteenth player down rather than seating them to watch', () => {
  const engine = new Engine(items, { autoClock: true, rng: seeded(42) });
  let s: GameState = createGame(null, { targetScore: 3, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  const names = ['Alva', 'Zana', 'Doryani', 'Tujen', 'Rog', 'Gwennen', 'Dannig', 'Oyra', 'Kirac', 'Niko', 'Jun', 'Einhar'];
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, null)));
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'x', name: 'Stranger' }, null), /lobby is full/);
});

test('a full lobby with no room left to watch from turns a newcomer away', () => {
  const names = ['Alva', 'Zana', 'Doryani', 'Tujen', 'Rog', 'Gwennen', 'Dannig', 'Oyra', 'Kirac', 'Niko', 'Jun', 'Einhar'];
  let { engine, s } = lobby(names);
  for (let i = 0; i < MAX_SPECTATORS; i++) s = engine.apply(s, { type: 'join', playerId: `w${i}`, name: `Watcher ${'abcdefgh'[i]}` }, `w${i}`);
  assert.equal(s.spectators!.length, MAX_SPECTATORS);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'new', name: 'Stranger' }, 'new'), /lobby is full/);
});

test('zoe_arcana always gets the last avatar colour', () => {
  const names = ['Ash', 'Bram', 'Cyra', 'Dusk', 'Ember', 'Fenn', 'Gale', 'Hollis', 'Iris', 'Jarek', 'Kestrel'];
  // Others fill the colours in order and leave the reserved one for last.
  let { engine, s } = lobby(names);
  assert.deepEqual(s.players.map((p) => p.hue), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  s = engine.apply(s, { type: 'join', playerId: 'z', name: 'Zoe_Arcana' }, 'z');
  assert.equal(s.players.find((p) => p.id === 'z')!.hue, 11);

  // Whoever had it moves to a free colour when she joins.
  ({ engine, s } = lobby(['Ash', 'Bram', 'Cora']));
  s.players[1].hue = 11;
  s = engine.apply(s, { type: 'join', playerId: 'z', name: 'zoe_arcana' }, 'z');
  assert.equal(s.players.find((p) => p.id === 'z')!.hue, 11);
  assert.equal(s.players[1].hue, 1);
  assert.equal(new Set(s.players.map((p) => p.hue)).size, 4);

  // Renaming to it claims it too.
  ({ engine, s } = lobby(['Ash', 'Bram']));
  s = engine.apply(s, { type: 'rename', playerId: 'p0', name: 'zoe_arcana' }, 'p0');
  assert.equal(s.players[0].hue, 11);
  s = engine.apply(s, { type: 'join', playerId: 'c', name: 'Cora' }, 'c');
  assert.equal(s.players.find((p) => p.id === 'c')!.hue, 0, 'her old colour is free again');

  // Any spelling the name check treats as the same name counts.
  ({ engine, s } = lobby(['Ash']));
  s = engine.apply(s, { type: 'join', playerId: 'z', name: 'Zoe Arcana' }, 'z');
  assert.equal(s.players.find((p) => p.id === 'z')!.hue, 11);
  assert.equal(PALETTE.length, MAX_PLAYERS, 'one colour per seat, ruby last');

  // Renaming away from it gives it up.
  ({ engine, s } = lobby(['Ash', 'Bram']));
  s = engine.apply(s, { type: 'rename', playerId: 'p0', name: 'zoe_arcana' }, 'p0');
  s = engine.apply(s, { type: 'rename', playerId: 'p0', name: 'Ash' }, 'p0');
  assert.equal(s.players[0].hue, 0);

  // Mid-game renames don't recolour anyone until the next game.
  ({ engine, s } = lobby(['Ash', 'Bram']));
  s.players[1].hue = 11;
  s = engine.apply(s, { type: 'start' }, 'p0');
  const hue = (id: string) => s.players.find((p) => p.id === id)!.hue;
  s = engine.apply(s, { type: 'rename', playerId: 'p0', name: 'zoe_arcana' }, 'p0');
  assert.deepEqual([hue('p0'), hue('p1')], [0, 11]);
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.deepEqual([hue('p0'), hue('p1')], [11, 0]);
});

test('the held name is refused until the device is unlocked', async () => {
  const { isHeldName, nameHeld, unlockHeldName } = await import('../src/lib/names.ts');
  const { ownerPublicKey } = await import('../src/lib/ownerKey.ts');
  for (const n of ['zoe_arcana', 'Zoe Arcana', 'zoe-arcana', 'Z0E_ARCANA', 'ｚｏｅ＿ａｒｃａｎａ']) assert.ok(isHeldName(n), n);
  for (const n of ['zoe', 'arcana', 'Doryani', 'zoe_arcana2x', '']) assert.ok(!isHeldName(n), n);
  const store = new Map<string, string>();
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  });
  try {
    // The real words are not in the repo, so this runs against a test key.
    const key = await ownerPublicKey('test words');
    assert.equal(nameHeld('Doryani', key), false);
    assert.equal(nameHeld('Zoe_Arcana', key), true);
    assert.equal(await unlockHeldName('nope', key), false);
    assert.equal(nameHeld('Zoe_Arcana', key), true, 'wrong words unlock nothing');
    // The hash the source used to hold, now no secret at all, unlocks nothing either.
    store.set('poe2trivia.owner', '5ddd2ad1ad21e94175a14999359a9e8b2b508a70c769f49f71a6d94e5821a607');
    assert.equal(nameHeld('Zoe_Arcana', key), true);
    assert.equal(await unlockHeldName('Test-Words', key), true, 'case and dashes do not count');
    assert.equal(nameHeld('zoe_arcana', key), false, 'unlocked on this device');
    assert.equal(nameHeld('zoe_arcana', 'A'.repeat(43)), true, 'a device unlocked for another key stays locked');
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('names need at least two characters', () => {
  let { engine, s } = lobby(['Ash']);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p1', name: 'B' }, 'p1'), /at least 2/);
  assert.throws(() => engine.apply(s, { type: 'join', playerId: 'p1', name: ' B​ ' }, 'p1'), /at least 2/);
  s = engine.apply(s, { type: 'join', playerId: 'p1', name: 'Bo' }, 'p1');
  assert.equal(s.players[1].name, 'Bo');
  assert.throws(() => engine.apply(s, { type: 'rename', playerId: 'p1', name: 'B' }, 'p1'), /at least 2/);
});

test("the owner's place in the game goes only to whoever joins under the held name", () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  // A seat coming back keeps its own name: a checked signature sent with it names nobody.
  s = engine.apply(s, { type: 'join', playerId: 'p1', name: 'Zoe Arcana', returning: true, owner: true }, 'p1');
  assert.equal(s.owner, undefined);
  assert.equal(s.players.find((p) => p.id === 'p1')!.name, 'Bram');
  // Nor one under another name.
  s = engine.apply(s, { type: 'join', playerId: 'p2', name: 'Cass', owner: true }, 'p2');
  assert.equal(s.owner, undefined);
  s = engine.apply(s, { type: 'join', playerId: 'z', name: 'Zoe Arcana', owner: true }, 'z');
  assert.deepEqual(s.owner, { id: 'z' });
  // A guest can't put it on anyone (only the host, for itself).
  assert.throws(() => engine.apply(s, { type: 'owner', playerId: 'p1' }, 'p1'), /Not allowed/);
  assert.deepEqual(engine.apply(s, { type: 'owner', playerId: 'p0' }, 'p0').owner, { id: 'p0' });
});

test('a class sigil comes with a join, stays with a spectator who takes a seat, and changes as they come back', () => {
  let { engine, s } = lobby(['Ash']);
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren', sigil: 'witch' }, 'w');
  assert.equal(s.players.find((p) => p.id === 'w')?.sigil, 'witch');
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = engine.apply(s, { type: 'join', playerId: 'late', name: 'Late', sigil: 'monk' }, 'late');
  assert.deepEqual(s.spectators, [{ id: 'late', name: 'Late', sigil: 'monk' }]);
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(s.players.find((p) => p.id === 'late')?.sigil, 'monk');
  s = engine.apply(s, { type: 'connection', playerId: 'w', connected: false }, null);
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren', returning: true }, 'w');
  assert.equal(s.players.find((p) => p.id === 'w')?.sigil, undefined, 'taken off meanwhile');
  // One this build doesn't know is left out.
  s = engine.apply(s, { type: 'join', playerId: 'x', name: 'Xan', sigil: 'duelist' as never }, 'x');
  assert.equal(s.players.find((p) => p.id === 'x')?.sigil, undefined);
});

test('the sigil action changes the sender\'s own sigil, a spectator\'s too, and on one device the player named', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  s = engine.apply(s, { type: 'sigil', sigil: 'ranger' }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')?.sigil, 'ranger');
  assert.equal(s.players.find((p) => p.id === 'p0')?.sigil, undefined, "never another's");
  s = engine.apply(s, { type: 'sigil', sigil: 'monk', playerId: 'p0' }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p0')?.sigil, undefined, 'a guest names only itself');
  s = engine.apply(s, { type: 'sigil' }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')?.sigil, undefined, 'taken off');
  s = engine.apply(s, { type: 'join', playerId: 'w', name: 'Wren', watch: true }, 'w');
  s = engine.apply(s, { type: 'sigil', sigil: 'druid' }, 'w');
  assert.equal(s.spectators?.find((o) => o.id === 'w')?.sigil, 'druid');
  let local = createGame(null);
  local = engine.apply(local, { type: 'join', playerId: 'a', name: 'Ash' }, null);
  local = engine.apply(local, { type: 'sigil', sigil: 'witch', playerId: 'a' }, null);
  assert.equal(local.players[0].sigil, 'witch');
});

test('mid-game the sigil stays as the game began', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  s = engine.apply(s, { type: 'sigil', sigil: 'ranger' }, 'p1');
  s = { ...s, phase: 'choosing' };
  s = engine.apply(s, { type: 'sigil', sigil: 'monk' }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')?.sigil, 'ranger');
  s = engine.apply(s, { type: 'sigil' }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')?.sigil, 'ranger', 'nor taken off');
  s = engine.apply(s, { type: 'join', playerId: 'p1', name: 'Bram', returning: true, sigil: 'witch' }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')?.sigil, 'ranger', 'nor by coming back');
});

test('a colour asked for is given when free, taken from one who never asked, and first come keeps it', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  const hue = (id: string) => s.players.find((p) => p.id === id)?.hue;
  // Bram has seat 1's colour without asking for it: Cora, who asks, takes it and Bram takes hers.
  s = engine.apply(s, { type: 'join', playerId: 'c', name: 'Cora', colour: 1 }, 'c');
  assert.equal(hue('c'), 1);
  assert.equal(hue('p1'), 2);
  // Dain asks for it too: Cora asked first and keeps it.
  s = engine.apply(s, { type: 'join', playerId: 'd', name: 'Dain', colour: 1 }, 'd');
  assert.equal(hue('c'), 1);
  assert.equal(hue('d'), 3);
  // A free one is simply theirs.
  s = engine.apply(s, { type: 'colour', colour: 7 }, 'd');
  assert.equal(hue('d'), 7);
  // Ruby (zoe_arcana's) or one out of range is no ask at all.
  s = engine.apply(s, { type: 'join', playerId: 'e', name: 'Ena', colour: PALETTE.length - 1 }, 'e');
  assert.equal(s.players.find((p) => p.id === 'e')?.colour, undefined);
  assert.notEqual(hue('e'), PALETTE.length - 1);
  s = engine.apply(s, { type: 'colour', colour: 99 }, 'e');
  assert.equal(s.players.find((p) => p.id === 'e')?.colour, undefined);
  assert.equal(new Set(s.players.map((p) => p.hue)).size, s.players.length, 'no two alike');
});

test('mid-game nobody changes colour; the one asked for comes with the next game', () => {
  let { engine, s } = lobby(['Ash', 'Bram']);
  s = { ...s, phase: 'choosing' };
  s = engine.apply(s, { type: 'colour', colour: 5 }, 'p1');
  assert.equal(s.players.find((p) => p.id === 'p1')?.hue, 1, 'not yet');
  s = engine.apply(s, { type: 'join', playerId: 'c', name: 'Cora', colour: 0 }, 'c');
  assert.ok(s.spectators?.some((o) => o.id === 'c' && o.colour === 0), 'watching, the ask kept');
  s = { ...s, phase: 'over' };
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(s.players.find((p) => p.id === 'c')?.hue, 0, "Ash never asked for amber, so it's Cora's now");
  assert.equal(s.players.find((p) => p.id === 'p1')?.hue, 5);
  assert.equal(new Set(s.players.map((p) => p.hue)).size, s.players.length);
});
