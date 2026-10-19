# Wraeclast run: every player-visible string

Source: `C:\projects\poe2-trivia\.claude\worktrees\wraeclast-playtest\src\wraeclast\` (paths below relative to it unless they start with `src/` or are the HTML page). TuningPanel.svelte and console/log strings skipped. Placeholders in `{braces}`; `{n item(s)}` means `plural(n, 'item')` from words.ts:27 (gives "1 item", "3 items", "2 patches"). Defaults from rules.ts DEFAULT_TUNING are noted where a template bakes in a number. Each string is listed once, in the section where it fits best; shared helpers are cross-referenced.

## Camp/Threshold

The zone threshold (Threshold.svelte, phase `zone`), the zone types and their lines, and the camp's vendor screen.

| file:line | exact text | where/when it shows |
|---|---|---|
| Threshold.svelte:44 | {ZoneName} zone | kicker above the zone's name on arriving at a zone (e.g. "Ritual zone") |
| Threshold.svelte:45 | {node name} | h1, the node's name (map node names, see Map) |
| Threshold.svelte:49 | {n item(s)} to name. A right answer deals loot; a miss costs life. | sub line under the zone's name |
| Threshold.svelte:84 | The zone | aria-label of the terms panel (zone) |
| Threshold.svelte:87 | Free clue | term label in the zone panel |
| Threshold.svelte:87 | {free clue line} | value: FREE_CLUE[type] or "No free clue" |
| Threshold.svelte:88 | Rule | term label in the zone panel |
| Threshold.svelte:88 | {zone rule line} | value: ZONE_RULE[type] |
| Threshold.svelte:92 | Items | term label |
| Threshold.svelte:92 | {items} to name | value |
| Threshold.svelte:93 | A miss costs | term label |
| Threshold.svelte:93 | {lo} to {hi} life | value (miss cost range; defaults 20 to 30 early, 30 to 40 mid, 40 to 50 late) |
| Threshold.svelte:95 | Loot | term label (zones only) |
| Threshold.svelte:95 | {n card(s)} for a right answer, one fewer a miss | value |
| Threshold.svelte:111 | At {life} life, a miss ends the run. | warning when life is at or below the low end of a miss (zone and boss) |
| Threshold.svelte:121 | Enter the zone | primary button at a zone threshold |
| map.ts:83 | Plain | zone type name |
| map.ts:84 | Incursion | zone type name |
| map.ts:85 | Essence | zone type name |
| map.ts:86 | Ritual | zone type name |
| map.ts:87 | Expedition | zone type name |
| map.ts:88 | Blight | zone type name |
| words.ts:65 | The item's most common mod line | Plain zone's free clue (threshold, map choice card) |
| words.ts:66 | The flavour text, name words masked | Incursion zone's free clue |
| words.ts:67 | The base type (a gem: its support text) | Essence zone's free clue |
| words.ts:68 | The name's word lengths | Ritual zone's free clue |
| words.ts:69 | The item's most common mod line | Expedition zone's free clue |
| words.ts:70 | A small burn-in | Blight zone's free clue |
| words.ts:75 | No rule | Plain zone's rule |
| words.ts:76 | Flares burn in half as much | Incursion zone's rule (also the item plate's rule line) |
| words.ts:77 | No rule | Essence zone's rule |
| words.ts:78 | Scrolls of Wisdom don't work | Ritual zone's rule |
| words.ts:79 | The vendor deals after the zone | Expedition zone's rule |
| words.ts:80 | {BLIGHT_DECOYS} more decoys | Blight zone's rule (default "6 more decoys") |
| words.ts:85 | No free clue | free clue line when the tuning turns a zone's free clue off |
| Vendor.svelte:20 | Camp | h1 of the vendor screen at the camp (run start) |
| Vendor.svelte:25 | {node name} | kicker above the vendor title (camp: "Clearfell Encampment") |
| Vendor.svelte:28 | The vendor deals its wares. Stock your pack: the next vendor is in a town, or after an Expedition. | sub line at the camp's vendor |
| Vendor.svelte:78 | Set out | primary button leaving the camp's vendor |
| words.ts:116 | Camp | node kind word (map label, Hud) |
| words.ts:132 | The start. | placeDoes for the camp (not normally offered as a choice) |

## Map

| file:line | exact text | where/when it shows |
|---|---|---|
| MapScreen.svelte:227 | The camp | kicker on the map screen while at the camp (step 0) |
| MapScreen.svelte:227 | Step {step} of {lastStep} | kicker on the map screen past the camp (lastStep = boss step - 1) |
| MapScreen.svelte:228 | {node name} | h1, the node the player is at |
| MapScreen.svelte:229 | Pick the road ahead. | sub line |
| MapScreen.svelte:233 | The map | aria-label of the map panel |
| MapScreen.svelte:282 | {node name, wrapped to 2 lines} | node label on the drawn map (SVG text) |
| MapScreen.svelte:287 | {placeName} | node kind under each label on the map (uppercase via CSS): Camp, Town, Well, Boss or a zone type name |
| MapScreen.svelte:301 | You | map key |
| MapScreen.svelte:302 | Corrupted | map key |
| MapScreen.svelte:303 | A front | map key |
| MapScreen.svelte:304 | Cleansed | map key |
| MapScreen.svelte:309 | Where next | h2 over the choice cards |
| MapScreen.svelte:318 | {node name} | choice card title |
| MapScreen.svelte:319 | {placeName} zone | choice card kind for a zone (e.g. "Blight zone") |
| MapScreen.svelte:319 | {placeName} | choice card kind for a town, Well or the boss |
| MapScreen.svelte:319 |  • Corrupted | appended to a corrupted choice's kind |
| MapScreen.svelte:323 | Free clue | row label on a zone choice card (value FREE_CLUE / "No free clue") |
| MapScreen.svelte:324 | Rule | row label on a zone choice card (value ZONE_RULE) |
| MapScreen.svelte:326 | A hidden modifier waits here; twice the loot. | note on a corrupted zone choice (multiplier 2) |
| MapScreen.svelte:326 | A hidden modifier waits here; {multiplier} times the loot. | same, other multiplier |
| MapScreen.svelte:329 | {placeDoes} | line on a non-zone choice card (town, Well, boss; see Town, Well, Boss) |
| MapScreen.svelte:332 | Each front still alive adds a modifier: {n front(s)} now. | note on the boss choice card while fronts live |
| MapScreen.svelte:332 | No front is alive: no modifiers. | note on the boss choice card with no live front |
| words.ts:130 | {n item(s)}. {free clue}. | placeDoes for a zone (e.g. "3 items. A small burn-in."); defined but zone cards show Free clue/Rule rows instead |
| src/data/wraeclast.json:6 | Clearfell Encampment | map node name (the camp): map labels, choice cards, screen headings, Hud, End route |
| src/data/wraeclast.json:14 | The Red Vale | map node name |
| src/data/wraeclast.json:22 | The Grelwood | map node name |
| src/data/wraeclast.json:30 | Freythorn | map node name |
| src/data/wraeclast.json:38 | Ogham Farmlands | map node name |
| src/data/wraeclast.json:46 | Maraketh | map node name |
| src/data/wraeclast.json:54 | Qimah | map node name |
| src/data/wraeclast.json:62 | Ogham Manor | map node name |
| src/data/wraeclast.json:70 | Pools of Khatal | map node name |
| src/data/wraeclast.json:78 | Kaom's Stronghold | map node name |
| src/data/wraeclast.json:86 | The Halani Gates | map node name |
| src/data/wraeclast.json:94 | The Bone Pits | map node name |
| src/data/wraeclast.json:102 | Buried Shrines | map node name |
| src/data/wraeclast.json:110 | The Library | map node name |
| src/data/wraeclast.json:118 | Temple of Kopec | map node name |
| src/data/wraeclast.json:126 | Pondium | map node name |
| src/data/wraeclast.json:134 | Ziggurat Encampment | map node name |
| src/data/wraeclast.json:142 | Kriar Village | map node name |
| src/data/wraeclast.json:150 | The Cuachic Vault | map node name |
| src/data/wraeclast.json:158 | The Lunaris Temple | map node name |
| src/data/wraeclast.json:166 | The Weaver's Chambers | map node name |
| src/data/wraeclast.json:174 | The Causeway | map node name |
| src/data/wraeclast.json:182 | The Fellshrine Ruins | map node name |
| src/data/wraeclast.json:190 | Holten | map node name |
| src/data/wraeclast.json:198 | Journey's End | map node name |
| src/data/wraeclast.json:206 | Heart of the Tribe | map node name |
| src/data/wraeclast.json:214 | The Forest Encampment | map node name |
| src/data/wraeclast.json:222 | The Upper Prison | map node name |
| src/data/wraeclast.json:230 | The Submerged Passage | map node name |
| src/data/wraeclast.json:238 | Trial of the Ancestors | map node name |
| src/data/wraeclast.json:246 | The Karui Fortress | map node name |
| src/data/wraeclast.json:254 | Tidal Island | map node name |
| src/data/wraeclast.json:262 | Cape Awanotui | map node name |
| src/data/wraeclast.json:270 | The Brine King's Reef | map node name |
| src/data/wraeclast.json:278 | Twilight Strand | map node name |
| src/data/wraeclast.json:286 | Oriath Harbour | map node name |
| src/data/wraeclast.json:294 | The Cathedral Rooftop | map node name |

## Item screen

ItemScreen.svelte (plate, dock), Inscription.svelte (answer line, board), Veil.svelte (art).

| file:line | exact text | where/when it shows |
|---|---|---|
| ItemScreen.svelte:59 | The item | aria-label of the tooltip section |
| ItemScreen.svelte:64 | {item name} | name plate once named |
| ItemScreen.svelte:65 | {base type} | under the name once named (from clues.json) |
| ItemScreen.svelte:67 | Unidentified | name plate before it's named |
| ItemScreen.svelte:69 | {Hidden name}: {hidden does} {zone rule or Silent rule} {Mod name}: {mod does} ... | title (hover/long press) on the plate's terms: all the item's terms joined by spaces (built at :39) |
| ItemScreen.svelte:70 | Corrupted • {Hidden name} | red line under "Unidentified" in a corrupted zone (e.g. "Corrupted • Blood toll") |
| ItemScreen.svelte:71 | Silent • {Mod name} • {Mod name} | red line under "Unidentified" at the boss ("Silent" alone with no modifiers) |
| ItemScreen.svelte:71 | {zone rule} | cool line under "Unidentified" for a zone with a rule (not "No rule") |
| ItemScreen.svelte:93 | ✓ | verdict sign once named |
| ItemScreen.svelte:95 | {item name} | dock line once named |
| ItemScreen.svelte:96 | Named. | dock small line once named at the boss |
| ItemScreen.svelte:96 | Loot: {n card(s)} | dock small line once named in a zone (with small card pips) |
| ItemScreen.svelte:96 |  The flask heals +{healed}. | appended when the flask's ongoing heal came in on the right answer |
| ItemScreen.svelte:34 | Take the loot | dock button once named in a zone |
| ItemScreen.svelte:34 | Next item | dock button once named at the boss, more boss items left |
| ItemScreen.svelte:34 | Claim the win | dock button once the boss's last item is named |
| ItemScreen.svelte:103 | ✕ | verdict sign after a miss |
| ItemScreen.svelte:106 | −{lost} life | dock after a miss |
| ItemScreen.svelte:107 | Misses here cost {lo} to {hi}. | small line after a miss at the boss |
| ItemScreen.svelte:107 | The deal: {n card(s)} | small line after a miss in a zone (with card pips, lost ones dashed) |
| ItemScreen.svelte:112 | Miss: {lo} to {hi} life | dock stakes before a submit |
| ItemScreen.svelte:114 | No loot at the boss | dock stakes at the boss |
| ItemScreen.svelte:116 | {n card(s)} {full} | dock stakes in a zone: the deal, the full deal struck through after misses |
| ItemScreen.svelte:118 | Sent already: change the line | dock warning when the same line was submitted before |
| ItemScreen.svelte:121 | Drink a flask charge: {charges} left | aria-label of the drink button |
| ItemScreen.svelte:121 | Drink: +10 now, +10 after each of the next 2 items | title (tooltip) of the drink button (hardcoded numbers) |
| ItemScreen.svelte:122 | {charges} | badge on the drink button |
| ItemScreen.svelte:124 | Identify | submit button |
| Inscription.svelte:27 | Your inscription | aria-label of the answer line |
| Inscription.svelte:29 | Tiles per word: {a · b · c} | aria-label of the word-lengths tab |
| Inscription.svelte:30 | Tiles per word | tab on the answer line once word lengths are shown (Ritual free clue / Word lengths) |
| Inscription.svelte:40 | {tile} | placed tile text on the answer line |
| Inscription.svelte:44 | {tile}, locked | aria-label of the locked first tile (First syllable) |
| Inscription.svelte:44 | {tile}, {gold/silver/struck}: take it back | aria-label of a marked placed tile after a miss |
| Inscription.svelte:44 | Take back {tile} | aria-label of a placed tile |
| Inscription.svelte:49 | Tap the tiles in order | placeholder on the empty answer line |
| Inscription.svelte:49 | The item is opening | placeholder on the empty line before the item opens |
| Inscription.svelte:53 | Clear the line | aria-label of the Clear button |
| Inscription.svelte:53 | Clear | title (tooltip) of the Clear button |
| Inscription.svelte:57 | The tiles | aria-label of the board |
| Inscription.svelte:60 | {tile} | board tile text (and aria-label when unmarked) |
| Inscription.svelte:60 | {tile}, {gold/silver/struck} | aria-label of a marked board tile |
| Veil.svelte:163 | The item, named | aria-label of the art once named |
| Veil.svelte:163 | The item under the Veil, parts of it burned in | aria-label of the art after a burn-in |
| Veil.svelte:163 | The item, under the Veil | aria-label of the art before any burn-in |
| Veil.svelte:166 | Lifting the Veil | loading text in the art frame while the art decodes |

## Hud/run bar

| file:line | exact text | where/when it shows |
|---|---|---|
| Hud.svelte:27 | Where the run is | aria-label of the header |
| Hud.svelte:30 | {node name} | header, the node the player is at |
| Hud.svelte:32 | {placeName} | header kind line (Camp, Town, Well, Boss, zone type) |
| Hud.svelte:32 |  • Item {done+1} of {items} | appended during an item |
| Hud.svelte:32 |  • Corrupted | appended at a corrupted zone outside an item (red) |
| Hud.svelte:357 | • | CSS `content` separator before the kind line on wide screens |
| Hud.svelte:38 | You: {life} life, {gold} gold | aria-label of the player's pill |
| Hud.svelte:39 | E | avatar letter |
| Hud.svelte:41 | Exile | player's name on the pill |
| Hud.svelte:43 | Life | aria-label of the life vessel (meter) |
| Hud.svelte:51 | {life} | life number |
| Hud.svelte:51 | −{hit} | after the life number while a missed line stands |
| Hud.svelte:51 | +{due} | after the life number while the flask still heals |
| Hud.svelte:52 | Flask: {charges} of {max} charges. {FLASK_LINE} | aria-label of the flask charges |
| Hud.svelte:52 | {FLASK_LINE} | title (tooltip) of the flask charges |
| words.ts:176 | A drink heals {FLASK_STEP} at once, and {FLASK_STEP} as each of the next {FLASK_ITEMS} items ends. Drink during an item. | FLASK_LINE (renders "A drink heals 10 at once, and 10 as each of the next 2 items ends. Drink during an item."); Hud tooltip and Vendor flask panel |
| Hud.svelte:59 | {gold} | gold on the pill |
| Hud.svelte:62 | The boss | aria-label of the step plaque at the boss |
| Hud.svelte:62 | The | step plaque top word at the boss |
| Hud.svelte:62 | Boss | step plaque value at the boss |
| Hud.svelte:64 | Step {step} of {lastStep} | aria-label of the step plaque |
| Hud.svelte:64 | Step | step plaque top word |
| Hud.svelte:64 | {step}/{lastStep} | step plaque value |
| Hud.svelte:67 | The flask still heals {FLASK_STEP} after each of the next {recovering} of {FLASK_ITEMS} items. | screen-reader-only line while the flask is still healing |

## Clues

Clues.svelte and ClueText.svelte: the known lines beside the art. The clue texts themselves (category, base, mod lines, flavour, support text) come from src/data/clues.json per item.

| file:line | exact text | where/when it shows |
|---|---|---|
| Clues.svelte:26 | {category} | category line once named |
| Clues.svelte:28 | Category reveal | label over the category line (Category reveal supply) |
| Clues.svelte:28 | {category} | category line after a Category reveal |
| Clues.svelte:31 | Zone • its support text | label over a gem's support text given free (Essence) |
| Clues.svelte:31 | Zone • the base type | label over the base type given free (Essence) |
| Clues.svelte:31 | Base reveal • support text | label over a gem's support text from a Base reveal |
| Clues.svelte:31 | Base reveal | label over the base type from a Base reveal |
| Clues.svelte:31 | {base type or support text} | the base line (masked name words shown as bars) |
| Clues.svelte:37 | Zone • a common mod line | label over the first mod line given free (Plain, Expedition) |
| Clues.svelte:37 | Scroll of Wisdom | label over a mod line a Scroll showed |
| Clues.svelte:37 | {mod line} | each mod line (all lines once named, unlabelled) |
| Clues.svelte:43 | Zone • flavour text | label over flavour given free (Incursion) |
| Clues.svelte:43 | Lore | label over flavour a Golden Page showed |
| Clues.svelte:44 | {flavour verse} | flavour text lines |
| Clues.svelte:48 | Zone • word lengths | label of the Ritual free clue |
| Clues.svelte:48 | On the line: a dot for each tile, grouped by word. | Ritual free clue text |
| Clues.svelte:51 | Boss • a burn-in | label at the boss's first item (free burn-in) |
| Clues.svelte:51 | Zone • a burn-in | label in a Blight zone (free burn-in) |
| Clues.svelte:51 | The boss burned in a patch of the art. | text at the boss's first item |
| Clues.svelte:51 | The zone burned in a patch of the art. | text in a Blight zone |
| Clues.svelte:54 | Nothing is known of it yet. | empty state with no clue shown |
| Clues.svelte:58 | ✕ | mark on a tried wrong name |
| Clues.svelte:58 | {tile·tile·tile} | the tried wrong line, struck through |
| Clues.svelte:58 | −{lost} | life the tried line cost |
| ClueText.svelte:9 | A word of the item's name | title (tooltip) of a masked word bar |
| ClueText.svelte:9 | a word of its name | screen-reader text inside a masked word bar |
| words.ts:89 | Zone | FREE_LABEL, the first word of the "Zone • ..." labels above |

## Pack

| file:line | exact text | where/when it shows |
|---|---|---|
| ItemPack.svelte:21 | Your pack | aria-label of the pack row on an item |
| ItemPack.svelte:25 | {why off} | title (tooltip) of a slot that does nothing here (see Supplies, why) |
| ItemPack.svelte:25 | {Supply name}: {does} | title (tooltip) of a usable slot |
| ItemPack.svelte:25 | {Supply name}, a stack of {n}: {why off} | aria-label of an off slot |
| ItemPack.svelte:25 | {Supply name}, a stack of {n}. {does} | aria-label of a usable slot |
| ItemPack.svelte:26 | {n} | count badge on a slot |
| ItemPack.svelte:28 | {short name} | slot label (hidden when compact) |
| ItemPack.svelte:33 | Your pack is empty. Only Flares work here. | empty pack on a boss item |
| ItemPack.svelte:33 | Your pack is empty. | empty pack on a zone item |
| PackList.svelte:14 | The pack: {stacks} of {PACK_STACKS} stacks, up to {STACK_MAX} each | aria-label of the pack grid (vendor, loot) (defaults 8 and 5) |
| PackList.svelte:19 | Replace {Supply name} × {n} | aria-label of a stack button in the loot's swap |
| PackList.svelte:20 | {short name} | stack label (swap) |
| PackList.svelte:20 | {n} | stack count badge (swap) |
| PackList.svelte:23 | {Supply name} × {n} | title (tooltip) of a stack (vendor, loot) |
| PackList.svelte:24 | {short name} | stack label |
| PackList.svelte:24 | {n} | stack count badge |
| PackList.svelte:27 | Empty | aria-label of an empty slot |
| Vendor.svelte:67 | Pack | h2 of the pack panel at a vendor |
| Vendor.svelte:69 | Eight stacks of up to five. A ware is bought only when its whole stack fits. | note under the pack at a vendor |

## Supplies

Each supply: full name (rules.ts SUPPLY_NAMES), short name (words.ts SHORT, pack slot label), what it does (words.ts does(): vendor card line, pack tooltip/aria), why it's off once used up (words.ts why()), vendor stack and price (words.ts stackLine with default tuning).

| file:line | exact text | where/when it shows |
|---|---|---|
| rules.ts:44 | Flare | full name: vendor card title, loot card title, pack tooltip, End lists |
| words.ts:53 | Flare | short name on pack slots |
| words.ts:33 | Burns in a cluster of the art at a random spot. | Flare: what it does |
| words.ts:160 | The art is all burned in | Flare: why off once the art is all in |
| rules.ts:119-120 | 3 for 6 gold | Flare: vendor plaque (stackLine) |
| rules.ts:45 | Scroll of Wisdom | full name |
| words.ts:54 | Wisdom | short name |
| words.ts:35 | The next mod line, from the most common to the rarest. | Scroll of Wisdom: what it does |
| words.ts:162 | Nothing left to read | Scroll of Wisdom: why off once every mod line is shown |
| rules.ts:119-120 | 3 for 6 gold | Scroll of Wisdom: vendor plaque |
| rules.ts:46 | Golden Page | full name |
| words.ts:55 | Page | short name |
| words.ts:37 | The flavour text, name words masked. | Golden Page: what it does |
| words.ts:164 | Nothing to show | Golden Page: why off (flavour shown or none) |
| rules.ts:119-120 | 2 for 6 gold | Golden Page: vendor plaque |
| rules.ts:47 | Category reveal | full name |
| words.ts:56 | Category | short name |
| words.ts:39 | The item's category. | Category reveal: what it does |
| words.ts:170 | Shown already | Category reveal: why off once shown |
| rules.ts:119-120 | 2 for 6 gold | Category reveal: vendor plaque |
| rules.ts:48 | Base reveal | full name |
| words.ts:57 | Base | short name |
| words.ts:41 | The base type (a gem: its support text). | Base reveal: what it does |
| words.ts:170 | Shown already | Base reveal: why off once shown |
| rules.ts:119-120 | 1 for 6 gold | Base reveal: vendor plaque |
| rules.ts:49 | Decoy sweep | full name |
| words.ts:58 | Sweep | short name |
| words.ts:43 | Strikes {DECOY_SWEEP} decoy tiles. | Decoy sweep: what it does ("Strikes 4 decoy tiles.") |
| words.ts:166 | Nothing left to strike | Decoy sweep: why off when no unstruck decoy is left |
| rules.ts:119-120 | 3 for 6 gold | Decoy sweep: vendor plaque |
| rules.ts:50 | Word lengths | full name |
| words.ts:59 | Lengths | short name |
| words.ts:45 | How many words the name has, and the tiles in each. | Word lengths: what it does |
| words.ts:170 | Shown already | Word lengths: why off once shown |
| rules.ts:119-120 | 3 for 4 gold | Word lengths: vendor plaque |
| rules.ts:51 | First syllable | full name |
| words.ts:60 | First | short name |
| words.ts:47 | Places the name's first tile on the line, locked. | First syllable: what it does |
| words.ts:168 | Placed already | First syllable: why off once placed |
| rules.ts:119-120 | 2 for 6 gold | First syllable: vendor plaque |
| words.ts:179 | {stack} for {price} gold | stackLine template behind every vendor plaque above |
| words.ts:148 | The item is opening | why any supply is off while the item is still opening |
| words.ts:150 | Silent: only Flares work | why a non-Flare is off at the boss |
| words.ts:152 | Sealed: no supplies work here | why every supply is off in a Sealed zone |
| words.ts:154 | Dark: the art can't be revealed | why a Flare is off in a Dark zone |
| words.ts:156 | Ritual: Scrolls don't work here | why a Scroll of Wisdom is off in a Ritual zone |

## Vendor

General vendor screen (camp-only strings in Camp/Threshold, town-only in Town).

| file:line | exact text | where/when it shows |
|---|---|---|
| Vendor.svelte:20 | Expedition vendor | h1 of the vendor after an Expedition zone |
| Vendor.svelte:29 | The Expedition's vendor deals its wares after the zone. | sub line after an Expedition zone |
| Vendor.svelte:36 | The vendor's wares | screen-reader heading of the wares table |
| Vendor.svelte:37 | {gold} gold to spend. | purse line over the wares |
| Vendor.svelte:46 | {Supply name} | ware card title |
| Vendor.svelte:47 | {does} | ware card line (see Supplies) |
| Vendor.svelte:48 | {stack} for {price} gold | ware card plaque |
| Vendor.svelte:49 | Buy {stack} {Supply name} for {price} gold | aria-label of a ware card |
| Vendor.svelte:58 | Sold | in a ware's place once bought |
| Vendor.svelte:72 | Flask | h2 of the flask panel |
| Vendor.svelte:73 | {charges} of {max} charge. {FLASK_LINE} A Well refills every charge. | flask panel text (max 1) |
| Vendor.svelte:73 | {charges} of {max} charges. {FLASK_LINE} A Well refills every charge. | flask panel text (max not 1; default 2) |
| Vendor.svelte:78 | To the map | primary button leaving a town or Expedition vendor |

## Loot/Dealt cards

| file:line | exact text | where/when it shows |
|---|---|---|
| Loot.svelte:21 | {item name} named | kicker on the loot screen |
| Loot.svelte:22 | Loot | h1 on the loot screen |
| Loot.svelte:25 | {n card(s)}, all yours. | sub line before collecting |
| Loot.svelte:25 |  A miss cost {n card(s)}. | appended after one miss |
| Loot.svelte:25 |  Misses cost {n card(s)}. | appended after more misses |
| Loot.svelte:25 |  Corrupted ({Hidden name}): the deal doubled. | appended in a corrupted zone (says "doubled" whatever the multiplier) |
| Loot.svelte:27 | The pack is full: the {Supply name} can replace a stack, or be left. | sub line when a supply card doesn't fit |
| Loot.svelte:29 | Collected. | sub line once collected |
| Loot.svelte:40 | {card name} | loot card title (lootLine) |
| Loot.svelte:41 | {card gives} | loot card line (lootLine) |
| Loot.svelte:42 | {gold} gold | plaque on a gold or jackpot card |
| Loot.svelte:42 | × {n} | plaque on a supply card |
| Loot.svelte:44 | Collect the loot | aria-label of each loot card |
| Loot.svelte:57 | Replace a stack with {Supply name} × {n} | h2 of the swap panel |
| Loot.svelte:59 | Leave the {Supply name} | ghost button in the swap panel |
| Loot.svelte:65 | Collect | primary button before collecting |
| Loot.svelte:16 | Next item | primary button once collected, more items in the zone |
| Loot.svelte:16 | On to the map | primary button once collected, the zone's last item |
| words.ts:185 | Gold | gold card title |
| words.ts:185 | +{gold} gold | gold card line (default 4 to 8 early, 6 to 10 mid, 8 to 12 late) |
| words.ts:187 | Jackpot | jackpot card title (warmer plaque) |
| words.ts:187 | +{gold} gold | jackpot card line (default +25 gold) |
| words.ts:189 | Flask charge | flask card title |
| words.ts:189 | Refills an empty charge | flask card line |
| words.ts:191 | {Supply name} | supply card title |
| words.ts:191 | {n} into the pack | supply card line (default "2 into the pack") |
| DealtCard.svelte:111 | Unidentified | title on a card's back (face down while dealt; the corruption card before it turns) |

## Town

| file:line | exact text | where/when it shows |
|---|---|---|
| Vendor.svelte:20 | Town | h1 of the vendor screen in a town |
| Vendor.svelte:30 | The town heals you {heal} life. The vendor deals its wares again. | sub line arriving hurt at a town |
| Vendor.svelte:31 | You arrive at full life. The vendor deals its wares again. | sub line arriving at full life |
| words.ts:118 | Town | node kind word (map label, choice card, Hud) |
| words.ts:134 | Heals 20 life; the vendor deals every ware. | placeDoes for a town (map choice card); 20 hardcoded |

## Well

| file:line | exact text | where/when it shows |
|---|---|---|
| Threshold.svelte:44 | Well | kicker on the Well screen |
| Threshold.svelte:47 | The Well refills your flask. | sub line on the Well screen |
| Threshold.svelte:54 | The Well | aria-label of the Well panel |
| Threshold.svelte:56 | Flask | term label |
| Threshold.svelte:56 | {charges} of {max} charges | value |
| Threshold.svelte:57 | Life | term label |
| Threshold.svelte:57 | {life} of {maxLife}; the Well heals no life | value |
| Threshold.svelte:119 | Go on | primary button leaving the Well |
| words.ts:120 | Well | node kind word (map label, choice card, Hud) |
| words.ts:136 | Refills every flask charge. Heals no life. | placeDoes for a Well (map choice card) |

## Corruption

| file:line | exact text | where/when it shows |
|---|---|---|
| map.ts:94 | Blood toll | hidden modifier name |
| map.ts:94 | Sealed | hidden modifier name |
| map.ts:94 | Swarming | hidden modifier name |
| map.ts:94 | Dark | hidden modifier name |
| map.ts:94 | Bounty | hidden modifier name |
| words.ts:95 | Each item takes {BLOOD_TOLL} life as it opens. | Blood toll: what it does ("10 life") |
| words.ts:96 | Supplies don't work here; the flask still does. | Sealed: what it does |
| words.ts:97 | {SWARMING_DECOYS} more decoys. | Swarming: what it does ("8 more decoys.") |
| words.ts:98 | The art can't be revealed. | Dark: what it does |
| words.ts:99 | No catch. | Bounty: what it does |
| Threshold.svelte:64 | Corrupted | h2 over the corruption card at a corrupted zone's threshold |
| Threshold.svelte:68 | {Hidden name} | corruption card title (after it turns up) |
| Threshold.svelte:69 | {hidden does} | corruption card line |
| Threshold.svelte:70 | Hidden modifier: {Hidden name}. {hidden does} | aria-label of the corruption card |
| Threshold.svelte:79 | Corruption hides a modifier here, and pays for it: loot is doubled. Name every item to cleanse the zone. | note under the card (multiplier 2) |
| Threshold.svelte:79 | Corruption hides a modifier here, and pays for it: loot is {multiplier} times. Name every item to cleanse the zone. | same, other multiplier |

(Other corruption strings sit with their screens: map key and choice cards in Map, the Hud's " • Corrupted", the item plate's "Corrupted • {name}", the loot sub line, the End screen's Corruption met.)

## Boss

| file:line | exact text | where/when it shows |
|---|---|---|
| Threshold.svelte:44 | The boss | kicker on the boss's threshold |
| Threshold.svelte:48 | {BOSS_RULE}. No loot; beat it to win the run. | sub line ("Silent: only Flares work. No loot; beat it to win the run.") |
| Threshold.svelte:84 | The boss | aria-label of the boss's terms panel |
| Threshold.svelte:90 | Rule | term label at the boss |
| Threshold.svelte:90 | {BOSS_RULE} | value |
| Threshold.svelte:99 | Modifiers | heading over the boss's modifiers |
| Threshold.svelte:103 | {Mod name} {mod does} | each modifier (e.g. "Bloodied Misses cost 10 more life.") |
| Threshold.svelte:107 | No corruption reached the boss. | no modifiers |
| Threshold.svelte:121 | Face the boss | primary button at the boss's threshold |
| words.ts:91 | Silent: only Flares work | BOSS_RULE (threshold, item plate title, placeDoes) |
| words.ts:122 | Boss | node kind word (map label, choice card, Hud) |
| words.ts:138 | {BOSS_RULE}. No loot. | placeDoes for the boss (map choice card) |
| map.ts:99 | Lingering | boss modifier name |
| map.ts:99 | Bloodied | boss modifier name |
| map.ts:99 | Murky | boss modifier name |
| map.ts:99 | Teeming | boss modifier name |
| words.ts:104 | A fourth item. | Lingering: what it does |
| words.ts:105 | Misses cost {BLOODIED} more life. | Bloodied: what it does ("10 more life") |
| words.ts:106 | Flares burn in half as much. | Murky: what it does |
| words.ts:107 | {TEEMING_DECOYS} more decoys. | Teeming: what it does ("8 more decoys.") |

## End screen

| file:line | exact text | where/when it shows |
|---|---|---|
| End.svelte:69 | The boss is beaten | kicker on a win |
| End.svelte:69 | Fell at {node name} | kicker on a loss |
| End.svelte:70 | The run is won | h1 on a win |
| End.svelte:70 | The run is lost | h1 on a loss |
| End.svelte:72 | {named} items named, with {lifeEnd} life left. | sub line on a win |
| End.svelte:72 | {item name} took the last of your life. | sub line on a loss |
| End.svelte:72 | The road | fallback for {item name} on a loss with no item |
| End.svelte:76 | The run in numbers | aria-label of the numbers panel |
| End.svelte:78 | Named | label (value: count) |
| End.svelte:79 | Misses | label |
| End.svelte:80 | Life at the end | label |
| End.svelte:81 | Flask drinks | label |
| End.svelte:82 | Gold earned | label |
| End.svelte:83 | Gold spent | label |
| End.svelte:84 | Fronts | label |
| End.svelte:84 | {seeded} seeded • {stopped} stopped • {alive} alive at the boss | Fronts value (last part only when the boss was reached) |
| End.svelte:85 | Boss modifiers | label |
| End.svelte:85 | {Mod} • {Mod} | value |
| End.svelte:85 | Not reached | value when the boss wasn't reached |
| End.svelte:85 | None | value when the boss had no modifiers |
| End.svelte:86 | Corruption met | label |
| End.svelte:86 | {Hidden name} • {Hidden name} | value |
| End.svelte:86 | None | value with no corruption met |
| End.svelte:87 | Loot taken | label |
| End.svelte:27 | {Kind} {taken} of {dealt} | Loot taken value, joined " • " (e.g. "Gold 5 of 5 • Supplies 2 of 3") |
| End.svelte:28 | None | Loot taken value with no loot dealt |
| End.svelte:24 | Gold | loot kind word in Loot taken |
| End.svelte:24 | Supplies | loot kind word |
| End.svelte:24 | Flask | loot kind word |
| End.svelte:24 | Jackpot | loot kind word |
| End.svelte:88 | Bought | label |
| End.svelte:89 | Found | label |
| End.svelte:90 | Used | label |
| End.svelte:22 | {Supply name} × {n} | Bought/Found/Used value, joined " • " |
| End.svelte:23 | Nothing | Bought/Found/Used value when empty |
| End.svelte:91 | Route | label |
| End.svelte:91 | {node} • {node} • ... | Route value |
| End.svelte:97 | Copied: the last {n} run, to paste to the owner. | status over the buttons after copying (1 run) |
| End.svelte:97 | Copied: the last {n} runs, to paste to the owner. | same, several runs |
| End.svelte:97 | It couldn't be copied here: copy it by hand from the log below. | status when the clipboard fails |
| End.svelte:98 | Copy run log | primary button |
| End.svelte:99 | New run | ghost button |
| End.svelte:102 | The log holds the last {n} run on this device. | foot line (1 run) |
| End.svelte:102 | The log holds the last {n} runs on this device. | foot line (several) |
| End.svelte:103 | Show it | link button that shows the log |
| End.svelte:108 | Run log | h2 of the shown log |
| End.svelte:109 | It couldn't be copied here: select it all and copy it by hand. | note over the log after a failed copy |
| End.svelte:109 | Every run kept on this device, newest last. | note over the log otherwise |
| End.svelte:110 | {"wraeclastRuns": [...]} | the log's JSON in a read-only textarea (runLog.ts:28 logText) |
| End.svelte:115 | Item by item | h2 of the item list |
| End.svelte:120 | {i} | item number |
| End.svelte:122 | {item name} | item name in the list |
| End.svelte:34 | Boss | where-line for a boss item |
| End.svelte:34 | Step {step} • {node name} • {Zone name} | where-line for a zone item |
| End.svelte:123 | {where} • {category} | item's line under its name |
| End.svelte:123 |  • {Hidden name} | appended for a corrupted item (red) |
| End.svelte:126 | {n} miss • | result prefix, one miss |
| End.svelte:126 | {n} misses • | result prefix, several misses |
| End.svelte:126 | +{gold} gold | result for a named item that earned gold |
| End.svelte:126 | Named | result for a named item with no gold |
| End.svelte:126 | Lost here | result for the item the run was lost on |
| End.svelte:127 |  • {n} supply | appended, one supply used |
| End.svelte:127 |  • {n} supplies | appended, several supplies used |

## Other

| file:line | exact text | where/when it shows |
|---|---|---|
| wraeclast.html:13 | PoE2.Quest • Wraeclast run | browser tab title (page at the worktree root) |
| main.ts:18 | The Wraeclast run only runs on the dev server and the beta, from wraeclast.html. | thrown error (shown only as an uncaught error, no UI) on a build it isn't meant for |
| words.ts:27 | {n} {word}s / {n} {word}es / {n} {word} | plural() helper behind every "{n item(s)}", "{n card(s)}", "{n front(s)}" |
| DealtCard.svelte:120 | {title} | every dealt card's title (wares, loot, corruption) |
| DealtCard.svelte:121 | {line} | every dealt card's line |
| DealtCard.svelte:117 | {tag} | every dealt card's plaque |
| DealtCard.svelte:101 | {label} | every dealt card's aria-label (given by the screen) |
| ItemScreen.svelte:61 | (NamePlate component, src/components) | the name plate's frame; no text of its own here |

Notes: Glyph.svelte draws only aria-hidden SVG marks (no text). Page.svelte, Numbered.svelte, markup.ts, play.svelte.ts, runLog.ts (beyond the JSON shown on the End screen), tuning.ts hold no on-screen text; markup.ts SECTION_NAMES is used only by TuningPanel (skipped).
