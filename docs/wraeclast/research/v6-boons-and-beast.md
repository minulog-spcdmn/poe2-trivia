# Research notes for v6: PoE2's boons, and the Beast

Read on 2026-10-19. poe2wiki.net blocks bots, so the lists come from poe2db.tw
(data-mined game text): https://poe2db.tw/us/Trial_of_the_Sekhemas . Effects
are paraphrased.

## Trial of the Sekhemas

The only PoE2 content with things named and used as **Boons** and
**Afflictions**. Honour is the trial's life; Sacred Water its gold; a Merchant
sits on every floor. Most boons are objects you'd carry (Crystal Shard, Hare
Foot, Ornate Dagger), which suits principle 8.

**Pledges** are the trial's own deals: Pledge to the Guileful, the Powerful,
the Deserted and the Afflicted, offered at the shrine "Pledge to Kochai". They
trade boons for afflictions, which is what a Pact is.

### Boons (39 distinct), paraphrased

| Boon | Kind | In the trial |
| --- | --- | --- |
| Lustrous Lacquer | minor | +50% armour, evasion and energy shield |
| Crystal Shard | major | Your next affliction becomes a minor boon |
| Sacred Mirror | major | Keys picked up are duplicated |
| Upward Path | minor | Sacred Water found rises each room; lost on a Merchant purchase |
| Chipped Dice | minor | The Merchant's shop can be rerolled |
| Balbala's Gift | minor | Next Merchant purchase is free |
| Black Pearl | minor | Traps deal 50% less damage |
| Silver Chalice | minor | Next minor boon becomes a major one |
| Fountain of Youth | minor | Restore Honour at a Maraketh Shrine |
| Holy Water | major | A minor boon at a Maraketh Shrine |
| Orbala Statuette | minor | +25% maximum Honour |
| Mirror of Fortune | minor | Next key duplicated |
| Adrenaline Vial | minor | Restore Honour entering a boss room |
| Enchanted Urn | minor | +30% effect of non-unique relics |
| Assassin's Blade | minor | The next 1 to 10 non-boss monsters hit die at once |
| Ornate Dagger | minor | 50% more damage |
| Sanguine Vial | minor | Monsters have 30% less life |
| Viscous Ichor | minor | Monsters 15% slower |
| Lustrous Pearl | minor | Traps are slower |
| All-Seeing Eye | major | The trial map is fully revealed |
| Raincaller | major | Sacred Water found doubled |
| Diverted River | minor | Sacred Water doubled this floor |
| Moment's Peace | minor | Can't be damaged until the next room is done |
| Dekhara's Necklace | major | No more minor afflictions |
| Sekhema's Cloak | major | Revive once at 0 Honour, full |
| Orbala's Leathers | major | Revive once at 0 Honour, at half |
| Glowing Orb | minor | Below 20% life: restore life and half your Honour, once |
| Ahkeli's Guard | major | 1 s immunity after a hit |
| Earned Honour | major | Restore Honour when a room is done |
| Garukhan's Favour | major | Ignore the first hit in each room |
| Imperial Seal | major | Traps disabled |
| Silver Tongue | minor | Merchant prices halved |
| Scrying Crystal | minor | See one more room ahead on the map |
| Honoured Challenger | minor | +50% Honour restored |
| Reparations | major | 2 Sacred Water whenever you're hit |
| Flooding Rivers | minor | +50% Sacred Water |
| Hare Foot | minor | +40% movement speed |
| Fright Mask | minor | Monsters deal 20% less damage |
| Wooden Effigy | minor | Unused in the game |

### Afflictions (54 distinct), the ones useful as prices

| Affliction | In the trial |
| --- | --- |
| Blunt Sword | 40% less damage |
| Honed Claws | Monsters deal 30% more damage |
| Spiked Shell | Monsters have 50% more life |
| Weakened Flesh | 25% less maximum Honour |
| Branded Balbalakh | Cannot restore Honour |
| Suspected Sympathiser | 50% less Honour restored |
| Haemorrhage | No Honour restored until the next boss is killed |
| Dishonoured Tattoo | Double damage taken on low life |
| Worn Sandals | 30% slower after being hit |
| Trade Tariff | Merchant prices +50% |
| Season of Famine | Merchant offers half as much |
| Tradition's Demand | Merchant offers one choice |
| Spiked Exit | Take damage when a room is done |
| Glass Shard | Next boon becomes a minor affliction |
| Myriad Aspersions | Each affliction brings another |
| Black Smoke | See one fewer room ahead |
| Golden Smoke, Red Smoke, Purple Smoke | Rewards, room types or afflictions hidden on the map |
| Veiled Sight | Rooms hidden on the map |
| Tattered Blindfold | Light radius cut, minimap hidden |
| Ghastly Scythe | Losing Honour ends the trial, for 1 to 3 rooms |
| Unassuming Brick | No more boons |
| Deadly Snare, Dark Pit | Traps deal triple, double damage |

### Clashes checked against poe2.quest

Checked every name above against `src/data/items.json` and `src/`:
- **Garukhan** clashes: Garukhan's Resolve is an answer. Avoid Garukhan's
  Favour.
- **Relics** are an answer category, and Sekhemas relics (Urn, Amphora, Vase,
  Seal, Coffer, Tapestry, Incense; The Last Flame and others) are answers or
  bases. Don't use them.
- The jewels the trial lists (Sapphire, Emerald, Ruby, Diamond) are base
  types. Don't use them.
- No other boon or affliction name appears in an answer or in another mode.

### Other PoE2 sources of boon-like things (not read in full)

- **Trial of Chaos** rolls its own trial modifiers per room; not checked
  whether they're called boons.
- **Shrines** in maps grant timed buffs; they're places you touch, not items
  you carry, so they fail principle 8.
- **Omens** (Ritual) are items carried that change the next currency use:
  carried and used, but a one-shot, not a lasting edge. Uhtred's Omen is an
  answer.
- **Atlas passives** are a tree, not items.

So the Sekhemas boons are the one real source, and the Pledges are its pacts.

## The Beast

- **PoE1:** the Beast is a divine creature raised by Sin to keep the gods
  dormant, the source of thaumaturgy, which corrupts and mutates whatever it
  touches. The Exile kills it in PoE1's Act 4 (Malachai, the Belly of the
  Beast). Source: https://pathofexile.fandom.com/wiki/The_Beast_(lore)
- **PoE2:** the Seed of Corruption, which Count Geonor took from the Hooded
  One, is the Beast's essence, and corruption spreads from it across
  Wraeclast; that is what sets PoE2's story off. Source:
  https://maxroll.gg/poe2/resources/path-of-exile-2-campaign-overview
- **Fit:** the spread fits PoE2 exactly: corruption spreading through the
  land from the Beast's essence. A living Beast as the boss fits less, since
  it died in PoE1; what's alive is the Seed and whoever carries it.
- **Names:** "Belly of the Beast" and "Einhar's Beastrite" are answers; "the
  Beast" names the same creature as the first, so it stays one name, one
  thing.
