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

## Adding a scene

A change that adds or alters something on screen adds or updates its scenes, the way it would add tests. Scenes live in `src/qa/scenes/<screen>.ts`, built from the game's own types with the helpers in `src/qa/build/` (people, items); `src/qa/scene.ts` says what a scene holds. `tests/qaScenes.test.ts` builds every one.

## Keeping it easy

The desk is for checking a change without learning a tool. So:

- The top line holds the scene, seat and size, the count with its arrows, and the search. Everything else (a scene's own settings, holding for the design) shows only where it applies.
- No new always-visible button or setting: a feature that would need one finds a place that only shows when it's relevant, or a key, or doesn't go in.
- Defaults over choices: the sizes, the walk's order and the frames' setup are decided once here, not picked each time.
