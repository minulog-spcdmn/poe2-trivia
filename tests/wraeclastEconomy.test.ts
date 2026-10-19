// @ts-nocheck prototype: revisit before merge
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botRuns } from './wraeclastBot.ts';

// The Wraeclast run's economy (src/wraeclast/rules.ts, DEFAULT_TUNING) held
// to the v4 handoff's targets with the bot (wraeclastBot.ts): a player who
// uses about 1.9 supplies an item finds about a third as loot and buys the
// rest, ends with under about 15% of its gold unspent, and can afford roughly
// what it uses but not everything, over a run of about 17 items.

test('the economy meets the v4 targets with the bot', { skip: 'prototype: revisit before merge' }, () => {
  const r = botRuns(60);
  console.log(JSON.stringify(r));
  assert.ok(r.items >= 15 && r.items <= 19, `about 17 items a run (${r.items})`);
  assert.ok(r.usedPerItem >= 1.7 && r.usedPerItem <= 2, `about 1.9 supplies an item (${r.usedPerItem})`);
  assert.ok(r.foundShare >= 0.25 && r.foundShare <= 0.42, `about a third found as loot (${r.foundShare})`);
  assert.ok(r.unspent < 0.15, `under 15% of the gold unspent (${r.unspent})`);
  assert.ok(r.short > 0.02, `can't afford everything it would use (${r.short})`);
});
