# Testing on the owner's iPhone

The owner's iPhone can be driven from this PC over USB: Chrome on it takes
Safari's Web Inspector protocol, through `ios_webkit_debug_proxy`, and the
scripts in `scripts/iphone/` load a build into its tab, open the codex or
play a game, and measure what the phone's frames got. So an iPhone problem
gets measured and checked there, by the session, rather than by asking the
owner to try a build and say how it feels.

Nothing on this PC stands in for it. WebKit in Playwright runs the codex at
about 7 fps here, slow or not, and an iPhone's costs (its compositor, its
layers, a main thread several times slower) don't show in desktop Chrome.
(Android Chrome does have a stand-in here, emulators: docs/android.md.)

## What's set up

Done once, in October 2026.

On the PC:

- **Apple Devices** (Microsoft Store, `winget install --id 9NP83LWLPZ9K
  --source msstore`): Apple's device service (usbmuxd, on port 27015), which
  talks to the phone over USB.
- **ios_webkit_debug_proxy** 1.9.1, the Windows build from
  [google/ios-webkit-debug-proxy](https://github.com/google/ios-webkit-debug-proxy/releases)
  (`ios-webkit-debug-proxy-1.9.1-win64-bin.zip`), unpacked in
  `%LOCALAPPDATA%\ios-webkit-debug-proxy\`.
- The PC is **192.168.178.88** on the home Wi-Fi (check with `ipconfig`; the
  router can change it). The phone loads builds from there.

On the phone ("miniminu", iOS 27; the owner uses Chrome and the home-screen
app, and has no Safari):

- Chrome: **⋯ → Settings → Content Settings → Web Inspector** on.
- This PC trusted (**Trust** and the passcode, the first time it's plugged in).
- The home-screen app can be driven too, while it's in front (iOS holds a
  background app's scripts), though Safari's own setting (Settings → Apps →
  Safari → Advanced → Web Inspector) isn't there without Safari. The phone
  lists Chrome's pages and the app's together, in no set order: the scripts
  take Chrome's (`CriOS` in its user agent), `IPHONE_APP=app` the app's,
  `IPHONE_APP=any` the first listed. Before that, a whole day of runs (26
  October 2026) drove the app's page taking it for Chrome's.

What each reads (that day: iOS 27.0.1, Chrome 155):

- **Chrome's tab**: `navigator.standalone` false, display-mode browser, 393 x
  665 with its bars up, 100lvh 773. The game takes a browser's path.
- **The home-screen app**, opened fresh at poe2.quest: Safari's user agent,
  `standalone` true, display-mode fullscreen, 393 x 793, 100svh 793 but
  100lvh 852. The game takes the app's path. The PC's builds are out of its
  scope, so the app itself can only be read on the live site.
- **The app sent to the PC's address**, out of its scope: iOS shows the page
  in the app's in-app browser view, bars like Safari's, 393 x 663, still
  `standalone` true and fullscreen, so the game takes the app's path under
  a browser's bars. That's neither a player's Chrome nor their app: speed
  measured there is still WebKit on this phone (Safari's and Chrome's
  engine on iOS), but nothing that hangs on being installed
  (`installedApp()`, `standalone`, display-mode, the heights) is.

Chrome turns an address typed without `http://` into `https://`, which the
PC's builds don't serve (`ERR_SSL_PROTOCOL_ERROR`): type it in full, or send
the tab there from the PC.

## Every time

1. The owner plugs the phone in, unlocked, with Chrome in front showing any
   web page. (Chrome's new-tab page, `about://newtab/`, is listed but runs
   nothing.) Ask for this once; everything after is the session's.
2. Start Apple's device service, if it isn't running since the PC started:
   it runs once the Apple Devices app has been opened.

   ```powershell
   Start-Process "shell:AppsFolder\AppleInc.AppleDevices_nzyj5cx40ttqa!App"
   ```

   `Get-NetTCPConnection -LocalPort 27015 -State Listen` answers once it's up.
3. Start the proxy, in the background (it runs until stopped):

   ```bash
   "$LOCALAPPDATA/ios-webkit-debug-proxy/ios_webkit_debug_proxy.exe" -c null:9221,:9222-9322
   ```

   `curl -s localhost:9221/json` lists the phone, and `curl -s
   localhost:9222/json` its tabs.
4. Check it answers:

   ```bash
   node scripts/iphone/ask.mjs "navigator.userAgent"
   ```

When it doesn't:

- **`connect function failed with error 10061`, "No device found"**: the
  device service isn't running. Open Apple Devices (step 2), then start the
  proxy again.
- **The proxy runs but lists no phone**: it was started before the phone was
  plugged in and trusted. Stop it and start it again.
- **"no answer to Runtime.evaluate"**: the phone is locked, or Chrome isn't in
  front. Commands are taken and never run.
- **"no web page open on the phone"**: the tab is on the new-tab page. The
  owner opens any site in it once.
- **The tab never reaches the build**: the build isn't served, the PC's
  address changed, or the phone isn't on the home Wi-Fi. If Windows asks
  whether Node.js may take connections, allow it.
- **A tab's `devtoolsFrontendUrl` is empty** in the list: something is still
  connected to it (a script that didn't finish). Stop it.
- Don't run the proxy with `--debug` in the background: it floods its output.

## Builds for the phone

```bash
node scripts/iphone/build.mjs after
node scripts/iphone/serve.mjs after=4403
```

`build.mjs` builds this checkout into `.phone/<name>/` (kept out of the
repo) in the local channel, so the `?off=` switches (`src/lib/switchedOff.ts`)
and `?fps` work and its rooms are this machine's alone, with source maps kept
for `profile.mjs`. Its first visit fills the phone's codex as a long-time
player's would be (every item seen, 2000 answers; `--empty` leaves it
empty), so the codex has its full weight. With `--qa` it has the QA desk
too (`docs/qa.md`), for a scene on the phone on its own:
`qa.html?frame&s=<scene key>`, its controls as `&k.<key>=<value>`.
`serve.mjs` serves builds on the
home network until stopped, each on a port of its own: `http://192.168.178.88:4403/`.

To set a change against what it changes, build both (check out the commit
before it and build it as `before`, then the change as `after`) and serve
them side by side, `before=4402 after=4403`. Each address is a site of its
own to the phone, with its own storage.

Stop the server and the proxy when done, and leave the phone's tab where the
owner can use it.

## The scripts

| Script | What it does |
|---|---|
| `ask.mjs "<js>"` | Runs an expression in the phone's tab and prints its value. |
| `goto.mjs <url>` | Sends the tab to an address, a build for the owner to try, say. |
| `shot.mjs <out.png>` | A screenshot of the tab, at the phone's pixels. |
| `codex.mjs <url> <label>` | The codex as a thumb goes through it: opened, down to the items, scrolled through them and back, two items opened and closed, each tap a finger's (`tap`). Each phase's frames, and the page's CPU. |
| `game.mjs <url> <label>` | A game (`MODE=delve`, `turns` or `race`; `ROUNDS=4`): New game, a mode, Begin, then cards, question, answer and reveal, each click timed in parts. Each phase's frames. It answers right (`ANSWER=right`, so a Delve run lives on), or always the first option (`ANSWER=first`). |
| `layers.mjs [--do "<js>"]` | The tab's compositing layers: what, how many, why. With `--do`, which painted while that ran. |
| `profile.mjs <label.prof.json>` | What ran in each phase of a `game.mjs` run with `PROFILE=1`, by file and line in `src/`. |
| `timeline.mjs <a> [b]` | What a run's timeline (`TIMELINE=1`) recorded in each phase: styles, layouts and paints, and who forced them. |

`codex.mjs` and `game.mjs` take a `SETUP`: script to run in the page
before they start, or a file of it from `scripts/iphone/setups/`:

- `inserts`: every big insertion into the page (a screen mounting, a hand
  of cards) timed in parts: the script before it, the styles and layout it
  left, the frame after.
- `rafTime`: every animation-frame callback and timer, timed by its source
  and phase, with the styles and layout it left for the frame.
- `fineMasks`: whether the cards' emblems got their fine masks.

Their output goes into `.phone/runs/`. Run each variant twice: the phone's
numbers move by a few fps from run to run, more while it's warm.

## Measuring on iOS

What the phone's inspector gives, and how the scripts get around what it
doesn't:

- **No times.** The timeline's records, the CPU samples and the sampling
  profiler's samples all come with a time of 0 through this proxy. So the
  scripts split them by order: the timeline at `console.timeStamp` marks,
  and the profiler's samples at a 3 ms busy loop run in a function named
  `MARK_<phase>` at each mark (`phone.mjs`, `watchFrames`).
- **Frames are measured in the page**: every animation frame's time, so
  fps and the gaps per phase; and how late a 5 ms timer runs ("held"), the
  main thread's busy time. Frames dropping while held stays low means the
  time went outside the page's main thread: to the compositor, or the GPU.
- **The CPU** (`CPUProfiler`, about one sample in 500 ms) is the page
  process's alone. When it goes *down* as the frames drop, the work is in
  another process (the drop shadows below did that).
- **Layers** (`LayerTree`): every compositing layer, how often it painted
  and why WebKit made it. A count in the thousands is a problem by itself.
- **Screenshots** (`Page.snapshotRect`), to see what the phone shows.
- **Taking things away**: the `?off=` switches, or a style put in with
  `ask.mjs` (`filter: none` on the codex's tiles, say), one at a time,
  each against the build as it is.
- `Runtime.evaluate` takes `emulateUserGesture: true`, so what wants a
  tap (sound) works. Where a press matters, tap with `tap()`
  (`phone.mjs`), a finger's events, not `click()`: see "A script's
  `click()` isn't a finger" below.

## What the iPhone taught us

October 2026, the owner's iPhone in Chrome (PR #267). Each is in the code,
with its numbers in the comments.

- **An animation WebKit can't bound composites everything after it.** When
  an element animates in a way WebKit can't put bounds on, it can't tell
  what may come to overlap it, so it gives every element painted after it a
  layer of its own to be safe. The codex had 1,135 layers, and scrolling
  it ran at 45 fps. `will-change: opacity` on its
  grid (`Codex.svelte`) makes the grid one layer, its tiles painted inside
  it: 60 fps. For a long list or grid on iOS, count its layers first
  (`layers.mjs`).
- **Filters are redrawn under whatever repaints above them.** Every tile in
  the codex has a `filter: drop-shadow`. With an item window open over the
  grid, WebKit redrew every shadow on screen for each frame the window's
  content changed: the item window ran at 36 fps, while the page's own CPU
  went *down*, the cost being outside its process. Behind a dialog that's
  all the way in, `<html>` has `data-dialog-up` (`src/lib/behindDialog.ts`)
  and the tiles' shadows go: 58 fps. Nobody sees it, behind a page dimmed
  to a third and blurred.
- **A style reads back in the browser's words.** `brightness(0.350)` is
  read back as `brightness(0.35)`, so `el.style.filter !== f` never matched
  and every frame of an open dialog wrote every layer's filter again.
  Remember what was written (a `WeakMap`, as `behindDialog.ts` does), never
  compare with what the style reads back.
- **Arithmetic on the main thread holds an iPhone many times longer.**
  Shrinking the cards' emblem masks (`src/lib/fineMask.ts`) held the page
  about 400 ms on the phone for each new hand of cards; working out Delve's
  room reverb (`src/lib/acoustics.ts`) took 40 to 140 ms a step. Both run
  in module workers now (`fineMaskWorker.ts`, `roomWorker.ts`): `new
  Worker(new URL('./x.ts', import.meta.url), { type: 'module' })`, made
  when first needed, typed arrays transferred, and the page doing it
  itself where there's no worker (or no `OffscreenCanvas`). The worst frame
  after Next went from between 344 and 1,113 ms to between 53 and 81, and
  Begin's from between 690 and 946 ms to about 285. Reading an image's
  pixels is the same: finding where the item sits in the full art at the
  reveal (`getImageData`) cost every answer a frame of 50 to 68 ms, though
  only a veiled picture needs it. It's done for those alone now, in the
  veil's worker (`visibleBoxOf` in `src/lib/veilCutter.ts`). The veil's
  burns were the same (`src/lib/materialize.ts`): each patch's start (its
  pixels read, a distance transform, noise for every pixel and a sort) and
  every frame of its fizzle ran on the page, most of a race question's
  time on the phone (486 of 851 samples in one), the question screens at
  50 to 54 fps with frames of 60 to 120 ms. Their arithmetic (`burn.ts`)
  runs in `burnWorker.ts` now, which sends the box of each patch that
  changed, its pixels as they now are; the page puts them on the patch's
  canvas, a copy. Only one frame is with the page at a time, answered on
  the page's next frame: the burns tick at the display's rate whatever the
  page does, so while the page hasn't put the last, the worker gathers what
  changed and sends it as one once it has. Otherwise a page slower than the
  display (a busy reveal, Low Power Mode) puts frames back to back that are
  never shown: on the Android emulator, whose page drew about a third of
  the display's frames, 46% of those it heard in a race.
  Each patch's pixels go back and forth in one buffer. The worker doesn't
  draw on the canvases itself (`transferControlToOffscreen`): on Chrome on
  Android (an emulator's, Chrome 133) a canvas drawn from a worker showed
  nothing, or a white block, for as long as the patch was there, where the
  same pixels put on the page showed.
- **Safari has no `requestIdleCallback`.** `whenIdle` (`src/lib/idle.ts`)
  waits 300 ms there instead, and each step still runs as one task: a step
  over a frame's time drops a frame on the phone however idle the page
  looked. Work that takes tens of ms a step there belongs in a worker.
  And 300 ms after a tap is still among the frames it set off: what a tap
  or a reveal brings about to be done later (the codex written, the
  achievements checked) waits for calm, `whenCalm`, 800 ms on from the
  last tap. Whatever shows what it writes must not show it stale: an
  answer waiting for calm is written as soon as the codex is read
  (`recordWhenCalm` in `src/lib/codex.ts`), so the end screen after a
  quick Next still has it, and earned achievements go under the game the
  answer was given in, not the one under way when they are checked. That
  holds for what reads the codex's log raw too: the Delve records count a
  run's wards from it as the run ends or is left (`codexLog` in
  `src/lib/delveRecord.ts`).
- **A timer is not an idle moment, and the start page's first seconds are
  its entrance.** Loading the game's screens on `whenIdle`'s 500 ms timer
  put their evaluation on the frame today's circle laid its layers on the
  page (45 to 67 ms), and the four faces loaded ahead on its 1 s timer
  were a 50 to 62 ms frame mid draw-in. Work fetched ahead of need waits
  for the page to settle now (`whenSettled`, `src/lib/settled.ts`): until
  what is making an entrance lets go (`holdSettled`: a rune circle until it
  has drawn itself in), then for frames in a row with time to spare, one
  piece at a time. The faces still come as one piece: after decoding them,
  the 44 ms of laying the page out again was the font set changing, not the
  faces in it (four faces no element used, added to the page, cost the
  same), so one at a time would lay it out four times.
- **A script's `click()` isn't a finger.** It sends none of a finger's
  pointer events, so what a press starts took another path. A finger's
  press makes the Web Audio bus while it's down (`src/lib/sound.ts`), and
  its lift wakes it, both before the click; after a bare `click()`, the
  click's own sound made it, about 50 ms in the middle of the screen that
  tap brought in (the codex), a cost no player has. What the Codex entry
  readies as a finger lands on it (`Home.svelte`) never ran either.
  `codex.mjs` taps with `tap()` (`phone.mjs`) now: a finger's events, the
  lift 80 ms after the landing, and only the lift a gesture (`game.mjs`
  still clicks, to time each click in parts). What the trace did
  show of the first tap's sound holds for a finger too: the hall's reverb
  took its steps over the second after it, as that screen came in; it's
  worked out in a worker now (`src/lib/hallWorker.ts`).
- **A masked SVG costs its frames while what it masks changes.** Delve's
  ladder (`DelveLadder.svelte`) is masked round its stars; while its 260
  lines inked themselves in, the lobby came in at 24 to 35 fps, and at 60
  with the mask overridden. Nothing showed in the page's own thread: its
  styles, layouts and paints were the same, and so were its layers. The
  mask now goes on only as the first star's cutout starts to show, as until
  then it hides nothing. Try such a thing with a CSS rule (`mask: none`
  through `ask.mjs`): taking the `mask` attribute off from script didn't
  take the cost away.
- **An idle step is as long as the work it can't split.** Delve's light
  table was worked out in idle steps of 4 ms, but a step is at least one
  stretch of the table, and a stretch took 52 to 56 ms on the phone, two or
  three of them in the frames after Begin. It's worked out in a worker now
  (`src/lib/lightsAhead.ts`, `lightWorker.ts`) from the moment a Delve is
  on its way, as is the cave-in sound (`caveInWorker.ts`, 48 to 65 ms a
  step). The strata past the zones that the table reads come with it, so
  the page never generates one (1 to 9 ms each on a PC, in the frame a
  depth first showed it). What only depends on constants isn't worked out
  on the page at all: the name plate's weave (61 to 68 ms) is made as the
  app is built (`src/lib/weave.ts`, `weaveTile.ts`).
- **Waking the audio context holds the page.** On a cold page
  `AudioContext.resume()` blocks while iOS starts the audio session, 40 to
  50 ms, and the first tap is mostly New game: it landed in the lobby's
  first frame. `wake` (`src/lib/sound.ts`) waits until the first frame
  after the tap's click has been drawn, on timers, which carry the tap's
  gesture on for a second, as iOS asks of a context starting. Every call
  waits and resumes on timers of its own, though another is waiting: on
  iOS 15 to 16.3 the first wake comes in the idle moment after a touch's
  pointerdown, which is no gesture, and the touchend's and click's, which
  are, come in while it waits (`tests/soundWake.test.ts`).
- **A part of an SVG that animates repaints the whole SVG.** WebKit gives
  no part of an SVG a layer of its own: the name plate's seal bloom, a
  circle breathing in the plate's SVG, repainted all of the plate's lines
  every frame for as long as a reveal was up. It's an element of its own
  now, over the seal, and only its opacity changes (`NamePlate.svelte`).
- **Some changes to an element repaint every layer inside it.** WebKit
  repaints each compositing layer in an element that turns `inert` (as
  Svelte makes everything going out), whose opacity goes from 1 to under
  it or back, or whose layers are resized or moved by a fraction of a pixel.
  A turn's stage, the question's rune circle in it, is some 60 to 80
  layers: Next repainted them twice over (inert, then the fade), and the
  answer once (the circle's colour, and the line over the art 3 px shorter,
  which resized the circle). An opacity starting under 1, a colour taken a
  ring at a time, or `pointer-events: none` repaints next to nothing:
  `outWithoutInert` (`src/lib/leaving.ts`), the stage at rest at 0.999
  (`Game.svelte`), `heldInk` (`ArcaneStage.svelte`). Count the layers a
  change repaints (the timeline's paints in the frame after a tap) before
  looking at the script. A group is composited apart in every frame
  something in it moves, though, the circle turning: weigh the calm
  question's and reveal's frames with `?off=group` (the stage resting at 1)
  against those without.

Still open: Begin's worst frame, about 230 to 285 ms. About 70 ms of it is
script mounting the game screen and about 140 ms its styles, layout and
paint; and an item's details parse in about 60 ms. The rumble's 6 s noise
buffer, which took about 75 ms of that time in one go, is now worked out
in a worker (`src/lib/rumbleWorker.ts`, its samples in
`src/lib/rumbleNoise.ts`), as are the light table and the cave-in, and the
weave is made as the app is built; a trace from the phone still has to
show them gone from the main thread.

Still open too: a first visit's blank page. `index.html` is empty until
the startup script has come and mounted the start page, and its CSS and
the start page's four fonts are fetched alongside it: on a venue's Wi-Fi
(200 KB/s shared) the page stayed blank for 4.5 to 5.3 s. Taking what
only a room shows out of the script (the lobby, the other players'
pointers, a zone's card; `App.svelte`, kept out by
`tests/startupScript.test.ts`) took all that from 518 KB gzipped to 466
(349 of them script): about a quarter of a second of those. The seconds
go only once the start page paints before its script has come (its
markup in `index.html`). Still in the script besides, though the start
page's first frame needs none of it: the sound design (`sound.ts`,
`soundDesign.ts`), obscenity's lists (`offensive.ts`) and the half of the
session only a room uses (`protocol.ts`, `cursors.ts`, `media.svelte.ts`).

Still open too: the codex's item window, as it fades in and out. Each tile's
`filter: drop-shadow` is drawn again under the page's fading filter
(`behindDialog.ts`) on every frame of both fades: the opening's frames took
33 to 50 ms, 16 to 30 with the shadows off, and the ten frames after a
close 241 to 280 ms, 178 to 197 without. The close's first frame (59 to
79 ms) was some 12 ms of restyling the document, as `data-dialog-up` went
and every tile's shadow came back, and some 20 ms of drawing those shadows
under the filter. Only the restyle is smaller, and only on WebKit: the
shadows go and come back in the sections near the screen alone
(`shadeless` in `Codex.svelte`), while Blink still restyles every picture.
Taking the rest away means drawing the shadow without a filter: baked per
item (`0 6px 10px`, black at 0.7) and drawn under the picture as an image
of its own, reaching past the `.art` box as the shadow does, checked at
the sizes the grid's tiles take. Most pictures are 72 px high at any
width; the 23 wider than they are high (belts, and a relic) are as wide as
the tile where 72 px high wouldn't fit in it, and so change size with the
screen.
