# Wraeclast run: v5 review

Scope: the v5 diff 391a0926..ff1403f1, read through three lenses (spec, leak, flow), with each finding checked by a skeptic. Findings that were the same defect are merged. Ranked most severe first.

## Wrong rule

- **Wrong rule: Moment's Peace only works on one item per run.** `src/wraeclast/rules.ts:975` (card text at `words.ts:190`). The handoff (line 165) says misses cost no life on any item where you used a Torch and a Golden Page; only Sekhema's Cloak is "Once a run". `missBoons` fires Peace only while `'peace'` is not in `s.spent`, or on the one item it first fired on (`s.peaceOn`). Use both on item 3 and a miss costs 0; use both on item 5 and a miss costs the full 15 to 25 (10 at the duel). Smallest fix: drop the `s.spent` / `peaceOn` gate so Peace applies whenever the item has both a Torch and a Page used, and remove "Once a run" from the card text.

- **Wrong rule: Earned Honour heals only once per run.** `src/wraeclast/rules.ts:951` (card text at `words.ts:192`). The handoff (line 166) says an item you name with only a Golden Page and a Scroll of Wisdom, both used, heals 30, with no once-a-run limit. `namedBoons` checks `!s.spent.includes('honour')` and pushes `'honour'` on the first heal, so every later Page and Scroll item heals nothing, in zones and at the duel. Smallest fix: remove the `s.spent` check and push, and remove "Once a run" from the card text.

## Leak

- **Leak: Balbala's Gift gives unlimited free Torches by leaving and re-entering a town.** `src/wraeclast/rules.ts:1019` (with `canEnter` at 856-864 and `enter` at 1191). `priceOf` makes a Torch free while `vendor.torches === 0`, and every `enter()` builds a fresh vendor with `torches: 0`. Re-entering a cleared town or the camp costs no spread, life or gold, so Leave, Enter, buy the free Torch can be repeated without limit, lighting every item's art for free (and doubling duel hits with Ornate Dagger). Smallest fix: keep the free-Torch flag on the run state (one free Torch per town for the run, or per entry that came after a zone) instead of on the per-entry vendor.

- **Leak: earlier answers come back as decoy names, so they can be ruled out for free.** `src/wraeclast/rules.ts:652-659` (`dealPool`'s `ok` filter), called from `draw()` at 1227. Answers never repeat, but `dealPool` does not see `this.drawn`, so an item named earlier (or shown as the answer after a duel miss) can be dealt as a whole decoy name, and the player knows it cannot be the answer. A simulation of 300 ten-item runs found this on 98 of 3000 boards, in about 30% of runs. The gap predates v5, but v5 deals more decoy names per board. Smallest fix: pass the run's earlier answers (and siblings already shown) into `dealPool` and exclude them in `ok`.

## Minor

- **Minor: an Ancient Orb sibling already shown can later be drawn as the answer.** `src/wraeclast/rules.ts:1215-1220`. Only the answer goes into `this.drawn`, so a sibling shown by name through the Orb can become a later answer. It predates v5 and the player still has to recognise it from clues, hence minor. Smallest fix: add the sibling to `this.drawn` when it is dealt or when the Orb is used.

- **Minor: the item dock shows the full miss cost and a "Low life" warning when Peace or the Cloak will cover the miss.** `src/wraeclast/ItemScreen.svelte:160`. The dock reads `run.missCost()`, which leaves out `missBoons`. With Peace in play it says "Miss: 20 life" when the miss costs 0; at 15 life with the Cloak unspent, a Torch and an Orb used, it warns "one miss ends the run" when the Cloak would refill life. Smallest fix: have the dock use a cost that applies the boons (a read-only variant of `missBoons`).

- **Minor: the run log's per-place "supplies bought" counts purchases, not supplies, under Sacred Mirror.** `src/wraeclast/rules.ts:1107` (summary at `scripts/wraeclast-log-summary.mjs:120`). `buy()` adds `n` (2 for a Scroll under Mirror) to `log.bought` but only 1 to `met.bought`, so the two summary columns disagree. Playtest log only; no effect on play. Smallest fix: add `n` to `met.bought`.
