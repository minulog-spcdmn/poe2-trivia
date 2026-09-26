// Session: owns the game state and wires it to either the local device
// (hot-seat), a hosted PeerJS room, or a connection to someone else's room.

import Peer, { type DataConnection } from 'peerjs';
import itemData from '../data/items.json';
import { Engine, createGame, ActionError, MAX_PLAYERS, type Action, type GameState, type Item } from './game';
import { PEER_OPTIONS, PEER_PREFIX } from './peer';
import { Beacon, type RoomInfo } from './rooms';
import { sfx } from './sound';

export const engine = new Engine(itemData as Item[]);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AUTO_NEXT_MS = 5000;

type HostMsg = { t: 'state'; state: GameState; now: number } | { t: 'error'; message: string } | { t: 'kicked' };
type ClientMsg = { t: 'hello'; playerId: string; name: string } | { t: 'action'; action: Action };

export type Mode = 'local' | 'host' | 'client';
export type Status = 'idle' | 'connecting' | 'ready' | 'lost';

function randomCode(len = 5) {
  const buf = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(buf, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}

function storage(key: string, fallback: () => string): string {
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

export function savedName(): string {
  try {
    return localStorage.getItem('poe2trivia.name') ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem('poe2trivia.name', name);
  } catch {
    /* ignore */
  }
}

/** Stable per-browser id so a refreshed tab can rejoin as the same player. */
export const myId = storage('poe2trivia.id', () => crypto.randomUUID());

class Session {
  mode = $state<Mode | null>(null);
  status = $state<Status>('idle');
  state = $state.raw<GameState | null>(null);
  code = $state<string>('');
  error = $state<string>('');
  toast = $state<string>('');
  /** host clock minus local clock, for timer display on clients */
  clockOffset = $state(0);

  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null;
  private conns = new Map<DataConnection, string | null>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private autoNext: ReturnType<typeof setTimeout> | null = null;
  private joinName = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private beacon: Beacon | null = null;

  get me() {
    return this.state?.players.find((p) => p.id === myId) ?? null;
  }

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
    if (s.settings.mode === 'race') {
      const inGame = s.players.some((p) => p.id === myId);
      return inGame && !s.question?.misses.some((m) => m.playerId === myId);
    }
    return s.players[s.turn]?.id === myId;
  }

  hostNow() {
    return Date.now() + this.clockOffset;
  }

  flash(message: string) {
    this.toast = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }

  // ---- hot-seat ---------------------------------------------------------

  startLocal(resume?: GameState) {
    this.reset();
    this.mode = 'local';
    this.state = resume ?? createGame(null);
    this.status = 'ready';
    this.scheduleTimers(this.state);
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
      this.openRoom(saved.code, 0, saved.state);
    } else if (saved.mode === 'client') this.join(saved.code, saved.name);
  }

  // ---- hosting ----------------------------------------------------------

  host(name: string) {
    this.reset();
    this.mode = 'host';
    this.status = 'connecting';
    this.joinName = name;
    this.openRoom(randomCode(), 0);
  }

  private openRoom(code: string, attempt: number, resumeState?: GameState) {
    const peer = new Peer(PEER_PREFIX + code, PEER_OPTIONS);
    this.peer = peer;
    peer.on('open', () => {
      this.code = code;
      this.status = 'ready';
      if (resumeState) {
        // Everyone else has to reconnect; mark them offline until they do.
        let s = resumeState;
        for (const p of s.players)
          if (p.id !== myId) s = engine.apply(s, { type: 'connection', playerId: p.id, connected: false }, null);
        this.setState(s);
        return;
      }
      let s = createGame(myId);
      s = engine.apply(s, { type: 'join', playerId: myId, name: this.joinName }, myId);
      this.setState(s);
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
      if (err.type === 'peer-unavailable' || err.type === 'network' || err.type === 'server-error') {
        if (this.status === 'connecting') this.fail(this.networkHint(err.type));
        return;
      }
      console.warn('peer error', err);
      if (this.status === 'connecting') this.fail(this.networkHint(err.type));
    });
  }

  private acceptConnection(conn: DataConnection) {
    this.conns.set(conn, null);
    conn.on('data', (raw) => {
      const msg = raw as ClientMsg;
      if (!this.state) return;
      try {
        if (msg.t === 'hello') {
          const action: Action = { type: 'join', playerId: msg.playerId, name: msg.name };
          const next = engine.apply(this.state, action, msg.playerId);
          // Drop any older connection of the same player (e.g. refreshed tab).
          for (const [c, id] of this.conns) if (id === msg.playerId && c !== conn) this.conns.set(c, null);
          this.conns.set(conn, msg.playerId);
          this.setState(next);
          this.flash(`${next.players.find((p) => p.id === msg.playerId)?.name} joined`);
        } else if (msg.t === 'action') {
          const from = this.conns.get(conn);
          if (!from) return;
          this.setState(engine.apply(this.state, msg.action, from));
        }
      } catch (err) {
        if (err instanceof ActionError && err.silent) return;
        const message = err instanceof ActionError ? err.message : 'Something went wrong.';
        conn.send({ t: 'error', message } satisfies HostMsg);
        if (msg.t === 'hello') setTimeout(() => conn.close(), 500);
      }
    });
    conn.on('close', () => {
      const id = this.conns.get(conn);
      this.conns.delete(conn);
      if (!id || !this.state) return;
      if ([...this.conns.values()].includes(id)) return;
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

  // ---- joining ----------------------------------------------------------

  join(code: string, name: string) {
    this.reset();
    this.mode = 'client';
    this.status = 'connecting';
    this.joinName = name;
    this.code = code.toUpperCase().trim();
    writeSaved({ mode: 'client', code: this.code, name });
    const peer = new Peer(PEER_OPTIONS);
    this.peer = peer;
    const timeout = setTimeout(() => {
      if (this.status === 'connecting') this.fail(`Couldn't reach room ${this.code}. Check the code, or try again.`);
    }, 15000);
    peer.on('open', () => this.connectToHost());
    peer.on('error', (err) => {
      console.warn('peer error', err);
      if (err.type === 'peer-unavailable') {
        if (this.status === 'connecting') {
          clearTimeout(timeout);
          this.fail(`Room ${this.code} doesn't exist (or the host left).`);
        }
        return;
      }
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
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true });
    this.hostConn = conn;
    conn.on('open', () => {
      conn.send({ t: 'hello', playerId: myId, name: this.joinName } satisfies ClientMsg);
    });
    conn.on('data', (raw) => {
      const msg = raw as HostMsg;
      if (msg.t === 'state') {
        this.clockOffset = msg.now - Date.now();
        if (!this.state || msg.state.version >= this.state.version || msg.state.version === 0) {
          this.onNewState(this.state, msg.state);
          this.state = msg.state;
        }
        this.status = 'ready';
      } else if (msg.t === 'error') {
        if (this.status === 'connecting') this.fail(msg.message);
        else this.flash(msg.message);
      } else if (msg.t === 'kicked') {
        this.fail('You were removed from the game.');
      }
    });
    conn.on('close', () => {
      if (this.hostConn === conn && this.mode === 'client' && this.status === 'ready') {
        this.status = 'lost';
        this.retries = 0;
        this.scheduleRetry();
      }
    });
  }

  private scheduleRetry() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      if (this.mode !== 'client' || this.status === 'ready') return;
      if (this.retries++ >= 20) return;
      if (this.peer && !this.peer.destroyed) this.connectToHost();
      this.scheduleRetry();
    }, 3000);
  }

  reconnect() {
    if (this.mode !== 'client') return;
    this.retries = 0;
    if (this.peer && !this.peer.destroyed) this.connectToHost();
    this.scheduleRetry();
  }

  // ---- actions ----------------------------------------------------------

  dispatch(action: Action) {
    if (!this.state) return;
    if (this.mode === 'client') {
      this.hostConn?.send({ t: 'action', action } satisfies ClientMsg);
      return;
    }
    try {
      const from = this.mode === 'local' ? null : myId;
      this.setState(engine.apply(this.state, action, from));
    } catch (err) {
      if (err instanceof ActionError && err.silent) return;
      this.flash(err instanceof ActionError ? err.message : 'Something went wrong.');
    }
  }

  kick(playerId: string) {
    for (const [c, id] of this.conns) {
      if (id === playerId) {
        c.send({ t: 'kicked' } satisfies HostMsg);
        this.conns.set(c, null);
        setTimeout(() => c.close(), 300);
      }
    }
    this.dispatch({ type: 'remove', playerId });
  }

  leave() {
    this.reset();
  }

  // ---- internals --------------------------------------------------------

  private setState(next: GameState) {
    const prev = this.state;
    this.onNewState(prev, next);
    this.state = next;
    const msg: HostMsg = { t: 'state', state: next, now: Date.now() };
    for (const [conn, id] of this.conns) if (id && conn.open) conn.send(msg);
    this.scheduleTimers(next);
    this.syncBeacon(next);
    if (this.mode === 'local') writeSaved({ mode: 'local', state: next });
    else if (this.mode === 'host') writeSaved({ mode: 'host', code: this.code, state: next });
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
      phase: s.phase,
    };
  }

  /** Side effects that every device plays: sounds. */
  private onNewState(prev: GameState | null, next: GameState) {
    if (!prev) return;
    if (next.settings.mode === 'race' && next.phase !== 'over') {
      const missedNow = (st: GameState) => st.question?.misses.some((m) => m.playerId === myId) ?? false;
      if (prev.phase !== 'reveal' && next.phase === 'reveal' && next.reveal) {
        const w = next.reveal.winnerId;
        sfx(w === myId ? 'correct' : w ? 'turn' : 'wrong');
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
      sfx(next.players[next.turn]?.id === myId || this.mode === 'local' ? 'yourTurn' : 'turn');
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
          this.setState(engine.apply(this.state, { type: 'answer', optionId: null }, null));
        },
        Math.max(0, s.question.deadline - Date.now() + 250),
      );
    }
    if (s.phase === 'reveal' && this.mode === 'host') {
      const version = s.version;
      this.autoNext = setTimeout(() => {
        if (this.state?.version === version) this.setState(engine.apply(this.state, { type: 'next' }, null));
      }, AUTO_NEXT_MS);
    }
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
    if (this.timer) clearTimeout(this.timer);
    if (this.autoNext) clearTimeout(this.autoNext);
    for (const c of this.conns.keys()) c.close();
    this.conns.clear();
    this.hostConn?.close();
    this.hostConn = null;
    this.peer?.destroy();
    this.peer = null;
    this.mode = null;
    this.state = null;
    this.status = 'idle';
    this.error = '';
    this.code = '';
    if (this.retry) clearTimeout(this.retry);
    writeSaved(null);
  }
}

type Saved =
  | { mode: 'local'; state: GameState }
  | { mode: 'host'; code: string; state: GameState }
  | { mode: 'client'; code: string; name: string };
const SAVE_KEY = 'poe2trivia.session.v2';

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
