# Handoff: the lobby, round 6

The approved lobby. It replaces everything about the lobby in
`../start-page-and-lobby/README.md` (section 1 and its desktop addendum
with the three panels and the QR code: both are dropped).

PR #125 built the lobby from the first handoff's reference. The owner has
since reworked it on the design canvas over six rounds; this folder is the
result, taken from a running prototype of `Lobby.svelte` (the screenshots
under `screens/` are rendered from it, not drawn).

- `reference/Lobby.svelte.txt`: the whole component, round 6. Written
  against the same session API as the first reference (main at 208cc5b).
- `reference/lobby-round6.diff`: exactly what changed since the first
  reference, which is what PR #125 ported. Apply its intent on top of the
  PR's `Lobby.svelte`. The PR moved the kick's two clicks and its 350 ms
  settle into `lib/kick.ts`; keep that and use it (the prototype still has
  its own `KICK_SETTLE_MS`).
- The fake-lobby helper from the first handoff still works for checking
  states (`../start-page-and-lobby/reference/lobbyFixture.ts.txt`).

The screenshots are the source of truth for looks, this file for behaviour
and copy. Every rule in `CLAUDE.md` applies (no em dashes, phones from
375 px, plain `:hover`, `pointerType === 'mouse'` in JS, digits in Cinzel).

Design canvas (owner only), page "Round 6": https://claude.ai/artifact/3F9B7GxKyv8GhVb7Yxg4oQ

## Screens

| File | Window | Shows |
| --- | --- | --- |
| `air13-host` | 1440 x 725 | host, private room, five players |
| `air13-public` | 1440 x 725 | the room public |
| `air13-full12` | 1440 x 725 | twelve players: the party list scrolls, no fade |
| `air13-guest` | 1440 x 725 | a guest: values instead of controls |
| `air13-alone` | 1440 x 725 | host alone |
| `air13-hotseat` | 1440 x 725 | hot-seat: "Add exiles" above the party |
| `air13-delve`, `pro14-delve`, `mbp16-delve` | 13, 14, 16 inch | Delve: the descent fills the panel |
| `desk-alone` | 1440 x 900 | host alone |
| `mbp16-host-tall` | 1728 x 925 | a tall window: mode cards with the name under the emblem |
| `tablet-host` | 820 x 1180 | tablet |
| `phone-host` | 390 x 844 | phone, Begin docked |
| `k4150-host`, `k4100-host` | 2560 x 1310, 3840 x 2030 | large windows, scaled (shots scaled to 2560 wide) |
| `kick-states` | | the kick, step by step |

## Layout

- **The start page's columns carry on.** From 1100 px wide: two columns in
  the start page's stage (side padding `max(32px, 50% - 600px)`, top and
  bottom `clamp(10px, 2.4vh, 40px)`), 440 px on the left where the menu was,
  600 px on the right where today's unique was, pushed apart
  (`space-between`). Centred vertically, at most 724 px tall (what Delve, the
  tallest game, needs), so Begin is in the same corner at every size and
  never moves when the mode changes.
- **Only the game is framed.** The Game column is the site's `.panel` (the
  filigree frame): the settings and Begin are what the host works with. Room
  code and Party sit open on the backdrop, like the start page's menu, with
  a hairline under each heading. The same on tablets and phones: no boxes
  around Room code and Party there either.
- **Equal heading gaps.** Every heading has the same gap to its first row
  (16 px; 13 px on short windows). The room code's glyphs carry their own
  top margin, so its header margin is reduced by that (`.block.room header`).
- **Short desktop windows** (height up to 760): settings rows, panel padding
  and mode buttons a little tighter (see the `max-height: 760px` block).
- **Tall windows** (height 860 and up): each mode is a card with its emblem
  over its name (`MediaQuery('(min-height: 860px)')`, class `.tall`).
- **Tablets** (761 to 1099): the same blocks, Game beside. **Phones**: one
  column; the host's Begin is pinned in the bottom dock as before.

## Room code (online)

- Heading "Room code", the six glyphs, then one row: the invite button
  ("Copy invite link" / "Share invite link" on touch / "Link copied!" /
  "Room locked" / "Room full", disabled when nobody can join) and beside it
  the round eye button that hides the code for streaming. No QR code.
- **Who can join: one switch with both words on it.** "Private" and
  "Public" are both always visible inside a dark well; the lit gold plate
  of the site's chosen buttons (the seg `.on` gradient) slides under the
  word that holds. `role="switch"`, `aria-checked` = public. Lock stays its
  own button beside it. Guests read "Public room" / "Private room".
- The hint under it (locked, full, public, private) and the IP note, as in
  the reference.

## Party

- The same chips the game shows along its top (Scoreboard's pill, avatar
  and name), two to a row on desktop. `(you)` after your own name.
- **Past what fits, the list scrolls in place. No fade.**
- **Host mark: a hanging banner** (the party's standard, line icon in gold,
  22 px) on the host's chip, where everyone else has their ×. `role="img"`,
  `aria-label` and `title` "Host". Not the diamond: the diamond is the
  start menu's cursor, so on the host's own chip beside "(you)" it read as
  "you".
- Heading row: "Party" and the seat pips with "5 / 12".
- **Hot-seat:** the name field is its own block above Party, headed "Add
  exiles", placeholder "Exile's name", and under it "Pass the device
  around; each player answers on their own turn." It stands where the room
  code stands online, so the field never sits among the chips.

## Kicking (host only)

Shot: `kick-states`.

1. At rest a quiet × on every chip but the host's.
2. Pointing at the ×: a thin red ring round it, and the chip's edge warms
   red, so it is clear whose chip it is.
3. **First click: that ring grows sideways into a pill (0.22 s) and the ×
   gives way to "Kick"** (display font, small capitals, red). Same ring,
   same red, only longer: nothing new appears in the chip. The chip itself
   takes the game's wrong-answer colours (border `#8e4434`, the dark red
   wash of a wrong answer tile) and the avatar dims. No timer is drawn.
4. Escape, a press anywhere else, or 3 s untouched: back to rest. Clicks in
   the first 350 ms after arming are ignored (a double click must not kick).
5. Second click: the chip goes out with a red flare, shrinking a little as
   it fades (320 ms), and the others close up (flip). The leaving chip
   keeps its armed look to the end.
6. The kicked player cannot rejoin this session.

Two traps found while building it: shrink the leaving chip with the `scale`
property, not `transform` (Svelte pins a leaving node in place with a
transform, which a transform in the out-transition overrides: the chip jumps
to the grid's first cell); and don't drop the armed class in the same tick
as the kick (a CSS transition starting on the node has the same effect).

The in-game Scoreboard still uses the old bright red "Kick?" pill. Give it
the same ring-into-pill treatment so the kick reads the same everywhere.

## Game panel

- As in the first reference (modes in a row with the notch and one shared
  description cell, one row per setting, guests read values), with:
- **Rules at the foot.** On desktop the rules list sits at the bottom of
  the panel, right above the start row; the spare height goes between the
  last setting and the rules, so they read as the game's rules and not as
  part of the time setting.
- **Start row: "N exiles ready" beside Begin**, the two as one unit at the
  end of the rules. Other lines as before ("You can begin alone, or wait for
  your party.", "Add the first exile to begin.", the Delve on one device
  warning; guests "Waiting for the host to start…"). **Begin is gold
  whenever it can start**, also for a host alone: playing alone is a normal
  game, so it must never look disabled.
- **Delve: the descent fills the panel.** The descent is Delve's progress
  bar and is never cut. On desktop the Delve block takes all the height the
  panel has spare (`.delve-slot`, flex 1); the descent's column then widens
  in 8 px steps, from 196 px up to 58% of the block, until the finds text
  beside it, wrapping narrower, is as tall as the room left (an `$effect`
  with a `ResizeObserver`, measuring the content with
  `getBoundingClientRect`, not the stretched height). No wasted strip above
  Begin. On short windows it stays at its narrowest.

## Large windows

The k4 shots use the scaling approved on the canvas's screen-size page:
the whole app (header included) is scaled with CSS `zoom` =
`max(1, min(width / 1440, height / 980, 2.2))`. That is 1.34 at 2560 x 1310
and 2.07 at 3840 x 2030. Beta's `lib/stage.ts` still uses
`min(width / 2560, height / 1100)` capped at 2; switch it to this rule and
apply it to the lobby as well as the start page, so going from the start
page into the lobby never changes the scale. Under zoom, `100dvh` must be
divided by the zoom, and anything that measures itself
(`getBoundingClientRect`, for example DelveLadder and the Delve fit above)
must divide by `element.currentCSSZoom`.

## Done when

- The lobby matches the shots at every size listed, and works at 375 px.
- Kick: keyboard too (Tab to the ×, Enter twice, Escape backs out), and a
  unit test for the settle and the 3 s disarm if `lib/kick.ts` doesn't
  already cover them.
- `npm test` and svelte-check pass. The `docs/handoff` folder goes in the
  PR that finishes the work.
