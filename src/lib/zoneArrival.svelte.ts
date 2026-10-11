// Delve: a new zone's arrival. As the run moves on into a zone (App.svelte,
// as the plunge into it starts), its title card is set up here: what it says
// (lib/zoneTitle.ts) and when (lib/zoneTitleTiming.ts), from this moment and
// the time left to the deal (DelveState.dealAt). Its sounds are booked on the
// audio clock at once, so they keep to the zone's own sound; App.svelte shows
// the card (components/zonecard/ZoneCard.svelte) while the stage waits for
// its cards. As the name locks, the backdrop's embers take the zone's colour
// and a screen reader is told where the run has come.

import { dealIn, opensZone } from './delve.ts';
import type { GameState } from './game.ts';
import { zoneArrival } from './fx/moments.ts';
import { motion } from './motion.svelte.ts';
import { audioLead, sfx } from './sound.ts';
import { TREATMENTS, zoneTitleAt, type Family, type Treatment, type ZoneTitle } from './zoneTitle.ts';
import { timeline, type Timeline } from './zoneTitleTiming.ts';

export type Arrival = {
  /** The run and depth it is for (`${run}:${depth}`). */
  key: string;
  run: number;
  depth: number;
  /** When it started (performance.now() ms), as heard: the plunge's start, plus the speakers' lag (audioLead). */
  t0: number;
  /** Ms from its start to the deal. */
  budget: number;
  title: ZoneTitle;
  tl: Timeline;
};

export const arrival = $state<{
  /** The card under way, if any. */
  card: Arrival | null;
  /** What a screen reader was last told (Game.svelte reads it out). */
  spoken: string;
  /** The arrival (its key) whose card was shown: one seen in full needs no telling at the deal. */
  shownFor: string;
}>({ card: null, spoken: '', shownFor: '' });

let stops: (() => void)[] = [];
let timers: ReturnType<typeof setTimeout>[] = [];
type Preview = { name?: string; family?: Family; hold?: boolean };
let preview: Preview | null = null;

/**
 * For the tuning page (zones.html): the next arrival shows `name` (instead
 * of its zone's), or with `family`'s motion; `hold`: its card stays until
 * the next (the page keeps its cards from being dealt meanwhile), to be
 * stopped at any moment and looked at.
 */
export function previewNext(o: Preview | null) {
  preview = o;
}

/** Every family's first place, for a preview of a family on another zone. */
const FAMILY_OF = (f: Family): Treatment => Object.values(TREATMENTS).find((t) => t.family === f && !t.variants.length)!;

/**
 * The run moved on into `s.round`: if that opens a zone, its card is set up
 * and its sounds booked. `hostNow`: the host's clock (session.hostNow), for
 * the time left to the deal. `best`: this device's best depth before the run
 * (solo), `group`: a run together (no "Deeper than ever" then).
 */
export function beginArrival(s: GameState, hostNow: number, o: { best: number | null; group: boolean }) {
  endArrival();
  if (!s.delve || !opensZone(s.round)) return;
  const deeper = !o.group && o.best !== null && s.round === o.best + 1;
  let title = zoneTitleAt(s.round, deeper);
  const hold = !!preview?.hold;
  if (preview) {
    if (preview.name) title = { ...title, name: preview.name, sigil: preview.name, spoken: title.spoken.replace(title.name, preview.name) };
    if (preview.family) title = { ...title, treatment: FAMILY_OF(preview.family) };
    preview = null;
  }
  const budget = dealIn(s, hostNow);
  const tl = timeline(title.name, budget, motion.still, title.treatment.letterMs, title.treatment.tint);
  if (!tl) return;
  const key = `${s.delve.startedAt}:${s.round}`;
  const lead = audioLead();
  for (const c of tl.cues) {
    const stop = sfx(c.sfx, { inMs: c.at });
    if (stop) stops.push(stop);
  }
  timers.push(
    setTimeout(() => {
      zoneArrival();
      arrival.spoken = title.spoken;
      arrival.shownFor = key;
    }, tl.lock + lead),
  );
  if (!hold)
    timers.push(
      // Nothing of it rings on over the deal.
      setTimeout(() => stopSounds(), Math.max(0, budget - 60)),
      setTimeout(() => {
        if (arrival.card?.key === key) arrival.card = null;
      }, budget + 200),
    );
  arrival.spoken = '';
  arrival.card = { key, run: s.delve.startedAt, depth: s.round, t0: performance.now() + lead, budget, title, tl };
}

function stopSounds() {
  for (const stop of stops) stop();
  stops = [];
}

/** Any arrival under way is over: its card goes, its sounds stop (the run ended, the game was left). */
export function endArrival() {
  stopSounds();
  for (const t of timers) clearTimeout(t);
  timers = [];
  arrival.card = null;
}
