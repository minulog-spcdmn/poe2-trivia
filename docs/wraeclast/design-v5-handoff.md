# Design handoff: Wraeclast run v5, a rethink (after playtests 4 and 5)

Options first: no boards until the owner has picked a direction. No code.

## Where it stands

v4 made the run short and fast: 19.8 minutes in playtest 4 and 15.3 in
playtest 5, with screens between items down from 25 minutes to under 6. The
owner's verdict is "better, still flat". Asked what is flat, they picked all
four:
- **choices don't bite:** route, shop and corruption barely change the run;
- **no stakes:** it never feels like you could lose;
- **every item the same:** look, use a supply, build the name, over and
  over;
- **nothing grows:** you end the run no stronger or different than you
  started.

Evidence: `playtests/playtest-4.md` and `playtest-5.md`.
- Two wins, one miss in 33 items.
- Life never under 68.
- The flask never drunk.
- 12 and then 18 supplies left unused.
- Corruption taken 0 times in one run and every time in the next. Neither
  choice was hard.

Already decided by the owner, so don't reopen these:
- **Stakes (v4d, being played now):**
  - misses cost 10 more in every section;
  - a town heals 10;
  - the flask holds 1 drink;
  - Bloodied takes 10 life at every boss item.

  The owner wants a good player's danger to come mostly from greed: taking
  hits by choice.
- **Silent is gone:** every supply works at the boss.
- **Growth comes from corrupted zones.** A corrupted zone deals a pick no
  vendor sells, so greed is how a run grows. Blood toll is the price.
- The 10-step route, 2 items a zone, the item screen, the supplies and the
  economy stay as they are unless a direction needs them changed.

## What to rethink

The design doc (`design-doc.md`) planned these as milestone 3: boons (pick 1
of 3 after every second zone, 15 in the pool), events between zones (Trader,
Gambler, Strongbox, Wanderer) and a boss rolled from 5 rules (Blind, Silent,
Mirrored, Hoarder, Shifting). The owner wants them rethought rather than
built as written. Use them as one input, and keep what still fits.

### 1. Growth

What a corrupted zone deals that makes the run grow:
- what it is and what it changes;
- how many a run;
- whether pieces combine into a build;
- how it reads on the map before the player picks the zone;
- where it shows on a 375 px phone.

The doc's boons combine around information (they make the clues you are
good at cheap, and zone types worth routing toward); say whether that's
still the right axis. Give 2 or 3 directions.

### 2. Items that differ

Every item plays the same. A zone type changes only the free clue and one
small rule. Give 2 or 3 directions for items that differ in how they play.
Possible directions:
- zone types with a real twist;
- special items;
- events between zones;
- a Well that is more than a skip (playtest 5 took one with a full flask,
  as a free pass on two items).

Two constraints:
- knowledge has to keep deciding: no twist that rewards speed or luck over
  knowing items;
- each twist reads in one line at 375 px.

### 3. The boss

"Rethink how bosses work" (owner). Today the boss is 3 items with bigger
boards, plus a rule for each corruption still alive. That made no
difference in either run: one went in with 3 rules, the other with none,
and both won without a miss. What makes the boss the run's climax? How does
the player prepare for it from the start? How do corruption and growth feed
into it? Give 2 or 3 directions.

### 4. Choices that bite

With your directions and v4d's stakes, walk through the run's choices: the
route (zone type, corrupted or not, a Well), the shop, the flask, the growth
picks. Say where one option is still always right, and what changes that.

## Names

Anything a player picks up keeps to principle 8 (`ORCHESTRATOR.md`): a Path
of Exile item you can carry and use, doing what it does in the game.

Some names are already taken:
- Jewels, Charms and Tablets are answer categories;
- Ruby, Sapphire and Emerald are base types the Base reveal shows;
- Delve and other modes have their own names, which is why Flare was
  dropped.

One name means one thing across poe2.quest. Whether growth pieces (boons in
the doc, named Lamplighter, Archivist and so on) need item names too is the
owner's call. Name your recommendation both ways: item names and plain
names.

## Deliver

- One options doc, `docs/wraeclast/design-v5-options.md` on your branch.
  For sections 1 to 3: 2 or 3 directions each, with the trade-offs and your
  recommendation. Then section 4's walk-through, and the names. Keep it
  short; the orchestrator turns it into questions for the owner.
- Message the orchestrator with the commit. Boards come after the owner
  picks.

The rules in `CLAUDE.md`, `docs/design-rules.md` and `docs/arcane-style.md`
apply as before. No em dashes.
