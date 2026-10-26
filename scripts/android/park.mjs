// Parks emulators' Chrome on a blank page. An idle tab that's left on the game
// keeps drawing its backdrop, and on the emulator that costs the PC about four
// cores (every GL call is translated on the host); a blank page costs nothing.
//   node scripts/android/park.mjs [DevTools ports, default every one pool.mjs gives]

import { page } from './cdp.mjs';

const ports = process.argv.length > 2 ? process.argv.slice(2) : ['9333', '9334', '9335', '9336'];
for (const port of ports) {
  try {
    const p = await page(port);
    await p.send('Page.navigate', { url: 'about:blank' });
    p.close();
    console.log(`${port} parked`);
  } catch {
    if (process.argv.length > 2) console.log(`${port}: no Chrome there`);
  }
}
process.exit(0);
