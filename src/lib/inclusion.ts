// A fossil's emblem as what its amber caught (ChooseCategory): painted from
// its mask (lib/amberImage's inclusionImages, lib/amber's paintInclusion)
// at the size it's drawn, its body laid on the emblem (multiplied over the
// amber) and its rim on the emblem's twin (screened), each the element's
// own background, written from here. Looked at again when the element's
// size or the window's changes; until it's painted, the emblem keeps its
// flat colour.

import { inclusionImages } from './amberImage';
import { layoutZoomOf, zoomOf } from './stage';

export type InclusionPart = { url: string; part: 'body' | 'rim'; rare: boolean } | null;

/** Svelte action: `node`'s background, the emblem at `url` as the amber caught it (a rare's or a common's), its `part`. */
export function inclusion(node: HTMLElement, at: InclusionPart) {
  let run = 0;
  let frame = 0;
  const update = async () => {
    const mine = ++run;
    if (!at) return node.style.removeProperty('background-image');
    // Drawn as its mask is: at its mask-size (a fitted item's, in px), or contained in its box.
    const cs = getComputedStyle(node);
    const size = (cs.maskSize || cs.getPropertyValue('-webkit-mask-size')).split(' ').map((v) => (v.endsWith('px') ? parseFloat(v) : NaN));
    const [bw, bh] = size.length === 2 && size[0]! > 0 && size[1]! > 0 ? size : [node.offsetWidth, node.offsetHeight];
    if (!bw || !bh) return;
    const z = layoutZoomOf(node);
    const s = Math.min(4, Math.round(z * devicePixelRatio * 100) / 100);
    // (A sharp face's filter leaves about a third of the grain: stirred three times as hard there.)
    const grain = z / zoomOf(node) > 1.5 ? 3 : 1;
    const got = await inclusionImages(at.url, bw, bh, s, at.rare, grain);
    if (mine !== run) return;
    if (got) node.style.backgroundImage = `url('${got[at.part]}')`;
    else node.style.removeProperty('background-image');
  };
  const later = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => void update());
  };
  later();
  addEventListener('resize', later);
  const seen = new ResizeObserver(later);
  seen.observe(node);
  return {
    update(next: InclusionPart) {
      if (next?.url === at?.url && next?.part === at?.part && next?.rare === at?.rare) return;
      at = next;
      later();
    },
    destroy() {
      run++;
      cancelAnimationFrame(frame);
      removeEventListener('resize', later);
      seen.disconnect();
    },
  };
}
