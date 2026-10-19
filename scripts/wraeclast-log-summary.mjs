// Wraeclast run logs, summed up as plain text: about 40 lines a run, then one
// line per item. Reads a run's file (.wraeclast-logs/, written by the dev
// server: vite.config.ts, wraeclastLogs), a folder of them, or the end
// screen's copied log ({ wraeclastRuns: [...] }).
//
//   node scripts/wraeclast-log-summary.mjs .wraeclast-logs
//   node scripts/wraeclast-log-summary.mjs .wraeclast-logs/2026-10-19T12-00-00.000Z_123.json

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// As the player reads them (SUPPLY_NAMES in src/wraeclast/rules.ts).
const SUPPLY_NAMES = {
  flare: 'Torch',
  wisdom: 'Scroll of Wisdom',
  lore: 'Golden Page',
  category: 'Ancient Orb',
};
const VENDOR_SCREENS = new Set(['camp', 'town']);
// As the player reads them (DEPTH_NAME and MOD_NAME in src/wraeclast/words.ts).
const DEPTH_NAMES = { known: 'Known', obscure: 'Obscure', forgotten: 'Forgotten' };
const MOD_NAMES = {
  damage: 'extra damage',
  recovery: 'less recovery',
  monsters: 'more monsters',
  armoured: 'armoured',
};

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

/** The lowest life an item reached: its misses in time order. */
function lowestIn(it) {
  let life = it.lifeBefore;
  let low = life;
  for (const sub of [...it.submits].sort((a, b) => a.ms - b.ms)) {
    life -= sub.lost;
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
  const revealMs = screens.filter((s) => s.screen === 'reveal').reduce((a, s) => a + s.ms, 0);
  const mapMs = screens.filter((s) => s.screen === 'map').reduce((a, s) => a + s.ms, 0);
  const maxLife = log.tuning?.life ?? 100;
  const lowest = items.length ? Math.min(...items.map((it) => lowestIn(it))) : maxLife;
  const goldStart = log.tuning?.gold ?? 0;

  out.push(`Run ${log.start} • seed ${log.seed} • ${log.viewport ? `${log.viewport} px wide` : 'width unknown'}`);
  out.push(`Result: ${log.result ?? 'not ended'}${log.endedOn ? ` (on ${log.endedOn.name}, ${log.endedOn.node})` : ''}`);
  out.push(`Length: ${clock(log.ms)} • items ${items.length} • misses ${log.misses}`);
  out.push(`Items with no supply used: ${items.filter((it) => !it.supplies.length).length} of ${items.length}`);
  out.push(times.length ? `Item time: median ${secs(median(times))} • range ${secs(Math.min(...times))} to ${secs(Math.max(...times))}` : 'Item time: no items');
  out.push(`Minutes: items ${min(itemsMs)} • shops ${min(vendorMs)} • reveals ${min(revealMs)} • the map ${min(mapMs)}`);
  out.push(`Life: lowest ${lowest} of ${maxLife} • at the end ${log.lifeEnd}`);
  out.push(`Gold: start ${goldStart} • earned ${log.goldEarned} • spent ${log.goldSpent} • left ${goldStart + log.goldEarned - log.goldSpent}`);

  // Supplies left: what was bought less what was used.
  out.push('Supplies (bought • used • left):');
  for (const [k, name] of Object.entries(SUPPLY_NAMES)) {
    const b = log.bought?.[k] ?? 0;
    const u = log.used?.[k] ?? 0;
    if (!b && !u) continue;
    out.push(`  ${name}: ${b} • ${u} • ${Math.max(0, b - u)}`);
  }
  const heals = (log.met ?? []).filter((m) => m.healed || m.noHeal).map((m) => (m.noHeal ? `${m.node} none (less recovery)` : `${m.node} +${m.healed}`));
  out.push(`Town heals: ${heals.length ? heals.join(' • ') : 'none'}`);
  out.push(`Route: ${(log.route ?? []).join(' > ')}`);
  out.push(`Spread: ${log.spread ?? 0} • the Seed at the end: ${log.seedEnd?.life ?? '?'} life, hits ${log.seedEnd?.hit ?? '?'}`);
  const rolled = (log.region ?? []).map((z) => `${z.node} ${DEPTH_NAMES[z.depth] ?? z.depth}${z.mod ? ` (${MOD_NAMES[z.mod] ?? z.mod})` : ''}`);
  if (rolled.length) out.push(`Zones as rolled: ${rolled.join(' • ')}`);

  const used = (it) => [...it.supplies].sort((a, b) => a.order - b.order).map((s) => SUPPLY_NAMES[s.type] ?? s.type);
  const zoneItems = items.filter((it) => !it.duel);
  const duelItems = items.filter((it) => it.duel);
  out.push('Zones (name • place • depth • mod • corrupted • supplies used • time • misses • life before to after • gold • spread after):');
  zoneItems.forEach((it, i) => {
    const right = it.submits.some((s) => s.right);
    out.push(
      `  ${String(i + 1).padStart(2)}. ${it.name} • ${it.node} • ${DEPTH_NAMES[it.depth] ?? it.depth} • ${it.mod ? (MOD_NAMES[it.mod] ?? it.mod) : 'no mod'} • ${it.corrupted ? 'corrupted' : 'clean'} • ${used(it).join(', ') || 'none'} • ${secs(itemMs(it))} • ${it.misses} • ${it.lifeBefore} to ${it.lifeAfter} • ${it.gold ?? 0} • ${it.spread ?? '?'}${right ? '' : ' • lost here'}`,
    );
  });
  out.push('Duel (name • depth • the Seed as it opened • you as it opened • its hit on you • supplies used • right or wrong • your hit):');
  if (!duelItems.length) out.push('  not reached');
  duelItems.forEach((it, i) => {
    const d = it.duelLog;
    const right = it.submits.some((s) => s.right);
    out.push(
      `  ${String(i + 1).padStart(2)}. ${it.name} • ${DEPTH_NAMES[it.depth] ?? it.depth} • ${d ? `The Seed ${d.seed.life} life, hits ${d.seed.hit} • You ${d.you.life} life, a bare answer hits ${d.you.hit} • took ${d.took}` : 'no lines'} • ${used(it).join(', ') || 'none'} • ${it.submits.length ? (right ? 'right' : `wrong, -${it.submits.at(-1).lost} life`) : 'no answer'} • ${d ? d.dealt : 0}`,
    );
  });
  return out.join('\n');
}

const runs = runsIn(path);
if (!runs.length) console.log('No runs.');
console.log(runs.map(summary).join('\n\n'));
