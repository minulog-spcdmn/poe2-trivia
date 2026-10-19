# v6 research: PoE2 support gems and crafting orbs

Gathered 2026-10-19 for the Wraeclast v6 duel design. Values are paraphrased and are level 1 numbers where a number is given; PoE2 patches change them, so treat numbers as flavour, not fact. Gem tiers ("Tier N") are the gem's drop tier on poe2db; "I/II/III" are separate upgrade gems in the same family.

Sources:
- https://poe2db.tw/us/Support_Gems (name list; 557 supports)
- https://poe2db.tw/us/Combo_Finisher_I, https://poe2db.tw/us/Practiced_Combo, https://poe2db.tw/us/Rage_I
- https://poe2db.tw/us/Spell_Echo, https://poe2db.tw/us/Echoing_Cry, https://poe2db.tw/us/Double_Barrel_I, https://poe2db.tw/us/Spell_Cascade
- https://poe2db.tw/us/Chain, https://poe2db.tw/us/Ricochet_I, https://poe2db.tw/us/Fork, https://poe2db.tw/us/Pierce_I
- https://poe2db.tw/us/Brutality_I, https://poe2db.tw/us/Elemental_Armament_I, https://poe2db.tw/us/Fire_Attunement, https://poe2db.tw/us/Fist_of_War_I, https://poe2db.tw/us/Momentum
- https://poe2db.tw/us/Life_Leech_I, https://poe2db.tw/us/Life_Drain, https://poe2db.tw/us/Thrill_of_the_Kill
- https://poe2db.tw/us/Execute_I, https://poe2db.tw/us/Culling_Strike, https://poe2db.tw/us/Behead_I
- https://poe2db.tw/us/Bounty_I
- https://poe2db.tw/us/Stackable_Currency (currency and Perfect Essences)
- https://maxroll.gg/poe2/resources/corruption-outcomes (Vaal outcomes)
- https://maxroll.gg/poe2/resources/path-of-exile-2-crafting-overview (currency summary)
- https://mobalytics.gg/poe-2/guides/fracturing-orbs, https://mobalytics.gg/poe-2/guides/omen-crafting (via search snippets; the 0.3 changes page returned 403)

## 1. Support gems by trivia-duel idea

### (a) Streak / consecutive hits
- **Combo Finisher I / II** (Tier 1 for I; +5 Dex): melee attacks can't be used until 3 Combo has built up, then deal 25% more damage; the Combo is lost after 4 s without gaining any. Best fit for "build a streak, then cash it in".
- **Practiced Combo** (Tier 3; +5 Dex): strike skills have a 40% chance to build an extra Combo on hit, so the streak builds faster.
- **Rage I / II / III** (Tier 1 for I; +5 Str): melee hits grant 3 Rage each; Rage stacks up and boosts the user. A stacking counter, not a strict streak.
- **Thrill of the Kill I / II** (Tier 1): culling a Shocked enemy makes all your attacks gain 25% of their damage as extra Lightning for 8 s. A reward after a kill, loosely streak-like.

### (b) Repeating / echoing a hit
- **Spell Echo** (Tier 2; +5 Int): a cascadable spell echoes once more, but with 30% less cast speed; echoes get 40% more area.
- **Echoing Cry** (Tier 4; +5 Str): a warcry echoes twice, 1.3 s apart, each echo with a larger area; the skill is weaker overall (40% less damage) and only usable after moving 10 m.
- **Double Barrel I / II / III** (Tier 1 for I; +5 Str): crossbow skills load one extra bolt per reload, at 30% less reload speed.
- Also: **Spell Cascade** (Tier 1; +5 Int) repeats a spell to either side of the target area, with 30% less damage.
- Closest "pure repeat": Spell Echo.

### (c) Chaining / carrying damage onward
- **Chain I / II / III**: projectile skills (and anything that chains) chain additional times. The tier text is identical on poe2db; only numbers differ.
- **Ricochet I / II / III** (Tier 2 for I; +5 Dex): projectiles have a 40% chance to chain an extra time off terrain.
- **Fork** (Tier 3; +5 Dex): projectiles fork into more, each dealing 30% less damage after forking.
- **Pierce I / II / III** (Tier 1 for I): projectiles pierce an enemy but deal 20% less damage once they have.
- Best: **Chain**.

### (d) Much more damage with a restriction
- **Combo Finisher I / II**: 25% more damage, but the skill needs 3 Combo before it can be used.
- **Brutality I / II / III** (Tier 1 for I; +5 Str): 25% more Physical damage, but the skill deals no Chaos or Elemental damage.
- **Echoing Cry** and **Spell Cascade** trade damage down, so they are the opposite kind.
- Also seen: **Elemental Armament I / II / III** (Tier 1 for I): 20% more Elemental attack damage (III adds damage per ailment on enemies but the skill can't inflict ailments). **Fire Attunement** (Tier 1): gain 25% of damage as extra Fire, 50% less Cold and Lightning.
- Best: **Brutality** (a clean "more damage, you lose X" with plain wording).

### (e) Life leech / life on hit
- **Life Leech I / II / III** (Tier 2 for I; +5 Str): attacks leech 12% of their Physical damage as Life; III also stops leeched Life being removed at full Life.
- **Life Drain** (Tier 1; +5 Dex): when a supported skill culls an enemy, recover 12% of max Life over four seconds.
- Also **Font of Blood** (totems leech Life for allies standing in the font) and lineage **Atalui's Bloodletting** (name only checked; not researched).
- Best: **Life Leech**.

### (f) Culling / executing low-life enemies
- **Culling Strike I / II** (attack support): hits cull Rare and Unique enemies that fall under the cull threshold (II raises the threshold).
- **Execute I / II / III** (Tier 1 for I; +5 Str): 40% more damage with Hits against enemies on Low Life. Not a true kill, a damage bonus.
- **Life Drain** and **Thrill of the Kill** both key off culling (see above).
- Best for a "finish them off" feel: **Culling Strike**; for plain more damage on weak targets: **Execute**.

### (g) Flat added damage
- None found as true flat "adds X to Y damage" supports in PoE2's current list; PoE2 uses "gain % of damage as extra element" instead.
- Nearest: **Fire Attunement** (25% of damage as extra Fire; also Cold Attunement and Lightning Attunement exist in the list, descriptions not checked) and **Elemental Armament I / II / III**.
- If the design wants a named flat bonus, "Fire Attunement" is the closest real name.

### (h) Bonus vs unique or rare enemies
- No support gives plain "more damage to Rare or Unique".
- **Culling Strike I / II**: culls Rare and Unique enemies (see f).
- **Behead I / II** (Tier 2 for I; +5 Str): strike skills steal a modifier from a Rare monster on a killing blow, for 20 s.
- Lineage **Einhar's Beastrite** is the Behead family's lineage gem (see clash note).
- Best: **Culling Strike** for "bosses and rares".

### (i) Gold / rarity found
- No PoE2 support gem for item rarity or gold found; those gems are PoE1 (Item Rarity Support). Source check: web search plus the PoE2 patch 0.2.0g notes, which only moved rarity onto gear and maps.
- Nearest PoE2 loot-ish supports: **Bounty I / II** (Tier 2 for I; +5 Dex): enemies killed by supported hits give 50% more Charm and Life and Mana Flask charges; the family also has **Life Bounty**, **Mana Bounty** and **Charm Bounty**. Not gold.
- Gold exists only on gear in PoE2, for example the Perfect Essence of Opulence (gloves with increased gold quantity) and gold-related modifiers.
- Conclusion: for gold use **Bounty** as a loose flavour stand-in and say plainly it grants flask charges in the real game.

### Other candidates noticed (not asked for)
- **Momentum** (Tier 2; +5 Dex): 40% more damage for the rest of a use once you've moved 2 m.
- **Fist of War I / II / III** (Tier 1; +5 Str) and **Ancestral Call I / II** (Tier 4; +5 Str): a powerful Ancestral Boost on a timer (every 6 s and every 5 s).
- **Mark for Death I / II** (Tier 2; +5 Str): mark skills break armour from Physical damage dealt.
- **Overabundance I / II / III** (Tier 1; +5 Dex): +1 to a skill's Limit, with 50% less skill duration.
- **Rapid Attacks I / II / III** (Tier 1): 15% increased attack speed.

## 2. Crafting currency in PoE2

- **Orb of Transmutation**: turns a Normal (white) item into Magic with one modifier. Greater and Perfect versions force a higher minimum modifier level.
- **Orb of Augmentation**: adds one random modifier to a Magic item (which holds at most one prefix and one suffix). Greater and Perfect versions exist.
- **Orb of Alchemy**: turns a Normal item into Rare with four modifiers (and in current PoE2 can also take a Magic item to Rare per poe2db).
- **Regal Orb**: upgrades a Magic item to Rare and adds one modifier. Greater and Perfect versions exist.
- **Exalted Orb**: adds one random modifier to a Rare item (max three prefixes and three suffixes). Greater and Perfect versions exist. This is not the "currency of the realm" it was in PoE1.
- **Chaos Orb**: removes one random modifier from a Rare item and adds a new random one. Greater and Perfect versions exist.
- **Orb of Annulment**: removes one random modifier from a Magic or Rare item. Omens can restrict it to prefixes or suffixes.
- **Divine Orb**: rerolls the numeric values of the modifiers already on the item, without changing which modifiers it has.
- **Fracturing Orb**: on a Rare item with at least four modifiers, permanently locks one random modifier so Chaos, Annulment and Divine can't touch it.
- **Essences** (Lesser, normal, Greater tiers): upgrade a Magic item to Rare and guarantee a specific modifier. **Perfect Essences** instead remove a random modifier from a Rare item and add a strong guaranteed one (for example Perfect Essence of Battle gives +2 or +3 levels to attack skills on suitable weapons). They no longer reforge Normal or Rare items the old way.
- **Omens**: consumable "meta-modifiers" (from Ritual) activated by right-clicking the item; they alter the next orb used. Examples: Dextral and Sinistral Annulment (suffix-only or prefix-only removal), Whittling (the next Chaos removes the lowest-level modifier), Omen of Corruption (removes the "nothing" outcome from Vaal).
- **Orb of Scouring** doesn't exist in PoE2, and there is no way to clear one unwanted modifier cleanly.
- Other relevant orbs on the same page: **Orb of Chance** (Normal item becomes Unique or is destroyed), **Mirror of Kalandra** (makes a mirrored copy), **Hinekora's Lock** (previews the result of the next currency use).

### Vaal Orb outcomes in PoE2

The Vaal Orb corrupts an item (no further crafting) and picks one outcome by item type. A guide cited by search results says outcomes are roughly equal-chance; exact odds beyond Unique jewels are not published in the sources found.

- **Rare / Magic equipment**: nothing changes; or 1 to 3 modifiers are rerolled; or a Corrupted enchantment is added; or a socket is added past the normal limit (armour, shields, foci, martial weapons) or quality is raised (wands and staves up to 23%).
- **Unique equipment**: nothing; or modifier values are scaled by 0.78 to 1.22 times; or a Corrupted enchantment; or the same socket/quality bonus.
- **Rare / Magic jewels**: nothing; rerolled modifiers; a Corrupted enchantment; or a modifier added or removed past normal limits.
- **Unique jewels**: 50% nothing; a Corrupted enchantment; or values scaled 0.78 to 1.22 times.
- **Waystones**: tier up or down by 1; affixes converted all to prefixes or all to suffixes; or random affixes added.
- **Skill gems**: nothing; gem level plus or minus 1; sockets plus or minus 1; quality changed from minus 7% to plus 3%.
- Unlike an Orb of Chance, a Vaal Orb can't delete the item. Later corruption orbs (Architect's Orb for gear, Crystallised Corruption for gems) can modify or destroy a corrupted item.

## 3. Clash check against src/data/items.json

The file holds 501 entries: unique items and 56 gem entries. Every gem entry is a **lineage support gem** (an answer in the trivia), so lineage support names are directly in the answer set. Non-lineage supports have no exact-name match.

Exact support gem names listed above that appear in items.json: none, with one family link.
- **Einhar's Beastrite** (gem, Strength Lineage Support) is an answer; it belongs to the **Behead** family. Using "Behead" in the design is safe by name, but pairing it with its lineage gem could hand out an answer.

Distinctive words that appear in answers or base types:
- **Chain**: base types and names "Chain Mail" (Coat of Red), "Veridical Chain" (Eventide Petals), "Chain Tiara" (Sandstorm Visage).
- **Fork**: base type "Runic Fork" (Runeseeker's Call).
- **Mark**: "Brynhand's Mark" (unique, Wooden Club); relevant for **Mark for Death**.
- **Ancestral**: base type "Ancestral Mail" (Lightning Coil); relevant for **Ancestral Call**.

Words with no hit at all: Combo, Finisher, Echo, Cascade, Barrel, Execute, Culling, Cull, Leech, Drain, Thrill, Brutality, Armament, Attunement, Fist, Momentum, Bounty, Rage, Ricochet, Pierce, Rapid, Overabundance.

Lineage gems that sit close to the ideas above, all existing answers (do not reuse as design names): Ratha's Assault (Rapid Attacks lineage), Atalui's Bloodletting, Kalisa's Crescendo, Rigwald's Ferocity, Tul's Stillness, Morgana's Tempest (Overabundance lineage), Arbiter's Ignition, Tasalio's Rhythm, Hayoxi's Fulmination.
