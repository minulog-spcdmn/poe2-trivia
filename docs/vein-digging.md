# Azurite Vein: keep digging (proposal)

> **Draft.** A design for reworking the Azurite Vein into a push-your-luck
> find. Nothing is built yet; the numbers are a hand model and are to be
> checked with bot runs before tuning.

## The problem

- **Too easy for its value.** A ward takes a whole loss, the strongest item
  in the game. The vein sits on a card whose category is in plain sight, so
  it is taken when the answer is likely. Taken in place of an ordinary card,
  today's vein gains a good player about **+0.65 lives** every time one
  turns up.
- **Nothing to feel.** The Flare Cache has its short clock and the Dynamite
  Cache its blast. The vein is just a harder question.

## Pillars

1. **A decision after every strike.** The vein is a run of choices, not one
   question.
2. **Every right answer pays.** A harder question answered right always earns
   a ward.
3. **The danger grows with the haul.** What you stand to lose grows with each
   strike, and you can see it.
4. **It reads at a glance.** Two cards where the game always deals three.
5. **Co-op stays co-op.** The team votes on cards and answers together, as it
   does now.

## The loop

1. **Strike 1.** Pick the vein's card. Its question is in that card's
   category, from further down, as now.
2. **A right strike** puts an Azurite Ward **in hand**. It glows over the
   cards but isn't in the pack yet, so it takes no loss.
3. **Two cards.** Instead of the usual three, the game deals:
   - **the vein**, running on into a random category you're allowed to
     pick: the next strike;
   - **the way out**, a new card (the lit path). It puts the haul into the
     pack.
4. **Strikes 2 and 3** work the same way, each from further down than the
   last. After a right third strike the haul goes into the pack by itself.
5. **A cave-in.** A miss or a time-out on any strike:
   - costs **2 losses** (a ward already in the pack takes one first, as now);
   - **buries the haul in hand**.

**Depth.** The whole vein is one depth's turn, however many strikes it
takes. Taking the way out, or a cave-in, takes the run one depth deeper, as
after any question.

**Room.** The vein card is dealt again only while the pack plus the haul has
room for another ward. Otherwise the haul goes into the pack by itself.

## Why it works

**Each further strike is a real decision.** With the haul at stake, digging
on pays only when you are sure enough of the category on the card:

| Haul in hand | Dig on only if you are at least |
|---|---|
| 1 ward (before strike 2) | 75% sure |
| 2 wards (before strike 3) | 80% sure |

The category is random and shown on the card, so the answer depends on the
card in front of you. That's the decision we want, and it is easy to feel
without doing any maths: "do I know Belts that well?"

**Greed costs, care pays.** Expected gain over an ordinary card, in lives:

| Player | Leave after strike 1 | Dig when sure enough | Always dig |
|---|---|---|---|
| Strong | +0.77 | +0.95 | +0.81 |
| Good | +0.65 | +0.65 | +0.19 |
| Shaky | +0.43 | +0.43 | −0.54 |

A strong player gets more out of a vein than now, while a greedy average
player gets much less. The danger is real, but you choose it.

## The one open problem: strike 1

Leaving after strike 1 is today's vein, and it is still too easy (+0.65 for
a good player). Under pillar 2 the fix can't be to take the reward away. It
has to be strike 1's question:

- **Target:** leaving after strike 1 worth about +0.3 for a good player.
  That means getting strike 1 right about 3 times in 4, against about 85%
  now.
- **Levers:**
  - **Further down:** 25 depths further, not 15. This bites only above
    about depth 85, where the curves run out.
  - **A shorter clock:** a share of the deeper depth's clock. This works at
    every depth, but it borrows from the Flare Cache's identity, so keep the
    cut small.
- **Tune with bot runs** (tests/delveFinds.test.ts style), not this table.

## Co-op

The same loop, with no new rules for the team:

- **Picking:** the team votes between the two cards with the vote they
  already have.
- **Answering:** everyone answers each strike. The first right answer clears
  it, and its ward goes into the team's haul, given to whoever got it right,
  or to a teammate with room when it is banked.
- **Cave-in:** when nobody is right, the haul is buried. Each wrong pick costs
  the player who made it 2 losses, as a cave-in does now.

A team clears strikes far more often than one player, as with every
question in co-op. The cap of 3 strikes keeps a vein to at most 3 wards
for the whole team.

## Feel

- **The two-card deal** is the moment: the hall's third card slot is dark
  rock. The vein card glows azurite blue, the way out burns with the warm
  light of the path.
- **The haul** hangs over the cards as shards of light, one more each strike,
  and it flickers more the deeper you are into the vein.
- **Each strike** shakes the hall a little more, with the sound of a pick on
  stone and creaks and dust that grow with every strike.
- **The way out** carries the haul into the pack with the ward sound: a
  release.
- **A cave-in** with a haul in hand: the shards go dark and fall, and the
  cave-in that follows is heavier than today's.

## Rules details

- **Lockout.** Strikes don't count towards the lockout: the extra picks at
  one depth would leave too few categories to deal three cards next time.
  The vein card's own pick locks its category as now. "Allowed to pick"
  means not locked, not already dug in this vein, and with items left.
- **Items.** Flares and dynamite still don't work on a vein's questions.
- **Limits.** At most 3 strikes per vein, and only while there's room for
  another ward.

## Engine notes

Most of this fits the game as it is:

- **The two-card deal is an ordinary choosing phase** at the same depth: the
  offer is the vein's next category plus the way-out card.
- **This avoids the problems an extra choice on the reveal would bring.**
  The existing vote, the reload snapshot and dealing all apply as they are,
  and the reveal's auto move-on never decides for the player.
- **New state:** `Question.strike`; the haul in hand on the DelveState,
  saved with the game and kept through a host reload; and the way-out card as
  a pseudo-category.
- **The strike number** has to reach every function keyed on (find, depth):
  the rules, the clock, the veil, the guests' timer and the bot.
- **Counters that assume one question per depth** must count the vein once:
  the team streak, `missedHere`, the codex's vein entries. Add `strike` and
  `buried` to the codex entry.
- **LOOKALIKES_ASKED_FROM** is worked out from `deeper`, so it moves with the
  strikes' depths.
- **Also touched:** the rules text (`difficultyText.ts`, `DelveRules.svelte`),
  the bot (choosing between the two cards, from its affinity for the
  category and the haul at stake), achievements that read a cave-in's
  losses, the Lab, sound and effects.
- **Versioning:** bump PROTOCOL_VERSION and update the ruleset pin
  (DELVE_RULESET stays at 2 while ruleset 2 isn't out).
