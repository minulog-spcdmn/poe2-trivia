// This device's own mouse pointer: the engraved dart the other players see
// it as (pointerArt.ts), gold, or in an online game where this device has a seat in
// its player's colour. Drawn once per colour into images the browser shows as
// the system cursor, so it moves with no lag at all.
//
// The CSS never names these images: vite.config.ts turns every
// `cursor: pointer`, `default`, `not-allowed`, `text`, `zoom-in`, `grab`
// and `grabbing` into var(--cursor-pointer, pointer), var(--cursor,
// default), var(--cursor-disabled, not-allowed), var(--cursor-text, text),
// var(--cursor-zoom, zoom-in), var(--cursor-grab, grab) and
// var(--cursor-grabbing, grabbing), and this sets those variables on <html>.
// Pages that don't call installCursor keep the system's cursors.

import { ART, type Art, type ArtName } from './pointerArt';
import { whenIdle } from './idle';
import { switchedOff } from './switchedOff';

/** The circle's old gold (docs/arcane-style.md). */
const GOLD = '#d9a45a';
const INK = '#0a0908';
/** Pale gold the lines are lit toward, over something that can be clicked or pressed. */
const PALE = '#fff4e0';

/** Lead, as the plainest achievements' seals are struck (lib/metals.ts): disabled is dull metal, with no glow. */
const LEAD = '#a2a7ac';

/**
 * `lit`: over something that can be clicked; `press`: pressed on it; `sunk`:
 * pressed on nothing (lit a little, a soft close glow, nothing washed in);
 * `dull`: disabled.
 */
type Look = 'rest' | 'lit' | 'press' | 'sunk' | 'dull';

/** `art` as a PNG at `scale` pixels per CSS px. Lit (over something that can be clicked) and pressed, it's gilded and glows brighter; dull, it's lead. */
function draw(art: Art, color: string, look: Look, scale: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = art.size[0] * scale;
  canvas.height = art.size[1] * scale;
  // Drawn in memory, not on the GPU: reading a GPU canvas back as a PNG
  // waits behind whatever the GPU is doing (the backdrop's shaders building,
  // as the page opens), tens of ms each for a picture this small.
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return '';
  g.scale(scale, scale);
  g.translate(art.hot[0], art.hot[1]);
  const bright = look === 'lit' || look === 'press';
  if (look === 'dull') color = LEAD;
  const stroke = (d: string, w: number) => {
    g.lineWidth = w;
    g.stroke(new Path2D(d));
  };
  // Sharp claws would throw long mitres: the plain hand's corners are rounded.
  g.lineJoin = art.plain ? 'round' : 'miter';
  g.miterLimit = art.miter ?? 12;
  // A dark rim and ground, so it reads on gold as well as on black.
  const ground = new Path2D(art.ground);
  g.fillStyle = 'rgba(10, 9, 8, 0.9)';
  g.fill(ground);
  g.strokeStyle = INK;
  g.lineWidth = art.plain ? 2.4 : 3;
  g.stroke(ground);
  if (!art.plain) for (const l of art.lines) if (!l.fine) stroke(l.d, l.w + 2);
  // The glow under the lines, never on them (none on dull lead).
  g.save();
  g.strokeStyle = color;
  g.globalAlpha = look === 'dull' || art.plain ? 0 : bright ? 0.5 : look === 'sunk' ? 0.35 : 0.22;
  g.shadowColor = color;
  g.shadowBlur = (bright ? 5 : look === 'sunk' ? 3.2 : 2) * scale;
  stroke(art.ground, bright ? 2.6 : look === 'sunk' ? 2.2 : 2);
  g.restore();
  // Gilded: a wash of the colour inside, and the lines struck paler.
  if (bright && !art.plain) {
    g.fillStyle = color;
    g.globalAlpha = look === 'press' ? 0.32 : 0.2;
    g.fill(ground);
    g.globalAlpha = 1;
  }
  const ink = bright || look === 'sunk' ? mix(color, PALE, look === 'press' ? 0.55 : 0.35) : color;
  g.strokeStyle = ink;
  g.fillStyle = ink;
  for (const l of art.lines) {
    g.lineCap = l.fine ? 'round' : 'butt';
    g.globalAlpha = l.fine ? 0.85 : 1;
    if (l.solid) g.fill(new Path2D(l.d));
    if (l.w) stroke(l.d, l.w);
  }
  return linkTo(canvas.toDataURL('image/png'));
}

/**
 * A picture as a short link (blob:) rather than its data written out: the
 * cursor values the page's styles carry stay a few dozen characters, where
 * three resolutions of data made each several kilobytes, read again by every
 * restyle on every click; and the browser decodes each picture once.
 */
function linkTo(dataUrl: string): string {
  if (typeof URL.createObjectURL !== 'function') return dataUrl;
  try {
    const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  } catch {
    return dataUrl;
  }
}

/** `a` taken `t` of the way to `b` (both #rrggbb). */
function mix(a: string, b: string, t: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)).join(', ')})`;
}

/** How this browser takes a cursor at two resolutions, if it does. */
let imageSet: string | null | undefined;
function setSyntax() {
  if (imageSet !== undefined) return imageSet;
  const probe = (fn: string) => CSS.supports('cursor', `${fn}(url("data:,") 1x) 1 1, auto`);
  imageSet = probe('image-set') ? 'image-set' : probe('-webkit-image-set') ? '-webkit-image-set' : null;
  return imageSet;
}

const made = new Map<string, string>();
/** Each look's own image (its 1x data URL), to tell which look an element shows: made with it. */
const imageOf = new Map<string, string>();

/** A cursor value for `name` drawn `look`, in `color`, falling back to the system's `fallback`. */
function cursorValue(name: ArtName, look: Look, color: string, fallback: string) {
  const key = `${name}:${look}:${color}`;
  let v = made.get(key);
  if (v) return v;
  const art: Art = ART[name];
  const one = draw(art, color, look, 1);
  if (one) imageOf.set(key, one);
  const sharp = setSyntax();
  v = !one
    ? fallback
    : sharp
      ? `${sharp}(url("${one}") 1x, url("${draw(art, color, look, 2)}") 2x, url("${draw(art, color, look, 3)}") 3x) ${art.hot[0]} ${art.hot[1]}, ${fallback}`
      : `url("${one}") ${art.hot[0]} ${art.hot[1]}, ${fallback}`;
  made.set(key, v);
  return v;
}

let color = GOLD;
let applied = '';
/** Whether all of the pointer's looks are set for `applied`, not just the two seen from the start (see apply). */
let whole = false;
/**
 * Whether there's a pointer to draw: something like a mouse, or a mouse seen
 * (see installCursor). A phone has none, and draws nothing.
 */
let wanted = false;
/**
 * Pressed, the pointer changes on the element under it alone (an inline
 * cursor, put back on release), never through the variables on <html>:
 * changing those restyles the whole page, a stall on a long one (the
 * codex's every tile) twice a click.
 */
let dressed: { el: HTMLElement | SVGElement; was: string; priority: string } | null = null;
/** Windows' high contrast and the like: the system's own cursors, which follow the user's settings. */
const forced = typeof matchMedia === 'function' ? matchMedia('(forced-colors: active)') : null;
const VARS = ['--cursor', '--cursor-pointer', '--cursor-disabled', '--cursor-text', '--cursor-zoom', '--cursor-grab', '--cursor-grabbing'];

/**
 * Sets the pointer's looks in its colour. `soon`: only the two seen from the
 * start, the dart and the hand; the rest (each a picture at three
 * resolutions to draw) come with a later call, so the page's first paint
 * doesn't wait on them.
 */
function apply(soon = false) {
  if (typeof document === 'undefined' || switchedOff('cursor') || !wanted) return;
  const root = document.documentElement.style;
  const key = forced?.matches ? 'forced' : color;
  if (key === applied && (whole || soon)) return;
  if (key !== applied) {
    applied = key;
    whole = false;
    undress();
    if (key === 'forced') {
      for (const v of VARS) root.removeProperty(v);
      whole = true;
      return;
    }
    // Over something that can be clicked, the hand (pressed, its finger pushes in: dress, below).
    root.setProperty('--cursor', cursorValue('rest', 'rest', color, 'default'));
    root.setProperty('--cursor-pointer', cursorValue('hover', 'lit', color, 'pointer'));
  }
  if (soon) return;
  whole = true;
  root.setProperty('--cursor-disabled', cursorValue('disabled', 'dull', color, 'not-allowed'));
  root.setProperty('--cursor-text', cursorValue('text', 'rest', color, 'text'));
  // A closer look (an item's details): the hand with a lens. Something to move: the compass's points, drawn in while held.
  root.setProperty('--cursor-zoom', cursorValue('inspect', 'lit', color, 'zoom-in'));
  root.setProperty('--cursor-grab', cursorValue('move', 'rest', color, 'grab'));
  root.setProperty('--cursor-grabbing', cursorValue('moving', 'sunk', color, 'grabbing'));
}

/** The pressed look for what `el` shows: the hand's finger pushed in over something to click (lens and all), the compass drawn in over something to move, the dart sunk a little elsewhere; null for the rest (text, disabled, a page's own). */
function pressedFor(el: Element): string | null {
  const shown = getComputedStyle(el).cursor;
  const is = (key: string) => {
    const image = imageOf.get(`${key}:${color}`);
    return !!image && shown.includes(image);
  };
  if (is('hover:lit')) return cursorValue('press', 'press', color, 'pointer');
  if (is('inspect:lit')) return cursorValue('inspectPress', 'press', color, 'zoom-in');
  if (is('move:rest')) return cursorValue('moving', 'sunk', color, 'grabbing');
  if (is('rest:rest')) return cursorValue('sink', 'sunk', color, 'default');
  return null;
}

/**
 * Shows the pressed pointer on `target` (the element under it), and only
 * there: what it holds keeps the cursor handed down to it (vite.config.ts),
 * so a big one (bare page, a long list's ground) costs no more than a button.
 * Not on <html>: a change on the root restyles the whole page whatever it
 * is (pressed there, on the page's scrollbar say, the pointer stays as is).
 */
function dress(target: EventTarget | null) {
  if (switchedOff('press')) return;
  if (applied === 'forced' || !(target instanceof HTMLElement || target instanceof SVGElement) || target === document.documentElement) return undress();
  if (dressed?.el === target) return;
  undress();
  const v = pressedFor(target);
  if (!v) return;
  dressed = { el: target, was: target.style.getPropertyValue('cursor'), priority: target.style.getPropertyPriority('cursor') };
  target.style.setProperty('cursor', v, 'important');
}

/** Gives the pressed element its own cursor back. */
function undress() {
  if (!dressed) return;
  const { el, was, priority } = dressed;
  dressed = null;
  if (was) el.style.setProperty('cursor', was, priority);
  else el.style.removeProperty('cursor');
}

/** Shows the pointer in `color` from now on (old gold when none). */
export function setCursorColor(c: string = GOLD) {
  // The app sets it on mount, before the first paint, to what it already is.
  if (c === color) return;
  color = c;
  // Only the soon ones at once, the rest once the page is idle: a new colour
  // comes as a lobby opens, and drawing every look there (three resolutions
  // each) held its first frame up some 25 ms.
  apply(true);
  whenIdle(() => apply(), { timeout: 1000 });
  whenIdle(predraw, { timeout: 3000 });
}

/** The colour the pointer is drawn in now. */
export const cursorColor = () => color;

/** The cursor for middle-button scrolling (lib/autoscroll.ts): a dart up or down, or the still seal. */
export const scrollCursor = (way: 'up' | 'down' | 'still') => cursorValue(way, 'rest', color, way === 'still' ? 'all-scroll' : `${way === 'up' ? 'n' : 's'}-resize`);

/**
 * The app's pages: the gold pointer, until a seat in an online game colours
 * it, pressed for as long as the main button is held.
 */
export function installCursor() {
  forced?.addEventListener('change', () => apply());
  const show = () => {
    if (wanted) return;
    wanted = true;
    apply(true);
    whenIdle(() => apply(), { timeout: 1000 });
    // The pressed looks drawn ahead, so the first press doesn't wait on them.
    whenIdle(predraw, { timeout: 3000 });
  };
  // Drawn only where there's a mouse or the like: as soon as one is said to
  // be there (a tablet's trackpad attached), or seen.
  const fine = typeof matchMedia === 'function' ? matchMedia('(any-pointer: fine)') : null;
  if (!fine || fine.matches) show();
  else {
    // Watched only until then.
    const watch = new AbortController();
    const showOnce = () => (watch.abort(), show());
    fine.addEventListener('change', () => fine.matches && showOnce(), { signal: watch.signal });
    addEventListener('pointermove', (e) => e.pointerType === 'mouse' && showOnce(), { passive: true, signal: watch.signal });
  }
  let pressed = false;
  const release = () => {
    pressed = false;
    undress();
  };
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      pressed = true;
      dress(e.target);
    },
    { capture: true, passive: true },
  );
  addEventListener('pointerup', (e) => e.pointerType === 'mouse' && e.button === 0 && release(), { capture: true, passive: true });
  addEventListener(
    'pointermove',
    (e) => {
      if (!pressed || e.pointerType !== 'mouse') return;
      // Released outside the window, or never heard: let go at the next sign of it.
      if (!(e.buttons & 1)) release();
      // Held and moved on: the pressed pointer goes with it, onto what is under it now.
      else dress(e.target);
    },
    { passive: true },
  );
  addEventListener('blur', release);
  addEventListener('dragend', release);
}

/** Draws the pressed looks in the pointer's colour now, ahead of the first press. */
function predraw() {
  if (typeof document === 'undefined' || !wanted || applied === 'forced') return;
  cursorValue('press', 'press', color, 'pointer');
  cursorValue('sink', 'sunk', color, 'default');
  cursorValue('inspectPress', 'press', color, 'zoom-in');
}
