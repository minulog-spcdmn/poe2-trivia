/**
 * Kicking takes two clicks so a stray tap doesn't remove anyone: the first
 * arms the button ("Kick?") for a few seconds, the second confirms. The second
 * only counts once the first has had a moment to show, or a double click (or
 * a double tap) would arm and confirm in one go. The scoreboard and the lobby
 * both use this.
 */

/** How long an armed kick waits for its second click. */
export const KICK_ARMED_MS = 3000;
/** How long an armed kick ignores clicks, so a double click can't confirm it. */
export const KICK_SETTLE_MS = 350;

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
 * button is armed (null when none is), for the "Kick?" label.
 */
export function kickConfirm(onArmed: (id: string | null) => void, clock: KickClock = realClock) {
  let armed: string | null = null;
  let armedAt = 0;
  let timer: unknown = null;
  const disarm = () => {
    if (timer != null) clock.clearTimeout(timer);
    timer = null;
    armed = null;
    onArmed(null);
  };
  return {
    /** A click on a player's button: true when it confirms the kick. */
    click(id: string): boolean {
      if (armed !== id) {
        if (timer != null) clock.clearTimeout(timer);
        armed = id;
        armedAt = clock.now();
        onArmed(id);
        timer = clock.setTimeout(disarm, KICK_ARMED_MS);
        return false;
      }
      if (clock.now() - armedAt < KICK_SETTLE_MS) return false;
      disarm();
      return true;
    },
    /** Lets go of the pending timer (when the component goes away). */
    dispose() {
      if (timer != null) clock.clearTimeout(timer);
      timer = null;
    },
  };
}
