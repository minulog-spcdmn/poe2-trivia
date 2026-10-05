# Delve: implementation plan

This plan merges the three design notes: rules and curve, the visual and audio descent, and multiplayer, network and state. I checked the code wherever the notes disagree or a claim looked doubtful. Appendix A lists each conflict and how it was resolved. Appendix B lists the claims I checked and what the code says. This revision takes in a review. I checked each review issue against the code, and in some cases with the real engine; the notes at the end say which issues I accepted and which I rejected.

---

## 1. The game, as a player reads it

**Delve** has no settings. Everyone plays the exact same rules, so "I reached depth 30" alone means the same thing for everyone.

- **Your turn.** Pick one of three item categories, then name the item. A category you pick stays locked for your next few turns.
- **Depth.** Each round takes you one depth deeper.
  - The first depths are gentle: four options and 20 seconds.
  - Further down come more options, look-alike and made-up names, "find the art" questions, grayscale and mirrored pictures, and longer lockouts.
  - The timer loses a second every four depths, down to 5 seconds in the abyss. It starts only when the art is in front of you.
- **Lives.** Everyone has three. A wrong answer or running out of time costs one. So does letting your turn run out while you are disconnected.
- **Alone,** you delve until your third life is gone. The depth where you fell is your result, and it is the number to compare.
- **Together,** the last one standing wins and keeps delving until their own third life is gone. A group depth is always shown with the number of players, because a shared room uses up the items faster (2.7).
- **The scene.** As you go deeper the hall darkens and closes in, and the embers grow restless. From depth 25 they start to burn blue.

---

## 2. Rules

### 2.1 Depth
- **Depth is the round number,** `s.round`.
  - Each round, every player still standing plays exactly one turn, under `delveRules(depth)`.
  - Solo: depth equals the question number, because every `advance` wraps (game.ts:1060-1091).
  - The rules at a given depth are the same in every run. The questions are not quite the same, because a group uses up the item pool faster (2.7). So a group depth is always shown and stored with its player count, and solo and group bests are kept apart (9).
- **Your result** is the depth where you lose your third life: "reached depth N" means "fell at depth N".
  - Lives never come back, and a standing player has exactly one turn per depth, so a fallen player always has exactly N - 3 right answers.
  - So depth alone describes a run.
- **`Player.score`** keeps counting right answers (game.ts:816), but Delve never shows it, since it is always the fall depth minus 3.

### 2.2 Lives

Everyone starts with 3. There is no regain, no checkpoint and no continue.

| Event | Cost |
|---|---|
| Wrong answer | 1 life |
| Running out of time, or an answer after deadline + 500 ms (`ANSWER_GRACE_MS`, game.ts:319) | 1 life |
| A guest sending `index: null` (allowed by protocol.ts:75) | 1 life (counts as a timeout) |
| The turn's choice runs out (`pickBy`, 2.5) while the player is disconnected | 1 life, with no reveal; the turn ends |
| The turn's choice runs out while the player is connected | No life: a random offered card is picked, and its question clock runs |

- **Streaks.** Losing a life also ends the player's streak. `countStreaks` only runs on a new reveal (game.ts:888-891), so `loseLife` sets `streak = 0` itself. Otherwise a turn missed while choosing would keep the streak fire burning.
- **No skipping.** The engine refuses `skip` in Delve from every caller (5).

### 2.3 Elimination and the end of a run
1. **Falling.** A player whose third life goes has fallen at that depth, straight away.
   - They keep their seat with 0 lives, as the deathmatch keeps its eliminated players (game.ts:262-274), and watch.
   - `turn` stays a valid seat index, and restart still reseats them (game.ts:874).
2. **The round finishes for everyone else,** so turns stay equal (the same principle as tests/game.test.ts:80-96).
3. **At the round boundary** (the seat walk wraps):
   - If exactly one seated player is standing, in a run that started with 2 or more entrants, they are the **last one standing**. This is recorded once, and they **keep delving alone** until their third life is gone.
   - Then `round++`.
4. **The game is over** when no seated player is standing. In practice this always happens at a round boundary.

**"Standing" always means a seated player (`s.players`) with lives left.** `delve.entrants` is only read for its length (solo or group). A kicked player leaves the seats, `losses` and the standings, and never counts as standing.

### 2.4 Winners and ties
- **Solo:** `winners = []`. Nobody "wins"; the result is the depth. GameOver and the sounds get explicit Delve branches (sections 7 and 8.6), so the "{name} wins!" fallback (GameOver.svelte:19, 32) never shows.
- **Multiplayer:** the player who fell deepest wins.
  - **Ties at the same depth** go to whoever lost their second-to-last life deeper, then their first.
  - **Identical runs** share the win.
  - "Most correct" can never break a tie, because equal depth means equal right answers.
  - When a tiebreak decides the winner, GameOver says so in words (7), so nobody wonders why two players at depth 20 rank 1 and 2.
  - Whether to break ties at all is open question 2.

### 2.5 Idle, disconnects, refreshes, failed art and leaving
- **One choice budget per turn.** This applies to online group runs (host mode, 2 or more entrants) and to every player, the host included.
  - `delve.pickBy` is set to the turn's start plus 20 s (`DELVE_PICK_MS`). It lives in the state, so every device shows the same countdown.
  - When `pickBy` passes, the host applies the trusted `expire` action.
    - A connected player gets a random offered card. They lose no life for hesitating, and the question clock then runs.
    - A disconnected player loses a life, and the turn ends with no reveal.
  - Reconnecting does not refill the budget. A player who comes back with less than 10 s left gets 10 s from their return (`DELVE_REJOIN_MS`), once per turn.
    - So dropping and rejoining in a loop cannot hold up the room: a turn's choice lasts at most about 30 s.
    - JoinGate allows a known player to rejoin every 10 s indefinitely (guard.ts:158), so this cap is needed.
  - A guest's pick that arrives just after `expire` picked is dropped silently (5).
  - Solo, online rooms with one entrant, and hot-seat have no limit (`pickBy: null`).
  - **Countdowns.**
    - The active player sees "A card is chosen for you in {n}s" during the last 10 s.
    - Everyone else sees the state-driven line in Game.svelte (7).
    - Today `skipAt` is host-only session state (session.svelte.ts:188), so guests never saw a countdown.
- **Nobody skips by hand.**
  - The host's Skip buttons are gone in Delve.
  - The engine also refuses `skip` there from every caller. Today `isHost` is true for `from === s.hostId` (game.ts:648), so hiding the button alone would not stop a rival host.
  - The only way to lose a life without answering is `expire`, which checks `pickBy` itself.
- **Disconnected players are not passed over.** Today `advance` passes over them (game.ts:1074).
  - Their turn still comes up and its budget runs.
  - During a question the clock runs, as it does for everyone.
  - There is no auto-skip during a question; the deadline ends it. Today `scheduleAutoSkip` also covers questions (session.svelte.ts:1194-1200), and that could take a life before the player's own deadline.
- **Host reload.** The reload marks every guest offline (session.svelte.ts:357-358). In Delve the host then applies the trusted `resumed` action:
  - **Excused seats.** Standing players marked offline are *excused* until they reconnect.
    - An excused player's turn waits until at least 60 s after the reload (`DELVE_RESUME_GRACE_MS`), and their choice budget then runs as usual.
    - 60 s covers a guest's 15 s silence watchdog plus its retries every 3 s, each attempt allowed 10 s (session.svelte.ts:65-67, 913-924).
  - **A guest's open question is set aside.** The guest goes back to the same three cards, loses no life, and gets a different question.
    - This applies even if the deadline passed during the reload, because their answer may have been lost while the host was gone.
    - Every device shows "The host reloaded, so {name}'s question was set aside; no life lost."
  - **The host's own question and hot-seat games** keep their deadline.
    - If the deadline has passed, it fires at once, so a refresh can never re-roll a hard question.
    - A question whose clock had not started yet just has its art prepared again.
  - **A reload during choosing** restarts that turn's budget.
  - **Last one standing counts lives only,** never connections.
- **Art that fails to load.** The clock only starts once the art is out (3.3), so nothing is lost while it fails.
  - The host asks again by itself, with a backoff (at once, after 2 s, after 5 s, then every 10 s), for as long as the art keeps failing. A turn can never hang with no deadline coming.
  - The host also keeps the existing "Ask another question" button (Game.svelte:164-168).
  - A question that already has a deadline (the host's own question after a reload) is never asked again automatically. It runs out.
- **Re-ask** stays host-only. In Delve it is only allowed before the clock has started.
- **Leaving.**
  - **A guest who closes the tab** keeps their seat, offline (`conn` close applies `connection: false`, session.svelte.ts:494-508).
    - A fallen guest may leave at any time; their run was recorded when they fell.
    - A standing guest who leaves loses a life on each of their turns until they fall, unless the host kicks them.
  - **A kick** removes the seat, its losses and its standings row (`remove`, game.ts:703-734).
    - The token is banned (session.svelte.ts:971), so the same id never comes back.
    - If it was their turn, play continues from the seat before.
  - **When the host closes the room mid-run,** every standing player's run is saved as unfinished at the current depth. An unfinished run never counts as a best, and the "room closed" notice says so (9). Leaving a solo run mid-way does the same.

### 2.6 What Delve ignores
These are never used in Delve:
- target score;
- the deathmatch;
- difficulty and custom knobs;
- the lobby timer;
- the host's Skip tools.

They stay stored in `settings`, so switching back to turns or race restores them.

### 2.7 Item pool
- **Each Delve run starts with an empty `used` pool,** so every solo run draws from the same pool.
  - A leftover pool doubles the share of easier mixed-group questions deep in a run: 8% rises to 18-22% with 120 items already used (rules note, measured).
  - The README only promises no repeats "within a game" (README.md:27), so this breaks nothing.
  - Restart still keeps `used` for turns and race (game.ts:882).
- **A group uses up the pool faster.** `used` belongs to the whole room (game.ts:417) and grows by one answer per turn, not per depth. I measured this with the real engine, on Eternal knobs, with everyone answering right:
  - **Mixed-group share at depths 16-30** (seeds 1-10): 10.0% solo, 11.3% with 2 players, 17.8% with 4, 27.1% with 8 and 27.7% with 12.
  - **First category restart** (seeds 1-5): never within 60 depths solo; once at depth 60 with 4 players; depths 29-34 with 8; depths 21-26 with 12.
  - After a restart, earlier answers come back into play (game.ts:1311-1319).
- **Decision: one shared pool, with group depths kept apart from solo depths.**
  - The shared pool is the honest one: nothing anyone saw revealed in the room comes back.
  - Per-player pools were considered and rejected. An item revealed on someone else's turn could then be your answer, which is easier than a fresh item. With 4 players, that is about one answer in five by depth 30.
  - Within a room, everyone faces the same pool, so last one standing stays fair.
  - Records keep solo and group bests apart, and a group depth is always shown with its player count (9). Solo depth is the comparable number.
  - See open question 5.

---

## 3. The depth curve

### 3.1 Formulas (new `src/lib/delve.ts`)

```ts
export const DELVE_LIVES = 3;
export const DELVE_RULESET = 1;            // bump with PROTOCOL_VERSION whenever the curve changes (4.4)
export const DELVE_MAX_LOCKOUT = 7;        // 10 categories minus OFFER_COUNT 3
export const DELVE_PICK_MS = 20_000;       // choice budget per turn, online group runs
export const DELVE_REJOIN_MS = 10_000;     // once per turn, for a player back with less left
export const DELVE_RESUME_GRACE_MS = 60_000;
const depthOf = (d: number) => (Number.isFinite(d) ? Math.max(1, Math.floor(d)) : 1);
export const delveStratum = (d: number) => Math.ceil(depthOf(d) / 4);
export const delveTimer = (d: number) => Math.max(5, 21 - delveStratum(d));              // seconds
const LOCKOUTS = [2, 2, 2, 3, 3, 3, 4, 4, 5, 6];
export const delveLockout = (d: number) => LOCKOUTS[delveStratum(d) - 1] ?? DELVE_MAX_LOCKOUT;
export function delveRules(d: number): DifficultyRules {
  const k = DELVE_KNOBS[Math.min(delveStratum(d), DELVE_KNOBS.length) - 1];
  return { ...k, veil: null, lockout: delveLockout(d) };
}
/** The preset whose knobs a depth plays (codex filing). */
export const delveTier = (d: number): Preset => (delveStratum(d) <= 3 ? 'cruel' : delveStratum(d) <= 6 ? 'merciless' : 'eternal');
```

- `delve.ts` imports only types from `game.ts`. Those are erased under `--experimental-strip-types`, so there is no runtime import cycle.
- The pick and grace constants are not part of the ruleset: they never change how hard a question is.

### 3.2 Table

| Stratum | Depth | Options | Look-alikes | Made-up | Find the art | Grayscale | Mirrored | Veil | Timer | Lockout | Plays like | Milestone |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1-4 | 4 | none | 0 | never | off | 0 | off | 20 s | 2 | Cruel without art questions | The Mine Mouth (start) |
| 2 | 5-8 | 4 | none | 0 | 40% | off | 0 | off | 19 s | 2 | Cruel | |
| 3 | 9-12 | 6 | none | 0 | 40% | off | 0 | off | 18 s | 2 | | |
| 4 | 13-16 | 6 | half | 1 | 40% | off | 0 | off | 17 s | 3 | Merciless, as turns plays it | **13 The Galleries** |
| 5 | 17-20 | 8 | half | 1 | 40% | off | 0 | off | 16 s | 3 | | |
| 6 | 21-24 | 8 | all | 2 | 50% | off | 0 | off | 15 s | 3 | | **21 The Azurite Veins** |
| 7 | 25-28 | 8 | all | 2 | 50% | art | 30% | off | 14 s | 4 | Eternal, as turns plays it | **25 The Cold Fire** |
| 8 | 29-32 | 8 | all | 3 | 50% | art | 30% | off | 13 s | 4 | past Eternal | |
| 9 | 33-36 | 8 | all | 3 | 50% | all | 50% | off | 12 s | 5 | | |
| 10 | 37-40 | 8 | all | 3 | 50% | all | 100% | off | 11 s | 6 | knobs at their maximum | |
| 11 | 41-44 | same | | | | | | | 10 s | 7 | lockout at its maximum | **41 The Blue Deep** |
| 12 | 45-48 | same | | | | | | | 9 s | 7 | | |
| 13 | 49-52 | same | | | | | | | 8 s | 7 | | |
| 14 | 53-56 | same | | | | | | | 7 s | 7 | | |
| 15 | 57-60 | same | | | | | | | 6 s | 7 | | |
| 16+ | 61+ | same | | | | | | | 5 s | 7 | the floor | **61 The Abyss**, then **The Bottomless Dark** at 81, 101 and every 20 after |

- `DELVE_KNOBS` has 10 rows of `{options, similarNames, fakes, artChance, grayscale, mirror}` taken from the table.
- Every milestone up to 61 falls on the first depth of a stratum, so a new name arrives with a rule change.
- The Bottomless Dark milestones (81, 101, ...) come after the rules have stopped changing. Their card reads "The rules change no more; the dark goes on." (`delveChange`, section 7).

### 3.3 Feasibility checks

**Offers stay at three**
- `offerCategories` (game.ts:1098-1105) excludes the last L picks (the slice below) and nothing else.
  - The last L picks hold at most L distinct categories, so at least 10 - L categories remain allowed. That is at least 3 for any L of 7 or less.
  - It falls back to stale categories when fresh ones run short, so the offer is always 3.
- This needs no assumption about how the lockout changes. It does depend on the data having 10 categories (a fixed mapping in scripts/fetch-data.mjs).
- So a test asserts `engine.categories.length - OFFER_COUNT >= DELVE_MAX_LOCKOUT` (10). A later change to the mapping then cannot quietly drop the offer to 2 cards.

**The lockout must apply at once.** Today the history is trimmed with the current lockout (game.ts:791), so a rising lockout would bite a turn late. Delve keeps the history at 7, and `offerCategories` slices it by the lockout in force (section 5).

**Options stop at 8**
- At 10 options, `evenSizes` (game.ts:582-586) only allows pairs.
  - That leaves Wands, Sceptres, Foci, Quivers, Flasks, Relics and Tablets never answerable.
  - Small categories would also restart every 2 to 7 questions.
- At 8, every group can be the answer. This was measured in the rules note, and all three notes agree.

**Every value is a legal knob step**
- Each knob value is on `KNOB_STEPS` (game.ts:50-59), and fakes never exceed `maxFakes(options)` (game.ts:101-103).
- Lockouts 6 and 7 are not on the steps. So `delveRules` returns `DifficultyRules` directly and never goes through `cleanKnobs` or `knobsOf`.
- `KNOB_STEPS` stays as it is, so the Custom editor does not grow.

**No veil, ever**
- On your own turn it is only delay; the reason is in the comment at game.ts:226-229.
- It would eat into a short timer.
- Its patches are released on a host schedule (media.svelte.ts `patchDelays`), so how much art you see would depend on the network.

**Timer values**
- Every whole second from 20 down to 5 is used. These are off `TIMER_STEPS` (game.ts:333).
- The timer is computed per question, never stored in `settings.timer`, so `snapTimer` (game.ts:757, prefs.ts:56) never sees it.
- The ring already draws any length (Game.svelte:103).

**The clock starts when the art has reached the player who answers.** This is required for any timer under 8 s.
- **Today.** The deadline is `askedAt + timer` (game.ts:1343-1344). It is set before `startMedia` awaits `prepareMedia`, which can take up to 15 s (session.svelte.ts:688-724).
- **Releasing is not arriving.** `release` shows the host's own copy at once (`shown.receive`) but only queues bytes for guests (session.svelte.ts:750-754).
  - An 8-tile art question is 8 re-encoded WebPs. The source art averages 14 KB per file (7.1 MB over 501 files), and the noise added before encoding grows it. So one question is roughly 100-300 KB per connection.
  - Release sends it to every guest at once, spectators included: up to 19 connections on one host uplink.
- **In Delve:**
  1. `makeQuestion` sets `deadline: null`. `publicView` withholds the labels, the prompt and the groups until the clock starts (4.3), so nobody can study the options off the clock.
  2. The host prepares the art and sends it to **the answering player first**. Everyone else's copy is held back until step 4, so spectators and fallen players never share the uplink with the person on the clock.
  3. The host polls that guest's connection every 50 ms until its send queue is empty, meaning PeerJS's own queue (`conn.bufferSize`) and the channel's `dataChannel.bufferedAmount` are both 0. It waits at most `DELVE_CLOCK_CAP_MS` (3 s) after the release.
  4. The host then applies the trusted `{type:'clock', askedAt, at}` with `at = now + min(rtt / 2, 500 ms)`.
     - The state carrying the options and the deadline goes out at once and reaches the guest at about `at`.
     - The held-back media then goes to everyone else.
  - The host's own question, hot-seat, and an active player who is offline all get `at = now`, right after the release.
- **The answering screen shows everything at once.** QuestionView shows the art, the prompt and the options together only when the clock has started and every picture of the question is in: all 8 tiles for an art question, not just the first (QuestionView.svelte:289 today tests for "any tile"). Digit keys do nothing before that (7), and the engine refuses an early answer from every caller (5).
- **What is left over.**
  - A guest whose link needs more than 3 s for the pictures loses the excess.
  - The host never waits for its own art.
  - A cheating guest can slow its own reading to stretch the wait toward the 3 s cap. It then holds the pictures but not the options or the name to find, so the gain is small.
  - The README states all of this (section 11, step 4).
- **Measurement before ruleset 1 is frozen.** Time from release to arrival for 8-tile art questions, direct and through a TURN relay, from a phone uplink, with 1, 4 and 12 guests. If the cap is hit often, revisit the cap or the floor (open question 7).
- **Faster entrance.** The stagger is cut to `delay: i * 40, duration: 250`. Today it is `300 + i * 90` ms plus 450 ms (QuestionView.svelte:633) and `250 + i * 80` for tiles (538); that would eat 1.4 s of a 5 s timer.

**Phones must fit the deep strata.** On a 375x667 screen, an 8-option question is about 900-950 px tall today, against about 550 visible pixels.
- 8 tiles are 4 rows of 140 px (QuestionView.svelte:1564-1572, 1657-1660). 8 names are about 417 px, under art of `clamp(180px, 32svh, 230px)` (1627, 1635-1655).
- Section 7 gives the Delve phone layout.
- Ruleset 1 is frozen only after a 375x667 check of 8 names and 8 tiles at the 5 s floor. If it fails, see open question 7.

**Protocol bounds**
- Answer index 0..16 (protocol.ts:75) is well above 8 options.
- With no veil, the patch limits never apply.

**Anti-bot filter.**
- `MIN_HUMAN_MS` 200 + rtt counts from the first media send to that guest (session.svelte.ts:73, 636-643, 755-758).
- Under the drain clock, an honest answer always arrives later than that, so the filter stays as it is.

**Art lean works unchanged**
- `tallyMode` uses the share in force at that depth (game.ts:1263-1267).
- `reask` and the `resumed` rewind un-tally at the same depth.
- At 0% art every tally is 0, so stratum 2 starts clean.

**The pool.**
- **Solo,** over a 200-depth run:
  - no earlier answer ever came back as a decoy;
  - made-up names always fitted;
  - the art share stayed at 0.49-0.53;
  - `makeQuestion` took about 30 ms at worst;
  - categories started over only past about 160 questions.
- **Groups** are covered in 2.7.

### 3.4 Expected run length (rules note model)

| Player | Expected depth | Middle 80% | Solo run (online / hot-seat) |
|---|---|---|---|
| Weak | 11.5 | 6-17 | 2.4 / 2.1 min |
| Average | 18 | 11-26 | 3.7 / 3.2 min |
| Strong | 36 | 24-49 | 7.2 / 6.3 min |
| Elite | 56 | 42-65 | 10.7 / 9.3 min |

- **The model's inputs are not in this plan.** These are the rules note's per-stratum accuracy and answer time for each player type.
  - Before ruleset 1 is frozen, write them into `scripts/delve-model.mjs`, together with the chain that produces this table.
  - Check them against codex answer logs, which keep accuracy and answer time by difficulty (codex.ts `Answer`).
  - A later change to the curve splits the records (4.4), so this check comes first.
- **Who sees what.**
  - About 14% of average players and 90% of strong players reach the Cold Fire (depth 25), where the first embers turn blue (8.1).
  - Full blue at 41 is mostly for strong players (roughly a third) and elite players (nearly all).
  - 37% of elite players reach the Abyss.
- **Multiplayer length.**
  - Total turns are roughly the sum of everyone's fall depths, at 12-13 s per turn.
  - With average players that is about 4 minutes per player: about 15 min for 4, 30 min for 8 and 45 min for 12 (MAX_PLAYERS, game.ts:454).
  - That is in line with turns mode at target 10 with the same room.
  - The lobby states the estimate (7).
- **The survivor's solo stretch** after the last rival falls:
  - about 1 to 2 minutes between players of similar strength;
  - about 3.5 minutes for a strong player who outlasts average ones;
  - about 7 minutes for an elite player who outlasts average ones.
  - Fallen guests may leave at any time without affecting the run (2.5).
- **No scaling by player count,** or depth stops being comparable.
- **The single tuning constant** is the stratum length (4). See open question 3.

---

## 4. State and protocol

### 4.1 Types (src/lib/game.ts)

```ts
export type GameMode = 'turns' | 'race' | 'delve';           // game.ts:302

export interface Delve {
  /** Everyone seated when the run started. Only its length is read: one means a solo run. */
  entrants: string[];
  /** Depths at which each seated player lost a life, oldest first; the third is where they fell. */
  losses: Record<string, number[]>;
  /** Group runs: who was left standing alone, and the depth they had just finished. */
  lastStanding: { id: string; depth: number } | null;
  /** DELVE_RULESET when the run started. */
  ruleset: number;
  /** Resumed by a build with another DELVE_RULESET: plays on, never counts as a best. */
  mixed?: boolean;
  /** Host clock when the run started (the run's id for records). */
  startedAt: number;
  /** Online group runs, while choosing: host clock when the choice is made for the player; null otherwise. */
  pickBy: number | null;
  /** The once-per-turn extension for a player who came back late is used up. */
  pickExtended: boolean;
  /** Standing seats the host's reload marked offline that have not reconnected since. */
  excused: string[];
  /** An excused player's turn waits at least until then (host clock). */
  graceUntil: number;
}
// GameState (game.ts:398-433):
  /** The Delve run in progress (or just over); null otherwise, missing in older saves. */
  delve?: Delve | null;
// Question (game.ts:345-377):
  /** Delve: host clock when the clock started; the deadline is null before. */
  clockAt?: number;
// Action (game.ts:435-450):
  /** Trusted only: the art has reached the answering player; the clock starts at `at` (host clock). */
  | { type: 'clock'; askedAt: number; at?: number }
  /** Trusted only: the choice ran out. A random card for a connected player, a lost life for an offline one. */
  | { type: 'expire' }
  /** Trusted only: the host reopened its room after a reload. */
  | { type: 'resumed' };
```

**Why this shape**
- **`losses` is the only stored truth.** Lives, "has fallen" and the fall depth all derive from it, so they cannot disagree, and the tiebreak needs those depths anyway.
- **Depth reuses `s.round`.**
  - It is already public, and it only rises at a round boundary.
  - During a reveal it is still the depth the question was asked at, so the codex and records can read it there.
- **The timing fields live in the state.** The choice deadline (`pickBy`) and the reload grace (`excused`, `graceUntil`) are in `delve`.
  - Every device then shows the same countdowns.
  - The rules that use them run in the engine, where node tests reach them.
- **`delve` is scoped like `deathmatch`.**
  - It is null outside a run and rebuilt by `start`.
  - `restart` clears it through `createGame`.
  - `finish` keeps it for GameOver, with `pickBy` cleared.
- **`Player` does not change.** Streaks keep working through the turns branch of `countStreaks` (game.ts:606-613), plus the reset in `loseLife`.
- **No separate `rewind` action.** The only legitimate rewind is the host-reload one, so it lives inside the trusted `resumed`. A rival host cannot use it to stall a turn.

### 4.2 Pure readers (src/lib/delve.ts)

The UI, codex, backdrop and records all read these. All of them go through `s.players`, never `entrants`.

| Reader | Returns |
|---|---|
| `delveDepth(s)` | `s.delve ? s.round : 0` |
| `livesOf(s, id)` | `s.delve && s.players.some((p) => p.id === id) ? Math.max(0, DELVE_LIVES - (s.delve.losses[id]?.length ?? 0)) : 0` |
| `fellAt(s, id)` | `s.delve?.losses[id]?.[2] ?? null` |
| `standingIds(s)` | The seated players with `livesOf > 0`, in seat order |
| `isGroupRun(s)` | `(s.delve?.entrants.length ?? 0) >= 2` |
| `compareDelvers(s, a, b)` | Compares the reversed loss lists: fall depth, then the second loss, then the first. Positive means `a` went deeper. |
| `delveStandings(s)` | `{ id, depth, losses, rank }[]` over the seated players. Standing players rank above fallen ones; equal runs share a rank. |

- **`livesOf` must use `?? 0`.** Written as `3 - losses[id]?.length`, a fresh run gives NaN, and nobody could ever lose a life.
- **An id without a seat has 0 lives.** So a kicked player can never count as standing.

### 4.3 Redaction
`publicView` (game.ts:558-566) changes for one case. During a Delve question with `deadline === null`, it also sends:
- `labels` as all null, keeping the count;
- `prompt: null`;
- `groups: []`;

on top of today's blank `itemId`, `options` and `mirrored`.

- **Why.** Without this, the pick broadcasts every option name and the name to find (game.ts:1356-1357, session.svelte.ts:1030) before the art is even prepared. A modified client could read them with no clock running.
- **When they arrive.** The options reach guests in the same state message as the deadline.
- **What stays public.** The ramp is a pure function of depth with no seed, so nothing else is secret. Lives, losses, depth, `pickBy` and the reload grace reach guests verbatim.

### 4.4 Protocol
- **`PROTOCOL_VERSION` goes from 9 to 10** (protocol.ts:7).
  - An old guest would accept a Delve state, because `parseHostMsg` only checks for `players` and `settings` (protocol.ts:99-104). It would then render the game as turns, with no lives.
  - The hello check (session.svelte.ts:577) refuses old guests before any state is sent.
  - If another branch also bumps the version, merge to a fresh number, as 8c24519 did.
- **The ruleset is tied to the protocol.** Guests compute some things from their own constants: the lockout note, the kicker's timer while choosing, the ladder, `delveChange` and the codex tier.
  - Every `DELVE_RULESET` change therefore also bumps `PROTOCOL_VERSION`.
  - `tests/delve.test.ts` pins `[DELVE_RULESET, PROTOCOL_VERSION, hash of the table for depths 1-100]` together. A curve change without both bumps fails the test.
  - Guests read the running question's length from the state (`deadline - clockAt`).
  - Records use `s.delve.ruleset`.
  - A host or hot-seat resume that finds `delve.ruleset !== DELVE_RULESET` lets the run go on with `mixed: true`. It is then never a best, and GameOver notes "finished under newer rules".
- **New `versionProblem(v)` in protocol.ts,** used by `handleHello` (session.svelte.ts:576-577):
  - `v < PROTOCOL_VERSION`: "Your game is out of date. Reload the page to join."
  - `v > PROTOCOL_VERSION`: "The host's game is out of date. Ask them to reload the page."
- **The rollout.** A guest on the new build that joins a host still on version 9 gets the old fixed text, "Your game version is out of date. Please reload the page.", which no reload of the guest can fix.
  - protocol.ts exports it as `LEGACY_VERSION_TEXT`.
  - A guest that receives exactly that text while connecting shows instead: "You and the host are on different versions of the game. Whoever loaded the page earlier should reload."
- **No new guest message or action.**
  - Delve is pick, answer and next, which `parseClientMsg` already accepts (protocol.ts:67-84). The drain clock needs no acknowledgement from guests.
  - `clock`, `expire`, `resumed`, `skip`, `reask`, `restart` and `settings` stay out of the guest whitelist. Sending them gets the peer blocked, as today.

### 4.5 Backward compatibility
- **Old saves.** `delve`, `clockAt` and the new actions are optional or additive, and every reader uses `s.delve?.` or `!!s.delve`.
  - `renameCategories` spreads `...s` (game.ts:183-192), so the field survives a resume.
  - The save key stays `poe2trivia.session.v4`. A pre-Delve save plays exactly as before.
- **Room listing.**
  - The wire format keeps `mode: 'turns'`, plus `delve: true`, an optional `depth` and `v` (section 6.4).
  - Old scanners therefore list a Delve room as Turns instead of dropping it. Dropping would otherwise end their scan early (rooms.ts:161).
  - New scanners treat a listing without `v` as older than 10 (6.4).
- **Prefs.** Stored as `mode: 'turns', delveOn: true`, the same trick as `customOn` (prefs.ts:66-76), so older tabs still parse the entry.
- **Codex.** The format is untouched. Delve answers use existing difficulty keys, and runs live under their own key (section 9).

---

## 5. Engine changes (src/lib/game.ts, src/lib/delve.ts)

| Where | Change |
|---|---|
| `GameMode` (302), `Question` (345-377), `GameState` (398-433), `Action` (435-450) | The types in 4.1. |
| `createGame` (478-499) | Add `delve: null`. |
| `activeRules` (247-250) | `return s.delve ? delveRules(s.round) : rulesFor(s.settings, !!s.deathmatch)`. This one change covers `rollMode` (1255-1260), `tallyMode` (1263-1267), `makeQuestion` (1274) and host grayscale (session.svelte.ts:698). |
| `publicView` (558-566) | Blank `labels`, `prompt` and `groups` while `s.delve && q.deadline === null` (4.3). |
| `settings` action (742-759) | At 750, accept `'delve'`. targetScore, timer, difficulty and custom are still stored in every mode. |
| `start` (760-785) | **When the mode is delve,** after the shuffle at 768: <ul><li>set `s.used = []`;</li><li>set `s.delve = { entrants: seat ids, losses: {}, lastStanding: null, ruleset: DELVE_RULESET, startedAt: now, pickBy: null, pickExtended: false, excused: [], graceUntil: 0 }`.</li></ul> **Otherwise** `s.delve = null`. Solo is already allowed (767). |
| `pick` (786-797) | <ul><li>**History.** In delve, `active.recent = lastPicks([...active.recent, cat], DELVE_MAX_LOCKOUT)` and `pickBy = null`.</li><li>**The pick race.** Outside choosing, the error is silent when `s.delve && s.phase === 'question' && isActive`. A guest's pick that lost the race to `expire` then shows no error toast (today it does, via session.svelte.ts:489).</li></ul> |
| `offerCategories` (1098-1105) | At 1099, exclude `lastPicks(player.recent, s.delve ? delveLockout(s.round) : rulesFor(s.settings).lockout)` instead of the whole `recent`. This is a no-op for turns, where `recent` is already trimmed at 791. |
| `beginTurn` (990-997) | In delve: <ul><li>`pickExtended = false`;</li><li>`pickBy = isGroupRun(s) && s.hostId !== null ? max(now + DELVE_PICK_MS, excusedAndOffline(active) ? graceUntil : 0) : null`.</li></ul> |
| `makeQuestion` (1343-1352) | In delve, `deadline = null`. Veil seconds are never computed, because `rules.veil` is null. |
| `answer` (798-830) | <ul><li>**Before 811:** `if (s.delve && q.deadline === null && action.index !== null)`, throw `ActionError('Too early.', true)` for **every** caller. Hot-seat dispatches from null (session.svelte.ts:948), so guarding guests alone would let a stray digit cost a life.</li><li>**After 816:** `else if (s.delve) this.loseLife(s, active.id)`. This covers wrong answers, `index: null` and late answers (813-814).</li></ul> |
| New `clock` case | <ul><li>Trusted only: `from !== null` throws, like `connection` at 736.</li><li>Requires delve, phase question, `askedAt === q.askedAt` and `q.deadline === null`. Otherwise it is a silent no-op, so a release again after a resume changes nothing.</li><li>`q.clockAt = min(max(at ?? now, now), now + 1000)` and `q.deadline = q.clockAt + delveTimer(s.round) * 1000`.</li></ul> |
| New `expire` case | <ul><li>Trusted only. Requires delve, phase choosing, `pickBy !== null` and `now >= pickBy - 250`; otherwise a silent no-op.</li><li>**Connected active player:** pick a random offered card with the engine's rng, through the same code as `pick`.</li><li>**Offline active player:** `loseLife`, then `advanceDelve`, with no reveal.</li></ul> |
| New `resumed` case | Trusted only, delve. <ul><li>`excused` = the standing seats that are offline now; `graceUntil = now + DELVE_RESUME_GRACE_MS`.</li><li>**If phase question and the active player is offline** (a guest's question; the host is still connected):<ul><li>put the voided options into `used` (as at 862);</li><li>`tallyMode(voided.mode, -1)`;</li><li>pop the active player's last `recent` entry;</li><li>`question = null`, `phase = 'choosing'`.</li></ul>`offered` is still set, because `pick` never clears it. An answer to the old `askedAt` then hits "Too late!" through `lastAskedAt` (805).</li><li>**Then, if choosing:** restamp `pickBy` as in `beginTurn`.</li></ul> |
| `connection` (735-741) | In delve, when a player comes back (`connected: true`): <ul><li>drop them from `excused`;</li><li>if they are the active player while choosing, `!pickExtended` and `pickBy - now < DELVE_REJOIN_MS`, then `pickBy = now + DELVE_REJOIN_MS` and `pickExtended = true`.</li></ul> It never ends or advances a run. |
| `skip` (843-851) | In delve, throw `ActionError('Delve has no skipping.')` for every caller, the host's own id included. |
| `reask` (853-869) | In delve, throw silently once `q.deadline !== null`: a question on the clock cannot be re-rolled. Otherwise unchanged. The new question has `deadline: null` and gets a fresh clock on release. |
| `remove` (703-734) | New branch before 730: <ul><li>`delete losses[id]`;</li><li>drop the id from `excused`;</li><li>clear `lastStanding` if it was them;</li><li>then reuse the turns code at 730-732 (`turn--`, or `advance(s, idx - 1)`, which reaches `advanceDelve`).</li></ul> Removing the last one standing ends the game. Removing the only other standing player makes the remaining one last standing at the round end, because readers go through `s.players` (4.2). |
| `advance` (1060-1091) | At the top: `if (s.delve) { this.advanceDelve(s, from); return; }`. |
| New `advanceDelve(s, from)` | <ul><li>**The walk.** Walk the seats after `from` and take the first with `livesOf > 0`; disconnected seats are not passed over. `wrapped` is set when the walk passes the last seat.</li><li>**No standing seat:** `finish`, with winners `[]` for a solo run, else the top seated players by `compareDelvers`.</li><li>**Wrapped:** if exactly one seated player is standing, `isGroupRun` holds and `lastStanding` is unset, record `{id, depth: s.round}`. Then `s.round++`.</li><li>**Then** `turn = next` and `beginTurn`.</li></ul> It never reads targetScore, so no deathmatch can start. |
| New `loseLife(s, id)` | `if (livesOf(s, id) > 0) { (s.delve!.losses[id] ??= []).push(s.round); player.streak = 0; }` |
| `restart` (870-886) | Unchanged. `createGame` clears `delve`, and `play: true` runs `start`, which clears `used` for a Delve run. |
| `finish` (999-1005), `countStreaks`, `artKey` (1365-1367) | Unchanged, except that `finish` sets `pickBy = null` in delve. |

`src/lib/codex.ts:110-111` (`encounterAt`) changes too: `difficulty: s.delve ? delveTier(s.round) : difficultyOf(s.settings.difficulty)`. This keeps Delve answers from being filed under the room's leftover difficulty.

---

## 6. Session, guard, rooms and prefs

### 6.1 session.svelte.ts

**New pure module `src/lib/delveSession.ts`.** session.svelte.ts imports PeerJS and Svelte runes, so node cannot load it. Every Delve decision the session makes lives here instead, with tests (section 10):

| Function | Decides |
|---|---|
| `clockStart(drainedAt, releasedAt, rtt)` | `Math.min(drainedAt ?? Infinity, releasedAt + DELVE_CLOCK_CAP_MS) + Math.min(rtt / 2, 500)`, with `DELVE_CLOCK_CAP_MS = 3000` |
| `reaskDelay(failures)` | 0, 2000, 5000, then 10 000 ms |
| `mayAutoReask(s, qid)` | True when it is a delve run, the same question is still open, and its deadline is null |
| `expireIn(s, now)` | Ms until `pickBy`, or null |
| `delveSounds(prev, next, me, local)` | The sound list of 8.6 |
| `delveNotices(prev, next)` | "question set aside" after a host reload; "{name} missed their turn and lost a life" after an `expire` that cost a life |

**Media and the clock** (`startMedia`, 688-724; `release`, 750-754)
- **The answering player first.** In delve, `release(m)` sends to the active guest only, and keeps the message in `released`.
- **When the clock starts.**
  - If the active player is this device (the host's own turn, or hot-seat), or is offline: apply `{type:'clock', askedAt: qid, at: now}` from null right after the release.
  - Otherwise, poll that guest's connection every 50 ms for an empty send queue (`conn.bufferSize === 0 && (conn.dataChannel?.bufferedAmount ?? 0) === 0`), at most 3 s. Then apply `clock` with `at = clockStart(...)`.
  - Every step checks that the same question is still open with a null deadline.
- **Then everyone else.** After the clock, send the held media to every other guest with `sendMedia`. Late joiners still get it from `released`, as today.
- **On a host resume** `startMedia` runs again, because `prev` is null at `setState` (1013-1014). `clock` is a no-op when the deadline is already set.
- **Hot-seat** applies the clock right after `release`, because nothing travels.

**Art that fails** (the `startMedia` catch, 700-706)
- Set `artFailedFor` and show the warning as today.
- In delve, if `mayAutoReask(state, qid)`, apply `reask` from null after `reaskDelay(n)`, where n counts the failures this turn. This repeats for as long as the art fails.
- A question whose deadline is set (the host's own question after a reload) is never asked again automatically. It runs out.

**Resume** (`peer.once('open')`, 352-362)
- After marking guests offline: if `s.delve`, apply `{type:'resumed'}` from null. The engine handles the guest question, the excused seats and `pickBy` (section 5).
- The reveal restamp at 361 stays.

**Timers**
- **New `scheduleExpire(s)`,** called from `scheduleTimers` (1149-1166). It runs in host mode, when `s.delve`, phase choosing and `pickBy !== null`.
  - It is keyed by `turnCount` and `pickBy`, so an extension re-arms it.
  - It fires after `expireIn` and applies `expire` from null.
- **`scheduleAutoSkip`** (1192-1219) and **`scheduleIdle`** (1226-1240) return early in delve. `expire` and the question deadline replace both, so neither can take a life during a question.
- **Notices.** On every device, `delveNotices` drives the toasts.

**Getters and entry points**
- New `fallen` getter, next to `spectating` (241-244): not local, `s.delve`, my seat present, and `livesOf === 0`.
- New `startDelve(name)` beside `startLocal` (294-299): `startLocal(createGame(null, { ...DEFAULT_SETTINGS, mode: 'delve' }))`, then dispatch `join` with `crypto.randomUUID()` and `name`, then `start`.

**Records**
- **New `noteRun(prev, next)`,** called after `noteEncounter` in `setState` (1011). It uses the pure `runEvent` from delveRecord.ts.
  - It records this device's run when its own player falls: online, my seat; in hot-seat, only when the run has one entrant.
  - It records at the moment of the fall, because a fallen guest may close the tab before `over`.
  - It patches `won` at `over`, deduping by `delve.startedAt`.
  - It sets `session.delveRecord = { depth, previousBest }`, and caches `bestAtStart` (solo or group, current ruleset) when a run starts.
- **Unfinished runs.** On `closed` (880-881), on giving up the reconnect, on leaving a run mid-way, and when the host leaves its own run: if my seat is still standing, record the run as `end: 'unfinished'` at the current depth.
  - The notice adds "Your run was saved as unfinished at depth {N}."
  - Upsert by id means a later fall in the same run, after the host comes back, replaces it.

**Sounds.** `onNewState` (1103-1147) gets a Delve branch that plays `delveSounds` (8.6).
- Until 8.6 ships, the interim is:
  - a life lost plays 'wrong';
  - `over` plays 'victory' for me in `winners`, or for a solo run with a new best;
  - otherwise `over` plays 'defeat', including hot-seat solo (1122-1123 always plays 'victory' today).

### 6.2 protocol.ts
`PROTOCOL_VERSION = 10`, `versionProblem(v)` and `LEGACY_VERSION_TEXT` (4.4). `parseClientMsg` is unchanged.

### 6.3 guard.ts
**No change.** Delve adds no guest message, so the frame size and rate limits (guard.ts:12-98) and the message limit (session.svelte.ts:444) apply as they are. `tests/guard.test.ts` gains a check that PeerJS's binary connection still exposes `bufferSize` and `dataChannel`, which the drain clock reads.

### 6.4 rooms.ts → new src/lib/roomInfo.ts
- **Move `RoomInfo` and `parseRoomInfo`** (rooms.ts:14-54) into `src/lib/roomInfo.ts`, importing `./game.ts` and `./names.ts`.
  - rooms.ts imports `peerjs` and `./peer` without a `.ts` extension (rooms.ts:9-12), so node tests cannot load it.
  - rooms.ts re-exports the moved names.
- **Wire format** from `roomInfo()` (session.svelte.ts:1065-1080):
  - `mode: 'turns'` and `delve: true`;
  - `depth: s.round` while a run is on;
  - `v: PROTOCOL_VERSION`.
  - The stored difficulty and target are still sent, so old parsers accept the listing.
- **New parser rules:**
  - `delve = r.delve === true || r.mode === 'delve'`;
  - parsed `mode = delve ? 'delve' : r.mode`;
  - `depth` must be an integer from 1 to 9999, otherwise it is dropped and the room kept;
  - `v` is optional, and a listing without it counts as older than 10.
  - OpenRooms shows "Older version" for an older or missing `v`, and "Reload to join" for a newer one, instead of Join.

### 6.5 prefs.ts
- `serializePrefs` (66-76): when `mode === 'delve'`, write `mode: 'turns', delveOn: true`.
- `parsePrefs` (38-64): `mode: o.delveOn === true ? 'delve' : o.mode`, still requiring `o.mode` to be turns or race (51).
- `prefsFrom` (148-157): keep `'delve'`.
- Delve never changes target, timer or difficulty, so the saved values are written back as they were.
- An older tab reads the entry as turns, and its next write drops `delveOn`. That is acceptable.

---

## 7. UI (checked at 375 px wide; the question also at 375x667)

**Numbers.**
- Standalone depth figures use `--font-cinzel`: the header, the kicker, the phone badge, the standings column, the milestone card, Home and Codex.
- Text set in the display font gets Cinzel digits by itself, because Maragsâ leaves out 0-9 and the stack falls through to Cinzel (app.css:9-20, 43). This covers the banner and the GameOver headline.
- Numbers inside body-font sentences stay in EB Garamond, like every existing result line and sub line.

**Lobby.svelte**
- **Mode cards** (256-276, CSS 676-726):
  - A third card, Delve, spans both columns at every width (`grid-column: 1 / -1`), so the 2-column grid and the 375 px layout stay as they are.
  - It reads `<b>Delve</b>` and "Three lives. One depth deeper each round, and harder. Last one standing." It is enabled in hot-seat.
  - Fix "Take turns" to `class:on={s.settings.mode === 'turns'}` (259); today `!race` would light it in Delve.
  - `setMode` (98-100) passes `{mode}` for delve.
- **Hidden in delve:** Points to win, Difficulty with its blurbs, and Time per question (278-330). The custom editor must not open (360).
- **The ladder.** New `DelveLadder.svelte`, shared with the Home intro card, takes their place at about the same height (the panel avoids height jumps, 311).
  - Five rows in two columns: the depth in `--font-cinzel`, then one line in the body font, with no bullet:
    - 1: Four options, 20 seconds
    - 13: Look-alike and made-up names
    - 25: Eternal; grayscale, mirrored
    - 41: Longest lockout, 10 seconds
    - 61: The abyss; 5 seconds
  - Under the rows, a muted line: "About 4 minutes alone for most players; about 4 minutes per player together."
- **Rules list** (332-347): a third branch with no static lockout and no target.
  - "On your turn, choose one of three item categories."
  - "Everyone has three lives; a wrong answer, running out of time or missing your turn while disconnected costs one."
  - "Each round takes you one depth deeper: less time, longer lockouts, harder questions."
  - "The last one standing wins and keeps delving to their last life. Alone, see how deep you get."
  - Line 126 stops reading `rulesFor(s.settings)` in Delve.
- **Start button:** "Begin the descent".

**App.svelte header** (145-175)
- On the game **and over** screens in delve, the header reads `Room CODE • Depth N` online, or `Delve • Depth N` in hot-seat. Today the over screen falls through to "Hot-seat" (170-171).
- It is all Cinzel already (370-382). At 0.66 rem it is about 165 px, inside the roughly 190 px phone column (575-590).
- Depth colour: `color-mix(in srgb, #b9cff0 calc(var(--blue) * 100%), var(--gold-hi))`, with `--blue = descent(depth).blue`.

**Scoreboard.svelte**
- **Desktop.** In delve the `.bar` (209-211) becomes `.lives`: three 7 px ember pips with a 5 px gap.
  - The CSS is from the descent note: a radial gradient `#fff3d2` → `#ffb35c` → `#c4561c`.
  - `.spent` is a hollow ring; `.last` gutters.
- **Phones** (545-654):
  - **Other pills keep today's 18 px badge** (616-630). It shows the lives left as an ember-coloured digit (`#ffb35c`, badge border tinted to match), which stays readable at arm's length, unlike 4 px dots.
  - **A fallen player's badge** shows the fall depth in grey `#9a8f80`, and the pill gets `.fallen`.
  - **The active pill** shows three 6 px pips. Spent pips are not drawn, so 2 and 3 lives never look alike.
- **Fallen players** get `.fallen` (opacity .45, grayscale .85), extending `benched` (190-193).
- **Accessibility:** `aria-label` "{n} lives left" or "Fell at depth {n}".
- **Streak fire stays.** Blue means "hottest" in both places.

**Game.svelte**
- **Banner** (95-97, 138-142):
  - In a one-entrant run the title is "Depth N". Today, because Delve alone runs in local mode, it would read "{name}'s turn" at every depth.
  - Group runs keep "Your turn" / "{name}'s turn".
- **Kicker,** above the banner h2 in its own element (the h2 is nowrap). Cinzel 0.72 rem, allowed to wrap.
  - Group runs: "Depth 13 • 17 s". Solo: "17 s".
  - On the first depth of a stratum, plus the change from `delveChange`, e.g. "• Look-alike and made-up names".
  - For the survivor: "Last one standing • Depth 30".
  - The seconds come from `deadline - clockAt` once the clock runs, and from `delveTimer(s.round)` while choosing.
- **Turn notices** (153-163) are replaced in delve by one line for every device, read from the state with `session.hostNow()`, with no buttons. In the body font, with semicolons:
  - excused and offline: "Waiting for {name} after the host's reload; {n}s left."
  - offline: "{name} is disconnected; they lose a life in {n}s."
  - connected, last 10 s: "A card is chosen for {name} in {n}s." (The active player sees their own line in ChooseCategory.)
- **Waiting lines.** The fallen get "You fell at depth {N}; watching." in place of the spectator line.
- **Phones, during a Delve question:** the banner and kicker collapse, and the turn's scroll-to-top (47) is followed by QuestionView's own scroll (below).
- **Milestone and last-standing card:** see 8.5.

**ChooseCategory.svelte**
- `lockout` (17) becomes `activeRules(s).lockout`.
- The note (193-197) keeps `lockoutText`, which now grows with depth.
- **Countdown:** in the last 10 s before `delve.pickBy`, the note reads "A card is chosen for you in {n}s".
- There are always 3 cards (3.3), so the 3-column grid (153) needs no 2-card case.

**QuestionView.svelte**
- **Hidden until the clock starts.** In delve, `ready` becomes: the clock has started (`q.clockAt !== undefined`), and every picture is in.
  - For an art question that means `Object.keys(media.options).length === q.labels.length`; today it is true at the first tile (289).
  - For a name question it means the art is in.
  - Until then a "descending" placeholder (the art loading rune) stands in for the art, prompt, options and tiles.
- **Keys.** `onKey` (377-383) and `answer()` do nothing until `ready`, so a stray digit right after the pick cannot answer an unseen question.
- **Faster entrance** from 3.3 (538, 633).
- **Phones (the existing 640 px rules):**
  - When the question becomes ready, scroll its head to just under the sticky strip (`scrollIntoView`, with `scroll-margin-top` set to the strip height).
  - 8 tiles: 3 columns, 108 px tall (about 340 px for all of them).
  - 8 names: two columns, with labels wrapping to two lines at a 52 px minimum height. Art at `clamp(120px, 20svh, 160px)`.
  - The target: head, art and every option visible without scrolling at 375x667, with the timer in the sticky strip. This is checked before ruleset 1 is frozen (3.3, open question 7).
- **Result lines** (443-468), in EB Garamond with semicolons, not bullets:
  - right: "{X} delves on."
  - wrong: "{X} loses a life; {n} left."
  - timeout: "{X} ran out of time; {n} left."
  - last life: "{X} falls at depth {N}."
  - "You" replaces the name for your own seat online, and for the only player of a one-entrant run, including hot-seat, where `myPlayerId` is null (session.svelte.ts:182, 948).
- **Verdict** (48-54): a last-life miss reads "Fallen" in the bad tone.
- **No score fill.** `fill` (333-352) is `undefined` in delve, so no stream runs into a target bar and no 'fill' sound plays.

**TimerRing.svelte**
- `deadline: number | null`. Null shows a full, still ring with `total` and no ticks, until the clock starts.
- New `warnFrom` prop, replacing the hard-coded 5 at 24 and 39. In delve it is `max(3, min(5, round(total * 0.35)))`, so short timers are not urgent for the whole question.
- In Game.svelte (100-104):
  - `total = round((deadline - (q.clockAt ?? q.askedAt)) / 1000)`, or `delveTimer(s.round)` while the deadline is still null;
  - the ring also renders when the deadline is null in delve.
- In delve, its track takes the depth tint (8.4).

**GameOver.svelte**
- **One `lost` flag in delve:**
  - solo: `lost = !newBest`;
  - group, online: `lost = !(I am in winners)`;
  - hot-seat group: `lost = false`.
  - It feeds `victory(..., lost)` (46), the crown's `strength` (145) and the 2D sparks (51-52), which are skipped when lost. Today the sparks ignore losing, and `iLost` is always false in local mode (39-41).
- **Solo:**
  - kicker "Delve";
  - headline "Depth N";
  - sub line "Your deepest yet." on a new best, else "Your best is depth {M}.";
  - "Finished under newer rules." for a `mixed` run.
- **Group:**
  - kicker "Last one standing" when the winner is `lastStanding`, else "Delve";
  - headline "You delved deepest!" or "{name} delved deepest!";
  - on a shared win, "{a} and {b} share the win";
  - sub line "Fell at depth N; last one standing from depth M."
  - **Ties:** when the top fall depth is shared and a tiebreak decided, the sub line reads "Tied at depth 20; {X} lost their second life later (17, against 12)." Tied rows show a muted second line, "lives lost at 9, 17, 20".
- **`winner`** (19) comes from `winners[0]`, or the player for solo. It never falls back to the top scorer in delve.
- **Standings** (18, 158-167): by `delveStandings`, with ties sharing a rank. The right column shows the depth in Cinzel.
- **Crown:** the ArcaneCircle colour is gold below depth 25, then mixed toward cold steel `#a9bfdc` by `descent(depth).blue`. That is a state tint, which docs/arcane-style.md allows. No text goes inside the circle.
- **Share.** A "Share depth" button, using the Lobby invite pattern (Lobby.svelte:80-93): `navigator.share` on coarse pointers, otherwise the clipboard.
  - Solo text: "I reached depth 34 in Delve, alone (ruleset 1). poe2.quest"
  - Group text: "I fell at depth 34 in a 4-player Delve (ruleset 1). poe2.quest"
  - Below it, a small muted "Ruleset 1".
- **Actions:** "Change settings" (173) reads "Back to lobby" in delve.

**Home.svelte**
- Under the "or" divider (212-215), a row of two buttons:
  - "Delve alone" calls `needName()` (43-56) and then `session.startDelve(name)`;
  - "Play hot-seat" is the existing action.
  - They sit side by side above 560 px and stack below it, matching `.modes` (645-648).
- "Delve alone" shows "Deepest {N}" in Cinzel once a solo record exists under the current ruleset. The record store is lazy-loaded the way the codex count is (35-40).
- **Intro card.** A small "How Delve works" link opens it: kicker "Delve", three lines (three lives; each depth is harder; the lockout grows), `DelveLadder`, and a "Begin" button.
  - The card also shows once before the first "Delve alone" run.
  - It is remembered in localStorage (`poe2trivia.delveIntro`); every access is wrapped in try/catch, and the card simply shows again when storage fails.
  - Without it, Delve alone skips the lobby, the only place the ladder and rules appear.

**OpenRooms.svelte** (126)
- A running run: "Delve • depth 7 • 2 watching". In the lobby: "Delve • three lives". No difficulty or target.
- A version mismatch, or a listing without `v`, shows "Older version" or "Reload to join" instead of Join (6.4).

**difficultyText.ts**
New `delveChange(stratum)` gives the one-line change at each stratum start:

| Stratum | Change line |
|---|---|
| 2 | Find the art |
| 3 | Six options |
| 4 | Look-alike and made-up names |
| 5 | Eight options |
| 6 | All look-alikes |
| 7 | Grayscale art, mirrored pictures |
| 8 | Three made-up names |
| 9 | All grayscale |
| 10 | Always mirrored |
| 11 | Longest lockout |
| 12 to 15 | Less time |
| 16 | Five seconds |
| Bottomless milestones (81, 101, ...) | The rules change no more; the dark goes on. |

The ladder rows use these strings too. No em dashes.

---

## 8. The descent: backdrop, embers, scene, moments, audio

### 8.1 The depth channel (new src/lib/descent.ts)

**Thresholds,** aligned to the gameplay strata (Appendix A, item 10):

```ts
export const RED_FROM = 5, RED_FULL = 21;
export const VEINS_FROM = 17, VEINS_FULL = 25;
export const BLUE_FROM = 25, BLUE_FULL = 41, BLUE_FIRST = 0.15;  // first blue at the Cold Fire
export const ABYSS_FROM = 49, ABYSS_FULL = 61;
export function descent(depth: number): Descent   // {deep, agit, red, blue, surface, veins, abyss}
//   deep = 1 - exp(-(d-1)/18); agit = 1 - exp(-(d-1)/20); surface = min(1,d)·exp(-(d-1)/3);
//   blue = d < BLUE_FROM ? 0 : BLUE_FIRST + (1 - BLUE_FIRST)·smoothstep(BLUE_FROM, BLUE_FULL, d);
//   red/veins/abyss = smoothstep over the ranges above; all 0 at depth 0; NaN → 0.
export const MILESTONES: { depth: number; name: string }[]; // 13, 21, 25, 41, 61; stratumAt(d) adds 81, 101, ... "The Bottomless Dark"
```

- **The Cold Fire is visibly blue.** With a plain smoothstep, blue would be exactly 0 at 25, and cold embers would only show around 29-30.
- The step to .15 at 25, together with the immediate recolour in the stratum moment (8.3), turns about one ember in seven blue the moment the Cold Fire is named.

**The eased channel**
- `setDescent(depth)` sets the target and notifies `onDescent` listeners (used by the CSS fallback and the chrome tint).
- `stepDescent(dt, out)` eases with `step = min(|diff|, max(|diff|·(1 - exp(-dt/1.6)), 0.4·dt))`:
  - one depth takes about 2.3 s;
  - 0 to 40 takes about 8.2 s.
- It writes `uDeep = (deep, red, blue + 0.25·abyss, surface)` and returns `'moving' | 'lit' | false`, like `stepMood` (lights.ts:121-143).

Values at sample depths:

| Depth | deep | agit | red | blue | veins | abyss | Ambience low-pass |
|---|---|---|---|---|---|---|---|
| 1 | 0 | 0 | 0 | 0 | 0 | 0 | 5011 Hz |
| 13 | .49 | .45 | .50 | 0 | 0 | 0 | 2599 |
| 25 | .74 | .70 | 1 | .15 | 1 | 0 | 1855 |
| 33 | .83 | .80 | 1 | .58 | 1 | 0 | 1633 |
| 41 | .89 | .86 | 1 | 1 | 1 | 0 | 1505 |
| 61 | .96 | .95 | 1 | 1 | 1 | 1 | 1364 |

Everything saturates, so depth 1000 equals depth 100.

**Owner: App.svelte, not Game**, because App also covers the over screen:

```ts
$effect(() => {
  const d = gs?.delve && (screen === 'game' || screen === 'over') ? delveDepth(gs) : 0;
  setDescent(d);
  depthAmbience(d);
});
```

- Game over holds the depth, so a screenshot shows how deep you got.
- Play again rises back to depth 1.
- The lobby and home return to 0.

### 8.2 Backdrop shader and uniforms (src/lib/backdrop.ts)

**SMOOTH** (35-135; half resolution and RGBA16F, so cheap and band-free) gets `uniform vec4 uDeep;`:
- **Base stops** (75-77) mix by `uDeep.x`:
  - top: rgb(13,11,9) → rgb(8,8,10)
  - middle: rgb(8,7,6) → rgb(4,4,6)
  - bottom: rgb(13,9,7) → rgb(7,6,9), plus a further mix toward rgb(6,8,13) by `0.6·min(1, uDeep.z)`
- **Bottom glow** (85): colour `mix(rgb(140,60,20), rgb(118,26,14), uDeep.y)`.
- **New azure floor glow,** gated `if (uDeep.z > 0.0)`: rgb(34,80,150) at `uDeep.z · 0.24 · gauss`, centred at (0.5 W, 1.16 H).
- **Surface rays** (108, 124): gate on `rk = uHome.x + 0.5·uDeep.w` and multiply the beams by `rk`. This reuses the start page's beams as daylight from the mine mouth, only up to about depth 10.

**draw()** (712-784), with `dsc = currentDescent()`:
- top haze: `uTop.y *= (1 - deep)^1.5`
- heat below:
  - `uBottom.x *= 1 + .15·deep`
  - `uBottom.y *= (1 + .4·deep)(1 - .85·blue)`
- central lamp:
  - `uGlow.x *= 1 - .2·deep`
  - `uGlow.y *= 1 - .3·deep`
- **Smoke:** `uBlobColor` is uploaded every frame on `soft` (today it is uploaded once at 606-610):
  - warm blobs 0 to 3: colour × `mix(1, (.55,.50,.62), deep)`, opacity × `1 + .35·deep`;
  - blobs 0 and 1 also mix toward rgb(30,62,115) by `.55·blue`;
  - shadow blob 4: opacity × `1 + .45·deep`.
- **Vignette** (162, 291): `uVignette` grows from vec2 to vec4; it is still one row.
  - Line 291 divides by `uVignette.xz`.
  - Upload `((1 - .06v)(1 - .2 deep), (1 + .07v)(1 + .2 deep), (1 - .06v)(1 - .08 deep), 0)`, so the side walls close in more than the top.
- **Integrated scene clock.**
  - `sceneMs += dt·1000·(1 + .5·(fxActive() ? agit : 0))` is advanced in `frame()`. It replaces absolute ms for breathing and blobs (716-722, 734, 741).
  - Smoke churns up to 1.5x faster with no phase jumps.
- **`frame()`** (828-855):
  - calls `stepDescent` beside `stepMood` (834);
  - ORs its `'moving'` into **`soft`** (843), not into `changed`. Desktop then redraws while the scene eases, phones keep the 30 fps cap for easing (comment at 838-842), and reduced motion still draws until settled through `(reduceMotion.matches && !soft)` (851).
  - `uDeep` is set through `S('uDeep')` on `soft`; in non-split mode that is the same program.

**Budget**
- Worst case (9 elements, no float target): 222 → 223 of the 224 guaranteed rows.
- Anything added later must first drop `maxElements` to 8 on low-limit GPUs (531).

**Banding.** All depth work happens before the UI shadows and fills (line 310 onward) and before the dither (426-430).

### 8.3 Embers (src/lib/backdropEmbers.ts, ember loop backdrop.ts:264-276)

**New channel `embers.descend(d)`,** called every frame. It never touches `stoke`, `tint` or `swarm`, which `calmScene()` and `victory()` reset (moments.ts:557-563, 641-645).
- `heat target = calm ? 0 : max(stoke, .5·agit, flare)`: rise speed up to 1.77x, size +12%, glow +40%.
- `crowd target = calm ? 0 : max(swarm, .6·agit)`: 36 → about 75 embers on desktop, 36 → about 50 at 375 px.

**Agitation** is eased at `1 - exp(-1.5 dt)`, and each term has its own integrated clock:
- flutter `j += dt(1 + 1.5a)`, amplitude `a·(1.5 + 1.2 size)` px;
- draft `g += dt(.2 + .35a)`, with `gust = a·42·(.65 sin(g + 1.3) + .35 sin(2.3g))` px applied as `+ gust·u`;
- sway amplitude ×(1 + .7a);
- flicker depth .22 → .42.

**Warm colour:** the halo target is `mix(calm ? CALM : colorTarget, [1, .30, .07], .6·red)`. This applies even when calm, because colour is part of the scene.

**Blue, ember by ember**
- Each ember gets a fixed `coldGate`. When its `u` wraps, `cold = blue > coldGate`, so normally only fresh embers change colour.
- **`embers.recolor()`** sets every ember's flag at once. The stratum moment calls it from depth 25 on, and it also runs on mount. So the Cold Fire shows its first blue at once instead of over the 7-21 s ember periods (backdropEmbers.ts:24), and a rejoin deep in a run shows the right mix.
- Cold is stored as a negative size. The shader uses `e.z * e.z` (backdrop.ts:271), and binning (146) uses `abs`.
- New shader lines:
  - `bool cold = e.z < 0.0;`
  - `tint = cold ? vec3(.34,.62,1) : uEmberColor.rgb;`
  - `hot = cold ? mix(tint, vec3(.86,.94,1), .62) : mix(tint, vec3(1,.86,.6), .55)`
  - Without this, blue embers would keep the warm core and look grey.
- Cold embers are `1 + .35·abyss` brighter, so their cores clip to blue-white.

**Azurite glints:** `VEINS = round(6 + 8·min(1, w/1100))` stationary cold points (9 at 375 px).
- Placed at x in [.03, .22] ∪ [.78, .97] and y in [.12, .90].
- They fade in by `veins` and twinkle on their own clock.
- Slot pressure measured at depth 70: 1 dropped placement in 634k at 375 px, against 20 dropped in a deathmatch today. `SLOTS` and `COLUMNS` stay as they are.
- On phones they sit mostly under the question's opaque fills. The depth also reaches the chrome that stays visible (8.4).

**Reduced motion:** embers are not stepped (backdrop.ts:845). On `'moving'`, call `step(0, ..., snap = true)` so colours, cold flags and glints (static at .45) still update.

### 8.4 Fallbacks and gating

| | WebGL | Effects off | Reduced motion | No WebGL2 (CSS, Background.svelte) |
|---|---|---|---|---|
| Scene colours, vignette, rays, smoke colour | eased | yes | eased, then still | `--deep`, `--blue`, `--agit` on `.bg` via `onDescent`; layers `.deep`, `.azure` and `.walls` cross-fade by opacity over 4 s (no `@property` needed) |
| Ember colour | per ember at respawn, all at once on `recolor` | yes | snapped | 22 CSS embers; the first `round(22·blue)` take `#9cc8ff`, the rest `#ffb35c` |
| Ember speed, count, flutter, smoke speed | yes | calm | frozen | `animation.updatePlaybackRate(1 + .5·agit)` (no restart jump) |
| Glints | twinkle | twinkle | static | none |
| Chrome tint: pinned strip and dock (`--pinned-bg`, `--pinned-line`), timer ring track | yes | yes | yes | yes |
| Moments, life heartbeat | yes | no | no | no |
| Card, pips, header, ambience | yes | yes | yes, without animation | yes |

- **Depth colours stay on with effects off.** Depth is game information, like the header.
- **The chrome tint** mixes the pinned line and the ring track toward cold steel `#a9bfdc` by `blue`, and darkens `--pinned-bg` slightly by `deep`. On phones these stay on screen during a question, when the backdrop is mostly covered.
- **Player-coloured banner rules keep their colour.**

### 8.5 Moments (src/lib/fx/moments.ts; all no-ops when `!fxActive()`)

Game.svelte runs `$effect` on depth with a `seen` guard, so nothing replays on mount or rejoin. A milestone replaces the ordinary descent.

| Moment | When | Parameters (descent note) |
|---|---|---|
| `descend()` | Each depth change | 18 grit particles, budgeted; `backdropEmbers.flare(.4, 1.4)`; `shakeView(.12, 3)` |
| `stratum(title, cold)` | Milestone depth; cold from depth 21 | <ul><li>ring, flash, flare and glints;</li><li>70 floor embers in portal or ember colours;</li><li>a light from below (radius H·.75);</li><li>`flare(.85, 2.4)`; `shakeView(.45, 7)`;</li><li>from depth 25 on, also `embers.recolor()`.</li></ul> |
| Milestone card | With `stratum` | <ul><li>A Game.svelte overlay, `use:portal={'dim'}`, pointer-events none, 2.4 s.</li><li>Background: flat `rgba(10,7,4,.7)`, or cold `rgba(4,6,10,.72)`.</li><li>Contents: kicker "Depth" in `--font-display`; the number in `--font-cinzel` 900 at `clamp(3.4rem, 17vw, 6.5rem)`; the name, then the `delveChange` line (the bottomless line from 81 on).</li><li>It shows during choosing and does not block the pick.</li></ul> |
| Last-standing card | First time `delve.lastStanding` appears | The same card: avatar plus "Last one standing", keyed on `lastStanding.depth` |
| `lifeLost(pip, last)` | Lives drop, 1 or more left | <ul><li>flash, puffs, falling sparks, a ring, a light;</li><li>with `last`: `edgeGlow(C.crimson)` and `pulseMood(.3)`;</li><li>fired 0.5 s after the drop (the `land()` pattern), so the pip goes out at the same time.</li></ul> |
| Last-life heartbeat | Your turn begins while you are on your last life | `pulseMood(.25, [.8,.12,.06])`, a single pulse that fades out |
| `fallen(pill)` | Lives drop to 0 | ash shards and embers, a crimson ring and light, edge glow, `pulseMood(.4)`, `shakeView(.55, 8)` |
| `deeperThanEver(title)` | First depth this run above `bestAtStart`, record holder's device only | gold rays, glints and sparks, a light; a "Deeper than ever" line under the kicker for that turn |

- **Triggers.** Life moments fire on a drop in `livesOf`, not on a reveal, so an `expire` while choosing also shows.
- **No held Delve mood.** A steady crimson (or ash) tint over the whole frame (backdrop.ts:294-300) would sit over the blue deep for minutes, because strong players spend depths 25 to 45 on their last life. So the last life and the fall use pulses only, and there is no new mood owner. `victory` and the deathmatch keep theirs (moments.ts:555).
- **Event lights** keep their warm colours. Warm light against the cold deep is the intended contrast.

### 8.6 Audio (src/lib/sound.ts, src/lib/soundDesign.ts)

**New moments** are built from files that are already preloaded, so there are zero new bytes and CREDITS.txt does not change. Each layer is `file gain rate delay hp lp send`.

| Moment | Layers |
|---|---|
| descend | layer-sub-2 -31 .62 0 20 420 .6; layer-air-4 -40 .7 60 200 1600 .7 |
| stratum | defeat-5 -25 .6 0 40 3200 .85; layer-sub-2 -20 .55; layer-air-4 -30 .8; layer-metal-2 -38 .5 250 |
| lifeLost | wrong-3 -32 .82; layer-sub-5 -28 .85; burn-fuse -38 .55 180 |
| lastLife | the lifeLost layers, plus a heartbeat of two tick-3 layers (-15 .88 650 and -17 .88 1000) |
| eliminated | defeat-4 -16 .72; layer-sub-2 -21 .7; wrong-3 -34 .8 |
| record | correct-7 -19 .92; layer-metal-2 -34 1.35 120; layer-air-3 -34 1 |
| runOver | layer-air-4 -30 .6; layer-sub-5 -31 .7 300 |
| descendTurn | the 'yourTurn' layers, plus layer-sub-2 -31 .62 0 20 420 .6 |

Every new name joins the `Sfx` union (sound.ts:9-26) and `MOMENTS` (soundDesign.ts:30).

**Delve sounds** (`delveSounds`, played from `onNewState`, session.svelte.ts:1103-1147):
- **Entering choosing:**
  - **Solo** (one entrant): 'stratum' on a milestone, otherwise 'descend' on every depth. You are always the one playing, so no second cue.
  - **Group, my turn** (or hot-seat with several seats):
    - 'descendTurn' when the depth just changed;
    - 'stratum' and then 'yourTurn' 600 ms later on a milestone;
    - otherwise 'yourTurn'.
    - The first seat starts every round, so replacing its 'yourTurn' with 'descend' would leave that player without a turn cue for the whole run.
  - **Group, someone else's turn:** 'stratum' or 'descend' when the depth changed, otherwise 'turn'.
- **Reveal:** right plays 'correct'.
- **Lives drop** (on a reveal or an `expire`), by the lives left:
  - 2 plays 'lifeLost';
  - 1 plays 'lastLife';
  - 0 plays 'eliminated'.
- **`over`:**
  - I am in `winners`, or my solo run set a new record: 'victory';
  - otherwise 'runOver'.
  - So nobody hears a second toll right after 'eliminated'.
- **Mid-run record:** 'record', alongside `deeperThanEver`.

**`depthAmbience(depth)`** follows the `fireAmbience` pattern (sound.ts:229-280):
- The parameters live in module state. They are applied when a loop is built, and with `setTargetAtTime(..., 2.5)` when the depth changes.
- `Playing` keeps `{src, gain, lp, send}` (220).
- On amb-6:
  - low-pass `5011·(1300/5011)^deep`;
  - `playbackRate 1 - .16·deep`;
  - gain `-44 + 5·deep` dB;
  - a new send to `bus.wet` at `.4·deep`.
- Retype `Bus.wet` as `GainNode` (77).

**New RUMBLE loop, generated** (not a file), so it needs its own code path beside the file-based `Loop`:
- 6 s of brown noise with a 0.5 s crossfade at the loop point.
- Chain: highpass 28 Hz → lowpass 180 Hz → a 0.06 Hz LFO gain → gain.
- Level `-64 + 26·deep + 3·blue` dB.
- Wanted when not muted, the tab is visible and depth > 0. Fades up in 2.5 s and down in 1 s.

Tune all levels by ear on phone speakers.

---

## 9. Codex and best depth

**Answers**
- `encounterAt` (codex.ts:106-129) files Delve answers under `delveTier(s.round)`: strata 1-3 Cruel, 4-6 Merciless, 7 and deeper Eternal. This follows the precedent of harder deathmatch questions filed under existing keys (codex.ts:111).
- Delve answers already count through the turns branch (121): your own seat online, and hot-seat only with one seat. A timeout counts as wrong.
- `CODEX_VERSION` and the codex blob do not change. A bump would wipe codexes (197), and new fields would be dropped by older tabs (199-218).

**New `src/lib/delveRecord.ts`,** key `'poe2trivia.delve'`:
- **Shape:**
  - `{ v: 1, bests: Record<string, DelveRun>, runs: DelveRun[] }`;
  - bests are keyed `"{ruleset}:solo"` and `"{ruleset}:group"`;
  - runs are capped at 20;
  - `DelveRun = { id: startedAt, at, depth, players, won, ruleset, end: 'fell' | 'unfinished' | 'mixed' }`.
- **Only `end: 'fell'` runs can be bests.** Unfinished and mixed-rules runs are listed but never compared.
- **Patterns copied from codex.ts:178-260:**
  - parse defensively and drop malformed runs;
  - load fresh before every write;
  - wrap every access in try/catch;
  - upsert by `id`;
  - `bests` survive trimming of `runs`.
- **Exports:**
  - `bestDepth(kind: 'solo' | 'group', ruleset = DELVE_RULESET)`;
  - `recordRun(run): { previousBest }`;
  - the pure `runEvent(prev, next, me, hotSeat)`, which tells `noteRun` when to write.

**What counts**
- Solo runs (one entrant, online or hot-seat) and your own seat in an online group count. Hot-seat with several seats does not.
- **Solo and group are kept apart** (2.7). `players` is stored so the Codex can label each group run.
- **Home** shows the solo best under the current ruleset only, so "Deepest 34" is never ambiguous after a ruleset bump.

**Codex.svelte**
- A new "Delve" band between the summary (174-224) and `.split` (235):
  - the deepest solo depth as a `.stat-value`-style Cinzel number, with its date;
  - the deepest group depth beside it, with "{n} players";
  - the last 10 runs as small depth bars, unfinished ones hollow;
  - "under older rules" for bests from earlier rulesets.
- It is a single column at 560 px or less.
- It loads the store and reloads on its own key in the storage listener (17-25).
- It shows even in the empty-codex branch (226) when runs exist.
- **Erase codex** (436-466) erases Delve records too, and its dialog text says so. One "erase my history" action is less surprising.

---

## 10. Tests to add

**New `tests/delve.test.ts`** (pure ramp and readers):
- Every knob is on `KNOB_STEPS`, and fakes never exceed `maxFakes`.
- Options never exceed 8.
- Lockout never decreases and never exceeds 7.
- The timer is an integer, never increases and stays at least 5.
- Strata change exactly at 4k+1.
- `delveTier` boundaries.
- Finite results for depth 0, 1e6 and NaN.
- **Lives:**
  - `livesOf` is exactly 3 for every seat of a fresh run (`losses: {}`), and 2 after one loss;
  - 0 for an id with no seat, and 0 outside a run.
- `compareDelvers` and `delveStandings`: consistent, ties share a rank, depth 1000 is fine, and only seated players appear.
- **The ruleset pin:** `[DELVE_RULESET, PROTOCOL_VERSION, table hash for depths 1-100]` equals the pinned tuple.
- **The offer invariant** against items.json: `engine.categories.length - OFFER_COUNT >= DELVE_MAX_LOCKOUT`.

**`tests/game.test.ts`, new Delve block.** Helper `setupDelve(names, seed)` uses `targetScore 1`, `timer 0`, `difficulty 'eternal'`, so the tests prove Delve ignores them.
1. **Mode.** Delve is accepted, the knobs are stored and come back after switching to turns, and an unknown mode is still ignored.
2. **Start.** A run starts with 3 lives each, depth 1 and an empty `used` (turns keeps `used`); `activeRules` ignores `settings.difficulty`. The first wrong answer leaves 2.
3. **Question shape.** At depths 1, 13, 25 and 61, the option count, fakes and grayscale match `delveRules`.
4. **The clock.**
   - The deadline is null until `clock`; then `deadline - clockAt === delveTimer(depth) * 1000`.
   - `at` is clamped to [now, now + 1000].
   - A second `clock` and a stale `askedAt` change nothing.
   - `clock` from a guest throws.
   - An answer with an index before `clock` throws silently, from a guest **and** from null.
5. **Answers.** Wrong and `index: null` cost a life; right adds to score and costs nothing; a late answer, using the `now` option as at tests 680-695, costs a life.
6. **Solo end.** Losses at depths [2, 4, 7] give `over`, `winners = []`, `fellAt = 7` and `round = 7`.
7. **Last one standing.**
   - It is named only after the round ends.
   - The survivor keeps delving and is the only winner.
   - Losses [1,2,5] lose to [3,4,5].
   - Identical runs share the win.
8. **No deathmatch** ever starts, even at target 1 with everyone right.
9. **No skipping; expire.**
   - `skip` throws in Delve from the host's id, from a guest and from null.
   - `expire` before `pickBy` is a silent no-op.
   - At `pickBy`, a connected player gets one of the offered cards and loses no life.
   - An offline player loses a life with no reveal, and their streak goes to 0.
10. **Choice budget.**
    - `pickBy` is null in hot-seat and in a one-entrant online run.
    - A reconnect with less than 10 s left extends `pickBy` to now + 10 s once per turn.
    - A disconnect and reconnect cycle never moves it further.
    - A pick that arrives after `expire` picked fails silently.
11. **Disconnects.**
    - A disconnected player keeps their turn (contrast with tests 98-108).
    - Marking every guest disconnected changes nothing: no finish, no `lastStanding`.
12. **`resumed`.**
    - Offline standing seats become excused, and an excused active player's `pickBy` is at least `graceUntil`.
    - Reconnecting clears the excuse.
    - After the grace, `expire` costs a life.
    - A guest's open question goes back to the same offer with no life lost: its options go into `used`, the art lean is reversed, `recent` is popped, and an answer to the old `askedAt` gets "Too late!".
    - The host's own open question is untouched.
13. **Remove.**
    - Removing the active player, the only other standing player, or the last one standing.
    - A removed player leaves `losses`, `excused` and the standings.
    - Kick B in a 2-player run, and A is recorded as last standing at the wrap.
14. **Offers.**
    - Exactly 3 distinct categories, with the lockout applied at once, for 200 solo depths and for 4 seats.
    - A fallen player is never active.
    - Each depth gives exactly one turn per standing player (seeds 1 to 40, 1 to 5 players, 85% right).
15. **reask** keeps depth, lives and category, leaves the deadline null, and the old `askedAt` gets "Too late!". It is refused once the clock has started.
16. **Play again** gives a fresh run for everyone seated, fallen players and spectators included.
17. **Redaction.**
    - Before `clock`, `publicView` of a Delve question has no item ids, no labels, no prompt and no groups.
    - After `clock`, it has the labels, the prompt, `clockAt` and the deadline.
    - `delve.losses`, depth and `pickBy` are public (pattern at tests 417-440).
18. **Compatibility.** A state without `delve` plays on as turns, and `renameCategories` keeps the field.
19. **Hot-seat** with several players, every action from null, reaches `over` with winners chosen by depth.

**New `tests/delveSession.test.ts`** (the session's decisions, no DOM, no PeerJS):
- `clockStart`: drained before the cap; capped at 3 s; rtt/2 capped at 500 ms.
- `reaskDelay` gives 0, 2000, 5000, 10000, 10000.
- `mayAutoReask` is false once the deadline is set, and for a stale question.
- `expireIn` follows `pickBy`.
- **`delveSounds`:**
  - solo plays only 'descend' or 'stratum' when entering choosing;
  - in a group, my turn at a round change plays 'descendTurn';
  - others hear 'descend';
  - lives drops map to 'lifeLost', 'lastLife' and 'eliminated';
  - `over` plays 'victory' or 'runOver'.
- `delveNotices` spots the reload rewind and the missed turn.

**Other tests**
- `tests/protocol.test.ts`:
  - `clock`, `expire`, `resumed`, `skip`, `reask`, `restart` and `settings {mode:'delve'}` are rejected from guests;
  - `versionProblem` names the right side;
  - `LEGACY_VERSION_TEXT` equals the old host's text.
- `tests/prefs.test.ts`:
  - a Delve room is stored with raw `mode: 'turns'` and `delveOn`, and an older parser still reads it;
  - `prefsFrom` keeps target, timer and difficulty.
- New `tests/roomInfo.test.ts`:
  - a Delve listing parses as delve with its depth;
  - the raw listing passes the old checks;
  - a depth outside 1..9999 is dropped and the room kept;
  - a listing without `v` counts as older.
- `tests/guard.test.ts`: PeerJS's binary connection exposes `bufferSize` and `dataChannel`.
- `tests/codex.test.ts`: Delve tier from depth, not settings; hot-seat Delve with one seat against several seats.
- New `tests/delveRecord.test.ts`:
  - round-trip; upsert by id; cap at 20; `bests` kept past trimming;
  - solo and group bests apart;
  - unfinished and mixed runs never become bests;
  - `runEvent` fires at the fall, not only at `over`;
  - malformed input; quota (fake localStorage as in codex.test.ts:26-39).
- `tests/difficultyText.test.ts`: `delveChange` covers strata 2 to 16 and the bottomless line.
- New `tests/descent.test.ts`:
  - `descent(0)` is all zeros;
  - the curves are monotonic, and surface falls after depth 1;
  - values are finite and at most 1 at 1e3, 1e6 and NaN;
  - blue is 0 below 25, .15 at 25 and 1 from 41;
  - `stratumAt` fires only at 13, 21, 25, 41, 61, 81 and 101;
  - the easing ends within 2.5 s for one step and within 9 s for 0 to 40.
- New `tests/backdropEmbers.test.ts` (no DOM):
  - depth-0 output equals today's;
  - the cold flag changes only on a wrap, a snap or `recolor`;
  - `recolor` at blue .15 makes about 15% of embers cold;
  - glint count by width;
  - no NaN after `step(1e4)`;
  - a column never exceeds `SLOTS`.
- `tests/style.test.ts` already covers every new string. No em dashes.

---

## 11. Implementation order

Each step is one PR that leaves the game working.

1. **The ramp, unwired.** `src/lib/delve.ts` (3.1, 4.2) and `tests/delve.test.ts`. Nothing visible changes.
2. **Engine Delve mode.**
   - Everything in section 5: the clock with `at`, `expire`, `resumed`, the choice budget, the reload grace, the skip refusal, the reask guard, the silent pick race, the streak reset and the redaction.
   - `PROTOCOL_VERSION` 10 with `versionProblem` and `LEGACY_VERSION_TEXT`.
   - The game and protocol tests, and the codex tier with its test.
   - Delve cannot be chosen from the UI yet.
   - Turns and race are unchanged: the `offerCategories` slice is a no-op for them, and all existing tests pass.
3. **Session and network.**
   - `delveSession.ts` with its tests.
   - Active-first media and the drain clock.
   - Art backoff, `resumed` on reopen, `scheduleExpire`, and auto-skip and idle off in delve.
   - Notices, `fallen`, `startDelve`, and the guest's legacy version text.
   - Unfinished-run hooks and interim sounds.
   - `roomInfo.ts` with the Delve listing, prefs `delveOn`, and the PeerJS check, with their tests.
   - **Measure** release-to-arrival times for 8-tile art questions (3.3). Still not reachable from the UI.
4. **Playable Delve (the user-facing release).**
   - **The UI in section 7, except Home and Codex:** Lobby card, ladder and rules; header on game and over; scoreboard lives and phone badge; Game banner, kicker, notices and fallen line; ChooseCategory; QuestionView gating, keys, faster entrance, phone layout and lines; TimerRing nullable deadline and `warnFrom`; GameOver with ties, the single `lost` flag and Share; OpenRooms.
   - **The 375x667 pass** for 8 names and 8 tiles at the 5 s floor.
   - **README:**
     - "How to play" gets the section 1 text and a Delve rules paragraph.
     - "Fair play & safety" (README.md:120-196) gets:
       - in Delve the host's Skip tools are replaced by the 20 s choice budget, and a disconnected player's missed turn costs a life;
       - after the host reloads, offline players get a minute to come back;
       - the question clock starts when the art has reached the answering player, waiting at most 3 s, and the options are not sent before that;
       - the host still has an edge in Delve (its own art is instant, and a slow guest link can lose part of the 3 s), and the host could always cheat;
       - the Host tools list (124-126, 176-177) no longer promises skipping in Delve.
   - **Ruleset 1 is frozen at this step,** after the measurement, the phone pass and the model inputs check (3.4).
5. **Solo entry and records.** Home "Delve alone" with the intro card and "Deepest N"; `delveRecord.ts` with `noteRun` and unfinished runs; the Codex band and Erase, with tests.
6. **Descent scene.**
   - `descent.ts`, the App.svelte effect, SMOOTH `uDeep`, the draw-time uniforms, the vec4 vignette, the scene clock and the `soft` flag (8.1, 8.2).
   - The CSS fallback layers and the chrome tint.
   - The header depth colour and the GameOver crown tint.
   - `tests/descent.test.ts`.
7. **Embers.** The depth channel, agitation, cold embers with `recolor` and the shader core, glints, and the reduced-motion snap (8.3), with `tests/backdropEmbers.test.ts`.
8. **Moments.** `descend`, `stratum` and the milestone card, the last-standing card, `lifeLost`/`fallen` from lives drops, the last-life heartbeat and `deeperThanEver` (8.5).
9. **Audio.** New moments, `delveSounds` replacing the interim sounds, `depthAmbience`, and the RUMBLE loop (8.6).

---

## 12. Open questions for the user

1. **When one player is left, do they keep delving until their own third life, or does the game end there?**
   - *Recommended: keep delving.* Every player's depth is then a full three-life run. The others watch for about 1 to 2 minutes when players are close, and up to about 7 minutes when an elite player outlasts average ones. Fallen guests may leave without affecting anything.
   - The alternative ends the game the moment the last rival falls, leaving the winner with "depth N, lives to spare".
2. **When the last players fall at the same depth, break the tie or share the win?**
   - *Recommended: tiebreak* by whoever lost their second-to-last life deeper, then their first, with GameOver saying so in words. A shared win only for identical runs.
   - Without a tiebreak, about 18 to 33% of close two-player games would end tied.
   - Reviving everyone, as the deathmatch does, would hand out a fourth life and break comparability.
3. **How long should a run be?**
   - With 4 depths per stratum, a solo run is about 4 minutes for an average player, 7 for a strong one and 11 for an elite one. A group takes about 4 minutes per player.
   - *Recommended: start at 4* and recalibrate from the codex accuracy logs. Changing to 5 gives about 20% more depth and time.
   - Any change bumps `DELVE_RULESET` and `PROTOCOL_VERSION`, so old bests are not compared with a new curve.
4. **How rare should blue be?**
   - *Recommended:* the first blue at the Cold Fire (depth 25; about 14% of average players and 90% of strong players get there), and all blue by 41 (roughly a third of strong players, nearly all elite ones).
   - If "super high depth" should mean rarer, start at 33 and be fully blue at 49. These are constants in `descent.ts`; the milestone name would move with them.
5. **Should a group depth count the same as a solo depth?**
   - A shared room uses up the items faster, so deep group questions are easier: 18% mixed-group questions at depths 16-30 with 4 players and 27% with 8 or 12, against 10% solo (2.7).
   - *Recommended:* keep solo and group bests apart, always show a group depth with its player count, and treat solo depth as the comparable number.
   - Alternatives:
     - count both as one best and accept the drift;
     - cap Delve rooms at 4 seats, which keeps the drift small, with extra people watching.
6. **Big rooms.** A 12-player Delve takes about 45 minutes with average players, much like turns mode at target 10.
   - *Recommended:* no seat cap; the lobby shows the estimate.
   - The alternative is a Delve cap of 6 or 8 seats.
7. **Phones at the floor.**
   - If the 375x667 pass (3.3, 7) cannot fit 8 options with the timer visible, raise the floor for the 8-option strata to 8 s. That costs depth for everyone equally, but avoids a built-in phone handicap.
   - *Recommended:* decide after the pass, before ruleset 1 is frozen.

---

## Appendix A: conflicts between the notes, and how each was resolved

| # | Conflict | Resolution and why |
|---|---|---|
| 1 | **Timer floor and clock start.** Rules: 5 s, clock starts when the art is out. Network: 8 s floor, clock at `askedAt`. | **Clock when the art has reached the answering player, 5 s floor** (revised after review). <ul><li>**The problem.** The deadline is set before `startMedia` awaits `prepareMedia` (game.ts:1343-1344, session.svelte.ts:694-698), and releasing is not arriving (750-754).</li><li>**The design.** The art goes to the answering player first; the host waits for that send queue to drain (at most 3 s), adds half a round trip, and applies `clock` with that time. Options, prompt and groups are withheld until then (4.3). The screen shows everything together once all pictures are in (7). A resume reruns `startMedia` (1013-1014), so the action is idempotent.</li><li>**Also:** a faster entrance (633, 538).</li></ul> |
| 2 | **State shape.** Rules: `Player.lives?`/`fell?`. Network: a `delve` object with `losses`. | **`delve.losses`.** It is the single source of truth, the tiebreak needs the loss depths, and restart clears it through `createGame`. Readers go through `s.players` (4.2). |
| 3 | **Ties.** Rules: joint winners. Network: tiebreak. | **Tiebreak** (open question 2), explained on GameOver. |
| 4 | **Solo winners.** Rules: `[player]`. Network: `[]`. | **`[]`,** with explicit Delve branches in GameOver and the sounds, replacing the generic fallbacks (GameOver.svelte:19, session.svelte.ts:1122-1123). |
| 5 | **Item pool.** Rules: fresh per run. Network: keep `used` across Play again. | **Fresh per run,** for comparability. README.md:27 promises no repeats only within a game. Groups still use it up faster; their depths are kept apart (2.7). |
| 6 | **Idle player while choosing.** Rules: auto-pick at 30 s, no life. Network: a host skip button costing a life. | **One 20 s choice budget per turn, in the state** (revised after review). <ul><li>At its end, `expire` picks a random card for a connected player, or costs an offline player a life.</li><li>Reconnects do not refill it beyond one 10 s extension.</li><li>The host is included (today the host is exempt, session.svelte.ts:1232).</li><li>The engine refuses `skip` in Delve, so no host can take a life by hand.</li><li>It applies to online runs with 2+ entrants.</li></ul> |
| 7 | **Host refresh mid-question.** Rules: keep the deadline. Network: `rewind` for a guest's question. | **Both, inside the trusted `resumed`** (revised after review). <ul><li>A guest's question is set aside.</li><li>The host's own question and hot-seat keep their deadline, so a refresh cannot re-roll.</li><li>Offline seats get a 60 s grace, so the host's reload cannot cost a guest a life.</li></ul> |
| 8 | **Art failure.** Rules: automatic re-ask. Network: host button only. | **Automatic, with a backoff, for as long as it fails, plus the button** (revised after review). A Delve question can never sit with no deadline coming. A question with a deadline is never re-asked. |
| 9 | **Constant name.** `DELVE_RULESET` vs `DELVE_RULES`. | **`DELVE_RULESET`,** which does not clash with `delveRules()`. |
| 10 | **Visual thresholds.** <ul><li>Descent: blue 25-40, veins 16-28, abyss 50-70, milestones 10/18/25/40/50/75/100.</li><li>Gameplay strata: Merciless 13, Eternal 25, knobs at maximum 37, lockout at maximum 41, floor 61.</li></ul> | **Aligned to stratum starts:** <ul><li>milestones 13/21/25/41/61/81+;</li><li>blue starts at .15 at 25 and reaches 1 at 41;</li><li>veins 17-25, abyss 49-61, red 5-21.</li></ul> Each name up to 61 arrives with a rule change, and the Cold Fire shows blue at once (revised after review). |
| 11 | **Who owns the scene.** Subsystem map: Game.svelte. Descent: App.svelte. | **App.svelte,** so the over screen holds the depth without mood-owner handoffs. |
| 12 | **Round-change sound.** Descent: 'descend' and then 'yourTurn'. | **By who is playing** (revised after review). <ul><li>Solo plays only 'descend'.</li><li>In a group, my turn always gets a turn cue ('descendTurn' at a round change).</li><li>Others hear 'descend' in place of 'turn'.</li></ul> |
| 13 | **Life moments.** Descent: keyed on the reveal. | **Keyed on a drop in lives,** so a missed turn while choosing (no reveal) also plays. |
| 14 | **`tests/rooms.test.ts`** (network). | **Impossible as written:** rooms.ts imports `peerjs` and `./peer` without `.ts` (rooms.ts:9-12). The parser moves to `src/lib/roomInfo.ts`. |
| 15 | **Option ceiling.** Network: "options ≤ 10 fits the protocol". Rules: cap at 8. | **8,** for answerability. The protocol bound is not the constraint. |
| 16 | **Turn-start stamp.** Not in the network state. | **`startedAt`, `pickBy` and the reload grace live in `Delve`** (revised after review). Clients need `pickBy` for the countdown, and records need a run id. |

## Appendix B: claims checked against the code

**Confirmed**
- `advance` passes over disconnected seats and checks the target only at a wrap (game.ts:1068-1088).
- `offerCategories` excludes all of `recent` (1099), and `pick` trims with `rulesFor(settings)` (791).
- `pick` never clears `offered` (786-797), so the reload rewind can reuse the offer.
- `skip` is free outside a deathmatch (843-851). `isHost` includes `from === s.hostId` (648), so the engine accepts `skip` from the host's own id.
- `makeQuestion` derives the timer from settings (1343) and fills `labels` and `prompt` (1356-1357).
- `publicView` redacts only `used` and the question's ids (558-566). The pick is broadcast through `setState` (session.svelte.ts:1030) before `startMedia` prepares anything.
- `restart` keeps `used` (882). `used` belongs to the room (417), and a category restart puts earlier answers back except the latest (1311-1319).
- Measured with the real engine, Eternal knobs, everyone right:
  - first category restart at depths 21-26 with 12 players, 29-34 with 8, and none before 60 solo (seeds 1-5);
  - mixed-group share at depths 16-30: 10.0%, 11.3%, 17.8%, 27.1% and 27.7% for 1, 2, 4, 8 and 12 players (seeds 1-10).
- `countStreaks` runs only when a new reveal appears (888-891).
- The resume path marks guests disconnected and restamps only `reveal.at` (session.svelte.ts:352-362).
- Guests notice a lost host after 15 s and retry every 3 s, each attempt allowed 10 s (65-67, 913-924).
- Auto-skip and idle run whenever the mode is not race (1192-1240).
  - Auto-skip also covers questions, keyed per turn, and is cleared on reconnect (1194-1206).
  - Idle never applies to the host (1232).
  - `skipAt` is host-only (188), and the skip line shows only to the host (Game.svelte:153).
- JoinGate gives a known player a budget of one rejoin per 10 s, burst 6 (guard.ts:158).
- `release` shows the host's copy synchronously and sends to every guest with a player id, spectators included (session.svelte.ts:750-754). `mediaAt` is the send time (755-758).
- `tooFast` drops guest answers until media has reached that guest (636-643).
- Hot-seat dispatches every action from null (948).
- QuestionView's `ready` is true at the first tile of an art question (289), and `onKey` answers on any digit (377-383).
- Game.svelte scrolls to the top on every new turn (47), and the banner reads "{name}'s turn" in local mode (95-97).
- On phones, the other pills' score badge is 18 px at 0.72 rem (Scoreboard.svelte:616-630).
- GameOver's `iLost` needs a non-local mode (39-41), the crown strength follows it (145), and the 2D sparks ignore it (51-52).
- The backdrop caps phones at 30 fps for anything in `soft`; `changed` bypasses the cap (backdrop.ts:843-851).
- Display-font digits fall through to Cinzel (app.css:9-20, 43). Numbers inside body sentences are EB Garamond today (GameOver.svelte .sub, QuestionView result lines).
- A kick bans the player's token (session.svelte.ts:971). A guest who leaves mid-game only disconnects (494-508).
- The old hello refusal is fixed text (577). Today's listings carry no `v` (rooms.ts:14-25, session.svelte.ts:1065-1080).
- `parseClientMsg` allows only pick, answer and next (protocol.ts:67-84). `parseRoomInfo` and `parsePrefs` reject unknown modes (rooms.ts:39, prefs.ts:51), and `prefsFrom` collapses them to turns (prefs.ts:155).
- The ember shader uses only `e.z * e.z`, and the warm core is hard-coded (backdrop.ts:271-275).
- `uVignette` is a vec2 in the main pass only (162, 291).
- Mood ownership is `'deathmatch' | 'victory'` (moments.ts:555), and the mood pass tints the whole frame (backdrop.ts:294-300).
- Loops keep only `{src, gain}` and are rebuilt from static values (sound.ts:220, 266-275).
- GameOver falls back to the top scorer and always says "Victory" (GameOver.svelte:19, 32, 142).
- Hot-seat always plays 'victory' at `over` (session.svelte.ts:1122-1123), and 'yourTurn' plays only on entering choosing (1131-1132).
- The Lobby lights "Take turns" for any mode other than race (Lobby.svelte:259).
- The over screen's header falls through to "Hot-seat" in local mode (App.svelte:170-171).

**Corrected**
- The "rooms test" location (A14).
- The ring total, which must use `clockAt` once Delve starts the clock late (Game.svelte:103).
- The option entrance timing, which would eat about 1.4 s of a 5 s timer (QuestionView.svelte:633).
- `livesOf` as first written returned NaN for a fresh run (`3 - undefined`). It now uses `?? 0`.
- The three-card argument: the old "10 - (L+1)" gave 2 at L = 7. The bound is 10 - L.
- "Every milestone comes with a rule change" holds only up to 61.
- Blue was 0 at the Cold Fire. It now starts at .15 there.
- "Others watch for 1 to 4 minutes" did not hold for strong and elite survivors.
- "A solo depth 30 and a group depth 30 are the same" holds for the rules, not the questions.

---

## Review notes

**Accepted**
1. livesOf NaN (major): accepted; `?? 0` in 4.2, plus a fresh-run test.
2. Group pool drain (major): accepted; confirmed by simulation. Shared pool kept, solo and group bests apart, open question 5.
3. Clock at release ignores transfer (major): accepted; drain plus rtt/2 with a 3 s cap, and a measurement.
4. Offers arithmetic (minor): accepted; restated as 10 - L, plus a data invariant test.
5. Removed players still in `entrants` (minor): accepted; readers use `s.players`. The rejoin path itself is unreachable, since a kick bans the token.
6. Host reload plus the 20 s auto-skip (minor): accepted; `resumed` with a 60 s grace for excused seats.
7. Reconnect cycling stalls auto-pick (minor): accepted; one budget per turn, one extension, silent late pick.
8. Hang after 2 failed re-asks (minor): accepted; automatic re-ask with backoff for as long as the art fails.
9. Streak kept after a missed turn (minor): accepted; `loseLife` resets the streak.
10. Engine still accepts `skip` from the host (minor): accepted; `skip` refused in Delve for everyone.
11. Options leaked before the clock (major): accepted; `publicView` withholds labels, prompt and groups.
12. Uplink shared with spectators; deadline at send (major): accepted; active player first, the others after the clock, `at` in `clock`.
13. Host reload costs guests lives (major): accepted; same fix as 6.
14. Auto-pick stall forever (major): accepted; same fix as 7, with `pickBy` in the state.
15. Ruleset not tied to protocol (major): accepted; pinned tuple test, `mixed` runs, and records from `s.delve.ruleset`.
16. Third art failure hangs (minor): accepted; same fix as 8.
17. Automatic re-ask after a resume re-rolls (minor): accepted; only with a null deadline, plus an engine guard on `reask`.
18. Version text during the 9 → 10 rollout (minor): accepted; the guest maps the legacy text, and a missing `v` counts as older.
19. Auto-skip during a question (minor): accepted; no auto-skip in Delve, the deadline governs.
20. Hidden Skip buttons are only UX; README (minor): accepted; engine refusal and Fair play updates.
21. Clock needs the guest to have the media (major): accepted the problem. I chose the host-measured drain over a guest acknowledgement, because it adds no new untrusted message.
22. `ready` at the first tile (major): accepted; all pictures plus the clock.
23. 375x667 height (major): accepted; phone layout, auto-scroll, a check before ruleset 1, open question 7.
24. 'descend' replacing 'yourTurn' (major): accepted; my turn always gets a cue in group runs.
25. 4 px pips unreadable on phones (major): accepted; an ember digit in the 18 px badge, and spent pips dropped.
26. Ties unexplained on GameOver (major): accepted; a sub line and the loss depths on tied rows.
27. Length of 12-seat runs and the survivor estimate (major): accepted; revised estimates, a 20 s budget, the lobby line, open question 6.
28. Solo banner says "{name}'s turn" (minor): accepted; "Depth N".
29. No blue at the Cold Fire (minor): accepted; a .15 step at 25 plus `recolor`.
30. Bullets in the italic sub line, and "K correct" (minor): accepted; semicolons, two-column ladder, no correct count.
32. `frame()` should use `soft` (minor): accepted; it keeps the phone 30 fps cap.
33. Scene hidden on phones during questions (minor): accepted in part; chrome tint on the strip, dock and ring. The glints stay where they are.
34. Hot-seat early answers and digit keys (minor): accepted; the engine guards every caller, and `onKey` waits for `ready`.
35. Bottomless milestones have no rule change (minor): accepted; claim corrected, own card line.
36. Held crimson mood muddies the blue (minor): accepted; pulses only, no held mood owner.
37. GameOver `lost` flag inconsistent (minor): accepted; one flag for victory, crown and sparks.

**Rejected**
31. Depth numbers in body sentences should be Cinzel (minor): rejected. The project sets inline numbers in EB Garamond in every existing sentence; Cinzel is for standalone figures, and display-font digits already fall through to Cinzel.

**Missing items:** all 23 are covered.
- pool decision: 2.7, Q5;
- fair clock and measurement: 3.3;
- readers over seats: 4.2;
- 3-card test: 3.3, 10;
- reload grace: 2.5, 5;
- art liveness: 2.5, 6.1;
- per-turn budget and silent late pick: 2.5, 5;
- skip guard: 5;
- README Fair play: 11;
- pure session module and tests: 6.1, 10;
- countdowns for guests: 2.5, 7;
- host leaving and unfinished runs: 2.5, 6.1, 9;
- redaction test: 10;
- ruleset on resume: 4.4;
- active-first media: 3.3, 6.1;
- intro card: 7;
- share: 7;
- ruleset display: 7, 9;
- rewind notice: 2.5;
- model inputs: 3.4;
- height pass: 3.3, 7;
- solo "You": 7;
- over-screen header: 7.