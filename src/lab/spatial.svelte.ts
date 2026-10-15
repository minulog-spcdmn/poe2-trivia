// The lab's spatial sound: tuning the game's (lib/spatial.svelte.ts) by ear,
// on the lab's pages (lab.html, spatial.html). Its settings start as the
// chosen mix and are kept, shared by the pages; presets climb a ladder from
// today's sound (every sound centred, in one hall) to the chosen mix, and the
// sounds placed are drawn on a half circle (SpatialControls.svelte).

import { CHOSEN, heard, onPlaced, spatial, spatialMix, type Blip, type Renderer, type Spatial } from '../lib/spatial.svelte';
import { LAB_STORE, readKey, writeKey } from '../lib/storage';

export { heard, spatial, type Renderer };

/** Steps up the ladder. Width, Size and Rooms are left as they are set, to be tried on any of them. */
export const PRESETS: { name: string; hint: string; set: Partial<Spatial> }[] = [
  { name: 'Today', hint: 'Every sound centred in the one hall, as the game played before.', set: { today: true } },
  { name: '1', hint: 'Panning: each sound from where it happens.', set: { today: false, renderer: 'pan', moving: false, far: 0, wideBeds: false, sideReverb: false, crossfeed: false } },
  { name: '2', hint: 'Moving and distance: travelling sparks move; teammates farther off.', set: { today: false, renderer: 'pan', moving: true, far: 0.5, wideBeds: false, sideReverb: false, crossfeed: false } },
  { name: '3', hint: 'Head model and wide ambience: less stuck to one ear, the ambience all round.', set: { today: false, renderer: 'head', moving: true, far: 0.5, wideBeds: true, sideReverb: false, crossfeed: false } },
  { name: '4', hint: 'Crossfeed, for headphones: out of your head and in front of you.', set: { today: false, renderer: 'head', moving: true, far: 0.5, wideBeds: true, sideReverb: false, crossfeed: true } },
  { name: '5', hint: 'Side reverb: the room answers from the sound’s side.', set: { today: false, renderer: 'head', moving: true, far: 0.5, wideBeds: true, sideReverb: true, crossfeed: true } },
  { name: 'Chosen', hint: 'The game’s mix: head model at ±36°, teammates 35% off, moving, Size, wide ambience, rooms and side reverb.', set: { ...CHOSEN } },
  { name: 'HRTF', hint: 'The browser’s binaural panner, for headphones only; compare its tone.', set: { today: false, renderer: 'hrtf', moving: true, far: 0.5, wideBeds: true, sideReverb: true, crossfeed: false } },
];

/** Widths to flip between quickly: the screen's edges heard at 30°, 36° (the game's) and 45°. */
export const WIDTHS = [1 / 3, 0.4, 0.5];

/** Where the settings are kept: the lab's, so its pages share them (the lab, spatial.html). */
const KEY = LAB_STORE + 'spatial';

/** The settings as kept, any that are no more left out; the chosen mix where none are. */
function load(): Spatial {
  try {
    const kept = JSON.parse(readKey(KEY) ?? '{}') as Partial<Spatial>;
    return Object.fromEntries(Object.entries(CHOSEN).map(([k, v]) => [k, typeof kept[k as keyof Spatial] === typeof v ? kept[k as keyof Spatial] : v])) as Spatial;
  } catch {
    return { ...CHOSEN };
  }
}

/** The preset the settings match, if any. */
export function presetOf(s: Spatial) {
  return PRESETS.find((p) => (p.set.today ? s.today : !s.today && Object.entries(p.set).every(([k, v]) => s[k as keyof Spatial] === v)));
}

/** The sounds placed lately, for the half circle (SpatialControls.svelte drops them as they end). */
export type HeardBlip = Blip & { id: number };
export const blips = $state<{ list: HeardBlip[] }>({ list: [] });
let nextBlip = 0;

/** Tunes the game's spatial sound from the lab's settings (after installSpatial), keeps them, and draws what is placed. */
export function tuneSpatial() {
  Object.assign(spatial, load());
  onPlaced((b) => blips.list.push({ ...b, id: nextBlip++ }));
  // A handle for scripts (and the console), as the lab gives its own: the context and the mix, to listen in on.
  Object.defineProperty(window, '__spatialMix', { get: spatialMix, configurable: true });
  $effect.root(() => {
    $effect(() => {
      writeKey(KEY, JSON.stringify(spatial));
    });
  });
}
