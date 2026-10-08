// Session: owns the game state and wires it to either the local device
// (hot-seat), a hosted PeerJS room, or a connection to someone else's room.
//
// Trust model: the host runs the game and is trusted by definition (it has the
// answers). Guests are not: they only receive a redacted copy of the state,
// get question art as altered image bytes, identify themselves with a secret
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
  type Action,
  type GameState,
  type Grayscale,
  type Item,
} from './game';
import { PEER_OPTIONS, PEER_PREFIX } from './peer';
import { Beacon, type RoomInfo } from './rooms';
import { parseClientMsg, parseHostMsg, PROTOCOL_VERSION, RateLimit, versionProblem, versionRefusal, type HostMsg, type MediaMsg } from './protocol';
import { capped, FrameGuard, hookFrames, JoinGate, roomSecret } from './guard';
import { cleanName, nameSkeleton } from './names';
import { prepareMedia, shown, patchDelays, type PreparedMedia } from './media.svelte';
import { sfx } from './sound';
import { prefsFrom, roomPrefs, roomSettings, savePrefs } from './prefs';
import { toasts, type ToastKind, type ToastOptions } from './toasts.svelte';
import { creatorArrival } from './herald';
import { RUBY } from './palette';
import { CREATOR_TITLE } from './site';
import { DELVE_FUSE_MS, FLARE_MS, LOOKALIKES_ASKED_FROM, clockLeft, fuseDue, fuseLeft, isGroupRun, livesOf, standingIds } from './delve';
import { blownText } from './difficultyText';
import { loadLooks } from './looks';
import { bestOf, loadRecords, recordLeft, recordRun, runEvent } from './delveRecord';
import { noteLeaving } from './versus';
import {
  DELVE_CLOCK_CAP_MS,
  DRAIN_POLL_MS,
  artFirst,
  blastedAway,
  clockStart,
  delveNotices,
  drained,
  drawClockFrom,
  drawHoldUntil,
  expireIn,
  expireKey,
  flareIn,
  hostAnswerHold,
  markAway,
  mayAutoReask,
  racerIds,
  reaskDelay,
  underRuleset,
  type DelveNotice,
} from './delveSession';
import { readLegacy, readStored, removeLegacy, removeStored, writeStored } from './storage';

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
/** Guests: no message from the host for this long means it's gone. */
const HOST_SILENCE_MS = 15000;
/** Errors from the signalling server that a later try can get past. */
const NETWORK_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed']);
/** No pong for this long: the connection is dead. */
const DEAD_AFTER_MS = 15000;
/** Faster than this (after the art reached them) is not a human answer. */
const MIN_HUMAN_MS = 200;
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
export const saveName = (name: string) => void writeStored('name', name);

/**
 * This browser's secret. It proves "I'm the same player" when rejoining and
 * is only ever sent to the host, never shown to other players.
 */
const mySecret = stored('secret', () => randomToken(32));
/** This page load (tabs share the secret; the host tells them apart by this). */
const myTab = randomToken(16);

/** Host-side bookkeeping for one guest connection. */
interface Guest {
  playerId: string | null;
  limit: RateLimit;
  /** Round-trip time estimate (ms). */
  rtt: number;
  lastPong: number;
  pings: Map<number, number>;
  /** When this guest was sent the current question's first picture. */
  mediaAt: { qid: number; at: number } | null;
  /** Which page load the connection comes from (older clients don't say). */
  tab: string | null;
  /** When the connection came in. */
  since: number;
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
  /** Host: when the disconnected active player's turn will be skipped (0 = not pending). */
  skipAt = $state(0);
  /**
   * Host: the connected active player has been idle long enough that their
   * turn may be skipped. Cleared as soon as the turn moves on (like skipAt),
   * so a click on a Skip button that is just fading out does nothing.
   */
  idle = $state(false);
  /** Host: the question (askedAt) whose art could not be loaded, so guests got no pictures. */
  private artFailedFor = $state(0);
  /** Every player and spectator id this device has seen in the room, so only the creator's real arrival gets a notice (lib/herald.ts). */
  private seen = new Set<string>();
  /** Whom the state change under way announces, if anyone: their notice replaces the plain "joined" one. */
  private heralded: string | null = null;

  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null;
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
  /** Media messages already released for the current question (for late joiners). */
  private released: MediaMsg[] = [];
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
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  private skipKey = '';
  private idleKey = '';
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** How long this device took to answer the current question (its askedAt), for the codex. */
  private answered: { qid: number; ms: number; share?: number } | null = null;
  /**
   * Delve: the art of this question goes first to those who answer it (the
   * player alone, or everyone standing in co-op), and to everyone else
   * (spectators, those who perished) once the clock has started, so nobody
   * shares the uplink with them and nobody watching sees it early.
   */
  private held: { qid: number; ids: Set<string> } | null = null;
  /** Delve together: the question the team's vote just drew, and the earliest its clock may start (drawHoldUntil). */
  private drawHold: { qid: number; until: number } | null = null;
  /** Delve: the art failed this many times on this turn (turnCount), for the backoff. */
  private reaskFails = { turn: '', n: 0 };
  /** Lab only: a co-op run played as its host would, without a room (see labCoop). */
  private labRoomless = false;
  private expireTimer: ReturnType<typeof setTimeout> | null = null;
  private expireKey = '';
  private flareTimer: ReturnType<typeof setTimeout> | null = null;
  private flareKey = '';

  get isHost() {
    return this.mode === 'local' || this.mode === 'host';
  }

  /** Online guest who joined a running game and watches until the next one. */
  get spectating() {
    const s = this.state;
    return this.mode === 'client' && !!s && !!this.myPlayerId && !s.players.some((p) => p.id === this.myPlayerId);
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

  /** The old name of `perished`, for screens not moved over yet. */
  get fallen() {
    return this.perished;
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
    this.setState(resume ?? createGame(null, delve ? { ...DEFAULT_SETTINGS, mode: 'delve' } : undefined));
  }

  /**
   * Came in through a delver's shared link (?delve): the next game they open
   * here, hot-seat or a room, starts on Delve. Used up by that game, and
   * dropped when a game is resumed or a room joined instead.
   */
  delveLink = false;

  /** A Delve run alone on this device, straight from a shared link. */
  startDelve(name: string) {
    this.delveLink = true;
    this.startLocal();
    this.dispatch({ type: 'join', playerId: crypto.randomUUID(), name });
    this.dispatch({ type: 'start' });
  }

  /** Picks up a hot-seat game or a hosted room after a page refresh. */
  resume() {
    const saved = readSaved();
    if (!saved) return;
    // Picking up a game: a shared link's Delve was not for it, nor for the next one.
    this.delveLink = false;
    if (saved.mode === 'local') this.startLocal(soloHotSeat(underRuleset(renameCategories(saved.state))));
    else if (saved.mode === 'host') {
      this.reset();
      // Kept while the room reopens, so neither a refresh nor a failed try loses the game.
      writeSaved(saved);
      this.mode = 'host';
      this.status = 'connecting';
      this.loadPrivate(saved.priv);
      this.openRoom(saved.code, 0, underRuleset(renameCategories(saved.state)));
    } else if (saved.mode === 'client') this.join(saved.code, saved.name);
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
    const peer = new Peer(PEER_PREFIX + code, PEER_OPTIONS);
    this.peer = peer;
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
        // drop closes a vote that no longer waits for them, and 'resumed'
        // would then set its question aside, losing every vote cast).
        if (s.delve) s = markAway(s, me);
        else
          for (const p of s.players)
            if (p.id !== me) s = engine.apply(s, { type: 'connection', playerId: p.id, connected: false }, null);
        // A reveal counts down afresh, so the others can reconnect before it
        // moves on (moving on skips the seats still offline).
        if (s.reveal) s = { ...s, reveal: { ...s.reveal, at: Date.now() } };
        // Delve: a question someone cut off may have answered is set aside
        // (and it costs nobody anything), and everyone cut off gets a while to come back.
        if (s.delve) s = engine.apply(s, { type: 'resumed' }, null);
        this.setState(s);
      } else {
        let s = createGame(me, this.delveLink ? { ...roomSettings(), mode: 'delve' } : roomSettings());
        this.delveLink = false;
        try {
          s = engine.apply(s, { type: 'join', playerId: me, name: this.joinName }, me);
        } catch (err) {
          this.fail(err instanceof ActionError ? err.message : 'Could not create the room.', 'Room not opened');
          return;
        }
        this.setState(s);
      }
      this.startPings();
    });
    peer.on('connection', (conn) => this.acceptConnection(conn));
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
          true,
        );
      else if (resumeState) this.fail(`${this.networkHint(err.type)} Refresh to try reopening room ${code}.`, 'Room not reopened', true);
      else this.fail(this.networkHint(err.type), 'No connection');
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
      rtt: 150,
      lastPong: Date.now(),
      pings: new Map(),
      mediaAt: null,
      tab: null,
      since: Date.now(),
    };
    this.guests.set(conn, guest);
    // The hello's clock starts once the connection is open; until then, only a much longer limit.
    let helloTimer = setTimeout(() => !guest.playerId && this.drop(conn), OPEN_TIMEOUT_MS);
    conn.on('open', () => {
      clearTimeout(helloTimer);
      if (this.guests.has(conn)) helloTimer = setTimeout(() => !guest.playerId && this.drop(conn), HELLO_TIMEOUT_MS);
    });
    this.guardFrames(conn);
    conn.on('data', (raw) => {
      if (!this.state || !this.guests.has(conn)) return;
      if (!guest.limit.take()) {
        // Someone holding a key down: disconnect (they may come back), don't block.
        if (guest.limit.strikes > 30) this.drop(conn);
        return;
      }
      const msg = parseClientMsg(raw);
      if (!msg) {
        this.block(conn);
        return;
      }
      try {
        if (msg.t === 'hello') {
          if (guest.playerId) return;
          guest.tab = msg.tab ?? null;
          clearTimeout(helloTimer);
          this.handleHello(conn, guest, msg.secret, msg.name, msg.v);
        } else if (msg.t === 'pong') {
          const sent = guest.pings.get(msg.n);
          if (sent !== undefined) {
            guest.pings.delete(msg.n);
            guest.lastPong = Date.now();
            guest.rtt = guest.rtt * 0.7 + (Date.now() - sent) * 0.3;
          }
        } else if (msg.t === 'action') {
          if (!guest.playerId) return;
          if (msg.action.type === 'answer' && this.tooFast(guest)) return;
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
      const id = guest.playerId;
      if (!id || !this.state) return;
      if ([...this.guests.values()].some((g) => g.playerId === id)) return;
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
    if (hookFrames(conn, check, () => this.block(conn))) return;
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

  private handleHello(conn: DataConnection, guest: Guest, secret: string, name: string, v: number) {
    const outdated = versionProblem(v);
    if (outdated) throw new ActionError(outdated);
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
    const playerId = known ?? randomToken(12);
    let next: GameState;
    try {
      if (!known && this.priv.bannedNames.includes(nameSkeleton(cleanName(name))))
        throw new ActionError('Someone with a name like that was removed from this room. Pick another name.');
      next = engine.apply(this.state!, { type: 'join', playerId, name, returning: !!known }, playerId);
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
    this.setState(next);
    for (const m of this.released) if (this.mayGetMedia(guest)) this.sendMedia(conn, guest, m);
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

  /** Answers that arrive before a human could have seen the question. */
  private tooFast(guest: Guest) {
    const q = this.state?.question;
    if (!q) return false;
    // No art went out at all: don't hold answers back waiting for it.
    if (this.artFailedFor === q.askedAt) return false;
    if (!guest.mediaAt || guest.mediaAt.qid !== q.askedAt) return true;
    return Date.now() - guest.mediaAt.at < guest.rtt + MIN_HUMAN_MS;
  }

  private startPings() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const now = Date.now();
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
      }
    }, PING_EVERY_MS);
  }

  /** In a race the host's clicks skip the network; delay them by a typical guest's one-way trip. */
  private hostHandicap() {
    // Only the people racing count: not spectators, nor (Delve together) those who perished.
    const racing = new Set(this.state ? racerIds(this.state) : []);
    const rtts = [...this.guests.values()]
      .filter((g) => g.playerId && racing.has(g.playerId))
      .map((g) => g.rtt)
      .sort((a, b) => a - b);
    if (!rtts.length) return 0;
    return Math.min(MAX_HOST_HANDICAP_MS, rtts[Math.floor(rtts.length / 2)] / 2);
  }

  private send(conn: DataConnection, msg: HostMsg) {
    if (!conn.open) return;
    try {
      conn.send(msg);
    } catch {
      /* closed underneath us */
    }
  }

  // ---- question media ---------------------------------------------------

  /** Host: new question → prepare its art and release it on schedule. */
  private async startMedia(s: GameState) {
    const q = s.question!;
    this.stopMedia();
    const gen = this.mediaGen;
    shown.clear();
    let media: PreparedMedia;
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Preparing the art timed out')), MEDIA_TIMEOUT_MS);
      });
      media = await Promise.race([prepareMedia(q, this.grayscaleOf(s)), timeout]).finally(() => clearTimeout(timer));
    } catch (err) {
      console.warn('media', err);
      if (gen === this.mediaGen && this.state?.question?.askedAt === q.askedAt && this.state.phase === 'question') {
        this.artFailedFor = q.askedAt;
        if (mayAutoReask(this.state, q.askedAt)) this.reaskLater(this.state);
        else this.flash("Couldn't load the art for this question.", 'warn', { title: 'Art missing' });
      }
      return;
    }
    // The question as it is now: the clock may have run on meanwhile.
    const cur = this.state;
    if (gen !== this.mediaGen || cur?.question?.askedAt !== q.askedAt || cur.phase !== 'question') return;
    this.media = media;
    const qid = q.askedAt;
    // Delve: the clock starts once the art has reached those who answer.
    const timing = !!cur.delve && cur.question.deadline === null;
    this.held = timing && this.mode === 'host' ? { qid, ids: new Set(artFirst(cur)) } : null;
    if (media.art) this.release({ t: 'art', qid, ...media.art });
    media.options.forEach((data, index) => this.release({ t: 'option', qid, index, data }));
    // Delve: veiled "find the art" pictures; their patches burn in once the clock starts.
    media.tiles.forEach((t, tile) => this.release({ t: 'veil', qid, tile, ...t.veil }));
    if (media.veil) this.release({ t: 'veil', qid, ...media.veil });
    // Delve: the art (or the pictures) burn in from when the clock starts
    // (startClock), not from when the question was asked; a question resumed
    // with its clock already running burns from that clock's start.
    if (!timing && (media.veil || media.tiles.length)) this.burnVeil(qid, cur.question.clockAt ?? q.askedAt);
    if (timing) this.waitForArrival(qid);
  }

  /**
   * Delve: starts the clock once the host's queue to everyone it waits for
   * (the art's first recipients who are online: the player answering, or in
   * co-op everyone standing) is empty, the art on the wire, and at most a few
   * seconds after it was released, so nobody starts at a disadvantage. With
   * nobody to wait for (the host alone, hot-seat), at once.
   */
  private waitForArrival(qid: number) {
    const releasedAt = Date.now();
    const poll = () => {
      if (!mayAutoReask(this.state, qid)) return;
      const ids = this.held?.qid === qid ? this.held.ids : new Set<string>();
      const conns = [...this.guests].filter(([, g]) => !!g.playerId && ids.has(g.playerId));
      const now = Date.now();
      const done = conns.every(([c]) => drained(c as unknown as Parameters<typeof drained>[0]));
      // The slowest of them still needs half a round trip for the last bytes and the deadline.
      const rtt = Math.max(0, ...conns.map(([, g]) => g.rtt));
      // Together, after a vote: not before its draw has played out on the cards, theirs starting that half trip late.
      const hold = this.drawHold?.qid === qid ? drawClockFrom(this.drawHold.until, rtt) : 0;
      if ((done || now - releasedAt >= DELVE_CLOCK_CAP_MS) && now >= hold - 500) {
        this.startClock(qid, Math.max(hold, conns.length ? clockStart(done ? now : null, releasedAt, rtt) : now));
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
    sets.forEach(({ tile, patches }, k) => {
      const delays = patchDelays(q, patches.length);
      // Several pictures take turns within half a step, so their patches don't all flare at once
      // (and the last one is no more than half a step behind: tests/delve.test.ts).
      const offset = patches.length > 1 ? ((delays[1] - delays[0]) * k) / sets.length / 2 : 0;
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

  /** Delve: the question's clock starts at `at` (host clock), and everyone else gets the art. */
  private startClock(qid: number, at: number) {
    const cur = this.state;
    if (!cur || cur.question?.askedAt !== qid || cur.question.deadline !== null) return;
    this.setState(engine.apply(cur, { type: 'clock', askedAt: qid, at }, null));
    this.releaseHeld();
    const clockAt = this.state?.question?.clockAt;
    if (clockAt !== undefined) this.burnVeil(qid, clockAt);
  }

  /** Delve: the art held back from everyone but those answering goes out to them now. */
  private releaseHeld() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    for (const [conn, g] of this.guests)
      if (g.playerId && !h.ids.has(g.playerId)) for (const m of this.released) if (m.qid === h.qid) this.sendMedia(conn, g, m);
  }

  private mayGetMedia(g: Guest) {
    return !this.held || (!!g.playerId && this.held.ids.has(g.playerId));
  }

  /**
   * Delve: art that failed to load is asked again by itself, with a backoff,
   * a few times (nothing is lost while it does, as the clock only starts once
   * the art is out). Then it stops: the question waits, its clock not
   * started, until the host asks another (Game's "Ask another question") or
   * the browser is back online (artBack), so an offline device doesn't spin
   * through questions forever and the depth still has to be answered.
   */
  private reaskLater(s: GameState) {
    const qid = s.question!.askedAt;
    // Per turn of this run (turns count from 0 again in the next one).
    const turn = `${s.delve?.startedAt}:${s.turnCount}`;
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

  /** The browser is back online: a Delve question waiting on art that failed is asked again. */
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
   * patch's burn in a different frame.
   */
  private finishVeil(rest: ReturnType<Session['unreleasedPatches']>) {
    const gap = Math.min(30, 300 / Math.max(1, rest.length));
    rest.forEach((patch, k) => {
      const go = () => {
        const s = this.state;
        if ((s?.phase === 'reveal' || s?.phase === 'question') && s.question?.askedAt === patch.qid) this.release({ t: 'patch', ...patch });
      };
      if (k === 0) go();
      else this.mediaTimers.push(setTimeout(go, k * gap));
    });
  }

  private release(m: MediaMsg) {
    this.released.push(m);
    shown.receive(m);
    for (const [conn, g] of this.guests) if (g.playerId && this.mayGetMedia(g)) this.sendMedia(conn, g, m);
  }

  private sendMedia(conn: DataConnection, g: Guest, m: MediaMsg) {
    if (m.t !== 'veil' && (!g.mediaAt || g.mediaAt.qid !== m.qid)) g.mediaAt = { qid: m.qid, at: Date.now() };
    this.send(conn, m);
  }

  private stopMedia(keepReleased = false) {
    if (!keepReleased) this.mediaGen++;
    for (const t of this.mediaTimers) clearTimeout(t);
    this.mediaTimers = [];
    this.media = null;
    this.held = null;
    if (!keepReleased) this.released = [];
  }

  // ---- joining ----------------------------------------------------------

  join(code: string, name: string) {
    // The host's room has its own settings: a shared link's Delve is moot.
    this.delveLink = false;
    this.reset();
    this.mode = 'client';
    this.status = 'connecting';
    this.joinName = name;
    this.code = code.toUpperCase().trim();
    if (!CODE_PATTERN.test(this.code)) {
      this.fail(`"${this.code}" isn't a valid room code.`, 'Invalid code');
      return;
    }
    writeSaved({ mode: 'client', code: this.code, name });
    const room = this.code;
    this.helloSecret = roomSecret(mySecret, room).catch(() => stored(`secret.${room}`, () => randomToken(32)));
    this.joinedAt = Date.now();
    this.armConnectTimeout();
    this.startClientPeer();
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
      else if (!NETWORK_ERRORS.has(err.type)) this.fail(this.networkHint(err.type), 'No connection');
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
      if (this.peer?.open) this.fail(`Couldn't reach room ${this.code}. Check the code, or try again.`, 'No answer');
      else this.fail(this.networkHint('timeout'), 'No connection');
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
      this.fail(`Room ${this.code} doesn't exist (or the host left).`, 'Room not found');
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
    conn.on('data', (raw) => {
      if (this.hostConn !== conn) return;
      lastHeard = Date.now();
      heard = true;
      this.silentCloses = 0;
      const msg = parseHostMsg(raw);
      if (!msg) return;
      switch (msg.t) {
        case 'welcome':
          this.myPlayerId = msg.playerId;
          break;
        case 'state':
          this.syncClock(msg.now);
          if (!this.state || msg.state.version >= this.state.version || msg.state.version === 0) {
            this.noteChange(this.state, msg.state);
            this.state = msg.state;
          }
          this.status = 'ready';
          break;
        case 'error':
          if (this.status === 'connecting') this.fail(versionRefusal(msg.message), "Couldn't join");
          else this.flash(msg.message, 'error');
          break;
        case 'kicked':
          this.fail('You were removed from the game.', 'Removed');
          break;
        case 'closed':
          this.fail('The host closed the room.', 'Room closed');
          break;
        case 'replaced':
          this.fail('You joined this game from another tab or window, so it continues there.', 'Moved to another tab');
          break;
        case 'busy':
          this.flash(msg.message, 'warn', { title: 'Room busy' });
          this.retryWhenBusy();
          break;
        case 'ping':
          conn.send({ t: 'pong', n: msg.n });
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
      if (!heard && ++this.silentCloses >= 3) this.fail(`Room ${this.code} turned the connection away. Try again in a moment.`, "Couldn't join");
      else this.planAttempt(RETRY_SOON_MS);
    });
    const secret = await this.helloSecret;
    if (secret && this.hostConn === conn && conn.open)
      conn.send({ t: 'hello', secret, name: this.joinName, v: PROTOCOL_VERSION, tab: myTab });
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
      this.answered = { qid: q.askedAt, ms: performance.now() - shown.since, ...(share !== undefined ? { share } : {}) };
    }
    if (this.mode === 'client') {
      this.hostConn?.send({ t: 'action', action });
      return;
    }
    const from = this.mode === 'local' ? null : this.myPlayerId;
    const run = () => {
      if (!this.state) return;
      try {
        this.setState(engine.apply(this.state, action, from));
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
    this.noteChange(prev, next);
    this.state = next;
    if (this.isHost && next.delve && next.round >= LOOKS_FETCH_FROM) fetchLooks();
    if (next.phase === 'question' && next.question && next.question.askedAt !== prev?.question?.askedAt) {
      // A question asked again in its place while the draw plays keeps its hold.
      const until = drawHoldUntil(prev, next, this.drawHold);
      this.drawHold = until === null ? null : { qid: next.question.askedAt, until };
      void this.startMedia(next);
    } else if (next.phase === 'reveal') {
      // Only as the reveal begins: a later change during it (someone joining,
      // the room going public) would cancel the patches still on their way.
      if (prev?.phase !== 'reveal' || prev.question?.askedAt !== next.question?.askedAt) {
        const rest = this.unreleasedPatches();
        // Delve: a question that ended before its clock started still shows everyone its art.
        this.releaseHeld();
        // Keep what was sent, so someone arriving during the reveal still gets the pictures.
        this.stopMedia(true);
        this.finishVeil(rest);
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
    else if (this.mode === 'host') writeSaved({ mode: 'host', code: this.code, state: s, priv: this.priv });
  }

  /** Lists the room publicly while the host has it set to public. */
  private syncBeacon(s: GameState) {
    const want = this.mode === 'host' && !this.labRoomless && !!s.settings.public;
    if (want && !this.beacon) {
      this.beacon = new Beacon(() => this.roomInfo());
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
      players: s.players.filter((p) => p.connected).length,
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

  /** What every device makes of a state change, host and guest alike: records, sounds and notices, achievements. */
  private noteChange(prev: GameState | null, next: GameState) {
    this.noteRun(prev, next);
    this.onNewState(prev, next);
    this.noteEncounter(prev, next);
    this.noteMoments(prev, next);
  }

  /**
   * A question just revealed goes into this browser's codex; so does one
   * dynamite just blasted away, as seen (never missed).
   */
  private noteEncounter(prev: GameState | null, next: GameState) {
    const me = this.myPlayerId;
    const hotSeat = this.mode === 'local';
    const blast = blastedAway(prev, next);
    if (blast) {
      void import('./codex')
        .then(({ blastedEncounter, recordEncounter }) => recordEncounter(blastedEncounter(next, blast, me, hotSeat)))
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
      .then(({ encounterAt, recordEncounter }) => {
        const e = encounterAt(next, me, hotSeat, ms);
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
    void Promise.all([import('./achievements'), import('./achievementToasts')])
      .then(([{ noteState }, { announceAchievements }]) => {
        announceAchievements(noteState(prev, next, me, hotSeat, { items: engine.items, veilShare }), 'game');
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
    const idle = (run: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 1000 }) : setTimeout(run, 300));
    void Promise.all([import('./achievements'), import('./achievementToasts')])
      .then(([{ checkAchievements }, { announceAchievements }]) =>
        idle(() => {
          this.achievementsDue = false;
          try {
            announceAchievements(checkAchievements(engine.items), 'game');
          } catch (err) {
            console.warn('achievements', err);
          }
        }),
      )
      .catch((err) => {
        this.achievementsDue = false;
        console.warn('achievements', err);
      });
  }

  /** Delve: the fuse waiting to burn, for the question and the 0 it burns down to (`key`). */
  private hiss: { key: string; timer: ReturnType<typeof setTimeout> | null } | null = null;
  /** Delve: the fuse's sound, for the question it burns on (askedAt); one at a time. */
  private fuseSound: { qid: number; stop: (() => void) | undefined } | null = null;

  /**
   * Delve: the fuse's sound starts for question `qid`, held for `holdMs` at
   * most (cut sooner as the question ends); nothing when it sounds for that
   * question already, so it is never heard twice over.
   */
  private soundFuse(qid: number, holdMs: number) {
    if (this.fuseSound?.qid === qid) return;
    this.cutFuse();
    this.fuseSound = { qid, stop: sfx('fuse', { holdMs }) };
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
      this.soundFuse(cur.question.askedAt, fuse * DELVE_FUSE_MS + ANSWER_GRACE_MS + FUSE_TAIL_MS);
    };
    light(s);
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
    if (blastedAway(prev, next)) sfx('blast');
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
      if ((next.question.struck ?? []).slice(before).some((x) => x.by !== me)) sfx('struck');
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

  /** Delve: one notice of a state change, in words (delveSession.ts delveNotices). What this device's own screen shows already, it isn't told. */
  private delveNotice(n: DelveNotice, s: GameState) {
    const player = (id: string) => s.players.find((p) => p.id === id);
    const p = player(n.playerId);
    const who = p ? { name: p.name, hue: p.hue } : undefined;
    const me = this.mode === 'local' ? null : this.myPlayerId;
    const mine = !!me && n.playerId === me;
    switch (n.kind) {
      case 'setAside':
        this.flash(`The host reloaded, so ${n.playerId ? 'it cost nothing' : 'nobody lost anything'}.`, 'info', { title: 'Question set aside', ...(who ? { who } : {}) });
        break;
      case 'struck':
        // What it cost them, their phial shows; a blast's loss is said too.
        if (who && !mine) this.flash(`That answer is out for everyone.${n.blown ? ` ${blownText(n.blown, 'their')}` : ''}`, 'warn', { title: 'Wrong pick', who });
        break;
      case 'perished': {
        // Nobody left standing: the run ends next (the notice comes with the
        // reveal, the end after it), and the end has its own toll (onNewState).
        const wiped = !standingIds(s).length;
        // The depth is in the header.
        const line = wiped ? 'The team has fallen.' : n.revivable ? 'A teammate can give them a life.' : 'The rest delve on.';
        if (who && !mine) this.flash(line, 'warn', { title: 'Perished', who });
        // Before the end, your own perishing goes out as it would, a teammate's from far off.
        if (!wiped && s.phase !== 'over') sfx(mine ? 'fallen' : 'fallenFar');
        break;
      }
      case 'revived': {
        const giver = player(n.by);
        if (!who || !giver) break;
        const line = n.by === me ? 'You gave them a life.' : mine ? `${giver.name} gave you a life.` : `${giver.name} gave them a life.`;
        this.flash(line, 'info', { title: 'Brought back', who });
        break;
      }
      case 'flare':
        if (who) this.flash(`${FLARE_MS / 1000} more seconds for everyone.`, 'info', { title: 'A flare burns', who });
        break;
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
        this.setState(engine.apply(cur, { type: 'next' }, null));
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
   * may skip them.
   */
  private scheduleIdle(s: GameState) {
    const active = s.players[s.turn];
    const waiting =
      this.mode === 'host' &&
      s.settings.mode !== 'race' &&
      !s.delve &&
      !!active?.connected &&
      active.id !== this.priv.myPlayerId &&
      (s.phase === 'choosing' || (s.phase === 'question' && !s.question?.deadline));
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

  private fail(message: string, title?: string, keepSaved = false) {
    const mode = this.mode;
    const saved = keepSaved ? readSaved() : null;
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
   * This player walks away (leaves the room, or the page goes): a game against
   * others they leave while losing still counts against a run of wins
   * (lib/versus.ts). Not on being removed or the room closing (fail), and
   * not while cut off from the host, when the game may be gone already:
   * none of those is walking away.
   */
  walkAway() {
    if (this.mode === 'client' && this.status !== 'ready') return;
    noteLeaving(this.state, this.myPlayerId, this.mode === 'local');
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
    this.reaskFails = { turn: '', n: 0 };
    this.artFailedFor = 0;
    this.drawHold = null;
    this.labRoomless = false;
    for (const c of this.guests.keys()) c.close();
    this.guests.clear();
    // Let go of it first, so its 'close' doesn't count as a failed join.
    const link = this.hostConn;
    this.hostConn = null;
    link?.close();
    this.cancelAttempts();
    this.peer?.destroy();
    this.peer = null;
    this.mode = null;
    this.state = null;
    this.status = 'idle';
    this.code = '';
    this.myPlayerId = null;
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
  | { mode: 'client'; code: string; name: string };
const SAVE = 'session.v4';
/**
 * Before guests' tokens became per-room. A hosted room saved then can't be
 * resumed (its guests' tokens no longer match), and a guest's saved room
 * can't be reached by this version; a hot-seat game carries on.
 */
const OLD_SAVE_KEY = 'poe2trivia.session.v3';

/** The veiled pictures of a question: the art of a name question, or each "find the art" picture (`tile`). */
function veiledSets(media: PreparedMedia): { tile: number | undefined; patches: PreparedMedia['patches'] }[] {
  if (media.veil) return [{ tile: undefined, patches: media.patches }];
  return media.tiles.map((t, tile) => ({ tile, patches: t.patches }));
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
  else removeStored(SAVE, 'session');
}

export const session = new Session();

if (typeof window !== 'undefined') {
  // A run abandoned by closing the tab (or going elsewhere) is still recorded, and so is a game against others left losing.
  window.addEventListener('pagehide', () => {
    session.recordLeaving();
    session.walkAway();
  });
  // Art that wouldn't load (offline) is tried again once the browser is back online.
  window.addEventListener('online', () => session.artBack());
}