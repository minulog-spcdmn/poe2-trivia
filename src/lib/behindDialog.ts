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
// The page's layers take the CSS side through `data-behind-dialog` (app.css):
// with no value they darken and blur; 'dim' only darkens (viewport-sized
// layers, whose edges a blur would fade, and light that is soft already);
// 'blur' only blurs (content inside a 'dim' layer). use:portal sets it on
// every overlay it moves, so a new one is dimmed without asking.

import { cornerPx } from './corner';
import { opacityOf } from './opacity';

/** How much the page darkens (as an rgba(0, 0, 0, 0.65) layer over it would). */
export const DIALOG_DIM = 0.65;
/** How much the UI blurs: the blur's standard deviation, CSS px. */
export const DIALOG_BLUR = 3;

const backdrops: HTMLElement[] = [];

/** Svelte action for a dialog's backdrop: moves it to the end of <body> and dims the page while it's there. */
export function dialogBackdrop(node: HTMLElement) {
  document.body.append(node);
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
    box = dialog && rect ? { rect, radius: cornerPx(getComputedStyle(dialog).borderTopLeftRadius, rect.width, rect.height) } : null;
  }
  return box;
}

// The CSS side: the filters `data-behind-dialog` layers apply, as variables on the root.
let raf = 0;
let applied = 0;
function changed() {
  stamp = null;
  if (raf) return;
  const step = () => {
    raf = 0;
    const v = openDialog().amount;
    if (v !== applied) {
      applied = v;
      const root = document.documentElement.style;
      const dim = `brightness(${(1 - DIALOG_DIM * v).toFixed(3)})`;
      const blur = `blur(${(DIALOG_BLUR * v).toFixed(2)}px)`;
      for (const [name, value] of [['', `${dim} ${blur}`], ['-dim', dim], ['-blur', blur]]) {
        if (v > 0) root.setProperty(`--behind-dialog${name}`, value);
        else root.removeProperty(`--behind-dialog${name}`);
      }
    }
    if (backdrops.length || applied > 0) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
