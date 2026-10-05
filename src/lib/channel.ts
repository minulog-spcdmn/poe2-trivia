/**
 * Which build this is: the live game at poe2.quest, or the beta at
 * poe2.quest/beta/ (built with VITE_CHANNEL=beta, see .github/workflows/deploy.yml).
 * Optional chaining so the tests, which run outside Vite, see the live build.
 */
export const BETA = import.meta.env?.VITE_CHANNEL === 'beta';

/**
 * Start of every key this site keeps in localStorage and sessionStorage. The
 * beta shares the live game's origin, so it keeps its own copies: a codex or
 * save in a format the beta is trying out never reaches the live game's.
 */
export const STORE = BETA ? 'poe2trivia.beta.' : 'poe2trivia.';
