# Azurite Vein: keep digging (proposal)

> **Draft.** A proposal for reworking the Azurite Vein into a push-your-luck
> find. Nothing here is built yet; the numbers are a starting point for
> playtests. The open questions at the end need answers before it is built.

## Why change it

A vein asks its question from 15 depths further down, and a miss caves in
for two losses. That is cheap for what a ward is worth:

- **Players pick it on a category they know.** The vein sits on a card whose
  category is in plain sight, so it is taken when the answer is likely.
- **"Deeper" runs out.** The curves top out around depth 100, so from about
  85 (shown) a vein's question is hardly harder than the depth's own, and from
  120 it is the same question.
- **It pays well.** Counting a ward as about one life, a vein is worth
  3p − 2 lives for a player who answers it right with chance p: +0.55 lives
  at p = 0.85, every time one turns up.

It also plays like any other card. The Flare Cache has its short clock and the
Dynamite Cache its blast; the vein has nothing you see or decide.

## The idea

The vein is a seam you dig into, one strike at a time. Each right strike
brings out a ward, and after each one you decide: **take what you have and go
on**, or **dig deeper** for another. A cave-in buries everything you dug out
of this vein, and costs lives. The danger is your own greed.

## Rules

### A dig, alone

1. **Strike 1.** Picking the vein's card asks a question in that card's
   category, as now, but from **25** depths further down (now 15).
2. **A right strike** brings out an Azurite Ward. It is *in hand*: shown
   glowing over the vein, not yet in the pack, so it takes no loss yet.
3. **The choice.** The reveal shows two buttons in place of Next:
   - **Take it** banks everything in hand into the pack, and the run goes
     on one depth deeper, as after any question.
   - **Dig deeper (Rings)** asks the next strike. Its category is drawn
     when the choice is shown and named on the button, so you decide
     knowing what you're digging into. It is drawn from every category
     but the one just asked; it doesn't take the lockout into account and
     doesn't lock anything.
4. **Further strikes** come from further down still: strike 2 from depth
   +35, strike 3 from +45 (`deeper` per strike), each with its deeper
   depth's clock.
5. **How far.** At most as many strikes as the pack has room for wards
   (DELVE_MAX_WARDS = 3, less those held). The strike that fills it banks
   the haul by itself.
6. **A miss caves in.** A wrong answer or a time-out on strike *k*:
   - buries the haul in hand (every ward this vein brought out);
   - costs **2, 2 or 3 losses** on strikes 1, 2 or 3, each taken by a ward
     already in the pack first, as now;
   - and the run goes on one depth deeper, as after any miss.

Digging never takes the run deeper by itself: every strike is asked at the
vein's depth, and the run goes one deeper once you leave the vein, whatever
you leave with. Flares and dynamite still don't work on a vein's questions
(`itemsWorkOn`).

### Together

- Everyone standing answers each strike, as now. A strike is cleared by
  the first right answer, and its ward goes to the one who got it (or to
  a teammate with room, as now). Each wrong pick costs the player who made
  it the strike's cave-in losses.
- Nobody right: the seam caves in and the whole haul in hand is buried,
  whoever was holding it.
- **Dig or take it** is a team vote, like the cards: two choices, the
  first vote opens VOTE_WINDOW_MS for the rest, a tie banks.
- How far: as long as someone standing has room for a ward.

## Balance

A rough model: a ward counts as one life; *p1* is the chance of getting
strike 1 right (the player's own pick of category), *pr* the chance on a
category drawn for them; each strike past the second a little harder still.
Values are the expected gain in lives for a player who always stops after
*k* strikes.

| Player | Now (1 strike) | Stop after 1 | Stop after 2 | Stop after 3 |
|---|---|---|---|---|
| Strong (p1 .90, pr .75) | +0.70 | +0.49 | +0.49 | +0.04 |
| Good (p1 .85, pr .65) | +0.55 | +0.34 | +0.03 | −0.63 |
| Shaky (p1 .75, pr .55) | +0.25 | +0.04 | −0.50 | −1.20 |

What this gives:

- **One ward is still worth taking,** but for less than now, and a shaky
  player gains almost nothing from it.
- **A second strike breaks even** for a good player and pays for a strong one;
  whether to take it depends on the category you'd be digging into, which is
  the decision we want.
- **A third strike is for the very strong only,** and its cave-in can end a
  full run. That's the story people will tell.

Variants I tried and dropped:

- **A ward for every strike, a cave-in of two each time, strike 1 as now.**
  Greed is balanced, but taking one ward and leaving pays as much as now
  (+0.55), so the vein is no harder.
- **Strike 1 only opens the seam, with no ward.** It needs two right answers
  for the first ward: below zero for everyone but the strongest, so nobody
  would dig.
- **Further strikes in the same category.** Greed stays profitable for
  everyone (+0.62 at "good" after 2), because the category was picked for
  being easy.

**How often veins turn up.** A vein can now pay up to three wards, so strong
players earn more wards than now and everyone else fewer. Keep the vein's
chance at 11% for the first playtest, and lower it if strong runs end up
with a full pack too often.

**The deep end.** Past about depth 85 "further down" means little, so there
the drawn categories and the cave-ins are the vein's whole danger. That's
probably enough; if it isn't, the strikes' clocks can shrink there (as the
Flare Cache's do).

## How it should feel

- **Each strike shakes the hall a bit more:** a pick striking stone, then dust
  and creaking that grow with every strike. The haul in hand glows above the
  vein card, one more shard each strike.
- **Dig deeper** shows the next category's emblem and what a cave-in would
  cost ("buries 2 wards, costs 2 lives"), so the risk is in front of you as
  you press it.
- **Take it** carries the haul into the pack with the ward's usual sound.
- **A cave-in** with a haul in hand gets more than today's cave-in: the
  shards go dark and fall away.

## What it touches

- `src/lib/delve.ts`: per-strike `deeper` and cave-in losses in FINDS (or a
  vein-only table), a strike limit from the pack's room, the next strike's
  category draw, the rules text in the comments.
- `src/lib/game.ts`: `Question.strike`; the haul in hand on the DelveState;
  a new `dig` action beside `next` (solo: the active player; co-op: votes);
  `coopReveal` and the solo answer burying the haul on a miss; `Reveal`
  carrying the haul and the next strike. Bump DELVE_RULESET and
  PROTOCOL_VERSION.
- `src/lib/protocol.ts`, `src/lib/session.svelte.ts`: the `dig` action and
  the dig vote.
- `src/components/QuestionView.svelte` and the reveal: the two buttons, the
  haul, the strike count; `DelveRules.svelte` for the rules text;
  `Inventory.svelte` for the haul going into the pack.
- `src/bot/brain.ts`: a dig appetite (its affinity for the drawn category,
  its lives and wards, the strike's cave-in); `findAppetite` with the new
  costs.
- Codex and last run: veins dug and the deepest strike.
- Sound and effects: strike, creak, banking, a cave-in burying the haul.
- Lab: plant a vein at any strike with any haul.
- Tests: the strike limit, banking, a cave-in burying the haul alone and
  together, the vote, a reload in the middle of a dig, older saves.

One assumption to retire: a player's right answers are no longer their
depth less the lives they lost, since strikes add right answers without
going deeper. Nothing shows `score` in Delve, but anything that relies on it
has to be checked.

## Open questions

1. Should the next strike's category show before you choose to dig? (I'd say
   yes: it turns the choice into a real decision rather than a coin flip.)
2. Is a cave-in of three on strike 3 too brutal, or exactly the point?
3. Together, a team vote, or does whoever cleared the strike decide?
4. Should the strike limit be the pack's room, or a fixed three, with
   wards beyond the room left in the rock?
