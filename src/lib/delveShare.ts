import { shownDepth } from './delve.ts';
import { PLAY_URL } from './site.ts';

/** The query a shared link carries: opening it goes straight into Delve (see Home.svelte). */
export const DELVE_LINK_PARAM = 'delve';

/** The link straight into Delve, without its scheme: the live game's, or from the beta the beta's. */
export function delveLink(base = PLAY_URL) {
  const url = new URL(base);
  return `${url.host}${url.pathname}?${DELVE_LINK_PARAM}`;
}

/**
 * What a delver shares from the end screen: how deep they got (together, the
 * team), a dare, and a link straight into Delve. `depth` is the run's own
 * (internal) depth; the text says it as players count it (shownDepth).
 */
export const shareText = (depth: number, together = false, base = PLAY_URL) =>
  together
    ? `We reached depth ${shownDepth(depth)} in Delve together. Can you beat us? ${delveLink(base)}`
    : `I reached depth ${shownDepth(depth)} in Delve. Can you beat me? ${delveLink(base)}`;
