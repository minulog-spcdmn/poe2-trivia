# Animation audit, 2026-11-01

What still snaps, pops or jumps on screen where it should move. Nine reviewers read every player-facing component (question round, in-game header and scoreboard, Delve and items, category cards, end screens, start page, lobby, Codex, shell and dialogs), each checked against the docs so deliberate stillness isn't listed. Read from the code; nothing was run. "Checked" marks a claim confirmed in the code afterwards.

Each line: where • what happens now • the motion it should get • how often players see it.

## 1. Motion that's meant to be there but doesn't play

- `QuestionView.svelte:2539` (overrides `:2142`) • Delve's answer words snap in when the clock starts, while the item's name fades: the later `.text` rule's transition (color, text-shadow) drops the shared rule's `opacity 0.2s` • add `opacity 0.2s` back • every timed Delve question • checked.
- `QuestionView.svelte:2127` • Detonate's `.gone` sets `visibility: hidden` at once, so its 0.25s fade-out never shows; it vanishes when you answer • `visibility 0s 0.25s` in its transition • every Delve question with dynamite • checked.
- `TimerRing.svelte:419` with `QuestionView.svelte:1619` • at the reveal `.stopped` snaps the ring to 0.4, then the wrapper fades to 0.5 over 0.4s: a drop, then a second dim • give `.timer` an opacity transition or drop one of the dims • every timed question • checked.
- `QuestionView.svelte:2780-2791` • art tiles' right/wrong tint is a gradient, so `background 0.3s` can't run and the tint snaps while the border eases • cross-fade the tint on a `::before` by opacity • every art reveal • checked.
- `GameOver.svelte:1077` • "New in your codex" (Delve alone) uses a local `in:fade` (no `|global`, no `calm()`), unlike its siblings' `in:settle|global`; it can land before the Highlights above it • `in:settle|global={{ delay: 1150 }}` • most solo runs • likely.
- `App.svelte:457` • the Settings chunk is never fetched ahead (`whenSettled` covers lobby, game, codex). The first open of the gear raises an empty sheet that then jumps to full height • `whenSettled(loadSettingsPage)` • once a visit • checked.

## 2. Seen every turn or every question

- `Scoreboard.svelte:1006` and `:972` • on a turn change the lift, border and ring ease 0.35s, but the pointer triangle (`li.active::after`) jumps to the new entry and the background snaps • keep `::after` on every entry at opacity 0 and transition opacity and a 3px drop; add background-color to the transition • every turn • checked.
- `Scoreboard.svelte:1544-1554` (phones) • the new active pill's name and bar appear in one frame (clip-path dropped) while the pills glide • fade `.info` in after the glide, opacity only • every turn on phones • likely.
- `App.svelte:647-697` • the header's line changes as `screen` changes, at the start of the outgoing 130ms fade, not with the new screen ("Round 1 • First to N" appears early, goes blank on Play again). Round/Question N (`:686-688`) and Delve's depth number (`:667`) just change • hold the line until `arrive()` as the tools already are, cross-fade it; roll the number under `{#key}` • every round • checked (plain text).
- `ChooseCategory.svelte:918-919`, `Game.svelte:452`, `game.ts:2252` • a solo pick goes to the question in the same tick, so the chosen card's 0.55s lift and 1.3s outline are cut off by `cardsOut` after about 180ms; watchers never see which card was taken (`picked` is local; co-op gets a 1.1s moment) • a 300 to 400ms hold, and the chosen/faded state on watchers' screens • every turn • checked (`picked` local); the hold is a pacing call.
- `QuestionView.svelte:1584` (phone upright) • the task line hides at once, the outcome flies in 250ms later: a blank quarter second • fade the line out as the outcome rises • every question upright • likely.
- `ItemWindow.svelte:196-198` • switching items fades the name but swaps the tooltip body in one frame • `in:fade` on the keyed body • every switch • checked.
- `ItemWindow.svelte:46-52` • `top` follows the open height and, on phones, `--dock`, straight through `style:top`; the plate jumps while the roll eases its height over 0.38s, and on phones at every reveal • FLIP translateY over the roll's 0.38s, not while dragged • often while open • likely.
- `Inventory.svelte:112,131` • the count fades in after dynamite goes off, but just changes on a find or a burned flare • the same `count-in`, timed after the glyph • several times a run • likely.
- `ChooseCategory.svelte:997` • co-op vote seals scale in and out, but there's no `animate:flip`, so the others jump 12px sideways • `animate:flip` 250ms • every vote • checked.
- `ChooseCategory.svelte:1045-1070` • "Closes in N s" pops in and the vote line reflows; at the draw the vote line and lockout note vanish at once and what's below jumps up • fade in, `out:` fades holding their height • every co-op turn • likely.
- `QuestionView.svelte:1260-1261, 1239-1244` • race's "Wrong: −1…" and co-op's own-miss line replace the tip in place, while the fuse and blast lines beside them fade • `in:fade` 200ms • each wrong guess • likely.
- `QuestionView.svelte:2611`, `DailyUnique.svelte:862` • unpicked rows fade opacity 0.4s but `saturate(0.5)` snaps • add filter to the transition • every reveal, subtle • likely.

## 3. Seen every game or every visit

- `Lobby.svelte:589, 605, 636, 650-657` • a guest reads the host's settings as plain values, which snap when the host changes them • `{#key}` with the description's `in:fly` y:-6 • every settings change online • checked.
- `Lobby.svelte:578-660` • picking Delve swaps the settings rows for the descent in one frame; the panel changes height and Begin jumps, out of step with the description's fly • fade the slot in, no fade out • every Delve host and guest • checked.
- `Lobby.svelte:508-510, 283-302` • "Nobody else yet…" vanishes with no exit as the second player's chip flies in, the party jumps up; the note by Begin swaps text • `transition:slide` like its siblings, keyed fade on the note • every multiplayer lobby • checked.
- `Lobby.svelte:448-450, 971-981` • seat pips light and "2 / 6" changes with no transition • fade the pip about 120ms into the chip's arrival • every join and leave • likely.
- `Lobby.svelte:991` • an away player's name dims in one frame while their avatar greys over 0.3s • `transition: opacity 0.3s` • often online • checked.
- `OpenRooms.svelte:259-268, 227` • "Searching for rooms…" turns into an empty state with no motion; `.note` pops while `.open` fades • short fades • every start page visit • checked.
- `App.svelte:634-637, 781-785` • the header fades in but has no out; going home it stays lit and is cut; the legal links pop • `out:` fade 150ms, the same on the links • every leave, every Codex or Settings close • checked (no `out:`).
- `GameOver.svelte:1737, 1782` • a leaver's row dims to 0.5 in one frame while their mark fades and avatar eases • `transition: opacity 0.3s` • every online game • checked.
- `GameOver.svelte:784-791` • the host's "All N exiles still here" ↔ "N of M" swaps in one frame; "X joins next" pops • cross-fade in one grid cell • every online game • likely.
- `Codex.svelte:541-547` • the tagline swaps on a tab turn while everything below rises • `{#key tab}` fade • every tab turn • checked.
- `Codex.svelte:513`, `CodexAchievements.svelte:106`, `CodexDelve.svelte:166`, `AchievementSeal.svelte:150` • the medallion's arc fills over 1.6s, but every bar and the seal's ring stand full from the first frame • scaleX from 0 under `.rising`, by `--rise-delay`; not the hundreds of tile meters (`:793`) • every open and tab turn • checked (no transition on `.fill`).
- `Home.svelte:718-755, 1704-1709` • the quill swaps greeting and rename form with no transition, unlike every other swap there (SWAP_IN/SWAP_OUT); for touch newcomers saving a name the greeting loses a line and the menu jumps up • SWAP_IN/SWAP_OUT in one grid cell, hold the height • newcomers, once or twice • checked.
- `DailyUnique.svelte:388-393, 429-438` • "Practice more" (and the day rolling over) jumps the legend and caption while options fly and art fades • `in:fade` keyed on the question • every practice question • checked.
- `DailyStreak.svelte` with `DailyUnique.svelte:186, 277` • the badge reads today's number while its fire is still growing from yesterday's • step N-1 → N as the fire lands • daily streakers • likely; whether it counts is the owner's call.
- `App.svelte:101, 251-260` • reloading a hot-seat game mounts the start page, then fades it out for the game: a flash of the start page • decide the first screen from the saved game • reloads, iOS tab restores • likely (traced, not run).

## 4. Rare

- `Game.svelte:563-566` • "You perished and are now watching" pops in and out; its siblings fade • `transition:fade` • once or twice a run • checked.
- `Scoreboard.svelte:893-904` • group Delve's revive heart pops and the entry's width jumps • scale in from 0.6 • while a teammate is down.
- `Scoreboard.svelte:819` • a kicked player's entry vanishes (no `out:`) • `out:fade` • kicks.
- `Scoreboard.svelte:1038-1056` • benched grayscale and the armed kick's gradient snap.
- `Phial.svelte:117, 323-349` • the last life's deeper red and faster beat snap in (and the beat restarts mid-beat) • overlay faded by opacity, new beat at the next beat.
- `Inventory.svelte:99, 118` • the last flare's count leaves and the dynamite jumps left by its width • close the gap.
- `QuestionView.svelte:1034` • race's "+N" chip pops in; `:2995` a teammate's wrong art pick darkens at once.
- `ChooseCategory.svelte:833-866, 1002, 1050` • the vote prompt's text, the "+N" voters, the vote countdown (no warning near zero).
- `CodexItem.svelte:200-236, 195` • opening a related item fades name and art, the record's lines snap; same for a variant.
- `Codex.svelte:829` • sorting the table jumps rows • flip only rows near the screen, or cross-fade the tbody (hundreds of rows).
- `Codex.svelte:376-388` • Erase snaps to the blank plate • let it rise in as a turned page.
- `DelveRunLog.svelte:97, 122`, `CodexDelve.svelte:192, 201` • "Show all" rows pop; collapsing leaves the reader scrolled below the button (keep the button in place first).
- `Gallery.svelte:66-95` • later onlookers pop into the line, the list rows pop, `.when.next` colour snaps.
- `Codex.svelte:1323` • `.cat.on`'s inset edge snaps.
- `Lobby.svelte:472` • the host banner jumps to the new host; `:455-499` a guest moving between party and gallery reads as two people (crossfade send/receive); `:353` "Link copied!" label; `:395-420` the lock's shackle and hint.
- `CustomDifficulty.svelte:234-248`, `SigilPicker.svelte:150, 195-200`, `Avatar.svelte:108`, `RoomCodeGlyphs.svelte:44`, `Connecting.svelte:30`.
- `GameOver.svelte:360` • a late achievement refits the column and rows snap tighter; `:239, 740-775` "+N" opens with a jump; `:1095` the phone's pinned row pops; `:972-982, 811` Share → Copied and the idle line.
- `DelveLadder.svelte:376-411, 526-570` • a second player joining a Delve room flips to the co-op records and the stars jump (cross-fade or travel).
- `Home.svelte:816-822` (phone rooms count), `:896-902` (Something else → today's unique).
- `Toasts.svelte:96-97` • the connection toast sits outside the flip list, so neighbours jump; its state swap snaps.
- `SyncDialog.svelte:238-299`, `Settings.svelte:689-711` • view swaps and the sync light.
