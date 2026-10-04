// The veil over the page while a dialog is open: everything behind it
// darkens, and the UI blurs.
//
// A dark, blurred layer over the page can't do that here. It would darken the
// WebGL backdrop's dithered 8-bit output and round it again, with a third of
// the levels and no dither, which brings back the bands the backdrop is there
// to prevent. And over the effects layer, it would hide the dialog's own
// effects. So each layer veils itself: the backdrop (lib/backdrop.ts) in its
// shader, before it dithers; the UI with a CSS filter (`.veiled` in app.css);
// and the effects layer, which sits above dialogs so their controls light up,
// dims its light outside the dialog (lib/fx/core.ts).
//
// A dialog's backdrop element takes `use:veil`. Its opacity (as it fades in
// and out) sets how far the veil is drawn, and the [role="dialog"] inside it
// is the box the veil leaves clear.

import { opacityOf } from './opacity';

/** How much the veil darkens the page (as an rgba(0, 0, 0, 0.65) layer would). */
export const VEIL_DIM = 0.65;
/** How much it blurs the UI: the blur's standard deviation, CSS px. */
export const VEIL_BLUR = 3;

const backdrops: HTMLElement[] = [];

/** Svelte action for a dialog's backdrop: veils the page while it's there. */
export function veil(node: HTMLElement) {
  backdrops.push(node);
  follow();
  return {
    destroy() {
      backdrops.splice(backdrops.indexOf(node), 1);
      follow();
    },
  };
}

const top = () => backdrops.at(-1);

/** How far the veil is drawn, 0 to 1. */
export function veilAmount(): number {
  const b = top();
  return b?.isConnected ? opacityOf(b) : 0;
}

/** The open dialog, which the veil leaves clear (null when none is open). */
export function veilDialog(): HTMLElement | null {
  return top()?.querySelector<HTMLElement>('[role="dialog"]') ?? null;
}

// The CSS side: `--veil-filter` on the root, which `.veiled` layers apply.
let raf = 0;
let applied = 0;
function follow() {
  if (raf) return;
  const step = () => {
    raf = 0;
    const v = veilAmount();
    if (v !== applied) {
      applied = v;
      const root = document.documentElement.style;
      if (v > 0) root.setProperty('--veil-filter', `brightness(${(1 - VEIL_DIM * v).toFixed(3)}) blur(${(VEIL_BLUR * v).toFixed(2)}px)`);
      else root.removeProperty('--veil-filter');
    }
    if (backdrops.length || applied > 0) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
