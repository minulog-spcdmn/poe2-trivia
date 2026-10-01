/**
 * Every notice in the app (someone joined, a turn was skipped, the room
 * closed, an action was refused) goes through here and shows up in the same
 * stack in the bottom right corner. The lost connection to the host is shown
 * there too, but it comes from the session's status (see Toasts.svelte).
 */

/** info: news about the room. warn: something went wrong for someone else. error: it went wrong for you. */
export type ToastKind = 'info' | 'warn' | 'error';

/** The player a notice is about: shown with their avatar, the message (their name) in their colour. No hue: a spectator. */
export interface ToastWho {
  name: string;
  hue?: number;
}

export interface ToastOptions {
  title?: string;
  who?: ToastWho;
}

export interface Toast extends ToastOptions {
  id: number;
  kind: ToastKind;
  message: string;
  /** How long it stays up in all, in ms (its fuse burns down over this). */
  life: number;
  /** The pointer is on it: the fuse and the timer wait. */
  held: boolean;
}

/** How long each kind stays up; errors stay longer, as they often explain why you're back on the start page. */
const LIFETIME: Record<ToastKind, number> = { info: 4500, warn: 6000, error: 9000 };

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  /** Time left when paused, or the deadline (ms since epoch) while running. */
  left: number;
  until: number;
}

class Toasts {
  list = $state<Toast[]>([]);
  /** The oldest toasts give way beyond this many. */
  private max = 4;
  private next = 1;
  private timers = new Map<number, Timer>();

  show(message: string, kind: ToastKind = 'info', opts: ToastOptions = {}) {
    // The same notice again (a double click on a refused action, say) restarts
    // the one already up instead of stacking a copy.
    const same = this.list.find((t) => t.message === message && t.kind === kind && t.who?.name === opts.who?.name);
    if (same) this.dismiss(same.id);
    const toast: Toast = { id: this.next++, kind, message, ...opts, life: LIFETIME[kind], held: false };
    this.list = [...this.list, toast];
    this.trim();
    this.run(toast.id, toast.life);
    return toast.id;
  }

  setMax(max: number) {
    this.max = max;
    this.trim();
  }

  dismiss(id: number) {
    this.clear(id);
    this.list = this.list.filter((t) => t.id !== id);
  }

  /** Holds a toast while the pointer is on it, so it can be read. */
  hold(id: number) {
    const t = this.timers.get(id);
    const toast = this.list.find((o) => o.id === id);
    if (!t || !toast || toast.held) return;
    if (t.handle) clearTimeout(t.handle);
    t.handle = null;
    t.left = Math.max(0, t.until - Date.now());
    toast.held = true;
  }

  release(id: number) {
    const t = this.timers.get(id);
    const toast = this.list.find((o) => o.id === id);
    if (!t || !toast || !toast.held) return;
    toast.held = false;
    this.run(id, t.left);
  }

  private trim() {
    if (this.list.length <= this.max) return;
    this.list = this.list.slice(-this.max);
    for (const id of this.timers.keys()) if (!this.list.some((t) => t.id === id)) this.clear(id);
  }

  private run(id: number, ms: number) {
    this.timers.set(id, { handle: setTimeout(() => this.dismiss(id), ms), left: ms, until: Date.now() + ms });
  }

  private clear(id: number) {
    const t = this.timers.get(id);
    if (t?.handle) clearTimeout(t.handle);
    this.timers.delete(id);
  }
}

export const toasts = new Toasts();
