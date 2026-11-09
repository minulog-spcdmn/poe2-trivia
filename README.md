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
  free PeerJS cloud only introduces the players to each other (players it
  turns away meet on the game's own server instead). Rooms can be
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
poe2.quest/?ref=reddit-oct (letters, digits, `-` and `_`, up to 40; `?rf=`
works too, as one posted link spelled it). The tag is counted as the visit's
campaign and taken out of the address, and Analytics lists the tagged links
with the sites people came from.

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
the cutoff as the live site has them (a week ahead, or a week from tomorrow
in the last two hours of a UTC day: `cutoffDay` in `src/lib/daily.ts`) and
deals the rest again from the item data as it is, so new items reach the
days to come. Each day is dealt from the answers of the days before it: an
answer isn't asked again until as many days have gone by as three quarters
of the items the daily may ask (`repeatGap`, about ten months), nor its
twins (`TWINS`, the same picture turned or recoloured). The live
site's rows are those of the newest github-pages deployment that went up
(`scripts/live-dailies.mjs`, through the GitHub CLI; `origin/main`'s when
that can't be reached). Run it last, after
`fakes.json` and `dailyArt.json` are up to date. `tests/dailies.test.ts`
holds it to that:

- The rows from the cutoff on must be what a deal from the current data and
  code gives, so a forgotten deal, or a change to how the daily deals, fails
  until `npm run deal` is run.
- No answer from the cutoff on may come back within `repeatGap` days.
- No row before the cutoff may differ from the live site's. A merge that
  slipped past its cutoff fails the deploy, and the site stays as it was:
  run `npm run deal` on `main`, which puts those days back as the live site
  has them, and push. On a merge conflict in `dailies.json`, take either
  side and run `npm run deal`; never edit a row. The beta's tests leave
  this out, as a beta never goes live.
- Every item a row names from yesterday on must still be an item: a
  refresh that removes one a question before the cutoff names waits until
  that day has gone by.

### The dev hub

The QA desk, `qa.html`, is where to check a change: a bench for each thing
of the game's, live, in every state that matters, at any size from a phone
to 4K (`docs/qa.md`). A new test tool is a bench there, not a page.

`dev.html` links every test and tuning page with a line on what each is for:
`http://localhost:5173/dev.html` on the dev server, **poe2.quest/beta/dev.html**
on the beta. A new tool page gets a card there; `tests/devHub.test.ts` fails
until it does.

### Matchmaking server

Players meet on the free PeerJS cloud (`0.peerjs.com`), which turns away every
player in Russia (it answers them 403), so none of them could host or join.
They meet on the game's own server instead: a Worker (`signal/worker.js`)
that speaks the [PeerJS server](https://github.com/peers/peerjs-server)'s
protocol, one Durable Object holding every peer's socket in memory.

- A page looks once it goes online (hosts, joins, syncs, the open rooms list;
  a page that never does asks neither): the cloud if it answers, else ours if
  that does (`lib/peer.ts`). A no from the cloud is asked again a second
  later; a cloud slow to answer is waited for, and taken as a no only after
  15 s without a word. A peer waits 4 s at most for the look, made on the
  cloud meanwhile. Everyone the cloud answers meets there as before: nothing
  that worked before leans on ours.
- Either stands in for the other. A page whose server fails it (a peer loses
  it) looks again, so pages meet on ours while the cloud is down; a page on
  ours looks again as it makes a peer once five minutes have passed, and is
  back on the cloud once that answers it.
- A room on the cloud and its listing are on ours too, so a guest finds it on
  either. A guest on the cloud that hears the room isn't there looks for it
  on ours too, by ping alone, and goes on there where the cloud would say
  there's no such room (a cloud host only reconnecting is waited for on the
  cloud, as before), or at once if the invite link's screen, which pings
  both, heard it's on ours alone. A code no room has is told as soon as
  before.
- Russian networks are reported to stall a connection to Cloudflare once
  about 16 KB have gone over it (TLS's handshake takes about 5 of them), so
  a page on ours swaps its socket for a fresh one under the same id after
  6 KB (`keepFresh`), counting what each message adds on the way and the
  heartbeats. Cloudflare echoes every heartbeat without waking the Object,
  and a socket whose echo doesn't come within 10 s (stalled sooner) is
  swapped at once. What the page sends meanwhile waits for the fresh socket.
- The relay (below) is on Cloudflare too, so a link between two players
  there that needs it (one on a carrier's network, say) may stall the same
  way; unmeasured, and only a relay elsewhere would get round it.
- The open rooms list scans its page's server only: a page on the cloud
  doesn't list a room whose host the cloud turned away (an invite or the code
  still finds it).
- The list asks each listed room by a ping through the server and never
  connects to one. A room answers 60 pings in 10 s, which is about 140 start
  pages scanning at the list's quickest (every 20 s). So the list eases off
  (`lib/roomRefresh.ts`): a page out of sight doesn't scan; one with no sign
  of its player scans later each time (13 times in its first hour, then
  every ten minutes); and a page whose pings a room let go, or that couldn't
  reach the server, waits twice as long each time, to every 160 s, and half
  as long again after each scan that's answered. Every wait is up to a
  quarter shorter or longer by chance, so pages that opened together don't
  come back together. Past its share a room is heard on part of a page's
  scans and stays listed as last heard between them, ten minutes at most,
  where before it was connected to: several connections a second for a
  host's device to set up on a busy evening. With every page in sight and
  its player about, 97% of lists show a given room at 1,000 pages, 88% at
  2,000 and 77% at 3,000, and a new room reaches a list after as many
  seconds, on average, as a sixth of the pages scanning (simulated,
  `tests/roomRefresh.test.ts`): what the share of 60 pings in 10 s
  (`lib/probeDesk.ts`) carries, which is the number to raise for more. The
  refresh button always scans at once.
- Only the game's own pages are answered; an address (an IPv4 one, or an
  IPv6 /56) may connect 120 times a minute and hold 64 sockets; a socket's
  messages past 300 in 10 s are let go, and past 600 it's hung up on (never
  with a server error, for which PeerJS would end every game the peer
  carries); 5,000 peers at once at most. An id whose socket was lost (not
  closed by its page) is kept for it 15 s, so a host's blip doesn't hand its
  room to whoever asks next. What waits for an id nobody holds is capped at
  4 MB, and 256 KB from one address. Nothing is stored or logged.
- Cloudflare's free plan gives a Durable Object 100,000 requests a day, a
  socket's messages counting 20 to one (a peer on ours sends a heartbeat
  every 25 s, not PeerJS's 5), and the account 100,000 Worker requests a
  day, each socket one (peers on ours make their ids in the page, so they
  ask for none). A page on the cloud costs ours nothing unless it hosts (its
  room's id, and a public room's listing), opens an invite or joins a room
  the cloud hasn't got; a page on ours, a socket per peer, the open rooms
  list a socket per scan (as often as above: 157 an hour at its quickest, 13
  in the first hour of a page nobody touches, none out of sight). A room
  costs ours about six requests, so at the busiest day yet (569 visits,
  5 November 2026) it stays far under both. Its listing costs more where its
  host's page is on ours and many pages scan: answering its share of pings
  carries the 6 KB of `keepFresh` every two or three seconds, a fresh socket
  each time, over twenty requests a minute. With every page on ours (the
  cloud down) a day's 100,000 requests are about 640 hours of start pages
  scanning at their quickest by the Worker's count, and a half to two thirds
  of that by the Object's, which counts a scan's pings and the rooms'
  answers too. Past either, ours stops until midnight UTC: pages the cloud
  answers never needed it (their rooms' copies on ours try again, later each
  time), and only the pages the cloud turns away can't play, as before ours.
  The Worker requests are the account's, the relay's too, so the relay would
  stop with it (connections then meet without it, as below): on a free
  account of its own, ours can't touch the relay.

Cloudflare Workers Builds deploys `poe2-signal` on every push to `main` that
changes `signal/`. To set it up (once), in Cloudflare’s dashboard: Workers &
Pages, `poe2-signal`, Settings, Builds, Connect. Install the “Cloudflare
Workers and Pages” GitHub app on this repo only. Branch `main`; root
directory `signal`; build command empty; deploy command `npx --yes
wrangler@4.158.0 deploy`; preview command as it comes; build variable
`SKIP_DEPENDENCY_INSTALL=1`, not encrypted; API token: create new; build
caching off. Then in Settings, Build: Branch control, “Enable Preview
Builds” unticked; build watch paths `signal/*`. Connecting runs no build;
the next change under `signal/` is the first. It’s the Worker `poe2-signal`, at
`poe2-signal.poe2quest.workers.dev`, named in `src/lib/signalHost.ts`.

A server deploy is forced within 300 s and disconnects everyone on our server;
pages reconnect in about 2 s with the same id, and games under way don’t use
the server. A push of 20 or more commits ignores the watch paths and redeploys
it unchanged. Every build shows as Cloudflare’s check on its commit: seeing a
change to `signal/` through to live includes that check on the merge commit
going green (`gh api repos/{owner}/{repo}/commits/<sha>/check-runs`, the run
whose `app.slug` is Cloudflare’s). A cancelled one means a newer push’s build
took over (look at the newest commit on `main` that has one); only red on the
commit that built means the server didn’t update. For an emergency hand
deploy, run from `main` itself, fetched first: `git fetch origin main`, `git
worktree add --detach <dir> origin/main` (`git -C <dir> log -1` shows the
merge), then `npx --yes wrangler@4.158.0 deploy` in `<dir>/signal`.

To turn it off, empty `OWN_SIGNAL_HOST` in `src/lib/signalHost.ts` (pages
loaded since meet on the cloud alone) and delete the Worker.

To use a [PeerJS server](https://github.com/peers/peerjs-server) of your own
instead of both, build with `VITE_PEER_HOST`, `VITE_PEER_PORT`,
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

Unlike the matchmaking server, the relay stays deployed by hand. The session
that changes it opens an issue with its PR (“Deploy the relay after #N”),
deploys it once the PR merges, from `main` itself, fetched first (`git fetch
origin main`, `git worktree add --detach <dir> origin/main`, and `git -C <dir>
log -1` shows the merge; then `npx --yes wrangler@4.158.0 deploy` in
`<dir>/relay`), checks it live as before, and closes the issue. A session
that ends first leaves the issue for the next.

## Deploying

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push
to `main`, served on **poe2.quest** (`public/CNAME`). Every pull request into
`main` runs two required checks first. Tests (`.github/workflows/tests.yml`)
runs the types and the tests, as the deploy does once it's merged. Redraws
(`.github/workflows/redraws.yml`) fails on something big Chrome draws again at
rest, or a moment (a deal, a pick, the pointer over a card, a name plate drawn
in) drawing more than it did ([docs/qa.md](docs/qa.md), “Redraws”).

### Beta

A second build at **poe2.quest/beta/** is for trying a change before it goes
live. It has its own rooms, saves and invite links (`VITE_CHANNEL=beta`).

- **Put a branch on the beta:** Actions → *Deploy to GitHub Pages* → Run
  workflow (on `main`), with the branch, tag or commit SHA as *beta*. Later
  deploys of `main` keep showing it.
- **Ship it:** merge the branch into `main`. The beta stays as it is until the
  next one goes up.
- **Check it on the QA desk:** **poe2.quest/beta/qa.html**. The deploy also
  builds the code before the change (main where the branch left it) at
  `/beta/before/` (`scripts/qa-before.mjs`), so **B** (`&cmp=1`) shows it live
  beside the branch's; marking what differs takes the dev server
  (`docs/qa.md`).
- **Stack changes:** the beta shows one commit at a time. To test a change with
  the one already there, start its branch from the newest `beta` deployment.

### Undo a bad deploy

- The site: revert the change on `main`. The owner’s admin merge skips Tests
  and Redraws; it’s live in about 4 to 25 minutes (recent deploys took 2 to
  24). A revert that touches `dailies.json` may fail the deploy’s dailies
  check.
- The matchmaking server: revert on `main`, with the page change it came with,
  if any; Builds deploys the old server. In an emergency, roll back first in
  the dashboard (Workers & Pages, `poe2-signal`, Deployments), which a Durable
  Object migration between the two versions refuses, then revert at once, or
  the next build of `main` brings the bad code back. Never revert a migration:
  write a forward one.
- The relay: redeploy the old version by hand (“Relay”); in an emergency
  delete the TURN key.
- What no revert undoes: saved progress. Sync only ever moves progress up and
  passes it to every paired device (`src/lib/sync/store.ts`), so a change to
  what’s saved has to keep reading what older builds saved.

### Daily health check

`.github/workflows/daily-health.yml` runs `scripts/daily-health.mjs` once a
day: stats.html’s own checks (`healthOf`, `troubleOf`) on yesterday against
the 7 days before. A check that fires fails the run, and GitHub emails the
owner.

It needs the read-only GoatCounter key as the Actions secret
`GOATCOUNTER_KEY`. Switch it on with `gh secret set GOATCOUNTER_KEY` (it asks
for the value) and off by deleting it (`gh secret delete GOATCOUNTER_KEY`);
without it the run passes and says it’s off. A failed run means a check fired
(each reason is on the run’s page), the key was refused or the check itself
broke; a day GoatCounter can’t be read passes with a warning. Its checks are the page’s own, so it
mails when stats.html would warn: in a dry run over the 13 days that could be
checked (6 Nov 2026), once, on 5 Nov, when joining failures rose with the
matchmaking server’s first day. A dry run over past days: `GOATCOUNTER_KEY=...
node --experimental-strip-types scripts/daily-health.mjs --backtest 60`.

---

Fan project. Not affiliated with Grinding Gear Games. Item data and art from
poe2db.tw; Path of Exile is a trademark of Grinding Gear Games.
