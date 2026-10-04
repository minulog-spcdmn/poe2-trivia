import { MediaQuery } from 'svelte/reactivity';

/**
 * Phones: the game pins the scoreboard (with the timer) to the top of the
 * screen, and the reveal's Next button to the bottom, so neither scrolls away
 * while the answers do. Matches the 640px breakpoint in the components' CSS.
 */
export const phone = new MediaQuery('(max-width: 640px)');
