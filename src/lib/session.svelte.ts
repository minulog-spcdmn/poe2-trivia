// Session: owns the game state and wires it to either the local device
// (hot-seat), a hosted PeerJS room, or a connection to someone else's room.
//
// Trust model: the host runs the game and is trusted by definition (it has the
// answers). Guests are not: they only receive a redacted copy of the state,
// get question art as altered image bytes, identify themselves with a secret
// token that never leaves their device, and everything they send is checked
// and rate limited.

import Peer, { type DataConnection } from 'peerjs';
import itemData from '../data/items.json';
import {
  Engine,
  createGame,
  ActionError,
  MAX_PLAYERS,
  publicView,
  activeRules,
  type Action,
  type GameState,
  type Item,
} from './game';
import { PEER_OPTIONS, PEER_PREFIX } from './peer';
import { Beacon, type RoomInfo } from './rooms';
import { parseClientMsg, parseHostMsg, PROTOCOL_VERSION, RateLimit, type HostMsg, type MediaMsg } from './protocol';
import { prepareMedia, shown, tileDelay, type PreparedMedia } from './media.svelte';
import { sfx } from './sound';

export const engine = new Engine(itemData as Item[]);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const AUTO_NEXT_MS = 5000;

/** Connections beyond the players (people joining, reconnecting). */
const MAX_CONNECTIONS = MAX_PLAYERS + 4;
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
}

/** Host-only data that must survive a page refresh but never reach guests. */
interface HostPrivate {
  myPlayerId: string;
  secrets: [string, string][];
  bannedSecrets: string[];
  bannedPeers: string[];
}

class Session {
  mode = $state<Mode | null>(null);
  status = $state<Status>('idle');
  state = $state.raw<GameState | null>(null);
  code = $state<string>('');
  error = $state<string>('');
  toast = $state<string>('');
  /** host clock minus local clock, for timer display on clients */
  clockOffset = $state(0);
  /** This device's player in an online game. */
  myPlayerId = $state<string | null>(null);
  /** Streamer mode: don't show the room code on screen. */
  hideCode = $state(readLocal('poe2trivia.hideCode') === '1');
  /** Reconnecting to the host has been given up. */
  gaveUp = $state(false);
  /** Host: when the disconnected active player's turn will be skipped (0 = not pending). */
  skipAt = $state(0);

  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null;
  private guests = new Map<DataConnection, Guest>();
  private priv: HostPrivate = { myPlayerId: '', secrets: [], bannedSecrets: [], bannedPeers: [] };
  private secretToPlayer = new Map<string, string>();
  private media: PreparedMedia | null = null;
  private mediaTimers: ReturnType<typeof setTimeout>[] = [];
  /** Media messages already released for the current question (for late joiners). */
  private released: MediaMsg[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private autoNext: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingSeq = 0;
  private joinName = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private hostWatch: ReturnType<typeof setInterval> | null = null;
  private beacon: Beacon | null = null;
  private skipTimer: ReturnType<typeof setTimeout> | null = null;
  private skipKey = '';

  get isHost() {
    return this.mode === 'local' || this.mode === 'host';
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

  hostNow() {
    return Date.now() + this.clockOffset;
  }

  flash(message: string) {
    this.toast = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }

  setHideCode(hide: boolean) {
    this.hideCode = hide;
    writeLocal('poe2trivia.hideCode', hide ? '1' : '0');
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
    if (saved.mode === 'local') this.startLocal(saved.state);
    else if (saved.mode === 'host') {
      this.reset();
      this.mode = 'host';
      this.status = 'connecting';
      this.loadPrivate(saved.priv);
      this.openRoom(saved.code, 0, saved.state);
    } else if (saved.mode === 'client') this.join(saved.code, saved.name);
  }

  // ---- hosting ----------------------------------------------------------

  host(name: string) {
    this.reset();
    this.mode = 'host';
    this.status = 'connecting';
    this.joinName = name;
    this.loadPrivate({ myPlayerId: randomToken(12), secrets: [], bannedSecrets: [], bannedPeers: [] });
    this.openRoom(randomCode(), 0);
  }

  private loadPrivate(p: HostPrivate) {
    this.priv = { ...p, secrets: [...p.secrets], bannedSecrets: [...p.bannedSecrets], bannedPeers: [...p.bannedPeers] };
    this.secretToPlayer = new Map(p.secrets);
    this.myPlayerId = p.myPlayerId;
  }

  private openRoom(code: string, attempt: number, resumeState?: GameState) {
    const peer = new Peer(PEER_PREFIX + code, PEER_OPTIONS);
    this.peer = peer;
    peer.on('open', () => {
      this.code = code;
      this.status = 'ready';
      const me = this.priv.myPlayerId;
      if (resumeState) {
        // Everyone else has to reconnect; mark them offline until they do.
        let s = resumeState;
        for (const p of s.players)
          if (p.id !== me) s = engine.apply(s, { type: 'connection', playerId: p.id, connected: false }, null);
        this.setState(s);
      } else {
        let s = createGame(me);
        try {
          s = engine.apply(s, { type: 'join', playerId: me, name: this.joinName }, me);
        } catch (err) {
          this.fail(err instanceof ActionError ? err.message : 'Could not create the room.');
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
      if (err.type === 'unavailable-id' && attempt < 8) {
        peer.destroy();
        // When resuming, the old id can linger on the server for a few seconds.
        if (resumeState) setTimeout(() => this.openRoom(code, attempt + 1, resumeState), 2500);
        else this.openRoom(randomCode(), attempt + 1);
        return;
      }
      if (err.type === 'peer-unavailable') return;
      console.warn('peer error', err);
      if (this.status === 'connecting') this.fail(this.networkHint(err.type));
    });
  }

  private acceptConnection(conn: DataConnection) {
    if (this.guests.size >= MAX_CONNECTIONS || this.priv.bannedPeers.includes(conn.peer)) {
      conn.on('open', () => conn.close());
      return;
    }
    const guest: Guest = {
      playerId: null,
      limit: new RateLimit(10, 20),
      rtt: 150,
      lastPong: Date.now(),
      pings: new Map(),
      mediaAt: null,
    };
    this.guests.set(conn, guest);
    const helloTimer = setTimeout(() => !guest.playerId && conn.close(), HELLO_TIMEOUT_MS);

    conn.on('data', (raw) => {
      if (!this.state) return;
      if (!guest.limit.take()) {
        if (guest.limit.strikes > 30) conn.close();
        return;
      }
      const msg = parseClientMsg(raw);
      if (!msg) {
        conn.close();
        return;
      }
      try {
        if (msg.t === 'hello') {
          if (guest.playerId) return;
          this.handleHello(conn, guest, msg.secret, msg.name, msg.v);
          clearTimeout(helloTimer);
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
        this.send(conn, { t: 'error', message });
        if (msg.t === 'hello') setTimeout(() => conn.close(), 500);
      }
    });
    conn.on('close', () => {
      clearTimeout(helloTimer);
      this.guests.delete(conn);
      const id = guest.playerId;
      if (!id || !this.state) return;
      if ([...this.guests.values()].some((g) => g.playerId === id)) return;
      const p = this.state.players.find((p) => p.id === id);
      if (!p) return;
      if (this.state.phase === 'lobby') {
        this.setState(engine.apply(this.state, { type: 'remove', playerId: id }, null));
      } else {
        this.setState(engine.apply(this.state, { type: 'connection', playerId: id, connected: false }, null));
        this.flash(`${p.name} disconnected`);
      }
    });
  }

  private handleHello(conn: DataConnection, guest: Guest, secret: string, name: string, v: number) {
    if (v !== PROTOCOL_VERSION) throw new ActionError('Your game version is out of date. Please reload the page.');
    if (this.priv.bannedSecrets.includes(secret)) {
      this.send(conn, { t: 'kicked' });
      setTimeout(() => conn.close(), 300);
      return;
    }
    const known = this.secretToPlayer.get(secret);
    const playerId = known ?? randomToken(12);
    const next = engine.apply(this.state!, { type: 'join', playerId, name }, playerId);
    if (!known) {
      this.secretToPlayer.set(secret, playerId);
      this.priv.secrets.push([secret, playerId]);
    }
    // Only one live connection per player (e.g. after a refresh).
    for (const [c, g] of this.guests)
      if (g.playerId === playerId && c !== conn) {
        g.playerId = null;
        c.close();
      }
    guest.playerId = playerId;
    this.send(conn, { t: 'welcome', playerId });
    this.setState(next);
    for (const m of this.released) this.sendMedia(conn, guest, m);
    this.flash(`${next.players.find((p) => p.id === playerId)?.name} joined`);
  }

  /** Answers that arrive before a human could have seen the question. */
  private tooFast(guest: Guest) {
    const q = this.state?.question;
    if (!q) return false;
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
        const n = ++this.pingSeq;
        g.pings.set(n, now);
        if (g.pings.size > 10) g.pings.delete(g.pings.keys().next().value!);
        this.send(conn, { t: 'ping', n });
      }
    }, PING_EVERY_MS);
  }

  /** In a race the host's clicks skip the network; delay them by a typical guest's one-way trip. */
  private hostHandicap() {
    const rtts = [...this.guests.values()].filter((g) => g.playerId).map((g) => g.rtt).sort((a, b) => a - b);
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
      media = await prepareMedia(q, activeRules(s).grayscale);
    } catch (err) {
      console.warn('media', err);
      return;
    }
    if (this.state?.question?.askedAt !== q.askedAt || this.state.phase !== 'question') return;
    this.media = media;
    const qid = q.askedAt;
    if (media.art) this.release({ t: 'art', qid, ...media.art });
    media.options.forEach((data, index) => this.release({ t: 'option', qid, index, data }));
    if (media.grid) {
      this.release({ t: 'grid', qid, ...media.grid });
      media.tiles.forEach((tile, rank) => {
        const due = q.askedAt + tileDelay(q, rank) - Date.now();
        const go = () => {
          if (this.media?.qid === qid) this.release({ t: 'tile', qid, ...tile });
        };
        if (due <= 0) go();
        else this.mediaTimers.push(setTimeout(go, due));
      });
    }
  }

  private release(m: MediaMsg) {
    this.released.push(m);
    shown.receive(m);
    for (const [conn, g] of this.guests) if (g.playerId) this.sendMedia(conn, g, m);
  }

  private sendMedia(conn: DataConnection, g: Guest, m: MediaMsg) {
    if (m.t !== 'grid' && (!g.mediaAt || g.mediaAt.qid !== m.qid)) g.mediaAt = { qid: m.qid, at: Date.now() };
    this.send(conn, m);
  }

  private stopMedia() {
    for (const t of this.mediaTimers) clearTimeout(t);
    this.mediaTimers = [];
    this.media = null;
    this.released = [];
  }

  // ---- joining ----------------------------------------------------------

  join(code: string, name: string) {
    this.reset();
    this.mode = 'client';
    this.status = 'connecting';
    this.joinName = name;
    this.code = code.toUpperCase().trim();
    if (!CODE_PATTERN.test(this.code)) {
      this.fail(`"${this.code}" isn't a valid room code.`);
      return;
    }
    writeSaved({ mode: 'client', code: this.code, name });
    const peer = new Peer(PEER_OPTIONS);
    this.peer = peer;
    const timeout = setTimeout(() => {
      if (this.status === 'connecting') this.fail(`Couldn't reach room ${this.code}. Check the code, or try again.`);
    }, 15000);
    peer.on('open', () => this.connectToHost());
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        if (this.status === 'connecting') {
          clearTimeout(timeout);
          this.fail(`Room ${this.code} doesn't exist (or the host left).`);
        }
        return;
      }
      console.warn('peer error', err);
      if (this.status === 'connecting') {
        clearTimeout(timeout);
        this.fail(this.networkHint(err.type));
      }
    });
    peer.on('disconnected', () => {
      if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
    });
  }

  private connectToHost() {
    if (!this.peer) return;
    // Drop the previous attempt so a slow one can't come back alongside the new one.
    const stale = this.hostConn;
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true });
    this.hostConn = conn;
    stale?.close();
    conn.on('open', () => {
      conn.send({ t: 'hello', secret: mySecret, name: this.joinName, v: PROTOCOL_VERSION });
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
          this.clockOffset = msg.now - Date.now();
          if (!this.state || msg.state.version >= this.state.version || msg.state.version === 0) {
            this.onNewState(this.state, msg.state);
            this.state = msg.state;
          }
          this.status = 'ready';
          break;
        case 'error':
          if (this.status === 'connecting') this.fail(msg.message);
          else this.flash(msg.message);
          break;
        case 'kicked':
          this.fail('You were removed from the game.');
          break;
        case 'closed':
          this.fail('The host closed the room.');
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
        this.flash(err instanceof ActionError ? err.message : 'Something went wrong.');
      }
    };
    const handicap = this.mode === 'host' && this.race && action.type === 'answer' ? this.hostHandicap() : 0;
    if (handicap > 0) setTimeout(run, handicap);
    else run();
  }

  /** Removes a player for the rest of this session (lobby or mid-game). */
  kick(playerId: string) {
    if (this.mode !== 'host' || playerId === this.priv.myPlayerId) return;
    for (const [secret, id] of this.secretToPlayer) if (id === playerId) this.priv.bannedSecrets.push(secret);
    for (const [c, g] of this.guests) {
      if (g.playerId === playerId) {
        this.priv.bannedPeers.push(c.peer);
        this.send(c, { t: 'kicked' });
        g.playerId = null;
        setTimeout(() => c.close(), 300);
      }
    }
    const name = this.state?.players.find((p) => p.id === playerId)?.name;
    this.dispatch({ type: 'remove', playerId });
    if (name) this.flash(`${name} was removed`);
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
    this.state = next;
    if (next.phase === 'question' && next.question && next.question.askedAt !== prev?.question?.askedAt) {
      void this.startMedia(next);
    } else if (next.phase !== 'question') {
      this.stopMedia();
    }
    if (this.mode === 'host') {
      const msg: HostMsg = { t: 'state', state: publicView(next), now: Date.now() };
      for (const [conn, g] of this.guests) if (g.playerId) this.send(conn, msg);
    }
    this.scheduleTimers(next);
    this.syncBeacon(next);
    if (this.mode === 'local') writeSaved({ mode: 'local', state: next });
    else if (this.mode === 'host') writeSaved({ mode: 'host', code: this.code, state: next, priv: this.priv });
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
      mode: s.settings.mode ?? 'turns',
      difficulty: s.settings.difficulty,
      target: s.settings.targetScore,
      phase: s.settings.locked && s.phase === 'lobby' ? 'locked' : s.phase,
    };
  }

  /** Side effects that every device plays: sounds. */
  private onNewState(prev: GameState | null, next: GameState) {
    if (!prev) return;
    const me = this.myPlayerId;
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
    } else if (next.phase === 'over' && prev.phase !== 'over') {
      sfx('victory');
    } else if (prev.phase === 'lobby' && next.phase === 'lobby' && next.players.length > prev.players.length) {
      sfx('join');
    }
  }

  private scheduleTimers(s: GameState) {
    if (this.timer) clearTimeout(this.timer);
    if (this.autoNext) clearTimeout(this.autoNext);
    this.timer = this.autoNext = null;
    if (s.phase === 'question' && s.question?.deadline) {
      const version = s.version;
      this.timer = setTimeout(
        () => {
          if (this.state?.version !== version) return;
          this.setState(engine.apply(this.state, { type: 'answer', index: null }, null));
        },
        Math.max(0, s.question.deadline - Date.now() + 250),
      );
    }
    this.scheduleAutoSkip(s);
    if (s.phase === 'reveal' && this.mode === 'host') {
      const version = s.version;
      this.autoNext = setTimeout(() => {
        if (this.state?.version === version) this.setState(engine.apply(this.state, { type: 'next' }, null));
      }, AUTO_NEXT_MS);
    }
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
      const name = cur.players[cur.turn]?.name;
      try {
        this.setState(engine.apply(cur, { type: 'skip' }, null));
        if (name) this.flash(`${name}'s turn was skipped`);
      } catch {
        /* the turn moved on anyway */
      }
    }, AUTO_SKIP_MS);
  }

  private networkHint(type: string) {
    return `Couldn't connect to the matchmaking server (${type}). Check your connection, or play hot-seat on one device.`;
  }

  private fail(message: string) {
    const mode = this.mode;
    this.reset();
    this.error = message;
    if (mode === 'client') this.status = 'idle';
  }

  private reset() {
    this.beacon?.stop();
    this.beacon = null;
    this.stopMedia();
    shown.clear();
    if (this.timer) clearTimeout(this.timer);
    if (this.autoNext) clearTimeout(this.autoNext);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.skipTimer) clearTimeout(this.skipTimer);
    this.skipTimer = null;
    this.skipKey = '';
    this.skipAt = 0;
    for (const c of this.guests.keys()) c.close();
    this.guests.clear();
    this.hostConn?.close();
    this.hostConn = null;
    this.peer?.destroy();
    this.peer = null;
    this.mode = null;
    this.state = null;
    this.status = 'idle';
    this.error = '';
    this.code = '';
    this.myPlayerId = null;
    this.gaveUp = false;
    this.priv = { myPlayerId: '', secrets: [], bannedSecrets: [], bannedPeers: [] };
    this.secretToPlayer = new Map();
    if (this.retry) clearTimeout(this.retry);
    if (this.hostWatch) clearInterval(this.hostWatch);
    this.hostWatch = null;
    writeSaved(null);
  }
}

type Saved =
  | { mode: 'local'; state: GameState }
  | { mode: 'host'; code: string; state: GameState; priv: HostPrivate }
  | { mode: 'client'; code: string; name: string };
const SAVE_KEY = 'poe2trivia.session.v3';

function readSaved(): Saved | null {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
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
export const AUTO_NEXT_SECONDS = AUTO_NEXT_MS / 1000;
