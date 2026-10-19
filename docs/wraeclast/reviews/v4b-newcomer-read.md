# Wraeclast run v4b: newcomer read of the built screens

Read of `C:\projects\poe2-trivia\.claude\worktrees\wraeclast-playtest\src\wraeclast\` at commit 18971c1b (v4b), read-only; nothing was run, edited or committed there. Every `.svelte` file and every player-facing text in `words.ts`, `map.ts` and `rules.ts` was read, plus the `title`, `aria-label` and CSS `content` strings. Screens covered: camp and vendors, map and Where next, the item screen and its clues, supplies and the pack, the reveal and loot, towns and Wells, the boss intro, the end screen, tooltips, screen-reader labels, empty states. Wording was compared with `design-v4-wording.md` (its New text column; `design-v4-strings.md` is the v3.2 inventory it was built from).

Both reported departures are in the code as described, and are not counted below:
- Toll hit: `Hud.svelte:80` and `Hud.svelte:396` (CSS `content: ' toll'`) read "−10 toll" where the table says "−{BLOOD_TOLL} Blood toll".
- Map key: `MapScreen.svelte:326-331` has no "It moves on every 2nd step."; the foot keeps "It moves in 2 steps." (`MapScreen.svelte:169-171`).

Every other row of the wording table that has a screen was found verbatim: the Where next rows, map node and aria lines, item plate and tooltip, art aria, answer line, marks key, dock, run bar, clue labels, all nine supplies (names, short names, does lines, off lines), pack lines, the loot and full-pack lines, camp, town, Expedition and Well lines, Blood toll, the boss rules and the end labels. The differences are listed in section 1.

## 1. Differs from the agreed table (not the two departures)

| # | Screen | file:line | Now | Agreed table |
| --- | --- | --- | --- | --- |
| 1 | Vendor (camp, town, Expedition) | Vendor.svelte:90, MapScreen.svelte:345 | Primary button "Where next" opens the whole map over the vendor; a ghost button "Back" returns | "Set out" and "To the map" are gone; "tap a place under Where next to set out". The places are not on the vendor; "Back" has no row |
| 2 | Map (phone) | MapScreen.svelte:253-254, 379-381 | No visible instruction; "Pick where to go next. The lit places are one step ahead." is `display:none` under 860 px; the kickers "The camp" and "Step {step} of {last}" are gone (only a screen-reader h1 with the node name) | Both kickers and the task line are listed for the map |
| 3 | Map key | MapScreen.svelte:326-331 | No "You" entry | "You" stays |
| 4 | Boss intro | words.ts:95, Threshold.svelte:64 | "From the corruption at {place}" | "{rule} • from {the place its corruption started}" |
| 5 | Boss intro | Threshold.svelte:47, 55, 77-110; words.ts:93, 97, 201 | New lines: "Your other supplies stay in the pack." • "{n} corruption(s) reached the boss" • a "What you have" panel: Life, Flask "2 drinks left • each heals 10 now, and again as this item and the next end", Pack "• only Torches work here" | No rows. The flask sentence is a second wording of the one the table gives ("Heals {FLASK_STEP} now, and again when this item ends and when the next one ends.") |
| 6 | End | End.svelte:198-200, 221, 245-251 | A "Your road" panel: "Camp to boss, item by item" • columns "Map • Place • Items • Gold • Life" • key "Your road • Town • Well • Blood toll • Named • A miss" • "You rested: +N life" • "The corruption here is gone" | "Route" and "{node} • {node}" stay; none of these lines has a row |
| 7 | End | End.svelte:283, 337-346 | Facts "Time", "Reached Step n/10", "Gold left"; Gold panel "N earned • N spent", "N left at the end" | "Gold earned" and "Gold spent" stay as labels; no rows for Time, Reached, Gold left |
| 8 | End | End.svelte:114-116, 260, 266 | "{rule} • Stopped at {place}" • "Reached the boss from {place}" • "Still at {place}" • "boss not reached" • seal aria "Alive" and "Stopped" | No rows |
| 9 | Vendor, full pack | words.ts:219-220, Vendor.svelte:86-87 | "Hand it back" and "Hand them back"; aria "Hand back 3 Torch, for your 10 gold" | Only "Pack full. Tap a space to replace it" has a row |
| 10 | Reveal | ItemScreen.svelte:245, 281 | Aria "The loot: 3 cards, going into your pack" and "Torch: 4 in your pack, 2 new" | No rows |
| 11 | Clues (Ancient Orb) | Clues.svelte:80 | With no sibling the line shows the item's category text under the label "Ancient Orb" | "{sibling name} • the same kind as this one" only; the design says the Orb never names the category |

Count: 11 (rows 5 to 8 and 10 are new text with no table row; 1 to 4, 9 and 11 are changed or dropped lines).

## 2. A newcomer would stumble (most confusing first)

Suggestions are written to fit one or two lines at 375 px.

| # | Screen | file:line | Now | Why it stumbles | Suggested |
| --- | --- | --- | --- | --- | --- |
| 1 | Map key | MapScreen.svelte:169-171 (shown :329) | "It moves in 2 steps. Name every item in its zone to stop it." • "It moves after this step." | "It" follows the Blood toll line, so it could be the toll, the zone or you; "its zone" has the same problem; "this step" is whose step? | "Blood toll moves on in 2 steps. Name every item in its zone to stop it." • "Blood toll moves on after your next pick." |
| 2 | Map key, Hud, Where next aria | MapScreen.svelte:168, 153, 165; Hud.svelte:51; ItemScreen.svelte:177 | "Blood toll (corruption): −10 life per item, double loot" | A second name in brackets; "corruption" is never explained before the boss intro, and the key never says why the player should care | Key as three short lines: "Blood toll: −10 life per item, double loot" • "Moves on in 2 steps. Name every item there to stop it." • "Still out at the boss, it makes the boss harder." Drop "(corruption)" from the aria lines |
| 3 | Flask (Hud tooltip, drink key, boss intro, screen reader) | words.ts:198-205; Hud.svelte:82; ItemScreen.svelte:407; Threshold.svelte:90 | "Heals 10 now, and again when this item ends and when the next one ends." (boss intro: "each heals 10 now, and again as this item and the next end") | The line the owner flagged, reworded but still two ideas; "this item" and "the next one" make the player add up 30; two different wordings; only in a `title`, which a phone never shows | One line everywhere: "Heals 10 now, 10 after this item, 10 after the next." Screen reader: "Your flask heals 10 more after this item and 10 after the next." |
| 4 | Where next, map node, plate | words.ts:118, 120, 124; MapScreen.svelte:165, 304-305, 360; ItemScreen.svelte:176, 333 | "If it reaches the boss: Lingering" • node "Boss: Lingering" • boss row "Only Torches work • Lingering • Murky" | Bare rule names (Lingering, Bloodied, Murky, Teeming); only the boss intro says what they do, and the boss row names them twice (line 1, then again with the does line) | "If it reaches the boss: one more item" • "...: misses cost 10 more" • "...: Torches reveal half" • "...: more wrong tiles"; node "Boss: +1 item"; boss row line 1 just "Only Torches work", then the does lines already under it |
| 5 | Item plate (boss) | ItemScreen.svelte:218 (tooltip :217, 50) | "Boss: Silent • Lingering • Murky" | Names with no meaning; the explanation is a hover `title`, no use on touch. "Silent" is also the lead of "Silent: only Torches work" (words.ts:89, Threshold.svelte:36, 46) | "Boss: only Torches work • one more item" (the does line, not the name); boss intro sub line "Only Torches work. Name all 3 items to win." |
| 6 | Dock (item) | ItemScreen.svelte:376, 386-395 | "Loot: 3 cards • a miss takes one" • after a miss "Loot: 2 cards" with a struck "3" after it • "Loot: 2 cards now" | "cards" is undefined before the first reveal; "takes one" has no noun; "2 cards 3" reads as a number list | "Loot: 3 rewards • each miss costs 1" • "Loot: 2 rewards (was 3)"; match the reveal aria (:245) |
| 7 | Clues, empty state | words.ts:250, Clues.svelte:93 | "No clues yet. Use a supply from your pack" | Shown on the boss's items 2 and later (rules.ts:1157-1158: only item 1 gets a free patch), where only Torches work, and sits above "Your pack is empty." when it is | Boss: "No clues yet. Only Torches work here." • Empty pack: "No clues yet." • Else unchanged |
| 8 | Where next, map choice | words.ts:63-64, 67; MapScreen.svelte:158-160; ItemScreen.svelte:162-163 | "Free clue: a mod line" • "Free clue: flavor text" | Not always true: rules.ts:1163-1177 gives word lengths when the item has no common mod line (Plain, Expedition) or no flavor (Incursion), and the item opens "Free • Word lengths" | "Free clue: a mod line, else word lengths" • "Free clue: flavor text, else word lengths" |
| 9 | Pack, flask, plate (touch) | ItemPack.svelte:28, 76-80; Hud.svelte:52, 82; ClueText.svelte:9 | What a supply does, what the flask does and what Blood toll does sit in `title` only; on phones the pack row is icon and count only | A tap on a slot spends the supply; there is no way to read it first on a phone | Show the does line as text: press and hold a slot shows "Torch: Reveals a patch of the art." above the row; the first time the drink key shows, a one-line hint under it |
| 10 | End | End.svelte:122-127, 285 | "Loot taken: Gold 5 of 5 • Supplies 2 of 3" | "5 of 5" of what? (cards, not gold) | "Loot cards taken: gold 5 of 5 • supplies 2 of 3" |
| 11 | End | End.svelte:259-260 | "Corruption: 3 at the start • 1 stopped • 2 reached the boss" | "3 at the start" of what; "reached" reads as a verb of the player | "Started with 3 • stopped 1 • 2 still out at the boss" |
| 12 | End | End.svelte:120, 267, 273-274; seal aria :266 | "Boss made harder by: Lingering • Murky" • "Murky • Still at Maraketh" • "Blood toll zones: 4" • aria "Alive" | Rule names without what they do; "Still at" ambiguous; "Blood toll zones" is how many (met? entered?) | "Murky (Torches reveal half as much) • Still at Maraketh" • "Blood toll zones entered: 4" • aria "Still out" |
| 13 | Dock after a right answer | ItemScreen.svelte:348 | "Named • 2 misses • Blood toll: double loot • Your flask healed 10 life • The corruption here is gone" | Up to four ideas in one small line; "Blood toll: double loot" reads as a cost | One idea a line: "2 misses" • "Double loot (Blood toll)" • "Flask healed 10" • "The Blood toll here is gone" |
| 14 | Scroll of Wisdom | words.ts:35 | "Shows a mod line. Each one is rarer than the last." | "Each one": each scroll or each line? | "Shows a mod line, rarer each time." |
| 15 | Expedition vendor | words.ts:212 | "A vendor, after the zone. Buy, or go on." | Describes the rule, not the moment (the zone is done) | "An Expedition vendor is here. Buy, or go on." |
| 16 | Camp vendor | words.ts:211 | "Buy supplies for the road. More vendors wait in towns and after Expeditions." | "Expeditions" is unexplained at the start | "...in towns and after Expedition zones." |
| 17 | Vendor, loot, pack, full pack | Vendor.svelte:59; words.ts:233; ItemScreen.svelte:270, 281, 298; PackList.svelte:30, 35; Threshold.svelte:100 | "Buy 3 Torch for 10 gold" • "2 Torch" • "3 Scroll of Wisdom" • "Replace 2 Torch with the new supply" | Singular names beside counts | Plural when n is not 1: "3 Torches", "3 Scrolls of Wisdom", "2 Tangled Fossils" |
| 18 | Vendor card (screen reader) | Vendor.svelte:59, DealtCard.svelte:49 | "Buy 3 Torch for 10 gold" | The label replaces the card's text, so the does line is never spoken | "Buy 3 Torches for 10 gold. Reveals a patch of the art." |
| 19 | Clues (Ancient Orb) | words.ts:247, Clues.svelte:80 | "Ventor's Gamble • the same kind as this one" | "this one": this what? (the design handoff said "the same kind of item") | "Ventor's Gamble • the same kind of item" |
| 20 | Clues (word lengths) | words.ts:248 | "Shown above the answer line: a dot for each tile, grouped by word" | Points elsewhere instead of saying it | "Dots above the answer line: one per tile, grouped by word." |
| 21 | Answer line | Inscription.svelte:83, 97 | Break key and gap: "Add a word break", "Remove this break" (icon-only, title and aria) | Never said that breaks are optional (checking ignores them), so a newcomer may think they must add them | "Add a word break (optional)" |
| 22 | Answer line | words.ts:189-193, Inscription.svelte:105 | "Gold: right, in its place • Silver: in the name, elsewhere • Struck: not in the name" | "elsewhere" is vague; three colour words | "Gold: right spot • Silver: wrong spot • Struck: not in the name" |
| 23 | Run bar | Hud.svelte:48, 94 | "Plain • Item 1 of 2" • at the camp "Step 0/10" | "Plain" alone reads as an adjective; there is no step 0 for a player | "Plain zone • Item 1 of 2" • at the camp "Start" (or hide the plaque) |
| 24 | Flask count | Threshold.svelte:90; Hud.svelte:82; ItemScreen.svelte:407 | "2 drinks left" • "Flask: 2 of 2 charges" • "Drink from your flask: 2 left" | Three words (drinks, charges, left) for one count | "charges" everywhere |
| 25 | Pack note | words.ts:223 | "8 spaces, up to 5 of one supply in each." | Fine, but "in each" trails | "8 spaces. Each holds up to 5 of one supply." |
| 26 | Pack slot | words.ts:60 | "First" (the First tile's short name) | "First" what? | "1st tile" |

Count: 26.

Gaps that are not lines but a newcomer meets first: the camp vendor says nothing of the run's goal (reach the boss, name its items), and no screen says that a wrong name marks tiles before the first miss (the marks key shows only after one).

## 3. Placeholders, raw keys, debug text, old names

| # | Screen | file:line | Now | Note | Suggested |
| --- | --- | --- | --- | --- | --- |
| 1 | End, "Show the log" (also opens by itself when copying fails) | End.svelte:391 and 155, runLog.ts:28 | `{"wraeclastRuns": [...]}` with the raw supply keys under bought, found, used: flare, wisdom, lore, category, decoy, lengths, first, deck | The handoff lets log keys stay; it is one tap from the end screen, so a player can see Flare, Decoy and Lore | Leave if the log is tester-only; else rename the keys in the written JSON |
| 2 | Tuning panel, at the foot of every screen (collapsed) | TuningPanel.svelte:73-75, 105, 107, 126-130, 150-151, 169 | "Tuning • The next run starts with these numbers." Inside: "Swarming and Teeming 8" (Swarming is gone in v4) • "Decoy names" • "A Torch burns in" • "Blight's free burn-in" • "The boss's first item, free" • "Seeds a side" • "Creeps every (steps)" • "Back to the handoff's" | Old names and banned words (burn-in, decoy, Swarming) on a panel every player can open; "handoff" is the team's word | Hide behind a tester switch, or reword: "reveals" for "burns in", drop Swarming, "tiles not in the name" for decoys |
| 3 | Clues (Ancient Orb) | Clues.svelte:80 | The category text under "Ancient Orb" when no sibling is found | Not a placeholder, but a stand-in that gives the category away | Show nothing, or "No other item of its kind" |
| 4 | End, tester lines | End.svelte:314, 322, 390 | "Copied: the last 2 runs, to paste to the owner." • "The log holds the last 2 runs on this device." • "Every run kept on this device, newest last." | Test-tool text in front of every player; the table keeps them | Fine for playtests; remove before main |

No other raw key reaches a player: supply keys go through `SUPPLY_NAMES` and `SHORT`, zone types through `ZONE_NAMES`, the modifier through "Blood toll", and every aria label was read for `flare`, `lore`, `category`, `decoy`, `first`, `deck`, "Flare", "Decoy sweep", "Category reveal", "Lore reveal", "First syllable", "Veil", "Inscription", "front", "cleanse", "burn-in" (none outside the tuning panel). No `TODO`, `undefined`, `null`, lorem or unfilled `{placeholder}` text found.

Count: 4 (rows 1, 2 and 4 are tester surfaces; row 3 is the one a normal player can meet).

## 4. Em dashes in player-facing text

None. Searched `src/wraeclast/*.svelte`, `*.ts`, `*.css`, `wraeclast.html`, and the data a player reads (`src/data/clues.json` mod lines and flavor text, `src/data/wraeclast.json` place names) for the em dash and the en dash, and for a spaced hyphen used as a dash: 0 found. The minus sign "−" appears only on numbers.

Count: 0.

## Counts

| Category | Count |
| --- | --- |
| 1. Differs from the table | 11 |
| 2. Newcomer stumbles | 26 |
| 3. Placeholders, raw keys, old names | 4 |
| 4. Em dashes | 0 |
