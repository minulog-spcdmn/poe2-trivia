# Wraeclast run: decisions log

Decisions taken after the bundle was handed over, newest first. The design
doc and the handoffs carry the rules; this file says when and why they
changed, so a later orchestrator can follow.

| Date | Decision | Where it went |
| --- | --- | --- |
| 2026-10-19 | Owner: the Inscription often solved itself (only one real name could be built). Every board now holds the full tiles of decoy names: look-alikes only, real and made up (fakes.json, now from the first item), rolled and never shown: 1 to 2 early, 2 to 3 mid, 3 to 4 late, 4 to 5 at the boss. The owner accepts that look-alikes may hint at the category | v4 handoff; design doc |
| 2026-10-19 | Owner: much of the wording was confusing, even to its creator. v4 rewrites every player-facing line plainly (design handoff), and a newcomer-read review runs before playtest 4 | v4 handoffs |
| 2026-10-19 | Playtest 3 (`playtests/playtest-3.md`): the owner found the run unfun and wanted it over. Causes named by the owner: too long, slow screens, no real choices, items got samey, and building a name was cumbersome even when known | Drives v4 |
| 2026-10-19 | Owner, for v4: the route is 10 steps (camp 0, boss 10) and zones hold 2 items, about 17 items a run. Tiles are never a single letter. The screens between items get faster (a design handoff now) | v4 handoffs; design doc |
| 2026-10-19 | Owner, corruption rework: only the zone a front stands on is corrupted (no trail). The only modifier is Blood toll, shown on the map (no hidden flip). A corrupted zone still deals double loot, so the gold economy must make gold matter. Fronts alive at the boss still add boss modifiers | v4 handoffs; design doc (Corruption) |
| 2026-10-19 | Owner: the Decoy sweep (Tangled Fossil) stays as it is, even though it can strip a board | Closed |
| 2026-10-19 | v3.2 done (commit 6375a4ab, PR #197): decoys length-matched (P(answer given length) 0.16 to 0.21 for 1 to 4 letters; every tile is dealt as a decoy somewhere), signature tiles on top of the totals (early boards hold a median of 9 ordinary decoys). Counting gem lines among gems was dropped, since it changed nothing (11 of 56 gems either way); the gem tell stays open for v4. Served locally for playtest 3 | Playtest copy; v4 draft |
| 2026-10-19 | PR #197 review (v3.1, fresh agent): two leaks fixed as v3.2. Decoys are drawn to match the answer's tile lengths (short tiles were 99% the answer's), and the always-present tiles come on top of the section totals (early boards held about 4 real decoys). Also: a gem's line is common when 3+ gems share it (the Word lengths fallback flagged gems); a gem's support text is its base clue only; the log is kept after every item; found supplies count when stowed; flask ticks after the item drunk in and the next (as the sample run) | Prototype session; design doc (Rules in detail) |
| 2026-10-19 | Playtests run on the owner's machine: the orchestrator serves each version from a pinned worktree (`.claude/worktrees/wraeclast-playtest`, port 5199, reachable from a phone on the same network) and opens it. The beta is no longer needed for playtests | Working rule |
| 2026-10-19 | Category reveal becomes the Ancient Orb in v4: a sibling unique of the same category, by name, as one clue line (the design session confirmed the fit). Never names the category; shares no word with the answer; its tiles stay off the board; under 700 px tall, past 4 clues the art goes beside the clues | Design doc (Supplies); v4 draft |
| 2026-10-19 | Owner, from the items-only names pass (`research/supply-items.md`): Decoy sweep becomes the Tangled Fossil; a new supply, the Stacked Deck (one random unshown clue), goes into v4. Flare's working name is Torch ("Burn-in" was dropped, since burn-in already names what a supply reveals). Base reveal, Word lengths and First syllable keep working names; Orb of Transmutation was rejected for reusing a currency. Category reveal as the Ancient Orb (show a sibling unique of the same category) waits on a space check by the design session | Design doc (Supplies); v4 draft |
| 2026-10-19 | Owner: a supply's name must be a PoE item you can buy, carry and use, doing what it does in the game. Never an NPC (Gwennen, Siosa, Jun), an action (Interrogation) or a mechanic (Blueprint Reveal). "Flare" is dropped too: Delve's Flare does something else. Names so far: Scroll of Wisdom, Golden Page (was Lore reveal). The rest, Flare included, are working names until a second, items-only pass | Design doc (Supplies); brief principle 8 |
| 2026-10-19 | Owner: the answer line fuses every build into one continuous word (seams and marks kept), and a break key beside Clear lets the player add word gaps. The game never places or suggests a break. Replaces the canvas's version 25 fusing, whose gaps between the answer's words leaked word breaks. Waits for the prototype after playtest 3 | Design doc (Build the name); queued below |
| 2026-10-19 | Leak hunt (`reviews/v3-leak-hunt.md`) sorted. Fixed as v3.1: the Veil's corners mark the square, not the art's box; the free mod line must be shared by 3+ items (else Word lengths); every board holds of/the/and and 2 to 3 possessive tiles; decoy floor 5; boss items drawn like any other; pools seeded per item; boss chain per the doc (item 1 small burn-in, item 3 Flares half); the pack lets one supply fill several stacks again; rule gaps settled (Rules in detail) | Prototype session; design doc |
| 2026-10-19 | Owner: decoys come from all categories (the own-category half named the category) | Design doc; prototype session |
| 2026-10-19 | Owner: a supply with nothing left keeps greying out, though the grey state shows a count | Working rule |
| 2026-10-19 | Owner: the Decoy sweep's strength (one stack can strip a board to the answer) waits for playtest 3. Also watched there: gold left at the end, zone types picked, corrupted zones taken, Oriath Harbour at step 15 | Design doc, playtest measures |
| 2026-10-19 | v3 on the beta: PR #197 (branch `claude/wraeclast-prototype-v3`), not merged | Prototype session |
| 2026-10-19 | The Inscription is capped at 36 tiles on every device (was 40). Below 700 px tall the item screen uses a compact layout. A per-device decoy rule was turned down, since co-op shares one board | Design doc; both sessions |
| 2026-10-19 | Design v3 boards done (17, item screen): https://claude.ai/artifact/EEvHCvHLeL3hcJ38aocxrp. The boss pool fits 375 x 812 up to 40 tiles; 375 x 667 needs the compact layout and the cap | Design doc, Open questions |
| 2026-10-19 | The map art handoff waits until placements are settled; no outline before then | Brief section 6.3 |
| 2026-10-19 | When two "half as much" rules meet, they multiply (a Flare on the Silent boss's item 3 under Murky burns in 3 patches) | Prototype session |
| 2026-10-19 | Corruption seeds spread across the map's width, at least 0.15 apart in x where the map allows (the handoff's "2 apart in x" was loose) | Prototype session |
| 2026-10-19 | Leak fixed: fixed decoy counts gave away the answer's tile count. Each item's pool total now rolls (the section's size ±3) and decoys fill it, at least 8 | Prototype session |
| 2026-10-19 | Free clues stay text, except Blight's and Kalandra's burn-ins (boss item 1 and Lamplighter keep theirs too) | Design doc (An item); brief section 2 |
| 2026-10-19 | Map placements are still being edited: v3 plays whatever `wraeclast.json` holds, and the map art handoff waits until the owner says they are settled | Brief section 6.3 |
| 2026-10-19 | The orchestrator messages the coding and design sessions directly and brings only questions of feel to the owner | Working rule |
| 2026-10-19 | Stale lines fixed in the design doc: the Loot phase (take all), the base type (sold as Base reveal), rounding, the sample run's tiles and its fixed-width mask | Design doc |

## Queued for after playtest 3

What the next handoffs pick up, besides what playtest 3 itself finds.

| Item | Handoff |
| --- | --- |
| The fused answer line and the break key (see Oct 19 above); the canvas redraws it, replacing its version 25 fusing | Prototype v4; item screen design |
| The Decoy sweep's strength, decided from the log | Prototype v4 |
| The vendor, the map screen, the end screen and the boss intro | Design handoffs |
| The map art | Waits for settled placements |
