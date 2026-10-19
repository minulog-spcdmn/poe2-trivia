# Wraeclast run v4: the wording table

Every line a player reads in the v3.2 prototype (`src/wraeclast/`, commit 6375a4ab), old to new. Placeholders are in {braces}; numbers come from the tuning, never typed in. "Stays" means the line is kept as it is. "Gone" means v4 drops the line, and the note says where its job went.

## The words we use

| Word | Used for | Not |
| --- | --- | --- |
| tiles | the letter pieces you build the name from | Inscription, syllables, the board |
| the answer line | where the tiles you tap go | your inscription |
| hidden / covered | the art before you reveal it | the Veil |
| reveal a patch | what a Torch does | burn in, burn-in, cluster |
| tiles not in the name | what a Tangled Fossil strikes | decoys |
| corruption | a corrupted zone, and how it spreads | front, seed, cleanse |
| stack | one pack space: up to {STACK_MAX} of one supply | |
| clue | anything you know about the item | |
| life, gold, flask | as now | |

A house word may still appear where it is a PoE item or place name (Torch, Golden Page, Ancient Orb, Stacked Deck, Tangled Fossil, Scroll of Wisdom).

## Places between items: where next (new, on the reveal, the town, the camp, the Well, the map)

| Screen | Old text | New text |
| --- | --- | --- |
| Where next | Where next | Where next |
| Where next | (none) | Step {step} of {last} |
| Where next | (none) | Map (button: the whole map) |
| Where next, zone row | {placeName} zone | {zone type} zone |
| Where next, zone row | Free clue / {free clue line} | Starts with: {free clue, short} |
| Where next, zone row | Rule / {zone rule line} | {zone rule, short} (row left out when the zone has no rule) |
| Where next, corrupted row | • Corrupted | Blood toll |
| Where next, corrupted row | A hidden modifier waits here; twice the loot. | −{BLOOD_TOLL} life per item • double loot |
| Where next, corrupted row | A hidden modifier waits here; {multiplier} times the loot. | −{BLOOD_TOLL} life per item • {multiplier}× loot |
| Where next, town row | Heals 20 life; the vendor deals every ware. | Heals {TOWN_HEAL} life • a vendor |
| Where next, Well row | Refills every flask charge. Heals no life. | Refills your flask |
| Where next, boss row | {BOSS_RULE}. No loot. | The last fight • {boss rule, short} |
| Where next, boss row | Each front still alive adds a modifier: {n front(s)} now. | Each corruption still spreading makes it harder: {n} now |
| Where next, boss row | No front is alive: no modifiers. | No corruption left: no extra rules |
| Where next, Expedition stop | (none) | Expedition trader • buy before you go on |
| Where next, row aria | (none) | Go to {place}: {kind}, {its line} |

## The map

| Screen | Old text | New text |
| --- | --- | --- |
| Map | The camp | The camp |
| Map | Step {step} of {lastStep} | Step {step} of {last} |
| Map | {node name} | {node name} (stays) |
| Map | Pick the road ahead. | Pick where to go next. The lit places are one step ahead. |
| Map | The map | The map (aria, stays) |
| Map node | {node name, wrapped} | stays |
| Map node | {placeName}: Camp, Town, Well, Boss or a zone type | stays (Camp, Town, Well, Boss, {zone type}) |
| Map node, corrupted | (none) | Blood toll |
| Map key | You | You |
| Map key | Corrupted | Blood toll: −{BLOOD_TOLL} life per item, double loot |
| Map key | A front | Gone (only the zone the corruption stands on is corrupted) |
| Map key | Cleansed | Gone (the cleared zone just turns normal) |
| Map, foot | (none) | Corruption spreads after every 2nd step. Clear its zone to stop it. |
| Map, foot | (none) | It spreads after your next step. / It spreads after this step. |
| Map, creep beat | (none) | The corruption spreads |
| Map, creep beat aria | (none) | Corruption moved from {from} to {to} |
| Map, creep beat | (none) | Tap to go on (small, the beat goes on by itself) |
| Map node names | the 37 places in wraeclast.json | stay |

## Zone arrival (the threshold screen)

The threshold screen goes in v4: you go straight from the place you tap to its first item. Its lines move to the place row and the item's run bar.

| Screen | Old text | New text |
| --- | --- | --- |
| Threshold | {ZoneName} zone | Gone (run bar: {zone type}) |
| Threshold | {node name} | Gone (run bar: {node name}) |
| Threshold | {n item(s)} to name. A right answer deals loot; a miss costs life. | Gone (run bar: Item {k} of {n}) |
| Threshold | The zone / Free clue / Rule / Items / A miss costs / Loot (labels) | Gone (place row; the dock shows the miss cost) |
| Threshold | {items} to name | Gone |
| Threshold | {lo} to {hi} life | Gone (dock: Miss: {lo} to {hi} life) |
| Threshold | {n card(s)} for a right answer, one fewer a miss | Gone (dock: Loot: {n} cards) |
| Threshold | At {life} life, a miss ends the run. | moves to the dock: A miss now ends the run |
| Threshold | Enter the zone | Gone |
| Zone types | Plain, Incursion, Essence, Ritual, Expedition, Blight | stay |
| Free clue, Plain | The item's most common mod line | A mod line |
| Free clue, Incursion | The flavour text, name words masked | Its flavor text |
| Free clue, Essence | The base type (a gem: its support text) | Its base type |
| Free clue, Ritual | The name's word lengths | Its word lengths |
| Free clue, Expedition | The item's most common mod line | A mod line |
| Free clue, Blight | A small burn-in | A patch of its art |
| Free clue, off | No free clue | No free clue (stays) |
| Rule, Plain | No rule | (row left out) |
| Rule, Incursion | Flares burn in half as much | Torches reveal half as much |
| Rule, Essence | No rule | (row left out) |
| Rule, Ritual | Scrolls of Wisdom don't work | No Scrolls of Wisdom |
| Rule, Expedition | The vendor deals after the zone | A trader after the zone |
| Rule, Blight | {BLIGHT_DECOYS} more decoys | More tiles that aren't in the name |

## The item screen

| Screen | Old text | New text |
| --- | --- | --- |
| Item | The item (aria) | The item (stays) |
| Item plate | Unidentified | Unidentified (stays) |
| Item plate | {item name} / {base type} | stay |
| Item plate | Corrupted • {Hidden name} | Gone (the run bar says Blood toll) |
| Item plate | Silent • {Mod name} • {Mod name} | Boss: {rule} • {extra rule} • {extra rule} |
| Item plate | {zone rule} (cool line) | {zone rule, short} (stays, new wording above) |
| Item plate tooltip | {Hidden name}: {hidden does} {zone rule} {Mod name}: {mod does} ... | one line per rule: {Rule}: {what it does} |
| Art aria | The item, under the Veil | The item's art, hidden |
| Art aria | The item under the Veil, parts of it burned in | The item's art, patches revealed |
| Art aria | The item, named | The item's art |
| Art loading | Lifting the Veil | Loading the art |
| Answer line aria | Your inscription | The answer line |
| Answer line | Tap the tiles in order | Tap tiles to spell the name |
| Answer line | The item is opening | Opening the item |
| Answer line, tile aria | Take back {tile} | Take back {tile} (stays) |
| Answer line, tile aria | {tile}, locked | {tile}, placed for you |
| Answer line, tile aria | {tile}, {gold/silver/struck}: take it back | {tile}: {right here / in the name, elsewhere / not in the name}. Tap to start again |
| Answer line, break key | (none) | Add a space (aria and tooltip) |
| Answer line, a gap | (none) | Remove this space (aria) |
| Answer line | Clear the line (aria) / Clear (tooltip) | Clear the line / Clear (stay) |
| Word lengths kicker | Tiles per word | Tiles per word (stays) |
| Word lengths aria | Tiles per word: {a · b · c} | {n} words: {a}, {b} and {c} tiles |
| Tiles aria | The tiles | The tiles (stays) |
| Tile aria | {tile}, {gold/silver/struck} | {tile}: right here / in the name, elsewhere / not in the name |
| Dock | Miss: {lo} to {hi} life | Miss: {lo} to {hi} life (stays) |
| Dock | {n card(s)} {full} | Loot: {n} cards (the cards lost to misses shown as struck pips) |
| Dock, boss | No loot at the boss | No loot at the boss (stays) |
| Dock, low life | (from the threshold) | A miss now ends the run |
| Dock | Sent already: change the line | You tried this one. Change a tile |
| Dock, drink aria | Drink a flask charge: {charges} left | Drink from your flask: {charges} left |
| Dock, drink tooltip | Drink: +10 now, +10 after each of the next 2 items | Heals {FLASK_STEP} now and {FLASK_STEP} after each of the next {FLASK_ITEMS} items |
| Dock, drinking | (v3 canvas) +10 now • 2 more | +{FLASK_STEP} now • more after this item |
| Dock | {charges} (badge) | stays |
| Dock | Identify | Identify (stays) |
| Dock, after a miss | ✕ / −{lost} life | ✕ / −{lost} life (stay) |
| Dock, after a miss | The deal: {n card(s)} | Loot: {n} cards now |
| Dock, after a miss, boss | Misses here cost {lo} to {hi}. | A miss costs {lo} to {hi} life |
| Dock, named | ✓ / {item name} | stay |
| Dock, named | Loot: {n card(s)} | Gone (the cards fly into the pack) |
| Dock, named | The flask heals +{healed}. | Your flask healed {healed} |
| Dock, named | Named. (boss) | Named |
| Dock, named | Take the loot | Gone (collected in the reveal) |
| Dock, named | Next item | Next item (stays; the zone's 2nd item, the boss's next) |
| Dock, named | Claim the win | Claim the win (stays) |

## The run bar (Hud)

| Screen | Old text | New text |
| --- | --- | --- |
| Run bar | Where the run is (aria) | Where you are |
| Run bar | {node name} | stays |
| Run bar | {placeName} | stays |
| Run bar | • Item {done+1} of {items} | • Item {k} of {n} (stays) |
| Run bar | • Corrupted | • Blood toll (red, the whole time you're in the zone) |
| Run bar, Blood toll aria | (none) | Blood toll: each item here takes {BLOOD_TOLL} life |
| Run bar, item opens | (none) | −{BLOOD_TOLL} Blood toll (on the life number, as a hit) |
| Pill aria | You: {life} life, {gold} gold | stays |
| Pill | E / Exile | stay |
| Life aria | Life | Life: {life} of {max} |
| Life | {life} / −{hit} / +{due} | stay |
| Flask aria | Flask: {charges} of {max} charges. {FLASK_LINE} | Flask: {charges} of {max}. Drink during an item to heal |
| Flask tooltip | A drink heals 10 at once, and 10 as each of the next 2 items ends. Drink during an item. | A drink heals {FLASK_STEP} now and {FLASK_STEP} after each of your next {FLASK_ITEMS} items. Wells refill it. |
| Flask, healing (screen reader) | The flask still heals {FLASK_STEP} after each of the next {recovering} of {FLASK_ITEMS} items. | Your flask heals {FLASK_STEP} more after each of the next {recovering} items |
| Gold | {gold} | stays |
| Step plaque | Step / {step}/{lastStep} | Step / {step}/{last} (stay) |
| Step plaque aria | Step {step} of {lastStep} | stays |
| Step plaque, boss | The / Boss | Last / Boss |

## Clues

| Screen | Old text | New text |
| --- | --- | --- |
| Clue label, free | Zone • a common mod line | Free • Mod line |
| Clue label | Scroll of Wisdom | Mod line |
| Clue label, free | Zone • flavour text | Free • Flavor text |
| Clue label | Lore | Flavor text |
| Clue label, free | Zone • the base type | Free • Base type |
| Clue label, free | Zone • its support text | Free • Support text |
| Clue label | Base reveal | Base type |
| Clue label | Base reveal • support text | Support text |
| Clue label | Category reveal / {category} | Gone (the Ancient Orb instead) |
| Clue label, new | (none) | Ancient Orb |
| Clue, Ancient Orb | (none) | {sibling name} • the same kind of item |
| Clue label, new | (none) | Stacked Deck • {what it drew: Mod line, Flavor text, Base type, Ancient Orb, Word lengths, A patch} |
| Clue label, free | Zone • word lengths | Free • Word lengths |
| Clue, Ritual | On the line: a dot for each tile, grouped by word. | Shown above the answer line: a dot for each tile, grouped by word |
| Clue label | Boss • a burn-in / Zone • a burn-in | Free • A patch |
| Clue | The boss burned in a patch of the art. / The zone burned in a patch of the art. | A patch of the art is revealed |
| Clue, empty | Nothing is known of it yet. | No clues yet. Use a supply from your pack |
| Tried | ✕ / {tile·tile} / −{lost} | stay (the try shown fused, with its marks) |
| Masked word | A word of the item's name / a word of its name | A word of the name, hidden |
| Free label | Zone | Free |

## Supplies (pack tooltips, vendor cards, loot cards)

| Supply | Old text | New text |
| --- | --- | --- |
| Torch | Flare / Flare | Torch / Torch |
| Torch, does | Burns in a cluster of the art at a random spot. | Reveals a patch of the art. |
| Torch, off | The art is all burned in | The art is all revealed |
| Scroll of Wisdom | Scroll of Wisdom / Wisdom | Scroll of Wisdom / Scroll |
| Scroll, does | The next mod line, from the most common to the rarest. | Shows a mod line. Each one is rarer than the last. |
| Scroll, off | Nothing left to read | No mod lines left |
| Golden Page | Golden Page / Page | stay |
| Golden Page, does | The flavour text, name words masked. | Shows the flavor text, with the name hidden. |
| Golden Page, off | Nothing to show | No flavor text |
| Ancient Orb | Category reveal / Category | Ancient Orb / Orb |
| Ancient Orb, does | The item's category. | Names another item of the same kind. |
| Ancient Orb, off | Shown already | Used already |
| Base reveal | Base reveal / Base | stay |
| Base reveal, does | The base type (a gem: its support text). | Shows the base type (on a gem: its support text). |
| Base reveal, off | Shown already | Shown already (stays) |
| Tangled Fossil | Decoy sweep / Sweep | Tangled Fossil / Fossil |
| Tangled Fossil, does | Strikes {DECOY_SWEEP} decoy tiles. | Strikes out {DECOY_SWEEP} tiles that aren't in the name. |
| Tangled Fossil, off | Nothing left to strike | Every wrong tile is struck |
| Word lengths | Word lengths / Lengths | stay |
| Word lengths, does | How many words the name has, and the tiles in each. | Shows how many words, and the tiles in each. |
| Word lengths, off | Shown already | stays |
| First syllable | First syllable / First | stay |
| First syllable, does | Places the name's first tile on the line, locked. | Puts the first tile on the answer line for you. |
| First syllable, off | Placed already | stays |
| Stacked Deck, new | (none) | Stacked Deck / Deck |
| Stacked Deck, does | (none) | Shows one clue you don't have yet, at random. |
| Stacked Deck, off | (none) | No clues left to draw |
| Any, off | The item is opening | Opening the item |
| Any, off, boss | Silent: only Flares work | Boss rule: only Torches work |
| Any, off | Sealed: no supplies work here | Gone (no Sealed in v4) |
| Torch, off | Dark: the art can't be revealed | Gone (no Dark in v4); Blind boss: The art can't be revealed |
| Scroll, off | Ritual: Scrolls don't work here | Ritual zone: no Scrolls |
| Price | {stack} for {price} gold | {stack} for {price} (the coin icon says gold) |

## The pack

| Screen | Old text | New text |
| --- | --- | --- |
| Pack aria | Your pack | Your pack (stays) |
| Pack slot tooltip | {Supply name}: {does} | stays |
| Pack slot tooltip, off | {why off} | stays |
| Pack slot aria | {Supply name}, a stack of {n}. {does} | {Supply name}, {n}. {does} |
| Pack slot aria, off | {Supply name}, a stack of {n}: {why off} | {Supply name}, {n}. {why off} |
| Pack slot | {n} / {short name} | stay |
| Pack, empty | Your pack is empty. | Your pack is empty. (stays) |
| Pack, empty, boss | Your pack is empty. Only Flares work here. | Your pack is empty. |
| Pack grid aria | The pack: {stacks} of {PACK_STACKS} stacks, up to {STACK_MAX} each | Your pack: {stacks} of {PACK_STACKS} spaces used |
| Pack slot, empty aria | Empty | Empty space |
| Vendor pack heading | Pack | Your pack |
| Vendor pack note | Eight stacks of up to five. A ware is bought only when its whole stack fits. | {PACK_STACKS} spaces, up to {STACK_MAX} of one supply in each. |
| Swap aria | Replace {Supply name} × {n} | Swap out {n} {Supply name} |
| Stack tooltip | {Supply name} × {n} | {n} {Supply name} |

## The reveal and the loot (the loot screen goes)

| Screen | Old text | New text |
| --- | --- | --- |
| Loot | {item name} named | Gone (the plate shows the name) |
| Loot | Loot | Gone |
| Loot | {n card(s)}, all yours. | Gone (the cards fly into the pack) |
| Loot | A miss cost {n card(s)}. / Misses cost {n card(s)}. | First try / {n} misses (the dock's result line) |
| Loot | Corrupted ({Hidden name}): the deal doubled. | Blood toll: double loot (dock's result line) |
| Loot, full pack | The pack is full: the {Supply name} can replace a stack, or be left. | Your pack is full. Tap a space to swap it for {n} {Supply name}. |
| Loot, full pack | Replace a stack with {Supply name} × {n} | Gone (the line above) |
| Loot, full pack | Leave the {Supply name} | Leave them / Leave it |
| Loot | Collected. | Gone |
| Loot | Collect / Collect the loot | Gone |
| Loot | Next item | Next item (in the dock of the reveal) |
| Loot | On to the map | Gone (the places to go are on the reveal) |
| Loot card | Gold / +{gold} gold | {gold} Gold (no second line) |
| Loot card | Jackpot / +{gold} gold | Gone (the Jackpot card is out of v4) |
| Loot card | Flask charge / Refills an empty charge | Flask charge / +1 charge |
| Loot card | {Supply name} / {n} into the pack | {n} {Supply name} (no second line) |
| Loot card | × {n} | Gone (the count is in the title) |
| Card back | Unidentified | stays |

## Town and the vendors

| Screen | Old text | New text |
| --- | --- | --- |
| Town | Town | {town name} (heading) / Town (kind) |
| Town | The town heals you {heal} life. The vendor deals its wares again. | You rest: +{heal} life |
| Town | You arrive at full life. The vendor deals its wares again. | You rest: life is full |
| Camp | Camp | Clearfell Encampment (heading) / Camp (kind) |
| Camp | The vendor deals its wares. Stock your pack: the next vendor is in a town, or after an Expedition. | Buy supplies for the road. The next vendor is in a town. |
| Expedition | Expedition vendor | Expedition trader |
| Expedition | The Expedition's vendor deals its wares after the zone. | A trader, after the zone. Buy, or go on. |
| Vendor | The vendor's wares (screen reader) | For sale |
| Vendor | {gold} gold to spend. | Gone (the gold is on the pill; the coin and number sit by the heading) |
| Vendor card | {Supply name} / {does} | stay (new does lines above) |
| Vendor card | {stack} for {price} gold | {stack} • {price} (Cinzel, with the coin) |
| Vendor card aria | Buy {stack} {Supply name} for {price} gold | stays |
| Vendor card, bought | Sold | Bought |
| Vendor card, too dear | (none) | Not enough gold (aria; the price goes red) |
| Vendor card, no space | (none) | Pack full: tap a space to swap |
| Vendor flask | Flask / {charges} of {max} charges. {FLASK_LINE} A Well refills every charge. | Gone (the flask is on the pill; its tooltip has the line) |
| Vendor | Set out (camp) / To the map (town, Expedition) | Gone (tap a place under Where next to set out) |
| Bigger flask (ware, if kept) | (design doc) +1 maximum charge, empty until the next Well | One more flask charge. It fills at the next Well. |

## The Well (the Well screen goes)

| Screen | Old text | New text |
| --- | --- | --- |
| Well | Well / The Well refills your flask. | {Well name} • your flask is full again |
| Well | The Well / Flask / {charges} of {max} charges | Gone (the pips fill on the pill) |
| Well | Life / {life} of {maxLife}; the Well heals no life | Gone |
| Well | Go on | Gone (the next places come up under it) |
| Well, flask already full | (none) | {Well name} • your flask was already full |

## Corruption

| Screen | Old text | New text |
| --- | --- | --- |
| Modifier | Blood toll / Each item takes {BLOOD_TOLL} life as it opens. | Blood toll / Each item here takes {BLOOD_TOLL} life when it opens. |
| Modifier | Sealed, Swarming, Dark, Bounty and their lines | Gone (Blood toll only in v4) |
| Corruption card | Corrupted / {Hidden name} / {hidden does} / Hidden modifier: ... | Gone (no flip card) |
| Corruption card note | Corruption hides a modifier here, and pays for it: loot is doubled. Name every item to cleanse the zone. | Gone; the map key says: Clear its zone to stop it |
| Cleared a corrupted zone | (none) | The corruption here is gone (on the last reveal of that zone) |

## The boss

| Screen | Old text | New text |
| --- | --- | --- |
| Boss threshold | The boss / {BOSS_RULE}. No loot; beat it to win the run. | Keep this one screen (the run's last stop): The boss • {boss rule}. Name all {n} items to win. |
| Boss threshold | Rule / {BOSS_RULE} | Rule / {boss rule} |
| Boss threshold | Modifiers | Made harder by the corruption |
| Boss threshold | {Mod name} {mod does} | {Mod name} • {what it does} |
| Boss threshold | No corruption reached the boss. | No corruption reached the boss. (stays) |
| Boss threshold | Face the boss | Face the boss (stays) |
| Boss rule | Silent: only Flares work | Silent: only Torches work |
| Boss rule (canvas) | Blind • the art can't be revealed | stays |
| Boss mod | Lingering / A fourth item. | Lingering / One more item |
| Boss mod | Bloodied / Misses cost {BLOODIED} more life. | Bloodied / Misses cost {BLOODIED} more life (stays) |
| Boss mod | Murky / Flares burn in half as much. | Murky / Torches reveal half as much |
| Boss mod | Teeming / {TEEMING_DECOYS} more decoys. | Teeming / More tiles that aren't in the name |
| Boss kind | Boss | stays |

## The end screen

| Screen | Old text | New text |
| --- | --- | --- |
| End | The boss is beaten / The run is won | stay |
| End | Fell at {node name} / The run is lost | stay |
| End | {named} items named, with {lifeEnd} life left. | stays |
| End | {item name} took the last of your life. | stays |
| End | The road | stays |
| End labels | Named, Misses, Life at the end, Flask drinks, Gold earned, Gold spent | stay |
| End | Fronts / {seeded} seeded • {stopped} stopped • {alive} alive at the boss | Corruption / {n} spreading at the start • {stopped} stopped • {alive} reached the boss |
| End | Boss modifiers / Not reached / None | Boss made harder by / Not reached / Nothing |
| End | Corruption met / {Hidden name} • ... / None | Blood toll zones / {n} |
| End | Loot taken / {Kind} {taken} of {dealt} / None | stay (Jackpot gone) |
| End | Bought, Found, Used / {Supply name} × {n} / Nothing | stay (new supply names) |
| End | Route / {node} • {node} | stay |
| End | Step {step} • {node name} • {Zone name} / Boss | stay |
| End | {where} • {category} / • {Hidden name} | {where} • {category} / • Blood toll |
| End | {n} miss(es) • / +{gold} gold / Named / Lost here / • {n} supply/supplies | stay |
| End | Item by item, Run log, Copy run log, New run, Show it | stay |
| End | Copied / couldn't be copied / The log holds ... / Every run kept on this device, newest last. | stay (playtest tool lines) |

## Other

| Screen | Old text | New text |
| --- | --- | --- |
| Tab title | PoE2.Quest • Wraeclast run | stays |
| Build error | The Wraeclast run only runs on the dev server and the beta, from wraeclast.html. | stays (not shown to players) |
