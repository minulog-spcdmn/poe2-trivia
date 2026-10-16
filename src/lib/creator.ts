// Whether a name shows as the creator's (the foil, the gilded avatar, the
// title): the held name (names.ts), and only where it's proven. In an online
// room, only the one the host let in with the owner key's signature
// (session.svelte.ts creatorName); in hot-seat, and outside a room, it's
// this device's own word.

import { isHeldName } from './names';
import { ownerUnlocked } from './ownerKey';
import { session } from './session.svelte';
import { END_PREVIEW, LAB } from './storage';

export function creatorShown(name: string): boolean {
  // The effects lab and the end screen's test page (dev and beta builds only) show whatever they stage.
  if (LAB || END_PREVIEW) return isHeldName(name);
  if (session.state && (session.mode === 'host' || session.mode === 'client')) return name === session.creatorName;
  return isHeldName(name) && ownerUnlocked();
}
