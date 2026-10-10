# Handoff: the invite screen

The approved invite screen (`?room=CODE`). It replaces "Invite link screen"
in `../start-page-and-lobby/README.md` and beta's `InviteScreen.svelte`.

It was built straight into this PR's code, not drawn: the screenshots under
`screens/` are rendered from it.

- `reference/invite-screen.patch`: three commits on top of PR #125 at
  `b01100c` (`git am` applies it; checked with `git apply --check`). Review
  it like your own work: types, tests, the comments.
- `reference/InviteRoom.svelte.txt`: the one new component, for reading.

Design canvas (owner only), page "Invite screen": https://claude.ai/artifact/3F9B7GxKyv8GhVb7Yxg4oQ

Every rule in `CLAUDE.md` applies.

## Who sees it

**Only a first visit.** Someone who has never played gets a link from a
friend and needs a name first. A player who already has a saved (valid)
name never sees it: Home drops the `room` param and joins straight away,
and the start page shows the join on its way in Join a room's row (the
usual Connecting row). If the room is gone or full, they stay on the start
page with the code in Join a room's field, marked, and the site's toast
(`known-name-joins`, `known-name-room-gone`). Not over a game being resumed:
the join waits a tick and checks `session.status === 'idle' && !session.state`,
as the Delve link does.

## What it is

**The start page with the choice already made**, not a screen of its own:
the same stage, title, kicker, line, greeting and footer, in the same
places (`first-visit`).

- **Left, the menu holds two entries.** "Join Kalguur's room" (or "Join the
  room" without a host name), open with the start page's own row: the name
  field and Join, the field focused. Then "Something else", described as
  "Create your own room, play hot-seat, or open the Codex.", which drops the
  `room` param and shows the normal start page. The menu cursor behaves as
  on the start page (it shows while the field has the focus).
- **Right, where today's unique stands: the room as the lobby will show it**
  (`InviteRoom.svelte`). "Room code" with the lobby's glyphs; "Party" with
  the lobby's chips, two to a row: the host's chip with the hanging banner,
  and yours beside it, which takes your name as you write it (`typing`;
  dashed with "You" while empty); under them "The rest of the party shows
  once you are in."; then the lobby's IP note, word for word. Both chips
  are unlit (no colour yet: the room gives each player theirs once they are
  in). No circle, no daily item, no open rooms.
- **Join** checks the name as the start page does, saves it, and joins; the
  row turns into the Connecting row and "Something else" dims (`joining`).
  A room that is gone or full: the site's toast, and the row is back to
  try again (`room-gone`). Once joined the `room` param is dropped, as
  before.
- Phones: the start page's phone order, the room blocks after the menu
  (`phone`). Large windows scale like every screen (`k4150`).

## The host's name in the link

The screen says whose room it is from the link alone: nothing else can be
known before connecting, and connecting shares the player's IP. So the
lobby's invite link now carries the host's name: `inviteUrl(code, by)` in
`lib/site.ts` adds `&by=<name>` (URL-encoded), and Lobby passes the host's
name. Home reads it trimmed and cut to `MAX_NAME`. Links without it (older
ones, or a code typed by hand into a URL) read "Join the room" and show
only your chip (`no-host-name`).

## Removed

- `InviteScreen.svelte` (the centred card with the title lines) and Home's
  `{#if invite}` branch for it.

## Done when

- It matches the shots at 1440 x 900, 1440 x 725, 2560 x 1310 and 390 wide,
  and works at 375.
- A player with a saved name opening `?room=CODE` lands in the lobby
  without seeing the invite screen; with a gone room, on the start page
  with the code and the toast.
- Keyboard: the name field has the focus, Enter joins, Tab reaches
  "Something else".
- `npm test` and svelte-check pass. On the patch, `npm test` passed (785
  tests) and svelte-check found nothing in the changed files.
