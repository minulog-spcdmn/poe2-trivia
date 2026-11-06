import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carry, cssTree, decodeMap, encodeMap, enclosingName, hunksOf, placesTouched, rulesAt, selectorClasses, type FileChange, type Hunk, type PlaceMap, type RawMap } from '../src/qa/change.ts';

// The QA desk's "This change" lists the places that run what a branch
// changes (src/qa/change.ts), by the scene map: each line's places, from
// the browser's coverage, and the class names each place's page had.

const SCENES = ['home/a', 'home/b', 'lobby/a', 'game/a', 'game/b', 'over/a', 'over/b', 'codex/a', 'settings/a', 'overlay/a'];
const PIECES = ['avatar', 'streak', 'plate'];

const LOBBY = `<script lang="ts">
  let { room } = $props();
  const full = $derived(room.players.length > 7);
  function leave() {}
</script>

<div class="room" class:full>
  <p>Hello</p>
</div>

<style>
  .room {
    color: red;
  }
  .room p {
    margin: 0;
  }
  .gone {
    color: blue;
  }
  div {
    animation: pulse 1s;
  }
  @keyframes pulse {
    to { opacity: 0; }
  }
</style>
`;

const APP_CSS = `:root {
  --gold: #c90;
}
.btn {
  color: var(--gold);
}
.seat .name {
  margin: 0;
}
`;

function raw(): RawMap {
  const s = (...keys: string[]) => new Set(keys);
  const lines = (entries: [number, Set<string> | 'module'][]) => new Map(entries);
  return {
    commit: 'm',
    places: [...SCENES, ...PIECES],
    files: new Map([
      ['src/lib/rooms.ts', lines([[1, 'module'], [2, 'module'], [4, s('home/b', 'lobby/a')], [5, s('home/b', 'lobby/a')], [6, s('home/b', 'lobby/a')], [7, s()], [8, s('lobby/a')], [9, s('lobby/a')], [10, 'module']])],
      ['src/lib/session.svelte.ts', lines([1, 2, 3, 4, 5].map((l) => [l, s(...SCENES.slice(0, 8))]))],
      ['src/components/Lobby.svelte', lines([[2, s('lobby/a')], [3, s('lobby/a')], [4, s()], [7, s('lobby/a')]])],
      ['src/qa/frame/PieceHost.svelte', lines([[2, s(...PIECES)]])],
    ]),
    classes: new Map([
      ['room', s('lobby/a')],
      ['btn', s(...SCENES.slice(0, 6))],
      ['seat', s('lobby/a', 'game/a')],
      ['name', s('lobby/a', 'game/a', 'over/a')],
    ]),
  };
}
const map: PlaceMap = JSON.parse(encodeMap(raw()));

/** A change to `file`: its hunks, the same at the map's commit and the merge base unless said. */
const change = (file: string, hunks: Hunk[], text: string | null = null, more: Partial<FileChange> = {}): FileChange => ({ file, hunks, before: text, after: text, toBase: null, toNow: null, ...more });
const at = (start: number, count = 1): Hunk => ({ old: [start, count], new: [start, count] });
const keys = (files: FileChange[]) => placesTouched(files, map).places.map((p) => p.key);

test('the map keeps each line’s places, one entry a line, and reads back as it was', () => {
  const text = encodeMap(raw());
  assert.ok(text.includes('\n    "src/lib/rooms.ts": [1,-2,3,-1,4,'), text);
  assert.ok(text.includes('\n    "home/a",\n'));
  const back = decodeMap(map);
  assert.deepEqual([...back.files.get('src/lib/rooms.ts')!.get(8) as Set<string>], ['lobby/a']);
  assert.equal(back.files.get('src/lib/rooms.ts')!.get(1), 'module');
  assert.equal(back.files.get('src/lib/rooms.ts')!.has(3), false);
  assert.equal(encodeMap(back), text);
});

test('a changed line lights the places that ran it, most its own first', () => {
  const t = placesTouched([change('src/lib/rooms.ts', [at(4), at(8)])], map);
  assert.deepEqual(t.places.map((p) => p.key), ['lobby/a', 'home/b']);
  assert.match(t.places[0].why, /rooms\.ts: line 8/);
  assert.match(t.places[1].why, /rooms\.ts: line 4/);
  assert.deepEqual(t.everywhere, []);
});

test('an insertion counts the lines either side; a module’s own code, wherever the file runs', () => {
  // (Between line 7, which no place ran, and 8.)
  assert.deepEqual(keys([change('src/lib/rooms.ts', [{ old: [7, 0], new: [8, 2] }])]), ['lobby/a']);
  assert.deepEqual(keys([change('src/lib/rooms.ts', [at(1)])]).sort(), ['home/b', 'lobby/a']);
});

test('code no place ran is said, and lights none', () => {
  const t = placesTouched([change('src/lib/rooms.ts', [at(7)])], map);
  assert.deepEqual(t.places, []);
  assert.deepEqual(t.unrun, [{ file: 'src/lib/rooms.ts', what: 'line 7' }]);
  const svelte = placesTouched([change('src/components/Lobby.svelte', [at(4)], LOBBY)], map);
  assert.deepEqual(svelte.unrun, [{ file: 'src/components/Lobby.svelte', what: 'leave (line 4)' }]);
});

test('what more than a third of the screens (or the pieces) run changes everything: named once, lighting none', () => {
  const t = placesTouched([change('src/lib/session.svelte.ts', [at(2), at(4)]), change('src/qa/frame/PieceHost.svelte', [at(2)]), change('package.json', [at(3)])], map);
  assert.deepEqual(t.places, []);
  assert.deepEqual(
    t.everywhere.map((e) => [e.file, e.of]),
    [
      ['src/lib/session.svelte.ts', 'screens'],
      ['src/qa/frame/PieceHost.svelte', 'pieces'],
      ['package.json', 'screens'],
    ],
  );
});

test('a Svelte file: its script and template by line, its markup wherever it runs, its style by class', () => {
  assert.deepEqual(keys([change('src/components/Lobby.svelte', [at(3)], LOBBY)]), ['lobby/a']);
  // (Markup with no code of its own: where the component ran.)
  assert.deepEqual(keys([change('src/components/Lobby.svelte', [at(8)], LOBBY)]), ['lobby/a']);
  const css = placesTouched([change('src/components/Lobby.svelte', [at(13)], LOBBY)], map);
  assert.deepEqual(css.places.map((p) => p.key), ['lobby/a']);
  assert.match(css.places[0].why, /Lobby\.svelte: \.room$/);
  assert.deepEqual(keys([change('src/components/Lobby.svelte', [at(16)], LOBBY)]), ['lobby/a']);
  // A rule whose class no page had, and keyframes, by the rules that use them.
  assert.deepEqual(placesTouched([change('src/components/Lobby.svelte', [at(19)], LOBBY)], map).unrun, [{ file: 'src/components/Lobby.svelte', what: '.gone' }]);
  assert.deepEqual(keys([change('src/components/Lobby.svelte', [at(25)], LOBBY)]), ['lobby/a']);
});

test('the app’s stylesheet: a rule by its classes, one without any everywhere’s', () => {
  assert.deepEqual(keys([change('src/app.css', [at(7)], APP_CSS)]).sort(), ['game/a', 'lobby/a']);
  for (const line of [2, 5]) {
    const t = placesTouched([change('src/app.css', [at(line)], APP_CSS)], map);
    assert.deepEqual(t.places, [], `line ${line}`);
    assert.deepEqual(t.everywhere.map((e) => e.file), ['src/app.css'], `line ${line}`);
  }
});

test('lines are carried to the map’s; one changed since it counts wherever its file runs', () => {
  // Two lines added at the top since the map was made: the merge base's line 6 is the map's 4.
  const moved: Hunk[] = [{ old: [0, 0], new: [1, 2] }];
  assert.deepEqual(keys([change('src/lib/rooms.ts', [at(10)], null, { toBase: moved, toNow: moved })]), ['lobby/a']);
  const since = placesTouched([change('src/lib/rooms.ts', [at(1)], null, { toBase: moved, toNow: 'unknown' })], map);
  assert.deepEqual(since.places.map((p) => p.key).sort(), ['home/b', 'lobby/a']);
  assert.match(since.places[0].why, /changed since the scene map/);
  // A map made with the change in: the lines as they are now.
  assert.deepEqual(keys([change('src/lib/rooms.ts', [{ old: [4, 1], new: [8, 1] }], null, { toBase: [{ old: [8, 1], new: [4, 1] }], toNow: null })]), ['lobby/a']);
});

test('a game file no place runs is listed as not covered; docs, tests and the desk’s own are not', () => {
  const t = placesTouched(['src/lib/plateWorker.ts', 'docs/qa.md', 'tests/x.test.ts', 'src/qa/desk/Desk.svelte'].map((f) => change(f, [at(1)])), map);
  assert.deepEqual(t.places, []);
  assert.deepEqual(t.uncovered, ['src/lib/plateWorker.ts']);
});

test('git’s diffs, and lines carried across them', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1..2 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -5,0 +6,2 @@ function x() {',
    '+  one',
    '+  two',
    '@@ -9 +11 @@',
    '-a',
    '+b',
    'diff --git a/src/gone.ts b/src/gone.ts',
    'deleted file mode 100644',
    '--- a/src/gone.ts',
    '+++ /dev/null',
    '@@ -1,3 +0,0 @@',
    '-x',
  ].join('\r\n');
  const h = hunksOf(diff);
  assert.deepEqual(h.get('src/a.ts'), [
    { old: [5, 0], new: [6, 2] },
    { old: [9, 1], new: [11, 1] },
  ]);
  assert.deepEqual(h.get('src/gone.ts'), [{ old: [1, 3], new: [0, 0] }]);
  const a = h.get('src/a.ts')!;
  assert.deepEqual([5, 6, 9, 10].map((l) => carry(l, a, 'old')), [5, 8, null, 12]);
  assert.deepEqual([5, 6, 7, 8, 11, 12].map((l) => carry(l, a, 'new')), [5, null, null, 6, null, 10]);
});

test('CSS: the rules a line is in, and the classes a page needs for one to match', () => {
  const tree = cssTree(APP_CSS);
  assert.deepEqual(rulesAt(tree, [5]).map((r) => r.prelude), ['.btn']);
  const media = cssTree('@media (hover: hover) {\n  .a:hover {\n    color: red;\n  }\n\n  .b { color: blue; }\n}\n@font-face {\n  font-family: X;\n}\n');
  assert.deepEqual(rulesAt(media, [1]).map((r) => r.prelude), ['.a:hover', '.b']);
  assert.deepEqual(rulesAt(media, [3]).map((r) => r.prelude), ['.a:hover']);
  // (Between an @media's rules, none; in an @font-face, itself.)
  assert.deepEqual(rulesAt(media, [5]), []);
  assert.deepEqual(rulesAt(media, [9]).map((r) => r.prelude), ['@font-face']);
  assert.deepEqual(selectorClasses('.a .b:hover'), ['a', 'b']);
  assert.deepEqual(selectorClasses('.panel p'), ['panel']);
  assert.deepEqual(selectorClasses('.x:not(.y) > .z.w'), ['x', 'z', 'w']);
  assert.deepEqual(selectorClasses(':global(.foo) span'), ['foo']);
  assert.deepEqual(selectorClasses('.c[data-x="a.b"]'), ['c']);
  assert.deepEqual(selectorClasses(':root'), []);
});

test('the function a line is in, by its indentation', () => {
  const ts = 'export function go(n: number) {\n  const x = 1;\n  if (n) {\n    return x;\n  }\n}\nconst k = 2;\n';
  assert.equal(enclosingName(ts, 4), 'go');
  assert.equal(enclosingName(ts, 1), 'go');
  assert.equal(enclosingName(ts, 7), null);
  assert.equal(enclosingName('  const pick = (a: number) => {\n    return a;\n  };\n', 2), 'pick');
});
