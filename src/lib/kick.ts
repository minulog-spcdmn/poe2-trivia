/**
 * Kicking takes two clicks so a stray tap doesn't remove anyone: the first
 * arms the button ("Kick") for a few seconds, the second confirms. The second
 * only counts once the first has had a moment to show, or a double click (or
 * a double tap) would arm and confirm in one go. The scoreboard and the lobby
 * both use this.
 */

/** How long an armed kick waits for its second click. */
export const KICK_ARMED_MS = 3000;
/** How long an armed kick ignores clicks, so a double click can't confirm it. */
export const KICK_SETTLE_MS = 350;
/**
 * How long a confirmed kick still reads as armed: the kicked player's chip
 * goes out in its armed colours (its out-transition is shorter than this),
 * not flipping back to rest as it leaves.
 */
export const KICK_LEAVE_MS = 400;

export interface KickClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realClock: KickClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Two-click confirmation for removing a player. `onArmed` hears which player's
 * button is armed (null when none is), for the "Kick" label.
 */
export function kickConfirm(onArmed: (id: string | null) => void, clock: KickClock = realClock) {
  let armed: string | null = null;
  let armedAt = 0;
  let timer: unknown = null;
  const clear = () => {
    if (timer != null) clock.clearTimeout(timer);
    timer = null;
  };
  const disarm = () => {
    clear();
    armed = null;
    onArmed(null);
  };
  return {
    /** A click on a player's button: true when it confirms the kick. */
    click(id: string): boolean {
      if (armed !== id) {
        clear();
        armed = id;
        armedAt = clock.now();
        onArmed(id);
        timer = clock.setTimeout(disarm, KICK_ARMED_MS);
        return false;
      }
      if (clock.now() - armedAt < KICK_SETTLE_MS) return false;
      // Confirmed: nothing is armed any more, but the leaving chip keeps its armed look while it goes.
      clear();
      armed = null;
      timer = clock.setTimeout(() => {
        timer = null;
        onArmed(null);
      }, KICK_LEAVE_MS);
      return true;
    },
    /** Takes an armed kick back (Escape, or a press anywhere else). */
    disarm() {
      if (armed !== null) disarm();
    },
    /** Lets go of the pending timer (when the component goes away). */
    dispose() {
      clear();
    },
  };
}
