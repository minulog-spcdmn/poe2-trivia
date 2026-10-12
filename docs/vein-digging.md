# Azurite Vein: keep digging (proposal)

> **Built, being tuned on the beta.** The rules live in `src/lib/delve.ts`
> (the dig: VEIN_MAX_STRIKES, VEIN_DEEPER, LAMP_START, LAMP_FEED) and
> `src/lib/game.ts`; the numbers below are the first playtest's. The lab
> (`lab.html`) deals a dig's two cards after strike 1 or 2.

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
3. **One danger you can see, growing.** Not a number in the rules: something
   on screen that runs out.
4. **It reads at a glance.** Two cards where the game always deals three.
5. **Co-op stays co-op.** The team votes on cards and answers together, as it
   does now.

## The fantasy

Azurite lies off the lit path, in the dark. To dig it you leave the light
with only your lamp, and the seam can come down on you. Everything below
serves that: going in, the lamp burning down, a choice to go deeper or get
out, and what you lose if the rock comes down.

## The loop

1. **Strike 1.** Pick the vein's card. Its question is in that card's
   category, from further down, as now, and the **lamp is lit**.
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
takes. Taking the way out takes the run one depth deeper; a cave-in is a
miss, so the run asks again at the same depth, as after any miss.

**Room.** The vein card is dealt again only while the pack plus the haul has
room for another ward. Otherwise the haul goes into the pack by itself. So
a player who holds no wards can dig deepest, and one who holds two gets one
strike: the vein gives most to whoever needs it.

## The lamp: the vein's own danger

The vein doesn't give each strike a fresh clock. **It has one lamp for the
whole dig**, and the clock ring becomes its light:

- **Lit at strike 1** with a share of the deeper depth's clock (start: 80%).
- **It burns only while a question is open.** It holds still while you look
  at the two cards: that choice is the heart of the vein and isn't rushed.
- **Each right strike feeds it** a little ore light (start: half of the
  next strike's deeper clock), so a quick answer carries time forward and a
  slow one leaves you digging in the dark.
- **Too little light to dig** (under FIND_MIN_TIMER, 4 s): the vein card
  isn't dealt again, and the haul goes into the pack.
- **Running out is a cave-in.** The lamp hitting 0 is the time-out.

What this does:

- **It answers "too easy" without taking the reward away.** Strike 1 runs on
  less than a full clock at every depth, including deep down, where "further
  down" has stopped meaning anything.
- **The danger is something you watch.** The light left is on the vein card
  when you choose, and it carries from strike to strike, so each choice
  weighs two things: "do I know Belts?" and "do I have the light for it?"
- **It rewards mastery.** Players who know an item at a glance dig deeper,
  and those who have to think get out sooner. Nothing else in the game does
  that.
- **It doesn't copy the Flare Cache.** The flare's clock is short for one
  question. The lamp is a store of time across a dig that you spend and
  feed.

## Why the choice works

With the haul at stake, digging on pays only when you are sure enough of the
category on the card (a ward counted as a life):

| Haul in hand | Dig on only if you are at least |
|---|---|
| 1 ward (before strike 2) | 75% sure |
| 2 wards (before strike 3) | 80% sure |

Add the lamp and the bar rises with every second you've burnt. Players will
feel the rule without doing any maths: "do I know Belts that well, with this
little light?"

## Tuning

The knobs: the lamp's starting share (0.8), the feed per right strike (0.5),
each strike's `deeper` (+15, +20, +25), and the cave-in's losses (2).

The room bot's answer model can't settle them. Run against these rules, it
puts today's vein at about even by shown depth 50 and a clear loss from 80
on, because its answers are slower than real players' deep down. That
disagrees with how the vein plays, so the bots are the wrong judge of a
mechanic built on speed. Tune it on the beta instead:

- Build it with the knobs in one table (FINDS).
- Have the codex keep each vein's strikes, the light left at each one and
  what was buried, so runs on the beta show where players get out and where
  they cave in.
- Target: a cautious player who gets out after strike 1 succeeds about 3
  times in 4; a second strike is a real coin toss for a good player; a third
  is rare and remembered.

## Co-op

The same loop, with no new rules for the team:

- **Picking:** the team votes between the two cards with the vote they
  already have.
- **Answering:** everyone answers each strike. The first right answer clears
  it, and its ward goes into the team's haul, given to whoever got it right,
  or to a teammate with room when it is banked.
- **The lamp** is the team's: it burns until the first right answer.
- **Cave-in:** when nobody is right, the haul is buried. Each wrong pick costs
  the player who made it 2 losses, as a cave-in does now.

A team clears strikes far more often than one player, as with every
question in co-op. The cap of 3 strikes keeps a vein to at most 3 wards
for the whole team.

## Feel

- **The two-card deal** is the moment: the hall's third card slot is dark
  rock. The vein card glows azurite blue, the way out burns with the warm
  light of the path.
- **The lamp** is the clock ring turned azurite: a light that stays lit
  from strike to strike, flares as ore is fed to it, and gutters as it runs
  low. When it gutters, the darkness closes in from the edges of the screen.
- **The haul** hangs over the cards as shards of light, one more each strike.
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
- **New state:** `Question.strike`; the haul in hand and the lamp's light
  left on the DelveState, saved with the game and kept through a host
  reload; and the way-out card as a pseudo-category. A strike's clock is the
  light left, set in the state when it is asked, so guests read it rather
  than work it out.
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
