/**
 * Which build this is: the live game at poe2.quest, or the beta at
 * poe2.quest/beta/ (built with VITE_CHANNEL=beta, see .github/workflows/deploy.yml).
 * Optional chaining so the tests, which run outside Vite, see the live build.
 */
export const BETA = import.meta.env?.VITE_CHANNEL === 'beta';
