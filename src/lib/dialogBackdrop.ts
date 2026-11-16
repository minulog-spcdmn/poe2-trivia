// A dialog's backdrop: `use:dialogBackdrop` on the element behind the box
// ([role="dialog"]) puts it up over the page, dimmed (lib/behindDialog.ts).
//
// Handed how the dialog closes (Closes), it also closes it, and sounds so, for
// every dialog alike: a press beside the box (one that began there too, not a
// slider's drag let go out there) clicks where it pressed, and Escape sounds a
// key's press from the control it stands for (its ✕, its Cancel). Escape is
// the top dialog's, had before anything else on the page (App's keys,
// whatever is under the dialog) but after the settings' wait for a key to
// bind (on the window, in capture), which may take Escape for its own.

import { backdropUp, backdropsUp } from './behindDialog';
import { sfx } from './sound';

/**
 * How a dialog closes: its own close, and the control in it a key's press is
 * heard from (a selector: its ✕, its Cancel). `beside: false`: by Escape
 * alone, not by a press beside the box, for a dialog that comes up by itself
 * (the graphics notice): a click meant for the page it rose over mustn't
 * answer it.
 */
export type Closes = { close: () => void; closer: string; beside?: false };

/** Backdrops whose dialog has been closed (fading out): no longer the one a press or Escape is for. */
const closed = new WeakSet<HTMLElement>();

/** Svelte action for a dialog's backdrop: up over the page, dimming it; handed `closes`, closing it too, and sounding so (see the top). */
export function dialogBackdrop(node: HTMLElement, closes?: Closes) {
  const down = backdropUp(node);
  // Beside the box: the backdrop, or a wrapper the box sits in (not the box,
  // nor what else lies over the backdrop, as the leave dialog's legal links).
  const beside = (t: EventTarget | null) => {
    const box = node.querySelector('[role="dialog"]');
    return t instanceof Node && !box?.contains(t) && (t === node || (!!box && t.contains(box)));
  };
  const shut = () => {
    closed.add(node);
    closes?.close();
  };
  let began = false;
  const press = (e: PointerEvent) => (began = beside(e.target));
  const click = (e: MouseEvent) => {
    if (!closes || closes.beside === false || closed.has(node) || !began || !beside(e.target)) return;
    sfx('click', { from: { x: e.clientX } });
    shut();
  };
  const key = (e: KeyboardEvent) => {
    if (!closes || e.key !== 'Escape' || e.defaultPrevented || e.isComposing || closed.has(node)) return;
    if (backdropsUp().filter((b) => !closed.has(b)).at(-1) !== node) return;
    e.preventDefault();
    e.stopPropagation();
    sfx('key', { from: { from: node.querySelector(closes.closer) } });
    shut();
  };
  node.addEventListener('pointerdown', press);
  node.addEventListener('click', click);
  document.addEventListener('keydown', key, { capture: true });
  return {
    update(next?: Closes) {
      closes = next;
    },
    destroy() {
      document.removeEventListener('keydown', key, { capture: true });
      down();
    },
  };
}
