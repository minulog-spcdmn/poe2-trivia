import { MediaQuery } from 'svelte/reactivity';

/**
 * Phones: the game's slim scoreboard, with the timer at its end. Upright
 * (`upright`) the game fits the screen; a narrow window that still scrolls
 * pins the scoreboard to the top and docks the reveal's Next button at the
 * bottom (`dock`), so neither scrolls away. Matches the 640px breakpoint in
 * the components' CSS. The query is written out once, here (the effects
 * layer reads it too, for the toasts' narrow stack: lib/fx/core.ts).
 */
export const PHONE = '(max-width: 640px)';
export const phone = new MediaQuery(PHONE);

/** Wider than a phone or a narrow tablet: the question's art and answers side by side (QuestionView's 761px CSS). */
export const sideBySide = new MediaQuery('(min-width: 761px)');

/** Short desktop windows (13 and 14 inch laptops), as in QuestionView's max-height CSS. */
export const short = new MediaQuery('(min-width: 761px) and (max-height: 820px)');

/**
 * Phones on their side: wide but too short for the game's stack of header,
 * scoreboard, banner and question. The game takes the phone's slim scoreboard
 * (in the header's row), the art and answers stand side by side at any width, and
 * the question is as tall as the screen leaves it, so nothing scrolls (the QA
 * desk's frames check it, src/qa/frame/checks.ts). From 561 wide: no phone
 * on its side is narrower (the smallest, 568), and a window that short and
 * narrower is laid out as the narrow screen it is (the category cards as
 * rows). The components' CSS writes the query out (tests/flatQuery.test.ts
 * holds every copy to it).
 */
export const FLAT = '(orientation: landscape) and (max-height: 500px) and (min-width: 561px)';
export const flat = new MediaQuery(FLAT);

/**
 * Phones upright: narrow but tall. The game fills the screen's height and
 * no more (App.svelte, Game.svelte): the item's art, or the grid of
 * pictures, takes what the rest leaves and gives way first, the answers keep
 * a thumb's height, and Next stands in its row under them rather than in a
 * bar docked over the page, so nothing scrolls (the QA desk's frames check
 * it, src/qa/frame/checks.ts). Never the same screen as `flat`, which is on
 * its side. The components' CSS writes the query out.
 */
export const UPRIGHT = '(orientation: portrait) and (max-width: 640px)';
export const upright = new MediaQuery(UPRIGHT);

/** A full room: more players than the scoreboard's row (and, on a phone on its side, the header's) has room for at full size. */
export const fullRoom = (players: number) => players > 6;

/** A phone either way up (`phone` or `flat`): the game's slim scoreboard. */
export const handheld = new MediaQuery(`${PHONE}, ${FLAT}`);

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
