// Serves builds made by build.mjs on the home network, for the phone to load
// over Wi-Fi, each on its own port (docs/iphone.md):
//   node scripts/iphone/serve.mjs <name>=<port> [<name>=<port> ...]
// e.g. before=4402 after=4403. It runs until stopped. Windows asks once
// whether Node.js may take connections: allow it on private networks.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { preview } from 'vite';
import { root, work } from './phone.mjs';

const pairs = process.argv.slice(2);
if (!pairs.length || pairs.some((p) => !/^[\w-]+=\d+$/.test(p))) {
  console.error('usage: node scripts/iphone/serve.mjs <name>=<port> [...]   (builds from build.mjs, in .phone/)');
  process.exit(2);
}
for (const pair of pairs) {
  const [name, port] = pair.split('=');
  const outDir = join(work, name);
  if (!existsSync(join(outDir, 'index.html'))) throw new Error(`no build at ${outDir}: node scripts/iphone/build.mjs ${name}`);
  const s = await preview({ root, logLevel: 'warn', build: { outDir }, preview: { host: '0.0.0.0', port: +port, strictPort: true } });
  console.log(`${name}: ${s.resolvedUrls.network.join('  ')}`);
}
