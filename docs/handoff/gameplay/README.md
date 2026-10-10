# Handoff: the game screen

The approved game screen: the question (name and art), the reveal with the
verdict and the streak chip, turns mode, Delve's long lists and phones, and
the category cards. Reworked on the design canvas over six rounds and three
studies; this folder is the result.

It was built straight into this PR's code, not drawn: the screenshots under
`screens/` are rendered from it.

- `reference/gameplay.patch`: two commits on top of PR #125 at `9bf6c9c`
  (`git am` applies it). Review it like your own work: types, tests, the
  comments. On it, `npm test` passes (835 pass, one skipped as before;
  three are new in `tests/tallArt.test.ts`), `npm run check` finds nothing
  and `npm run build` succeeds.

Design canvas (owner only), pages "Game screen: after review", "Delve,
streaks and cards" and "Studies 3": https://claude.ai/artifact/3F9B7GxKyv8GhVb7Yxg4oQ

The screenshots are the source of truth for looks, this file for behaviour
and copy. Every rule in `CLAUDE.md` applies (no em dashes, phones from
375 px, plain `:hover`, `pointerType === 'mouse'` in JS, digits in Cinzel),
with one deliberate exception: the streak chip's count is in the body
serif's lining figures (`--font-body`), because Cinzel's 11 reads as II.
Keep it.

**Not in this handoff: Delve's zone announcement** (the gate at a new zone).
It is still being designed. Leave it as it is in the PR: the current
`zonebanner/Threshold` over the banner, and the empty line (`.kicker`) kept
over the banner in a run for it to rise into. The patch doesn't touch
either, with one side effect to check: the banner's heading gets
`line-height: 1.15` (it inherited the body's 1.45), which makes the banner
13 px shorter on wide screens (about 7 on phones), and Threshold builds its
gate round the banner's box. Rendered with the patch the gate still fits its
head (`zone-gate-check`, `air13-zone-gate-check`).

## Delve's gate room

That empty line costs 33 px at the top of every Delve screen. The approved
layout was designed without it (the gate's redesign moves the gate off the
banner and drops it), so until then Delve sits 33 px lower than designed:

- On a 13-inch window (1440 x 725) the row under the answers or pictures,
  Detonate or Next, is partly under the window's edge with eight answers
  (`air13-delve-8`) and with six pictures (`air13-tall-art`,
  `air13-art6-reveal`). Turns mode fits (`air13-name-*`, `air13-art-*`).
- Delve together's cards at 1440 x 900: the rules' second line under the
  cards is cut by the window's edge (`cards-together`).
- On a phone with dynamite at hand the sixth answer is partly under the
  docked Detonate bar (`phone-detonate`).

Don't work round it here: it goes with the zone announcement. If that isn't
settled when this lands, ask the owner whether to drop the line now.

## Screens

The turns shots are online turns mode (a room, not hot-seat: in hot-seat
every turn is the screen's own, so nothing is greyed), seen from a seat
whose turn it is not (`-theirs`) and from the one whose turn it is
(`-mine`). The Delve shots come from the effects lab (`lab.html`), Delve
alone unless said. Most are rendered without WebGL (the backdrop's
fallback); the streak shots and `desk-name-theirs-webgl` with it.

| File | Window | Shows |
| --- | --- | --- |
| `desk-name-theirs`, `desk-name-mine` | 1440 x 900 | name question, someone else's turn and yours |
| `desk-name-theirs-webgl` | 1440 x 900 | the grey with the WebGL backdrop drawing the rows' fill |
| `desk-art-theirs`, `desk-art-mine` | 1440 x 900 | art question: the name as the heading, pictures greyed on their turn |
| `air13-name-*`, `air13-art-*` | 1440 x 725 | the same on a 13-inch window: every answer in view |
| `phone-name-*`, `phone-art-*` | 390 x 844 | the same on a phone, the timer in the scoreboard strip |
| `streak-3`, `streak-11`, `streak-22-blue` | 1440 x 900 | the streak chip at 3, 11 and 22 in a row (Delve; blue from 21) |
| `phone-streak-11`, `phone-streak-25` | 390 x 844 | the docked chip with its count, the sentence under it |
| `delve-8`, `delve-8-reveal` | 1440 x 900 | eight answers in two columns, Detonate at the row's end |
| `air13-delve-8` | 1440 x 725 | the same on a 13-inch window (see "Delve's gate room") |
| `delve-10`, `delve-10-art-reveal` | 1440 x 900 | ten answers; ten pictures at the reveal, names over the tiles' feet |
| `phone-delve-10`, `phone-delve-10-art` | 390 x 844 | ten answers, ten pictures two to a row |
| `phone-detonate` | 390 x 844 | Detonate docked at the foot while dynamite is at hand |
| `tall-art`, `tall-art-reveal`, `air13-tall-art` | 1440 x 900, 1440 x 725 | tall art (six) in one row |
| `air13-art6`, `air13-art6-reveal`, `phone-art6` | 1440 x 725, 390 x 844 | six pictures sharing the height there is |
| `phone-long-name` | 390 wide (top) | a 48 character art name: shrunk, then wrapped, the plate's frame fitted |
| `cards-solo`, `air13-cards` | 1440 x 900, 1440 x 725 | the cards with two finds, each note under its card |
| `phone-cards` | 390 x 844 | the same on a phone: the notes stacked under the cards |
| `cards-together` | 1440 x 900 | Delve together: your vote's seal on the card's foot |
| `zone-gate-check`, `air13-zone-gate-check` | 1440 x 900, 1440 x 725 | the current zone gate (unchanged design) round the shorter banner |

There is no shot of Eternal's eight answers (turns mode); they take the same
two columns as Delve's eight (`delve-8`).

## The question

- **No row over the question.** The category chip said what the tooltip's
  base line already says (Gloves, Ring), so the category is said only there.
- **The task is the turn's second line**, under the banner, where the cards
  screen says "Choose your category": on wide screens the same line, size
  and gap (1.2rem, `margin-bottom: 1.6rem`), so going from the cards to the
  question only changes its words (phones tighten the gap: 1rem up to 760
  px, 0.6rem up to 640). "Name this item" / "Pick the art that matches the
  name". Whoever can't answer is told what is going on, and it holds through
  the reveal: "Doryani names this item" (turns, someone else's turn), "Your
  team names this item" (Delve together, struck out) or "The team …"
  (watching), "The racers name this item" (race spectators).
- **The timer at the line's right end**, over the answers column's edge,
  centred on the line (52 px; 46 px on short windows). The line keeps 60 px
  of padding either side (54 px on short windows) so a long line wraps short
  of it and stays centred. Mounted once per question, so a branch changing
  never restarts it; at the reveal it stays, stopped, at half opacity, saying
  how much time was left. No timer (timers off), no slot. Phones keep it in
  the pinned scoreboard strip (44 px).
- **Name question plate:** always two lines, before and at the reveal
  ("Unidentified" over the category, then the name over its base type with
  Mirrored beside it), so it keeps its two lines and the name never moves
  at the reveal. The base line is 0.95rem (it is the only place the
  category is said now).
- **Art question plate:** the name is the question, so it is the heading:
  1.75rem in a 76 px plate (phones 1.35rem, the plate as tall as its lines,
  62 px at least), the category under it (it said "Which one is it?"). A
  long name shrinks to stay on one line, down to three quarters of its size,
  and only wraps past that (`oneLine`).
- **NamePlate `fit`:** the plate's ends are drawn for 64 px; with `fit` they
  scale to the plate's measured height (inline `--end-scale`, which wins
  over the phone's 0.84 once measured), so the frame's rules sit on its
  edges at any height (the art plate, a wrapped name, phones). Separately,
  and for every plate including CodexItem's: each end is clipped to its
  half, so the two ends' rules meet at the middle instead of overlapping
  (the overlap showed as a brighter stretch). CodexItem doesn't use `fit`.

## The reveal

- **The verdict chip leads the result row**, beside Next, where the outcome
  is read: chip, sentence, Next. It lands at once (the sentence and Next fly
  in after it) and is read out (`aria-live`).
- **The streak is in the chip.** From the fire's first tier (3 in a row) the
  chip keeps its check and says "**N** in a row" instead of its word, and it
  burns with the scoreboard's own fire at the same heat and colour
  (`ablaze`, `heatOf`, `burnsBlue`: blue from 7, Delve 21; full at 10, Delve
  25). It catches 0.6 s after the chip lands, once per question. At 2 in a
  row the chip says Correct and the sentence ends "2 in a row."
- **Whose streak:** the chip speaks for its owner. Turns and Delve alone:
  the turn's answer. Race and Delve together: only on the scorer's own
  screen; everyone else reads it in the sentence about them.
- **Taken once per question** (`streakAt`, an `$effect.pre` as the reveal
  arrives), so the chip never flips from Correct to the count while you look
  at it, and stays put if the player list changes.
- **Art reveal:** each picture's name lies over the foot of its tile on a
  shade, so no picture shrinks or moves as it is named.

## Turns mode: someone else's turn

Online turns mode only (`theirs`: not race, not Delve together, not your
turn, before the reveal; hot-seat is always the screen's own turn). The
answers go grey and flat in place, so at a glance it is plainly not yours to
press; the same list lights up where it stands when your turn comes, and at
the reveal everyone sees the right and wrong colours.

- Rows: the fill through `--bs-fill-a` / `--bs-fill-b` (the WebGL backdrop
  paints the fill from them; a filter on the row would miss it), no soft
  shadow, border `#1a1917`, no box shadow; the names and numbers greyed by
  filter but kept at reading contrast; the hover sheen and cue hidden.
- Pictures: only a little desaturated, as the cards are (`saturate(.6)
  brightness(.8)`), so the items stay recognisable; the warm glow behind
  each goes out (the tile's background layers are now custom properties,
  `--tile-warm` and friends); the tile's number greyed.

## Lists, pictures and window sizes

- **Long lists in two columns.** Eternal's eight and Delve's eight and ten
  answers go into two columns beside the art from 761 px wide (`long`),
  instead of every answer shrinking. The pickers' avatars then sit in the
  row (two at most, or one and a count).
- **Tall art in one row.** The host marks an art question `tall` when every
  option is a spear, staff, quarterstaff, wand, flask, bow, crossbow or
  two-handed mace (`TALL_ART_GROUPS`, measured from the pictures: at least
  about twice as tall as wide). Wide screens show them in one row of tall
  tiles (six from 761 px, eight from 900 px, never ten), as high as the two
  rows they replace, the number above the art. Older hosts don't send it:
  two rows, as before.
- **`tall` before the clock runs (a decision, not an oversight).** Delve's
  copy for guests strips the question until the clock runs (`publicView`:
  no options, no labels, no groups), but keeps `tall`, so the pictures'
  layout doesn't change as they arrive. All it tells early is that every
  option is one of those groups. Covered by `tests/tallArt.test.ts`.
- **Short desktop windows** (up to 820 tall; 761 px and wider for the
  question and the cards, 641 px for the game's top padding): the answers a
  little tighter (as the lobby's rows are), the art a bit shorter, the
  picture rows share the height there is, and the game's top padding
  shrinks, so every answer and Next are in view at 1440 x 725 (outside
  Delve, see "Delve's gate room"). The cards screen gets the same gap under
  its prompt.
- **From 821 tall:** the picture rows share the height there is, up to their
  full 200 px (about 940 tall at zoom 1), so the page ends with the window.

## Phones

- The task line replaces the category row, so the sixth answer is in view
  on a 390 x 844 phone without scrolling.
- **Detonate docked at the foot** while dynamite is at hand and you can
  still answer, where Next will stand; the art and picture rows give it its
  room. The docked bar is solid (not the pinned bars' glass): it holds the
  fuse.
- At every width, the Detonate row isn't kept on a depth with no blast left
  (`blastsLeft`).
- The docked result bar keeps the lower of your pick and the right answer in
  view above it. In it the verdict is its disc alone (the word read out),
  except with a streak: then the chip keeps its pill and count, and the
  sentence takes a line of its own under the chip and Next.
- Six pictures take the height the screen has; Delve's eight and ten
  pictures are two to a row, sized to the screen (ten were 70 px wide in
  five columns).

## The category cards

- **As tall as the question's stage** they give way to: scaled whole with
  `zoom` (`--card-z`: 1.36 from 1100 x 900, 1.2 from 821 tall, 1.1 on tall
  tablets), Delve together a step smaller where its votes need room (1 from
  821 to 899 tall, 0.8 on short windows).
- **What a find gives sits under its own card** on wide screens (its
  column), not in a paragraph under all three. Phones stack the notes as
  before.
- **Delve together:** the voters' seals hang on the card's foot, side by
  side, each seal whole, instead of a row kept empty under every card.
- **The drawn card lifts a little less** (4 px and 1.05, was 14 px and
  1.08), clear of the line above on a short window and inside a phone's
  margins.

## Removed

- The row over the question: the category chip (`.chip`, `.topline`).
- "Doryani is deciding…" under the answers (the task line says it).
- "Which one is it?" in the art question's plate (the category is there).
- The loose orange "3 in a row" pill (`.streak`): the chip says it.
- The spacer that kept the dynamite row's height on phones at the reveal
  (`blastKeep`): Detonate is docked now.
- `narrow` in `lib/layout.ts`, replaced by `sideBySide` (761 px and wider)
  and `short` (761 px and wider, up to 820 tall).

Added for checking: the lab can set a player's streak (`setStreak` in
`lab/controls.svelte.ts`), for the chip at any tier.

## Done when

- It matches the screens at 1440 x 900, 1440 x 725 and 390 x 844 (Delve
  allowing for its gate room), and works at 375 wide and on large windows
  (zoomed as every screen).
- Online turns mode: on another player's turn the answers are greyed with
  the WebGL backdrop on and off; they light up on your turn; the reveal is
  in full colour. The task line says who is answering, also for Delve
  together ("Your team …") and race spectators ("The racers …").
- The streak chip says the count from 3 in a row, never flips during the
  reveal, catches fire once, and only shows on the scorer's screen in race
  and Delve together.
- Tall art stands in one row (six from 761 px, eight from 900 px).
- Phones: Detonate docked with dynamite at hand, the art and rows leaving it
  room; ten pictures two to a row.
- Cards: each find's note under its card on wide screens; Delve together's
  seals on the cards' feet.
- A 48 character art name stays inside its plate on a phone, the frame's
  rules on the plate's edges.
- The current zone gate still fits round the shorter banner.
- `npm test`, `npm run check` and `npm run build` pass.
