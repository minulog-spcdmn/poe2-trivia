// How newly earned achievements are announced: a notice each, with its seal,
// in the stack every notice goes to (lib/toasts.svelte.ts). Apart from
// lib/achievements.ts, which the tests read without Svelte.
//
// Whatever is earned within one moment (a reveal can earn from the codex, the
// records and the moment itself, each checked on its own) is gathered and
// announced together a little after it, so a burst never fills the stack.

import type { Achievement, Check } from './achievements.ts';
import { toasts } from './toasts.svelte';

/** More than this at once come as one notice naming them all. */
const ONE_BY_ONE = 2;
/** How long after the moment that earned it an achievement is announced: a notice arriving with a reveal's flare would be lost in it. */
const DELAY_MS = 1400;

let pending: Achievement[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
/** What a quiet first check away from the start page earned: the start page tells it next. */
let owed: Achievement[] = [];

/** Where a check was made: the first check's notice belongs on the start page, and the codex shows them already. */
export type Where = 'start' | 'codex' | 'game';

/**
 * Announces what a check earned. The quiet first check (achievements earned
 * in games from before they existed) gets one notice pointing to the codex,
 * on the start page.
 */
export function announceAchievements(check: Check, where: Where) {
  if (check.past?.length) announceAchievements({ earned: check.past, first: true }, where);
  const list = check.earned;
  if (!list.length) return;
  if (check.first) {
    if (where === 'start') past(list);
    else if (where === 'game') owed = list;
    return;
  }
  pending.push(...list);
  timer ??= setTimeout(flush, DELAY_MS);
}

/** On the start page: the notice a quiet first check in a game left owing, if any. */
export function payOwed() {
  if (owed.length) past(owed);
  owed = [];
}

function past(list: Achievement[]) {
  toasts.show(`${list.length} earned in your past games. See them in the Codex.`, 'info', { title: 'Achievements', seal: sealOf(best(list)) });
}

function flush() {
  timer = null;
  const list = [...new Map(pending.map((a) => [a.id, a])).values()];
  pending = [];
  if (list.length <= ONE_BY_ONE) {
    for (const a of list) toasts.show(a.title, 'info', { title: 'Achievement earned', seal: sealOf(a) });
    return;
  }
  toasts.show(list.map((a) => a.title).join(' • '), 'info', { title: `${list.length} achievements earned`, seal: sealOf(best(list)) });
}

/** The hardest of them, for the notice's seal. */
const best = (list: Achievement[]) => list.reduce((a, b) => (b.tier > a.tier ? b : a));

const sealOf = (a: Achievement) => ({ sign: a.sign, tier: a.tier });
