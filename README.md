# PoE2.Quest • Unique Item Trivia

**Play at [poe2.quest](https://poe2.quest/)** · made by zoe_arcana · [support the project](https://paypal.me/minuW)

A multiplayer Path of Exile 2 trivia game: name the unique item or lineage gem
from its art. It runs entirely in the browser and is hosted as a static site on
GitHub Pages. No game server needed; only a small Worker hands out relay
logins (see "Relay").

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
- **Sync:** pair your devices in the settings (Sync, under You): a computer
  shows a QR code, and a phone opens straight to its camera to scan it
  (from the game itself, which an iPhone's home-screen game needs), or the
  code is typed in. Whenever two of
  them are on the site at once they keep the codex, Delve runs, achievements,
  sigils and the daily answers the same. Progress only goes up: what each
  device counted is kept apart on the others and added up, never counted
  twice. A device already synced that scans a new one's code brings it into
  the group (`src/lib/sync/`).
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

Paired devices meet the same way, under a name made from their sync code
(a hash: the matchmaking server never sees the code or the progress), and
each proves it has the code before anything is sent. A pairing link is only
taken once the player says yes to it, as a link can come from anyone.

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

To see what a post or a stream brings in, tag the link you share:
poe2.quest/?ref=reddit-oct (letters, digits, `-` and `_`, up to 40). The
tag is counted as the visit's campaign and taken out of the address, and
Analytics lists the tagged links with the sites people came from.

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
item data, the beta's build), [docs/dev-tools.md](docs/dev-tools.md) (the
test and tuning pages) and [docs/iphone.md](docs/iphone.md) (testing on the
owner's iPhone, driven from the PC).

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
npm run deal                                 # Today's unique for the year ahead, src/data/dailies.json (last)
```

Today's unique asks each day from its row in `src/data/dailies.json`, one
day a line from the first day to a year past the last deal, so a refresh
never changes a day already played. `npm run deal` keeps every row before
the cutoff (tomorrow, or the day after in the last two hours of a UTC day:
`cutoffDay` in `src/lib/daily.ts`) and deals the rest again from the item
data as it is, so new items reach the days to come. Run it last, after
`fakes.json` and `dailyArt.json` are up to date, and merge before the
cutoff's midnight (UTC). `tests/dailies.test.ts` holds it to that:

- The rows from the cutoff on must be what a deal from the current data and
  code gives, so a forgotten deal, or a change to how the daily deals, fails
  until `npm run deal` is run.
- No row before the cutoff may differ from the live site's (the last
  deployment's in CI, `origin/main`'s locally). A merge that slipped past
  the cutoff's midnight fails the deploy, and the site stays as it was:
  run `npm run deal` again and push. On a merge conflict in
  `dailies.json`, take `main`'s and run `npm run deal`; never edit a row.
- Every item a row names from yesterday on must still be an item: a
  refresh that removes one today's or tomorrow's question names waits a
  day.

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

### Relay

Two devices that can't reach each other directly (some routers, phone
carriers, venue Wi-Fi) meet through a relay: Cloudflare's TURN, free up to
1,000 GB a month. A Worker (`relay/worker.js`) hands a page a login once it
goes online (hosts, joins or syncs; the start page's room list needs none),
lasting twelve hours: a relayed connection ends with its login, so the page
renews it halfway and every connection starts with six hours at least. The
relay's key stays in the Worker. So that nobody can run up a bill with it:

- Every ten minutes the Worker reads the month's relay traffic from
  Cloudflare's analytics, and makes sure its token can still change the TURN
  key. At 500 GB it **deletes every TURN key on the account**, tried again
  every ten minutes until they're gone, which ends every login already out.
  Rooms then meet without the relay (as they would with none at all). It
  comes back once a new key is set up (step 1 and its two secrets again) in
  a new month; a new key in the same month stays off. Half the free
  allowance, because the check sees traffic up to ten minutes late and a
  burst can be large.
- Cloudflare doesn't say that deleting a key ends the relaying already under
  way; a login's end does, so whatever might go on stops within twelve hours.
- Logins go out only while that check has run in the last hour, so a token
  gone wrong stops them instead of leaving the cap unwatched.
- An address (an IPv6 one's /64) gets 60 logins a minute.

To set it up:

1. In Cloudflare's dashboard: Realtime → TURN Server → Create, which gives a
   key ID and an API token.
2. An API token for the Worker's check (My Profile → API Tokens → Create,
   custom) with Account → Account Analytics → Read and Account → Calls →
   Edit.
3. In `relay/` (not the project's root: there Wrangler sets the whole game up
   as a Worker, rewriting `package.json` and `vite.config.ts`, and puts the
   secrets on a Worker of that name): `npx wrangler login`,
   `npx wrangler deploy` (the first time it asks for the account's
   workers.dev subdomain), then `npx wrangler secret put` for
   `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` (step 1) and `ANALYTICS_TOKEN`
   (step 2), pasting each. The Worker is `poe2-trivia` (`wrangler.toml`, with
   its account ID, rate limit, KV namespace and check), at
   `poe2-trivia.poe2quest.workers.dev`.
4. Put the Worker's URL in `src/lib/relayUrl.ts` (`RELAY_URL`); the build lets
   the page reach it.

Without a login (no URL, the Worker refuses, or it doesn't answer within 3 s)
a connection gets Google's STUN only (with one, Google's beside Cloudflare's) and meets wherever a direct link gets
through; the page asks again later, and connections after that get the relay.
The QA desk and the tests never ask.

To turn it off: delete the TURN key in Cloudflare's dashboard (Realtime → TURN
Server). The Worker then hands out no logins (its check fails on the missing
key, every ten minutes, until a new one is set up), and pages play as
without a relay. Cloudflare doesn't say what becomes of the logins pages
already hold: whatever they still relay ends with them, in twelve hours at
most. Emptying `RELAY_URL` (or reverting)
only changes pages loaded after the deploy, and leaves the Worker handing
out logins to tabs already open (and to anyone sending the game's Origin):
a full rollback is reverting and deleting the key. A new key brings it back
for tabs opened since; one open all along picks it up when its login is next
renewed, within six hours.

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
