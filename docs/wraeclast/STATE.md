# Wraeclast run: state (Oct 20)

The one page a fresh orchestrator reads first. Then, only as needed:
- `ORCHESTRATOR.md`: the brief and the principles (supply naming, principle 8);
- `decisions.md`: why things changed, newest first;
- the master design doc in Claude Docs: project
  `0fa0afec-10a6-450a-873f-0600974437b6`, tab `7acf743a-9e61`, body node
  `61fac13f-0ce3`. `design-doc.md` here is an older export, refreshed only
  before merging to main.

The working rules are in memory, which loads on its own:
- the orchestrator plans and delegates, and never codes or designs;
- be proactive, and ask the owner only about feel, balance and names;
- model tiers for delegation;
- early prototype: no hardening;
- `orchestration-token-efficiency`: build only what changes the feel.

## Phase: playtesting the redesign (v5)

The owner paused playtests after playtest 5: "we have to fix the workflow
for efficiency first and go back to the drawing board on many things".
Nothing gets built until the redesign is settled.

## Decided for the redesign

- **Growth: Pacts.** An edge with a lasting price. Clearing a corrupted zone
  deals 1 of 3; they are never sold, and a run gets 2 to 4. They are named
  after Path of Exile 2's own boons, which needs a research pass on which
  boons exist and what they do.
- **The boss is a duel** (`design-v5-options.md`, Boss A):
  - the boss has life;
  - a right answer hits it harder the fewer supplies it used (10, 6, 3);
  - it hits you for 10 as each item opens;
  - every front still alive adds to its life and hit.
- **No league mechanics on the map.** Zone types named after leagues
  (Incursion, Essence, Ritual, Expedition, Blight) go. Design proposes what
  gives a zone its character.
- **Owner's vision (Oct 19, `decisions.md`):** an open Wraeclast, not a
  linear route. Start weak, clear zones for upgrades and loot until you feel
  strong enough for the boss (perhaps the Beast, spreading corruption). The
  spread is a soft timer: wander long and zones harden; go early and you're
  too weak. Runs about 10 min. Stakes are bets you opt into.
- **Also back to the drawing board:** the map and route, supplies and shops
  (all reveal a bit of info, some just better, no downside, too many kinds),
  corruption and fronts, life and misses.
- **Kept from v4:** the item screen (Inscription) and real look-alike decoy
  names, drawn as a walk.

## Now

Owner picked from design's v6 options (`decisions.md`, newest rows): open
region, depth plus one waystone mod, the Seed of Corruption, Pledges
(formerly Pacts), four supplies (Torch, Golden Page, Ancient Orb, Scroll of
Wisdom), all bought with gold. Gambling lives in town, to make the shop
interesting. Three rounds of town pitches missed (sections 9 to 11; 11 went to crafting and
skill gems: "you have lost the plot"). Round 4 (`design-v7-town.md`, three
pitches judged by owner-proxy agents) missed too: "all overcomplicated and
none sound like they would be addictive". No more paper rounds on a design
brief: the owner sketches what a town visit should feel like (the pull lives
in the town; closest games Slay the Spire and Hades), and design only makes
that sketch work with items. The sketch (a Hades boon draft in town) is
filled in as `design-v8-town.md`, and the owner said "build it". The
redesign is settled; prototype v5 is being built from `prototype-v5-handoff.md`
on branch `claude/wraeclast-prototype-v5` (in the playtest worktree).

Sessions: an orchestrator opened from the owner's phone (Remote Control)
can't start sessions; it runs design as a Workflow instead.

Still open, later: the gem tell, the "o'" tile, the map art (waits for the
map).

## Where things are

| What | Where |
| --- | --- |
| Prototype | v5, the redesign: branch `claude/wraeclast-prototype-v5` (cut from v4e, no PR), latest `376f8953` (v5.1, the review's fixes). Built by a workflow from `prototype-v5-handoff.md` (code map: `prototype-v5-code-map.md`). 152 Wraeclast tests skipped ("prototype: revisit before merge"). Depth comes from `scripts/wraeclast-depth.mjs` (poe.ninja listings) into `src/data/wraeclastDepth.json`. Dev runs write logs to `.wraeclast-logs/` in the served worktree; `node scripts/wraeclast-log-summary.mjs <file or folder>` summarises them. v4e (`391a0926`, PR #197) is the old route |
| Design | No design session: the orchestrator runs design as Workflows (it's opened from the owner's phone and can't start sessions). Docs `design-v7-town.md` (missed), `design-v8-town.md` (settled) |
| Playtest server | Worktree `.claude/worktrees/wraeclast-playtest`, now on branch `claude/wraeclast-prototype-v5` (builds happen there too). `.claude/launch.json` in the main checkout (git-excluded) has the entry `wraeclast-playtest` (port 5199, `--host`). Phone: `http://192.168.178.88:5199/wraeclast.html` |
| Docs | `docs/wraeclast/` on branch `claude/poe2-feature-orchestrator-0e9b63` (pushed). Main has PR #199's older copy |
| Evidence | `playtests/playtest-3.md` to `playtest-5.md`, `reviews/v4b-review.md`, `reviews/v4b-newcomer-read.md` |
| Map, boards | Placement tool `https://claude.ai/artifact/8aoZJ5SWLxdVmsDpDGKVei` (collection `places`); canvas `https://claude.ai/artifact/EEvHCvHLeL3hcJ38aocxrp` |
