# Playtest 4 (v4a, Oct 19): what the log shows

One run by the owner, played locally (viewport 1424) on v4a (commit
ad17f321): v4's rules on v3's screens, with the 37-node map. A win, 18 items
in 19.8 minutes.

## The numbers

| Measure | Playtest 4 | Playtest 3 | v4 target |
| --- | --- | --- | --- |
| Result | Win (Goregirdle, boss item 4) | Loss at step 11 of 16, item 25 | |
| Run length | 19.8 min, the full route | 52.6 min to step 11 (about 75 for a full run) | 15 to 20 min |
| Items | 18 (7 zones of 2, a boss of 4 under Lingering) | 25 | About 17 |
| Misses | 1 (Darkray Vectors, −32) | 3 | |
| Items answered with no supply | 4 of 18 (22%), all at steps 1 to 3 | 5 of 25 (20%) | Under half |
| Time per item | Median 40.6 s; 15 s to 110 s | Median 47 s | 20 to 60 s |
| Time on items | 14.2 min of 19.8 (72%) | 27.8 of 52.6 (53%) | |
| Life | 100, 68 after the miss, 88 after the Forest Encampment's heal; never lower | Died | |
| Flask | Never drunk; no flask card dealt | 2 drinks | |
| Gold | Start 40, earned 89, spent 120, 9 left (10% of earned) | Earned 317, spent 80, 257 left | Under about 15% unspent |
| Supplies | Bought 29, found 8 (22%), used 25 (1.4 an item), 12 left | | Found about a third; 1.9 used an item |
| Corrupted zones | 0 of 7 entered; 4 offered, each beside a clean zone | 6 of 9 | A real choice |
| Fronts | 3 seeded, none stopped, 3 alive at the boss | 3 seeded, 2 stopped | |
| Boss rules | Bloodied, Lingering, Murky | | |

Supplies (log keys in brackets):

| Supply | Bought | Found | Used | Left |
| --- | --- | --- | --- | --- |
| Torch (flare) | 12 | 1 | 13 | 0 |
| Scroll of Wisdom | 0 | 1 | 1 | 0 |
| Golden Page (lore) | 2 | 0 | 1 | 1 |
| Ancient Orb (category) | 6 | 0 | 2 | 4 |
| Base reveal | 0 | 1 | 1 | 0 |
| Tangled Fossil (decoy) | 3 | 1 | 3 | 1 |
| Word lengths | 0 | 0 | 0 | 0 |
| First tile (first) | 2 | 4 | 2 | 4 |
| Stacked Deck (deck) | 4 | 0 | 2 | 2 |

The Stacked Deck drew an Ancient Orb (Silverthorne) and a mod line (Bones of
Ullr).

## Where the time went

| Part | Time | Share |
| --- | --- | --- |
| Items | 14.2 min | 72% |
| Vendors: camp 66 s, Ziggurat Encampment 55 s, Fellshrine Ruins (Expedition) 64 s, Forest Encampment 62 s | 4.1 min | 21% |
| Reveals: 1 to 4 s after a zone's first item; 5 to 16 s after its last, where the next place is picked | 1.3 min | 7% |
| The boss's threshold | 9 s | |

The screens between items fell from about 25 minutes to under 6. What's left
is mostly the vendors, about a minute each.

What was bought, by vendor:

| Vendor | Gold in hand | Bought | Left |
| --- | --- | --- | --- |
| Camp | 40 | Torch 3, Stacked Deck 2, First tile 2, Ancient Orb 2 | 0 |
| Ziggurat Encampment (step 4) | 53 | Torch 3, Stacked Deck 2, Ancient Orb 2, Tangled Fossil 3, Golden Page 2 | 3 |
| Fellshrine Ruins (step 5) | 18 | Torch 3 | 8 |
| Forest Encampment (step 7) | 29 | Torch 3, Ancient Orb 2 | 9 |

## The stories

1. **Corruption didn't matter, either way.** A corrupted zone was offered
   at steps 6, 8 and 9 (Heart of the Tribe, The Upper Prison, The Brine
   King's Reef, Twilight Strand), always beside a clean one, and the owner
   took the clean one each time. Taking one meant 10 life an item for double
   loot, but late zones deal supplies only and the pack already held about
   12 spares. Skipping them left all 3 fronts alive, so the boss had all 3
   rules: Bloodied (a miss costs 10 more), Lingering (a fourth item) and
   Murky (Torches burn in half). With no miss at the boss, Bloodied cost
   nothing; Lingering cost 30 s; Murky cost Torches, and the last 3 went on
   the last item. No life was lost at the boss. Neither side of the trade
   had weight: the toll was cheap at high life, the reward was unneeded, and
   the threat only touches a player who misses.
2. **Torches did most of the work.** 13 of the 25 supplies used were
   Torches, and from step 5 on 9 of 14 items opened with one. Torches were
   the only supply that ran out; every vendor visit bought 3. In the 4
   Incursion items, where a Torch burns in half, no Torch was used. Word
   lengths was never bought or used; Base reveal and the Scroll only when
   found. The Ancient Orb was bought 6 times and used twice.
3. **The one miss was a decoy name.** On Darkray Vectors the owner built
   "Darkray Striders", one of the board's decoy names (gold, gold, struck,
   struck; −32). The decoy names did their job there.
4. **The decoy names also pointed at the answer.** On 6 of 18 boards two
   decoy names crossed at the answer: Tabula Nova and Carta Rasa (Tabula
   Rasa), Spire of the Caged God and Pillar of the Chained God (Pillar of the
   Caged God), Martyr's Mercy and Sadist's Grace (Sadist's Mercy), Nightray
   Vectors and Darkray Striders (Darkray Vectors), Bones of Vidar and Sinews
   of Ullr (Bones of Ullr), Frostpaw and Northfang (Northpaw). This is the
   leak the v4a review measured; v4b drops made-up names (decisions, Oct
   19). Whether real look-alikes cross the same way is in the v4b review.
5. **The hardest item: Bones of Ullr** (step 5, Expedition). 8 supplies in
   107 s: a Golden Page, an Ancient Orb, a Torch, a First tile, a Stacked
   Deck (a mod line) and 3 Tangled Fossils, then right on the first try.
6. **The run was never in danger.** One miss in 18 items, life never under
   68, the flask full at the end.

## Read against v4's targets

| Target | Playtest 4 |
| --- | --- |
| 15 to 20 min a run | Met: 19.8 min |
| One tap from a right answer to the next item | Met on v3's screens: reveals of 1 to 4 s, 5 to 16 s with the next place |
| Gold matters: under about 15% unspent | Met: 9 of 89 (10%); the last town couldn't buy everything |
| About a third of supplies found | 22% (8 of 37) |
| About 1.9 supplies an item | 1.4 (1.0 without Bones of Ullr); 12 bought or found and never used |
| Corruption a real choice | Not met: never taken, and skipping cost nothing felt |
| The board doesn't solve itself | Partly: decoy names caught one miss, but crossed at the answer on 6 of 18 boards (fixed in v4b) |
| Plain wording | v4b's screens; the owner's read |

## The owner's read

Asked after the log:
- **Next to playtest 3:** better, still flat.
- **What is flat (all four picked):** choices don't bite, no stakes, every
  item the same, nothing grows.
- **Why no corrupted zone:** they wanted to see what the fronts do to the
  boss, and the loot wasn't needed. They didn't know only Torches work at
  the boss: v4a never said it (v4b does). That rule, Silent, is the boss's
  own, not corruption's, and it made Torches look dominant: 7 of the 13 were
  at the boss; elsewhere Torches were 6 of 18 supplies.
- **Danger:** tenser; a good run should have a close call or two. It should
  come from greed, a boss that bites, less healing and pricier misses (all
  four picked).
- **Torches:** the other supplies are too weak; they should work at the boss
  too (Silent goes).
- **A corrupted zone's reward:** something no vendor sells.

What follows:
- v4d (prototype): Silent goes. Misses cost 10 more in every section, a
  town heals 10, the flask holds 1 drink, and Bloodied takes 10 life at each
  boss item. Also the newcomer read's wording fixes.
- Design (`design-v5-handoff.md`): growth over a run, what a corrupted zone
  deals, and items that play differently. Options first, for the owner to
  pick.

## Log gaps

- Travel time sits inside the reveal's time; fine while Where next lives
  there.
- The log doesn't say which front gave which boss rule, or what was bought
  where; v4b logs both by place.
