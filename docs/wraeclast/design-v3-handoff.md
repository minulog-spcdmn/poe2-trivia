# Design handoff: the item screen of Wraeclast run (v3)

Design the screen where a player answers one item in the new mode: look at
what the zone gives for free, spend supplies from the pack, build the item's
name from syllables, read the marks after a miss, and collect the loot. The
player sees this screen about 33 times a run, so it decides whether the mode
works on a phone.

**What v3 changes** (after the second playtest), if you started from v2:
- The Inscription has no names any more, only syllables.
- A wrong answer marks the tiles as in Wordle.
- The art always sits in the same square frame.
- There are eight supplies, sold in stacks.
- Loot is taken whole.
- Vaal Orbs and the unidentified card are gone.
- Corruption now lives on the map, so a zone can be corrupted when you
  arrive.

Draw it on the design canvas, as usual: use the live site only for grabbing
assets, never build on the real page. The rules in `docs/design-rules.md` and
`CLAUDE.md` apply:
- one gold button per view;
- nothing jumps;
- fit before you shrink;
- state colours;
- Cinzel for numbers;
- arcane visuals per `docs/arcane-style.md`;
- no em dashes;
- no banding.

## The mode in five lines

- **A run:** a solo (or co-op) run across the Wraeclast map toward one boss,
  about 20 minutes, won or lost. There is **no clock**: nothing on this
  screen counts down.
- **The Inscription:** each item's name is built from a pool of **syllable
  tiles**, the answer's own mixed with decoys. Nothing on screen says how
  many decoys there are. Tap only, no keyboard: half the players are on
  phones.
- **The Veil:** the item's art starts fully covered, in a square frame that
  is the same for every item. Supplies burn parts of it in.
- **Supplies,** bought in towns or found as loot, reveal clues or strike
  decoys. Nothing can be bought on this screen.
- **Answers:** a wrong answer costs life but marks the tiles: gold for right
  and in place, silver for right but elsewhere, struck for wrong. A right
  answer drops loot cards, and the player takes all of them.

## What the screen holds

### Always visible (the run bar)

| Element | Content | Notes |
| --- | --- | --- |
| Life | 0 to 100 | A miss costs 20 to 30 early, up to 55 to 65 at the boss; the item shows its range. Must read at a glance |
| Flask | 2 to 4 charges | Drunk during an item, at any moment: +10 at once, then +10 after each of the next 2 items, so up to 2 pending ticks. Drinking right before an unsure submit is a key moment, so the action sits near Submit without being mistaken for it |
| Gold | 0 to about 250 | Only spent in towns, so it is information here |
| Where | Place name and zone type, e.g. "Freythorn, Ritual" | Plus the step (1 to 15) or "Boss". In a corrupted zone, its modifier too, e.g. "Corrupted: Blood toll" |

### The item

1. **The Veil.** The item's art in a fixed square frame, fully covered.
   - No grid: the art burns in through organic patches, the same burn-in
     Delve uses (`src/lib/materialize.ts`).
   - A Flare burns in about a sixth of the item at a random spot, so after
     two Flares the player sees two scattered fragments.
   - Tall weapons and small rings fit the same square, so the frame never
     hints at the item type.
   - Some zones and bosses seal the art, or show burn-ins mirrored and in
     grayscale.
2. **Clues.** The text revealed so far, each with a label saying what it is:
   - **Mod lines** (Scroll of Wisdom): median 36 characters, 1 in 10 over 69.
   - **Flavor text** (Lore reveal): median 87 characters, up to 300, often 2
     lines.
   - **Category** (e.g. "Rings") and **base type** (e.g. "Plate Vest"): short.
   - **Word lengths:** a pattern of dots or bars, e.g. 2 · 1 · 1 · 2, shown by
     the answer line.
   - Name words are masked with a fixed-width mark: "There is no safer place
     / Than the ▮▮▮ of the ▮▮▮".
   - Up to about 6 clues on one item.
   - **No counts anywhere,** not "1 of 4 lines": a count is a free clue.
3. **The pack.** 8 stacks of up to 5 of one supply each, eight kinds:

   | Supply | What the player sees when it is used |
   | --- | --- |
   | Flare | A sixth of the art burns in at a random spot |
   | Scroll of Wisdom | The next mod line joins the clues (they get rarer, so more telling) |
   | Lore reveal | The flavor text joins the clues |
   | Category reveal | The category joins the clues |
   | Base reveal | The base type joins the clues |
   | Decoy sweep | 4 decoy tiles are struck |
   | Word lengths | The word pattern appears by the line |
   | First syllable | The answer's first tile is placed, locked and gold |

   A supply that can't be used on this item looks unusable, with no number
   explaining why.
4. **The Inscription.** A pool of tiles, all lower case, shuffled, each
   distinct tile once.
   - About 14 tiles early, 20 mid, 26 late and 32 at the boss. Some zones add
     6 to 8; never more than 36 (40 until 2026-10-19).
   - Tiles are 1 to 4 letters, plus a possessive "'s": "of", "bel", "gr",
     "voll's".
   - **Tile states:** plain; gold (known right place); silver (in the answer,
     place unknown); struck (greyed where it lies, not removed, so nothing
     jumps).
5. **The answer line.** Placed tiles in order, side by side, up to about 9.
   - There are no spaces and no word breaks, only tiles.
   - A locked first tile looks locked.
   - Tap a placed tile to take it back, or use Clear.
6. **Submit**, the one gold button. Every submit counts, also a build that is
   no real name, so it must not be easy to hit by accident.

### After a submit

- **Wrong:**
  - Life drops (the amount shown), and the coming loot loses a card (show it
    shrinking).
  - The line's tiles light up gold, silver or struck. The marks then carry
    over onto the pool's tiles.
  - The player keeps trying. This is now the main way to learn when out of
    supplies, so the marks must read instantly, on the line and in the pool.
- **Right:** the item's full art burns in with its name (the usual finale).
  Then 1 to 4 loot cards are dealt face up, more in a corrupted zone: gold,
  a stack of supplies, a flask charge, or rarely a boon. The player collects
  them all with one tap. There are no loot beams and no picks.
- **Run over:** life at 0. A separate end screen, not in this handoff.

### Arriving in a corrupted zone

The map shows corrupted zones, but their hidden modifier flips on a single
card when the player arrives: Blood toll, Sealed, Swarming, Dark or Bounty,
with a one-line effect ("Each item takes 10 life when it opens"). This is the
run's big gamble moment, so the flip may take a beat longer than other
flips. Draw it once, as a state of the item screen's first item.

## Co-op (reserve room, draw later)

Co-op is a raid on one shared screen:
- Everyone sees the same item, clues, tiles and marks, and anyone can strike
  (submit) at any time. The first right strike fells the item.
- A wrong strike costs only the striker life, and its marks show for
  everyone.
- Each player has their own life, flask, pack and gold, so the run bar stays
  personal.
- Loot is one shared deal (2 cards plus 1 per player who acted). Everyone who
  acted can take one card, first come, first served, so the deal must show
  who took what as it happens.

What co-op adds, for up to 12 players, is a party strip showing each
player's life, who struck what and who is down. The solo layout should leave
a place for this strip that it can take later without moving everything
else.

## Example content

- **Early pool (Blackheart, about 14 tiles):** the answer is bl, ack, he,
  art; decoys such as bla, ck, her, ar, ble, ark, br, ea, ...
- **A miss and its marks:** the player builds bl / ack / ark against the
  answer bl / ack / he / art. "bl" and "ack" turn gold and "ark" is struck,
  while "he" and "art" stay plain.
- **A long answer:** Mind of the Council: m, ind, of, the, coun, cil.
- **Common mod line clue:** "(3-6) Life Regeneration per second" (22 items
  share it).
- **Flavor clue (Incursion zone):** "If evil must always exist, so be it. /
  Embrace it. Become its master."

## States to draw

| State | Size |
| --- | --- |
| Early item: about 14 tiles, a mod line clue, nothing used | 375, 1440 x 900, 1440 x 725 |
| Mid item: about 20 tiles, flavor and category clues, 2 burn-ins, word lengths shown, 3 tiles placed | 375, 1440 x 900 |
| After a miss: the line marked, the pool carrying gold, silver and struck tiles, the shrunken loot | 375 |
| A Decoy sweep landing on the pool | 375 |
| Boss item: about 32 tiles, art sealed or mirrored, boss modifiers listed | 375, 1440 x 725 |
| Right answer and the loot dealt (4 cards in a corrupted zone) | 375, 1440 x 900 |
| Arriving in a corrupted zone: the modifier card flipping | 375 |
| Drinking a flask charge mid-item, before a submit | 375 |
| Co-op placeholder: where the party strip will sit | 1440 x 900 |

The map screen (nodes, paths, corruption creeping) and the vendor are their
own screens and come in a later handoff.

## The question this design answers

Does the boss pool of about 32 tiles (up to 40 with modifiers) fit a 375 px
phone together with the Veil, the clues, the pack and the run bar, without
page scrolling for the main action? If it doesn't, say so with the closest
layout, and what would have to change in the rules (for example fewer decoys
on phones). That answer feeds back into the design doc.
