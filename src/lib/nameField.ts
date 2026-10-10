// Turning a typed name down where it was typed (the start page and the hot-seat lobby).

import { refuse } from './fx/moments';
import type { NameRefusal } from './names';
import { toasts } from './toasts.svelte';

/** Shakes and focuses the field, and says why when there's a reason to show. `shake` drives the field's shake class. */
export function refuseName(field: HTMLElement | null, refusal: NameRefusal, shake: (on: boolean) => void) {
  if (refusal.reason) toasts.show(refusal.reason, 'error');
  shake(true);
  if (field) refuse(field);
  setTimeout(() => shake(false), 600);
  field?.focus();
}
