// The settings page has its own address (#settings), as the codex has
// (codexRoute.svelte.ts).

import { HashRoute } from './hashRoute.svelte';

export const settingsRoute = new HashRoute('#settings', 'settings');

export const openSettings = () => settingsRoute.show();
export const closeSettings = () => settingsRoute.close();
