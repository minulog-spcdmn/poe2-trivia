# Wraeclast run: prototype v5, the first playable of the redesign

For the prototype session, on branch `claude/wraeclast-prototype-v5` (from
`391a0926`, v4e plus run logs). Settled design: `design-v7-brief.md`,
`design-v8-town.md`, `design-v6-options.md` sections 1, 2 and 6. Every
number here is a default: put it in `DEFAULT_TUNING` for the tuning panel.
Early prototype: keep the type check, skip the tests this breaks, write no
new tests, benches or bots. The run log also records boons held and fired,
each zone's depth and mod, the spread, and the duel's two lines each item.

## A run in one paragraph

Start at Clearfell Encampment with 100 life and 20 gold; take 1 of 3 boons
and buy supplies. Enter zones on an open map, one item each, for gold; each
spreads the Seed of Corruption one ring and makes it stronger. Two more towns
offer a boon, heal and sell. The lair is open from the start: go in when you
think you'll win the duel. About 6 zones and a duel: about 10 minutes.

## The open region

Fourteen places from `src/data/wraeclast.json` at their real spots, scaled
to these 14 places' bounding box with an inset so labels fit at 375 px. The
region (ids, kinds, links) is a constant in `map.ts`; the JSON stays as is.

| Place | Kind | Next to | Ring |
| --- | --- | --- | --- |
| Clearfell Encampment | camp (a town) | The Red Vale, Maraketh, The Halani Gates | 4 |
| The Red Vale | zone | Clearfell Encampment, Kaom's Stronghold | 5 |
| Maraketh | zone | Clearfell Encampment, The Halani Gates | 4 |
| Kaom's Stronghold | zone | The Red Vale, The Library, Kriar Village | 4 |
| The Halani Gates | zone | Clearfell Encampment, Maraketh, Ziggurat Encampment, The Fellshrine Ruins | 3 |
| The Library | zone | Kaom's Stronghold, Ziggurat Encampment, Kriar Village, The Weaver's Chambers | 3 |
| Kriar Village | zone | Kaom's Stronghold, The Library, The Weaver's Chambers, The Karui Fortress | 3 |
| Ziggurat Encampment | town | The Halani Gates, The Library, The Fellshrine Ruins, The Weaver's Chambers, The Forest Encampment | 2 |
| The Fellshrine Ruins | zone | The Halani Gates, Ziggurat Encampment, Heart of the Tribe | 2 |
| The Weaver's Chambers | zone | The Library, Ziggurat Encampment, Kriar Village, The Forest Encampment, The Karui Fortress | 2 |
| The Karui Fortress | zone | Kriar Village, The Weaver's Chambers, The Forest Encampment | 2 |
| The Forest Encampment | town | Ziggurat Encampment, The Weaver's Chambers, The Karui Fortress, The Cathedral Rooftop | 1 |
| Heart of the Tribe | zone | The Fellshrine Ruins, The Cathedral Rooftop | 1 |
| The Cathedral Rooftop | the lair | Heart of the Tribe, The Forest Encampment | 0 |

Links: the Gabriel graph of the real spots (none cross). Ring: links from the lair.

- **Moving.** You can enter any place linked to one you've cleared. The camp
  counts as cleared from the start. A zone is cleared when its item is named;
  a town when you first enter it. You never "walk": the whole frontier is
  open at once. The lair can be entered at any time, linked or not.
- **Towns** are the three real towns on the map: Clearfell Encampment (the
  camp), Ziggurat Encampment and The Forest Encampment. Entering a town costs
  no spread. A town can be entered again for its shop only.
- **The spread.** Each zone you enter moves the corruption one ring out from
  the lair: after n zones, every place at ring n or less is corrupted. It
  lands when the zone's item is named (a zone can't be left before that), so
  Hare Foot can cancel it. Cleared places and towns never corrupt. The spread
  keeps counting after the map is all red, since it also feeds the Seed.
- **On the map.** Corrupted places show red veins; places the next zone will
  corrupt show a red outline; the lair is a heart that grows with each ring.
  When the spread moves, the map shows it once, then settles (as v4c does).
- **A tap on a place** shows one line and an Enter button:
  - zone: `Obscure • Monsters deal extra damage • 18 gold`;
  - town, first time: `Town • heals 25 • a boon • the shop`; later: `Town • the shop`;
  - lair: `The Seed • 70 life • hits 8`.
- **The footer** always shows the duel's two lines, in Cinzel:
  `The Seed • 70 life • hits 8` and `You • 82 life • a bare answer hits 20`.

## A zone

- **One item.** Its board is v4e's mid board (20 tiles, 2 to 3 decoy names,
  the look-alike walk). The art starts fully under the Veil. There is no free
  clue: what you see is the tiles, plus whatever supplies you use.
- **Depth.** At run start each zone rolls Known (40%), Obscure (35%) or
  Forgotten (25%); the camp's neighbours never roll Forgotten. Its item is
  drawn from that depth, never one already seen this run.
- **The depth measure.** A script, `scripts/wraeclast-depth.mjs`, reads how
  many trade listings poe.ninja's PoE2 economy pages show for each unique
  (their own JSON, current league), and writes `src/data/wraeclastDepth.json`
  (id to `known`, `obscure` or `forgotten`). Within each of the 10 categories,
  the most listed 30% are Known, the next 40% Obscure, the rest Forgotten, so
  every depth holds every kind of item. An item poe.ninja doesn't list is
  Forgotten. Generated, never hand-edited. If poe.ninja can't be read from
  where you run it, say so in the PR and don't guess another source.
- **Waystone mods.** At run start a zone rolls one mod at 1 in 3. Corruption
  makes a zone one depth deeper (Forgotten stays Forgotten) and gives it a
  mod if it has none. At most one mod a zone:

| Mod (as on a waystone) | In the zone | Extra gold |
| --- | --- | --- |
| Monsters deal extra damage | A miss costs 10 more | +6 |
| Players have less recovery | The next town's heal doesn't happen | +6 |
| Area is inhabited by more monsters | 1 more decoy name on the board | +6 |
| Monsters are armoured | No supply until your first submit | +6 |

- **Gold, paid by depth** when the item is named: Known 8, Obscure 12,
  Forgotten 16, plus the mod's 6. Misses don't lower it. Zones pay nothing
  else: no loot cards, no supplies, no flask.
- **Named:** a short reveal (the item, the gold, any boon that fired, as one
  line each), the spread lands, back to the map.

## The four supplies

All bought with gold, at towns only. They show what v4e shows:

| Supply | Shows | Price |
| --- | --- | --- |
| Torch | Burns in 12 patches of the Veiled art. Usable until the art is all shown | 10 |
| Golden Page | The flavour text. Once an item; greyed when the item has none | 8 |
| Ancient Orb | Another item of the same category by name, as a clue line, its tiles kept off the board. Once an item; greyed when there's none | 8 |
| Scroll of Wisdom | The next mod line, the most shared first, name words masked. Usable until the lines run out | 8 |

The pack holds any number of each (no stacks, no cap, no keep or leave).
"Used on an item" means used at least once on it; the kinds used decide your
hit at the duel and which boons fire.

## Life, misses and healing

- 100 life, also the most you can have. At 0 the run ends.
- A miss in a zone costs life by depth: Known 15, Obscure 20, Forgotten 25
  (10 more under "Monsters deal extra damage"). You keep trying until the
  item is named; the line is marked as v4e marks it, and the same line never
  costs twice.
- A miss at the duel costs 10 (see the duel).
- Healing: each town heals 25 the first time you enter it (the camp doesn't).
  Some boons heal. Nothing else does: no flask, no Wells.

## The town

Entering a town for the first time: the heal (if any), then the boon draft,
then the shop, then Leave. Later visits: the shop only. One decision per
screen, as in `design-v8-town.md`.

**The draft.** Three boon cards in the usual card look, each a name and one
line. Take one or pass; the other two are gone. Boons sit as seals in the
header; a tap opens a sheet with one line each. The hold is 4; with three
towns a run can't reach it, so the swap isn't built in v5.

**Which cards.** Never a boon you hold, no card twice.
- The camp: 3 singles at random.
- Later towns: one single that names a supply a held boon names (or no
  supply, if you hold a no-supply boon); one qualifying Duo if there is one,
  else a single at random; one single at random. The rule is never shown.
- A Duo qualifies once you hold boons naming both its supplies.

**Single boons** (from v8, as written). "Only the Torch" means a Torch was
used on the item and no other supply; "no supply" means none at all.

| Boon | Names | Does |
| --- | --- | --- |
| Ornate Dagger | Torch | An item you name with only the Torch hits the Seed double |
| Balbala's Gift | Torch | Your first Torch at each town is free (each visit) |
| Honoured Challenger | Golden Page | An item you name with only the Golden Page heals 15 |
| Raincaller | Golden Page | An item you name with only the Golden Page pays double gold |
| Sanguine Vial | Ancient Orb | Each item you name with only the Ancient Orb takes 5 off the Seed's life |
| Hare Foot | Ancient Orb | A zone whose item you name with only the Ancient Orb doesn't advance the spread |
| Fright Mask | Scroll of Wisdom | Each item you name with only the Scroll makes the Seed hit 1 less for the rest of the run, never below 1 |
| Sacred Mirror | Scroll of Wisdom | Every Scroll of Wisdom you buy comes as two |
| Assassin's Blade | none | An item you name with no supply hits the Seed double |
| Upward Path | none | Each item in a row you name with no supply pays 5 more gold than the last; buying a supply ends the streak |
| Silver Tongue | none | The supplies your boons name cost half, rounded up |

**Duo boons** (real Trial of the Sekhemas boons, doing close to what they do
in the trial):

| Duo | Names | Does | In the trial |
| --- | --- | --- | --- |
| Moment's Peace | Torch and Golden Page | On an item where you've used a Torch and a Golden Page, misses cost no life | Can't be damaged until the next room is done |
| Earned Honour | Golden Page and Scroll of Wisdom | An item you name with only those two, both used, heals 30 | Restores Honour as a room is done |
| Sekhema's Cloak | Torch and Ancient Orb | Once a run, a miss that would end the run on an item where you've used a Torch and an Ancient Orb leaves you at full life | Revive once at full Honour |

Each boon that fires says so on the reveal in one line
(`Ornate Dagger • hit 24`). Boons fire in zones and at the duel alike, except
the gold ones (no gold at the duel) and Hare Foot (no spread at the duel).

**The shop.** The four supplies at the prices above, bought one at a time,
gold shown. Balbala's Gift, Silver Tongue and Sacred Mirror apply here.

## The duel at the lair

- **The Seed's line.** 30 life and a hit of 5 at the start. Each zone that
  advances the spread adds 8 life, and every second one adds 1 to its hit.
  Sanguine Vial takes life off it (never below 1) and Fright Mask lowers its
  hit, both shown in the footer as they happen.
- **Each item:** the Seed hits you as the item opens. The board is v4e's boss
  board (32 tiles, 4 to 5 decoy names); items from any depth, never one seen
  this run. Supplies from your pack work as in a zone.
- **One submit an item.** Right: you hit the Seed for 20 with no supply, 12
  with one kind of supply, 6 with two or more kinds, doubled by Ornate Dagger
  or Assassin's Blade where they fire. Wrong: 10 life, and the answer is shown.
  Either way the next item opens.
- **The end:** the Seed at 0 wins at once; you at 0 lose. v4e's end screen, plus boons held.
- **How the run feeds it:** the spread feeds the Seed's line; your life,
  your supplies and your boons feed yours. Nothing else does.

## What goes from v4e

- The linear route: steps, rows, "Where next", the 32-node map.
- Corruption fronts, their seeding and creep, Blood toll, double loot, and
  every boss rule they carried (Blind, Mirrored, Murky, Lingering, Teeming,
  Bloodied and the rest) with the boss chain of 3 items.
- Zone types (Plain, Incursion, Essence, Ritual, Expedition, Blight), their
  free clues, their decoy rules and the Expedition's trader.
- Sections (early, mid, late) as the source of miss costs, gold and boards.
- Supplies not in the four: Base reveal, Tangled Fossil, Word lengths, First
  syllable, Stacked Deck. The pack's stacks, cap and keep or leave screen.
- Loot cards, supplies and flask charges as loot; the flask; Wells.
- Pledges, afflictions, bets and stakes (never built: don't build them).
- 2 items a zone.

Kept: the item screen (Inscription, the Veil, the marks, the fused answer
line and break key), the look-alike decoy walk, the run log and its summary
script, the tuning panel.

## Defaults to check in the playtest

- Spread one ring per zone: the map is all corrupted after 5 zones.
- Seed 30 life, hits 5, +8 life a zone, +1 hit every second zone.
- Hits 20, 12, 6; zone misses 15, 20, 25; duel misses 10; towns heal 25.
- Gold: start 20, pays 8, 12, 16 (+6 a mod); Torch 10, the others 8.
- Depth: listings split 30, 40, 30; zones roll 40, 35, 25 percent.
- Draft: one card fits, a Duo always shows once it qualifies.
