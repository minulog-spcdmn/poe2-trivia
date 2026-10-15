// The Delve backdrop in an azurite vein (the shader's uVein seams), UI hidden, at 4x.
import { openPage, done } from './rig.mjs';
const S = await openPage({ url: '/lab.html', K: 24, dsf: 4 });
await S.wait(3500);
await S.page.keyboard.press('Shift'); await S.page.mouse.click(3, 700); await S.wait(1500);
await S.slow(1);
await S.lab('newRun', 1, +(process.env.D || 27)); await S.wait(2500);
await S.slow(24);
if (!process.env.NOCLEAN) await S.ev(() => document.documentElement.classList.add('clean'));
await S.lab('dealDig', +(process.env.STRIKES || 3), 5.7);
await S.page.mouse.move(-10, -10);
await S.wait(2500);
for (let k = 0; k < 4; k++) { await S.wait(900); await S.page.screenshot({ path: `../thumb/vbg${process.env.D || 27}_${k}.png` }); }
await S.close(); await done();
