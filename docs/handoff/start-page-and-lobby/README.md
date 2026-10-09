# Handoff: new start page and lobby

Approved designs, ready to build. Two pieces of work:

1. **Lobby**: a rework of `src/components/Lobby.svelte`. A working reference
   implementation exists (`reference/Lobby.svelte.txt`), so this is mostly
   integration, review and tests.
2. **Start page**: a new title screen replacing `src/components/Home.svelte`,
   plus a new daily feature ("Today's unique") and an invite screen.

The Scoreboard kick fix that goes with the lobby is already applied on this
branch (`src/components/Scoreboard.svelte`, `KICK_SETTLE_MS`).

Design canvas (owner only): https://claude.ai/artifact/3F9B7GxKyv8GhVb7Yxg4oQ
(page "r8" is the start page, page "rework" the lobby). Everything needed is
in this folder: the screenshots under `screens/` are the source of truth for
looks, this file for behaviour and copy.

Every rule in `CLAUDE.md` applies. In particular: no em dashes anywhere
(`tests/style.test.ts`), phones from 375 px, plain `:hover`, hover checks in
JS use `pointerType === 'mouse'`, storage only through `src/lib/storage.ts`,
arcane visuals per `docs/arcane-style.md`, digits in Cinzel.

Delete this `docs/handoff` folder in the PR that finishes the work.

---

## 1. Lobby

Screens: `screens/lobby/` (`host`, `alone`, `guest`, `local`, `delve`,
`locked`, `full12`, `phone`, `phone2`, `phoneguestfull`).

Reference: `reference/Lobby.svelte.txt` is the approved design built as a
drop-in for `Lobby.svelte` (it was written against the same session API;
`Lobby.svelte` has not changed on main since). Copy it over `Lobby.svelte`,
then review it properly: types, svelte-check, dead code, tests. Its comments
explain each decision; keep them.

`reference/lobbyFixture.ts.txt` is a dev-only helper that fakes a lobby from
URL params (`?fake=host|guest|local&n=5&mode=turns|race|delve&diff=..&pub&hide&code=..&locked&pts=..&long`).
Useful for checking states; do not ship it in the app bundle (use it in a
test or behind `import.meta.env.DEV` if at all).

What changed and why:

- **Room block on top.** The code and link are how the party grows, so they
  head the panel. Code glyphs scale with the container (container units).
  The show/hide eye sits in the label row ("Room code").
- **Invite button.** Primary (gold) when the host is alone in an open online
  room, otherwise normal. On coarse pointers it reads "Share invite link"
  (Web Share), else copies. Disabled and relabelled "Room locked" or
  "Room full" when nobody can join; the link is not offered then.
- **Who can join:** Private / Public toggle plus Lock. Hint when full.
  IP note under it.
- **Player list last**, because it is the part that grows.
- **Hot-seat:** the add-player field sits at the top, above the list, so it
  stays put while the list grows. Line: "Pass the device around; each player
  answers on their own turn."
- **Two-click kick:** "×" turns into "Kick?" for 3000 ms; a second click
  within 350 ms of the first is ignored (a double click must not confirm).
  Same rule as the Scoreboard fix on this branch.
- **Game panel:** mode buttons in one horizontal row; the chosen mode's
  description under a notch pointing up at it; all descriptions share one
  cell so switching modes never changes the panel height. One row per
  setting (name, then choices). Guests read the values instead of seeing
  disabled controls. Round count uses minus/plus steppers that always show
  the number.
- **Start row:** a status line beside Begin, the one thing to know:
  "Add the first exile to begin." / "You can begin alone, or wait for your
  party." / "N exiles ready" / delve on one device: "Delve on one device is
  for one player. Remove the others, or host a room." Guests see "Waiting
  for the host to start…". Only one gold button at a time: when the host is
  alone online with the room open, Invite is primary and Begin is not.
- **Phone:** the host's Begin is pinned in a bottom dock with a fade above
  it. All touch targets at least 44 px.

### Lobby window sizes (addendum)

Shots: `screens/sizes/lobby-*` (`before` = the reference as it is, `fix` =
target). The 980 px cap and centring already handle wide screens. Two fixes:

- **Pinned start row on desktop.** On a 13-inch MacBook Air (1440 x 725) the
  window ends halfway through Begin; with Delve chosen (taller descent
  drawing) Begin is below the window on 13 and 14 inch MacBooks. Make the
  host's start row (status line + Begin) `position: sticky; bottom: 0`
  inside the Game panel: full panel width (negative inline margins equal to
  the panel padding), opaque panel-dark background, the row's top rule, and
  a 28 px fade above it so the rules scroll under it. When the end of the
  panel is reached it sits in place as now. Phones keep their fixed dock; a
  guest's waiting line is not pinned. Prototype CSS that produced the shots:
  ```css
  .settings .start { position: sticky; bottom: 0; z-index: 3;
    margin-inline: -1.4rem; margin-bottom: -1.4rem; padding: 1rem 1.4rem 1.2rem;
    background: rgb(17, 14, 11); border-top: 1px solid var(--line); }
  .settings .start::before { content: ''; position: absolute; left: 0; right: 0;
    bottom: 100%; height: 28px; pointer-events: none;
    background: linear-gradient(180deg, rgba(17, 14, 11, 0), rgb(17, 14, 11)); }
  ```
- **4K at 100%:** the lobby is a quarter of the window wide. It gets the same
  zoom as the start page (see "Window sizes" below), which is why that zoom
  belongs at app level.
- It stays top aligned: the party list grows as people join, and a centred
  lobby would jump each time.

---

## 2. Start page

Screens: `screens/start/`

| File | State |
| --- | --- |
| `W-back` | Returning player, idle |
| `W-hover` | Hovering the greeting (rename affordance) |
| `W-rename` | Renaming; also shows "no open rooms" |
| `W-join` | Returning, Join a room chosen |
| `W-join-bad` | Wrong code: field error + toast |
| `W-connecting` | Opening a portal |
| `W-first` | First visit, idle |
| `W-first-create` | First visit, Create chosen |
| `W-first-join` | First visit, Join chosen |
| `W-answered` | Today's unique answered right |
| `W-wrong` | Today's unique missed |
| `W-invite` | Invite link screen |
| `W-phone`, `W-phone-invite` | Phones (390 wide, 2x) |

Desktop shots are 1440 wide at 1x.

### Layout (desktop)

- Page padding 26px 120px. Two columns, left 452 px and right 510 px,
  pushed apart (space-between). Then the Open rooms section across the full
  width, then the footer band. The first screen is about 900 px tall; more
  than 3 open rooms make the page scroll (that is fine).
- Background: the site's existing backdrop.
- Type scale used: 92 / 32 / 24 / 20 / 17 / 15 / 13 px. Nothing else.

### Left column

- Title "PoE2.Quest", 92 px, `--font-title`, the site's gold gradient title
  treatment.
- "Name the unique." italic 24 px, #ecdcbc.
- "Path of Exile 2 item trivia, alone or with up to eleven friends." 17 px,
  #a99c86.
- **Greeting line**, fixed 44 px tall (margins 16/16), 20 px Maragsa
  #c9a45c, the name #f1d99b:
  - First visit: "Welcome, Exile."
  - Returning: "Welcome back, Kalguur."
  - Mouse hover over the greeting: a quill icon in a 30 px ring plus italic
    "Change your name" appears after it (only on hover; nothing at rest).
  - Touch: tapping the name opens rename.
  - Rename: the line becomes a 40 px name field + "Save" (normal button) +
    "Cancel" (text link). Enter saves, Escape cancels. The menu diamond is
    hidden meanwhile.
  - The name is asked only once (first create or join); afterwards the
    player is greeted. Use the existing stored player name.
- **Menu**, four entries. Each sits in a fixed 108 px slot so nothing moves
  when one opens:
  - **Create a room** "Host your party, or play on your own."
  - **Join a room** "With the code a friend sent you."
  - **Play hot-seat** "Everyone at one screen, passing it around."
  - **Codex** "Every unique you have met: 212 of 501. Deepest delve: 14."
    (real numbers); first visit: "Every unique you meet in a game is kept
    here."
  - Delve is no longer a start page option (it is chosen in a room). The
    Codex corner pill goes away (Codex is in the menu now).
  - Title 32 px / 36 px line, #d9c08a. Description 16 px italic #ab9d88.
  - Focused entry: title #fff1cf with a soft glow, and a 9 px orange
    diamond (#e08a44, glowing) 26 px left of it. This is a keyboard cursor:
    arrow keys move it, Enter chooses; it starts on the last used entry; it
    follows mouse hover; it is not shown on touch.
- **Choosing an entry** replaces its description with a 40 px row 10 px
  under the title. Nothing else on the page moves.
  - Join (returning): code field 170 px, focused, + "Join" (primary).
  - Create (first visit): name field "Your name" + "Create room" (primary).
  - Join (first visit): name field + code field 140 px + "Join" (primary).
  - Create (returning): creates the room right away.
  - Hot-seat: goes straight to its lobby.
  - Codex: opens the Codex.
  - Escape or choosing another entry closes the row.
- **Connecting:** the row shows the rune spinner + "Opening a portal…" +
  "Cancel". Other entries and the rooms dim to 0.45 and cannot be clicked.
- **Errors use the existing toast system** (`Toasts.svelte`). Wrong code:
  code field gets a red border and an error toast "No such room" /
  "No room has the code KXR4QE. Check it with your host." Other join and
  connection errors the same way.

### Right column: Today's unique (new feature)

- Arcane circle, 520 px, with the item art inside (art box inset
  14% 26% 21%: works for tall staves and wide belts alike). Chip at the top
  of the circle: "Category ◆ Today's unique  No. 214". The circle fades out
  at the bottom (mask) into the answers.
- Four answer tiles under it: the game's own option buttons, 2x2, 510 px
  wide, overlapping the circle by 48 px.
- Caption: "The same item for every exile today. Watch for look-alikes."
- **Answered right:** rings lit, chip shows the item name, the right tile
  green with ✓, the made-up option labelled "made up" (no wrap). Row:
  "Practice more" button + "🔥 4 in a row · next in 11 hours".
- **Missed:** rings dimmed, the picked tile red ✕, right one shown, row
  "Streak ended at 4 · next in 11 hours".
- No share button.
- "Practice more": further questions in the same spot with the chip
  "Practice"; they never touch the streak.
- Logic needed:
  - A date-seeded daily item (UTC day) with the same four options for
    everyone, deterministic from the item data (no server).
  - Day number "No. N" counted from a fixed launch date.
  - Streak and today's answer kept via `src/lib/storage.ts`, so a reload
    shows the answered state.
  - "next in N hours" until the next UTC day; spell out "hours" (never a
    lone "h": in this font it reads like "b").
  - Seen items should count toward the Codex like any other question, if
    that is cheap; otherwise leave it out and say so in the PR.
  - `claude/start-page-title-screen` (PR #119, superseded) has a
    `TryOne.svelte` that renders one question on the start page. Reuse what
    helps; the PR itself should be closed after this lands.
- The six example items in the shots (Atziri's Rule, Kaom's Heart,
  Headhunter, Astramentis, Prism Guardian, Wanderlust) were chosen to test
  tall, wide and square art; the real feature picks from all items.

### Open rooms

- Heading "Open rooms" 20 px + count "5 open" + the round refresh button
  from `OpenRooms.svelte` (lit and turning while busy) + on the right
  "Anyone can join. Joining shares your IP address with the room." (the note
  only when rooms exist).
- All rooms shown as tiles, 3 per row, gap 12 px. A tile uses the answer
  button panel style: name 17 px ("Tavakai's room"), meta 15 px
  ("Turns · Cruel · 3/12"), the button inside its own tile on the right.
  "Join"; a room in a game shows "Delve · in a game · 4/12" with "Watch"
  (ghost). A full room dims to 0.55 and shows "Full", no button.
- Empty: one dashed tile "Nobody is waiting right now. Set your room to
  Public in its lobby and it shows up here."
- Searching (first scan): dashed tile with the gold dots "Searching for
  rooms…". On a rescan the rooms already found stay listed.

### Footer band

- A rule with a centre diamond.
- Left: "MADE BY zoe_arcana" + pill "♥ SUPPORT THE PROJECT"; its note
  "Optional tips help pay for the domain and development. Everything stays
  free." as a tooltip.
- Middle, fine print: "Unofficial fan project. Path of Exile is a trademark
  of Grinding Gear Games, who do not endorse this site. Item data and art
  from poe2db.tw."
- Right: "Impressum · Datenschutz / Privacy" (existing links).

### Invite link screen (`?room=CODE`)

Its own screen instead of the start page (`W-invite`, `W-phone-invite`):
centred title, "Name the unique.", "Path of Exile 2 item trivia, with
friends or alone.", a panel "You are invited to room" + the code glyphs,
name field "Your name" (prefilled if known), full-width "Join the room"
(primary), "Joining shares your IP address with the room.", and
"‹ Back to the start" which drops the `?room` param and shows the start
page. Errors as toasts.

### Phones (`W-phone`)

Order: title 54 px, greeting, menu (no cursor diamond, flush with the
title), Open rooms (tiles stacked, refresh button 40 px, IP note under the
heading), Today's unique (330 px circle, answers in one column), footer
stacked (made by, support pill, fine print, legal). Toasts at the top on
phones (existing behaviour). Check at 375 px.

### Window sizes (addendum)

The layout above was drawn at 1440 x 900. Taken literally ("columns pushed
apart", "padding 120") it breaks on real screens. Screens: `screens/sizes/`,
`*-spec` is the literal reading, `*-fix` is what to build.

| File | Window (CSS px) | Typical device |
| --- | --- | --- |
| `air13` | 1440 x 725 | 13-inch MacBook Air M1, Chrome, Dock showing |
| `pro14` | 1512 x 790 | 14-inch MacBook Pro M1 Pro |
| `k4-200` | 1920 x 970 | 4K at 200%, or any 1080p screen |
| `k4-150` | 2560 x 1310 | 4K at 150%, or a 1440p screen |
| `k4-100` | 3840 x 2030 | 4K at 100% (shot scaled to 2560 wide) |

What goes wrong as specced: on wide windows the two columns sit at the
window edges with an empty middle and the room tiles stretch to 800 px and
more; on MacBook windows the fold falls on the "Open rooms" heading, so no
room is visible, which defeats having them always on show.

Build it like this:

1. **One stage.** All page content lives in a stage at most 1440 px wide,
   centred (`margin-inline: auto`). Inside it the columns, rooms and footer
   keep their approved sizes (content 1200 wide). Below 1440 the side
   padding shrinks (to at least 32 px) instead of the columns; when the two
   columns no longer fit side by side, fall back to the stacked phone order.
2. **Centred vertically.** The stage is at least the window height; the
   columns and rooms block is centred in it and the footer sits at the
   bottom of the window (on tall windows the free space splits above and
   below the block, not all at the bottom).
3. **Short windows (height under 860).** A compact rhythm: top padding 16,
   title 80, greeting margins 8 / 6, menu slots 92 (inline rows still fit),
   circle 456 (answer tiles stay 510, overlap 44), rooms margin 8. Goal: on
   a 1440 x 725 window the first row of room tiles is fully visible and the
   second row peeks out, so scrolling is obvious. Shorter than that,
   scrolling is fine.
4. **Very large windows.** Above 2560 px wide the whole app is scaled up
   with CSS `zoom` = clamp(1, min(width / 2560, height / 1100), 2): 1.5 on
   4K at 100%, about 1.2 on a 3440 x 1440 ultrawide. Compute it in JS on
   resize (CSS can't divide lengths portably) and set it as a custom
   property. At 2560 and below there is no scaling, so browser zoom keeps
   working normally where nearly everyone is. Apply it at app level (the
   `.shell`, header included, and the layers screens portal to, such as
   toasts, docks and dialogs) so every screen scales alike, but not to the
   WebGL backdrop canvas, which sizes its buffer to device pixels. Check
   the game screens at 3840 x 2030 too.
5. **Retina** needs nothing: text and rings are vector or high-res. Item art
   is drawn about 1.2x above its own size on average on 2x screens (small
   rings and jewels more). Acceptable; do not upscale further.

The same stage rules apply to the invite screen (centred, scaled the same).

---

## Done when

- Both screens match the shots at 1440 and 390 (and work at 375), and the
  start page matches the `screens/sizes/*-fix` shots at those window sizes.
- Keyboard: menu arrows/Enter/Escape, rename Enter/Escape, focus visible.
- `npm test` and svelte-check pass; new logic (daily seed, streak, day
  number, kick settle) has unit tests.
- One PR into main with before/after screenshots. Do not merge until the
  owner says "ship it".
