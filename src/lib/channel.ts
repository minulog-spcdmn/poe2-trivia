/**
 * Which build this is: the live game at poe2.quest, or the beta at
 * poe2.quest/beta/ (built with VITE_CHANNEL=beta, see .github/workflows/deploy.yml).
 * Optional chaining so the tests, which run outside Vite, see the live build.
 */
export const BETA = import.meta.env?.VITE_CHANNEL === 'beta';

/**
 * The local dev server (npm run dev), or a build made with
 * VITE_CHANNEL=local (the room bot's --local): its rooms and open-room list
 * are its own, so a tab on localhost never meets the live game.
 * VITE_CHANNEL=live npm run dev puts the dev server back with the live rooms.
 */
export const LOCAL = import.meta.env?.VITE_CHANNEL === 'local' || (!!import.meta.env?.DEV && !import.meta.env?.VITE_CHANNEL);
