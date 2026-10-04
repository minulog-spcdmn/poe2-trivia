import { MediaQuery } from 'svelte/reactivity';

/**
 * Phones: the game pins the scoreboard (with the timer) to the top of the
 * screen, and the reveal's Next button to the bottom, so neither scrolls away
 * while the answers do. Matches the 640px breakpoint in the components' CSS.
 */
export const phone = new MediaQuery('(max-width: 640px)');

const docked = new Set<HTMLElement>();
function setDock() {
  const h = Math.max(0, ...[...docked].map((n) => n.offsetHeight));
  if (h) document.documentElement.style.setProperty('--dock', `${h}px`);
  else document.documentElement.style.removeProperty('--dock');
}

/**
 * Svelte action for a bar fixed to the bottom of the screen: the page keeps
 * its height clear at the very end (App.svelte pads the shell by --dock), so
 * everything, the legal links included, scrolls up above the bar, not under it.
 */
export function dock(node: HTMLElement) {
  docked.add(node);
  const ro = new ResizeObserver(setDock);
  ro.observe(node);
  return {
    destroy() {
      ro.disconnect();
      docked.delete(node);
      setDock();
    },
  };
}
