// The codes players pass on (the room code in the lobby and the header, the
// sync code) are copied one way wherever they show
// (lib/copyPress.svelte.ts): a tap copies, a long press too while still
// held where the browser lets a page copy then, and where it doesn't (an
// iPhone, which lets a page copy in a tap alone) the long press says to tap.
// A finger selects nothing and no menu comes up, a right click's as anywhere
// else in the game (lib/noMenu.ts). Driven with fake events against a fake
// clipboard; the rest read from the source.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The files that show a code to copy, and the tag each one's code is in. */
const CODES: [file: string, tag: RegExp][] = [
  ['src/components/RoomCodeGlyphs.svelte', /<span class="glyphs"[^>]*\sdata-copy[\s>]/],
  ['src/components/SyncDialog.svelte', /<p class="code"[^>]*\sdata-copy[\s>]/],
  ['src/App.svelte', /<b class="code"[^>]*\sdata-copy[\s>]/],
];

type Listener = (e: unknown) => void;
/** Listeners by event type, and a way to send one of those events to them. */
const listeners = () => {
  const on: Record<string, Listener[]> = {};
  const add = (type: string, f: Listener, opts?: { once?: boolean }) => {
    const run: Listener = opts?.once ? (e) => (remove(type, run), f(e)) : f;
    (on[type] ??= []).push(run);
  };
  const remove = (type: string, f: Listener) => void (on[type] = (on[type] ?? []).filter((x) => x !== f));
  /** Sends a pointer's event (by default a finger's, still at one spot): whether something prevented it. */
  const send = (type: string, e: Record<string, unknown> = {}) => {
    let prevented = false;
    const ev = { type, button: 0, pointerType: 'touch', clientX: 100, clientY: 200, preventDefault: () => (prevented = true), ...e };
    for (const f of [...(on[type] ?? [])]) f(ev);
    return prevented;
  };
  return { on, add, remove, send };
};

const g = globalThis as Record<string, unknown>;
const win = listeners();
g.addEventListener = win.add;
g.removeEventListener = win.remove;
const doc = listeners();
g.document = { addEventListener: doc.add, removeEventListener: doc.remove, execCommand: () => false };
g.HTMLImageElement = class {};

/** The selection on the page: none, or one over the code (its text as it shows). */
let selected: string | null = null;
g.getSelection = () => ({
  isCollapsed: selected === null,
  containsNode: () => selected !== null,
  toString: () => selected ?? '',
  removeAllRanges: () => (selected = null),
});

/** The clipboard: `needsTap` refuses a write outside a tap (an iPhone's), else it takes any (Chrome's). */
const clip = { text: '', writes: 0, needsTap: false, inTap: false };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    clipboard: {
      writeText: async (text: string) => {
        clip.writes++;
        if (clip.needsTap && !clip.inTap) throw new Error('NotAllowedError');
        clip.text = text;
      },
    },
  },
});

const { installNoMenu } = await import('../src/lib/noMenu.ts');
installNoMenu();
const { CopyPress, LONG_MS, STILL_PX, LIT_MS, NOTE_MS, CLICK_MS, TAP_TO_COPY } = await import('../src/lib/copyPress.svelte.ts');

/** Every promise of the press settled (the clipboard's answer). */
const settle = () => new Promise((r) => setImmediate(r));
/** A code attached to a fresh press, on a fresh clipboard. */
function code(shows = 'ABCDEF', needsTap = false) {
  Object.assign(clip, { text: '', writes: 0, needsTap, inTap: false });
  selected = null;
  const el = listeners();
  const press = new CopyPress(() => 'ABCDEF', 'Room code copied');
  press.attach({ textContent: shows, addEventListener: el.add, removeEventListener: el.remove } as unknown as HTMLElement);
  /** A finger letting go, as a browser sends it: the click last (`click`), with a tap's activation. */
  const lift = (click = true) => {
    el.send('pointerup');
    el.send('touchend');
    if (!click) return;
    clip.inTap = true;
    el.send('click');
    clip.inTap = false;
  };
  const tap = () => {
    el.send('pointerdown');
    lift();
  };
  return { press, send: el.send, tap, lift };
}

test('a tap copies the code, and the note over it says so a moment', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { press, tap } = code();
  tap();
  await settle();
  assert.equal(clip.text, 'ABCDEF');
  assert.deepEqual(press.note && { text: press.note.text, touch: press.note.touch }, { text: 'Room code copied', touch: true });
  assert.equal(press.lit, true);
  t.mock.timers.tick(LIT_MS);
  assert.equal(press.lit, false);
  t.mock.timers.tick(NOTE_MS - LIT_MS);
  assert.equal(press.note, null);
});

test('a long press copies while still held where the browser allows it, its menu kept shut', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { press, send } = code();
  send('pointerdown');
  t.mock.timers.tick(LONG_MS);
  await settle();
  assert.equal(clip.text, 'ABCDEF', 'copied before the finger lets go');
  assert.equal(press.note?.text, 'Room code copied');
  // Android's own long press comes after: no menu, and no second copy.
  assert.equal(send('contextmenu'), true);
  send('pointercancel');
  await settle();
  assert.equal(clip.writes, 1);
  // The note stays as long as the finger holds, and a moment after it lets go.
  t.mock.timers.tick(NOTE_MS * 3);
  assert.equal(press.note?.text, 'Room code copied');
  send('touchend');
  t.mock.timers.tick(NOTE_MS);
  assert.equal(press.note, null);
});

test('a long press Android sends before the hold is up copies there and then', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { press, send } = code();
  send('pointerdown');
  assert.equal(send('contextmenu'), true);
  await settle();
  t.mock.timers.tick(LONG_MS);
  await settle();
  assert.equal(clip.writes, 1);
  assert.equal(press.note?.text, 'Room code copied');
});

test('where only a tap may copy (an iPhone), a long press lights the code and copies as it lets go', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { press, send, lift } = code('ABCDEF', true);
  send('pointerdown');
  t.mock.timers.tick(LONG_MS);
  await settle();
  assert.equal(clip.text, '', 'refused while held');
  assert.equal(press.note, null, 'no note while held');
  assert.equal(press.lit, true);
  // Let go: lit on to the click, which copies it.
  send('pointerup');
  send('touchend');
  assert.equal(press.lit, true);
  lift();
  await settle();
  assert.equal(clip.text, 'ABCDEF');
  // (Read afresh: the assertion above narrowed it to null.)
  assert.equal((press as { note: { text: string } | null }).note?.text, 'Room code copied');
});

test('a long press there whose lift brings no click says to tap, and a tap copies', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { press, send, tap, lift } = code('ABCDEF', true);
  send('pointerdown');
  t.mock.timers.tick(LONG_MS);
  await settle();
  lift(false);
  t.mock.timers.tick(CLICK_MS);
  assert.equal(press.lit, false);
  assert.equal(press.note?.text, TAP_TO_COPY);
  t.mock.timers.tick(NOTE_MS);
  assert.equal(press.note, null);
  tap();
  await settle();
  assert.equal(clip.text, 'ABCDEF');
  assert.equal((press as { note: { text: string } | null }).note?.text, 'Room code copied');
});

test('a long press there that turns into a scroll goes dark, saying nothing', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { press, send } = code('ABCDEF', true);
  send('pointerdown');
  t.mock.timers.tick(LONG_MS);
  await settle();
  send('pointercancel');
  t.mock.timers.tick(CLICK_MS + NOTE_MS);
  assert.equal(press.lit, false);
  assert.equal(press.note, null);
  assert.equal(clip.text, '');
});

test('a press that moves is a scroll, not a long press', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { press, send } = code();
  send('pointerdown');
  send('pointermove', { clientY: 200 + STILL_PX + 1 });
  t.mock.timers.tick(LONG_MS);
  await settle();
  send('pointercancel');
  assert.equal(clip.writes, 0);
  assert.equal(press.note, null);
});

test('a finger selects nothing; a mouse copies what its click or drag selected as it lets go', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { press, send } = code();
  send('pointerdown');
  assert.equal(send('selectstart'), true, "a finger's selection is stopped as it starts");
  send('pointerup');
  // A mouse's click selects the whole code (data-copy, app.css): copied as the button comes up, wherever the pointer is by then.
  send('pointerdown', { pointerType: 'mouse' });
  assert.equal(send('selectstart'), false, 'a mouse selects');
  selected = 'ABCDEF';
  win.send('pointerup', { pointerType: 'mouse', clientX: 400 });
  await settle();
  assert.equal(clip.text, 'ABCDEF');
  assert.deepEqual(press.note && { text: press.note.text, touch: press.note.touch, x: press.note.at.clientX }, { text: 'Room code copied', touch: false, x: 400 });
  // And, lit a moment as copied, the selection goes.
  t.mock.timers.tick(LIT_MS);
  assert.equal(selected, null);
  // A click that selected nothing copies nothing; a right click doesn't wait for its button at all.
  clip.writes = 0;
  send('pointerdown', { pointerType: 'mouse' });
  win.send('pointerup', { pointerType: 'mouse' });
  send('pointerdown', { pointerType: 'mouse', button: 2 });
  assert.equal(win.on.pointerup?.length ?? 0, 0);
  await settle();
  assert.equal(clip.writes, 0);
});

test('a copy by hand gives the code itself, hidden for streaming too', () => {
  code('••••••');
  selected = '•••';
  let put = '';
  const prevented = doc.send('copy', { clipboardData: { setData: (_: string, text: string) => (put = text) } });
  assert.equal(put, 'ABCDEF');
  assert.equal(prevented, true);
});

test('no code brings up a menu, held or right clicked; only text fields and links keep theirs', () => {
  /** Something on the page that matches these of the handler's selectors, and none else. */
  const on = (...is: string[]) => ({ closest: (sel: string) => (sel.split(',').some((s) => is.includes(s.trim())) ? {} : null) });
  const menu = (target: unknown) => !win.send('contextmenu', { target });
  assert.equal(menu(on('[data-copy]')), false, 'on a code');
  assert.equal(menu(on()), false, 'on the game');
  for (const field of ['input', 'textarea', '[contenteditable]', 'a[href]']) assert.equal(menu(on(field)), true, field);
  assert.equal(menu(null), false, 'on nothing');
});

test('an image never lifts off as a ghost, the rest drags as it would', () => {
  assert.equal(win.send('dragstart', { target: new (g.HTMLImageElement as new () => object)() }), true);
  assert.equal(win.send('dragstart', { target: {} }), false);
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
  // And the lookup they call it through finds it (a path its glob lacks would quietly install nothing).
  assert.match(readFileSync('src/qa/frame/optional.ts', 'utf8'), /import\.meta\.glob\(\[[^\]]*'\.\.\/\.\.\/lib\/noMenu\.ts'/);
});

test('every code a player copies is marked data-copy and copied by a CopyPress, its note beside it', () => {
  for (const [file, tag] of CODES) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, tag, file);
    assert.match(src, /new CopyPress\(/, file);
    assert.match(src, /<CopyNote [^>]*\/>/, file);
    // Each marked code attached to its press, none copied another way.
    assert.equal(src.match(/\sdata-copy[\s>]/g)?.length, src.match(/\sdata-copy[^>]*\s\{@attach \w+\.attach\}/g)?.length, file);
    assert.doesNotMatch(src, /navigator\.clipboard/, file);
  }
  // And none of the header's room codes is left out.
  const app = readFileSync('src/App.svelte', 'utf8');
  assert.equal(app.match(/Room <b/g)?.length, app.match(/Room <b class="code" data-copy \{@attach codePress\.attach\}>/g)?.length);
});

test('a code is selected by a mouse alone, and nothing turns iOS’s menu back on over it', () => {
  // WebKit (every iPhone browser) goes by -webkit-user-select, which inherits
  // body's none: the codes set it for themselves, once, in app.css.
  const css = readFileSync('src/app.css', 'utf8');
  assert.match(css, /\n\[data-copy\] \{\s*-webkit-user-select: all;\s*user-select: all;\s*\}/);
  assert.match(css, /@media \(hover: none\) \{\s*\[data-copy\] \{\s*-webkit-user-select: none;\s*user-select: none;\s*\}\s*\}/);
  for (const [file] of CODES) assert.doesNotMatch(readFileSync(file, 'utf8'), /touch-callout|user-select/, file);
});
