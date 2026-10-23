// The toast that says another of the player's devices has the site open and
// the two are syncing (lib/sync/link.svelte.ts): otherwise only the settings
// show it. Not again for a link that comes back soon after it went (a phone
// put away for a minute, a reload), and not at a first pairing, where the
// pairing dialog says so.

import { toasts } from '../toasts.svelte';

/** How long a link must have been gone before its return is told again. */
export const QUIET_MS = 5 * 60_000;

/** Says that `n` other devices are linked now. */
export const showSynced = (n: number) =>
  toasts.show(
    n > 1 ? `Your ${n} other devices have the site open too; your progress reaches them all as you play.` : 'Your other device has the site open too; your progress reaches both as you play.',
    'info',
    { title: 'Syncing' },
  );

/** Whether a link made now is told: one was made before (`lastAt`), and long enough ago. */
export const tellsLink = (lastAt: number, now: number) => lastAt > 0 && now - lastAt >= QUIET_MS;
