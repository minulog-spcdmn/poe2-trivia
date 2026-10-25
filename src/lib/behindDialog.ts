// The page behind an open dialog: it darkens, and the UI blurs.
//
// A dark, blurred layer over the page can't do that here. It would darken the
// WebGL backdrop's dithered 8-bit output and round it again, with a third of
// the levels and no dither, which brings back the bands the backdrop is there
// to prevent. And over the effects layer, it would hide the dialog's own
// effects. So each layer darkens itself: the backdrop (lib/backdrop.ts) in its
// shader, before it dithers; the UI with a CSS filter; and the effects layer,
// which sits above dialogs so their controls light up, dims its light outside
// the dialog and hides the page's light behind it (lib/fx/core.ts).
//
// A dialog's backdrop element takes `use:dialogBackdrop`, which also moves it
// to the end of <body>. Its opacity (as it fades in and out) sets how far the
// page is dimmed, and the [role="dialog"] inside it is the box the effects
// layer leaves clear.
//
// The page's layers are marked `data-behind-dialog`: with no value they
// darken and blur; 'dim' only darkens (viewport-sized layers, whose edges a
// blur would fade, and light that is soft already); 'blur' only blurs
// (content inside a 'dim' layer). use:portal sets it on every overlay it
// moves, so a new one is dimmed without asking. Each marked layer gets its
// filter inline, frame by frame as the dialog fades: not as variables on
// <html>, whose every change restyles the whole page (on a long one, the
// codex with its every tile, a stall each frame of the fade).
//
// While a dialog is all the way in, <html> has `data-dialog-up`, for what the
// page leaves out behind it, dimmed to a third and blurred, where it wouldn't
// show (the codex's tile shadows, Codex.svelte). It comes as the fade-in ends
// and goes as the fade-out starts, so nothing changes in plain sight.

import { cornerOnScreen } from './corner';
import { opacityOf } from './opacity';
import { zoomOf } from './stage';

/** How much the page darkens (as an rgba(0, 0, 0, 0.65) layer over it would). */
export const DIALOG_DIM = 0.65;
/** How much the UI blurs: the blur's standard deviation, CSS px. */
export const DIALOG_BLUR = 3;

const backdrops: HTMLElement[] = [];

/** Svelte action for a dialog's backdrop: moves it to the end of <body>, at the page's scale, and dims the page while it's there. */
export function dialogBackdrop(node: HTMLElement) {
  document.body.append(node);
  // Out of the app's shell, so scaled here as the shell is on large windows
  // (lib/stage.ts): every dialog at the page's scale, whoever writes it.
  node.style.zoom = 'var(--stage-zoom, 1)';
  backdrops.push(node);
  changed();
  return {
    destroy() {
      backdrops.splice(backdrops.indexOf(node), 1);
      node.remove();
      changed();
    },
  };
}

export type OpenDialog = {
  /** How far the page is dimmed, 0 to 1. */
  amount: number;
  /** The dialog's backdrop, null when none is open. */
  backdrop: HTMLElement | null;
};

const NONE: OpenDialog = { amount: 0, backdrop: null };

// Read once per frame, however many layers ask: every caller in a frame sees
// document.timeline's same time. (Where it isn't available, every call reads.)
let stamp: number | null = null;
let open = NONE;
let box: { rect: DOMRect; radius: number } | null | undefined;

function frame(): number | null {
  const t = typeof document !== 'undefined' ? document.timeline?.currentTime : null;
  return typeof t === 'number' ? t : null;
}

function fresh() {
  const t = frame();
  if (t !== null && t === stamp) return;
  stamp = t;
  box = undefined;
  const b = backdrops.at(-1);
  open = b?.isConnected ? { amount: opacityOf(b), backdrop: b } : NONE;
}

/** The open dialog, if any, and how far it dims the page. */
export function openDialog(): OpenDialog {
  fresh();
  return open;
}

/** The open dialog's box and corner radius (CSS px), or null when none is open. */
export function dialogBox(): { rect: DOMRect; radius: number } | null {
  fresh();
  if (box === undefined) {
    const dialog = open.backdrop?.querySelector<HTMLElement>('[role="dialog"]');
    const rect = dialog?.getBoundingClientRect();
    // Its radius is in its own px, the box on screen: the stage's zoom (lib/stage.ts) between them.
    const z = dialog ? zoomOf(dialog) : 1;
    box = dialog && rect ? { rect, radius: cornerOnScreen(getComputedStyle(dialog).borderTopLeftRadius, rect.width, rect.height, z) } : null;
  }
  return box;
}

/** The filter a marked layer takes with the page dimmed `v` of the way (0: none), by its mark. */
export function behindFilter(mark: string, v: number): string {
  if (v <= 0) return '';
  const dim = `brightness(${(1 - DIALOG_DIM * v).toFixed(3)})`;
  const blur = `blur(${(DIALOG_BLUR * v).toFixed(2)}px)`;
  return mark === 'dim' ? dim : mark === 'blur' ? blur : `${dim} ${blur}`;
}

/** The layers filtered last, so they're let go of as the dialog goes (or when one leaves the page meanwhile). */
let filtered = new Set<HTMLElement | SVGElement>();
/**
 * The filter each was given, as written: the browser reads a filter back in
 * its own words (brightness(0.35) blur(3px) for brightness(0.350) blur(3.00px)),
 * so asked of el.style it never matched, and every frame of an open dialog
 * set it again.
 */
const wrote = new WeakMap<HTMLElement | SVGElement, string>();

/** Each marked layer's filter, for the page dimmed `v` of the way: written only where it changes. */
function filterLayers(v: number) {
  const now = new Set<HTMLElement | SVGElement>();
  if (v > 0)
    for (const el of document.querySelectorAll<HTMLElement | SVGElement>('[data-behind-dialog]')) {
      now.add(el);
      const f = behindFilter(el.dataset.behindDialog ?? '', v);
      if (wrote.get(el) !== f) {
        el.style.filter = f;
        wrote.set(el, f);
      }
    }
  for (const el of filtered)
    if (!now.has(el)) {
      el.style.removeProperty('filter');
      wrote.delete(el);
    }
  filtered = now;
}

let up = false;
/** <html>'s data-dialog-up, for the page dimmed `v` of the way: only on a dialog all the way in. */
function markUp(v: number) {
  if (v >= 1 === up) return;
  up = v >= 1;
  document.documentElement.toggleAttribute('data-dialog-up', up);
}

let raf = 0;
let applied = 0;
function changed() {
  stamp = null;
  if (raf) return;
  const step = () => {
    raf = 0;
    const v = openDialog().amount;
    // Every frame while a dialog is up: a layer moved onto the page meanwhile (a toast) is dimmed too.
    if (v !== applied || backdrops.length) {
      applied = v;
      filterLayers(v);
    }
    markUp(v);
    if (backdrops.length || applied > 0) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
