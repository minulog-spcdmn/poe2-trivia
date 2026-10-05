# PoE2.Quest • Unique Item Trivia

**Play at [poe2.quest](https://poe2.quest/)** · made by zoe_arcana · [support the project](https://paypal.me/minuW)

A multiplayer Path of Exile 2 trivia game that runs entirely in the browser and
is hosted as a static site on GitHub Pages. No server needed.

**How to play**

1. On your turn, pick one of three random categories. There are 10 broad,
   similarly sized categories: One-Handed Weapons, Two-Handed Weapons
   (talismans included), Off-Hands, Body Armours, Helmets, Gloves & Boots,
   Rings, Amulets & Belts, Flasks/Charms/Jewels/Relics/Tablets, and Lineage
   Gems. A category you pick can't be
   offered to you again for your next 2 turns on Cruel, 3 on Merciless and
   4 on Eternal (Custom sets its own).
2. Name the unique item or lineage gem from its art (or, on harder
   difficulties, pick the right art for a name). A correct answer scores a point.
3. The first player to reach the host's target score wins. The game only ends
   once a full round is finished, so everyone gets the same number of turns.
   If players are tied at the top, it goes to a **deathmatch**:
   only the tied players play sudden-death rounds with a random category and
   questions one difficulty harder. When some duelists answer right and
   others wrong, the wrong ones are out; if all of them get it right, or all
   get it wrong, another round is played. The last duelist standing wins.

Items aren't repeated within a game until a category runs out, and earlier answers never come back as wrong answers (so they can't be ruled out from memory). Precursor tablets come up about a quarter as often as other items; a tablet question only offers tablets (once too few unseen tablets are left for that, they sit out until the category starts over), and tablets don't appear in other questions.

**Race mode** (online only): no turns. Everyone sees the same question at the
same time, in a random category (never one of the last 2, 3 or 4, by difficulty, or as many as Custom sets).
- The first correct answer scores +1 and ends the question.
- A wrong answer costs −1 and locks that player out until the next question.
  Everyone sees live who guessed what.
- The first player to reach the target score wins.
- Race questions always have a timer (16 s if the host picked "off").
- The host's own answers reach the game instantly, while guests' answers
  travel over the network, so the host has a small speed edge.

**Delve** (online or on one device): no settings. Everyone plays the exact same
rules, so "I reached depth 30" means the same thing for everyone.
- On your turn, pick one of three categories and name the item, as in turns
  mode. Each round takes everyone still standing one depth deeper.
- Everyone has **three lives**. A wrong answer, running out of time, or
  missing your turn while you're disconnected costs one (a miss on an
  Azurite Vein two, see Finds).
- Every few depths the rules get harder, one thing at a time: four options
  for the first ten depths (with look-alike names from 3 and a made-up one
  from 5), six from 11, eight from 31. Until depth 58 something gets harder
  at least every three depths (a new rule, less time or a longer lockout,
  never two at once), and nothing ever gets easier. The last new rule comes
  at depth 81.

  | From depth | Options | Look-alikes | Made up | Find the art | Mirrored | Unveil | Grayscale |
  |---|---|---|---|---|---|---|---|
  | 1 | 4 | none | 0 | 40% | never | off | off |
  | 3 | 4 | a quarter | 0 | 40% | never | off | off |
  | 5 | 4 | a quarter | 1 | 40% | never | off | off |
  | 7 | 4 | half | 1 | 40% | never | off | off |
  | 11 | 6 | half | 1 | 40% | never | off | off |
  | 15 | 6 | half | 1 | 40% | 25% | off | off |
  | 17 | 6 | half | 2 | 40% | 25% | off | off |
  | 21 | 6 | three quarters | 2 | 40% | 25% | off | off |
  | 25 | 6 | three quarters | 2 | 40% | 25% | fast | off |
  | 29 | 6 | three quarters | 2 | 40% | half | fast | off |
  | 31 | 8 | three quarters | 2 | 40% | half | fast | off |
  | 41 | 8 | three quarters | 2 | half | half | fast | find the art |
  | 45 | 8 | three quarters | 3 | half | half | fast | find the art |
  | 50 | 8 | three quarters | 3 | half | half | slow | find the art |
  | 55 | 8 | all | 3 | half | half | slow | find the art |
  | 61 | 8 | all | 3 | half | half | slow | all art |
  | 71 | 8 | all | 3 | half | 75% | slow | all art |
  | 75 | 8 | all | 3 | half | 75% | slowest | all art |
  | 81 | 8 | all | 3 | half | always | slowest | all art |

  The quarters (look-alikes and mirroring) are Delve's own: the Custom
  editor keeps its steps. The timer starts at 16 s and loses a second at
  depths 13, 19, 27, 34, 39, 44, 48, 53 and 58, where it stops at 7 s: long
  enough that, even under the slowest unveil, half the art is in with over
  3 s left. The lockout is 2 turns from depth 1, then 3 from 9, 4 from 23,
  5 from 37, 6 from 66 and 7 from 91.

  The unveil comes before grayscale, so the first art to burn in is in
  colour. It starts with the question's clock. From depth 25 it also takes
  "find the art" pictures: 1% of those questions at depth 25, one percent
  more every depth, all of them from depth 124. Each picture is cut much
  coarser than a whole item (3 × 3 fast, 4 × 4 slower), so eight of them stay
  a few dozen patches to send.
- **Endless.** Past depth 100 the rules hold, but from 101 a growing share
  of name questions gets a fourth made-up name (2% at 101, 2% more every
  depth, all of them from 150), and "find the art" pictures keep burning in
  more often until depth 124.
- **Finds.** From depth 5 one of the cards on offer is now and then a find:
  pick it and answer right for an item. An **Azurite Vein** asks the question
  of 15 depths deeper; a right answer within the first half of its clock
  mines an Azurite Ward (it takes your next loss in place of a life), a
  slower one a shard (two forge a ward). A wrong answer or a time-out on a
  vein caves in: it costs two lives, a ward taking each loss first if you
  hold one (on your last life you simply fall). A **Flare Cache** (from depth
  15) asks the question of 20 depths deeper for a flare, which burns by
  itself as your clock runs out for 5 s more; a miss there costs one life as
  usual. The card says the depth it asks, its clock and the risk.
- **Alone**, you delve until your third life is gone; the depth where it went
  is your result. **Together**, the last one standing wins and keeps delving
  to their own last life. If the last players fall at the same depth, whoever
  lost their earlier lives deeper wins; identical runs share the win.
- Each run starts with the whole item pool. A group uses it up faster than
  one player, so a group's depths are a little easier than a solo depth.
- The clock starts once the art has reached the player answering (the host
  waits at most 3 s for it), and nobody sees the options before that.
- Online, a player has 20 s to pick a category, or one is picked for them.
  A player who is disconnected when that runs out loses a life. Nobody can
  skip a turn by hand. After the host reloads, players who were cut off
  get a minute to come back, and a guest's open question is set aside.
- "Delve alone" on the start page starts a solo run straight away.
- Your lives are a phial of three chambers of living ember beside your name.
  A lost life bursts out of its chamber; the last one burns red and trembles.
- The deeper the run, the deeper the scene: the hall darkens and closes in,
  the glow from below turns blood red, the embers grow restless, azurite
  glints in the walls from depth 13, and from depth 21 (where a streak's fire
  first burns blue) the embers start burning blue, all of them by 50. The
  ambience sinks with it, and a slow rumble rises under it.
- Every ten depths the descent enters a new stratum, each named after a
  Delve biome, with a scene of its own: Magma Fissure (11), Frozen Hollow
  (21), Fungal Caverns (31), Vaal Outpost (41), Abyssal Depths (51),
  Petrified Forest (61), Sulphur Vents (71), Abyssal City (81) and Primeval
  Ruins (91), below the Mines of depths 1 to 10. Past 100 the biomes come
  round again, never the same twice in a row. A card names each as you
  reach it, and also marks the last one standing and a solo run going
  deeper than ever.
- Your deepest run alone and together are kept in this browser (start page,
  end screen and Codex, with your last runs). A run resumed by a build with
  other rules still shows, but never counts as a best.
- On a phone, eight answers fit on the screen: names in two columns,
  pictures four to a row.

**Difficulty** (the host chooses):

| | Options | Wrong answers | Extras |
|---|---|---|---|
| Cruel | 4 | Same kind where the category has enough (all rings, all bows, all Strength gems…) | 40% of questions are "find the art": you get a name and pick one of the pictures |
| Merciless (default) | 6 | Same kind where the category has enough, half of them look-alike names, one made up | In race, the art burns into view bit by bit |
| Eternal | 8 | Same kind where the category has enough, all look-alike names, two of them made up | In race, the art burns into view more slowly; "find the art" pictures are shown in grayscale; each picture has a 30% chance of being mirrored left to right (the answer and any picked picture are marked *Mirrored* at the reveal) |

The presets only unveil the art in race mode, where answering from part of the
art can beat the others to it. On your own turn nobody is racing you, so the
unveil would just be a wait.

**Custom** opens an editor where the host sets each knob. The first time,
it starts as the preset that was picked (as it plays in the chosen mode);
after that it keeps its own settings. Everyone else sees the custom rules described under the difficulty, in
the same words the presets use.

| Knob | Steps | Past Eternal |
|---|---|---|
| Options | 4, 6, 8, 10 (the tenth is answered with 0, and its badge says 0) | 10 |
| Look-alike names | None, Half, All | |
| Made-up names | None, 1, 2, 3 (at most half the options: each copies a real name on screen) | 3 |
| Find the art (share of questions) | Never, Some (40%), Half, Always | |
| Unveil (the art burns into view, in both modes) | Off, Fast (patches the size of a 5×5 grid's cells), Slow (7×7), Slowest (9×9, 80% of the timer) | Slowest |
| Grayscale | Off, Find the art (its pictures), All art (the art to name too) | All art |
| Mirrored art | Never, Some (30%), Half, Always | Half, Always |
| Category lockout (turns) | None, 2, 3, 4, 5 | 5 |

In a deathmatch on Custom or Eternal, each knob that makes questions harder
goes one step up, into the steps past Eternal (an unveil that is off stays off). The host's browser remembers the last
custom setup.

Look-alike names form a cluster, and the answer's place in it is random: the
name that looks most (or least) like the others is no more likely to be right
than any other.

**Codex:** a page (from the start page's corner, or at
`poe2.quest/#codex`) listing every item you have seen, with your accuracy per
item, category, item group, question type and difficulty, your nemeses (lowest
accuracy, at least 2 answers), mix-ups (what you picked for what), made-up
names you fell for, streaks and answer times. Every question revealed on your
screen counts as seen; only your own answers count toward accuracy (your turn,
or your guess in a race; a turn that runs out of time is wrong). In hot-seat,
answers only count when one person plays alone. Undiscovered items show as
dark silhouettes, and the codex can't be opened while in a room. It is kept in this
browser's localStorage only (`src/lib/codex.ts`).

## Multiplayer

- **Online (peer-to-peer):** the host creates a room and shares the 6-character
  code or invite link. Browsers connect directly over WebRTC
  ([PeerJS](https://peerjs.com/)). The host's browser runs the game and
  everyone else sees the same state live. Only the free PeerJS cloud is used,
  to introduce the players to each other.
  - Players who refresh or drop out rejoin automatically. The host can skip
    the turn of a player who is disconnected. Opening the same room in a
    second tab moves your seat there, and the first tab lets it go.
  - If the host refreshes, the room reopens with the same code and players
    reconnect.
  - Anyone who joins a game that has already started watches as a
    **spectator** (up to 8) and gets a seat when the host starts the next
    game. This works with the code for any room that isn't locked; public
    rooms that are in a game also show a **Watch** button under Open rooms.
  - The room code stays in the header during the game, unless the host
    hid it for streaming.
  - After a game, the host can **Play again** (same settings, starts right
    away, spectators included) or **Change settings** (back to the lobby).
  - Very strict networks (some corporate or mobile networks) can block
    WebRTC. In that case, use hot-seat.
- **Open rooms:** a host can set their room to **Public**, which lists it
  under "Open rooms" on the start page (rooms are private by default).
  Without a server there's no central list, so a public room claims the
  lowest free numbered listing ID on the matchmaking service
  (`…-pub-1`, `…-pub-2`, …), and the start page checks those numbers in
  batches of 10, stopping after a batch with no rooms. Batches past number
  30 are spaced out to avoid throttling, and rooms above number 10
  periodically move down into freed-up numbers so gaps can't hide them.
  See `src/lib/rooms.ts`.
- **Hot-seat:** everyone plays on one device and passes it around.

The host picks the mode (take turns or race), the difficulty, the target score and an optional time limit
per question (off / 8 / 16 / 32 / 64 s).

## Fair play & safety

There's no server, so **the host's browser runs the game and has the
answers**. The host could always cheat in their own room: play public games
with that in mind. Guests, on the other hand, are treated as untrusted:

- **No answers on the guest's device.** Guests receive a redacted copy of
  the game state. Before the reveal it has no answer, no item ids behind the
  options, and no list of used items. Options are referred to by position
  only.
- **No image files to look up.** Guests never load an item's image file
  during a question. The host sends a lightly altered copy of the art
  (re-scaled, shifted, noised, re-encoded) straight over the connection. On
  veiled difficulties it sends only the patches revealed so far, so the rest
  of the picture isn't on the guest's machine at all.
- **Seats can't be taken over.** Each browser has a secret token that only
  its host ever sees; the IDs other players see are random public IDs.
  Rejoining needs the token and keeps your original name. The token is
  different for every room (derived from the browser's secret and the room
  code), so a host never learns a token that works in someone else's room.
- **Everything guests send is checked.** Every message is validated against
  the few actions a guest may take: pick a category, answer, continue. Guests
  are rate-limited to about 10 messages per second, and the raw data they
  send is capped in size and volume, and checked for lengths that can't be
  real, before it is decoded (so it can't be used to fill the host's memory
  or freeze its tab). A connection that doesn't introduce itself
  within a few seconds, or goes over those limits, is disconnected. One that
  sends anything a real client never sends (a malformed message, or one big
  enough to need splitting) is disconnected and refused for the rest of the
  session.
- **Connection and join limits.** The number of connections a room accepts is
  capped. Connections that haven't introduced themselves yet have a few
  slots of their own, so they never crowd out players and spectators. Each
  is dropped after a few seconds, one peer can't hold more than two, and
  when the slots are full the oldest one makes way (but only after it has
  had a few seconds to say hello). New people can join a full lobby's worth
  at once, then one every few seconds (an occasional attempt that's turned
  down, e.g. for a taken name, doesn't count; a stream of them does);
  anyone held back tries again by themselves a few seconds later. No one can leave and rejoin in a
  loop, since every join is announced to the whole room.
- **Bots.** Answers that arrive faster than a human could react (less than
  about 200 ms after the art reached that player) are ignored.
- **Race fairness.** The host's own answers are delayed by a typical guest's
  one-way network latency, measured with pings. Pings carry random numbers,
  so a guest can't answer them early to look closer than it is.
- **Delve fairness.** A guest's clock starts once the host's queue to them
  is empty (plus half a round trip), waiting at most 3 s, and the art goes
  to the player answering before anyone else. A guest on a link slow enough
  to need more than 3 s for the pictures loses the rest, and the host's own
  art is instant, so the host still has a small edge. In Delve the host
  can't skip anyone's turn; a missed turn only costs a life when the time to
  pick runs out.
- **Host tools.** The host can:
  - lock the room so no one new can join or watch (people already in the
    room can still get back in, e.g. after a refresh)
  - ask another question in the same category if a question's art couldn't
    be loaded
  - kick anyone, in the lobby or mid-game; the kicked player's token and
    connection are then blocked for the rest of the session. Kicking someone
    who is still in the room also bars their name (and look-alikes of it)
    for anyone new; removing an offline player doesn't
  - skip the turn of a player who is still connected but hasn't picked a
    category (or, without a timer, answered) for 30 seconds (not in Delve,
    where a skipped turn would cost a life: there the 20 s to pick and the
    question's clock decide)
  - hide the room code on screen for streaming
- **Names.** Invisible and direction-flipping characters and "zalgo" text
  are removed. Names that pose as the host or look like another player's
  (e.g. using Cyrillic letters or `0` for `o`) are rejected.
- **Public room list.** Entries come from strangers, so each one is
  validated. The list and the scan are capped, and a room answers only a
  limited number of listing probes at a time.
- **Content Security Policy.** The page may only run its own scripts and
  connect to itself and the matchmaking server.
- **Room codes** are 6 characters (about a billion combinations).

**Privacy:** players connect directly (WebRTC), so everyone in a room can
see each other's IP address. The game says so in the lobby and in the room
list.

Not defended against: a determined player recognising item art with
their own tools, and a cheating host.

## Legal pages

`impressum.html` (legal notice, § 5 DDG) and `datenschutz.html` (privacy
policy, GDPR) are plain static pages, built as extra Vite entry points and
linked from every screen. Update them whenever the site starts using a new
third-party service.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # game-engine tests
npm run check      # svelte/type checks
npm run build      # production build in dist/
```

Stack: Svelte 5, TypeScript, Vite, PeerJS. Sound effects are layered CC0
recordings from [Freesound](https://freesound.org) plus a quiet ambience loop
(about 670 KB in `public/sfx`, see `CREDITS.txt` there), filtered and mixed in
WebAudio with a generated reverb. `src/lib/soundDesign.ts` sets the layers.

### Visual effects

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
- **Delve's descent** (`src/lib/descent.ts`): the run's depth becomes a few
  numbers (how deep, restless, red, blue, veined and abyssal the scene is)
  that ease along at about two seconds a depth. The backdrop's shaders and
  embers (`src/lib/backdropEmbers.ts`; a blue ember is a negative size), the
  CSS fallback and the ambience (`depthAmbience` in `src/lib/sound.ts`)
  follow them.
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

### Refreshing item data

Item names and art are scraped from poe2db.tw
([uniques](https://poe2db.tw/us/Unique_item),
[lineage supports](https://poe2db.tw/us/Lineage_Supports)) and committed to
the repo (`src/data/items.json` and `public/items/`), so the game doesn't
depend on poe2db being up.

```sh
npm run fetch-data
```

Each item's group and category come from its art folder; see
`CATEGORY_RULES` in `scripts/fetch-data.mjs`. Image files are named with a hash, so the URL
doesn't reveal the answer.

### Self-hosted signalling (optional)

To use your own [PeerJS server](https://github.com/peers/peerjs-server)
instead of the public cloud, build with `VITE_PEER_HOST`, `VITE_PEER_PORT`,
`VITE_PEER_PATH` and `VITE_PEER_SECURE`.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
The site is served on the custom domain **poe2.quest** (`public/CNAME`), and
invite links always point there (`src/lib/site.ts`).
Turn it on once under **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

---

Fan project. Not affiliated with Grinding Gear Games. Item data and art from
poe2db.tw; Path of Exile is a trademark of Grinding Gear Games.
