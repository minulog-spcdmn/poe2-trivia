// What is on its way out of the page, still showing as it fades. Svelte makes
// everything with an outro inert as it starts: no clicks, no focus, nothing a
// screen reader reads, and code that looks for what is on the screen skips it.
// WebKit (every browser on an iPhone) restyles all under an element that turns
// inert and repaints each of its compositing layers: a turn's stage, with the
// question's rune circle in it (some forty layers), took 15 to 25 ms of the
// frame after Next for that alone. An element with `use:outWithoutInert` goes
// out the same way by other means, none of which repaints anything under it:
// it takes no clicks (pointer-events, which repainted one layer there), gives
// up the focus, is hidden from screen readers, and is marked as leaving for
// the code that skips what is going (GONE).

/** What is on its way out: made inert by Svelte, or marked leaving here. */
export const GONE = '[inert], [data-leaving]';

/** What an element's own `inert` would do for it as it goes out, done as outWithoutInert does it. */
function goOut(node: HTMLElement) {
  node.dataset.leaving = '';
  node.style.pointerEvents = 'none';
  node.setAttribute('aria-hidden', 'true');
  // (As inert would: the focus can't stay on what can no longer be used.)
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused !== node && node.contains(focused)) focused.blur();
}

/** Back, its outro turned round by an intro (a key changed back). */
function comeBack(node: HTMLElement, style: { pointerEvents: string; hidden: string | null }) {
  delete node.dataset.leaving;
  node.style.pointerEvents = style.pointerEvents;
  if (style.hidden === null) node.removeAttribute('aria-hidden');
  else node.setAttribute('aria-hidden', style.hidden);
}

/**
 * Svelte action: as the element goes out (its out: or transition:), it is
 * marked as leaving rather than made inert. Svelte sets `inert` on it as an
 * outro starts and back as an intro turns it round; here that own property
 * takes those, and the attribute is never set.
 */
export function outWithoutInert(node: HTMLElement) {
  const style = { pointerEvents: node.style.pointerEvents, hidden: node.getAttribute('aria-hidden') };
  let out = false;
  Object.defineProperty(node, 'inert', {
    configurable: true,
    get: () => out,
    set(v: boolean) {
      if (!!v === out) return;
      out = !!v;
      if (out) goOut(node);
      else comeBack(node, style);
    },
  });
  return {
    destroy() {
      // (Its own `inert` again, the element's prototype's.)
      delete (node as { inert?: boolean }).inert;
    },
  };
}
