// The codex has its own address (#codex), so it can be linked to and the
// browser's back button closes it.

import { HashRoute } from './hashRoute.svelte';

export const codexRoute = new HashRoute('#codex', 'codex');

export const openCodex = () => codexRoute.show();
export const closeCodex = () => codexRoute.close();
