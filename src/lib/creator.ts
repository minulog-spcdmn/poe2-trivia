// Whether a name shows as the creator's (the foil, the gilded avatar, the
// title): the held name (names.ts), and only where it's proven. Online, the
// owner key's signature for the room must check out on this device
// (ownerKey.ts, session.svelte.ts noteOwner), whatever the host says; in
// hot-seat, and outside a room, it's this device's own word.

import { isHeldName } from './names';
import { ownerUnlocked } from './ownerKey';
import { session } from './session.svelte';
import { END_PREVIEW, LAB } from './storage';

export function creatorShown(name: string): boolean {
  if (!isHeldName(name)) return false;
  // The effects lab and the end screen's test page (dev and beta builds only) show whatever they stage.
  if (LAB || END_PREVIEW) return true;
  const s = session.state;
  if (!s || (session.mode !== 'host' && session.mode !== 'client')) return ownerUnlocked();
  const id = [...s.players, ...(s.spectators ?? [])].find((o) => isHeldName(o.name))?.id;
  return !!id && session.ownerProven(id);
}
