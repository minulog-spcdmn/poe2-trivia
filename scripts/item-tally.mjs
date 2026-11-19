#!/usr/bin/env node
// Reads the item tally (every player's answers, added up per item, form and
// the rules each was asked under by the matchmaking server: signal/worker.js
// Tally, src/lib/itemTally.ts) and lists the items players miss more than
// the others asked under the same rules.
//
// How they're ranked is in src/lib/itemTallyRank.ts, which the stats
// page's Items view ranks by too; the filters apply before the rates, so
// `--first` compares first meetings with first meetings. `--easiest` lists
// the items surely missed least first.
//
// Usage: npm run item-tally -- [--form n|a] [--first] [--easiest] [--min <answers>] [--v <version>]
//   [--mode delve|together|turns|race|practice|daily]
// (--v defaults to this build's, src/lib/itemTallyRank.ts TALLY_VERSION.)

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TALLY_MODES, TALLY_ROWS as ROWS, rank } from '../src/lib/itemTallyRank.ts';
import { OWN_SIGNAL_HOST as HOST } from '../src/lib/signalHost.ts';
import { tallyRowsOf } from '../src/statsPage/tally.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The options given. */
export function options(argv) {
  const out = { first: false };
  const usage = 'options: --form n|a, --first, --easiest, --min <answers>, --v <version>, --mode delve|together|turns|race|practice|daily.';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--first') {
      out.first = true;
      continue;
    }
    if (a === '--easiest') {
      out.order = 'easiest';
      continue;
    }
    const m = /^--(form|min|v|mode)$/.exec(a);
    const value = argv[i + 1];
    if (!m || value === undefined) throw new Error(`Unknown option ${a}; ${usage}`);
    i++;
    if (m[1] === 'form' && value !== 'n' && value !== 'a') throw new Error(`--form ${value}; ${usage}`);
    if (m[1] === 'mode' && !Object.hasOwn(TALLY_MODES, value)) throw new Error(`--mode ${value}; ${usage}`);
    const number = m[1] === 'min' || m[1] === 'v';
    if (number && !(Number.isInteger(Number(value)) && Number(value) >= 1)) throw new Error(`--${m[1]} ${value}; ${usage}`);
    out[m[1]] = number ? Number(value) : value;
  }
  return out;
}

const num = (x, w) => (x === null ? '-' : Number.isFinite(x) ? x.toFixed(2) : 'inf').padStart(w);

async function main() {
  const o = options(process.argv.slice(2));
  if (!HOST) throw new Error('No OWN_SIGNAL_HOST in src/lib/signalHost.ts.');
  const r = await fetch(`https://${HOST}/tally`, { headers: { Origin: 'https://poe2.quest', 'User-Agent': 'poe2-item-tally' } });
  if (!r.ok) throw new Error(`GET /tally: ${r.status}`);
  // (Checked as the Items view checks it: another shape from a newer Worker throws rather than ranks wrong.)
  const rows = tallyRowsOf(await r.json());
  const items = new Map(JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'items.json'), 'utf8')).map((i) => [i.id, i]));
  // A table filling with ids no item has is someone making them up: past the Worker's cap no new sum is started, real items' neither.
  const unknown = rows.filter((x) => !items.has(x.item)).length;
  console.log(`${rows.length} sums kept (of ${ROWS.toLocaleString('en')} at most), ${unknown} of them for ids items.json doesn't have.`);
  const { v, list } = rank(rows, o);
  const said = [o.form && `form ${o.form}`, o.first && 'first meetings', o.mode, o.min && `${o.min}+ answers`, o.order === 'easiest' && 'easiest first'].filter(Boolean);
  console.log(`Tally v${v}: ${list.length} items${said.length ? ` (${said.join(', ')})` : ''}.`);
  console.log('answers  missed  expected  score  90% interval  | item (group)');
  for (const s of list) {
    const i = items.get(s.item);
    console.log(
      `${String(s.n).padStart(7)}  ${String(s.miss).padStart(6)}  ${s.expected.toFixed(1).padStart(8)}  ${num(s.score, 5)}  ${num(s.low, 5)} to ${num(s.high, 5)}  | ${i ? `${i.name} (${i.group})` : `${s.item} (not in items.json)`}`,
    );
  }
}

// (Run as a script; the tests only import it.)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
