# Gameplay

The full rules of PoE2.Quest, as the game plays them. The README has the short version.

## Turns

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

## Race

**Race mode** (online only): no turns. Everyone sees the same question at the
same time, in a random category (never one of the last 2, 3 or 4, by difficulty, or as many as Custom sets).
- The first correct answer scores +1 and ends the question.
- A wrong answer costs −1 and locks that player out until the next question.
  Everyone sees live who guessed what.
- The first player to reach the target score wins.
- Race questions always have a timer (16 s if the host picked "off").
- The host's own answers reach the game instantly, while guests' answers
  travel over the network, so the host has a small speed edge.

## Delve

**Delve** (alone, online or on one device; or together, online): no
settings. Everyone plays the exact same rules, so "I reached depth 30" means
the same thing for everyone.
- Pick one of three categories and name the item, as in turns mode. Each
  question cleared goes one depth deeper; after a miss (or a time-out) the
  next question is asked at the same depth, from a fresh offer of cards.
- The depth counts the questions cleared: a run sets out at depth 0, where
  the banner shows a short line instead ("Your light is borrowed", "Solve
  et coagula"; over fifty, dealt like a shuffled deck on each device so one
  only comes back once all the others were seen, and kept for the run
  through a reload, `src/lib/delveStart.ts`; the open rooms list says
  "entrance"), and each zone starts on a round number
  (10, 20, ... 100). Every depth in this section is one as players see it;
  the code, and the dev tools (`docs/dev-tools.md`: the lab, the backdrop tool),
  count one higher (`shownDepth` in `src/lib/delve.ts`).
- Everyone has **three lives**. A wrong answer or running out of time costs
  one (a miss on an Azurite Vein two, and one on a Dynamite Cache blows up
  something you carry too, see Finds).
- **Alone** is a run of your own, in a room with one player (players at
  the host's screen are set aside in Delve). Old hot-seat Delve is only
  ever alone.
- **Together** (a room of two or more) is co-op: one team, one question at
  a time.
  - The team votes for a card. Each vote is a ticket in a raffle (two
    votes for a card, twice its chance), and a vote can be changed until
    the vote closes: once everyone it waits for has voted, or 6 s after the
    first vote (going down into a new zone, never before its cards are
    dealt: votes all in by then close it as they are dealt, and its 6 s
    run from the deal). Until that first vote the cards wait for as long as it
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
  - The team keeps a streak of its own: depths cleared in a row with
    nobody missing (a wrong pick ends it even when a ward took the loss,
    and so does one on a question blasted away, or a time-out). The
    verdict at the reveal burns with it for everyone, from three in a row,
    in a Delve streak's colours, and when it ends its fire goes out on the
    verdict in a puff of smoke. Each player's own streak burns on their
    entry on the scoreboard. The end screen gives the team's longest.
  - Flares go off from the pack of a random holder still standing, and
    help everyone. Only a player standing who hasn't answered and holds a
    stick of dynamite may press Detonate, and it spends theirs (a
    teammate's wrong answer locks nobody else out: it stays paid, and
    everyone standing, its player too, answers the new question). Its card
    is the one with the most votes that wasn't chosen, ties drawn by the
    host, then the others, drawn. The first right answer still ends the
    question for everyone: a blast after it, or an answer to a question
    blasted away, is dropped, whichever reached the host second. Dynamite
    going off at 0 comes from the pack of a random holder still standing,
    and hits nobody: the whole team gets the new question.
  - Between questions, a player with 2 or more lives can give one to a
    teammate who perished, who comes back with that life and nothing else.
  - Perishing drops everything you carry, for good.
  - The run ends when nobody is left standing, and its depth (where the
    last of the team perished) is the team's.
- Every depth is a little harder than the one before, and nothing ever
  gets easier. The player isn't told what changes where; they feel it. A
  few things come in steps: four options for the first ten depths, six from
  10, eight from 30, ten from 69 (where a small kind like wands or relics
  can still be the answer as five of its own beside five of another, and a
  tablet, of which there are only nine, is asked with eight); one
  made-up name from 4, two from 16, three from 44;
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
  | 70 | 10 | 99% | 3 | 60% | 80% | 66%, 8 × 8 | 62% | 31% |
  | 80 | 10 | all | 3 | 60% | 94% | 73%, 8 × 8 | 82% | 45% |
  | 90 | 10 | all | 3 | 60% | always | 80%, 9 × 9 | always | 59% |
  | 100 | 10 | all | 3 | 60% | always | 80%, 9 × 9 | always | 73% |

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
  coarser than a whole item (at most 4 × 4), so ten of them stay a few
  dozen patches each to burn in.
- **Look-alike pictures.** From depth 49 a growing share of questions picks
  its look-alikes by their art instead of their names (1.4% at 49, as much
  more every depth, every question from 119): the wrong pictures of "find
  the art" look like the answer's, and the wrong names of "name the item"
  belong to items drawn like it. The answer still sits anywhere in the
  cluster, so the picture that fits the others best doesn't give it away.
  Only the host (or the device, in an old hot-seat game) fetches the look-alike table
  (`src/data/looks.json`, its own chunk of about 27 KiB gzipped), once a run
  reaches depth 19 (finds ask from up to 20 depths deeper); until it
  arrives, look-alikes go by name.
- **Twins.** Items whose art only a detail tells apart only meet in a
  question from the start of a zone on, whose card says so: Berek's rings
  and Uhtred's and Zarokh's gems from 50, the Guiding Palms from 60 (never
  in grayscale), the Brotherhood rings from 70 (a find from its deeper
  depth). Above it a question shows at most one of them.
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
  up one at a time: the Dynamite Cache from depth 10, the Azurite Vein from
  25 and the Flare Cache from 40. On its own first depth a find is certain:
  the depth's first offer always holds it (for a player with room for its
  item); one after a miss there rolls as any other. After
  that each find's chance rises evenly over the 20 depths after its first
  and then holds (the Dynamite Cache from 8% to 9% by depth 30, the Vein
  from 4% to 11% by 45, the Flare Cache from 4% to 13% by 60). From 10 to
  24 the Dynamite Cache is the only find, so it starts higher than the
  others to keep finds turning up early. From 60 about one offer in three
  holds a find. From
  100 they grow scarcer a little with every depth, down to half their chance at 199 (the Vein to a third, as a ward
  takes a whole loss), and hold there: about one offer in seven.
  - An offer that holds a find rolls once more for a second, of another
    kind and on another card, at half its chance; never a third. Two side
    by side are rare early on: never above depth 25, where the Vein joins
    the dynamite; about 1 offer in 23 at 25 (beside the certain Vein), then
    1 in 260 at 26 and 1 in 125 at 39; 1 in 11 at 40 (beside the certain
    Flare Cache); and about 1 offer in 28 from depth 60.
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
    doesn't change (no depth reached, no new zone); the new question gets
    the depth's full clock and rules (veil, pictures, grayscale, options,
    made-up names) as a fresh question, a flare works on it as usual, and
    it is never a find, even from a find's card (dynamite is no way to fish
    for finds). Its card is locked out like a pick. At most two blasts an
    offer (`DELVE_MAX_BLASTS`, the offer's other cards; the fresh offer after
    a miss at the same depth has its own). As the clock hits
    0, a flare burns first; only with none to burn does a stick go off by
    itself (while the offer has a blast left), right at 0, in place of the
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
    counts as seen in the Codex; blasting it misses nothing, but together a
    wrong answer someone gave it before a teammate blasted it stays logged
    as their miss, at the life or ward it cost. The run's record keeps
    how many questions it blasted away (shown on the Codex's last run and
    in its finds panel).
    The cache itself is unstable: a miss on it (a wrong answer or a
    time-out) costs a life as usual, and then its blast destroys one thing
    you carry, drawn at random by the host, whose state tells every screen
    what went (each ward, flare and stick one chance). A ward that takes the
    life goes first, and the blast draws from what is left. Carrying
    nothing, or perishing on the miss (which drops the whole pack anyway),
    it takes nothing more. Together,
    each player who misses loses one thing from their own pack, as their
    pick strikes (or at the time-out). The lost item bursts on the phial or
    beside it with a small blast of its own, a moment after the life, and
    the reveal says what went ("The blast destroyed your flare.").
  - An **Azurite Vein** (from depth 25) is dug a strike at a time. Each
    right answer digs out a whole **Azurite Ward** (one takes your next
    lost life instead), but only into your hand: the next cards are two,
    the vein running on into another category you may pick (the next
    strike, from further down: 20, 30, then 40 depths, its plaque reading
    "Dig Deeper") and the way out, **Back to the Light** (its plaque saying
    what it keeps), which puts what you dug out into your pack and takes the
    run a depth deeper. At most three strikes, and only as far as your pack has room.
    The whole dig runs on one **lamp**, the clock ring turned azurite:
    lit with strike 1's whole clock, it burns only while a strike is open
    and is never fed, so every strike after the first is paid for by how
    quickly the ones before it were answered; with a second or more left
    you may still dig on, a gamble on whatever light is left (under a
    second, the dig ends there and the haul goes into the pack by itself). A wrong answer or a
    time-out on any strike caves in, with a sound of its own: it costs two
    lives, a ward in the pack taking each loss first (on your last life
    you simply fall), and buries everything in hand. The dig stays at the
    vein's depth and its later strikes lock no category. Together the team
    votes between the two cards and answers each strike as any question;
    each ward goes to whoever got it right. While a vein is dug the scene
    is its own (`src/lib/vein.ts`, `azuriteVein` in `src/lib/backdrop.ts`):
    the hall goes cold and dark, cracks of azurite glow in the rock of the
    walls and the floor with crystals where they meet, and the embers burn
    azure; it fades back to the depth's own as the dig ends. Its sound is a
    tunnel off the zone (`VEIN_AMBIENCE` in `src/lib/soundDesign.ts`): a
    frozen river crackling, ice rumbling low and a mine shaft's groan, the
    zone's ambience ducked and muffled behind them (the zone's echo with
    it), as far behind in every place (`VEIN_DUCK`, by loudness) and
    further each strike. With spatial sound on the vein's own sounds ring in a
    room of its own (`vein` in `src/lib/acoustics.ts`), a tight tunnel,
    while the zone behind keeps its room. A pickaxe rings as its card is
    chosen, the azurite breaks free on a right strike, and while the dig
    runs on the walls crack all round you, worse after strike 2. The rules are in
    `src/lib/delve.ts` (the dig); `docs/vein-digging.md` has the design.
  - A **Flare Cache** (from depth 40) gives a **flare**: time later for time
    now, as its own question gets two thirds of its deeper depth's clock,
    rounded (never under 4 s, where its art still burns in, fast, with over
    3 s left once half of it is in). When your clock hits 0 a flare burns by
    itself, with a signal flare's hiss, and gives you 6 s more
    (once a question). An answer at any time before that keeps it; a guest's
    answer still on its way when it burns gives it back.
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
  for them meanwhile). A question one of them could still answer holds its
  clock still: once they're back (or after 20 s at most), it carries on with
  the time it had left (at least 5 s), and what was answered on it before
  the reload stands.
- A run starts from the lobby: alone in a room with one player,
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
    base, shimmering at rest: a ward
    crystallises on as it is mined, and bursts in blue sparks where it is
    when it takes a loss.
  - Flares and dynamite stand as small counts beside the phial.
  - The reveal says what happened in a few words: "You dug out an Azurite
    Ward. A ward in hand.", "Your ward took the hit.", "The vein caves in. You lose two lives." or, on a time-out,
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
- Each zone hands over to the next over five depths, from its 6th depth
  to the next zone's 1st: the next zone creeps in over the zone's last
  depths, eased, never a straight ramp, and the largest step of the
  handover by far (at least twice any before it) is the one into the next
  zone, as its title card names it at its first depth, so each zone reads
  as a place of its own. From its 1st depth to its 6th the new zone shows
  alone.
  - Its embers take the next zone's colour one by one: one in ten of
    them at its 7th depth, half at its 9th, two in three at its 10th, the
    last third at the next zone's 1st.
  - From its 7th depth the next zone's light, smoke and features creep in
    while its own recede (a sixth at its 8th, a third at its 9th, half way
    at its 10th, the other half at the next zone's 1st), each feature
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
  (not a run's first depth, after a reload, or the same depth dealt again,
  as after a miss):
  for 1.9 s the walls, smoke and dust drift up past you, quick to start and
  slow to settle, the embers streak up, and the dark draws in and lets go.
  Into a new zone (its first depth) it plunges much further, 5 screens,
  for as long as the zone's sound rings (7 s), its speed following the
  sound: it drops hard with the first blow, eases off as the sound dies
  down, is carried down again by its second swell and glides to rest as it
  fades. The scene takes the step into the new zone over the first blow
  and as the sound dies down (about 2.3 s, rather than the usual second).
  Meanwhile the stage stands empty and the header keeps the depth before,
  while the zone's title card names it (below); the new depth and its
  cards come in as the plunge lands, at one moment for the whole team.
  Nothing is picked before then, and a vote cast sooner neither opens its
  window nor closes the vote; the room bots look the cards over, vote and
  pick only once they are dealt. It is skipped with reduced motion or
  effects off (the wait for the cards is not).
- As a question's clock runs out the dark draws the light in and dims the
  scene (never the panels or text), lifting at the reveal or when a flare
  burns. The ambience, a hearth fire, sinks with the depth, over a slow
  rumble. Each zone, and from depth 100 each kind of place, lays a bed of
  its own under it and keeps as much of the fire as suits it; the beds
  cross-fade as the scene turns, in step with its light (half way at a
  zone's last depth, the rest into the next zone). Leaving a
  run, or rejoining deep down, fades straight to the scene it's going to
  (the surface, say) instead of passing through every zone.
- A new zone is named by a title card in the plunge into it, timed to the
  zone's sound: letterbox bars close in with the first blow (over the
  header's old depth) and the scene behind darkens a little; as the sound
  dies down, the place shows (the scene takes on the new zone, the largest
  change of its handover, as the sound falls, done before the name locks),
  the zone's sigil draws itself in a worn seal and a meta line
  ("Depth 10 • Zone II", or "• Deeper than ever" alone past your best)
  tracks out between rules ending in Sol and Luna; the name's letters
  gather, a soft tick as each lands, and lock on the sound's second swell
  with a whoosh, a thump and a chime, lighting the scene behind them, a
  divider struck out under them. A subtitle follows ("Magma Fissure • The
  rock is split, and it burns"), then up to three things new in the zone,
  each in a small engraved seal (a find's item, a number, or an
  alchemist's sign: "Dynamite Cache", "6 Options", "Mirrored art"). It
  holds, then leaves as its place has it, before the cards are dealt, the
  bars opening as control comes back. On large windows it is scaled up
  with the rest of the page, its bars as tall as the header they cover.
  Other players' pointers fade out while it is up and come back as the
  cards are dealt; your own isn't sent meanwhile. Each zone, and each kind of place
  past 100, moves after its look:
  - fire (Magma Fissure, Primeval Ruins in blue, forges, reliquaries)
    rises out of the divider's opened fissure white-hot, embers rising and
    heat shimmering in its glow, and burns away left to right;
  - ice (Frozen Hollow, frozen abysses, glacial pyres) condenses from
    above, glinting, under falling snow, and shatters on jagged seams;
  - spores (Fungal Caverns, sunken gardens, witchfire groves) drift in from
    a scatter in no order, breathing, and are exhaled into motes;
  - the void (Abyssal Depths, void blooms, blood eclipses) pulls the glyphs
    together out of a spiral, ghosts in split colours closing in, and
    draws them into its turning seal;
  - light (Vaal Outpost, Abyssal City's lanterns, necropolises, starfalls,
    drowned temples' rippling tide) lights each letter like a lamp, a shaft
    of light crossing the name as it locks, and puts them out in turn;
  - fumes (Sulphur Vents, sulphur marshes; the Petrified Forest's stone,
    which crumbles) lift the letters out of a fog of the zone's colour and
    carry them off.

  With reduced motion or effects off it fades in whole, holds and fades
  out; a screen that saw the run move on late gets the same, sooner, and a
  reload mid-plunge none (a screen reader is told where the run has come
  either way, and the scene's embers still take the zone's colour). The
  run's opening (the Mines) has no card: its start line, the header, the
  start sound and the light wave mark it, and on a screen that saw the run
  start a screen reader is told "The Mines." Alone, the first depth past
  your best says "Deeper than ever" on the line over the depth banner,
  lettered like the card's meta line in the depth's colour: its letters
  spread out of a blur as the stage comes in, between two short rules,
  with a short sting and a few glints, and a screen reader is told "Deeper
  than ever: depth N, past your best of M." On a zone's first depth the
  card says it instead, and the line still shows once the cards are dealt,
  quietly (with reduced motion or effects off it comes in with the
  stage). The header
  names the zone beside the depth, both in its colour (on a second line on
  phones).
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
- On a phone, eight or ten answers fit on the screen: names in two
  columns, pictures four to a row (ten: five to a row).

## Difficulty

The host chooses.

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

Twins, items whose art only a detail tells apart (Call and Whisper of the
Brotherhood; Berek's Grip, Pass and Respite; the three Guiding Palms;
Uhtred's three gems; Zarokh's two), only meet in a question once every wrong
answer is a look-alike name (Eternal, or Custom with All); before that a
question shows at most one of a set, picked at random when the answer is none
of them (`TWINS` in `src/lib/game.ts`). The Guiding Palms differ only in
colour, so they never meet where the art is in grayscale. Today's unique
leaves twins be: they may meet in it, as they could from its first day.
New items are checked for twins by `tests/twins.test.ts`: it lists every
pair in a group whose art looks very alike (the look-alike table, so rebuild
it when items come in) or whose names share a word, until each is a set in
`TWINS` or marked as looked at and told apart.

## Codex

**Codex:** a page (from the start page's corner, or at
`poe2.quest/#codex`) listing every item you have seen, with your accuracy per
item, category, item group, question type and difficulty, your nemeses (lowest
accuracy, at least 2 answers), mix-ups (what you picked for what), made-up
names you fell for, streaks and answer times. Every question revealed on your
screen counts as seen; only your own answers count toward accuracy (your turn,
or your guess in a race; a turn that runs out of time is wrong). The turns
of players at the host's screen are theirs, not the host's: they count for
nobody. In an old hot-seat game, answers only count when one person plays
alone. Today's unique on the start
page counts as seen, but its answer doesn't count toward accuracy; its practice
questions find nothing and count only toward a Practice accuracy of their own
(endless as they are, they'd otherwise fill the codex without a game).
Undiscovered items show as
dark silhouettes, and the codex can't be opened while in a room. It is kept in this
browser's localStorage only (`src/lib/codex.ts`).

The Codex has two tabs: **Collection** (the above) and **Delve**, built
from the same parts. Alone and together are kept apart and never summed:
the kind you played most leads (on a tie, the one that got deeper). Delve
shows that kind's deepest in the rune circle with the zone it reached,
beside the other's deepest, your runs (alone and together), your usual depth (the
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

## Achievements

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
in a row are kept beside the list, and a game walked away from while losing
(leaving it, or closing the page, behind a rival still there) counts as lost
once another one starts; a reload back into it, being removed or the room
closing never does. A new achievement is announced with a notice bearing its
seal, a moment after it is earned. Once earned it stays earned. Kept in this
browser (`src/lib/achievements.ts`); erasing the codex erases them.

**Class sigils:** each achievement unlocks the sigil of one PoE2 class, the
one the player picks (all twelve, those not in the game yet too), on the
achievements page; a notice after the achievement says there's one to unlock.
One unlocked is worn on their avatar behind their initial, for everyone in the
room to see (it comes with their join). Unlocked stays unlocked, also when the
codex is erased; then only achievements past the sigils already unlocked
unlock more. Kept in this browser (`src/lib/sigils.ts`).

## Multiplayer

- **Online (peer-to-peer):** the host creates a room and shares the 6-character
  code or invite link. Browsers connect directly over WebRTC
  ([PeerJS](https://peerjs.com/)). The host's browser runs the game and
  everyone else sees the same state live. Only the free PeerJS cloud is used,
  to introduce the players to each other.
  - An invite link (`?room=CODE`) carries only the room's code. Opened by
    someone who has never played, the start page shows it with the choice
    made: "Join <host>'s room" with a name field, and the room as the
    lobby will show it (its code, the host's chip, theirs filling in as they
    type). Whose room it is, how many are in and whether it can be joined
    (locked, full, playing, gone, another version) the room says itself:
    the screen asks it on opening, as the room list asks public rooms
    (`probeRoom`, answered by `ProbeDesk` in `src/lib/probeDesk.ts`), so
    no link can name a host it doesn't have. Asking connects to the host,
    as the room list does (see `docs/fair-play.md`, Privacy).
    Anyone with a saved name joins straight away; if the room is gone or
    full they stay on the start page with the code in Join a room.
  - **Players at the host's screen:** in a Turns lobby the host can add
    players by name under the party (Add a player at your screen). They
    play at the host's screen, on their own turns (the host's screen acts
    for them then, under their name), so two or more at one device can play
    with others online, or alone together without anyone joining. They're
    guests: no codex, records or achievements of their own, and their turns
    count for nobody. Race and Delve set them aside (they need a device
    each, or are played alone or as a team online), and Turns brings them
    back, so looking at another mode loses nobody. Removing one takes one
    click (there's no device to bar). See `Player.local` and `aside` in
    `src/lib/game.ts`.
  - **No connection:** a room that can't go online (no connection to the
    matchmaking server, or a page that can't seal pictures) opens anyway, on
    this device only: nobody can join, players at the screen are added in
    its lobby, and a reload picks it up there (`hostHere` in
    `src/lib/session.svelte.ts`).
  - Players who refresh or drop out rejoin automatically. Outside Delve, the
    host can skip the turn of a player who is disconnected. Opening the same room in a
    second tab moves your seat there, and the first tab lets it go.
  - If the host refreshes, the room reopens with the same code and players
    reconnect.
  - Anyone who joins a game that has already started watches as a
    **spectator** (up to 8) and gets a seat when the host starts the next
    game. This works with the code for any room that isn't locked; public
    rooms that are in a game also show a **Watch** button under Open rooms.
  - A spectator can choose **Just watch** to keep watching instead of
    taking a seat when the next game starts (and **Play next game** to
    change their mind). A guest in the lobby can give up their seat the same
    way, and **Take a seat** again. The choice holds through reconnects.
  - **Who's ready:** in the lobby, a player's chip carries a mark, where the
    host has their banner, when they aren't simply there
    (`src/components/StandingMark.svelte`): a closed eye when their game
    isn't on their screen (another tab, a minimised window, or the screen
    off, for more than a couple of seconds; another app's window over the
    browser doesn't count, as the page can't tell), a crescent moon when they haven't touched it
    for two minutes, signal bars with two lit when their game answers the host's
    pings slowly (a smoothed round trip over 800 ms, or none for 7 s), and
    unlit bars when they're offline, all in the same muted grey. Away, idle
    and offline names dim, and idle and offline avatars grey as an offline
    player's does in the game (away can be a look at another tab). Beside Begin the host sees "All 4 exiles here and ready" with
    a tick, or who the game would begin without and why ("3 of 4 ready; Kai
    is away"; never themselves); a guest waiting on an away or idle host is
    told so. Coming back to the game counts as a sign of life, and the room
    hears of each change at once (away once its grace is over). Each device tells
    the host its own presence as it changes, once the host has welcomed it
    (a host on another version wouldn't know the message), and the host tells the room
    (`src/lib/presence.ts`).
  - **Live pointers:** in the lobby, in turns mode and Delve together, and
    on the screen that ends a game (any mode), everyone sees the other players' mouse pointers move over the room, in their colour and
    with their name; a tap on a phone shows where it landed, as the
    pointer pressed, for a moment. Every pointer, your own included, is the same engraved dart
    (one point of the rune circle's compass star, `src/lib/pointerArt.ts`):
    yours in old gold, or in your colour once you have a seat in an online
    room (the lobby included), shown as the system cursor so it never lags (`src/lib/ownCursor.ts`).
    It has its states, the others' included: over anything that can be
    clicked, a demon's clawed hand pointing, seen a little from the side;
    while the button is held, the dart sinks a little, lit a little, its
    hatched side struck solid, and the hand pushes its finger into the page; on
    something disabled (another player's answers and cards), dull lead with
    a saltire. Another's pointer is the hand whenever their own cursor is:
    each player's screen sends that with the pointer. A still pointer dims;
    it's hidden only once its player leaves the page. Text fields get an
    engraved I-beam. With Windows' high contrast on, the system's own
    cursors come back. Text fields don't offer autofill, and a right click
    brings no browser menu (but in a text field), since both show the
    system's cursor. Scrolling with the middle
    button (Windows and Linux, where browsers do it) is the game's own
    (`src/lib/autoscroll.ts`), so it can wear the look: a seal where it
    began, with the ways left to go, and a dart pointing the way it scrolls.
    Spectators see them but don't show their own. A pointer is sent as a
    spot on the element under it (`data-cursor`: an answer, a category
    card, a scoreboard row, the art, the button that moves on, a setting,
    the room code, the header's buttons, the line under a question, the
    winner's circle; about sixty in all), so it lands on the same thing on
    every screen, a phone's included, and with the elements round that
    one (a setting's button, its row, the panel), so a screen without the
    first (a guest has no host's buttons, a phone lays things out its own
    way) puts it on the next it has. Counterparts share a name: the host's
    Begin row and a guest's wait for it are both `start`, the timer is
    `timer` wherever a layout puts it. Between elements a pointer goes
    beside the nearest one; near none, on the game as a whole, measured
    down it by screen heights so it holds still as cards are dealt. A click is always seen:
    the press goes out even when it's over before the next update, and a
    pointer whose element goes with the click (a card picked) stays where
    it was a moment. While a new zone's title card is up, nobody's pointer
    shows or is sent (the room bots' included); they come back as its
    cards are dealt. Never in a race, nor while
    deathmatch duelists answer, where it would give answers away. See
    `src/lib/cursors.ts`.
  - The room code stays in the header during the game, unless the host
    hid it for streaming.
  - After a game, the host can **Play again** (same settings, starts right
    away, spectators included) or **Change settings** (back to the lobby).
  - Very strict networks (some corporate or mobile networks) can block
    WebRTC. Then everyone can still play at the host's screen.
- **Open rooms:** a host can set their room to **Public**, which lists it
  under "Open rooms" on the start page. A first-time host's room starts
  public (and in Delve); after that the room starts the way the host left
  the last one.
  Without a server there's no central list, so a public room claims the
  lowest free numbered listing ID on the matchmaking service
  (`…-pub-1`, `…-pub-2`, …), and the start page checks those numbers in
  batches of 10, stopping after a batch with no rooms. Batches past number
  30 are spaced out to avoid throttling, and rooms above number 10
  periodically move down into freed-up numbers so gaps can't hide them.
  See `src/lib/rooms.ts`.
- **Hot-seat** has no entry of its own any more: a room's host adds the
  players at their screen. A hot-seat game saved before that, or a Delve run
  started from a shared link, still plays on one device as before.

The host picks the mode (take turns, race or Delve: three buttons, each
with an engraved emblem, and only the chosen mode's description below
them), then, outside Delve, the difficulty, the target score and an
optional time limit per question (off / 8 / 16 / 32 / 64 s).
