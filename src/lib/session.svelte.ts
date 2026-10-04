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
  activeRules,
  ANSWER_GRACE_MS,
  autoNextLeft,
  renameCategories,
  type Action,
  type GameState,
  type Item,
} from './game';
import { PEER_OPTIONS, PEER_PREFIX } from './peer';
import { Beacon, type RoomInfo } from './rooms';
import { parseClientMsg, parseHostMsg, PROTOCOL_VERSION, RateLimit, type HostMsg, type MediaMsg } from './protocol';
import { capped, FrameGuard, hookFrames, JoinGate, roomSecret } from './guard';
import { cleanName, nameSkeleton } from './names';
import { prepareMedia, shown, patchDelays, type PreparedMedia } from './media.svelte';
import { sfx } from './sound';
import { prefsFrom, roomPrefs, roomSettings, savePrefs } from './prefs';
import { toasts, type ToastKind, type ToastOptions } from './toasts.svelte';

export const engine = new Engine(itemData as Item[], { fakes: fakeNames });

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/** Connections that haven't introduced themselves yet, room-wide and per peer. */
const MAX_PENDING = 8;
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
/** A connection must introduce itself within this time. */
const HELLO_TIMEOUT_MS = 6000;
const PING_EVERY_MS = 3000;
/** Guests: no message from the host for this long means it's gone. */
const HOST_SILENCE_MS = 15000;
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

export type Mode = 'local' | 'host' | 'client';
export type Status = 'idle' | 'connecting' | 'ready' | 'lost';

function randomToken(len: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  const buf = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(buf, (n) => alphabet[n % alphabet.length]).join('');
}

const randomCode = () => randomToken(CODE_LENGTH, CODE_ALPHABET);

function stored(key: string, fallback: () => string): string {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const fresh = fallback();
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return fallback();
  }
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export const savedName = () => readLocal('poe2trivia.name') ?? '';
export const saveName = (name: string) => writeLocal('poe2trivia.name', name);

/**
 * This browser's secret. It proves "I'm the same player" when rejoining and
 * is only ever sent to the host, never shown to other players.
 */
const mySecret = stored('poe2trivia.secret', () => randomToken(32));
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
  private hostWatch: ReturnType<typeof setInterval> | null = null;
  private beacon: Beacon | null = null;
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  private skipKey = '';
  private idleKey = '';
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** How long this device took to answer the current question (its askedAt), for the codex. */
  private answered: { qid: number; ms: number } | null = null;

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
    this.reset();
    this.mode = 'local';
    this.status = 'ready';
    this.setState(resume ?? createGame(null));
  }

  /** Picks up a hot-seat game or a hosted room after a page refresh. */
  resume() {
    const saved = readSaved();
    if (!saved) return;
    if (saved.mode === 'local') this.startLocal(renameCategories(saved.state));
    else if (saved.mode === 'host') {
      this.reset();
      this.mode = 'host';
      this.status = 'connecting';
      this.loadPrivate(saved.priv);
      this.openRoom(saved.code, 0, renameCategories(saved.state));
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
    peer.on('open', () => {
      if (this.peer !== peer) return;
      this.code = code;
      this.status = 'ready';
      const me = this.priv.myPlayerId;
      if (resumeState) {
        // Everyone else has to reconnect; mark them offline until they do (a
        // lobby keeps their seats, and lets go of the ones still empty when
        // the game starts). Spectators rejoin as spectators when they reconnect.
        let s: GameState = { ...resumeState, spectators: [] };
        for (const p of s.players)
          if (p.id !== me) s = engine.apply(s, { type: 'connection', playerId: p.id, connected: false }, null);
        // A reveal counts down afresh, so the others can reconnect before it
        // moves on (moving on skips the seats still offline).
        if (s.reveal) s = { ...s, reveal: { ...s.reveal, at: Date.now() } };
        this.setState(s);
      } else {
        let s = createGame(me, roomSettings());
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
      if (err.type === 'unavailable-id' && resumeState)
        this.fail(`Couldn't reopen room ${code}: it still seems to be open, maybe in another tab or window.`, 'Room not reopened');
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
    const helloTimer = setTimeout(() => !guest.playerId && this.drop(conn), HELLO_TIMEOUT_MS);
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
    if (v !== PROTOCOL_VERSION) throw new ActionError('Your game version is out of date. Please reload the page.');
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
    for (const m of this.released) this.sendMedia(conn, guest, m);
    const player = next.players.find((p) => p.id === playerId);
    const watcher = next.spectators?.find((o) => o.id === playerId);
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
    // Only the people racing count, not spectators.
    const racing = new Set(this.state?.players.map((p) => p.id));
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
    shown.clear();
    let media: PreparedMedia;
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Preparing the art timed out')), MEDIA_TIMEOUT_MS);
      });
      media = await Promise.race([prepareMedia(q, activeRules(s).grayscale), timeout]).finally(() => clearTimeout(timer));
    } catch (err) {
      console.warn('media', err);
      if (this.state?.question?.askedAt === q.askedAt && this.state.phase === 'question') {
        this.artFailedFor = q.askedAt;
        this.flash("Couldn't load the art for this question.", 'warn', { title: 'Art missing' });
      }
      return;
    }
    if (this.state?.question?.askedAt !== q.askedAt || this.state.phase !== 'question') return;
    this.media = media;
    const qid = q.askedAt;
    if (media.art) this.release({ t: 'art', qid, ...media.art });
    media.options.forEach((data, index) => this.release({ t: 'option', qid, index, data }));
    if (media.veil) {
      this.release({ t: 'veil', qid, ...media.veil });
      const delays = patchDelays(q, media.patches.length);
      media.patches.forEach((patch, rank) => {
        const due = q.askedAt + delays[rank] - Date.now();
        const go = () => {
          if (this.media?.qid === qid) this.release({ t: 'patch', qid, ...patch });
        };
        if (due <= 0) go();
        else this.mediaTimers.push(setTimeout(go, due));
      });
    }
  }

  /** Patches of the current veiled picture that haven't gone out yet, in order. */
  private unreleasedPatches() {
    const media = this.media;
    if (!media?.veil) return [];
    const sent = new Set(this.released.flatMap((m) => (m.t === 'patch' ? [m.i] : [])));
    return media.patches.filter((p) => !sent.has(p.i)).map((p) => ({ qid: media.qid, ...p }));
  }

  /**
   * The answer is out, so the rest of a veiled picture goes out now, a few
   * tens of ms apart: it burns in quickly, still spreading from what's
   * there, and every device starts each patch's burn in a different frame.
   */
  private finishVeil(rest: ReturnType<Session['unreleasedPatches']>) {
    const gap = Math.min(60, 700 / Math.max(1, rest.length));
    rest.forEach((patch, k) => {
      const go = () => {
        if (this.state?.phase === 'reveal' && this.state.question?.askedAt === patch.qid) this.release({ t: 'patch', ...patch });
      };
      if (k === 0) go();
      else this.mediaTimers.push(setTimeout(go, k * gap));
    });
  }

  private release(m: MediaMsg) {
    this.released.push(m);
    shown.receive(m);
    for (const [conn, g] of this.guests) if (g.playerId) this.sendMedia(conn, g, m);
  }

  private sendMedia(conn: DataConnection, g: Guest, m: MediaMsg) {
    if (m.t !== 'veil' && (!g.mediaAt || g.mediaAt.qid !== m.qid)) g.mediaAt = { qid: m.qid, at: Date.now() };
    this.send(conn, m);
  }

  private stopMedia(keepReleased = false) {
    for (const t of this.mediaTimers) clearTimeout(t);
    this.mediaTimers = [];
    this.media = null;
    if (!keepReleased) this.released = [];
  }

  // ---- joining ----------------------------------------------------------

  join(code: string, name: string) {
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
    this.helloSecret = roomSecret(mySecret, room).catch(() => stored(`poe2trivia.secret.${room}`, () => randomToken(32)));
    const peer = new Peer(PEER_OPTIONS);
    this.peer = peer;
    this.armConnectTimeout();
    peer.on('open', () => this.peer === peer && this.connectToHost());
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      if (err.type === 'peer-unavailable') {
        if (this.status === 'connecting') this.fail(`Room ${this.code} doesn't exist (or the host left).`, 'Room not found');
        return;
      }
      console.warn('peer error', err);
      if (this.status === 'connecting') this.fail(this.networkHint(err.type), 'No connection');
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
    });
  }

  /** Joining gives up if the room hasn't answered by then. */
  private armConnectTimeout() {
    const peer = this.peer;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      if (peer && this.peer === peer && this.status === 'connecting')
        this.fail(`Couldn't reach room ${this.code}. Check the code, or try again.`, 'No answer');
    }, 15000);
  }

  /**
   * The host has too many people joining (or this device reconnected a lot):
   * wait a moment and try again. A live connection that dropped already
   * retries on its own schedule; this covers joining and resuming.
   */
  private retryWhenBusy() {
    if (this.status !== 'connecting') return;
    const peer = this.peer;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      if (!peer || this.peer !== peer || peer.destroyed || this.status !== 'connecting') return;
      this.armConnectTimeout();
      this.connectToHost();
    }, BUSY_RETRY_MS);
  }

  private connectToHost() {
    if (!this.peer) return;
    // Drop the previous attempt so a slow one can't come back alongside the new one.
    const stale = this.hostConn;
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true });
    this.hostConn = conn;
    stale?.close();
    conn.on('open', async () => {
      const secret = await this.helloSecret;
      if (secret && this.hostConn === conn && conn.open)
        conn.send({ t: 'hello', secret, name: this.joinName, v: PROTOCOL_VERSION, tab: myTab });
    });
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
      const msg = parseHostMsg(raw);
      if (!msg) return;
      switch (msg.t) {
        case 'welcome':
          this.myPlayerId = msg.playerId;
          break;
        case 'state':
          this.syncClock(msg.now);
          if (!this.state || msg.state.version >= this.state.version || msg.state.version === 0) {
            this.onNewState(this.state, msg.state);
            this.noteEncounter(this.state, msg.state);
            this.state = msg.state;
          }
          this.status = 'ready';
          break;
        case 'error':
          if (this.status === 'connecting') this.fail(msg.message, "Couldn't join");
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
    conn.on('close', () => this.hostLost(conn));
  }

  private hostLost(conn: DataConnection) {
    if (this.hostConn === conn && this.mode === 'client' && this.status === 'ready') {
      this.status = 'lost';
      this.retries = 0;
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
      if (this.peer && !this.peer.destroyed) this.connectToHost();
      this.scheduleRetry();
    }, 3000);
  }

  reconnect() {
    if (this.mode !== 'client') return;
    this.retries = 0;
    this.gaveUp = false;
    if (this.peer && !this.peer.destroyed) this.connectToHost();
    this.scheduleRetry();
  }

  // ---- actions ----------------------------------------------------------

  dispatch(action: Action) {
    if (!this.state) return;
    const q = this.state.question;
    if (action.type === 'answer' && action.index !== null && q && shown.qid === q.askedAt && this.answered?.qid !== q.askedAt) {
      this.answered = { qid: q.askedAt, ms: performance.now() - shown.since };
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
    const handicap = this.mode === 'host' && this.race && action.type === 'answer' ? this.hostHandicap() : 0;
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

  // ---- internals --------------------------------------------------------

  private setState(next: GameState) {
    const prev = this.state;
    this.onNewState(prev, next);
    this.noteEncounter(prev, next);
    this.state = next;
    if (next.phase === 'question' && next.question && next.question.askedAt !== prev?.question?.askedAt) {
      void this.startMedia(next);
    } else if (next.phase === 'reveal') {
      // Only as the reveal begins: a later change during it (someone joining,
      // the room going public) would cancel the patches still on their way.
      if (prev?.phase !== 'reveal' || prev.question?.askedAt !== next.question?.askedAt) {
        const rest = this.unreleasedPatches();
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
    if (this.mode === 'local') writeSaved({ mode: 'local', state: s });
    else if (this.mode === 'host') writeSaved({ mode: 'host', code: this.code, state: s, priv: this.priv });
  }

  /** Lists the room publicly while the host has it set to public. */
  private syncBeacon(s: GameState) {
    const want = this.mode === 'host' && !!s.settings.public;
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
    };
  }

  /** A question just revealed goes into this browser's codex. */
  private noteEncounter(prev: GameState | null, next: GameState) {
    // Not after a refresh into a reveal: it was likely counted before the
    // refresh. The codex itself skips a question it already has (a rejoin).
    if (!prev || next.phase !== 'reveal') return;
    const qid = next.question?.askedAt;
    if (prev.phase === 'reveal' && prev.question?.askedAt === qid) return;
    const ms = this.answered?.qid === qid ? this.answered?.ms : undefined;
    const me = this.myPlayerId;
    const hotSeat = this.mode === 'local';
    // Its own chunk: the first download stays small.
    void import('./codex').then(({ encounterAt, recordEncounter }) => {
      const e = encounterAt(next, me, hotSeat, ms);
      if (e) recordEncounter(e);
    });
  }

  /** Side effects that every device plays: sounds. */
  private onNewState(prev: GameState | null, next: GameState) {
    if (!prev) return;
    const me = this.myPlayerId;
    if ((prev.phase === 'lobby' || prev.phase === 'over') && (next.phase === 'choosing' || next.phase === 'question')) {
      sfx('start');
      return;
    }
    if (next.phase === 'over' && prev.phase !== 'over') {
      // Hot-seat and spectators celebrate whoever won; a player who lost hears a toll instead.
      const lost = this.mode !== 'local' && !!me && next.players.some((p) => p.id === me) && !next.winners.includes(me);
      sfx(lost ? 'defeat' : 'victory');
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
    if (prev.phase !== 'reveal' && next.phase === 'reveal' && next.reveal) {
      sfx(next.reveal.correct ? 'correct' : 'wrong');
    } else if (prev.phase !== next.phase && next.phase === 'choosing') {
      sfx(next.players[next.turn]?.id === me || this.mode === 'local' ? 'yourTurn' : 'turn');
    } else if (prev.phase === 'choosing' && next.phase === 'question') {
      sfx('reveal');
    } else if (prev.phase === 'lobby' && next.phase === 'lobby' && next.players.length > prev.players.length) {
      sfx('join');
    }
  }

  private scheduleTimers(s: GameState) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (s.phase === 'question' && s.question?.deadline) {
      const version = s.version;
      this.timer = setTimeout(
        () => {
          if (this.state?.version !== version) return;
          this.setState(engine.apply(this.state, { type: 'answer', index: null }, null));
        },
        // Answers sent in time may still be on their way.
        Math.max(0, s.question.deadline - Date.now() + ANSWER_GRACE_MS),
      );
    }
    this.scheduleAutoSkip(s);
    this.scheduleIdle(s);
    this.scheduleAutoNext(s);
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

  private fail(message: string, title?: string) {
    const mode = this.mode;
    this.reset();
    this.flash(message, 'error', { title, sticky: true });
    if (mode === 'client') this.status = 'idle';
  }

  private reset() {
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
    this.artFailedFor = 0;
    for (const c of this.guests.keys()) c.close();
    this.guests.clear();
    this.hostConn?.close();
    this.hostConn = null;
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
    this.secretToPlayer = new Map();
    this.joins = new JoinGate();
    this.helloSecret = null;
    if (this.retry) clearTimeout(this.retry);
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
const SAVE_KEY = 'poe2trivia.session.v4';
/**
 * Before guests' tokens became per-room. A hosted room saved then can't be
 * resumed (its guests' tokens no longer match), and a guest's saved room
 * can't be reached by this version; a hot-seat game carries on.
 */
const OLD_SAVE_KEY = 'poe2trivia.session.v3';

function readSaved(): Saved | null {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw) as Saved;
    const old = sessionStorage.getItem(OLD_SAVE_KEY);
    sessionStorage.removeItem(OLD_SAVE_KEY);
    const saved = old ? (JSON.parse(old) as Saved) : null;
    return saved?.mode === 'local' ? saved : null;
  } catch {
    return null;
  }
}

function writeSaved(saved: Saved | null) {
  try {
    if (saved) sessionStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    else sessionStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export const session = new Session();