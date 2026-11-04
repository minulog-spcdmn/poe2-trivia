// Whether a name shows as the creator's (the foil, the gilded avatar, the
// title): the held name (names.ts), and only where it's proven. In an online
// room, only the one the host let in with the owner key's signature
// (session.svelte.ts creatorName); in hot-seat, and outside a room, it's
// this device's own word.

import { isHeldName } from './names';
import { ownerUnlocked } from './ownerKey';
import { session } from './session.svelte';
import { LAB, QA_FRAME } from './storage';

export function creatorShown(name: string): boolean {
  // The effects lab and the QA desk's frames (dev and beta builds only) show whatever they stage.
  if (LAB || QA_FRAME) return isHeldName(name);
  if (session.state && (session.mode === 'host' || session.mode === 'client')) return name === session.creatorName;
  return isHeldName(name) && ownerUnlocked();
}

/**
 * How a name sits in the box that clips it (PlayerName in a .cut, a duel's face): how wide its letters are, the room
 * the box gives them, and the padding after them. The creator's box keeps room round the letters for its glow
 * (app.css, --foil-room), so they're read from the name itself, as a box's scrollWidth leaves its padding out of
 * what overflows in some browsers; anyone else's is the box's own text.
 */
export function nameFit(box: HTMLElement): { letters: number; room: number; after: number } {
  const style = getComputedStyle(box);
  const before = parseFloat(style.paddingLeft) || 0;
  const after = parseFloat(style.paddingRight) || 0;
  const name = box.firstElementChild;
  const letters = name instanceof HTMLElement ? name.offsetWidth : box.scrollWidth - before - after;
  return { letters, room: box.clientWidth - before - after, after };
}
