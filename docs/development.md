# Development

How the game is built, beyond the README's quick start. The tool pages are in `docs/dev-tools.md`.

## Local channel

The dev server plays in a channel of its own (`src/lib/channel.ts`), as the
beta does: its rooms and open-room list are this machine's alone, so a tab on
localhost never meets the live game or anyone else's dev server, and it keeps
its own storage. It says Local next to the title. Run `npm run dev:live` to
play in the live rooms instead.

## Sound

Stack: Svelte 5, TypeScript, Vite, PeerJS. Sound effects are layered CC0
recordings from [Freesound](https://freesound.org) plus a quiet ambience loop
(about 1.1 MB in `public/sfx`, see `CREDITS.txt` there), filtered and mixed in
WebAudio with a generated reverb. Delve's beds (about 360 KB each) are only
fetched as a run nears them: the next place's while the page is idle, from
the first depth of the zone before it, and an Azurite Vein's tunnel loops from
depth 20 on. `src/lib/soundDesign.ts` sets the layers and the beds, as tuned on
the ambience mix board and the vein sound board.

Every sound comes from where it happens on screen (`src/lib/spatial.svelte.ts`):
each call of `sfx()` says where (a card, an answer, the clock, a player's
entry, the edge a blast bursts in from, or the path its sparks fly), and a
head model places it (the far ear hears it a fraction of a millisecond late
and a little duller), the screen's edges at ±36°. Sparks are heard flying,
teammates' sounds a little farther off, the reverb answers from the sound's
side, and a blast or a cave-in fills the space round it, as an Azurite
Vein's walls do when they crack. The ambience is
spread wide (each ear its own take of the loop, half a loop apart), and in
Delve each place rings in a room of its own (`src/lib/acoustics.ts`, and a vein being dug one for its own sounds: early
reflections, far slaps and a tail whose lows, mids and highs die at their
own pace, worked out while the page is idle) in place of the one hall,
cross-fading as the beds do. The hover, the most frequent sound and now
the most noticeable, comes from where its control is like any other, but
2 dB down; a busy sweep across controls eases it down a little and dulls
it, and within a sweep a quick flick over a control barely brushes it
(quieter, duller, shorter), while the first hover after a pause always
sounds in full. The mix was chosen by ear in the lab (**Spatial sound** in
`docs/dev-tools.md`), the hover on its own page (**The hover tuning page**).

## Visual effects

Everything is drawn in WebGL2 with float precision and dithered once at the
8-bit output, so no glow or gradient bands.

- **Backdrop** (`src/lib/backdrop.ts`, behind the UI): breathing gradients,
  drifting smoke, rising embers, light from game events (`src/lib/lights.ts`),
  a mood tint (crimson during a deathmatch, gold on victory), and on the
  start page slowly swaying god rays and a royal glow behind the title. It also draws the soft shadows of UI elements
  and the large gradient fills of panels, answers and the art stage, which
  CSS would band (`src/lib/backdropShadow.ts`). Fills go back to CSS while the
  page scrolls or an element moves, so they never lag behind their borders.
- **Effects layer** (`src/lib/fx/`, over the UI, added as light with
  `plus-lighter`): an HDR particle system (sparks, embers, shards, glints),
  procedural shapes (shockwaves, flares, god rays, fire outlines, a portal,
  rune sigils) and bloom. `effects.ts` has the building blocks, `moments.ts`
  the game's big beats (a pick, a reveal with its point flowing into the
  scorer's progress bar, a deathmatch, a victory), and `ui.ts` the feedback
  every control gets. Soft shapes render at about one texel per CSS pixel and
  the whole layer at most 1.5 per CSS pixel; the canvas hides itself while
  nothing is alive.
- **Loading**: the first paint waits on as few shaders as possible, since on
  a first visit (a cold shader cache) compiling them held it up by seconds.
  The backdrop's lean programs start building before anything else it sets
  up, all at once, so with `KHR_parallel_shader_compile` the driver builds
  them side by side and the first paint waits for the slowest, not their
  sum. Not yet built once the rest of the page is set up (a cold shader
  cache), they're read in the frame the page is first painted in, its first
  call, so the page is set up meanwhile rather than waiting on the driver
  (asked how a link went, the page's main thread and the GPU process's wait
  for it: 150 ms of a 278 ms task in a trace). The UI's box shadows and fills are the slowest part to build, so
  they're a pass of their own (`uiFrag`), drawn first into a layer of their
  own (a half-float target, as the soft light is), which the main pass lays
  over the scene before its drop shadows, the dialog's dimming and the
  dither: the UI pass reads nothing of the scene, and holds nothing but the
  boxes. The first frame's shaders take about half the time they did as one
  program, and the picture is the same (the half float rounds a pixel by
  one 8-bit level now and then). That's for the first paint only: once the
  page is idle, the main pass with all the UI's parts is built in the
  background, warmed (below) and takes over (`replaceLean`), and the UI pass
  and its layer are let go once nothing needs them (an extra full-screen
  pass and a half-float layer cost every frame drawn). Delve's programs go
  the same way (`buildDelve`, `mergeDelve`): built to leave the boxes to the
  UI pass while it's there (Delve wanted as the page starts), since with
  the boxes in it a main pass takes several times as long to build (in a
  trace, 1.6 s against 0.14 s for the slowest of the two apart), then
  replaced by one that draws them too once the page is idle. Each set
  replacing another is a `Successor` in `src/lib/backdrop.ts`.
  A program built in the background isn't quite finished: its first draw is
  when the browser has the driver finish it (on Windows, Direct3D builds the
  shader it really runs then, should the one it built with the program not
  fit), which holds up the GPU process, and every frame on the page with it.
  So every program built after the first paint (the merged pass, Delve's,
  one a changed pointer needs) is drawn once, a texel's worth, into a
  target of its own kind off the page, each in an idle moment of its own,
  before any frame uses it (`warmUp`). It waits for true idle moments,
  however long they take, since what it replaces draws the same picture
  meanwhile; only Delve's, while a Delve scene shows without them, go on a
  step a frame instead. The shader compiler (Direct3D's, on Windows)
  takes longer over code the deeper it sits in loops and branches, and a
  second copy of a loop costs as much as the first: the drop shadows are one
  loop, in two layers (under the boxes and over them), not one under and
  one over. Without a float target it's all one main pass. On phones and
  tablets, where CSS keeps every shadow, the main pass has none of the UI's
  parts and there's no UI pass (Delve's leaves them out too; a pointer that
  changes later has them built in the background, CSS painting them
  meanwhile); without the extension everything is read at once, as before.
  The lean programs draw
  without Delve's parts (its strata's smoke and dark, the environments, the
  dark closing in, the far city lights, the frost's glints), which draw the
  start page and the other modes exactly as the whole would. Delve's
  programs are built in the background once Delve is on its way
  (`wantDelveBackdrop`: Delve picked in a lobby, a Delve room joined, a run
  picked up or begun from a `?delve` link, the lab, the zone tuning page and
  the backdrop tool), with
  `buildPrograms` in `src/lib/fx/gl.ts` (`KHR_parallel_shader_compile`
  polled once a frame, or one program per idle moment without it), and are
  warmed (`warmUp`) before they're ready. Should a Delve scene
  show before then, the lean programs stand in and Delve's parts come in over
  a moment once they're ready. The effects layer's renderer is made at the
  first idle moment after the first paint, or as soon as an effect is asked
  for; effects asked for before it's ready wait for it. Its programs are
  warmed too, one an idle moment while its canvas is hidden (`warmNext` in
  `src/lib/fx/renderer.ts`), or the first effect of a visit (the first
  press's ring) waited for the driver. Dynamite's smoke is made ready the
  same way as a run nears it, a step of a ms or two an idle moment
  (`prepareBlastSmoke`, through `stepwise` in `src/lib/idle.ts`), its
  program drawn once before the first blast. A drop shadow's mask
  (`src/lib/backdropDropShadow.ts`) is blurred in a worker
  (`dropBlurWorker.ts`) once its shape holds still, CSS painting the
  shadow meanwhile: the turn's banner, made afresh each turn, took 20 to
  30 ms of blur on the main thread as the turn came in. A room's own
  screens (`Lobby.svelte` and the other players' pointers; `Game.svelte`, a
  zone's card, `GameOver.svelte`) are chunks of their own, fetched once the
  start page has settled (`whenSettled` in `src/lib/settled.ts`) or on the
  way into a room (the lobby first, the game's after it), so the start page
  loads and runs without them (tried once more if the fetch fails; after
  that the screen offers a reload, as some browsers won't fetch a module
  that failed again). The sheets of the
  screens fetched later (the game's, the Codex's, the dialogs') come without
  their @keyframes, which the build moves into the sheet the page starts
  with (`keyframesFirst.ts`): Chrome restyles every animated element on the
  page, or all of it, whenever a sheet with @keyframes is added, and the
  Codex's, fetched while the start page shows, held a frame up by 40 ms in
  a trace (the game's screens' by 13 to 20). The host decodes
  a question's pictures off the main thread (all of a "find the art"
  question's at once), and every device cuts a veiled picture's patches in
  a worker (`src/lib/veilWorker.ts`): their shapes as the question starts,
  each one's picture as it uncovers.
- **Frame hitches** (October 2026): a turn's reveal stuttered in Chrome on
  Windows (9 frames over 50 ms in three turns at 4K), though the GPU timer
  (`?fps`) measured the backdrop's and the effects' draws at about a ms. The
  cause was the backdrop's opaque canvas (`alpha: false`). Chrome on
  Direct3D 11 makes an opaque canvas's buffers in a format Direct3D has to
  emulate, and making one held up the GPU process's main thread, and every
  frame on the page with it, for 25 to 85 ms at 4K; the canvas makes new
  ones whenever it draws faster for a while, as in a reveal (53 of them in
  three turns). There the backdrop now has an alpha channel
  (`opaqueCanvasStalls` in `src/lib/backdrop.ts`; it's drawn opaque all the
  same), and each buffer takes a few hundredths of a ms: the same three
  turns had 2 frames over 50 ms, both in the first, from a cold shader cache.
  Elsewhere it stays opaque. The effects layer always had an alpha channel.
  To find the next one: the GPU timer only sees the draws, not what holds
  the GPU process up around them. A Chrome trace does. Run the game in real
  (headed) Chrome on the screen it stutters on, at its full size, with the
  `toplevel` and `gpu` trace categories, play the turns that hitch, and read
  the GPU process's main thread (`CrGpuMain`) for the long tasks in the slow
  frames (here `SharedImageStub::OnCreateSharedImage`). The `?off=` switches
  (`src/lib/switchedOff.ts`) take parts away one at a time to narrow it down.
  Never answer a hitch by drawing less well: capping the WebGL layers at
  1440p made the backdrop blurry and stretched its dither, and only made the
  hitches smaller. Where the GPU can draw them (`src/lib/fx/gpuBudget.ts`),
  the layers draw every device pixel, and their slow motion (the backdrop's
  embers, a calm streak's fire) every frame at the display's refresh, down
  to 30fps only where the GPU can't keep up; find what really holds the
  frame up.
- **Frame hitches from redrawing** (October 2026): every turn stuttered in
  Chrome at 4K, and Delve's veins all the time. The trace showed `CrGpuMain`
  busy drawing the page's tiles (the renderer's raster command buffer,
  `DoRasterCHROMIUM`) for a page that hardly changed: something animated on
  the page's thread, with no layer of its own, had Chrome redraw the layer
  round it every frame. The emblems' kindle redrew each card's sharp face
  (`docs/category-cards.md`, rule 7); the camera shake, a `translate` on
  `.shell`, redrew the whole page, and a vein's tremor shakes it now and
  then for as long as you stand in one (a quarter of the GPU's time at
  rest). The shake now puts `.shell` on a layer while it may move
  (`applyShake` in `src/lib/fx/core.ts`). To find the next one, sum the
  raster tasks per frame; the categories `cc` and
  `disabled-by-default-devtools.timeline.invalidationTracking` add which
  layer was redrawn and what invalidated it.
- **Frame hitches on iOS** are measured on the owner's iPhone, driven from
  the PC (`docs/iphone.md`, with what it found: layers composited after an
  animation WebKit can't bound, filters redrawn under a dialog, work that
  belongs in a worker).
- **The creator** (zoe_arcana, a name only an unlocked device can take; a
  deterrent, not proof) is marked out. Gold motes circle her avatar on a
  tilted orbit, passing behind it on the far side, in a ruby glow with
  embers rising off it (`src/lib/fx/aura.ts`; one `Orbit` shape draws an
  avatar's orbit), and in the lobby she arrives out of gathering motes
  rather than a portal. The aura shows on all her avatars at once with a
  short breath between showings, when the effects loop can sleep; a gilded
  ring (CSS) marks her then and with effects off. Her name is struck in gold
  foil, and a glint of light crosses it every nine seconds
  (`src/lib/glint.ts`: one timer, transforms only, nothing under
  *prefers-reduced-motion*). Online, everyone else gets a notice when she
  walks into the room (`src/lib/herald.ts`).
- **Delve's descent** (`src/lib/descent.ts`): each zone is a look (the
  hall's dark, the light from below, smoke in four hues, mist, embers,
  glints) and the environments the backdrop draws for it (`ENVIRONMENTS`:
  lamps, magma, frost, spores, shafts, void, mist, plumes, city, heat).
  The ten zones' looks, each with its embers' motion (a profile of
  `src/lib/emberProfiles.ts`, tweaked), live in `src/data/backdrops.json`
  (read by `src/lib/backdrops.ts`; the shapes and the check are in
  `src/lib/backdropData.ts`), which the backdrop tool edits. Past the ten
  zones (from depth 100 as players count it) every stratum is generated
  (`src/lib/backdropGen.ts`, `generateStratum`, pure and seeded): stratum k
  is an archetype of `src/lib/archetypes.ts`
  (its effects, palette schemes, embers, character and names), dealt out a
  round at a time by the endgame seed (`archetypeAt` in
  `src/lib/backdrops.ts`: every archetype once a round, none twice in a
  row, no two in a row sharing an effect, nor the first with the last
  zone, each round worked out from its own seed and the one before's),
  made from its own seed (the file's
  endgame seed mixed with k, or one pinned by hand) with the file's endgame
  settings, re-rolled where it comes out too like a zone or its neighbour
  (`src/lib/likeness.ts`), made once and cached. Its name is its
  archetype's next (`endgameName`): the curated ones first, then epithets
  and places composed; its sigil and ornament its archetype's zone's
  (`emblemOf`).
  From a zone's 6th depth to the next one's 1st, five depths, the scene
  turns into the next (`strataAt`, `turnInto`; `TURN_FROM`,
  `TURN_DEPTHS`), the turn coming a fifth a depth to the zone's 8th, a
  tenth a depth to its 10th and the last two fifths into the next zone
  (`TURN_AT`, `turnAt`): the embers follow the turn eased (`emberTurn`), the
  light, smoke, features and their colours follow it eased from the
  zone's 7th depth (`hallTurn`, `HALL_FROM`), both on a smoothstep
  (`easeTurn`), and a magma that goes out cools with the hall
  (`magmaCooling`), half cooled at the zone's 10th depth and gone by the next zone's 1st (through a cross-fade it
  keeps each scene's own cooling, `Descent.cool`, so it never flares up
  again as it fades). A zone shows alone from
  its 1st depth (`settledAt`) to its 6th, where its own turn begins.
  The scene's `light` is set so its average brightness never rises with
  depth through the zones and, past them, by 8% a depth at most
  (`luminanceAt`, `lightAt`, `brighterAt`): `estimateLuminance` works out
  what the backdrop draws from what each environment adds and dims as it
  comes in (`ENV_ADD`, `ENV_HALL`), corrected per depth (`MEASURED`, to
  depth 91), and the light is solved a stretch of depths at a time, moving
  at most 0.135 a depth (`light`, or the light drawn, `light` times the
  stratum's own `lightK`, so a stratum lit brighter is made way for), to
  depth 2001 (past it the curve is kept to exactly). It is worked out in
  idle moments ahead of the scene (`warmLights`); a rejoin deep down shows
  the scene as it was for the few frames it takes the rest, a few
  milliseconds a frame, then fades in (`waiting`). A
  generated look's own light (`lightK`) is worked out from the estimate
  (`calibrateLight`), so it settles at a light of about 1 like the zones.
  The tables are measured from the backdrop's own frames with
  `scripts/measure-luminance.mjs`; measure again after changing what it
  draws. The measured corrections only hold for the zone looks they were
  measured with (`measured` in the file): a zone given a new look has its
  depths' corrections dropped (faded out over its turns) rather than
  applied wrongly. (They were measured with the straight handover and
  carried over to the eased one by the share of the next zone's hall each
  depth shows; not yet to `TURN_AT`'s, as no zone is marked measured now:
  measure afresh with calibrate, or carry them over the same way, before
  marking zones measured again.)
  The shown depth eases along at about a second a depth (the step into a
  new zone, while its plunge runs, slower: `ARRIVAL_PACE`, about 2.3 s), and a jump of
  more than three depths cross-fades straight there. `plunge()` (called by
  `App.svelte` when a deeper depth's cards are dealt, `dealtDeeper`) sinks
  the scene (a new zone's further and longer with the zone's sound,
  `ZONE_PLUNGE_SINK`, `ZONE_PLUNGE_MS`, `ZONE_SPEED`), and the backdrop
  steps it (`stepPlunge`). A new zone's cards are dealt as its plunge lands
  (`DelveState.dealAt`, `ZONE_DESCENT_MS`; the screens wait through
  `src/lib/dealing.svelte.ts`). The backdrop's shaders and embers (`src/lib/backdropEmbers.ts`, a
  small palette of zone colours, so a new colour spreads ember by ember,
  each taking its zone's way of moving from `src/lib/emberMotion.ts` with it),
  the CSS fallback and the ambience (`depthAmbience` in `src/lib/sound.ts`)
  follow it. The clock's dark (`src/lib/darkness.ts`) is set by the timer
  ring and drawn by the backdrop, with a thin late shade at the screen's
  edges (`Darkness.svelte`). A new zone's title card: `src/lib/zoneTitle.ts`
  says what it shows for a depth (name, subtitle, meta line, what is new
  from `delveRules` and the finds, and its treatment: the family of motion
  and its colours), `src/lib/zoneTitleTiming.ts` when (its beats from the
  plunge's start, the name locking on the zone sound's second swell; the
  compact and still timelines; the light it casts, `glowAt`; one pen for
  a broken line, `drawPlan`), `src/lib/zoneArrival.svelte.ts` sets it up
  as App starts the plunge (its sounds booked on the audio clock with
  `sfx`'s `inMs`, the name timed to the speakers' lag, `audioLead`), and
  `src/components/zonecard/ZoneCard.svelte` plays it, every animation on
  its own clock (WAAPI from the plunge's start), with the seal
  (`ZoneSeal.svelte`, the sigil's strokes from `sigilStrokes`), the marks
  of what is new (`NewsMark.svelte`) and a family of motion each
  (`ember.ts`, `rime.ts`, `spore.ts`, `void.ts`, `light.ts`, `fume.ts`, to
  the contract in `family.ts`). Like the shell, it is drawn at the stage's
  CSS zoom (`.zc` in `ZOOMED`, `src/lib/stage.ts`): the letters' and seal's
  places are measured in its own px (`unzoomRect`), its light and effects
  in screen px. The zones' sigils (`src/lib/zoneSigils.ts`), on the zone
  card's seal, and the find cards (`findEngraving.ts`) are engraved in the arcane style,
  and a run's end has its own effect (`src/lib/fx/delveEnd.ts`).
- **Dialogs** dim the page behind them (`src/lib/behindDialog.ts`). A dark,
  blurred layer over the page would band the backdrop and hide the dialog's
  own effects, so the backdrop darkens itself in its shader and the UI takes a
  CSS filter. The effects layer stays above dialogs: the page's light hides
  behind the dialog and dims outside it, while the dialog's own light shows.
- Effects can be switched off with the ✦ button in the header, and are off
  under *prefers-reduced-motion*. Switched off, they also still the
  backdrop where it stands (no breathing, drifting or rising embers), which
  is then only redrawn when something changes: a low-power mode for phones
  that run hot. Quality drops by itself (resolution) on
  devices that can't keep up. Without WebGL2 the site falls back
  to its CSS look.

## Refreshing item data

Item names and art are scraped from poe2db.tw
([uniques](https://poe2db.tw/us/Unique_item),
[lineage supports](https://poe2db.tw/us/Lineage_Supports)) and committed to
the repo (`src/data/items.json` and `art-source/items/`), so the game doesn't
depend on poe2db being up.

```sh
npm run fetch-data
```

Each item's group and category come from its art folder; see
`CATEGORY_RULES` in `scripts/fetch-data.mjs`. Image files are named with a hash, so the URL
doesn't reveal the answer. The script also reads each unique's own page: for
its art where the list leaves it out, and for the other ways the game draws
it, which the list never shows. Those become the item's `variants` (its art,
base and tooltip, under the same name): Grand Spectrum is a Ruby, an Emerald
or a Sapphire, each its own colour, and Grip of Kulemak glows brighter with
each desecrated mod it can take (five stages). A question shows any of an
item's art, each as often (`Question.variant`, rolled with the mirroring);
the answer is still just its name, and the codex shows them all. Other
uniques have more than one version on their page too (each glove's Fists of
Stone base, a league's changed mods), but they share one art, so they add
nothing.

Nothing is written until everything is fetched and checked, so a run that
stops leaves `items.json`, `itemStats.json` and the art as they were. It
stops when:

- it would leave noticeably fewer items than `items.json` has (a changed page
  layout, most likely); `npm run fetch-data -- --shrink` accepts it when
  poe2db really dropped them;
- an item in `items.json` is no longer on poe2db. It says which are gone and
  which are new, and how to rerun: `--rename "Old=>New"` when it was renamed
  (it keeps its old id, so players' codexes and achievements still know it,
  and takes the new name; its art is fetched again, and the upscaled copies
  go when it changed), or `--drop "Old"` when it's gone for good. Repeat
  either for each item.

A new item poe2db has no tooltip for is left out of this refresh rather than
shipped without one. The run ends with a summary of what was added, renamed,
dropped, changed and left out. `src/data/fakes.json` is by name: a new or
renamed item needs its two fakes there (`tests/fakes.test.ts`).

Each item's tooltip (properties, requirements, mods, flavour text) comes from
poe2db too, into `src/data/itemStats.json`: `npm run fetch-data` fetches
them before it writes anything, and `npm run fetch-stats` fetches them alone.
A tooltip comes from the item's hover on the list page. Where that hover is
empty (in October 2026, 26 uniques' list links pointed at the hash of an
empty string) or comes to no line, it comes from the item's box on its own
page; the run counts those and names the ones that differ from the committed
tooltip (the page boxes leave out some items' requirements line). Failing
both, the committed tooltip is kept. The game loads
that file only when a player opens an item's details (its art, clicked once a
question is answered, or its card in the codex).

poe2db's art is small (about 104 px per inventory cell, so 108 × 108 for a
ring) and lossy, and the game draws it bigger than that. The site serves
copies upscaled with Real-ESRGAN (x4plus) from `public/items/`, as AVIF (a
third smaller than WebP, and closer to the unencoded picture):

- **Resolution.** 4 pixels per art pixel for items up to 2 × 2 cells, which
  are drawn the most enlarged (on a phone, or on a big screen under the
  stage's zoom), and 2 for larger ones (`artScale` in `src/lib/ui-paths.ts`).
  `items.json` keeps each item's art size (`w`, `h`), so the code works in
  art pixels and only the bitmaps are finer.
- **Mix.** Each picture is mixed with the smoothly enlarged original, which
  beat other models and mixes in blind tests: 75% of the model for one-cell
  items, except precursor tablets at 50%, whose stone it smooths too much;
  50% up to 2 × 2 and 30% for larger ones.
- **Smaller copies.** Small spots load `public/items/128/` for thumbnails,
  and `128/` or `256/` by screen sharpness for the codex's tiles and the
  start page (`itemThumb`, `itemSrcset`); only the question and the codex's
  item page load the full size.

For new items, run `scripts/upscale-art.py` (its header has the one-time
setup: a Python venv with torch for the CPU and the model file). It only does
the items that have no upscaled copies yet, and `tests/itemArt.test.ts`
checks every item has its copies.

After the art changes, rebuild the look-alike table (needs ffmpeg):

```sh
npm run looks
```

It writes `src/data/looks.json`: for every item, the fourteen items of its
group whose art looks most like it, each with a score from 0 to 1 (silhouette,
edges and colour, mirror-blind; see `scripts/looks.mjs`). From depth 49 in Delve,
decoys are picked from it (`src/lib/looks.ts`). An item drawn more than one way
has each of its art ranked on its own (Grand Spectrum's Sapphire looks most
like Prism of Belief, its Ruby like Flesh Crucible), and such a question draws
each picture's art before it picks the look-alikes, so they look like the art
it shows. The output only changes when
the art does; items added without rerunning it just have no look-alikes.

Then measure which items are too thin for Today's unique on the start page:
the day's item is the page's eye-catcher, drawn big in the arcane circle,
and a bare stick leaves the circle all but empty. `scripts/daily-art.py`
measures how much of the art box each item's opaque pixels cover at the
size the page draws it, and writes those under 9.5% (28 staves, spears and
quarterstaves, and the slimmest bows and wands) to
`src/data/dailyArt.json`; the daily and its practice questions never ask
them, though their names can still be decoys. Wide items (belts, some
relics) are drawn bigger there than a box would let them: the picture may
reach past the box's sides into the circle round its centre (ArtImage's
`round` fit).

```sh
python3 scripts/daily-art.py
```

The category cards' emblems, and the items behind them, are laid out from
fits measured ahead into `src/data/iconFits.json`, and drawn with clean masks
baked into `public/icons/masks/` (`src/lib/iconFit.svelte.ts`).
Bake them again after their art changes, or after a data refresh picks a
different item for a card (needs Chromium, and ffmpeg for the masks' WebP;
see `scripts/bake-icons.mjs`):

```sh
npm run bake-icons
```

## Deploying

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
The site is served on the custom domain **poe2.quest** (`public/CNAME`), and
invite links point there (`src/lib/site.ts`).
Turn it on once under **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

## The beta

A second build is served at **poe2.quest/beta/**, for trying a change before
it goes live. Pages serves one upload per site, so every deploy has both:
`main` in `dist/` and the beta in `dist/beta/`.

- **Put a branch on the beta:** Actions → *Deploy to GitHub Pages* → Run
  workflow (on `main`), with the branch, tag or commit SHA as *beta*. Its
  tests run, the commit is recorded as a deployment to the `beta`
  environment (on the repo's front page, under Deployments), and both sites
  deploy. Later deploys of `main` keep showing it, from a build cached by
  commit.
- **Ship it:** merge the branch into `main` as usual. The beta stays as it
  is until the next one goes up.
- **Stack changes:** the beta shows one commit at a time. To test a change
  together with the one already on the beta, start its branch from that
  commit instead of `main`: the newest `beta` deployment, also shown as
  *Beta commit* in the summary of the newest successful run named
  *Beta: (branch)*. (The branch itself may have moved on since.)
- **A run that only waited** is cancelled when another run queues behind it
  (GitHub keeps one waiting run per group); run it again.

The beta's own code (install scripts, tests, build) runs in a job of its own
with a read-only token, apart from the live site's build. If the beta can't be
found or built (say a dependency it pins disappears), deploys of `main` go
ahead without `/beta/` and say so in a warning; putting a branch on the beta
brings it back. A commit from before the beta existed can't go on
it, since it would share the live game's rooms and saves; merge `main` into
it first.

The beta is built with `VITE_CHANNEL=beta` (`src/lib/channel.ts`), which keeps
it apart from the live game:

- its rooms and open-room listings use their own PeerJS prefix, so live and
  beta players never meet
- its invite links and link previews point to `/beta/`
- it keeps its own codex, settings and saves: all storage goes through
  `src/lib/storage.ts`, which starts the beta's keys differently (a test keeps
  other modules off storage); only the creator unlock is shared
- it says Beta on the start page, in the header and in the tab title, and
  asks search engines not to index it
- adding `&first` to an invite link (`?room=CODE&first`) shows the invite
  screen as a first visit sees it, with a name saved (the dev server too):
  the saved name is set aside for that visit, not erased
