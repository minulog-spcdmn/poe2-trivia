// Delve: the ground trembling in an Azurite Vein. The view's tremor
// (lib/fx/core.ts setTremor) follows the low end of the vein's sounds,
// worked out from the sounds themselves (lib/bassCurves.ts), so it shakes
// the same heard or muted, at any volume: the tunnel's rumble as it goes,
// in step with where its loop is heard, and its strikes, strains, lost
// lives and a cave-in's crack and thumps as they sound, each as hard as it
// is loud, and a heavy one ringing on a while as it settles. As a strike's
// clock runs down (the dark closing in, lib/darkness.ts) the rumble shakes
// harder, and swells a little with it (lib/sound.ts veinStrain): most of
// the swell is in the shaking. The backdrop feels it
// too (lib/vein.ts veinQuake): the seams flicker and the embers are knocked
// about.

import { feelVein, momentsBass, rumbleBass } from './bassCurves';
import { CLOCK_PEAK, pressureLevel } from './darkness';
import { setTremor } from './fx/core';
import { veinStrain } from './sound';
import { VEIN_AMBIENCE } from './soundDesign';
import { setVeinQuake, veinLevel, veinOn } from './vein';

/**
 * The tunnel's rumble (rumbleBass, dBFS) read as still, and as full: as
 * measured (20 ms windows) it's about -52, -49 swelled, -46 at its loudest
 * tenth.
 */
export const RUMBLE_DB = { still: -58, full: -14 };
/**
 * How far (px) the rumble shakes the view at full, with the clock still to
 * run (calm) and run out (tense): a fifth of a pixel at first, about
 * four fifths at the end.
 */
export const RUMBLE_PX = { calm: 1.5, tense: 4 };
/**
 * The moments (momentsBass, dBFS) read as still, and as full: as measured,
 * a cave-in about -18 over its first third of a second, -28 by half a
 * second, -40 by a second; a strain's boom and a lost life's thump about
 * -35; a strike about -40.
 */
export const MOMENT_DB = { still: -50, full: -18 };
/** How far (px) a moment shakes the view at full, however much time is left: a cave-in's crack. */
export const MOMENT_PX = 4.2;
/** How fast (s) a level felt lets go: the bass's thumps rise at once and settle over this. */
const SETTLE = 0.12;
/** And how much longer (s) a moment's settles, at full: a heavy blow rings on. */
const RING = 0.8;

let on = false;
/** The rumble's level and the moments' as felt last frame, and when (see felt). */
const rumbleHeld = { level: 0, at: -1 };
const momentsHeld = { level: 0, at: -1 };

/** In a vein or not (App): the ground starts to tremble as it's entered, and stops once its scene has eased out. */
export function veinTremor(dug: boolean) {
  if (!dug || on) return;
  on = true;
  feelVein(true);
  setTremor(tremor);
}

function tremor(now: number): number | null {
  const vein = veinLevel(now);
  if (vein === 0 && !veinOn()) {
    on = false;
    rumbleHeld.level = momentsHeld.level = 0;
    rumbleHeld.at = momentsHeld.at = -1;
    feelVein(false);
    veinStrain(0);
    setVeinQuake(0);
    return null;
  }
  // How far the clock has run down, as the dark shows it (a miss's swallow held at the top).
  const strain = Math.min(1, Math.max(0, pressureLevel(now) / CLOCK_PEAK));
  const swell = veinOn() ? strain : 0;
  veinStrain(swell);
  const rumble = felt(rumbleHeld, read(rumbleBass(now, VEIN_AMBIENCE.swell.db * swell), RUMBLE_DB), now, 0);
  const moments = felt(momentsHeld, read(momentsBass(now), MOMENT_DB), now, RING);
  setVeinQuake(vein * Math.max(rumble, moments));
  return vein * (rumble * (RUMBLE_PX.calm + (RUMBLE_PX.tense - RUMBLE_PX.calm) * strain * strain) + moments * MOMENT_PX);
}

/** A level of bass (dBFS) as 0 to 1 between `still` and `full`. */
function read(db: number, { still, full }: { still: number; full: number }): number {
  return Math.min(1, Math.max(0, (db - still) / (full - still)));
}

/** A level as felt: up at once, down over SETTLE (and `ring` more at full), so the shaking doesn't flicker with every wave. */
function felt(held: { level: number; at: number }, level: number, now: number, ring: number): number {
  const dt = held.at < 0 ? 0 : Math.max(0, now - held.at) / 1000;
  held.at = now;
  held.level = Math.max(level, held.level * Math.exp(-dt / (SETTLE + ring * held.level)));
  return held.level;
}
