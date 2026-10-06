// The light shrinking with a Delve question's clock: as the time to answer
// runs out, the light about you draws in from the edges of the screen,
// faint at first and closing in over the last seconds, and opens out again
// when the question ends or a flare buys more time. Only a look: it changes
// nothing in the game. The ring that shows the clock
// (components/TimerRing.svelte) drives it; the backdrop (lib/backdrop.ts)
// draws it behind the UI, and components/Darkness.svelte a soft shade along
// the very edges of the screen over it.

/** How far the clock has run down, 0 to 1, as last set. */
let target = 0;
/** The same, eased (see pressureLevel), and when it was. */
let level = 0;
let at = -1;
const listeners = new Set<() => void>();

/** Sets how far the clock has run down (0: no question running). */
export function setPressure(v: number) {
  const next = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  if (next === target) return;
  const woke = target === 0;
  target = next;
  if (woke) for (const f of listeners) f();
}

/** Calls `f` when the dark starts coming in, so a drawing loop asleep at 0 wakes up. */
export function onPressure(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * The dark as drawn at `now` (ms, the animation clock): it follows the clock
 * closely while it runs down, and lifts over a second or so.
 */
export function pressureLevel(now = performance.now()): number {
  if (at < 0) at = now;
  const dt = Math.max(0, now - at) / 1000;
  at = now;
  if (level !== target) {
    level += (target - level) * (1 - Math.exp(-dt / (target > level ? 0.25 : 0.55)));
    if (Math.abs(target - level) < 0.001) level = target;
  }
  return level;
}

/** Whether the dark is in or on its way (a drawing loop can sleep when not). */
export const pressing = () => target > 0 || level > 0;

/** One driver of the dark: the most recent to claim it. */
export interface Pressure {
  set(v: number): void;
  release(): void;
}
let owner: Pressure | null = null;

/**
 * Takes over driving the dark (a new question's ring). A driver that has
 * been taken over from, or let go, no longer moves it; letting go clears it.
 */
export function claimPressure(): Pressure {
  const me: Pressure = {
    set: (v) => owner === me && setPressure(v),
    release: () => {
      if (owner !== me) return;
      owner = null;
      setPressure(0);
    },
  };
  owner = me;
  return me;
}

/**
 * How dark it is with the clock `left` of `span` ms: subtle while there is
 * time, clearly closing in over the last `warn` seconds.
 */
export function pressureOf(left: number, span: number, warn = 5): number {
  if (!(span > 0)) return 0;
  const gone = Math.min(1, Math.max(0, 1 - left / span));
  const late = Math.min(1, Math.max(0, 1 - left / (warn * 1000 + 2000)));
  return 0.45 * gone ** 1.6 + 0.55 * late ** 1.5;
}
