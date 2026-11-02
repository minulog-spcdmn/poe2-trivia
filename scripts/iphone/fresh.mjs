// Puts the phone's tab on a build in a page process of its own, holding
// nothing but that page, and says what it holds (docs/iphone.md, "A tab's
// process keeps pages it has left"):
//   node scripts/iphone/fresh.mjs http://192.168.178.88:4403/
// The tab goes through six pages on other sites (IANA's example domains),
// each in a process of its own, which lets go of the old one and every page
// it kept, then to the build in a new process. Reloading the build, or going
// to another of the PC's ports, keeps the old process: every port on the PC
// is one site to WebKit. And the PC has no other name the phone will load
// over http: Chrome's HTTPS-first warning stopped both its name on the home
// network (rocinante.fritz.box) and its IPv6 address.

import { connect, heldPages, log, open, sleep, webTab } from './phone.mjs';

const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/iphone/fresh.mjs <url>');
  process.exit(2);
}
const away = ['https://example.org/', 'https://example.net/', 'https://www.iana.org/help/example-domains', 'https://example.com/?1', 'https://example.org/?2', 'https://example.net/?3'];
for (const site of away) {
  const page = await connect((await webTab()).webSocketDebuggerUrl);
  await page.evaluate(`void (location.href = ${JSON.stringify(site)})`).catch(() => {});
  page.close();
  await sleep(6000);
}
// (A moment for the old process to go.)
await sleep(15000);
const page = await open(url);
const held = await heldPages(page);
page.close();
log(`the tab's process: ${held.line}`);
if (held.others) {
  log(`it still holds ${held.others} page(s) besides this one: run it again`);
  process.exit(1);
}
process.exit(0);
