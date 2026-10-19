// Wraeclast run logs, summed up as plain text: about 40 lines a run, then one
// line per item. Reads a run's file (.wraeclast-logs/, written by the dev
// server: vite.config.ts, wraeclastLogs), a folder of them, or the end
// screen's copied log ({ wraeclastRuns: [...] }).
//
//   node scripts/wraeclast-log-summary.mjs .wraeclast-logs
//   node scripts/wraeclast-log-summary.mjs .wraeclast-logs/2026-10-19T12-00-00.000Z_123.json

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// As the player reads them (SUPPLY_NAMES and ZONE_NAMES in src/wraeclast/rules.ts and map.ts).
const SUPPLY_NAMES = {
  flare: 'Torch',
  wisdom: 'Scroll of Wisdom',
  lore: 'Golden Page',
  category: 'Ancient Orb',
  base: 'Base reveal',
  decoy: 'Tangled Fossil',
  lengths: 'Word lengths',
  first: 'First tile',
  deck: 'Stacked Deck',
};
const ZONE_NAMES = { plain: 'Plain', incursion: 'Incursion', essence: 'Essence', ritual: 'Ritual', expedition: 'Expedition', blight: 'Blight', boss: 'Boss' };
const CORRUPTION = { blood: 'Blood toll' };
/** A drink's heal now (FLASK_STEP in rules.ts). */
const FLASK_STEP = 10;
const VENDOR_SCREENS = new Set(['camp', 'town', 'vendor']);

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/wraeclast-log-summary.mjs <run file or folder>');
  process.exit(1);
}

function runsIn(p) {
  if (statSync(p).isDirectory()) {
    return readdirSync(p)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .flatMap((f) => runsIn(join(p, f)));
  }
  const data = JSON.parse(readFileSync(p, 'utf8'));
  return Array.isArray(data?.wraeclastRuns) ? data.wraeclastRuns : [data];
}

const min = (ms) => (ms / 60000).toFixed(1);
const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;
const secs = (ms) => `${Math.round(ms / 1000)}s`;
const median = (xs) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
/** An item's time: until its last submit (the right one, or the miss that ended the run). */
const itemMs = (it) => it.submits.at(-1)?.ms ?? 0;
const zoneOf = (it) => `${ZONE_NAMES[it.zoneType] ?? it.zoneType}${it.corruption ? ` (${CORRUPTION[it.corruption] ?? it.corruption})` : ''}`;

/** The lowest life an item reached: its toll, then its misses and drinks in time order. */
function lowestIn(it, maxLife) {
  let life = it.lifeBefore - (it.toll ?? 0);
  let low = Math.min(it.lifeBefore, life);
  const events = [...it.submits.map((s) => ({ ms: s.ms, d: -s.lost })), ...(it.drank ?? []).map((ms) => ({ ms, d: FLASK_STEP }))].sort((a, b) => a.ms - b.ms);
  for (const e of events) {
    life = Math.min(maxLife, life + e.d);
    low = Math.min(low, life);
  }
  return Math.min(low, it.lifeAfter);
}

function summary(log) {
  const out = [];
  const items = log.items ?? [];
  const times = items.map(itemMs);
  const itemsMs = times.reduce((a, b) => a + b, 0);
  const screens = log.screens ?? [];
  const vendorMs = screens.filter((s) => VENDOR_SCREENS.has(s.screen)).reduce((a, s) => a + s.ms, 0);
  const revealMs = screens.filter((s) => s.screen === 'loot').reduce((a, s) => a + s.ms, 0);
  const otherMs = Math.max(0, log.ms - itemsMs - vendorMs - revealMs);
  const maxLife = log.tuning?.life ?? 100;
  const lowest = items.length ? Math.min(...items.map((it) => lowestIn(it, maxLife))) : maxLife;
  const goldStart = log.tuning?.gold ?? 0;

  out.push(`Run ${log.start} • seed ${log.seed} • ${log.viewport ? `${log.viewport} px wide` : 'width unknown'}`);
  out.push(`Result: ${log.result ?? 'not ended'}${log.endedOn ? ` (on ${log.endedOn.name}, ${log.endedOn.node})` : ''}`);
  out.push(`Length: ${clock(log.ms)} • items ${items.length} • misses ${log.misses}`);
  out.push(`Items with no supply used: ${items.filter((it) => !it.supplies.length).length} of ${items.length}`);
  out.push(times.length ? `Item time: median ${secs(median(times))} • range ${secs(Math.min(...times))} to ${secs(Math.max(...times))}` : 'Item time: no items');
  out.push(`Minutes: items ${min(itemsMs)} • vendors ${min(vendorMs)} • reveals ${min(revealMs)} • other (map, Wells, boss intro) ${min(otherMs)}`);
  out.push(`Life: lowest ${lowest} of ${maxLife} • at the end ${log.lifeEnd} • drinks ${log.drinks}`);
  out.push(`Gold: start ${goldStart} • earned ${log.goldEarned} • spent ${log.goldSpent} • left ${goldStart + log.goldEarned - log.goldSpent}`);

  // Supplies left: what came in less what was used and what loot replaced away (a ware bought over a stack isn't logged).
  const lost = {};
  for (const it of items) for (const r of it.replaced ?? []) lost[r.was.supply] = (lost[r.was.supply] ?? 0) + r.was.n;
  out.push('Supplies (bought • found • used • left):');
  for (const [k, name] of Object.entries(SUPPLY_NAMES)) {
    const b = log.bought?.[k] ?? 0;
    const f = log.found?.[k] ?? 0;
    const u = log.used?.[k] ?? 0;
    if (!b && !f && !u) continue;
    out.push(`  ${name}: ${b} • ${f} • ${u} • ${Math.max(0, b + f - u - (lost[k] ?? 0))}`);
  }
  const lootLine = ['gold', 'supply', 'flask'].map((k) => `${k} ${log.loot?.taken?.[k] ?? 0} of ${log.loot?.dealt?.[k] ?? 0}`).join(' • ');
  out.push(`Rewards taken: ${lootLine}`);

  const offered = new Set();
  for (const t of log.travel ?? []) for (const o of t.options ?? []) if (o.corrupted) offered.add(o.node);
  const entered = (log.met ?? []).filter((m) => m.corruption).length;
  const fr = log.fronts ?? { seeded: 0, stopped: 0, aliveAtBoss: null };
  const alive = fr.aliveAtBoss ?? fr.seeded - fr.stopped;
  out.push(`Corrupted zones: offered ${offered.size} • entered ${entered}`);
  out.push(`Fronts: seeded ${fr.seeded} • stopped ${fr.stopped} • alive ${alive}${fr.aliveAtBoss === null ? ' (boss not reached)' : ' at the boss'}`);
  out.push(`Boss rules: ${(log.bossMods ?? []).join(', ') || 'none'}`);
  const heals = (log.met ?? []).filter((m) => m.healed).map((m) => `${m.node} +${m.healed}`);
  if (heals.length) out.push(`Town heals: ${heals.join(' • ')}`);

  out.push('Items (name • step • zone • supplies used • time • misses • life before to after):');
  items.forEach((it, i) => {
    const used = [...it.supplies].sort((a, b) => a.order - b.order).map((s) => SUPPLY_NAMES[s.type] ?? s.type);
    const right = it.submits.some((s) => s.right);
    out.push(
      `  ${String(i + 1).padStart(2)}. ${it.name} • ${it.step} • ${zoneOf(it)} • ${used.join(', ') || 'none'} • ${secs(itemMs(it))} • ${it.misses} • ${it.lifeBefore} to ${it.lifeAfter}${it.toll ? ` (toll ${it.toll})` : ''}${it.drank?.length ? ` (drank ${it.drank.length})` : ''}${right ? '' : ' • lost here'}`,
    );
  });
  return out.join('\n');
}

const runs = runsIn(path);
if (!runs.length) console.log('No runs.');
console.log(runs.map(summary).join('\n\n'));
