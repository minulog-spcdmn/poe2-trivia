# Wraeclast run: item names for the six supplies (second pass)

The rule (owner, Oct 19): a supply is named after a PoE1 or PoE2 item you can pick up or buy, carry and use up. It must do in PoE what the supply does here, or very nearly. Never an NPC, an action or a league mechanic. One name means one thing across poe2.quest.

This replaces the picks in `supply-names.md`. Its NPC and mechanic picks (Gwennen, Interrogation, Blueprint Reveal, Siosa, Jun, Renly) are out. Scroll of Wisdom and Golden Page are settled and not covered here.

Sources: poedb.tw (PoE1), poe2db.tw (PoE2), maxroll.gg and poe-vault.com. The wikis block bots. Every source listed is a page I opened; where I couldn't confirm something, I say so.

"Stretch" means how far the PoE job is from the supply's job: small, medium or large.

---

## Part 1. Per supply

### 1. Flare (working name): burns in about a sixth of the veiled art at a random spot, for the rest of the item

Only one PoE item lights part of a dark area, and that is Delve's Flare, which poe2.quest's Delve already uses. What's left are items that uncover a hidden region, or reveal one random thing from a hidden set.

| Item | What it is and does in PoE | Why it fits | Stretch | Source |
|---|---|---|---|---|
| **Expedition Logbook** (PoE2) • top pick | PoE2 currency, stacks to 10. "Reveals an Ocean Biome on the Atlas." You use it at an ocean node and a hidden part of the Atlas opens for good. | You spend it, and a hidden part of the map becomes visible and stays visible. Here a hidden part of the art becomes visible and stays. | Medium. You pick the edge in PoE; here the spot is random. It opens a big region, not a small patch, and its main job is to open Grand Expeditions. In PoE1 the Logbook is a different thing: "Take this item to Dannig in your Hideout to open portals to an expedition." And it shares the word "Expedition" with this mode's Expedition zone. | https://poe2db.tw/us/Expedition_Logbook ; https://maxroll.gg/poe2/resources/expedition ; https://poedb.tw/us/Expedition_Logbook |
| **Veiled Scarab** (PoE1) | Currency. "A collection of unknown Scarabs." "Right Click to reveal a random Scarab." | "Veiled" is this mode's own word for the covered art, and "reveal a random" is the supply's random spot. | Large. It reveals one whole random item from a hidden set, not part of a picture. It reads better as a mystery pack (Part 2). | https://poedb.tw/us/Veiled_Scarab |
| **Stacked Deck** (PoE1) | Currency, stacks to 20. "A stack of unknown divination cards." "Right click to take a divination card out of the deck." | You draw at random and see a picture. | Large. You see a whole random card, not a piece of the art you are looking at. It fits a random-clue supply better (Part 2). | https://poedb.tw/us/Stacked_Deck |

Rejected:
- **Scrying Orb** (PoE1). The name sounds like seeing, but it "Scries a Map on your Atlas", which swaps the map's divination card pool for another area's. It reveals nothing. (https://poedb.tw/us/Scrying_Orb ; https://poedb.tw/us/Map_Scrying)
- **Dynamite** (Delve). poe2.quest's Delve uses it to swap a question (`ITEM_TIPS`, `src/lib/difficultyText.ts`).
- **Atlas towers** (PoE2) reveal fog around them, but a tower is a map node, not an item, and its Precursor Tablet adds map mods. (Search results only; not opened.)

Verdict: no item does this honestly. Expedition Logbook is the closest; the cost is the "Expedition" word and its PoE1 meaning. Keeping a working name (for example "Burn-in") is a fair answer.

### 2. Category reveal: shows the item's category, such as Rings

Nothing in PoE reveals an item's class, because it is never hidden. One item does name a class as its whole effect, but it changes the item rather than showing anything.

| Item | What it is and does in PoE | Why it fits | Stretch | Source |
|---|---|---|---|---|
| **Ancient Orb** (PoE1) • top pick, with a design change | Currency. "Reforges a unique equipment as another of the same item class." It drops as shards from Harbinger and still trades. | Its effect is "another unique of the same class". If this supply showed you another unique of the same category (its name, or its art) instead of the word "Rings", it would do what the orb does: hand you a different unique of the same class. | As the supply stands: large, since the orb shows nothing. With the change: small. **Design change for the owner**: the clue becomes a sibling unique, so the player must know that sibling's class. That is more trivia, not less (principle 1). | https://poedb.tw/us/Ancient_Orb |
| **Omen of the Ancients** (PoE2) | Omen. "Your next Orb of Chance will upgrade the Item to a random Unique of the same Item Class." | The PoE2 form of the same idea: "a random Unique of the same Item Class". | Large. It needs an Orb of Chance, and it steers a craft; it shows nothing. A PoE2 player reads it as a Chance omen. | https://poe2db.tw/us/Omen |

Rejected:
- **Blacksmith's Whetstone, Armourer's Scrap, Arcanist's Etcher, Glassblower's Bauble, Gemcutter's Prism.** Each works only on one kind of item, so it implies a category, but it improves quality and reveals nothing. (https://poe2db.tw/us/Stackable_Currency)
- **Strongbox names** stay rejected (see `supply-names.md`; Strongbox is also this mode's event).

Verdict: with no change, keep the working name. With the design change, Ancient Orb fits well.

### 3. Base reveal: shows the item's base type (expensive; expert trivia)

Nothing in PoE reveals a base type, because it is always visible. In PoE the base is what an unidentified unique shows before the Scroll of Wisdom names it; the matching "item" is the unidentified drop itself, not a tool.

| Item | What it is and does in PoE | Why it fits | Stretch | Source |
|---|---|---|---|---|
| **Orb of Chance** | PoE1 and PoE2 currency. PoE2: "Unpredictably either upgrades a Normal item to Unique rarity or destroys it." | Chancing uses this supply's exact knowledge: which uniques a base can become. | Large. It turns a base into a unique; it shows nothing. Using it here reuses a currency for a different job, which is on the rejected list. | https://poe2db.tw/us/Orb_of_Chance |
| **Valdo's Puzzle Box** (PoE1) | Currency. "Contains a Mysterious Map with a Foil Unique Reward." | A hidden unique you learn about bit by bit. | Large. It gives a map; it doesn't show a base. Listed only to say it was checked. | https://poedb.tw/us/Valdos_Puzzle_Box |

I also tried the Ancient Orb trick from Category reveal (show another unique of the same base). It fails: for about 73% of uniques, the item is the only unique of its base in its category (`design-doc.md`), so there is no sibling to show.

Verdict: **no item fits. Keep the working name.**

### 4. Decoy sweep: strikes 4 decoy syllable tiles off the board

| Item | What it is and does in PoE | Why it fits | Stretch | Source |
|---|---|---|---|---|
| **Tangled Fossil** (PoE1) • top pick | Delve fossil, stacks to 10, traded. "Makes a random modifier type much more likely and prevents another random modifier type." "Effects revealed once resonator is fully socketed." Every fossil rules out part of the pool before you craft, for example Frigid Fossil: "More Cold modifiers", "No Fire modifiers". | A fossil takes outcomes you don't want out of the pool. The sweep takes tiles that can't be right off the board. Tangled's ban is random, as the sweep's pick of decoys is. | Medium. A fossil narrows a craft's pool; it doesn't strike wrong guesses. Its "more likely" half has nothing to match here. PoE1 only (fossils aren't in PoE2). It is a Delve item, but poe2.quest's Delve doesn't use fossils, so there's no clash. | https://poedb.tw/us/Tangled_Fossil ; https://poedb.tw/us/Fossil |
| **Omen of Light** (PoE2) | Omen. "Your next Orb of Annulment will remove only Desecrated modifiers." | It removes only the foreign mods, which is what a decoy is: a syllable from another item. | Large. It needs an Annulment, and it works on an item's mods, not on a board of guesses. "Light" is also a word in a real unique (Threaded Light). | https://poe2db.tw/us/Omen |
| **Orb of Scouring** (PoE1) | Currency. "Removes all modifiers from an item." | It clears an item. | Large, and it only fits with a change that would break the item: striking every decoy leaves only the answer's tiles. Not recommended. | https://poedb.tw/us/Stackable_Currency |

Optional **design change** that makes a fossil fit closely: the sweep strikes every decoy taken from one other item name, like a fossil's "No Fire modifiers" bans one whole group. The struck count would then vary with that name's length; it says nothing about the answer, but the owner should judge it against principle 3.

Rejected:
- **Orb of Annulment**: "Removes a random modifier from an item". It removes a real mod; the sweep only removes wrong tiles. (https://poe2db.tw/us/Stackable_Currency)
- **Omen of Whittling** (PoE2): "your next Chaos Orb will remove the lowest level modifier". It removes the weakest real mod, not a wrong one. (https://poe2db.tw/us/Omen)

Verdict: Tangled Fossil, a fair fit with no change.

### 5. Word lengths: how many words the name has, and how many tiles each word takes

Nothing in PoE reveals the shape of a hidden name. The nearest picture in PoE is an item's sockets: so many sockets, in linked groups, like so many tiles in words.

| Item | What it is and does in PoE | Why it fits | Stretch | Source |
|---|---|---|---|---|
| **Orb of Fusing** (PoE1) • top pick, still a stretch | Currency. "Reforges the links between sockets on an item." | A PoE1 player reads sockets as groups ("a 4-link and a 2-link"), which is the same shape as words and the tiles in each. | Large. It rerolls the links; it doesn't reveal them. PoE1 only. And this mode's answer line already "fuses" every build into one word, with a break key for gaps (`decisions.md`, Oct 19); a supply called Fusing that shows the gaps reads backwards. | https://poedb.tw/us/Orb_of_Fusing |
| **Jeweller's Orb** (PoE1) | Currency. "Reforges the number of sockets on an item." | Number of sockets, like number of tiles. | Large, for the same reason, and it covers only the count, not the groups. | https://poedb.tw/us/Stackable_Currency |
| **Blueprint** (Heist, PoE1) | An item you carry and use up. Its text counts "Wings Revealed: 0/1" and "Reward Rooms Revealed: 0/1"; at first "only one wing is revealed". | It shows a plan in parts before you go in. | Large. It is the whole heist, and its reveals are bought from rogues. "Doryani's Blueprint" is a fake item name in poe2.quest. | https://poedb.tw/us/Blueprints |

Rejected:
- **Chronicle of Atzoatl.** A search snippet from the wiki says right-clicking it "shows the temple layout"; I couldn't open the wiki to confirm. Even so it opens the temple, and its layout is rooms, not a count. (https://poedb.tw/us/Chronicle_of_Atzoatl)

Verdict: **keep the working name.** Orb of Fusing only if the owner likes the sockets picture; mind the clash with the fused answer line.

### 6. First syllable: places the name's first tile on the answer line (locked, gold)

| Item | What it is and does in PoE | Why it fits | Stretch | Source |
|---|---|---|---|---|
| **Orb of Transmutation** • top pick | PoE1 and PoE2 currency, the cheapest orb. PoE2: "Upgrades a Normal item to a Magic item with 1 modifier." | It puts the first piece onto a blank item. The supply puts the first piece onto a blank answer line. | Medium. The orb's mod is new and random; the supply's tile is the true first one. It doesn't lock anything. Note: Delve has a flavor line "Transmute fear into light" (`src/lib/delveStart.ts`); it's not an item, so no clash. | https://poe2db.tw/us/Orb_of_Transmutation |
| **Fracturing Orb** | PoE1 and PoE2 currency. "Fracture a random modifier on a rare item with at least 4 modifiers, locking it in place." | The supply's tile is locked; a fractured mod is a true part of the item that nothing can move. | Medium to large. It locks a random mod, not the first, and the mod was already visible. "Fractured Empyrean" is a fake item name. | https://poe2db.tw/us/Stackable_Currency |
| **Scroll Fragment** (PoE1) | Currency. "A stack of 5 fragments becomes a Scroll of Wisdom." In PoE2 the item exists in the data but poe2db lists it as "Not in game". | A fifth of an identification: a piece of the name. It sits beside the Scroll of Wisdom on the shelf. | Large. A fragment does nothing alone. And this mode's Scroll shows mod lines, not the name, so the "piece of the Scroll" logic doesn't hold. | https://poedb.tw/us/Scroll_Fragment ; https://poe2db.tw/us/Scroll_Fragment |

Rejected:
- **Essences.** "Upgrades a Magic item to a Rare item, adding a guaranteed modifier": a known piece set for sure, a close fit. But Essence is this mode's zone type (its free clue is the base type), so one name would mean two things. (https://poe2db.tw/us/Stackable_Currency)
- **Omen of Sinistral Exaltation**: a prefix pun, still rejected (see `supply-names.md`).
- **Hinekora's Lock**: foresight, not placing, and "Hinekora's Sight" is a real unique (see Part 2).

Verdict: Orb of Transmutation, a fair stretch. Keep the working name if "first piece on a blank" isn't close enough.

---

## Part 2. The other way round: PoE items that reveal, identify, remove, narrow or lock

Every item I found whose use reveals, uncovers, removes, narrows down or locks something, and the supply it could name. **Design change** marks a fit that only works if the supply changes; that is the owner's call.

| Item (game) | What it does in PoE | Could name | Fit |
|---|---|---|---|
| Scroll of Wisdom (both) | "Identifies an item" | Scroll of Wisdom | Settled |
| Expedition Logbook (PoE2) | "Reveals an Ocean Biome on the Atlas" | Flare | Medium stretch, no change; "Expedition" word shared with a zone |
| Veiled Scarab (PoE1) | "A collection of unknown Scarabs"; "reveal a random Scarab" | A mystery supply stack | **Design change**: a cheap shop ware that turns into a random supply when used. Fits the item exactly. Mind principle 5 and the rejected "bolt-on gamba" list; the owner may see it as a gimmick |
| Stacked Deck (PoE1) | "A stack of unknown divination cards"; take one out at random | A random-clue supply | **Design change**: a cheap supply that shows one random clue the item hasn't shown yet (a mod line, the flavor, the category, word lengths, a burn-in). Fits the item exactly: draw one unknown card |
| Desecration bones (PoE2), e.g. Gnawed Jawbone | A bone "adds an Unrevealed Desecrated Modifier"; at the Well of Souls you reveal it and pick "one of three modifiers" | Base or Category reveal as a pick of three | **Design change**: the supply shows three bases (or categories), one of them right. No clean name, though: the bone adds a hidden mod, and the revealing is done at the Well of Souls, a place, while "Well" is already this mode's node. Not recommended as a name |
| Omen of Abyssal Echoes (PoE2) | "the next time you reveal Desecrated modifiers you can reroll the options once" | Nothing today | Only with the pick-of-three change above, as a reroll. Not recommended |
| Hinekora's Lock (both) | "Allows an item to foresee the result of the next Currency item used on it" | A "test a build" supply | **Design change**: one submit shows its marks without costing life. Fits foresight well. But "Hinekora's Sight" is a real unique in `items.json` with "Hinekora's Glimpse" and "Hinekora's Veil" as fakes, so the name sits next to an answer. Not recommended |
| Ancient Orb (PoE1) | "Reforges a unique equipment as another of the same item class" | Category reveal | **Design change**: show a sibling unique of the same category instead of the word. Small stretch after the change |
| Omen of the Ancients (PoE2) | Next Orb of Chance gives "a random Unique of the same Item Class" | Category reveal | Same change; weaker, as it needs Chance |
| Tangled Fossil and other fossils (PoE1) | "prevents another random modifier type"; "No Fire modifiers" and so on | Decoy sweep | Medium stretch, no change. Optional **design change**: strike all decoys from one other name |
| Orb of Annulment (both) | "Removes a random modifier from an item" | Nothing | It removes a real piece; a sweep that could strike the answer's own tiles would be wrong. Rejected |
| Omen of Light (PoE2) | Next Annulment removes "only Desecrated modifiers" | Decoy sweep | Large stretch; needs Annulment |
| Omen of Whittling (PoE2) | Next Chaos Orb removes "the lowest level modifier" | Nothing | Removes the weakest real mod. Rejected |
| Omen of Sinistral / Dextral Annulment, Erasure (PoE2) | Next Annulment or Chaos removes only prefixes or only suffixes | Nothing | They narrow which mod goes, not which guess is wrong. Rejected |
| Orb of Scouring (PoE1) | "Removes all modifiers from an item" | Decoy sweep | Only as "strike every decoy", which gives the answer away. Rejected |
| Orb of Dominance (PoE1) | "Removes one Influenced Modifier" from an item with two or more | Nothing | Rejected |
| Kishara's Ducat (PoE1, Allflame) | "Splits an item into many ghostly forms, each retaining a single random modifier" | Scroll of Wisdom's job | Taken by the Scroll. Could name a "one random mod line" supply if the Scroll ever changed. No change needed now |
| Fracturing Orb, Fractured Fossil (both / PoE1) | Fractures a random mod, "locking it in place" | First syllable | Medium to large stretch, no change |
| Orb of Transmutation (both) | Gives a Normal item its first modifier | First syllable | Medium stretch, no change |
| Essences (both) | Adds "a guaranteed modifier" | First syllable | Close, but Essence is a zone type here. Rejected for the collision |
| Scroll Fragment (PoE1) | Five make a Scroll of Wisdom | First syllable | Large stretch |
| Orb of Fusing, Jeweller's Orb (PoE1) | Reforge links, or the number of sockets | Word lengths | Large stretch; Fusing clashes with the fused answer line |
| Blueprint (Heist, PoE1) | Counts wings and reward rooms revealed | Word lengths | Large stretch |
| Treasure Key (PoE1, Labyrinth) | "Treasure Keys are used to open Treasure Chests at the end of the Labyrinth" | No supply | It unlocks loot. If the Strongbox event ever needed a key, this is the item. Out of scope |
| Scrying Orb (PoE1) | Swaps a map's divination card pool | Nothing | Sounds like a reveal, isn't. Rejected |
| Omen of Secret Compartments (PoE2) | "the next Strongbox you click on will be reopenable" | No supply | Only an event idea for the Strongbox. Out of scope |
| Enshrouding Crystals (PoE1, Legion) | Enshroud a unique so it can later turn into "another Unique of the same item class" | Nothing | A transform, not a reveal. Rejected (https://poedb.tw/us/Enshrouded_Item) |
| Delve Flare (PoE1) | A short light thrown into the dark | Flare | Taken by poe2.quest's Delve |

What Part 2 shows: PoE's reveal items are mostly about **random draws from a hidden set** (Stacked Deck, Veiled Scarab), **foresight** (Hinekora's Lock) and **picks among offered options** (Desecration). None of the six supplies works that way today. The two clean fits after a change are Stacked Deck as a random-clue supply and Ancient Orb as a sibling-unique category clue.

---

## Collision check

I matched each candidate's words as whole words against every name, base, group and category in `src/data/items.json` (501 items) and every name in `src/data/fakes.json`, and grepped `src/` for each name.

- No candidate is an item or fake name.
- Near misses:
  - **Stacked Deck**: "Stacked Sabatons" is a base.
  - **Veiled Scarab**: "Veiled Mask" is a base, and "veil" is this mode's word for the covered art (a plus for reading, a minus for one word one thing).
  - **Fracturing Orb**: "Fractured Empyrean" is a fake.
  - **Omen of Light / Omen of the Ancients**: "Threaded Light" is a real unique and "Woven Light" a fake; "Uhtred's Omen" is a real gem, "Omen Sceptre" and "Omen Crest Shield" are bases.
  - **Ancient Orb**: "Ancient Visor", "Ancient Leggings" and "Ancient Mail" are bases.
  - **Blueprint**: "Doryani's Blueprint" is a fake.
  - **Hinekora's Lock**: "Hinekora's Sight" is a real unique; "Hinekora's Glimpse" and "Hinekora's Veil" are fakes.
- In `src/`: Dynamite and Flare are Delve's. "Transmute fear into light" is a Delve flavor line, not an item. Fossil, Resonator, Logbook, Scarab, Deck (only an internal variable), Fusing, Ancient Orb and Tangled appear nowhere a player sees.
- In this mode's own words: **Essence** and **Expedition** are zone types, **Well** and **Strongbox** are nodes, and the answer line "fuses" builds.

---

## Summary

| Supply | Top item pick | How honest the fit is | Design change needed |
|---|---|---|---|
| Flare | Expedition Logbook (PoE2) | Fair at best. It reveals a hidden part of the map for good, but you pick the spot, and it shares "Expedition" with a zone. A working name is a fair answer | No |
| Category reveal | Ancient Orb (PoE1) | Good after the change: the clue becomes another unique of the same category. Without it, nothing fits; keep the working name | Yes |
| Base reveal | None; keep the working name | No item reveals a base | No |
| Decoy sweep | Tangled Fossil (PoE1) | Fair. A fossil rules outcomes out of the pool; PoE1 only | No (optional: strike one name's decoys) |
| Word lengths | None; keep the working name (Orb of Fusing at most) | Large stretch; clashes with the fused answer line | No |
| First syllable | Orb of Transmutation | Fair stretch: the first piece on a blank item, but random, not revealed | No |
| (new) Random clue | Stacked Deck (PoE1) | Exact: draw one unknown card | Yes (a new supply) |

## All sources opened

- https://poe2db.tw/us/Stackable_Currency
- https://poe2db.tw/us/Omen
- https://poe2db.tw/us/Expedition_Logbook
- https://poe2db.tw/us/Orb_of_Transmutation
- https://poe2db.tw/us/Orb_of_Chance
- https://poe2db.tw/us/Scroll_Fragment
- https://poe2db.tw/us/Gnawed_Jawbone
- https://poedb.tw/us/Stackable_Currency
- https://poedb.tw/us/Expedition_Logbook
- https://poedb.tw/us/Veiled_Scarab
- https://poedb.tw/us/Stacked_Deck
- https://poedb.tw/us/Scrying_Orb and https://poedb.tw/us/Map_Scrying
- https://poedb.tw/us/Valdos_Puzzle_Box
- https://poedb.tw/us/Kisharas_Ducat
- https://poedb.tw/us/Ancient_Orb
- https://poedb.tw/us/Fossil and https://poedb.tw/us/Tangled_Fossil
- https://poedb.tw/us/Orb_of_Fusing
- https://poedb.tw/us/Scroll_Fragment
- https://poedb.tw/us/Blueprints
- https://poedb.tw/us/Chronicle_of_Atzoatl
- https://poedb.tw/us/Hinekoras_Lock
- https://poedb.tw/us/Treasure_Key
- https://poedb.tw/us/Karui_Enshrouding_Crystal and https://poedb.tw/us/Enshrouded_Item
- https://maxroll.gg/poe2/resources/expedition
- https://www.poe-vault.com/poe2/guides/rise-of-the-abyssal-league-guide
