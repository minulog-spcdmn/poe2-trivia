// The startup script is the start page's: on a first visit everything in it
// is downloaded before the page shows at all, which on a phone on a busy
// Wi-Fi is seconds. A room's screens are chunks of their own, imported by
// App.svelte once the start page has settled or on the way into a room, and
// never statically by the start page's own code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The modules a file imports statically (`import ... from '...'`, types left out). */
function staticImports(path: string): string[] {
  const src = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  return [...src.matchAll(/^\s*import\s+(?!type\b)[^'"]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
}

const ROOM_SCREENS = ['Lobby.svelte', 'PeerCursors.svelte', 'ZoneCard.svelte', 'Recorder.svelte', 'Game.svelte', 'GameOver.svelte'];
const START = ['main.ts', 'App.svelte', 'components/Home.svelte', 'components/DailyUnique.svelte', 'components/OpenRooms.svelte'];

test('the start page imports none of a room’s screens statically', () => {
  for (const file of START) {
    const wrong = staticImports(file).filter((spec) => ROOM_SCREENS.some((s) => spec.endsWith(`/${s}`)));
    assert.deepEqual(wrong, [], `${file} imports ${wrong.join(', ')} with the startup script`);
  }
});

test('App.svelte imports each of them when wanted', () => {
  const src = readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8');
  for (const s of ROOM_SCREENS) assert.match(src, new RegExp(`import\\('\\./components/(zonecard/)?${s.replace('.', '\\.')}'\\)`), s);
});
