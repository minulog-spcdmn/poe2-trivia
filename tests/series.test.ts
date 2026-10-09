import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ActionError, createGame, Engine, type Delve, type GameState, type Item, type Question } from '../src/lib/game.ts';
import { REMATCH_MS, rematchCount, settleRematch } from '../src/lib/series.ts';

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
