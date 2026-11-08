// Where the site keeps Today's unique's rows beside the page, as src/data/dailies.json has them (vite.config.ts dailyRowsFile), for a tab open since an earlier day to look at (lib/staleRows.ts). On its own, so the build's config can read it.
export const LIVE_ROWS = 'dailies.json';
