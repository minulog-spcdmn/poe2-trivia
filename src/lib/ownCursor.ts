// This device's own mouse pointer: the engraved dart the other players see
// it as (pointerArt.ts), gold, or in an online game where this device has a seat in
// its player's colour. Drawn once per colour into images the browser shows as
// the system cursor, so it moves with no lag at all.
//
// The CSS never names these images: vite.config.ts turns every
// `cursor: pointer`, `cursor: default` and `cursor: text` into
// var(--cursor-pointer, pointer), var(--cursor, default) and
// var(--cursor-text, text), and this sets those variables on <html>.
// Pages that don't call installCursor keep the system's cursors.

import { ART, type Art, type ArtName } from './pointerArt';

/** The circle's old gold (docs/arcane-style.md). */
const GOLD = '#d9a45a';
const INK = '#0a0908';
/** Pale gold the lines are lit toward, over something that can be clicked or pressed. */
const PALE = '#fff4e0';

type Look = 'rest' | 'lit' | 'press';

/** `art` as a PNG at `scale` pixels per CSS px. Lit (over something that can be clicked) and pressed, it's gilded and glows brighter. */
function draw(art: Art, color: string, look: Look, scale: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = art.size[0] * scale;
  canvas.height = art.size[1] * scale;
  const g = canvas.getContext('2d');
  if (!g) return '';
  g.scale(scale, scale);
  g.translate(art.hot[0], art.hot[1]);
  const bright = look !== 'rest';
  const stroke = (d: string, w: number) => {
    g.lineWidth = w;
    g.stroke(new Path2D(d));
  };
  g.lineJoin = 'miter';
  g.miterLimit = 12;
  // A dark rim and ground, so it reads on gold as well as on black.
  const ground = new Path2D(art.ground);
  g.fillStyle = 'rgba(10, 9, 8, 0.9)';
  g.fill(ground);
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.stroke(ground);
  for (const l of art.lines) if (!l.fine) stroke(l.d, l.w + 2);
  // The glow under the lines, never on them.
  g.save();
  g.strokeStyle = color;
  g.globalAlpha = bright ? 0.5 : 0.22;
  g.shadowColor = color;
  g.shadowBlur = (bright ? 5 : 2) * scale;
  stroke(art.ground, bright ? 2.6 : 2);
  g.restore();
  // Gilded: a wash of the colour inside, and the lines struck paler.
  if (bright) {
    g.fillStyle = color;
    g.globalAlpha = look === 'press' ? 0.32 : 0.2;
    g.fill(ground);
    g.globalAlpha = 1;
  }
  const ink = bright ? mix(color, PALE, look === 'press' ? 0.55 : 0.35) : color;
  g.strokeStyle = ink;
  for (const l of art.lines) {
    g.lineCap = l.fine ? 'round' : 'butt';
    g.globalAlpha = l.fine ? 0.85 : 1;
    stroke(l.d, l.w);
  }
  return canvas.toDataURL('image/png');
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

/** A cursor value for `name` drawn `look`, in `color`, falling back to the system's `fallback`. */
function cursorValue(name: ArtName, look: Look, color: string, fallback: string) {
  const key = `${name}:${look}:${color}`;
  let v = made.get(key);
  if (v) return v;
  const art: Art = ART[name];
  const one = draw(art, color, look, 1);
  const sharp = setSyntax();
  v = !one
    ? fallback
    : sharp
      ? `${sharp}(url("${one}") 1x, url("${draw(art, color, look, 2)}") 2x) ${art.hot[0]} ${art.hot[1]}, ${fallback}`
      : `url("${one}") ${art.hot[0]} ${art.hot[1]}, ${fallback}`;
  made.set(key, v);
  return v;
}

let color = GOLD;
let pressed = false;
let applied = '';

function apply() {
  if (typeof document === 'undefined') return;
  const key = `${color}:${pressed}`;
  if (key === applied) return;
  applied = key;
  const root = document.documentElement.style;
  root.setProperty('--cursor', pressed ? cursorValue('press', 'press', color, 'default') : cursorValue('rest', 'rest', color, 'default'));
  root.setProperty('--cursor-pointer', pressed ? cursorValue('press', 'press', color, 'pointer') : cursorValue('rest', 'lit', color, 'pointer'));
  root.setProperty('--cursor-text', cursorValue('text', 'rest', color, 'text'));
}

/** Shows the pointer in `color` from now on (old gold when none). */
export function setCursorColor(c: string = GOLD) {
  color = c;
  apply();
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
  apply();
  const press = (on: boolean) => {
    if (pressed === on) return;
    pressed = on;
    apply();
  };
  addEventListener('pointerdown', (e) => e.pointerType === 'mouse' && e.button === 0 && press(true), { capture: true, passive: true });
  addEventListener('pointerup', (e) => e.pointerType === 'mouse' && e.button === 0 && press(false), { capture: true, passive: true });
  // Released outside the window, or never heard: let go at the next sign of it.
  addEventListener('pointermove', (e) => pressed && e.pointerType === 'mouse' && !(e.buttons & 1) && press(false), { passive: true });
  addEventListener('blur', () => press(false));
  addEventListener('dragend', () => press(false));
}
