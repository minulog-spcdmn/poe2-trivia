import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoomInfo, wireRoomInfo, type RoomInfo } from '../src/lib/roomInfo.ts';
import { PROTOCOL_VERSION } from '../src/lib/protocol.ts';

const room: RoomInfo = {
  code: 'ABCDEF',
  host: 'Ash',
  players: 2,
  maxPlayers: 12,
  spectators: 0,
  maxSpectators: 8,
  mode: 'turns',
  difficulty: 'merciless',
  target: 10,
  phase: 'lobby',
};

/** The checks a scanner from before Delve applies (rooms.ts at protocol 9). */
const oldScannerAccepts = (r: Record<string, unknown>) => r.mode === 'turns' || r.mode === 'race';

test('a Delve room goes out as turns with a flag, and comes back as Delve with its depth', () => {
  const wire = wireRoomInfo({ ...room, mode: 'delve', phase: 'choosing', depth: 7 });
  assert.equal(wire.mode, 'turns');
  assert.equal(wire.delve, true);
  assert.equal(wire.v, PROTOCOL_VERSION);
  assert.ok(oldScannerAccepts(wire));
  assert.deepEqual(parseRoomInfo(wire), { ...room, mode: 'delve', phase: 'choosing', depth: 7, v: PROTOCOL_VERSION });
});

test('other rooms are unchanged apart from the version', () => {
  assert.deepEqual(parseRoomInfo(wireRoomInfo(room)), { ...room, v: PROTOCOL_VERSION });
  assert.equal(wireRoomInfo(room).delve, undefined);
});

test('a depth that does not check out is dropped, and the room kept', () => {
  for (const depth of [0, 10_000, 2.5, 'deep', -1]) {
    const parsed = parseRoomInfo({ ...wireRoomInfo({ ...room, mode: 'delve' }), depth });
    assert.ok(parsed, String(depth));
    assert.equal(parsed!.depth, undefined);
  }
  assert.equal(parseRoomInfo({ ...wireRoomInfo(room), depth: 5 })!.depth, undefined, 'only Delve rooms have a depth');
});

test('a listing from a host before version 10 has no version', () => {
  const { v, ...old } = wireRoomInfo(room);
  assert.equal(v, PROTOCOL_VERSION);
  assert.equal(parseRoomInfo(old)!.v, undefined);
  assert.equal(parseRoomInfo({ ...old, mode: 'sprint' }), null);
});
