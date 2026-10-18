# Dev tools

Test and tuning pages, all linked from the dev hub (`dev.html`), and the recorder for the room bots' hands. The live build leaves them out.

## The dev hub

`dev.html` links every tool page below, with a line on what each is for,
so nobody has to remember their names. On the dev server it links the room
bot too; builds without the bot (the beta) leave its card out.

- **Open it:** `npm run dev`, then `http://localhost:5173/dev.html`; on the
  beta, **poe2.quest/beta/dev.html**. The live build leaves it out.
- A new tool page gets a card there; `tests/devHub.test.ts` fails until it
  does.

## The QA desk

`qa.html` (`src/qa/`) shows every scene of the game in the real app, one at
a time, at every size from a phone to 4K and from every seat, walked with the
arrow keys. It is where a change gets checked; `docs/qa.md` says how to use
it and how to add a scene.

- **Open it:** `npm run dev`, then `http://localhost:5173/qa.html`; on the
  beta, **poe2.quest/beta/qa.html**.

## The lab

`lab.html` (`src/lab/`) is a page for trying Delve's moments by hand: the
real game screen (the app itself, with its backdrop, effects, sounds and
header) beside a panel that sets up and plays a run on this device. It sets
the players (1 to 4), each one's lives, wards, flares and dynamite,
and the depth (any of 1 to 150, or a zone); deals cards with a find among
them, and a second find if wanted; deals a vein's two cards after strike 1
or 2 (the dig, with its haul and lamp); asks questions (name the item or find
the art, a find's, mirrored, unveiled, in grayscale); plays events (a right
or wrong answer, a time-out, a ward breaking, a cave-in, a flare at 0,
a blast (Detonate), dynamite at 0 (its fuse), items gained, a find answered right, the last
life, deeper than ever, a new zone, the plunge); pauses and moves the
clock; shows the end screens (perished, deeper than ever, together); and
switches effects, sound and reduced motion. Events go through the engine
and the session as a game's would; setup changes start the run afresh
under a new id, so they play nothing themselves.

**Spatial sound** tunes the game's spatial sound (`src/lib/spatial.svelte.ts`)
by ear: presets climb a ladder from *Today* (every sound centred, in the
one hall, as the game played before) through panning, travelling sounds and
teammates farther off, the ambience spread wide, a head model and crossfeed
for headphones, and a reverb fed from the sound's side, to *Chosen* (the
game's mix) and *HRTF*; *Haas* places by time alone. **Size** lets a blast
and a cave-in fill the space, **Rooms** gives each place its own reverb,
and **A** flips to today's sound and back. A half circle draws where each
sound is heard from. Its settings are kept (`src/lab/spatial.svelte.ts`)
and shared with the spatial sound page (`spatial.html`, below), which plays
the same with the screen full window.

With two players or more the run is co-op:

- **Screen** picks whose screen the app is (its own taps vote and answer
  for them), and **Acts** whom the events act for.
- Co-op events: **Vote** for each of the three cards, **Others vote**,
  **Give a life** to a teammate who perished, **Perish**, **Others
  perish** and **Time out** for the team.

- **Open it:** `npm run dev`, then `http://localhost:5173/lab.html`; on the
  beta, **poe2.quest/beta/lab.html**. The live build leaves it out (its
  entry is only added with `VITE_CHANNEL=beta`, see `vite.config.ts`).
- **Its storage is its own:** the page is marked `<html data-lab>`, and
  `src/lib/storage.ts` then starts every key with `lab.` (after the beta's
  start on the beta), so its runs, codex, saves and settings never reach the
  game's.

## The backdrop tool

`backdrop.html` (`src/backdropTool/`) is a page for picking Delve's
backdrops by hand: the game's own backdrop full screen (its embers and
effects layer as in a run), beside a panel docked on the right (a drawer
on phones) that drives it. It only sets what the backdrop already draws:
the looks' colours and strengths, how much of each existing detail shows,
and how the embers move. Every change shows at once.

- **Depth:** a slider from 1 to 250 previews the real descent with the
  looks being picked (each depth eases in as in a run; a jump of more than
  three cross-fades), with chips for each zone and **Walk down** (a depth
  every 1.5 s) to judge the handovers and the embers' colour turning over.
- **Brightness:** the scene's average brightness by depth (1 to 200), as
  the game estimates it with its solved light (no frame is drawn or read),
  beside the curve it keeps to; any depth brighter than the rule allows
  (than the one before through the zones, by 8% past them) is marked.
- **Zones:** pick one of the ten (the panel jumps to its 1st depth, where
  it shows alone), then tweak its look: a colour picker for every colour,
  sliders for every strength (Light and dark, Smoke, Haze, Embers, Glints,
  Details), and the embers' motion (a profile and its speed, rise or fall, drift, turbulence
  and swirl). **Use for this zone** puts it in the draft; **Revert** and
  **As shipped** go back.
- **Generate:** a new seed (or type one: a number or any word), a strip of
  six variations, and the generator's settings (hue range, saturation,
  darkness, detail, embers). **Lock** keeps a group as it is while the
  rest is generated again.
- **Endgame:** step through the strata past 100 (11, 12, ...), each shown
  with its name, its archetype, colour scheme and effects; try other seeds
  for one (variations of its archetype) and **Pin** the one you like; tune
  the endgame generator's settings and seed (they shape every unpinned
  stratum; the seed also deals the archetypes and their names).
- **Save:** on the dev server **Save to the file** writes
  `src/data/backdrops.json` (a dev-only endpoint in `vite.config.ts`,
  checked before it is written; never in a build). Anywhere, **Copy JSON**,
  **Download JSON** and **Import JSON**. The draft keeps on the device as
  you go.
- A zone's look stays exactly as shipped until a new one is saved for it
  (`tests/backdrops.test.ts` checks depths 0 to 91 against the looks as
  they were hard-coded). A changed zone is saved with `measured: false`,
  so its measured brightness corrections are dropped; measure again
  (`scripts/measure-luminance.mjs calibrate --skip-env`) to restore them,
  and update `tests/fixtures/shipped-backdrops.json` to the new looks.
- **Open it:** `npm run dev`, then `http://localhost:5173/backdrop.html`;
  on the beta, **poe2.quest/beta/backdrop.html**. Like the lab, the live
  build leaves it out, and its page is marked (`<html
  data-backdrop-tool>`), so `src/lib/storage.ts` starts its keys with
  `backdrops.` and its drafts and settings never reach the game's.

## The zone tuning page

`zones.html` (`src/zonebanner/`) is a page for tuning Delve's zone title
card (`src/components/zonecard/`) in place: the real game screen (a Delve
run of the lab's, in a frame) stepping down into a zone the engine's way,
so the plunge, its sound, the scene's colours and the deal as it lands are
all as in a game.

- **Zone:** any of the nine zones past the Mines, the endgame's first six
  strata (one of each of several kinds of place), the widest name an
  endgame stratum can have (to check its fit), and a zone reached past
  your best. **Replay** (or R) plays it again.
- **Family:** shows the zone with another family's motion (fire, ice,
  spores, the void, light, fumes) to compare them on one place.
- **Phone width** shows the screen at 375 px. **Freeze** keeps the card up
  (its cards never dealt) and stops it at the moment the slider sets, to
  look at any frame of it. **Effects off** and **Reduced motion** show it
  as those players see it (it fades in and out whole). Click the screen
  once for sound.
- **Open it:** `npm run dev`, then `http://localhost:5173/zones.html`; on
  the beta, **poe2.quest/beta/zones.html**. Like the lab, the live build
  leaves it out, and its page is marked (`<html data-lab data-zones>`), so
  `src/lib/storage.ts` starts its keys with `lab.zones.` and its run never
  moves the lab's.

## The descent's test page

Its states are scenes in the QA desk too (`lobby/delve-descent`, with knobs), walked with the rest; this page is for playing them out by hand.

`descent.html` (`src/descentPreview/`) shows Delve's rules block
(`src/components/DelveRules.svelte`: the descent drawn beside the finds,
with the leaders from the pit to the finds' headings) in a rules card at a
phone's (281 px), a tablet's (329 px) and a desktop's (450 px) width side
by side.

- **Deepest:** a slider from 0 to 300 and a box for any depth (0 is no run
  yet); the hint says the depth as players see it.
- **Finds met:** which of the three finds the player has met (only those
  get a leader, or their item beside the pit on a phone).
- **Replay entrance** draws the blocks in again; **Walk down** goes a depth
  deeper every 180 ms.
- **Open it:** `npm run dev`, then `http://localhost:5173/descent.html`; on
  the beta, **poe2.quest/beta/descent.html**. The live build leaves it out.

## The daily streak's test page

Its states are scenes in the QA desk too (`home/daily-streak`, with knobs), walked with the rest; this page is for playing them out by hand.

`streak.html` (`src/streakPreview/`) shows the daily's streak badge
(`src/components/DailyStreak.svelte`) under a mock of Today's unique's
answers, burning for any run of days, and every step of its ladder of
colours (`DAILY_LADDER` in `src/lib/fx/streaks.ts`) side by side below.

- **Days in a row:** a slider from 0 to 730 and a box for any run; the hint
  names the colour, the fire's heat and the days to the next colour.
- **Steps** shows a step's first day; the numbers after them show the day
  before a step, to answer right and see it turn.
- **Answer right** plays what the start page plays for a right answer: the
  badge comes in at yesterday's run and grows into today's, bursting when it
  reaches a new colour. **Miss** ends the run in a puff of smoke;
  **Replay entrance** brings the badge in again.
- `streak.html?days=30` opens it at a run of 30 days.
- **Open it:** `npm run dev`, then `http://localhost:5173/streak.html`; on
  the beta, **poe2.quest/beta/streak.html**. The live build leaves it out.

## The hover tuning page

`hover.html` (`src/hoverPage/`) is for tuning how the hover quietens over a
sweep of the mouse across controls: rows of controls shaped as the game's
(the header's small buttons, the cards, the answers, a menu, chips), their
hovers played as the game plays them (`src/lib/spatial.svelte.ts`), and
beside them the settings: **Off**, **Steps** (each hover 2 dB quieter) or
**Eased** (ducked by how busy hovering is, as the game has it, with its
depth, how much duller, how fast it recovers and how quickly speed ducks
it), keys 1 to 3; and **By pointer speed** (within a sweep, a quick flick
over a control quieter, duller and shorter, a slow arrival in full, between
two speeds in screen widths a second). A strip shows how far each hover was
ducked, with the last one's speed.

- **Open it:** `npm run dev`, then `http://localhost:5173/hover.html`; on
  the beta, **poe2.quest/beta/hover.html**. The live build leaves it out.

## The sound levels page

`levels.html` (`src/levelsPage/`) plays every sound as the game plays it,
grouped by role, and a few that land together in the game (a wrong answer
with the lives it takes, the blast with what it destroys, a run's end, and
the loudest three at once for the limiter), with the whole mix's lift
(`MIX.lift`, `src/lib/soundDesign.ts`) switched between **Before** (0 dB,
the mix as it was) and **After** (the game's now), keys 1 and 2. Switching
plays the last sound again (**Space** switches, **R** plays it again), and
**Blind** hides which is which as X and Y until **Reveal**.

- **Open it:** `npm run dev`, then `http://localhost:5173/levels.html`; on
  the beta, **poe2.quest/beta/levels.html**. The live build leaves it out.

## The spatial sound page

`spatial.html` (`src/spatialPage/`) is the real game screen, full window, on
a Delve run of the lab's, with a menu over it for tuning the game's spatial
sound on any sound by hand. The screen keeps the whole window (the menu
floats over it, and **M** hides it), so every sound comes from where it
would in a game, at any window size; a narrow window lays it out as a
phone does.

- **Players**, **Deal cards** and **Ask** set up the screen; **Ambience**
  moves the run to a zone, for its bed (to hear **Wide ambience** on).
- **Placed sounds** play the game's sounds from the elements on screen they
  come from (hovering the cards or answers with the mouse does too, as in
  the game); **The scene's sounds** belong to the whole scene, to hear
  **Size** on.
- **Space** plays a round of Delve together over and over; **A** flips to
  today's sound and back. The settings are the lab's, and its run is its
  own (`<html data-lab data-spatial>`, `src/lib/storage.ts`).
- **Open it:** `npm run dev`, then `http://localhost:5173/spatial.html`; on
  the beta, **poe2.quest/beta/spatial.html**. The live build leaves it out.


## Recording a hand

On the beta and the dev server, `?record` in the address (for example
**poe2.quest/beta/?record**) records how this player plays, for the room
bots' hands to move by: the pointer about 120 times
a second, what it was over (the anchors the pointer sync uses), clicks,
scrolls and keys pressed outside text fields, where everything was on the
screen, and what the game showed (phase, question, clock, reveal, lives,
and when a new zone's cards were dealt).
Nothing typed and no names. A badge in the bottom left corner shows it's on;
**Save** downloads the file (nothing leaves the device otherwise), **Stop**
ends it. It stays on for the tab until stopped or `?record=off`
(`src/lib/recorder.ts`, `src/components/Recorder.svelte`).

The bots' hands replay what was recorded: `node scripts/bot-motion.mjs
one.json two.json …` cuts recordings into stretches (picking a card, from
when the cards were dealt, not the zone's title card before them;
answering, pressing Next, waiting through someone else's turn, the lobby),
kept relative to what was on screen, into `src/data/botMotion.json` (the
recordings themselves stay out of the repo). A bot replays one that fits
the moment, its pauses fitted to how long it takes to make up its mind and
its last reach steered onto its own pick (`src/bot/motion.ts`, `hand.ts`).
A bot does nothing while a new zone's cards are on their way: its pointer
is off the page, and it looks the cards over from the deal.
More players' recordings make for more kinds of hands.
