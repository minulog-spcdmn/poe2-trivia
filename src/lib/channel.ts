/**
 * Which game this build plays in, each with rooms (and an open-room list)
 * and storage of its own, so their tabs never meet:
 * - `live`: the game at poe2.quest.
 * - `beta`: poe2.quest/beta/ (built with VITE_CHANNEL=beta, see .github/workflows/deploy.yml).
 * - `local`: the dev server (npm run dev), and builds made with
 *   VITE_CHANNEL=local (the room bot's --localhost); its rooms are this
 *   machine's alone (VITE_LOCAL_ID, from vite.config.ts).
 *   `npm run dev:live` puts the dev server in the live game instead.
 */
export type Channel = 'live' | 'beta' | 'local';

type Env = { VITE_CHANNEL?: string; DEV?: boolean } | undefined;

/** The channel a build's env names (anything else is a mistake, never quietly the live game); the dev server's is local unless named. */
export function channelOf(env: Env): Channel {
  const named = env?.VITE_CHANNEL;
  if (named === 'live' || named === 'beta' || named === 'local') return named;
  if (named) throw new Error(`VITE_CHANNEL is live, beta or local, not "${named}".`);
  return env?.DEV ? 'local' : 'live';
}

/** How a channel's rooms are named on the matchmaking server (`id`: the local channel's machine). */
export const roomPrefix = (channel: Channel, id = '') => `poe2-trivia-${channel === 'live' ? '' : channel === 'local' ? `local-${id ? `${id}-` : ''}` : `${channel}-`}`;

/**
 * Optional chaining so the tests, which run outside Vite, see the live build.
 * Typed here, as vite.config.ts (checked without Vite's client types) imports this too.
 */
export const CHANNEL = channelOf((import.meta as ImportMeta & { env?: Env }).env);
export const BETA = CHANNEL === 'beta';
export const LOCAL = CHANNEL === 'local';
