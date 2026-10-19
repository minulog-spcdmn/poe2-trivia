# Wraeclast prototype v5: code map

Read from the worktree `.claude/worktrees/wraeclast-playtest` (branch of v5, run log version `v: 4`). Dev server and beta only; the page is `wraeclast.html`, mounted by `src/wraeclast/main.ts`. Pure rules sit in `rules.ts` and `map.ts`; every screen is a Svelte view over one `Run`.

## Files

### Rules and data
- `src/wraeclast/rules.ts` (1789 lines). Everything the run does. Class `Run` (state in `run.state`, a plain object the page makes reactive). Exports: `Run`, `DEFAULT_TUNING`, `Tuning`, `SUPPLIES`/`SUPPLY_NAMES`, `LOOT_KINDS`, `SECTIONS`, item helpers (`dealPool`, `decoyNameCandidates`, `siblingOf`, `markLine`, `itemSeed`, `buildable`), `ITEMS`/`CLUES`/`SYLLABLES`, log types (`RunLog`, `ItemLog`), constants (`PACK_STACKS` 8, `STACK_MAX` 5, `BOSS_ITEMS` 3, `BLOOD_TOLL`, `BLOODIED`, `FLASK_STEP`).
- `src/wraeclast/map.ts`. The graph and what a run rolls on it: `buildGraph`/`GRAPH`, `rollPlaces`, `seedFronts`, `creep`, `bossRulesOf`, zone, hidden and boss-mod names. Pure.
- `src/data/wraeclast.json`. Hand-placed map: 32 nodes (camp step 0, boss step 10), kind camp, town, boss or open, x/y as fractions of the map art. Paths are built at load, never stored.
- `src/wraeclast/tuning.ts`. Reads, checks and keeps the tuning (`cleanTuning`, `readTuning`, `writeTuning`, `LIMITS`, `isDefault`); storage key `wraeclastTuning5`.
- `src/wraeclast/words.ts`. All player-facing wording of the rules (zone free clues, supplies, loot, corruption, boss rules). `markup.ts`: clue text to coloured runs and mask pieces.

### Page and state
- `main.ts`: guards dev/beta, installs sounds and cursor, mounts `Page`; exposes `window.wraeclast` in dev. `play.svelte.ts`: the `play` singleton holding `run`, `tuning`, `runs`; `start()`, `saveTuning()`, `keep()` (saves the log, posts it to the dev server). `runLog.ts`: keeps the last 20 logs in storage (`wraeclastRuns4`, filters `v === 4`), `logText` for the copy button.
- `Page.svelte`: picks the screen from `state.phase`; the map overlays a vendor or a reveal without changing the phase. Keeps the log after every item and at the end.

### Screens
- `Hud.svelte` header and strip (place, life vessel, flask, gold, step plaque). `Vendor.svelte` with `DealtCard.svelte` and `PackList.svelte` (camp, town, Expedition vendor). `MapScreen.svelte` (map plate and Where next). `Threshold.svelte` (boss). `ItemScreen.svelte` (item and reveal). `End.svelte` (win or loss, road, Copy run log, New run). `TuningPanel.svelte`. `screens.css` shared looks. `Glyph.svelte` supply and loot marks. `Numbered.svelte` tiny helper.
- Item parts: `Inscription.svelte` (answer line and tiles), `Clues.svelte` and `ClueText.svelte` (tooltip lines), `Veil.svelte` (art in burn-in patches), `ItemPack.svelte` (pack row on an item).

### Tools and tests
- `scripts/wraeclast-log-summary.mjs`: turns a log file, a folder or the copied JSON into plain text (about 40 lines a run, one line per item). Keeps its own copy of the supply and zone names; update by hand.
- `vite.config.ts`, plugin `wraeclastLogs()` (dev server only): POST `/__wraeclast/log` writes `.wraeclast-logs/<start>_<seed>.json`; checks content type and origin, 5 MB cap. `wraeclast` is also a beta build input.
- `tests/wraeclastFlow`, `Map`, `Economy` are current. `Item`, `Log`, `Supplies` are `@ts-nocheck` v3 tests, stale. `tests/wraeclastBot.ts` is the economy bot (about 1.9 supplies an item, 1 miss in 6 items) that `Economy` holds the tuning to.

## How a run flows
1. `new Run({tuning, seed})`: seeded rng; `rollPlaces` (zone or Well per open node), `seedFronts`; starts at the camp in phase `vendor` with all nine wares in stock; `show('camp')`.
2. Vendor: `buy(i)` (gold out, stack into the pack, or `state.bought` waits for `placeBought` when the pack is full). Leaving: `options()` lists the next step's linked nodes, `choose(id)` travels.
3. `choose` logs the travel, bumps `steps`, then by place: Well (refill flask, `depart`), town (heal, vendor again), boss (rolls `bossMods`, phase `boss`), zone (a `visit` of `itemsPerZone` items, then `draw()`).
4. A zone item: `draw()` picks a random unused item, `dealPool` builds the tiles, the free clue is set by zone type, phase `item`. The page cuts the Veil and calls `open(adjacency)` (Blood toll, free burn-in, clock). The player uses supplies (`use`, `drink`), builds the name (`place`, `gap`, `unplace`, `clear`), then `submit()`.
5. `submit`: right, the flask heals if recovering, phase `solved`, `takeLoot` (cards = the zone's cards times the corruption multiplier, minus misses, at least 1; gold, flask charge or supply; overflow waits for `keep`). Wrong: `markLine` marks the line, life drops by the section's miss range; 0 life calls `end(false)`.
6. `next()` after the reveal: next item, the win, or an Expedition vendor. On a zone's last item `depart()` stops the front standing there, and every `creep` steps the fronts move; then `choose` again.
7. Boss: `Threshold` shows the rules and the stakes; `face()` draws item 0 (free burn-in); 3 items (4 with Lingering), no loot. The last item solved, then `next()` gives `end(true)`.
8. End: `log.result` set, `End.svelte` shows; `play.keep()` writes the log to storage and, in dev, to the file.

## Where the rules live (to be replaced)
- Linear route and steps: `map.ts` (`buildGraph`: each node links to its 2 nearest on the next non-empty step, forward only; `rollPlaces`: first and last step always zones, `zoneShare` 83%); `wraeclast.json`; `sectionOf` in rules.ts (thirds early, mid, late, then boss); `Run.options`, `choose`, `ahead`, `leaving`.
- Corruption fronts and seeds: `map.ts` `seedFronts` (3 by default, from step 2 to half the route, 0.15 of the map apart, one boss rule each), `creep`, `corruptedAt`; `Run.depart`, `creepIn`, `corrupted`, `hiddenHere`; Blood toll in `Run.open` (10 life); loot multiplier in `dealHere`; tuning `corruption`.
- Boss chain: `BOSS_MODS` (lingering, bloodied, murky, teeming) in map.ts, applied in `choose` (item count), `open` (Bloodied toll), `flareBurn` (Murky halves), `draw` (Teeming adds a name); `BOSS_ITEMS`; `Threshold.svelte`; `bossRuleFrom` and `BOSS_MOD_DOES` in words.ts.
- Pledges or boons: none in the code (no match for either word). The nearest things are the boss rules and the free clue per zone type (`freeClue`, `FreeClue`, `draw`).
- Supply list and pack: `Supply` type, `SUPPLIES`, `SUPPLY_NAMES` (rules.ts); effects in `Run.use`, `idle`, `works`, `canUse`, `deckOptions`; the pack in `stow`, `fits`, `replace`, `placeBought`, `PACK_STACKS`, `STACK_MAX`; tuning `stack` and `burnIn`; copy in words.ts (`does`, `SHORT`); marks in `Glyph.svelte`; names duplicated in the log script.
- Gold and prices: `Tuning.gold` (40 at start), `price` (10 each), `loot.gold` per section (late is 0), `Run.buy`, `canBuy`; loot in `takeLoot` and `rollCard`; economy targets in `wraeclastEconomy.test.ts` and the bot.
- Life and misses: `Tuning.life` (100), `missCost` ranges per section (boss 65 to 75), `Run.missRange`, the miss branch of `submit`, Blood toll and Bloodied tolls in `open`; the flask (`FLASK_ITEMS`, `FLASK_STEP`, `drink`, charges from Wells and loot); town heal `townHeal`.
- Towns: map kind `town` in the JSON; the town branch of `choose`; `vendor.at: 'town'` in state; `Vendor.svelte`. Expedition zones act as a roadside vendor (`next`, `vendor.at: 'expedition'`).

## Reusable as it is
- Item screen: `ItemScreen`, `Inscription` (fused tile plaques, word breaks, marks gold, silver, struck, no counts), `Clues`, `ClueText` and `markup.ts` (tooltip lines in the game's font, masked name words), `Veil` (patch cut and burn-in; leans on `lib/patches`, `materialize`, `frontier`). The rules behind it can be lifted whole from rules.ts: `dealPool` (answer tiles, near and wide decoy names by likeness, loose decoys, `siblingOf`), `decoyNameCandidates`, `markLine`, `itemSeed`, `CLUES`, `wisdomOrder`, `deckOptions`, the burn-in and `open(adjacency)`. Only the zone-type clue choice in `draw()` and `sectionOf` tie it to the old route.
- Card look: `DealtCard`, `PackList`, `ItemPack`, `Glyph`, `screens.css`, `Hud` (life vessel, step plaque).
- Tuning panel: `TuningPanel` and `tuning.ts`. The `Tuning` schema is shared with the rules, so new rules mean new fields and a new storage key (the key number is bumped when stakes change).
- Run log: `RunLog` and `ItemLog` types, `runLog.ts`, `play.keep`, the dev-server hook, the summary script. Bump `v` and the `wraeclastRuns4` key together with any log shape change; update the script's name tables by hand.
- Also fine as is: the `Run` pattern (pure class over a plain state object, seeded rng, bot-testable) and the bot.
