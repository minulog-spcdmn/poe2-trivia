// The privacy page, opened from a room in an iPhone's home-screen app
// (installedApp.ts), and only there: a link to a tab of its own leaves the
// app for a Safari sheet with storage of its own, where the page's "Stop
// counting" (countOptOut.ts) would never reach the app. There it opens over
// the game instead (LegalSheet.svelte), in the app's storage, and the room
// stays. Everywhere else, and for the Impressum, links work as they always did.

import { installedApp } from './installedApp';

/** The page shown over the game, or none. */
export const legalSheet = $state<{ url: string | null }>({ url: null });

/** The privacy link's click, for a link that otherwise opens in a tab of its own. */
export function openPrivacy(e: MouseEvent) {
  if (!installedApp() || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  legalSheet.url = (e.currentTarget as HTMLAnchorElement).href;
}

export const closeLegal = () => (legalSheet.url = null);
