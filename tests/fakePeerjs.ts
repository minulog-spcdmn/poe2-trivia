// A stand-in for PeerJS (fakeModule('peerjs', …), tests/asVite.ts) with a
// signalling server in memory: peers open under an id nobody else holds, and
// a candidate sent to an id goes to whoever holds it, or comes back as
// "peer-unavailable" when nobody does, as the free server says. Connections
// are made and never open (nothing here speaks WebRTC).

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
  /** Who holds each id now. */
  held: new Map<string, Peer>(),
  /** Every peer made, in order. */
  made: [] as Peer[],
  /** The ids pinged (a candidate carrying a probe), in order. */
  pinged: [] as string[],
  /** The ids connected to, in order. */
  connected: [] as string[],
  /** Off: nobody's peer can open (network trouble). */
  down: false,
  reset() {
    for (const p of net.made) p.destroy();
    net.held.clear();
    net.made = [];
    net.pinged = [];
    net.connected = [];
    net.down = false;
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
    queueMicrotask(() => {
      const to = net.held.get(dst);
      if (to) to.socket.emit('message', { type: 'CANDIDATE', src: from.id, payload: msg.payload });
      else if (!from.destroyed) from.emit('error', { type: 'peer-unavailable', message: `Could not connect to peer ${dst}` });
    });
  }
}

class Conn extends Emitter {
  open = false;
  serialization = 'binary';
  readonly peer: string;
  constructor(peer: string) {
    super();
    this.peer = peer;
  }
  _handleDataMessage() {}
  _handleChunk() {}
  close() {
    this.emit('close');
  }
}

export default class Peer extends Emitter {
  readonly id: string;
  destroyed = false;
  disconnected = false;
  /** Reached the signalling server (and not cut off since). */
  open = false;
  readonly socket: Socket;

  constructor(id?: string | object) {
    super();
    this.id = typeof id === 'string' ? id : `anon-${++anon}`;
    this.socket = new Socket(this);
    net.made.push(this);
    const own = this.id;
    queueMicrotask(() => {
      if (this.destroyed) return;
      if (net.down) return this.emit('error', { type: 'network', message: 'Lost connection to server.' });
      if (net.held.has(own) && net.held.get(own) !== this) return this.emit('error', { type: 'unavailable-id', message: `ID "${own}" is taken` });
      net.held.set(own, this);
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
    net.connected.push(id);
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
    if (net.held.get(this.id) === this) net.held.delete(this.id);
  }
}

export const util = { randomToken: () => Math.random().toString(36).slice(2) };
