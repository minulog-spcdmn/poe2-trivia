import { BETA } from './channel.ts';

/** Public address of the game. */
export const SITE_URL = 'https://poe2.quest/';
/** Where invite links point: the live game, or the beta for a beta room. */
const PLAY_URL = BETA ? `${SITE_URL}beta/` : SITE_URL;
export const CREATOR = 'zoe_arcana';
/** What marks her out in the game means, for tooltips, screen readers and her arrival notice. */
export const CREATOR_TITLE = 'Creator of PoE2.Quest';
/** Voluntary tips; nothing in the game is ever locked behind them. */
export const IMPRINT_URL = './impressum.html';
export const PRIVACY_URL = './datenschutz.html';
export const DONATE_URL = 'https://paypal.me/minuW';

/** Invite link for a room (local dev keeps using the dev server). */
export function inviteUrl(code: string) {
  const base = import.meta.env.DEV ? `${location.origin}${location.pathname}` : PLAY_URL;
  return `${base}?room=${code}`;
}
