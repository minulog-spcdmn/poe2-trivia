# Exile Trivia — PoE2 unique item quiz

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

Items aren't repeated within a game until a category runs out.

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

- **Online (peer-to-peer):** the host creates a room and shares the 5-letter
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
Turn it on once under **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

---

Fan project. Not affiliated with Grinding Gear Games. Item data and art from
poe2db.tw; Path of Exile is a trademark of Grinding Gear Games.
