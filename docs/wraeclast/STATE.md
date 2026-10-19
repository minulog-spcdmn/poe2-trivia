# Wraeclast run: state (Oct 19, evening)

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

## Phase: back to the drawing board

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
- **Kept from v4:**
  - the 10-step route with 2 items a zone;
  - the item screen and the supplies;
  - real look-alike decoy names, drawn as a walk;
  - the v4d stakes: misses 30-40, 40-50, 50-60, boss 65-75; towns heal 10;
    the flask holds 1 drink; no Silent.

## Ask the owner first

What else goes back to the drawing board ("many things")? Then send one
combined brief to design: options first, text only, no boards.

Still open, later: the gem tell, the "o'" tile, the map art (waits for the
map).

## Where things are

| What | Where |
| --- | --- |
| Prototype | Branch `claude/wraeclast-prototype-v3`, PR #197 (not merged), latest `391a0926` (v4e plus run logs to disk). Session "Wraeclast prototype first playable", idle. Dev runs write their log to `.wraeclast-logs/` at the served worktree's root; `node scripts/wraeclast-log-summary.mjs <file or folder>` prints a short summary (it also reads a pasted `{ wraeclastRuns: [...] }`). The playtest worktree is still at v4d, which has no logging: pin 391a0926 or later before the next playtest |
| Design | Session "Design", branch `claude/design-4ca3ba`; `docs/wraeclast/design-v5-options.md` at `d56f6890` (not pushed). Holding for the combined brief |
| Playtest server | Worktree `.claude/worktrees/wraeclast-playtest`, detached at v4d `8b883c79`; stopped. To serve: `.claude/launch.json` entry `wraeclast-playtest` runs `npm --prefix <that worktree> run dev -- --port 5199 --strictPort --host`. Phone: `http://192.168.178.88:5199/wraeclast.html`. Pin only when the owner says they're between runs |
| Docs | `docs/wraeclast/` on branch `claude/poe2-feature-orchestrator-0e9b63` (pushed). Main has PR #199's older copy |
| Evidence | `playtests/playtest-3.md` to `playtest-5.md`, `reviews/v4b-review.md`, `reviews/v4b-newcomer-read.md` |
| Map, boards | Placement tool `https://claude.ai/artifact/8aoZJ5SWLxdVmsDpDGKVei` (collection `places`); canvas `https://claude.ai/artifact/EEvHCvHLeL3hcJ38aocxrp` |
