# Handoff: Wraeclast run, first playable prototype

A solo test page for the core of the new mode: building an item's name from
syllables (the Inscription), lifting the cover off its art (the Veil), and
deciding which supplies to spend. It runs on the beta only and is built to
answer a few design questions with real play, not to be the finished mode.

Full design (owner only): https://claude.ai/code/artifact/0fa0afec-10a6-450a-873f-0600974437b6

This file is the source of truth for the prototype's rules, numbers and data.
Where the design doc says more (the map, boons, co-op, tiers), leave it out.
Every rule in `CLAUDE.md` applies (no em dashes, phones from 375 px, plain
`:hover`, `src/lib/storage.ts` for storage, generated data never hand-edited).

## What the prototype must answer

| Question | What answers it |
| --- | --- |
| Do good players answer from the free clue alone, so supplies and gold stop mattering? | Share of items answered without using a supply, per player |
| Is building a name from syllables fun and hard enough without a clock? | Accuracy and time per item; misses per board size |
| Does a 10-name board fit a 375 px phone? | The board at 375 px, boss items included |
| Is a loss after a long run frustrating, and is the life budget right? | Win rate, where runs end, life left at the end |
| Which clues are worth buying? | Supplies bought and used per type, accuracy after each |
| Should the board say how many words the answer has? | Tuning toggle, played both ways |

## Scope

In:
- One solo run of 15 items on one device: 4 zones of 3 items, then a boss
  chain of 3. A camp before zone 1 and a town between zones 2 and 3.
- The Inscription, the Veil, category cards with multipliers, life, the
  flask, gold, supplies and the pack, the camp and town vendor, one boss rule.
- Two generated data files with their scripts and tests.
- A run log the tester can copy and send.
- A tuning panel for the numbers below.

Out (later milestones): the map, routes and fog, boons, events, Wells,
special cards, tiers, co-op and P2P, resume after a reload, the Codex and
achievements, sound and effects beyond what existing components already do.

## Where it lives

- A test page at the root, `wraeclast.html`, beside `lab.html`, with its
  source in `src/wraeclast/`.
- It gets a card in the dev hub (`dev.html`; `tests/devHub.test.ts` fails
  until it is there) and an entry in the beta's build inputs in
  `vite.config.ts`. The live build leaves it out.
- Put it on the beta with the `beta-deploy` skill. Don't ship it live.
- Storage only through `src/lib/storage.ts` (the run log and the tuning).

## A run

1. **Camp.** The player has 100 life, a flask with 2 charges, 20 gold and an
   empty pack (8 slots). The vendor sells every supply (table below). Leave
   when done.
2. **Zones 1 to 4,** 3 items each. Each zone has a zone type (table below),
   rolled at the start of the run; the four types are all different.
3. **Town** between zone 2 and zone 3: heals 20 life on arrival, and the
   vendor sells every supply again.
4. **Boss:** 3 items under the Silent rule (only Flares work). Beating all
   three wins the run. Item 1 starts with one free patch, item 2 with
   nothing, item 3 with nothing and Flares lift only 1 patch on it.
5. The run ends at 0 life (a loss) or after the boss (a win). The end screen
   shows the run summary and the Copy run log button.

## An item

1. **Category card.** Deal 3 category cards from the 10 categories, as the
   other modes deal them. A category picked is locked for the next 3 picks.
   Each card rolls a multiplier: x1, x1.25, x1.5 or x2, weighted 4 : 3 : 2 : 1.
   No card pick on boss items: the boss picks the category, never the same
   twice in the chain.
2. **The item opens** with:
   - **the Inscription:** the distinct syllables of the answer and of the
     other option names, shuffled;
   - **the Veil:** the item's art covered by a 4 x 4 grid of patches;
   - **the zone's free clue** (zone table).
3. **Use supplies,** from the pack only. Nothing can be bought during an item.
4. **Build the name.** Tap a syllable to add it to the answer line; tap a
   placed syllable to take it back. Placing a syllable doesn't use it up, so a
   name that repeats one can place it twice. A Clear button empties the line.
5. **Submit.** Every submit counts, including a build that is no real name.
   - **Right:** the item pays gold = the zone's base reward x the card's
     multiplier, halved once per miss on this item, rounded down. Next item.
   - **Wrong:** life drops by the miss cost (below), the reward halves, and if
     the build was one of the board's names, that name is struck: syllables
     no remaining name uses are greyed out. The player keeps trying.
6. There is no skip. An item never comes up twice in a run.

### Board size

| Items | Names on the board |
| --- | --- |
| Zones 1 and 2 | 4 |
| Zones 3 and 4 | 6 |
| Boss | 10 |

Blight zones add 2 names. A board never holds more than 10 names, and Name
strike never leaves fewer than 3.

Build the board from the names the game already offers for an item: use the
engine's own question building (`Engine.makeQuestion` in `src/lib/game.ts`,
name mode, same category, look-alike names first) with the option count from
the table, and no made-up names from `fakes.json` in this prototype.

### Zones

| Zone type | Free clue | Rule | Base reward |
| --- | --- | --- | --- |
| Plain | 1 patch (random) | None | 5 in zones 1 to 2, 7 in zones 3 to 4 |
| Incursion | Flavor text, name words masked | Flares lift 1 patch instead of 2 | as Plain |
| Ritual | One mod line, name words masked | Lore reveals don't work here | as Plain |
| Blight | 2 patches (random) | 2 extra names on the board | as Plain |

The boss pays no gold.

### Life and the flask

- **Life:** 100 and never more. A miss costs 25 in zones 1 and 2, 35 in
  zones 3 and 4, and 60 at the boss. At 0 the run ends.
- **The flask** has 2 charges. Drinking one (between items only) recovers
  30 life over the next 3 items: +10 after each item ends, right or wrong,
  boss items included. Drinking again while a charge is still recovering
  restarts it; the rest of the old one is lost.
- The town heals 20 on arrival. Nothing refills the flask in the prototype.

### Supplies

| Supply | Reveals when used | Price (gold) |
| --- | --- | --- |
| Flare | 2 patches the player taps | 4 |
| Requirement reveal | Level and attribute requirements | 3 |
| Scroll of Wisdom | One mod line not yet shown, name words masked | 6 |
| Name strike | Strikes 1 wrong name from the board | 6 |
| Lore reveal | Flavor text, name words masked | 8 |

- A supply is used up when used. A supply with nothing left to show (no more
  mod lines, flavor text already free) can't be used on that item.
- Silent boss: only Flares work; the others show as unusable.
- Mod lines are shown in tooltip order, one per Scroll.
- Gems: "Requirement reveal" shows their requirement lines; their "Category"
  line counts as a mod line and is masked when it repeats the gem's name.

## Data (generated, with tests)

Both files are generated by script and added to the "Generated, don't
hand-edit" list in `CLAUDE.md`.

### `src/data/syllables.json` from `scripts/make-syllables.mjs`

For every item in `items.json`: its name split into syllables.
- Small words and possessives stay whole: "of", "the", "Voll's", "Atziri's".
- Compound words split where the parts are English words: Black / heart,
  Bramble / jack.
- The rest is hyphenated with Liang's English patterns (an npm hyphenation
  package that ships them).
- Test: every name rebuilds exactly from its syllables (with the spaces
  between words); no syllable is empty.

### `src/data/clues.json` from `scripts/make-clues.mjs`

Per item, from `itemStats.json`: requirements, mod lines in order, flavor
text, and for gems the support description and Category line, with every
word of the item's name masked.
- Mask the words of the name (3 letters or more, not "of", "the", "and"),
  their possessive and plural forms, case-insensitive, whole words only.
- The mask has a fixed width, `▮▮▮`, whatever the word's length, so it never
  leaks the length.
- Leave out placeholder mods such as "[2 Random Jewel Modifiers]".
- Test: no clue contains a masked word of its own item's name. Today about
  85 flavor texts, about 20 mod lines and 19 gem Category lines need it.

## The run log

Kept in storage for the last 20 runs, and shown as JSON behind a "Copy run
log" button on the end screen, so testers can paste it to the owner.

Per item: `itemId`, `category`, `zone`, `boss` (bool), `names` (board size),
`freeClue`, `multiplier`, `supplies` (each: type, order, ms since the item
opened), `patches` (how many lifted), `submits` (each: the built text, right
or wrong, ms since the item opened), `lifeBefore`, `lifeAfter`, `gold`,
`drank` (bool, before this item).

Per run: start and end time, win or loss, the item it ended on, misses,
items answered with no supply used, supplies bought and used per type, gold
earned and spent, life at the end, the tuning used, and the device's
viewport width.

## Tuning panel

A small panel on the test page (collapsed by default) to play the same run
with other numbers. Saved in storage; the log records it.
- Starting life, gold, flask charges.
- Miss cost per section, base reward per section.
- Each supply's price.
- Board size per section.
- Free clue on or off for each zone type (to test "no free clue" for experts).
- Show the answer's word count on the board (on or off).

## Look

No design boards exist yet; the design session draws the real screens later.
Build it plainly with what the game already has: the deal look of category
cards, the item art frame, the fonts and panels of the other modes. Phone
first: everything fits 375 px wide with no sideways scroll. If 10 names don't
fit at 375 px, don't redesign; note it in the PR with a screenshot, because
that is one of the findings.

## Done when

- A run plays from camp to boss on a phone and on a desktop, won and lost.
- Both data scripts run, their files are generated, and their tests pass.
- `npm test` and `npm run check` pass.
- The page is in the dev hub and on the beta.
- The PR lists anything in this file that didn't work as written.
