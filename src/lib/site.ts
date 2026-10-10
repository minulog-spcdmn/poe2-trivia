import { BETA, LOCAL } from './channel.ts';

/** Public address of the game. */
export const SITE_URL = 'https://poe2.quest/';
/** Where invite and share links point: the live game, or the beta from the beta. */
export const PLAY_URL = BETA ? `${SITE_URL}beta/` : SITE_URL;
export const CREATOR = 'zoe_arcana';
/** Where her name links: her Twitch channel. */
export const CREATOR_URL = 'https://www.twitch.tv/zoe_arcana';
/** What marks her out in the game means, for tooltips, screen readers and her arrival notice. */
export const CREATOR_TITLE = 'Creator of PoE2.Quest';
/** Voluntary tips; nothing in the game is ever locked behind them. */
export const IMPRINT_URL = './impressum.html';
export const PRIVACY_URL = './datenschutz.html';
export const DONATE_URL = 'https://paypal.me/minuW';

/** Invite link for a room (the dev server, and any local build, point to where they are: their rooms are only there). */
export function inviteUrl(code: string) {
  const base = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV || LOCAL ? `${location.origin}${location.pathname}` : PLAY_URL;
  return `${base}?room=${code}`;
}

/** Said where joining a room is decided (the lobby): what joining shares. */
export const IP_NOTE = "Players in a room connect directly, so they can see each other's IP address. Only play with people you're comfortable sharing that with.";
/** The invite screen's: it has already asked the room (lib/rooms.ts probeRoom), which the host saw. */
export const INVITE_IP_NOTE =
  "To show this room, your browser asked its host directly, so the host can see your IP address. Players in a room connect directly, so everyone in it can see each other's. Only play with people you're comfortable sharing that with.";
