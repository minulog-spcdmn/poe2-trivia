# Exile Trivia — PoE2 unique item quiz

**Play at [poe2.quest](https://poe2.quest/)** · made by zoe_arcana

A multiplayer Path of Exile 2 trivia game that runs entirely in the browser and
is hosted as a static site on GitHub Pages. No server needed.

**How to play**

1. On your turn, pick one of three random categories. There are 10 broad,
   similarly sized categories: One-Handed Weapons, Two-Handed Weapons,
   Off-Hands, Body Armours, Helmets, Gloves & Boots, Rings, Amulets & Belts,
   Flasks/Jewels/Relics, and Lineage Gems. A category you pick can't be
   offered to you again for your next two turns.
2. Name the unique item or lineage gem from its art (or, on harder
   difficulties, pick the right art for a name). A correct answer scores a point.
3. The first player to reach the host's target score wins. The game only ends
   once a full round is finished, so everyone gets the same number of turns.
   If players are tied, play continues.

Items aren't repeated within a game until a category runs out. Precursor tablets come up about a quarter as often as other items, and only appear as wrong answers when nothing else fits.

**Race mode** (online only): no turns. Everyone sees the same question at the
same time, in a random category (never one of the last two).
- The first correct answer scores +1 and ends the question.
- A wrong answer costs −1 and locks that player out until the next question.
  Everyone sees live who guessed what.
- The first player to reach the target score wins.
- Race questions always have a timer (30 s if the host picked "off").
- The host's own answers reach the game instantly, while guests' answers
  travel over the network, so the host has a small speed edge.

**Difficulty** (the host chooses):

| | Options | Wrong answers | Extras |
|---|---|---|---|
| Cruel (default) | 4 | Same kind (all rings, all bows, all Strength gems…) | 40% of questions are "find the art": you get a name and pick one of the pictures |
| Merciless | 6 | Same kind, half chosen because their names look like the answer | The art is hidden under tiles that lift one by one |
| Eternal | 8 | Chosen from the whole category for look-alike names | Tiles lift more slowly; "find the art" pictures are shown in grayscale |

## Multiplayer

- **Online (peer-to-peer):** the host creates a room and shares the 6-character
  code or invite link. Browsers connect directly over WebRTC
  ([PeerJS](https://peerjs.com/)). The host's browser runs the game and
  everyone else sees the same state live. Only the free PeerJS cloud is used,
  to introduce the players to each other.
  - Players who refresh or drop out rejoin automatically. The host can skip
    the turn of a player who is disconnected.
  - If the host refreshes, the room reopens with the same code and players
    reconnect.
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

The host picks the mode (take turns or race), the difficulty, the target score and an optional time limit
per question (off / 10–45 s).

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
  veiled difficulties it sends only the tiles uncovered so far, so the rest
  of the picture isn't on the guest's machine at all.
- **Seats can't be taken over.** Each browser has a secret token that only
  its host ever sees; the IDs other players see are random public IDs.
  Rejoining needs the token and keeps your original name.
- **Everything guests send is checked.** Every message is validated against
  the few actions a guest may take: pick a category, answer, continue. Guests
  are rate-limited to about 10 messages per second. Anything malformed, a
  flood, or a connection that doesn't introduce itself within a few seconds
  gets disconnected. The number of connections a room accepts is capped.
- **Bots.** Answers that arrive faster than a human could react (less than
  about 200 ms after the art reached that player) are ignored.
- **Race fairness.** The host's own answers are delayed by a typical guest's
  one-way network latency, measured with pings.
- **Host tools.** The host can:
  - lock the room so no one new can join
  - kick anyone, in the lobby or mid-game; the kicked player's token and
    connection are then blocked for the rest of the session
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

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # game-engine tests
npm run check      # svelte/type checks
npm run build      # production build in dist/
```

Stack: Svelte 5, TypeScript, Vite, PeerJS. Sounds are synthesized with
WebAudio, so there are no audio files to ship.

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

### Self-hosted signalling (optional)

To use your own [PeerJS server](https://github.com/peers/peerjs-server)
instead of the public cloud, build with `VITE_PEER_HOST`, `VITE_PEER_PORT`,
`VITE_PEER_PATH` and `VITE_PEER_SECURE`.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
The site is served on the custom domain **poe2.quest** (`public/CNAME`), and
invite links always point there (`src/lib/site.ts`).
Turn it on once under **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

---

Fan project. Not affiliated with Grinding Gear Games. Item data and art from
poe2db.tw; Path of Exile is a trademark of Grinding Gear Games.
