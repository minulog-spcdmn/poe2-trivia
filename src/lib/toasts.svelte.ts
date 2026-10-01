/**
 * Every notice in the app (someone joined, a turn was skipped, the room
 * closed, an action was refused) goes through here and shows up in the same
 * stack in the bottom right corner. The lost connection to the host is shown
 * there too, but it comes from the session's status (see Toasts.svelte).
 */

/** info: news about the room. warn: something went wrong for someone else. error: it went wrong for you. */
export type ToastKind = 'info' | 'warn' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/** How long each kind stays up; errors stay longer, as they often explain why you're back on the start page. */
const LIFETIME: Record<ToastKind, number> = { info: 4000, warn: 5500, error: 9000 };
/** The oldest toasts give way beyond this. */
const MAX_TOASTS = 4;

class Toasts {
  list = $state<Toast[]>([]);
  private next = 1;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(message: string, kind: ToastKind = 'info') {
    // The same notice again (a double click on a refused action, say) restarts
    // the one already up instead of stacking a copy.
    const same = this.list.find((t) => t.message === message && t.kind === kind);
    if (same) this.dismiss(same.id);
    const toast = { id: this.next++, kind, message };
    this.list = [...this.list, toast].slice(-MAX_TOASTS);
    for (const id of this.timers.keys()) if (!this.list.some((t) => t.id === id)) this.clear(id);
    this.arm(toast);
    return toast.id;
  }

  dismiss(id: number) {
    this.clear(id);
    this.list = this.list.filter((t) => t.id !== id);
  }

  /** Holds a toast while the pointer is on it, so it can be read. */
  hold(id: number) {
    this.clear(id);
  }

  release(id: number) {
    const toast = this.list.find((t) => t.id === id);
    if (toast && !this.timers.has(id)) this.arm(toast, 2000);
  }

  private arm(toast: Toast, ms = LIFETIME[toast.kind]) {
    this.timers.set(
      toast.id,
      setTimeout(() => this.dismiss(toast.id), ms),
    );
  }

  private clear(id: number) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }
}

export const toasts = new Toasts();
