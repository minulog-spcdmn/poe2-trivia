# Playtest 3 (v3.2, Oct 19): what the log shows

One run by the owner, played locally (viewport 1024). Lost at step 11 of 16,
on item 25, after 52.6 minutes.

## The numbers

| Measure | Playtest 3 | Target |
| --- | --- | --- |
| Result | Loss at step 11 (Journey's End), item 25, The Black Cat | Regulars win about half at tier 1 |
| Items answered right | 24 of 25; 22 on the first try | |
| Misses | 3 (Titanrot Cataphract 1, The Black Cat 2) | About 1 in 6 items in a winning run |
| Items answered with no supply | 5 of 25 (20%) | Under half |
| Time per item | Median 47 s; 18 s to 322 s | 20 to 60 s |
| Time on items | 27.8 min of 52.6 | |
| Run length | 52.6 min to step 11; a full run at this pace is about 75 min | 15 min for experts, 20 to 25 for most |
| Life lost | Misses 100 (27, 45, 28); Blood toll 60 | |
| Life healed | Town 20; flask 40 (two drinks) | |
| Gold | Earned 317 (100 from 4 Jackpots), spent 80; 257 left at the end | Scarce |
| Gold from corrupted zones | 246 of 317 (78%) | |
| Zones corrupted | 6 of 9 (Blood toll 2, Dark 2, Swarming 2) | A choice, not the norm |
| Fronts | 3 seeded, 2 stopped | |
| Loot | 62 cards dealt, 58 taken (4 supply cards left behind) | |

Supplies:

| Supply | Bought | Found | Used | Left (by the log) |
| --- | --- | --- | --- | --- |
| Flare | 6 | 14 | 10 | 10 |
| Scroll of Wisdom | 3 | 4 | 7 | 0 |
| Golden Page | 4 | 6 | 3 | 7 |
| Category reveal | 4 | 6 | 8 | 2 |
| Base reveal | 1 | 0 | 0 | 1 |
| Decoy sweep | 6 | 6 | 7 | 5 |
| Word lengths | 6 | 2 | 4 | 4 |
| First syllable | 4 | 6 | 6 | 4 |

"Left" ignores stacks replaced in a full pack, which the log doesn't record.

## The stories

1. **The item that ended the run: The Black Cat** (step 11, a Plain zone
   corrupted by Dark, so no art). At 63 life against misses of 40 to 50, the
   player used a Golden Page, Category reveal, First syllable ("the") and Word
   lengths (1 · 2 · 2). Then came two guesses that fit the pattern but were
   blind: "the tem oak tair's kal's" (all struck but "the", −45), a drink
   (+10), and "the mak cae mu rek's" (−28, dead). The Scrolls were used up.
   By the log a Base reveal and about 5 Decoy sweeps were still in the pack.
2. **A board stripped to the answer** (Titanrot Cataphract, step 1). Five
   Decoy sweeps, four of them within 22 s, struck 20 tiles: all 19 decoys.
   Only the answer's 7 tiles were left. A probe of the first word, "ti tan r
   ot", came back all gold (−27), then the full name. That is the leak hunt's
   balance trap D1, now seen in play.
3. **Corruption everywhere.** 6 of 9 zones were corrupted; Buried Shrines, the
   only place at step 6, was one of them. A front leaves a corrupted trail
   behind it, so a forward route keeps walking into it. Blood toll took 60
   life, more than any two misses early on. Double loot from those zones
   brought in 78% of the gold.
4. **Gold never mattered.** 257 of 337 gold was unspent at the end. The limit
   was the pack: 4 supply cards were left behind.
5. **Essence's base type was enough on its own.** Innsmouth and Atziri's Rule
   were answered from the free base clue, with no supply.
6. **Base reveal was never used** (1 bought). Category reveal was the most
   used clue after Flares (8).
7. **Time outside items.** About 25 of the 52.6 minutes went to the map,
   shops, loot and the town. The log doesn't time those screens.

## Read against v3's questions

| Question | What the log says |
| --- | --- |
| Is the difficulty right? | Too easy item by item (22 of 24 first try) for an expert; the loss came from Blood toll attrition plus one item with no art |
| Do the Wordle marks beat buying supplies? | Not in this run: one paid probe (Titanrot), no cheap guessing |
| Is corruption a real decision? | No: 6 of 9 zones corrupted, the step 6 one forced |
| Does the map add real choices? | 2 or 3 offers at most steps; forced at steps 6 and 8 |
| Is a full run the right length? | No: about 75 min at this pace |
| Does the boss board fit 375 px? | Not reached (and played at 1024 px) |

## Log gaps to close in v4

- Time on each non-item screen (camp, vendor, map, loot, town).
- The offered nodes' zone type and corruption, to tell sought corruption
  from forced.
- The pack's contents when each item opens, and stacks replaced in a full
  pack.
