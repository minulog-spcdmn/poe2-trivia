// Session: owns the game state and wires it to either the local device
// (hot-seat), a hosted PeerJS room, or a connection to someone else's room.
//
// Trust model: the host runs the game and is trusted by definition (it has the
// answers). Guests are not: they only receive a redacted copy of the state,
// get question art as altered image bytes (sealed until the question's clock
// starts, seal.ts), identify themselves with a secret
// token that only this room's host ever sees (a different one per room), and
// everything they send is checked and rate limited, down to the raw frames.

import Peer, { type DataConnection } from 'peerjs';
import itemData from '../data/items.json';
import fakeNames from '../data/fakes.json';
import {
  Engine,
  createGame,
  ActionError,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  publicView,
  grayscaleFor,
  ANSWER_GRACE_MS,
  autoNextLeft,
  renameCategories,
  DEFAULT_SETTINGS,
  questionClock,
  activeRules,
  clockRuns,
  type Action,
  type GameState,
  type Grayscale,
  type Item,
} from './game';
import { PEER_OPTIONS, PEER_PREFIX } from './peer';
import { Beacon, ProbeDesk, answerProbes, type RoomInfo } from './rooms';
import { isMedia, isVersionRefusal, parseClientMsg, parseHostMsg, PROTOCOL_VERSION, RateLimit, versionProblem, versionRefusal, type HostMsg, type MediaMsg } from './protocol';
import { capped, ChunkGuard, frameFits, FrameGuard, hookFrames, JoinGate, MAX_HOST_MSG_BYTES, roomSecret } from './guard';
import { LaneReceiver, LaneSender, openLane, parseFakeLink } from './artLane';
import { honestRtt, measuredRtt, PING_SAMPLES } from './linkRtt';
import { cleanName, isHeldName, nameSkeleton, nameUsable } from './names';
import { checkJoin, joinProof, newChallenge, ownerUnlocked, roomProof } from './ownerKey';
import { prepareMedia, shown, warmMedia, type PreparedMedia } from './media.svelte';
import { keyMsg, makeSealKey, newKid, sealAvailable, sealMsg, SealedStore, type SealedMsg, type SealKey } from './seal';
import { drawAhead, takeAhead, type Ahead } from './drawAhead';
import { sfx } from './sound';
import { prefsFrom, roomPrefs, roomSettings, savePrefs } from './prefs';
import { toasts, type ToastKind, type ToastOptions } from './toasts.svelte';
import { creatorArrival } from './herald';
import { RUBY } from './palette';
import { CREATOR_TITLE } from './site';
import { DELVE_FUSE_MS, LOOKALIKES_ASKED_FROM, awaitingReturn, clockLeft, dealIn, fuseDue, fuseLeft, isGroupRun, livesOf, pausedUsed, standingIds } from './delve';
import { GameCounts, countEvent, countFailure, counting, type Failure, type JoinVia } from './count';
import { loadLooks } from './looks';
import { bestOf, loadRecords, recordLeft, recordRun, runEvent } from './delveRecord';
import { LEFT_KEY, forgiveLeaving, noteLeaving } from './versus';
import {
  DRAIN_POLL_MS,
  blastedAway,
  capStrikes,
  clockCap,
  clockStart,
  clockWaitsFor,
  delveNotices,
  drained,
  drawClockFrom,
  drawHoldUntil,
  expireIn,
  expireKey,
  flareIn,
  fuseHeard,
  hostAnswerHold,
  markAway,
  mayAutoReask,
  racerIds,
  reaskDelay,
  runSeenStarting,
  stillWaitedFor,
  underRuleset,
  type DelveNotice,
} from './delveSession';
import { readLegacy, readStored, removeLegacy, removeStored, writeStored } from './storage';
import { CursorOutbox, FLUSH_EVERY_MS, POINTER_BURST, POINTER_RATE, PRESSED, actionOf, cursorKey, cursorsLive, entryAt, type CursorAt, type CursorEntry } from './cursors';
import { peerCursors } from './peerCursors.svelte';
import { whenIdle } from './idle';
import { frameEvent } from './fpsMeter';
import { AWAY_AFTER_MS, noteInput, ownPresence, slowLink, standingOf, watchPresence, type Presence, type Seen, type Standing } from './presence';

/** The room is told how its players stand at most this often (Session.updateStandingPaced). */
const STANDING_GAP_MS = 250;

export const engine = new Engine(itemData as Item[], { fakes: fakeNames });

/**
 * Delve: the depth from which whoever builds the questions fetches the
 * look-alike table, ten depths before any question can want it, so nobody
 * else (and no shallower run) downloads it. Until it arrives, look-alikes go
 * by name (Engine.setLooks).
 */
const LOOKS_FETCH_FROM = LOOKALIKES_ASKED_FROM - 10;
let looksFetched = false;
function fetchLooks() {
  if (looksFetched) return;
  looksFetched = true;
  loadLooks().then(
    (looks) => engine.setLooks(looks),
    () => (looksFetched = false), // offline: try again on a later change
  );
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/** Connections that haven't introduced themselves yet, room-wide and per peer (a joiner races two attempts). */
const MAX_PENDING = 16;
const MAX_PENDING_PER_PEER = 2;
/** A connection this new can't be pushed out by another one: its time to finish connecting and say hello. */
const PENDING_GRACE_MS = 4000;
/** Players and spectators, plus room for people joining or reconnecting (who can't crowd out the rest). */
const MAX_CONNECTIONS = MAX_PLAYERS + MAX_SPECTATORS + MAX_PENDING;
/** Most remembered player tokens, and kicked tokens/peers/names or blocked peers, each (they're saved with the room). */
const MAX_KNOWN = 400;
const MAX_BLOCKED = 200;
/** What a client is told when the room can't take its connection right now. */
const ROOM_BUSY = 'The room is busy right now. Trying again…';
/** Client: after the host says "not now" (too many joins), try again this much later. */
const BUSY_RETRY_MS = 5000;
/** An open connection must introduce itself within this time. */
const HELLO_TIMEOUT_MS = 6000;
/**
 * A connection gets this long to open in the first place. Through a relay
 * (mobile data, strict routers) that can take several seconds, so it isn't
 * held to the hello's clock. A bit longer than a joiner gives an attempt.
 */
const OPEN_TIMEOUT_MS = 16000;
/** Client: an attempt to reach the host that hasn't opened by then gets a second one racing it. */
const NEXT_ATTEMPT_MS = 4000;
/** Client: an attempt that hasn't opened by then makes way for a fresh one. */
const ATTEMPT_LIFE_MS = 15000;
/** Client: joining gives up if the room hasn't let us in by then (each "busy" buys more time, up to the cap). */
const JOIN_GIVE_UP_MS = 30000;
const JOIN_GIVE_UP_CAP_MS = 60000;
/** Client: the server says an attempt's room isn't there within this time (it holds an offer ~5 s). */
const EXPIRE_MS = 7000;
/** Delve: how long past 0 and the time-out a fuse's sound holds before it fades by itself, should the blast be slow to come. */
const FUSE_TAIL_MS = 600;
/** Delve: how long the fuse sounds after Detonate is pressed, at most, should the blast be slow to come back. */
const DETONATE_FUSE_MS = 1500;
/** Client: pause before trying again after a failed attempt or a hiccup of the signalling server. */
const RETRY_SOON_MS = 1500;
const PING_EVERY_MS = 3000;
/** Delve: how often a question's clock looks again for those the host's reload cut off (waitForArrival). */
const RETURN_POLL_MS = 250;
/** Guests: no message from the host for this long means it's gone. */
const HOST_SILENCE_MS = 15000;
/** Errors from the signalling server that a later try can get past. */
const NETWORK_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed']);
/** No pong for this long: the connection is dead. */
const DEAD_AFTER_MS = 15000;
/** Faster than this (after the question reached them: the key to its art, as its clock started) is not a human answer. */
const MIN_HUMAN_MS = 200;
/**
 * The pictures go out sealed (seal.ts), which takes WebCrypto, there only on
 * a secure page (https, or localhost). Without it a guest couldn't open them
 * and a host couldn't seal them, so neither gets in.
 */
const NO_SEAL_JOIN = "This page can't open the room's pictures: that needs a secure page. Open the game at its https:// address to join.";
const NO_SEAL_HOST = "This page can't seal the room's pictures: that needs a secure page. Open the game at its https:// address to host, or play hot-seat on one device.";
/** What the host tells a guest whose hello doesn't say it can open sealed pictures. */
const NO_SEAL_GUEST = "Your game can't open this room's pictures: it needs a secure page. Open the game at its https:// address to join.";
/** What a guest is told when their answer came faster than that: it doesn't count, and they may answer again. */
const TOO_QUICK = 'Too quick to count: the question had only just reached you. Answer again.';
/** The held name without the owner key's signature (names.ts): turned down like any name that isn't allowed. */
const HELD_REFUSAL = 'That name is not allowed. Pick another name.';
/** How long a hello under the held name waits for the host's challenge (hi), ms. */
const HI_WAIT_MS = 4000;
/** Cap on the delay added to the host's own race answers. */
const MAX_HOST_HANDICAP_MS = 300;
/** A disconnected player's turn is skipped after this long, unless they come back. */
const AUTO_SKIP_MS = 20000;
/** Host may skip a connected player's turn once they've been idle this long (turns mode). */
const IDLE_SKIP_MS = 30000;
/** Art not ready by then counts as failed, so the host can ask another question. */
const MEDIA_TIMEOUT_MS = 15000;
/** A host timer that fires more than this early (the system clock jumped) is set again for the time still left. */
const EARLY_MS = 250;
/** Host: a guest's link with this much still to send (the art, say) gets the pointers later, by when only the newest are left. */
const CURSOR_BACKLOG_BYTES = 64 * 1024;
/** Batches sent for a click (a press or a release) are this far apart at least (ms): a frame. */
const CLICK_GAP_MS = 16;
/** Development only: a far link played on a near one, set with the `fakeLink` setting (artLane.ts parseFakeLink). */
const FAKE_LINK = import.meta.env.DEV ? parseFakeLink(readStored('fakeLink')) : null;

export type Mode = 'local' | 'host' | 'client';
export type Status = 'idle' | 'connecting' | 'ready' | 'lost';

function randomToken(len: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  const buf = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(buf, (n) => alphabet[n % alphabet.length]).join('');
}

const randomCode = () => randomToken(CODE_LENGTH, CODE_ALPHABET);

/** The stored value, or a fresh one from fallback that is stored for next time. */
function stored(name: string, fallback: () => string): string {
  const v = readStored(name);
  if (v) return v;
  const fresh = fallback();
  writeStored(name, fresh);
  return fresh;
}

export const savedName = () => readStored('name') ?? '';

/** What a guest is told when the host turns it out of the room, by the host's word for it: the message, and its title. */
const TURNED_OUT = {
  kicked: ['You were removed from the game.', 'Removed'],
  closed: ['The host closed the room.', 'Room closed'],
  replaced: ['You joined this game from another tab or window, so it continues there.', 'Moved to another tab'],
} as const satisfies Record<string, readonly [string, string]>;
export const saveName = (name: string) => void writeStored('name', name);

/**
 * This browser's secret. It proves "I'm the same player" when rejoining and
 * is only ever sent to the host, never shown to other players.
 */
const mySecret = stored('secret', () => randomToken(32));
/** This page load (tabs share the secret; the host tells them apart by this). */
const myTab = randomToken(16);
/** A new player's id, online or on this device. */
const newPlayerId = () => randomToken(12);

/** Host-side bookkeeping for one guest connection. */
interface Guest {
  playerId: string | null;
  limit: RateLimit;
  /** For the pointer (cursors.ts), apart from `limit` so moving it never uses up the budget for playing. */
  pointer: RateLimit;
  /** Its newest pointer past `pointer`, waiting until it may go (undefined when none is), and when it's looked at again. */
  pointerLate?: CursorAt | null;
  pointerTimer?: ReturnType<typeof setTimeout> | null;
  /** Round-trip time estimate (ms), from its pongs: whether its link shows as slow (slowLink). */
  rtt: number;
  /** Its recent ping times (ms), and the round trip its browser measures (linkRtt.ts): what timing that could favour it leans on (honestRtt). */
  pingTimes: number[];
  linkRtt: number | null;
  lastPong: number;
  pings: Map<number, number>;
  /** Its art lane (artLane.ts), and whether it said it opened its end (hello's `lane`); without both, media go on the main channel. */
  lane: LaneSender | null;
  laneWanted: boolean;
  /** When this guest was sent the key to the current question's pictures (page clock): its too-quick check counts from then. */
  mediaAt: { qid: number; at: number } | null;
  /** Which page load the connection comes from (older clients don't say). */
  tab: string | null;
  /** Its hello, under the held name, waits on the owner key's signature being checked. */
  checking?: boolean;
  /** The challenge this link was sent as it opened (hi), for a hello under the held name to be signed over. */
  challenge: string;
  /** When the connection came in. */
  since: number;
  /** Whether its game is on screen and in use, as it last said (presence.ts). */
  seen: Seen;
  /** Its link to the host is slow (presence.ts slowLink). */
  slow: boolean;
}

/**
 * Host: a question's sealing (seal.ts). Its key (none where nobody else can
 * be sent the art: hot-seat, the lab), its pictures sealed under it, and
 * whether the key has gone out (`open`: the clock started, or the question
 * ended before it did).
 */
interface Sealing {
  qid: number;
  key: SealKey | null;
  sealed: SealedMsg[];
  open: boolean;
}

/** Host: a question's art as prepared (unsealed: its pictures and patches), and sealed for the room. */
interface PreparedArt {
  media: PreparedMedia;
  plain: MediaMsg[];
  sealing: Sealing;
}

/** Where a question's sealed pictures sit on a guest's lane: from one mark (LaneSender.mark) up to another. */
interface LaneSpan {
  from: number;
  to: number;
}

/**
 * Host, race: a next question drawn ahead (drawAhead.ts), its art once
 * prepared and sealed (stopped by `stop` should it be thrown away), and the
 * guests it has gone to, with where it sits on each one's lane (null: not on
 * a lane).
 */
interface AheadArt extends Ahead {
  ready: Promise<PreparedArt>;
  stop: AbortController;
  sent: Map<Guest, LaneSpan | null>;
}

/** Host-only data that must survive a page refresh but never reach guests. */
interface HostPrivate {
  myPlayerId: string;
  secrets: [string, string][];
  bannedSecrets: string[];
  /** Peers of kicked players. */
  bannedPeers: string[];
  /** Name skeletons of kicked players, refused to newcomers. */
  bannedNames: string[];
  /**
   * Peers that sent something no real client sends. Kept apart from the
   * kicks, so a pile of these can't push a kick off the (capped) list.
   */
  blockedPeers: string[];
}

const noPrivate = (myPlayerId = ''): HostPrivate => ({
  myPlayerId,
  secrets: [],
  bannedSecrets: [],
  bannedPeers: [],
  bannedNames: [],
  blockedPeers: [],
});

class Session {
  mode = $state<Mode | null>(null);
  status = $state<Status>('idle');
  state = $state.raw<GameState | null>(null);
  code = $state<string>('');
  /** host clock minus local clock, for timer display on clients */
  clockOffset = $state(0);
  private clockSynced = false;
  /** This device's player in an online game. */
  myPlayerId = $state<string | null>(null);
  /** Streamer mode: don't show the room code on screen. */
  hideCode = $state(roomPrefs().hideCode);
  /** Reconnecting to the host has been given up. */
  gaveUp = $state(false);
  /**
   * Delve: how this device's run measured up, once it perished (`id`: the run's
   * startedAt). `best`: deeper than ever, alone or in a group as it was.
   */
  delveResult = $state<{ id: number; depth: number; previousBest: number | null; best: boolean } | null>(null);
  /** Delve: the deepest this device had gone (alone or in a group, as this run is) when the run began. */
  bestAtStart = $state<number | null>(null);
  /** The achievements this device earned in the game under way or just over (its startedAt), oldest first: the end screen lists them. */
  earned = $state<{ game: number; ids: string[] } | null>(null);
  /**
   * Notes what a check of the achievements earned, under the game it was
   * earned in (`game`, its startedAt, as it stood when the check was asked
   * for: the check is async, and a next game may have begun by its end).
   */
  private noteEarned(ids: string[], game: number | undefined) {
    if (game === undefined || !ids.length) return;
    const was = this.earned?.game === game ? this.earned.ids : [];
    this.earned = { game, ids: [...was, ...ids.filter((id) => !was.includes(id))] };
  }
  /**
   * Delve: the run (its startedAt) this device saw start, from the lobby or
   * after a game ended (delveSession.ts runSeenStarting); null after a reload
   * or a rejoin, which come in on a run already under way. Only at a start
   * seen is a screen reader told the first zone's name (Game.svelte). Set
   * before the state it comes with.
   */
  runStarted: number | null = null;
  /** Host: when the disconnected active player's turn will be skipped (0 = not pending). */
  skipAt = $state(0);
  /**
   * Host: the connected active player has been idle long enough that their
   * turn may be skipped. Cleared as soon as the turn moves on (like skipAt),
   * so a click on a Skip button that is just fading out does nothing.
   */
  idle = $state(false);
  /**
   * Online, in the lobby: how each player who isn't simply ready stands
   * (presence.ts), by id. The host works it out and tells everyone.
   */
  standing = $state.raw<Record<string, Standing>>({});
  /** Follows this device's presence (set up on the first room opened or joined): a guest tells the host, a host the room. */
  private presenceWatch: (() => void) | null = null;
  /** Host: the room is told how each away player stands once their grace is over (by player; '' for the host). */
  private standingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Host: the room was just told how everyone stands; a change meanwhile (`owed`) is told when this runs out (updateStandingPaced). */
  private standingPace: { timer: ReturnType<typeof setTimeout>; owed: boolean } | null = null;
  /** Guest: the host turned down this device's answer to the question asked at `askedAt` (too quick), so it may be given again. */
  turnedDown = $state<{ askedAt: number } | null>(null);
  /** Host: the question (askedAt) whose art could not be loaded, so guests got no pictures. */
  private artFailedFor = $state(0);
  /** Every player and spectator id this device has seen in the room, so only the creator's real arrival gets a notice (lib/herald.ts). */
  private seen = new Set<string>();
  /** Whom the state change under way announces, if anyone: their notice replaces the plain "joined" one. */
  private heralded: string | null = null;
  /** Guest: the challenge the host sent as the link opened (hi). */
  private hostHi: { conn: DataConnection; c: string } | null = null;
  /** Guest: wakes a hello under the held name that waits for it (signHello). */
  private onHi: (() => void) | null = null;
  /**
   * The name of the one player or spectator shown as the creator here
   * (creator.ts): under the held name, on whoever the host let in with the
   * owner key's signature (GameState owner), and the only one under it
   * (with a second spelling of it beside them, nobody is).
   */
  readonly creatorName = $derived.by(() => {
    const s = this.state;
    const o = s?.owner;
    if (!s || !o) return null;
    const held = [...s.players, ...(s.spectators ?? [])].filter((p) => isHeldName(p.name));
    return held.length === 1 && held[0].id === o.id ? held[0].name : null;
  });

  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null;
  /** Guest: the link the host welcomed this device on, so it knows this version's messages (presence). */
  private welcomedOn: DataConnection | null = null;
  private guests = new Map<DataConnection, Guest>();
  private priv: HostPrivate = noPrivate();
  private secretToPlayer = new Map<string, string>();
  private joins = new JoinGate();
  /** Client: the token for the room being joined. */
  private helloSecret: Promise<string> | null = null;
  private media: PreparedMedia | null = null;
  private mediaTimers: ReturnType<typeof setTimeout>[] = [];
  /**
   * Counts stopMedia: art still being made when it ran (a reset, a reload's
   * second resume of the same question) is dropped, even for the same question.
   */
  private mediaGen = 0;
  /**
   * The current question's media messages as prepared, unsealed: its
   * pictures, which the host's own screen shows once its clock starts, and
   * the patches gone out so far (for late joiners, and the reveal's rest).
   */
  private released: MediaMsg[] = [];
  /**
   * Host: the current question's sealing, its pictures sent to everyone as
   * soon as they're ready, and to whoever comes later. Never in GameState,
   * which guests are sent a view of.
   */
  private sealing: Sealing | null = null;
  /**
   * Host, race: the next question, drawn ahead as the reveal starts, on a
   * copy of the state (drawAhead.ts), its art being prepared and sealed
   * (`ready`), and sent to everyone (`sent`) while the reveal plays. Taken at
   * 'next' if nothing changed meanwhile (stepNext), thrown away by any change
   * before. Never in GameState, as the sealing isn't.
   */
  private ahead: AheadArt | null = null;
  /** Host: the question drawn ahead being taken at 'next', for the state change under way to pick up (startMedia). */
  private taking: AheadArt | null = null;
  /** Host: by player, how many questions running the clock's cap ran out before the art reached them (delveSession.ts capStrikes). */
  private strikes = new Map<string, number>();
  /** Guest: the room's sealed pictures, held until their key comes as the clock starts, then shown (seal.ts). */
  private sealedArt = new SealedStore((raw) => {
    const m = parseHostMsg(raw);
    if (m && isMedia(m) && this.mode === 'client') shown.receive(m);
  });
  private timer: ReturnType<typeof setTimeout> | null = null;
  private autoNext: ReturnType<typeof setTimeout> | null = null;
  /** The reveal autoNext belongs to (its question's askedAt), so unrelated changes don't restart it. */
  private autoNextFor = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private joinName = '';
  private retry: ReturnType<typeof setTimeout> | null = null;
  /** Pending step of opening or joining a room (a retry, a give-up); cancelled on leave. */
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  /** Client: when joining began. */
  private joinedAt = 0;
  /** Client: attempts to reach the host that haven't opened yet (and when they started), oldest first. */
  private attempts: { conn: DataConnection; at: number }[] = [];
  /** Client, joining: the next attempt to reach the host. */
  private nextAttempt: ReturnType<typeof setTimeout> | null = null;
  /** Client, joining: a fresh peer after the signalling server turned the last one away. */
  private peerTimer: ReturnType<typeof setTimeout> | null = null;
  /** Client, joining: the host said to wait until then. */
  private busyUntil = 0;
  /**
   * Client, joining: the server said the room isn't there; any answer
   * after this time is about an attempt made since (0 = it hasn't said so).
   */
  private unavailableUntil = 0;
  /** Client, joining: links the host closed before letting us in, without a word. */
  private silentCloses = 0;
  private hostWatch: ReturnType<typeof setInterval> | null = null;
  private beacon: Beacon | null = null;
  /** Answers invite links' probes on the room's own id (lib/rooms.ts). */
  private probeDesk = new ProbeDesk((challenge) => this.listing(challenge));
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  private skipKey = '';
  private idleKey = '';
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** How long this device took to answer the current question (its askedAt), for the codex. */
  private answered: { qid: number; ms: number; share?: number } | null = null;
  /**
   * When this device first had the question (its askedAt) with its clock
   * running (page clock), which is when it opens to answers (noteClock).
   */
  private clockSeen: { qid: number; clockAt?: number; at: number; before?: number } | null = null;
  /** Delve: how much of this question's clock was used before the host's reload held it still (pausedUsed). */
  private usedBefore: { qid: number; ms: number } | null = null;
  /** Delve together: the question the team's vote just drew, and the earliest its clock may start (drawHoldUntil). */
  private drawHold: { qid: number; until: number } | null = null;
  /** The art failed this many times on this turn (turnCount), for the backoff. */
  private reaskFails = { turn: '', n: 0 };
  /** Lab only: a co-op run played as its host would, without a room (see labCoop). */
  private labRoomless = false;
  private expireTimer: ReturnType<typeof setTimeout> | null = null;
  private expireKey = '';
  private flareTimer: ReturnType<typeof setTimeout> | null = null;
  private flareKey = '';
  /** Host: the pointers each guest is still to be sent (cursors.ts), and the next batch. */
  private cursorOut = new CursorOutbox<DataConnection>();
  /** Whose pointer is pressed, as last passed on: a press or a release goes out at once, not with the next batch. */
  private cursorPressed = new Map<string, boolean>();
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private cursorsSentAt = 0;
  /** When the planned batches go (performance.now). */
  private cursorsDue = 0;

  get isHost() {
    return this.mode === 'local' || this.mode === 'host';
  }

  /** Guest: watches rather than plays, as the host last had it (sent with every hello, so it holds through reconnects). */
  private watchOnly = false;

  /** Online guest who isn't playing: joined a running game, or chose to watch. */
  get spectating() {
    const s = this.state;
    return this.mode === 'client' && !!s && !!this.myPlayerId && !s.players.some((p) => p.id === this.myPlayerId);
  }

  /** Spectating, and staying a spectator when the next game starts. */
  get justWatching() {
    const me = this.myPlayerId;
    return this.spectating && !!this.state?.spectators?.some((o) => o.id === me && o.stay);
  }

  get race() {
    return this.state?.settings.mode === 'race';
  }

  /** Online Delve: this device's player perished (out of lives) and watches the rest of the run, unless a teammate brings them back. */
  get perished() {
    const s = this.state;
    const me = this.myPlayerId;
    return this.mode !== 'local' && !!s?.delve && !!me && s.players.some((p) => p.id === me) && livesOf(s, me) === 0;
  }

  /** True when this device may act for the active player (or answer, in a race). */
  get myTurn() {
    const s = this.state;
    if (!s) return false;
    if (this.mode === 'local') return true;
    const me = this.myPlayerId;
    if (s.settings.mode === 'race') {
      return s.players.some((p) => p.id === me) && !s.question?.misses.some((m) => m.playerId === me);
    }
    return !!me && s.players[s.turn]?.id === me;
  }

  /** Host: the open question has no art to show (it failed to load), so it should be asked again. */
  get artMissing() {
    const s = this.state;
    return this.isHost && s?.phase === 'question' && !!s.question && this.artFailedFor === s.question.askedAt;
  }

  hostNow() {
    return Date.now() + this.clockOffset;
  }

  /**
   * Client: each state message gives the host's clock minus that message's
   * travel time, so the largest sample is the closest. Keeping it also stops
   * one late message (queued behind pictures, say) from making countdowns jump.
   */
  private syncClock(hostSentAt: number) {
    const sample = hostSentAt - Date.now();
    this.clockOffset = this.clockSynced ? Math.max(this.clockOffset, sample) : sample;
    this.clockSynced = true;
  }

  flash(message: string, kind: ToastKind = 'info', opts?: ToastOptions) {
    toasts.show(message, kind, opts);
  }

  setHideCode(hide: boolean) {
    this.hideCode = hide;
    savePrefs({ hideCode: hide });
  }

  // ---- hot-seat ---------------------------------------------------------

  startLocal(resume?: GameState) {
    const delve = this.delveLink && !resume;
    // Used up by this game, or moot for one picked up where it was.
    this.delveLink = false;
    this.reset();
    this.mode = 'local';
    this.status = 'ready';
    this.lobbyDraft = '';
    this.setState(resume ?? createGame(null, delve ? { ...DEFAULT_SETTINGS, mode: 'delve' } : undefined));
  }

  /** What the hot-seat lobby's add field starts with: the name a new game couldn't seat. The lobby takes it. */
  lobbyDraft = '';

  /**
   * A fresh hot-seat game with `name` seated first. A name this device can't
   * play under (too short, reserved, held) doesn't hold the game up: it waits
   * in the lobby's add field, where adding it says why.
   */
  startLocalAs(name: string) {
    this.startLocal();
    if (!nameUsable(name) || !this.seatLocal(name)) this.lobbyDraft = name;
  }

  /**
   * Seats a player on this device (hot-seat); false when the game turned
   * them down (and said why). The id comes from getRandomValues, which,
   * unlike randomUUID, also works on plain http.
   */
  seatLocal(name: string): boolean {
    const playerId = newPlayerId();
    this.dispatch({ type: 'join', playerId, name });
    return !!this.state?.players.some((p) => p.id === playerId);
  }

  /**
   * Came in through a delver's shared link (?delve): the next game they open
   * here, hot-seat or a room, starts on Delve. Used up by that game, and
   * dropped when a game is resumed or a room joined instead.
   */
  delveLink = false;

  /** A Delve run alone on this device, straight from a shared link. Nothing changes for a name that can't be played under. */
  startDelve(name: string) {
    if (!nameUsable(name)) return;
    this.delveLink = true;
    this.startLocal();
    if (this.seatLocal(name)) this.dispatch({ type: 'start' });
  }

  /** Picks up a hot-seat game or a hosted room after a page refresh. */
  resume() {
    const saved = readSaved();
    if (!saved) return;
    // Picking up a game: a shared link's Delve was not for it, nor for the next one.
    this.delveLink = false;
    if (saved.mode === 'local') this.startLocal(soloHotSeat(underRuleset(renameCategories(saved.state))));
    else if (saved.mode === 'host') {
      // The host's last moment before the reload, which reset() lets go of with the save ('resumed' reads it).
      const alive = readStored(ALIVE, 'session');
      this.reset();
      // Kept while the room reopens, so neither a refresh nor a failed try loses the game.
      writeSaved(saved);
      if (alive) writeStored(ALIVE, alive, 'session');
      this.mode = 'host';
      this.status = 'connecting';
      this.loadPrivate(saved.priv);
      this.openRoom(saved.code, 0, underRuleset(renameCategories(saved.state)));
    } else if (saved.mode === 'client') this.join(saved.code, saved.name, !!saved.watch);
  }

  // ---- hosting ----------------------------------------------------------

  host(name: string) {
    this.reset();
    this.mode = 'host';
    this.status = 'connecting';
    this.joinName = name;
    this.loadPrivate(noPrivate(randomToken(12)));
    this.openRoom(randomCode(), 0);
  }

  private loadPrivate(p: HostPrivate) {
    this.priv = {
      ...p,
      secrets: [...p.secrets],
      bannedSecrets: [...p.bannedSecrets],
      bannedPeers: [...p.bannedPeers],
      // Saved by a build that didn't have these yet: start them empty.
      bannedNames: [...(p.bannedNames ?? [])],
      blockedPeers: [...(p.blockedPeers ?? [])],
    };
    this.secretToPlayer = new Map(p.secrets);
    this.myPlayerId = p.myPlayerId;
  }

  private openRoom(code: string, attempt: number, resumeState?: GameState) {
    // Guests are only ever sent the art sealed: a page that can't seal it can't host.
    if (!sealAvailable()) {
      if (resumeState) this.fail(NO_SEAL_HOST, 'Room not reopened', { reopening: code, failure: 'host-room-not-reopened' });
      else this.fail(NO_SEAL_HOST, 'Room not opened', { failure: 'host-room-not-opened' });
      return;
    }
    const peer = new Peer(PEER_PREFIX + code, PEER_OPTIONS);
    this.peer = peer;
    // An invite link's screen asking whose room this is: told, apart from the
    // players' slots (nobody banned or blocked, though). Everyone else comes to play.
    answerProbes(peer, this.probeDesk, {
      allow: (id) => !this.priv.bannedPeers.includes(id) && !this.priv.blockedPeers.includes(id),
      others: (conn) => this.acceptConnection(conn),
    });
    // 'open' fires again each time the signalling server is reconnected; the
    // room (and its game) is only built the first time.
    peer.once('open', () => {
      if (this.peer !== peer) return;
      this.code = code;
      this.status = 'ready';
      const me = this.priv.myPlayerId;
      if (resumeState) {
        // Everyone else has to reconnect; mark them offline until they do (a
        // lobby keeps their seats, and lets go of the ones still empty when
        // the game starts). Spectators rejoin as spectators when they reconnect.
        let s: GameState = { ...resumeState, spectators: [] };
        // Delve: marked away as they are, with none of a drop's effects (a
        // drop closes a vote that no longer waits for them, losing every
        // vote cast; 'resumed' excuses them for a while instead).
        if (s.delve) s = markAway(s, me);
        else
          for (const p of s.players)
            if (p.id !== me) s = engine.apply(s, { type: 'connection', playerId: p.id, connected: false }, null);
        // A reveal counts down afresh, so the others can reconnect before it
        // moves on (moving on skips the seats still offline).
        if (s.reveal) s = { ...s, reveal: { ...s.reveal, at: Date.now() } };
        // Delve: everyone cut off gets a while to come back, and a question
        // one of them may have been answering holds its clock still from the
        // host's last moment before the reload until it can start again.
        if (s.delve) s = engine.apply(s, { type: 'resumed', ...lastAlive() }, null);
        this.setState(s);
      } else {
        let s = createGame(me, this.delveLink ? { ...roomSettings(), mode: 'delve' } : roomSettings());
        this.delveLink = false;
        try {
          s = engine.apply(s, { type: 'join', playerId: me, name: this.joinName }, me);
        } catch (err) {
          this.fail(err instanceof ActionError ? err.message : 'Could not create the room.', 'Room not opened', { failure: 'host-room-not-opened' });
          return;
        }
        this.setState(s);
      }
      this.signOwnRoom(code);
      this.startPings();
      this.watchOwnPresence();
    });
    peer.on('disconnected', () => {
      // Lost the signalling server; existing peer links keep working.
      if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
    });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      // Once the room is open, losing the id on a signalling reconnect must not
      // tear it down: the players' links keep working without the server.
      if (err.type === 'unavailable-id' && this.status !== 'connecting') {
        console.warn('peer error', err);
        return;
      }
      if (err.type === 'unavailable-id' && attempt < 8) {
        peer.destroy();
        // When resuming, the old id can linger on the server for a few seconds.
        if (resumeState) this.connectTimer = setTimeout(() => this.openRoom(code, attempt + 1, resumeState), 2500);
        else this.openRoom(randomCode(), attempt + 1);
        return;
      }
      if (err.type === 'peer-unavailable') return;
      console.warn('peer error', err);
      if (this.status !== 'connecting') return;
      if (resumeState && NETWORK_ERRORS.has(err.type) && attempt < 8) {
        peer.destroy();
        this.connectTimer = setTimeout(() => this.openRoom(code, attempt + 1, resumeState), 2500);
        return;
      }
      // A room that couldn't be reopened stays saved, so a refresh tries again.
      if (err.type === 'unavailable-id' && resumeState)
        this.fail(
          `Couldn't reopen room ${code}: it still seems to be open, maybe in another tab or window. Refresh to try again.`,
          'Room not reopened',
          { reopening: code, failure: 'host-room-not-reopened' },
        );
      else if (resumeState) this.fail(`${this.networkHint(err.type)} Refresh to try reopening room ${code}.`, 'Room not reopened', { reopening: code, failure: 'host-room-not-reopened' });
      else this.fail(this.networkHint(err.type), 'No connection', { failure: 'host-no-connection' });
    });
  }

  private acceptConnection(conn: DataConnection) {
    // Real clients use PeerJS's default (binary) serialization.
    const p = this.priv;
    if (p.bannedPeers.includes(conn.peer) || p.blockedPeers.includes(conn.peer) || conn.serialization !== 'binary') {
      this.refuse(conn);
      return;
    }
    // Connections that haven't introduced themselves have their own few
    // slots, so they never crowd out players and spectators. One peer keeps
    // at most two (a real client closes its older attempts anyway). When the
    // slots are full, the oldest makes way, but only once it has had a few
    // seconds to finish connecting: new peer ids cost nothing, so a stream of
    // them must not be able to push every real joiner out before their hello.
    const pending = [...this.guests].filter(([, g]) => !g.playerId).sort((a, b) => a[1].since - b[1].since);
    const mine = pending.filter(([c]) => c.peer === conn.peer);
    if (mine.length >= MAX_PENDING_PER_PEER) this.drop(mine[0][0]);
    else if (pending.length >= MAX_PENDING) {
      if (Date.now() - pending[0][1].since < PENDING_GRACE_MS) {
        this.refuse(conn, ROOM_BUSY);
        return;
      }
      this.drop(pending[0][0]);
    }
    if (this.guests.size >= MAX_CONNECTIONS) {
      this.refuse(conn, ROOM_BUSY);
      return;
    }
    const guest: Guest = {
      playerId: null,
      limit: new RateLimit(10, 20),
      pointer: new RateLimit(POINTER_RATE, POINTER_BURST),
      rtt: 150,
      pingTimes: [],
      linkRtt: null,
      lastPong: Date.now(),
      lane: null,
      laneWanted: false,
      pings: new Map(),
      mediaAt: null,
      tab: null,
      since: Date.now(),
      seen: { presence: 'here', since: Date.now() },
      slow: false,
      challenge: newChallenge(),
    };
    this.guests.set(conn, guest);
    // The hello's clock starts once the connection is open; until then, only a much longer limit.
    let helloTimer = setTimeout(() => !guest.playerId && this.drop(conn), OPEN_TIMEOUT_MS);
    conn.on('open', () => {
      clearTimeout(helloTimer);
      if (!this.guests.has(conn)) return;
      helloTimer = setTimeout(() => !guest.playerId && this.drop(conn), HELLO_TIMEOUT_MS);
      // The art lane: host to guest only, so anything sent up it is no real client.
      const lane = openLane(conn.peerConnection);
      if (lane) {
        guest.lane = new LaneSender(lane, FAKE_LINK, () => this.laneLost(conn, guest));
        lane.addEventListener('message', () => this.guests.has(conn) && this.block(conn));
      }
      // For a hello under the held name to sign (ownerKey.ts joinProof): fresh, so a signature seen once is of no use again.
      this.send(conn, { t: 'hi', c: guest.challenge });
    });
    this.guardFrames(conn);
    conn.on('data', (raw) => {
      if (!this.state || !this.guests.has(conn)) return;
      const msg = parseClientMsg(raw);
      if (!msg) {
        this.block(conn);
        return;
      }
      // A pointer beyond what a real client sends only waits (frames are
      // capped all the same, guard.ts).
      if (msg.t === 'cursor') {
        if (guest.playerId) this.cursorFrom(conn, guest, msg.at);
        return;
      }
      // Presence is sent only when it changes, so one dropped would stand
      // until the next change: it isn't rate-limited. Each is only noted;
      // the room is told at a measured pace (standingSoon), however fast a
      // guest flips it.
      if (msg.t === 'presence') {
        if (!guest.playerId || msg.p === guest.seen.presence) return;
        guest.seen = { presence: msg.p, since: Date.now() };
        this.standingSoon(guest.playerId, msg.p);
        return;
      }
      if (!guest.limit.take()) {
        // Someone holding a key down: disconnect (they may come back), don't block.
        if (guest.limit.strikes > 30) this.drop(conn);
        return;
      }
      try {
        if (msg.t === 'hello') {
          if (guest.playerId || guest.checking) return;
          guest.tab = msg.tab ?? null;
          guest.laneWanted = !!msg.lane;
          clearTimeout(helloTimer);
          this.handleHello(conn, guest, msg.secret, msg.name, msg.v, !!msg.watch, !!msg.seal, msg.owner);
        } else if (msg.t === 'pong') {
          const sent = guest.pings.get(msg.n);
          if (sent !== undefined) {
            guest.pings.delete(msg.n);
            guest.lastPong = Date.now();
            guest.rtt = guest.rtt * 0.7 + (Date.now() - sent) * 0.3;
            guest.pingTimes.push(Date.now() - sent);
            if (guest.pingTimes.length > PING_SAMPLES) guest.pingTimes.shift();
          }
        } else if (msg.t === 'action') {
          if (!guest.playerId) return;
          if (msg.action.type === 'answer' && this.tooFast(guest, msg.action.askedAt)) {
            // It doesn't count, but not without a word: they may answer again.
            this.send(conn, { t: 'error', message: TOO_QUICK, askedAt: this.state.question!.askedAt });
            return;
          }
          this.setState(engine.apply(this.state, msg.action, guest.playerId));
        }
      } catch (err) {
        if (err instanceof ActionError && err.silent) return;
        const message = err instanceof ActionError ? err.message : 'Something went wrong.';
        if (msg.t === 'hello') this.dismiss(conn, { t: 'error', message });
        else this.send(conn, { t: 'error', message });
      }
    });
    conn.on('close', () => {
      clearTimeout(helloTimer);
      this.guests.delete(conn);
      this.cursorOut.drop(conn);
      if (guest.pointerTimer) clearTimeout(guest.pointerTimer);
      const id = guest.playerId;
      if (!id || !this.state) return;
      if ([...this.guests.values()].some((g) => g.playerId === id)) return;
      this.relayCursor(id, null);
      if (this.state.spectators?.some((o) => o.id === id)) {
        this.setState(engine.apply(this.state, { type: 'remove', playerId: id }, null));
        return;
      }
      const p = this.state.players.find((p) => p.id === id);
      if (!p) return;
      if (this.state.phase === 'lobby') {
        this.setState(engine.apply(this.state, { type: 'remove', playerId: id }, null));
      } else {
        this.setState(engine.apply(this.state, { type: 'connection', playerId: id, connected: false }, null));
        this.flash(p.name, 'warn', { title: 'Player disconnected', who: { name: p.name, hue: p.hue } });
      }
    });
  }

  /** Checks every raw frame before PeerJS decodes (or reassembles) it, which the message checks never see. */
  private guardFrames(conn: DataConnection) {
    const frames = new FrameGuard();
    const check = (data: unknown) => {
      if (!this.guests.has(conn)) return false;
      const verdict = frames.check(data);
      if (verdict === 'bad') this.block(conn);
      else if (verdict === 'flood') this.drop(conn);
      return verdict === 'ok';
    };
    if (hookFrames(conn, check, () => (this.block(conn), false))) return;
    // A PeerJS without those hooks (tests/guard.test.ts should have caught the
    // upgrade): frames are then only checked after PeerJS has decoded them.
    console.warn('PeerJS changed: raw frames are checked only after decoding');
    conn.on('open', () => conn.dataChannel?.addEventListener('message', (e) => check(e.data)));
  }

  /**
   * Turns a connection away. With `busy` (the room is only full for the
   * moment), the client is told so and tries again by itself; otherwise
   * (a blocked peer) it just gets closed.
   */
  private refuse(conn: DataConnection, busy?: string) {
    conn.on('open', () => {
      if (!busy) return conn.close();
      this.send(conn, { t: 'busy', message: busy });
      setTimeout(() => conn.close(), 400);
    });
    // One that never opens still has to go.
    setTimeout(() => conn.close(), HELLO_TIMEOUT_MS);
  }

  /**
   * Closes a guest's connection. A connection that never opened doesn't
   * report closing, so it's forgotten here too (or it would hold a slot forever).
   */
  private drop(conn: DataConnection) {
    conn.close();
    this.guests.delete(conn);
  }

  /**
   * Sends a last message and lets the connection go. It stops counting as a
   * guest right away, so it can't introduce itself again in the meantime.
   */
  private dismiss(conn: DataConnection, msg: HostMsg) {
    const g = this.guests.get(conn);
    if (g) g.playerId = null;
    this.guests.delete(conn);
    this.send(conn, msg);
    setTimeout(() => conn.close(), 400);
  }

  /** A connection no real client would make: drop it and refuse its peer for the rest of the session. */
  private block(conn: DataConnection) {
    const p = this.priv;
    if (!p.blockedPeers.includes(conn.peer)) {
      p.blockedPeers = capped([...p.blockedPeers, conn.peer], MAX_BLOCKED);
      this.saveSoon();
    }
    this.drop(conn);
  }

  /** `seal`: it can open sealed pictures (seal.ts). `owner`: under the held name, the owner key's signature over this link's challenge (hi), checked here. */
  private handleHello(conn: DataConnection, guest: Guest, secret: string, name: string, v: number, watch: boolean, seal: boolean, owner?: string) {
    const outdated = versionProblem(v);
    if (outdated) {
      this.dismiss(conn, { t: 'error', message: outdated, version: true });
      return;
    }
    // It couldn't open a question's pictures, and nobody gets them unsealed.
    if (!seal) {
      this.dismiss(conn, { t: 'error', message: NO_SEAL_GUEST });
      return;
    }
    const known = this.secretToPlayer.get(secret);
    // A kicked player stays out, under their old token or (as a newcomer) their old name.
    if (this.priv.bannedSecrets.includes(secret)) {
      this.dismiss(conn, { t: 'kicked' });
      return;
    }
    // Everything past this point is paid for out of the join budgets, turned-down attempts included.
    const busy = this.joins.admit(secret, !!known);
    if (busy) {
      // Not a refusal: the client tries again a little later.
      this.dismiss(conn, { t: 'busy', message: busy });
      return;
    }
    if (isHeldName(cleanName(name))) {
      // The held name only with the owner key's signature over this link's challenge (ownerKey.ts), checked first.
      guest.checking = true;
      void checkJoin(PEER_PREFIX + this.code, guest.challenge, owner).then((ok) => {
        guest.checking = false;
        if (!this.guests.has(conn) || guest.playerId || !this.state) return;
        try {
          if (!ok) {
            this.joins.rejected(secret, !!known);
            throw new ActionError(HELD_REFUSAL);
          }
          this.seat(conn, guest, secret, name, watch, true);
        } catch (err) {
          this.dismiss(conn, { t: 'error', message: err instanceof ActionError ? err.message : 'Something went wrong.' });
        }
      });
      return;
    }
    this.seat(conn, guest, secret, name, watch, false);
  }

  /** A hello let in so far: the seat (or a spectator's place) it gets. `owner`: under the held name, its signature checked. */
  private seat(conn: DataConnection, guest: Guest, secret: string, name: string, watch: boolean, owner: boolean) {
    const known = this.secretToPlayer.get(secret);
    const playerId = known ?? newPlayerId();
    let next: GameState;
    try {
      if (!known && this.priv.bannedNames.includes(nameSkeleton(cleanName(name))))
        throw new ActionError('Someone with a name like that was removed from this room. Pick another name.');
      next = engine.apply(this.state!, { type: 'join', playerId, name, returning: !!known, ...(watch ? { watch } : {}), ...(owner ? { owner: true as const } : {}) }, playerId);
    } catch (err) {
      this.joins.rejected(secret, !!known);
      throw err;
    }
    if (!known) this.rememberSecret(secret, playerId, next);
    // Only one live connection per player (e.g. after a refresh). When it's
    // another tab, say why, so it doesn't reconnect and take the seat back; the
    // same tab's own reconnect attempts (in whatever order) are just closed.
    for (const [c, g] of this.guests)
      if (g.playerId === playerId && c !== conn) {
        g.playerId = null;
        if (g.tab && guest.tab && g.tab !== guest.tab) this.dismiss(c, { t: 'replaced' });
        else this.drop(c);
      }
    guest.playerId = playerId;
    this.send(conn, { t: 'welcome', playerId });
    // Even when nobody is marked: a guest coming back may still hold marks from before it dropped.
    this.send(conn, { t: 'standing', s: this.standing });
    this.setState(next);
    this.replayMedia(conn, guest);
    const player = next.players.find((p) => p.id === playerId);
    const watcher = next.spectators?.find((o) => o.id === playerId);
    // The creator's first arrival has a notice of its own (see onNewState).
    if (this.heralded === playerId) return;
    if (player) this.flash(player.name, 'info', { title: 'Player joined', who: { name: player.name, hue: player.hue } });
    else if (watcher) this.flash(watcher.name, 'info', { title: 'Spectator joined', who: { name: watcher.name } });
  }

  /** Remembers a newcomer's token, forgetting the oldest ones of people who are gone once there are too many. */
  private rememberSecret(secret: string, playerId: string, s: GameState) {
    this.secretToPlayer.set(secret, playerId);
    this.priv.secrets.push([secret, playerId]);
    if (this.priv.secrets.length <= MAX_KNOWN) return;
    const here = new Set([...s.players, ...(s.spectators ?? [])].map((o) => o.id));
    const drop = this.priv.secrets.findIndex(([, id]) => !here.has(id));
    if (drop < 0) return;
    this.secretToPlayer.delete(this.priv.secrets[drop][0]);
    this.priv.secrets.splice(drop, 1);
  }

  /** An answer (to the question asked at `askedAt`) that arrives before a human could have seen the question. */
  private tooFast(guest: Guest, askedAt: number | undefined) {
    const q = this.state?.question;
    // One for a question gone by, or come in as it was revealed, is the engine's to drop ("Too late!").
    if (!q || this.state!.phase !== 'question' || (askedAt !== undefined && askedAt !== q.askedAt)) return false;
    // Before its clock the engine turns every answer down by itself (too early, without a word).
    if (!clockRuns(q)) return false;
    // No art went out at all: don't hold answers back waiting for it.
    if (this.artFailedFor === q.askedAt) return false;
    // Counted from the key reaching them (it opens the art): the sealed bytes may have been there for a while.
    if (!guest.mediaAt || guest.mediaAt.qid !== q.askedAt) return true;
    // Nor before its clock started as this device last saw it (a Delve clock
    // the host's reload held still carries on later); the host notes it
    // running as it goes out to everyone (noteClock).
    const clock = this.clockSeen?.qid === q.askedAt ? this.clockSeen.at : 0;
    // The link's own round trip (honestRtt), not the pongs': a busy host page
    // reads those late and would turn honest quick answers down, and a guest
    // can't make the browser's measure shorter than its link is.
    return performance.now() - Math.max(guest.mediaAt.at, clock) < honestRtt(guest) + MIN_HUMAN_MS;
  }

  private watchOwnPresence() {
    this.presenceWatch ??= watchPresence((p) => {
      if (this.mode === 'client' && this.hostConn?.open && this.welcomedOn === this.hostConn) this.hostConn.send({ t: 'presence', p });
      else if (this.mode === 'host') this.standingSoon('', p);
    });
  }

  private startPings() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const now = Date.now();
      this.noteAlive();
      for (const [conn, g] of this.guests) {
        if (!g.playerId) continue;
        if (now - g.lastPong > DEAD_AFTER_MS) {
          conn.close();
          continue;
        }
        // Unpredictable, so a guest can't answer a ping before it arrives (and look closer than it is).
        const n = crypto.getRandomValues(new Uint32Array(1))[0];
        g.pings.set(n, now);
        if (g.pings.size > 10) g.pings.delete(g.pings.keys().next().value!);
        this.send(conn, { t: 'ping', n });
        g.slow = slowLink(g.slow, g.rtt, now - g.lastPong);
        void measuredRtt(conn.peerConnection).then((rtt) => {
          if (rtt !== null && this.guests.get(conn) === g) g.linkRtt = rtt;
        });
      }
      this.updateStanding();
    }, PING_EVERY_MS);
  }

  /**
   * Host: someone's presence changed (`p`): the room is told now, rather than
   * at the next ping, and once more as an away player's grace runs out (each
   * player's own, however many go away at once).
   */
  private standingSoon(who: string, p: Presence) {
    this.updateStandingPaced();
    const had = this.standingTimers.get(who);
    if (had) clearTimeout(had);
    this.standingTimers.delete(who);
    if (p !== 'away') return;
    this.standingTimers.set(
      who,
      setTimeout(() => {
        this.standingTimers.delete(who);
        this.updateStandingPaced();
      }, AWAY_AFTER_MS + 50),
    );
  }

  /** updateStanding, at most every STANDING_GAP_MS: a guest flipping its presence over and over can't flood the room. The last change is always told. */
  private updateStandingPaced() {
    if (this.standingPace) {
      this.standingPace.owed = true;
      return;
    }
    this.updateStanding();
    const pace = {
      owed: false,
      timer: setTimeout(() => {
        this.standingPace = null;
        if (pace.owed) this.updateStandingPaced();
      }, STANDING_GAP_MS),
    };
    this.standingPace = pace;
  }

  /**
   * Host, in the lobby: works out how each player stands (presence.ts) and,
   * when that changed, tells everyone. Players who are simply ready, and
   * those offline (Player.connected says so), aren't listed.
   */

  private updateStanding() {
    const s = this.state;
    const now = Date.now();
    const next: Record<string, Standing> = {};
    if (this.mode === 'host' && s?.phase === 'lobby') {
      const links = new Map([...this.guests.values()].flatMap((g) => (g.playerId ? [[g.playerId, g] as const] : [])));
      for (const p of s.players) {
        const g = links.get(p.id);
        const st = p.id === this.myPlayerId ? standingOf(ownPresence(), false, now) : g ? standingOf(g.seen, g.slow, now) : null;
        if (st) next[p.id] = st;
      }
    }
    if (JSON.stringify(next) === JSON.stringify(this.standing)) return;
    this.standing = next;
    for (const [conn, g] of this.guests) if (g.playerId) this.send(conn, { t: 'standing', s: next });
  }

  /** In a race the host's clicks skip the network; delay them by a typical guest's one-way trip. */
  private hostHandicap() {
    // Only the people racing count: not spectators, nor (Delve together) those who perished.
    const racing = new Set(this.state ? racerIds(this.state) : []);
    const rtts = [...this.guests.values()]
      .filter((g) => g.playerId && racing.has(g.playerId))
      .map((g) => honestRtt(g))
      .sort((a, b) => a - b);
    if (!rtts.length) return 0;
    return Math.min(MAX_HOST_HANDICAP_MS, rtts[Math.floor(rtts.length / 2)] / 2);
  }

  /**
   * Host: a guest's pointer, passed on; past what a real client sends
   * (cursors.ts POINTER_RATE: a stall delivering a backlog at once), only
   * its newest waits until it may go. None is lost for good, so a release
   * never is, which would leave that pointer pressed on every screen.
   */
  private cursorFrom(conn: DataConnection, guest: Guest, at: CursorAt | null) {
    guest.pointerLate = at;
    if (guest.pointerTimer) return;
    const pass = () => {
      guest.pointerTimer = null;
      if (!this.guests.has(conn) || !guest.playerId || guest.pointerLate === undefined) return;
      if (!guest.pointer.take()) {
        guest.pointerTimer = setTimeout(pass, 1000 / POINTER_RATE);
        return;
      }
      const late = guest.pointerLate;
      guest.pointerLate = undefined;
      this.relayCursor(guest.playerId, late);
    };
    pass();
  }

  /** Host: passes a player's pointer on to everyone else in the room, in the next batch (cursors.ts). */
  private relayCursor(from: string, at: CursorAt | null) {
    const s = this.state;
    if (at && !(cursorsLive(s) && s!.players.some((p) => p.id === from))) return;
    const key = cursorKey(from);
    const entry: CursorEntry = at ? [key, ...at] : [key];
    this.cursorOut.put(entry, [...this.guests].flatMap(([c, g]) => (g.playerId && g.playerId !== from ? [c] : [])));
    if (from !== this.myPlayerId) peerCursors.set(key, at);
    // A click is quicker than a batch: a press or its release goes at once.
    const pressed = !!at && actionOf(at[3]) === PRESSED;
    const changed = pressed !== (this.cursorPressed.get(key) ?? false);
    if (at) this.cursorPressed.set(key, pressed);
    else this.cursorPressed.delete(key);
    this.planCursors(changed);
  }

  /**
   * Sends the guests their batches, or plans to once FLUSH_EVERY_MS has gone
   * by since the last; a click (`now`), once CLICK_GAP_MS has, so however
   * many are clicking, a guest is sent a frame's worth at once at most.
   * Called as pointers come in, too: a host's tab out of sight gets its
   * timers held back to once a second, the messages it gets aren't, so the
   * room's pointers stay as smooth.
   */
  private planCursors(now = false) {
    if (!this.cursorOut.waiting) return;
    const t = performance.now();
    const due = this.cursorsSentAt + (now ? CLICK_GAP_MS : FLUSH_EVERY_MS);
    if (due > t) {
      if (this.cursorTimer && this.cursorsDue <= due) return;
      if (this.cursorTimer) clearTimeout(this.cursorTimer);
      this.cursorsDue = due;
      this.cursorTimer = setTimeout(() => {
        this.cursorTimer = null;
        this.sendCursors();
      }, due - t);
      return;
    }
    this.sendCursors();
  }

  private sendCursors() {
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    this.cursorTimer = null;
    this.cursorsSentAt = performance.now();
    for (const conn of this.guests.keys()) {
      // PeerJS queues what the channel has no room for yet (its binary connections say how much).
      const queued = (conn as { bufferSize?: number }).bufferSize ?? 0;
      if (queued > 0 || (conn.dataChannel?.bufferedAmount ?? 0) > CURSOR_BACKLOG_BYTES) continue;
      const c = this.cursorOut.take(conn);
      if (c) this.send(conn, { t: 'cursors', c });
    }
    // Whoever's link was backed up (or what followed a press): next time round.
    if (this.cursorOut.waiting) this.planCursors();
  }

  /** This device's pointer (PeerCursors.svelte), for the other players to see; null when it left the page. */
  pointAt(at: CursorAt | null) {
    const me = this.myPlayerId;
    if (!me || this.status !== 'ready') return;
    if (at) noteInput();
    if (this.mode === 'client') {
      if (this.hostConn?.open) this.hostConn.send({ t: 'cursor', at });
    } else if (this.mode === 'host' && !this.labRoomless) this.relayCursor(me, at);
  }

  private send(conn: DataConnection, msg: HostMsg) {
    if (!conn.open) return;
    if (FAKE_LINK) {
      setTimeout(() => this.sendNow(conn, msg), FAKE_LINK.delayMs);
      return;
    }
    this.sendNow(conn, msg);
  }

  private sendNow(conn: DataConnection, msg: HostMsg) {
    if (!conn.open) return;
    try {
      conn.send(msg);
    } catch {
      /* closed underneath us */
    }
  }

  // ---- question media ---------------------------------------------------

  /**
   * Host: new question → prepare its art, seal it (seal.ts) and send it to
   * everyone at once, spectators too: nothing in it can be seen before its
   * key, which goes out as its clock starts (waitForArrival, startClock).
   * The host's own screen waits for that too. A race's question drawn ahead
   * (`ahead`) comes with its art prepared and mostly sent already.
   */
  private async startMedia(s: GameState, ahead: AheadArt | null = null) {
    const q = s.question!;
    this.stopMedia();
    const gen = this.mediaGen;
    shown.clear();
    // What hasn't gone yet of the question before (or of one drawn ahead and
    // thrown away) is of no use any more: this one's goes first. One drawn
    // ahead keeps its own, sent behind it.
    for (const g of this.guests.values()) {
      const span = ahead?.sent.get(g);
      if (span === undefined) g.lane?.clear();
      else if (span !== null) g.lane?.clearBefore(span.from);
    }
    const qid = q.askedAt;
    let prepared: PreparedArt;
    try {
      prepared = await (ahead?.ready ?? this.prepareArt(s));
    } catch (err) {
      console.warn('media', err);
      if (gen === this.mediaGen && this.state?.question?.askedAt === qid && this.state.phase === 'question') {
        this.artFailedFor = qid;
        // Its clock hasn't started (nobody has seen a thing of it): another question takes its place by itself.
        if (mayAutoReask(this.state, qid)) this.reaskLater(this.state);
        else this.flash("Couldn't load the art for this question.", 'warn', { title: 'Art missing' });
      }
      return;
    }
    const { media, plain, sealing } = prepared;
    // The question as it is now: the clock may have run on meanwhile.
    const cur = this.state;
    if (gen !== this.mediaGen || cur?.question?.askedAt !== qid || cur.phase !== 'question') return;
    this.media = media;
    this.released = plain;
    this.sealing = sealing;
    this.sendSealed(cur, sealing.sealed, ahead?.sent ?? new Map());
    if (!clockRuns(cur.question)) {
      this.waitForArrival(qid);
      return;
    }
    // Picked up with its clock running (the host reloaded): it opens at once,
    // the veil (or the pictures) burning in from that clock's start.
    this.openSeal(qid);
    if (media.veil || media.tiles.length) this.burnVeil(qid, cur.question.clockAt!);
  }

  /** Prepares a question's art (media.svelte.ts), within MEDIA_TIMEOUT_MS, and seals it; `signal` stops it partway. */
  private async prepareArt(s: GameState, signal?: AbortSignal): Promise<PreparedArt> {
    const q = s.question!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Preparing the art timed out')), MEDIA_TIMEOUT_MS);
    });
    const media = await Promise.race([prepareMedia(q, this.grayscaleOf(s), veilClock(s), engine.byId, signal), timeout]).finally(() => clearTimeout(timer));
    const plain = picturesOf(media);
    return { media, plain, sealing: await this.sealMedia(q.askedAt, plain) };
  }

  /**
   * A question's sealed pictures to everyone in the room not `sent` them yet
   * (noted there, with where they begin on each one's lane), those its clock
   * waits for first, so the others' copies don't go ahead of theirs on the
   * host's uplink.
   */
  private sendSealed(s: GameState, sealed: SealedMsg[], sent: Map<Guest, LaneSpan | null>) {
    const first = new Set(clockWaitsFor(s));
    const guests = [...this.guests]
      .filter(([, g]) => !!g.playerId && !sent.has(g))
      .sort(([, a], [, b]) => Number(first.has(b.playerId!)) - Number(first.has(a.playerId!)));
    for (const [conn, g] of guests) {
      const lane = g.laneWanted && g.lane?.usable ? g.lane : null;
      const from = lane?.mark ?? 0;
      for (const m of sealed) this.sendMedia(conn, g, m);
      sent.set(g, lane ? { from, to: lane.mark } : null);
    }
  }

  /**
   * Race, as the reveal starts: the next question is drawn ahead on a copy of
   * the state (drawAhead.ts), and its art prepared, sealed and sent to
   * everyone while the reveal plays, so that by 'next' it is mostly there.
   * Sent once the reveal's own last patches are on their way (`after`), never
   * ahead of them: on each lane, they'd wait behind it. Nothing of it can be seen before its
   * clock starts, like any question's, and nothing of it is in the live
   * state until then.
   */
  private drawAhead(s: GameState, after: Promise<void>) {
    this.dropAhead();
    if (this.mode !== 'host' || this.labRoomless) return;
    const drawn = drawAhead(s, (st) => engine.apply(st, { type: 'next' }, null));
    if (!drawn) return;
    const stop = new AbortController();
    const a: AheadArt = { ...drawn, ready: this.prepareArt(drawn.state, stop.signal), stop, sent: new Map() };
    this.ahead = a;
    a.ready.then(
      async ({ sealing }) => {
        // (Should they never go, the next question was asked first: startMedia sends it.)
        await after;
        if (this.ahead === a) this.sendSealed(a.state, sealing.sealed, a.sent);
      },
      (err) => {
        // Thrown away (stopped), or drawn again at 'next', as before (and asked again by itself should that fail too).
        if (this.ahead !== a) return;
        console.warn('media ahead', err);
        this.ahead = null;
      },
    );
  }

  /**
   * The question drawn ahead is thrown away: its preparing stops, and what
   * of its art hasn't gone yet down each lane is dropped, so neither holds
   * up the question drawn in its place.
   */
  private dropAhead() {
    const a = this.ahead;
    if (!a) return;
    this.ahead = null;
    a.stop.abort();
    for (const [g, span] of a.sent) if (span) g.lane?.drop(span.from, span.to);
  }

  /**
   * A guest's art lane closed, or never opened: what it carried of the
   * question in play, and of one drawn ahead, goes again on the main
   * channel (sendMedia, now the lane is no use).
   */
  private laneLost(conn: DataConnection, g: Guest) {
    if (this.guests.get(conn) !== g || !g.playerId || !conn.open) return;
    this.replayMedia(conn, g);
    const a = this.ahead;
    if (!a?.sent.has(g)) return;
    a.sent.delete(g);
    a.ready.then(
      ({ sealing }) => this.ahead === a && this.sendSealed(a.state, sealing.sealed, a.sent),
      () => {},
    );
  }

  /**
   * Host: the step to the next question. A race's drawn ahead is taken if the
   * room is just as it was when it was drawn (takeAhead), its art with it;
   * otherwise it's drawn now, as before.
   */
  private stepNext(cur: GameState, from: string | null): GameState {
    const a = this.ahead;
    const taken = takeAhead(cur, a);
    if (!taken) {
      this.dropAhead();
      return engine.apply(cur, { type: 'next' }, from);
    }
    this.ahead = null;
    this.taking = a;
    return taken;
  }

  /**
   * Seals a question's pictures under a fresh key of its own (seal.ts), with
   * an id new each time they're prepared (a host's reload included), so no
   * bytes sealed for one question ever pair with another's key. Hot-seat and
   * the lab send nobody anything: nothing to seal.
   */
  private async sealMedia(qid: number, plain: MediaMsg[]): Promise<Sealing> {
    if (this.mode !== 'host' || this.labRoomless) return { qid, key: null, sealed: [], open: false };
    const key = await makeSealKey(`${qid}-${newKid()}`);
    return { qid, key, sealed: await Promise.all(plain.map((m) => sealMsg(m, key))), open: false };
  }

  /**
   * Starts the question's clock once the host's queues to everyone it waits
   * for have drained, the sealed art on the wire, or once the cap has run out
   * (clockCap: a fifth of the question's time, 2 to 4 s), whichever comes
   * first. Who it waits for is looked at afresh each time (clockWaitsFor: the
   * player on turn, everyone racing, in Delve those answering), leaving out
   * anyone offline and anyone the cap ran out on twice running (CAP_STRIKES),
   * so one throttled link can't hold every question up; they're watched until
   * the cap, and draining within it lets them back in. Nothing a guest says
   * counts: only the host's own queues, and the round trip the browser
   * measures (honestRtt). With nobody to wait for (the host alone, hot-seat),
   * at once.
   */
  private waitForArrival(qid: number) {
    let releasedAt = Date.now();
    let started = false;
    const poll = () => {
      const s = this.state;
      if (!s || s.phase !== 'question' || s.question?.askedAt !== qid || this.sealing?.qid !== qid) return;
      const now = Date.now();
      const capped = now - releasedAt >= clockCap(s);
      const ids = clockWaitsFor(s);
      const waitIds = new Set(stillWaitedFor(ids, this.strikes));
      const links = [...this.guests].flatMap(([c, g]) =>
        g.playerId && ids.includes(g.playerId) ? [{ id: g.playerId, g, done: drained(c as unknown as Parameters<typeof drained>[0]) && !g.lane?.backlog }] : [],
      );
      const waited = links.filter((l) => waitIds.has(l.id));
      const leftOut = links.filter((l) => !waitIds.has(l.id));
      const watchLeftOut = () => {
        if (!capped && leftOut.some((l) => !l.done)) this.mediaTimers.push(setTimeout(poll, DRAIN_POLL_MS));
      };
      if (started) {
        // Started without them: those whose art is out within the cap after all are waited for again.
        this.strikes = capStrikes(this.strikes, leftOut.filter((l) => l.done).map((l) => l.id), []);
        watchLeftOut();
        return;
      }
      if (clockRuns(s.question)) return;
      // After the host's reload, not before everyone it cut off is back (or
      // their grace is over); the art reaching them is waited for from then.
      // Looked at less often meanwhile: that may take up to a minute.
      if (awaitingReturn(s, now)) {
        releasedAt = now;
        this.mediaTimers.push(setTimeout(poll, RETURN_POLL_MS));
        return;
      }
      const done = waited.every((l) => l.done);
      // The slowest of them still needs half a round trip for the last bytes and the key.
      const rtt = Math.max(0, ...waited.map((l) => honestRtt(l.g)));
      // Together, after a vote: not before its draw has played out on the cards, theirs starting that half trip late.
      const hold = this.drawHold?.qid === qid ? drawClockFrom(this.drawHold.until, rtt) : 0;
      if ((done || capped) && now >= hold - 500) {
        const late = capped ? waited.filter((l) => !l.done) : [];
        this.strikes = capStrikes(this.strikes, links.filter((l) => l.done).map((l) => l.id), late.map((l) => l.id));
        this.startClock(qid, Math.max(hold, waited.length ? clockStart(done ? now : null, releasedAt, rtt, clockCap(s)) : now));
        started = true;
        watchLeftOut();
        return;
      }
      this.mediaTimers.push(setTimeout(poll, DRAIN_POLL_MS));
    };
    poll();
  }

  /** Veiled art: its patches go out on schedule, counted from `from` (host clock). */
  private burnVeil(qid: number, from: number) {
    const media = this.media;
    const q = this.state?.question;
    if (!media || media.qid !== qid || !q?.veil) return;
    const sets = veiledSets(media);
    sets.forEach(({ tile, patches, delays, gap }, k) => {
      // Several pictures take turns within half a step of their pace up to the half, so their patches don't
      // all flare at once (and the last one is no more than half a step behind: patches.ts veilSchedule).
      const offset = (gap * k) / sets.length / 2;
      patches.forEach((patch, rank) => {
        const due = from + delays[rank] + offset - Date.now();
        const go = () => {
          if (this.media?.qid === qid) this.release({ t: 'patch', qid, ...(tile === undefined ? {} : { tile }), ...patch });
        };
        if (due <= 0) go();
        else this.mediaTimers.push(setTimeout(go, due));
      });
    });
  }

  /**
   * The question's clock starts at `at` (host clock): the key to its
   * pictures goes out to everyone first, on the main channel, then the state
   * that starts the clock; the host's own screen shows the art with it.
   */
  private startClock(qid: number, at: number) {
    const cur = this.state;
    if (!cur || cur.question?.askedAt !== qid || clockRuns(cur.question)) return;
    const next = engine.apply(cur, { type: 'clock', askedAt: qid, at }, null);
    if (!clockRuns(next.question)) return;
    this.openSeal(qid);
    this.setState(next);
    const clockAt = this.state?.question?.clockAt;
    if (clockAt !== undefined) this.burnVeil(qid, clockAt);
  }

  /**
   * The key to the question's pictures goes out to everyone, once: its clock
   * starts, or it ended before it did. Their too-quick checks count from
   * now; the host's own screen shows the pictures now too.
   */
  private openSeal(qid: number) {
    const sl = this.sealing;
    if (!sl || sl.qid !== qid || sl.open) return;
    sl.open = true;
    for (const [conn, g] of this.guests) if (g.playerId) this.sendKey(conn, g);
    for (const m of this.released) if (m.t !== 'patch') shown.receive(m);
  }

  /** The key to the question's pictures, to one guest. */
  private sendKey(conn: DataConnection, g: Guest) {
    const sl = this.sealing;
    if (!sl) return;
    // On the main channel, which no picture holds up: the art lane may still be busy with the art itself.
    if (sl.key) this.send(conn, keyMsg(sl.key));
    g.mediaAt = { qid: sl.qid, at: performance.now() };
  }

  /** Someone arrived (or came back) during a question: its sealed pictures, their key if its clock has started, and the patches gone out. */
  private replayMedia(conn: DataConnection, g: Guest) {
    const sl = this.sealing;
    if (!sl || this.state?.question?.askedAt !== sl.qid) return;
    for (const m of sl.sealed) this.sendMedia(conn, g, m);
    if (sl.open) this.sendKey(conn, g);
    for (const m of this.released) if (m.t === 'patch') this.sendMedia(conn, g, m);
  }

  /**
   * Art that failed to load is asked again by itself, with a backoff, a few
   * times, in every mode (nothing is lost while it does, as the clock only
   * starts once the art is out, and nobody has seen a thing of it). Then it
   * stops: the question waits, its clock not started, until the host asks
   * another (Game's "Ask another question") or the browser is back online
   * (artBack), so an offline device doesn't spin through questions forever
   * (and in Delve the depth still has to be answered).
   */
  private reaskLater(s: GameState) {
    const qid = s.question!.askedAt;
    // Per turn of this game or run (turns count from 0 again in the next one).
    const turn = `${s.delve?.startedAt ?? s.startedAt}:${s.turnCount}`;
    if (this.reaskFails.turn !== turn) this.reaskFails = { turn, n: 0 };
    const n = this.reaskFails.n++;
    const wait = reaskDelay(n);
    if (n === 1) this.flash("The art keeps failing to load, so we're trying another question.", 'warn', { title: 'Art missing' });
    if (wait === null) {
      this.flash("The art won't load. Check your connection, then ask for another question. Nothing is lost while you wait.", 'warn', { title: 'Art missing' });
      return;
    }
    this.mediaTimers.push(
      setTimeout(() => {
        if (mayAutoReask(this.state, qid)) this.setState(engine.apply(this.state!, { type: 'reask' }, null));
      }, wait),
    );
  }

  /** The browser is back online: a question waiting on art that failed is asked again. */
  artBack() {
    const s = this.state;
    if (!this.artMissing || !s?.question || !mayAutoReask(s, s.question.askedAt)) return;
    this.reaskFails = { turn: '', n: 0 };
    this.setState(engine.apply(s, { type: 'reask' }, null));
  }

  /** Patches of the current veiled picture that haven't gone out yet, in order. */
  private unreleasedPatches() {
    const media = this.media;
    if (!media) return [];
    const key = (tile: number | undefined, i: number) => `${tile ?? ''}:${i}`;
    const sent = new Set(this.released.flatMap((m) => (m.t === 'patch' ? [key(m.tile, m.i)] : [])));
    return veiledSets(media).flatMap(({ tile, patches }) =>
      patches.filter((p) => !sent.has(key(tile, p.i))).map((p) => ({ qid: media.qid, ...(tile === undefined ? {} : { tile }), ...p })),
    );
  }

  /**
   * The rest of a veiled picture goes out now (the answer is out), a few
   * tens of ms apart: it burns in
   * quickly, still spreading from what's there, and every device starts each
   * patch's burn in a different frame. Settles once the last has gone (by
   * its timer, which a busy page may hold up well past its time; never, if
   * the next question came first).
   */
  private finishVeil(rest: ReturnType<Session['unreleasedPatches']>): Promise<void> {
    const gap = Math.min(30, 300 / Math.max(1, rest.length));
    let done = () => {};
    const out = new Promise<void>((resolve) => (done = resolve));
    rest.forEach((patch, k) => {
      const go = () => {
        const s = this.state;
        if ((s?.phase === 'reveal' || s?.phase === 'question') && s.question?.askedAt === patch.qid) this.release({ t: 'patch', ...patch });
        if (k === rest.length - 1) done();
      };
      if (k === 0) go();
      else this.mediaTimers.push(setTimeout(go, k * gap));
    });
    if (!rest.length) done();
    return out;
  }

  /**
   * A patch of a veiled picture goes out, on the host's own screen and to
   * everyone, unsealed: it only names which part of a picture they already
   * hold uncovers, and only ever after the key to it.
   */
  private release(m: MediaMsg) {
    this.released.push(m);
    shown.receive(m);
    for (const [conn, g] of this.guests) if (g.playerId) this.sendMedia(conn, g, m);
  }

  private sendMedia(conn: DataConnection, g: Guest, m: MediaMsg | SealedMsg) {
    // On its own lane, so the art never holds up what the main channel carries.
    if (g.laneWanted && g.lane?.usable) g.lane.send({ ...m });
    else this.send(conn, m);
  }

  private stopMedia(keepReleased = false) {
    if (!keepReleased) this.mediaGen++;
    for (const t of this.mediaTimers) clearTimeout(t);
    this.mediaTimers = [];
    this.media = null;
    if (keepReleased) return;
    this.released = [];
    this.sealing = null;
  }

  // ---- joining ----------------------------------------------------------

  /** Where the join under way started (count.ts), counted once it's let in; none for a guest's reload getting back in. */
  private joinVia: JoinVia | null = null;
  /** A join's failure, counted only when the join was (not a guest's reload getting back in). */
  private joinFailure = (failure: Failure): Failure | undefined => (this.joinVia ? failure : undefined);

  join(code: string, name: string, watch = false, via?: JoinVia) {
    // The host's room has its own settings: a shared link's Delve is moot.
    this.delveLink = false;
    this.reset();
    this.mode = 'client';
    this.status = 'connecting';
    this.joinName = name;
    this.watchOnly = watch;
    this.code = code.toUpperCase().trim();
    if (!CODE_PATTERN.test(this.code)) {
      this.fail(`"${this.code}" isn't a valid room code.`, 'Invalid code');
      return;
    }
    // The room's pictures come sealed: a page that can't open them is told so now, not after the host turns it away.
    if (!sealAvailable()) {
      this.fail(NO_SEAL_JOIN, "Can't join");
      return;
    }
    this.joinVia = via ?? null;
    if (via) countEvent(`join/${via}`);
    this.saveGuest();
    const room = this.code;
    this.helloSecret = roomSecret(mySecret, room).catch(() => stored(`secret.${room}`, () => randomToken(32)));
    this.joinedAt = Date.now();
    this.armConnectTimeout();
    this.startClientPeer();
  }

  private saveGuest() {
    writeSaved({ mode: 'client', code: this.code, name: this.joinName, ...(this.watchOnly ? { watch: true } : {}) });
  }

  /**
   * Guest: watch rather than play (a spectator stays one when the next game
   * starts; a player in the lobby gives up their seat), or take a seat again.
   */
  watch(on: boolean) {
    if (this.mode !== 'client') return;
    // Remembered once the host has it so (noteWatch): a choice it turns down isn't kept.
    this.dispatch({ type: 'watch', watch: on });
  }

  /** Guest: keeps (and saves) whether the host has this guest down as just watching. */
  private noteWatch(s: GameState) {
    const me = this.myPlayerId;
    if (!me) return;
    const watcher = s.spectators?.find((o) => o.id === me);
    // Not in the room at all (yet): nothing to go by.
    if (!watcher && !s.players.some((p) => p.id === me)) return;
    const on = !!watcher?.stay;
    if (on === this.watchOnly) return;
    this.watchOnly = on;
    this.saveGuest();
  }

  /**
   * Client: a peer of our own on the signalling server. One that couldn't get
   * there at all is replaced after a moment, until joining gives up.
   */
  private startClientPeer() {
    this.peer?.destroy();
    this.cancelAttempts();
    const peer = new Peer(PEER_OPTIONS);
    this.peer = peer;
    // 'open' fires again when the signalling server is reconnected: a live
    // link to the host doesn't need it, a lost one tries again right away.
    peer.on('open', () => this.peer === peer && this.status !== 'ready' && this.connectToHost());
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (err.type !== 'peer-unavailable') console.warn('peer error', err);
      if (this.status !== 'connecting') return;
      if (err.type === 'peer-unavailable') this.roomUnavailable();
      // One attempt's negotiation failed (or was cut short when another won): the others go on.
      else if (err.type === 'webrtc') {
        this.pruneAttempts();
        this.planAttempt(RETRY_SOON_MS);
      }
      else if (!NETWORK_ERRORS.has(err.type)) this.fail(this.networkHint(err.type), 'No connection', { failure: this.joinFailure('join-no-connection') });
      else {
        // The signalling server hiccuped. A peer that had reached it reconnects
        // on its own ('disconnected'); one that never did is destroyed right
        // after this error, and a fresh one takes its place.
        if (this.peerTimer) clearTimeout(this.peerTimer);
        this.peerTimer = setTimeout(() => {
          this.peerTimer = null;
          if (this.peer === peer && peer.destroyed && this.status === 'connecting') this.startClientPeer();
        }, RETRY_SOON_MS);
      }
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
    });
  }

  /** Joining gives up if the room hasn't let us in by then. */
  private armConnectTimeout() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    const wait = Math.min(JOIN_GIVE_UP_MS, this.joinedAt + JOIN_GIVE_UP_CAP_MS - Date.now());
    this.connectTimer = setTimeout(() => {
      if (this.mode !== 'client' || this.status !== 'connecting') return;
      if (this.peer?.open) this.fail(`Couldn't reach room ${this.code}. Check the code, or try again.`, 'No answer', { failure: this.joinFailure('join-no-answer') });
      else this.fail(this.networkHint('timeout'), 'No connection', { failure: this.joinFailure('join-no-connection') });
    }, wait);
  }

  /**
   * The server couldn't hand an attempt to the room's host. The host may only
   * be reconnecting to the server, so that's believed once an attempt made
   * after the first such answer gets one too. The server doesn't say which
   * attempt it means, so answers that may be about earlier ones don't count.
   */
  private roomUnavailable() {
    if (this.hostConn?.open) return;
    if (this.unavailableUntil && Date.now() >= this.unavailableUntil) {
      this.fail(`No room has the code ${this.code}. Check it with your host.`, 'No such room', { failure: this.joinFailure('join-no-such-room') });
      return;
    }
    if (!this.unavailableUntil) this.unavailableUntil = Math.max(Date.now(), ...this.attempts.map((a) => a.at)) + EXPIRE_MS;
    // The server holds an offer a few seconds before giving up on it, so the
    // answer is about an attempt that old. A newer one may still get through.
    const now = Date.now();
    const old = this.attempts.find((a) => now - a.at >= NEXT_ATTEMPT_MS);
    if (old) {
      old.conn.close();
      this.attempts = this.attempts.filter((a) => a !== old);
    }
    this.planAttempt(RETRY_SOON_MS);
  }

  /**
   * The host has too many people joining (or this device reconnected a lot):
   * wait a moment and try again. A live connection that dropped already
   * retries on its own schedule; this covers joining and resuming.
   */
  private retryWhenBusy() {
    if (this.status !== 'connecting') return;
    this.busyUntil = Date.now() + BUSY_RETRY_MS;
    this.armConnectTimeout();
    this.planAttempt();
  }

  /** Stops trying to reach the host: closes the attempts that haven't opened, and the next one won't come. */
  private cancelAttempts() {
    for (const a of this.attempts) a.conn.close();
    this.attempts = [];
    if (this.nextAttempt) clearTimeout(this.nextAttempt);
    this.nextAttempt = null;
  }

  /**
   * How long until another attempt to reach the host is due: a second one
   * racing the first, or one in place of the oldest once it had its time.
   * The host lets a peer have two that haven't introduced themselves.
   */
  private attemptDue() {
    const now = Date.now();
    const list = this.attempts;
    if (!list.length) return 0;
    if (list.length < MAX_PENDING_PER_PEER) return list[list.length - 1].at + NEXT_ATTEMPT_MS - now;
    return list[0].at + ATTEMPT_LIFE_MS - now;
  }

  /**
   * Forgets attempts that are over: closed (they let go of their peer) or
   * whose negotiation broke, which PeerJS reports without saying which.
   */
  private pruneAttempts() {
    this.attempts = this.attempts.filter((a) => {
      const pc = a.conn.peerConnection;
      const over = !a.conn.provider || pc?.signalingState === 'closed' || pc?.connectionState === 'failed';
      if (over) a.conn.close();
      return !over;
    });
  }

  /** Joining: (re)schedules the next attempt to reach the host, no sooner than `soonest` ms from now. */
  private planAttempt(soonest = 0) {
    if (this.mode !== 'client' || this.status !== 'connecting') return;
    if (this.nextAttempt) clearTimeout(this.nextAttempt);
    this.nextAttempt = null;
    // An open link waits for the room's answer.
    if (this.hostConn?.open) return;
    const peer = this.peer;
    this.pruneAttempts();
    const wait = Math.max(soonest, this.attemptDue(), this.busyUntil - Date.now());
    this.nextAttempt = setTimeout(() => {
      this.nextAttempt = null;
      if (this.peer === peer && this.status === 'connecting' && !this.hostConn?.open) this.connectToHost();
    }, wait);
  }

  /**
   * Starts an attempt to reach the host. The previous one keeps racing it: a
   * slow relay may still get through first, and a fresh one gets past an
   * offer or candidate that went missing.
   */
  private connectToHost() {
    // Without the signalling server there is no connecting (PeerJS returns
    // nothing); its reconnect fires 'open', which tries again.
    if (!this.peer || this.peer.destroyed || this.peer.disconnected) return;
    if (this.status === 'connecting') {
      // An open link waits for the room's answer; a fresh one would only replace it.
      if (this.hostConn?.open) return;
      // Told to wait: that wait decides.
      if (Date.now() < this.busyUntil) {
        this.planAttempt();
        return;
      }
    }
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true });
    if (!conn) return;
    this.guardHostFrames(conn);
    // The host would turn the oldest away anyway.
    this.pruneAttempts();
    while (this.attempts.length >= MAX_PENDING_PER_PEER) this.attempts.shift()!.conn.close();
    this.attempts.push({ conn, at: Date.now() });
    this.planAttempt();
    conn.on('error', () => {
      // Its negotiation failed: the next one comes soon.
      this.attempts = this.attempts.filter((a) => a.conn !== conn);
      this.planAttempt(RETRY_SOON_MS);
    });
    conn.on('open', () => this.adopt(conn));
  }

  /**
   * Checks what the host sends before PeerJS decodes (or buffers) it: a host
   * is anyone who opened a room, so a few bytes announcing billions of
   * entries must not freeze the guest. A host that sends one is left.
   */
  private guardHostFrames(conn: DataConnection) {
    const chunks = new ChunkGuard();
    const refuse = () => {
      if (this.hostConn === conn) this.fail('The host sent something this game can\'t read, so you left the room.', 'Left the room');
      conn.close();
      return false;
    };
    const check = (data: unknown) => frameFits(data, MAX_HOST_MSG_BYTES) || refuse();
    if (hookFrames(conn, check, (chunk) => chunks.check(chunk) || refuse())) return;
    console.warn('PeerJS changed: what the host sends is decoded unchecked');
  }

  /** The first attempt to open becomes the link to the host; the rest make way. */
  private async adopt(conn: DataConnection) {
    if (!this.attempts.some((a) => a.conn === conn)) {
      conn.close();
      return;
    }
    this.attempts = this.attempts.filter((a) => a.conn !== conn);
    this.cancelAttempts();
    this.unavailableUntil = 0;
    const stale = this.hostConn;
    this.hostConn = conn;
    stale?.close();
    // The host sends what a question holds again on the new link (or, reloaded, under a new key).
    this.sealedArt.clear();
    // Anything from the host: a link it then closes was not turned away without a word.
    let heard = false;
    // A host that vanishes (crashed tab, lost Wi-Fi) often never fires 'close'.
    // It pings every few seconds, so silence means the connection is dead.
    let lastHeard = Date.now();
    if (this.hostWatch) clearInterval(this.hostWatch);
    this.hostWatch = setInterval(() => {
      if (this.hostConn !== conn) return;
      if (this.status === 'ready' && Date.now() - lastHeard > HOST_SILENCE_MS) {
        this.hostLost(conn);
        conn.close();
      }
    }, 2000);
    // The art lane (artLane.ts), opened before the hello says so: the room's pictures come down it.
    const lane = openLane(conn.peerConnection);
    if (lane) {
      const frames = new LaneReceiver((raw) => {
        const msg = parseHostMsg(raw);
        if (!msg || this.hostConn !== conn) return;
        // Sealed until the clock starts (seal.ts); the patches come plain, after the key.
        if (msg.t === 'sealed') this.sealedArt.take(msg);
        else if (isMedia(msg)) shown.receive(msg);
      });
      lane.addEventListener('message', (e) => {
        if (this.hostConn !== conn) return;
        lastHeard = Date.now();
        // A broken frame: the lane is closed, and the host sends the rest on the main channel.
        if (!frames.take(e.data)) lane.close();
      });
    }
    conn.on('data', (raw) => {
      if (this.hostConn !== conn) return;
      lastHeard = Date.now();
      heard = true;
      this.silentCloses = 0;
      const msg = parseHostMsg(raw);
      if (!msg) return;
      switch (msg.t) {
        case 'hi':
          this.hostHi = { conn, c: msg.c };
          this.onHi?.();
          break;
        case 'welcome': {
          this.myPlayerId = msg.playerId;
          // Only now: a host on another version turns the hello down, and would
          // take a message it doesn't know for an attack. It takes every guest
          // to be here until told otherwise; from then on, each change is sent
          // as it happens (watchOwnPresence).
          this.welcomedOn = conn;
          const { presence } = ownPresence();
          if (presence !== 'here') conn.send({ t: 'presence', p: presence });
          break;
        }
        case 'state':
          this.syncClock(msg.now);
          if (!this.state || msg.state.version >= this.state.version || msg.state.version === 0) {
            try {
              this.noteChange(this.state, msg.state);
            } catch (err) {
              // Only shape-checked: a game this one can't follow is left, as one it can't show is (crashed).
              console.error(err);
              this.crashed(false);
              conn.close();
              return;
            }
            this.state = msg.state;
          }
          if (this.status === 'connecting' && this.joinVia) countEvent(`joined/${this.joinVia}`);
          this.joinVia = null;
          this.status = 'ready';
          if (this.state) this.noteWatch(this.state);
          break;
        case 'error':
          // An answer turned down (too quick) didn't count: the one given next is timed instead.
          if (msg.askedAt !== undefined) {
            if (this.answered?.qid === msg.askedAt) this.answered = null;
            this.turnedDown = { askedAt: msg.askedAt };
          }
          if (this.status === 'connecting')
            this.fail(versionRefusal(msg.message), "Couldn't join", { failure: this.joinFailure(isVersionRefusal(msg) ? 'join-version-mismatch' : 'join-refused') });
          else this.flash(msg.message, 'error');
          break;
        case 'kicked':
        case 'closed':
        case 'replaced':
          this.turnedOut(msg.t);
          break;
        case 'busy':
          this.flash(msg.message, 'warn', { title: 'Room busy' });
          this.retryWhenBusy();
          break;
        case 'ping':
          conn.send({ t: 'pong', n: msg.n });
          break;
        case 'standing':
          this.standing = msg.s;
          break;
        // A guest without the art lane gets the sealed pictures here; everyone gets their keys here.
        case 'sealed':
          this.sealedArt.take(msg);
          break;
        case 'key':
          this.sealedArt.key(msg);
          break;
        case 'cursors':
          if (!cursorsLive(this.state)) break;
          for (const e of msg.c) if (e[0] !== cursorKey(this.myPlayerId ?? '')) peerCursors.set(e[0], entryAt(e));
          break;
        default:
          shown.receive(msg);
      }
    });
    conn.on('close', () => {
      if (this.hostConn !== conn) return;
      if (this.status !== 'connecting') {
        this.hostLost(conn);
        return;
      }
      // Closed before the room let us in. A host that turns a link away
      // without a word does so every time (a dropped network link rarely
      // does, three times running): try again, then say so.
      if (!heard && ++this.silentCloses >= 3) this.fail(`Room ${this.code} turned the connection away. Try again in a moment.`, "Couldn't join", { failure: this.joinFailure('join-turned-away') });
      else this.planAttempt(RETRY_SOON_MS);
    });
    const secret = await this.helloSecret;
    const owner = isHeldName(cleanName(this.joinName)) ? await this.signHello(conn) : null;
    if (secret && this.hostConn === conn && conn.open)
      conn.send({ t: 'hello', secret, name: this.joinName, v: PROTOCOL_VERSION, tab: myTab, ...(this.watchOnly ? { watch: true } : {}), ...(lane ? { lane: true } : {}), seal: true, ...(owner ? { owner } : {}) });
    this.watchOwnPresence();
  }

  private hostLost(conn: DataConnection) {
    if (this.hostConn === conn && this.mode === 'client' && this.status === 'ready') {
      this.status = 'lost';
      this.retries = 0;
      // A link that came back on its own after giving up starts a fresh count.
      this.gaveUp = false;
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      if (this.mode !== 'client' || this.status === 'ready') return;
      if (this.retries++ >= 20) {
        this.gaveUp = true;
        return;
      }
      // An attempt still opening keeps racing the next one, which may not be due yet.
      this.pruneAttempts();
      if (this.attemptDue() <= 0) this.connectToHost();
      this.scheduleRetry();
    }, 3000);
  }

  reconnect() {
    if (this.mode !== 'client') return;
    this.retries = 0;
    this.gaveUp = false;
    this.connectToHost();
    this.scheduleRetry();
  }

  // ---- actions ----------------------------------------------------------

  dispatch(action: Action) {
    if (!this.state) return;
    const q = this.state.question;
    if (action.type === 'answer' && action.index !== null && q && shown.qid === q.askedAt && this.answered?.qid !== q.askedAt) {
      // On a veiled picture, also how much of it had burnt in (for an achievement, lib/achievements.ts).
      const share = q.veil && shown.veil?.count ? Object.keys(shown.patches).length / shown.veil.count : undefined;
      // Timed on this device's clock from its first picture showing (on a
      // guest, as its key opened it), or from its clock running here if that
      // came later: only then does it open to answers. A Delve clock the
      // host's reload held still adds what was used of it before.
      const seen = this.clockSeen?.qid === q.askedAt ? this.clockSeen : null;
      const ms = performance.now() - Math.max(shown.since, seen?.at ?? 0) + (seen?.before ?? 0);
      this.answered = { qid: q.askedAt, ms, ...(share !== undefined ? { share } : {}) };
    }
    // The answer carries its own time, for the end screen's fastest answer (game.ts Recap).
    if (action.type === 'answer' && action.index !== null && q && this.answered?.qid === q.askedAt) action = { ...action, ms: Math.round(this.answered.ms) };
    if (this.mode === 'client') {
      this.hostConn?.send({ t: 'action', action });
      return;
    }
    const from = this.mode === 'local' ? null : this.myPlayerId;
    const run = () => {
      if (!this.state) return;
      try {
        this.setState(action.type === 'next' ? this.stepNext(this.state, from) : engine.apply(this.state, action, from));
      } catch (err) {
        if (err instanceof ActionError && err.silent) return;
        this.flash(err instanceof ActionError ? err.message : 'Something went wrong.', 'error');
      }
    };
    // Co-op Delve is a race for the right answer too (the first clears the depth and takes the find).
    // So is a blast (the first of a right answer and a blast to reach the host wins), held back alike.
    const racing = this.race || (!!this.state.delve && isGroupRun(this.state));
    // Never past the moment that judges it (delveSession.ts hostAnswerHold): held over 0, it would cost a flare.
    const handicap =
      this.mode === 'host' && !this.labRoomless && racing && (action.type === 'answer' || action.type === 'blast')
        ? hostAnswerHold(this.state, Date.now(), this.hostHandicap())
        : 0;
    if (handicap > 0) setTimeout(run, handicap);
    else run();
  }

  /** Removes a player for the rest of this session (lobby or mid-game). */
  kick(playerId: string) {
    if (this.mode !== 'host' || playerId === this.priv.myPlayerId) return;
    const s = this.state;
    const player = s?.players.find((o) => o.id === playerId);
    const name = (player ?? s?.spectators?.find((o) => o.id === playerId))?.name;
    const p = this.priv;
    for (const [secret, id] of this.secretToPlayer)
      if (id === playerId) p.bannedSecrets = capped([...p.bannedSecrets, secret], MAX_BLOCKED);
    // Only someone actually here has their name barred; clearing out an
    // offline seat (say, after the host's refresh) is just housekeeping.
    const here = s?.spectators?.some((o) => o.id === playerId) || s?.players.some((o) => o.id === playerId && o.connected);
    if (name && here) p.bannedNames = capped([...p.bannedNames, nameSkeleton(name)], MAX_BLOCKED);
    for (const [c, g] of this.guests) {
      if (g.playerId === playerId) {
        p.bannedPeers = capped([...p.bannedPeers, c.peer], MAX_BLOCKED);
        this.dismiss(c, { t: 'kicked' });
      }
    }
    this.dispatch({ type: 'remove', playerId });
    if (player) this.flash(player.name, 'info', { title: 'Player removed', who: { name: player.name, hue: player.hue } });
    else if (name) this.flash(name, 'info', { title: 'Spectator removed', who: { name } });
  }

  /**
   * The page crashed showing the game (Root.svelte shows it afresh), or a
   * guest couldn't follow what its host sent. A guest leaves the room: the
   * host's game may be what can't be shown, and a reload would only put it
   * back in. Crashing again soon after (`again`), any game is left, so the
   * page can be used again.
   */
  crashed(again: boolean) {
    if (this.mode !== 'client' && !(again && this.mode)) return;
    try {
      if (this.mode === 'client') this.fail("The host's game sent something this page can't show, so you left the room.", 'Left the room');
      else {
        this.leave();
        this.flash('The game ran into a problem it could not get past, so it was closed.', 'error', { title: 'Game closed', sticky: true });
      }
    } catch (err) {
      // Leaving needs the game too (its records): without it, the page starts over, the game not saved to come back to.
      console.error(err);
      writeSaved(null);
      location.reload();
    }
  }

  leave() {
    this.walkAway();
    if (this.mode === 'host') {
      // Tell everyone right away instead of leaving them to reconnect to nothing.
      for (const [conn, g] of this.guests) if (g.playerId) this.send(conn, { t: 'closed' });
      const conns = [...this.guests.keys()];
      const peer = this.peer;
      this.guests = new Map();
      this.peer = null;
      this.reset();
      // Give the goodbye a moment to go out before the connections drop.
      setTimeout(() => {
        for (const c of conns) c.close();
        peer?.destroy();
      }, 400);
      return;
    }
    this.reset();
  }

  // ---- the lab (src/lab: dev and beta only, never called by the game) -----

  /** Lab only: the grayscale the art is prepared with, in place of the rules'. Always null in the game. */
  labGrayscale: Grayscale | null = null;

  /** Lab only: puts a state in place as the host would, with its timers, sounds, art and records. */
  labSetState(next: GameState) {
    this.setState(next);
  }

  /**
   * Lab only: plays the co-op run on this device as its host would, without
   * a room (no peer, no guests), seen by `viewer`: the screens act for them,
   * and labAct for anyone. It is saved as a hot-seat game, so a reload never
   * reaches for the matchmaking server; the lab calls this again after one.
   */
  labCoop(viewer: string) {
    if (!this.state) return;
    this.labRoomless = true;
    this.mode = 'host';
    this.status = 'ready';
    this.myPlayerId = viewer;
    this.priv = noPrivate(viewer);
  }

  /** Lab only: an action from a given player (null: the host's own timers), as the room would take it. An error's message, or null. */
  /** The QA desk (src/qa): this device is turned out of its room as the host's word for it would. */
  labFail(why: keyof typeof TURNED_OUT) {
    this.turnedOut(why);
  }

  private turnedOut(why: keyof typeof TURNED_OUT) {
    const [message, title] = TURNED_OUT[why];
    this.fail(message, title);
  }

  labAct(action: Action, from: string | null): string | null {
    if (!this.state) return 'No game.';
    try {
      this.setState(engine.apply(this.state, action, from));
      return null;
    } catch (err) {
      return err instanceof ActionError ? err.message : String(err);
    }
  }

  /** The grayscale a question's art is prepared with: the rules', or as rolled for it in Delve (the lab may force one). */
  private grayscaleOf(s: GameState): Grayscale {
    return this.labGrayscale ?? grayscaleFor(s);
  }

  // ---- internals --------------------------------------------------------

  private setState(next: GameState) {
    const prev = this.state;
    // The room changed since the next question was drawn ahead: it's thrown away (drawAhead.ts).
    if (this.ahead && next.version !== this.ahead.from) this.dropAhead();
    const taking = this.taking;
    this.taking = null;
    let patchesOut: Promise<void> | null = null;
    this.noteChange(prev, next);
    this.state = next;
    if (this.isHost && next.delve && next.round >= LOOKS_FETCH_FROM) fetchLooks();
    // The art's workers are ready before the first question wants them (media.svelte.ts; once is enough).
    if (this.isHost && next.phase !== 'lobby') warmMedia();
    if (next.phase === 'question' && next.question && next.question.askedAt !== prev?.question?.askedAt) {
      // A question asked again in its place while the draw plays keeps its hold.
      const until = drawHoldUntil(prev, next, this.drawHold);
      this.drawHold = until === null ? null : { qid: next.question.askedAt, until };
      void this.startMedia(next, taking?.qid === next.question.askedAt ? taking : null);
    } else if (next.phase === 'reveal') {
      // Only as the reveal begins: a later change during it (someone joining,
      // the room going public) would cancel the patches still on their way.
      if (prev?.phase !== 'reveal' || prev.question?.askedAt !== next.question?.askedAt) {
        const rest = this.unreleasedPatches();
        // A question that ended before its clock started still shows everyone its art: its key goes out now.
        if (next.question) this.openSeal(next.question.askedAt);
        // Keep what was sent, so someone arriving during the reveal still gets the pictures.
        this.stopMedia(true);
        patchesOut = this.finishVeil(rest);
      }
    } else if (next.phase !== 'question') {
      this.stopMedia();
    }
    if (this.mode === 'host') {
      // The next room this browser opens starts with these settings.
      savePrefs(prefsFrom(next.settings));
      const msg: HostMsg = { t: 'state', state: publicView(next), now: Date.now() };
      for (const [conn, g] of this.guests) if (g.playerId) this.send(conn, msg);
    }
    // Race: the next question is known as the reveal starts, so it's drawn now (once the reveal has gone
    // out), and its art goes out while the reveal plays, after the reveal's own last patches.
    if (patchesOut) this.drawAhead(next, patchesOut);
    this.scheduleTimers(next);
    this.syncBeacon(next);
    this.save();
  }

  /** Saves in a moment (at most once a second), for changes that can come in bursts. */
  private saveSoon() {
    this.saveTimer ??= setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 1000);
  }

  private save() {
    const s = this.state;
    if (!s) return;
    if (this.mode === 'local' || this.labRoomless) writeSaved({ mode: 'local', state: s });
    else if (this.mode === 'host') {
      writeSaved({ mode: 'host', code: this.code, state: s, priv: this.priv });
      // Beside it, so a crash (no pagehide) never stops a held clock before what the save holds.
      this.noteAlive();
    }
  }

  /** Lists the room publicly while the host has it set to public. */
  private syncBeacon(s: GameState) {
    const want = this.mode === 'host' && !this.labRoomless && !!s.settings.public;
    if (want && !this.beacon) {
      this.beacon = new Beacon((challenge) => this.listing(challenge));
      this.beacon.start();
    } else if (!want && this.beacon) {
      this.beacon.stop();
      this.beacon = null;
    }
  }

  private roomInfo(): RoomInfo | null {
    const s = this.state;
    if (!s || this.mode !== 'host') return null;
    return {
      code: this.code,
      host: s.players.find((p) => p.id === s.hostId)?.name ?? '?',
      // Every seat held, someone on the way back included: the engine counts them too, so a room shows Join only when a seat is free.
      players: s.players.length,
      here: s.players.filter((p) => p.connected).length,
      maxPlayers: MAX_PLAYERS,
      spectators: s.spectators?.length ?? 0,
      maxSpectators: MAX_SPECTATORS,
      mode: s.settings.mode ?? 'turns',
      difficulty: s.settings.difficulty,
      target: s.settings.targetScore,
      phase: s.settings.locked ? 'locked' : s.phase,
      ...(s.delve && s.phase !== 'lobby' ? { depth: s.round } : {}),
    };
  }

  /**
   * Delve: this device's run goes into its records: alone as it falls,
   * together once nobody stands (a run left before that is kept as left, see
   * recordLeaving). Hot-seat runs are always alone.
   */
  private noteRun(prev: GameState | null, next: GameState) {
    const d = next.delve;
    if (!d) return;
    if (prev?.delve?.startedAt !== d.startedAt) {
      this.delveResult = null;
      this.bestAtStart = bestOf(loadRecords(), d.entrants.length < 2, d.ruleset)?.depth ?? null;
    }
    const run = runEvent(prev, next, this.myPlayerId, this.mode === 'local');
    if (!run) return;
    const r = recordRun(run);
    if (!r) return;
    this.noteAchievements();
    const was = this.delveResult?.id === run.id ? this.delveResult : null;
    this.delveResult = { id: run.id, depth: run.depth, previousBest: was ? was.previousBest : r.previousBest, best: was ? was.best : r.best };
  }

  private gameCounts = new GameCounts();
  /** A game starting or decided, counted once a game by the device that runs it (count.ts gameEvents); nothing to work out where nothing counts. */
  private notePlay(prev: GameState | null, next: GameState) {
    if (!counting || (this.mode !== 'local' && this.mode !== 'host')) return;
    for (const e of this.gameCounts.events(prev, next, this.mode === 'local')) countEvent(e);
  }

  /** What every device makes of a state change, host and guest alike: a Delve clock starting, records, sounds and notices, achievements. */
  private noteChange(prev: GameState | null, next: GameState) {
    // (Named in the beta's frame meter, so a slow frame can be placed in the game.)
    if (prev?.phase !== next.phase || prev?.question?.askedAt !== next.question?.askedAt) frameEvent(`game: ${next.phase}${next.reveal && !prev?.reveal ? (next.reveal.correct ? ' (right)' : ' (wrong)') : ''}`);
    this.noteClock(next);
    this.notePlay(prev, next);
    this.noteRun(prev, next);
    this.onNewState(prev, next);
    this.noteEncounter(prev, next);
    this.noteMoments(prev, next);
  }

  /**
   * A question opens to answers as the state that starts its clock comes in
   * (just behind the key to its pictures), a little ahead of the clock's
   * start (clockAt) itself, in every mode. Noted as it first does on this
   * device, to time its answer from (dispatch); on the host that is as it
   * goes out to everyone, a guest's answer taking a round trip at least (tooFast).
   * Delve: one the host's reload held still is noted again as it carries on,
   * with what was used of its clock before (`before`, for the answer's time;
   * it opens to answers again only then); so is one that carried on unseen
   * here (this device back after the grace, or idle and not waited for),
   * from its new clockAt.
   */
  private noteClock(next: GameState) {
    const q = next.question;
    if (!q) return;
    // An answer given just before the reload that never reached the host is timed afresh once the clock carries on.
    const dropLost = () => {
      if (this.answered?.qid === q.askedAt && !q.struck?.some((x) => x.by === this.myPlayerId)) this.answered = null;
    };
    if (q.paused) {
      this.clockSeen = null;
      this.usedBefore = { qid: q.askedAt, ms: pausedUsed(q.paused) };
      dropLost();
    } else if (clockRuns(q)) {
      const seen = this.clockSeen?.qid === q.askedAt ? this.clockSeen : null;
      if (seen && seen.clockAt === q.clockAt) return;
      // Carried on unseen here (the pause never reached this device): so is one lost on its way.
      if (seen) dropLost();
      // Held still and seen so: what was used of it before; carried on unseen: what has gone of it by now.
      const before = seen ? Math.max(0, this.hostNow() - (q.clockAt ?? this.hostNow())) : this.usedBefore?.qid === q.askedAt ? this.usedBefore.ms : 0;
      this.clockSeen = { qid: q.askedAt, clockAt: q.clockAt, at: performance.now(), ...(before ? { before } : {}) };
    }
  }

  /**
   * A question just revealed goes into this browser's codex; so does one
   * dynamite just blasted away, as seen (together, as a miss for a player
   * who struck an option on it first: codex.ts blastedEncounter).
   */
  private noteEncounter(prev: GameState | null, next: GameState) {
    const me = this.myPlayerId;
    const hotSeat = this.mode === 'local';
    const blast = blastedAway(prev, next);
    // (Only the items this build has: online, the reveal is the host's word.)
    const known = (id: string) => engine.byId.has(id);
    if (blast) {
      void import('./codex')
        .then(({ blastedEncounter, keepable, recordEncounter }) => {
          const e = keepable(blastedEncounter(next, blast, me, hotSeat), known);
          if (e) recordEncounter(e);
        })
        .catch((err) => console.warn('codex', err));
      return;
    }
    // Not after a refresh into a reveal: it was likely counted before the
    // refresh. The codex itself skips a question it already has (a rejoin).
    if (!prev || next.phase !== 'reveal') return;
    const qid = next.question?.askedAt;
    if (prev.phase === 'reveal' && prev.question?.askedAt === qid) return;
    const ms = this.answered?.qid === qid ? this.answered?.ms : undefined;
    // Its own chunk: the first download stays small.
    // After a redeploy the old chunk is gone; the encounter just goes unrecorded.
    void import('./codex')
      .then(({ encounterAt, keepable, recordEncounter }) => {
        const met = encounterAt(next, me, hotSeat, ms);
        const e = met && keepable(met, known);
        if (!e) return;
        recordEncounter(e);
        this.noteAchievements();
      })
      .catch((err) => console.warn('codex', err));
  }

  /**
   * The moments a state change brings this device's player (lib/achievements.ts):
   * a Delve run's (a depth reached, a ward on the last life, a team falling
   * together) and a game against others' (followed as it goes, judged at its end).
   */
  private noteMoments(prev: GameState | null, next: GameState) {
    if (!next.delve && next.phase === 'lobby' && prev?.phase === 'lobby') return;
    const me = this.myPlayerId;
    const hotSeat = this.mode === 'local';
    // Only a run of Delve, or a game against others this device is seated in, earns anything.
    if (!next.delve && (hotSeat || !me || !next.players.some((p) => p.id === me))) return;
    const a = this.answered;
    const veilShare = a?.share !== undefined ? { qid: a.qid, share: a.share } : undefined;
    // Going down into a new zone, what it earns is announced as its cards are dealt, not on the way down.
    const wait = dealIn(next, this.hostNow());
    void Promise.all([import('./achievements'), import('./achievementToasts')])
      .then(([{ noteState }, { announceAchievements }]) => {
        const earned = noteState(prev, next, me, hotSeat, { items: engine.items, veilShare });
        this.noteEarned(earned.earned.map((a) => a.id), next.phase !== 'lobby' ? next.startedAt : undefined);
        if (wait > 0) setTimeout(() => announceAchievements(earned, 'game'), wait);
        else announceAchievements(earned, 'game');
      })
      .catch((err) => console.warn('achievements', err));
  }

  /** A check of the achievements is waiting for an idle moment (noteAchievements). */
  private achievementsDue = false;

  /**
   * Brings the achievements up to date with what was just recorded in the
   * codex or the Delve records, and announces any earned (lib/achievementToasts.ts).
   * It reads and sums up the whole codex, so it waits for an idle moment
   * rather than running as a reveal begins (its notice waits a moment
   * anyway), and several asked for before it runs make one check.
   */
  private noteAchievements() {
    if (this.achievementsDue) return;
    this.achievementsDue = true;
    // The game the check is for: by the time it runs (an idle moment, up to a second on) a next one may have begun.
    const game = this.state?.phase !== 'lobby' ? this.state?.startedAt : undefined;
    void Promise.all([import('./achievements'), import('./achievementToasts')])
      .then(([{ checkAchievements }, { announceAchievements }]) =>
        whenIdle(
          () => {
            this.achievementsDue = false;
            try {
              const check = checkAchievements(engine.items);
              if (!check.first) this.noteEarned(check.earned.map((a) => a.id), game);
              announceAchievements(check, 'game');
            } catch (err) {
              console.warn('achievements', err);
            }
          },
          { timeout: 1000, fallback: 300 },
        ),
      )
      .catch((err) => {
        this.achievementsDue = false;
        console.warn('achievements', err);
      });
  }

  /** Delve: the fuse waiting to burn, for the question and the 0 it burns down to (`key`). */
  private hiss: { key: string; timer: ReturnType<typeof setTimeout> | null } | null = null;
  /** Delve: the fuse's sound, for the question it burns on (askedAt), and when it ends by itself (Date.now()); one at a time. */
  private fuseSound: { qid: number; stop: (() => void) | undefined; until: number } | null = null;

  /**
   * Delve: the fuse's sound starts for question `qid`, held for `holdMs` at
   * most (cut sooner as the question ends); nothing while it sounds for that
   * question already, so it is never heard twice over.
   */
  private soundFuse(qid: number, holdMs: number) {
    const now = Date.now();
    if (fuseHeard(this.fuseSound, qid, now)) return;
    this.cutFuse();
    this.fuseSound = { qid, stop: sfx('fuse', { holdMs }), until: now + holdMs };
  }

  /** Delve: the fuse's sound is cut, with a short fade (the dynamite went off, or the question ended). */
  private cutFuse() {
    this.fuseSound?.stop?.();
    this.fuseSound = null;
  }

  /**
   * Delve: Detonate pressed on question `askedAt`: its fuse is heard at once
   * (unless it burns already) until the blast comes back from the host.
   */
  detonating(askedAt: number) {
    this.soundFuse(askedAt, DETONATE_FUSE_MS);
  }

  /**
   * Delve: when a stick of dynamite will go off by itself as the clock hits
   * 0 (delve.ts fuseDue), its fuse burns over the clock's last
   * DELVE_FUSE_MS (fuseLeft) to warn of the blast: one sound, started as it
   * is lit and held to 0 and the blast, cut as the question ends (blasted
   * away, answered, or set off by hand). Every screen times it from the
   * deadline on the host's clock.
   */
  private hissFuse(s: GameState) {
    const q = s.phase === 'question' ? s.question : null;
    // The question it burnt on is over (or another took its place): the sound goes with it.
    if (this.fuseSound && this.fuseSound.qid !== q?.askedAt) this.cutFuse();
    const key = q && fuseDue(s) ? `${q.askedAt}:${q.deadline}` : '';
    if (key === (this.hiss?.key ?? '')) return;
    if (this.hiss?.timer) clearTimeout(this.hiss.timer);
    this.hiss = null;
    // No dynamite to go off at this 0 any more, or a 0 moved (a flare, the lab's clock): the fuse burns afresh.
    if (this.fuseSound) this.cutFuse();
    if (!key) return;
    const h: NonNullable<Session['hiss']> = { key, timer: null };
    this.hiss = h;
    // At first from the state just in (this.state may not hold it yet), later from the latest.
    const light = (cur: GameState | null = this.state) => {
      h.timer = null;
      if (this.hiss !== h || !cur?.question) return;
      const now = this.hostNow();
      const fuse = fuseLeft(cur, now);
      // Not burning yet (or the clock held still meanwhile): back as it starts.
      if (fuse === null) {
        h.timer = setTimeout(() => light(), Math.max(16, clockLeft(cur.question, now) - DELVE_FUSE_MS));
        return;
      }
      // Burnt down already (a screen that came in late): the blast is due, nothing to hear.
      if (fuse <= 0) return;
      // Held to 0 and the host's time-out after it, when the blast cuts it.
      // A Detonate's shorter sound still on (the host may turn it down) gives way to it.
      this.cutFuse();
      this.soundFuse(cur.question.askedAt, fuse * DELVE_FUSE_MS + ANSWER_GRACE_MS + FUSE_TAIL_MS);
    };
    light(s);
  }

  /** Guest under the held name: the host's challenge (hi) on this link, signed; null without it, or without the owner key. */
  private async signHello(conn: DataConnection) {
    if (this.hostHi?.conn !== conn)
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          if (this.onHi === done) this.onHi = null;
          resolve();
        };
        const timer = setTimeout(done, HI_WAIT_MS);
        this.onHi = done;
      });
    const hi = this.hostHi;
    return hi?.conn === conn && this.hostConn === conn ? joinProof(PEER_PREFIX + this.code, hi.c) : null;
  }

  /** Host under the held name (as the game has it: a reopened room keeps it, with no name typed), holding the owner key. */
  private signOwnRoom(code: string) {
    const me = this.priv.myPlayerId;
    if (!this.state || this.code !== code || !isHeldName(this.state.players.find((p) => p.id === me)?.name ?? '') || !ownerUnlocked()) return;
    this.setState(engine.apply(this.state, { type: 'owner', playerId: me }, null));
  }

  /** The room's info for a probe: under the held name, signed over the probe's challenge (ownerKey.ts roomProof). */
  private listing(challenge: string | null): RoomInfo | null | Promise<RoomInfo | null> {
    const info = this.roomInfo();
    if (!info || !challenge || !isHeldName(info.host)) return info;
    return roomProof(PEER_PREFIX + info.code, challenge).then((owner) => (owner ? { ...info, owner } : info));
  }

  /** Side effects that every device plays: sounds, and the notice of the creator's arrival. */
  private onNewState(prev: GameState | null, next: GameState) {
    const arrival = creatorArrival(prev, next, this.seen);
    this.heralded = arrival?.id ?? null;
    // Online, everyone but herself is told who walked in. Her colour is
    // ruby even while she only watches and has none yet.
    if (arrival && this.mode !== 'local' && arrival.id !== this.myPlayerId)
      this.flash(arrival.watching ? 'is watching' : 'has arrived', 'info', {
        title: CREATOR_TITLE,
        who: { name: arrival.name, hue: arrival.hue ?? RUBY },
        herald: true,
      });
    // Delve: dynamite's fuse hisses on every screen over the clock's last seconds, until it goes off.
    this.hissFuse(next);
    if (!prev) return;
    const me = this.myPlayerId;
    for (const n of delveNotices(prev, next)) this.delveNotice(n, next);
    // Delve: dynamite blasted the question away for a new one, heard on every screen.
    // It bursts in from the screen edge the new question comes from (lib/blastAway.ts).
    const blast = blastedAway(prev, next);
    if (blast) sfx('blast', { from: { edge: blast.side } });
    const started = runSeenStarting(prev, next);
    if (started !== null) this.runStarted = started;
    if ((prev.phase === 'lobby' || prev.phase === 'over') && (next.phase === 'choosing' || next.phase === 'question')) {
      sfx('start');
      return;
    }
    if (next.phase === 'over' && prev.phase !== 'over') {
      // Hot-seat and spectators celebrate whoever won; a player who lost hears a toll instead.
      // A Delve run ends with the last life, never a victory: it dies down.
      const lost = this.mode !== 'local' && !!me && next.players.some((p) => p.id === me) && !next.winners.includes(me);
      sfx(next.delve ? 'fallen' : lost ? 'defeat' : 'victory');
      return;
    }
    if (next.settings.mode === 'race' && next.phase !== 'over') {
      const missedNow = (st: GameState) => st.question?.misses.some((m) => m.playerId === me) ?? false;
      if (prev.phase !== 'reveal' && next.phase === 'reveal' && next.reveal) {
        const w = next.reveal.winnerId;
        sfx(w && w === me ? 'correct' : w ? 'turn' : 'wrong');
      } else if (next.phase === 'question' && prev.phase !== 'question') {
        sfx('reveal');
      } else if (next.phase === 'question' && missedNow(next) && !missedNow(prev)) {
        sfx('wrong');
      }
      return;
    }
    // Delve together: a teammate's wrong pick strikes an answer for everyone
    // (your own is heard as you pick it, and in the phial).
    if (next.delve && next.phase === 'question' && next.question && prev.question?.askedAt === next.question.askedAt) {
      const before = prev.question.struck?.length ?? 0;
      // From farther off, unless everyone plays at this screen (hot-seat).
      if ((next.question.struck ?? []).slice(before).some((x) => x.by !== me)) sfx('struck', { from: { far: this.mode !== 'local' } });
    }
    if (prev.phase !== 'reveal' && next.phase === 'reveal' && next.reveal) {
      sfx(next.reveal.correct ? 'correct' : 'wrong');
    } else if (prev.phase !== next.phase && next.phase === 'choosing') {
      // Delve: a new depth's deal is heard as the descent (App.svelte plays 'plunge').
      if (!next.delve) sfx(next.players[next.turn]?.id === me || this.mode === 'local' ? 'yourTurn' : 'turn');
    } else if (prev.phase === 'choosing' && next.phase === 'question') {
      sfx('reveal');
    } else if (prev.phase === 'lobby' && next.phase === 'lobby' && next.players.length > prev.players.length) {
      sfx('join');
    }
  }

  /**
   * Delve: one notice of a state change (delveSession.ts delveNotices). A
   * clock the host's reload held still goes out as a toast, room news like a
   * player leaving; what befalls the team in play is said on the game screen
   * itself (QuestionView's lines under the answers, Game's under the stage).
   */
  private delveNotice(n: DelveNotice, s: GameState) {
    switch (n.kind) {
      case 'paused':
        this.flash('The host reloaded. The clock starts again with the time it had left once everyone is back.', 'info', { title: 'Clock paused' });
        break;
      case 'perished': {
        // Nobody left standing: the run ends next, and the end has its own
        // toll (onNewState). Before it, your own perishing is heard as it
        // would be, a teammate's from far off.
        const mine = this.mode !== 'local' && !!this.myPlayerId && n.playerId === this.myPlayerId;
        if (standingIds(s).length && s.phase !== 'over') sfx(mine ? 'fallen' : 'fallenFar');
        break;
      }
    }
  }

  private scheduleTimers(s: GameState) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Delve: a flare burns as the clock hits 0, set before the time-out below
    // (which comes ANSWER_GRACE_MS later) so it is applied first; should the
    // time-out still get there first, the engine burns the flare instead.
    this.scheduleFlare(s);
    // Delve: with no flare to burn, a stick of dynamite goes off by itself
    // in place of the time-out (its fuse has hissed over the clock's last
    // seconds already).
    if (s.phase === 'question' && s.question?.deadline) {
      const version = s.version;
      // Answers sent in time may still be on their way.
      this.armAt(
        s.question.deadline + ANSWER_GRACE_MS,
        () => {
          if (this.state?.version !== version) return;
          this.setState(engine.apply(this.state, { type: 'answer', index: null }, null));
        },
        (t) => (this.timer = t),
      );
    }
    this.scheduleAutoSkip(s);
    this.scheduleIdle(s);
    this.scheduleAutoNext(s);
    this.scheduleExpire(s);
  }

  /**
   * A host timer due at `at` (this device's clock). Should it fire more than
   * EARLY_MS early (the system clock jumped back meanwhile), it is set again
   * for the time still left instead of trying too soon (which the engine
   * would refuse without changing anything, leaving nothing to try again).
   */
  private armAt(at: number, go: () => void, keep: (t: ReturnType<typeof setTimeout>) => void) {
    const fire = () => {
      const left = at - Date.now();
      if (left > EARLY_MS) keep(setTimeout(fire, left));
      else go();
    };
    keep(setTimeout(fire, Math.max(0, at - Date.now())));
  }

  /**
   * Delve: as the clock hits 0, a flare burns: the player's own, or in co-op
   * a random holder's, while someone here still has an answer to give (host
   * or this device only).
   */
  private scheduleFlare(s: GameState) {
    const left = this.mode !== 'client' ? flareIn(s, Date.now()) : null;
    const key = left === null ? '' : `${s.question?.askedAt}:${s.question?.deadline}`;
    if (key === this.flareKey) return;
    if (this.flareTimer) clearTimeout(this.flareTimer);
    this.flareTimer = null;
    this.flareKey = key;
    if (left === null) return;
    const askedAt = s.question!.askedAt;
    this.armAt(
      Date.now() + left,
      () => {
        const cur = this.state;
        if (!cur || this.flareKey !== key) return;
        try {
          this.setState(engine.apply(cur, { type: 'flare', askedAt }, null));
        } catch {
          /* the question closed anyway */
        }
      },
      (t) => (this.flareTimer = t),
    );
  }

  /**
   * Delve co-op: the vote closes VOTE_WINDOW_MS after its first vote (or once
   * everyone it waits for has voted); the host then draws the card. Nothing
   * runs before the first vote: the team may sit on the cards for as long as
   * it likes.
   */
  private scheduleExpire(s: GameState) {
    const left = this.isHost ? expireIn(s, Date.now()) : null;
    // On the close time itself: it moves sooner when someone excused comes back.
    const key = expireKey(s, left);
    if (key === this.expireKey) return;
    if (this.expireTimer) clearTimeout(this.expireTimer);
    this.expireTimer = null;
    this.expireKey = key;
    if (left === null) return;
    this.armAt(
      Date.now() + left + 50,
      () => {
        const cur = this.state;
        if (!cur || this.expireKey !== key) return;
        // Let go of the key first: should the engine find it too early after
        // all (the clocks disagree), the state it returns sets the timer again.
        this.expireKey = '';
        try {
          this.setState(engine.apply(cur, { type: 'expire' }, null));
        } catch {
          /* the vote closed anyway */
        }
      },
      (t) => (this.expireTimer = t),
    );
  }

  /**
   * Online: the reveal moves on by itself after a few seconds. Counted from the
   * reveal itself, so people joining or leaving meanwhile (or the host
   * reloading) can't hold it up.
   */
  private scheduleAutoNext(s: GameState) {
    const key = s.phase === 'reveal' && this.mode === 'host' && s.question ? s.question.askedAt : 0;
    if (key === this.autoNextFor) return;
    if (this.autoNext) clearTimeout(this.autoNext);
    this.autoNext = null;
    this.autoNextFor = key;
    if (!key) return;
    this.autoNext = setTimeout(() => {
      const cur = this.state;
      if (!cur || cur.phase !== 'reveal' || cur.question?.askedAt !== key) return;
      try {
        this.setState(this.stepNext(cur, null));
      } catch {
        /* already moved on */
      }
    }, autoNextLeft(s.reveal?.at, Date.now()));
  }

  /** Turns mode: don't let the game wait forever on a player who dropped out on their turn. */
  private scheduleAutoSkip(s: GameState) {
    const active = s.players[s.turn];
    const stalled =
      this.mode === 'host' &&
      s.settings.mode !== 'race' &&
      // Delve has its own time to pick, and a question runs out by its clock.
      !s.delve &&
      (s.phase === 'choosing' || s.phase === 'question') &&
      !!active &&
      !active.connected;
    const key = stalled ? `${s.turnCount}:${active.id}` : '';
    if (key === this.skipKey) return;
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.skipTimer = null;
    this.skipKey = key;
    this.skipAt = 0;
    if (!key) return;
    this.skipAt = Date.now() + AUTO_SKIP_MS;
    this.skipTimer = setTimeout(() => {
      const cur = this.state;
      if (!cur || this.skipKey !== key) return;
      const p = cur.players[cur.turn];
      try {
        this.setState(engine.apply(cur, { type: 'skip' }, null));
        if (p) this.flash(p.name, 'warn', { title: 'Turn skipped', who: { name: p.name, hue: p.hue } });
      } catch {
        /* the turn moved on anyway */
      }
    }, AUTO_SKIP_MS);
  }

  /**
   * Turns mode: a player who is connected but doesn't pick a category (or
   * answer, without a timer) would hold everyone up; after a while the host
   * may skip them. A question whose clock hasn't started yet waits for the
   * art, not for them: their while counts from its start.
   */
  private scheduleIdle(s: GameState) {
    const active = s.players[s.turn];
    const waiting =
      this.mode === 'host' &&
      s.settings.mode !== 'race' &&
      !s.delve &&
      !!active?.connected &&
      active.id !== this.priv.myPlayerId &&
      (s.phase === 'choosing' || (s.phase === 'question' && clockRuns(s.question) && !s.question?.deadline));
    const key = waiting ? `${s.turnCount}:${s.phase}:${s.question?.askedAt ?? 0}` : '';
    if (key === this.idleKey) return;
    this.idleKey = key;
    this.idle = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = key ? setTimeout(() => this.idleKey === key && (this.idle = true), IDLE_SKIP_MS) : null;
  }

  private networkHint(type: string) {
    return `Couldn't connect to the matchmaking server (${type}). Check your connection, or play hot-seat on one device.`;
  }

  /**
   * Gives up on the room with a notice that stays up. `reopening`: the room a
   * reload couldn't reopen (session.code stays empty until a room is open),
   * which stays saved so a refresh tries again. `failure`: what is counted
   * (count.ts; a join's through joinFailure).
   */
  private fail(message: string, title?: string, { reopening, failure }: { reopening?: string; failure?: Failure } = {}) {
    const mode = this.mode;
    if (failure) countFailure(failure);
    // A game walked away from in this room by a reload that couldn't get back into it (it closed, or never
    // reopened) wasn't walked away from.
    forgiveLeaving({ room: reopening ?? this.code });
    const saved = reopening ? readSaved() : null;
    this.reset();
    if (saved) writeSaved(saved);
    this.flash(message, 'error', { title, sticky: true });
    if (mode === 'client') this.status = 'idle';
  }

  /**
   * Delve: the run this device is in goes into its records as left (unless
   * it already perished there), as the page goes away: a tab closed mid-run
   * never reaches reset. Recording it again (leaving, a reload that picks the
   * run up and then ends it) replaces it (delveRecord.ts addRun).
   */
  recordLeaving() {
    if (this.state) recordLeft(this.state, this.myPlayerId, this.mode === 'local');
  }

  /**
   * Host: when it was last here, for a reload to tell when its clock stopped
   * (engine 'resumed'). Noted with the save, every ping and as the page goes.
   */
  noteAlive() {
    if (this.mode === 'host' && this.state?.delve) writeStored(ALIVE, String(Date.now()), 'session');
  }

  /**
   * This player walks away (leaves the room, or the page goes): a game against
   * others they leave while losing still counts against a run of wins
   * (lib/versus.ts). Not on being removed or the room closing (fail), and
   * not while cut off from the host, when the game may be gone already:
   * none of those is walking away.
   */
  walkAway() {
    if (this.mode === 'client' && this.status !== 'ready') return;
    noteLeaving(this.state, this.myPlayerId, this.mode === 'local', this.code);
  }

  /** Another tab marked a game as walked away from: if this tab is still seated in it, nobody walked away. */
  stillHere() {
    const s = this.state;
    if (s?.startedAt && s.phase !== 'over' && s.players.some((p) => p.id === this.myPlayerId)) forgiveLeaving({ game: s.startedAt });
  }

  private reset() {
    this.recordLeaving();
    // A new attempt (or leaving) makes the last one's errors moot.
    toasts.clearErrors();
    this.beacon?.stop();
    this.beacon = null;
    this.stopMedia();
    shown.clear();
    if (this.timer) clearTimeout(this.timer);
    if (this.autoNext) clearTimeout(this.autoNext);
    this.autoNext = null;
    this.autoNextFor = 0;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.skipTimer = null;
    this.skipKey = '';
    this.skipAt = 0;
    this.idleKey = '';
    this.idle = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.expireTimer) clearTimeout(this.expireTimer);
    this.expireTimer = null;
    this.expireKey = '';
    if (this.flareTimer) clearTimeout(this.flareTimer);
    this.flareTimer = null;
    this.flareKey = '';
    // The fuse goes quiet with the game (left, removed, or the room closed).
    if (this.hiss?.timer) clearTimeout(this.hiss.timer);
    this.hiss = null;
    this.cutFuse();
    this.runStarted = null;
    this.reaskFails = { turn: '', n: 0 };
    this.artFailedFor = 0;
    this.drawHold = null;
    this.dropAhead();
    this.taking = null;
    this.strikes.clear();
    this.sealedArt.clear();
    this.labRoomless = false;
    for (const c of this.guests.keys()) c.close();
    this.guests.clear();
    this.standing = {};
    for (const t of this.standingTimers.values()) clearTimeout(t);
    this.standingTimers.clear();
    if (this.standingPace) clearTimeout(this.standingPace.timer);
    this.standingPace = null;
    this.cursorOut.clear();
    this.cursorPressed.clear();
    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    this.cursorTimer = null;
    peerCursors.clear();
    // Let go of it first, so its 'close' doesn't count as a failed join.
    const link = this.hostConn;
    this.hostConn = null;
    this.welcomedOn = null;
    link?.close();
    this.cancelAttempts();
    this.peer?.destroy();
    this.peer = null;
    this.mode = null;
    this.state = null;
    this.status = 'idle';
    this.code = '';
    this.myPlayerId = null;
    this.watchOnly = false;
    this.joinVia = null;
    // A guest's offset to its host's clock means nothing for the next room.
    this.clockOffset = 0;
    this.clockSynced = false;
    this.gaveUp = false;
    // Another tab may have turned streamer mode on since this page loaded.
    this.hideCode = roomPrefs().hideCode;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.priv = noPrivate();
    this.seen.clear();
    this.heralded = null;
    this.hostHi = null;
    this.secretToPlayer = new Map();
    this.joins = new JoinGate();
    this.helloSecret = null;
    if (this.retry) clearTimeout(this.retry);
    this.joinedAt = 0;
    this.busyUntil = 0;
    this.unavailableUntil = 0;
    this.silentCloses = 0;
    if (this.peerTimer) clearTimeout(this.peerTimer);
    this.peerTimer = null;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
    if (this.hostWatch) clearInterval(this.hostWatch);
    this.hostWatch = null;
    writeSaved(null);
  }
}

type Saved =
  | { mode: 'local'; state: GameState }
  | { mode: 'host'; code: string; state: GameState; priv: HostPrivate }
  /** `watch`: the guest chose to watch rather than play. */
  | { mode: 'client'; code: string; name: string; watch?: boolean };
/** The save's storage name, in sessionStorage (each tab its own; the room bot keeps a copy, src/bot/host.ts). */
export const SAVE = 'session.v4';
/** Beside the save, in sessionStorage: when the host was last here (Session.noteAlive; the room bot keeps a copy too). */
export const ALIVE = 'session.alive';

/** The host's last moment before its reload, as 'resumed' takes it (nothing when unknown). */
function lastAlive(): { at?: number } {
  const at = Number(readStored(ALIVE, 'session'));
  return Number.isFinite(at) && at > 0 ? { at } : {};
}
/**
 * Before guests' tokens became per-room. A hosted room saved then can't be
 * resumed (its guests' tokens no longer match), and a guest's saved room
 * can't be reached by this version; a hot-seat game carries on.
 */
const OLD_SAVE_KEY = 'poe2trivia.session.v3';

/**
 * A question's pictures as they go out (sealed, to guests): its art, or
 * each option's, or each veiled one. Patches go later, one at a time.
 * (Exported for the QA desk's frames, src/qa, which show a question's art
 * without a room.)
 */
export function picturesOf(media: PreparedMedia): MediaMsg[] {
  const qid = media.qid;
  const out: MediaMsg[] = [];
  if (media.art) out.push({ t: 'art', qid, ...media.art });
  media.options.forEach(({ w, h, data }, index) => out.push({ t: 'option', qid, index, w, h, data }));
  // Delve: veiled "find the art" pictures; their patches burn in once the clock starts.
  media.tiles.forEach((t, tile) => out.push({ t: 'veil', qid, tile, ...t.veil }));
  if (media.veil) out.push({ t: 'veil', qid, ...media.veil });
  return out;
}

/** The veiled pictures of a question: the art of a name question, or each "find the art" picture (`tile`). */
function veiledSets(media: PreparedMedia): { tile: number | undefined; patches: PreparedMedia['patches']; delays: number[]; gap: number }[] {
  if (media.veil) return [{ tile: undefined, patches: media.patches, delays: media.delays, gap: media.gap }];
  return media.tiles.map((t, tile) => ({ tile, patches: t.patches, delays: t.delays, gap: t.gap }));
}

/**
 * The clock the question in play's veil is paced on: its seconds, and the
 * veil's share of them by the rules (by its own time where the rules have no
 * veil, as for the lab's).
 */
export function veilClock(s: GameState): { secs: number; share: number } {
  const q = s.question!;
  const secs = questionClock(s, q);
  const own = q.veil ? q.veil.seconds / secs : 0;
  return { secs, share: Math.max(own, activeRules(s).veil?.share ?? 0) };
}

/**
 * Hot-seat Delve is a run alone (together it is co-op, played online): a
 * group's hot-seat run saved by an older build goes back to its lobby, where
 * the players can pick another game or delve alone.
 */
function soloHotSeat(s: GameState): GameState {
  if (!s.delve || s.hostId !== null || !isGroupRun(s) || s.phase === 'lobby' || s.phase === 'over') return s;
  try {
    const lobby = engine.apply(s, { type: 'restart' }, null);
    toasts.show('Delve together is now played online in a room. On one device, Delve is for one player.', 'info', { title: 'Run not resumed' });
    return lobby;
  } catch {
    return createGame(null);
  }
}

function readSaved(): Saved | null {
  try {
    const raw = readStored(SAVE, 'session');
    if (raw) return JSON.parse(raw) as Saved;
    const old = readLegacy(OLD_SAVE_KEY, 'session');
    removeLegacy(OLD_SAVE_KEY, 'session');
    const saved = old ? (JSON.parse(old) as Saved) : null;
    return saved?.mode === 'local' ? saved : null;
  } catch {
    return null;
  }
}

function writeSaved(saved: Saved | null) {
  if (saved) writeStored(SAVE, JSON.stringify(saved), 'session');
  else {
    removeStored(SAVE, 'session');
    removeStored(ALIVE, 'session');
  }
}

export const session = new Session();

if (typeof window !== 'undefined') {
  // A run abandoned by closing the tab (or going elsewhere) is still recorded, and so is a game against others left losing.
  window.addEventListener('pagehide', () => {
    session.noteAlive();
    session.recordLeaving();
    session.walkAway();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === LEFT_KEY && e.newValue) session.stillHere();
  });
  // Art that wouldn't load (offline) is tried again once the browser is back online.
  window.addEventListener('online', () => session.artBack());
}