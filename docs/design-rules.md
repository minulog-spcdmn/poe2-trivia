# Design rules

For any new screen or redesign. The code is the reference for how things look now; the owner's design canvas (linked in `docs/handoff/end-screen/README.md`) has the rounds and their reasons.

These rules are here to help, and they may not be perfect. If a design would work better done differently, it's okay to ask.

- Build from the game's own parts before drawing anything new: player chip and kick (`Lobby.svelte`, `Scoreboard.svelte`), `NamePlate`, the turn banner, `ArcaneCircle`, the framed `.panel`, setting buttons, answer tiles, `StandingMark`, `DrawnMark`. Engraved art follows `docs/arcane-style.md`; big glows follow CLAUDE.md's banding rule. No new web-app badges or hairline pills; the chip, verdict and streak pills are the game's own.
- One gold button per view: the next step (in a dialog, its confirm). Everything else is plain or outlined.
- Nothing jumps. Keep things where they were across screens and states (the lobby takes the start page's columns, Play again stands where Begin stood). Reserve room for whatever arrives later (a verdict, a second title line, a status line), and keep empty and loading states at their full height.
- No page scrolling on desktop where it can be avoided without a big trade-off: the screen and its main action fit the window. A list that grows scrolls inside its fixed frame (the lobby's party); the footer may sit below the fold; the Codex scrolls by nature. Phones may scroll, but not in a game, on their side or upright: there the question, its answers and Next fit the screen (`lib/layout.ts` `flat` and `upright`, which the QA desk checks); upright, the art gives way first and the answers keep a thumb's height.
- Ask for nothing until the step needs it, and never twice (a name is asked once, then kept).
- Don't advertise emptiness: where a 0 would tell a newcomer nothing's here (open rooms, the start menu's Codex and Delve lines), say what the thing is for or show nothing. Tallies inside a tracker (scores, the Codex's counts) may be 0.
- Name people when the name is known: "Doryani names this item", "Waiting for Kalguur to start the next game". "The host" only where the role itself is meant or no name exists.
- No emoji or cartoony icons; marks are engraved, from the game's own glyphs. A list line gets a sign only if the sign means something. As a mark, the gold diamond means "you are here" and nothing else (ornaments inside an engraving aside).
- State colours are fixed: gold for the next step and the winner, green right, red wrong or a warning, violet out of time; unique orange (`--unique`) is the item colour and yours on the end screen. A player's colour is theirs from joining. Gold also serves as the house accent (headings, hairlines); don't give it a new meaning.
- Numbers among words are Cinzel, as everywhere (CLAUDE.md). Small capitals are Cinzel (Fontin SmallCaps inside item tooltips); never `font-variant: small-caps` on EB Garamond, which has none and fakes them thin.
- Fit before you shrink. Check 1440 x 900, 1440 x 725 (13-inch laptop) and 390 x 844 (`npm run screens`), then walk the screen in the QA desk (`qa.html`, `docs/qa.md`), which checks every scene on a 375 phone (812 tall, and 635 in its browser with its bars up), a phone on its side in its browser (844 x 340: the address bar stays up, since a game never scrolls it away), a 13-inch laptop and a 4K screen at 150% and 100%. Every size the game is checked at is in `src/qa/sizes.ts`. Short windows get a tighter rhythm, long lists go to two columns, and phones dock the main action at the foot where a screen scrolls (not in a game, which fits the screen: there Next stays in its row under the answers), before anything gets smaller.
- A zone's sigil can be reused anywhere (the descent, the end screen); the zone title card's full display, with its Sol and Luna rule and starred divider, stays for arriving in a zone.
- Tried and dropped:
  - an attract mode (the title screen playing demo rounds by itself, like an arcade cabinet): motion beside the menu competes with it
  - a name gate before the start page
  - a QR code (but for pairing devices to sync, `SyncDialog`, engraved on gold, as a phone's home-screen game has no other way to take a code without typing it)
  - a Continue entry (a reload resumes the game by itself)
  - mode icons on only some entries
