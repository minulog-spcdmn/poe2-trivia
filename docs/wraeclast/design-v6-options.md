# Wraeclast run v6: options for the redesign (design session)

Answers the combined redesign brief (Oct 19). Text only; boards follow the
owner's picks. Research notes: `research/v6-boons-and-beast.md`.

Kept as decided: the item screen and its decoy walk; Pacts (an edge with a
lasting price, never sold, 2 to 4 a run); the boss as a duel; no league
mechanics on the map.

## The shape in one paragraph (recommended mix)

One region of Wraeclast, about 14 places, opens around your camp. The Seed
of Corruption sits in a lair at the far side, and its corruption spreads one
ring each time you clear a zone. A zone is **one item**. You go where you
like, to any place next to one you've cleared. Corrupted places are harder
and deal Pacts. A town sells what makes you hit harder and take less. The
lair is open from the start, and the map always shows the duel's numbers, so
you go when you think you'll win. There are no supplies: inside an item you
take clues from a ladder, and every clue lowers what the answer pays. About
7 zones and a duel of 4 or 5 items make about 10 minutes.

## 1. The open map

| | A. An open region (recommended) | B. Rings around a town | C. Free travel |
| --- | --- | --- | --- |
| How you move | Into any place next to one you've cleared; the camp counts as cleared | The town sits in the middle, with zones in 3 rings. Each trip goes out from the town, and coming back costs a turn | Tap any place you can see; each step of the path is a turn |
| A turn | Each zone you enter | Each zone, and each return to the town | Each step of travel |
| The spread | From the lair, one ring nearer you each turn | The outer ring first, closing on the town | As A |
| Feels like | Exploring: branches, dead ends, a road you open toward the lair | Raids from a base; safe and readable | Planning a trip; the most strategic |
| Main risk | 14 places on a 375 px phone (fine: the map is capped at 4 places a step today, and this map is about as wide) | Rings read as levels again, so it's linear by another name | Counting path lengths on a phone; slow picks |

**What a turn costs.** Every zone you enter advances the spread by one ring,
win or lose. Towns and the lair cost nothing. A run that goes in after 4
zones meets a weak Seed, and one that goes in after 10 meets a strong one.

**How the spread shows.** Corrupted places show red veins on the map, and the
lair shows a growing heart. A place that will be corrupted next turn shows
its outline in red, so the player sees where the spread goes next. It takes
no counting.

**"Strong enough" reads as the duel's two lines, always in the map's footer:**

> The Seed • 70 life • hits 8
> You • 82 life • a bare answer hits 20

Both lines change as you play: the Seed's line each turn, yours with life, a
Pact or the town's wares. Telling the player how strong the boss is gives
away nothing about any item, so principle 3 holds. A player can work out "4
bare answers kill it, and I can take 9 hits" without the game saying it.

**At 375 px:** the region fills the screen as today's map does (it scrolls if
needed). The footer is two lines in Cinzel, and a tap on a place shows its
one-line card (section 2).

## 2. What gives a zone its character

| | A. Depth: how known the zone's items are (recommended) | B. A map mod (recommended with A) | C. What the zone holds |
| --- | --- | --- | --- |
| What | Each place draws from one depth: Known (the famous uniques), Obscure, or Forgotten (the long tail). Deeper pays more | A real waystone mod, the kind that makes a PoE2 map harder and richer, translated to trivia (table below). At most one a zone | The reward shows on the map: gold, a Whetstone or Scrap, a Well, a Pact (corrupted zones) |
| Why worth the detour | You know your depth. An expert routes through Forgotten places for gold; a newcomer keeps to Known ones | The mod is the bet: take it for more, or go round | You route for what you need |
| Knowledge decides | Fully: depth is knowledge | Yes, a mod changes the price of a miss, not the item | Neutral |
| Main risk | Needs a depth measure that's automated (principle 10), such as the game's drop level, trade listings, or players' answer rates in the Codex | Too many mods; keep 4 | Character is just loot, so it's flat again |

Map mods, real PoE2 waystone mods doing what they do there:

| Mod (as on a waystone) | In the zone |
| --- | --- |
| Monsters deal extra damage | A miss costs 10 more; +1 card |
| Players have less recovery | No healing at the next town; +1 card |
| Area is inhabited by more monsters | 1 more decoy name on the board; +1 card |
| Monsters are armoured | No clue before your first submit; +2 cards |

Corruption raises a zone's depth one step and adds a mod, so the spread
hardens what's left of the map, as the owner put it.

**On the map:** a place's card reads in one line, for example
"Obscure • Misses cost 10 more • Gold".

**Recommendation: A with B,** and the reward shown (C) as the card's last
word. Every place then has a depth, a bet and a reward.

## 3. Supplies and shops

| | A. A clue ladder, no supplies (recommended) | B. Three supplies, each a different job and cost | C. One supply kind |
| --- | --- | --- | --- |
| What | Each item has one free clue. "Another clue" climbs a fixed ladder (a mod line, the flavor text, a burn-in, the base type), and each rung lowers what the answer pays: the drop and, at the duel, your hit (20 bare, 12 with one clue, 6 with more) | Torch (see the art; costs gold), Tangled Fossil (strike 4 decoys; costs 5 life), Scroll of Wisdom (a mod line; the answer then pays half). Bought, a pack of 3 slots | The Stacked Deck only: one random clue the item hasn't shown, bought at towns, priced high |
| Strategy | Every clue is a trade of reward for safety, and nothing sits unused in a pack | Which cost you'd rather pay: gold, life or reward | How many you carry into the duel |
| Fixes "no downside, too many kinds, all the same" | Yes: one function, one cost, priced in what you'd win | Partly: different costs, still all "reveal a bit" | Partly |
| Time | No shopping for clues: saves the 3 to 4 minutes vendors took | A vendor visit stays | A short vendor visit |
| Main risk | The players who liked choosing supplies lose that. A fixed ladder order is predictable (that's fine: the item is still unknown) | Still three ways to buy information | Luck decides which clue you get, which principle 2's spirit dislikes |

**What gold is for (with A):** making you strong enough for the duel, plus
the bets. A town sells:
- a **Blacksmith's Whetstone** (+2 to every hit, as weapon quality raises damage);
- an **Armourer's Scrap** (the Seed hits 1 less, as armour quality does);
- **healing** (20 life);
- a **Well's draught** (one flask drink).

Each is a PoE2 item doing what it does in the game. So gold turns straight
into the duel's two lines, and wandering for gold is the greed the spread
punishes.

**Recommendation: A.**

## 4. Stakes as bets you opt into

Baseline: a miss costs 10 life, flat, all run. Steady attrition is small;
the danger is what you bet.

| | A. The zone's mod (recommended) | B. A first-try stake (recommended) | C. Pacts as the only bet |
| --- | --- | --- | --- |
| What you wager | Life: a mod raises a miss's cost or cuts recovery, for more cards | Gold, before you build: "Stake 10 on a first try". Right first time doubles it; any miss loses it, on top of the life | A lasting price for an edge |
| Where it sits | On the map, before you pick the place | On the item, one tap, before the first submit | After a corrupted zone |
| Losing | Life; at 0 the run ends | Gold, and the miss's 10 life | Whatever the price does |
| Knowledge decides | Yes | Yes: you stake when you know it | Yes |
| Main risk | Players always skip mods (fix: mods carry the best rewards) | One more tap on every item; show it only after the free clue | Too few bets: 2 to 4 a run |

**Recommendation: A and B,** with Pacts as the third kind (section 5). Gold
won from stakes buys Whetstones, so confidence turns into duel strength.

## 5. Pacts, named after PoE2's boons

**What PoE2 has.** Trial of the Sekhemas is the only place in PoE2 with
things called boons and afflictions: 39 boons and 54 afflictions, mostly
objects you'd carry (Crystal Shard, Hare Foot, Ornate Dagger). It even has
its own pacts: **Pledges** (to the Guileful, the Powerful, the Deserted, the
Afflicted) trade a boon for an affliction. Nothing else qualifies: shrines
are places, Omens are one-shots, Atlas passives are a tree, and Trial of
Chaos's room modifiers weren't checked. Full list and clash check in the
research notes; avoid Garukhan's Favour (Garukhan's Resolve is an answer)
and anything relic- or jewel-named (answer categories, base types).

**A Pact is a boon paired with an affliction:** the boon's name is the edge,
the affliction's name is the price. Starter list:

| Pact (boon) | Edge | Price (affliction) | Price in play |
| --- | --- | --- | --- |
| Ornate Dagger | Your hits on the Seed deal 50% more | Honed Claws | The Seed hits 3 more |
| Sanguine Vial | The Seed has 30% less life | Blunt Sword | A clued answer hits 40% less |
| Hare Foot | Every other zone doesn't advance the spread | Worn Sandals | After a miss, the next zone advances it twice |
| Sekhema's Cloak | Once, at 0 life, come back at 50 | Branded Balbalakh | Nothing heals you any more |
| Glowing Orb | The first time you fall under 20, heal 30 | Dishonoured Tattoo | Misses cost double under 30 life |
| Silver Tongue | Town prices halved | Season of Famine | Towns offer half their wares |
| All-Seeing Eye | Every place's depth, mod and reward show from the start | Black Smoke | You see the spread only where it already is, not where it goes next |
| Fright Mask | The Seed hits 20% less | Spiked Exit | Each zone cleared takes 5 life |
| Lustrous Lacquer | Misses cost 5 less | Weakened Flesh | 20 less maximum life |
| Crystal Shard | Your next Pact comes with no price | Glass Shard | The one after has two |

**When you're dealt one:** answering a corrupted zone's item deals 3 Pacts,
face up, and you take 1 or none. The spread decides where Pacts are: early,
only the rings near the lair; late, half the map. So wandering long finds
more Pacts but feeds a stronger Seed. That's the soft timer working in both
directions.

**On a 375 px phone:** Pacts sit as seals in the header beside life, at most
4. A tap opens a sheet with one line each: "Ornate Dagger • hits 50% more •
Honed Claws: the Seed hits 3 more".

## 6. The duel, and the Beast

**Lore.** The Beast fits the spread exactly: in PoE2 the Seed of Corruption
is the Beast's essence, and corruption spreads from it through Wraeclast.
That's what sets the campaign off, when Count Geonor takes it from the
Hooded One. A living Beast as the boss fits less, since it died in PoE1.
What lives is the Seed and whoever carries it.

| | A. The Seed of Corruption (recommended) | B. The Beast, by name | C. The Seed's host, a real PoE2 boss per run |
| --- | --- | --- | --- |
| Lore fit | Exact | Loose: it died in PoE1, though "the Beast stirs" works as a frame | Exact (Count Geonor carried it), but most bosses never touched the Seed |
| Reads as | A growing heart in the lair | A name players know | A face per run |
| Main risk | A seed is less of a face than a monster | Lore players notice | Few bosses fit, so it repeats |

**The duel (v5 Boss A, adapted):**
- **The Seed's line:** 30 life and a hit of 5 at the start. Each turn of
  the spread adds 8 life, and every second turn adds 1 to its hit.
- **The item:** the Seed hits you as each item opens. You hit it with a
  right answer: 20 bare, 12 with one clue, 6 with more, plus Whetstones and
  Pacts.
- **A miss:** the usual 10 life, and the next item opens. The duel ends when
  one side reaches 0.

**How the spread and your build feed it:**
- the spread feeds the Seed's line;
- your line comes from life kept, Whetstones and Scrap bought with gold, and
  Pacts.

So every choice in the run moves one of the two lines. That's the climax:
you chose the moment, and you see both numbers.

**Recommendation: A** as the default, and B's name as its title ("the
Beast's Seed"), if the owner wants the Beast's name on screen.

## 7. A sample run under the recommended mix (about 10 minutes)

Region: Ogham, 14 places. Start: 100 life, 20 gold, one flask drink, a bare
hit of 20. The Seed: 30 life, hits 5.

| Time | Where | What happens | You / the Seed |
| --- | --- | --- | --- |
| 0:00 | Camp | Three places open: Known • Gold, Obscure • Monsters deal extra damage • Gold, Known • Well. Takes the Obscure one, staking 10 gold | 100 life, 20 gold / 30, hits 5 |
| 0:50 | Zone 1 | Bare, right first time: the stake doubles, plus the mod's card | 100, 52 gold / 38, 5 |
| 1:40 | Zone 2 | Known, takes one clue, right | 100, 62 / 46, 6 |
| 2:30 | Zone 3, corrupted | Forgotten. Two clues, one miss (10). Pacts dealt: takes Ornate Dagger (hits 50% more; the Seed hits 3 more) | 90, 70 / 54, 9 with the price |
| 3:30 | Town | Two Whetstones (+4), one Scrap (hits 1 less), healing | 100, 6 / 54, 8 |
| 4:10 | Zones 4, 5 | Obscure ones for gold, both bare; one stake won | 100, 40 / 70, 9 |
| 5:50 | Zone 6, corrupted | A miss, then right with a clue. Takes Sanguine Vial (the Seed has 30% less life; clued answers hit 40% less) | 90, 48 / 54 after the Vial, 10 |
| 6:40 | Footer | "The Seed • 54 life • hits 10" against "You • 90 • a bare answer hits 36" | Two bare answers win, and 9 hits are room enough. Goes in rather than feed it |
| 6:50 | The duel | Item 1 bare, right (36). Item 2: unsure, takes a clue, right (16 × 1.5, less 40%: 14). Item 3: misses once, then right bare (36). The Seed dies | Ends on 50 life, the drink unused |
| 9:40 | Win | | |

Without the Vial's price, item 2's clue would have hit 24; that's the Pact
biting. Had the player wandered to zone 10, the Seed would have about 110
life, and the duel would have taken 4 or 5 bare answers.

## Feel questions for the owner

1. **How should the map open up?**
   - An open region: go next to anything cleared (recommended)
   - Rings around a town
   - Free travel, where each step costs a turn
2. **Supplies: keep them or replace them?**
   - Replace with a clue ladder that pays less per clue (recommended)
   - Three supplies, each with a different cost (gold, life, reward)
   - One random-clue supply (the Stacked Deck)
3. **What gives a zone its character?**
   - How known its items are (Known, Obscure, Forgotten), plus one waystone mod (recommended)
   - Depth only
   - A waystone mod only
4. **Which bets should a player be able to make?**
   - Zone mods and a gold stake on a first try (recommended)
   - Zone mods only
   - Pacts only
5. **Who is the boss?**
   - The Seed of Corruption, the Beast's essence (recommended)
   - The Beast, by name
   - A real PoE2 boss carrying the Seed, rolled per run
6. **How should a Pact be named?**
   - The boon's name, with its affliction named as the price (recommended)
   - The boon's name only
   - Called a Pledge, as PoE2 calls these deals

## 8. After the owner's picks: three supplies, and bets made concrete

Picked: the open region, zones with depth and one waystone mod, the Seed of
Corruption, and Pacts renamed **Pledges**. This section replaces sections 3
and 4 (the clue ladder is out).

### Three supplies, each paid differently

The rule for both sets:
- **Gold:** the gold supply is bought at towns, in stacks.
- **Life and reward:** the other two are always at hand on every item, at
  most 2 each per item, and paid at the moment you use them.

So the pack is just one stack of the gold supply, and only that one needs
shopping.

**Set 1 (recommended): see, cut, read.** One for the art, one for the board,
one for the text.

| Supply | What it does | Paid in | Best on |
| --- | --- | --- | --- |
| Torch | Burns in about a sixth of the art | Gold: 2 for 8 | Items with art you'd know: weapons, armour |
| Tangled Fossil | Strikes 4 decoys from the board | Life: 5 a use | Big boards: corrupted zones, a mod's extra decoy name, the duel |
| Scroll of Wisdom | The next mod line, common first | Reward: the answer pays one card less, and at the duel hits 8 less | Items whose art looks like others: jewels, flasks, rings |

**Set 2: context, kin, base.** All three read the item, but each costs more
the more it gives away.

| Supply | What it does | Paid in | Best on |
| --- | --- | --- | --- |
| Golden Page | The flavor text, name words masked | Gold: 2 for 8 | Items with lore you'd recognise |
| Ancient Orb | Another unique of the same category, by name | Life: 5 a use | Placing the kind of item when nothing else does |
| Base reveal (working name) | The base type | Reward: the answer pays half, and at the duel hits half | Expert trivia: it names about 3 uniques in 4 |

**Why Set 1:**
- Its three jobs can't stand in for each other: a Torch doesn't shrink a
  board, and a Fossil shows no art.
- None is plainly better, because each wins on different items, and the
  three costs pull against different things: gold against the duel's
  Whetstones, life against the bets, reward against the drop.
- Set 2's three jobs are all "tell me about the item". That's the sameness
  the owner named, and its reward supply is close to giving the answer
  away.

**What gold is for:**
- the gold supply;
- a Blacksmith's Whetstone (+2 to every hit);
- an Armourer's Scrap (the Seed hits 1 less);
- healing (20 life);
- a flask drink.

At every town the question is "Torches for the next zones, or Whetstones for
the duel?"

### Bets, as a player sees them on a phone

**A. The zone's mod (on the map, before you pick)**

```
The Grelwood
Obscure • Monsters deal extra damage
Misses cost 20 here • Win a Whetstone
[ Enter ]                  [ Not now ]
```

- **You risk:** 10 more life on every miss in this zone.
- **You win:** a Whetstone (+2 to every hit at the duel), on top of the gold.
- **Feels like:** "I know Obscure items; I'll take it." It costs no extra
  tap, since entering the place is the bet.

**B. A stake on a first try (on the item, after the free clue)**

```
Stake 10 gold on a first try?
Right first time: +20 gold • Any miss: the 10 is lost
[ Stake ]                  [ No ]
```

- **You risk:** 10 gold, on top of the miss's life.
- **You win:** 10 gold net, which is a Whetstone sooner.
- **Feels like:** a nod to yourself on items you know cold. The cost is one
  tap on every item, even when you say no.

**C. A Strongbox (a place on the map, now and then)**

```
Strongbox
One item • the art stays veiled • no supplies
Right: 40 gold • Wrong: 15 life
[ Open ]                   [ Leave it ]
```

- **You risk:** 15 life, with no clue beyond the free one.
- **You win:** 40 gold, about two Whetstones.
- **Feels like:** a dare. It's rare, and it uses a turn of the spread like
  any zone.

**Which to keep: A.** It's the bet the owner already picked (the waystone
mod), and it adds no tap. B taxes every item for a small gain. C is good fun
but can wait, as a place type to add once A has been played.

### Questions for the owner

1. **Which three supplies?**
   - Set 1: Torch (gold), Tangled Fossil (life), Scroll of Wisdom (reward) (recommended)
   - Set 2: Golden Page (gold), Ancient Orb (life), Base reveal (reward)
2. **Which bets?**
   - The zone's mod only (recommended)
   - The mod, plus a gold stake on a first try
   - The mod, plus Strongbox places
