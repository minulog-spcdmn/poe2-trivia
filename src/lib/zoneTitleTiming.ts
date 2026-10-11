// Delve: when each part of a zone's title card (lib/zoneTitle.ts,
// components/zonecard/ZoneCard.svelte) comes and goes in the plunge into the
// zone, in ms from the plunge's start. Pure, so it can be tested.
//
// The plunge and the zone's sound ('stratum') start together, and the card
// keeps to the sound's beats: the hit (the floor gives way, the bars close
// in) and its long decay, which is the place's (the scene takes the new
// zone's colours as it falls); the lull, where the sigil draws itself and the
// letters gather; the second swell, whose first strong note is where the name
// locks (LOCK) and whose loudest is where its sting rings; and the fade,
// where the card leaves (EXIT) before the cards are dealt (lib/delve.ts
// ZONE_DESCENT_MS), so control comes back as it goes.

import type { Sfx } from './sound.ts';

/** The beats (ms from the plunge's start). */
export const T = {
  /** The letterbox bars slide in, their hairlines drawn after. */
  BARS: 150,
  BARS_MS: 600,
  HAIRS: 550,
  HAIRS_MS: 600,
  /** The scrim darkens the scene behind the card. */
  SCRIM: 200,
  SCRIM_MS: 1000,
  /** The seal's rings sweep round; the sigil's lines draw inner first, then its fine lines, then its hatching. */
  SEAL: 1000,
  SEAL_MS: 600,
  SIGIL: 1150,
  SIGIL_MS: 1000,
  FINE: 1450,
  FINE_MS: 850,
  HATCH: 2300,
  HATCH_MS: 300,
  /** The meta line tracks out, its rules drawn outward. */
  META: 1500,
  META_MS: 500,
  /** The letters start no sooner than this, each taking LETTER (a family may take longer). */
  FIRST: 1700,
  LETTER: 560,
  /** The name locks on the second swell's first strong note. */
  LOCK: 2850,
  SUBTITLE: 3150,
  SUBTITLE_MS: 600,
  NEWS: 3550,
  NEWS_GAP: 120,
  /** The card leaves from EXIT (never later than EXIT_LEAD before the deal) and is gone GONE later. */
  EXIT: 5600,
  EXIT_LEAD: 1400,
  GONE: 900,
  /**
   * When the lock's sound and the sting are started, so their whoosh, thump
   * and ring land on LOCK and the chime on the swell's loudest note (3100).
   */
  LOCK_SFX: 2620,
  STING_SFX: 2600,
  /** Letter ticks closer than this to the one before are left out (the last letter's never). */
  TICK_GAP: 45,
  /** Less time than FULL to the deal: the compact card; less than LEAST: none. */
  FULL: 6000,
  LEAST: 2400,
} as const;

/**
 * How the card plays: in full; held still (reduced motion or the effects
 * off: it fades in whole, holds and fades out); or compact, for a screen
 * that saw the run move on late, with less time to the deal (faded in and
 * out whole, sooner).
 */
export type Mode = 'full' | 'still' | 'compact';

export type Timeline = {
  mode: Mode;
  /** Each letter's start (spaces too, though they never move); empty unless full. */
  starts: number[];
  /** How long each letter takes to come in. */
  letterMs: number;
  /** When the whole card fades in, unless full. */
  showAt: number;
  lock: number;
  exit: number;
  gone: number;
  /** The sounds to book, each at its start. */
  cues: { sfx: Sfx; at: number }[];
};

/**
 * The card's timeline for a name of `name` (its letters), with `budget` ms to
 * the deal, `still` or not, its letters each taking `letterMs`, leaving with
 * the `tint` sound. Null with too little time left for a card at all.
 */
export function timeline(name: string, budget: number, still: boolean, letterMs: number = T.LETTER, tint?: Sfx): Timeline | null {
  if (!(budget >= T.LEAST)) return null;
  const chars = [...name];
  const base = { starts: [] as number[], letterMs, lock: T.LOCK };
  if (budget < T.FULL) {
    const showAt = Math.max(300, Math.min(2450, budget - 2400));
    const exit = budget - 1300;
    const cues = (
      [
        { sfx: 'zoneLock', at: T.LOCK_SFX },
        { sfx: 'zoneSting', at: T.STING_SFX },
      ] as const
    ).filter((c) => c.at > showAt && c.at + 300 < exit);
    return { ...base, mode: 'compact', showAt, lock: Math.max(showAt + 400, Math.min(T.LOCK, exit - 300)), exit, gone: budget - 400, cues: [...cues] };
  }
  const exit = Math.min(T.EXIT, budget - T.EXIT_LEAD);
  const gone = exit + T.GONE;
  const cues: Timeline['cues'] = [
    { sfx: 'zoneLock', at: T.LOCK_SFX },
    { sfx: 'zoneSting', at: T.STING_SFX },
  ];
  if (still) return { ...base, mode: 'still', showAt: T.LOCK - 600, exit, gone, cues };
  const n = chars.length;
  const last = T.LOCK - letterMs;
  const gap = n > 1 ? Math.min(40, Math.max(20, (last - T.FIRST) / (n - 1))) : 0;
  const starts = chars.map((_, i) => last - (n - 1 - i) * gap);
  // A soft tick as each letter lands (three tenths into its entrance), never two too close.
  const ticks: number[] = [];
  chars.forEach((c, i) => {
    if (!c.trim()) return;
    const t = starts[i] + letterMs * 0.3;
    if (ticks.length && t - ticks[ticks.length - 1] < T.TICK_GAP) {
      if (i === n - 1) ticks[ticks.length - 1] = t;
      return;
    }
    ticks.push(t);
  });
  cues.push(...ticks.map((at) => ({ sfx: 'zoneTick' as const, at })));
  if (tint) cues.push({ sfx: tint, at: exit });
  return { ...base, mode: 'full', starts, showAt: 0, exit, gone, cues };
}

/**
 * How bright the light the card casts into the scene is at `ms` (0 to about
 * 0.42): kindling with the sigil, rising as the letters gather, a burst as
 * the name locks, easing to a glow it holds, and out as the card leaves.
 */
export function glowAt(ms: number, tl: Pick<Timeline, 'lock' | 'exit'>): number {
  const { lock, exit } = tl;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
  if (ms < T.SEAL) return 0;
  let k: number;
  if (ms < 2400) k = lerp(0, 0.1, (ms - T.SEAL) / (2400 - T.SEAL));
  else if (ms < lock - 50) k = lerp(0.1, 0.16, (ms - 2400) / Math.max(1, lock - 50 - 2400));
  else if (ms < lock + 80) k = lerp(0.16, 0.42, (ms - lock + 50) / 130);
  else k = 0.22 + 0.2 * Math.exp(-(ms - lock - 80) / 300);
  if (ms > exit) k *= Math.max(0, 1 - (ms - exit) / 700);
  return k;
}

/**
 * When each of a line's pieces is drawn, so a broken line (a sigil's strokes,
 * a rule broken round its ornament) is swept once by one pen: `lengths` the
 * pieces' lengths in drawing order, `from` and `ms` the sweep's start and
 * length. The pen starts quickly and slows to its end (as the rune circle's
 * does, components/ArcaneCircle.svelte). Each piece's delay and duration.
 */
export function drawPlan(lengths: number[], from: number, ms: number): { delay: number; dur: number }[] {
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const when = (y: number) => 1 - Math.sqrt(1 - Math.min(1, Math.max(0, y)));
  let run = 0;
  return lengths.map((len) => {
    const [y0, y1] = [run / total, (run + len) / total];
    run += len;
    return { delay: from + when(y0) * ms, dur: Math.max(0.03 * ms, (when(y1) - when(y0)) * ms) };
  });
}
