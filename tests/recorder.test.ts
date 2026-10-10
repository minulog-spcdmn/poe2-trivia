import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOVE_EVERY_MS, Recording, sceneOf } from '../src/lib/recorder.ts';
import { createGame } from '../src/lib/game.ts';

test('a recording keeps the pointer finely, but not more often than it needs', () => {
  const r = new Recording(1000);
  assert.ok(r.move(0, 10.4, 20.6));
  assert.equal(r.move(MOVE_EVERY_MS / 2, 11, 21), false);
  assert.ok(r.move(MOVE_EVERY_MS + 0.123, 12, 22));
  assert.deepEqual(r.moves, [0, 10, 21, 8.1, 12, 22]);
  assert.equal(r.span, 8.1);
  assert.ok(r.unsaved);
  r.pointAt(3, null);
  r.pointAt(40, [16, 500, 250]);
  assert.deepEqual(r.at, [3, -1, 0, 0, 40, 16, 500, 250]);
  assert.equal(r.dueAt(50), false);
  assert.ok(r.dueAt(80));
});

test('the game is kept only when something a hand cares about changes, and the screen only when it moved', () => {
  const r = new Recording();
  const s = createGame('me');
  assert.ok(r.scene(sceneOf(s, 'me', 0)));
  // A later look at the same game (a player's connection, the version bumped) isn't kept.
  assert.equal(r.scene(sceneOf({ ...s, version: s.version + 1 }, 'me', 50)), false);
  assert.ok(r.scene(sceneOf({ ...s, phase: 'choosing', offered: ['a', 'b'] }, 'me', 90)));
  assert.equal(r.scenes.length, 2);
  const box = { t: 0, w: 1440, h: 900, scrollY: 0, boxes: { game: [0, 60, 1440, 900] as [number, number, number, number] } };
  r.layout(box);
  r.layout({ ...box, t: 400 });
  r.layout({ ...box, t: 900, scrollY: 40 });
  assert.deepEqual(r.layouts.map((l) => l.t), [0, 900]);
  // Nothing typed, no names: what's in the file.
  const file = JSON.parse(r.file({ dpr: 2 }));
  assert.deepEqual(Object.keys(file), ['v', 'started', 'about', 'moves', 'at', 'happenings', 'layouts', 'scenes']);
  assert.ok(!JSON.stringify(file.scenes).includes('"name"'));
});
