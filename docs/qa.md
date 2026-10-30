# The QA desk

`qa.html` (`src/qa/`) is where things get tried out: a bench for each thing of the game's, live, in every state that matters, at the size picked. A change gets checked on the benches it touches.

## Using it

- **Open it:** `npm run qa` (the dev server, the desk opened in Chrome by itself; another browser with `BROWSER` set), or `npm run dev`, then `http://localhost:5173/qa.html`; on the beta, **poe2.quest/beta/qa.html**. The dev hub links it first.
- **On the left, the benches.** **This change** comes first: the benches the branch's files touch, each with a dot (hover one for why). Then the **pieces** (a component on its own: the avatar, the class sigils' picker, the daily streak, the descent, the rune circles) and the **screens**, a bench for each of the game's (the start page, the lobby, the game, the end screen...), its states in its panel. Under them, any changed file no bench shows. **/** finds a bench by its name or a state inside one by any words of its name ("race twelve"); Enter opens the first found.
- **In the middle, the thing itself**, the real component or the real game, live: it can be clicked, played and hovered.
- **On the right, its panel:** its **states** (a click, **1** to **9**, or **↑ ↓** go from one to the next; a long list's headings fold, the one on show open), its **controls**, **what happens** (a piece's buttons: Answer right, Turn over) and its **seats** (a scene with more than one: one at a time, or side by side).
- **The controls set the state on the fly.** A piece's are its sliders, choices and switches; a screen's are the state's own (the lobby's mode and players, an end screen's players, misses and achievements) and, under **In any game**, what any game can have: long names or other scripts, players joining or watching, players gone offline. A state is only a preset of them: move one and the top line says **as set**, and **As it was** goes back to the state last picked.
- **Size:** **Window** (the default) shows it as large as the room in the middle, at 1:1. A device's size (a phone, a laptop, 4K) shows it as that device would, shrunk to fit (**Z** for 1:1; hold **Alt** and drag to move about). The size stays as it is from bench to bench, so one size can be gone through at a time.
- **A** shows every state at once, side by side; click one to see it alone. A piece's controls and buttons move every state at once there.
- **R** replays it, drawing it in again as it first came (a scene loads afresh). **F** freezes every animation where it is, the effects and the backdrop with them, to look at a moment; **F** again lets it go on (a clock in it, a question's, has run on meanwhile). The frame's own checks go on while it's frozen.
- **S**, in a scene, leaves the UI's shadows and fills (the panels', the buttons', the title's glow) to CSS, live, and **S** again gives them back to the WebGL backdrop, which takes them over just as it does as the page starts: to see how the two differ, and that the handover doesn't show. While CSS has them, a **CSS shadows** button in the panel says so. (A frame starts as a first visit would: the backdrop's first frame leaves the boxes to CSS and takes them over a moment later; see Loading in `docs/development.md`.)
- **← →** go to the next bench and back. **H**, held, shows the design's board for a scene, where it has one at that size. **O** hides or shows the outlines round what's wrong.
- **B** puts **before and after** side by side: the view as the code before this change draws it (main, where this branch left it) beside the code now, both live. On the dev server it also marks what differs: it takes a shot of each, the same way each time, and compares them: the line above says whether they look the same or where they differ, each place is marked and numbered on both, and a click on a mark shows it close up (before, now, and the two in turn, enlarged; **Esc** closes it). **D** lays every pixel that differs over now, and **O** hides the marks (with the outlines). A bench that moves on its own (`moves: true`, a hand going round) isn't shot and compared at all: the two sides are watched live. What moves by itself (a clock, a shimmer) differs between two shots of the same code too, so it's left out. The first **B** takes a while: the code before (main at the merge base, with this checkout's `src/qa/` laid over it so both sides know the same scenes) is set up once in the system's temp folder (`poe2-qa-before/`) and served by a second Vite server until main moves on (then the old copy goes). A frame loads only its own screen's scenes, or its own piece, so where the code before can't show one (it's new in this change, or uses something that is) the line says so, and why, and every other screen still compares. On the beta the code before is built beside it (`scripts/qa-before.mjs`, at `/beta/before/`, when the branch goes on the beta) and the two show live, unmarked: the beta has no server to take the shots, so the line says marking what differs takes the dev server. Where the code before can't show a view there, the line says so too, and why: a file this change adds, or a name it adds to one, fails as that frame loads, so every other bench still shows. Its button shows in the panel of a bench this change touches.
- The address holds the bench, the state, the controls and the size, so a reload or a link sent to someone shows the same (`qa.html?b=streak&k.days=30`, `qa.html?s=game/race-reveal&size=phone`, `&cmp=1` for before and after). The back button steps back through the benches and states picked, not through every slider moved.

A frame starts with nothing of its own (its storage keys start apart, `src/lib/storage.ts`, and are cleared as it opens and closes), so nothing it shows reaches the game's saves, and no two frames share a player. At a device's size it pretends to be that device: the pixel ratio, and a touch screen's lack of hover and coarse pointer. That is close, not exact: it is still drawn at your screen's pixel ratio, and the mouse is still a mouse.

Each frame checks itself once it comes to rest, and again after a click in it: something off the side of the screen, text cut off without an ellipsis, console errors, pictures that didn't load, em dashes. What it finds is outlined and listed under the top line.

## Adding a bench

A change that adds or alters something on screen adds or updates its bench, the way it would add tests: the states that matter, so whoever checks it doesn't have to make them by hand.

**A piece** is a component on its own. It is a file in `src/qa/benches/` named after its key (`avatar.ts` for `avatar`: its frame loads that file alone), a view beside it (`AvatarView.svelte`) and a line in `src/qa/benches/pieces.ts`. The file says what it is (`src/qa/bench.ts` has every field):

- `controls`: what can be set, each a `range` (a slider with a box: what's typed in it counts once it's a number the slider can be, and is brought into range once the box is left), a `choice` or a `toggle`, with its default. One marked `view: true` sets how it's looked at, not what it shows (the avatar's name beside it, the descent's width): it stays as set from state to state and Replay to Replay, and no state names it.
- `states`: the ones that matter, each a name and the controls it sets.
- `actions`: what can happen to it, a button each.
- `files`: the files it shows, for This change (its own two, and what every piece runs on, count by themselves).
- `cell`: how wide each is, at least, when all its states show side by side (200 px unless it says).

The view gets the controls as set (`v`) and draws the component with them. It hears an action with `onAction('turn', () => ...)` (`src/qa/frame/pieceState.svelte.ts`) and moves controls itself with `set({ wrong: true })`, which the panel follows. `small` is true when it is one of many side by side. The desk gives every bench the rest: the size, the states side by side, Replay, Freeze, the checks, the address.

**A scene** is the real game in a state, from someone's seat. Scenes live in `src/qa/scenes/<screen>.ts`, built from the game's own types with the helpers in `src/qa/build/`: the people and items, and `Table`, which plays a game through the engine to the moment the scene wants (seeded and on a held clock, so it's the same every time and only states the game can reach). A scene's `group` is its screen's bench. `src/qa/scene.ts` says what a scene holds: its seats, its `controls` (what `build(v)` takes, as a piece's are) and named `states` (presets of them, each under a heading if it has a `group`), its address, its codex and records, steps to take once it shows. Prefer one scene with a control to a scene for each value: the lobby is one scene with players, mode and target, not one per mix. What every game can have (names, joining, watching, offline) is `src/qa/tweaks.ts`, added to every scene's controls on its own. `tests/qaScenes.test.ts` builds every one, in every named state and at every control's ends, and `tests/qaBenches.test.ts` checks every piece's states and controls.

## Play from here

**Play from here** (in a scene's panel) turns the scene into a live room: the host and up to three guests, each the real game, side by side, playable by hand. Under each seat:

- **Bot** plays that seat (the room bot's own player).
- **Lag** cycles a delay on its link; **Drop link** goes silent (the game notices 12 to 18 s in) until **Bring back**; **Cut** closes its connection; **Reload** reloads it; **Kick** has the host remove a guest.

**Save as scene** keeps the room as it stands as `src/qa/captured/<name>.json` (on the beta, a file to put there), a scene of its own from the next reload. **Esc** or **Stop playing** goes back. Players without a seat stay in the room, offline.

On the dev server the seats meet on a local signalling server (PeerJS's own, started on loopback the first time) and each has an origin of its own (`host.localhost`, `g1.localhost`...), so a process and storage of its own; on the beta they meet on the PeerJS cloud. Either way the room is its own: it never meets a real one or shows in a real room list.

## The sweep

`npm run sweep` checks every scene from every seat at the usual sizes without anyone watching, and prints what it finds: it builds the beta into `screens/qa-build/`, opens each frame as a page of its own in a browser that really is that device (its pixel ratio, touch, a phone's user agent) and runs the same checks. It's for the machine, so nobody has to look at its shots.

Run it only when really necessary. Several sessions often share the machine, and a sweep's browsers slow every one of them, so it's not a routine step after a change: the tests, `npm run check` and the benches come first, and a sweep is for what they can't settle. Even then keep it narrow (`--only <scene>` and one size with `--sizes`), and run it once.

- `npm run sweep -- --change` checks only the scenes this branch touches; `--only lobby` the scenes whose key matches; `--sizes full` every size, or `--sizes phone,uhd`.
- `--webgl` keeps the effects and the backdrop on; `--banding` also runs `scripts/find-banding.py` on each shot (it needs a Python with numpy and Pillow; `QA_PYTHON` names one).
- `--url http://localhost:5173/` sweeps a running server instead of a build; `--no-build` reuses the last build.
- `--map` runs every scene once with the browser's coverage on and writes `src/data/sceneFiles.json`, which files each scene runs: what This change goes by. Run it when scenes or screens have changed much; with `--only <scenes>` it maps just those (new scenes, say) and merges them into the map as it was.
- `--redraws` checks what Chrome draws again instead (below).

## Redraws

Every stutter of October 2026 was one bug: something animated on the page's thread, with no layer of its own, so Chrome drew a big layer round it again on every frame while the screen looked nearly still. The emblems' kindle drew each sharp card face again for every frame of a deal; the camera shake's `translate` on `.shell` drew the whole page again all through a Delve vein; the cards' glare drew the face again at every move of the pointer; a name plate's lines, drawn in by CSS animations, drew its two SVGs again at the screen's rate (240 times a second) with every question. Nothing looks wrong; it only costs, and only a slow machine or a 4K screen feels it.

**The check runs in CI on every pull request into main** (`.github/workflows/redraws.yml`; the check to require is **Redraws**), and fails the pull request when:

- **at rest**, a layer is drawn again 50k px a frame or more (a 220 px square), averaged over the frames watched. Each scene's first state is watched from its first seat at the desktop size (1440 × 900), full motion on, once it has come to rest: a second with no style or class written (a rune circle's pen done), no animation that ends still running (an entrance) and none waiting out its delay (GameOver's gleam, 1.4 s in); 15 s at most, so a shake that never stops is watched all the same. Then 300 frames, 5 s (with WebGL, 2 s: below). There's no share of the frames a layer may take and no list of layers let off: a light that passes over a big layer now and then counts for the time it takes, and one that keeps to a small layer of its own is let be.
- **a moment** costs more than 1.5 times its baseline, as the pixels drawn again a 60th of a second (a tile drawn a second time or more; drawing something as it first shows doesn't count), each baseline taken as 50k at least (`src/qa/redrawBaselines.json`, as CI measures them). The moments (`MOMENTS` in `src/qa/redraws.ts`), each watched from when it's set off until it's over (a second at least):
  - **a deal** of three cards, with WebGL (the cards' effects play in it): the emblems' kindle;
  - **a dig's deal**, the vein and the way out: its lamp, gilt and swell;
  - **a card picked**: the question coming in, its seal drawn by the pen;
  - **the pointer across a card**, a move a frame for a second, the card already lifted: the glare and the tilt;
  - **a name plate drawn in**, on its bench (`qa.html?b=plate`), with no right answer's glint (its spark: #340), at 240 Hz: CSS animations run at the screen's rate and the pen (`lib/drawIn`) at its own, so at 60 Hz the two cost the same and only a fast screen tells them apart.

**Fixed frames.** It runs in Chrome's headless shell with begin-frame control and virtual time: the sweep sends each frame itself, a 60th of a second of the page's own time (its clocks, timers and animations; a 240th for the plate), however long the frame takes to draw. So the page plays as it would at 60 fps on any machine, a CI runner without a GPU included, and Math.random is seeded. At rest what's drawn again comes out the same run to run. A moment runs once first, unwatched and in real time, so what a worker makes for it (a card plate's print, an arcane plate's geometry, kept for the visit) is ready, as for a player's second deal; made in real time, it would land on another frame of the watched run each time. Then it's watched with Math.random started over and each image decoded before its tile is drawn. Chrome composites a layer nothing changed in as it was the frame before (`AllowUndamagedNonrootRenderPassToSkip`), not put together again in software: what's drawn again is the same, and a frame of category cards takes a CI runner 13 ms to composite, not 700.

**WebGL.** The backdrop and the effects draw on canvases of their own, not on what Chrome draws again, and in software a frame of them takes long. So the scenes run with WebGL refused (the backdrop's shadows then paint in CSS), and the CSS backdrop a page without WebGL falls back to (`.bg.css`, `CSS_BACKDROP`) left undrawn: what's watched is the page over the backdrop, as players with WebGL have it, less its canvas. (Drawn, it has the Codex's empty Delve pages draw their rune circle again: #339.) Except one scene for each screen whose effects change what the page itself does (`WEBGL_SCENES` in `src/qa/redraws.ts`, with why), watched with WebGL as well, 120 frames (2 s) from the same point at rest. Its 5 s with WebGL refused have the lights that pass now and then; with WebGL it's watched for what the effects do to the page, which they do on nearly every frame while they do it (a shake's translate). A frame with WebGL drawn in software takes a CI runner up to 3 s, so 5 s of a vein would take 14 minutes.

- `game/delve-dig`: a vein shakes the page (`tremor.ts` through `fx/core.ts`'s shake, a translate on `.shell` every frame), only with the effects on. The October shake was this.
- `home/returning`: the daily streak lights in WebGL with the effects on and in CSS without.
- `over/n-lost`: GameOver plays its lights in WebGL with the effects on and in CSS without, and the winner's row ignites in the effects.
- `settings/key`: Settings turns the effects on and off, and its seals light with them.

The jobs: the scenes in ten parts (`--shard 1/10` and on, two at a time), a job for each WebGL scene (`--webgl --only <scene>`), the deal, and the other moments in two. **Redraws** passes only when all of them did. `tests/redraws.test.ts` checks every WebGL scene and every moment has its job.

**Reading a failure.** The job's log and summary name the scene, the layer by its element and size, what it draws again a frame and on how many of the frames, then what was written on most frames (a style or class set from script) and what animates something other than its transform or opacity: where to look. The shake, on the code before its fix:

```
At rest: 1 scenes, 1 with a layer drawn again 50k px a frame or more:
  game/delve-dig: div.stage (1408×594) drawn again 451k px a frame at rest, on 99% of the frames
  game/delve-dig: div.shell (1425×900) drawn again 288k px a frame at rest, on 98% of the frames
    written on most frames: div.shell’s style (98%)
To find what draws it again and fix it: docs/development.md, “Finding a stutter” (a layer of its own, or a transform or opacity animated instead; never drawn less well).
```

A moment's failure lists the layers it drew again most, each a 60th of a second, the same way. `report.json`, kept with the run, has every layer. Then `docs/development.md`, “Finding a stutter”: give what animates a layer of its own (`will-change`), animate its transform or opacity instead, or stop writing its style every frame; never draw it less well. Settings' seal breathed a box-shadow, which drew the page again every frame (135k px), until it got a layer of its own; GameOver's gleam drew the page again a quarter of the time (70k px a frame) until its headline and the winner's row got theirs.

**A moment that should cost more** (a new card face, a richer deal): take its new number from the job's summary into `src/qa/redrawBaselines.json` in the same pull request, and say why in it. One that got cheaper is lowered the same way.

**Locally**, only narrowed (it opens a headless browser a scene; CLAUDE.md): `npm run sweep -- --redraws --only "^<scene>$"` for a scene at rest (`--webgl` too for one of `WEBGL_SCENES`), `npm run sweep -- --redraws --moments --only "^<moment>$"` for a moment (`--baseline` writes what it measured into `src/qa/redrawBaselines.json`, but CI's numbers are the ones to keep), `--sizes <size>` for one other size. It builds the beta of the checkout first (`--no-build` serves the last). A scene reads the same here as in CI, a pixel or so apart; a moment near it.

**Adding a scene** (`src/qa/scenes/`): nothing to do. Every scene's first state is watched at rest, in one of the ten parts. If its screen's effects change what the page does (a shake, a light the page plays only with WebGL), add it to `WEBGL_SCENES` with why, and a job for it in the workflow (the test asks for one). **Adding a moment:** a line in `MOMENTS`, how it's set off in `moments()` in `scripts/sweep.mjs` (`how`), its key in a moments job's `--only`, and its baseline from that job's summary on the pull request.

**Read from the CSS** (`tests/ownLayers.test.ts`, in `npm test`): an animation whose keyframes change anything but transform or opacity (a filter, a custom property, a colour, a shadow, a stroke) has to be on an element with `will-change`, so it draws again only its own layer, or be in `PAINTED` in `src/qa/redraws.ts` with why. That widens rule 7 of `docs/category-cards.md` to every component; it catches a new one before it runs anywhere, the redraw check measures it. `PAINTED` lets nothing off the redraw check, which watches each of them where a scene or moment shows it: they're there because each is small or runs once, as something shows.

**What it doesn't see:** WebKit. Safari (every browser on iOS) draws again for some things Chrome leaves to the compositor (a find card's `pulse`, custom properties on `.frame`, draws its face again every frame there); iOS is measured on the iPhone (`docs/iphone.md`). The CSS test still asks those for a layer of their own. Nor what the GPU spends compositing layers, or raster too small to pass 50k px a frame at 1440 × 900 that a 4K screen at 200% draws four times over (#330 is that kind); those are found with a trace on the PC (`docs/development.md`, “Finding a stutter”).

## Keeping it easy

The desk is for trying things out without learning a tool. So:

- A bench shows only what it has: a panel holds its own states, controls and buttons, and nothing a bench doesn't use.
- No new always-visible button or setting on the desk itself: a feature that would need one finds a place that only shows when it's relevant, or a key, or doesn't go in.
- Defaults over choices: the size, the seats and the frames' setup start where most checks want them.
- A new tool is a bench here, not a page of its own.
