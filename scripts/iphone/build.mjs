// Builds this checkout for the phone, into .phone/<name>/ (docs/iphone.md):
// in the local channel, so its rooms are this machine's and the ?off=
// switches work (lib/switchedOff.ts), with a full codex put in the phone's
// storage on its first visit, as a long-time player's (every item seen, 2000
// answers), unless --empty. With --qa, the QA desk too (qa.html, which only
// the beta builds), so the phone can open a scene on its own:
// qa.html?frame&s=<scene key>[&k.<control>=<value>].
//   node scripts/iphone/build.mjs <name> [--empty] [--qa]
// Then serve.mjs puts it on the home network. To set a change against what it
// changes, build each (check out one, build it as before, the other as after)
// and serve both, each on its own port.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';
import { root, work } from './phone.mjs';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
if (!name || !/^[\w-]+$/.test(name)) {
  console.error('usage: node scripts/iphone/build.mjs <name> [--empty] [--qa]');
  process.exit(2);
}
const outDir = join(work, name);
process.env.VITE_CHANNEL = 'local';
// (Source maps kept but not linked, for profile.mjs to name what ran.)
// (The desk's page beside the config's own, which the inline config is merged into.)
const qa = args.includes('--qa') ? { rollupOptions: { input: { qa: join(root, 'qa.html') } } } : {};
await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true, sourcemap: 'hidden', ...qa } });

if (!args.includes('--empty')) {
  // The codex as Codex.svelte keeps it (lib/storage.ts names the local channel's keys).
  const items = JSON.parse(readFileSync(join(root, 'src/data/items.json'), 'utf8'));
  const now = Date.now();
  const codex = { v: 1, items: {}, log: [], byDifficulty: {}, fooled: {}, streak: 3, best: 41, fastest: 1200, byDepth: {} };
  items.forEach((it, i) => {
    const n = 2 + (i % 9);
    codex.items[it.id] = { seen: n, first: now - 9e8 + i * 1000, last: now - i * 5000, name: { n, ok: n - (i % 3) }, art: { n: i % 4, ok: i % 3 === 0 ? i % 4 : 0 }, mixed: {} };
  });
  for (let k = 0; k < 2000; k++)
    codex.log.push({ t: now - (2000 - k) * 60000, id: items[(k * 7) % items.length].id, mode: k % 3 ? 'name' : 'art', ok: k % 4 !== 0, difficulty: 'normal', race: false, ms: 1500 + (k % 50) * 100 });
  // (Only where there's none yet: what the phone has played since stays.)
  const js = `try{if(!localStorage.getItem('poe2trivia.local.codex2'))localStorage.setItem('poe2trivia.local.codex2',${JSON.stringify(JSON.stringify(codex))})}catch(e){}`;
  writeFileSync(join(outDir, 'seed.js'), js);
  const html = join(outDir, 'index.html');
  writeFileSync(html, readFileSync(html, 'utf8').replace('<head>', '<head><script src="./seed.js"></script>'));
  console.log(`built ${outDir}, with a codex of ${items.length} items`);
} else console.log(`built ${outDir}`);
