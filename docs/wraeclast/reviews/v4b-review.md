# Wraeclast run v4b review (commit 18971c1b)

Read-only review of the playtest worktree (`.claude/worktrees/wraeclast-playtest`, detached at 18971c1b) against `prototype-v4-handoff.md`, `decisions.md` and `design-doc.md`. Scripts and raw output: the orchestrator's scratchpad, `wr4b/` (b4.mjs deals and lists boards, tells.mjs, decomp.mjs and inter.mjs look for tells, simfix.mjs tries a fix, runs4b.mjs plays bot runs).

## Summary

- The v4a leak is gone: no board lets the answer be the only buildable name (0 of 16,032), and the crossing tell (the one name sharing a tile or word with every other) picks the answer on 0.0 to 0.1% of boards.
- A new tell replaced it, from the same root: every decoy name is a look-alike **of the answer**, not of each other, so the board is a star with the answer at its centre. "The name that reads most like the rest" picks the answer on 51 to 54% of boards against 18 to 42% chance; adding "looks most like the rest" (art) makes it 63 to 84%. A plain reader's rule ("among the names of the board's main category, the one starting with the same letter as the off-category names") gets 54 to 64%. This is now the board's biggest problem; a one-line change to the draw (each decoy a look-alike of a random name already on the board, the answer weighted half) brings every such rule back to chance in simulation.
- Widening to the category never fires: 0 of 16,032 boards at default tuning, 0 of 8,016 at the panel's maximum of 6 names. Every answer has 11 to 16 look-alikes, at least 5 after the sibling filter.
- The rules match the spec: seeds cap at 4 with one rule each, waiting fronts count, a stopped front's rule is gone, Blood toll never takes the last point, the full-pack buy holds the way on and refunds, the Stacked Deck's burn-in halves where the Torch's does, the Orb's sibling is clean in all but 4 of 10,020 draws.
- Teeming is nearly a no-op: boss boards already sit at the 36-tile cap, so its 8 decoys add 0.9 tiles on average.
- No stuck run or throw in 9,000 bot runs across five tunings. Two small full-pack nits and one wait-forever on a stalled picture.

## Numbers

Boards: 501 items × 8 run seeds per section (4,008 boards each), default tuning, no Blight or Teeming unless named. "Buildable" means every real unique whose letters the board's tiles can spell, ignoring word breaks, tiles reusable (as the game checks). Rule accuracies split ties evenly. Chance is the mean of 1 / (buildable names) per board.

### Board basics

| | Early | Mid | Late | Boss |
| --- | --- | --- | --- | --- |
| Decoy names dealt (rolled) | 1 to 2 | 2 to 3 | 3 to 4 | 4 to 5 |
| Boards below the section's minimum | 0% | 0% | 0% | 0% |
| Buildable names per board (mean) | 2.5 | 3.5 | 4.6 | 5.6 |
| Boards with a buildable name nobody picked | 1.9% | 3.3% | 6.1% | 7.4% |
| Tiles per board, mean (max) | 18.5 (24) | 24.3 (29) | 30.1 (35) | 35.1 (36) |
| Boards at the 36 cap | 0% | 0% | 0% | 56.4% |
| Widened to the category | 0% | 0% | 0% | 0% |
| Ancient Orb sibling buildable | 0 | 0 | 0 | 0 |

### Question 1: the shares asked for

| Share of boards | Early | Mid | Late | Boss |
| --- | --- | --- | --- | --- |
| Answer is the only buildable name (should be 0) | 0.0% | 0.0% | 0.0% | 0.0% |
| A unique "crossing" name exists (shares a tile or word with every other) | 0.3% | 0.4% | 0.1% | 0.0% |
| ...and it is the answer (v4a: 57 to 66%) | 0.1% | 0.2% | 0.0% | 0.0% |
| Answer is the only buildable name of its category | 32.9% | 13.5% | 5.6% | 2.2% |
| Same for a random buildable name (baseline) | 40.7% | 33.6% | 31.4% | 30.0% |
| Answer is in the board's most common category | 98.4% | 97.3% | 96.8% | 97.5% |

The category row reads the other way round: the answer is almost never the odd one out, so an off-category name is a free elimination (about half the decoy names are name look-alikes, and 88% of those come from another category; art look-alikes are always the answer's category).

### Question 1: rules an expert could use (accuracy vs chance)

| Rule: pick the buildable name that... | Early | Mid | Late | Boss |
| --- | --- | --- | --- | --- |
| Chance | 41.5% | 29.0% | 22.2% | 18.1% |
| **reads most like the rest** (summed name likeness, `nameSimilarity`) | **50.9%** | **53.2%** | **53.6%** | **54.0%** |
| **looks most like the rest** (summed art likeness, looks.json) | 46.4% | 42.5% | 40.2% | 37.9% |
| **reads and looks most like the rest** | **63.4%** | **79.6%** | **81.9%** | **83.9%** |
| **is in the main category and starts like the off-category names** | 54.0% | 60.5% | 62.9% | 63.8% |
| is in the main category and shares letter pairs with the off-category names | 55.9% | 63.8% | 66.0% | 68.3% |
| shares letter pairs with the others (Dice sum alone) | 48.0% | 44.6% | 43.0% | 42.6% |
| starts with the same letter as the most others | 45.0% | 37.7% | 33.0% | 29.4% |
| is in the most common category | 45.3% | 38.1% | 32.6% | 28.1% |
| crosses the most others (tile or word) | 42.2% | 31.2% | 25.8% | 23.2% |
| crossing rule (the one crossing all others) | 41.5% | 29.0% | 22.3% | 18.1% |
| is seen least often as a decoy (learned on half the boards, tested on the other half) | 48.4% | 37.8% | 30.3% | 25.6% |
| has tiles seen least often as decoys (learned, mean) | 42.2% | 32.6% | 24.7% | 20.3% |
| has the most private tiles (in no other buildable name) | 41.6% | 26.9% | 19.3% | 14.8% |
| has the most / fewest tiles | 42.7 / 39.2% | 29.3 / 25.3% | 22.0 / 18.4% | 17.5 / 14.4% |
| has a possessive / has none | 40.4 / 41.3% | 27.1 / 27.7% | 19.8 / 20.6% | 15.3 / 16.5% |
| has the most filler look-alikes per tile | 41.8% | 29.2% | 22.3% | 17.6% |

An example (boss): Alpha's Howl, Black Sun Crest, Innsmouth, Leer Cast (Helmets); Blackbraid, The Black Doubt (Body Armours); Choir of the Storm (Amulets). Helmets are the main category; only Black Sun Crest starts like the off-category names. It is the answer. Of the name look-alikes, 72.6% share the answer's first letter; of the art look-alikes, 8.9%.

### Question 1: tiles

| P(tile is the answer's) | Early | Mid | Late | Boss |
| --- | --- | --- | --- | --- |
| Any tile (baseline) | 0.215 | 0.157 | 0.123 | 0.104 |
| 2 letters | 0.241 | 0.164 | 0.125 | 0.105 |
| 3 letters | 0.238 | 0.167 | 0.129 | 0.108 |
| 4 letters | 0.224 | 0.165 | 0.130 | 0.110 |
| 5 letters | 0.154 | 0.119 | 0.096 | 0.083 |
| Possessive | 0.123 | 0.116 | 0.108 | 0.101 |

Five-letter tiles are about a quarter less likely to be the answer's; the name-level rules above show it doesn't add up to a usable tell.

### A fix, simulated

simfix.mjs redraws the decoy names three ways, using the same look-alike lists (it leaves out the sibling and cap filters; its "today" row reproduces the real boards within 2 points). Each cell: accuracy of "reads and looks most like the rest" / its opposite ("least like the rest") / "main category, starts like the off-category names".

| Draw | Mid (chance 29.1%) | Late (22.5%) | Boss (18.3%) |
| --- | --- | --- | --- |
| Today: every decoy a look-alike of the answer | 79.7 / 6.8 / 59.6% | 83.5 / 1.2 / 63.4% | 85.6 / 0.3 / 64.8% |
| Walk: each decoy a look-alike of a random name already on the board | 41.3 / 21.4 / 36.2% | 35.0 / 13.1 / 30.6% | 31.2 / 9.9 / 26.6% |
| Walk, the answer weighted half as a pivot | **28.4 / 28.6 / 28.4%** | **22.6 / 20.0 / 21.9%** | **19.8 / 17.1 / 19.1%** |

Picking each decoy from the look-alikes of the last one, or of decoys only, overshoots: the answer becomes the outlier (boss 3.1% central, so "least like the rest" wins).

### Question 2: widening

| | Early | Mid | Late | Boss |
| --- | --- | --- | --- | --- |
| Boards widened, default tuning | 0 of 4,008 | 0 of 4,008 | 0 of 4,008 | 0 of 4,008 |
| Boards widened, 6 names (the panel's most) | 0 of 4,008 | | | 0 of 4,008 |

Every answer has 11 to 16 look-alike candidates (8 by art, 8 by name, overlapping); after the sibling filter the fewest seen is 5 (The Changing Seasons). There are no widened boards to show. What widening would add for the five thinnest answers (the first wide names, all with art likeness 0):

| Answer | First wide names |
| --- | --- |
| The Burden of Leadership (jewel) | The Adorned, The Fall of the Axe, The Black Cat |
| The Desperate Alliance (jewel) | The Grand Project, The Black Cat, The Fall of the Axe |
| The Peacemaker's Draught (jewel) | The Black Cat, The Grand Project, The Adorned |
| Double Vision (two-handed) | Dusk Vigil, Death's Harp, Brain Rattler |
| Fury of the King (two-handed) | Fairgraves' Curse, The Burden of Shadows, The Searing Touch |

They would not look odd (same category, same "The ..." or first-letter pattern), but they are name-only look-alikes of the answer's category, so they would sharpen the star tell above. The wide list is also in a fixed order, so a widened answer would always get the same names.

### Question 3 and 4: bot runs

9,000 runs: 3,000 at default, 2,000 with 1 item per zone, 4 seeds and creep every step, 2,000 with 3 items, 5 seeds (capped to 4) and creep every 3, 1,000 with a zone share of 0 (Wells everywhere but the first and last steps, so no seed can land), 1,000 rich (999 life and gold). The bot buys into a full pack, hands back or replaces at random, misses, places word gaps, drinks, and uses every supply.

| Check | Result |
| --- | --- |
| Stuck states, throws | 0, 0 |
| Seeds over 4, a rule dealt twice, a seed outside steps 2 to 5 | 0, 0, 0 |
| Boss rules differ from the live fronts' own (in seeding order) | 0 of 7,637 bosses |
| Waiting fronts (never moved) counted at the boss | 1,635 of 1,635 |
| A stopped front's rule at the boss | 0 |
| A corrupted node without a live front, a front on a town or Well | 0, 0 |
| Blood tolls not equal to min(10, life − 1) | 0 of 21,915 (304 left the player on 1 life, 77 of them taking nothing because life was already 1) |
| Stacked Deck burn-in | 4 patches; 2 in Incursion; never usable at the boss (Silent) |
| Torch burn-in | 12; 6 in Incursion and on boss items 3 and 4; Murky halves again (6, 3) |
| Deck drawing a mod line in a Ritual zone | 0 |
| Full-pack buys | 2,790; gold right every time, the way on locked while a ware waits, a handed-back card back on the table |
| Full-pack loot prompts for a card that already fits | 70 of 1,649 (4.2%) |
| Teeming: tiles added at the boss (promised 8) | 0.9 (35.1 to 36.0; boards at the cap 56% to 99%) |
| Blight: tiles added, late (promised 6) | 5.0 (30.1 to 35.1; at the cap 0% to 58%) |

## Findings, ranked by how much they hurt play

1. **The board is a star around the answer.** `src/wraeclast/rules.ts:645` (`order`: every candidate comes from `decoyNameCandidates(answer)`, `rules.ts:575-609`). Every decoy name resembles the answer (by art or by name) but not each other, so the answer is the name most like all the rest (64 to 84% with art and names, 54% by name alone, 54 to 64% with the plain "main category, matching first letter" rule; chance 18 to 42%). Off-category names are never the answer (97 to 98% of answers sit in the main category), which turns the accepted category hint into an elimination. Fix: draw each next decoy from the look-alikes of a random name already on the board, the answer weighted half (simulated: every rule within 2 points of chance).
2. **Teeming does almost nothing.** `rules.ts:162`, `rules.ts:1153`, `rules.ts:666-667`. Boss boards average 35.1 tiles and 56% already sit at the cap, so the cap trims Teeming's 8 loose decoys to 0.9; a front left alive for Teeming costs the player next to nothing, unlike Lingering or Bloodied. Fix: make Teeming one more decoy name (the boss range +1, which the cap makes room for by trimming loose filler) instead of loose tiles.
3. **Decoys lean toward popular look-alikes.** `rules.ts:578-608`. Some items sit in 30+ look-alike lists, others in under 10, so a name seldom seen as a decoy is likelier the answer (boss 25.6% vs 18.1%; needs many runs to learn). Fix: weight candidates by the inverse of how many lists hold them.
4. **A full-pack prompt for loot that already fits.** `rules.ts:1552-1568` (`keep`). Two supply cards of one kind wait; the player replaces a stack with the first, and the second, which now fits on it, still asks to replace or leave (4.2% of prompts). Fix: after a replacement, stow every waiting card that fits.
5. **Replacing a stack of the same supply loses supplies.** `src/wraeclast/ItemScreen.svelte:269-270`, `PackList.svelte:29-30`, `rules.ts:998-1015`. The full-pack target list offers the same supply's own stack, so a bought 3 Torches can replace a stack of 4 Torches. Fix: top up the same supply's stack first and leave it out of the targets.
6. **An item can wait forever for its picture.** `src/wraeclast/Veil.svelte:85`. `img.decode()` that neither loads nor fails (a stalled request on a phone) never calls `run.open`, and nothing on the item works until it does. Fix: open on the plain grid after a timeout (about 8 s).
7. **Widening never fires.** `rules.ts:645`, `LOOKALIKES` at `rules.ts:185`. 0 of 24,048 boards, even at 6 names; harmless, but if it ever does, its fixed order gives one answer the same names every time and all of them are name-only look-alikes. Fix: shuffle the wide tail (or leave it until the walk in 1 replaces it).
8. **Two Orb siblings share a stem.** `rules.ts:540-543` (`wordsMeet`). Blackflame and Blackheart share "Black" inside two compounds, and a 3-letter word inside a compound slips past `COMPOUND_MIN` (Coat of Red, Redflare Conduit); 4 of 10,020 draws. Fix: also reject two words sharing their first 5 letters, and a 3-letter word that starts the other.
9. **One tile is a single letter.** `src/data/syllables.json` (from `scripts/make-syllables.mjs`): Cat O' Nine Tails has "o'", against "no tile is a single letter". Fix: let the splitter merge it across the word gap ("o'nine"), since checking ignores breaks.
10. **Over the cap at the panel's maximum.** `rules.ts:654`. With 6 names forced, the section's minimum skips the cap check: 17 of 4,008 boards reach 37 to 40 tiles (none at default). Fix: lower the minimum to what fits under 36.
11. **Stale text.** `prototype-v4-handoff.md:55-56` says at most 3 boss rules and seeds 0 to 5 (the decision and the code: 4); `prototype-v4-handoff.md:79` names `src/lib/lookalikes.ts` for name look-alikes, which holds Unicode confusables (the code uses `nameSimilarity`, `src/lib/game.ts:3251`); `TuningPanel.svelte:107` and `design-doc.md:346` still mention Swarming. Fix: update the lines.
