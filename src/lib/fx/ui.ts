// Effects for every control, installed once (like the UI sounds): sparks and
// a shockwave where a button is pressed (heavier for primary buttons), a few
// embers when the mouse finds a control, glints when a text field takes
// focus, and sparks off the caret while typing. Controls opt out with
// `data-fx="none"`, or keep just the hover embers with `data-fx="hover"` when
// a press starts their own moment (the answers' charge-up); components add
// their own bigger moments on top.

import { fxActive, type Point } from './core';
import { C, embers, flare, glints, outline, puffs, rand, ring, sparks } from './effects';
import { light } from '../lights';

const CONTROL = 'button, a[href], [role="button"], select, input[type="checkbox"], summary';

type Weight = 'heavy' | 'medium' | 'light';

function weightOf(el: Element): Weight {
  if (el.matches('.btn.primary, .btn.big')) return 'heavy';
  if (el.matches('.btn, .option, .tile, .mode-card, .brand')) return 'medium';
  return 'light';
}

function danger(el: Element) {
  return el.matches('.kick, .remove, .kick-inline, .kick.confirm');
}

const scaleC = (c: readonly number[], k: number) => [c[0] * k, c[1] * k, c[2] * k] as const;

/** The press burst. */
export function pressAt(p: Point, el: Element) {
  if (!fxActive()) return;
  const w = weightOf(el);
  const hot = danger(el);
  const colors = hot ? [C.crimson, C.ember] : [C.ember, C.gold, C.whiteHot];
  if (w === 'heavy') {
    sparks(p, { count: 34, speed: [220, 760], colors, life: [0.35, 0.95] });
    ring(p, { radius: 84, thickness: 9, life: 0.55, color: hot ? C.crimson : C.gold, breakup: 0.55 });
    ring(p, { radius: 150, thickness: 4, life: 0.8, color: scaleC(C.ember, 0.5), breakup: 0.8, delay: 0.05 });
    flare(p, { size: 16, streak: 170, life: 0.4, color: hot ? C.crimson : C.gold });
    puffs(el, { count: 6, area: 'edge', color: [0.35, 0.16, 0.04] });
    light(el, { color: hot ? [1, 0.2, 0.1] : [1, 0.62, 0.25], radius: 200, intensity: 0.35, decay: 0.8 });
  } else if (w === 'medium') {
    sparks(p, { count: 18, speed: [160, 520], colors, life: [0.3, 0.75] });
    ring(p, { radius: 52, thickness: 6, life: 0.45, color: hot ? C.crimson : C.gold, breakup: 0.6 });
    light(el, { color: [1, 0.6, 0.25], radius: 150, intensity: 0.25, decay: 0.6 });
  } else {
    sparks(p, { count: 9, speed: [120, 380], colors, life: [0.25, 0.6], size: [0.6, 1.2] });
    ring(p, { radius: 30, thickness: 4, life: 0.35, color: hot ? C.crimson : C.gold, breakup: 0.5, intensity: 0.8 });
  }
}

// ---------- caret sparks ----------

let measureCtx: CanvasRenderingContext2D | null = null;

/** Where the caret of a text input is, in viewport px (best effort). */
function caretPoint(input: HTMLInputElement): Point {
  const r = input.getBoundingClientRect();
  const cs = getComputedStyle(input);
  measureCtx ??= document.createElement('canvas').getContext('2d');
  const ctx = measureCtx!;
  ctx.font = cs.font;
  const spacing = parseFloat(cs.letterSpacing) || 0;
  const text = cs.textTransform === 'uppercase' ? input.value.toUpperCase() : input.value;
  const before = text.slice(0, input.selectionStart ?? text.length);
  const width = (s: string) => ctx.measureText(s).width + spacing * s.length;
  const padL = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
  const padR = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
  let x: number;
  if (cs.textAlign === 'center') {
    const inner = r.width - padL - padR;
    x = r.left + padL + (inner - width(text)) / 2 + width(before);
  } else {
    x = r.left + padL + width(before) - input.scrollLeft;
  }
  return { x: Math.min(r.right - padR, Math.max(r.left + padL, x)), y: r.top + r.height / 2 };
}

// ---------- install ----------

export function installUiFx() {
  // Press: at the pointer for mouse and touch, at the control's centre for keyboard.
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      const el = (e.target as Element | null)?.closest?.(CONTROL);
      if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-fx="none"], [data-fx="hover"]')) return;
      pressAt({ x: e.clientX, y: e.clientY }, el);
    },
    { passive: true, capture: true },
  );
  addEventListener(
    'click',
    (e) => {
      if (e.detail !== 0) return; // real pointer clicks were handled on pointerdown
      const el = (e.target as Element | null)?.closest?.(CONTROL);
      if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-fx="none"], [data-fx="hover"]')) return;
      const r = el.getBoundingClientRect();
      pressAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, el);
    },
    { capture: true },
  );

  // Hover: a few embers lift off the control's top edge.
  let hovered: Element | null = null;
  const lastHover = new WeakMap<Element, number>();
  addEventListener(
    'pointerover',
    (e) => {
      if (e.pointerType !== 'mouse' || !fxActive()) return;
      const el = (e.target as Element | null)?.closest?.(CONTROL) ?? null;
      if (el === hovered) return;
      hovered = el;
      if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-fx="none"]')) return;
      const now = performance.now();
      if (now - (lastHover.get(el) ?? 0) < 400) return;
      lastHover.set(el, now);
      const r = el.getBoundingClientRect();
      const big = weightOf(el) !== 'light';
      embers(r, { count: big ? 5 : 3, area: 'top', rise: [40, 110], life: [0.6, 1.3], size: [0.9, 1.8], scatter: 25 });
      if (weightOf(el) === 'heavy') glints(r, { count: 1, area: 'edge', size: [4, 7] });
    },
    { passive: true },
  );

  // Focus: the field lights up along its outline.
  addEventListener('focusin', (e) => {
    const el = e.target as Element;
    if (!fxActive() || !(el instanceof HTMLInputElement) || !el.matches('.field')) return;
    outline(el, { color: C.gold, width: 8, life: 0.7, intensity: 0.6 });
    glints(el, { count: 2, area: 'edge', size: [3, 6] });
  });

  // Typing: sparks fly off the caret.
  addEventListener('input', (e) => {
    const el = e.target;
    if (!fxActive() || !(el instanceof HTMLInputElement) || el.type === 'checkbox') return;
    const p = caretPoint(el);
    const deleting = (e as InputEvent).inputType?.startsWith('delete');
    sparks(p, {
      count: deleting ? 4 : 7,
      speed: [60, 240],
      angle: -Math.PI / 2,
      spread: Math.PI * 1.2,
      colors: deleting ? [C.ash, C.emberDeep] : [C.ember, C.gold],
      life: [0.2, 0.5],
      size: [0.5, 1],
      gravity: 420,
    });
    if (!deleting && Math.random() < 0.3) glints(p, { count: 1, area: 'centre', size: [2.5, rand(3.5, 5)], life: [0.25, 0.45] });
  });
}
