/** Public address of the game; invite links always point here. */
export const SITE_URL = 'https://poe2.quest/';
export const CREATOR = 'zoe_arcana';

/** Invite link for a room (local dev keeps using the dev server). */
export function inviteUrl(code: string) {
  const base = import.meta.env.DEV ? `${location.origin}${location.pathname}` : SITE_URL;
  return `${base}?room=${code}`;
}
