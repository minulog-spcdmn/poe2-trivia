import type { Plugin } from 'vite';
import { weaveCss } from './src/lib/weave.ts';

/** What the name plate imports for its weave (components/NamePlate.svelte). */
export const WEAVE_MODULE = 'virtual:plate-weave.css';
const RESOLVED = '\0plate-weave.css';

/**
 * The name plate's weave (lib/weave.ts), worked out as the app is built or
 * served, not on the page: a stylesheet of one rule, its class laying the
 * tile over the plate's field. It comes with the screens that show a plate
 * (the game's, the Codex), as their own CSS does, so the start page doesn't
 * carry it. (On an iPhone working the tile out held the page 61 to 68 ms,
 * in the frames Begin brings the game's screen in.)
 */
export function weaveTile(): Plugin {
  return {
    name: 'weave-tile',
    resolveId: (id) => (id === WEAVE_MODULE ? RESOLVED : undefined),
    load: (id) => (id === RESOLVED ? weaveCss() : undefined),
  };
}
