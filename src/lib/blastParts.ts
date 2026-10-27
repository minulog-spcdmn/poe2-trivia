// Delve's dynamite: the parts a question is blown into (lib/blastAway.ts),
// measured on the question as it stands. Apart, so a test can measure a
// question laid out by hand, without the blast's pictures and effects.

import { unzoomRect } from './stage';

/** A part as measured on the question itself: where it is in its tree, its box, and whether it is inline. */
export type Found = { path: number[]; rect: DOMRect; inline: boolean };

/** Hidden, an element draws nothing of its own (what is in it may, shown again). */
const hidden = (el: Element) => getComputedStyle(el).visibility === 'hidden';
/** How many of `el`'s children are not hidden. */
const shownChildren = (el: Element) => Array.from(el.children).filter((k) => !hidden(k)).length;

/**
 * The parts a question is blown into, measured on `src` before anything on
 * the page changes (so nothing is laid out twice): its children, and the
 * children of anything big (half the question) or a list of answers or
 * pictures (three or more side by side, a tenth of it), whose own frame and
 * fill (`hollow`) go as its parts fly. What is hidden is neither a part nor
 * one of the three: a tooltip holds its verdict's rims (QuestionView), the
 * size of it and hidden until the verdict, which a blast never waits for;
 * counted, they made its plate and art a list, the tooltip's fill went at
 * the blow, and the biggest part, the one cracked, was a rim nobody sees.
 */
export function measure(src: Element, area: number, z: number, path: number[] = [], parts: Found[] = [], hollow: number[][] = []) {
  Array.from(src.children).forEach((k, i) => {
    // (Its place among all the children, the hidden ones too: `at` finds it in the copy by it.)
    const at = [...path, i];
    const r = unzoomRect(k.getBoundingClientRect(), z);
    const a = r.width * r.height;
    if (!a || hidden(k)) {
      // display: contents and the like, or hidden: what is inside it counts.
      if (k.children.length) measure(k, area, z, at, parts, hollow);
      return;
    }
    if (a > area * 0.5 || (a > area * 0.1 && shownChildren(k) >= 3)) {
      hollow.push(at);
      measure(k, area, z, at, parts, hollow);
      return;
    }
    parts.push({ path: at, rect: r, inline: getComputedStyle(k).display === 'inline' });
  });
  return { parts, hollow };
}

/** The element at `path` in `root`'s tree. */
export function at(root: Element, path: number[]): HTMLElement | null {
  let el: Element | undefined = root;
  for (const i of path) el = el?.children[i];
  return (el as HTMLElement) ?? null;
}
