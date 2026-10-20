# Wraeclast run: new mode design plan

Oct 19, 2026 · @console-trace

## Summary

**Wraeclast run** (working title) is a trivia roguelike with no clock. You cross the illustrated Wraeclast map on a branching route toward one final boss. You name each item by building its **Inscription** out of syllables. To learn more about an item, you use supplies bought in towns, which **burn through the Veil over its art, reveal other clues or thin out the Inscription**. A run takes 15 to 25 minutes and ends in a win or a loss. You can play it alone or as one live co-op party.

|  | Delve | Wraeclast run |
| --- | --- | --- |
| Pressure | A clock, 16 s down to 5 s | No clock; gold, life and flask charges are scarce |
| Shape | Endless descent; depth is the result | A branching route to one boss; win or lose |
| Answering | Pick 1 of 4 to 10 names | Build the name from syllables (Inscription) |
| Information | Art shown, altered with depth | Art veiled; clues come from supplies bought in towns |
| Decisions | Category card | Route, cards, shopping, which supply to use, boons |
| Between runs | Best depth | Five tiers, map fog, shortcuts, boon unlocks |

## Pillars

Every rule below has to serve these seven goals. A rule that breaks one of them gets cut.

1. **Trivia is the heart.** Every decision comes down to what you know and how much you need to see before you are sure.
2. **Hard without a clock.** Pressure comes from scarce gold and life and from answering with little information, never from speed.
3. **Every choice costs something.** Routes, cards, towns, supplies and boons each trade one resource for another.
4. **Built for phones.** There is no keyboard. Everything is a tap or a drag at 375 px wide.
5. **Solo first, live together.** A full run works alone. Co-op is one party in the same session, with no leaderboards or shared seeds.
6. **Data stays automated.** Every clue, syllable and price comes from scripts over items.json and itemStats.json.
7. **It looks like poe2.quest.** It keeps the card selection, the arcane style and the item art of the other modes.

## A run

A run is a walk of 16 nodes across the map, from the camp to the boss. It takes at least 15 minutes for an experienced player and 20 to 25 for most. You win by beating the boss. You lose when your life reaches 0.

- **The map is fixed.** About 40 nodes sit at fixed spots on the illustrated Wraeclast map. Each node is an actual place on Wraeclast, at the spot where it lies on the illustrated map, such as Clearfell, Grelwood, the Red Vale or the Ogham Farmlands. No place is invented, and none comes from outside Wraeclast. Their names, positions and the paths between them are placed by hand once and stored in a small JSON file. That is map layout, not item data, so it doesn't conflict with the automation rule.
- **Steps keep runs even.** Every node belongs to a step: the camp at 0, the boss at 16. Paths only lead one step forward, so every route is the same length. Shortcuts are the exception: they skip a step (see Progression).
- **Towns are fixed, the rest rolls.** The nodes at steps 4, 8 and 12 are towns, so every route passes three. Every other node rolls per run: about 3 in 4 become zones, the rest Wells or events. A zone also rolls its zone type.
- **Branching.** From each node, paths lead to 2 or 3 nodes one step ahead, and you pick one.
- **Fog.** Fog covers every part of the map you have never seen. Where the map is uncovered, you see each node's type before choosing your route, so you can plan several steps ahead. In fog, you only see the next step. Visiting a node clears the fog over it and its neighbours for good.

| Node | What happens | Per run |
| --- | --- | --- |
| Zone | 3 items under the zone type's rules; a boon pick after every second zone | about 10 |
| Town | A vendor: supplies, bigger flasks, boons | 3, plus the camp at step 0 |
| Well | Refills all flask charges | about 1 |
| Event | A trader, a gamble, a strongbox or a wanderer (see Towns and events) | about 1 |
| Boss | A chain of 3 items under the boss's rule; the run ends here | 1 |

With about 10 zones of 3 items each plus 3 boss items, a run asks about 33 items. An experienced player needs about 20 s per item, and a regular 30 to 40 s: the free clue, a supply or two, and tapping 3 to 5 syllables. Route, boon, town and event picks add 3 to 4 minutes. That puts the lower bound at about 15 minutes for an expert, and most players take 20 to 25. Co-op items often go faster, since anyone can strike, while the picks between items are votes.

**One decision per phase.** Each phase of a run asks one kind of question, so no moment stacks two:

| Phase | The one decision |
| --- | --- |
| Travel | Where to go: which zone types, towns and Wells lie ahead. Which corruption front to stop. Nothing is used while travelling |
| Town | What to buy |
| Item | What to spend on this item (supplies, a flask charge), then what to answer |
| Loot | Nothing to decide: you take every card dealt |
| Boon pick and events | The one choice they deal |

## An item

The core loop goes like this. The item opens with its art veiled and one free clue. You decide which supplies from your pack to use on it, then build the name from syllables. Nothing can be bought during an item. A right answer drops loot. A wrong one costs life and a card from the drop, but shows you which of your syllables were right.

**Terms**

- **Inscription:** the pool of syllables you build the name from: the answer's syllables mixed with decoys. There are no names on it, and the game never says how many decoys there are.
- **Veil:** the cover over the item's art. Every item sits in the same square frame, so its size gives nothing away.
- **Burn-in:** a part of the art revealed through the Veil, at a random spot.
- **Supply:** a consumable bought in towns or found as loot, carried in your pack in stacks. Using one on an item reveals a clue.
- **Clue:** the zone's free clue, or what a supply reveals. Counts are never shown for free: not of mod lines, decoys or words.
- **Life and flasks:** a wrong answer costs life. A flask charge restores a little life at once and more over the next 2 items, towns heal a little, and only Wells refill the charges (see Economy).

**The flow**

1. **The item opens.**
   - **Inscription:** the answer's syllables and decoy syllables, in lower case and shuffled. Decoys come from item names of every category and look like the answer's syllables. The pool grows over the run, from about 14 tiles at the start to about 32 at the boss.
   - **Veil:** covers the whole art, in a square frame.
   - **Free clue:** the zone type gives one weak clue for free: text, except in Blight and Kalandra zones, which burn in a little of the art (see Zones).
2. **Use supplies, or don't,** at any moment of the item, and a flask charge if you need one. You can only use what you bought or found before.
3. **Build the name.** Tap syllables in order to place them on the answer line, and tap a placed syllable to take it back. Placed syllables join into one continuous word on the line, each keeping a faint seam and its own mark, so the build reads like a name. If you want word gaps, a break key beside Clear adds one at the end of the line, and tapping a gap removes it. The game never places or suggests a break, and breaks don't count when checking: only the syllables and their order do. (From the prototype after playtest 3.) Every build you submit counts, including one that isn't a real item name.
4. **Submit.**
   - **Right:** the item drops loot. Cards are dealt and you take all of them (see Loot).
   - **Wrong:** you lose life (more the deeper you are), the drop loses a card, and the line is marked as in Wordle. A syllable in the right place glows gold, one that is in the answer but elsewhere glows silver, and one that isn't in the answer is struck from the board. The marks stay on the tiles. Back to step 2.

There is no way to skip an item: you answer it or your life runs out. A miss always teaches something, so you are never stuck with nothing to try; you only choose how much life to pay for what you learn.

**The strategy lives in the pack.** Supplies are cheap and come in stacks, so the question isn't whether you have a clue but which clue to spend on which item. An expert answers from the free clue and one cheap read. A newcomer spends freely, or pays in life by guessing and reading the marks. What you bought decides which clues you can get later, so every town visit is a bet on what the coming zones and the boss will need.

## Zones

A zone's place on the map is fixed, but its zone type is rolled per run. Each type is a PoE league mechanic, defined by its free clue and one rule that fits the mechanic. So Grelwood can be a Ritual zone in one run and a Delirium zone in the next. The zone type shows on the map, so you can plan a route around the clues you know best. Six zone types are available from the first run, and four more are hidden in the fog.

| Zone type | Free clue | Rule | Available |
| --- | --- | --- | --- |
| Plain (no mechanic) | One common mod line | None; the baseline | From the start |
| Incursion | Flavor text, name words masked | Flares burn in half as much | From the start |
| Essence | Base type (gems: the support description) | 1 fewer loot card, because the base often gives the item away | From the start |
| Ritual | The answer's word lengths | Scrolls of Wisdom don't work here | From the start |
| Expedition | One common mod line | A vendor opens after the zone; 1 fewer loot card | From the start |
| Blight | A small burn-in | 6 extra decoys on the Inscription | From the start |
| Delirium | Flavor text and one common mod line | The art can't be revealed; Flares don't work | Found in the fog |
| Kalandra | A larger burn-in, mirrored | +1 loot card | Found in the fog |
| Ultimatum | None | +2 loot cards; misses cost double life | Found in the fog |
| Necropolis | One common mod line | Items come from your own past misses; +1 loot card | Found in the fog |

Necropolis zones are where the mode practises what you got wrong. They draw from the Codex's record of misses, using the host's record in co-op. They give a regular a reason to come back even after learning most of the 501 items.

Lineage gems (56 of 501) have only three base types (Strength, Dexterity and Intelligence support). On a gem, the Essence zone's base clue is the gem's support description instead, with name words masked. The base type is sold only one at a time, as the Base reveal: for about 73% of uniques it is the only unique of its base in its category, so naming the item from it is expert trivia. Their "Category" line is masked whenever it repeats the gem's name, which is true for 19 gems.

## Loot

A right answer drops loot: cards are dealt face up, in the mode's card look, and you take all of them. Knowledge decides how much drops, and luck decides what.

- **The deal:** 2 cards. Each miss on the item removes one, but a right answer always drops at least 1. Zone types add or remove cards, and a corrupted zone doubles them.
- No card names a category, so loot never hints at the next item.

| Loot card | What it gives | How often |
| --- | --- | --- |
| Gold | 4 to 8 at steps 1 to 5, 6 to 10 at steps 6 to 10, 8 to 12 at steps 11 to 15 | Common |
| Supplies | A stack of 2 of one random supply | Common |
| Flask charge | Refills one empty flask charge | Uncommon |
| Boon | Pick 1 of 3 boons now | Rare |

**Other cards.** Shop wares are dealt as cards (buying takes the card), boon offers are 1 of 3 boon cards, and events deal their choices as cards.

## Corruption

Corruption creeps across the map toward the boss, as it spreads over the PoE2 Atlas. It is the run's big strategic gamble: fight it while it is in reach, or leave it and face a nastier boss.

- **Seeds:** when the run starts, 3 zones at steps 3 to 7 are corrupted, on different branches where the map allows. Corruption shows through the fog, so you always see where it is.
- **Creep:** after every second step you take, each corruption front creeps one step toward the boss. It corrupts one zone a step ahead of it on a path, picked at random when there are several. Towns, Wells and events can't be corrupted; a front facing one creeps past it to the zone beyond. The node it left stays corrupted, but only the front moves on.
- **Corrupted zones** are harder and richer. Each rolls a hidden modifier, shown on a card that flips when you arrive, and every item in it drops twice the loot cards.
- **Cleansing:** answering all 3 items of a corrupted zone cleanses it. Cleansing a front stops it for good; cleansing a zone behind a front only takes its loot.
- **The boss:** every front still creeping when you reach the boss gives it one boss modifier (see The boss), up to 3.

| Hidden modifier | Weight | Effect in that zone |
| --- | --- | --- |
| Blood toll | 2 | Each item takes 10 life when it opens |
| Sealed | 2 | Supplies don't work; a flask charge still does |
| Swarming | 2 | 8 more decoys on every Inscription |
| Dark | 2 | The art can't be revealed |
| Bounty | 1 | No catch |

Fronts move at half your speed, so you can catch one, but only on the steps and branches where it is. A front seeded at step 3 is in reach around step 6, one seeded at step 7 around step 14, and with 3 fronts on different branches you rarely stop them all. Each catch costs a hard zone with an unknown twist; each front you leave alone makes the boss worse. Knowledge decides how well you clear a corrupted zone, and the hidden modifier is the gamble on top.

## Economy

There are three resources. **Gold** buys supplies and gear between items: at the camp, in towns, at Expedition vendors and at the Gambler. **Life** is your margin for error, and **flask charges** are the only way to get it back, as in PoE2. Every number here is a starting point to tune in playtests, the way Delve's curves were.

**Life and flasks**

- **Life:** 100, and it never goes above that. A wrong answer costs 20 to 30 life at steps 1 to 5, 30 to 40 at steps 6 to 10, 40 to 50 at steps 11 to 15 and 55 to 65 at the boss, rolled per miss. The item shows its range before you submit. The run ends at 0.
- **The flask heals over time,** as life flasks do in PoE2. It starts with 2 charges. Drinking one restores 10 life at once and 10 more after each of your next 2 items, right or wrong. Drinking again while a charge is still recovering restarts it, and the rest of the old one is lost. You drink during an item, at any moment of it, the way you use a supply. Nothing else costs life, so there is no reason to drink anywhere else.
- **What that means:** the instant 10 is for the moment of truth. Drinking before an unsure submit can keep a miss from ending the run, but a charge never undoes a miss. You drink before a stretch you expect to be hard, such as an Ultimatum zone or the boss. Drinking at full life wastes it, and drinking just before a town wastes it too.
- **Resting spots:** towns heal 20 life when you arrive, for free. A player who saves charges and limps to the next town keeps them for later, at the risk of dying on the way.
- **Refilling:** only Wells refill charges (a Well node refills all of them; a Flask charge loot card refills one). Wells heal no life. Towns never sell charges; they sell a bigger flask, +1 maximum charge, which stays empty until the next Well.
- **Budget:** 100 life, 2 charges and three towns add up to about 220 life, which covers about 6 misses spread over a run: say 2 early, 2 in the middle, 1 late and 1 at the boss. A winning run therefore gets about 1 miss in 6 items. A seventh miss, or a careless miss late in the run, usually ends it.

**Gold**

- **Start:** 20 gold, spent at the camp before step 1.
- **Earning it:** Gold loot cards, which drop beside everything else.
- **Base reward:** a Gold card pays 4 to 8 early, 6 to 10 in the middle and 8 to 12 late. The boss drops nothing. A run that mostly takes gold earns roughly 200.
- **Rounding:** gold earned rounds down; prices raised by tiers or lowered by boons round up.
- **Spending it:** at the camp, in towns, in Expedition zones and at the Gambler. Leftover gold is worth nothing at the end.

**Supplies (second version)**

| Supply | What it does | Sold as |
| --- | --- | --- |
| Flare | Burns in about a sixth of the art at a random spot | 3 for 6 gold |
| Scroll of Wisdom | The item's next mod line, from the most common to the rarest, name words masked | 3 for 6 gold |
| Golden Page | The flavor text, name words masked | 2 for 6 gold |
| Category reveal | The item's category, such as Rings | 2 for 6 gold |
| Base reveal | The base type (gems: the support description) | 1 for 6 gold |
| Decoy sweep | Strikes 4 decoys from the Inscription | 3 for 6 gold |
| Word lengths | How many words the answer has, and the syllables in each | 3 for 4 gold |
| First syllable | Places the answer's first syllable on the line, locked and gold | 2 for 6 gold |

Playtest 2 showed that supplies were too scarce, that Flares revealed too little for their price, and that there was no way to learn the base type, the category or the flavor text. So supplies come in cheap stacks, Flares burn in twice as much, and three reveals are back. The base type gives the answer away for about 3 uniques in 4, which makes naming the unique from it real expert trivia, so it is sold one at a time. The Scroll of Wisdom now reads from the most common line to the rarest: a first Scroll is weak, and a third may give the item away. Scroll of Wisdom and Golden Page are PoE items that do here what they do in the game. The others have working names until fitting PoE items are found, Flare included, since Delve already has a Flare that does something else. A supply's name must be an item you can buy, carry and use: never an NPC, an action or a league mechanic.

**The pack** holds 8 stacks of up to 5 of one supply each, and the flask doesn't take a slot. A full pack means choosing what to leave behind at the next town.

**The Inscription** grows along the route (each item's total rolls within 3 of its section's size and decoys fill the rest, so the board's size never tells how many tiles the answer has):

| Route steps | Decoys | Tiles in all |
| --- | --- | --- |
| 1 to 5 | about 10 | about 14 |
| 6 to 10 | about 16 | about 20 |
| 11 to 15 | about 22 | about 26 |
| Boss | about 28 | about 32 |

**Tuning.** Playtests show how often each supply leads to a right answer. A supply that decides items too often gets pricier or weaker, and one nobody buys gets cheaper. Prices are per supply, never per item, so they never hint at an answer.

## Boons

After every second zone you pick 1 of 3 boons for the rest of the run, so a run ends with about 5, plus any that drop as loot. With 15 boons in the starting pool, each run uses a different third of it. There is no score to multiply, so boons combine around information: they make the clues you are good at cheap and make zone types worth routing toward. No boon can be picked twice.

| Boon | Effect | Kind |
| --- | --- | --- |
| Lamplighter | Every item starts with an extra small burn-in, the boss's items too | Information |
| Archivist | Each Scroll of Wisdom shows 2 common mod lines | Information |
| Keen Eye | Each Decoy sweep strikes 6 decoys instead of 4 | Information |
| Strike Through | Each Scroll of Wisdom you use also strikes 2 decoys | Information |
| Scribe | Every Inscription has 6 fewer decoys | Board |
| Prospector | Gold cards pay 50% more | Economy |
| Clean Hands | An item answered without using anything from your pack drops 2 more cards | Economy |
| Haggler | Town prices 30% lower | Economy |
| High Roller | +1 loot card on every drop, but each miss removes 2 | Economy, with a cost |
| Second Wind | The first miss after each town costs no life | Safety |
| Deep Pockets | +1 flask charge to the maximum, filled now | Safety |
| Fortify | Misses cost 25% less life | Safety |
| Lorekeeper | +1 loot card in Incursion zones | Zone |
| Ironmonger | +1 loot card in Essence zones | Zone |
| Cartographer | In fog, you see 2 steps ahead instead of 1 | Route |

Some combinations that make a run feel like a build:

- **The lore reader:** Archivist, Lorekeeper and Strike Through. Route through Incursion zones, answer from the flavor text, and let each Scroll of Wisdom show two lines and strike decoys.
- **The expert:** Clean Hands, High Roller and Lamplighter. Answer from the free clue and one small burn-in for a fat drop, and hope you are right.
- **The cautious one:** Second Wind, Fortify and Haggler. Stock up cheaply in every town and make every miss hurt less.

More boons unlock from the fog (see Progression). Most of them are tied to the hidden zone types, for example "Ultimatum misses cost normal life" or "Flares burn in twice as much in Necropolis zones".

## Towns and events

Towns are where most gold is spent, so the run's strategy is decided there. Wells and events are one-screen stops between zones.

**Town vendor** (the camp at step 0 sells everything; the towns at steps 4, 8 and 12 each stock 4 or 5 of these, rolled per run)

| Ware | Price (gold) | Effect |
| --- | --- | --- |
| Supplies | 4 to 6 a stack | See the supply table in Economy |
| Bigger flask | 30 | +1 maximum charge, empty until the next Well |
| Boon reroll | 10 | Re-deal the next boon offer |
| Boon | 40 | Pick 1 of 3 boons now |
| Bigger pack | 20 | +2 pack slots |

Towns heal 20 life when you arrive but never sell charges. Only Wells refill the flask, as in PoE2.

**Wells and events**

| Stop | What happens |
| --- | --- |
| Well | Refills all flask charges. Its own node type, about 1 per route |
| Trader | Trade 2 supplies from your pack for 1 of your choice |
| Gambler | Pay 15 gold for one try at an item with a boss-size Inscription and a single small burn-in, no supplies allowed. Right: a boon pick or 50 gold. Wrong: the 15 is gone, no life lost |
| Strongbox | One try at an item whose art can't be revealed. Right: a loot deal of 5 cards. Wrong: nothing gained, no life lost |
| Wanderer | Swap one of your boons for a random one you don't have |

The Gambler and the Strongbox are trivia; the Well, Trader and Wanderer are quick choices. That keeps events from turning into a separate board game.

## The boss

The boss is a chain of 3 items under one rule, and beating all 3 wins the run. The boss drops no loot, and no town follows the last one, so this is where the supplies you saved get used. A careful route pays off here.

- **Known from the start:** the boss is rolled when the run begins and shows on the map from the first step. You can pick boons and route through zones that prepare you for its rule.
- **The chain:** each of the 3 items has a boss-size Inscription (about 32 tiles).
  - **Item 1** starts with a small burn-in.
  - **Item 2** starts with nothing.
  - **Item 3** starts with nothing, and Flares burn in half as much.
- **Misses:** each costs 55 to 65 life, and reaching 0 ends the run at the boss. A tier 5 boss has a 4th item, which works like item 3.
- **Category:** the boss's items are drawn like any other item, from any category.

**Corruption that reaches the boss.** Every corruption front still creeping when you arrive adds one of these, rolled: Lingering (a 4th item, like item 3), Bloodied (misses cost 10 more life), Murky (Flares burn in half as much) or Teeming (8 more decoys on every item). At most 3.

| Boss rule | Effect |
| --- | --- |
| Blind | The art can't be revealed; Flares don't work |
| Silent | Only Flares work |
| Mirrored | Every burn-in is mirrored and grayscale |
| Hoarder | Every supply used takes two from your pack |
| Shifting | After each miss, the board reshuffles and every struck tile is replaced by a new decoy |

The boss names are still open. Generic titles like these avoid tying a rule to a PoE2 boss whose lore doesn't fit it.

## Progression

Three things carry over between runs: the tier you have reached, the map you have uncovered, and the boons you have brought home. Each answers a different question for a returning player: can I beat a harder one, what's still hidden, and what else can I build.

**Tiers.** A win at a tier unlocks the next one, up to 5. You can always start a run at any tier you have unlocked. Each tier keeps the ones below it and adds to them:

| Tier | Adds |
| --- | --- |
| 1 | The rules as written |
| 2 | Supplies cost 25% more |
| 3 | Start with 80 life and a 1-charge flask |
| 4 | 6 more decoys on every Inscription; burn-ins are mirrored from step 5 |
| 5 | Supplies cost 50% more; the boss chain has 4 items; burn-ins are grayscale |

**Fog.**

- **Clearing it:** visiting a node clears the fog over it and its neighbours for good. With 16 of about 40 nodes per run, you need several runs on different routes to see the whole map.
- **What's hidden:** secrets sit on fixed nodes, placed once in the map file:
  - the 4 hidden zone types (Delirium, Kalandra, Ultimatum, Necropolis), which can roll in later runs once found;
  - about 3 shortcuts, paths that skip a step. A shortcut means fewer items, so less gold but less life lost, which makes taking it a choice;
  - about 8 boon unlocks.
- **On a loss:** uncovered fog, found zone types and shortcuts all stay. Boons found in the fog only join the pool if you win that run, so you have to bring them home.

**Co-op.**

- The host picks the tier, from the tiers the host has unlocked.
- Fog cleared in a party run counts for everyone in the party.
- A win unlocks the next tier, and brings the boons home, for every player still in the party at the end.

All of it is kept in the browser through `src/lib/storage.ts`, like the Codex and Delve's records. Items seen in a run count toward the Codex and achievements as in the other modes.

## Co-op

Co-op is a raid: one party, one screen, one item at a time, and everyone fights it with their own life. It works between strangers in a public room with no chat, because every action shows on the shared board.

**The shared fight**

- Everyone sees the same item: the same Veil, clues and Inscription.
- Anyone can strike at any time by submitting a name. The first right strike fells the item. Solo stays without a clock; in co-op, speed matters.
- A wrong strike costs the striker life and its marks show for everyone, so every miss teaches the party.
- A supply used by any player reveals its clue to everyone.
- Strikes reach the host in the order they arrive, and the host decides which came first. As in Race, the host has a small speed edge.

**Own life, own gear**

- Each player has their own life, flask, pack and gold. Drinking heals only your own life.
- Miss damage grows with party size: +10% per extra player, up to +60% at 7 or more (first numbers).
- A fallen player loses everything they carried: supplies, gold and flask charges. They keep the empty flask.
- Any standing player can spend one of their own flask charges to revive a fallen teammate at 1 life, at any time.
- The run is lost only when every player is down at once.

**Loot**

- One loot deal drops on the shared screen: 2 cards plus 1 for every player who struck the item or used a supply on it, and each miss by anyone removes a card. Every player who acted may take one card, first come, first served; what's gone is gone. Players who did nothing can't pick.
- Each player shops for their own pack. Boons, boon rerolls and other party wares can be bought by several players chipping in until the price is covered.

**Picks between items.** Route nodes, boon offers and event choices are cards, voted with Delve's raffle: each vote is a ticket, and the vote closes once everyone has voted or 6 s after the first vote. Boons apply to the whole party.

**Leaving and joining.** A player who reloads gets their life and inventory back. A player who leaves for good counts as fallen. New players join between runs, not mid-run. Hot-seat plays a run as a solo run on one device.

## Rules in detail

These settle the cases a coder would otherwise have to guess.

- **Syllables:** the board shows each distinct syllable once. Placing one doesn't use it up, so a name that repeats a syllable can place it twice.
- **Checking:** a build is right when its letters, joined, spell the answer's name without spaces and punctuation. A build split differently from the tiles' own split still counts.
- **Marks:** a wrong build is compared with the answer syllable by syllable, as in Wordle. Gold: the right syllable in the right place. Silver: a syllable the answer holds elsewhere (counted as often as the answer holds it). Struck: the rest. A tile keeps its best mark.
- **Inscription supplies:** a Decoy sweep strikes tiles exactly like a miss. First syllable places a locked, gold tile at the start of the line. A supply with nothing to do on an item (no mod line left, no decoy left, the reveal already shown) can't be used on it.
- **Board size:** extra decoys from Blight, Swarming, Teeming or tier 4 add up, to at most 36 tiles in all, so the boss board fits a 375 x 667 phone. The Shifting boss replaces struck decoys instead of adding.
- **No repeats:** an item never comes up twice in a run. A Necropolis zone with too few past misses draws the items you have seen least.
- **Full pack:** loot that doesn't fit can replace a stack, or be left behind.
- **The art can't be revealed** (Delirium, Strongbox, the Blind boss, a Dark corruption): it stays fully veiled for the whole item.
- **Drinking:** a flask charge is drunk during an item. It heals 10 at once, then 10 after each of the next 2 items, including a boss item, and stops if the run ends. Life never goes above 100.
- **Corruption:** a front with no zone left to creep into waits. A corrupted zone counts as cleansed only once all 3 items are answered.
- **Rounding:** gold earned rounds down; changed prices round up.
- **Common mod line:** the most common line among those 3 or more items share. An item with none gets Word lengths as the Plain or Expedition free clue. A Scroll of Wisdom counts the free line as read.
- **The Veil before a burn-in:** only the square shows; nothing marks the art's own size or shape.
- **Pools:** each item's pool is seeded from the run and the item, so a re-deal after a reload is identical. Decoys fill a rolled total, at least 5 of them.
- **Item draw:** uniform over the items not yet seen in the run, never themed by place, zone type or category.
- **Blood toll** never takes the last life point, since it strikes before the player can drink.
- **Clashing rules:** the stricter one wins. Blight's free burn-in is lost in a Dark zone.
- **Fronts:** only a front's head zone stops it, and cleansing a zone two fronts share stops both. Boss modifiers never repeat.
- **Board cap:** the 36-tile cap trims ordinary decoys first, never the answer's tiles or the signature tiles.
- **A tile placed twice:** marked as in Wordle: gold first, then silver from left to right as often as the answer holds it, the rest struck.
- **Decoy sweep:** strikes unstruck decoys picked at random.

## Data and automation

Everything the mode shows about an item is generated by script from items.json and itemStats.json, and checked by tests. The only hand-made data is the map layout, which is placed once.

| Generated file | Made by | What it holds | Test that guards it |
| --- | --- | --- | --- |
| `src/data/syllables.json` | `scripts/make-syllables.mjs` | Each name split into syllables | Every name rebuilds exactly from its syllables; no tile is a whole word except small words |
| `src/data/clues.json` | `scripts/make-clues.mjs` | Per item: base, mod lines (each marked common when 3 or more items share it), flavor text, gem description, with name words masked | No clue contains a word of its item's name |
| `src/data/wraeclast.json` | Placed by hand once | Map nodes: position, step, paths, secrets | Every node reaches the boss; steps only go forward, except shortcuts |

**Syllables.** A rough splitter gives ugly pieces ("Ha / te / for / ge"). The script splits by four rules:

1. **Small words stay whole:** "of", "the", "and". Possessives keep their "'s" on the last syllable.
2. **No other word is a single tile.** Compounds split at word boundaries and then by syllable. A one-syllable word splits before its vowel: gr / ip, b / ond.
3. **The rest is hyphenated with Liang's TeX patterns** (npm packages exist), and any piece longer than 4 letters is split again. Playtest 2 showed "mandrago" as one tile.
4. **All tiles are lower case,** so capitals never mark where a word starts.

The output goes on the generated list in CLAUDE.md beside items.json.

**Masking.** These clues give the answer away without it:

- **Flavor text:** contains a word of the item's name for about 85 items (17%).
- **Mod lines and gem descriptions:** do the same for about 20.
- **Gem "Category" line:** is the gem's own name for 19 gems.

The script replaces those words, possessives and plurals included, with a mask of fixed width. The mask must not show the word's length, or it still leaks.

**Decoys.** Decoy syllables come from other items' names, from every category alike, preferring ones that look like the answer's (similar length, shared letters). Every board also holds "of", "the" and "and" and 2 or 3 possessive tiles: the picker alone rarely chose them, so their presence gave multi-word names and lineage gems away. They don't have to add up to whole names, and a decoy that happens to complete another real name is just a wrong answer. From tier 4, syllables from the made-up names in fakes.json can join; nothing new is written by hand.

**Veil.** No grid of tiles, and every item sits in the same square frame, so its size gives nothing away. Art is revealed with the game's existing burn-in (unveil) effect, or a new shader: each Flare burns in a small area at a random spot, and zones and bosses can bend it further with colour (grayscale, tinted), mirroring or a smaller burn. The art already in `public/items/` is used as it is; nothing new is stored. Guests receive only the burned-in part, never the whole picture before the reveal.

**Map art.** The illustrated Wraeclast map is a single image to source and place nodes on. Check its use against GGG's fan content terms, the same way as for the item art.

## Fair play and resilience

Guests only ever receive what the party has revealed, and a run survives a reload. Lookups aren't guarded against, because cheating is trivial anyway.

**What a guest receives** (the host stays trusted, as in docs/fair-play.md)

- **Syllables:** shuffled and unmarked. Nothing in the message says which ones belong to the answer.
- **Clue text:** only after a supply reveals it.
- **Art:** only the burned-in part arrives, as its own masked image, after each burn-in. The whole picture and the name come at the reveal.
- **Prices:** set per supply, never per item, so they reveal nothing.
- **Submitting:** a guest's build goes to the host as plain text, and only the host knows whether it is right.

**Far links.** With no clock, latency stops being a fairness problem. A burn-in is a small part of the art, so even the worst links in docs/far-links.md carry one in well under a second.

**Resume after a reload.**

- **Saving:** the run state is written through `src/lib/storage.ts` after every decision. It covers the map and route so far, gold, life, flask charges, boons, the pack, the current item and what was used on it.
- **Solo:** reopening the page offers "Continue run".
- **A guest who reloads** rejoins the room while the party goes on.
- **A host who reloads** reopens the room with the same state. Exactly how guests find it again is still an open question.

## Sample run

A solo run at tier 1, on a map where nothing has been found in the fog yet. It starts at the camp with 100 life, a 2-charge flask and 20 gold. The boss rolled is Silent (only Flares work), and knowing that from the camp on shapes every purchase.

1. **Camp.** She buys 3 Flares (6), 3 Scrolls of Wisdom (6) and 3 Word lengths (4). Gold: 4.
2. **Step 1,** Freythorn (Plain). The free clue is a common mod line, "(3-6) Life Regeneration per second", which 22 items share.
   - The Inscription holds about 14 tiles.
   - She builds bl / ack / he / art without using a supply. Right: 2 loot cards, 6 gold and 2 Decoy sweeps, and she takes both. Gold: 10.
3. **Step 2, the Ogham Farmlands (Incursion).** The free flavor text reads "There is no safer place / Than the ▮▮▮ of the ▮▮▮". She builds bram / ble / jack. Wrong: 25 life gone (75), the drop loses a card, and bram, ble and jack are all struck.
   - She uses a Flare. The small burn-in is enough next to the flavor text, and she builds bel / ly / of / the / b / east. Right: 1 card, 5 gold. Gold: 15.
   - **Boon pick** after her second zone: Lamplighter (an extra burn-in on every item), because the Silent boss is all art.
4. **Step 3 and the town at step 4.** Three items, one miss (50 life), and the Scroll used on one of them. Gold: 29.
   - The town heals her to 70. She buys 6 Flares (12) and a Base reveal (6). A Bigger pack (20) would have left her nothing for supplies. Gold: 11.
5. **Steps 5 to 15.** The Inscriptions grow to about 26 tiles, and two more towns restock her.
   - She drinks a charge before a Blight stretch she fears, but not before the towns, since each heals 20 anyway. She refills at the Well at step 10.
   - She routes through Blight zones for their free burn-in, which is practice for the art-only boss. At step 6 she catches a corruption front at the Buried Shrines. It flips to Blood toll, and the 30 life it costs her stops a front that would have fed the boss. A second front, on the far branch, stays out of reach.
   - Her 8-slot pack is full at the third town, so she leaves the Decoy sweeps behind to fit more Flares.
   - She arrives with 70 life, 2 charges and 8 Flares, and drinks one charge on the first boss item: 10 at once and 10 after each of the first two.
6. **Boss, Silent.** The surviving front gives it Bloodied: misses cost 10 more life. Three items, and Flares are the only supply that works.
   - Item 1: she wins on the boss's free burn-in plus Lamplighter's.
   - Item 2: 3 Flares.
   - Item 3: Flares burn in half as much here. She burns 5 Flares and misses once (70 + 30 from the flask − 70 = 30 life) before Atziri's Disdain reads true.
   - Run won, tier 2 unlocked.

What made it a run and not a quiz:

- knowing the boss in advance decided what she bought at the camp and in every town;
- drinking before hard stretches and letting towns heal the rest kept a charge for the boss;
- the 8-slot pack forced a choice between Flares for the boss and Decoy sweeps for the zones.

## Build order

Build it in five milestones, each released to the beta and passing its gate before the next one starts. The first milestone is the cheapest test of the riskiest idea. If the clue gamble doesn't hold up there, no map or boon list will save it.

1. **Zone prototype (solo):** Inscription, Veil, life, flask, supplies, loot; scripts for syllables.json and clues.json with tests; a test run on the beta. *Gate: the gamble lives* (under half of items solved without a supply; building is fun on a phone).
2. **Map and route:** map art and wraeclast.json (steps, branching, fog); zone types, corruption, towns and Wells; one boss with its rule; a full run start to finish. *Gate: a full run works* (experts need 15 min or more; regulars win about half at tier 1).
3. **Run depth:** boons, events and special cards; resume a run after a reload; supply prices tuned from milestones 1 and 2. *Gate: runs feel different* (players start another run right after finishing one).
4. **Co-op:** free-for-all strikes on one shared item; Delve's card vote for route, boons and events; own life, flask and pack; revive at 1 life. *Gate: a stream test* (about 10 viewers finish a run without one player running it).
5. **Progression:** five tiers, persistent fog, shortcuts; hidden zone types (Delirium and others); boon unlocks brought home by a win. *Gate: players come back* (players return within a week of their first run).

Milestones 1 and 2 already make a playable mode. Each later milestone adds depth to something players can already enjoy.

## Open questions and playtest measures

The biggest unknown is whether experts can answer from the free clue too often. The first playtest has to measure that before anything else is tuned.

Playtest 3 should also measure how many corruption fronts players stop, which hidden modifiers they meet and what those cost them, how many boss modifiers runs end up with, and how often a wrong answer is followed by a right one on the next try (the Wordle marks doing too much). It should also check what the leak hunt of Oct 19 flagged on paper: whether Decoy sweeps strip boards down to the answer, how much gold is left at the end (the pack, not gold, may be the real limit), which zone types routes pick, and whether every corrupted zone in reach gets taken.

**Measure in every playtest**

| Measure | Why | Starting target |
| --- | --- | --- |
| Items answered without using a supply | Shows whether the clue gamble is alive | Under half, even for regulars |
| Supplies used per type, and accuracy after each | Sets supply prices | Every supply bought sometimes |
| Time per item | Pacing without a clock | 20 to 60 s |
| Run length | Fits a stream segment | 15 min for experts, 20 to 25 for most |
| Win rate at tier 1 | Difficulty | About half for regulars |
| Runs started right after a finished one | Pull to replay | Rising over the milestones |

**Open questions**

- [ ] Does the illustrated map show about 40 named places, including towns at the right distances? If it shows fewer, the run gets fewer steps or fewer branches, rather than invented places.
- [x] Do about 32 tiles fit a 375 px phone with the Veil and the clues? Answered by the design session: at 375 x 812, yes, up to 40. At 375 x 667 only with a compact layout below 700 px tall, so the board is capped at 36 tiles for everyone, with no rule that depends on the device.
- [ ] Do the Wordle marks make guessing too cheap a clue? If players guess their way through instead of buying supplies, misses cost more life or mark only gold, not silver.
- [ ] How do guests find a co-op room again after the host reloads?
- [ ] The mode's name, the boss names, and the source of the map art.
- [ ] Does the co-op race leave phone players without strikes? Track strikes per player by device.
- [ ] Does using a cheap supply just to earn a pick pay off? If so, only a supply that reveals something new earns one.
- [ ] Is +10% miss damage per extra player enough to keep party win rates close to solo, given revives?
