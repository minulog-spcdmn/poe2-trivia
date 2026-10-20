# Wraeclast run: orchestrator plan

You are the orchestrator for **Wraeclast run** (working title), a new game mode
for poe2.quest. You coordinate the work across coding, design and map
sessions (or subagents), keep the design consistent, and run the playtest
loop with the owner. This file is your brief. It is self-contained: the
earlier session that produced it is gone.

**Owner:** console-trace (Berlin, German and English). Frontend developer,
deep PoE2 player, ships poe2.quest with Claude Code.

## 0. The bundle

Put this folder in the repo at `docs/wraeclast/` (docs only, never shipped).

| File | What it is | Status |
| --- | --- | --- |
| `ORCHESTRATOR.md` | This plan | Current |
| `design-doc.md` | Full design, exported from the owner's Claude Docs doc | Current as of playtest 2 |
| `prototype-v3-handoff.md` | Coding brief for prototype v3 | Ready to hand out |
| `wraeclast-map.json` | The map nodes as currently placed (37 nodes) | Owner still editing; see 6.3 |
| `design-v3-handoff.md` | Design brief for the item screen | Ready to hand out |
| `research/map.md` | The illustrated Wraeclast map: source, its 38 labels, GGG's terms | Reference |
| `research/names.md` | PoE-fitting names for supplies and boss rules | Partly outdated (older supply set) |
| `research/experts-and-losses.md` | Expert tiers that take information away; "The Grave" loss carry-over | Proposals, not yet decided |
| `research/long-tail.md` | A 30-boon pool and long-term goals | Proposals, not yet decided |

**Live links:**
- The design doc (Claude Docs, the owner's master copy):
  https://claude.ai/code/artifact/0fa0afec-10a6-450a-873f-0600974437b6
- The map placement tool (an artifact with a database collection `places`):
  https://claude.ai/artifact/8aoZJ5SWLxdVmsDpDGKVei

  Each place has the fields `name`, `group`, `source`, `town`, `use`, `x`,
  `y` (fractions 0 to 1 of the illustrated map), `note`, `order` and `step`
  (0 to 16).

If your session has the Claude Docs tools, keep the Docs doc as the source of
truth and re-export `design-doc.md` after changes. If it doesn't, treat
`design-doc.md` as the working copy and tell the owner which sections you
changed, so the Docs doc can be updated.

## 1. How to work with this owner

These habits made the earlier sessions work. Keep them.

- **The owner decides how the game feels; you decide the obvious.** Fix
  clear bugs, inconsistencies and loose wording yourself. For anything that
  changes feel, balance philosophy or player experience, ask.
- **Ask in focused steps.** Use multiple-choice questions, 1 to 4 at a time,
  with your recommendation first and marked. The owner often answers with
  "Other" and a better idea, and those answers are binding. Read them
  literally:
  - "1" for a revive meant **1 life**, not option 1.
  - "I never said they have to be before each item" meant: don't over-read
    what was asked.
- **When the owner says something is bad, don't defend it.** Find out why
  it fails, using the owner's own principles (section 3), and come back with
  a design that fixes the cause.
- **Gimmicks get rejected.** A mechanic must be part of the core loop, not
  bolted on top. The owner rejected a whole set of bolt-on gambling ideas for
  that reason.
- **Adversarial reviews are welcome when asked.** Run them as a separate
  agent that hasn't seen the work. Report the findings, ranked.
- **Playtests drive everything.** The owner plays the beta build and sends
  feedback plus a JSON run log. Analyse the log (section 9) before proposing
  changes, and quote what it shows.
- **Write plainly.** Short sentences, no em dashes (a repo rule too), no
  invented PoE lore. Keep chat replies short; long material goes in files.

## 2. The game today (after playtest 2)

The full rules are in `design-doc.md`. In short:

- **A run:**
  - You cross the illustrated Wraeclast map on a branching route of 16
    steps, from the camp (step 0) to one boss (step 16).
  - Towns sit at fixed steps (planned: 4, 8 and 12). Other nodes roll per
    run into zones (about 3 in 4) or Wells and events.
  - It takes 15 to 25 minutes and ends in a win or a loss. There is no clock.
- **One decision per phase:**

  | Phase | The decision |
  | --- | --- |
  | Travel | Where to go, including which corruption front to stop. Nothing is used while travelling |
  | Town | What to buy |
  | Item | What to spend on this item (supplies, a flask charge), then what to answer |
  | Loot | Nothing to decide: you take everything dealt |
  | Boon pick and events | Their one choice |

- **An item:**
  - **Inscription:** a pool of lower-case syllable tiles, the answer's own
    mixed with decoy syllables from other item names. There are no whole
    names on the board and no counts anywhere.
  - **Veil:** the art, fully covered in a square frame that is the same for
    every item, burned in through organic patches. This reuses Delve's veil
    pipeline.
  - **Free clue:** one weak clue from the zone type: text, except in Blight and Kalandra zones, which burn in a little of the art.
  - You use supplies, then tap tiles to build the name. Every submit counts.
  - **Right:** loot cards are dealt and you take all of them.
  - **Wrong:** you lose life, the drop loses a card, and Wordle marks appear.
    A tile in the right place glows gold, a tile the answer holds elsewhere
    glows silver, and a tile not in the answer is struck. A miss therefore
    always teaches something, paid for in life.
- **Supplies** come in cheap stacks; the pack holds 8 stacks of up to 5.

  | Supply | What it does |
  | --- | --- |
  | Flare | Burns in about a sixth of the art |
  | Scroll of Wisdom | The next mod line, from the most common to the rarest |
  | Lore reveal | The flavor text |
  | Category reveal | The item's category |
  | Base reveal | The base type; expensive, because it is expert trivia |
  | Decoy sweep | Strikes 4 decoys |
  | Word lengths | The word count and the tiles per word |
  | First syllable | Places the answer's first tile |

- **Life and the flask:**
  - 100 life. Misses cost 20 to 30 early, rising to 55 to 65 at the boss,
    and the range is shown before you submit.
  - A flask charge is drunk during an item: 10 life at once, then 10 after
    each of the next 2 items.
  - Towns heal 20. Only Wells refill flask charges.
- **Zone types are PoE league mechanics.** Each has a free clue and a rule.
  Six are available from the start (Plain, Incursion, Essence, Ritual,
  Expedition, Blight) and four are found in the fog (Delirium, Kalandra,
  Ultimatum, Necropolis).
- **Corruption spreads like on the PoE2 Atlas:**
  - At the start, 3 zones at steps 3 to 7 are corrupted.
  - After every second step you take, each front creeps one step forward.
  - A corrupted zone has a hidden modifier that flips when you arrive and
    deals double loot.
  - Clearing a front's zone stops that front.
  - Every front still alive at the boss adds a boss modifier, up to 3.
- **The boss:** a chain of 3 items under one rule, such as Silent (only
  Flares work). It is known from the start.
- **Progression:**
  - 5 tiers.
  - Fog that clears for good.
  - Hidden zone types, shortcuts and boon unlocks found in the fog. Boons
    found there only join the pool when you win.
- **Co-op is a raid:**
  - **The shared fight:**
    - One shared screen: the same item, clues, tiles and marks for everyone.
      Strangers in public rooms must be able to play without chat.
    - Free-for-all: anyone can strike at any time, and the first right
      strike fells the item.
    - A wrong strike costs only the striker life, and its marks show for
      everyone.
  - **Your own run:**
    - Everyone has their own life, flask, pack and gold.
    - Miss damage is +10% per extra player, up to +60%.
  - **Falling and reviving:**
    - A fallen player drops everything they carried.
    - A teammate revives them with their own flask charge, at 1 life.
    - The run is lost when everyone is down at once.
  - **Loot:** one shared deal of 2 cards plus 1 per player who acted. Every
    player who acted may take one, first come, first served.
  - **Between items:** picks are voted with Delve's raffle.

## 3. The owner's design principles (hard rules)

Every proposal must pass these. Most were learned from rejections.

1. **Trivia is the heart.** Knowing PoE items must be what wins. Nothing may
   replace knowledge as the main skill.
2. **No time pressure.** Challenge comes from scarce information and
   resources. The game must still be hard: Delve was "almost too easy even
   with a harsh time limit".
3. **No free information.** Showing a count (mod lines, names, decoys,
   words) is a free clue. So is an item's art size, a category card, or a
   board of only bows. Hunt for these leaks.
4. **Every choice costs something,** and every reward has a downside. A
   multiplier without a cost is always taken, so it isn't a choice. A
   gamble that is free once you know the answer isn't a gamble.
5. **Gambling is core, not gimmicks.** PoE players love gamba, but it must
   live in the main loop: loot and corruption. The owner wants a mix of
   knowledge bets and pure luck. **No loot beams.**
6. **One clear decision per phase.** Never stack two decision types in one
   moment (for example, using items while picking a route).
7. **Solo first; co-op is live and shared.**
   - No leaderboards, no shared seeds.
   - In co-op, everyone sees the same screen, clues and syllables, so
     strangers without chat can play.
   - No shared health bar ("just feels wrong").
   - Keep some fairness. Penalties may be asymmetric where rewards are.
8. **PoE-authentic names only.**
   - Use a PoE item or currency name only when it does what it does in the
     game. Scroll of Wisdom and Flare qualify. Vaal Orb corrupts, but its
     version here was cut.
   - A supply is named after an item you can buy, carry and use: never an
     NPC, an action or a league mechanic (owner, Oct 19). One name means one
     thing across poe2.quest, so Delve's Flare rules out a Flare here.
   - Other names are labelled working names until a fitting one is found.
   - Map nodes are **actual places on Wraeclast**, at their spot on the
     illustrated map. Nothing invented, nothing from outside Wraeclast.
   - Zone types are league mechanics.
9. **Mobile first.** Half the players are on phones. Tap only, no keyboard,
   375 px wide.
10. **Data is automated.** Clues and syllables come from scripts over
    `items.json` and `itemStats.json`, guarded by tests. Only the map layout
    is placed by hand.
11. **Not a kids' game.** Harsh is fine: a revive brings 1 life, and death
    drops everything.
12. **Cheating and lookups don't matter.** Don't design around them.
13. **Keep the look of poe2.quest:** the card selection look (shop wares,
    boon offers, loot and event cards), the arcane style and the item art.

## 4. Rejected ideas (do not re-propose)

| Idea | Why it was rejected |
| --- | --- |
| Category cards before each item (with or without multipliers) | They spoil the item type; a multiplier without a cost is always taken |
| Free art patches / rigid tile grid Veil | Art decides everything; one patch was often enough. Use burn-in, scarce |
| Requirement reveal (level, attributes) | Never helps anyone |
| Lore reveal only, mod lines only when they spoil | Unequal clues. Now: Scroll reads common to rare, Lore and others are separate supplies |
| Names on the board, Name strike, "N names" | Board must be syllables only; no counts |
| Auto spacing of words | Leaked and invented word breaks; now no spaces at all |
| Gold spent during a question | Gold is spent in towns on supplies used during items |
| Infinite flask / instant full heals | Flasks heal over time, refill only at Wells |
| A shared party health bar, life rings, gold to right backers, vote-based answering | Feel wrong or cause herding; the raid model replaced them |
| Bolt-on gamba: Vaal on items, Divine/Chaos rerolls, Gwennen stall, let it ride | "Cheap gimmicks added on top" |
| Vaal Orb on the item (lock + rolled outcome) | Always worth it once you know the answer: no tradeoff |
| Player-applied zone corruption during travel | Mixes decision types; replaced by map-rolled spreading corruption |
| Unidentified (face-down) loot card | Felt bad |
| Pick 1 of N loot cards | More cards with one pick isn't worth the risk; now take all |
| Co-op: a loot deal per player | Breaks the shared game world; now one shared deal, first come |
| Invented zone or place names, places outside Wraeclast | Must be real Wraeclast places |
| Reusing a PoE currency for a different function | Confusing to PoE players |

## 5. History in brief

| Step | What happened |
| --- | --- |
| Concept | Questions with the owner led to a roguelike map run with trivia at its heart, no clock, solo first, live co-op, and card selection kept |
| Design doc | Written in Claude Docs, then adversarial reviews; co-op redesigned into the raid model |
| Map | Research on the illustrated PoE2 map; a placement tool; 40 nodes chosen for even density (k-center plus swaps). The owner now edits placements by hand |
| Prototype v1 | 15-item solo run on the beta |
| Playtest 1 | Too easy, unbalanced: Flares dominated, requirements useless, mods spoiled, category cards spoiled. Changed the Veil to burn-in, the clue balance, Inscription supplies, mixed boards, cards for shop, boons and events |
| Prototype v2 | Built from the v2 handoff |
| Playtest 2 | Better, still bad (the first table in `prototype-v3-handoff.md` lists every finding and change). Led to the current design |
| Now | Prototype v3 handoff ready, design v3 handoff ready, map placements in progress |

**Playtest 2 log highlights** (the reason for the Wordle marks): one run
lost at item 9. Amor Mandragora took 99 life in 3 misses ("searing mandrago
ra", "mandrago ra", "mandrago rament"), and none of the misses taught the
player anything. The splitter left "mandrago" as one tile, and auto spacing
put a break before "ra" because "Tabula Rasa" was on the board. Gold earned
was 28, gold spent 49. Supplies were short all run.

## 6. Workstreams

### 6.1 Prototype v3 (coding), first priority

- **Input:** `prototype-v3-handoff.md` and `wraeclast-map.json`. Give the
  coding session or subagent both, plus `CLAUDE.md`.
- **Output:** a PR on a branch, then the beta via the `beta-deploy` skill.
  Never deploy live.
- **Before merging, check:**
  - the "Done when" list in the handoff;
  - that the generated files are on the "Generated, don't hand-edit" list;
  - that the dev hub card exists (`tests/devHub.test.ts`);
  - `npm test` and `npm run check`;
  - a 375 px screenshot of the boss pool.
- **Then:** tell the owner it's ready and what to look at, and wait for
  playtest 3 (section 9).

### 6.2 Item screen design v3 (design session)

- **Input:** `design-v3-handoff.md`. It works on the design canvas.
- **Output:** boards for every listed state, plus a clear answer to
  whether the boss pool fits at 375 px. Feed that answer back into the doc
  (Open questions).
- Runs in parallel with 6.1.

### 6.3 Map placements, then the map art

- **The owner is editing placements** in the placement tool. The export in
  this bundle shows the work in progress:
  - Step 4 has no node: The Ardura Caravan is unused, so there is no town
    there.
  - Step 6 has one node.
  - Oriath Harbour is flagged as a town at step 15.
  - 9 used labels (Ezomyr, Highgate, Kingsmarch, Lioneye's Watch, Lira
    Vaal, Mt Kalisa, Sarn, The Grand Arena, The Spires of Deshar) have no
    step.

  Ask the owner whether these are intentional before treating the map as
  final. Don't change placements yourself.
- **When the owner says placements are settled:**
  1. Re-export the used places with a step from the `places` collection.
     The node kind is camp at step 0, boss at step 16, town when
     `town: true`, else open. Write them to `src/data/wraeclast.json`.
  2. Write the **map art handoff**: an arcane-style remake of the
     illustrated map for a design session. Its contents:
     - the place names the original shows, with campaign zones fitted where
       they make sense;
     - node positions from the export;
     - styles for towns, the camp and the boss;
     - how paths are drawn;
     - the corruption glow and its creep;
     - fog;
     - vertical scroll on phones;
     - the licence note: GGG allowed use for a free game, and the source
       and terms are in `research/map.md`.
- **The map screen** (nodes, paths, corruption, travel choice) gets its own
  design handoff after playtest 3, when the travel phase has been played.

### 6.4 Later design handoffs

These come after playtest 3, since they depend on how v3 plays:
- the vendor screen (wares dealt as cards with prices; stacks);
- the end screen;
- the boss intro (rule plus corruption modifiers).

### 6.5 Doc upkeep (continuous)

After every decision, update the design doc in all affected places. A
change usually touches several of:
- the item flow;
- the supplies table;
- the rules in detail;
- the boons that reference the change;
- the sample run;
- the open questions.

Search for stale words after each change. Words that went stale before:
patch, names, category card, multiplier, Vaal, unidentified. Keep the
handoffs consistent with the doc.

### 6.6 Milestones after the prototype

From the doc's build order. Each ships to the beta and passes its gate before
the next one starts.

| Milestone | Contents | Gate |
| --- | --- | --- |
| 1. Zone prototype | Done in spirit by v1 to v3 | Under half of items solved without a supply; building is fun on a phone |
| 2. Map and route | Map art, wraeclast.json, zone types, corruption, towns, Wells, one boss, full run (v3 covers most of it) | Experts need 15 min or more; regulars win about half at tier 1 |
| 3. Run depth | Boons, events, resume after reload, tuned prices | Players start another run right after finishing |
| 4. Co-op | Raid model, Delve's raffle for picks, revives | About 10 stream viewers finish a run without one player running it |
| 5. Progression | Tiers, persistent fog, shortcuts, hidden zone types, boon unlocks | Players return within a week |

## 7. Parallel work with subagents

| Can run in parallel | Must wait |
| --- | --- |
| 6.1 coding, 6.2 item screen design, research tasks (names, boon pool) | Map art handoff (waits for settled placements) |
| Doc consistency passes | Map screen and vendor design (wait for playtest 3) |
| Data script improvements (splitter, decoy picker) inside 6.1 | Tuning changes (wait for playtest logs) |

- **Coding subagents:** give them an isolated worktree, the handoff file,
  and the rule that `CLAUDE.md` wins on conventions.
- **Review subagents:** have them check the PR against the handoff's
  "Done when" list and the principles in section 3. They must not have
  seen the implementation discussion.
- **Every subagent:** never deploys live, never edits generated files by
  hand, and reports anything it couldn't do as written.

## 8. Decisions still open for the owner

Ask these when they become relevant, not all at once.

1. **PoE names for the working-name supplies:** Lore reveal, Category
   reveal, Base reveal, Decoy sweep, Word lengths, First syllable. Each name
   must match what the supply does in PoE. `research/names.md` has
   candidates for an older supply set.
2. **The Flare clash:** Delve in poe2.quest already has a Flare that adds
   time. Here a Flare burns in art. That may break principle 8. Rename one?
3. **Names:** the boss names (current rules: Blind, Silent, Mirrored,
   Hoarder, Shifting), the mode's name, and the source of the map art.
4. **The research proposals:** expert tiers that take information away and
   "The Grave" loss carry-over (`research/experts-and-losses.md`); the
   30-boon pool and long-term goals (`research/long-tail.md`). None adopted
   yet.
5. **Wordle marks:** too strong? Playtest 3 decides. If they are, options:
   gold only, or higher miss costs.
6. **Co-op loot balance:** a party collects more loot in total than a solo
   player. Is +10% miss damage per player enough?
7. **Co-op rejoin:** how guests find the room again after the host reloads.
8. **Phone fit:** whether the boss pool fits at 375 px. The design session
   answers this.
9. **The map's gaps** (section 6.3).

## 9. The playtest loop

The owner plays the beta, then sends feedback text plus the run log (the
"Copy run log" JSON). For each playtest:

1. **Read the log first.** Compute:
   - win or loss, where the run ended, and life over time;
   - misses per item and the life lost per miss;
   - items answered with no supply;
   - supplies bought, found and used per type, and accuracy after each;
   - gold earned and spent;
   - loot taken by kind;
   - time per item and run length;
   - corruption fronts stopped and alive, the modifiers met, and the boss
     modifiers;
   - wrong-then-right follow-ups (are the marks doing too much?).
2. **Look for the stories:**
   - the item that killed the run;
   - leaks that made items free;
   - supplies never bought;
   - moments where the player was stuck.

   Quote them back to the owner.
3. **Sort the feedback:**
   - **Fix yourself:** bugs, leaks, numbers, splitter issues.
   - **Ask the owner:** anything that changes how the game feels. Use
     focused questions with a recommendation.
4. **Update the doc,** write the next handoff version (keep a "What
   playtest N found, and what changes" table at the top, as v3 does), and
   update the design handoff if screens changed.
5. **Targets** (from the doc):

   | Measure | Target |
   | --- | --- |
   | Items answered without a supply | Under half, even for regulars |
   | Supplies | Every supply bought sometimes |
   | Time per item | 20 to 60 s |
   | Run length | 15 min for experts, 20 to 25 for most |
   | Win rate at tier 1 | About half for regulars |

## 10. Repo facts and conventions

- **Stack:** Svelte 5, TypeScript, Vite, PeerJS (P2P WebRTC; the host's
  browser is authoritative, guests are untrusted), WebGL2, GitHub Pages.
- **Rules from `CLAUDE.md`:**
  - no em dashes;
  - phones from 375 px;
  - plain `:hover`;
  - storage only through `src/lib/storage.ts`;
  - generated data is never hand-edited and is listed in `CLAUDE.md`;
  - test pages get a dev hub card (`dev.html`; `tests/devHub.test.ts`
    enforces it) and an entry in the beta build inputs in `vite.config.ts`;
  - deploy to the beta with the `beta-deploy` skill.
- **The test page:** `wraeclast.html` at the root, source in
  `src/wraeclast/`, beta only.
- **Data:**
  - `src/data/items.json` holds 501 items: 445 uniques and 56 lineage gems.
    Fields: `id`, `name`, `base`, `group`, `category`, `kind`, `w`, `h`.
  - `src/data/itemStats.json` holds the tooltip lines per item id, as
    sections of `[kind, text]` pairs. Kinds: `p` props, `r` requirements,
    `e` explicit mods, `f` flavor, `d` gem description.
  - `fakes.json` holds hand-written made-up names (allowed from tier 4).
- **Reusable code:**
  - the Delve veil pipeline: `src/lib/patches.ts` (organic patches),
    `veilCut.ts`, `veilWorker.ts`, `materialize.ts` (the burn-in effect);
  - `src/lib/lookalikes.ts`;
  - `Engine.makeQuestion` in `src/lib/game.ts`;
  - the deal and card looks of the other modes;
  - Delve's raffle vote.
- **Generated for this mode:**
  - `src/data/syllables.json` (`scripts/make-syllables.mjs`);
  - `src/data/clues.json` (`scripts/make-clues.mjs`).

  Both have tests and both go on the generated list.
- **Hand-placed:** `src/data/wraeclast.json` (map nodes). It is not on the
  generated list.

## 11. Measured data facts

- Every item has unique flavor text.
- 323 of 445 uniques are the only unique of their base in their category,
  so the base type gives about 3 in 4 away.
- 482 items have at least one mod line no other item has.
- 399 of 501 items have at least one mod line shared by 3 or more items,
  with a median of 2 such lines per item.
- Name words leak into clues, so the scripts mask them with a fixed-width
  `▮▮▮`:
  - about 85 to 87 flavor texts;
  - about 20 mod lines or gem descriptions;
  - 19 gem Category lines.
- Lineage gems have only three base types (Strength, Dexterity and
  Intelligence support), so their "base" clue is the support description.
- Item art ranges from 80 x 80 to 108 x 420 (tall weapons) and 212 x 108
  (wide). Hence the fixed square frame.

## 12. Your first moves

1. Read this file, then `design-doc.md`, then both handoffs.
2. Ask the owner the map questions in 6.3 (one focused question), unless
   they already said placements are final.
3. Start 6.1 (a coding session or a subagent in a worktree) and 6.2 (the
   design session) in parallel.
4. While those run, prepare the map art handoff outline. It is final only
   after the placements are.
5. When v3 is on the beta, tell the owner what's new and what to look at,
   then wait for playtest 3 and run section 9.
