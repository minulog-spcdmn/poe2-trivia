# Wraeclast run v3: leak hunt and rules review

Read-only review of `design-doc.md`, both v3 handoffs, `ORCHESTRATOR.md` (sections 3 and 4) and `decisions.md`, plus `wraeclast-map.json`, `items.json`, `itemStats.json` and Delve's veil code (`src/lib/materialize.ts`, `patches.ts`, `veilCut.ts`). Skipped, as asked: the fixed decoy count, the loose "2 apart in x" wording, halvings stacking, the stale lines fixed today.

How to read the numbers:
- There is no `syllables.json` yet. I split names with a rough vowel-group splitter (tiles of at most 4 letters, "of/the/and" whole). It is not Liang's patterns, so tile statistics are indicative, not exact. Real tiles will be more generic ("ing", "er"), which should shrink the category leak somewhat but not remove it.
- Item facts (mod lines, flavor, `shared`) come straight from the two data files. `shared` is counted by exact line text, so the real script may differ a little.
- Scripts are in my scratchpad, not in the repo.

Confidence tags: **sure** (follows from the text), **likely** (follows from the text plus one assumption, named), **measured** (numbers, with the caveat above).

Ranked worst first. Sections: A leaks, B contradictions, C rules a coder would guess, D balance.

---

## A. Free information leaks

### A1. "Unusable" supplies and short sweeps leak counts (sure)

**What leaks.** The handoffs say a supply with nothing left to show "is simply unusable, with no number on it". The greyed-out state is itself a number.
- Scroll of Wisdom goes grey exactly when the mod lines run out. Use it k times, watch it die, and the item has k lines (k+1 if the free clue was a line). That is the "number of mod lines" the owner banned.
- Lore reveal, Base reveal and Category reveal go grey after use, which is harmless. But Scroll and Decoy sweep go grey at a point set by hidden counts.
- Decoy sweep is grey when no decoy is left. After sweeps, the unstruck tiles are then exactly the answer's tiles, so the player has read off the answer's tile count N. A last sweep that strikes fewer than 4 (design doc: "exactly like a miss", the handoff never says what a short sweep does) shows the remaining decoy count directly.
- A supply that is grey before any use is worse: it says "this item has no such thing". Today every item has both mods and flavor (measured: 0 items lack either), but 42 of 501 items have exactly 1 mod line. With a free mod-line clue in Plain or Expedition, the Scroll is dead from the start on those 42. The player learns "this item has one line" for free.

**Example.** Plain zone, item with 1 mod line. The free clue shows it. The Scroll icon is greyed at once. The player knows there is no second line to buy, and which other supplies are worth the money.

**Fix.**
- Never grey a supply because of hidden counts. Let it be used and spent; if there is nothing, show a neutral "nothing more" result. The player pays for that fact, which is the principle.
- If the owner dislikes wasted supplies, grey only for facts that are already public (a reveal already shown; Sealed or Ritual rules, which the player knows).
- A Decoy sweep with fewer than 4 unstruck decoys should still look like a sweep. Choices: strike all that are left and say nothing else; or always strike 4 tiles of which some may already be struck (the display shows 4 tiles pulsing, only the new ones change). Either way no count appears.
- Update `prototype-v3-handoff.md` ("A supply with nothing left to show is simply unusable") and the design doc rule "A supply with nothing to do on an item ... can't be used on it".

### A2. The Veil probably shows the item's silhouette (likely)

**What leaks.** The mode reuses Delve's veil. Read what that pipeline does:
- `materialize.ts` header: "ahead of it the item's shape gathers out of a faint golden mist" and "Transparent pixels are never touched, so the magic keeps to the item's own shape". The effect is drawn only on the item's visible pixels.
- `patches.ts` / `veilCut.ts`: patches are cut from visible pixels only, and a guest receives `VeilWire` with `w`, `h` and the packed `labels` of the whole picture. Guests derive the visible-pixel mask (`lit`) from it before any reveal.
- The v3 handoff repeats "Patches are cut only from the item's visible pixels, as in v2" and "Fit the art inside it, centred".

So unless the Wraeclast veil is an opaque square fill, the frame is defeated: a sword's mist or patch outline is a thin vertical blade, a ring is a small round shape. That is the "art size gives the item type away" leak, back through the side door. Even with a plain square cover, the first burn-in lands only on lit pixels, so its outline shows the silhouette (this part is paid, so it is fine).

**Example.** Boss item, Silent rule, no free clue. The square shows a 26%-wide upright strip of mist. Two-handed weapon or staff or quiver, instantly, for nothing. A 108x108 gem fills the whole square.

**Fix.**
- Veil = one opaque, featureless square (or the arcane fill) over the whole frame. No mist, no patch edges, no item-shaped glow on unburned areas. Document it in both handoffs.
- Guests get no `labels`, `w`, `h`, or any silhouette before the reveal (the design doc says "guests receive only the burned-in part" but the existing `VeilWire` sends the whole label map). Solo has no guests, but keep the rule so co-op does not inherit it.
- Optional, to blunt the paid silhouette too: burn-in patches should be allowed to land on the frame's transparent parts and show them as blank, so a Flare on an empty corner is possible. Costs a Flare now and then; flag to the owner as a feel question.

### A3. Half the decoys come from the answer's own category: the board names the category (measured)

**What leaks.** Principle 3 lists "a board of only bows" as a leak. "About half the decoys from the item's own category" is half a board of bows. The Category reveal supply (2 for 6 gold) is then partly free.

**Measured.** A full-knowledge attacker (naive Bayes over tile frequency per category, answer item left out of the vocabulary) names the category from the tile pool alone:

| Decoys | Top-1 category right |
| --- | --- |
| Uniform random decoys (control) | 11% |
| 10 (early) | 50% |
| 16 (mid) | 56% |
| 22 | 62% |
| 28 (boss) | 66% |

Chance by the largest category is 14%. Bigger pools leak more, because more own-category decoys appear. A human is weaker than this attacker, but a PoE expert reading "cuisses, greaves, gauntlet" pieces is not far off. Per category the leak is uneven: One-Handed Weapons 97%, Rings 87%, Flasks/Charms/Jewels 77% (high); Body Armours 0%, Gloves & Boots 16% (the rough splitter, so take these as shape only).

**Lineage gems are a flag on their own.** 54 of 56 gem names carry a possessive ("Ahn's", "Ailith's"), against 6 to 32% of names elsewhere. A board with several "'s" tiles is a gem board: the item's kind (gem or unique) is known for free, and gems are 11% of all items. Also, gem decoys come from only 56 names.

**Fix (pick one, the first costs the least feel).**
- Draw all decoys from all categories by one rule, with no own-category half. Keep the lookalike preference (it measured weak, A4).
- Or keep a category half but draw it from a category chosen at random per board (not the answer's), so the "own" half points nowhere.
- For gems: either strip the "'s" signature (use a tile "'s" alone as a decoy in every board at a fixed rate, or a few "'s" decoys on every board) or accept that gems announce themselves and say so.
- Re-measure with the real Liang tiles once `syllables.json` exists. The test belongs in the splitter's test file ("category from pool alone stays under 25%").

### A4. Decoy lookalikes: small, but the small words are not (measured)

- **Lookalike hubs.** I tested whether answer tiles are the ones with the most near-duplicate neighbours (the owner's own example, bl / bla / ble / br, has this look). AUC was 0.49 at 10 decoys, 0.53 at 16, 0.56 at 28 (0.5 is no leak). Weak, grows with pool size. Not a priority; recheck with real tiles. Note the cluster count could still hint at N on a human eye.
- **Small words.** "of", "the" and "and" stay whole and look unlike most tiles, so a similarity-ranked top-30 rarely picks them as decoys. In my simulation, P(answer contains a small word | board shows one) = 0.83, against a base rate of 26%. A visible "of" or "the" tile therefore says "multi-word name" for free (and absence says the reverse). The exact numbers depend on the picker.
- **Fix.** Seed small-word decoys by their own rule: every board gets small-word tiles at a rate independent of the answer (say each of "of", "the", "and" appears as a decoy with probability equal to its overall frequency in names, whenever the answer does not hold it). Also test it: "P(answer has small word | board has small word) is within 5 points of the base rate".

### A5. The free "most common mod line" often names the item (measured)

**What leaks.** The handoff defines Plain and Expedition's free clue as "the item's most common mod line", with no threshold. The design doc says a line is "common" only when 3 or more items share it.

**Measured** (exact-text counting over 501 items):
- 155 items (31%) have a most-common line that no other item has. The free clue is then the item's fingerprint; anyone who knows that mod answers at once.
- 232 items (46%) have a top line shared by 2 or fewer.
- Only 103 items have a top line shared by 11 or more.

So "one common mod line, weak" is true for about half the items and a giveaway for a third. Plain and Expedition (two of six zone types) pay in free information at random.

**Fix.** Use the design doc's threshold: a mod line counts as common only when 3 or more items share it; if an item has none, fall back to something equally weak (Word lengths is a count leak of its own, see C1; better a different weak clue such as the item's first requirement, or a blank). Then Plain's clue is uniformly weak. Alternatively show the line with its numbers rolled up, but a threshold is simpler.

Related: Scroll of Wisdom reads "the next mod line from most common to rarest". In Plain and Expedition the free clue already is the most common line. Does the first Scroll repeat it? If yes the first Scroll is wasted and teaches the player what a repeat looks like. If no, "next" needs the free line to be tracked as shown. Say which (C2).

### A6. Pool total conditional on answer length (measured, and an ambiguity)

`decisions.md` says the pool total rolls (section size ±3) and decoys fill it, at least 8. The handoff still tabulates decoys (10 / 16 / 22 / 28). Which is rolled?
- If the total is rolled and decoys fill it with a floor of 8, the total depends on the answer length at the low end. Early section (S = 14, total 11 to 17), per answer length N:

| N | Totals that can occur (the number of rolls landing on each) |
| --- | --- |
| 3 | 11, 12, 13, 14, 15, 16, 17 (one each) |
| 4 | 12 (x2), 13, 14, 15, 16, 17 |
| 5 | 13 (x3), 14, 15, 16, 17 |
| 6 | 14 (x4), 15, 16, 17 |

  A total of 11 means N = 3 for sure. A total of 14 is four times likelier for a 6-tile name than a 3-tile name. Only the early section is hit hard (later sections have floor slack), and the effect is small. But the whole point of the roll is to stop pool size leaking N.
- If the decoys are rolled (S_decoys ±3), no such effect, and the total is N + decoys.

**Fix.** Roll the decoy count, not the total, and keep the floor out of the way: decoys = section decoys + roll(-3..3), no floor needed (minimum 7 is already fine). Then the total is N + D with D independent of N. Say it in the handoff.

### A7. Boss items come from three different categories (likely)

Design doc, The boss: "the 3 items come from 3 different categories". So after the first boss item, the player knows items 2 and 3 are not from its category, and after the second, not from either. With 10 categories that is a real elimination (item 3 is one of 8). Free information, small.

**Fix.** Draw the three boss items independently (repeats of a category are fine, "an item never comes up twice" already holds), or keep the rule and accept the elimination knowingly. The handoff says nothing about it, so the coder will not build it unless told; decide before they guess.

### A8. A re-dealt board leaks by intersection (likely, low)

If a board is ever re-rolled for the same item (a reload that regenerates the pool, a retried item, co-op rejoin, the later Necropolis zone), the tiles present in both rolls are the answer's. Resume is out of scope for v3, but the page may be reloaded by accident.

**Fix.** Derive each item's pool from a per-run seed and the item id so any re-deal is identical, and store the pool with the run log. Cheap, and it also makes bug reports reproducible.

---

## B. Contradictions

### B1. The boss in the handoff vs the design doc

The handoff's Boss row says only "3 items under the Silent rule ... plus any corruption modifiers; no loot". The design doc adds:
- item 1 starts with a small burn-in, item 2 nothing, item 3 nothing and Flares half as much;
- 3 different categories (A7);
- a 4th item for Lingering is "like item 3".

The coder would build items with no free clue and Flares at full strength on item 3. The playtest will then measure the wrong boss. Decide, then write it into the handoff. Also: the doc says boss decoys "come from all categories", the Decoys section says half from the own category.

### B2. "Common mod line" definition (A5)

Handoff: "most common mod line". Design doc: common = shared by 3 or more. They produce different games.

### B3. Wares per town

Design doc: towns at 4, 8 and 12 each stock 4 or 5 of the wares, rolled per run. Handoff: "the vendor deals every ware" at the camp, towns and Expedition. The handoff is the stated source of truth for the prototype, so this is probably fine, but then the Expedition vendor and every town are the same full shop. Say it is deliberate (it matters for D3).

### B4. Town positions, step 15 and the map file

- Doc: towns are fixed at steps 4, 8, 12. The map file has a town at 8 and 12, nothing at step 4 (empty step), and **Oriath Harbour as a town at step 15**.
- Handoff: "Steps 1 and 15 are always zones". The step-15 line applies to `open` nodes, so Oriath Harbour is a town and a route may skip the last zone. Not a contradiction in the letter, but it is a balance trap (D4).
- Step 6 has a single node (Buried Shrines) and steps 8 and 12 are single-node towns. Every route and every front passes them. The doc's "branching: 2 or 3 nodes ahead" holds only where the map has them.

### B5. "No counts" vs Word lengths

Word lengths is "the one supply that tells" (handoff) and is also the Ritual free clue and the fallback for a missing free clue. Fine in itself. But a fallback to Word lengths is a signal: if a Plain zone ever shows Word lengths where the player expects a mod line, they know the item has no common line (A5's fix removes this). Today it never triggers (every item has mods and flavor), so it is a dead rule; say so, or remove it.

### B6. Doc vs handoff about Blight's free burn-in under Dark

The doc: Blight gives a small burn-in; a Dark corrupted zone and Delirium mean "art can't be revealed ... fully veiled for the whole item". A Blight zone corrupted by Dark has two rules in conflict (free burn-in vs nothing can be revealed). Pick one (the stricter rule should win).

---

## C. Rules a coder would have to guess

1. **Word lengths and distinct tiles.** The board shows each distinct tile once, but the answer can repeat a tile ("a ... a" in Atziri's Acuity: 6 tiles, 5 distinct). Word lengths counts tile slots. Fine, but the sweep/unstruck leak (A1) then reads N distinct, not N slots; say which one the pool uses.
2. **Scroll with the free line.** Does the free clue count as read (A5 end)? Does the free clue stay in the clue list after a Scroll (so the Scroll's line 2 is "next")?
3. **Line length.** The design handoff says "up to about 9". Answers reach 9 tiles in 5 of 501 items (my splitter; 8 tiles in 21). Set the cap above the longest answer or a name cannot be built. Locked First-syllable tile: does it count toward the cap, and does Clear leave it?
4. **Sweep details.** Strikes 4 decoys not yet struck, chosen at random? If chosen by lookalike rank, the strike pattern leaks the answer (the sweep "must never strike an answer tile" is the whole point, and a ranking would signal which tiles resemble it). Pick at random. What if fewer than 4 are left (A1)?
5. **Loot floor and halving of cards.** "Each miss removes a card, but a right answer always drops at least 1." In 1-card zones (Essence, Expedition) a miss removes nothing: every miss there costs only life. In 2-card zones the second miss costs nothing. Corrupted double: 4 cards, floor 1. Say whether the floor applies after doubling (4 minus 2 misses = 2, or double the post-miss count = 2?) because both give 2 once but differ at one miss (3 vs 2).
6. **Blood toll at low life.** "Each item takes 10 life when it opens". Can it kill? At 10 life or less, does the zone refuse to open, or does the run end? Say it.
7. **Flask timing.** Pending +10 ticks "after each of your next 2 items, right or wrong". Applied before or after the item's miss? A tick that would have saved a run at 0 does nothing; fine; but say it so it is not inconsistent.
8. **Corruption timing.** "After every second step the player takes, each front creeps". Before or after the zone just entered is played? Compute a front seeded at step 3: it creeps after step 2 (to 4), 4 (to 5), 6 (to 6). The singleton Buried Shrines at step 6 is where it lands after the player's 6th step, so the player stands in or just left it when it turns corrupt. Is a zone that turns corrupt while the player is inside it corrupt for the current items (double loot, hidden modifier) or not? Resolve either way, but write it down.
9. **Fronts merge on the singleton.** Two fronts creeping to step 6 both corrupt Buried Shrines. One node, two fronts: does cleansing it stop both? "Cleansing a front stops that front for good" does not say.
10. **Which zone cleanses a front.** The handoff says "Cleansing a front stops that front for good" and "answering all its items cleanses a zone". Only the design doc says the zone must be the front's head ("cleansing a zone behind a front only takes its loot"). Move it into the handoff.
11. **Boss modifier duplicates.** Up to 3 modifiers "rolled". Can Bloodied roll twice (+20), Murky twice (a quarter), Teeming twice (+16 decoys on a 28 pool, over the 40 cap)? Distinct or stacking? Rolling with replacement could give Lingering three times (a 7th boss item).
12. **40-tile cap and Teeming.** Boss 28 decoys + about 5 answer tiles = 33, Teeming +8 = 41, so Teeming alone reaches the cap. At step 11 to 15 a Blight (+6) zone with Swarming (+8) is also capped. State what the cap trims: decoys only, last-added first.
13. **Ritual and Sealed with First syllable and Word lengths.** Ritual bans Scrolls only. Sealed bans all supplies, "a flask charge still does". OK, but the table in the handoff lists "Silent boss: only Flares work", which also bans First syllable and Word lengths: check that Ritual's free Word lengths survives Silent (it is not a supply, so yes).
14. **Item draw per zone.** Nothing says how a zone picks its 3 items. Uniform over 501 minus seen is right, but say "not weighted by place, category, or zone type". Otherwise a coder may "theme" items by place (Freythorn gets forest items) and that is a free category clue. Note also gems are 11% of draws and their Essence base clue is a support description.
15. **Stack sizes.** Wares are "3 for 6" but a pack stack holds 5. A bought stack of 3 plus a loot stack of 2 merge to 5. "A stack that would go over 5 fills a new stack" is right but the display must not make the leftover look like a count of anything hidden. No leak, just a UI check.
16. **Tile marks and duplicates on the line.** Wordle's count-aware silver is specified. For a line that holds the same tile twice and the answer holds it once, the second gets silver or struck by position order; "a tile keeps its best mark" then keeps gold on the first. Say it.
17. **Empty states.** An item with 1 mod line (Scroll), a gem with no category text, an item whose flavor is wholly masked: what does the free clue show? Define "nothing" as a blank clue slot with no fallback (see B5).

---

## D. Balance traps visible on paper

### D1. The Decoy sweep is the best supply by far (measured)

**Numbers.** Decoys on a board: early about 8 to 13, mid about 12 to 19, late about 18 to 24 (pool section size, rolled, minus the answer's 3 to 6 tiles).
- 3 sweeps for 6 gold strike 12. That clears every early board (the example in the brief) but one tile.
- 4 sweeps (8 gold) clear a typical mid board; 5 sweeps (one full stack, 10 gold) clear nearly every late board.
- Price per use is 2 gold, the same as a Flare or a Scroll, but a stack of sweeps does what no other stack does: it removes the need to know anything but the order.

**What is left.** Only the answer's own N distinct tiles. Letter soup: a short anagram. Measured with zero PoE knowledge, random consistent guesses with the Wordle marks need on average 1.5 misses (4 tiles), 2.0 (5) and 2.5 (6). A player with any knowledge sees the name at once. The brief's own principle ("trivia is the heart") is bypassed: the cheapest supply turns the game into an anagram. Compare guessing without sweeps: from a pool of 14 to 15 tiles, random marked guessing needs about 4 to 5 misses (about 100 life early). So sweeps are the difference between "dead" and "2 misses".

**Fix.**
- Cap the effect: at most 2 Decoy sweeps per item (a stack can still hold 5; an item just cannot use more).
- Or let a sweep strike a share of the pool (about a third of the unstruck tiles, never an answer tile) so a second and third sweep still leave a messy board. Careful: a share-based count makes the number struck a hidden count (A1). The cap is the safer choice.
- Add a hidden floor: every board keeps k decoys sweeps cannot touch, with k itself rolled 2 to 5 and not shown. The player never learns where the end is.
- Keen Eye (6 strikes), later, makes this worse; keep it in mind when the boon list comes.

### D2. Zone rules that cost nothing to the player who ignores one supply

- **Incursion:** a free flavor text (every item has unique flavor text) against "Flares burn in half as much". A player who answers from lore never buys a Flare. Free clue is the strongest text clue; penalty is nearly zero for lore players. Incursion is a gift.
- **Ritual:** free Word lengths against "Scrolls of Wisdom don't work here". Same shape: a player who does not use Scrolls pays nothing.
- **Essence:** the base type, which names the item for about 3 uniques in 4 (323 of 445 are the only unique of their base in their category), against one fewer loot card. And because of the loot floor (C5), a miss costs the player no card in a 1-card zone at all. Essence is the weakest penalty for the strongest clue.
- **Blight:** a 4-patch burn-in plus 6 junk decoys. The junk decoys only hurt a player who does not use sweeps, and even then they cost nothing against D1.

So of six zone types, the player routes to Incursion and Essence and avoids none. A route choice that is always the same is not a choice.

**Fix.** Make each penalty bite for the clue the zone gives, not for an unrelated supply. For example: in an Incursion zone, Lore reveal does not work; in a Ritual zone, Word lengths does not work (so the free clue is the only one); in an Essence zone, the Base reveal and Category reveal do not work, and the loot floor is 0 for it. Keep "Flares half as much" for a zone that gives a burn-in (Blight) as its trade.

### D3. Gold is not scarce; the pack is the cap (measured, rough)

Loot weights: Gold 10, Supplies 8, Flask 2, Jackpot 1 (21 total). A 2-card zone item drops about 1.9 cards (misses remove some). Per item that is roughly 0.9 gold cards (average value 6 to 10) plus 0.09 jackpots (25) plus 0.7 supply cards (2 supplies each). Over about 30 zone items that is about 250 to 300 gold and about 40 found supplies, before any corrupted doubling.
- A stack costs 4 to 6 gold; four vendor visits (camp, towns at 8 and 12, plus an Expedition or Oriath) can fill the 8-stack pack from empty each time for about 80 to 100 gold.
- The pack holds 40 supplies; a run uses about 33 items, so even a heavy 1.5 supplies per item uses fewer than 50.
- So the 8x5 pack, not gold, limits the run. Leftover gold is worthless (the doc says so). The "scarce gold" pillar ("Hard without a clock: pressure from scarce gold") does not hold on paper. And the target "under half of items answered without a supply" is not threatened by price: it is threatened by availability.
- The Silent boss shows it: 40 Flares of 2 gold each is 80 gold. Three boss items at 12 patches of 81 (6 on item 3 under Murky, 3 more halved) take about 8 to 14 Flares each to reveal most of the art. The pack can bring all of it. The boss, meant to need careful preparation, is answered by art recognition from a full pack.

**Fix (tuning, for playtest 3 to measure).** Raise prices about 50%, or cut Gold weights and Jackpot value, or cut pack to 6 stacks. Measure gold at the end of the run. Cap Flares per boss item (say 6) if the Silent boss should stay a recognition test and not a stock check. This is feel: send to the owner.

### D4. Oriath Harbour: a free pre-boss town (sure on paper)

Step 15 has four nodes; Oriath Harbour is a town. Reaching it needs a link from Tidal Island (step 14, x 0.53) or Karui Fortress (0.43); by x, the two nearest of the step-15 nodes to Tidal Island are Twilight Strand (0.48) and Oriath (0.60) or Brine King's (0.44), depending on y. A route through Oriath replaces a zone of 3 items (and a 40 to 50 life miss risk) with a free 20 life heal and a full vendor right before the boss, where only supplies matter.
- It gives no item risk and the vendor is for the boss (Flares). No reason to choose any other node at step 15, ever.
- Also, the corruption "alive at boss" count is fixed by step 14; skipping the 15th zone skips the last chance to cleanse.

**Fix.** Either move Oriath Harbour off step 15 in the map (owner's call), or make a town at step 15 not heal and not shop except the Silent boss's supply (Flares), or keep it and add a cost (for example the town heals 0 and costs 5 gold to enter). At minimum, tell the owner it is the dominant node.

### D5. Corruption: catching is better than ignoring (likely)

A corrupted zone deals twice the loot cards. Only 2 of its 5 hidden modifiers (weights 2 + 2 of 9: Blood toll, Sealed) hurt supply or life, Swarming and Dark hurt less, Bounty none. In expectation a corrupted zone is richer than a normal one, and 2 of the 9 weight units are nothing. The "decision" is mostly "go and take it", and leaving a front alive costs a boss modifier. Both point the same way. Playtest 3's question "is corruption a real decision?" will likely come back "no, I always went for it".

Also, with the map file: a front is catchable only when its head is a zone the player can reach at the right step. For a seed at step s the head is at step s + floor(t/2) after t steps, so the player meets it at about t = 2s; the singleton step 6 and step 8's and 12's towns make that path predictable (fronts "jump" past towns). Fronts seeded at 3 reach the single Buried Shrines node exactly when every route passes it.

**Fix.** Give Bounty a hidden cost too (no "no catch"), or add a real downside to double loot (a corrupted zone drops the cards but removes one pack stack, or it doubles the miss cost like Ultimatum). Keep the boss modifier as the stick. Measure first.

### D6. Smaller traps

- **Flask: pre-submit drink** is only useful when life minus the miss range reaches 0 or below. Fine, but it also means the best flask moment is known from public numbers; no secret there.
- **Towns heal 20 and the Well refills for free.** Over 15 nodes there are 3 to 4 heal points and about 1 Well. 6 misses at 20 to 50 life against 100 + 20 per town + 10s from flasks: matches the doc's "about 6 misses". But an early miss costs 20 to 30 and the first town is at step 8, so the first 7 steps allow 3 misses, then a heal of only 20. Check playtest logs for deaths before step 8.
- **Free burn-in plus Flares plus Scroll** stack on the same item with no limit per item. Say whether there is one.
- **First syllable** (2 for 6, 3 gold each) is the priciest per use among the cheap ones yet gives only 1 tile of N; Word lengths (1.33 gold each) gives structure and is the cheapest supply. It will be bought first.

---

## What I would hand the owner as questions of feel

1. A1/D1 together: is "sweeps clear the board" acceptable if capped at 2 per item? (my pick: yes)
2. A3: all-category decoys, or a random-category half? Gems will announce themselves either way.
3. D2: should zone penalties bite for the clue they give? Changes what each zone type means.
4. D3: prices, pack size or gold weights, whichever the owner wants to turn.
5. D4: is the free town at 15 intended?

The rest (A1 fix, A2 opaque square, A5 threshold, A6 decoy roll, B1 boss details, C1 to C17) read as clear fixes.

---

Worst three:
1. Unusable and short supplies reveal hidden counts (mod lines, decoys left, hence N); and the reused Delve veil probably draws the item's silhouette, undoing the square frame.
2. Half-own-category decoys name the category (about 50 to 66% for a full-knowledge attacker against 11% control), gems show a possessive-tile signature, and small-word tiles imply a multi-word answer (83% vs 26%).
3. A stack of Decoy sweeps (2 gold each) clears most boards down to the answer's own tiles; the free "most common mod line" is unique to the item for 31% of items, so cheap supplies and a free clue beat trivia on paper.
