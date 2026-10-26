// The codes players pass on (the room code, the sync code) keep the
// browser's own menu when held with a finger or a pen: on a phone a long
// press is a contextmenu, and the page-wide handler in main.ts that stops a
// right click's menu would take away the Copy Android Chrome shows over the
// selection. A mouse's right click on them stays without a menu, as
// everywhere else in the game. Read from the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MAIN = readFileSync('src/main.ts', 'utf8');
/** The files that show a code to copy, and the class each one's code is styled by. */
const CODES: [file: string, cls: string, tag: RegExp][] = [
  ['src/components/RoomCodeGlyphs.svelte', 'glyphs', /<span class="glyphs"[^>]*\sdata-copy[\s>]/],
  ['src/components/SyncDialog.svelte', 'code', /<p class="code"[^>]*\sdata-copy[\s>]/],
  ['src/App.svelte', 'code', /<b class="code"[^>]*\sdata-copy[\s>]/],
];

test('the contextmenu handler lets data-copy through, unless pressed with a mouse', () => {
  const from = MAIN.indexOf("addEventListener('contextmenu'");
  assert.ok(from >= 0, 'main.ts has a contextmenu handler');
  const handler = MAIN.slice(from, MAIN.indexOf('\n});', from));
  // What any press keeps (text fields, links) doesn't take in the codes...
  const always = /closest\('([^']*)'\)/.exec(handler)?.[1] ?? '';
  assert.ok(!always.split(',').map((s) => s.trim()).includes('[data-copy]'), `main.ts's contextmenu exemption for any press is ${always}`);
  // ...which are let through only when the last press wasn't a mouse's,
  assert.match(handler, /pressedWith !== 'mouse' && \w+\?\.closest\('\[data-copy\]'\)\) return;/);
  // remembered as it comes down (Safari's contextmenu has no pointer type of its own).
  assert.match(MAIN, /addEventListener\('pointerdown', \(e\) => \(pressedWith = e\.pointerType\), \{ capture: true/);
});

test('every code a player copies is marked data-copy', () => {
  for (const [file, , tag] of CODES) assert.match(readFileSync(file, 'utf8'), tag, file);
  // And none of the header's room codes is left out.
  const app = readFileSync('src/App.svelte', 'utf8');
  assert.equal(app.match(/<b class="code"/g)?.length, app.match(/<b class="code"[^>]*\sdata-copy[\s>]/g)?.length);
});

test('every code a player copies is selectable on WebKit too', () => {
  // WebKit (every iPhone browser) goes by -webkit-user-select, which
  // inherits: without it a code stays under body's none, with no selection
  // to copy and no callout over it.
  for (const [file, cls] of CODES) {
    const rule = new RegExp(`\\n  \\.${cls} \\{\\r?\\n([^}]*)\\}`).exec(readFileSync(file, 'utf8'))?.[1] ?? '';
    assert.match(rule, /(^|\s)-webkit-user-select: all;/, `${file} .${cls}`);
    assert.match(rule, /(^|\s)user-select: all;/, `${file} .${cls}`);
    assert.match(rule, /(^|\s)-webkit-touch-callout: default;/, `${file} .${cls}`);
  }
});
