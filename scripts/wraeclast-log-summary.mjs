// Wraeclast run logs (v5, log v7), summed up as plain text: about 40 lines a
// run, one line per item, then each item's board and tries, and the tuning. Reads a run's file (.wraeclast-logs/, written by the dev
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
// As the player reads them (BOON_NAME in src/wraeclast/words.ts).
const BOON_NAMES = {
  dagger: 'Ornate Dagger',
  balbala: "Balbala's Gift",
  challenger: 'Honoured Challenger',
  raincaller: 'Raincaller',
  vial: 'Sanguine Vial',
  hare: 'Hare Foot',
  fright: 'Fright Mask',
  mirror: 'Sacred Mirror',
  assassin: "Assassin's Blade",
  upward: 'Upward Path',
  silver: 'Silver Tongue',
  peace: "Moment's Peace",
  honour: 'Earned Honour',
  cloak: "Sekhema's Cloak",
};
const boonName = (b) => BOON_NAMES[b] ?? b;
/** The boons that fired on an item: "Ornate Dagger 24, Hare Foot 3" (each with its number), or none. */
const firedOn = (it) => (it.fired ?? []).map((f) => `${boonName(f.boon)} ${f.n}`).join(', ') || 'none';
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
  const draftMs = screens.filter((s) => s.screen === 'draft').reduce((a, s) => a + s.ms, 0);
  out.push(`Minutes: items ${min(itemsMs)} • drafts ${min(draftMs)} • shops ${min(vendorMs)} • reveals ${min(revealMs)} • the map ${min(mapMs)}`);
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
  out.push('Places entered (place • kind • heal • gold spent • supplies bought):');
  for (const m of log.met ?? []) out.push(`  ${m.node} • ${m.kind} • ${m.noHeal ? 'none (less recovery)' : m.healed ? `+${m.healed}` : 'none'} • ${m.spent} • ${m.bought}`);
  out.push(`Route: ${(log.route ?? []).join(' > ')}`);
  // Time on each screen between items, in order: "map 12s".
  out.push(`Screens: ${screens.map((sc) => `${sc.screen} ${sc.node} ${secs(sc.ms)}`).join(' • ') || 'none'}`);
  out.push('Drafts (where • offered • taken):');
  if (!(log.drafts ?? []).length) out.push('  none');
  for (const d of log.drafts ?? []) out.push(`  ${d.node} • ${d.offered.map(boonName).join(', ')} • ${d.took ? boonName(d.took) : 'passed'}`);
  out.push(`Boons held at the end: ${(log.boons ?? []).map(boonName).join(', ') || 'none'}`);
  out.push(`Spread: ${log.spread ?? 0} • the Seed at the end: ${log.seedEnd?.life ?? '?'} life, hits ${log.seedEnd?.hit ?? '?'}`);
  const rolled = (log.region ?? []).map((z) => `${z.node} ${DEPTH_NAMES[z.depth] ?? z.depth}${z.mod ? ` (${MOD_NAMES[z.mod] ?? z.mod})` : ''}`);
  if (rolled.length) out.push(`Zones as rolled: ${rolled.join(' • ')}`);

  /** The pack as an item opened: "Torch 2, Golden Page 1", or empty. */
  const packOf = (it) =>
    Object.entries(it.pack ?? {})
      .filter(([, n]) => n)
      .map(([k, n]) => `${SUPPLY_NAMES[k] ?? k} ${n}`)
      .join(', ') || 'empty';
  /** The boons held as an item opened. */
  const heldOn = (it) => (it.boons ?? []).map(boonName).join(', ') || 'none';
  const used = (it) => [...it.supplies].sort((a, b) => a.order - b.order).map((s) => SUPPLY_NAMES[s.type] ?? s.type);
  const zoneItems = items.filter((it) => !it.duel);
  const duelItems = items.filter((it) => it.duel);
  out.push('Zones (name • category • place • depth • mod • corrupted • pack as it opened • supplies used • time • misses • life before to after • gold • spread after • boons held • boons fired):');
  zoneItems.forEach((it, i) => {
    const right = it.submits.some((s) => s.right);
    out.push(
      `  ${String(i + 1).padStart(2)}. ${it.name} • ${it.category} • ${it.node} • ${DEPTH_NAMES[it.depth] ?? it.depth} • ${it.mod ? (MOD_NAMES[it.mod] ?? it.mod) : 'no mod'} • ${it.corrupted ? 'corrupted' : 'clean'} • ${packOf(it)} • ${used(it).join(', ') || 'none'} • ${secs(itemMs(it))} • ${it.misses} • ${it.lifeBefore} to ${it.lifeAfter} • ${it.gold ?? 0} • ${it.spread ?? '?'} • ${heldOn(it)} • ${firedOn(it)}${right ? '' : ' • lost here'}`,
    );
  });
  out.push('Duel (name • category • depth • the Seed as it opened • you as it opened • its hit on you • pack as it opened • supplies used (kinds) • right or wrong • your hit • boons held • boons fired):');
  if (!duelItems.length) out.push('  not reached');
  duelItems.forEach((it, i) => {
    const d = it.duelLog;
    const right = it.submits.some((s) => s.right);
    out.push(
      `  ${String(i + 1).padStart(2)}. ${it.name} • ${it.category} • ${DEPTH_NAMES[it.depth] ?? it.depth} • ${d ? `The Seed ${d.seed.life} life, hits ${d.seed.hit} • You ${d.you.life} life, a bare answer hits ${d.you.hit} • took ${d.took}` : 'no lines'} • ${packOf(it)} • ${used(it).join(', ') || 'none'} (${d ? d.kinds : 0}) • ${it.submits.length ? (right ? 'right' : `wrong, -${it.submits.at(-1).lost} life`) : 'no answer'} • ${d ? d.dealt : 0} • ${heldOn(it)} • ${firedOn(it)}`,
    );
  });
  // Each item's board and tries, for a closer look: its tiles and patches, the decoy names, the Ancient Orb's sibling, each Torch's burn-in, each submit's tiles and marks (+ gold, ~ silver, - struck).
  out.push('Boards and tries:');
  items.forEach((it, i) => {
    out.push(
      `  ${String(i + 1).padStart(2)}. ${it.name} (${it.itemId}): ${it.tiles.answer.length + it.tiles.decoys.length} tiles, ${it.patches} patches • decoy names ${it.tiles.names.join(', ') || 'none'} • sibling ${it.sibling ?? 'none'} • burn-ins ${it.burnIns.map((b) => `${b.patches} at ${secs(b.ms)}`).join(', ') || 'none'}`,
    );
    for (const sub of it.submits) {
      const line = sub.tiles.map((tile, k) => `${tile}${{ gold: '+', silver: '~', struck: '-' }[sub.marks[k]] ?? ''}`).join(' ');
      out.push(`      ${sub.right ? 'right' : `miss -${sub.lost}`} at ${secs(sub.ms)}: ${line}${sub.breaks.length ? ` (breaks after ${sub.breaks.join(', ')})` : ''}`);
    }
  });
  out.push(`Tuning: ${Object.entries(log.tuning ?? {}).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v).replace(/"/g, '') : v}`).join(' • ')}`);
  out.push(`Log v${log.v} • ended ${log.end ?? 'not yet'} • ended on item ${log.endedOn ? log.endedOn.n + 1 : 'none'}`);
  return out.join('\n');
}

const runs = runsIn(path);
if (!runs.length) console.log('No runs.');
console.log(runs.map(summary).join('\n\n'));
