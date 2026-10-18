# The QA desk

`qa.html` (`src/qa/`) is where a change gets checked: every scene of the game (a state of it, from someone's seat) in the real app, one at a time, as large as the window allows, at every size from a phone to a 4K screen.

## Using it

- **Open it:** `npm run dev`, then `http://localhost:5173/qa.html`; on the beta, **poe2.quest/beta/qa.html**. The dev hub links it first.
- **→ and ←** go to the next and the last stop. A stop is one scene at one size: on a phone or tablet with all its seats side by side, on a larger screen a seat at a time. **↓ and ↑** skip to the next scene or back.
- **This change** (it shows when the branch has changes) walks only the scenes the branch's files touch; **Everything** walks them all. **/** finds a scene by any words of its name, group or screen ("race twelve", "delve phone").
- **Z** shows the stop at 1:1 instead of fitted to the window (a 4K screen on a smaller monitor); hold **Alt** and drag to move about it. **R** loads the stop afresh. **O** hides or shows the outlines round what's wrong.
- **H**, held, shows the design's board for the scene, where it has one. **B**, held, shows the stop as it was before the branch, once a sweep with `--before` has run.
- A scene with settings (the end screen's circle, the descent's records, the streak's days) shows a menu for each beside its name.
- The strip at the foot has a mark for every stop, red where something's wrong; click one to go there. The address holds the stop, its settings, the search and the zoom, so a reload, the back button or a link sent to someone shows the same.

Every scene is walked at a 375 phone, a 13-inch laptop (1440 × 725) and a 4K screen at 150% (2560 × 1440) and at 100% (3840 × 2160), plus any size the scene names itself and any size a sweep found something at. Every size the game is checked at is in `src/qa/sizes.ts`; `npm run screens` uses the same list.

A frame starts with nothing of its own (its storage keys start apart, `src/lib/storage.ts`, and are cleared as it opens and closes), so nothing it shows reaches the game's saves, and no two frames share a player. It pretends to be its size's device: the pixel ratio, and a touch screen's lack of hover and coarse pointer. That is close, not exact: it is still drawn at your screen's pixel ratio, and the mouse is still a mouse. The sweep is the real thing.

Each frame checks itself once it comes to rest, and again after a click in it: something off the side of the screen, text cut off without an ellipsis, console errors, pictures that didn't load, em dashes. What it finds is outlined, listed under the top line, and turns the stop's mark red.

## Play from here

**Play from here** turns the scene into a live room: the host and up to three guests, each the real game, side by side, playable by hand. Under each seat:

- **Bot** plays that seat (the room bot's own player).
- **Lag** cycles a delay on its link; **Drop link** goes silent (the game notices 12 to 18 s in) until **Bring back**; **Cut** closes its connection; **Reload** reloads it; **Kick** has the host remove a guest.

**Save as scene** keeps the room as it stands as `src/qa/captured/<name>.json` (on the beta, a file to put there), a scene of its own from the next reload. **Esc** or **Stop playing** goes back to the walk. Players without a seat stay in the room, offline.

On the dev server the seats meet on a local signalling server (PeerJS's own, started on loopback the first time) and each has an origin of its own (`host.localhost`, `g1.localhost`...), so a process and storage of its own; on the beta they meet on the PeerJS cloud. Either way the room is its own: it never meets a real one or shows in a real room list.

## The sweep

`npm run qa` checks every scene from every seat at every size it is walked at, without anyone watching: it builds the beta into `screens/qa-build/`, opens each frame as a page of its own in a browser that really is that device (its pixel ratio, touch, a phone's user agent), shoots it and runs the same checks. The desk then marks every stop the sweep found something at (and walks the sizes it found it at), so a walk starts with the red marks. It uses every thread but two and the GPU; the whole walk takes about ten minutes.

- `npm run qa -- --change` sweeps only the scenes this branch touches; `--only lobby` the scenes whose key matches; `--sizes full` every size, or `--sizes phone,uhd`.
- `--before` also shoots the same scenes as they were where the branch left main (in a worktree of its own in the temp folder) and compares each pair: the desk says how much of a stop changed and holds the before up on **B**. `--base <ref>` compares with another commit. The checkout stays in the temp folder (`poe2-qa-base/<sha>`) for the next comparison from the same commit; `git worktree remove` it when done. A frame draws the same every time (its randomness is seeded by its scene), so a pair differs only where something changed.
- `--webgl` keeps the effects and the backdrop on; `--banding` also runs `scripts/find-banding.py` on each shot (it needs a Python with numpy and Pillow; `QA_PYTHON` names one).
- `--url http://localhost:5173/` sweeps a running server instead of a build; `--no-build` reuses the last build.
- `--map` runs every scene once with the browser's coverage on and writes `src/data/sceneFiles.json`, which files each scene runs: what This change goes by. Run it when scenes or screens have changed much.
- Shots and a `manifest.json` go to `screens/qa-<when>/`, and `screens/qa-latest.json` is what the desk reads (through the dev server).

## Adding a scene

A change that adds or alters something on screen adds or updates its scenes, the way it would add tests. Scenes live in `src/qa/scenes/<screen>.ts`, built from the game's own types with the helpers in `src/qa/build/`: the people and items, and `Table`, which plays a game through the engine to the moment the scene wants (seeded and on a held clock, so it's the same every time and only states the game can reach). `src/qa/scene.ts` says what a scene holds: its seats, its knobs, its address, its codex and records, steps to take once it shows. `tests/qaScenes.test.ts` builds every one, at every knob setting.

## Keeping it easy

The desk is for checking a change without learning a tool. So:

- The top line holds the scene, seat and size, the count with its arrows, and the search. Everything else (a scene's own settings, holding for the design or the before, Play from here) shows only where it applies.
- No new always-visible button or setting: a feature that would need one finds a place that only shows when it's relevant, or a key, or doesn't go in.
- Defaults over choices: the sizes, the walk's order and the frames' setup are decided once here, not picked each time.
