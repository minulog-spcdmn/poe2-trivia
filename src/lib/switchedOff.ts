// Switches for finding what makes the page slow on a given machine, by
// turning one thing off at a time: ?off=press,webgl in the address. Only on
// the beta and the dev server; the live game ignores them.
//   press   the pressed look of the pointer (lib/ownCursor.ts)
//   cursor  the app's own pointer altogether (the system's instead)
//   webgl   the WebGL backdrop (the CSS one instead)

import { CHANNEL } from './channel';

export type Switch = 'press' | 'cursor' | 'webgl';

const named =
  CHANNEL === 'live' || typeof location === 'undefined'
    ? new Set<string>()
    : new Set(
        // (After the #, too: poe2.quest/beta/#codex?off=press reads as well as ?off=press#codex.)
        [location.search, location.hash.slice(location.hash.indexOf('?') + 1 || location.hash.length)]
          .map((q) => new URLSearchParams(q).get('off') ?? '')
          .join(',')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );

/** Whether `what` is switched off for this page load. */
export const switchedOff = (what: Switch) => named.has(what);
