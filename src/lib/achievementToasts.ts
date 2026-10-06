// How newly earned achievements are announced: a notice each, with its seal,
// in the stack every notice goes to (lib/toasts.svelte.ts). Apart from
// lib/achievements.ts, which the tests read without Svelte.

import type { Achievement, Check } from './achievements.ts';
import { toasts } from './toasts.svelte';

/** More than this at once come as one notice naming them all, so a burst never fills the stack. */
const ONE_BY_ONE = 2;

/**
 * Announces what a check earned. The quiet first check (achievements earned
 * in games from before they existed) gets one notice pointing to the codex,
 * and only where `pointToCodex` says the codex can be opened from here.
 */
export function announceAchievements(check: Check, pointToCodex = false) {
  const list = check.earned;
  if (!list.length) return;
  if (check.first) {
    if (pointToCodex)
      toasts.show(`${list.length} earned in your past games. See them in the Codex.`, 'info', { title: 'Achievements', seal: sealOf(best(list)) });
    return;
  }
  if (list.length <= ONE_BY_ONE) {
    for (const a of list) toasts.show(a.title, 'info', { title: 'Achievement earned', seal: sealOf(a) });
    return;
  }
  toasts.show(list.map((a) => a.title).join(' • '), 'info', { title: `${list.length} achievements earned`, seal: sealOf(best(list)) });
}

/** The hardest of them, for the notice's seal. */
const best = (list: Achievement[]) => list.reduce((a, b) => (b.tier > a.tier ? b : a));

const sealOf = (a: Achievement) => ({ sign: a.sign, tier: a.tier });
