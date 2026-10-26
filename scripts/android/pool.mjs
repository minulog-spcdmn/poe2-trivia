// Starts Android emulators side by side for checking the app on Android
// (docs/android.md), all read-only on the one AVD, so each boots from the same
// clean state with Chrome past its first run and none keeps what's done in it.
// Instance k gets the console port 5554 + 2k (adb serial emulator-<port>) and
// its Chrome's DevTools on http://localhost:<9333 + k>.
//   node scripts/android/pool.mjs start [n=1] [url=http://10.0.2.2:4404/]
//   node scripts/android/pool.mjs list
//   node scripts/android/pool.mjs stop

import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../iphone/phone.mjs';

const sdk = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const adbExe = join(sdk, 'platform-tools', 'adb.exe');
const emulatorExe = join(sdk, 'emulator', 'emulator.exe');
const AVD = 'poe2quest-pixel';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (...args) => {
  try {
    return execFileSync(adbExe, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const instance = (k) => ({ k, port: 5554 + 2 * k, serial: `emulator-${5554 + 2 * k}`, cdp: 9333 + k });
const running = () => [...adb('devices').matchAll(/^(emulator-\d+)\s+device$/gm)].map((m) => m[1]);

const [cmd = 'list', countArg, url = 'http://10.0.2.2:4404/'] = process.argv.slice(2);

if (cmd === 'stop') {
  for (const s of running()) {
    adb('-s', s, 'emu', 'kill');
    console.log(`${s} stopped`);
  }
  process.exit(0);
}

if (cmd === 'list') {
  for (const s of running()) {
    const k = (Number(s.slice('emulator-'.length)) - 5554) / 2;
    console.log(`${s}  DevTools http://localhost:${9333 + k}/json`);
  }
  process.exit(0);
}

if (cmd !== 'start') {
  console.error('usage: node scripts/android/pool.mjs start [n] [url] | list | stop');
  process.exit(2);
}

const n = Number(countArg ?? 1);
const logs = join(root, '.phone', 'android', 'pool-logs');
mkdirSync(logs, { recursive: true });
const up = running();
const all = Array.from({ length: n }, (_, k) => instance(k));
for (const e of all) {
  if (up.includes(e.serial)) continue;
  const out = openSync(join(logs, `${e.serial}.log`), 'w');
  // Host OpenGL through the PC's GPU, with the guest's Vulkan off: with it on,
  // Chrome drew through Vulkan and its GPU process died now and then (Vulkan
  // BindImageMemory -2, "Skia OOM"), the page going white or stale. Detached,
  // so the emulators outlive this script and the terminal that ran it.
  const args = ['-avd', AVD, '-read-only', '-ports', `${e.port},${e.port + 1}`, '-gpu', 'host', '-feature', '-Vulkan',
    '-memory', '3072', '-cores', '4', '-no-boot-anim', '-no-snapshot', '-no-audio'];
  spawn(emulatorExe, args, { detached: true, stdio: ['ignore', out, out] }).unref();
  console.log(`${e.serial} starting (log in .phone/android/pool-logs/)`);
}
for (const e of all) {
  const until = Date.now() + 300_000;
  while (adb('-s', e.serial, 'shell', 'getprop', 'sys.boot_completed') !== '1') {
    if (Date.now() > until) {
      console.error(`${e.serial} didn't boot in 5 minutes: see its log`);
      process.exit(1);
    }
    await sleep(2000);
  }
  adb('-s', e.serial, 'forward', `tcp:${e.cdp}`, 'localabstract:chrome_devtools_remote');
  adb('-s', e.serial, 'shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', url);
  for (let i = 0; i < 30; i++) {
    const ok = await fetch(`http://localhost:${e.cdp}/json/version`).then((r) => r.ok, () => false);
    if (ok) break;
    await sleep(1000);
  }
  console.log(`${e.serial} ready: Chrome's DevTools on http://localhost:${e.cdp}/json`);
}
