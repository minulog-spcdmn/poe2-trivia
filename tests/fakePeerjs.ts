// A stand-in for PeerJS (fakeModule('peerjs', …), tests/asVite.ts) with a
// signalling server in memory: peers open under an id nobody else holds, and
// a candidate sent to an id goes to whoever holds it, or comes back as
// "peer-unavailable" when nobody does, as the free server says. Connections
// are made and never open (nothing here speaks WebRTC). The game's own server
// (lib/peer.ts) is a second one beside it, for a peer made with its host.
import { OWN_SIGNAL_HOST } from '../src/lib/signalHost.ts';

type Handler = (...args: never[]) => void;

class Emitter {
  private handlers = new Map<string, { f: Handler; once: boolean }[]>();
  on(event: string, f: Handler, once = false) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), { f, once }]);
    return this;
  }
  once(event: string, f: Handler) {
    return this.on(event, f, true);
  }
  off(event: string, f: Handler) {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter((h) => h.f !== f));
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    const all = this.handlers.get(event) ?? [];
    this.handlers.set(event, all.filter((h) => !h.once));
    for (const h of all) (h.f as (...a: unknown[]) => void)(...args);
  }
}

/** The server, and what went over it. */
export const net = {
  /** Who holds each id now (on the PeerJS cloud). */
  held: new Map<string, Peer>(),
  /** And on the game's own server. */
  ownHeld: new Map<string, Peer>(),
  /** Every peer made, in order. */
  made: [] as Peer[],
  /** The ids pinged (a candidate carrying a probe), in order. */
  pinged: [] as string[],
  /** The ids connected to, in order (on the game's own server, as `own:<id>`). */
  connected: [] as string[],
  /** Off: nobody's peer can open (network trouble). */
  down: false,
  /** Silent: a peer's socket never hears back, neither opening nor failing (a server slow to answer, a handshake lost on the way). */
  silent: false,
  /** Lost: what a peer sends goes nowhere and nothing comes back, though its socket stays up (a line gone quiet). */
  lost: false,
  /** How long the server takes to say nobody holds an id, ms (the real one: five to six seconds from the first to ask, tests/peerServerFree.test.ts). */
  freeIn: 0,
  /** How long the server takes to answer a peer, ms (a slow link: congested mobile data, satellite). */
  answerIn: 0,
  reset() {
    for (const p of net.made) p.destroy();
    net.held.clear();
    net.ownHeld.clear();
    net.made = [];
    net.pinged = [];
    net.connected = [];
    net.down = false;
    net.silent = false;
    net.lost = false;
    net.freeIn = 0;
    net.answerIn = 0;
  },
};

let anon = 0;

class Socket extends Emitter {
  private peer: Peer;
  constructor(peer: Peer) {
    super();
    this.peer = peer;
  }
  send(msg: { type?: string; dst?: string; payload?: Record<string, unknown> }) {
    const from = this.peer;
    if (msg.type !== 'CANDIDATE' || !msg.dst || from.destroyed) return;
    const dst = msg.dst;
    if (msg.payload && 'probe' in msg.payload) net.pinged.push(dst);
    if (net.lost) return;
    queueMicrotask(() => {
      const to = from.held.get(dst);
      const free = () => {
        if (!from.destroyed) from.emit('error', { type: 'peer-unavailable', message: `Could not connect to peer ${dst}` });
      };
      if (to) to.socket.emit('message', { type: 'CANDIDATE', src: from.id, payload: msg.payload });
      else if (net.freeIn) setTimeout(free, net.freeIn);
      else free();
    });
  }
}

class Conn extends Emitter {
  open = false;
  serialization = 'binary';
  /** As PeerJS's: the peer it was made on, until it's closed (a joiner's attempt still negotiating has one). */
  provider: object | null = {};
  peerConnection = null;
  readonly peer: string;
  constructor(peer: string) {
    super();
    this.peer = peer;
  }
  _handleDataMessage() {}
  _handleChunk() {}
  close() {
    this.provider = null;
    this.emit('close');
  }
}

export default class Peer extends Emitter {
  readonly id: string;
  /** The server it's on, and who holds each id there. */
  readonly server: 'cloud' | 'own';
  readonly held: Map<string, Peer>;
  destroyed = false;
  disconnected = false;
  /** Reached the signalling server (and not cut off since). */
  open = false;
  readonly socket: Socket;

  constructor(id?: string | { host?: string }, options?: { host?: string }) {
    super();
    this.id = typeof id === 'string' ? id : `anon-${++anon}`;
    this.server = (typeof id === 'string' ? options : (id ?? options))?.host === OWN_SIGNAL_HOST ? 'own' : 'cloud';
    this.held = this.server === 'own' ? net.ownHeld : net.held;
    const held = this.held;
    this.socket = new Socket(this);
    net.made.push(this);
    const own = this.id;
    const answer = (f: () => void) => (net.answerIn ? setTimeout(f, net.answerIn) : queueMicrotask(f));
    answer(() => {
      if (this.destroyed || net.silent) return;
      if (net.down) return this.emit('error', { type: 'network', message: 'Lost connection to server.' });
      if (held.has(own) && held.get(own) !== this) return this.emit('error', { type: 'unavailable-id', message: `ID "${own}" is taken` });
      held.set(own, this);
      this.open = true;
      this.emit('open', own);
    });
  }

  /** Holds `id` at once, answering nothing (a room on a version that doesn't answer pings). */
  static hold(id: string) {
    const p = new Peer(id);
    net.held.set(id, p);
    return p;
  }

  connect(id: string) {
    if (this.destroyed || this.disconnected) return undefined;
    net.connected.push(this.server === 'own' ? `own:${id}` : id);
    return new Conn(id);
  }

  _getMessages() {
    return [];
  }

  reconnect() {}

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.open = false;
    if (this.held.get(this.id) === this) this.held.delete(this.id);
  }
}

export const util = { randomToken: () => Math.random().toString(36).slice(2) };
