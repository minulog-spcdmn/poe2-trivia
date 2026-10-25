// A screenshot of the phone's tab as it is now, the page's whole viewport
// at the phone's pixels:
//   node scripts/iphone/shot.mjs <out.png>

import { writeFileSync } from 'node:fs';
import { connect, webTab } from './phone.mjs';

const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/iphone/shot.mjs <out.png>');
  process.exit(2);
}
const page = await connect((await webTab()).webSocketDebuggerUrl);
const { w, h } = await page.evaluate(`({ w: innerWidth, h: innerHeight })`);
const r = await page.send('Page.snapshotRect', { x: 0, y: 0, width: w, height: h, coordinateSystem: 'Viewport' });
writeFileSync(out, Buffer.from(r.dataURL.split(',')[1], 'base64'));
console.log(`wrote ${out} (${w} x ${h} CSS px)`);
process.exit(0);
