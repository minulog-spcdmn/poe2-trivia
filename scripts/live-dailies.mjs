// Today's unique's rows as the live site has them (src/data/dailies.json at
// the commit poe2.quest serves): what npm run deal keeps the days before its
// cutoff from, and what tests/dailies.test.ts holds those days to.
//
//   node scripts/live-dailies.mjs > live.json   # the live rows (CI); stops if it can't find them

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const gh = (/** @type {string[]} */ args) =>
  execFileSync('gh', ['api', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000, maxBuffer: 64 << 20 });

/**
 * The live rows' file and where it came from. LIVE_DAILIES, a path, says
 * (CI finds them before the tests run; an empty file for none). Else the
 * newest github-pages deployment that went up (one that failed never served
 * its rows), through the GitHub CLI; failing that, unless `strict`,
 * origin/main's. The text is '' when that commit has no rows.
 */
export function liveDailies(strict = false) {
  const path = process.env.LIVE_DAILIES;
  if (path) return { text: existsSync(path) ? readFileSync(path, 'utf8') : '', from: `LIVE_DAILIES (${path})` };
  try {
    const repo = 'repos/{owner}/{repo}';
    for (const id of gh([`${repo}/deployments?environment=github-pages&per_page=30`, '--jq', '.[].id']).split('\n').filter(Boolean)) {
      if (gh([`${repo}/deployments/${id}/statuses?per_page=1`, '--jq', '.[0].state // ""']).trim() !== 'success') continue;
      const sha = gh([`${repo}/deployments/${id}`, '--jq', '.sha']).trim();
      const from = `the live deployment (${sha.slice(0, 8)})`;
      try {
        return { text: gh(['-H', 'Accept: application/vnd.github.raw', `${repo}/contents/src/data/dailies.json?ref=${sha}`]), from };
      } catch (e) {
        if (String(/** @type {{ stderr?: string }} */ (e).stderr).includes('HTTP 404')) return { text: '', from };
        throw e;
      }
    }
    throw new Error('No github-pages deployment went up.');
  } catch (e) {
    if (strict) throw e;
    try {
      const text = execFileSync('git', ['show', 'origin/main:src/data/dailies.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
      return { text, from: 'origin/main (the live deployment not found)' };
    } catch {
      return { text: '', from: 'nowhere (the live deployment and origin/main not found)' };
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { text, from } = liveDailies(true);
  console.error(`Live rows from ${from}${text ? '' : ': none yet'}.`);
  process.stdout.write(text);
}
