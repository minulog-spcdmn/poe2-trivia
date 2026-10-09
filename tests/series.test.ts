import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANSWER_GRACE_MS, ActionError, createGame, Engine, publicView, type Delve, type GameState, type Item, type Question, type Series } from '../src/lib/game.ts';
import { DELVE_LIVES, findOn } from '../src/lib/delve.ts';
import {
  REMATCH_MS,
  crownChange,
  crownLine,
  crownedId,
  ledgerLine,
  nightWins,
  recordSeries,
  rematchCount,
  settleRematch,
} from '../src/lib/series.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));

const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** A room hosted by p0 (null: hot-seat) with an injected clock, its game played out to the end (first to 1 point). */
function finished(names: string[], opts: { hostId?: string | null; mode?: 'turns' | 'race' } = {}) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(7), now: () => clock.now });
  const hostId = opts.hostId === undefined ? 'p0' : opts.hostId;
  let s: GameState = createGame(hostId, { targetScore: 1, timer: 0, difficulty: 'cruel', mode: opts.mode ?? 'turns', public: false, locked: false });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, hostId === null ? null : `p${i}`)));
  const as = (id: string) => (hostId === null ? null : id);
  s = engine.apply(s, { type: 'start' }, as('p0'));
  // Spectating from the first turn: the game is already on.
  s = engine.apply(s, { type: 'join', playerId: 'late', name: 'Late' }, hostId === null ? null : 'late');
  const winner = s.players[0].id;
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 50) {
    if (opts.mode === 'race') {
      s = engine.apply(s, { type: 'answer', index: right(s.question!) }, winner);
      s = engine.apply(s, { type: 'next' }, as('p0'));
      continue;
    }
    const me = s.players[s.turn].id;
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, as(me));
    const q = s.question!;
    s = engine.apply(s, { type: 'answer', index: me === winner ? right(q) : wrongIdx(q) }, as(me));
    s = engine.apply(s, { type: 'next' }, as(me));
  }
  assert.equal(s.phase, 'over');
  return { engine, s, clock };
}

/** Refused quietly: a race the player never sees. */
const quiet = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof ActionError && e.silent);

test('rematch votes only at the end, only from seated guests', () => {
  const clock = { now: 5 };
  const engine = new Engine(items, { rng: seeded(3), now: () => clock.now });
  let lobby: GameState = createGame('p0', { targetScore: 1, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  lobby = engine.apply(lobby, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  lobby = engine.apply(lobby, { type: 'join', playerId: 'p1', name: 'Bea' }, 'p1');
  quiet(() => engine.apply(lobby, { type: 'rematch', ready: true }, 'p1'));
  const playing = engine.apply(lobby, { type: 'start' }, 'p0');
  quiet(() => engine.apply(playing, { type: 'rematch', ready: true }, 'p1'));

  let { engine: e, s } = finished(['Ash', 'Bea', 'Cid']);
  quiet(() => e.apply(s, { type: 'rematch', ready: true }, null));
  quiet(() => e.apply(s, { type: 'rematch', ready: true }, 'p0'));
  assert.ok(s.spectators!.some((o) => o.id === 'late'));
  quiet(() => e.apply(s, { type: 'rematch', ready: true }, 'late'));
  quiet(() => e.apply(s, { type: 'rematch', ready: true }, 'stranger'));
  // Delve has no vote.
  quiet(() => e.apply({ ...s, delve: {} as Delve }, { type: 'rematch', ready: true }, 'p1'));

  s = e.apply(s, { type: 'rematch', ready: true }, 'p1');
  assert.deepEqual(s.rematch, { ready: ['p1'] });
  s = e.apply(s, { type: 'rematch', ready: true }, 'p1');
  assert.deepEqual(s.rematch, { ready: ['p1'] }, 'twice is still once');
  s = e.apply(s, { type: 'rematch', ready: false }, 'p1');
  assert.deepEqual(s.rematch, { ready: [] });
  assert.equal(s.phase, 'over');
});

test('the countdown starts when every connected guest is ready', () => {
  let { engine, s, clock } = finished(['Ash', 'Bea', 'Cid']);
  assert.deepEqual(rematchCount(s).guests.sort(), ['p1', 'p2'], 'the host waits for nobody');
  assert.deepEqual(rematchCount(s).ready, []);
  s = engine.apply(s, { type: 'rematch', ready: true }, 'p1');
  assert.equal(s.rematch!.at, undefined, 'one of two is not enough');
  assert.deepEqual(rematchCount(s).ready, ['p1']);
  clock.now += 3000;
  s = engine.apply(s, { type: 'rematch', ready: true }, 'p2');
  assert.equal(s.rematch!.at, clock.now + REMATCH_MS);
  const at = s.rematch!.at;
  // Later changes don't push it back: someone joining to watch, a while on.
  clock.now += 2000;
  s = engine.apply(s, { type: 'join', playerId: 'later', name: 'Dora' }, 'later');
  assert.equal(s.rematch!.at, at);
  // Taken back: the countdown stops, and starts afresh when they're ready again.
  s = engine.apply(s, { type: 'rematch', ready: false }, 'p1');
  assert.equal(s.rematch!.at, undefined);
  clock.now += 1000;
  s = engine.apply(s, { type: 'rematch', ready: true }, 'p1');
  assert.equal(s.rematch!.at, clock.now + REMATCH_MS);
});

test('the race end gets the vote too', () => {
  let { engine, s, clock } = finished(['Ash', 'Bea'], { mode: 'race' });
  s = engine.apply(s, { type: 'rematch', ready: true }, 'p1');
  assert.equal(s.rematch!.at, clock.now + REMATCH_MS);
});

test('a not-ready guest dropping out starts it', () => {
  let { engine, s, clock } = finished(['Ash', 'Bea', 'Cid']);
  s = engine.apply(s, { type: 'rematch', ready: true }, 'p1');
  assert.equal(s.rematch!.at, undefined);
  clock.now += 500;
  s = engine.apply(s, { type: 'connection', playerId: 'p2', connected: false }, null);
  assert.equal(s.rematch!.at, clock.now + REMATCH_MS);
  // Back, and not ready yet: it stops.
  s = engine.apply(s, { type: 'join', playerId: 'p2', name: 'Cid' }, 'p2');
  assert.equal(s.rematch!.at, undefined);
  // Leaving the room for good counts the same.
  s = engine.apply(s, { type: 'remove', playerId: 'p2' }, 'p2');
  assert.equal(s.rematch!.at, clock.now + REMATCH_MS);
});

test('a ready guest who drops out and comes back is still ready (a refresh, the host reloading)', () => {
  let { engine, s, clock } = finished(['Ash', 'Bea', 'Cid']);
  s = engine.apply(s, { type: 'rematch', ready: true }, 'p1');
  s = engine.apply(s, { type: 'rematch', ready: true }, 'p2');
  const at = s.rematch!.at;
  // One refreshes: the other is still in, so the countdown runs on.
  s = engine.apply(s, { type: 'connection', playerId: 'p1', connected: false }, null);
  assert.equal(s.rematch!.at, at);
  assert.deepEqual(rematchCount(s), { guests: ['p2'], ready: ['p2'] });
  s = engine.apply(s, { type: 'join', playerId: 'p1', name: 'Bea' }, 'p1');
  assert.equal(s.rematch!.at, at);
  // The host reloads: everyone is away, so nothing counts down for nobody...
  s = engine.apply(s, { type: 'connection', playerId: 'p1', connected: false }, null);
  s = engine.apply(s, { type: 'connection', playerId: 'p2', connected: false }, null);
  assert.deepEqual(s.rematch, { ready: ['p1', 'p2'] });
  // ...until they come back, still ready.
  clock.now += 4000;
  s = engine.apply(s, { type: 'join', playerId: 'p2', name: 'Cid' }, 'p2');
  assert.equal(s.rematch!.at, clock.now + REMATCH_MS);
  s = engine.apply(s, { type: 'join', playerId: 'p1', name: 'Bea' }, 'p1');
  assert.equal(s.rematch!.at, clock.now + REMATCH_MS);
});

test('never in hot-seat', () => {
  const { engine, s } = finished(['Ash', 'Bea'], { hostId: null });
  quiet(() => engine.apply(s, { type: 'rematch', ready: true }, null));
  const t: GameState = { ...s, rematch: { ready: ['p0', 'p1'] } };
  settleRematch(t, 123);
  assert.deepEqual(t.rematch, { ready: ['p0', 'p1'] });
  // A host alone has nobody to wait for.
  const alone = finished(['Ash']);
  const u: GameState = { ...alone.s, rematch: { ready: [] } };
  settleRematch(u, 123);
  assert.deepEqual(u.rematch, { ready: [] });
});

test('restart clears it; restart play:true from null starts the next game', () => {
  let { engine, s } = finished(['Ash', 'Bea']);
  s = engine.apply(s, { type: 'rematch', ready: true }, 'p1');
  assert.ok(s.rematch!.at);
  const back = engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(back.phase, 'lobby');
  assert.equal(back.rematch, undefined);
  // What the host's timer does at 0: the next game with the same settings, the spectator seated.
  const again = engine.apply(s, { type: 'restart', play: true }, null);
  assert.equal(again.phase, 'choosing');
  assert.equal(again.rematch, undefined);
  assert.equal(again.version, s.version + 1);
  assert.deepEqual(again.settings, s.settings);
  assert.deepEqual(again.players.map((p) => p.id).sort(), ['late', 'p0', 'p1']);
  assert.deepEqual(again.spectators, []);
  // A vote that crossed the start on its way is dropped quietly.
  quiet(() => engine.apply(again, { type: 'rematch', ready: false }, 'p1'));
});

// ---- the ledger and the Crown ------------------------------------------------

/** Plays the game under way to its end: only `winner` answers right (in a race, answers at all). `as`: who sends what (null in hot-seat). */
function playOut(engine: Engine, s: GameState, winner: string, hotSeat = false): GameState {
  const as = (id: string) => (hotSeat ? null : id);
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 80) {
    if (s.settings.mode === 'race') {
      s = engine.apply(s, { type: 'answer', index: right(s.question!) }, winner);
      s = engine.apply(s, { type: 'next' }, as(s.hostId ?? ''));
      continue;
    }
    const me = s.players[s.turn].id;
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, as(me));
    const q = s.question!;
    s = engine.apply(s, { type: 'answer', index: me === winner ? right(q) : wrongIdx(q) }, as(me));
    s = engine.apply(s, { type: 'next' }, as(me));
  }
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [winner]);
  return s;
}

test('recordSeries counts across restart play:true and across restart play:false followed by start', () => {
  let { engine, s } = finished(['Ash', 'Bea']);
  const [a, b] = [s.winners[0], s.players.find((p) => p.id !== s.winners[0])!.id];
  assert.deepEqual(s.series, { played: 1, wins: { [a]: 1 }, champ: { id: a, run: 1 } });
  // Play again: the night goes on into the next game, and counts it.
  s = engine.apply(s, { type: 'restart', play: true }, 'p0');
  assert.deepEqual(s.series!.wins, { [a]: 1 }, 'kept while the next game is played');
  s = playOut(engine, s, b);
  assert.deepEqual(s.series, { played: 2, wins: { [a]: 1, [b]: 1 }, champ: { id: b, run: 1 }, fell: a });
  // Change settings, then start: the same.
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(s.phase, 'lobby');
  assert.equal(s.series!.played, 2, 'the lobby keeps the night');
  s = engine.apply(s, { type: 'settings', settings: { targetScore: 1 } }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.equal(s.series!.played, 2);
  s = playOut(engine, s, b);
  assert.deepEqual(s.series, { played: 3, wins: { [a]: 1, [b]: 2 }, champ: { id: b, run: 2 } });
  // Things that happen at the end of a game don't count it again.
  s = engine.apply(s, { type: 'join', playerId: 'later', name: 'Dora' }, 'later');
  s = engine.apply(s, { type: 'connection', playerId: a, connected: false }, null);
  assert.equal(s.series!.played, 3);
  assert.equal(nightWins(s, b), 2);
  assert.equal(nightWins(s, 'later'), 0);

  // On one device the same.
  let h = finished(['Ash', 'Bea'], { hostId: null });
  const w = h.s.winners[0];
  let t = h.engine.apply(h.s, { type: 'restart', play: true }, null);
  t = playOut(h.engine, t, w, true);
  assert.deepEqual(t.series, { played: 2, wins: { [w]: 2 }, champ: { id: w, run: 2 } });
});

test('race games are counted, Delve runs are not', () => {
  let { engine, s, clock } = finished(['Ash', 'Bea'], { mode: 'race' });
  const a = s.winners[0];
  assert.deepEqual(s.series, { played: 1, wins: { [a]: 1 }, champ: { id: a, run: 1 } });
  // Delve together, played to its end: nobody wins, and the night doesn't count it.
  s = engine.apply(s, { type: 'restart' }, 'p0');
  s = engine.apply(s, { type: 'settings', settings: { mode: 'delve' } }, 'p0');
  assert.equal(crownedId(s), null, 'no Crown while the room delves');
  assert.equal(ledgerLine(s, () => 'x'), '');
  s = engine.apply(s, { type: 'start' }, 'p0');
  assert.ok(s.delve);
  assert.equal(crownedId(s), null);
  s = structuredClone(s);
  for (const p of s.players) s.delve!.losses[p.id] = Array(DELVE_LIVES - 1).fill(1);
  s = engine.apply(s, { type: 'pick', category: s.offered.find((c) => !findOn(s, c))! }, null);
  s = engine.apply(s, { type: 'clock', askedAt: s.question!.askedAt }, null);
  clock.now = s.question!.deadline! + ANSWER_GRACE_MS;
  s = engine.apply(s, { type: 'answer', index: null }, null);
  s = engine.apply(s, { type: 'next' }, null);
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.series, { played: 1, wins: { [a]: 1 }, champ: { id: a, run: 1 } });
  assert.equal(crownChange(s), null);
  // Back to a race: the night picks up where it was.
  s = engine.apply(s, { type: 'restart' }, 'p0');
  s = engine.apply(s, { type: 'settings', settings: { mode: 'race' } }, 'p0');
  assert.equal(crownedId(s), a);
  // A game alone counts for nothing.
  assert.equal(finished(['Ash']).s.series, undefined);
});

test('a shared win counts for each winner and leaves the Crown; it moves to a sole winner, and stays with one who defends it', () => {
  let { engine, s } = finished(['Ash', 'Bea', 'Cid']);
  const a = s.winners[0];
  const [b, c] = s.players.map((p) => p.id).filter((id) => id !== a);
  assert.equal(s.series!.fell, undefined, 'the first Crown is taken from nobody');
  assert.deepEqual(crownChange(s), { to: a, from: null, held: false });
  // Shared (a deathmatch whose last duelists left, say): both count, the Crown stays.
  const shared = structuredClone(s);
  shared.winners = [b, c];
  recordSeries(shared);
  assert.deepEqual(shared.series, { played: 2, wins: { [a]: 1, [b]: 1, [c]: 1 }, champ: { id: a, run: 1 } });
  assert.equal(crownChange(shared), null, 'no change of hands');
  assert.equal(crownedId(shared), a);
  // Taken: it falls from its wearer.
  s = playOut(engine, engine.apply(s, { type: 'restart', play: true }, 'p0'), b);
  assert.deepEqual(s.series!.champ, { id: b, run: 1 });
  assert.equal(s.series!.fell, a);
  assert.deepEqual(crownChange(s), { to: b, from: a, held: false });
  // Defended: its run grows, and nothing fell.
  s = playOut(engine, engine.apply(s, { type: 'restart', play: true }, 'p0'), b);
  assert.deepEqual(s.series!.champ, { id: b, run: 2 });
  assert.equal(s.series!.fell, undefined);
  assert.deepEqual(crownChange(s), { to: b, from: b, held: true });
  s = playOut(engine, engine.apply(s, { type: 'restart', play: true }, 'p0'), b);
  assert.deepEqual(s.series, { played: 4, wins: { [a]: 1, [b]: 3 }, champ: { id: b, run: 3 } });
  // Its wearer gone, the Crown is claimed from nobody.
  const gone = structuredClone(s);
  gone.players = gone.players.filter((p) => p.id !== b);
  gone.winners = [c];
  recordSeries(gone);
  assert.deepEqual(gone.series!.champ, { id: c, run: 1 });
  assert.equal(gone.series!.fell, undefined);
  assert.deepEqual(crownChange(gone), { to: c, from: null, held: false });
});

test('removing every player (remove-to-zero) clears the series', () => {
  const { engine, s } = finished(['Ash', 'Bea'], { hostId: null });
  assert.equal(s.series!.played, 1);
  // Mid-game: the room starts afresh.
  let t = engine.apply(s, { type: 'restart', play: true }, null);
  assert.equal(t.phase, 'choosing');
  for (const p of [...t.players]) t = engine.apply(t, { type: 'remove', playerId: p.id }, null);
  assert.equal(t.phase, 'lobby');
  assert.equal(t.series, undefined);
  // In the lobby too.
  let u = engine.apply(s, { type: 'restart' }, null);
  for (const p of [...u.players]) u = engine.apply(u, { type: 'remove', playerId: p.id }, null);
  assert.equal(u.series, undefined);
  // One leaving is not the end of the night: their count stays, unnamed.
  let v = engine.apply(s, { type: 'restart' }, null);
  v = engine.apply(v, { type: 'remove', playerId: s.winners[0] }, null);
  assert.equal(v.series!.wins[s.winners[0]], 1);
});

test('crownedId is null with one player, an absent champion, or none', () => {
  const { s } = finished(['Ash', 'Bea', 'Cid']);
  const a = s.winners[0];
  assert.equal(crownedId(s), a);
  assert.equal(crownedId({ ...s, players: s.players.filter((p) => p.id === a) }), null, 'alone, nobody to wear it for');
  assert.equal(crownedId({ ...s, players: s.players.filter((p) => p.id !== a) }), null, 'gone from the room');
  assert.equal(crownedId({ ...s, series: { played: 1, wins: {}, champ: null } }), null);
  assert.equal(crownedId({ ...s, series: undefined }), null);
  // A spectator who held it watches without it.
  assert.equal(crownedId({ ...s, series: { played: 1, wins: { late: 1 }, champ: { id: 'late', run: 1 } } }), null);
});

/** A room at the end of a game: seats p0, p1… named `names`, the night `series`, the game won by `winners`. */
function night(names: string[], series: Series, winners: string[] = series.champ ? [series.champ.id] : []): GameState {
  const s = createGame('p0', { targetScore: 1, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  s.players = names.map((name, i) => ({ id: `p${i}`, name, score: 0, recent: [], connected: true, hue: i }));
  return { ...s, phase: 'over', winners, series };
}
const lines = (s: GameState, me: string | null = null) => {
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? '?';
  return [ledgerLine(s, nameOf, me), crownLine(s, nameOf, me)];
};

test('ledgerLine and crownLine say how the night stands', () => {
  // Game 1.
  assert.deepEqual(lines(night(['Ash', 'Bea'], { played: 1, wins: { p0: 1 }, champ: { id: 'p0', run: 1 } })), ['Game 1 goes to Ash.', '']);
  assert.deepEqual(lines(night(['Ash', 'Bea', 'Cid'], { played: 1, wins: { p0: 1, p2: 1 }, champ: null }, ['p0', 'p2'])), [
    'Game 1 is shared by Ash and Cid.',
    '',
  ]);
  // Two players: both counts, or level.
  assert.deepEqual(lines(night(['Ash', 'Bea'], { played: 3, wins: { p0: 2, p1: 1 }, champ: { id: 'p1', run: 1 } }, ['p0'])), [
    'Ash leads the night 2 to 1.',
    '',
  ]);
  assert.deepEqual(lines(night(['Ash', 'Bea'], { played: 2, wins: { p0: 1, p1: 1 }, champ: { id: 'p1', run: 1 }, fell: 'p0' })), [
    'All square at 1 game each.',
    'Bea takes the Crown from Ash.',
  ]);
  assert.equal(lines(night(['Ash', 'Bea'], { played: 4, wins: { p0: 2, p1: 2 }, champ: { id: 'p0', run: 1 }, fell: 'p1' }))[0], 'All square at 2 games each.');
  // Three or more: the leader's count, or a shared lead.
  assert.deepEqual(lines(night(['Ash', 'Bree', 'Cid'], { played: 3, wins: { p0: 1, p1: 2 }, champ: { id: 'p1', run: 2 } })), [
    'Bree leads the night with 2 wins.',
    '',
  ]);
  assert.deepEqual(lines(night(['Ash', 'Bree', 'Cid'], { played: 4, wins: { p0: 2, p1: 2 }, champ: { id: 'p0', run: 1 }, fell: 'p1' })), [
    'Ash and Bree share the lead with 2 wins each.',
    'Ash takes the Crown from Bree.',
  ]);
  assert.equal(lines(night(['Ash', 'Bree', 'Cid'], { played: 3, wins: { p0: 1, p1: 1, p2: 1 }, champ: { id: 'p2', run: 1 } }))[0], 'Ash, Bree and Cid share the lead with 1 win each.');
  assert.equal(lines(night(['Ash', 'Bree', 'Cid'], { played: 2, wins: { p0: 1, p1: 1 }, champ: { id: 'p1', run: 1 } }, ['p1']))[0], 'Ash and Bree share the lead with 1 win each.');
  // Held three games or more.
  assert.deepEqual(lines(night(['Ash', 'Bea'], { played: 3, wins: { p0: 3 }, champ: { id: 'p0', run: 3 } })), [
    'Ash leads the night 3 to 0.',
    'Ash has held the Crown for 3 games.',
  ]);
  // Claimed: from nobody (after a shared game), or from someone who has left.
  assert.equal(lines(night(['Ash', 'Bea'], { played: 2, wins: { p0: 2, p1: 1 }, champ: { id: 'p0', run: 1 } }))[1], 'Ash takes the Crown.');
  assert.equal(lines(night(['Ash', 'Bea'], { played: 3, wins: { p0: 1, gone: 2 }, champ: { id: 'p0', run: 1 }, fell: 'gone' }))[1], 'Ash takes the Crown.');
  // Someone who left keeps their count, unnamed: the lead is among those here.
  assert.equal(lines(night(['Ash', 'Bea'], { played: 3, wins: { p0: 1, gone: 2 }, champ: { id: 'p0', run: 1 } }))[0], 'Ash leads the night 1 to 0.');
  // A shared game: the Crown stays where it was, and no line about it.
  assert.equal(lines(night(['Ash', 'Bea', 'Cid'], { played: 3, wins: { p0: 2, p1: 1, p2: 1 }, champ: { id: 'p0', run: 2 } }, ['p1', 'p2']))[1], '');
  // Nothing without a night, alone, or in Delve.
  assert.deepEqual(lines(night(['Ash', 'Bea'], { played: 0, wins: {}, champ: null })), ['', '']);
  assert.deepEqual(lines(night(['Ash'], { played: 2, wins: { p0: 2 }, champ: { id: 'p0', run: 2 } })), ['', '']);
  const delving = night(['Ash', 'Bea'], { played: 2, wins: { p0: 2 }, champ: { id: 'p0', run: 2 } });
  assert.deepEqual(lines({ ...delving, delve: {} as Delve }), ['', '']);
  // Online, the screen's own player is "you" (a spectator, not seated, reads names).
  assert.deepEqual(lines(night(['Ash', 'Bea'], { played: 1, wins: { p1: 1 }, champ: { id: 'p1', run: 1 } }), 'p1'), ['Game 1 is yours.', '']);
  assert.deepEqual(lines(night(['Ash', 'Bea', 'Cid'], { played: 1, wins: { p0: 1, p2: 1 }, champ: null }, ['p0', 'p2']), 'p2'), [
    'Game 1 is shared by you and Ash.',
    '',
  ]);
  assert.deepEqual(lines(night(['Ash', 'Bea'], { played: 3, wins: { p0: 2, p1: 1 }, champ: { id: 'p0', run: 1 }, fell: 'p1' }), 'p0'), [
    'You lead the night 2 to 1.',
    'You take the Crown from Bea.',
  ]);
  assert.deepEqual(lines(night(['Ash', 'Bea'], { played: 3, wins: { p0: 2, p1: 1 }, champ: { id: 'p0', run: 1 }, fell: 'p1' }), 'p1'), [
    'Ash leads the night 2 to 1.',
    'Ash takes the Crown from you.',
  ]);
  assert.deepEqual(lines(night(['Ash', 'Bree', 'Cid'], { played: 4, wins: { p0: 2, p1: 2 }, champ: { id: 'p0', run: 1 }, fell: 'p1' }), 'p1'), [
    'You and Ash share the lead with 2 wins each.',
    'Ash takes the Crown from you.',
  ]);
  assert.deepEqual(lines(night(['Ash', 'Bree', 'Cid'], { played: 3, wins: { p0: 1, p1: 2 }, champ: { id: 'p1', run: 3 } }), 'p1'), [
    'You lead the night with 2 wins.',
    'You have held the Crown for 3 games.',
  ]);
  assert.equal(lines(night(['Ash', 'Bea'], { played: 2, wins: { p0: 2, p1: 1 }, champ: { id: 'p0', run: 1 } }), 'p0')[1], 'You take the Crown.');
  assert.deepEqual(lines(night(['Ash', 'Bea'], { played: 3, wins: { p0: 2, p1: 1 }, champ: { id: 'p0', run: 1 }, fell: 'p1' }), 'late'), [
    'Ash leads the night 2 to 1.',
    'Ash takes the Crown from Bea.',
  ]);
  // A name that starts like the word stays as its player spelled it.
  assert.equal(lines(night(['young', 'Bea'], { played: 2, wins: { p0: 2 }, champ: { id: 'p0', run: 2 } }), 'p1')[0], 'young leads the night 2 to 0.');
  // No em dash in any of them (built from its code, as tests/style.test.ts does).
  const dash = String.fromCharCode(0x2014);
  for (const l of [
    ...lines(night(['Ash', 'Bree', 'Cid'], { played: 4, wins: { p0: 2, p1: 2 }, champ: { id: 'p0', run: 1 }, fell: 'p1' })),
    ...lines(night(['Ash', 'Bea'], { played: 3, wins: { p0: 3 }, champ: { id: 'p0', run: 3 } })),
    ...lines(night(['Ash', 'Bea'], { played: 1, wins: { p0: 1, p1: 1 }, champ: null }, ['p0', 'p1'])),
  ])
    assert.ok(!l.includes(dash), l);
});

test('guests see the night; Play again keeps it, bumping the version by exactly 1 and keeping used', () => {
  let { engine, s } = finished(['Ash', 'Bea']);
  assert.deepEqual(publicView(s).series, s.series);
  const again = engine.apply(s, { type: 'restart', play: true }, 'p0');
  assert.equal(again.version, s.version + 1);
  assert.deepEqual(again.used, s.used);
  assert.deepEqual(again.series, s.series);
  // Mid-question, guests see it too (it holds no item ids).
  s = engine.apply(again, { type: 'pick', category: again.offered[0] }, again.players[again.turn].id);
  assert.equal(s.phase, 'question');
  assert.deepEqual(publicView(s).series, again.series);
});
