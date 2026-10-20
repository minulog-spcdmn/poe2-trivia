// The shell's measured heights (--header-h, --legal-h: App.svelte) are set
// on the root, where a new value restyles the whole page (on the codex's
// five hundred tiles some 20 ms each). So App writes them only while a
// component that reads them shows, holding the latest meanwhile. A
// component whose styles read either calls readsShellHeights() as it's set
// up (tests/shellHeights.test.ts keeps that so).

import { onMount } from 'svelte';

let readers = $state(0);

/** In a component that reads --header-h or --legal-h: keeps them current while it shows. */
export function readsShellHeights() {
  onMount(() => {
    readers++;
    return () => void readers--;
  });
}

/** Whether a component showing reads them. */
export const shellHeightsRead = () => readers > 0;
