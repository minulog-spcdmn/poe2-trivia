import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touched, type SceneFiles } from '../src/qa/change.ts';
import type { Screen } from '../src/qa/scene.ts';

const scenes: { key: string; screen: Screen }[] = [
  { key: 'home/a', screen: 'home' },
  { key: 'home/b', screen: 'home' },
  { key: 'lobby/a', screen: 'lobby' },
  { key: 'game/a', screen: 'game' },
  { key: 'over/a', screen: 'over' },
  { key: 'over/b', screen: 'over' },
];
const map: SceneFiles = {
  global: ['src/lib/stage.ts'],
  files: { 'src/components/Lobby.svelte': ['lobby/a'], 'src/components/GameOver.svelte': ['over/a', 'over/b'], 'src/lib/rooms.ts': ['home/b', 'lobby/a'] },
};

// The QA desk's "This change" walks the scenes a branch's files touch.
test('a changed file walks the scenes that run it, in the catalog order', () => {
  const t = touched(['src/lib/rooms.ts', 'src/components/GameOver.svelte'], map, scenes);
  assert.deepEqual(
    t.scenes.map((s) => s.key),
    ['home/b', 'lobby/a', 'over/a', 'over/b'],
  );
  assert.match(t.scenes[0].why, /rooms\.ts/);
  assert.deepEqual(t.uncovered, []);
});

test('a file every screen runs walks one scene of each screen', () => {
  for (const file of ['src/app.css', 'src/lib/stage.ts', 'src/App.svelte']) {
    assert.deepEqual(
      touched([file], map, scenes).scenes.map((s) => s.key),
      ['home/a', 'lobby/a', 'game/a', 'over/a'],
      file,
    );
  }
});

test("a changed scene file walks its screen's scenes", () => {
  assert.deepEqual(
    touched(['src/qa/scenes/over.ts'], map, scenes).scenes.map((s) => s.key),
    ['over/a', 'over/b'],
  );
});

test('a game file no scene runs is listed as not covered; docs and tests are not', () => {
  const t = touched(['src/lib/plateWorker.ts', 'docs/qa.md', 'tests/x.test.ts', 'src/qa/desk/Desk.svelte'], map, scenes);
  assert.deepEqual(t.scenes, []);
  assert.deepEqual(t.uncovered, ['src/lib/plateWorker.ts']);
});
