// When a game's end was last heard (its victory or defeat, the fall that ends
// a run), for what arrives while it rings out (lib/achievementToasts.ts). Not
// any fall: your own perishing mid-run, the team still going, sounds the
// same but ends nothing.

let heardAt = -Infinity;

/** A game's end, heard now (lib/session.svelte.ts). */
export const endHeard = () => void (heardAt = performance.now());

/** How long ago (ms) a game's end was last heard. */
export const sinceEndHeard = () => performance.now() - heardAt;
