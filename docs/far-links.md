# Far links

A room whose host is far away (India to Europe, say) must stay playable and
fair. We plan for the worst link and measure nothing first: 300+ ms round
trip, a few percent loss, relayed through PeerJS's free TURN in eu-0 or us-0,
roughly 30 to 50 KB/s once loss is counted. On such a link one sharp picture
(about 90 KB) takes 2 to 3 s and an art question with eight options (about
400 KB) 8 to 13 s.

## Rules every phase keeps

- Nobody sees any part of a question before its clock starts: not the art,
  not the names, not the prompt. The host's own screen included.
- Nothing rewards timing a guest can influence. A guest can always delay its
  own pongs, slow how fast it takes in data and send late; any of that may
  only ever cost that guest, or at worst hold the room up to a fixed cap.
- The host is trusted (it can always cheat). Results stay inside the room:
  nothing global ever trusts them.
- No measuring on the real link before acting; no low-res-first art; no
  compression tweaks.

## Where the time goes today

1. Every message to a guest shares one reliable, ordered data channel. A
   question's art (up to 400 KB) sits in front of everything sent after it:
   the state, pings, cursors, the next question. One lost packet holds
   everything behind it until it is sent again.
2. Pings queue behind the art, so a guest's round trip (`rtt`) reads high
   after every picture. The too-quick check then turns down honest fast
   answers, and Delve's clock adds up to 500 ms of it (`halfTrip`).
3. Outside Delve the deadline is set as the question is asked
   (`askedAt + timer`): a far player loses the transfer time off the clock.
4. In Delve the clock waits for the art to drain to those answering, but
   pictures that arrive early can already be looked at, and the wait adds the
   guest's own `rtt`.
5. A guest's pick loses its highlight after 2.5 s without a verdict, which
   on a far link is the normal case.

## Phase 1: an art lane and honest round trips

Shippable on its own; changes no rule of the game.

- **Art lane.** Next to PeerJS's channel each connection gets a second data
  channel, negotiated (`negotiated: true`, fixed id) on the same
  `RTCPeerConnection`, used only host to guest and only for media
  (`art`, `option`, `veil`, `patch`). Its own SCTP stream: a lost art packet
  no longer holds up the state, pings, cursors or answers' verdicts.
  - The guest opens its lane before its hello and says so (`lane: true`); the
    host only sends media on it to guests that did. Anyone else gets media on
    the main channel as today.
  - Our own framing: a small JSON header and the binary parts, cut into 16 KB
    chunks, put together again on the guest, which caps a message's size and
    what it holds half-received. The result goes through `parseHostMsg` like
    any other media.
  - Paced: chunks go out only while the lane holds less than about 64 KB
    (`bufferedAmountLowThreshold`), so whatever the browser's stream
    scheduler, a control message never waits behind more than that.
  - The host ignores and blocks anything a guest sends on the lane.
  - `drained()` counts the lane's queue; the cursor backlog check reads only
    the main channel, so pointers no longer freeze while art goes out.
- **Honest round trips.** Pings no longer wait behind art, so `rtt` reads the
  link. Where timing would favour a guest who inflates it (the host's race
  handicap, Delve's `halfTrip`), use the round trip the browser itself
  measures for the connection (`getStats`, the selected candidate pair's
  `currentRoundTripTime`), falling back to the lowest recent ping. The
  too-quick check keeps the ping time: inflating it only hurts the guest.
- **The pick keeps its highlight** until the verdict, a refusal or the next
  question, not 2.5 s.
- **A fake far link for development:** a dev-only switch that delays both
  lanes and caps the art lane's rate, so the worst case can be played
  locally and in Playwright.
- `PROTOCOL_VERSION` 31.

Found while checking it on a fake far link (350 ms, 40 KB/s): pings now read
the link (about 180 ms) while art goes out, but the host took 0.6 to 3.7 s to
prepare a veiled picture before its first byte left (headless, software
canvas), and its page was busy meanwhile, so pongs read late. Next, still in
this phase: the alteration's per-pixel loop and the veil's cut move into the
encode worker, and the worker starts with the game rather than with its first
question.

## Phase 2: sealed art and a clock that starts for everyone

One release (pending without sealing would let near players look early).

- **Clock pending in every mode.** `clockAt` (already Delve's) becomes the
  one "the clock runs" fact in all modes; `makeQuestion` leaves the deadline
  null everywhere and the host's `clock` action starts it: Delve as today,
  race `(timer || RACE_DEFAULT_TIMER)`, turns `timer` or none.
  - Until then guests get no labels, prompt or groups (guestView, all modes),
    and every answer is refused as too early, the host's own included
    (engine guard, QuestionView `waiting`, bots).
  - The timer ring is there from the start, full, so nothing jumps.
  - Art that fails to prepare is asked again by itself in every mode
    (`mayAutoReask`, `reaskLater`), never on a guest's word.
- **Sealed art.** The host encrypts every media message of the question
  whole (AES-GCM, a fresh key per question, a random IV per message, a key
  id so a host reload's new art never pairs with old bytes) and sends it on
  the art lane as soon as it is ready, to everyone in the room.
  - The key goes out in its own tiny message on the main channel, to
    everyone at once, the moment the clock starts; the state carrying the
    deadline follows. Before it there is nothing to look at, so slowing one's
    own link buys nothing.
  - The host's own screen shows the art only then too.
  - Keys and the next question never live in `GameState` (guestView spreads
    it).
  - WebCrypto needs a secure context: a guest without it is refused at hello
    with a clear reason.
  - The whole veiled picture still opens at the key (as today); patches burn
    in on the host's schedule.
- **When the clock starts:** once the host's queues to those answering have
  drained (turns: the player on turn; race: everyone playing; Delve:
  `artFirst`), or after a cap of 20% of the question's time (at least 2 s, at
  most 4 s). No guest-reported timing. Whoever hits the cap twice running is
  left out of the wait until they drain within it again, so one throttled
  link can't hold every question up. Late art shows when it lands.
- Baselines follow the clock: the too-quick check and the recap's answer
  times count from the key, not from the first bytes.
- The guest's own ring ends early by its own one-way estimate, so an answer
  given at its 0 still lands in time; inflating that only hurts the guest.
- Tests: the engine gets a test option that starts the clock at once, so the
  ~85 direct pick-then-answer tests keep working; new tests cover pending,
  too-early, guestView stripping, the clock per mode and sealing.

Built, still at `PROTOCOL_VERSION` 31:

- **Engine** (`game.ts`): `clockRuns`, `clockMs`, the `clock` action in every
  mode, `autoClock` for tests and tools.
- **Sealing** (`seal.ts`): `makeSealKey`, `sealMsg`, `keyMsg`, and on the
  guest a `SealedStore` that holds what it can't open yet, within caps, and
  opens in order once the key comes. The key id is the question's `askedAt`
  and a random part, new each time the art is prepared.
- **Host** (`session.svelte.ts`): `startMedia` prepares, seals (`sealMedia`)
  and sends the sealed pictures to everyone in the room, those the clock
  waits for first. The plain copies stay on the host (`released`), and the
  key and sealed bytes in `sealing`, never in `GameState`. A new question
  first drops what hasn't gone yet of the last one's art from every lane
  (`LaneSender.clear`), so it doesn't queue behind it.
  - `waitForArrival` looks again every 50 ms at whom the clock waits for
    (`clockWaitsFor`, those connected, less anyone with `CAP_STRIKES`). The
    clock starts once the main channel and the art lane to each of them are
    empty, or at `clockCap`, plus half of the slowest one's `honestRtt`.
    Those left out are watched until the cap, and draining within it lets
    them back in (`capStrikes`).
  - `startClock` sends the key to everyone on the main channel (`openSeal`),
    then the state that starts the clock. The host's own screen gets its
    pictures at the same moment. A question that ends before its clock
    started sends its key at the reveal.
  - Late joiners and reconnects get the sealed bytes again, the key if it
    went out, and the patches sent so far (`replayMedia`).
  - Patches stay unsealed and only go out after the key. On the guest, a
    patch that overtakes its still-sealed picture waits for it (`Shown`'s
    `early`).
- **Baselines**: `mediaAt` is set as a guest's key goes out, so the
  too-quick check counts from it. An answer before the clock is left to the
  engine's silent refusal. `noteClock` runs in every mode, and the recap's
  answer time counts from when the art opened on the guest (`shown.since`).
  Idle-skip counts from the clock's start, not from the question.
- **Failing art** is asked again by itself in every mode (`reaskLater`'s
  backoff, then the host's "Ask another question").
- **WebCrypto**: hosting and joining are refused up front on a page without
  it, with the reason. The hello says `seal: true`, and the host turns away
  a hello without it.
- `warmMedia` runs as the host's game leaves the lobby.

Checked with two headless browsers on the fake far link (350 ms, 40 KB/s)
in race, turns and co-op Delve, plus a spectator joining mid-game. No
picture showed before its key, and no labels before the clock. Every
answer sent before the clock was turned down. Clocks started 0.8 to 2.5 s
after the sealed art went out, once it had drained, or at the cap (3.2 s
for a 16 s clock) for six full-size pictures. Art failing for 7 s was asked
again by itself. Art failing for good was asked again at about 0, 2, 5 and
10 s, after which the question waited for the host. On the fake link,
`honestRtt` reads the real local link (about 1 ms), so the half trip added
there is about 0.

Left:

- The guest's own ring doesn't end early by its own one-way estimate yet.
- Outside Delve, a question opens at the clock even if its pictures are
  still on the way after the cap (Delve's `waiting` also waits for them).
  That's by design ("late art shows when it lands"), but on the worst link
  a guest can face a name question's labels a few seconds before its art.

## Phase 3: race draws its next question ahead

Race has no choosing phase, so the next question is known early.

- Once the current question's sealed art has drained to everyone, the host
  draws the next race question on a copy of the state and prepares and sends
  its sealed art, during the answering time and the 4 s reveal (about 10 s
  or more, enough for eight options on the worst link).
- On `next`, if nothing changed since (same state version: nobody joined,
  left, was kicked; no restart), the copy is taken with `askedAt` set anew;
  otherwise it is thrown away and drawn as today. Nothing of it touches the
  live state before then (`used`, `artLean`, `lastAskedAt`).
- Guests keep sealed bytes per key id apart from what is on screen, so the
  reveal's art and its last patches are untouched.
- Not for Delve's dig (its sizes would tell the team how hard the next depth
  is before they choose to leave) or turns (three cards).

## Phase 4: knowing a link is far, and better relays

- **The open-room list shows each room's link:** the probe's connection
  reads `getStats` before it closes (round trip, relayed or not) and the
  list shows near, far or very far, plus relayed, and sorts by it. A host can
  only look worse than it is. Joining a very far or relayed room asks first.
- **Own TURN relays (needs an account, owner's call):** Cloudflare's TURN
  (anycast, close to India too, free up to 1 TB a month) with short-lived
  credentials from a small Worker, also over TLS on 443 for strict networks.
  Only helps relayed links, but ends the detour through eu-0 or us-0.

## Not doing

- Sending ahead for all offered cards: wasted bytes, leaks to the picker,
  and an engine that has to draw three questions at once.
- Guests loading item files themselves (even in co-op Delve): the file name
  is the answer, and a cheating teammate takes the point and the find from
  strangers.
- Compensating answers by each guest's round trip: exploitable.
