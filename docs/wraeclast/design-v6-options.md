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

## 9. Four supplies, and the town as the gamble

The owner's answers to section 8: four supplies, not three, and the
gambling lives in the town. This section replaces section 8's supplies and
its bets. There are no zone-mod or first-try bets; a zone's waystone mod
stays only as its character (section 2).

### Four supplies, four jobs, four prices

Each supply tests a different kind of knowing:
- **Torch:** the art (do you know its look?);
- **Golden Page:** the flavor text (its lore);
- **Ancient Orb:** another unique of the same category (what kind of thing
  it is);
- **Scroll of Wisdom:** the next mod line, common first (its stats).

The fourth price is **the Seed's share**: the supply feeds the corruption,
and the Seed gains 5 life. Before the duel that's a debt you'll meet later.
At the duel it heals the Seed in front of you.

Recommended:

| Supply | Paid in | How | Why it isn't plainly better |
| --- | --- | --- | --- |
| Torch | Gold | Bought at towns, 2 for 8 | The strongest on most items, so it's the one gold rations. Every Torch is a Whetstone not bought |
| Scroll of Wisdom | Reward | At hand; the answer drops a card less and hits 8 less at the duel | The first line is weak and the third gives a lot away, so each one costs more than the last is worth |
| Golden Page | Life | At hand, 5 life a use | Decides an item for a lore reader and does nothing for anyone else |
| Ancient Orb | The Seed's share | At hand; the Seed gains 5 life | Cheap now, dear late: the same price grows with every turn you wander, so early it's nearly free |

Alternative (the board as the fourth price):

| Supply | Paid in | How |
| --- | --- | --- |
| Torch | The board | Each Torch adds one more decoy name to the Inscription |
| Scroll of Wisdom | Gold | Bought at towns, 2 for 8 |
| Golden Page | Reward | The answer drops a card less and hits 8 less |
| Ancient Orb | Life | 5 life a use |

The alternative makes the art cost a harder build: see more, then pick from
more. It reads well but stacks two costs on the one supply people use most.
The Seed's share ties the fourth price to the run's own clock. That's why I
recommend it.

**Limits for both:** a supply paid at use is at hand on every item, at most
2 per item. Only the gold supply is shopped for.

**What gold is for:**
- the gold supply;
- a Blacksmith's Whetstone (+2 to every hit);
- an Armourer's Scrap (the Seed hits 1 less);
- healing (20 life);
- a flask drink;
- the town's gamble, below.

### The town as the gamble

A town is the only place you spend, and every visit stays under a minute. I
drew these from PoE's own gambling: buying unidentified items blind, haggling
over a price, opening a Stacked Deck for a random divination card, and the
Ritual shop's rolled wares. They take only the mechanics, never an NPC's
name. That keeps them clear of the rejected "Gwennen" idea. They are still
the gamba that idea rejected, but now it's the owner's ask, and it lives in
the main loop: the town is the shop.

**A. A rolled market (recommended)**

```
Ziggurat Encampment                        gold 46
Whetstone        12   (sale)
Torch ×2          8
Armourer's Scrap 20   (dear)
Healing          10
[ Reroll the market • 5 ]           [ Leave ]
```

- **What's offered:** 4 wares, rolled each visit at half to double their
  usual price; a sale or a dear price is marked. A reroll deals 4 new wares
  at new prices, for 5 gold, then 8, then 12.
- **You risk:** the reroll's gold, and the chance the next deal is worse than
  what you passed up.
- **You might win:** two Whetstones on sale, which is a duel won.
- **Feels like:** a dice roll at the counter: "do I take a fair price now, or
  roll for a great one?" That's two or three taps a visit.

**B. Stacked Decks at the counter**

```
Forest Encampment                          gold 46
Whetstone 16 • Torch ×2 8 • Scrap 16 • Healing 10
Stacked Deck 10   open it here:
  Whetstone ×2 • Torch ×4 • 30 gold • Scrap • nothing
```

- **What's offered:** fixed wares at list price, plus Stacked Decks for 10
  gold each, opened on the spot. The prize table is shown, so the odds are
  fair to see.
- **You risk:** 10 gold a deck; one deck in five gives nothing.
- **You might win:** two Whetstones for 10 gold.
- **Feels like:** a scratch card beside a plain shop. It's the most fun to
  open, but the shop itself stays as boring as now.
- **Name:** Stacked Deck is free again, since it's no longer a supply. In
  PoE it opens into a random divination card, so here it does what it does
  in the game.

**C. A haggle**

```
Whetstone • list 16
Offer:  [ 16 • sure ]  [ 11 • often ]  [ 6 • rarely ]
Refused: the Whetstone is gone until the next town
```

- **What's offered:** every ware at list price, or a lower offer that may be
  refused. A refused ware leaves the shop for this visit.
- **You risk:** losing the ware you needed most.
- **You might win:** a third off everything, if the offers land.
- **Feels like:** a bluff with the shopkeeper. It's quick, but it's one
  gamble per ware, which gets busy on a phone.

**Recommendation: A, with one Stacked Deck as a ware it can roll.** The
market makes the shopping itself the gamble, as the owner asked. A Deck
turning up now and then adds the scratch card. A Sekhemas boon fits it as a
Pledge, too: **Chipped Dice**, "your first reroll each town is free"
(price: Trade Tariff, wares cost a quarter more).

### Questions for the owner

1. **Which prices for the four supplies?**
   - Torch gold, Scroll reward, Golden Page life, Ancient Orb the Seed's share (recommended)
   - Torch the board, Scroll gold, Golden Page reward, Ancient Orb life
2. **Which town gamble?**
   - A rolled market you can reroll for gold, with a Stacked Deck now and then (recommended)
   - Stacked Decks beside a plain shop
   - Haggling over each price

## 10. Six town gambles, grown from this game

The owner's answers to section 9:
- **Supplies:** all four cost gold, with the four jobs kept (Torch the art,
  Golden Page lore, Ancient Orb the kind, Scroll stats). The Seed's share is
  out.
- **The town gamble:** rolled markets, Stacked Decks, haggling and every
  stock shop trick are out.

Each pitch below is what you do, what you risk, and why it couldn't be in
any other game.

**1. Lucky syllables**
- **You do:** buy a syllable tile, say "thorn", "Ullr" or "of the". Each later
  answer that holds it pays you gold. A rare syllable is cheap and pays big;
  a common one is dear and pays a little.
- **You risk:** the gold, if no answer ever holds your syllable.
- **Only here:** the bet is on knowing how uniques are named. Prices and
  payouts come from the name pool itself (principle 10), and owning a tile
  changes nothing on the board.

**2. The scout's tale**
- **You do:** pay for a clue from a place you haven't entered yet: one mod
  line or a scrap of flavor text from the item waiting there. Then decide
  whether to go.
- **You risk:** the gold, if the clue says nothing to you, or the place is
  the wrong way.
- **Only here:** you are buying a look at a question before choosing to
  face it, which turns the open map into a choice about what you know.

**3. Trophies**
- **You do:** every item you named this run is a trophy, priced by its depth
  (Forgotten trophies are dear). At a town, sell trophies for gold, or keep
  them: each one kept adds 2 to your hit at the duel.
- **You risk:** a miss later on loses your newest trophy.
- **Only here:** your own right answers are the currency, and keeping them
  is a bet that you won't miss again.

**4. Doomed towns**
- **You do:** shop in a town the spread is heading for. Its prices fall each
  turn as the Seed nears, and the town is lost when the spread reaches it.
- **You risk:** waiting a turn too long and finding the town gone, gold
  unspent and nowhere to buy.
- **Only here:** the Seed's spread across Wraeclast's real places is the
  price tag, so the soft timer reaches into the shop.

**5. Burn back the Seed**
- **You do:** pay gold for a cleansing at the town's shrine: one item, the
  art veiled, no supplies. Right, and the nearest corrupted place is
  cleansed and the Seed loses 10 life.
- **You risk:** the gold, and the spread jumps a ring if you're wrong.
- **Only here:** you wager your knowledge against the corruption itself;
  the duel starts in town.

**6. The town's bounty**
- **You do:** each town posts one veiled item with its free clue. You can
  pay 10 to name it from that clue alone. The bounty grows each time a town
  is passed by unclaimed, and it carries on from town to town.
- **You risk:** 10 gold a try, and the item stays posted if you miss.
- **Only here:** the bet is a question you can see before you pay, and only
  someone who knows that item should take it.

**My pick: Lucky syllables (1).**
- It's the most this game's own: it bets on how the item pool names things,
  and no other game has that.
- It's a one-tap buy, so a visit stays under a minute, and it adds no item
  or screen.
- Each answer afterwards gets a small second thrill ("it had 'thorn'!") and
  never a hint.
- **Second choice: Doomed towns (4).** It needs no new screen: the town's
  prices just move with the spread. It sits well beside Lucky syllables.
- **What 5 and 6 add:** a trivia item to the town, which the owner said
  other phases already have enough of.

### Questions for the owner

1. **Which town gamble leads?**
   - Lucky syllables (recommended)
   - The scout's tale
   - Trophies
   - Doomed towns
2. **Should the town also run a second gamble?**
   - Yes, Doomed towns beside the lead one (recommended)
   - No, one gamble per town

## 11. The town as the build moment

The owner's answer to section 10: none of the six. The town should hook a
player into round after round, with all four hooks:
- breaking the game (Balatro);
- unlocks between runs (Hades, Vampire Survivors);
- build synergies (Slay the Spire);
- near-miss mastery.

So the town is where you assemble a build that can break the run. Its parts
are Pledges, supplies, gold, duel strength and what the town offers.
Research notes: `research/v6-supports-and-orbs.md`.

**The numbers below** use section 6's duel:
- **The Seed:** 30 life, +8 a turn. After 7 zones it has about 86 and hits
  8 or 9 as each item opens.
- **Your hit:** 10 for a right answer, before any build.
- **A hit is worked out in order:** flat additions first, then each
  multiplier in turn, as Balatro reads its jokers left to right.
- **Gold:** a right answer pays about 12, and the camp starts you with 40.
- **Towns:** three, after about turns 2, 4 and 6.
- **Without a build:** the duel takes 9 right answers, against 8 or 9 life
  lost per item, which a careful player only just wins.

Every number is a first guess, to show the shape of a snowball.

### A. The bench: craft one weapon with PoE's own orbs

**(a) A visit.**
- You carry one weapon into the duel, and the town is its crafting bench.
  Each visit offers 3 or 4 orbs for gold, each doing what it does in PoE2:
  - a Transmutation makes the weapon magic, with 1 mod;
  - an Augmentation adds a second mod;
  - a Regal makes it rare, with a third mod;
  - an Exalted adds a mod;
  - a Chaos swaps one mod for a random one;
  - an Annulment removes one;
  - a Divine rerolls the numbers.
- Mods trigger on how you answer: "bare answers hit ×2", "+5 hit for each
  supply used on the item", "+4 gold for each right answer", "+1 hit for
  every 3 gold you carry", "first-try answers hit ×1.5".
- **A Vaal Orb** corrupts the weapon, as in PoE2. It rolls one of: nothing;
  every mod rerolled; a corrupted enchantment (the big one, such as "gold
  mods count double"); or a fifth mod slot.
  - Either way the weapon is locked for good, and the Seed gains 15 life:
    the corruption is now in your hand.
- A visit is 2 to 4 taps: buy an orb, watch it land, keep going.

**(b) Builds that break it.**

*The miser* (gold that turns into hit):

| | Gold | Weapon | The duel hit |
| --- | --- | --- | --- |
| Town 1 | 40 → 19 | Transmutation: +4 gold a right answer. Augmentation: +1 hit per 3 gold carried | |
| Town 2 | 51 → 36 | Regal: bare answers hit ×2. A corrupted zone deals the Pledge Ornate Dagger (×1.5) | |
| Town 3 | 68 → 48 | Vaal lands "gold mods count double": +2 hit per 3 gold. The Seed gains 15 | (10 + 32) × 2 × 1.5 = **126** |

- **Result:** the Seed has 101 life, and one bare answer kills it. Every
  right answer adds gold, so the hit grows as you go.
- **If the Vaal had rolled every mod again:** the miser could have lost
  both gold mods and walked in with 10 a hit. That's the "big or bricked"
  the owner floated, as a real choice: at Town 3 an Exalted was the safe
  buy.

*The lamplighter* (supplies that turn into hit):

| | Gold | Weapon | The duel hit |
| --- | --- | --- | --- |
| Town 1 | 40 → 11 | Transmutation: +5 hit per supply used on the item. Buys 6 Torches | |
| Town 2 | 35 → 11 | Augmentation: supplies used on a right first try come back. Buys 2 Golden Pages and 2 Ancient Orbs | |
| Town 3 | 35 → 7 | Vaal lands a corrupted enchantment: the supply mod doubles, to +10. Buys 2 Scrolls | 5 supplies on one item: 10 + 50 = **60**, every one refunded |

- **Result:** two items kill a Seed of 101. The build turns the old "use
  less" rule upside down, which only works because a first try must still
  be right.

**(c) Unlocks between runs.**
- **Weapon bases, each with its own built-in mod:**
  - a Spear to start;
  - then a Quarterstaff ("first-try answers hit ×1.5");
  - a Bow ("a bare answer fires twice");
  - a Sceptre ("Pledges' edges count half again");
  - a Crossbow ("holds one hit back and adds it to the next").
- **New mods** in the pool.
- **New orbs:**
  - a Fracturing Orb, which locks a mod so a Vaal can't touch it;
  - Essences, which add a chosen mod;
  - Omens, which steer the next orb.
- **They're earned by deeds in a run:** "one-shot the Seed", "win with a
  locked weapon", "use three Vaal Orbs".

**(d) Why a lost duel brings you back.** The end screen shows the last hit
and what's left: "Seed: 14 life left. Your hit: 42. A Regal at Town 2
instead of the Torches would have made it 84." You lost to a choice you can
see, and you know the orb you'll buy next time.

### B. The links: one skill, and support gems in its sockets

**(a) A visit.**
- Your duel attack is one skill gem, with 2 linked sockets at the start.
  Each visit offers 3 support gems from the pool, and you pay to socket
  one.
- A Jeweller's Orb adds a socket, up to 5, and its price rises each time.
- Supports are PoE2's own, each doing what it does there, read left to
  right. Neither the gem names nor these words clash with an answer:
  - **Combo Finisher:** every third right answer in a row hits ×3.
  - **Practiced Combo:** a first-try answer builds 2 Combo.
  - **Spell Echo:** a bare answer's hit repeats.
  - **Ricochet:** half of each duel hit carries into the next item.
  - **Brutality:** bare answers hit ×2, and clued answers hit nothing.
  - **Fire Attunement:** +25% of the hit as extra.
  - **Execute:** ×1.4 while the Seed is under half.
  - **Culling Strike:** the Seed dies under 25%.
  - **Life Leech:** hits heal 12% of their damage.
- Chain, Fork and Behead are left out: Chain and Fork appear in answers
  (Chain Mail, Runic Fork), and Behead is the family of the answer Einhar's
  Beastrite.
- No randomness after the offer: the gamble is which supports turn up, the
  skill is the order you put them in.

**(b) Builds that break it.**

*The streak:*

| | Sockets | Duel hit |
| --- | --- | --- |
| Town 1 | Combo Finisher | |
| Town 2 | Jeweller's Orb; Practiced Combo | |
| Town 3 | Jeweller's Orb; Spell Echo, Ricochet. Pledge Ornate Dagger (×1.5) | Item 1, bare and first try: 15, echoed 30. Item 2, Combo at 4: 15 × 3 = 45, echoed **90**, plus 15 carried |

- **Result:** a Seed of 86 dies on the second item, against nine right
  answers unbuilt. A miss breaks the Combo, so the build bets on not
  missing.

*The executioner:*

| | Sockets | Duel hit |
| --- | --- | --- |
| Town 1 | Brutality | |
| Town 2 | Jeweller's Orb; Fire Attunement. Pledge Sanguine Vial (the Seed has 30% less life) | |
| Town 3 | Jeweller's Orb; Execute, Culling Strike. Pledge Ornate Dagger | Item 1: 10 × 2 × 1.25 × 1.5 = **37**, the Seed 60 → 23. Item 2: × 1.4 = 52: culled |

- **Result:** two items, and only if both are bare. One clued answer hits
  nothing, so the build is all nerve.

**(c) Unlocks between runs.**
- New supports in the pool: Spell Echo and Practiced Combo start locked.
- New skill gems as the duel attack, each with its own base behaviour (one
  hits twice for half; one grows with Combo).
- A third starting socket.

**(d) Why a lost duel brings you back.** The end screen replays the chain:
"Item 3: Combo broke on the miss. With Practiced Combo before Combo
Finisher, it would have fired on item 2." The order is the lesson, and
order is skill.

### C. The rack: upgrade your four supplies into an engine

**(a) A visit.**
- The four supplies stay (Torch, Golden Page, Ancient Orb, Scroll of
  Wisdom), bought with gold. Each visit offers 3 upgrades, one free and the
  others for gold, plus supplies.
- An upgrade changes what a supply does, for the rest of the run:
  - "each Torch also hits the Seed for 4";
  - "an Ancient Orb strikes its sibling's tiles from the board";
  - "every Scroll used this run adds 2 to your hit";
  - "a Torch used on a right first try comes back".
- A supply takes up to 3 upgrades. Names for them are still to find
  (principle 8).

**(b) Builds that break it.**

*The bonfire:*

| | Upgrades | Duel |
| --- | --- | --- |
| Town 1 | Torch: also hits the Seed for 4. Buys 8 Torches | |
| Town 2 | Torch: comes back on a right first try | |
| Town 3 | Torch: each Torch on an item hits 4 more than the last. Pledge Ornate Dagger | 5 Torches on item 1: 4 + 8 + 12 + 16 + 20 = 60, plus the answer's 10, × 1.5 = **105**, Torches refunded |

- **Result:** a Seed of 86 dies on the first item, and the art is fully
  burnt in by then.

*The scholar:*

| | Upgrades | Duel |
| --- | --- | --- |
| Town 1 | Scroll: each line shown pays 2 gold | |
| Town 2 | Scroll: costs half | |
| Town 3 | Scroll: every Scroll used this run adds 2 to your hit | 15 Scrolls used by the duel: +30. Item 1 with 3 more: 10 + 36 = **46**, then 52 |

- **Result:** two items. The ramp is felt all run, since every Scroll read
  makes you stronger.

**(c) Unlocks between runs.**
- New upgrades in the pool.
- A fifth supply (Base reveal, or another).
- A starting upgrade of your choice.

**(d) Why a lost duel brings you back.** "6 Torches left in the pack: 60
damage you never used." The engine was there, and you didn't spend it.

**The main risk:** when supplies become the power, a broken build reveals
the answer outright (the bonfire burns in the whole art). The duel is won,
but the trivia stops deciding. A and B keep the clues and the power apart.

### My pick: A, the bench

- **It's PoE's own hook.** Crafting a weapon with orbs is what PoE players
  already play round after round for, so it needs no explaining, and the
  orbs do exactly what they do in the game.
- **The town is the build and the gamble at once.** The owner wanted a
  gamble there, and each orb is one, with odds a PoE player knows.
- **It ties to the Seed.** A Vaal Orb feeds the Seed 15 life and locks the
  weapon, so "big or bricked" is a choice about the duel, not a slot
  machine.
- **Knowledge stays the engine.** Every mod triggers on how you answer
  (bare, first try, supplies used), so a build only breaks the run for
  someone who answers well.
- **Unlocks come naturally:** bases, orbs, and mods for the pool.
- **The risk:** a 4-mod weapon has to read on a 375 px phone (four lines
  and a base). And luck in the orbs could swamp the build; Fracturing Orbs
  and Essences, as unlocks, give control back.

B is the cleaner synergy puzzle, and a fallback if the orbs feel too
random. C makes items play differently, but breaks the trivia.

### Questions for the owner

1. **Which town?**
   - The bench: craft one weapon with PoE's orbs (recommended)
   - The links: support gems in a skill's sockets
   - The rack: upgrade your supplies into an engine
2. **How much luck in the build?**
   - Orbs land at random, and Vaal is the big gamble (recommended)
   - Pick from offers, with no randomness after that
