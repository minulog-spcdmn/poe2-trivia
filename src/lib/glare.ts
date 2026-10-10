// The light inside an answer that follows the mouse (QuestionView's answers,
// Today's unique's): its CSS reads --gx and --gy, the pointer in the answer's
// own px.

import { zoomOf } from './stage';

/** Pointer handler: moves the answer's light to the pointer (a mouse only). */
export function glare(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return;
  const el = e.currentTarget as HTMLElement;
  const r = el.getBoundingClientRect();
  // On screen, so undone of the stage's zoom (lib/stage.ts) to land in the answer's own px.
  const z = zoomOf(el);
  el.style.setProperty('--gx', `${((e.clientX - r.left) / z).toFixed(0)}px`);
  el.style.setProperty('--gy', `${((e.clientY - r.top) / z).toFixed(0)}px`);
}
