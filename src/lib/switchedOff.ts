// Switches for finding what makes the page slow on a given machine, by
// turning one thing off at a time: ?off=press,webgl in the address. Only on
// the beta and the dev server; the live game ignores them.
//   press   the pressed look of the pointer (lib/ownCursor.ts)
//   cursor  the app's own pointer altogether (the system's instead)
//   webgl   the WebGL backdrop (the CSS one instead)
// and, to find which effect makes a moment slow, one kind of effect at a time:
//   bloom   the effects' glow (lib/fx/renderer.ts)
//   rays, flare, outline, ring, flash   those shapes (lib/fx/effects.ts)
//   particles   sparks, embers, glints and the like
//   silhouette  effects shining from behind a picture's outline (they light its box instead)
//   lights  the light the backdrop throws behind the UI (lib/lights.ts)
//   fills   the UI's shadows and fills drawn by CSS, not the backdrop
//   circle  the arcane circle behind a question's art
//   backdraw  the backdrop drawn once a second (fills and shadows by CSS)
//   handover  fills going back to CSS while their element moves or the page
//           scrolls (lib/backdropShadow.ts): they stay with the backdrop
// ?fps shows how quickly frames come (lib/fpsMeter.ts).

import { CHANNEL } from './channel';

export type Switch = 'press' | 'cursor' | 'webgl' | 'bloom' | 'rays' | 'flare' | 'outline' | 'ring' | 'flash' | 'particles' | 'silhouette' | 'lights' | 'handover' | 'fills' | 'backdraw' | 'circle';

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
