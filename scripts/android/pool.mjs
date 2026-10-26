// Starts Android emulators side by side for checking the app on Android
// (docs/android.md), all read-only on the one AVD, so each boots from the same
// clean state with Chrome past its first run and none keeps what's done in it.
// Instance k gets the console port 5554 + 2k (adb serial emulator-<port>) and
// its Chrome's DevTools on http://localhost:<9333 + k>.
//   node scripts/android/pool.mjs start [n=1] [url=http://10.0.2.2:4404/]
//   node scripts/android/pool.mjs watch [n=1]   (until stopped: restarts any that die or hang)
//   node scripts/android/pool.mjs place [n=1]   (puts their windows on the second monitor again)
//   node scripts/android/pool.mjs list
//   node scripts/android/pool.mjs stop

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../iphone/phone.mjs';
import { connect } from './cdp.mjs';

const sdk = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const adbExe = join(sdk, 'platform-tools', 'adb.exe');
const emulatorExe = join(sdk, 'emulator', 'emulator.exe');
const AVD = 'poe2quest-pixel';
const avdConfig = join(process.env.USERPROFILE ?? '', '.android', 'avd', `${AVD}.avd`, 'config.ini');
const logs = join(root, '.phone', 'android', 'pool-logs');
// Written by stop, so a watch still running doesn't bring them back.
const stopped = join(root, '.phone', 'android', 'pool-stopped');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// windowsHide everywhere: without it each adb or PowerShell call flashes a
// console window on the PC's screen.
const adb = (args, timeout = 30000) => {
  try {
    return execFileSync(adbExe, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch {
    return '';
  }
};
const powershell = (command) => {
  try {
    return execFileSync('powershell', ['-NoProfile', '-c', command], { encoding: 'utf8', timeout: 60000, windowsHide: true }).trim();
  } catch {
    return '';
  }
};
const instance = (k) => ({ k, port: 5554 + 2 * k, serial: `emulator-${5554 + 2 * k}`, cdp: 9333 + k });
const running = () => [...adb(['devices']).matchAll(/^(emulator-\d+)\s+device$/gm)].map((m) => m[1]);
const qemu = (e) => powershell(`Get-CimInstance Win32_Process -Filter "name like 'qemu%'" | ? { $_.CommandLine -match '-ports ${e.port},' } | select -first 1 -expand ProcessId`);
// Everything of an instance: its cmd, emulator.exe and qemu, which carry its
// ports, and its qemu's crash handler, which doesn't and is known by its
// parent, the qemu its last boot started (kept in <serial>.qemu, so it's
// found once that qemu is gone too, as long as nothing else took its id).
const qemuFile = (e) => join(logs, `${e.serial}.qemu`);
const holders = (e) => {
  const last = existsSync(qemuFile(e)) ? Number(readFileSync(qemuFile(e), 'utf8')) || 0 : 0;
  return powershell(`$all = Get-CimInstance Win32_Process -Filter "name='cmd.exe' or name='emulator.exe' or name like 'qemu%' or name='crashpad_handler.exe'"
$mine = @($all | ? { $_.CommandLine -match '-ports ${e.port},' })
$taken = $all | ? { $_.ProcessId -eq ${last} -and -not ($mine.ProcessId -contains ${last}) }
$crash = if ($taken) { @() } else { @($all | ? { $_.Name -eq 'crashpad_handler.exe' -and $_.ParentProcessId -eq ${last} -and $_.CommandLine -match 'AndroidEmulator' }) }
($mine + $crash).ProcessId`).split(/\s+/).filter(Boolean);
};
const stopAll = (ids) => ids.length && powershell(`Stop-Process -Id ${ids.join(',')} -Force`);
const listed = (e) => new RegExp(`^${e.serial}\\s`, 'm').test(adb(['devices']));
// cmd can't append to a file another process still has open.
const free = (file) => powershell(`try { [IO.File]::Open('${file.replace(/'/g, "''")}', 'OpenOrCreate', 'Write', 'None').Close(); 'free' } catch { 'held' }`) === 'free';
const say = (line) => {
  const stamped = `${new Date().toTimeString().slice(0, 8)} ${line}`;
  console.log(stamped);
  appendFileSync(join(logs, 'pool.log'), stamped + '\n');
};

// Host OpenGL through the PC's GPU, with the guest's Vulkan off: with it on,
// Chrome drew through Vulkan and its GPU process died now and then (Vulkan
// BindImageMemory -2, "Skia OOM"), the page going white or stale; and with
// it on, a game scene drew at 8 fps where GLES drew 34.
const flags = (e) => ['-avd', AVD, '-read-only', '-ports', `${e.port},${e.port + 1}`, '-gpu', 'host', '-feature', '-Vulkan',
  '-memory', '3072', '-cores', '4', '-no-boot-anim', '-no-snapshot', '-no-audio'];

// GL goes from the guest to the host through shared memory (asg) rather than
// the goldfish pipe, whose every flush is a trip out of the VM: the guest's
// kernel time about halves and each frame costs the PC 15-25% less CPU
// (October 2026, same pages and load: 100-140 CPU-ms a frame against
// 120-220). It's an AVD setting, not a flag, so it's put in before each boot.
const TRANSPORT = 'asg';
const useTransport = () => {
  const ini = readFileSync(avdConfig, 'utf8');
  const next = /^hw\.gltransport=/m.test(ini) ? ini.replace(/^hw\.gltransport=.*$/m, `hw.gltransport=${TRANSPORT}`) : `${ini}hw.gltransport=${TRANSPORT}\n`;
  if (next !== ini) writeFileSync(avdConfig, next);
};

// Started through a cmd with a hidden console, so the emulator, its qemu and
// whatever they start (qemu opens consoles of its own as it shuts down) all
// share that hidden console: started detached from node instead, with no
// console, each of them would flash one up on the PC's screen. Start-Process
// also keeps it out of node's job, so it outlives this script. Each boot's
// output goes on the end of the instance's log, so a crash's log survives
// the restart.
// A launch now and then hung before it printed a line, its qemu up but never
// booting (twice in a row on 26 October 2026, each a few seconds after the
// instance before it on those ports was killed). So each launch waits for
// whatever the last one left to be gone and its log to be free, counts only
// once adb sees the new emulator, and is stopped and tried again when adb
// hasn't two minutes on.
const boot = async (e) => {
  useTransport();
  const log = join(logs, `${e.serial}.log`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (let i = 0; i < 30 && (holders(e).length || !free(log)); i++) await sleep(2000);
    stopAll(holders(e));
    appendFileSync(log, `\n===== ${new Date().toISOString()} boot\n`);
    const line = `""${emulatorExe}" ${flags(e).join(' ')} >> "${log}" 2>&1"`;
    try {
      execFileSync('powershell', ['-NoProfile', '-c', `Start-Process -FilePath cmd.exe -ArgumentList '/c ${line.replace(/'/g, "''")}' -WindowStyle Hidden`], { timeout: 60000, windowsHide: true, stdio: 'pipe' });
    } catch (err) {
      say(`${e.serial}: Start-Process failed: ${String(err.stderr ?? err).trim().slice(0, 200)}`);
    }
    let pid = '';
    for (let i = 0; i < 30 && !pid; i++) {
      await sleep(2000);
      pid = qemu(e);
    }
    if (!pid) {
      say(`${e.serial}: no emulator a minute after launch ${attempt}`);
      continue;
    }
    writeFileSync(qemuFile(e), pid);
    for (let i = 0; i < 60; i++) {
      if (listed(e)) return true;
      await sleep(2000);
    }
    say(`${e.serial}: launch ${attempt} hung before adb saw it, stopping it`);
    stopAll(holders(e));
  }
  return false;
};

// The emulators' windows go side by side along the top of a second monitor,
// if there is one, so they stay off the main screen: instance k in column k
// (wrapping when the monitor is full). An emulator opens its window where the
// AVD's emulator-user.ini says and goes back there once started, so that's set
// before each boot, and the window is moved there too once it shows.
let monitor;
const slot = (e) => {
  if (monitor === undefined) {
    const m = powershell(`Add-Type -AssemblyName System.Windows.Forms
$s = [System.Windows.Forms.Screen]::AllScreens | ? { -not $_.Primary } | select -first 1
if ($s) { '{0},{1},{2}' -f $s.WorkingArea.X, $s.WorkingArea.Y, $s.WorkingArea.Width }`).split(',').map(Number);
    monitor = m.length === 3 ? { x: m[0], y: m[1], width: m[2] } : null;
  }
  if (!monitor) return null;
  const step = 476; // a 424 px wide window and its toolbar
  return { x: monitor.x + 11 + (e.k % Math.max(1, Math.floor(monitor.width / step))) * step, y: monitor.y + 41 };
};
const remember = (e) => {
  const at = slot(e);
  const ini = join(process.env.USERPROFILE ?? '', '.android', 'avd', `${AVD}.avd`, 'emulator-user.ini');
  if (!at || !existsSync(ini)) return;
  // The window's outer edge sits 7 px left of the position the emulator saves.
  writeFileSync(ini, readFileSync(ini, 'utf8').replace(/^window.x = .*$/m, `window.x = ${at.x + 7}`).replace(/^window.y = .*$/m, `window.y = ${at.y}`));
};
const place = async (e) => {
  const at = slot(e);
  if (!at) return 'one monitor';
  for (let i = 0; i < 60; i++) {
    const r = powershell(`$p = Get-CimInstance Win32_Process -Filter "name like 'qemu%'" | ? { $_.CommandLine -match '-ports ${e.port},' } | select -first 1
if (-not $p) { 'gone'; exit }
$h = (Get-Process -Id $p.ProcessId).MainWindowHandle
if ($h -eq 0) { 'no window'; exit }
Add-Type 'using System; using System.Runtime.InteropServices; public class PoolWindow { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); }'
[void][PoolWindow]::SetWindowPos($h, [IntPtr]::Zero, ${at.x}, ${at.y}, 0, 0, 0x15)
'placed'`);
    if (r !== 'no window' && r !== '') return r;
    await sleep(1000);
  }
  return 'no window';
};
// A window that has wandered onto the main screen (turning the phone on its
// side moves and resizes it) goes back to its place; anywhere else it's left.
const offMain = (e) => {
  const at = slot(e);
  if (!at) return '';
  return powershell(`$p = Get-CimInstance Win32_Process -Filter "name like 'qemu%'" | ? { $_.CommandLine -match '-ports ${e.port},' } | select -first 1
if (-not $p) { exit }
$h = (Get-Process -Id $p.ProcessId).MainWindowHandle
if ($h -eq 0) { exit }
Add-Type -AssemblyName System.Windows.Forms
Add-Type 'using System; using System.Runtime.InteropServices; public struct PoolRect { public int L, T, Rt, B; } public class PoolGuard { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out PoolRect r); [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); }'
$r = New-Object PoolRect
[void][PoolGuard]::GetWindowRect($h, [ref]$r)
$m = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
if ($r.L -lt $m.Right -and $r.Rt -gt $m.Left -and $r.T -lt $m.Bottom -and $r.B -gt $m.Top) {
  [void][PoolGuard]::SetWindowPos($h, [IntPtr]::Zero, ${at.x}, ${at.y}, 0, 0, 0x15)
  'moved'
}`);
};

// Every build is served on a port in 4400-4499, reached as 10.0.2.2 or, through
// adb reverse, localhost. Whatever a site kept there is cleared, so a first
// visit on an instance is a first visit even if the AVD's base was ever written.
const origins = [...Array(100).keys()].flatMap((i) => [`http://10.0.2.2:${4400 + i}`, `http://localhost:${4400 + i}`]);

/** Waits for Android, forwards Chrome's DevTools, opens Chrome on url with no other tab and no site data. */
const ready = async (e, url) => {
  const until = Date.now() + 300_000;
  while (adb(['-s', e.serial, 'shell', 'getprop', 'sys.boot_completed']) !== '1') {
    if (Date.now() > until) return false;
    await sleep(2000);
  }
  adb(['-s', e.serial, 'forward', `tcp:${e.cdp}`, 'localabstract:chrome_devtools_remote']);
  adb(['-s', e.serial, 'shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', 'about:blank']);
  const json = (path, method) => fetch(`http://localhost:${e.cdp}/json${path}`, { method }).then((r) => r.json(), () => null);
  let tabs = null;
  for (let i = 0; i < 60 && !tabs?.some((t) => t.type === 'page'); i++) {
    await sleep(1000);
    tabs = await json('');
  }
  if (!tabs) return false;
  let keep = tabs.find((t) => t.type === 'page' && t.url === 'about:blank');
  if (!keep) keep = await json('/new?about:blank', 'PUT');
  for (const t of tabs) if (t.type === 'page' && t.id !== keep.id) await fetch(`http://localhost:${e.cdp}/json/close/${t.id}`).catch(() => {});
  const p = await connect(keep.webSocketDebuggerUrl);
  for (const origin of origins) await p.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
  await p.send('Page.navigate', { url });
  p.close();
  return true;
};

const [cmd = 'list', countArg, url = 'http://10.0.2.2:4404/'] = process.argv.slice(2);
mkdirSync(logs, { recursive: true });

if (cmd === 'stop') {
  writeFileSync(stopped, '');
  for (const s of running()) {
    adb(['-s', s, 'emu', 'kill']);
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

const n = Number(countArg ?? 1);
const all = Array.from({ length: n }, (_, k) => instance(k));

if (cmd === 'place') {
  for (const e of all) console.log(`${e.serial}: ${await place(e)}`);
  process.exit(0);
}

if (cmd === 'start') {
  rmSync(stopped, { force: true });
  const up = running();
  for (const e of all) {
    if (up.includes(e.serial)) continue;
    remember(e);
    if (!(await boot(e))) {
      console.error(`${e.serial} never started: see its log and pool.log in .phone/android/pool-logs/`);
      process.exit(1);
    }
    console.log(`${e.serial} starting (log in .phone/android/pool-logs/)`);
    await place(e);
  }
  for (const e of all) {
    if (up.includes(e.serial)) continue;
    if (!(await ready(e, url))) {
      console.error(`${e.serial} didn't come up in 5 minutes: see its log`);
      process.exit(1);
    }
    await place(e);
    console.log(`${e.serial} ready: Chrome's DevTools on http://localhost:${e.cdp}/json`);
  }
  process.exit(0);
}

if (cmd === 'watch') {
  // What tells a dead or hung instance from a busy one: its qemu gone; adb
  // not answering a shell for three checks in a row (a busy guest still
  // answers, adbd is its own process); Chrome's DevTools silent for long
  // after adb answers. A tab mid-test isn't touched for anything less.
  const misses = new Map(all.map((e) => [e.serial, { adb: 0, cdp: 0 }]));
  const restart = async (e, why) => {
    say(`${e.serial}: ${why}, restarting`);
    // (boot waits for it to go down, and stops what's left after a minute.)
    adb(['-s', e.serial, 'emu', 'kill'], 10000);
    remember(e);
    const started = await boot(e);
    await place(e);
    const ok = started && (await ready(e, 'about:blank'));
    await place(e);
    say(`${e.serial}: ${ok ? 'back, Chrome on about:blank' : started ? "didn't come back in 5 minutes" : 'never started'}`);
    misses.set(e.serial, { adb: 0, cdp: 0 });
  };
  say(`watching ${all.map((e) => e.serial).join(', ')}`);
  for (;;) {
    for (const e of all) {
      if (existsSync(stopped)) process.exit(0);
      const m = misses.get(e.serial);
      if (!qemu(e)) {
        await restart(e, 'its emulator is gone');
        continue;
      }
      if (offMain(e) === 'moved') say(`${e.serial}: its window was on the main screen, moved it back`);
      m.adb = adb(['-s', e.serial, 'shell', 'echo', 'ok'], 30000) === 'ok' ? 0 : m.adb + 1;
      if (m.adb >= 3) {
        await restart(e, 'adb has had no answer for three checks');
        continue;
      }
      if (m.adb) continue;
      const cdp = await Promise.race([fetch(`http://localhost:${e.cdp}/json/version`).then((r) => r.ok, () => false), sleep(10000).then(() => false)]);
      m.cdp = cdp ? 0 : m.cdp + 1;
      if (m.cdp === 4) {
        say(`${e.serial}: Chrome's DevTools silent, opening Chrome again`);
        adb(['-s', e.serial, 'forward', `tcp:${e.cdp}`, 'localabstract:chrome_devtools_remote']);
        adb(['-s', e.serial, 'shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main']);
      }
      if (m.cdp >= 9) await restart(e, "Chrome's DevTools have been silent for minutes");
      if (!cdp) continue;
      // Worn ones are restarted the next time they sit idle (every tab on
      // about:blank for five minutes, so not while someone driving it has
      // only parked it between steps; a restart drops their adb reverse
      // too): one booted on an old graphics
      // channel, one up for over two and a half hours, or one whose emulator
      // has logged its graphics errors by the hundred since it booted. Those
      // that ran for hours did that, and then hung, died or went black.
      m.transport ??= adb(['-s', e.serial, 'shell', 'getprop', 'ro.boot.qemu.gltransport.name']);
      const up = Number(adb(['-s', e.serial, 'shell', 'cat', '/proc/uptime']).split(' ')[0]);
      const logFile = join(logs, `${e.serial}.log`);
      const log = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('===== ').at(-1) : '';
      const errors = (log.match(/Failed to find ColorBuffer|context was preempted/g) ?? []).length;
      const worn = m.transport && m.transport !== TRANSPORT ? `on the ${m.transport} graphics channel`
        : up > 150 * 60 ? `up ${Math.round(up / 60)} minutes`
        : errors > 200 ? `${errors} graphics errors in its log` : '';
      const tabs = worn ? await fetch(`http://localhost:${e.cdp}/json`).then((r) => r.json(), () => null) : null;
      const idle = tabs?.filter((t) => t.type === 'page').every((t) => t.url === 'about:blank');
      m.idleSince = worn && idle ? (m.idleSince ?? Date.now()) : undefined;
      if (m.idleSince && Date.now() - m.idleSince > 5 * 60_000) await restart(e, `idle and worn (${worn})`);
    }
    await sleep(20000);
  }
}

console.error('usage: node scripts/android/pool.mjs start [n] [url] | watch [n] | place [n] | list | stop');
process.exit(2);
