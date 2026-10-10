import { MediaQuery } from 'svelte/reactivity';

/**
 * Phones: the game pins the scoreboard (with the timer) to the top of the
 * screen, and the reveal's Next button to the bottom, so neither scrolls away
 * while the answers do. Matches the 640px breakpoint in the components' CSS.
 */
export const phone = new MediaQuery('(max-width: 640px)');

/** Wider than a phone or a narrow tablet: the question's art and answers side by side (QuestionView's 761px CSS). */
export const sideBySide = new MediaQuery('(min-width: 761px)');

/** Short desktop windows (13 and 14 inch laptops), as in QuestionView's max-height CSS. */
export const short = new MediaQuery('(min-width: 761px) and (max-height: 820px)');

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
 * As the bar arrives, the page scrolls `keep` (if any) clear of it.
 */
export function dock(node: HTMLElement, keep?: Element | null) {
  docked.add(node);
  let raf = 0;
  const ro = new ResizeObserver(() => {
    setDock();
    // The first measure only: once the page has room for it, lift `keep` above the bar.
    const target = keep;
    keep = null;
    if (target) {
      raf = requestAnimationFrame(() => {
        const under = target.getBoundingClientRect().bottom - node.getBoundingClientRect().top + 12;
        if (under > 0) window.scrollBy({ top: under, behavior: 'smooth' });
      });
    }
  });
  ro.observe(node);
  return {
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      docked.delete(node);
      setDock();
    },
  };
}
