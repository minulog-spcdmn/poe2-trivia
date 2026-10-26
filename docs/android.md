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
node scripts/android/pool.mjs start 3
```

starts three emulators side by side (`start` alone starts one), waits for
them to boot and opens Chrome on each. They run read-only on the one AVD, so
each starts from the same clean state and none keeps what's done in it.
Instance k (from 0) is the adb serial `emulator-<5554 + 2k>`, with its
Chrome's DevTools forwarded to `http://localhost:<9333 + k>`.
`pool.mjs list` names those running, `pool.mjs stop` stops them all.

With several running, always give adb the serial: `adb -s emulator-5556 ...`.
A command without it fails, or lands on someone else's.

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
- **Screenshots**: `adb -s <serial> exec-out screencap -p > shot.png`.
- **A tab killed in the background**: Home, then `adb shell am kill
  com.android.chrome`, then open Chrome again: it restores the tab, as
  Android does when it needs a phone's memory.

`node scripts/android/gpu.mjs [port]` says whether an emulator's Chrome
draws on the PC's GPU, and how it keeps up: one emulator drawing alone holds
60 fps on the start page and a codex scroll, two at once 50 to 60.

## What the emulator taught us

- **Vulkan off.** With the guest's Vulkan on, Chrome draws through it, and
  its GPU process died now and then (`BindImageMemory -2`, "Skia OOM"): the
  page went white or stopped updating. With it off (`-feature -Vulkan`,
  which pool.mjs passes) Chrome draws through GLES, on the RTX 5070.
- **The CPU is the limit, not the GPU.** An emulator drawing the game uses
  about four of the PC's cores (the host translating GL, the hypervisor) and
  only a few percent of the GPU. One draws at 60 fps, two at 50 to 60;
  three at once starve each other (6 to 21 fps). So run as many as there is
  work for, and park the idle ones.
- **A white page now and then is the emulator's.** If Chrome's GPU process
  dies anyway, reload; a phone doesn't do that.
