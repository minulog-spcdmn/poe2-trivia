# PoE2.Quest • Unique Item Trivia

**Play at [poe2.quest](https://poe2.quest/)** · made by zoe_arcana · [support the project](https://paypal.me/minuW)

A multiplayer Path of Exile 2 trivia game that runs entirely in the browser and
is hosted as a static site on GitHub Pages. No server needed.

**How to play**

1. On your turn, pick one of three random categories. There are 10 broad,
   similarly sized categories: One-Handed Weapons, Two-Handed Weapons
   (talismans included), Off-Hands, Body Armours, Helmets, Gloves & Boots,
   Rings, Amulets & Belts, Flasks/Charms/Jewels/Relics/Tablets, and Lineage
   Gems. A category you pick can't be
   offered to you again for your next 2 turns on Cruel, 3 on Merciless and
   4 on Eternal (Custom sets its own).
2. Name the unique item or lineage gem from its art (or, on harder
   difficulties, pick the right art for a name). A correct answer scores a point.
3. The first player to reach the host's target score wins. The game only ends
   once a full round is finished, so everyone gets the same number of turns.
   If players are tied at the top, it goes to a **deathmatch**:
   only the tied players play sudden-death rounds with a random category and
   questions one difficulty harder. When some duelists answer right and
   others wrong, the wrong ones are out; if all of them get it right, or all
   get it wrong, another round is played. The last duelist standing wins.

Items aren't repeated within a game until a category runs out, and earlier answers never come back as wrong answers (so they can't be ruled out from memory). Precursor tablets come up about a quarter as often as other items; a tablet question only offers tablets (once too few unseen tablets are left for that, they sit out until the category starts over), and tablets don't appear in other questions.

**Race mode** (online only): no turns. Everyone sees the same question at the
same time, in a random category (never one of the last 2, 3 or 4, by difficulty, or as many as Custom sets).
- The first correct answer scores +1 and ends the question.
- A wrong answer costs −1 and locks that player out until the next question.
  Everyone sees live who guessed what.
- The first player to reach the target score wins.
- Race questions always have a timer (16 s if the host picked "off").
- The host's own answers reach the game instantly, while guests' answers
  travel over the network, so the host has a small speed edge.

**Delve** (alone, online or on one device; or together, online): no
settings. Everyone plays the exact same rules, so "I reached depth 30" means
the same thing for everyone.
- Pick one of three categories and name the item, as in turns mode. Each
  question goes one depth deeper.
- The depth counts the questions cleared: a run sets out at depth 0, where
  the banner shows a short line instead ("Your light is borrowed", "Solve
  et coagula"; over fifty, dealt like a shuffled deck on each device so one
  only comes back once all the others were seen, and kept for the run
  through a reload, `src/lib/delveStart.ts`; the open rooms list says
  "entrance"), and each zone starts on a round number
  (10, 20, ... 100). Every depth in this section is one as players see it;
  the code, and the dev tools further down (the lab, the backdrop tool),
  count one higher (`shownDepth` in `src/lib/delve.ts`).
- Everyone has **three lives**. A wrong answer or running out of time costs
  one (a miss on an Azurite Vein two, and one on a Dynamite Cache blows up
  something you carry too, see Finds).
- **Alone** is a run of your own, online (a room with one player) or in
  hot-seat. Hot-seat Delve is only ever alone.
- **Together** (a room of two or more) is co-op: one team, one question at
  a time.
  - The team votes for a card. Each vote is a ticket in a raffle (two
    votes for a card, twice its chance), and a vote can be changed until
    the vote closes: once everyone it waits for has voted, or 6 s after the
    first vote. Until that first vote the cards wait for as long as it
    takes; nobody is ever picked for. A player who lets 3 votes in a row
    pass is idle and isn't waited for until they vote again. A short draw
    then plays on the cards (a light hopping over the voted ones and
    landing on the card drawn), and only after it does the clock start.
    The category lockout counts the team's picks.
  - Everyone standing answers the same question at once, one pick each. A
    wrong pick costs that player a life (two on an Azurite Vein; on a
    Dynamite Cache, also something from their own pack) and
    strikes the option for everyone, so two players can't pick the same
    option. The first right answer clears the depth and takes the find, if
    the card was one. A time-out costs everyone standing who hasn't
    answered.
  - Flares and dynamite go off from the pack of a random holder still
    standing, and help everyone. Anyone standing who hasn't answered may
    press Detonate (a teammate's wrong answer locks nobody else out:
    it stays paid, and everyone standing, its player too, answers the new
    question). Its card is the one with the most votes that wasn't chosen,
    ties drawn by the host, then the others, drawn. The first right answer
    still ends the question for everyone: a blast after it, or an answer to
    a question blasted away, is dropped, whichever reached the host second.
    Dynamite going off at 0 hits nobody: the whole team gets the new
    question.
  - Between questions, a player with 2 or more lives can give one to a
    teammate who perished, who comes back with that life and nothing else.
  - Perishing drops everything you carry, for good.
  - The run ends when nobody is left standing, and its depth (where the
    last of the team perished) is the team's.
- Every depth is a little harder than the one before, and nothing ever
  gets easier. The player isn't told what changes where; they feel it. A
  few things come in steps: four options for the first ten depths, six from
  10, eight from 30; one made-up name from 4, two from 16, three from 44;
  the timer and the lockout (below). No two steps share a depth. The rest
  rises a little at every depth, never in a jump (no depth moves one by more
  than 3% of its whole rise), and is at its hardest by depth 89
  (`DELVE_CURVES` in `src/lib/delve.ts`):
  - look-alike names, from depth 1 to all of them at 79, eased out (most of
    the rise comes early, where little else changes);
  - "find the art" questions, none at depth 0, a percent more with every
    depth to 60% at 59 (easy while the art is plain, hard once it burns in,
    mirrored, gray and among look-alikes);
  - mirrored pictures, from depth 14 to every picture at 84;
  - the unveil, from depth 24: its share of the clock from 30% to 80% and its
    patches from about a 4 × 4 grid's to a 9 × 9 grid's by 89;
  - grayscale, a chance rolled for each question (all its art without
    colour, or none) from depth 40 to every question at 89, so the first art
    to burn in is in colour.

  Look-alike names are a share of the wrong options: a share between two
  counts rolls for the one more, so they too rise question by question.

  | Depth | Options | Look-alike names | Made up | Find the art | Mirrored | Unveil (share, about a grid of) | Grayscale | Look-alike pictures |
  |---|---|---|---|---|---|---|---|---|
  | 0 | 4 | none | 0 | none | never | off | never | none |
  | 10 | 6 | 24% | 1 | 10% | never | off | never | none |
  | 20 | 6 | 44% | 2 | 20% | 10% | off | never | none |
  | 24 | 6 | 52% | 2 | 24% | 15% | 31%, 4 × 4 | never | none |
  | 40 | 8 | 76% | 2 | 41% | 38% | 43%, 5 × 5 | 2% | none |
  | 50 | 8 | 87% | 3 | 51% | 52% | 50%, 6 × 6 | 22% | 3% |
  | 60 | 8 | 94% | 3 | 60% | 66% | 58%, 7 × 7 | 42% | 17% |
  | 70 | 8 | 99% | 3 | 60% | 80% | 66%, 8 × 8 | 62% | 31% |
  | 80 | 8 | all | 3 | 60% | 94% | 73%, 8 × 8 | 82% | 45% |
  | 90 | 8 | all | 3 | 60% | always | 80%, 9 × 9 | always | 59% |
  | 100 | 8 | all | 3 | 60% | always | 80%, 9 × 9 | always | 73% |

  The timer starts at 16 s and loses a second at depths 12, 18, 26, 33, 38,
  43, 47, 52 and 57 (7 s), then at 77 (6 s) and 95, where it stops at 5 s.
  The unveil takes its share of the clock, but never so much that half the
  art comes in with less than 3 s left: on the 6 s and 5 s clocks the art
  burns in faster instead (`veilSeconds` in `src/lib/delve.ts`). The
  lockout is 2 turns from depth 0, then 3 from 8, 4 from 22, 5 from 36, 6
  from 65 and 7 from 90.

  The unveil starts with the question's clock. From depth 24 it also takes
  "find the art" pictures: 1% of those questions at depth 24, one percent
  more every depth, all of them from depth 123. Each picture is cut much
  coarser than a whole item (at most 4 × 4), so eight of them stay a few
  dozen patches to send.
- **Look-alike pictures.** From depth 49 a growing share of questions picks
  its look-alikes by their art instead of their names (1.4% at 49, as much
  more every depth, every question from 119): the wrong pictures of "find
  the art" look like the answer's, and the wrong names of "name the item"
  belong to items drawn like it. The answer still sits anywhere in the
  cluster, so the picture that fits the others best doesn't give it away.
  Only the host (or the device, in hot-seat) fetches the look-alike table
  (`src/data/looks.json`, its own chunk of about 27 KiB gzipped), once a run
  reaches depth 19 (finds ask from up to 20 depths deeper); until it
  arrives, look-alikes go by name.
- **Endless.** From depth 100 the rules hold, but a growing share of name
  questions gets a fourth made-up name (2% at 100, 2% more every depth, all
  of them from 149), "find the art" pictures keep burning in more often
  until depth 123, and look-alike pictures take over until 119.
- **Finds.** From depth 10 one of the cards on offer is now and then a find:
  pick it and answer right for an item. Its question is a bit harder (that
  of 15 to 20 depths deeper, with its shorter clock), and each find has a
  risk of its own, so taking one is a choice to weigh: the Dynamite Cache
  blows up something you carry, the Flare Cache gives less time, the Vein
  caves in. The card shows only the find's name, and the note under the
  cards says what the item does and what the find risks. The finds turn
  up one at a time, the strongest last: the Dynamite Cache from depth 10,
  the Flare Cache from 30 and the Azurite Vein from 40. Each find's chance
  rises evenly over the 20 depths after its first and then holds (the
  Dynamite Cache from 8% to 9% by depth 30, the Flare Cache from 4% to 13%
  by 50, the Vein from 4% to 11% by 60). From 10 to 29 the Dynamite Cache
  is the only find, so it starts higher than the others to keep finds
  turning up early. From 60 about one offer in three holds a find. From
  100 they grow scarcer a little with every depth, down to half their chance at 199 (the Vein to a third, as a ward
  takes a whole loss), and hold there: about one offer in seven.
  - An offer that holds a find rolls once more for a second, of another
    kind and on another card, at half its chance; never a third. Two side
    by side are rare early on: never above depth 30, where the Flare Cache
    joins the dynamite, then about 1 offer in 280 at 30 and 1 in 70 at 40,
    and about 1 offer in 28 from depth 60.
  - A find is never offered for an item nobody could carry more of: alone,
    you; together, anyone standing.
  - A right answer sends sparks in the find's colour from the answer to
    the item's slot (its ward's chamber, or the flare's or dynamite's place
    beside the phial).
  - A **Dynamite Cache** (from depth 10) gives **dynamite**. While a
    question is open, a **Detonate** button (dynamite's glyph, in its tan)
    stands where Next will after the answer (its place kept, so nothing moves as it comes and
    goes): pressed, a stick blasts the question away for a new one at the
    same depth, from a card on the depth's offer not asked yet. The depth
    doesn't change (no depth reached, no zone gate); the new question gets
    the depth's full clock and rules (veil, pictures, grayscale, options,
    made-up names) as a fresh question, a flare works on it as usual, and
    it is never a find, even from a find's card (dynamite is no way to fish
    for finds). Its card is locked out like a pick. At most two blasts a
    depth (`DELVE_MAX_BLASTS`, the offer's other cards). As the clock hits
    0, a flare burns first; only with none to burn does a stick go off by
    itself (while the depth has a blast left), right at 0, in place of the
    time-out, which then costs nothing. Its fuse warns of it: over the
    clock's last `DELVE_FUSE_MS` (1.8 s) before that 0 it hisses, and a bar
    burns down on Detonate as Next's does, reaching its end at 0 (every
    screen times it from the deadline on the host's clock, so nothing is
    lit in the state). The question is still open meanwhile: a right
    answer clears it and the stick is kept, a wrong one costs its life as
    usual, and Detonate sets it off at once. With a flare to burn at that 0
    there is no fuse before it; should the dynamite go off at the 0 the
    flare moves the clock to, the fuse burns before that one. Instead of the plunge, the stage
    swings sideways, toward where the new card lay on the offer from the
    blasted one (a card to its left swings left): the explosion bursts in
    from that side of the screen (a flash, a fireball and smoke billowing
    in, sparks and rock flying across, a shockwave), the shockwave breaks
    the old question into shards and flings them to the far side as the
    screen shakes and the scene behind swings, and the new question comes
    in from the side the blast came from, through the clearing smoke (a
    cross-fade with reduced motion or the effects off). The question blasted away
    counts as seen in the Codex, never missed, and the run's record keeps
    how many questions it blasted away (shown on the Codex's last run and
    in its finds panel).
    The cache itself is unstable: a miss on it (a wrong answer or a
    time-out) costs a life as usual, and then its blast destroys one thing
    you carry, drawn at random by the host, whose state tells every screen
    what went (each ward, flare and stick one chance, a shard half of one,
    as it is half a ward; a ward drawn goes whole). A ward that takes the
    life goes first, and the blast draws from what is left. Carrying
    nothing, or perishing on the miss (which drops the whole pack anyway),
    it takes nothing more. Together,
    each player who misses loses one thing from their own pack, as their
    pick strikes (or at the time-out). The lost item bursts on the phial or
    beside it with a small blast of its own, a moment after the life, and
    the reveal says what went ("The blast destroyed your flare.").
  - A **Flare Cache** (from depth 30) gives a **flare**: time later for time
    now, as its own question has 3 s less on the clock than its deeper
    depth's (never under 3 s; on a clock that short no art burns in, as half
    of it could never be in with 3 s left). When your clock hits 0 a flare
    burns by itself, with a signal flare's hiss, and gives you 5 s more
    (once a question). An answer at any time before that keeps it; a guest's
    answer still on its way when it burns gives it back.
  - An **Azurite Vein** (from depth 40): a right answer within the first half
    of its clock mines an **Azurite Ward**, which takes your next lost life
    instead; a slower one a shard (two make a ward; with three wards you
    hold no shard). A wrong answer or a time-out on a vein caves in, with
    a sound of its own: it costs two lives, a ward taking each loss first
    if you hold one (on your last life you simply fall).
  - Flares and dynamite never work on a find's own question: finds lie
    down dangerous routes, with thicker walls and a darkness nothing can
    hold back, so there is no Detonate button and nothing happens at 0. You carry up to three of each item.
- **Alone**, you delve until your third life is gone; the depth where it went
  is your result. **Together**, the run goes on while anyone stands, and
  the depth where the last of the team perished is the team's result.
- Each run starts with the whole item pool, and alone or together it asks
  one question a depth.
- The clock starts once the art has reached everyone answering (alone the
  player, together everyone standing; the host waits at most 3 s for it)
  and, together, once the draw has played out. Nobody sees the options
  before that.
- There's no time limit on picking a card: alone the cards wait for you,
  together the vote decides. Nobody can skip a turn by hand. After the host
  reloads, players who were cut off get a minute to come back (a vote waits
  for them meanwhile), and a question one of them may have been answering
  is set aside: the same cards come back, and it costs nobody anything.
- A run starts from the lobby: alone in hot-seat or a room with one player,
  together in a room of two or more. Choosing Delve there shows its
  milestones, its rules in a few short lines (a run together's too, in a
  room online) and your deepest.
- Your lives are an engraved phial of three chambers beside your name, each
  a soft light beating like a heart (faster and weaker on the last life,
  whose light sinks to a deeper red), each moving its own way: a tide
  swaying to and fro, a swirl of two wisps, and two glows kindling in turn.
  A lost life flares and pours out of the phial's end; a survived question
  sends a wave of light through it; a life given to a teammate streams
  across into their phial.
  - Azurite Wards are crystal casings on the chambers, one each from the
    base (a shard is half a casing), shimmering at rest: a ward
    crystallises on as it is mined, and bursts in blue sparks where it is
    when it takes a loss.
  - Flares and dynamite stand as small counts beside the phial.
  - The reveal says what happened in a few words: "You mined an Azurite
    Ward.", "Too slow for a ward, but you mined a shard.", "Your ward
    took the hit.", "The vein caves in. You lose two lives." or, on a time-out,
    "The darkness took you." Together it says who cleared it ("Ash cleared
    it.") and what it cost whom ("The darkness took Brea and Cara."),
    leaving a single lost life to the phial.
- Every ten depths the descent enters a new zone, named after a Delve biome
  and a place of its own: lamps guttering in the Mines (0 to 9), glowing
  cracks and heat shimmer in Magma Fissure (10; over its last depths the
  magma cools, its glow dimming to a dull dark red and its flow slowing to
  a stop as Frozen Hollow arrives), rime feathering in from the walls, a
  cold mist low over the floor and pale light from above in Frozen Hollow
  (20), faint bioluminescence breathing in the damp, mycelial threads and a
  spore haze in Fungal Caverns (30), dusty gold shafts in
  Vaal Outpost (40), coiling violet eddies in Abyssal Depths (50), stone
  trunks in drifting mist in Petrified Forest (60), billowing vapour in
  Sulphur Vents (70), far cold lights in Abyssal City (80) and white-hot
  fire in Primeval Ruins (90). Each has its own light, smoke (four
  neighbouring hues that mix as they drift, as on the start page), embers
  (their colour and how many, all moving one way of the zone's own: dust
  drifting down and a rare lamp spark in the Mines, embers rising fast on
  the heat, snow drifting down, spores hanging in slow curls, motes settling,
  motes spiralling into the eddies, stone dust falling, puffs rising in
  gusts, cold motes drifting, strong sparks flying up) and glints. Depth 0 is
  already the Mines; the surface is the start page. From 100 the descent
  goes on for ever, each new zone one of twelve archetypes, moods with a
  vibe of their own (a drowned temple: pale shafts and fog in cold teal
  light; an ember forge: fire and lamps in slate smoke; a void bloom, a
  frozen abyss, a sulphur marsh, a lantern necropolis, a sunken garden, a
  blood eclipse, a glacial pyre, an ashen reliquary, a starfall abyss, a
  witchfire grove), each with one or two effects clearly there but quiet,
  a palette in a colour scheme (a base hue with its neighbours and a
  contrasting accent), and embers of its own; dealt out so none comes
  twice in a row and no two in a row share an effect (nor the first with
  the Primeval Ruins), generated from a
  seed of its own, the same for everyone, and named from its archetype's
  names ("The Drowned Nave", "Ashen Reliquary"), none twice in the first
  fifty from 100, never the same twice in a row.
- Each zone hands over to the next gradually, over seven depths from its
  5th depth to the next zone's 2nd, on an eased curve: slow to begin,
  quickest toward the zone's end, slow to settle, never a straight ramp.
  The next zone's name is still announced at its first depth, nearly all
  of the way through the handover, which is done once that depth's
  question is answered: from its 2nd depth to its 5th the new zone shows
  alone.
  - Its embers take the next zone's colour one by one: one in twenty of
    them at its 6th depth, three in five at its 9th, nineteen in twenty at
    the next zone's 1st.
  - From its 6th depth the next zone's light, smoke and features creep in
    while its own recede (barely at its 7th, half way at its 9th, nine
    tenths at the next zone's 1st, all there at its 2nd), each feature
    coming and going its own way (the lamps kindle one by one, magma cracks
    open from hairlines and cool, frost grows in from the walls, fire rises
    from below).
- The deeper, the darker, never the other way. The dark is one smooth fade
  from the edges, corners darkest, and closes in a little with every depth.
  The scene's light is set so its average brightness only ever falls with
  depth through the zones, however bright a zone's fire or gold; past them
  it may lift a little as the endgame's places come in, never by more than
  8% a depth. It is estimated for each depth from what the backdrop draws,
  with a measured correction table.
- Each new depth sinks the scene a little further as its cards are dealt
  (not a run's first depth, after a reload, or the same depth dealt again):
  for 1.9 s the walls, smoke and dust drift up past you, quick to start and
  slow to settle, the embers streak up, and the dark draws in and lets go.
  It is skipped with reduced motion or effects off.
- As a question's clock runs out the dark draws the light in and dims the
  scene (never the panels or text), lifting at the reveal or when a flare
  burns. The ambience, a hearth fire, sinks with the depth, over a slow
  rumble. Each zone, and from depth 100 each kind of place, lays a bed of
  its own under it and keeps as much of the fire as suits it; the beds
  cross-fade as the scene turns, in step with its light. Leaving a
  run, or rejoining deep down, fades straight to the scene it's going to
  (the surface, say) instead of passing through every zone.
- A new zone is announced by a gate built over the depth banner, so "Depth
  N" stands in its doorway: engraved columns rise beside the heading, a
  lintel is lowered onto them with the zone's name lit along its face, and
  a keystone bearing the zone's sigil is set in its crown, all in the zone's
  colour, the zone's light showing faintly through the doorway. It is built
  in about a second, holds about four and leaves as you pass through it;
  it never covers the cards or the player strip, or takes a tap, and the
  head keeps room for it above the banner throughout a run, so nothing
  moves when it comes or goes. With reduced motion or effects off it only
  fades in and out. Alone, the same gate marks the first depth past your
  best ("Deeper than ever"). The header names the zone beside the depth,
  both in its colour (on a second line on phones).
- A run ends as a fall, not a victory. Alone, the end screen says "Perished"
  (or "Deeper than ever"), with your depth, where your lives went and your
  best. Together it says "The descent ends", with the team's depth and the
  zone it reached, the whole team in the rune circle, and each player's
  lives lost, given and brought back ("Lost 2 lives, gave 1 life,
  was brought back once"). The warmth dies out of the rune circle and ash
  settles, to a slowed toll and an ember crackling out.
- The share button copies (on a phone, shares) "I reached depth N in Delve.
  Can you beat me? poe2.quest/?delve"; together, any player of the run
  shares the team's depth: "We reached depth N in Delve together. Can you
  beat us? poe2.quest/?delve". Someone watching has no share button.
  Opening that link, someone who has played here before (a name is saved)
  goes straight into a run alone; anyone else finds Delve chosen in the
  lobby they open. A game being resumed is never replaced.
- Your deepest run alone and together are kept in this browser (lobby, end
  screen and Codex, with your last runs). A run resumed by a build with
  other rules still shows, but never counts as a best.
- On a phone, eight answers fit on the screen: names in two columns,
  pictures four to a row.

**Difficulty** (the host chooses):

| | Options | Wrong answers | Extras |
|---|---|---|---|
| Cruel | 4 | Same kind where the category has enough (all rings, all bows, all Strength gems…) | 40% of questions are "find the art": you get a name and pick one of the pictures |
| Merciless (default) | 6 | Same kind where the category has enough, half of them look-alike names, one made up | In race, the art burns into view bit by bit |
| Eternal | 8 | Same kind where the category has enough, all look-alike names, two of them made up | In race, the art burns into view more slowly; "find the art" pictures are shown in grayscale; each picture has a 30% chance of being mirrored left to right (the answer and any picked picture are marked *Mirrored* at the reveal) |

The presets only unveil the art in race mode, where answering from part of the
art can beat the others to it. On your own turn nobody is racing you, so the
unveil would just be a wait.

**Custom** opens an editor where the host sets each knob. The first time,
it starts as the preset that was picked (as it plays in the chosen mode);
after that it keeps its own settings. Everyone else sees the custom rules described under the difficulty, in
the same words the presets use.

| Knob | Steps | Past Eternal |
|---|---|---|
| Options | 4, 6, 8, 10 (the tenth is answered with 0, and its badge says 0) | 10 |
| Look-alike names | None, Half, All | |
| Made-up names | None, 1, 2, 3 (at most half the options: each copies a real name on screen) | 3 |
| Find the art (share of questions) | Never, Some (40%), Half, Always | |
| Unveil (the art burns into view, in both modes) | Off, Fast (patches the size of a 5×5 grid's cells), Slow (7×7), Slowest (9×9, 80% of the timer) | Slowest |
| Grayscale | Off, Find the art (its pictures), All art (the art to name too) | All art |
| Mirrored art | Never, Some (30%), Half, Always | Half, Always |
| Category lockout (turns) | None, 2, 3, 4, 5 | 5 |

In a deathmatch on Custom or Eternal, each knob that makes questions harder
goes one step up, into the steps past Eternal (an unveil that is off stays off). The host's browser remembers the last
custom setup.

Look-alike names form a cluster, and the answer's place in it is random: the
name that looks most (or least) like the others is no more likely to be right
than any other.

**Codex:** a page (from the start page's corner, or at
`poe2.quest/#codex`) listing every item you have seen, with your accuracy per
item, category, item group, question type and difficulty, your nemeses (lowest
accuracy, at least 2 answers), mix-ups (what you picked for what), made-up
names you fell for, streaks and answer times. Every question revealed on your
screen counts as seen; only your own answers count toward accuracy (your turn,
or your guess in a race; a turn that runs out of time is wrong). In hot-seat,
answers only count when one person plays alone. Undiscovered items show as
dark silhouettes, and the codex can't be opened while in a room. It is kept in this
browser's localStorage only (`src/lib/codex.ts`).

The Codex has two tabs: **Collection** (the above) and **Delve**, built
from the same parts. Alone and together are kept apart and never summed:
alone leads (together, before your first run alone). Delve shows your
deepest alone in the rune circle with the zone it reached, beside your
deepest together, your runs (alone and together), your usual depth (the
median, after 3 runs) and the lives you lost, with the wards that saved one
counted over the same runs; your last run in one row (where each life went
and what took it, and together what you gave and were given); after 3
runs, what kills you (kinds of item, by lives lost) and your deadliest
items, from all your answers; where you fall (lives lost in each zone that
5 runs reached); a Together panel (usual depth and lives lost together,
times you perished and were brought back, lives you gave); finds and wards
(veins and caches taken and what they gave, questions blasted away, lives
warded, flares burnt), one panel alone and one together; the zones reached, each dated,
with your deepest over time; and a run log (the latest ten rows, all on
request; runs under other rules listed apart). Zones you haven't reached
are never named, and "Begin the descent" starts a run alone. Only runs
under the current rules count, judged by the rules each run was played
under. A run alone is recorded as you fall. A run together is the team's:
recorded once it is over, at the team's depth, with your own part in it,
so perishing and being brought back records nothing. A run you leave before
its end is recorded at the depth it was on: listed, but never a best or a
depth a run ended at; if it goes on after a rejoin, its end replaces it,
and an end, once recorded, never changes. Records or a codex this build
can't read are never written over: a newer build's are left alone, damaged
ones kept aside. An item's page also shows its Delve answers. The runs are
kept in this browser too (`src/lib/delveRecord.ts`).

**Achievements:** the Codex's third tab. 36 of them, few and chosen: each
marks a moment worth telling or a goal worth chasing. Four groups of nine, laid
out in even rows. Each group opens with a very easy one, so a new player soon
finds out there are achievements at all, and has one to laugh at and one that
takes real mastery:
- **Knowledge:** 25 different items answered right, 25 and 100 right in a
  row on your own turns (races and runs together neither add nor break a
  streak), 5 and 20 in a row each within 2 seconds, every item of a category
  both named and found, every item in the game answered right, an item
  answered right after getting it wrong 3 times in a row (Sweet Revenge),
  and a secret one.
- **Versus** (online, against others, to 5 points or more, someone else
  still there at the end): a first win, a deathmatch won on the answers, a
  win after a rival led by 4, a win to 10 without a wrong answer, a race to
  10 taking every question against rivals who guessed, race questions taken
  before a quarter of their veiled art burned in, 5 wins in a row, a loss
  after leading the winner by 4 (Hubris), and a secret one.
- **Delve:** depths 10, 50 and 100 alone, depth 40 without losing a life, 10
  depths on the last life past depth 30, a ward shattering in place of the
  last life, three wards, three flares and three sticks of dynamite carried
  at once in a run alone, a Dynamite Cache's blast destroying your own
  dynamite (Chain Reaction), and a secret one.
- **Together** (Delve with others): the team's depth 10, two lives given in
  one run, a depth cleared after every teammate struck, the team's depth 30
  and 60 with nobody ever perishing, the last one standing going 10 depths
  clean, depth 75 standing, being brought back three times in one run (Dead
  Weight), and a secret one.

Each is an engraved seal struck in a metal by how hard it is, the alchemist's
way from lead (the very easy ones) through copper and silver to gold, and
bearing an alchemical sign: the tiers of one idea share a sign, and no other
two do. Now and then light passes over an earned seal in its metal's way: a
slow faint gleam on lead, a quick white flash on silver, a warm sweep on gold
that leaves a spark on its rim. The top of the page counts them by metal.
Where the codex or the Delve records keep what it needs, the page shows how
far along you are, and games played before achievements existed count (that
first time quietly: the start page gives one notice). Moments are earned as
they happen, from the state every player's screen has: a depth reached, a ward
on the last life, a team falling together. A game against others is followed
as it goes (the biggest lead a rival had over you and you over them, rivals
who guessed, veiled questions taken) and judged once at its end, also when
that end first comes in after a reload; the host stamps each game with its
start (`startedAt`), so its own answers can be told apart in the codex; wins
in a row are kept beside the list. A new achievement is announced with a
notice bearing its seal, a moment after it is earned. Once earned it stays
earned. Kept in this browser (`src/lib/achievements.ts`); erasing the codex
erases them.

## Multiplayer

- **Online (peer-to-peer):** the host creates a room and shares the 6-character
  code or invite link. Browsers connect directly over WebRTC
  ([PeerJS](https://peerjs.com/)). The host's browser runs the game and
  everyone else sees the same state live. Only the free PeerJS cloud is used,
  to introduce the players to each other.
  - Players who refresh or drop out rejoin automatically. Outside Delve, the
    host can skip the turn of a player who is disconnected. Opening the same room in a
    second tab moves your seat there, and the first tab lets it go.
  - If the host refreshes, the room reopens with the same code and players
    reconnect.
  - Anyone who joins a game that has already started watches as a
    **spectator** (up to 8) and gets a seat when the host starts the next
    game. This works with the code for any room that isn't locked; public
    rooms that are in a game also show a **Watch** button under Open rooms.
  - The room code stays in the header during the game, unless the host
    hid it for streaming.
  - After a game, the host can **Play again** (same settings, starts right
    away, spectators included) or **Change settings** (back to the lobby).
  - Very strict networks (some corporate or mobile networks) can block
    WebRTC. In that case, use hot-seat.
- **Open rooms:** a host can set their room to **Public**, which lists it
  under "Open rooms" on the start page (rooms are private by default).
  Without a server there's no central list, so a public room claims the
  lowest free numbered listing ID on the matchmaking service
  (`…-pub-1`, `…-pub-2`, …), and the start page checks those numbers in
  batches of 10, stopping after a batch with no rooms. Batches past number
  30 are spaced out to avoid throttling, and rooms above number 10
  periodically move down into freed-up numbers so gaps can't hide them.
  See `src/lib/rooms.ts`.
- **Hot-seat:** everyone plays on one device and passes it around.

The host picks the mode (take turns, race or Delve: three buttons, each
with an engraved emblem, and only the chosen mode's description below
them), then, outside Delve, the difficulty, the target score and an
optional time limit per question (off / 8 / 16 / 32 / 64 s).

## Fair play & safety

There's no server, so **the host's browser runs the game and has the
answers**. The host could always cheat in their own room: play public games
with that in mind. Guests, on the other hand, are treated as untrusted:

- **No answers on the guest's device.** Guests receive a redacted copy of
  the game state. Before the reveal it has no answer, no item ids behind the
  options, and no list of used items. Options are referred to by position
  only.
- **No image files to look up.** Guests never load an item's image file
  during a question. The host sends a lightly altered copy of the art
  (re-scaled, shifted, noised, re-encoded) straight over the connection. On
  veiled difficulties it sends only the patches revealed so far, so the rest
  of the picture isn't on the guest's machine at all.
- **Seats can't be taken over.** Each browser has a secret token that only
  its host ever sees; the IDs other players see are random public IDs.
  Rejoining needs the token and keeps your original name. The token is
  different for every room (derived from the browser's secret and the room
  code), so a host never learns a token that works in someone else's room.
- **Everything guests send is checked.** Every message is validated against
  the few actions a guest may take: pick a category, answer, continue, and
  in Delve together vote for a card or give a teammate a life. Guests
  are rate-limited to about 10 messages per second, and the raw data they
  send is capped in size and volume, and checked for lengths that can't be
  real, before it is decoded (so it can't be used to fill the host's memory
  or freeze its tab). A connection that doesn't introduce itself
  within a few seconds, or goes over those limits, is disconnected. One that
  sends anything a real client never sends (a malformed message, or one big
  enough to need splitting) is disconnected and refused for the rest of the
  session.
- **Connection and join limits.** The number of connections a room accepts is
  capped. Connections that haven't introduced themselves yet have a few
  slots of their own, so they never crowd out players and spectators. Each
  is dropped after a few seconds, one peer can't hold more than two, and
  when the slots are full the oldest one makes way (but only after it has
  had a few seconds to say hello). New people can join a full lobby's worth
  at once, then one every few seconds (an occasional attempt that's turned
  down, e.g. for a taken name, doesn't count; a stream of them does);
  anyone held back tries again by themselves a few seconds later. No one can leave and rejoin in a
  loop, since every join is announced to the whole room.
- **Bots.** Answers that arrive faster than a human could react (less than
  about 200 ms after the art reached that player) are ignored.
- **Race fairness.** The host's own answers are delayed by a typical guest's
  one-way network latency, measured with pings. Pings carry random numbers,
  so a guest can't answer them early to look closer than it is.
- **Delve fairness.** The art goes first to every player standing who
  answers (alone the player, together the whole team), before anyone
  watching, and the clock starts once the host's queue to each of them is
  empty (plus half the slowest round trip), waiting at most 3 s. Together,
  the clock also waits for the draw on the cards to play out (about 2 s),
  so it costs no answer time. A guest on a link slow enough to need more
  than 3 s for the pictures loses the rest, and the host's own art is
  instant. Together, where the first right answer clears the depth and
  takes the find, the host's own answers are delayed as in a race. Nobody
  can skip a turn in Delve, the host included.
- **Host tools.** The host can:
  - lock the room so no one new can join or watch (people already in the
    room can still get back in, e.g. after a refresh)
  - ask another question in the same category if a question's art couldn't
    be loaded (in Delve, only before its clock starts; art that won't load
    is asked again by itself up to 4 times, then the question waits, with
    nothing lost, until the host asks another or the browser is back
    online)
  - kick anyone, in the lobby or mid-game; the kicked player's token and
    connection are then blocked for the rest of the session. Kicking someone
    who is still in the room also bars their name (and look-alikes of it)
    for anyone new; removing an offline player doesn't
  - skip the turn of a player who is still connected but hasn't picked a
    category (or, without a timer, answered) for 30 seconds (not in Delve,
    which has no turns to skip: alone the cards wait for the player,
    together the vote decides, and a question runs out by its clock)
  - hide the room code on screen for streaming
- **Names.** Invisible and direction-flipping characters and "zalgo" text
  are removed. Names that pose as the host or look like another player's
  (e.g. using Cyrillic letters or `0` for `o`) are rejected.
- **Public room list.** Entries come from strangers, so each one is
  validated. The list and the scan are capped, and a room answers only a
  limited number of listing probes at a time.
- **Content Security Policy.** The page may only run its own scripts and
  connect to itself and the matchmaking server.
- **Room codes** are 6 characters (about a billion combinations).

**Privacy:** players connect directly (WebRTC), so everyone in a room can
see each other's IP address. The game says so in the lobby and in the room
list.

Not defended against: a determined player recognising item art with
their own tools, and a cheating host.

## Legal pages

`impressum.html` (legal notice, § 5 DDG) and `datenschutz.html` (privacy
policy, GDPR) are plain static pages, built as extra Vite entry points and
linked from every screen. Update them whenever the site starts using a new
third-party service.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # game-engine tests
npm run check      # svelte/type checks
npm run build      # production build in dist/
```

Stack: Svelte 5, TypeScript, Vite, PeerJS. Sound effects are layered CC0
recordings from [Freesound](https://freesound.org) plus a quiet ambience loop
(about 1.1 MB in `public/sfx`, see `CREDITS.txt` there), filtered and mixed in
WebAudio with a generated reverb. Delve's beds (about 360 KB each) are only
fetched as a run nears them: the next place's while the page is idle, from
the first depth of the zone before it. `src/lib/soundDesign.ts` sets the
layers and the beds, as tuned on the ambience mix board.

### Visual effects

Everything is drawn in WebGL2 with float precision and dithered once at the
8-bit output, so no glow or gradient bands.

- **Backdrop** (`src/lib/backdrop.ts`, behind the UI): breathing gradients,
  drifting smoke, rising embers, light from game events (`src/lib/lights.ts`),
  a mood tint (crimson during a deathmatch, gold on victory), and on the
  start page slowly swaying god rays and a royal glow behind the title. It also draws the soft shadows of UI elements
  and the large gradient fills of panels, answers and the art stage, which
  CSS would band (`src/lib/backdropShadow.ts`). Fills go back to CSS while the
  page scrolls or an element moves, so they never lag behind their borders.
- **Effects layer** (`src/lib/fx/`, over the UI, added as light with
  `plus-lighter`): an HDR particle system (sparks, embers, shards, glints),
  procedural shapes (shockwaves, flares, god rays, fire outlines, a portal,
  rune sigils) and bloom. `effects.ts` has the building blocks, `moments.ts`
  the game's big beats (a pick, a reveal with its point flowing into the
  scorer's progress bar, a deathmatch, a victory), and `ui.ts` the feedback
  every control gets. Soft shapes render at about one texel per CSS pixel and
  the whole layer at most 1.5 per CSS pixel; the canvas hides itself while
  nothing is alive.
- **The creator** (zoe_arcana, a name only an unlocked device can take; a
  deterrent, not proof) is marked out. Gold motes circle her avatar on a
  tilted orbit, passing behind it on the far side, in a ruby glow with
  embers rising off it (`src/lib/fx/aura.ts`; one `Orbit` shape draws an
  avatar's orbit), and in the lobby she arrives out of gathering motes
  rather than a portal. The aura shows on all her avatars at once with a
  short breath between showings, when the effects loop can sleep; a gilded
  ring (CSS) marks her then and with effects off. Her name is struck in gold
  foil, and a glint of light crosses it every nine seconds
  (`src/lib/glint.ts`: one timer, transforms only, nothing under
  *prefers-reduced-motion*). Online, everyone else gets a notice when she
  walks into the room (`src/lib/herald.ts`).
- **Delve's descent** (`src/lib/descent.ts`): each zone is a look (the
  hall's dark, the light from below, smoke in four hues, mist, embers,
  glints) and the environments the backdrop draws for it (`ENVIRONMENTS`:
  lamps, magma, frost, spores, shafts, void, mist, plumes, city, heat).
  The ten zones' looks, each with its embers' motion (a profile of
  `src/lib/emberProfiles.ts`, tweaked), live in `src/data/backdrops.json`
  (read by `src/lib/backdrops.ts`; the shapes and the check are in
  `src/lib/backdropData.ts`), which the backdrop tool edits. Past the ten
  zones (from depth 100 as players count it) every stratum is generated
  (`src/lib/backdropGen.ts`, `generateStratum`, pure and seeded): stratum k
  is an archetype of `src/lib/archetypes.ts`
  (its effects, palette schemes, embers, character and names), dealt out a
  round at a time by the endgame seed (`archetypeAt` in
  `src/lib/backdrops.ts`: every archetype once a round, none twice in a
  row, no two in a row sharing an effect, nor the first with the last
  zone, each round worked out from its own seed and the one before's),
  made from its own seed (the file's
  endgame seed mixed with k, or one pinned by hand) with the file's endgame
  settings, re-rolled where it comes out too like a zone or its neighbour
  (`src/lib/likeness.ts`), made once and cached. Its name is its
  archetype's next (`endgameName`): the curated ones first, then epithets
  and places composed; its sigil and ornament its archetype's zone's
  (`emblemOf`).
  From a zone's 5th depth to the next one's 2nd, seven depths, the scene
  turns into the next (`strataAt`, `turnInto`; `TURN_FROM`,
  `TURN_DEPTHS`): the embers follow the turn eased (`emberTurn`), the
  light, smoke, features and their colours follow it eased from the
  zone's 6th depth (`hallTurn`, `HALL_FROM`), both on a smoothstep
  (`easeTurn`), and a magma that goes out cools with the hall
  (`magmaCooling`), gone by the next zone's 2nd (through a cross-fade it
  keeps each scene's own cooling, `Descent.cool`, so it never flares up
  again as it fades). A zone shows alone from
  its 2nd depth (`settledAt`) to its 5th, where its own turn begins.
  The scene's `light` is set so its average brightness never rises with
  depth through the zones and, past them, by 8% a depth at most
  (`luminanceAt`, `lightAt`, `brighterAt`): `estimateLuminance` works out
  what the backdrop draws from what each environment adds and dims as it
  comes in (`ENV_ADD`, `ENV_HALL`), corrected per depth (`MEASURED`, to
  depth 92), and the light is solved a stretch of depths at a time, moving
  at most 0.09 a depth (`light`, or the light drawn, `light` times the
  stratum's own `lightK`, so a stratum lit brighter is made way for), to
  depth 2001 (past it the curve is kept to exactly). It is worked out in
  idle moments ahead of the scene (`warmLights`); a rejoin deep down shows
  the scene as it was for the few frames it takes the rest, a few
  milliseconds a frame, then fades in (`waiting`). A
  generated look's own light (`lightK`) is worked out from the estimate
  (`calibrateLight`), so it settles at a light of about 1 like the zones.
  The tables are measured from the backdrop's own frames with
  `scripts/measure-luminance.mjs`; measure again after changing what it
  draws. The measured corrections only hold for the zone looks they were
  measured with (`measured` in the file): a zone given a new look has its
  depths' corrections dropped (faded out over its turns) rather than
  applied wrongly. (They were measured with the straight handover and
  carried over to the eased one by the share of the next zone's hall each
  depth shows; calibrate measures them afresh.)
  The shown depth eases along at about a second a depth, and a jump of
  more than three depths cross-fades straight there. `plunge()` (called by
  `App.svelte` when a deeper depth's cards are dealt, `dealtDeeper`) sinks
  the scene, and the backdrop steps it (`stepPlunge`). The backdrop's shaders and embers (`src/lib/backdropEmbers.ts`, a
  small palette of zone colours, so a new colour spreads ember by ember,
  each taking its zone's way of moving from `src/lib/emberMotion.ts` with it),
  the CSS fallback and the ambience (`depthAmbience` in `src/lib/sound.ts`)
  follow it. The clock's dark (`src/lib/darkness.ts`) is set by the timer
  ring and drawn by the backdrop, with a thin late shade at the screen's
  edges (`Darkness.svelte`). The zone gate (`src/components/zonebanner/`,
  with the zones' sigils in `src/lib/zoneSigils.ts`) and the find cards
  (`findEngraving.ts`) are engraved in the arcane style, and a run's end
  has its own effect (`src/lib/fx/delveEnd.ts`).
- **Dialogs** dim the page behind them (`src/lib/behindDialog.ts`). A dark,
  blurred layer over the page would band the backdrop and hide the dialog's
  own effects, so the backdrop darkens itself in its shader and the UI takes a
  CSS filter. The effects layer stays above dialogs: the page's light hides
  behind the dialog and dims outside it, while the dialog's own light shows.
- Effects can be switched off with the ✦ button in the header, and are off
  under *prefers-reduced-motion*. Switched off, they also still the
  backdrop where it stands (no breathing, drifting or rising embers), which
  is then only redrawn when something changes: a low-power mode for phones
  that run hot. Quality drops by itself (resolution) on
  devices that can't keep up. Without WebGL2 the site falls back
  to its CSS look.

### Refreshing item data

Item names and art are scraped from poe2db.tw
([uniques](https://poe2db.tw/us/Unique_item),
[lineage supports](https://poe2db.tw/us/Lineage_Supports)) and committed to
the repo (`src/data/items.json` and `public/items/`), so the game doesn't
depend on poe2db being up.

```sh
npm run fetch-data
```

Each item's group and category come from its art folder; see
`CATEGORY_RULES` in `scripts/fetch-data.mjs`. Image files are named with a hash, so the URL
doesn't reveal the answer.

After the art changes, rebuild the look-alike table (needs ffmpeg):

```sh
npm run looks
```

It writes `src/data/looks.json`: for every item, the twelve items of its
group whose art looks most like it, each with a score from 0 to 1 (silhouette,
edges and colour, mirror-blind; see `scripts/looks.mjs`). From depth 49 in Delve,
decoys are picked from it (`src/lib/looks.ts`). The output only changes when
the art does; items added without rerunning it just have no look-alikes.

### Self-hosted signalling (optional)

To use your own [PeerJS server](https://github.com/peers/peerjs-server)
instead of the public cloud, build with `VITE_PEER_HOST`, `VITE_PEER_PORT`,
`VITE_PEER_PATH` and `VITE_PEER_SECURE`.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
The site is served on the custom domain **poe2.quest** (`public/CNAME`), and
invite links point there (`src/lib/site.ts`).
Turn it on once under **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

### Beta

A second build is served at **poe2.quest/beta/**, for trying a change before
it goes live. Pages serves one upload per site, so every deploy has both:
`main` in `dist/` and the beta in `dist/beta/`.

- **Put a branch on the beta:** Actions → *Deploy to GitHub Pages* → Run
  workflow (on `main`), with the branch, tag or commit SHA as *beta*. Its
  tests run, the commit is recorded as a deployment to the `beta`
  environment (on the repo's front page, under Deployments), and both sites
  deploy. Later deploys of `main` keep showing it, from a build cached by
  commit.
- **Ship it:** merge the branch into `main` as usual. The beta stays as it
  is until the next one goes up.
- **Stack changes:** the beta shows one commit at a time. To test a change
  together with the one already on the beta, start its branch from that
  commit instead of `main`: the newest `beta` deployment, also shown as
  *Beta commit* in the summary of the newest successful run named
  *Beta: (branch)*. (The branch itself may have moved on since.)
- **A run that only waited** is cancelled when another run queues behind it
  (GitHub keeps one waiting run per group); run it again.

The beta's own code (install scripts, tests, build) runs in a job of its own
with a read-only token, apart from the live site's build. If the beta can't be
found or built (say a dependency it pins disappears), deploys of `main` go
ahead without `/beta/` and say so in a warning; putting a branch on the beta
brings it back. A commit from before the beta existed can't go on
it, since it would share the live game's rooms and saves; merge `main` into
it first.

The beta is built with `VITE_CHANNEL=beta` (`src/lib/channel.ts`), which keeps
it apart from the live game:

- its rooms and open-room listings use their own PeerJS prefix, so live and
  beta players never meet
- its invite links and link previews point to `/beta/`
- it keeps its own codex, settings and saves: all storage goes through
  `src/lib/storage.ts`, which starts the beta's keys differently (a test keeps
  other modules off storage); only the creator unlock is shared
- it says Beta on the start page, in the header and in the tab title, and
  asks search engines not to index it

### The lab

`lab.html` (`src/lab/`) is a page for trying Delve's moments by hand: the
real game screen (the app itself, with its backdrop, effects, sounds and
header) beside a panel that sets up and plays a run on this device. It sets
the players (1 to 4), each one's lives, wards, shard, flares and dynamite,
and the depth (any of 1 to 150, or a zone); deals cards with a find among
them, and a second find if wanted; asks questions (name the item or find
the art, a find's, mirrored, unveiled, in grayscale); plays events (a right
or wrong answer, a time-out, a ward breaking, a cave-in, a flare at 0,
a blast (Detonate), dynamite at 0 (its fuse), items gained, a find answered right, the last
life, deeper than ever, a new zone, the plunge); pauses and moves the
clock; shows the end screens (perished, deeper than ever, together); and
switches effects, sound and reduced motion. Events go through the engine
and the session as a game's would; setup changes start the run afresh
under a new id, so they play nothing themselves.

With two players or more the run is co-op:

- **Screen** picks whose screen the app is (its own taps vote and answer
  for them), and **Acts** whom the events act for.
- Co-op events: **Vote** for each of the three cards, **Others vote**,
  **Give a life** to a teammate who perished, **Perish**, **Others
  perish** and **Time out** for the team.

- **Open it:** `npm run dev`, then `http://localhost:5173/lab.html`; on the
  beta, **poe2.quest/beta/lab.html**. The live build leaves it out (its
  entry is only added with `VITE_CHANNEL=beta`, see `vite.config.ts`).
- **Its storage is its own:** the page is marked `<html data-lab>`, and
  `src/lib/storage.ts` then starts every key with `lab.` (after the beta's
  start on the beta), so its runs, codex, saves and settings never reach the
  game's.

### The backdrop tool

`backdrop.html` (`src/backdropTool/`) is a page for picking Delve's
backdrops by hand: the game's own backdrop full screen (its embers and
effects layer as in a run), beside a panel docked on the right (a drawer
on phones) that drives it. It only sets what the backdrop already draws:
the looks' colours and strengths, how much of each existing detail shows,
and how the embers move. Every change shows at once.

- **Depth:** a slider from 1 to 250 previews the real descent with the
  looks being picked (each depth eases in as in a run; a jump of more than
  three cross-fades), with chips for each zone and **Walk down** (a depth
  every 1.5 s) to judge the handovers and the embers' colour turning over.
- **Brightness:** the scene's average brightness by depth (1 to 200), as
  the game estimates it with its solved light (no frame is drawn or read),
  beside the curve it keeps to; any depth brighter than the rule allows
  (than the one before through the zones, by 8% past them) is marked.
- **Zones:** pick one of the ten (the panel jumps to its 2nd depth, where
  it shows alone), then tweak its look: a colour picker for every colour,
  sliders for every strength (Light and dark, Smoke, Haze, Embers, Glints,
  Details), and the embers' motion (a profile and its speed, rise or fall, drift, turbulence
  and swirl). **Use for this zone** puts it in the draft; **Revert** and
  **As shipped** go back.
- **Generate:** a new seed (or type one: a number or any word), a strip of
  six variations, and the generator's settings (hue range, saturation,
  darkness, detail, embers). **Lock** keeps a group as it is while the
  rest is generated again.
- **Endgame:** step through the strata past 100 (11, 12, ...), each shown
  with its name, its archetype, colour scheme and effects; try other seeds
  for one (variations of its archetype) and **Pin** the one you like; tune
  the endgame generator's settings and seed (they shape every unpinned
  stratum; the seed also deals the archetypes and their names).
- **Save:** on the dev server **Save to the file** writes
  `src/data/backdrops.json` (a dev-only endpoint in `vite.config.ts`,
  checked before it is written; never in a build). Anywhere, **Copy JSON**,
  **Download JSON** and **Import JSON**. The draft keeps on the device as
  you go.
- A zone's look stays exactly as shipped until a new one is saved for it
  (`tests/backdrops.test.ts` checks depths 0 to 91 against the looks as
  they were hard-coded). A changed zone is saved with `measured: false`,
  so its measured brightness corrections are dropped; measure again
  (`scripts/measure-luminance.mjs calibrate --skip-env`) to restore them,
  and update `tests/fixtures/shipped-backdrops.json` to the new looks.
- **Open it:** `npm run dev`, then `http://localhost:5173/backdrop.html`;
  on the beta, **poe2.quest/beta/backdrop.html**. Like the lab, the live
  build leaves it out, and its page is marked (`<html
  data-backdrop-tool>`), so `src/lib/storage.ts` starts its keys with
  `backdrops.` and its drafts and settings never reach the game's.

### The zone gate's tuning page

`zones.html` (`src/zonebanner/`) is a page for tuning Delve's zone gate
(`src/components/zonebanner/Threshold.svelte`) in place: the real game
screen (a Delve run of the lab's, in a frame) with the gate built over its
head, timed as in a game.

- **Zone:** any of the ten zones, two long endgame-style names (to check
  the fit of a long name) or "Deeper than ever". Each play sets the run's
  depth quietly first, so the header, the scene and the colours are the
  zone's; **Replay** (or R) builds the gate again.
- **Phone width** shows the screen at 375 px; **Hold** keeps the gate up;
  **Effects off** and **Reduced motion** show it as those players see it
  (it only fades in and out).
- **Open it:** `npm run dev`, then `http://localhost:5173/zones.html`; on
  the beta, **poe2.quest/beta/zones.html**. Like the lab, the live build
  leaves it out, and its page is marked (`<html data-lab data-zones>`), so
  `src/lib/storage.ts` starts its keys with `lab.zones.` and its run never
  moves the lab's.

### The descent's test page

`descent.html` (`src/descentPreview/`) shows Delve's rules block
(`src/components/DelveRules.svelte`: the descent drawn beside the finds,
with the leaders from the pit to the finds' headings) in a rules card at a
phone's (281 px), a tablet's (329 px) and a desktop's (450 px) width side
by side.

- **Deepest:** a slider from 0 to 300 and a box for any depth (0 is no run
  yet); the hint says the depth as players see it.
- **Finds met:** which of the three finds the player has met (only those
  get a leader, or their item beside the pit on a phone).
- **Replay entrance** draws the blocks in again; **Walk down** goes a depth
  deeper every 180 ms.
- **Open it:** `npm run dev`, then `http://localhost:5173/descent.html`; on
  the beta, **poe2.quest/beta/descent.html**. The live build leaves it out.

---

Fan project. Not affiliated with Grinding Gear Games. Item data and art from
poe2db.tw; Path of Exile is a trademark of Grinding Gear Games.
