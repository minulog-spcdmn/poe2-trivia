// The startup script is the start page's: on a first visit everything in it
// is downloaded before the page shows at all, which on a phone on a busy
// Wi-Fi is seconds. A room's screens are chunks of their own, imported by
// App.svelte once the start page has settled or on the way into a room, and
// nothing the startup script is made of may import one statically, however
// far down: the bundler would put it, and all it imports, back on that path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const at = (file: string) => posix.join(ROOT.replaceAll('\\', '/'), file);

/**
 * What a module imports statically: `import ... from`, a bare `import '...'`
 * and `export ... from`, in either quotes and over several lines. `import
 * type` and `export type` are left out (nothing of them is left once built),
 * and so is `import()`, which is a chunk of its own.
 */
function staticImports(src: string): string[] {
  const found = src.matchAll(/^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s*)?(['"])([^'"]+)\2/gm);
  return [...found].filter((m) => !m[1]).map((m) => m[3]);
}

/** A relative import's file, found as Vite finds it (`./lib/session.svelte` is `session.svelte.ts`). */
function resolve(from: string, spec: string): string | null {
  const base = posix.join(posix.dirname(from), spec);
  for (const end of ['', '.ts', '.svelte', '.svelte.ts', '.js', '/index.ts']) {
    const file = base + end;
    if (existsSync(at(file)) && statSync(at(file)).isFile()) return file;
  }
  return null;
}

/**
 * Every module of the startup script (what src/main.ts imports statically,
 * and what those do, all the way down), each with the module that first
 * brought it in; and the relative imports that couldn't be found, which would
 * leave a part of it unread. (Packages are left out: none of them imports a
 * screen of the game's.)
 */
function startupScript() {
  const by = new Map<string, string | null>([['src/main.ts', null]]);
  const lost: string[] = [];
  const queue = ['src/main.ts'];
  for (let i = 0; i < queue.length; i++) {
    const file = queue[i];
    if (!/\.(ts|js|svelte)$/.test(file)) continue;
    for (const spec of staticImports(readFileSync(at(file), 'utf8'))) {
      if (!spec.startsWith('.')) continue;
      const to = resolve(file, spec);
      if (!to) lost.push(`${spec} (in ${file})`);
      else if (!by.has(to)) {
        by.set(to, file);
        queue.push(to);
      }
    }
  }
  return { by, lost };
}

/** How the startup script comes to `file`: main.ts, what that imports, and on down to it. */
function chain(by: Map<string, string | null>, file: string): string {
  const path: string[] = [];
  for (let f: string | null | undefined = file; f; f = by.get(f)) path.unshift(f);
  return path.join(' → ');
}

const ROOM_SCREENS = ['Lobby.svelte', 'PeerCursors.svelte', 'zonecard/ZoneCard.svelte', 'Recorder.svelte', 'Game.svelte', 'GameOver.svelte'];

test('the walk reads the whole startup script', () => {
  const { by, lost } = startupScript();
  assert.deepEqual(lost, [], 'relative imports it couldn’t find');
  for (const file of ['src/App.svelte', 'src/components/Home.svelte', 'src/components/DailyUnique.svelte', 'src/components/OpenRooms.svelte', 'src/lib/session.svelte.ts'])
    assert.ok(by.has(file), `${file} isn't in it`);
});

test('nothing in the startup script imports a room’s screens statically', () => {
  const { by } = startupScript();
  for (const s of ROOM_SCREENS) {
    const file = `src/components/${s}`;
    assert.ok(existsSync(at(file)), `${file} is gone: ROOM_SCREENS needs updating`);
    assert.ok(!by.has(file), `${chain(by, file)} puts ${s} in the startup script`);
  }
});

test('App.svelte imports each of them when wanted', () => {
  const src = readFileSync(at('src/App.svelte'), 'utf8');
  for (const s of ROOM_SCREENS) assert.ok(src.includes(`import('./components/${s}')`), s);
});
