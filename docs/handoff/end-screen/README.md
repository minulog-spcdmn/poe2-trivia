# Handoff: the end of a game

The screen everyone sees when a game ends (`src/components/GameOver.svelte`),
redesigned for normal games (Take turns, Race, hot-seat) and Delve (alone and
together), at every window size. Today it is one centred column: a kicker, a
212 px circle, the headline, a sub line, a ranked list and the buttons. It
becomes the lobby's two columns: the result in the start page's rune circle on
the left with what the game meant for you under it, and a lobby panel on the
right with the ranking or the party, the highlights everyone shares, and the
start row.

This one is drawn, not built. The screens under `screens/` are design boards
(1x CSS px): the header bar, the backdrop with its embers and the footer are
captured from the site; everything between them is laid out on the canvas.

Design canvas (owner only), page "End of game, round 7" (e7):
https://claude.ai/artifact/3F9B7GxKyv8GhVb7Yxg4oQ

The screens are the source of truth for looks, this file for numbers,
behaviour, copy and data. Every rule in `CLAUDE.md` applies (no em dashes,
phones from 375 px, plain `:hover`, digits in Cinzel, arcane visuals per
`docs/arcane-style.md`, no banding: scrims dithered).

## What changes, in short

- **Two columns, as the lobby:** the left column (440 px) holds the circle,
  the headline and what is yours (Your game; in Delve, Where your lives went);
  the right column is a lobby panel (600 px, `.panel.gp` as in
  `Lobby.svelte`) with the mode's heading, the ranking or the party, the
  Highlights and the start row. Phones stack them.
- **The circle** is the start page's rune circle (as on Today's unique), large
  and behind the column, the winner (or the delvers) at its heart.
- **Gone:** the kicker ("Victory", "Perished", "Deeper than ever", "The
  descent ends"); the result says it. "Change settings" becomes "Back to
  lobby" in every mode. Share leaves the start row for the panel's heading.
  The credit line under the buttons goes; the start page footer is used.
- **New:** Your game (the player's own result in sentences, the uniques they
  missed, achievements earned); Highlights (shared moments of the game); in
  Delve, Where your lives went (each life, what took it, the phial draining),
  the runs chart against this device's records, and the run's facts.
- **Delve's button** says "Delve again". The panel heading names what was
  played: "Take turns", "Race", "Delve alone", "Delve together".
- **Unchanged:** the effects (`victory`, `fallen` in `lib/fx/`), the
  ArcaneCircle strengths (0.6 the winner, 0.35 a player who lost; Delve 0.42
  for a deeper run, 0.3 otherwise), `again()` and its one-click guard,
  WatchToggle, `shareDepth()` and `canShare`, the Delve records
  (`lib/delveRecord.ts`).

## Screens

| File | State |
| --- | --- |
| `n-won` | Take turns, 5 players, you won (host) |
| `n-lost` | Take turns, you (Una, a guest) came third |
| `n-race` | Race, 8 players, you joint second; Finn and Renly join next |
| `n-dm` | Lost a deathmatch: both on 10, the winner took the extra duel |
| `n-left` | Alva went offline; two join next |
| `n-twelve` | 12 players (you are Dannig): the ranking in two columns |
| `n-hot` | Hot-seat: one device, no "you" |
| `n-spec` | A spectator who plays next |
| `n-air13`, `n-air13-lost`, `n-air13-twelve` | 1440 x 725 (13-inch) |
| `n-phone`, `n-phone-twelve` | Phone, first screen (twelve: your row pinned to the dock) |
| `n-phone-full` | Phone, a guest, the whole page |
| `d-solo` | Delve alone, perished at 22, four short of the best |
| `d-first` | Delve alone, the very first run |
| `d-best` | Delve alone, a new best (44); the vein caved in on the last life |
| `d-team`, `d-team6`, `d-team12` | Delve together, 3, 6 and 12 delvers (host) |
| `d-team6-guest` | The same run on Doryani's device (a guest, brought back once; not his best) |
| `d-team6-spec` | The same run, watched by someone who joins next |
| `d-air13`, `d-team6-air13`, `d-team12-air13` | 1440 x 725 |
| `d-phone` | Phone, alone, first screen |
| `d-phone-full`, `d-phone-team6` | Phone, alone and together, the whole page |

## Layout (desktop)

As the lobby: a 1200 px stage centred in the window (x 120 to 1320 at 1440
wide), the left column 440 px and the panel 600 px, `justify-content:
space-between`, `align-items: flex-start`. Both columns start on the lobby
panel's top line (y 98 at 900 tall, 82 on short windows, the lobby's own
values) and each ends where its content ends; neither stretches. That keeps
the panel exactly where the lobby's panel stands, so going back to the lobby
or into the next game never moves it. The footer is the start page's, at the
foot of the window.

Short windows are Home's (`max-height: 859px` and `min-width: 1081px`).
Between 641 and 1080 px wide, stack the two columns at 600 px, centred, with
the circle first. Phones are below.

**Fitting the window.** With two columns, each fits the window on its own,
step by step, measured as it will stand once everything has come in (never
guessed from how many rows or achievements there are). The whole page fits,
footer included, so it never scrolls:

1. Roomy (the 900 column below).
2. A tighter rhythm (the short window's spacing, below). A short window
   starts here.
3. Closer: the rows of lives and the thumbs of your misses closer and
   smaller, the finds' lines closer. Nothing is lost yet.
4. Compact lists: achievements side by side (seal 36 and title, what each
   asks on hover), the finds without their rules.
5. Smaller: the circle and the runs chart at 80%, the rows of lives and the
   thumbs smaller still.
6. Folded: the column's longest list gives up a row (the lower of two as
   long), again and again, until the page fits. A row of thumbs or
   achievements ends in a "+N" place, a list of lines (highlights, lives, the
   run's facts) in a line saying how many more; either opens the list in
   place. A row of thumbs or achievements folds down to one row, a list of
   lines down to one line. Once a list is opened, the others in its column
   stay folded as they were, even if the page no longer fits: opening one
   never opens the rest.

If even that won't fit, the footer closes up (less space above and below its
links) and the steps go again. Only where that won't do either the same
steps go again for the column alone, the footer left below; and if not even
the column fits, nothing folds: the page scrolls with everything shown rather
than hide things and scroll anyway. From 900 tall up, every game fits. Below
it a party of twelve may scroll (a 13- or 14-inch laptop, 725 and 790 tall,
and the fullest run alone at 725): the team's plates never fold, so everyone
who delved stays on the screen.

Each column takes the first step that fits it, so a full panel never squeezes
the column beside it. Phones and windows under 1081 px wide scroll instead.
On the QA desk, "Any game, as set", "Any run alone, as set" and "Any run
together, as set" have every count as a control (players, misses,
achievements, new uniques, finds, runs before, lives given and brought back),
and their named states hold the most each kind of game shows.

| | 1440 x 900 | short window (its spacing is the tighter rhythm) |
| --- | --- | --- |
| Circle (the ring's diameter) | 470 | 380 |
| Winner's avatar in the circle | 108 | 86 |
| Delve alone: your avatar | 118 (25% of the circle) | 95 |
| Headline, normal | 58 px, shrunk to fit 440 on one line | 44 |
| Headline, Delve ("Depth 26") | 66 | 52 |
| Line under it | 18 normal, 16 Delve | 16 normal, 15 Delve |
| Headline over the circle's foot (share of the circle) | normal 36%, Delve alone 30%, together 25% | normal 37%, Delve as at 900 |
| Body text in the left column | 17 | 16 |
| Panel padding top and bottom | the lobby's | 16 |
| Ranking rows | 54 (52 in two columns) | 40 (36 in two columns past 8 players) |
| Two columns of ranking | more than 7 players | more than 5 |
| Highlights text | 17 (16 in Delve) | 16 (15) |

## The circle and the result

- `ArcaneCircle` drawn as on the start page (the gold rune circle of Today's
  unique), centred on the left column; at 470 it runs 15 px past the column on
  each side, which is intended. Its strength stays as today. Delve, a run
  short of your best (and anyone watching a run together): the circle
  desaturated (about `saturate(.25) brightness(.85)`) and your avatar greyed
  (`grayscale(.75) brightness(.8)`); a new best or a first run: gold.
- The circle fades downward so the headline and the column can run over it:
  a mask fully drawn to 50%, 30% at 74%, gone at 88% (short windows 46%, 25%
  at 68%, gone at 80%). Pointer events off.
- The headline and its line sit on a soft dark scrim (an ellipse about 60 px
  wider and 20 px taller than the words, 86% dark in its middle, dithered).
- **The heart of the circle:** the winner's avatar; Delve alone, yours;
  together, every delver round the heart, you ringed in your orange
  (`#e08a44`, 2.5 px, a 10 px glow) as on your plate. Their ring's radius is
  13% of the circle for up to 4, 17% up to 6, 20% up to 12; each face as
  large as fits (at most 17% of the circle). Today's "+N more" goes: all
  twelve fit.
- **Headline:** normal, "You are victorious!" or "Una of the Vaal wins!" in
  today's gold `h1` (shade plus gradient), one line, its size shrunk to fit
  440 px. Delve: "Depth 26", gold for a new best or a first run, cold silver
  (`#ece4d4` to `#5f574b`) otherwise.
- **Line under it** (italic, muted, numbers in Cinzel bold gold): see Copy.

## Normal games

### Left column: Your game

Under the circle, a section headed "Your game" (the lobby's `.sec`: display
font 20 px, gold, a hairline under it). Sentences in the body font, numbers in
Cinzel bold gold:

- A player who did not win first reads their place, with their avatar (30):
  "You came third with 7 points." / "You came joint second with 9 points." /
  deathmatch: "You came second, tied on 10."
- Their game: Take turns "8 of 10 right. Your fastest took 2.4s."; all
  right: "10 of 10 right, not one missed."; Race "First right on 10 of 70
  questions; 1 wrong guess took a point back. Your fastest took 2.2s.";
  deathmatch loser "All 10 right, then 2 more in the deathmatch; you missed
  the third."
- The uniques they missed: "The two you missed, kept in your codex:" (or
  "The one you missed…"; Race "The one you guessed wrong…"; deathmatch "The
  deathmatch question you missed…"), then the codex item thumbs (60 px; 50,
  44 and 40 as the column closes up; 64 on phones; 10 px apart). No name
  under them: it shows on hover, and a click opens the item window as the
  codex does.
- **Earned this game**, a section of its own under it (as every set of
  achievements earned is, in every mode: heading and hairline): the
  achievements earned in it, as the codex lists them: the seal (50 px, 42 in
  the tighter rhythm), the title in the display font and what it asks under
  it; compact, side by side.
- **Hot-seat** (one device, no "you"): the section is "Missed answers", "Kept
  in this device's codex.", and every miss of the game with the missing
  player's avatar (20 px) as a badge in the thumb's bottom-right corner.
- **A spectator:** nothing under the circle, and the left column is centred
  vertically against the panel (`align-self: center`).

### Panel

- **Heading:** the mode played, "Take turns" or "Race" (the lobby's `MODES`
  names).
- **The ranking**, as today's end screen draws it, in the lobby's chip style:
  rank as a plain lining numeral (muted), avatar 28, name, score in Cinzel
  bold gold. The winner's row gold (border `#c9a45c`, a warm gradient and a
  soft glow); your row outlined in your orange (`rgba(224,138,68,.85)`, a 12 px
  glow), no tint and no side bar; "(you)" small and muted. Ties share a rank.
  The deathmatch winner ranks first among equal scores (as today).
  - Someone who left: their row at 50% with a greyed avatar, and the lobby's
    offline mark (`StandingMark`, the signal with no bar lit) before the score.
  - More than 7 players (5 on short windows): two columns, filled top to
    bottom then left to right.
- **Highlights** (`.sec` heading "Highlights", then a list): each row a 30 px
  icon column (an avatar 24, an item thumb 30 with its art 26, or the gold
  diamond 10), 10 px, then the sentence; rows 10 px apart. The same for
  everyone in the room, "(you)" marking the viewer. Three rows, by mode:
  - Take turns: "Doryani answered fastest: 1.8s on Atziri's Disdain."; "The
    hardest category was Amulets & Belts: 3 of 5 answered right."; "The
    category picked most was Body Armours, 8 times." (category icons: an item
    of that category, on a gold disc).
  - Race: the fastest answer; "Kaom's Heart was missed most: 5 exiles
    guessed it wrong."; "Una of the Vaal was first 6 times in a row."
- **The start row** (below).

## Delve

### Left column: Where your lives went

Under the circle, "Where your lives went": one row per life lost, oldest
first. Each row: the codex thumb of the unique that took it (46 px; 42, 34 and 28 as the
column closes up), then the
item's name (display font, `#f3c37e`) over the depth and zone (italic,
muted: "Depth 18, Magma Fissure"), and on the right the run's phial
(`Phial.svelte`, 50 px wide) as it stood after that life, so it drains row by
row. Rows 10 px apart (5 compact, 3 smaller).

- **A cave-in:** the title is the cause in the reveal's words, "The vein
  caved in"; under it the unique and what it cost: "Kaom's Heart at depth 44:
  a ward and a life", or "…: two lives". The thumb has no badge. When a ward
  broke, the broken ward stands left of the phial (8 px), drawn as the reveal
  leaves it (`QuestionView` `.lost-ward`: `ItemGlyph kind="ward"` in its two
  `piece`s, apart, at 55 to 60%), about 22 px tall. The phial drains only by
  the lives lost. Two wards that took both hits cost no life, so no row.
- **A life given** (together): the revive heart (Scoreboard's
  `heartOfLight`) in place of a thumb, "Given to Doryani", the depth and zone.
- **Brought back** (together, on the one revived): the item's thumb with the
  heart as a 20 px badge in its corner, the note "Depth 21, Frozen Hollow.
  Kalguur brought you back.", and the phial as it was before (the life came
  back).
- **Watching** a run together: no section; the circle sits centred against the
  panel, as for a normal game's spectator.

### Panel, alone and together

One order everywhere; together only adds the party on top.

- **Heading:** "Delve alone" or "Delve together", with **Share run** at its
  right (the lobby's small `.lock` button style: 3 px radius, display font
  700, .72rem, .12em tracking, capitals, the share sign). Only for a delver
  (`canShare`); never for someone watching.
- **The party** (together): the in-game scoreboard plates, three to a row
  (two for two delvers): avatar, name ("(you)" small and muted), "Depth 25"
  under it (the depth in Cinzel bold gold), your plate outlined in orange.
  The one brought back carries the revive heart (18 px) at the plate's right
  end. Plate height 48 (44 for more than 6 delvers; 42 and 35 on short
  windows), 8 px apart (5 for 12 on short windows).
- **Your runs:** a caption in italic ("Your runs alone, oldest first", "Your
  runs together, oldest first"), then the chart (236 px wide including its
  label) and beside it, 16 px on, this run's facts.
- **Earned this run**, a section of its own on every run that earns one
  (as Earned this game), then **Highlights** (as in normal games), then the
  start row with "Delve again".
- **The very first run** (no chart yet): "Finds": "None
  turned up on this run. What you can find:" and the lobby's finds list
  (`DelveRules.svelte`: the find's glyph in the 30 px column, its name in
  capitals in its colour, what it gives, and its risk on its own line in the
  `.miss` tint, `color-mix(in srgb, <find colour> 45%, var(--muted))`), then
  Highlights.
- **Watching** a run together: no Share, no chart (the run is not on this
  device's record); "This run" as the caption over the facts, under the
  plates; the party's Highlights with no "(you)".

### The runs chart

This device's counted runs of the kind (alone or together,
`lib/delveRecord.ts`, oldest first, the last one this run), one column per
run, drawn engraved:

- Columns 34 px wide with gaps up to 22 for five runs or fewer; 22 px with
  gaps up to 12 for more; when that does not fit 180 px, gaps 6 (5 past nine
  runs) and columns as wide as fits, at least 10.
- Each earlier run hatched (45°, 1 px lines every 4 px) and outlined in its
  zone's accent (lifted); this run solid in its accent at 86%. A baseline in
  gold at 70% and a 4 px tick under each column.
- Labels in Cinzel 13 px: this run's depth over it (`#fff1cf`), the best's
  with a ✦ (`#ddd3c2`); one label when this run is the best.
- A dotted line at the median of all runs shown, labelled "usual 16" in
  italic 13 px to its right.
- Scale: the top is the deepest run + 1. Height 150 (120 for more than 6
  delvers) at 900, 110 (89) on short windows; alone 190 and 150, as alone holds
  more runs over a wider range; phones 136.

### Facts and Highlights in Delve

Facts (the run's own, beside the chart, `.fx`: the 30 px icon column with the
find's glyph or the gold diamond, rows 8 px apart):

- "Three of ten zones reached." (the zone index + 1, of ten)
- Finds the run turned up and what came of them, e.g. "Dynamite you won at
  depth 14 blasted a question away at depth 17." / "An azurite vein at depth
  41 gave you a ward." / together "Dynamite won at depth 12 blasted a question
  away at depth 18."

Highlights, together (the party's, the same on every device): "Una of the
Vaal answered fastest: 1.4s on Kaom's Heart."; "Kalguur (you) gave a life to
bring Doryani back at depth 21." (the heart as its icon).

Highlights, alone (this device's own moments; none of them the lives list
already shows, since in Delve every miss costs a life):

- "Your fastest answer: 1.9s on Headhunter." (the item's thumb)
- "Your closest call: Ingenuity at depth 16, right with 0.4s left." (the right
  answer with the least time left on its clock)

The first run shows the first only.

New in your codex (alone, under the highlights): the uniques met for the
first time this run, less those the lives list already shows. The count sits
on the heading's line, in the body font ("One met for the first time", "3 met
for the first time", "All 23 met for the first time"); under it, one row of
thumbs in the order met (40 px, 34, 30 and 26 as the panel closes up), each opening its codex page, as many as fit
with the last place a "+N" that shows them all in place. No section when
there are none.

## The start row

At the panel's foot, as the lobby pins Begin: a hairline, then the status on
the left and the buttons on the right.

- **Host:** "Back to lobby" (ghost) and "Play again" (primary, big; Delve:
  "Delve again"). Play again is the right-hand, larger one.
- **Status** (host): one icon column, 30 px wide, centred on the same line as
  the Highlights' icons, text 10 px after it on the Highlights' text edge, so
  the status text never moves when someone joins.
  - "All 5 exiles still here" with a check (18 px), or "4 of 5 exiles still
    here" with the offline mark, in the warm `#eab3a3`.
  - Under it, when spectators will join: the watching eye (the scoreboard's
    "Watching" mark, drawn as a line icon in muted) and "Finn and Renly join
    next".
  - Italic, muted, numbers in Cinzel bold gold. Hot-seat has no status.
- **Guest:** centred, a gold pulse dot and "Waiting for Kalguur to start the
  next game…" (Delve: "…the next run…").
- **Spectator:** the dot in the same 30 px column, "You play in the next game
  once Kalguur starts it." (Delve together: "You join the next run once
  Kalguur starts it."), and WatchToggle's "Just watch" (ghost) at the right.

## Phones (below 641 px)

One column, 16 px gutters, scrolling:

- The circle at 340 with the headline over its foot (normal 36 px, Delve 56
  alone and 52 together; the line 16, wrapping within 358 px).
- Normal: the mode's heading with the ranking (rows 46, 40 past six players),
  Your game, Highlights. Delve: Where your lives went, then the mode's block
  ("Delve alone" or "Delve together" with Share run in its heading; together
  the plates two to a row at 42 px), the runs chart (136 tall) with the facts
  under it, then Highlights.
- **The dock:** fixed to the bottom, `#0b0907` with a hairline on top and a
  22 px fade above it; "Back to lobby" (ghost, small) and "Play again" /
  "Delve again" (primary, filling the rest, on the right where the thumb
  rests), both at least 48 px tall. A guest's dock holds the waiting line.
- **Your row below the fold:** when you did not win and your row is not on
  the first screen (seventh or lower), it rides on the dock's top edge as one
  opaque piece with it (`n-phone-twelve`), until the list scrolls it into
  place. Nothing of the list shows between it and the dock.
- The start page footer ends the page.

## Copy

| Where | Text |
| --- | --- |
| Headline, you won | You are victorious! |
| Headline, someone else | Una of the Vaal wins! |
| Line, normal | 10 points after 10 rounds • Race: 10 points after 70 questions • deathmatch: Tied on 10, won the deathmatch in round 3 |
| Line, Delve alone | Perished in the Frozen Hollow, four short of your best, 26. • Into the Vaal Outpost, eight past your best, 36. • Your first descent reached the Frozen Hollow, the third zone. |
| Line, Delve together | Into the Frozen Hollow, eight past your best together, 18. • Into the Frozen Hollow, five short of your best together, 31. |
| Line, watching a run | The party reached the Frozen Hollow. |
| Panel headings | Take turns • Race • Delve alone • Delve together |
| Sections | Your game • Missed answers • Highlights • Where your lives went • Earned this run • Finds • This run |
| Chart captions | Your runs alone, oldest first • Your runs together, oldest first |
| Buttons | Back to lobby • Play again • Delve again • Share run • Just watch |

Numbers small enough are words where the line reads as speech ("four short",
"eight past", "The two you missed"); counts and depths in Cinzel elsewhere.
"Into" and "Perished in" take "the" before a zone's name unless the name has
its own ("The Mines").

## Data

Already there: the standings and winners, the deathmatch, spectators,
`delveStandings`, `delveTeam` (each delver's depth, revives), the run's
losses, `session.delveResult` (best, previous best), the records
(`delveRecord.ts`: the runs list per kind for the chart), the codex
(`codex.ts`: items met, and per Delve answer its find, what it earned, a
cave-in's lives and wards), achievements (`achievements.ts`).

Per device (no network): the line under the headline and the circle's tone
(this device's records: a guest's screen measures the run against the
guest's own runs together, so the same run can be a best on one screen and
not on another); the runs chart; Your game (own answers and times); alone,
the Highlights (fastest and closest call from own answer times and clocks,
new uniques from the codex before and after the run).

New, small, from the host with the end of the game (the same for everyone):

- Fastest answer (who, the item, seconds), from each device's own answer
  time, sent with its answer.
- Take turns: per category the questions asked and answered right (the
  hardest is the lowest share among categories asked at least twice; the one
  picked most by count). Race: the item guessed wrong most, the longest run
  of firsts. Together: who gave a life to whom, at which depth (`revives`).
- Delve's facts: zones reached and the finds of the run with what came of
  them (from the run state or the codex log).

Live today and not on the boards: the together line "Longest team streak:
N". If it stays, it belongs in the party's Highlights as a third row.

## Not in this handoff

The effects and their timings, the header (it already shows the room, or
Delve's depth and zone), the backdrop, the lobby. The descent plate stays in
the lobby only.
