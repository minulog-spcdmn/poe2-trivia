// Runs one expression in the phone's tab and prints its value (a promise is
// waited for), to see what the page has:
//   node scripts/iphone/ask.mjs "navigator.userAgent"

import { connect, webTab } from './phone.mjs';

const expr = process.argv[2];
if (!expr) {
  console.error('usage: node scripts/iphone/ask.mjs "<expression>"');
  process.exit(2);
}
const t = await webTab();
const page = await connect(t.webSocketDebuggerUrl);
console.log(`${t.device} (iOS ${t.ios}): ${t.url}`);
console.log(await page.evaluate(expr));
process.exit(0);
