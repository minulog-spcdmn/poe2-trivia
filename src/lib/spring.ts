/**
 * A damped spring, for a motion that eases out of where it was and into
 * where it is sent, and, sent elsewhere mid-way, turns without a jolt (it
 * keeps its speed). Stepped in small fixed steps, so it moves the same on a
 * 60 Hz screen as on a 240 Hz one.
 */
export interface Spring {
  /** Where it is, and how fast it moves (units/s). */
  x: number;
  v: number;
}

/** How quick (rad/s) and how damped (1: no overshoot) a spring is. */
export interface SpringTuning {
  freq: number;
  damping: number;
}

/** The integration step, s: small enough for any refresh rate. */
const STEP = 1 / 480;

/** Moves `s` toward `target` for `dt` seconds (at most 50 ms: a stalled frame doesn't fling it). */
export function stepSpring(s: Spring, target: number, dt: number, { freq, damping }: SpringTuning): void {
  let left = Math.min(0.05, Math.max(0, dt));
  while (left > 0) {
    const h = Math.min(STEP, left);
    s.v += (-freq * freq * (s.x - target) - 2 * damping * freq * s.v) * h;
    s.x += s.v * h;
    left -= h;
  }
}

/** Close enough to `target`, and slow enough, to put it there and stop. */
export const springAtRest = (s: Spring, target: number) => Math.abs(s.x - target) < 0.05 && Math.abs(s.v) < 2;
