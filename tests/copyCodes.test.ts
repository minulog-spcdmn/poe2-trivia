// The codes players pass on (the room code, the sync code) keep the
// browser's own menu: on a phone a long press is a contextmenu, and the
// page-wide handler in main.ts that stops a right click's menu would take
// away the Copy Android Chrome shows over the selection. Read from the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MAIN = readFileSync('src/main.ts', 'utf8');

test('the contextmenu handler lets data-copy through', () => {
  const handler = MAIN.slice(MAIN.indexOf("addEventListener('contextmenu'"));
  const selector = /closest\('([^']*)'\)/.exec(handler)?.[1] ?? '';
  assert.ok(selector.split(',').map((s) => s.trim()).includes('[data-copy]'), `main.ts's contextmenu exemption is ${selector}`);
});

test('every code a player copies is marked data-copy', () => {
  const marked: [string, RegExp][] = [
    ['src/components/RoomCodeGlyphs.svelte', /<span class="glyphs"[^>]*\sdata-copy[\s>]/],
    ['src/components/SyncDialog.svelte', /<p class="code"[^>]*\sdata-copy[\s>]/],
    ['src/App.svelte', /<b class="code"[^>]*\sdata-copy[\s>]/],
  ];
  for (const [file, tag] of marked) assert.match(readFileSync(file, 'utf8'), tag, file);
  // And none of the header's room codes is left out.
  const app = readFileSync('src/App.svelte', 'utf8');
  assert.equal(app.match(/<b class="code"/g)?.length, app.match(/<b class="code"[^>]*\sdata-copy[\s>]/g)?.length);
});
