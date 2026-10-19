# Design handoff: Wraeclast run v4 (after playtest 3)

The owner played v3 and found the run unfun. The item itself worked; what
surrounded it did not: the run was too long, the screens between items were
slow, the choices weren't real, and much of the wording confused even the
game's creator. This handoff covers the screens between items, the item
screen's changes and every word a player reads. The rules are in
`prototype-v4-handoff.md` (read its first table); `playtests/playtest-3.md`
has the evidence.

Draw on the existing canvas (https://claude.ai/artifact/EEvHCvHLeL3hcJ38aocxrp),
on a new page. The rules in `docs/design-rules.md`, `docs/arcane-style.md` and
`CLAUDE.md` apply, as before: one gold button per view, nothing jumps, fit
before you shrink, state colours, Cinzel for numbers, no em dashes, no
banding.

## 1. Wording comes first

Every line a player reads is in scope: screen titles, buttons, ware and
supply descriptions, clue labels, the flask, the pack, the map, the boss,
tooltips, empty states. Write for someone who has never played:
- short, plain words, one idea per line;
- no house terms without a word of explanation (Inscription, Veil, burn-in,
  front, stack);
- say what a thing does for the player, not how the rules work inside;
- numbers only where the player needs them (prices, life, gold, costs).

Today's text is in the prototype (read only):
`C:\projects\poe2-trivia\.claude\worktrees\wraeclast-playtest\src\wraeclast\`
(the `.svelte` files and the supply texts in `rules.ts`). Examples of what
confused the owner: "Burns in a cluster of the art at a random spot.",
"Eight stacks of up to five. A ware is bought only when its whole stack
fits.", "A drink heals 10 at once, and 10 as each of the next 2 items ends."

Deliver a wording table: screen, old text, new text, for every line,
including lines that stay.

## 2. Fast between items

Target: from a right answer to the next item opening, one tap when nothing is
to be bought (picking the next place), never more than two.
- **The reveal collects the loot.** The finale shows the item's name and
  stats, and the dealt cards fly into the pack. There is no collect button.
  Only a full pack stops the flow: which stack to replace, or leave the card.
- **The next place is picked right there,** or on the map one tap away.
  Decide which reads better at 375 px.
- **Towns and Wells are beats, not screens:** a town heals 20 and opens its
  vendor; a Well refills the flask with a line, not a page.
- **The vendor** (camp, towns, after an Expedition zone): wares as cards with
  prices, tap to buy, the pack in view, one button to set out.

## 3. The map

- 10 steps from the camp (top) to the boss (bottom), 2 to 4 places per step;
  vertical scroll on phones, never sideways. No map art yet: the plain dark
  panel in the arcane look, nodes at their x and y.
- Node kinds: a zone with its zone type, a town, a Well, the boss. A
  corrupted zone shows "Blood toll" on the node (each item there takes 10
  life; loot is doubled). Nothing about corruption is hidden.
- The one decision here is where to go: the linked places one step ahead
  stand out; the rest of the map is context.
- Corruption fronts creep after every second step. Show the move as it
  happens, so the player sees the front advance.

## 4. The item screen changes

- **The answer line reads as one word.** Placed tiles join into one
  continuous word; each keeps a faint seam and its own mark after a miss. A
  break key beside Clear adds a word gap at the end of the line, and tapping a
  gap removes it. The gap is its own tap target, never the seam (tapping a
  tile takes it back). The game never suggests a break. Replace the
  version 25 fusing (gaps between the answer's own words), which gave word
  breaks away.
- **Tiles are 2 to 5 letters,** never one, so names take fewer taps. Redraw
  the pools with that.
- **Supplies:** Torch (was Flare; a working name), Golden Page, Scroll of
  Wisdom, Ancient Orb (was Category reveal), Base reveal, Tangled Fossil (was
  Decoy sweep), Word lengths, First syllable, and the new Stacked Deck. Nine
  kinds against 8 stacks: the pack shows stacks, not a slot per kind.
- **The Ancient Orb clue:** name only, set like any clue (label "Ancient Orb",
  plain body colour, never unique orange, never on the plate or the line),
  worded so it never names the category: "Ventor's Gamble • the same kind of
  item". Under 700 px tall, a list past 4 clues puts the art beside the
  clues.
- **The Stacked Deck clue** shows like the clue it drew, labelled with what it
  is.
- **Corruption on the item screen:** the run bar says "Blood toll" for that
  zone. The modifier flip card is gone.

## States to draw

| State | Sizes |
| --- | --- |
| The map: choosing at step 3 of 10, one corrupted zone ahead | 375 x 812, 1440 x 900 |
| A front creeping on the map | 375 x 812 |
| Right answer: reveal plus loot into the pack, then picking the next place | 375 x 812, 1440 x 900 |
| Full pack during the reveal | 375 x 812 |
| Town: heal and vendor | 375 x 812, 1440 x 900 |
| Camp vendor at the start | 375 x 812 |
| Item: the answer line with a break, a miss marked on fused tiles | 375 x 812 |
| Item: the Ancient Orb and a Stacked Deck clue among others | 375 x 812, 375 x 667 |
| Item in a corrupted zone (Blood toll) | 375 x 812 |

## Deliver

- The boards, on a new page of the canvas.
- The wording table.
- The tap count for each move between screens (right answer to next item,
  arriving in a town, a Well, setting out from the camp).
- Anything in the rules that makes a screen slow or unclear, as a short list
  for the orchestrator.
