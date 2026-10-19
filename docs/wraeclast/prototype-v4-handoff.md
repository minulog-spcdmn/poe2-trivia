# Handoff: Wraeclast run, prototype v4 (after playtest 3) • DRAFT

Draft, not handed out. It fills in once the owner's playtest 3 of v3.1 comes
back with its run log. Until then it collects what is already decided for v4,
so the handoff can go out the same day.

Builds on v3.1 (PR #197, branch `claude/wraeclast-prototype-v3`). Every rule
in `CLAUDE.md` applies. Where this file and `prototype-v3-handoff.md` differ,
this file wins; `decisions.md` has the reasons.

## What playtest 3 found, and what changes

| Found | Change |
| --- | --- |
| (from the playtest 3 log and the owner's notes) | |

## Already decided for v4

### The answer line reads as words

The owner found separate tiles awkward to read. Fusing words by the answer
leaked word breaks, so the player sets them instead:
- Every build on the answer line is drawn as one continuous word. Each
  syllable keeps a faint seam and its own mark (gold, silver, struck) after
  a miss.
- A break key sits beside Clear. Tapping it adds a word gap at the end of the
  line, like placing a tile. Tapping a gap removes it, as a placed tile comes
  back.
- The gap is its own tap target, never the seam between two tiles, since
  tapping a tile takes it back.
- The game never places, suggests or snaps a break, and nothing reacts to
  whether the line holds real words. Checking ignores breaks, as now.
- Word lengths still shows its own pattern; it does not line up with the
  player's breaks.

The item screen design draws it first (next design handoff).

### Supply names

- Golden Page replaced Lore reveal in v3.1.
- The other six (Flare included) get PoE item names from the second names
  pass (`research/supply-items.md`) once the owner picks. Flare is renamed
  because Delve's Flare does something else.

## Open until the log is in

| Question | What decides it |
| --- | --- |
| Does a stack of Decoy sweeps strip boards down to the answer? | Sweeps used per item; misses after sweeping |
| Is gold scarce, or is the pack the real limit? | Gold left at the end; full-pack moments |
| Do zone penalties bite (Incursion, Essence)? | Zone types picked vs offered |
| Is corruption a real choice? | Fronts stopped vs in reach; modifiers met |
| Is Oriath Harbour (a town at step 15) always taken? | Routes through step 15 |
| Do the Wordle marks make guessing cheaper than supplies? | Right answers right after a miss; supplies per item |

## Done when

- Everything above, as decided after playtest 3.
- `npm test` and `npm run check` pass.
- The page is on the beta (`beta-deploy` skill), never live.
- The PR lists anything here that didn't work as written.
