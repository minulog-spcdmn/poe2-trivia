<script lang="ts">
  import { flushSync, onDestroy, tick, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { fade, fly } from 'svelte/transition';
  import { MAX_NAME, nameRefusal, nameUsable, unlockHeldName } from '../lib/names';
  import { refuseName } from '../lib/nameField';
  import { calm, motion } from '../lib/motion.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { engine, session, savedName, saveName, NAME_KEY, CODE_LENGTH } from '../lib/session.svelte';
  import { refuse } from '../lib/fx/moments';
  import { openCodex, codexRoute } from '../lib/codexRoute.svelte';
  import { openSettings, settingsRoute } from '../lib/settingsRoute.svelte';
  import { typing } from '../lib/keybinds.svelte';
  import { DELVE_LINK_PARAM } from '../lib/delveShare';
  import { wantDelveBackdrop } from '../lib/backdrop';
  import { BETA, LOCAL } from '../lib/channel';
  import { CODEX_NAMES, DELVE_RECORD_KEY, deepestShown, loadRecords } from '../lib/delveRecord';
  import { onStoredElsewhere, storeKey } from '../lib/storage';
  import { shownDepth } from '../lib/delve';
  import { ENTRIES, codexLine, codexLines, cursorKey, lastEntry, rememberEntry, type Entry } from '../lib/startMenu';
  import GameTitle from './GameTitle.svelte';
  import Connecting from './Connecting.svelte';
  import DailyUnique from './DailyUnique.svelte';
  import InviteRoom from './InviteRoom.svelte';
  import MenuCursor from './MenuCursor.svelte';
  import OpenRooms from './OpenRooms.svelte';
  import DrawnMark from './DrawnMark.svelte';
  import SiteFooter from './SiteFooter.svelte';
  import { probeRoom, type RoomInfo } from '../lib/rooms';
  import { warmPlate } from '../lib/plateStore.svelte';
  import { circleAtPlace } from '../lib/circlePlaces';
  import { cameFromThisSite, countArrival, type JoinVia } from '../lib/count';
  import { withoutInvite } from '../lib/inviteAddress';

  /** Keeps a room code's letters and digits, uppercased, up to its length. */
  const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);

  const params = new URLSearchParams(location.search);
  /** An invite link's room (?room=CODE): the start page shows it until it is joined or left. */
  const linked = cleanCode(params.get('room') ?? '');
  let invite = $state(linked);
  /** How a join of the room in the address started: an invite link, or a room tapped in the Open rooms list whose newer host it reloaded into (count.ts cameFromThisSite). */
  const inviteVia: JoinVia = cameFromThisSite ? 'open-rooms' : 'invite-link';
  // (Not counted on coming from this site, the Open rooms case: countArrival leaves that out.)
  if (linked) countArrival('open/invite-link');
  if (params.has('owner')) {
    void unlockHeldName(params.get('owner') ?? '');
    // Out of the address bar and history either way; other params stay.
    const url = new URL(location.href);
    url.searchParams.delete('owner');
    history.replaceState(history.state, '', url);
  }

  /**
   * Beta and dev server only: ?room=CODE&first shows an invite as a first
   * visit sees it, to test it with a name saved; for this visit the saved
   * name is set aside (nothing saved changes, unless you join).
   */
  const firstLook = (BETA || LOCAL) && !!params.get('room') && params.has('first');
  /** The name this browser plays under; empty on a first visit (it is asked once, then greeted). */
  let known = $state(firstLook ? '' : savedName().trim());

  // A delver's shared link (?delve): someone who has played here before (a
  // name is saved) goes straight into a run alone; anyone else finds Delve
  // chosen in the lobby they open. Not over a game that's being resumed:
  // App resumes it on mount, after this, so look once that's had its turn.
  if (params.has(DELVE_LINK_PARAM)) {
    countArrival('open/delve-link');
    const url = new URL(location.href);
    url.searchParams.delete(DELVE_LINK_PARAM);
    history.replaceState(history.state, '', url);
    session.delveLink = true;
    // Either way Delve is on its way: the backdrop gets its Delve programs ready.
    wantDelveBackdrop();
    const n = savedName().trim();
    if (nameUsable(n))
      setTimeout(() => {
        if (session.status === 'idle' && !session.state) session.startDelve(n);
      });
  }

  const total = engine.items.length;
  /** Null until the codex is read. */
  let discovered = $state<number | null>(null);
  const readDiscovered = () =>
    import('../lib/codex').then(({ loadCodex }) => {
      const seen = loadCodex().items;
      discovered = engine.items.filter((it) => seen[it.id]).length;
    });
  void readDiscovered();
  /** Your deepest as players see depths, as the codex's Delve tab has it. */
  const readDeepest = () => shownDepth(deepestShown(loadRecords()));
  let deepest = $state(readDeepest());
  // A game in another tab may add to both meanwhile (the codex by the name
  // lib/codex.ts writes, read raw so it stays out of the first download),
  // and the name may change there or come from another device (lib/sync).
  $effect(() =>
    onStoredElsewhere({
      [storeKey(CODEX_NAMES[0])]: () => void readDiscovered(),
      [DELVE_RECORD_KEY]: () => (deepest = readDeepest()),
      [NAME_KEY]: () => {
        if (!firstLook) known = savedName().trim();
      },
    }),
  );
  // Achievements catch up with the codex here: the first time quietly (those
  // earned in games from before them get one notice, here or owed from a game),
  // and any missed since. Not once a game has taken over the screen.
  void Promise.all([import('../lib/achievements'), import('../lib/achievementToasts')])
    .then(([{ checkAchievements }, { announceAchievements, payOwed }]) => {
      const here = !session.state;
      announceAchievements(checkAchievements(engine.items), here ? 'start' : 'game');
      if (here) payOwed();
    })
    .catch((err) => console.warn('achievements', err));

  const connecting = $derived(session.status === 'connecting');

  /**
   * Phones (either way up), touch tablets in one column, and any window as
   * narrow as a phone get the menu as actions rather than a list: New
   * game as the page's one big button, Join's code field always out, the
   * Codex and Settings as a pair under them. A mouse keeps the list, its cursor
   * and its arrow keys wherever there's room for them.
   */
  const compact = new MediaQuery('(max-width: 640px), (pointer: coarse) and (max-width: 1080px)');

  // ---- names ----

  /**
   * A name fit to play under, or null after saying what's wrong with it. Not
   * saved yet: a join's is saved once the room takes it (lib/joinName.ts), as
   * the room can still turn it down, and its field stays out until then.
   */
  function checkName(raw: string, field: HTMLInputElement | undefined): string | null {
    const n = raw.trim();
    const refusal = nameRefusal(n);
    if (refusal) {
      // (An empty field is refused without a word.)
      refuseName(field ?? null, n ? refusal : { reason: null }, () => {});
      return null;
    }
    return n;
  }
  /** A name checked and kept at once (saved, and the greeting's from now on): one renamed, or a room's own host's. */
  function keepName(n: string | null): string | null {
    if (!n) return null;
    saveName(n);
    known = n;
    return n;
  }

  /**
   * The saved name, if it can still be played under; otherwise it is let go
   * (null), and the name is asked as on a first visit. A held name needs this
   * device unlocked, and a name saved by an older build may be too short now.
   */
  function knownName(): string | null {
    if (!known) return null;
    if (nameUsable(known)) return known;
    known = '';
    return null;
  }

  let renaming = $state(false);
  let draft = $state('');
  let renameField = $state<HTMLInputElement>();
  function startRename() {
    if (connecting) return;
    draft = known;
    renaming = true;
    // Focused within the tap itself, so a phone's keyboard comes up with it.
    flushSync();
    renameField?.focus();
    renameField?.select();
  }
  function saveRename(e?: Event) {
    e?.preventDefault();
    if (keepName(checkName(draft, renameField))) renaming = false;
  }
  function renameKeys(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      renaming = false;
    }
  }

  // ---- the menu ----

  /** An entry's description giving way to its fields, and back. */
  const SWAP_IN = { y: 4, duration: 240, delay: 90 };
  const SWAP_OUT = { duration: 140 };

  /** The keyboard cursor: arrows move it, Enter chooses, it follows the mouse. */
  let cursor = $state(untrack(() => invite) ? 0 : lastEntry());
  /**
   * The Codex's collection circle and its item window's name plate, built
   * ahead away from the page once its entry is pointed at (the Codex warms
   * the rest as it opens).
   */
  const warmCodex = (e: Entry) => {
    if (e !== 'codex') return;
    warmPlate(circleAtPlace('collection'));
  };
  $effect(() => void warmCodex(ENTRIES[cursor]));
  /**
   * And as the mouse comes over it or a finger lands on it, its figures
   * (lib/codexStats.ts) worked out then, while nothing moves, rather than in
   * the frame the Codex comes in on, which on a phone they made late. (The
   * codex itself has been read here already, and the Codex reads it back
   * unchanged.) Not once it's on its way: it works them out itself.
   */
  const readyCodex = (e: Entry) => {
    warmCodex(e);
    if (e !== 'codex') return;
    void Promise.all([import('../lib/codex'), import('../lib/codexStats')])
      .then(([{ loadCodex }, { storedCodexStats }]) => {
        if (!codexRoute.open) storedCodexStats(loadCodex(), engine.items, engine.categories);
      })
      .catch(() => {});
  };
  /** The entry whose row (fields in place of its description) is open. */
  let open = $state<Entry | null>(null);
  let entryEls: HTMLButtonElement[] = $state([]);
  /** Each entry's whole box: a tap outside the open one closes it. */
  let boxes: HTMLElement[] = $state([]);

  let nameInput = $state(''); // first visit: the name asked with Create or Join
  let code = $state('');
  let codeError = $state(false);
  let nameField = $state<HTMLInputElement>();
  let codeField = $state<HTMLInputElement>();

  /** The entry that set off the connection, whose row shows it ('rooms': a room tapped in the Open rooms list, which shows it in that room's place). */
  let busy = $state<Entry | 'rooms' | null>(null);
  /** The entry whose row shows the connection under way (the one that set it off, or the one a resumed connection belongs to). */
  const busyEntry = $derived<Entry | 'rooms' | null>(connecting ? (busy ?? (session.mode === 'host' ? 'create' : 'join')) : null);

  function choose(e: Entry) {
    if (connecting) return;
    cursor = ENTRIES.indexOf(e);
    rememberEntry(e);
    renaming = false;
    if (e === 'codex') return openCodex();
    if (e === 'settings') return openSettings();
    if (e === 'create' && knownName()) return host();
    open = e;
    // Within the tap itself, so a phone's keyboard comes up with the focus.
    flushSync();
    (known ? codeField : nameField)?.focus();
  }

  /** The open row's element (its fields and button). */
  const rowEl = () => (open ? boxes[ENTRIES.indexOf(open)]?.querySelector('.slot') : null);
  /** Whether the open row has the focus (its field is being typed in). */
  const rowHasFocus = () => !!rowEl()?.contains(document.activeElement);

  /**
   * Closes the open row. Its entry takes the focus back: always from the
   * keyboard (Escape), only if the row had it when it closes on its own,
   * never when a click elsewhere closes it (the click decides the focus).
   */
  function closeRow(refocus: 'always' | 'if-focused' | 'never' = 'always') {
    if (!open) return;
    const i = ENTRIES.indexOf(open);
    const hadFocus = rowHasFocus();
    open = null;
    codeError = false;
    rowFocus = false;
    clearTimeout(idleTimer);
    if (refocus === 'always' || (refocus === 'if-focused' && hadFocus)) {
      // In one column the entry comes back in the row's place (New game's
      // button), or has none but its code field (Join): render it first.
      flushSync();
      (entryEls[i] ?? (ENTRIES[i] === 'join' ? codeField : null))?.focus({ preventScroll: true });
    }
  }

  /** A click anywhere but the open row's entry closes the row at once (what was typed is kept for next time). */
  function outside(e: Event) {
    if (!open || connecting) return;
    const entry = boxes[ENTRIES.indexOf(open)];
    if (entry && !entry.contains(e.target as Node)) closeRow('never');
  }
  /** What the last press was made with: a click carries no pointer type on every browser. */
  let pressedWith = '';
  /** A mouse closes the open row as it presses elsewhere... */
  function outsidePress(e: PointerEvent) {
    pressedWith = e.pointerType;
    if (e.pointerType === 'mouse') outside(e);
  }
  /**
   * ...a finger only with a tap (a click), never as it starts a scroll. Heard
   * as the click comes down (capture), before what was tapped acts: a row the
   * tap itself opens (New game's button, an open room's Join) stays open.
   * A click from the keyboard (detail 0) leaves the row be, as a mouse's press does.
   */
  const outsideTap = (e: MouseEvent) => e.detail > 0 && pressedWith !== 'mouse' && outside(e);

  /** How long an untouched row stays open once the mouse has left its entry. */
  const ROW_IDLE_MS = 4000;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(idleTimer));
  /**
   * The mouse left an entry: the open row closes after a while, unless the
   * mouse comes back to its entry first, or something is being typed in it.
   */
  function leave(ev: PointerEvent) {
    if (ev.pointerType !== 'mouse') return;
    hovered = false;
    const e = open;
    if (!e) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (open === e && !connecting && (!rowHasFocus() || (!code && !nameInput.trim()))) closeRow('if-focused');
    }, ROW_IDLE_MS);
  }

  function host(e?: Event) {
    e?.preventDefault();
    const n = knownName() ?? keepName(checkName(nameInput, nameField));
    if (!n) return;
    busy = 'create';
    session.host(n);
  }

  function join(e?: Event) {
    e?.preventDefault();
    // A name typed here stays in its field, unsaved, until the room takes it: turned down, it's there to change.
    const n = knownName() ?? checkName(nameInput, nameField);
    if (!n) {
      // A saved name just let go: the row now asks for one.
      if (!nameField) void tick().then(() => nameField?.focus());
      return;
    }
    if (code.length < CODE_LENGTH) return codeShort();
    // A join that failed left its code here: trying it again is still the try it was (an invite link's, say).
    startJoin(code, n, 'join', left?.code === code ? left.via : 'code');
  }
  /** The Code too short notice up, if one is: it goes once the code is whole. */
  let shortNotice: number | null = null;
  function codeShort() {
    codeError = true;
    if (codeField) refuse(codeField);
    codeField?.focus();
    shortNotice = toasts.show(`Room codes have ${CODE_LENGTH} letters and digits.`, 'error', { title: 'Code too short' });
  }
  /** The code as typed or pasted: kept clean, and a notice that it was short taken down once it isn't. */
  function codeChanged() {
    code = cleanCode(code);
    codeError = false;
    if (code.length === CODE_LENGTH && shortNotice !== null) {
      toasts.dismiss(shortNotice);
      shortNotice = null;
    }
  }

  /**
   * In one column Join asks as Create does: the code first, and on a first
   * visit its row then gives way, in place, to the name (the code waits).
   * One name field at a time, and nothing moves while typing.
   */
  const asking = $derived(open === 'join' && !known && code.length === CODE_LENGTH);
  function phoneJoin(e: Event) {
    e.preventDefault();
    if (code.length < CODE_LENGTH) return codeShort();
    if (!asking && !knownName()) return askName();
    join();
  }
  /** Join's row asks the name (on one column, in the code's place). */
  function askName() {
    open = 'join';
    cursor = ENTRIES.indexOf('join');
    // Within the tap (or the Go key) itself, so a phone's keyboard comes up with the focus.
    flushSync();
    nameField?.focus();
  }
  /** Back from the name to the code (closing Join's row brings the code field back, and focuses it). */
  const backToCode = () => closeRow();
  /** Join's button is lit once it can go on: the code whole, and once asked, a name. */
  const joinReady = $derived(code.length === CODE_LENGTH && (!asking || !!nameInput.trim()));

  /** How many rooms the Open rooms list shows; Join points down to them. */
  let roomCount = $state(0);
  /** Whether any of them has a seat (none: they are all rooms to watch, games under way or full lobbies). */
  let roomSeats = $state(false);
  function toRooms() {
    document.getElementById('rooms-h')?.scrollIntoView({ behavior: motion.still ? 'auto' : 'smooth', block: 'start' });
  }

  /**
   * A room joined from the Open rooms list: with the list as a menu its row
   * is Join's. In the actions layout the list sits below Today's unique, out
   * of sight of Join's box, so the room tapped shows it in its own place.
   */
  function joinListed(roomCode: string) {
    if (connecting) return;
    const n = knownName();
    const inPlace = !!n && compact.current;
    if (inPlace) {
      // Join's field up the page is left as it was (nobody typed this code); a Code too short notice still up goes.
      if (shortNotice !== null) toasts.dismiss(shortNotice);
      shortNotice = null;
    } else {
      // Join's row takes it on: the code in its field (whole now, so a Code too short notice still up goes).
      code = roomCode;
      codeChanged();
    }
    if (!n) {
      askName();
      toasts.show('Name yourself first, then join.', 'info', { title: 'Your name' });
      return;
    }
    startJoin(roomCode, n, inPlace ? 'rooms' : 'join', 'open-rooms');
  }

  // A join that ends back here without a room (no such room, no answer):
  // its code is the one to check, and the toast (session.fail) says why. One
  // that failed for another reason (the room turned it down: a name, a full
  // room; or the connection, the network or the page let it down) may have
  // had the code right: the code isn't marked (session.codeDoubted); and if
  // it was the name it turned down, a name typed for it, the thing to change,
  // takes the focus back (a saved name is changed at the greeting's quill).
  // Not one tapped in the Open rooms list in its own place: nobody typed that
  // code, and Join's field is out of sight up the page.
  let joining: { code: string; via: JoinVia } | null = null;
  /** The join that failed last, its code left in Join a room's field. */
  let left: { code: string; via: JoinVia } | null = null;
  /** `via`: where the join started, for the counts (lib/count.ts). */
  function startJoin(roomCode: string, n: string, from: 'join' | 'rooms', via: JoinVia) {
    joining = { code: roomCode, via };
    busy = from;
    session.join(roomCode, n, false, via);
    // Turned down on the spot (a code that can't be one).
    if (!connecting) settle();
  }
  function settle() {
    if (joining && !session.state && busy !== 'rooms') {
      code = joining.code;
      left = joining;
      codeError = session.codeDoubted;
      if (!invite) open = 'join';
      if (session.nameRefused) void tick().then(() => (invite ? inviteField : nameField)?.focus());
    }
    joining = null;
    busy = null;
  }
  $effect(() => {
    if (!connecting) untrack(settle);
  });

  /**
   * A paste is cleaned before the field's length limit applies, so spaces or
   * line breaks copied along with a code (e.g. from the lobby's big letters)
   * don't use up its six places. A pasted invite link gives its room code.
   */
  function pasteCode(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text');
    if (text == null) return;
    e.preventDefault();
    const field = e.currentTarget as HTMLInputElement;
    const linked = /[?&]room=([^&#\s]+)/.exec(text)?.[1];
    if (linked) code = linked;
    else code = code.slice(0, field.selectionStart ?? code.length) + text + code.slice(field.selectionEnd ?? code.length);
    codeChanged();
  }

  /** Arrows, Enter and Escape on the menu; not while typing (but Escape), in a dialog, or once something else has the screen. */
  function keys(e: KeyboardEvent) {
    if (invite || session.state || codexRoute.open || settingsRoute.open || document.querySelector('[aria-modal="true"]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (e.key === 'Escape') {
      // Claimed while a row is open, joining or not: it doesn't open the settings over a join.
      if (open) {
        e.preventDefault();
        if (!connecting) closeRow();
      }
      return;
    }
    if (typing(e) || connecting || renaming || compact.current) return;
    const next = cursorKey(e.key, cursor);
    if (next !== null) {
      e.preventDefault();
      cursor = next;
      entryEls[next]?.focus();
    } else if (e.key === 'Enter' && (!t || t === document.body)) {
      e.preventDefault();
      choose(ENTRIES[cursor]);
    }
  }

  /** The cursor follows the mouse (touch has none). */
  function hover(e: PointerEvent, i: number) {
    // (A finger landing on an entry points at it too.)
    readyCodex(ENTRIES[i]);
    if (e.pointerType !== 'mouse') return;
    hovered = true;
    if (open === ENTRIES[i]) clearTimeout(idleTimer);
    if (!connecting) cursor = i;
  }
  /** The mouse is over an entry. */
  let hovered = $state(false);
  /** An entry has the keyboard's focus (not a click's). */
  let keyFocus = $state(false);
  /** The open row's field has the focus. */
  let rowFocus = $state(false);
  function focusIn(e: FocusEvent) {
    const t = e.target as HTMLElement;
    keyFocus = t.matches('.pick:focus-visible');
    rowFocus = !!t.closest('.slot');
  }
  function focusOut() {
    keyFocus = false;
    rowFocus = false;
  }
  /** The cursor shows while an entry is pointed at, chosen from the keyboard, typed in or connecting; otherwise it fades away. */
  const lit = $derived(!renaming && (hovered || keyFocus || ((!!open || !!invite) && rowFocus) || connecting));

  // ---- the invite link's screen ----

  // An invite is the start page with the choice already made: the menu holds
  // the one room to join (and a way to everything else), the right-hand
  // column the room as the lobby will show it (InviteRoom).
  let inviteName = $state(firstLook ? '' : savedName());
  /** What the room said when asked: its info, 'gone', null (no answer), or undefined while asking. */
  let inviteInfo = $state<RoomInfo | 'gone' | null | undefined>(undefined);
  const inviteHost = $derived(inviteInfo && inviteInfo !== 'gone' ? inviteInfo.host : '');
  let inviteField = $state<HTMLInputElement>();
  function joinInvite(e?: Event) {
    e?.preventDefault();
    // (Saved once the room takes it, as Join a room's.)
    const n = checkName(inviteName, inviteField);
    if (!n) return;
    // Out of the address first: the guard Back meets in the room (lib/backGuard.ts)
    // goes up in this tap over this entry, and leaving the room goes back to it,
    // which mustn't be the invite again, to join it once more. (The screen stays
    // for a join that fails.)
    clearInviteAddress();
    startJoin(invite, n, 'join', inviteVia);
  }
  /** The address without the invite (its room, and what older links and the beta's first look add). */
  function clearInviteAddress() {
    history.replaceState(history.state, '', withoutInvite(location.href));
  }
  function leaveInvite() {
    clearInviteAddress();
    invite = '';
  }
  // Joined: the link has done its job (a reload shouldn't ask again).
  $effect(() => {
    if (session.state && invite) leaveInvite();
  });
  // The invite screen is for a first visit, when there is no name yet. A
  // player with a name goes straight on to the room: the start page shows the
  // join on its way in Join a room's row, and a join that fails leaves the
  // code there with the toast, to try again. Not over a game being resumed
  // (App resumes it on mount, after this).
  const opened = untrack(() => ({ code: invite, name: known }));
  if (opened.code && nameUsable(opened.name)) {
    const { code, name } = opened;
    leaveInvite();
    cursor = ENTRIES.indexOf('join');
    setTimeout(() => {
      if (session.status === 'idle' && !session.state) startJoin(code, name, 'join', inviteVia);
    });
  } else if (opened.code) {
    // A first visit: the room is asked whose it is and how it stands, so the
    // screen shows the room as it is (nothing a link says about it is taken
    // on trust). Undefined while it is asked (lib/rooms.ts probeRoom).
    void probeRoom(opened.code).then((r) => {
      if (invite === opened.code) inviteInfo = r;
    });
  }

  const MENU: Record<Entry, string> = {
    create: 'New game',
    join: 'Join a room',
    codex: 'Codex',
    settings: 'Settings',
  };
  const about = $derived<Record<Entry, string>>({
    create: 'Host your party online or at one screen, or play alone.',
    join: 'With the code a friend sent you.',
    codex: codexLine(discovered, total, deepest),
    settings: 'Sound, keys, your name, colour and class sigil.',
  });
  const PAIR = [
    { e: 'codex', name: 'Codex' },
    { e: 'settings', name: 'Settings' },
  ] as const;
  /** The pair's lines in one column, short enough for half a phone's width. */
  const pairLines = $derived<Record<'codex' | 'settings', string[]>>({
    codex: codexLines(discovered, total, deepest),
    settings: ['Sound, keys, sigil.'],
  });
</script>

<svelte:window onkeydown={keys} onpointerdown={outsidePress} onclickcapture={outsideTap} />

<!-- Join's code field, in either layout: capitals, no autocorrect, a Go key. -->
{#snippet codeInput(short: boolean)}
  <input
    class="field code"
    class:short
    class:bad={codeError}
    bind:this={codeField}
    bind:value={code}
    oninput={codeChanged}
    onpaste={pasteCode}
    placeholder="Code"
    maxlength={CODE_LENGTH}
    autocomplete="off"
    spellcheck="false"
    aria-label="Room code"
    aria-invalid={codeError}
    autocapitalize="characters"
    autocorrect="off"
    enterkeyhint="go"
  />
{/snippet}

<!-- An invite's name and Join, in either layout (in the actions layout under its heading, as Join's row is set). -->
{#snippet inviteJoin(act: boolean)}
  <div class="under">
    {#if connecting}
      <div class="slot" in:fly={SWAP_IN} out:fade={SWAP_OUT}><Connecting /></div>
    {:else}
      <form class="slot row" class:join={act} onsubmit={joinInvite} aria-labelledby={act ? 'invite-label' : undefined} in:fly={SWAP_IN} out:fade={SWAP_OUT}>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="field name" bind:this={inviteField} bind:value={inviteName} maxlength={MAX_NAME} placeholder="Your name" aria-label="Your name" autocomplete="off" spellcheck="false" autocorrect="off" enterkeyhint={act ? 'go' : undefined} autofocus />
        <button class="btn primary" type="submit">Join</button>
      </form>
    {/if}
  </div>
{/snippet}

<div class="home" class:invited={!!invite} class:compact={compact.current}>
  <div class="intro">
    <div class="title">
      <GameTitle />
      {#if BETA || LOCAL}<span class="beta" in:fade|global={calm({ duration: 600 })}>{BETA ? 'Beta' : 'Local'}</span>{/if}
    </div>
    <p class="kicker" in:fade|global={calm({ duration: 700, delay: 200 })}>Unique item trivia</p>
    <p class="blurb" in:fade|global={calm({ duration: 700, delay: 300 })}>
      Path of Exile 2 item trivia, alone or with <span class="wide">up to eleven</span> friends.
    </p>

    <!-- The greeting: the name is asked once, then greeted (and changed here). -->
    <div class="greeting" in:fade|global={calm({ duration: 600, delay: 350 })}>
      {#if renaming}
        <form class="row" onsubmit={saveRename}>
          <!-- No autofill on the name fields: its list is the browser's own and drops the game's cursor; the game remembers the name itself.
               No autocorrect either (tests/nameFields.test.ts): a gamer tag is seldom a word, and Gboard and iOS would make it one (Wolfsberg went in as Wolfsburg).
               The first letter is still capitalised as the keyboard likes: that only sets the shift key, and a name typed lower case stays so. -->
          <input
            class="field name"
            bind:this={renameField}
            bind:value={draft}
            maxlength={MAX_NAME}
            placeholder="Your name"
            aria-label="Your name"
            autocomplete="off"
            spellcheck="false"
            autocorrect="off"
            onkeydown={renameKeys}
          />
          <button class="btn" type="submit">Save</button>
          <button class="link" type="button" onclick={() => (renaming = false)}>Cancel</button>
        </form>
      {:else}
        <p class="hello" class:named={!!known}>
          {known ? 'Welcome back,' : 'Welcome,'}
          {#if invite}
            <!-- An invite asks the name in its own row: the greeting only greets. -->
            <span class="who">{known || 'Exile'}.</span>
          {:else}
            <!-- The name and its quill keep together, the name giving way (an ellipsis) before the quill would leave the screen. -->
            <span class="you">
              <button class="who" onclick={startRename} disabled={connecting} title="Change your name">{known || 'Exile'}.</button>
              <button class="quill" onclick={startRename} disabled={connecting} tabindex="-1" aria-hidden="true">
                <span class="ring"><svg viewBox="0 0 24 24"><path d="M5 19l2.5-.6L18 7.9a1.9 1.9 0 0 0-2.7-2.7L4.8 15.7 4.2 18.2zM14 6.5l3.2 3.2" /></svg></span>
                <i>Change your name</i>
              </button>
            </span>
          {/if}
        </p>
      {/if}
    </div>

    <nav class="menu" class:renaming class:lit aria-label="Start" onfocusin={focusIn} onfocusout={focusOut}>
      <!-- One cursor for the menu: it glides to the entry under the mouse (or the
           keyboard's), and cools away once nothing is pointed at. -->
      {#if !compact.current}<MenuCursor at={cursor} {lit} />{/if}
      {#if invite && compact.current}
        <!-- An invite in the actions layout: its join as Join's row is set, with the name, and the way to everything else as the pair's entries are. -->
        <div class="act" in:fly|global={calm({ y: 12, duration: 500, delay: 300 })}>
          <div class="act-top">
            <h2 class="act-head" id="invite-label">{inviteHost ? `Join ${inviteHost}’s room` : 'Join the room'}</h2>
          </div>
          {@render inviteJoin(true)}
        </div>
        <div class="pair" class:dimmed={connecting} inert={connecting} in:fly|global={calm({ y: 12, duration: 500, delay: 370 })}>
          <button class="pair-pick" onclick={leaveInvite}>
            <span class="pair-name">Something else<span class="go"><DrawnMark shape="chevron" /></span></span>
            <span class="pair-line">Start a new game, or open the Codex or the settings.</span>
          </button>
        </div>
      {:else if invite}
        <div class="entry" role="presentation" class:cur={cursor === 0} onpointerenter={(ev) => hover(ev, 0)} onpointerleave={leave} in:fly|global={calm({ y: 12, duration: 500, delay: 300 })}>
          <button class="pick" bind:this={entryEls[0]} onclick={() => inviteField?.focus()} onfocus={() => (cursor = 0)}>
            {inviteHost ? `Join ${inviteHost}’s room` : 'Join the room'}
          </button>
          {@render inviteJoin(false)}
        </div>
        <div class="entry" role="presentation" class:cur={cursor === 1} class:dimmed={connecting} inert={connecting} onpointerenter={(ev) => hover(ev, 1)} onpointerleave={leave} in:fly|global={calm({ y: 12, duration: 500, delay: 370 })}>
          <button class="pick" bind:this={entryEls[1]} onclick={leaveInvite} onfocus={() => (cursor = 1)}>Something else</button>
          <div class="under"><p class="about">Start a new game, or open the Codex or the settings.</p></div>
        </div>
      {:else if compact.current}
        <!-- New game: the page's one big button, and its gold one until Join's code is whole
             (then Join holds the gold and this goes plain), unless Create's own row is the one open.
             On a first visit its row asks the name. -->
        <div class="act" bind:this={boxes[0]} class:dimmed={connecting && busyEntry !== 'create'} inert={connecting && busyEntry !== 'create'} in:fly|global={calm({ y: 12, duration: 500, delay: 300 })}>
          <!-- On a first visit the button gives way to the name and its own Create, in its place. -->
          <div class="under">
            {#if open === 'create' && !connecting}
              <form class="slot row tall" onsubmit={host} in:fly={SWAP_IN} out:fade={SWAP_OUT}>
                <input class="field name" bind:this={nameField} bind:value={nameInput} maxlength={MAX_NAME} placeholder="Your name" aria-label="Your name" autocomplete="off" spellcheck="false" autocorrect="off" enterkeyhint="go" />
                <button class="btn" class:primary={!joinReady || open === 'create'} type="submit">Start</button>
              </form>
            {:else}
              <button class="btn big" class:primary={!joinReady || open === 'create'} bind:this={entryEls[0]} onclick={() => choose('create')} in:fade={SWAP_OUT}>New game</button>
            {/if}
          </div>
          <div class="under">
            {#if busyEntry === 'create'}
              <div class="slot" in:fly={SWAP_IN} out:fade={SWAP_OUT}><Connecting /></div>
            {:else}
              <p class="about" in:fly={SWAP_IN} out:fade={SWAP_OUT}>{about.create}</p>
            {/if}
          </div>
        </div>
        <!-- Join a room: the code field is always out; a first visit's name joins it when it's needed. -->
        <div class="act" bind:this={boxes[1]} class:dimmed={connecting && busyEntry !== 'join'} inert={connecting && busyEntry !== 'join'} in:fly|global={calm({ y: 12, duration: 500, delay: 370 })}>
          <div class="act-top">
            <h2 class="act-head" id="join-label">Join a room</h2>
            <!-- Open rooms sit below Today's unique: when there are any, this says so from up here. -->
            {#if asking && !connecting}
              <button class="to-rooms" onclick={backToCode} aria-label="Change the code, {code}" in:fade={{ duration: 300 }}>Code <span class="shown-code">{code}</span> • change</button>
            {:else if roomCount && !connecting}
              <button class="to-rooms" onclick={toRooms} in:fade={{ duration: 300 }}>
                <span><span class="n">{roomCount}</span> {roomSeats ? `open ${roomCount === 1 ? 'room' : 'rooms'}` : `${roomCount === 1 ? 'room' : 'rooms'} to watch`}</span><span class="down"><DrawnMark shape="chevron" /></span>
              </button>
            {/if}
          </div>
          <div class="under">
            {#if busyEntry === 'join'}
              <div class="slot" in:fly={SWAP_IN} out:fade={SWAP_OUT}><Connecting /></div>
            {:else}
              <!-- The code, or on a first visit once it's whole, the name in its place: one field, where the last one was. -->
              <form class="slot row join" onsubmit={phoneJoin} aria-labelledby="join-label" in:fly={SWAP_IN} out:fade={SWAP_OUT}>
                {#if asking}
                  <input class="field name" bind:this={nameField} bind:value={nameInput} maxlength={MAX_NAME} placeholder="Your name" aria-label="Your name" autocomplete="off" spellcheck="false" autocorrect="off" enterkeyhint="go" />
                {:else}
                  {@render codeInput(false)}
                {/if}
                <!-- Lit once a join can go, and New game gives up its gold: one lit button at a time. -->
                <button class="btn" class:primary={joinReady && open !== 'create'} type="submit">Join</button>
              </form>
            {/if}
          </div>
        </div>
        <!-- The Codex and Settings: set as the list's entries are, side by side. -->
        <div class="pair two" class:dimmed={connecting} inert={connecting} in:fly|global={calm({ y: 12, duration: 500, delay: 440 })}>
          {#each PAIR as { e, name } (e)}
            <button class="pair-pick" bind:this={entryEls[ENTRIES.indexOf(e)]} onclick={() => choose(e)} onpointerenter={() => readyCodex(e)} onfocus={() => readyCodex(e)}>
              <span class="pair-name">{name}<span class="go"><DrawnMark shape="chevron" /></span></span>
              {#each pairLines[e] as line}<span class="pair-line">{line}</span>{/each}
            </button>
          {/each}
        </div>
      {:else}
        {#each ENTRIES as e, i (e)}
          {@const isOpen = open === e && !connecting}
          {@const isBusy = busyEntry === e}
          <div
            class="entry"
            role="presentation"
            bind:this={boxes[i]}
            class:cur={cursor === i}
            class:dimmed={connecting && !isBusy}
            inert={connecting && !isBusy}
            onpointerenter={(ev) => hover(ev, i)}
            onpointerleave={leave}
            in:fly|global={calm({ y: 12, duration: 500, delay: 300 + i * 70 })}
          >
            <button class="pick" bind:this={entryEls[i]} onclick={() => choose(e)} onfocus={() => (cursor = i)} aria-expanded={e === 'create' || e === 'join' ? isOpen : undefined}>
              {MENU[e]}
            </button>
            <!-- The description and the fields share one cell, so one fades into the other. -->
            <div class="under">
              {#if isBusy}
                <div class="slot" in:fly={SWAP_IN} out:fade={SWAP_OUT}><Connecting /></div>
              {:else if isOpen && e === 'create'}
                <form class="slot row" onsubmit={host} in:fly={SWAP_IN} out:fade={SWAP_OUT}>
                  <input class="field name" bind:this={nameField} bind:value={nameInput} maxlength={MAX_NAME} placeholder="Your name" aria-label="Your name" autocomplete="off" spellcheck="false" autocorrect="off" />
                  <button class="btn primary" type="submit">Start</button>
                </form>
              {:else if isOpen && e === 'join'}
                <form class="slot row" onsubmit={join} in:fly={SWAP_IN} out:fade={SWAP_OUT}>
                  {#if !known}
                    <input class="field name short" bind:this={nameField} bind:value={nameInput} maxlength={MAX_NAME} placeholder="Your name" aria-label="Your name" autocomplete="off" spellcheck="false" autocorrect="off" />
                  {/if}
                  {@render codeInput(!known)}
                  <button class="btn primary" type="submit">Join</button>
                </form>
              {:else}
                <p class="about" in:fly={SWAP_IN} out:fade={SWAP_OUT}>{about[e]}</p>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </nav>
  </div>

  <div class="today" in:fade|global={calm({ duration: 900, delay: 150 })}>
    {#if invite}
      <InviteRoom code={invite} info={inviteInfo} name={inviteName} />
    {:else}
      <DailyUnique disabled={connecting} />
    {/if}
  </div>

  {#if !invite}
    <div class="rooms" class:dimmed={connecting && busyEntry !== 'rooms'} inert={connecting && busyEntry !== 'rooms'} in:fly|global={calm({ y: 20, duration: 600, delay: 450 })}>
      <OpenRooms onJoin={joinListed} disabled={connecting} joining={busyEntry === 'rooms' ? session.code : null} bind:count={roomCount} bind:seats={roomSeats} />
    </div>
  {/if}

  <div class="foot"><SiteFooter /></div>
</div>

<style>
  /* One stage, at most 1440 px wide and centred: two columns (the menu,
     Today's unique) at their own sizes, 1200 px across in all, then the open
     rooms across it, then the footer. Narrower windows give up side padding
     (down to 32 px, or a phone's notch on its side if that is wider) before
     anything else, then stack in one column.
     Columns and rooms sit in the middle of the window's height, the footer at
     its bottom. On large windows the whole app is scaled up (lib/stage.ts,
     App.svelte's shell).
     The rooms' list has a frame of its own, as tall whether the list is
     searching, empty or long, and a longer list scrolls inside it. Fixed,
     not grown into a taller window: the shell sizes the page by its
     content, under which a growing row always takes its most.
     On a wide window everything fits, the footer too: three rhythms by the
     window's height, each adding up to it (980, which big screens zoom to;
     the laptop's from 979 down to 845, 900 say; and below that a smaller
     one, for the 13-inch laptop's 725). */
  .home {
    --slot: 108px;
    width: 100%;
    max-width: 1440px;
    margin-inline: auto;
    /* The height App.svelte gives it: the window's, below the header if one is up. */
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 452px) minmax(0, 510px);
    /* The free height splits above and below the block; the footer stays last. */
    grid-template-rows: 1fr auto auto 1fr auto;
    grid-template-areas:
      '. .'
      'intro today'
      'rooms rooms'
      '. .'
      'foot foot';
    justify-content: space-between;
    column-gap: 40px;
    padding: 26px max(32px, (min(100%, 1440px) - 1200px) / 2, env(safe-area-inset-right)) 22px
      max(32px, (min(100%, 1440px) - 1200px) / 2, env(safe-area-inset-left));
  }
  .intro {
    /* The title's size; the kicker under it is fitted to it. */
    --title-size: 92px;
    grid-area: intro;
    min-width: 0;
  }
  .today {
    grid-area: today;
    min-width: 0;
    padding-top: 6px;
  }
  .rooms {
    grid-area: rooms;
    margin-top: 44px;
    transition: opacity 0.3s;
  }
  .foot {
    grid-area: foot;
    margin-top: 32px;
  }
  /* Wide windows, 980 tall and up: 26 + 650 (the columns) + 44 + 153 (the
     rooms) + 32 + 49 (the footer) + 22 = 976. */
  @media (min-width: 1081px) {
    .home {
      /* The rooms' block below its margin: the list's header (48) and its frame, a row of rooms (72), the gap and 21 of the next row. */
      --rooms-h: calc(48px + 105px);
    }
    /* A height of its own (none on an invite, which has no rooms): the list's frame takes what its header leaves and scrolls a long list. */
    .rooms {
      height: var(--rooms-h);
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .rooms > :global(section) {
      flex: 1 1 0;
    }
    .rooms :global(.frame) {
      flex: 1 1 0;
      min-height: 0;
      overflow-y: auto;
      /* Room for the rooms' shadows and hover glow, which the frame would clip at its edges. */
      margin: -14px -24px 0;
      padding: 14px 24px 0;
      scrollbar-width: thin;
      scrollbar-color: var(--gold-lo) transparent;
    }
  }

  /* ---- the title ---- */
  .title {
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }
  /* Marks the beta build (poe2.quest/beta/), or the dev server's own rooms (Local), so testers know where they are. */
  .beta {
    margin-top: 10px;
    padding: 0.2rem 0.4rem 0.15rem 0.6rem;
    border: 1px solid rgba(224, 138, 68, 0.5);
    border-radius: 3px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  /* The site's old kicker, under the title now: small, spaced capitals in the unique colour. */
  .kicker {
    position: relative;
    margin: 2px 0 4px;
    font-family: var(--font-display);
    font-size: max(10px, var(--title-size) * 0.147);
    line-height: 1.3;
    /* Ends under the left tip of the Q's tail at any title size: that tip sits
       2.3313 title sizes right of the P's stem, and the kicker's ink runs
       8.4836em plus its 17 letter spacings. */
    letter-spacing: calc((var(--title-size) * 2.3313 - 8.4836em) / 17);
    text-transform: uppercase;
    color: var(--unique-hi);
  }
  .blurb {
    position: relative;
    margin: 2px 0 0;
    font-size: 17px;
    color: #a99c86;
  }

  /* ---- the greeting ---- */
  .greeting {
    /* A long name wraps the greeting onto a second line. */
    min-height: 44px;
    margin: 16px 0;
    display: flex;
    align-items: center;
  }
  .hello {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 0.3em;
    min-width: 0;
    /* Inside the greeting's 44 px on one line; two lines keep clear of what's under them. */
    padding-block: 6px;
    margin: 0;
    font-family: var(--font-display);
    font-size: 20px;
    color: var(--gold);
  }
  .you {
    position: relative;
    display: inline-flex;
    align-items: center;
    /* The greeting's own gap, between the name and its quill too. */
    gap: 0.3em;
    min-width: 0;
    max-width: 100%;
  }
  /* With a mouse the quill shows only on hover: it takes no room in the line,
     so a name wraps (or gives way to an ellipsis) only when its own words
     don't fit. Where it stands is unchanged: past the name, the gap between. */
  @media (hover: hover) {
    .you .quill {
      position: absolute;
      top: 50%;
      left: 100%;
      /* The gap from the name is the quill's own padding, so the mouse on its
         way across from the name keeps the greeting hovered. */
      margin-left: 0;
      padding-left: calc(0.3em + 6px);
      /* Centred on the name at its own height (translate is its slide in on hover). */
      transform: translateY(-50%);
      /* Its own width, not the name's: Change your name stays on one line. */
      width: max-content;
    }
  }
  .who {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    font: inherit;
    color: #f1d99b;
  }
  .who:disabled,
  span.who {
    cursor: default;
  }
  /* The rename affordance shows on hovering the greeting with a mouse, never at rest. */
  .quill {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: 6px;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--gold);
    opacity: 0;
    visibility: hidden;
    translate: -4px 0;
    transition:
      opacity 0.2s,
      translate 0.2s var(--ease-out),
      visibility 0s 0.2s;
  }
  .hello:hover .quill:not(:disabled) {
    opacity: 1;
    visibility: visible;
    translate: 0 0;
    transition:
      opacity 0.2s,
      translate 0.2s var(--ease-out);
  }
  .ring {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid var(--gold-lo);
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.35);
  }
  .ring svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .quill i {
    font-family: var(--font-body);
    font-size: 15px;
    color: var(--muted);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .row .field {
    height: 40px;
    padding: 0 12px;
    font-size: 17px;
  }
  .row .btn {
    height: 40px;
    flex: none;
  }
  .greeting .name {
    width: 240px;
  }
  .link {
    min-height: 40px;
    padding: 0 4px;
    background: none;
    border: 0;
    cursor: pointer;
    font-style: italic;
    font-size: 15px;
    color: var(--muted);
    text-decoration: underline;
    text-decoration-color: var(--gold-lo);
    text-underline-offset: 3px;
  }
  .link:hover {
    color: var(--gold-hi);
  }

  /* ---- the menu ---- */
  .menu {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  /* Every entry in a slot of its own, so nothing moves when one opens. */
  .entry {
    position: relative;
    height: var(--slot);
    transition: opacity 0.3s;
  }
  .pick {
    display: block;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 32px;
    line-height: 36px;
    letter-spacing: 0;
    text-align: left;
    color: #d9c08a;
    transition:
      color 1.2s ease,
      text-shadow 1.2s ease;
  }
  .pick:focus-visible {
    outline-offset: 4px;
  }
  /* The whole slot takes the click, as it takes the hover: no need to aim
     at the title. An open row sits above it, so its fields work as usual. */
  .pick::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  .about {
    margin: 6px 0 0;
    font-style: italic;
    font-size: 16px;
    color: #ab9d88;
  }
  .under {
    display: grid;
  }
  .under > :global(*) {
    grid-area: 1 / 1;
  }
  .slot {
    position: relative;
    z-index: 1;
    margin-top: 10px;
  }
  .name {
    width: 300px;
  }
  .name.short {
    width: 216px;
  }
  .code {
    width: 170px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    letter-spacing: 0.35em;
    text-align: center;
    text-transform: uppercase;
  }
  .code.short {
    width: 140px;
  }
  .code::placeholder {
    letter-spacing: 0.35em;
  }
  .code.bad,
  .code.bad:focus {
    border-color: var(--bad);
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.55),
      0 0 0 3px rgba(224, 85, 63, 0.14);
  }
  @media (hover: hover) {
    .lit .cur .pick {
      color: #fff1cf;
      text-shadow: 0 0 18px rgba(241, 217, 155, 0.35);
      transition:
        color 0.2s,
        text-shadow 0.25s;
    }
  }
  .dimmed {
    opacity: 0.45;
    pointer-events: none;
  }

  /* ---- the menu in one column (only rendered there) ---- */
  .act {
    position: relative;
    margin-bottom: 26px;
    transition: opacity 0.3s;
  }
  .btn.big {
    width: 100%;
    height: 54px;
    font-size: 15px;
    letter-spacing: 0.14em;
  }
  .act .about {
    margin: 8px 0 0;
  }
  .act .slot {
    margin-top: 12px;
  }
  .act .slot.tall {
    margin-top: 0;
  }
  .slot.row.tall .field,
  .slot.row.tall .btn {
    height: 54px;
  }
  .slot.row.tall .btn {
    flex: none;
    width: 120px;
  }
  .act-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  /* Join's heading is a label, not a thing to tap: small spaced capitals,
     as the kicker under the title is set, so it never reads as an entry. */
  .act-head {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 14px;
    line-height: 20px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #a99c86;
  }
  /* The Codex and Settings (or an invite's way to everything else) as the
     list's entries are set, a size down, each with a chevron that says it goes somewhere. */
  .pair-name {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: 25px;
    line-height: 30px;
    color: #d9c08a;
    transition:
      color 1.2s ease,
      text-shadow 1.2s ease;
  }
  .go {
    --mark-size: 10px;
    --mark-stroke: 1.6px;
    color: var(--gold);
    translate: 0 1px;
    transition: translate 0.2s var(--ease-out);
  }
  .pair-pick:hover .go,
  .pair-pick:active .go {
    translate: 3px 1px;
  }
  .act-top + .under .slot {
    margin-top: 0;
  }
  /* The row's height while it connects too, so what's under it stays put. */
  .act-top + .under {
    min-height: 44px;
  }
  .to-rooms {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    /* A tap target of 44 px around one line of text. */
    margin: -12px 0;
    padding: 12px 0;
    background: none;
    border: 0;
    cursor: pointer;
    font-style: italic;
    font-size: 15px;
    color: var(--gold);
    white-space: nowrap;
  }
  .to-rooms:hover {
    color: var(--gold-hi);
  }
  /* A room code is set in Cinzel, as everywhere else. */
  .shown-code {
    font-family: var(--font-cinzel);
    font-style: normal;
    letter-spacing: 0.08em;
  }
  /* The number among the words in Cinzel, as everywhere in the game. */
  .to-rooms .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
    font-size: 0.86em;
  }
  .to-rooms .down {
    --mark-size: 9px;
    --mark-stroke: 1.4px;
    rotate: 90deg;
  }
  /* The code field reads as one to type in: its edge drawn, its placeholder lit a step. */
  .act .code:not(.bad) {
    border-color: var(--gold-lo);
  }
  .act .code::placeholder {
    color: #8a7d68;
  }
  .slot.row.join .code,
  .slot.row.join .name {
    flex: 1 1 0;
    min-width: 0;
  }
  .slot.row.join .btn {
    flex: none;
    width: 104px;
  }
  .pair {
    display: grid;
    transition: opacity 0.3s;
  }
  .pair.two {
    grid-template-columns: 1fr 1fr;
  }
  .pair-pick {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 44px;
    padding: 2px 0;
    text-align: left;
    background: none;
    border: 0;
    cursor: pointer;
  }
  /* A hairline between the two, fading out at both ends as the footer's rule does. */
  .pair-pick + .pair-pick {
    padding-left: 18px;
    border-left: 1px solid transparent;
    border-image: linear-gradient(180deg, transparent, rgba(125, 99, 51, 0.55) 30%, rgba(125, 99, 51, 0.55) 70%, transparent) 1;
  }
  /* Lit as the list's entry under the cursor is: on hover, and while pressed. */
  .pair-pick:hover .pair-name,
  .pair-pick:active .pair-name {
    color: #fff1cf;
    text-shadow: 0 0 18px rgba(241, 217, 155, 0.35);
    transition:
      color 0.2s,
      text-shadow 0.25s;
  }
  .pair-pick:focus-visible {
    outline-offset: 4px;
  }
  .pair-line {
    font-style: italic;
    font-size: 15px;
    line-height: 1.3;
    color: #ab9d88;
  }

  /* Under 980 tall (900, say): a tighter rhythm. 16 + 574 + 8 + 144 + 32 +
     49 + 22 = 845. */
  @media (max-height: 979px) and (min-width: 1081px) {
    .home {
      --slot: 92px;
      /* Header 40, a row of rooms (72), the gap and 20 of the next row. */
      --rooms-h: calc(40px + 104px);
      /* Today's unique at this height (DailyUnique's defaults are the 980 tall window's). */
      --daily-stage-h: 401px;
      --daily-circle: 456px;
      --daily-circle-y: 230px;
      --daily-art-inset: 14% 26% 21%;
      --daily-fade-from: 50.7%;
      --daily-fade-to: 81.4%;
      --daily-title-size: 20px;
      --daily-title-lh: 29px;
      --daily-title-gap: -7px;
      --daily-line-size: 15px;
      --daily-line-lh: 21px;
      --daily-legend-gap: 11px;
      --daily-after-h: 36px;
      --daily-after-gap: 4px;
      --rooms-head-gap: 8px;
      padding-top: 16px;
    }
    .intro {
      --title-size: 80px;
    }
    .greeting {
      margin: 8px 0 6px;
    }
    .today {
      padding-top: 0;
    }
    .rooms {
      margin-top: 8px;
    }
  }
  /* Under 845 tall (a 13-inch laptop's 725): tighter still, and a smaller
     title and Today's unique. 10 + 527 + 6 + 120 + 10 + 39 + 10 = 722. */
  @media (max-height: 844px) and (min-width: 1081px) {
    .home {
      /* Header 40, a row of rooms (72) and 8 of the gap. */
      --rooms-h: calc(40px + 80px);
      --daily-stage-h: 363px;
      --daily-circle: 413px;
      --daily-circle-y: 208px;
      --daily-legend-gap: 8px;
      --daily-after-h: 32px;
      --daily-after-gap: 2px;
      padding-top: 10px;
      padding-bottom: 10px;
    }
    .intro {
      --title-size: 64px;
    }
    .greeting {
      margin: 3px 0 1px;
    }
    .rooms {
      margin-top: 6px;
    }
    .foot {
      margin-top: 10px;
    }
    .foot :global(.band) {
      margin-top: 12px;
    }
  }

  /* Too narrow for the two columns side by side: one column, at most 560 px
     wide (the menu, the open rooms, then Today's unique). */
  @media (max-width: 1080px) {
    .home {
      grid-template-columns: minmax(0, 560px);
      grid-template-rows: 1fr auto auto auto 1fr auto;
      grid-template-areas:
        '.'
        'intro'
        'rooms'
        'today'
        '.'
        'foot';
      justify-content: center;
    }
    .rooms {
      margin-top: 16px;
    }
    .today {
      padding-top: 32px;
    }
    /* The actions layout: Today's unique straight after them, the open rooms
       last (Join points down to them when there are any). */
    .home.compact {
      grid-template-areas:
        '.'
        'intro'
        'today'
        'rooms'
        '.'
        'foot';
    }
    .compact .rooms {
      margin-top: 40px;
    }
    .compact .today {
      padding-top: 14px;
    }
    /* An invite's room starts with a heading, not the daily's art with its own air above it. */
    .compact.invited .today {
      padding-top: 40px;
    }
  }
  /* Phones: tighter gutters and a smaller title (the column stays at most 560 px); no cursor. */
  @media (max-width: 640px) {
    .home {
      padding: 28px max(16px, env(safe-area-inset-right)) 20px max(16px, env(safe-area-inset-left));
    }
    .intro {
      --title-size: 54px;
    }
    .blurb {
      font-size: 15px;
    }
    .wide {
      display: none;
    }
    .greeting {
      margin: 8px 0 4px;
    }
    .hello {
      font-size: 17px;
    }
    .greeting .name {
      width: auto;
      flex: 1;
      min-width: 0;
    }
    .entry {
      height: auto;
      min-height: 98px;
      padding-bottom: 12px;
    }
    .menu :global(.cursor) {
      display: none;
    }
    .pick {
      font-size: 28px;
      line-height: 34px;
    }
    .about {
      font-size: 15px;
    }
    .row {
      flex-wrap: wrap;
    }
    .slot.row .field {
      flex: 1 1 140px;
      width: auto;
      min-width: 0;
    }
    .slot.row .btn {
      flex: 1 0 auto;
    }
  }
  /* One column on a short screen (a phone on its side): the phone's title,
     so the actions start within the first screen. Not on a phone upright,
     whose window some browsers shorten while the keyboard is up: the page
     would shift under the field being typed in. */
  @media (min-width: 641px) and (max-width: 1080px) and (max-height: 520px) {
    /* The actions layout only: a mouse's list keeps its title. */
    .home.compact {
      padding-top: 16px;
    }
    .compact .intro {
      --title-size: 54px;
    }
    .compact .greeting {
      margin: 6px 0 4px;
    }
  }
  /* Touch never hovers the greeting: the quill shows at rest beside the name
     (its ring alone, in a tap target of 44 px), so renaming can be found. */
  @media (hover: none) {
    .named .quill:not(:disabled) {
      /* The 44 px target's padding stands clear of the name: the ring itself sits 8 px from it. */
      margin: -8px -8px -8px -0.3em;
      padding: 8px;
      opacity: 1;
      visibility: visible;
      translate: 0 0;
    }
    .quill .ring {
      width: 28px;
      height: 28px;
    }
    .quill i {
      display: none;
    }
    button.who {
      margin: -10px 0;
      padding: 10px 0;
    }
  }
  @media (pointer: coarse) {
    .row .field,
    .row .btn {
      height: 44px;
    }
  }
</style>
