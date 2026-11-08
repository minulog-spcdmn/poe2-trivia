// What is on its way out of the page, still showing as it fades. Svelte makes
// everything with an outro inert as it starts: no clicks, no focus, nothing a
// screen reader reads, and code that looks for what is on the screen skips it.
// WebKit (every browser on an iPhone) restyles all under an element that turns
// inert and repaints each of its compositing layers: a turn's stage, with the
// question's rune circle in it (some forty layers), took 15 to 25 ms of the
// frame after Next for that alone. An element with `use:outWithoutInert` goes
// out the same way by other means, none of which repaints anything under it:
// it takes no presses or hovers, gives up the focus, is hidden from screen
// readers, and is marked as leaving for the code that skips what is going
// (GONE). Presses and hovers are stopped as they come down to it rather than
// by pointer-events, which is inherited as inert is: Chrome restyled all under
// it for that (the lobby's 222 elements, 5 to 7 ms of Begin's click, #331) and
// WebKit repainted a layer.

/** What is on its way out: made inert by Svelte, or marked leaving here. */
export const GONE = '[inert], [data-leaving]';

/** The elements on their way out whose focus and screen readers are let go of in the next animation frame (goOut). */
const letGo = new Map<HTMLElement, number>();

/**
 * What what is going takes none of: a press (a button's, a card's, a key's
 * on what holds the focus) and a hover (a control's sound and embers, a
 * card's fire, a tooltip), as inert would. Not a move, which the others
 * follow this player's pointer by (PeerCursors, at the window).
 */
const TAKEN = [
  ...['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'keydown', 'keyup'],
  ...['pointerover', 'pointerenter', 'mouseover', 'mouseenter'],
];

/** A press or a hover on what is going, stopped before it reaches anything in it (a capture listener on the element). */
function stop(e: Event) {
  e.stopPropagation();
  e.preventDefault();
}

/** What an element's own `inert` would do for it as it goes out, done as outWithoutInert does it. */
function goOut(node: HTMLElement) {
  node.dataset.leaving = '';
  for (const type of TAKEN) node.addEventListener(type, stop, true);
  // As inert would: the focus can't stay on what can no longer be used (the
  // card just picked). Let go first: Chrome won't hide from screen readers
  // what holds the focus, and warns of it. In the frame's animation frame,
  // not as the outro starts: a blur has the browser lay the page out, and
  // there the next screen had just mounted, so it was laid out in the middle
  // of being made and again once it was (a pick's frame at 4K, traced:
  // 7 to 21 ms, #331). There the backdrop's reads have laid it out already.
  if (letGo.has(node)) return;
  letGo.set(
    node,
    requestAnimationFrame(() => {
      letGo.delete(node);
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && node.contains(focused)) focused.blur();
      node.setAttribute('aria-hidden', 'true');
    }),
  );
}

/** Back, its outro turned round by an intro (a key changed back). */
function comeBack(node: HTMLElement, hidden: string | null) {
  cancelAnimationFrame(letGo.get(node) ?? 0);
  letGo.delete(node);
  delete node.dataset.leaving;
  for (const type of TAKEN) node.removeEventListener(type, stop, true);
  if (hidden === null) node.removeAttribute('aria-hidden');
  else node.setAttribute('aria-hidden', hidden);
}

/**
 * Svelte action: as the element goes out (its out: or transition:), it is
 * marked as leaving rather than made inert. Svelte sets `inert` on it as an
 * outro starts and back as an intro turns it round; here that own property
 * takes those, and the attribute is never set.
 */
export function outWithoutInert(node: HTMLElement) {
  const hidden = node.getAttribute('aria-hidden');
  let out = false;
  Object.defineProperty(node, 'inert', {
    configurable: true,
    get: () => out,
    set(v: boolean) {
      if (!!v === out) return;
      out = !!v;
      if (out) goOut(node);
      else comeBack(node, hidden);
    },
  });
  return {
    destroy() {
      // (Its own `inert` again, the element's prototype's.)
      delete (node as { inert?: boolean }).inert;
    },
  };
}
