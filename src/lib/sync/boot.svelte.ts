// Sync at startup, kept light: the link (lib/sync/link.svelte.ts, with
// PeerJS and the codex) only comes in once the page is idle, and only when
// this browser is paired or a pairing link brought it here.

import { whenIdle } from '../idle.ts';
import { codeInHash } from './code.ts';
import { SYNC_HERE, loadPairing } from './store.ts';
import { stampChoices } from './chosen.ts';

/** A code a link brought (another device's QR code), waiting for the player to say yes to it (App's SyncDialog). */
export const landing = $state<{ code: string | null }>({ code: null });

/**
 * Takes a pairing link's code out of the address before anything else reads
 * it (it is never kept in the history or counted), and starts syncing once
 * the page is idle if this browser is paired.
 */
export function bootSync() {
  if (!SYNC_HERE) return;
  // (When the name or colour is chosen, paired or not: the first pairing then knows whose is newer.)
  stampChoices();
  const code = codeInHash(location.hash);
  if (code) {
    history.replaceState(history.state, '', location.pathname + location.search);
    if (code !== loadPairing()?.code) landing.code = code;
  }
  if (loadPairing()) whenIdle(() => void import('./link.svelte.ts').then((m) => m.startSync()), { timeout: 4000, fallback: 1500 });
}
