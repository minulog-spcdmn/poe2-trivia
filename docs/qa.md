# The QA desk

`qa.html` (`src/qa/`) is where things get tried out: a bench for each thing of the game's, live, in every state that matters, at the size picked. A change gets checked on the benches it touches.

## Using it

- **Open it:** `npm run dev`, then `http://localhost:5173/qa.html`; on the beta, **poe2.quest/beta/qa.html**. The dev hub links it first.
- **On the left, the benches.** **This change** comes first: the benches the branch's files touch, each with a dot (hover one for why). Then the **pieces** (a component on its own: the avatar, the daily streak, the descent, the rune circles) and the **scenes**, a bench for each group of them, a screen at a time. Under them, any changed file no bench shows. **/** finds a bench by its name or a scene inside one by any words of its name ("race twelve"); Enter opens the first found.
- **In the middle, the thing itself**, the real component or the real game, live: it can be clicked, played and hovered.
- **On the right, its panel:** its **states** (a click, **1** to **9**, or **↑ ↓** go from one to the next), its **controls** (a piece's sliders, choices and switches; a scene's settings), **what happens** (a piece's buttons: Answer right, Turn over) and its **seats** (a scene with more than one: one at a time, or side by side).
- **Size:** **Window** (the default) shows it as large as the room in the middle, at 1:1. A device's size (a phone, a laptop, 4K) shows it as that device would, shrunk to fit (**Z** for 1:1; hold **Alt** and drag to move about). The size stays as it is from bench to bench, so one size can be gone through at a time.
- **A** shows every state at once, side by side; click one to see it alone. A piece's controls and buttons move every state at once there.
- **R** replays it, drawing it in again as it first came (a scene loads afresh). **F** freezes every animation where it is, to look at a moment; **F** again lets it go on.
- **← →** go to the next bench and back. **H**, held, shows the design's board for a scene, where it has one at that size. **O** hides or shows the outlines round what's wrong.
- The address holds the bench, the state, the controls and the size, so a reload, the back button or a link sent to someone shows the same (`qa.html?b=streak&k.days=30`, `qa.html?s=game/race-reveal&size=phone`).

A frame starts with nothing of its own (its storage keys start apart, `src/lib/storage.ts`, and are cleared as it opens and closes), so nothing it shows reaches the game's saves, and no two frames share a player. At a device's size it pretends to be that device: the pixel ratio, and a touch screen's lack of hover and coarse pointer. That is close, not exact: it is still drawn at your screen's pixel ratio, and the mouse is still a mouse.

Each frame checks itself once it comes to rest, and again after a click in it: something off the side of the screen, text cut off without an ellipsis, console errors, pictures that didn't load, em dashes. What it finds is outlined and listed under the top line.

## Adding a bench

A change that adds or alters something on screen adds or updates its bench, the way it would add tests: the states that matter, so whoever checks it doesn't have to make them by hand.

**A piece** is a component on its own. It is a file in `src/qa/benches/` (`avatar.ts`), a view beside it (`AvatarView.svelte`) and a line in `src/qa/benches/pieces.ts`. The file says what it is (`src/qa/bench.ts` has every field):

- `controls`: what can be set, each a `range` (a slider with a box), a `choice` or a `toggle`, with its default.
- `states`: the ones that matter, each a name and the controls it sets.
- `actions`: what can happen to it, a button each.
- `files`: the files it shows, for This change.

The view gets the controls as set (`v`) and draws the component with them. It hears an action with `onAction('turn', () => ...)` (`src/qa/frame/pieceState.svelte.ts`) and moves controls itself with `set({ wrong: true })`, which the panel follows. `small` is true when it is one of many side by side. The desk gives every bench the rest: the size, the states side by side, Replay, Freeze, the checks, the address.

**A scene** is the real game in a state, from someone's seat. Scenes live in `src/qa/scenes/<screen>.ts`, built from the game's own types with the helpers in `src/qa/build/`: the people and items, and `Table`, which plays a game through the engine to the moment the scene wants (seeded and on a held clock, so it's the same every time and only states the game can reach). A scene's `group` is its bench. `src/qa/scene.ts` says what a scene holds: its seats, its knobs (its settings in the panel), its address, its codex and records, steps to take once it shows. `tests/qaScenes.test.ts` builds every one, at every knob setting, and `tests/qaBenches.test.ts` checks every piece's states and controls.

## Play from here

**Play from here** (in a scene's panel) turns the scene into a live room: the host and up to three guests, each the real game, side by side, playable by hand. Under each seat:

- **Bot** plays that seat (the room bot's own player).
- **Lag** cycles a delay on its link; **Drop link** goes silent (the game notices 12 to 18 s in) until **Bring back**; **Cut** closes its connection; **Reload** reloads it; **Kick** has the host remove a guest.

**Save as scene** keeps the room as it stands as `src/qa/captured/<name>.json` (on the beta, a file to put there), a scene of its own from the next reload. **Esc** or **Stop playing** goes back. Players without a seat stay in the room, offline.

On the dev server the seats meet on a local signalling server (PeerJS's own, started on loopback the first time) and each has an origin of its own (`host.localhost`, `g1.localhost`...), so a process and storage of its own; on the beta they meet on the PeerJS cloud. Either way the room is its own: it never meets a real one or shows in a real room list.

## The sweep

`npm run qa` checks every scene from every seat at the usual sizes without anyone watching, and prints what it finds: it builds the beta into `screens/qa-build/`, opens each frame as a page of its own in a browser that really is that device (its pixel ratio, touch, a phone's user agent) and runs the same checks. It's for the machine, so nobody has to look at its shots.

- `npm run qa -- --change` checks only the scenes this branch touches; `--only lobby` the scenes whose key matches; `--sizes full` every size, or `--sizes phone,uhd`.
- `--webgl` keeps the effects and the backdrop on; `--banding` also runs `scripts/find-banding.py` on each shot (it needs a Python with numpy and Pillow; `QA_PYTHON` names one).
- `--url http://localhost:5173/` sweeps a running server instead of a build; `--no-build` reuses the last build.
- `--map` runs every scene once with the browser's coverage on and writes `src/data/sceneFiles.json`, which files each scene runs: what This change goes by. Run it when scenes or screens have changed much.

## Keeping it easy

The desk is for trying things out without learning a tool. So:

- A bench shows only what it has: a panel holds its own states, controls and buttons, and nothing a bench doesn't use.
- No new always-visible button or setting on the desk itself: a feature that would need one finds a place that only shows when it's relevant, or a key, or doesn't go in.
- Defaults over choices: the size, the seats and the frames' setup start where most checks want them.
- A new tool is a bench here, not a page of its own.
