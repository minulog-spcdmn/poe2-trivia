# Handoff: Wraeclast run, prototype v3 (after playtest 2)

> Changed since it was handed out: the v3.1 fixes and rulings in
> `decisions.md` (Oct 19) override this file where they differ.

The solo test page `wraeclast.html` exists from v2. This handoff reworks it
after the owner's second playtest: better, but still too easy in places, too
stingy in others, and missing the map. Rework the page in place; keep what
still fits (run log, tuning panel, life and flask, the burn-in Veil, the
vendor dealt as cards).

Full design (owner only): https://claude.ai/code/artifact/0fa0afec-10a6-450a-873f-0600974437b6

This file is the source of truth for the prototype's rules, numbers and data.
Where the design doc says more (boons, events, fog, tiers, co-op), leave it
out. Every rule in `CLAUDE.md` applies (no em dashes, phones from 375 px,
plain `:hover`, `src/lib/storage.ts` for storage, generated data never
hand-edited).

## What playtest 2 found, and what changes

| Found | Change |
| --- | --- |
| Far too few supplies | Supplies come in cheap stacks; loot takes every card dealt |
| Flares reveal too little for their price | Flares burn in about twice as much (about a sixth of the art) |
| No way to learn base type, category or flavor text | Three reveals: Lore, Category, Base |
| Striking a wrong name's syllables makes no sense | No names on the board at all: the answer's syllables plus decoy syllables, not whole names. Name strike is gone |
| The board says how many names it has | No counts anywhere: not of decoys, mod lines or words (Word lengths is the one supply that tells) |
| The art's size gives the item type away | Every item sits in the same square frame |
| Scrolls of Wisdom only show common lines | Scrolls read from the most common line to the rarest |
| Showing how many mods an item has is a free clue | Never show it |
| No map phase | The map is in: route choice across the hand-placed nodes |
| The Vaal Orb is always worth using once you know the item | Vaal Orbs are gone. Corruption spreads over the map instead |
| The unidentified card feels bad | Gone |
| More cards but only one pick isn't worth the risk | You take every card dealt |
| A wrong answer teaches nothing | Wordle marks: right place gold, elsewhere in the answer silver, not in it struck |
| Out of supplies and not sure: you feel stuck | The marks: a guess always teaches something, paid in life |
| "mandrago" was one tile; auto spacing invented word breaks ("mandrago ra") | Tiles of at most 4 letters (small words aside); no spaces on the line at all |

## What v3 must answer

| Question | What answers it |
| --- | --- |
| Is the right difficulty there now? | Win rate, misses per item, life over the run |
| Do the Wordle marks make guessing a better deal than supplies? | How often a miss is followed by a right answer; supplies used per item |
| Is corruption a real decision? | Fronts stopped, hidden modifiers met and what they cost, boss modifiers at the end |
| Does the map add real choices? | Branches taken vs offered, by zone type and corruption |
| Is a full run the right length? | Run time; items per run |
| Does the boss board (about 32 tiles) fit 375 px? | Screenshot at 375 px |

## Scope

In:
- **The map phase:** the hand-placed nodes from `wraeclast-map.json` (in this
  handoff), routes forward one step at a time, towns, Wells, zones with zone
  types, and corruption.
- **Items:** the syllable pool with decoys, Wordle marks, the square burn-in
  Veil, free clues, the eight supplies, life and flask, loot.
- **Data:** the two generated files, updated, with their tests.
- **Tooling:** the run log and tuning panel, updated.

Out: boons (a Boon loot card is a 25 gold jackpot here), events, fog,
tiers, co-op, the Codex and achievements, resume after a reload, map art.

## The map

`wraeclast-map.json` holds the nodes as the owner placed them: `id`, `name`,
`step` (0 to 16), `x` and `y` (fractions of the illustrated map), and `kind`:
`camp` (step 0), `town`, `boss` (step 16) or `open`. Commit it as
`src/data/wraeclast.json`. It is hand-placed, so it does **not** go on the
generated list. The owner is still editing placements, so the code must take
whatever the file holds:
- Any step may have 1 to 4 nodes. A step with no nodes is skipped.
- A town can sit at any step, and more than one step can hold a town.

**Paths** are built when the page loads, not stored:
- Each node links to its 2 nearest nodes on the next non-empty step (by x and
  y), or to all of them when there are only 1 or 2.
- Each node on that next step gets at least one incoming link, from its
  nearest node on the step before.
- Links only go forward.

**Drawing:** no map art yet. Use a plain dark panel in the mode's arcane
look, with nodes at their x and y, paths as lines, and names under the
nodes. Phone first: the map may scroll vertically (it runs top to bottom),
never sideways.

**Each run rolls:**
- **Open nodes:** about 5 in 6 become zones, the rest Wells (events come
  later). Steps 1 and 15 are always zones.
- **Zone types:** each zone gets one of the six types below, so routes differ.
- **Corruption seeds:** 3 (see Corruption).

**The travel phase:** the player sees the whole map with every node's kind,
zone type and corruption, and picks one of the linked nodes ahead. That is
the only decision here: nothing from the pack is used while travelling.

| Node | What happens |
| --- | --- |
| Camp | Start: 100 life, a flask with 2 charges, 20 gold, an empty pack. The vendor deals every ware |
| Zone | 3 items under the zone type (tuning: items per zone, 1 to 3, for shorter test runs) |
| Well | Refills all flask charges. Heals no life |
| Town | Heals 20 life on arrival; the vendor deals every ware |
| Boss | 3 items under the Silent rule (only Flares work) plus any corruption modifiers; no loot. Beating it wins |

## Zones

| Zone type | Free clue | Rule | Loot cards |
| --- | --- | --- | --- |
| Plain | The item's most common mod line | None | 2 |
| Incursion | Flavor text, name words masked | Flares burn in half as much | 2 |
| Essence | Base type (gems: the support description) | None | 1 |
| Ritual | Word lengths | Scrolls of Wisdom don't work | 2 |
| Expedition | The item's most common mod line | The vendor deals after the zone | 1 |
| Blight | A small burn-in | 6 extra decoys | 2 |

A free clue that doesn't exist for an item falls back to Word lengths.

## Corruption

- **Seeds:** when the run starts, 3 zones at steps 3 to 7 are corrupted, on
  different branches where possible (at least 2 apart in x). A corrupted node
  glows on the map.
- **Creep:** after every second step the player takes, each front creeps
  forward one step. It corrupts one zone on the next step that it links to,
  picked at random. A front facing only towns, Wells or the boss jumps to a
  zone the step after. A front with nowhere to go waits. The node it left
  stays corrupted, but only the front creeps.
- **Arriving:** a corrupted zone shows its hidden modifier on a card that
  flips. Every item there deals twice the zone's loot cards.

  | Hidden modifier | Weight | Effect in that zone |
  | --- | --- | --- |
  | Blood toll | 2 | Each item takes 10 life when it opens |
  | Sealed | 2 | Supplies don't work; a flask charge still does |
  | Swarming | 2 | 8 more decoys |
  | Dark | 2 | The art can't be revealed |
  | Bounty | 1 | No catch |

- **Cleansing:** answering all its items cleanses a zone. Cleansing a front
  stops that front for good.
- **The boss:** every front still alive when the player reaches the boss adds
  one modifier, rolled, at most 3: Lingering (a 4th item, like item 3),
  Bloodied (misses cost 10 more life), Murky (Flares burn in half as much),
  Teeming (8 more decoys). The boss screen lists them.

## An item

1. **The item opens:**
   - the Inscription: the answer's tiles and decoy tiles, lower case,
     shuffled, each distinct tile once;
   - the Veil: the art covered, in a square frame;
   - the zone's free clue.
2. **Use supplies or a flask charge,** at any moment of the item. Nothing can
   be bought.
3. **Build the name:**
   - Tap a tile to place it, and tap a placed tile to take it back. A tile can
     be placed more than once. Clear empties the line.
   - There is no space button and no automatic spacing. Placed tiles sit side
     by side as tiles.
4. **Submit.** Every submit counts.
   - **Right:** the full art burns in, the name shows, and the loot is dealt
     (see Loot).
   - **Wrong:**
     - Life drops by the miss cost, and the deal loses a card.
     - The line is marked tile by tile against the answer's tiles. **Gold:**
       the right tile in the right place. **Silver:** a tile the answer holds
       elsewhere (count it as often as the answer holds it, as Wordle does).
       **Struck:** not in the answer.
     - The marks stay on the board's tiles, each tile keeping its best mark.
       Struck tiles grey out where they lie.
5. There is no skip, and an item never comes up twice in a run.

**Checking:** a build is right when its letters, joined, equal the answer's
letters without spaces and punctuation (lower case). A build split
differently from the tiles' own split still counts.

**Pool size**

| Steps | Tiles in all |
| --- | --- |
| 1 to 5 | 14 |
| 6 to 10 | 20 |
| 11 to 15 | 26 |
| Boss | 32 |

Each item's total rolls within 3 of its section's size, and decoys fill it
(at least 8), so the board's size never tells how many tiles the answer has.
Blight, Swarming and Teeming add theirs, up to 36 tiles in all.
(Changed on 2026-10-19: fixed decoy counts leaked the answer's tile count,
and 36 keeps the boss board on a 375 x 667 phone.)

**Picking decoys:**
- About half come from the tiles of names in the item's own category, half
  from all others.
- Prefer tiles that look like the answer's: shared letters and similar
  length. Draw at random from the best 30 so pools vary.
- Never use a tile the answer has.
- Decoys don't have to form whole names, and the game never says how many
  there are.

**The Veil:**
- Every item sits in the same square frame. Fit the art inside it, centred,
  so tall weapons and wide items look the same from outside.
- Patches are cut only from the item's visible pixels, as in v2.
- A Flare burns in about a sixth of the item's visible area: about 12 of the
  81 patches, as one cluster. "Half as much" means 6.
- A free burn-in (Blight) is 4 patches.

**Never show counts:** not how many mod lines, decoys, words or patches are
left. A supply with nothing left to show is simply unusable, with no number
on it.

## Life and the flask

As in v2:
- 100 life and never more.
- A miss costs a random 20 to 30 at steps 1 to 5, 30 to 40 at steps 6 to 10,
  40 to 50 at steps 11 to 15, and 55 to 65 at the boss. The item shows its
  range before submitting.
- A flask charge, drunk during an item, heals 10 at once and 10 after each of
  the next 2 items.
- Towns heal 20, and Wells refill the charges.

## Supplies

| Supply | When used | Sold as |
| --- | --- | --- |
| Flare | Burns in about a sixth of the art at a random spot | 3 for 6 |
| Scroll of Wisdom | The next mod line, from the most common to the rarest (by `shared`, ties in tooltip order), name words masked | 3 for 6 |
| Lore reveal | The flavor text, name words masked | 2 for 6 |
| Category reveal | The item's category, as the other modes name it | 2 for 6 |
| Base reveal | The base type (gems: the support description) | 1 for 6 |
| Decoy sweep | Strikes 4 decoys | 3 for 6 |
| Word lengths | The answer's word count and tiles per word, e.g. 2 · 1 · 1 · 2 | 3 for 4 |
| First syllable | Places the answer's first tile on the line, locked and gold | 2 for 6 |

- **The pack:** 8 stacks, each up to 5 of one supply. A stack that would go
  over 5 fills a new stack.
- **The vendor** deals each ware as a card with its price; buying takes the
  card. The camp, towns and Expedition zones deal the full set again on each
  visit.
- **Silent boss:** only Flares work.

## Loot

A right answer deals the zone's loot cards face up, and the player takes all
of them (a tap to collect).
- Each miss on the item removes one card, but a right answer always deals at
  least 1.
- A corrupted zone deals double.

| Card | Gives | Weight |
| --- | --- | --- |
| Gold | 4 to 8 at steps 1 to 5, 6 to 10 at steps 6 to 10, 8 to 12 at steps 11 to 15 | 10 |
| Supplies | A stack of 2 of one random supply | 8 |
| Flask charge | Refills one empty charge (rolled again if none is empty) | 2 |
| Jackpot | 25 gold (stands in for the boon card of the full design) | 1 |

Loot that doesn't fit in a full pack can replace a stack, or be left.

## Data (generated, with tests)

### `src/data/syllables.json` from `scripts/make-syllables.mjs`

1. "of", "the" and "and" stay whole. A possessive keeps "'s" on its last
   tile.
2. No other word is a single tile. Compounds split at word boundaries, then by
   syllable. A one-syllable word splits before its vowel ("gr / ip").
3. The rest is hyphenated with Liang's patterns, and any piece longer than 4
   letters (not counting "'s") is split again, near its middle at a vowel.
4. All lower case. Keep word boundaries in the file (Word lengths needs them).

Tests:
- Every name rebuilds from its tiles and boundaries.
- No tile is empty.
- No tile is a whole word except the three small words.
- No tile is longer than 4 letters plus "'s".

### `src/data/clues.json` from `scripts/make-clues.mjs`

Per item: category, base, mod lines with their `shared` count (as in v2),
flavor text, and for gems the support description. Name words are masked
with a fixed-width `▮▮▮`.

Test: no clue contains a masked word of its own item's name.

## Run log (updated)

**Per run:**
- the route taken (node ids) and the zone types and corruption met;
- fronts seeded, stopped and alive at the boss, and the boss modifiers;
- supplies bought, found and used per type;
- loot cards dealt and taken by kind;
- gold earned and spent, run time, and win or loss;
- the tuning used and the viewport width.

**Per item:**
- `itemId`, `category`, `step`, `zoneType`, `corruption` (the modifier, or
  null), `boss`;
- `tiles` (the answer's tiles and the decoys), `freeClue`;
- `supplies` (type, order, ms), `burnIns`;
- `submits` (the tiles placed, right or wrong, the marks, life lost, ms);
- `lifeBefore`, `lifeAfter`, `drank`, `loot`.

**Per travel step:** the nodes offered and the one picked.

## Tuning panel (updated)

- Items per zone (1 to 3).
- Decoys per section.
- Miss costs; supply prices and stack sizes.
- Flare and free burn-in sizes.
- Loot cards per zone type and the loot weights.
- Corruption seeds (0 to 5), creep interval (1 to 3 steps), the
  hidden-modifier weights, and the corrupted loot multiplier.
- Marks: gold and silver, or gold only.
- Free clue on or off per zone type.

## Look

Still plain, with existing parts.
- **Tile marks:** gold and silver use the game's state colours; struck tiles
  grey out where they lie.
- **The map:** a plain panel for now.
- **The corruption flip:** reuse the deal's flip.
- **Phone first:** 375 px with no sideways scroll. If the boss pool doesn't
  fit, note it in the PR with a screenshot.

## Done when

- A full run plays from the camp across the map to the boss, on a phone and
  on a desktop, won and lost, with at least one corrupted zone entered and
  one front left alive.
- Both scripts run, their files regenerate, and their tests pass.
- `npm test` and `npm run check` pass.
- The page is on the beta (`beta-deploy` skill), never live.
- The PR lists anything here that didn't work as written.
