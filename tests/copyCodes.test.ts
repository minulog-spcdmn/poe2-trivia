// The codes players pass on (the room code, the sync code) keep the
// browser's own menu when held with a finger or a pen: on a phone a long
// press is a contextmenu, and the page-wide handler (lib/noMenu.ts) that
// stops a right click's menu would take away the Copy Android Chrome shows
// over the selection. A mouse's right click on them stays without a menu, as
// everywhere else in the game. And a tap on the room code copies it there and
// then, not on a selection Chrome makes only after the finger is up. The
// handler against fake events, the rest read from the source.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The files that show a code to copy, and the class each one's code is styled by. */
const CODES: [file: string, cls: string, tag: RegExp][] = [
  ['src/components/RoomCodeGlyphs.svelte', 'glyphs', /<span class="glyphs"[^>]*\sdata-copy[\s>]/],
  ['src/components/SyncDialog.svelte', 'code', /<p class="code"[^>]*\sdata-copy[\s>]/],
  ['src/App.svelte', 'code', /<b class="code"[^>]*\sdata-copy[\s>]/],
];

const g = globalThis as Record<string, unknown>;
const heard: Record<string, (e: unknown) => void> = {};
g.addEventListener = (type: string, f: (e: unknown) => void) => (heard[type] = f);
g.HTMLImageElement = class {};
const { installNoMenu } = await import('../src/lib/noMenu.ts');
installNoMenu();

/** Something on the page that matches these of the handler's selectors, and none else. */
const on = (...is: string[]) => ({ closest: (sel: string) => (sel.split(',').some((s) => is.includes(s.trim())) ? {} : null) });
/** Whether a press with `pointer` (none: no press yet), then its contextmenu on `target`, keeps the browser's menu. */
const menuAfter = (pointer: string | null, target: unknown) => {
  if (pointer) heard.pointerdown({ pointerType: pointer });
  let prevented = false;
  heard.contextmenu({ target, preventDefault: () => (prevented = true) });
  return !prevented;
};

test('a code keeps its menu held with a finger or a pen, not right clicked with a mouse', () => {
  const code = on('[data-copy]');
  assert.equal(menuAfter('touch', code), true, 'a long press on a code');
  assert.equal(menuAfter('pen', code), true, "a pen's long press on a code");
  assert.equal(menuAfter('mouse', code), false, 'a right click on a code');
  // A menu that comes after another press (a finger's after a mouse's) goes by the last one.
  assert.equal(menuAfter('touch', code), true, 'a long press after a right click');
});

test('anywhere else only text fields and links keep the menu, whatever pressed', () => {
  for (const pointer of ['mouse', 'touch', 'pen']) {
    assert.equal(menuAfter(pointer, on()), false, `${pointer} on the game`);
    for (const field of ['input', 'textarea', '[contenteditable]', 'a[href]']) assert.equal(menuAfter(pointer, on(field)), true, `${pointer} on ${field}`);
  }
  assert.equal(menuAfter(null, null), false, 'on nothing');
});

test('an image never lifts off as a ghost, the rest drags as it would', () => {
  const dragged = (target: unknown) => {
    let prevented = false;
    heard.dragstart({ target, preventDefault: () => (prevented = true) });
    return prevented;
  };
  assert.equal(dragged(new (g.HTMLImageElement as new () => object)()), true);
  assert.equal(dragged(on()), false);
});

test('the game and every QA frame install it, the game no handler of its own', () => {
  // The desk's frames mount the game as its own page does: without these a bench keeps every menu.
  for (const file of ['src/main.ts', 'src/qa/frame/boot.ts', 'src/qa/frame/piece.ts', 'src/qa/live/seat.ts']) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /lib\/noMenu(\.ts)?'/, `${file} imports lib/noMenu.ts`);
    // (The scene's and piece's frames call it through frame/optional.ts's lookup, so noMenu?.)
    assert.match(src, /^\s*(noMenu\??\.)?installNoMenu\(\);$/m, `${file} calls installNoMenu()`);
  }
  assert.doesNotMatch(readFileSync('src/main.ts', 'utf8'), /addEventListener\('(contextmenu|dragstart)'/);
});

test('a tap on the room code copies it on its click, not on a selection after', () => {
  const src = readFileSync('src/components/RoomCodeGlyphs.svelte', 'utf8');
  /** A function's body in the component's script, up to its closing brace. */
  const body = (name: string) => {
    const from = src.search(new RegExp(`\\n  (async )?function ${name}\\(`));
    assert.ok(from >= 0, `RoomCodeGlyphs has ${name}()`);
    return src.slice(from, src.indexOf('\n  }', from));
  };
  // The code's click goes to tapped() (its tag is on one line, an arrow function's > in it),
  assert.match(src, /<span class="glyphs"[^\n]*\sonclick=\{tapped\}/);
  // a press waits for its pointerup only with a mouse (Android Chrome selects the code after a finger's or a pen's),
  const press = body('press');
  assert.match(press, /touched = e\.pointerType !== 'mouse';/);
  assert.match(press, /if \(!touched\) addEventListener\('pointerup', release/);
  assert.equal(src.match(/addEventListener\('pointerup'/g)?.length, 1, 'no other wait for a pointerup');
  // and a tap copies at once, without looking for a selection first.
  const tapped = body('tapped');
  assert.match(tapped, /if \(touched\) void copy\(e\);/);
  assert.doesNotMatch(tapped, /selectionHere|return/);
  const copy = body('copy');
  assert.doesNotMatch(copy.slice(0, copy.indexOf('navigator.clipboard.writeText(code)')), /selectionHere|return/);
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
