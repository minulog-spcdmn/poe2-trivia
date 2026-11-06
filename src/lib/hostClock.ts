// A guest's reckoning of its host's clock, for the countdowns it shows. Each
// state message says when the host sent it: the host's clock less this
// device's, short by how long the message took, so the largest is the
// closest, and one late message (queued behind pictures, say) doesn't make
// the countdowns jump. That holds while both clocks only run on. Set (by
// hand, or by the system mending it), or its device asleep, a clock moves
// against its steady one (performance.now), and every sample before says
// nothing of it now: the reckoning starts again from the next.

/** A clock moved this far against its steady one between two samples was set, or its device slept. */
export const CLOCK_SET_MS = 250;

export interface HostClock {
  /** The host's clock less this device's. */
  offset: number;
  /** At the last sample, each device's clock less its steady one: this one's, and the host's (undefined where it didn't say). */
  mine: number;
  host: number | undefined;
}

/** A clock less its steady one: unchanged while it only runs on. */
export const baseOf = (wall: number, steady: number) => wall - steady;

/**
 * `was` with a state message's sample: sent at `sentAt` by the host's clock,
 * its base `hostBase`, arriving at `now` by this device's clock, `steady` by
 * its steady one.
 */
export function sampleHostClock(was: HostClock | null, sentAt: number, hostBase: number | undefined, now: number, steady: number): HostClock {
  const mine = baseOf(now, steady);
  const moved = (a: number | undefined, b: number | undefined) => a !== undefined && b !== undefined && Math.abs(a - b) >= CLOCK_SET_MS;
  const held = !!was && !moved(mine, was.mine) && !moved(hostBase, was.host);
  const sample = sentAt - now;
  return { offset: held ? Math.max(was.offset, sample) : sample, mine, host: hostBase };
}
