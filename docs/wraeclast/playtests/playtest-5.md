# Playtest 5 (v4b, Oct 19): what the log shows

One run by the owner, played locally (viewport 1424) on v4b (commit
18971c1b): real decoy names only, the 32-node map, each corruption's boss
rule shown from its seeding, Silent still on. The orchestrator re-pinned the
serving worktree to v4c during the run; the run wasn't interrupted. A win:
15 items in 15.3 minutes, no miss.

## The numbers

| Measure | Playtest 5 | Playtest 4 |
| --- | --- | --- |
| Result | Win, no miss | Win, 1 miss |
| Run length | 15.3 min | 19.8 min |
| Items | 15 (6 zones of 2, a boss of 3); a Well instead of a zone at step 6 | 18 |
| Items answered with no supply | 2 of 15 (13%) | 4 of 18 (22%) |
| Time per item | Median 36.8 s; 17 s to 71 s | Median 40.6 s |
| Time on items | 9.8 min (64%) | 14.2 min (72%) |
| Vendors | 3.2 min: camp 39 s, Pools of Khatal 46 s, Ziggurat Encampment 42 s, Kriar Village 49 s, Forest Encampment 13 s (bought nothing) | 4.1 min |
| Corrupted zones | 3 of 3 fronts' zones entered; every front stopped; the boss had no rule | 0 entered; 3 rules at the boss |
| Life | Lowest 80. Blood toll took 60 (6 items); towns healed 40; never a miss | Lowest 68 |
| Flask | Never drunk | Never drunk |
| Gold | Start 40, earned 87, spent 120, 7 left | 9 left |
| Supplies | Bought 29, found 11 (2 cards left in a full pack), used 20 (1.3 an item), 18 left at the end | 12 left |

Supplies (log keys in brackets):

| Supply | Bought | Found | Used |
| --- | --- | --- | --- |
| Torch (flare) | 12 | 0 | 11 |
| Scroll of Wisdom | 3 | 1 | 2 |
| Golden Page (lore) | 4 | 4 | 2 |
| Ancient Orb (category) | 4 | 0 | 1 |
| Base reveal | 0 | 0 | 0 |
| Tangled Fossil (decoy) | 0 | 2 | 0 |
| Word lengths | 0 | 0 (2 dealt, left) | 0 |
| First tile (first) | 6 | 2 | 2 |
| Stacked Deck (deck) | 0 | 2 | 2 |

## The stories

1. **With each rule on the map, every corruption was taken.** The seeds
   showed Bloodied at Pools of Khatal, Murky beside Kaom's Stronghold and
   Lingering at Pondium. The owner entered all three fronts' zones (Pools of
   Khatal at step 2, Kriar Village at 5, Trial of the Ancestors at 8) and
   stopped every front. The longest route pick of the run (46 s) was the one
   into the first corrupted zone. The price was 60 life in tolls, and the
   towns' 40 healing covered most of it: life never fell below 80. Playtest 4
   took none; playtest 5 took all. Neither run found the choice hard.
2. **Still no danger.** No miss in 15 items, life never under 80, the
   flask never drunk. v4d (town heal 10, 1 flask drink, pricier misses,
   Bloodied at every boss item) is the first build with the new stakes.
3. **Too many supplies.** 18 supplies were left at the end and 7 gold. The
   pack ran full in the Trial of the Ancestors (double loot of 4 cards an
   item) and two cards were left behind. Golden Pages and First tiles were
   bought and found but mostly not used.
4. **A Well instead of a zone.** At step 6 the owner took The Weaver's
   Chambers (a Well) over a Blight zone, with a full flask: a Well is a
   free skip of two items.

## Read against the targets

| Target | Playtest 5 |
| --- | --- |
| 15 to 20 min a run | Met: 15.3 min |
| Gold matters | Spent down to 7, but 18 supplies unused: gold buys more than a run needs |
| Corruption a real choice | Taken every time once the rules showed; the toll was cheap at towns' 20 heal |
| A good run has a close call | Not met: lowest life 80 |

## What follows

The owner's answers after playtest 4 already cover this (`playtest-4.md`,
"The owner's read"): v4d raises the stakes, and design rethinks growth,
item variety and the boss (`design-v5-handoff.md`). Watch in playtest 6:
whether corruption is still taken every time when a town heals only 10, and
whether the Well-as-skip pick repeats.
