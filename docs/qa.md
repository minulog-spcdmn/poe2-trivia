# The QA desk

`qa.html` (`src/qa/`) is where a change gets checked: every scene of the game (a state of it, from someone's seat) in the real app, one at a time, as large as the window allows, at every size from a phone to a 4K screen.

## Using it

- **Open it:** `npm run dev`, then `http://localhost:5173/qa.html`; on the beta, **poe2.quest/beta/qa.html**. The dev hub links it first.
- **→ and ←** go to the next and the last stop. A stop is one scene at one size: on a phone or tablet with all its seats side by side, on a larger screen a seat at a time. **↓ and ↑** skip to the next scene or back.
- **/** finds a scene by any words of its name, group or screen ("race twelve", "delve phone").
- **Z** shows the stop at 1:1 instead of fitted to the window (a 4K screen on a smaller monitor); hold **Alt** and drag to move about it. **R** loads the stop afresh. **H**, held, shows the design's board for the scene, where it has one.
- The strip at the foot has a mark for every stop; click one to go there. The address holds the stop, the search and the zoom, so a reload, the back button or a link sent to someone shows the same.

Every scene is walked at a 375 phone, a 13-inch laptop (1440 × 725) and a 4K screen at 150% (2560 × 1440) and at 100% (3840 × 2160), plus any size the scene names itself. Every size the game is checked at is in `src/qa/sizes.ts`; `npm run screens` uses the same list.

A frame starts with nothing of its own (its storage keys start apart, `src/lib/storage.ts`, and are cleared as it opens and closes), so nothing it shows reaches the game's saves, and no two frames share a player. It pretends to be its size's device: the pixel ratio, and a touch screen's lack of hover and coarse pointer. That is close, not exact: it is still drawn at your screen's pixel ratio, and the mouse is still a mouse.

## The sweep

`npm run qa` checks every scene from every seat at every size it is walked at, without anyone watching: it builds the beta into `screens/qa-build/`, opens each frame as a page of its own in a browser that really is that device (its pixel ratio, touch, a phone's user agent), shoots it and runs the same checks. The desk then marks every stop the sweep found something at (and walks the sizes it found it at), so a walk starts with the red marks. It uses every thread but two and the GPU; the whole walk takes a few minutes.

- `npm run qa -- --only lobby` sweeps the scenes whose key matches; `--sizes full` every size, or `--sizes phone,uhd`.
- `--webgl` keeps the effects and the backdrop on; `--banding` also runs `scripts/find-banding.py` on each shot (it needs a Python with numpy and Pillow; `QA_PYTHON` names one).
- `--url http://localhost:5173/` sweeps a running server instead of a build; `--no-build` reuses the last build.
- Shots and a `manifest.json` go to `screens/qa-<when>/`, and `screens/qa-latest.json` is what the desk reads (through the dev server).

## Adding a scene

A change that adds or alters something on screen adds or updates its scenes, the way it would add tests. Scenes live in `src/qa/scenes/<screen>.ts`, built from the game's own types with the helpers in `src/qa/build/` (people, items); `src/qa/scene.ts` says what a scene holds. `tests/qaScenes.test.ts` builds every one.

## Keeping it easy

The desk is for checking a change without learning a tool. So:

- The top line holds the scene, seat and size, the count with its arrows, and the search. Everything else (a scene's own settings, holding for the design) shows only where it applies.
- No new always-visible button or setting: a feature that would need one finds a place that only shows when it's relevant, or a key, or doesn't go in.
- Defaults over choices: the sizes, the walk's order and the frames' setup are decided once here, not picked each time.
