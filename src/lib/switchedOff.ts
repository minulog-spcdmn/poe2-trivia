// Switches for finding what makes the page slow on a given machine, by
// turning one thing off at a time: ?off=press,webgl in the address. Only on
// the beta and the dev server; the live game ignores them.
//   press   the pressed look of the pointer (lib/ownCursor.ts)
//   cursor  the app's own pointer altogether (the system's instead)
//   webgl   the WebGL backdrop (the CSS one instead)
//   fx      every effect (lib/fx/core.ts), the rest as it is
// and, to find which effect makes a moment slow, one kind of effect at a time:
//   bloom   the effects' glow (lib/fx/renderer.ts)
//   rays, flare, outline, ring, flash   those shapes (lib/fx/effects.ts)
//   particles   sparks, embers, glints and the like
//   silhouette  effects shining from behind a picture's outline (they light its box instead)
//   lights  the light the backdrop throws behind the UI (lib/lights.ts)
//   fills   the UI's shadows and fills drawn by CSS, not the backdrop
//   circle  the arcane circle behind a question's art
//   circles every rune circle: the start page's, the questions', the end screen's, the codex's
//   group   a turn's stage resting a hair short of opaque, a group of its own
//           (Game.svelte): at rest it is opaque, as it was, to weigh what the
//           group costs while the circle in it turns against what it saves
//   backdraw  the backdrop drawn once a second (fills and shadows by CSS)
//   handover  fills going back to CSS while their element moves or the page
//           scrolls (lib/backdropShadow.ts): they stay with the backdrop
// ?fps shows how quickly frames come (lib/fpsMeter.ts). ?bgfps=12 draws the
// backdrop at most 12 times a second (drifting under the battery saver too,
// which otherwise stops it), ?fxfps=8 a streak's fire (and whatever else
// endless and calm the effects hold) 8 (burning under the battery saver too),
// ?fxcap=15 every effect 15 (on under the battery saver too), ?circlefps=12 a
// rune circle's turning, swaying and breathing (components/ArcaneStage.svelte)
// 12 (a touch screen's are 24 without it): what a slower one looks like and
// saves.

import { CHANNEL } from './channel';

export type Switch = 'press' | 'cursor' | 'webgl' | 'fx' | 'bloom' | 'rays' | 'flare' | 'outline' | 'ring' | 'flash' | 'particles' | 'silhouette' | 'lights' | 'handover' | 'fills' | 'backdraw' | 'circle' | 'circles' | 'group';

/** The page's query, before the # and after it (poe2.quest/beta/#codex?off=press reads as well as ?off=press#codex). */
const queries = () => [location.search, location.hash.slice(location.hash.indexOf('?') + 1 || location.hash.length)].map((q) => new URLSearchParams(q));

const named =
  CHANNEL === 'live' || typeof location === 'undefined'
    ? new Set<string>()
    : new Set(
        queries()
          .map((q) => q.get('off') ?? '')
          .join(',')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );

/** Whether `what` is switched off for this page load. */
export const switchedOff = (what: Switch) => named.has(what);

/** ?fps: the frame meter is on (beta and dev only). */
export const fpsMeterOn = () => CHANNEL !== 'live' && typeof location !== 'undefined' && queries().some((q) => q.has('fps'));

/** A rate asked for in the address (frames a second), or null: beta and dev only. */
function rate(name: string): number | null {
  if (CHANNEL === 'live' || typeof location === 'undefined') return null;
  const v = Number(queries().find((q) => q.has(name))?.get(name));
  return Number.isFinite(v) && v > 0 ? v : null;
}
/** ?bgfps=12: the backdrop drawn at most 12 times a second, its own drift with it, to see and measure a slower one (lib/backdrop.ts). */
export const backdropFps = rate('bgfps');
/** ?fxfps=8: the effects drawn at most 8 times a second while all that's alive is endless and calm, a streak's fire (lib/fx/core.ts). */
export const endlessFxFps = rate('fxfps');
/** ?fxcap=15: every effect drawn at most 15 times a second, the battery saver's too (lib/fx/core.ts). */
export const fxCapFps = rate('fxcap');
/** ?circlefps=12: a rune circle's endless motion moved on 12 times a second (a touch screen's 24 without it; components/ArcaneStage.svelte). */
export const circleFps = rate('circlefps');
