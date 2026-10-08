// The light shrinking with a Delve question's clock: as the time to answer
// runs out, the light about you draws in from the edges of the screen,
// faint at first and closing in over the last seconds, and opens out again
// when the question ends or a flare buys more time. Only a look: it changes
// nothing in the game. The ring that shows the clock
// (components/TimerRing.svelte) drives it; the backdrop (lib/backdrop.ts,
// or without WebGL components/DarkTendrils.svelte) draws it behind the UI,
// soft fingers of dark reaching in from every side, and
// components/Darkness.svelte a soft shade along the very edges of the
// screen over it.
//
// How the question went settles it at the reveal (resolveDark): a right
// answer drives the dark back to the edges and away, a miss lets it swallow
// the scene for a beat before it lets go, a ward pulls the player out of it
// sooner, and the last life lost holds it until the run's end.
//
// The dark as drawn (pressureLevel) is the backdrop's own measure (uDark.y):
// 0 is none, CLOCK_PEAK the clock run out, SWALLOW a miss at its fullest,
// and a little under 0 the light of a right answer, brighter than the
// scene's own for a moment.

/** The dark the clock draws as it runs out (strength(1)). */
export const CLOCK_PEAK = 1.45;
/** The dark at its fullest, as a miss swallows the scene (the backdrop dims to 0.3 of its light, and takes no more than about 2.8). */
export const SWALLOW = 2;
/** How far the light of a right answer overshoots: the scene a touch brighter than its own for a moment. */
export const OVERSHOOT = 0.14;

/**
 * The dark drawn for how far the clock has run down, `v` (0 to 1; pressureOf
 * or a flare's): much as it was while there is time, and much deeper over
 * the last seconds, to CLOCK_PEAK.
 */
export function strength(v: number): number {
  const p = Math.min(1, Math.max(0, v));
  return p * (1 + (CLOCK_PEAK - 1) * p * p);
}

/** The dark the clock (or a flare) asks for, as last set (strength). */
let target = 0;
/** The same, eased (see pressureLevel), and when it was. */
let level = 0;
let at = -1;
const listeners = new Set<() => void>();

/** Sets how far the clock has run down, 0 to 1 (0: no question running). */
export function setPressure(v: number) {
  const next = Number.isFinite(v) ? strength(v) : 0;
  if (next === target) return;
  const woke = target === 0;
  target = next;
  if (woke) wakeAll();
}

function wakeAll() {
  for (const f of listeners) f();
}

/** Calls `f` when the dark starts coming in, so a drawing loop asleep at 0 wakes up. */
export function onPressure(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

// ---- how the question went ------------------------------------------------

/**
 * How a question ended for this device's player, as the dark shows it
 * (delveSession.ts darkOutcome): `right`, the light wins; `miss`, a wrong
 * answer or the time-out, the dark takes them; `ward`, a ward took the loss
 * and pulls them out of it; `perish`, the last life lost: the dark holds
 * until it is let go (endHold), as the run ends or the next depth is dealt.
 */
export type DarkOutcome = 'right' | 'miss' | 'ward' | 'perish';

/**
 * A resolution's shape (ms): the dark goes to `peak` over `surge`, holds
 * there `hold`, and lets go over `recede`, `reluctant` lingering before it
 * does; a right answer's light dips it below 0 (`overshoot`) as it settles.
 */
interface Shape {
  peak: number;
  surge: number;
  hold: number;
  recede: number;
  reluctant: boolean;
  overshoot: number;
}

/**
 * Each outcome's shape: as the game moves, and gentler, shorter and with no
 * overshoot when held still (reduced motion, or the effects off). A right
 * answer has no surge: the dark is driven back from where it was at once.
 */
const SHAPES: Record<DarkOutcome, [Shape, Shape]> = {
  right: [
    { peak: 0, surge: 0, hold: 0, recede: 600, reluctant: false, overshoot: OVERSHOOT },
    { peak: 0, surge: 0, hold: 0, recede: 450, reluctant: false, overshoot: 0 },
  ],
  miss: [
    { peak: SWALLOW, surge: 300, hold: 250, recede: 1800, reluctant: true, overshoot: 0 },
    { peak: 1.6, surge: 350, hold: 400, recede: 1000, reluctant: false, overshoot: 0 },
  ],
  ward: [
    { peak: 1.8, surge: 300, hold: 150, recede: 850, reluctant: false, overshoot: 0 },
    { peak: 1.45, surge: 350, hold: 100, recede: 600, reluctant: false, overshoot: 0 },
  ],
  perish: [
    { peak: SWALLOW, surge: 300, hold: 1200, recede: 2400, reluctant: true, overshoot: 0 },
    { peak: 1.6, surge: 350, hold: 800, recede: 1200, reluctant: false, overshoot: 0 },
  ],
};

/** A right answer's light, past the dark it drove off: it brightens the scene from OVERSHOOT_FROM to OVERSHOOT_TO ms. */
const OVERSHOOT_FROM = 300;
const OVERSHOOT_TO = 1050;

const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/**
 * How long (ms) an outcome takes to settle, held at its peak for `hold` ms
 * where it has one (perish: until let go; at least its own).
 */
export function resolutionMs(kind: DarkOutcome, gentle = false, hold?: number): number {
  const sh = SHAPES[kind][gentle ? 1 : 0];
  const end = sh.surge + Math.max(sh.hold, hold ?? 0) + sh.recede;
  return sh.overshoot > 0 ? Math.max(end, OVERSHOOT_TO) : end;
}

/**
 * The dark `t` ms into how a question ended, from `from` (the dark as it
 * was drawn at the reveal), in the backdrop's measure. It starts where the
 * dark was and ends at 0, never jumping on the way:
 * - right: driven back quickly and decisively, gone in 0.6 s, the scene a
 *   touch brighter than its own for a moment (to -OVERSHOOT) as it settles;
 * - miss: it surges in to SWALLOW (0.3 s), holds (0.25 s, and lingers
 *   about as long again as it starts to go), and lets go slowly and
 *   reluctantly (1.8 s);
 * - ward: it surges nearly as far, and is pushed back after a moment (1.3 s
 *   in all);
 * - perish: as a miss, held `hold` ms (at least 1.2 s; Infinity until let go),
 *   then receding over 2.4 s.
 */
export function resolution(kind: DarkOutcome, from: number, t: number, gentle = false, hold?: number): number {
  const sh = SHAPES[kind][gentle ? 1 : 0];
  const start = Number.isFinite(from) ? Math.min(SWALLOW, Math.max(0, from)) : 0;
  const ms = Math.max(0, t);
  let v: number;
  if (ms < sh.surge) {
    // In fast, easing out as it fills the scene (its slope at once, but no jump).
    const k = ms / sh.surge;
    const peak = Math.max(start, sh.peak);
    v = start + (peak - start) * Math.sin((Math.PI / 2) * k);
  } else {
    const peak = sh.surge > 0 ? Math.max(start, sh.peak) : start;
    const held = Math.max(sh.hold, hold ?? 0);
    const k = (ms - sh.surge - held) / sh.recede;
    // Reluctant: it lingers a while before it lets go (k^1.3), so it reads
    // as held at its fullest for about 0.6 s in all, then goes softly.
    v = k <= 0 ? peak : peak * (1 - smooth(sh.reluctant ? Math.min(1, k) ** 1.3 : k));
  }
  if (sh.overshoot > 0 && ms > OVERSHOOT_FROM && ms < OVERSHOOT_TO) {
    v -= sh.overshoot * Math.sin((Math.PI * (ms - OVERSHOOT_FROM)) / (OVERSHOOT_TO - OVERSHOOT_FROM)) ** 2;
  }
  return v;
}

/** How the question that last ended is settling, if it still is. */
let settling: { kind: DarkOutcome; from: number; at: number; gentle: boolean; hold: number } | null = null;

/**
 * The question has ended (its reveal, as the answer is marked right or
 * wrong): the dark settles as it went for this device's player (see
 * resolution), from where it was. `gentle`: held still (reduced motion, or
 * the effects off). A perish holds until endHold.
 */
export function resolveDark(kind: DarkOutcome, gentle = false, now = performance.now()) {
  const from = pressureLevel(now);
  settling = { kind, from, at: now, gentle, hold: kind === 'perish' ? Infinity : 0 };
  // The clock has stopped: what is left of it goes into the resolution.
  level = 0;
  target = 0;
  owner = null;
  wakeAll();
}

/**
 * The reveal is over (the run's end screen, or the next depth dealt): a
 * perish's dark, held until now, lets go (after its own hold at least).
 */
export function endHold(now = performance.now()) {
  const s = settling;
  if (!s || s.hold !== Infinity) return;
  s.hold = Math.max(0, now - s.at - SHAPES.perish[s.gentle ? 1 : 0].surge);
}

/**
 * The dark as drawn at `now` (ms, the animation clock), in the backdrop's
 * measure (from a little under 0 to SWALLOW): it follows the clock closely
 * while it runs down, and lifts over a second or so as it lets go (a
 * dynamite blast, a question ending without its reveal); a question's
 * reveal settles it as it went (resolveDark), the next clock coming in over
 * whatever is left of that.
 */
export function pressureLevel(now = performance.now()): number {
  if (at < 0) at = now;
  // (At most a tenth of a second at a time: a loop waking from sleep, or a
  // tab coming back, eases from where it was rather than jumping.)
  const dt = Math.min(0.1, Math.max(0, now - at) / 1000);
  at = now;
  if (level !== target) {
    level += (target - level) * (1 - Math.exp(-dt / (target > level ? 0.25 : 0.55)));
    if (Math.abs(target - level) < 0.002) level = target;
  }
  let v = level;
  const s = settling;
  if (s) {
    const t = now - s.at;
    if (t >= resolutionMs(s.kind, s.gentle, s.hold)) settling = null;
    else v += resolution(s.kind, s.from, t, s.gentle, s.hold);
  }
  return Math.min(SWALLOW, Math.max(-OVERSHOOT, v));
}

/** Whether the dark is in, on its way or settling (a drawing loop can sleep when not). */
export const pressing = () => target > 0 || level > 0 || settling !== null;

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
  return 0.4 * gone ** 1.6 + 0.6 * late ** 1.35;
}

/** ms the dark takes to draw back as a flare catches (see flareEase). */
export const FLARE_RECEDE_MS = 450;

/**
 * The dark as a flare catches, `since` ms after its light blooms: it holds
 * where it was (`held`), then draws back to `to`, the flare's own
 * (flarePressure), eased in and out, so it never jumps.
 */
export function flareEase(held: number, to: number, since: number): number {
  const k = Math.max(0, since / FLARE_RECEDE_MS);
  if (k >= 1) return to;
  return held + (to - held) * k * k * (3 - 2 * k);
}

/**
 * How dark it is while a flare burns, with `left` (0 to 1) of its time to
 * go: its light pushes the dark far back as it catches, and the dark seeps
 * back in from the edges as it burns down, closing in as it gutters out.
 */
export function flarePressure(left: number): number {
  const gone = Math.min(1, Math.max(0, 1 - left));
  return 0.1 + 0.9 * gone ** 1.8;
}
