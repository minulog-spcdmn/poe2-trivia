// Turning a typed name down where it was typed (the start page and the hot-seat lobby).

import { refuse } from './fx/moments';
import type { NameRefusal } from './names';
import { pointerClicked, sfx } from './sound';
import { toasts } from './toasts.svelte';

/**
 * A form's press, heard as it lands (`e` its submit). Its submit button opts
 * out of the page's click (data-sfx="none"), so a form turned down is heard
 * refused in place of it (refuseName, a code too short), and one that goes
 * clicks here, from the button pressed: a key's press for one sent with
 * Enter, not the mouse's click. Called without one (New game going straight
 * to the room), the button clicked has been heard already.
 */
export function pressed(e: Event | undefined) {
  if (e instanceof SubmitEvent) sfx(pointerClicked() ? 'click' : 'key', { from: { from: e.submitter ?? (e.target as Element | null) } });
}

/** Shakes and focuses the field, and says why when there's a reason to show. `shake` drives the field's shake class. */
export function refuseName(field: HTMLElement | null, refusal: NameRefusal, shake: (on: boolean) => void) {
  sfx('refuse', { from: { from: field } });
  if (refusal.reason) toasts.show(refusal.reason, 'error');
  shake(true);
  if (field) refuse(field);
  setTimeout(() => shake(false), 600);
  field?.focus();
}
