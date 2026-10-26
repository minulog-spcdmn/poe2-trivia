# Testing on Android

The owner has no Android phone, but many visitors will bring one, so Android
Chrome gets checked on emulators on this PC: Google's own Android Emulator
with a Pixel 7 and the Play Store's Chrome, driven from the PC through adb
and Chrome's DevTools Protocol. They are real Android and real Chrome (its
layout, its keyboard, Back, pull to refresh, a tab killed in the background
and restored), so what they show about how the app behaves holds for a
phone.

Their speed doesn't. The emulator runs Android on the PC's CPU and
translates every GL call for the PC's GPU, so its frame rates say nothing
about a phone's: performance gets measured on the iPhone (docs/iphone.md).

## What's set up

Done once, in October 2026.

- The Android SDK in `%LOCALAPPDATA%\Android\Sdk`: the command-line tools,
  `platform-tools` (adb), `emulator` (37.2) and the system image
  `system-images;android-36;google_apis_playstore;x86_64` (Android 16 with
  the Play Store's Chrome). Only `android-sdk-license` was accepted.
- The AVD **poe2quest-pixel**: a Pixel 7 (1080 x 2400, density 420, so
  Chrome's page is about 412 x 915 CSS px upright, 863 x 304 on its side
  with Chrome's bars up, 915 x 412 in fullscreen), 3 GB, 4 cores, the GPU in
  host mode (`hw.gpu.mode=host` in its `config.ini`). It runs on Windows'
  own hypervisor (WHPX), which this PC already had on.
- Chrome on it is past its first run: no account, usage and crash reports
  off, every other offer declined. The emulator's own crash reports are set
  to Never (its settings, `crashReportPreference` 2 under
  `HKCU\Software\Android Open Source Project\Emulator\set`): set to Ask, a
  crash left behind stops the next start at a dialog until someone answers.

## Every time

```sh
node scripts/android/pool.mjs start 2
node scripts/android/pool.mjs watch 2
```

`start` starts two emulators side by side (`start` alone starts one), waits
for them to boot and opens Chrome on each, on a clean slate: any tab left
from before is closed and whatever any build's site kept (every origin on
`10.0.2.2` and `localhost`, ports 4400 to 4499) is cleared, so a first
visit is a first visit. They run read-only on the one AVD, so none keeps
what's done in it. Instance k (from 0) is the adb serial
`emulator-<5554 + 2k>`, with its Chrome's DevTools forwarded to
`http://localhost:<9333 + k>`. `pool.mjs list` names those running,
`pool.mjs stop` stops them all (and a `watch`).

`watch` runs until stopped (in the background): it restarts an instance
whose emulator is gone, whose adb stops answering, or whose Chrome stays
silent for minutes, and restarts a worn one (up two and a half hours, on an
old graphics channel, or logging graphics errors by the hundred) once all
its tabs have sat on about:blank for five minutes. A restart drops its
`adb reverse` rules, so a run that drives one sets them again when it
finds the instance new. Its log is
`.phone/android/pool-logs/pool.log`; each instance's own log keeps every
boot's output, one after the other. The emulator writes that output in
4 KB blocks, so while it runs its log lags behind by up to 4 KB (the
worn rule's count of graphics errors with it), the lines carry no time, and
an emulator that dies loses its last block. Count errors in a log only once
its emulator has exited.

The windows open along the top of a second monitor, if there is one (instance
k in column k), never on the main screen, and the emulators' consoles stay
hidden. Turning a phone on its side can move its window: `watch` puts back
any that lands on the main screen, and `pool.mjs place [n]` puts them all
back in their columns.

Two drawing at once is the most this PC carries smoothly (below, "Why it's
slow"). With several running, always give adb the serial: `adb -s
emulator-5556 ...`. A command without it fails, or lands on someone else's.

Builds are the iPhone's (docs/iphone.md, "Builds for the phone"), served on
the PC: an emulator reaches the PC as `10.0.2.2`, so a build on port 4403 is
`http://10.0.2.2:4403/`. That's plain http, not a secure page, and the
clipboard, `crypto.subtle` (so rooms), and the wake lock need one: for those,
`adb -s <serial> reverse tcp:4403 tcp:4403` and open
`http://localhost:4403/`, which Chrome counts as secure. Two emulators can
play each other that way; the local channel signals through the PeerJS cloud.

When you're done with one, park its tab: `node scripts/android/park.mjs`
(every instance; or name the DevTools ports). A tab left on the game keeps
drawing its backdrop, and that costs the PC about four cores per emulator; a
blank page costs nothing.

## Driving it

- **Input**: `adb -s <serial> shell input tap X Y` (device pixels, 1080 x
  2400 upright), `input swipe X1 Y1 X2 Y2 <ms>` (the same point held 800 ms
  is a long press), `input keyevent 4` (Back), `3` (Home), `input text`.
  Native UI (Chrome's menus, Gboard) is in `uiautomator dump`.
- **The page**: Chrome's DevTools Protocol on the forwarded port
  (`scripts/android/cdp.mjs`: `page(port)` gives `send` and `ev`).
- **On its side**: `adb shell settings put system accelerometer_rotation 0`,
  then `user_rotation 1` (and `0` to stand it up again).
- **Other phones' sizes**: `adb shell wm density <n>` changes the page's CSS
  size (461 gives 375 px wide); `wm density reset` after.
- **Screenshots**: `adb -s <serial> exec-out screencap -p > shot.png`, now
  and then. Not DevTools' `Page.captureScreenshot` in a loop: it reads the
  frame back through the emulator's GL translator, the path its
  `glReadPixels` errors and one instance's death came from.
- **A tab killed in the background**: Home, then `adb shell am kill
  com.android.chrome`, then open Chrome again: it restores the tab, as
  Android does when it needs a phone's memory.

`node scripts/android/gpu.mjs [port]` says whether an emulator's Chrome
draws on the PC's GPU, and how it keeps up: on a quiet PC one emulator
drawing alone held 60 fps on the start page and a codex scroll, two at once
58 and 49, three at once 6 to 21 (below, "Why it's slow").

## What the emulator taught us

- **Vulkan off.** With the guest's Vulkan on, Chrome draws through it, and
  its GPU process died now and then (`BindImageMemory -2`, "Skia OOM"): the
  page went white or stopped updating. It was slower too (a game scene at 8
  fps where GLES drew 34). With it off (`-feature -Vulkan`, which pool.mjs
  passes) Chrome draws through GLES, on the RTX 5070.
- **Why it's slow: the CPU, not the GPU.** The emulator's qemu is a 2.12
  fork whose Windows hypervisor code (WHPX) handles the virtual phone's
  timers, interrupts, clock and graphics doorbells in the PC's user space, so
  each is a trip out of the VM, about 2,000 a frame. The guest shows it as
  kernel time: about 95% of every process's CPU, Chrome's GPU process 2.7 s
  of user time against 2,518 s of kernel. Each trip waits for a free core on
  the PC, so an emulator's frame rate follows how busy the PC is: the start
  page at 39 to 48 fps with the PC at 31%, 2 to 11 fps at 95% and over.
  Each one drawing takes four to five of the PC's 16 threads: two at once
  held 58 and 49 fps with the PC at 74%, three at once fell to 6 to 21, and
  with other work on the PC to 1 or 2. Run as many as there is work for,
  and park the idle ones.
- **The graphics channel: asg.** The AVD was made with `hw.gltransport=pipe`
  (the goldfish pipe, a trip out of the VM for every flush). pool.mjs sets
  `asg` (shared memory) in the AVD's `config.ini` before each boot: the
  guest's kernel time about halves and a frame costs the PC 15 to 25% less
  CPU (100 to 140 CPU-ms a frame against 120 to 220, same pages and load).
  Frame rates move less, as the PC's load decides them.
- **The clock.** The guest kernel takes the TSC for unsynchronized (it
  guesses so for any non-Intel CPU with more than one core) and reads the
  time from an emulated HPET, so `performance.now()` costs 20 to 70 µs
  there, against well under 1 on a phone. `kernel.parameters=tsc=reliable`
  in `config.ini` makes it 0.6 µs, but with four cores the display's vsync
  stops within seconds (the cores' clocks really differ); with `-cores 1`
  the kernel keeps the TSC by itself but the page draws slower. Neither is
  worth it: the clock is one kind of trip out among many.
- **What didn't help**: 2 or 6 cores instead of 4 (2 drew 1 to 3 fps, 6 no
  better), a bigger asg write step, no device frame (`-skin 1080x2400`),
  the virtio-gpu channel (this image falls back to the pipe).
- **Worn instances.** Those that ran for hours on the pipe channel logged
  "Failed to find ColorBuffer" by the hundred, and then one died (a
  `glReadPixels` error in the GL translator), one hung (adb silent) and one
  went black with Chrome still running. `watch` restarts them when idle
  before they get there, and restarts what dies anyway.
- **A hang on the asg channel too.** On 26 October 2026 one instance, 77
  minutes into an agent's run, logged eight "Failed to find ColorBuffer" /
  "Failed to bind to texture" pairs, then the emulator's own watchdog found
  its main loop and all four CPU threads silent for 15 s and ended it on
  purpose (it dumps and dies; with crash reports on Never the dump is
  deleted at the next start). `watch` had it back in under a minute. A
  run on an instance that vanishes should take the next free one.
- **A launch can hang.** Twice, one launched a few seconds after the
  instance before it on the same ports was killed came up as a qemu that
  never printed a line or booted. pool.mjs now waits for everything the old
  one left (its qemu's crash handler too) to be gone and its log free before
  a launch, and stops and relaunches one that adb hasn't seen two minutes on.
- **A white page now and then is the emulator's.** If Chrome's GPU process
  dies anyway, reload; a phone doesn't do that.
- **Keep the AVD's base clean.** Launched without `-read-only`, an emulator
  writes into the AVD itself, and every instance after inherits it. On 26
  October 2026 something wrote the AVD's user data that way: from then on
  each fresh instance came up with a stray tab and site data on the builds'
  origins (the fullscreen tip already shown, the Delve intro seen, a name).
  pool.mjs clears both at every start; launch through pool.mjs, never by
  hand.
- **Bigger levers, not taken.** Each would need the owner: Google's
  next-generation emulator (upstream QEMU 11, with the interrupt controller
  in the hypervisor; a preview, only for API 37 images, from Android Studio
  Canary), or the AEHD driver instead of WHPX (Hyper-V off, so a second boot
  entry; retired by Google at the end of 2026).

## Emulator 37.3.5 on trial

37.3.5 is a dev-channel build (the Android SDK Preview License, which the
owner accepted for it) installed beside the SDK in
`%LOCALAPPDATA%\Android\emulator-37.3.5\`. It carries gfxstream's fix
ca53620 for a GL context left unbound when another thread's bind fails,
which in a third party's CI lost the device in 6 of 3,622 runs on 37.2.12
and 0 of 10,002 on 37.3.5. pool.mjs boots the second instance
(`emulator-5556`) on it, so a pool of two or more runs one beside the SDK's
37.2.12; `pool.mjs list` and each boot line in the instance's log say which.
`EMULATOR_TRIAL=off` before `start` or `watch` keeps them all on 37.2.12.

Measured on 26 October 2026, one instance at a time on a copy of the AVD,
alternating versions: no speed difference (every interval took in zero; the
PC's load moves fps by about 1 per point of host CPU, far more than the
version), 9 of 9 and 8 of 8 boots, 30 of 30 Chrome restarts, 606 of 606
DevTools screenshots on each, 10 minutes of a game scene on each. One 37.3.5
boot's Chrome never answered DevTools, cause unknown. None of that says
which one stays up for hours: 37.2.12 hung once in about 7 instance-hours
(above, "A hang on the asg channel too"), and that hang didn't show the
fix's signature ("context was preempted", "Failed to restore previous
context: 12297"), so 37.3.5 may not fix it.

So the trial: count, per version, hangs and deaths, Chrome failures the
watchdog had to repair, and black or stale screens, from logs after their
emulator exited. Put 37.2.12 back on that instance (`EMULATOR_TRIAL=off`)
at the first hang, a start failure that repeats, lost graphics, or a page
that draws differently. Move all three over once the trial instance has run
about seven hours clean, or sooner if a 37.2.12 hang's log shows the fix's
signature before its hang lines.
