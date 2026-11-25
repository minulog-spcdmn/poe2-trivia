// Where the counts go (lib/count.ts), on its own so vite.config.ts's CSP
// can let them through without the browser's modules.
export const COUNTER_ORIGIN = 'https://poe2quest.goatcounter.com';
/** The game's own server the counts go round a blocker through (counts/worker.js; lib/countRelay.ts), or '' for none: a Worker of its own, so a blocker that lists it costs only the counts, never the matchmaking. */
export const COUNTS_ORIGIN: string = 'https://poe2-counts.poe2quest.workers.dev';
