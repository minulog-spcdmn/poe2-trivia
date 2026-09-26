# Exile Trivia — PoE2 unique item quiz

A multiplayer Path of Exile 2 trivia game that runs entirely in the browser and
is hosted as a static site on GitHub Pages. No server needed.

**How to play**

1. On your turn, pick one of three random item categories (Rings, Helmets,
   Quarterstaves, …). A category you pick can't be offered to you again for
   your next two turns.
2. You see the unique's art and four names. Pick the right one for a point.
3. The first player to reach the host's target score wins. The game only ends
   once a full round is finished, so everyone gets the same number of turns.
   If players are tied, play continues.

Items aren't repeated within a game until a category runs out. The wrong
answers are a mix of items from the same category and from other categories.

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
- **Hot-seat:** everyone plays on one device and passes it around.

The host picks the target score and an optional time limit per question
(off / 10–45 s).

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

Item names and art are scraped from [poe2db.tw](https://poe2db.tw/us/Unique_item)
and committed to the repo (`src/data/uniques.json` and `public/items/`), so
the game doesn't depend on poe2db being up.

```sh
npm run fetch-data
```

Categories come from each item's art folder; see `CATEGORY_RULES` in
`scripts/fetch-uniques.mjs`. Image files are named with a hash, so the URL
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
