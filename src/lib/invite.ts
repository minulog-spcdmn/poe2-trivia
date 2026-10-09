// Summons: what an invite says and who it comes from. A room's invite link
// carries its host's name (?room=K7Q2PX&from=Ash, site.ts inviteUrl), so the
// start page can greet whoever opens it with "Ash summons you" and join them
// in one tap; and every player at the end of a game can bring a challenger
// with the night's result. Pure (no browser), so the tests can read every
// line; inviteUrl itself stays in site.ts, which looks at the dev server.

import { cleanName, isHeldName, nameProblem } from './names.ts';
import { PLAY_URL } from './site.ts';

export { FROM_PARAM } from './site.ts';

/**
 * The host's name from an invite link, cleaned as a typed name is, or ''
 * when it would not pass as a name (too short, reserved) or is the held one:
 * the link then reads as a plain invite. Anyone can write any name into a
 * link, so it is never trusted for more than a greeting.
 */
export function inviteFrom(raw: string | null): string {
  const name = cleanName(raw);
  if (!name || nameProblem(name, []) || isHeldName(name)) return '';
  return name;
}

/**
 * What a phone's share sheet sends with the room's link: the host summons,
 * a guest invites to the host's room.
 */
export function summonsText(host: string, sender = host): string {
  if (!host) return 'Join my room on PoE2.Quest. Name the unique before the timer burns out.';
  if (!sender || sender === host) return `${host} summons you to a hunt on PoE2.Quest. Name the unique before the timer burns out.`;
  return `${sender} invites you to ${host}'s room on PoE2.Quest.`;
}

/** The site's address without its scheme, for text: 'poe2.quest', or from the beta 'poe2.quest/beta/'. */
export function siteLink(base = PLAY_URL): string {
  const url = new URL(base);
  return url.pathname === '/' ? url.host : `${url.host}${url.pathname}`;
}

export interface NightShare {
  /** Who won the game just over (several, joined: a shared win). */
  winnerName: string;
  /** This device's player won it alone (online). */
  winnerIsMe: boolean;
  /** The winner's points. */
  score: number;
  /** The best points of a player who didn't win (null when nobody else played). */
  runnerUp: number | null;
  /** Games counted tonight, this one included (lib/series.ts). */
  played: number;
  /** Who wears the Crown into the next game ('' when nobody does). */
  champName: string;
  /** This device's player wears it (online). */
  champIsMe: boolean;
  /** Played on one device: the text invites to the site, not to a room. */
  hotSeat: boolean;
  /** The room's summons link (online); the site's address on one device. */
  link: string;
}

/**
 * "Bring a challenger": what a player shares from the end screen. After the
 * first game, the result; from the second on, the Crown and the night so
 * far. Online it seats a friend in the room's next game; on one device it
 * points at the site.
 */
export function nightShare(n: NightShare): string {
  const result = n.runnerUp === null ? '' : n.runnerUp === n.score ? ` ${n.score} to ${n.runnerUp} in sudden death` : ` ${n.score} to ${n.runnerUp}`;
  const crown = n.played >= 2 && !!n.champName;
  if (n.hotSeat)
    return crown
      ? `We played ${n.played} games of PoE2.Quest tonight and ${n.champName} holds the Crown. Your turn: ${n.link}`
      : `We played PoE2.Quest tonight and ${n.winnerName} won${result}. Your turn: ${n.link}`;
  if (crown) return `${n.champIsMe ? 'I hold' : `${n.champName} holds`} the Crown after ${n.played} games of PoE2.Quest. Come and take it: ${n.link}`;
  return `${n.winnerIsMe ? 'I' : n.winnerName} just won${result} at PoE2.Quest. Take a seat for the rematch: ${n.link}`;
}
