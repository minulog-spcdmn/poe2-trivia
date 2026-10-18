# Fair play, safety and privacy

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
  veiled difficulties the altered picture goes out whole as the question
  starts, with which patch each of its pixels falls in, and burns into view
  as the host uncovers its patches. Cutting and sending every patch as a
  picture of its own held the host's page up as each question began, so a
  guest who digs into the page can now see a veiled picture before it has
  burned in.
- **Seats can't be taken over.** Each browser has a secret token that only
  its host ever sees; the IDs other players see are random public IDs.
  Rejoining needs the token and keeps your original name. The token is
  different for every room (derived from the browser's secret and the room
  code), so a host never learns a token that works in someone else's room.
- **Everything guests send is checked.** Every message is validated against
  the few actions a guest may take: pick a category, answer, continue, and
  in Delve together vote for a card or give a teammate a life (and where
  their pointer is). Guests
  are rate-limited to about 10 messages per second (their pointer has a
  budget of its own, about 40 a second, so moving it never uses up the one
  for playing; what goes past it waits rather than being lost; and the
  host keeps it out of the game state and passes it on in batches, twenty
  a second, and for a click a frame after the last at the soonest, whose
  sending holds back while a link is busy with pictures), and the raw data they
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
  about 200 ms after the art reached that player, and in Delve its clock)
  don't count; the player is told so and can answer again.
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

**Privacy:** guests connect directly to the host (WebRTC), also briefly
while browsing the open rooms list or on opening an invite link, so the
host and guests can see each other's IP address (unless the connection
runs through a TURN relay). Guests never connect to each other. The
privacy policy says so; the game itself doesn't show a notice.

**Visit counts** (GoatCounter, `src/lib/count.ts`) are sent from the live
game's own page only. To keep a browser out of them (the owner's, without a
fixed IP to exclude in GoatCounter), open `poe2.quest/#toggle-goatcounter`;
open it again to count it again. It works typed after the address of a page
already open too, says which way it went, and keeps the choice in
localStorage (`poe2trivia.skipCount`). GoatCounter's own count.js isn't
used, so this is the game's version of its toggle.
Game events count each time (`ns`, no session), visits once a person in
eight hours. Two events count the way visits do, `reach/played` and
`reach/finished`, sent by every device in a game as it starts and ends, so
set against the visits they say what share of the people who came played
or finished a game (the overview's "From visit to game").

**Reading them:** `stats.html` (Analytics, `src/statsPage`), with the
owner's read-only GoatCounter API key, which stays in that browser. Its
overview answers "how is it going?" and keeps to what's worth a glance,
with room around it: four figures for the period, today's visitors,
games and answers against the same time a period ago (each with what the
last update added), how busy each day was, what happened, when they
come, where they are and what they play; the rest is in the views
behind it. Joining only shows there when its failures run well above the
usual rate, today's or the period's (`insights.ts` troubleOf), as a line
above it all. The monitor
button in its top bar (`#board`) shows the overview full screen for a
monitor of its own, kept awake, the pointer hidden while still, updating
by itself; leaving full screen leaves it. On a monitor on its side
(taller than wide, 900px or more) every view fits the screen, its type
sized from it. On a big monitor (1440p, 4K) every view fits one screen, a chart giving up what runs past it or
taking what's left (`fitChart.svelte.ts`), its labels sized with the
type; "What happened" reads out the days far busier
than usual and the site behind each, and the sites and countries that
brought far more or fewer than the period before (`insights.ts`, only
what's beyond chance). Each update keeps what it brought in
(`changes.ts`): the visitors, games and answers added, and the countries
and systems the new visitors came from and on, lit on the overview. `#groups` (Groups) opens on what stands out between groups,
each a sentence, and sets the visitors from a country, or on a system or
a kind of device, against everyone: who played a game at all (guests
too), the games they start, Today's unique, joins and failures. A mode
can be picked with them (`#groups/place/Germany/mode/delve`), or alone,
each showing where it's played most for its visitors, a bar a country
(`slices.ts`); a country and a device never together, as GoatCounter
counts the two apart. Every country, system and mode name across the
views opens its group. GoatCounter keeps no visit with its
events, but breaks any set of paths down by country and by system, so
each thing people do is read once for each, only while that view is
open, and kept half an hour. On the dev server and the beta,
`stats.html?demo` fills every view with made-up numbers
(`src/statsPage/demo.ts`), no key needed, to look at the layout with.


Not defended against: a determined player recognising item art with
their own tools, and a cheating host.

## Legal pages

`impressum.html` (legal notice, § 5 DDG) and `datenschutz.html` (privacy
policy, GDPR) are plain static pages, built as extra Vite entry points and
linked from every screen. Update them whenever the site starts using a new
third-party service.
