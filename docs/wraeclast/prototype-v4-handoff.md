# Handoff: Wraeclast run, prototype v4 (after playtest 3)

Builds on v3.2 (commit 6375a4ab, PR #197, branch `claude/wraeclast-prototype-v3`;
keep working there). Every rule in `CLAUDE.md` applies. Where this file and
`prototype-v3-handoff.md` differ, this file wins; `decisions.md` has the
reasons and `playtests/playtest-3.md` the evidence.

The owner now playtests on their own machine; the orchestrator serves each
version from a pinned worktree. No beta deploy is needed.

## What playtest 3 found, and what changes

The owner found the run unfun and wanted it to end. The item itself worked
(median 47 s, 20% answered with no supply, knowledge decided). Everything
around it did not.

| Found | Change |
| --- | --- |
| Too long: 52.6 min to step 11 of 16; a full run would be about 75 min | A 10-step route and 2 items per zone: about 17 items, aiming at 15 to 20 min |
| Building a known name was cumbersome; single-letter tiles are hard to find and read | Tiles are never a single letter; fewer, longer tiles. The answer line reads as one word with player-set breaks |
| Slow screens between items: about 25 of the 52.6 min | Loot is collected at the reveal; the next route choice follows at once (the design handoff draws it) |
| No real choices: few places per step, a one-place zone step, corruption unavoidable | The owner re-steps the map to 10 steps with 2 to 4 places per step; corruption sits only on a front's own zone |
| Corruption was neither harder nor tempting: 6 of 9 zones corrupted, Blood toll a flat tax, double gold worthless | Only the front's zone is corrupted, Blood toll only, shown on the map; double loot stays, and the economy makes gold matter |
| Gold never mattered: 317 earned, 80 spent | Most supplies are bought, not found; tune to the targets below |
| Base reveal never used; Category reveal used 8 times | Category reveal becomes the Ancient Orb (below); Base reveal unchanged for now |
| "Often the Inscription told me what it was without any clue: it was the only valid name I could make" (owner) | Every board also holds the full tiles of a few real look-alike names, so several names can be built |
| "A lot of the wordings were really confusing, even to me" (owner) | Every line a player reads is rewritten plainly (the design handoff), and a newcomer-read review runs before playtest 4 |

## The route

- The owner re-steps `wraeclast-map.json` in the placement tool to steps 0
  (camp) to 10 (boss), with 2 to 4 places per step and towns at two steps.
  The orchestrator commits the new export as `src/data/wraeclast.json`. Until
  then, keep working against the current file: the code must take any last
  step, not assume 16.
- Sections scale with the route: early is the first third of the steps, mid
  the second, late the rest, then the boss. Miss costs, tile counts and gold
  follow the section as now.
- Items per zone default to 2 (tuning keeps 1 to 3).
- Corruption seeds sit in the first half of the route (steps 2 to 5 on a
  10-step map), on different branches where possible.

## Corruption

- A front is a zone. Only the zone a front stands on is corrupted. When the
  front creeps on (after every second step the player takes), the zone it
  left is a normal zone again.
- Every corrupted zone has the same modifier, Blood toll: each item takes 10
  life when it opens, never the last life point. The map shows it on the
  node. There is no hidden modifier and no flip card.
- A corrupted zone deals double loot, as now.
- Clearing a front's zone (answering all its items) stops that front for
  good. A front with no zone ahead waits, as now.
- Every front still alive at the boss adds one boss modifier (Lingering,
  Bloodied, Murky, Teeming), distinct, at most 3, as now.
- Tuning keeps seeds (0 to 5) and the creep interval; the modifier weights go.

## Tiles

- No tile is a single letter. The splitter merges a one-letter piece into a
  neighbour in the same word; a short word (2 or 3 letters) may be one tile.
  Keep "'s" on its tile.
- Tiles run 2 to 5 letters (plus "'s"); avoid 5 unless a 1-letter piece is the
  alternative. Names should need fewer taps than now.
- Decoys still match the answer's tile lengths, so no length is a tell.
- Update the tests: no tile under 2 letters, every name rebuilds, the
  length-tell and pool-size tests still pass. Report the new tiles-per-name
  distribution (v3.2: mostly 4 to 5).

## Decoy names

The board solved itself: loose decoy tiles rarely add up to another name, so
the answer was often the only real name a player could build. Now:
- Every board holds the full tiles of a few decoy names besides the answer.
  How many is rolled per item and never shown: 1 to 2 early, 2 to 3 mid,
  3 to 4 late, 4 to 5 at the boss.
- Decoy names are real look-alikes of the answer only (the owner's choice; it
  may hint at the category, and that is accepted): art look-alikes in
  `looks.json`, name look-alikes in `src/lib/lookalikes.ts`. If an answer has
  too few, widen to its next best look-alikes in the same category.
- No made-up names (owner, after the v4a review). Each `fakes.json` entry is
  the answer with one word swapped, so the answer was the one real name
  sharing tiles with them: on 57 to 66% of boards an expert could read it off
  (Tabula Nova and Carta Rasa point at Tabula Rasa). `fakes.json` no longer
  feeds the board.
- Every board holds at least its section's minimum of decoy names.
- Never the Ancient Orb's sibling (its tiles stay off the board), and never a
  name sharing the answer's full tile set.
- Building a decoy name is a wrong answer like any other: it costs life and
  marks the tiles.
- Loose filler tiles fill the rest of the pool total, length-matched as now,
  and drawn against the tiles of the answer and every decoy name alike, so the
  answer's tiles don't stand out by having more look-alikes around them. If
  the answer, the decoy names and the always-present tiles don't fit a
  section's total, the total grows, up to the cap of 36.
- A Tangled Fossil strikes decoy tiles at random, decoy-name tiles included.

## The answer line

As decided before playtest 3 (`decisions.md`):
- Every build is drawn as one continuous word; each tile keeps a faint seam
  and its own mark after a miss.
- A break key beside Clear adds a word gap at the end of the line; tapping a
  gap removes it. The gap is its own tap target.
- The game never places or suggests a break; checking ignores breaks.

Take the look from the design handoff when it lands.

## Supplies

| Supply | Change |
| --- | --- |
| Torch (was Flare; a working name) | Rename only |
| Tangled Fossil (was Decoy sweep) | Rename only |
| Ancient Orb (was Category reveal) | Shows another unique of the same category by name, as a clue line, never naming the category: "Ventor's Gamble • the same kind of item". Random among same-category uniques that share no word with the answer; lineage gems draw another lineage gem; the same for every player in co-op later. Its tiles stay off that board |
| Stacked Deck (new) | One random clue the item hasn't shown yet, among those the zone allows (a mod line, the flavor, the Ancient Orb's sibling, the base, word lengths, or a small burn-in). Follows every rule a supply follows; counts as a supply used; greyed out when nothing is left |
| Golden Page, Scroll of Wisdom, Base reveal, Word lengths, First syllable | Unchanged |

Nine kinds against 8 stacks: the pack shows stacks, not a slot per kind.
Rename wherever a player sees a name; log keys may stay.

## Economy

Make gold matter. Set the tuning defaults with your bot so that a player who
uses about 1.9 supplies per item:
- finds about a third of them as loot and buys the rest;
- ends a run with under about 15% of the gold earned unspent;
- can afford roughly what they use, but not everything.

Levers, in this order: fewer supply cards in loot, the Jackpot card out (it
stood in for boons), then prices. Report the numbers you chose and the bot's
results.

## Faster between items

- A right answer collects the loot into the pack at the reveal; there is no
  separate collect step. Only a full pack asks something: which stack to
  replace, or leave the card.
- The next route choice comes straight after, without an extra screen when
  nothing is to be bought.
- The vendor stays at the camp, the towns and after an Expedition zone.

The design handoff draws these screens; build the flow first and take the
look when it lands.

## Wording

The owner found much of v3's text confusing. Take every player-facing line
from the design handoff's copy. Where it gives none, write for someone who
has never played: short, plain words, one idea per line, no house terms
without a word of explanation. Before playtest 4 the orchestrator runs a
newcomer-read review of every screen and sends back what to fix.

## The run log

Add:
- time spent on each non-item screen (camp, vendor, travel, loot, town,
  Well), per visit;
- for each travel step, the offered nodes' kind, zone type and corruption;
- the pack's contents when each item opens, and any stack replaced in a full
  pack.

## Still open (not for v4)

- Word lengths as the Plain or Expedition free clue leans gem (45 of the 86
  items without a common line are gems).

## Done when

While the prototype is this early (owner, Oct 19): no new tests, QA benches,
bot tuning or headless runs. The owner's playtest is the check, and the
orchestrator smoke-tests each build when serving it. Everything is hardened
before anything merges to main.
- v4a: the rules play end to end on today's screens. v4b: the screens, the
  answer line, the wording and the two new supplies.
- `npm run check` passes. Wraeclast tests broken by a rule change are marked
  skipped ("prototype: revisit before merge"); tests outside it stay untouched.
- The PR (#197) has a v4 section listing anything that didn't work as
  written. Message the orchestrator with each commit; it serves the build for
  the owner.
