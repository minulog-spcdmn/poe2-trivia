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
  The backdrop's first frame is drawn by lean programs without Delve's parts
  (its strata's smoke and dark, the environments, the dark closing in, the
  far city lights, the frost's glints), which draw the start page and the
  other modes exactly as the whole would. Delve's programs are built in the
  background once Delve is on its way (`wantDelveBackdrop`: Delve picked in a
  lobby, a Delve room joined, a run picked up or begun from a `?delve` link,
  the lab, the zone tuning page and the backdrop tool), with
  `buildPrograms` in `src/lib/fx/gl.ts` (`KHR_parallel_shader_compile`
  polled once a frame, or one program per idle moment without it), and are
  drawn once each, small, so the GPU has them ready. Should a Delve scene
  show before then, the lean programs stand in and Delve's parts come in over
  a moment once they're ready. The effects layer's renderer is made at the
  first idle moment after the first paint, or as soon as an effect is asked
  for; effects asked for before it's ready wait for it. The game's own
  screens (`Game.svelte`, `GameOver.svelte`) are a chunk of their own, about
  a quarter of the script, fetched at the first idle moment or at once on the
  way into a room, so the start page loads and runs without them (tried once
  more if the fetch fails; after that the game screen offers a reload, as
  some browsers won't fetch a module that failed again). The host decodes
  a question's pictures off the main thread (all of a "find the art"
  question's at once), and every device cuts a veiled picture's patches in
  a worker (`src/lib/veilWorker.ts`): their shapes as the question starts,
  each one's picture as it uncovers.
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
nothing. A fetch that would leave noticeably fewer items than `items.json`
has (a changed page layout, most likely) stops before it deletes any art;
`npm run fetch-data -- --shrink` accepts it when poe2db really dropped them.

Each item's tooltip (properties, requirements, mods, flavour text) comes from
poe2db too, into `src/data/itemStats.json`: `npm run fetch-data` ends by
fetching them, and `npm run fetch-stats` fetches them alone. The game loads
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
