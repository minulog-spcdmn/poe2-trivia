import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, type GameState, type Player } from '../src/lib/game.ts';
import { creatorArrival } from '../src/lib/herald.ts';

const player = (id: string, name: string, hue = 0): Player => ({ id, name, score: 0, recent: [], connected: true, hue });

function room(players: Player[], spectators: { id: string; name: string }[] = [], phase: GameState['phase'] = 'lobby'): GameState {
  return { ...createGame('host'), phase, players, spectators };
}

const host = player('host', 'Doryani', 0);
const zoe = player('z1', 'zoe_arcana', 11);

test('her first arrival in a room is heralded, with her colour', () => {
  const seen = new Set<string>();
  const before = room([host]);
  assert.equal(creatorArrival(null, before, seen), null);
  assert.deepEqual(creatorArrival(before, room([host, zoe]), seen), { id: 'z1', name: 'zoe_arcana', hue: 11, watching: false });
});

test('every spelling the name check treats as hers counts; other names do not', () => {
  for (const name of ['Zoe Arcana', 'zoe-arcana', 'Z0E_ARCANA']) {
    const seen = new Set<string>();
    const before = room([host]);
    creatorArrival(null, before, seen);
    assert.equal(creatorArrival(before, room([host, player('z', name)]), seen)?.name, name);
  }
  const seen = new Set<string>();
  const before = room([host]);
  creatorArrival(null, before, seen);
  assert.equal(creatorArrival(before, room([host, player('k', 'Kestrel')]), seen), null);
  assert.equal(creatorArrival(before, room([host, player('a', 'zoe_arcanax')]), seen), null);
});

test('not when this device first gets the room with her already in it', () => {
  const seen = new Set<string>();
  const opened = room([host, zoe]);
  assert.equal(creatorArrival(null, opened, seen), null);
  // Later changes to the room don't make her an arrival either.
  const next = room([host, zoe, player('k', 'Kestrel')]);
  assert.equal(creatorArrival(opened, next, seen), null);
});

test('not when she reconnects or comes back after a refresh (same id)', () => {
  const seen = new Set<string>();
  const a = room([host]);
  creatorArrival(null, a, seen);
  const b = room([host, zoe]);
  assert.ok(creatorArrival(a, b, seen));
  // Mid-game: offline, then back.
  const offline = room([host, { ...zoe, connected: false }], [], 'choosing');
  assert.equal(creatorArrival(b, offline, seen), null);
  assert.equal(creatorArrival(offline, room([host, zoe], [], 'choosing'), seen), null);
  // A lobby lets go of a seat whose player disconnects; the refresh brings her back under her id.
  const left = room([host]);
  assert.equal(creatorArrival(b, left, seen), null);
  assert.equal(creatorArrival(left, room([host, zoe]), seen), null);
});

test('she joins a game under way as a spectator, and takes her seat at the next one quietly', () => {
  const seen = new Set<string>();
  const playing = room([host], [], 'question');
  creatorArrival(null, playing, seen);
  const watching = room([host], [{ id: 'z1', name: 'zoe_arcana' }], 'question');
  assert.deepEqual(creatorArrival(playing, watching, seen), { id: 'z1', name: 'zoe_arcana', watching: true });
  assert.equal(creatorArrival(watching, room([host, zoe]), seen), null);
});

test('a new seat under a new id is a new arrival (hot-seat: her name typed in again)', () => {
  const seen = new Set<string>();
  const a = room([]);
  creatorArrival(null, a, seen);
  assert.ok(creatorArrival(a, room([zoe]), seen));
  assert.equal(creatorArrival(room([zoe]), a, seen), null);
  assert.equal(creatorArrival(a, room([player('z2', 'zoe_arcana', 11)]), seen)?.id, 'z2');
});
