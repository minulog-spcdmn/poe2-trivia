// Sends the phone's tab to an address, say a build for the owner to try by
// hand, and prints every tab once it's there:
//   node scripts/iphone/goto.mjs http://192.168.178.88:4403/

import { open, tabs } from './phone.mjs';

const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/iphone/goto.mjs <url>');
  process.exit(2);
}
const page = await open(url);
page.close();
console.log((await tabs()).map((t) => t.url).join('\n'));
process.exit(0);
