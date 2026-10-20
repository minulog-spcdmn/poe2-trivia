# PoE2.Quest • Unique Item Trivia

**Play at [poe2.quest](https://poe2.quest/)** · made by zoe_arcana · [support the project](https://paypal.me/minuW)

A multiplayer Path of Exile 2 trivia game: name the unique item or lineage gem
from its art. It runs entirely in the browser and is hosted as a static site on
GitHub Pages. No server needed.

## How to play

- **Turns:** on your turn, pick one of three categories and name the item from
  its art (or, on some questions, pick the right art for a name). The first player to
  the host's target score wins once the round is finished; a tie at the top
  goes to a sudden-death **deathmatch**.
- **Race** (online only): everyone gets the same question at once. The first
  right answer scores +1; a wrong one costs −1.
- **Delve** (alone or together): no settings, the same rules for everyone. Each
  question cleared goes one depth deeper, every depth a little harder, with
  three lives, finds that give items (wards, flares, dynamite) and a new zone
  every ten depths. How deep can you go?
- **Difficulty:** Cruel (4 options), Merciless (6, the default), Eternal (8),
  or Custom, where the host sets each knob.
- **Codex and achievements:** every item you have seen, your accuracy, your
  Delve runs and 36 achievements, kept in this browser.
- **Settings:** volume and ambience, effects, the room code hidden for
  streaming, your name, your avatar's colour and class sigil, and the keys: 1 to 0 answer, Enter or Space goes on,
  D detonates, M mutes, Esc opens the settings, each one rebindable. Keys are
  read by their place on the keyboard, so the number row answers on any
  layout. In a room the header's gear (or Esc) opens them over the game,
  all but the name, colour and sigil, which stay as the game began (a colour
  picked meanwhile comes with the next one).

The full rules are in [docs/gameplay.md](docs/gameplay.md).

## Multiplayer

- **Online:** the host creates a room and shares its 6-character code or
  invite link. Browsers connect directly over WebRTC
  ([PeerJS](https://peerjs.com/)); the host's browser runs the game, and the
  free PeerJS cloud only introduces the players to each other. Rooms can be
  listed publicly under "Open rooms". Very strict networks can block WebRTC;
  a room that can't go online opens on the host's device only.
- **At one screen:** in a Turns lobby the host adds players by name, who
  play their turns at the host's screen, with others online or alone
  together. Race and Delve set them aside until Turns is picked again.

## Fair play and privacy

The host's browser runs the game and has the answers, so a host could always
cheat in their own room. Guests are treated as untrusted: they never receive
the answer or an item's image file before the reveal, everything they send is
validated and rate-limited, and answers faster than a human could react don't
count. Players connect directly to the host, so the host and guests can see
each other's IP address. Details in [docs/fair-play.md](docs/fair-play.md).

`impressum.html` (legal notice) and `datenschutz.html` (privacy policy) are
plain static pages; update them whenever the site starts using a new
third-party service.

The visitor counts' opt-out is one flag in the browser
(`src/lib/countOptOut.ts`, shared by every channel) that `src/lib/count.ts`
checks before every count, as it does Global Privacy Control. The privacy
page's switch sets it (`src/legal/countToggle.ts`), and so does opening
poe2.quest/#toggle-goatcounter. An iPhone's home-screen app keeps storage
apart from Safari's, so there, and only there, the privacy link in a room
opens over the game (`src/lib/legalSheet.svelte.ts`).

## Development

```sh
npm install
npm run dev        # local dev server (its own rooms)
npm run dev:live   # local dev server in the live rooms
npm run qa         # local dev server, the QA desk opened in Chrome
npm test           # tests
npm run check      # svelte/type checks
npm run build      # production build in dist/
npm run screens    # screenshots at the design sizes in screens/ (sizes: src/qa/sizes.ts)
npm run sweep      # the QA sweep: every scene, seat and size, shot and checked (docs/qa.md)
```

Stack: Svelte 5, TypeScript, Vite, PeerJS, WebGL2 and WebAudio. The dev server
plays in a channel of its own (`src/lib/channel.ts`), so a tab on localhost
never meets the live game, and keeps its own storage.

More in [docs/development.md](docs/development.md) (sound, visual effects,
item data, the beta's build) and [docs/dev-tools.md](docs/dev-tools.md) (the
test and tuning pages).

### Refreshing item data

Item names, art and tooltips are scraped from [poe2db.tw](https://poe2db.tw/)
and committed, so the game doesn't depend on poe2db being up. After a refresh,
rebuild what depends on the art:

```sh
npm run fetch-data                           # src/data/items.json, itemStats.json, art-source/items/
.venv-art/bin/python scripts/upscale-art.py  # upscaled copies in public/items/ (venv setup in its header)
npm run looks                                # look-alike table, src/data/looks.json (needs ffmpeg)
.venv-art/bin/python scripts/daily-art.py    # items too thin for Today's unique, src/data/dailyArt.json
npm run bake-icons                           # category card emblems (needs Chromium and ffmpeg)
```

### The dev hub

The QA desk, `qa.html`, is where to check a change: a bench for each thing
of the game's, live, in every state that matters, at any size from a phone
to 4K (`docs/qa.md`). A new test tool is a bench there, not a page.

`dev.html` links every test and tuning page with a line on what each is for:
`http://localhost:5173/dev.html` on the dev server, **poe2.quest/beta/dev.html**
on the beta. A new tool page gets a card there; `tests/devHub.test.ts` fails
until it does.

### Self-hosted signalling (optional)

To use your own [PeerJS server](https://github.com/peers/peerjs-server)
instead of the public cloud, build with `VITE_PEER_HOST`, `VITE_PEER_PORT`,
`VITE_PEER_PATH` and `VITE_PEER_SECURE`.

## Deploying

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push
to `main`, served on **poe2.quest** (`public/CNAME`).

### Beta

A second build at **poe2.quest/beta/** is for trying a change before it goes
live. It has its own rooms, saves and invite links (`VITE_CHANNEL=beta`).

- **Put a branch on the beta:** Actions → *Deploy to GitHub Pages* → Run
  workflow (on `main`), with the branch, tag or commit SHA as *beta*. Later
  deploys of `main` keep showing it.
- **Ship it:** merge the branch into `main`. The beta stays as it is until the
  next one goes up.
- **Stack changes:** the beta shows one commit at a time. To test a change with
  the one already there, start its branch from the newest `beta` deployment.

---

Fan project. Not affiliated with Grinding Gear Games. Item data and art from
poe2db.tw; Path of Exile is a trademark of Grinding Gear Games.
